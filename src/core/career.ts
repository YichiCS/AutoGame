// 监督生涯：目标、评价、合同、跳槽、成就
import type { JobOffer, Manager, MgrSkill, School, Tournament } from './types';
import { MGR_SKILLS } from './types';
import { G, mySchool, nextId, addRep } from './state';
import { chance, pick, randInt, weightedPick } from './rng';
import { clamp } from './util';
import { schoolStrength, schoolsInPref, materialize, dematerialize, genPrefSchools, rosterPlayers } from './world';
import { PREFS, gameSchoolCount } from '../data/prefectures';
import { genStaff, refreshMarket } from './staff';
import { decideRecruits, genProspects } from './recruit';
import { autoBench } from './team';
import { SCHED } from './calendar';

export const MGR_SKILL_NAME: Record<MgrSkill, string> = {
  batting: '打击指导', pitching: '投手指导', fielding: '守备指导', tactics: '战术指挥', leadership: '统率力', recruiting: '招募口才', negotiation: '交涉力', insight: '慧眼',
};
export const MGR_SKILL_DESC: Record<MgrSkill, string> = {
  batting: '打击练习的效率', pitching: '投球练习的效率', fielding: '守备/跑垒练习效率与守位转换速度', tactics: '比赛中战术的成功率、战术熟练度成长',
  leadership: '球队默契与干劲，减少不良事件', recruiting: '家访效果与招募吸引力', negotiation: '赞助条件、教练挖角与签约', insight: '看穿球员潜力与中学生的真实能力',
};

export interface BackgroundDef {
  id: string;
  name: string;
  desc: string;
  skills: Record<MgrSkill, number>;
  rep: number;
  money: number;
}

export const BACKGROUNDS: readonly BackgroundDef[] = [
  { id: 'expro', name: '前职业球员', desc: '曾在职业联赛效力多年。名声起点高，打击与投手指导出色，但不擅长经营。', skills: { batting: 62, pitching: 58, fielding: 50, tactics: 45, leadership: 50, recruiting: 52, negotiation: 35, insight: 55 }, rep: 32, money: 2000 },
  { id: 'koshien', name: '前甲子园英雄', desc: '高中时代在甲子园闪耀过的人物。统率力与招募口才出众。', skills: { batting: 52, pitching: 50, fielding: 50, tactics: 48, leadership: 60, recruiting: 60, negotiation: 42, insight: 48 }, rep: 24, money: 600 },
  { id: 'teacher', name: '体育教师', desc: '在公立高中执教多年的体育老师。能力均衡，擅长纪律与学业管理。', skills: { batting: 48, pitching: 48, fielding: 56, tactics: 50, leadership: 60, recruiting: 42, negotiation: 45, insight: 50 }, rep: 10, money: 400 },
  { id: 'analyst', name: '数据分析师', desc: '运动科学出身的理论派。战术与慧眼出众，但缺乏威信。', skills: { batting: 50, pitching: 52, fielding: 48, tactics: 65, leadership: 40, recruiting: 45, negotiation: 48, insight: 65 }, rep: 8, money: 500 },
  { id: 'business', name: '企业家转行', desc: '商界出身的棒球狂热者。交涉与招募一流，但指导经验不足。', skills: { batting: 42, pitching: 42, fielding: 42, tactics: 45, leadership: 52, recruiting: 56, negotiation: 70, insight: 48 }, rep: 12, money: 3000 },
];

export function newManager(name: string, bgId: string, age: number): Manager {
  const bg = BACKGROUNDS.find((b) => b.id === bgId) ?? BACKGROUNDS[2];
  return {
    name,
    age,
    bg: bg.id,
    skills: { ...bg.skills },
    level: 1,
    exp: 0,
    points: 0,
    reputation: bg.rep,
    money: bg.money,
    salary: 400,
    schoolId: -1,
    contractYears: 3,
    ap: 4,
    apMax: 4,
    history: [],
    achievements: [],
    offers: [],
    totals: { w: 0, l: 0, koshienApps: 0, koshienWins: 0, summerTitles: 0, springTitles: 0, drafted: 0, seasons: 0 },
    unemployedWeeks: 0,
    seasonW: 0,
    seasonL: 0,
  };
}

export function repTier(r: number): string {
  if (r >= 95) return '传说';
  if (r >= 80) return '名将中的名将';
  if (r >= 60) return '名将';
  if (r >= 40) return '实力派';
  if (r >= 20) return '新锐';
  return '无名';
}

export function addMgrExp(v: number): string | null {
  const m = G.manager;
  m.exp += v;
  let up = 0;
  while (m.exp >= mgrExpNeed(m.level)) {
    m.exp -= mgrExpNeed(m.level);
    m.level++;
    m.points += 3;
    up++;
  }
  return up ? `监督等级提升至 Lv${m.level}！获得技能点 ${up * 3}。` : null;
}

