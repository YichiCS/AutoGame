// 世界：本县学校（存档里）、外县学校和对手名单（按种子随用随生成，不占存档）
import type { AIStyle, Player, Pos, SchoolLite, TeamColors } from './types';
import { G, withTempIds } from './state';
import { chance, gauss, hash32, pick, rand, randInt, shuffle, weightedPick, withSeed } from './rng';
import { clamp } from './util';
import { generatePlayer } from './player';
import { YEAR, doy, doyOf, yearIdx } from './calendar';
import { PREFS, gameSchoolCount, notableCount, type PrefDef } from '../data/prefectures';
import { PRIVATE_PREFIX, PRIVATE_SUFFIX, PUBLIC_SUFFIX, TEAM_PALETTE } from '../data/names';
import type { Strength } from './team';

/** 外县学校的 id 段：100000 + 县 × 100 + 序号 */
export const EXT_BASE = 100000;

/** 学校的典型新生素质 */
export function entryQ(prestige: number): number {
  return 18 + prestige * 0.42;
}

/** 由新生素质推算夏季巅峰战力 */
export function peakStrength(q: number): number {
  return q + 14;
}

/** 不同时期相对夏季巅峰的战力偏差（三年级引退后的新队伍较弱） */
export function phaseOffset(day: number): number {
  const t = doy(day);
  if (t >= doyOf(8, 25) && t < doyOf(12, 1)) return -7;
  if (t >= doyOf(12, 1) || t < doyOf(4, 1)) return -5;
  if (t < doyOf(6, 1)) return -2;
  return 0;
}

const STYLE_W: [AIStyle, number][] = [['balanced', 40], ['smallball', 25], ['power', 15], ['pitching', 12], ['speed', 8]];

function makeName(pref: PrefDef, type: 'public' | 'private', used: Set<string>): { name: string; short: string } {
  for (let tries = 0; tries < 60; tries++) {
    let name: string;
    let short: string;
    if (type === 'public') {
      const city = pick(pref.cities);
      const suf = pick(PUBLIC_SUFFIX);
      name = city + suf.s;
      short = city + suf.short;
    } else if (chance(0.25)) {
      const city = pick(pref.cities);
      const suf = pick(PRIVATE_SUFFIX.filter((x) => x.s !== '高校' && x.s !== '第一'));
      name = city + suf.s;
      short = city + (suf.short || suf.s.slice(0, 1));
    } else {
      const pre = pick(PRIVATE_PREFIX);
      const suf = pick(PRIVATE_SUFFIX);
      name = pre + suf.s;
      short = pre + suf.short;
    }
    if (!used.has(name)) {
      used.add(name);
      return { name, short };
    }
  }
  const n = `${pick(pref.cities)}${randInt(1, 9)}号高校`;
  used.add(n);
  return { name: n, short: n.slice(0, 3) };
}

function makeColors(short: string): TeamColors {
  const c = pick(TEAM_PALETTE);
  return { primary: c.primary, secondary: c.secondary, cap: c.primary, letter: short.slice(0, 1) };
}

export function makeSchool(id: number, pref: PrefDef, prestige: number, type: 'public' | 'private', used: Set<string>, district = 0): SchoolLite {
  const { name, short } = makeName(pref, type, used);
  const style = weightedPick(STYLE_W, (x) => x[1])[0];
  const apps = prestige > 60 ? Math.round(((prestige - 55) / 5) * (0.5 + rand())) : prestige > 45 && chance(0.3) ? randInt(1, 2) : 0;
  return {
    id,
    name,
    short,
    prefId: pref.id,
    district,
    type,
    prestige: clamp(prestige, 1, 99),
    style,
    colors: makeColors(short),
    koshienApps: apps,
    koshienWins: Math.round(apps * (prestige / 100) * 1.4),
    titles: prestige > 85 && chance(0.35) ? randInt(1, 3) : 0,
    lastKoshien: apps > 0 ? -randInt(1, 8) : -99,
    rival: 0,
  };
}

/** 生成某县的学校（本县：全部；外县：知名校） */
export function genPrefSchools(pref: PrefDef, full: boolean, firstId: number): SchoolLite[] {
  const n = full ? gameSchoolCount(pref) : notableCount(pref);
  // 学校多的县强校更强、竞争更激烈
  const sizeF = 0.76 + 0.24 * Math.min(1, pref.real / 150);
  const used = new Set<string>();
  const out: SchoolLite[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    let prestige = full ? 12 + 80 * Math.pow(1 - t, 2.2) + gauss(0, 5) : 22 + 72 * Math.pow(1 - t, 1.5) + gauss(0, 5);
    prestige = clamp(prestige * sizeF, 3, 97);
    const type = chance(0.25 + 0.6 * (1 - t)) ? 'private' : 'public';
    out.push(makeSchool(firstId + i, pref, prestige, type, used));
  }
  if (pref.districts) {
    // 交替分到两个夏季地区，保证强校分散
    out.sort((a, b) => b.prestige - a.prestige).forEach((s, i) => (s.district = i % 4 === 0 || i % 4 === 3 ? 0 : 1));
  }
  return out;
}

// ---------- 外县学校（确定性生成） ----------
const extCache = new Map<string, SchoolLite[]>();

export function extSchools(prefId: number): SchoolLite[] {
  const key = `${G.seed}|${prefId}`;
  let list = extCache.get(key);
  if (!list) {
    list = withSeed(hash32(G.seed, prefId, 77), () => genPrefSchools(PREFS[prefId], false, EXT_BASE + prefId * 100));
    extCache.set(key, list);
  }
  return list;
}

