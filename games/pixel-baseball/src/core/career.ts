// 监督生涯：背景、名声、成长、年度目标与评价、跳槽、成就
import type { MgrSkill, Player, Pos, SchoolLite, Tour } from './types';
import { FACILITY_IDS, MGR_SKILLS } from './types';
import { G, addPrestige, addRep, log, milestone, mySchool, myPlayers } from './state';
import { chance, gauss, hash32, pick, randInt, shuffle, withSeed } from './rng';
import { clamp } from './util';
import { generatePlayer } from './player';
import { genPrefSchools, schoolRating, extSchools, clearWorldCache } from './world';
import { strengthOf } from './team';
import { SCHED, doy, yearIdx } from './calendar';
import { PREFS } from '../data/prefectures';
import { FAMILY_NAMES } from '../data/names';

export const MGR_SKILL_NAME: Record<MgrSkill, string> = {
  batting: '打击指导', pitching: '投手指导', fielding: '守备指导', tactics: '战术指挥', leadership: '统率力', recruiting: '招募口才', negotiation: '交涉力', insight: '慧眼',
};
export const MGR_SKILL_DESC: Record<MgrSkill, string> = {
  batting: '野手的技术经验', pitching: '投手的技术、变化经验', fielding: '敏捷经验（守备、跑垒）', tactics: '比赛中战术的判断与成功率',
  leadership: '球队默契、干劲与精神经验', recruiting: '新生的人数与素质', negotiation: '学校拨款与 OB 捐款', insight: '看清球员的潜力与能力上限',
};

export interface BackgroundDef {
  id: string;
  name: string;
  desc: string;
  skills: Record<MgrSkill, number>;
  rep: number;
  funds: number;
}

export const BACKGROUNDS: readonly BackgroundDef[] = [
  { id: 'expro', name: '前职业球员', desc: '曾在职业联赛效力多年。名声起点高，打击与投手指导出色，但不擅长经营。', skills: { batting: 62, pitching: 58, fielding: 50, tactics: 45, leadership: 50, recruiting: 52, negotiation: 35, insight: 55 }, rep: 30, funds: 150 },
  { id: 'koshien', name: '前甲子园英雄', desc: '高中时代在甲子园闪耀过的人物。统率力与招募口才出众。', skills: { batting: 52, pitching: 50, fielding: 50, tactics: 48, leadership: 60, recruiting: 60, negotiation: 42, insight: 48 }, rep: 22, funds: 120 },
  { id: 'teacher', name: '体育教师', desc: '在公立高中执教多年的体育老师。能力均衡，擅长纪律与学业管理。', skills: { batting: 48, pitching: 48, fielding: 56, tactics: 50, leadership: 60, recruiting: 42, negotiation: 45, insight: 50 }, rep: 10, funds: 100 },
  { id: 'analyst', name: '数据分析师', desc: '运动科学出身的理论派。战术与慧眼出众，但缺乏威信。', skills: { batting: 50, pitching: 52, fielding: 48, tactics: 65, leadership: 40, recruiting: 45, negotiation: 48, insight: 65 }, rep: 8, funds: 110 },
  { id: 'business', name: '企业家转行', desc: '商界出身的棒球狂热者。交涉与招募一流，但指导经验不足。', skills: { batting: 42, pitching: 42, fielding: 42, tactics: 45, leadership: 52, recruiting: 56, negotiation: 70, insight: 48 }, rep: 12, funds: 400 },
];

export function repTier(r: number): string {
  if (r >= 95) return '传说';
  if (r >= 80) return '名将中的名将';
  if (r >= 60) return '名将';
  if (r >= 40) return '实力派';
  if (r >= 20) return '新锐';
  return '无名';
}

// ---------- 监督成长 ----------
export const mgrExpNeed = (lv: number) => 30 + lv * 15;

/** 监督经验到了就升级（每级 +3 点，由事件让玩家选） */
export function checkLevelUp(): boolean {
  const m = G.mgr;
  if (m.exp < mgrExpNeed(m.level)) return false;
  m.exp -= mgrExpNeed(m.level);
  m.level++;
  return true;
}

export function raiseSkill(k: MgrSkill, v: number): void {
  G.mgr.skills[k] = clamp(G.mgr.skills[k] + v, 0, 99);
}