export function skillCost(v: number): number {
  return v >= 85 ? 3 : v >= 70 ? 2 : 1;
}

export function raiseSkill(k: MgrSkill): boolean {
  const m = G.manager;
  const c = skillCost(m.skills[k]);
  if (m.points < c || m.skills[k] >= 99) return false;
  m.points -= c;
  m.skills[k]++;
  return true;
}

export function apMaxOf(m: Manager): number {
  return 3 + Math.floor(m.skills.leadership / 30);
}

// ---------- 夏季目标阶梯 ----------
export const LADDER = ['县大会初战败退', '县大会1胜', '县大会16强', '县大会8强', '县大会4强', '县大会亚军', '甲子园出场', '甲子园1胜', '甲子园8强', '甲子园4强', '甲子园亚军', '全国制霸'];

function ladderIn(t: Tournament, sid: number): number {
  // 统计在该大会的胜场与淘汰轮次
  let wins = 0;
  let lostRound = -1;
  t.rounds.forEach((ms, r) => {
    for (const m of ms) {
      if (m.a !== sid && m.b !== sid) continue;
      if (!m.played || m.note === '轮空') continue;
      if (m.winner === sid) wins++;
      else lostRound = r;
    }
  });
  const R = t.rounds.length;
  if (t.champion === sid) return 99;
  if (lostRound < 0) return -1;
  const left = 2 ** (R - lostRound);
  return left <= 2 ? 5 : left <= 4 ? 4 : left <= 8 ? 3 : left <= 16 ? 2 : wins >= 1 ? 1 : 0;
}

export function summerLadder(sid: number): number {
  const ks = Object.values(G.tournaments).find((t) => t.kind === 'koshien' && t.year === G.year);
  if (ks && ks.teams.includes(sid)) {
    if (ks.champion === sid) return 11;
    if (ks.runnerUp === sid) return 10;
    const f = ks.finish[sid];
    if (f === '四强') return 9;
    if (f === '八强') return 8;
    let wins = 0;
    for (const ms of ks.rounds) for (const m of ms) if (m.played && m.note !== '轮空' && m.winner === sid) wins++;
    return wins >= 1 ? 7 : 6;
  }
  const sp = Object.values(G.tournaments).find((t) => t.kind === 'summerPref' && t.year === G.year && t.teams.includes(sid));
  if (!sp) return 0;
  const l = ladderIn(sp, sid);
  return l === 99 ? 6 : Math.max(0, l);
}

/** 新年度设定目标 */
export function setYearGoal(): number {
  const me = mySchool();
  const pref = schoolsInPref(me.prefId).filter((s) => s.district === me.district || !PREFS[me.prefId].districts);
  const sorted = pref.map((s) => ({ s, v: schoolStrength(s).total })).sort((a, b) => b.v - a.v);
  const k = sorted.findIndex((x) => x.s.id === me.id) + 1;
  let goal = k === 1 ? 5 : k <= 2 ? 4 : k <= 4 ? 3 : k <= 9 ? 2 : 1;
  if (me.prestige >= 80) goal = Math.max(goal, 6);
  else if (me.prestige >= 65) goal = Math.max(goal, 4);
  if (G.difficulty === 'easy') goal = Math.max(0, goal - 1);
  if (G.club.contractGoal !== undefined) {
    goal = Math.max(goal, G.club.contractGoal);
    delete G.club.contractGoal;
  }
  G.club.goal = clamp(goal, 0, 9);
  return G.club.goal;
}

/** 夏季结束时评价 */
export function evaluateSummer(): { lines: string[]; fired: boolean } {
  const me = mySchool();
  const res = summerLadder(me.id);
  const d = res - G.club.goal;
  const lines: string[] = [];
  const delta = clamp(d * 9 + (d >= 0 ? 4 : 0), -30, 30);
  G.club.board = clamp(G.club.board + delta, 0, 100);
  G.club.ob = clamp(G.club.ob + d * 6, 0, 100);
  G.club.supporters = clamp(G.club.supporters + d * 5, 0, 100);
  lines.push(`今夏成绩：${LADDER[res]}（目标：${LADDER[G.club.goal]}）。校方满意度 ${delta >= 0 ? '+' : ''}${delta}。`);
  if (res >= 6) addRep(4 + (res - 6) * 3);
  else if (d > 0) addRep(d * 1.5);
  if (d < 0) G.manager.reputation = clamp(G.manager.reputation - 1, 0, 100);
  const fired = G.club.board < 15 && me.type === 'private' && G.difficulty !== 'easy';
  return { lines, fired };
}

// ---------- 跳槽 ----------
export function offerWindow(): boolean {
  return G.week === 19 || G.week === 20 || (G.week >= 31 && G.week <= 43);
}

