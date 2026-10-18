// 世界：学校、球员名单的生成与维护
import type { AIStyle, Player, Pos, School, Staff, TeamColors } from './types';
import { G, nextId } from './state';
import { chance, gauss, pick, rand, randInt, weightedPick, shuffle } from './rng';
import { clamp } from './util';
import { generatePlayer } from './player';
import { aiGrow } from './growth';
import { strengthOf, type Strength } from './team';
import { strengthFromRating } from '../sim/quick';
import { PREFS, gameSchoolCount, notableCount, type PrefDef } from '../data/prefectures';
import { FAMILY_NAMES, GIVEN_NAMES, PRIVATE_PREFIX, PRIVATE_SUFFIX, PUBLIC_SUFFIX, TEAM_PALETTE } from '../data/names';
import { genStaff } from './staff';

export const AI_COHORT = 7;

/** 学校的典型新生素质 */
export function entryQ(prestige: number): number {
  return 18 + prestige * 0.42;
}

/** 由新生素质推算夏季巅峰战力（经验公式，见测试） */
export function peakStrength(q: number): number {
  return q + 14;
}

/** 不同时期相对夏季巅峰的战力偏差（新队伍较弱） */
export function phaseOffset(week: number): number {
  if (week >= 19 && week <= 31) return -7; // 秋季新队伍
  if (week >= 32 || week <= 3) return -5; // 冬~春初
  if (week <= 11) return -2; // 春
  return 0;
}

const usedNames = new Set<string>();

export function resetNameRegistry(): void {
  usedNames.clear();
  if (G) for (const s of Object.values(G.schools)) usedNames.add(s.name);
}

function makeName(pref: PrefDef, type: 'public' | 'private'): { name: string; short: string } {
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
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return { name, short };
    }
  }
  const n = `${pick(pref.cities)}${randInt(1, 9)}号高校`;
  usedNames.add(n);
  return { name: n, short: n.slice(0, 3) };
}

function makeColors(short: string): TeamColors {
  const c = pick(TEAM_PALETTE);
  return { primary: c.primary, secondary: c.secondary, cap: c.primary, letter: short.slice(0, 1) };
}

const STYLE_W: [AIStyle, number][] = [['balanced', 40], ['smallball', 25], ['power', 15], ['pitching', 12], ['speed', 8]];

export function makeSchool(pref: PrefDef, prestige: number, type: 'public' | 'private', district = 0): School {
  const { name, short } = makeName(pref, type);
  const q = entryQ(prestige);
  const style = weightedPick(STYLE_W, (x) => x[1])[0];
  const prof = { off: gauss(0, 2.5), pit: gauss(0, 2.5), def: gauss(0, 2) };
  if (style === 'power') prof.off += 2;
  if (style === 'pitching') prof.pit += 2;
  const apps = prestige > 60 ? Math.round(((prestige - 55) / 5) * (0.5 + rand())) : prestige > 45 && chance(0.3) ? randInt(1, 2) : 0;
  return {
    id: nextId(),
    name,
    short,
    prefId: pref.id,
    district,
    type,
    prestige: clamp(prestige, 1, 99),
    strength: peakStrength(q) + gauss(0, 3),
    style,
    mgrName: `${pick(FAMILY_NAMES)} ${pick(GIVEN_NAMES)}`,
    mgrSkill: clamp(30 + prestige * 0.5 + gauss(0, 10), 10, 95),
    facility: clamp(prestige * 0.8 + (type === 'private' ? 15 : 0) + gauss(0, 8), 5, 99),
    academic: clamp(gauss(50, 18), 10, 95),
    colors: makeColors(short),
    roster: null,
    staff: [],
    koshienApps: apps,
    koshienWins: Math.round(apps * (prestige / 100) * 1.4),
    summerTitles: prestige > 85 && chance(0.4) ? randInt(1, 3) : 0,
    springTitles: prestige > 85 && chance(0.3) ? randInt(1, 2) : 0,
    lastKoshien: apps > 0 ? -randInt(1, 8) : -99,
    history: [],
    rivalry: 0,
    seen: 0,
    profile: prof,
  };
}

/** 生成某县的学校列表 */
export function genPrefSchools(pref: PrefDef, full: boolean): School[] {
  const n = full ? gameSchoolCount(pref) : notableCount(pref);
  const sizeF = 0.9 + 0.1 * Math.min(1, pref.real / 150);
  const out: School[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    let prestige = full ? 12 + 80 * Math.pow(1 - t, 2.2) + gauss(0, 5) : 22 + 72 * Math.pow(1 - t, 1.5) + gauss(0, 5);
    prestige = clamp(prestige * sizeF, 3, 97);
    const type = chance(0.25 + 0.6 * (1 - t)) ? 'private' : 'public';
    out.push(makeSchool(pref, prestige, type));
  }
  if (pref.districts) {
    // 交替分到两个夏季地区，保证强校分散
    out.sort((a, b) => b.prestige - a.prestige).forEach((s, i) => (s.district = i % 4 === 0 || i % 4 === 3 ? 0 : 1));
  }
  return out;
}

// ---------- 球员名单 ----------
const COHORT_BASE: Pos[] = ['P', 'P', 'C', 'SS', 'CF'];
const FILL_W: [Pos, number][] = [['P', 22], ['C', 6], ['1B', 9], ['2B', 11], ['3B', 11], ['SS', 8], ['LF', 11], ['CF', 9], ['RF', 13]];

export function cohortPositions(n: number): Pos[] {
  const out = COHORT_BASE.slice(0, Math.min(n, COHORT_BASE.length));
  while (out.length < n) out.push(weightedPick(FILL_W, (x) => x[1])[0]);
  return shuffle(out);
}