/** 托管时推荐提升的能力：背景擅长的、当前最需要的 */
export function suggestSkill(): MgrSkill {
  const sk = G.mgr.skills;
  const pol = G.policies;
  const want: Partial<Record<MgrSkill, number>> = { batting: 1, pitching: 1, tactics: 0.9, leadership: 0.9, fielding: 0.7, recruiting: 0.7, insight: 0.4, negotiation: 0.5 };
  if (pol.focus === 'pitching') want.pitching = 1.4;
  if (pol.focus === 'batting') want.batting = 1.4;
  if (pol.focus === 'defense') want.fielding = 1.3;
  if (G.funds < 100) want.negotiation = 1.3;
  let best: MgrSkill = 'batting';
  let bv = -Infinity;
  for (const k of MGR_SKILLS) {
    const v = (want[k] ?? 0.5) * (100 - sk[k]);
    if (v > bv) {
      bv = v;
      best = k;
    }
  }
  return best;
}

// ---------- 年度目标 ----------
/** 本校在县内的预期名次（按战力） */
export function expectedRank(): number {
  const mine = strengthOf(myPlayers(), G.dh).total;
  let ahead = 0;
  for (const s of Object.values(G.schools)) if (s.id !== G.schoolId && schoolRating(s, G.day + 100) > mine) ahead++;
  return ahead + 1;
}

/** 4 月：校方定下今年夏天的目标 */
export function setGoal(): void {
  const rank = expectedRank();
  const s = mySchool();
  const N = Math.max(2, Object.values(G.schools).filter((x) => !PREFS[G.prefId].districts || x.district === s.district).length);
  const R = Math.ceil(Math.log2(N));
  // myRank：第 r 轮输球 = r + 1；冠军 = 轮数 + 1
  let goal: NonNullable<typeof G.club.goal>;
  if (rank <= 1 && s.prestige >= 75) goal = { kind: 'koshien', rank: 2, text: '甲子园赢下一场' };
  else if (rank <= 1) goal = { kind: 'summerPref', rank: R + 1, text: '夏季县大会优胜（甲子园出场）' };
  else if (rank <= 3) goal = { kind: 'summerPref', rank: R - 1, text: '夏季县大会四强' };
  else if (rank <= 7) goal = { kind: 'summerPref', rank: R - 2, text: '夏季县大会八强' };
  else if (rank <= N / 4 && R >= 5) goal = { kind: 'summerPref', rank: R - 3, text: '夏季县大会十六强' };
  else if (rank <= N / 2) goal = { kind: 'summerPref', rank: 3, text: '夏季县大会赢下两场' };
  else goal = { kind: 'summerPref', rank: 2, text: '夏季县大会赢下一场' };
  G.club.goal = goal;
  log(`校方定下了今年的目标：${goal.text}`, 'info');
}

export function goalMet(): boolean {
  const g = G.club.goal;
  if (!g) return true;
  const t: Tour | undefined = G.tours[g.kind];
  if (g.kind === 'koshien') {
    if (!t || t.myRank < 0) return false;
    return t.myRank >= g.rank;
  }
  return !!t && t.myRank >= g.rank;
}

// ---------- 跳槽 ----------
export interface Offer {
  prefId: number;
  school: SchoolLite;
  note: string;
}

/** 生成来自其他学校的邀请（名声越高，来的学校越好） */
export function makeOffers(n: number, better: boolean): Offer[] {
  const me = mySchool();
  const out: Offer[] = [];
  const tried = new Set<number>();
  for (let k = 0; k < 30 && out.length < n; k++) {
    const prefId = chance(0.35) ? G.prefId : randInt(0, PREFS.length - 1);
    const pool = prefId === G.prefId ? Object.values(G.schools).filter((s) => s.id !== me.id) : extSchools(prefId);
    const cands = pool.filter((s) => !tried.has(s.id) && (better ? s.prestige > me.prestige + 4 && s.prestige < 30 + G.mgr.rep * 0.9 : s.prestige < me.prestige));
    if (!cands.length) continue;
    const s = pick(cands);
    tried.add(s.id);
    const why = better
      ? pick(['校长亲自登门拜访', 'OB 会长托人带话', '理事长开出了优厚的条件', '对方的前任监督刚刚退休', '想请你重建这支传统强队'])
      : pick(['愿意给你一个从头再来的机会', '这里的条件不算好，但学生们很热情', '校长说：“我们相信你的能力。”']);
    out.push({ prefId, school: { ...s }, note: why });
  }
  return out;
}