export function makeOffer(s: School, forced = false): JobOffer {
  const rep = G.manager.reputation;
  return {
    id: nextId(),
    schoolId: s.id,
    salary: Math.round((300 + s.prestige * 7 + rep * 3 + (s.type === 'private' ? 200 : 0)) / 10) * 10,
    years: randInt(2, 4),
    goal: s.prestige >= 80 ? 6 : s.prestige >= 60 ? 4 : s.prestige >= 40 ? 3 : 2,
    budgetHint: Math.round(s.type === 'public' ? 250 + s.prestige * 4 : 600 + s.prestige * 22),
    expires: forced ? G.absWeek + 1 : G.absWeek + 4,
    note: forced ? '（被解任后收到的邀请）' : '',
  };
}

export function genOffers(forced = false): JobOffer[] {
  const rep = G.manager.reputation;
  const me = mySchool();
  const lo = forced ? 0 : rep * 0.5;
  const hi = forced ? Math.max(30, me.prestige - 10) : rep + 25;
  const cands = Object.values(G.schools).filter((s) => s.id !== me.id && s.prestige >= lo && s.prestige <= hi);
  const n = forced ? Math.min(cands.length, 3) : chance(0.35 + rep / 150) ? randInt(1, 2) : 0;
  const out: JobOffer[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    const s = weightedPick(cands, (x) => (used.has(x.id) ? 0 : (PREFS[x.prefId].region === PREFS[me.prefId].region ? 3 : 1) * (x.prestige + 10)));
    if (!s || used.has(s.id)) continue;
    used.add(s.id);
    out.push(makeOffer(s, forced));
  }
  return out;
}

/** 转任到新学校 */
export function switchSchool(o: JobOffer): string[] {
  const lines: string[] = [];
  const old = mySchool();
  const ns = G.schools[o.schoolId];
  const oldPref = old.prefId;
  G.manager.history.push({ year: G.year, schoolId: old.id, schoolName: old.name, summary: `离任（转往${ns.name}）`, w: G.manager.seasonW, l: G.manager.seasonL });
  G.manager.seasonW = 0;
  G.manager.seasonL = 0;
  if (G.manager.contractYears > 0 && G.club.board >= 40) G.manager.reputation = clamp(G.manager.reputation - 2, 0, 100);
  // 县变更：旧县去具象化，新县补足学校
  if (ns.prefId !== oldPref) {
    for (const s of schoolsInPref(oldPref)) dematerialize(s);
    const pref = PREFS[ns.prefId];
    const have = schoolsInPref(ns.prefId);
    const need = gameSchoolCount(pref) - have.length;
    if (need > 0) {
      const extra = genPrefSchools(pref, true).sort((a, b) => a.prestige - b.prestige).slice(0, need);
      // 新生成的学校里名气最高的那些会与知名校重复定位，取较弱的部分补足
      for (const s of extra) {
        if (pref.districts) s.district = have.filter((x) => x.district === 0).length <= have.filter((x) => x.district === 1).length ? 0 : 1;
        G.schools[s.id] = s;
        have.push(s);
      }
    }
    // 删除多生成但未使用的名字不影响
    for (const s of schoolsInPref(ns.prefId)) materialize(s);
  } else {
    materialize(ns);
  }
  // 旧学校：降级为 AI 学校（教练留下）
  G.manager.schoolId = ns.id;
  G.club = freshClub(ns);
  // 周中就任时，周报的部费变化从新学校的部费算起
  if (G.flow) G.flow.report.money = G.club.funds;
  G.manager.salary = o.salary;
  G.manager.contractYears = o.years;
  G.manager.contractFresh = G.week < SCHED.graduation;
  // 新学校的教练团队
  if (!ns.staff.length) {
    for (let i = 0; i < randInt(1, 2); i++) {
      const st = genStaff(undefined, 30 + ns.prestige * 0.4);
      st.schoolId = ns.id;
      G.staff[st.id] = st;
      ns.staff.push(st.id);
    }
  }
  if (ns.prefId !== oldPref) {
    genProspects();
    // 入学已经决定之后才转来：新县的中学生也要完成去向决定
    if (G.week >= SCHED.recruitDecision) decideRecruits();
  } else {
    for (const id of G.prospects) {
      const p = G.players[id];
      if (!p) continue;
      // 旧学校的特待生邀请不能带到新学校
      if (p.offers?.includes(-1)) p.offers = p.offers.filter((x) => x !== -1);
      if (p.interest) p.interest[ns.id] = Math.max(p.interest[ns.id] ?? 0, (p.interest[old.id] ?? 0) * 0.5);
    }
  }
  refreshMarket();
  G.club.goal = o.goal;
  G.club.contractGoal = o.goal;
  lines.push(`你正式就任${ns.name}监督！新的挑战开始了。`);
  return lines;
}

