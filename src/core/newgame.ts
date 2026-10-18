// 新游戏：生成世界并开始监督生涯
import type { Difficulty, GameState, Player, School } from './types';
import { G, setG } from './state';
import { getRngState, randInt, seedRng } from './rng';
import { sortBy } from './util';
import { PREFS } from '../data/prefectures';
import { genPrefSchools, genRoster, genCohort, entryQ, resetNameRegistry, schoolStrength, clearStrengthCache, rosterPlayers } from './world';
import { genStaff, refreshMarket } from './staff';
import { newManager, freshClub, setYearGoal, LADDER } from './career';
import { genProspects } from './recruit';
import { autoBench } from './team';
import { overall, has } from './attrs';

export const SAVE_VERSION = 1;

export interface WorldOpts {
  mgrName: string;
  bg: string;
  age: number;
  prefId: number;
  difficulty: Difficulty;
  dh: boolean;
  seed: number;
  year: number;
}

function emptyState(o: WorldOpts): GameState {
  return {
    version: SAVE_VERSION,
    saveName: '',
    rng: [],
    nextId: 1,
    year: o.year,
    week: 0,
    absWeek: 0,
    startYear: o.year,
    difficulty: o.difficulty,
    dh: o.dh,
    manager: newManager(o.mgrName, o.bg, o.age),
    schools: {},
    players: {},
    staff: {},
    prospects: [],
    transfers: [],
    freeStaff: [],
    tournaments: {},
    club: null as unknown as GameState['club'],
    inbox: [],
    news: [],
    eventQueue: [],
    flow: null,
    records: { seasons: [], alumni: [], koshienChamps: [], bestBatAvg: null },
    flags: {},
    cooldowns: {},
    reports: [],
    summerReps: [],
    senbatsuReps: [],
    nationalLog: [],
    notices: [],
    choice: null,
    regionRank: {},
    draftLog: [],
  };
}

/** 第一步：生成世界，返回可选择的学校 */
export function generateWorld(o: WorldOpts): School[] {
  seedRng(o.seed);
  const st = emptyState(o);
  setG(st);
  resetNameRegistry();
  clearStrengthCache();
  for (const pref of PREFS) {
    for (const s of genPrefSchools(pref, pref.id === o.prefId)) st.schools[s.id] = s;
  }
  const local = Object.values(st.schools).filter((s) => s.prefId === o.prefId);
  // 临时 club，避免依赖 club 的函数出错
  st.club = freshClub(local[0]);
  for (const s of local) {
    genRoster(s, 0, o.year);
    for (let i = 0; i < randInt(1, 2); i++) {
      const sf = genStaff(undefined, 25 + s.prestige * 0.5);
      sf.schoolId = s.id;
      st.staff[sf.id] = sf;
      s.staff.push(sf.id);
    }
  }
  refreshMarket();
  return candidateSchools();
}

/** 根据名声给出三所候选学校 */
export function candidateSchools(): School[] {
  const rep = G.manager.reputation;
  const local = sortBy(Object.values(G.schools).filter((s) => s.prefId === Object.values(G.schools).find((x) => x.roster)!.prefId), (s) => s.prestige, false);
  const pickNear = (target: number, type?: 'public' | 'private', exclude: number[] = []) => {
    const pool = local.filter((s) => !exclude.includes(s.id) && (!type || s.type === type));
    return pool.sort((a, b) => Math.abs(a.prestige - target) - Math.abs(b.prestige - target))[0];
  };
  const out: School[] = [];
  const a = pickNear(15 + rep * 0.2, 'public');
  if (a) out.push(a);
  const b = pickNear(32 + rep * 0.4, undefined, out.map((s) => s.id));
  if (b) out.push(b);
  const c = pickNear(48 + rep * 0.5, 'private', out.map((s) => s.id)) ?? pickNear(50, undefined, out.map((s) => s.id));
  if (c) out.push(c);
  return out;
}