/** 当前周对应的已成长周数 */
export function grownWeeks(grade: number, week: number): number {
  return (grade - 1) * 46 + Math.round(week * 0.96);
}

export function growFactor(s: School): number {
  // 难度只影响对手学校；就任前（生成世界时）还不知道哪所是本校，一律不加成
  const mine = G.manager?.schoolId ?? -1;
  const diff = mine < 0 || s.id === mine ? 1 : G.difficulty === 'hard' ? 1.08 : G.difficulty === 'easy' ? 0.92 : 1;
  return clamp((0.85 + s.facility / 250 + (s.mgrSkill - 50) / 400) * diff, 0.7, 1.45);
}

export function genCohort(s: School, grade: number, n: number, q: number, week: number, year: number): Player[] {
  const shift = gauss(0, 3.5);
  const out: Player[] = [];
  const poss = cohortPositions(n);
  poss.forEach((pos, i) => {
    let quality = q + shift + gauss(0, 7);
    if (i === 0 && chance(0.25 + s.prestige / 300)) quality += randInt(6, 12);
    const p = generatePlayer({
      quality,
      grade,
      pos,
      schoolId: s.id,
      enrollYear: year - grade + 1,
      weeksGrown: grownWeeks(grade, week),
      growFactor: growFactor(s),
      monster: quality > q + 18 && chance(0.05),
    });
    p.joined = 'gen';
    out.push(p);
  });
  return out;
}

/** 为学校生成完整名单（3 个年级） */
export function genRoster(s: School, week: number, year: number, perGrade = AI_COHORT, qOverride?: number): Player[] {
  const q = qOverride ?? entryQ(s.prestige);
  const out: Player[] = [];
  const retiredSeniors = week >= 19;
  for (let g = 1; g <= 3; g++) {
    if (g === 3 && retiredSeniors) continue;
    out.push(...genCohort(s, g, perGrade + (chance(0.3) ? 1 : 0) - (chance(0.2) ? 1 : 0), q, week, year));
  }
  for (const p of out) G.players[p.id] = p;
  s.roster = out.map((p) => p.id);
  return out;
}

export function rosterPlayers(s: School): Player[] {
  return (s.roster ?? []).map((id) => G.players[id]).filter((p): p is Player => !!p);
}

/** 被动学校具象化（需要与玩家交手或进入本县时） */
export function materialize(s: School): void {
  if (s.roster) return;
  // 依据当前战力反推新生素质
  const target = s.strength + phaseOffset(G.week);
  const q = target - 14 - phaseOffset(G.week) * 0.4;
  genRoster(s, G.week, G.year, AI_COHORT, q);
  s.seen = G.absWeek;
  if (!s.staff.length) {
    for (let i = 0; i < randInt(1, 2); i++) {
      const st = genStaff(undefined, 25 + s.prestige * 0.5);
      st.schoolId = s.id;
      G.staff[st.id] = st;
      s.staff.push(st.id);
    }
  }
}

/** 去具象化：删除名单，仅保留战力 */
export function dematerialize(s: School): void {
  if (!s.roster || s.id === G.club.schoolId) return;
  const ps = rosterPlayers(s);
  s.strength = strengthOf(ps, G.dh).total - phaseOffset(G.week);
  for (const p of ps) delete G.players[p.id];
  s.roster = null;
  for (const id of s.staff) delete G.staff[id];
  s.staff = [];
}

const strCache = new Map<number, { w: number; s: Strength }>();

export function clearStrengthCache(): void {
  strCache.clear();
}

/** 学校当前三维战力 */
export function schoolStrength(s: School): Strength {
  if (s.roster) {
    const c = strCache.get(s.id);
    if (c && c.w === G.absWeek) return c.s;
    const avail = rosterPlayers(s).filter((p) => !p.retired && p.grade >= 1 && p.grade <= 3 && p.ineligibleUntil <= G.absWeek);
    const st = strengthOf(avail, G.dh);
    strCache.set(s.id, { w: G.absWeek, s: st });
    return st;
  }
  const diffMod = s.id === G.club.schoolId ? 0 : G.difficulty === 'hard' ? 2.5 : G.difficulty === 'easy' ? -2.5 : 0;
  return strengthFromRating(s.strength + phaseOffset(G.week) + diffMod, s.profile);
}

export function schoolsInPref(prefId: number): School[] {
  return Object.values(G.schools).filter((s) => s.prefId === prefId);
}

export function prefOf(s: School): PrefDef {
  return PREFS[s.prefId];
}

/** AI 学校每 4 周一次的简化成长 */
export function aiMonthlyGrowth(): void {
  for (const s of Object.values(G.schools)) {
    if (!s.roster || s.id === G.club.schoolId) continue;
    const f = growFactor(s);
    for (const p of rosterPlayers(s)) {
      if (p.retired) continue;
      aiGrow(p, 4, f);
    }
  }
}

/** 生成 AI 学校新生（4 月），already 为已确定入学的招募生人数 */
export function aiEnroll(s: School, already: number, year: number): void {
  const q = entryQ(s.prestige);
  const need = Math.max(0, AI_COHORT + randInt(-1, 1) - already);
  const fresh = genCohort(s, 1, need, q - 3, 0, year);
  for (const p of fresh) {
    p.joined = 'walkon';
    G.players[p.id] = p;
  }
  s.roster = [...(s.roster ?? []), ...fresh.map((p) => p.id)];
}

export function allStaffOf(s: School): Staff[] {
  return s.staff.map((id) => G.staff[id]).filter(Boolean);
}