/** 接受邀请：带着名声和经验去新学校，旧学校的球员留在原地 */
export function moveTo(offer: Offer): void {
  const old = mySchool();
  const y = yearIdx(G.day);
  G.mgr.career.push({ year: y, school: old.name, summary: `${G.mgr.since === y ? '' : `${y - G.mgr.since + 1} 个学年，`}通算 ${G.mgr.totals.w} 胜`, w: G.mgr.totals.w, l: G.mgr.totals.l });
  // 新的县
  const pref = PREFS[offer.prefId];
  let schools: SchoolLite[];
  let target: SchoolLite;
  if (offer.prefId === G.prefId) {
    schools = Object.values(G.schools);
    target = G.schools[offer.school.id];
  } else {
    schools = withSeed(hash32(G.seed, offer.prefId, y, 91), () => genPrefSchools(pref, true, G.nextId));
    G.nextId += schools.length + 1;
    // 用邀请里的学校替换一所名门度最接近的
    let bi = 0;
    schools.forEach((s, i) => {
      if (Math.abs(s.prestige - offer.school.prestige) < Math.abs(schools[bi].prestige - offer.school.prestige)) bi = i;
    });
    target = { ...offer.school, id: schools[bi].id, prefId: pref.id, district: schools[bi].district, rival: 0 };
    schools[bi] = target;
    G.prefId = pref.id;
    G.schools = Object.fromEntries(schools.map((s) => [s.id, s]));
    clearWorldCache();
  }
  // 离开旧学校：球员留下
  for (const id of [...G.roster, ...G.incoming]) delete G.players[id];
  G.roster = [];
  G.incoming = [];
  G.schoolId = target.id;
  G.mgr.since = y;
  G.tours = {};
  G.pending = null;
  G.senbatsuPick = [];
  // 新学校的球员
  for (const p of materializeRoster(target)) {
    G.players[p.id] = p;
    G.roster.push(p.id);
  }
  // 新学校的条件
  const pr = target.prestige;
  for (const id of FACILITY_IDS) G.facilities[id] = clamp(Math.round(pr / 28 + gauss(0, 0.6)), 0, 4);
  if (target.type === 'public') G.facilities.dorm = Math.min(G.facilities.dorm, 1);
  G.building = null;
  G.funds = Math.round(150 + pr * 4);
  G.club = { chemistry: 50, fans: Math.round(500 + pr * 60), board: 60, ob: 50, captainId: null, scandal: 0, banUntil: 0, tactics: clamp(25 + pr * 0.3, 0, 100), goal: null };
  addRep(3);
  log(`就任${target.name}监督！`, 'gold');
  milestone(`离开${old.name}，就任${target.name}（${pref.name}）监督`);
  G.flags.moved = (G.flags.moved ?? 0) + 1;
}

/** 本校在某个大会里赢了几场（不算轮空） */
export function myTourWins(t: Tour): number {
  let w = 0;
  for (const r of t.rounds) for (const m of r) if (m.done && m.w === G.schoolId && m.note !== '轮空') w++;
  return w;
}

/** 夏天的成绩改变学校的名门度（影响招生） */
export function prestigeDrift(): void {
  const s = mySchool();
  const sp = G.tours.summerPref;
  const k = G.tours.koshien;
  let d = 0;
  if (k && k.myRank > 0) d += 5 + Math.max(0, k.myRank - 1) * 1.5;
  else if (sp && sp.myRank > 0) {
    // 按胜场和打到多深一起算：学校多的县要多赢几场才进得了八强
    const deep = Math.max(0, sp.myRank - (sp.rounds.length - 3)); // 八强 = 1，四强 = 2，亚军 = 3
    d += myTourWins(sp) * 0.6 + deep * 0.6;
    if (!deep && s.prestige > 45) d -= 1;
  }
  if (d) addPrestige(d);
}

/** 新学校现有的球员（永久 id） */
export function materializeRoster(s: SchoolLite): Player[] {
  const y = yearIdx(G.day);
  const q = schoolRating(s, G.day) - 14 - 2;
  const out: Player[] = [];
  const weeks = Math.round((doy(G.day) / 360) * 44);
  for (let grade = 3; grade >= 1; grade--) {
    const n = s.prestige > 60 ? 9 : s.prestige > 35 ? 8 : 7;
    const poss: Pos[] = shuffle(['P', 'P', 'C', 'SS', 'CF', ...Array.from({ length: n - 5 }, () => pick<Pos>(['P', '1B', '2B', '3B', 'LF', 'RF', 'C', 'SS'])) ]);
    for (const pos of poss) {
      const p = generatePlayer({ quality: q + gauss(0, 5), grade, pos, enrollYear: y - (grade - 1), weeksGrown: (grade - 1) * 44 + weeks });
      out.push(p);
    }
  }
  // 9 月以后三年级已经引退
  for (const p of out) if (p.grade === 3 && doy(G.day) >= SCHED.newTeam) p.retired = true;
  return out;
}