export function schoolBrief(s: School): { strength: number; rank: number; total: number; goal: string; budget: number } {
  const local = Object.values(G.schools).filter((x) => x.prefId === s.prefId);
  const sorted = sortBy(local.slice(), (x) => schoolStrength(x).total);
  const k = sorted.indexOf(s) + 1;
  const goal = s.prestige >= 80 ? 6 : k === 1 ? 5 : k <= 2 ? 4 : k <= 4 ? 3 : k <= 9 ? 2 : 1;
  return {
    strength: schoolStrength(s).total,
    rank: k,
    total: local.length,
    goal: LADDER[goal],
    budget: Math.round(s.type === 'public' ? 250 + s.prestige * 4 : 600 + s.prestige * 22),
  };
}

/** 第二步：就任 */
export function beginCareer(schoolId: number): void {
  const s = G.schools[schoolId];
  // 本校部员更多一些
  const extra = s.prestige > 60 ? 5 : s.prestige > 35 ? 3 : 2;
  for (let g = 1; g <= 3; g++) {
    const ps = genCohort(s, g, extra, entryQ(s.prestige) - 4, 0, G.year);
    for (const p of ps) G.players[p.id] = p;
    s.roster = [...(s.roster ?? []), ...ps.map((p) => p.id)];
  }
  G.manager.schoolId = s.id;
  G.manager.salary = Math.round((300 + s.prestige * 6 + G.manager.reputation * 3) / 10) * 10;
  G.manager.contractYears = 3;
  G.club = freshClub(s);
  const players = rosterPlayers(s);
  G.club.lineup.bench = autoBench(players, 20, G.dh);
  const cap = sortBy(players.filter((p) => p.grade === 3), (p: Player) => overall(p) + (has(p, 'captain') ? 25 : 0) + (p.pers === 'leader' ? 15 : 0))[0];
  G.club.captainId = cap?.id ?? null;
  if (!s.staff.length) {
    const sf = genStaff('batting', 40);
    sf.schoolId = s.id;
    G.staff[sf.id] = sf;
    s.staff.push(sf.id);
  }
  genProspects();
  const goal = setYearGoal();
  G.club.board = 60;
  G.notices.push({
    title: `就任 ${s.name} 监督`,
    lines: [
      `${G.manager.name}监督，欢迎来到${s.name}！`,
      `部员 ${players.length} 人，部费 ${G.club.funds} 万円。`,
      `校方对今年的期待：${LADDER[goal]}。`,
      '每周设定训练、调整阵容、招募新生、经营球队，然后点击右上角的「推进一周」。',
      '目标——甲子园！',
    ],
    kind: 'info',
  });
  G.inbox.unshift({
    id: G.nextId++, absWeek: 0, title: '新手指南', kind: 'info', read: false,
    body: [
      '【一周的流程】随机事件 → 训练 → 比赛 → 结算。比赛日可以亲自指挥，也可以委托自动进行。',
      '【训练】在「训练」页面分配练习菜单比例与强度。强度越高成长越快，但疲劳与伤病风险也越高。可为球员设置个别练习重点（每位教练最多有效指导 5 人）。',
      '【能力】训练获得的经验（力量/敏捷/技术/变化/精神）会按「培养方针」自动分配，也可以设为手动在球员详情中加点、学习特殊能力。',
      '【大会】春季县大会 → 春季地区大会 → 夏季县大会 → 夏季甲子园 → 秋季县大会 → 秋季地区大会 → 明治神宫大会 → 春季选拔（由秋季成绩决定）。',
      '【用球数】每名投手一周最多 500 球，注意大会密集周的投手轮换。',
      '【招募】4 月起可以视察、邀请、家访中学生，2 月决定入学。私立学校可以提供特待生名额。',
      '【经营】部费用于教练薪水、设施建设、远征等。OB会、后援会、赞助都是收入来源。',
      '【生涯】达成校方目标会提高满意度；名声上升后，其他学校会发来邀请——你可以选择跳槽。',
    ].join('\n'),
  });
  G.rng = getRngState();
}