export function clearWorldCache(): void {
  extCache.clear();
  rosterCache.clear();
}

/** 事件结果预览用：记下现在的缓存，返回一个原样放回的函数（预览里跳槽会清缓存、生成的东西也不能留下） */
export function worldCacheSnapshot(): () => void {
  const ext = new Map(extCache);
  const rosters = new Map(rosterCache);
  return () => {
    extCache.clear();
    for (const [k, v] of ext) extCache.set(k, v);
    rosterCache.clear();
    for (const [k, v] of rosters) rosterCache.set(k, v);
  };
}

/** 按 id 找学校（本县存档里的，或外县生成的；大会里登记过的外县学校以大会资料为准） */
export function schoolById(id: number): SchoolLite | null {
  const s = G.schools[id];
  if (s) return s;
  for (const t of Object.values(G.tours)) if (t && t.ext[id]) return t.ext[id];
  if (id >= EXT_BASE) {
    const prefId = Math.floor((id - EXT_BASE) / 100);
    if (PREFS[prefId]) return extSchools(prefId).find((x) => x.id === id) ?? null;
  }
  return null;
}

export function schoolName(id: number): string {
  return schoolById(id)?.name ?? '某校';
}

/** 学校这一学年的实力起伏（-6..+6，确定性） */
export function yearForm(id: number, year: number): number {
  const h = hash32(G.seed, id, year, 13);
  return ((h % 1000) / 1000 - 0.5) * 12;
}

/** AI 学校在某一天的战力评分 */
export function schoolRating(s: SchoolLite, day: number): number {
  const diff = G.difficulty === 'hard' ? 3 : G.difficulty === 'easy' ? -3 : 0;
  return peakStrength(entryQ(s.prestige)) + yearForm(s.id, yearIdx(day)) + phaseOffset(day) + diff;
}

/** 三维战力（快速模拟用） */
export function schoolStrength(s: SchoolLite, day: number): Strength {
  const r = schoolRating(s, day);
  const h = hash32(G.seed, s.id, 5);
  const off = r + ((h % 7) - 3) * 0.7 + (s.style === 'power' ? 2 : 0);
  const pit = r + (((h >> 4) % 7) - 3) * 0.7 + (s.style === 'pitching' ? 2 : 0);
  const def = r + (((h >> 8) % 5) - 2) * 0.6;
  return { off, pit, def, total: 0.38 * off + 0.22 * def + 0.4 * pit };
}

// ---------- 对手名单（打本校比赛时才生成） ----------
const COHORT_BASE: Pos[] = ['P', 'P', 'C', 'SS', 'CF'];
const FILL_W: [Pos, number][] = [['P', 22], ['C', 6], ['1B', 9], ['2B', 11], ['3B', 11], ['SS', 8], ['LF', 11], ['CF', 9], ['RF', 13]];

function cohortPositions(n: number): Pos[] {
  const out = COHORT_BASE.slice(0, Math.min(n, COHORT_BASE.length));
  while (out.length < n) out.push(weightedPick(FILL_W, (x) => x[1])[0]);
  return shuffle(out);
}

const rosterCache = new Map<string, Player[]>();

/**
 * 某校在某一天的球员名单。同一学年里同一所学校的名字、能力底子都一样（种子由学校和入学年决定），
 * 只是随日期补上不同的成长；夏天以后三年级引退。
 */
export function opponentRoster(s: SchoolLite, day: number): Player[] {
  const y = yearIdx(day);
  const t = doy(day);
  const third = t < doyOf(8, 25); // 三年级还在
  const key = `${G.seed}|${s.id}|${y}|${Math.floor(t / 15)}`;
  const hit = rosterCache.get(key);
  if (hit) return hit;
  // 战力评分 ≈ 新生素质 + 14（夏季巅峰），反推这一届的素质
  const target = schoolRating(s, day) - phaseOffset(day);
  // 顶尖名门的名单比评分略弱（经验修正，见 tests/calib.ts）
  const q = target - 14 + Math.max(0, s.prestige - 60) * 0.1;
  const weeksIntoYear = Math.round((t / YEAR) * 44);
  const out: Player[] = withTempIds(() => {
    const ps: Player[] = [];
    for (let grade = third ? 3 : 2; grade >= 1; grade--) {
      const enroll = y - (grade - 1);
      withSeed(hash32(G.seed, s.id, enroll, 31), () => {
        const n = s.prestige > 60 ? 8 : s.prestige > 35 ? 7 : 6;
        for (const pos of cohortPositions(n)) {
          const p = generatePlayer({ quality: q + gauss(0, 4), grade, pos, enrollYear: enroll, weeksGrown: (grade - 1) * 44 + weeksIntoYear });
          p.morale = 60;
          p.fatigue = 10;
          ps.push(p);
        }
      });
    }
    return ps;
  });
  if (rosterCache.size > 40) rosterCache.delete(rosterCache.keys().next().value as string);
  rosterCache.set(key, out);
  return out;
}

/** 某县当年的代表校（外县、按当年实力加点运气抽） */
export function prefRepresentative(prefId: number, day: number, salt: number, exclude: number[] = []): SchoolLite {
  const list = extSchools(prefId).filter((s) => !exclude.includes(s.id));
  return withSeed(hash32(G.seed, prefId, yearIdx(day), salt), () => weightedPick(list, (s) => Math.exp((schoolRating(s, day) - 50) / 6)));
}
