// 新游戏：生成本县学校，三所学校发来邀请，选一所开始执教
import type { Difficulty, FacilityId, GameState, SchoolLite } from './types';
import { FACILITY_IDS } from './types';
import { G, setG } from './state';
import { gauss, randInt, seedRng, getRngState, weightedPick, shuffle } from './rng';
import { clamp } from './util';
import { genPrefSchools, schoolRating, clearWorldCache } from './world';
import { BACKGROUNDS, materializeRoster, setGoal } from './career';
import { PREFS } from '../data/prefectures';
import { queue } from './queue';
import { schoolBudget } from './economy';
import './events';

/** 3 → 4（游戏 v2.2.0）：位置由能力决定、去掉守备适性，野手的投球能力补到正常水平 */
export const SAVE_VERSION = 5;

export interface NewGameOpts {
  mgrName: string;
  bg: string;
  age: number;
  prefId: number;
  difficulty: Difficulty;
  dh: boolean;
  startYear?: number;
  seed?: number;
}

/** 生成一个还没选学校的世界，返回状态和三所学校的邀请 */
export function prepareWorld(o: NewGameOpts): { state: GameState; offers: SchoolLite[] } {
  const seed = (o.seed ?? (Date.now() & 0x7fffffff)) ^ 0x5bd1e995;
  seedRng(seed);
  const bg = BACKGROUNDS.find((b) => b.id === o.bg) ?? BACKGROUNDS[2];
  const state: GameState = {
    game: 'pixel-baseball',
    v: SAVE_VERSION,
    seed: seed >>> 0,
    rng: [],
    nextId: 1,
    day: 0,
    startYear: o.startYear ?? 2026,
    created: Date.now(),
    savedAt: Date.now(),
    difficulty: o.difficulty,
    dh: o.dh,
    prefId: o.prefId,
    schoolId: -1,
    schools: {},
    mgr: {
      name: o.mgrName,
      age0: o.age,
      bg: bg.id,
      face: randInt(1, 2 ** 30),
      skills: { ...bg.skills },
      level: 1,
      exp: 0,
      rep: bg.rep,
      since: 0,
      career: [],
      totals: { w: 0, l: 0, koshienApps: 0, koshienWins: 0, summerTitles: 0, springTitles: 0, drafted: 0, seasons: 1, prefTitles: 0 },
    },
    players: {},
    roster: [],
    incoming: [],
    alumni: [],
    club: { chemistry: 50, fans: 500, board: 60, ob: 50, captainId: null, scandal: 0, banUntil: 0, tactics: 30, goal: null },
    policies: {
      focus: 'balanced',
      intensity: 1,
      autoRest: true,
      style: 'balanced',
      pitcherUse: 'rotation',
      lineup: 'merit',
      recruit: 'balanced',
      study: 'balanced',
      auto: 'minor',
      autoCats: {},
    },
    funds: 0,
    facilities: { field: 0, cage: 0, bullpen: 0, weight: 0, indoor: 0, medical: 0, analysis: 0, dorm: 0 },
    building: null,
    books: [],
    tours: {},
    pending: null,
    games: [],
    seasonWL: [0, 0],
    history: [],
    queue: [],
    schedule: [],
    cooldowns: {},
    flags: {},
    logs: [],
    timeline: [],
    achievements: {},
    lastBlockDay: 0,
    senbatsuPick: [],
    lineup: null,
    nextStarter: null,
  };
  setG(state);
  clearWorldCache();
  const pref = PREFS[o.prefId];
  const schools = genPrefSchools(pref, true, state.nextId);
  state.nextId += schools.length + 1;
  state.schools = Object.fromEntries(schools.map((s) => [s.id, s]));
  return { state, offers: pickOffers(schools, bg.rep) };
}

/** 三所邀请：名声低时只有弱校会请你（一所公立弱校、一所中游、一所私立） */
function pickOffers(schools: SchoolLite[], rep: number): SchoolLite[] {
  const cap = 30 + rep * 0.9;
  const pool = schools.filter((s) => s.prestige <= cap);
  const pub = shuffle(pool.filter((s) => s.type === 'public'));
  const priv = shuffle(pool.filter((s) => s.type === 'private'));
  const out: SchoolLite[] = [];
  const weakPub = pub.sort((a, b) => a.prestige - b.prestige)[Math.min(pub.length - 1, randInt(0, 3))];
  if (weakPub) out.push(weakPub);
  const mid = weightedPick(pool.filter((s) => !out.includes(s)), (s) => Math.exp(-Math.abs(s.prestige - cap * 0.75) / 8));
  if (mid) out.push(mid);
  const p2 = priv.find((s) => !out.includes(s)) ?? pool.find((s) => !out.includes(s));
  if (p2) out.push(p2);
  return out.slice(0, 3);
}

/** 选好学校，正式开始 */
export function startGame(state: GameState, schoolId: number): GameState {
  setG(state);
  const s = state.schools[schoolId];
  state.schoolId = schoolId;
  for (const p of materializeRoster(s)) {
    state.players[p.id] = p;
    state.roster.push(p.id);
  }
  const pr = s.prestige;
  for (const id of FACILITY_IDS as readonly FacilityId[]) state.facilities[id] = clamp(Math.round(pr / 30 + gauss(0, 0.6)), 0, 3);
  if (s.type === 'public') state.facilities.dorm = 0;
  const bg = BACKGROUNDS.find((b) => b.id === state.mgr.bg) ?? BACKGROUNDS[2];
  state.funds = Math.round(120 + pr * 3 + bg.funds);
  state.club.fans = Math.round(300 + pr * 50);
  state.club.tactics = clamp(20 + pr * 0.3, 0, 100);
  setGoal();
  state.logs = [];
  state.rng = getRngState();
  queue('welcome');
  const fresh = state.roster.filter((id) => state.players[id].grade === 1);
  if (fresh.length) queue('newClass', { ids: fresh });
  return state;
}

/** 某所学校的一句介绍（开局选学校用） */
export function schoolBrief(s: SchoolLite): { rating: number; rank: number; total: number; budget: number } {
  const all = Object.values(G.schools);
  const r = schoolRating(s, 100);
  const rank = all.filter((x) => schoolRating(x, 100) > r).length + 1;
  const budget = Math.round(schoolBudget(s) * 12);
  return { rating: Math.round(r), rank, total: all.length, budget };
}