// ---------- 成就 ----------
export interface AchDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: readonly AchDef[] = [
  { id: 'firstWin', name: '初胜利', desc: '在正式比赛中赢下第一场' },
  { id: 'prefChamp', name: '县内霸主', desc: '赢得县大会冠军' },
  { id: 'regionChamp', name: '地区制霸', desc: '赢得地区大会冠军' },
  { id: 'koshien', name: '甲子园的土', desc: '出场甲子园' },
  { id: 'koshienWin', name: '甲子园初胜', desc: '在甲子园赢下一场' },
  { id: 'koshien8', name: '甲子园八强', desc: '在甲子园打进八强' },
  { id: 'summerChamp', name: '深红色的大旗', desc: '夏季甲子园优胜' },
  { id: 'springChamp', name: '紫色的大旗', desc: '春季选拔优胜' },
  { id: 'jinguChamp', name: '神宫之王', desc: '明治神宫大会优胜' },
  { id: 'double', name: '春夏连霸', desc: '同一学年拿下春季选拔与夏季甲子园' },
  { id: 'v150', name: '150 公里', desc: '培养出最快 150 km/h 的投手' },
  { id: 'v160', name: '160 公里的怪物', desc: '培养出最快 160 km/h 的投手' },
  { id: 'nohit', name: '无安打比赛', desc: '投出无安打无失分比赛' },
  { id: 'perfect', name: '完全比赛', desc: '投出完全比赛' },
  { id: 'pitch6', name: '变化球博物馆', desc: '培养出掌握 6 种变化球的投手' },
  { id: 'sig', name: '魔球诞生', desc: '有投手开发出独创的魔球' },
  { id: 'draft1', name: '第一顺位', desc: '有球员在选秀会议第一轮被指名' },
  { id: 'pros5', name: '职业球员摇篮', desc: '累计培养 5 名职业球员' },
  { id: 'pros15', name: '名门的传承', desc: '累计培养 15 名职业球员' },
  { id: 'monster', name: '怪物来了', desc: '「怪物」入部' },
  { id: 'wins100', name: '百胜监督', desc: '正式比赛通算 100 胜' },
  { id: 'wins300', name: '三百胜', desc: '正式比赛通算 300 胜' },
  { id: 'rep60', name: '名将', desc: '名声达到 60' },
  { id: 'rep95', name: '传说的监督', desc: '名声达到 95' },
  { id: 'years10', name: '十年磨一剑', desc: '执教满 10 个学年' },
  { id: 'facilities', name: '最好的环境', desc: '所有设施都升到最高等级' },
  { id: 'move', name: '新天地', desc: '跳槽到别的学校' },
];

export function unlock(id: string): void {
  if (G.achievements[id] !== undefined) return;
  G.achievements[id] = G.day;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) {
    log(`成就解锁：${a.name}`, 'gold');
    milestone(`成就：${a.name}`);
  }
}

export function checkAchievements(): void {
  const t = G.mgr.totals;
  if (t.w >= 1) unlock('firstWin');
  if (t.prefTitles >= 1) unlock('prefChamp');
  if (t.koshienApps >= 1) unlock('koshien');
  if (t.koshienWins >= 1) unlock('koshienWin');
  if (t.summerTitles >= 1) unlock('summerChamp');
  if (t.springTitles >= 1) unlock('springChamp');
  if (t.w >= 100) unlock('wins100');
  if (t.w >= 300) unlock('wins300');
  if (G.mgr.rep >= 60) unlock('rep60');
  if (G.mgr.rep >= 95) unlock('rep95');
  if (t.seasons >= 10) unlock('years10');
  if ((G.flags.v150 ?? 0) >= 150) unlock('v150');
  if ((G.flags.v150 ?? 0) >= 160) unlock('v160');
  if (G.flags.nohit) unlock('nohit');
  if (G.flags.perfect) unlock('perfect');
  if (G.flags.moved) unlock('move');
  const pros = G.alumni.filter((a) => a.path === 'pro').length;
  if (pros >= 5) unlock('pros5');
  if (pros >= 15) unlock('pros15');
  if (FACILITY_IDS.every((id) => G.facilities[id] >= 5)) unlock('facilities');
  for (const p of myPlayers()) {
    if (p.pitches.length >= 6) unlock('pitch6');
    if (p.pitches.some((x) => x.sig)) unlock('sig');
    if (p.traits.includes('monster')) unlock('monster');
  }
}

/** 随机的监督名字 */
export function randomMgrName(): string {
  return `${pick(FAMILY_NAMES)} ${pick(['健一', '诚', '博之', '大辅', '正树', '浩二', '隆', '修', '刚', '达也', '雅人', '和也'])}`;
}