export function freshClub(s: School): import('./types').ClubState {
  const lvl = (x: number, max: number) => clamp(Math.round(x), 0, max);
  const f = s.facility;
  const roster = s.roster ? rosterPlayers(s) : [];
  return {
    schoolId: s.id,
    funds: Math.round((s.type === 'public' ? 250 + s.prestige * 4 : 600 + s.prestige * 22) * 0.6),
    ledger: [],
    books: [],
    facilities: {
      field: lvl(f / 25, 5), indoor: lvl((f - 40) / 25, 3), weight: lvl(f / 25, 5), bullpen: lvl(f / 22, 5),
      cage: lvl(f / 22, 5), dorm: s.type === 'private' ? lvl((f - 20) / 25, 3) : 0, medical: lvl((f - 30) / 30, 3), analysis: lvl((f - 50) / 25, 3),
    },
    construction: null,
    training: { alloc: { bat: 25, pitch: 15, field: 20, run: 10, power: 10, game: 10, tactic: 5, rest: 5, study: 0 }, intensity: 1 },
    lineup: { auto: true, order: [], defense: {}, dh: null, bench: autoBench(roster, 20, G.dh), rotation: [], autoBench: true },
    autoManage: false,
    sponsors: [],
    sponsorOffers: [],
    meal: 0,
    equipment: 0,
    walkonPolicy: 'open',
    captainId: null,
    chemistry: 50,
    tacticsSkill: clamp(25 + s.prestige * 0.35, 0, 100),
    fans: Math.round(300 + s.prestige * s.prestige * 2.5 + s.koshienApps * 400),
    practice: null,
    scholarshipSlots: s.type === 'private' ? clamp(Math.round(1 + s.prestige / 20), 1, 6) : 0,
    goal: 2,
    board: 60,
    ob: 55,
    supporters: 50,
    scandal: 0,
    banUntil: 0,
    koshienFund: 0,
  };
}

/** 年末（3 月）合同处理 */
export function contractYearEnd(): { lines: string[]; renew: boolean; expired: boolean } {
  const m = G.manager;
  const lines: string[] = [];
  if (m.contractFresh) {
    // 年度中途就任：合同从下一个年度开始计算
    m.contractFresh = false;
    return { lines, renew: false, expired: false };
  }
  m.contractYears--;
  if (m.contractYears > 0) return { lines, renew: false, expired: false };
  if (G.club.board >= 45) {
    return { lines: ['合同即将到期，校方希望与你续约。'], renew: true, expired: false };
  }
  lines.push('合同到期，校方决定不再续约……');
  return { lines, renew: false, expired: true };
}

// ---------- 成就 ----------
export const ACHIEVEMENTS: Record<string, { name: string; desc: string }> = {
  first_win: { name: '初胜利', desc: '取得监督生涯首场公式战胜利' },
  koshien_debut: { name: '梦之舞台', desc: '首次率队出场甲子园' },
  koshien_win: { name: '甲子园初胜', desc: '在甲子园取得胜利' },
  summer_champ: { name: '深红的大旗', desc: '夺得夏季甲子园冠军' },
  spring_champ: { name: '紫红的大旗', desc: '夺得选拔甲子园冠军' },
  haru_natsu: { name: '春夏连霸', desc: '同一年度夺得春夏两季冠军' },
  giant_killer: { name: '巨人杀手', desc: '以弱校击败名门强校' },
  first_pro: { name: '育成之才', desc: '首次有球员被职业球队选中' },
  ten_pros: { name: '职业制造机', desc: '累计 10 名球员进入职业' },
  no_hitter: { name: '无安打比赛', desc: '投手团完成无安打比赛' },
  wins100: { name: '百胜监督', desc: '公式战通算 100 胜' },
  comeback: { name: '奇迹逆转', desc: '落后 5 分以上逆转获胜' },
  public_koshien: { name: '公立之光', desc: '率领公立学校出场甲子园' },
  rich: { name: '财政大臣', desc: '部费余额超过 1 亿円' },
  monster: { name: '怪物入部', desc: '招募到"怪物"级新生' },
  jingu: { name: '神宫制霸', desc: '夺得明治神宫大会冠军' },
};

export function unlock(id: string): string | null {
  if (G.manager.achievements.includes(id)) return null;
  G.manager.achievements.push(id);
  addRep(1);
  return `🏆 成就解锁：${ACHIEVEMENTS[id]?.name ?? id}`;
}

export function randomMgrSkill(): MgrSkill {
  return pick(MGR_SKILLS);
}

export function ageManager(): void {
  G.manager.age++;
}


export function mgrExpNeed(level: number): number {
  return 80 + level * 40;
}
