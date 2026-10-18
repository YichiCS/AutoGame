// 招募：中学生、一般入部、转学生
import type { AttrKey, Player, School } from './types';
import { ALL_ATTRS } from './types';
import { G, mySchool, myPlayers } from './state';
import { chance, gauss, hash32, pick, randInt, weightedPick } from './rng';
import { clamp, sortBy } from './util';
import { generatePlayer } from './player';
import { entryQ, schoolsInPref, rosterPlayers } from './world';
import { batterOffense, isPitcher, overall, pitcherOverall, stars } from './attrs';
import { addMoney } from './finance';
import { roleSkill, anyTrait } from './staff';
import { PREFS } from '../data/prefectures';
import { MIDDLE_SUFFIX } from '../data/names';
import { SCHED } from './calendar';

export const RECRUIT_OPEN = { from: 2, to: SCHED.recruitDecision };

export function recruitSeason(): boolean {
  return G.week >= RECRUIT_OPEN.from && G.week < RECRUIT_OPEN.to;
}

function prospectQuality(): number {
  const x = randInt(0, 999) / 1000;
  if (x < 0.02) return randInt(62, 72);
  if (x < 0.1) return randInt(52, 62);
  if (x < 0.35) return randInt(42, 52);
  return randInt(20, 42);
}

/** 生成本年度的中学三年级候选人 */
export function genProspects(): string[] {
  const news: string[] = [];
  const me = mySchool();
  const pref = PREFS[me.prefId];
  // 清理旧的未入学者
  for (const id of G.prospects) {
    const p = G.players[id];
    if (p && p.grade === 0) delete G.players[id];
  }
  G.prospects = [];
  const local = schoolsInPref(me.prefId);
  const n = Math.round(local.length * 2) + 10;
  for (let i = 0; i < n; i++) {
    const national = i >= n - 10;
    const q = prospectQuality();
    const monster = q >= 64 && chance(0.35);
    const p = generatePlayer({ quality: q, grade: 0, enrollYear: G.year + 1, monster });
    const homePref = national ? pick(PREFS.filter((x) => x.id !== me.prefId)).id : me.prefId;
    p.homePref = homePref;
    p.middle = `${pick(PREFS[homePref].cities)}${pick(MIDDLE_SUFFIX)}`;
    p.fame = clamp(q - 38 + gauss(0, 8) + (monster ? 25 : 0), 0, 100);
    p.scout = p.fame > 25 ? 1 : 0;
    p.interest = {};
    p.offers = [];
    // 竞争学校
    const pool = national
      ? Object.values(G.schools).filter((s) => s.prestige >= 70 && s.id !== me.id)
      : local.filter((s) => s.id !== me.id && entryQ(s.prestige) >= q - 16);
    const nr = Math.min(pool.length, q >= 50 ? randInt(2, 3) : randInt(1, 2));
    const chosen = new Set<number>();
    for (let k = 0; k < nr; k++) {
      const s = weightedPick(pool, (x) => (chosen.has(x.id) ? 0 : Math.pow(x.prestige, 1.5)));
      if (!s || chosen.has(s.id)) continue;
      chosen.add(s.id);
      p.interest[s.id] = clamp(10 + s.prestige * 0.25 + gauss(0, 8), 0, 60);
    }
    p.interest[me.id] = clamp(attract(p) * 0.35 + gauss(0, 6), 0, 50);
    G.players[p.id] = p;
    G.prospects.push(p.id);
    if (monster) news.push(`【传闻】${PREFS[homePref].name}出现了被称为"怪物"的中学生——${p.fam}${p.given}（${p.middle}）！`);
  }
  return news;
}

/** 本校对某中学生的吸引力 0..100 */
export function attract(p: Player): number {
  const me = mySchool();
  let a = me.prestige * 0.45 + G.manager.reputation * 0.2;
  const recent = G.year - me.lastKoshien;
  if (recent <= 1) a += 12;
  else if (recent <= 3) a += 6;
  const facAvg = Object.values(G.club.facilities).reduce((x, y) => x + y, 0) / 8;
  a += facAvg * 4;
  a += playingTimeFactor(p) * 12;
  if (p.homePref !== me.prefId && !G.club.facilities.dorm) a -= 35;
  const q = overall(p);
  const gap = q - (entryQ(me.prestige) + 6);
  if (gap > 0) a -= gap * 1.2;
  return clamp(a, 0, 100);
}

/** 该位置的竞争程度：本队同位置的低年级强者越少越有吸引力 */
export function playingTimeFactor(p: Player): number {
  const mates = myPlayers().filter((x) => x.pos === p.pos && x.grade <= 2 && !x.retired);
  const better = mates.filter((x) => overall(x) >= overall(p) - 5).length;
  return clamp(1 - better * 0.35, -0.5, 1);
}

export function rivals(p: Player): { school: School; v: number }[] {
  const me = G.club.schoolId;
  return Object.entries(p.interest ?? {})
    .filter(([id]) => Number(id) !== me)
    .map(([id, v]) => ({ school: G.schools[Number(id)], v }))
    .filter((x) => x.school)
    .sort((a, b) => b.v - a.v);
}

export function myInterest(p: Player): number {
  return p.interest?.[G.club.schoolId] ?? 0;
}

function bump(p: Player, v: number): void {
  if (!p.interest) p.interest = {};
  const id = G.club.schoolId;
  p.interest[id] = clamp((p.interest[id] ?? 0) + v, 0, 100);
}

// ---------- 情报迷雾 ----------
export function fogNoise(p: Player, key: string): number {
  const h = hash32(p.id, key.length * 131 + key.charCodeAt(0) * 7 + (key.charCodeAt(1) || 0));
  return (h / 4294967295) * 2 - 1;
}

export function shownAttr(p: Player, k: AttrKey): number | null {
  const lv = p.scout ?? 0;
  if (lv <= 0) return null;
  const err = (5 - lv) * 4.5 * (1 - roleSkill('scout') / 250);
  const v = p.a[k] + fogNoise(p, k) * err;
  return k === 'velocity' ? Math.round(v) : clamp(Math.round(v), 1, 99);
}

export function shownOverall(p: Player): number | null {
  const lv = p.scout ?? 0;
  if (lv <= 0) return null;
  return clamp(Math.round(overall(p) + fogNoise(p, 'ov') * (5 - lv) * 3.5), 1, 99);
}

export function shownPot(p: Player): number | null {
  const lv = p.scout ?? 0;
  const insight = G.manager.skills.insight;
  if (lv < 3 && insight < 70) return null;
  const err = Math.max(0, (5 - lv) * 8 - insight / 10);
  return stars(p.pot + fogNoise(p, 'pot') * err);
}

// ---------- 招募行动 ----------
export const ACTION_COST = { scout: 2, invite: 6, visit: 0, scholar: 0 };

export function scoutVisit(p: Player): string {
  addMoney(-ACTION_COST.scout, 'recruit', `视察 ${p.fam}${p.given}`);
  p.scout = Math.min(5, (p.scout ?? 0) + 1 + (roleSkill('scout') > 60 ? 1 : 0));
  bump(p, 2);
  return `视察了${p.middle}的${p.fam}${p.given}，情报等级提升至 ${p.scout}。`;
}

export function inviteVisit(p: Player): string {
  addMoney(-ACTION_COST.invite, 'recruit', `邀请 ${p.fam}${p.given} 参观`);
  const facAvg = Object.values(G.club.facilities).reduce((x, y) => x + y, 0) / 8;
  const v = 6 + facAvg * 2 + (G.club.chemistry - 50) / 10 + randInt(0, 4);
  bump(p, v);
  p.scout = Math.max(p.scout ?? 0, 2);
  return `${p.fam}${p.given}参观了练习，意向 +${Math.round(v)}。`;
}

export function homeVisit(p: Player): string | null {
  if (G.manager.ap < 1) return '行动力不足';
  G.manager.ap -= 1;
  const v = (8 + G.manager.skills.recruiting / 8 + randInt(0, 5)) * (p.pers === 'shy' ? 1.2 : 1);
  bump(p, v);
  p.scout = Math.min(5, Math.max(p.scout ?? 0, 2) + 1);
  return `监督亲自家访${p.fam}${p.given}，与家长相谈甚欢。意向 +${Math.round(v)}。`;
}

export function scholarshipsOffered(): number {
  return G.prospects.filter((id) => G.players[id]?.offers?.includes(-1)).length;
}

export function offerScholarship(p: Player): string | null {
  if (mySchool().type === 'public') return '公立学校不能提供特待生名额';
  if (p.offers?.includes(-1)) return '已经提出过特待生邀请';
  if (scholarshipsOffered() >= G.club.scholarshipSlots) return `今年的特待生名额（${G.club.scholarshipSlots}）已用完`;
  p.offers = [...(p.offers ?? []), -1];
  bump(p, 22);
  return null;
}

/** 每周：AI 学校争夺、本校被动吸引、球探自动视察 */
export function weeklyRecruiting(): string[] {
  const out: string[] = [];
  if (!recruitSeason()) return out;
  const me = G.club.schoolId;
  for (const id of G.prospects) {
    const p = G.players[id];
    if (!p?.interest) continue;
    for (const [sid, v] of Object.entries(p.interest)) {
      const s = G.schools[Number(sid)];
      if (!s || s.id === me) continue;
      p.interest[s.id] = clamp(v + (0.5 + s.prestige / 60) * 0.6 + randInt(0, 1), 0, 100);
    }
    const a = attract(p);
    p.interest[me] = clamp((p.interest[me] ?? 0) + (a - (p.interest[me] ?? 0)) / 60, 0, 100);
  }
  // 球探自动视察
  const sk = roleSkill('scout');
  if (sk > 0) {
    const n = 1 + Math.floor(sk / 35) + (anyTrait('network') ? 1 : 0);
    const targets = sortBy(
      G.prospects.map((id) => G.players[id]).filter((p) => p && (p.scout ?? 0) < 3),
      (p) => p.fame ?? 0,
    ).slice(0, n);
    for (const p of targets) {
      p.scout = Math.min(5, (p.scout ?? 0) + 1);
      out.push(`球探报告：${p.middle}的${p.fam}${p.given}（${p.pos === 'P' ? '投手' : '野手'}）情报更新。`);
    }
  }
  return out;
}

/** 招募决定（2 月） */
export function decideRecruits(): { mine: Player[]; news: string[] } {
  const me = G.club.schoolId;
  const mine: Player[] = [];
  const news: string[] = [];
  const cap: Record<number, number> = {};
  const ps = G.prospects.map((id) => G.players[id]).filter(Boolean);
  ps.sort((a, b) => overall(b) - overall(a));
  for (const p of ps) {
    const entries = Object.entries(p.interest ?? {}).map(([id, v]) => ({ id: Number(id), v: v + gauss(0, 4) }));
    entries.sort((a, b) => b.v - a.v);
    let placed = false;
    for (const e of entries) {
      const s = G.schools[e.id];
      if (!s) continue;
      const limit = e.id === me ? 99 : 2 + Math.round(s.prestige / 18);
      if ((cap[e.id] ?? 0) >= limit) continue;
      if (e.v < (e.id === me ? 42 : 30)) continue;
      p.committed = e.id;
      cap[e.id] = (cap[e.id] ?? 0) + 1;
      placed = true;
      if (e.id === me) mine.push(p);
      else if (overall(p) >= 52) news.push(`${p.middle}的${p.fam}${p.given}决定进入${s.name}。`);
      break;
    }
    if (!placed) p.committed = -1;
  }
  return { mine, news };
}

/** 新年度入学（4 月） */
export function enrollAll(): { mine: Player[]; walkons: Player[]; counts: Record<number, number> } {
  const me = G.club.schoolId;
  const mine: Player[] = [];
  const counts: Record<number, number> = {};
  const bySchool: Record<number, Player[]> = {};
  for (const id of G.prospects) {
    const p = G.players[id];
    if (!p) continue;
    const sid = p.committed ?? -1;
    const s = sid >= 0 ? G.schools[sid] : null;
    if (s && (s.roster || s.id === me)) {
      (bySchool[sid] ||= []).push(p);
    } else {
      delete G.players[id];
    }
  }
  for (const [sid, list] of Object.entries(bySchool)) {
    const s = G.schools[Number(sid)];
    for (const p of list) {
      p.schoolId = s.id;
      p.grade = 1;
      p.joined = p.offers?.includes(-1) && s.id === me ? 'scholar' : 'recruit';
      p.scholarship = p.joined === 'scholar';
      delete p.interest;
      s.roster = [...(s.roster ?? []), p.id];
      counts[s.id] = (counts[s.id] ?? 0) + 1;
      if (s.id === me) mine.push(p);
    }
  }
  G.prospects = [];
  const walkons = genWalkons();
  return { mine, walkons, counts };
}

export function committedTo(sid: number): Player[] {
  return Object.values(G.players).filter((p) => p.grade === 0 && p.committed === sid);
}

/** 一般入部 */
function genWalkons(): Player[] {
  const s = mySchool();
  const n = clamp(Math.round(3 + G.club.fans / 5000 + s.prestige / 18 + randInt(-1, 3)), 2, 14);
  const out: Player[] = [];
  for (let i = 0; i < n; i++) {
    const gem = chance(0.07);
    const p = generatePlayer({ quality: entryQ(s.prestige) - 8 + gauss(0, 7), grade: 1, enrollYear: G.year, schoolId: s.id, potBias: gem ? 35 : 0 });
    p.joined = 'walkon';
    out.push(p);
  }
  let kept = out;
  if (G.club.walkonPolicy === 'select') {
    kept = out.sort((a, b) => overall(b) + b.pot * 0.3 - (overall(a) + a.pot * 0.3)).slice(0, Math.max(2, Math.ceil(n / 2)));
  }
  for (const p of kept) {
    G.players[p.id] = p;
    s.roster = [...(s.roster ?? []), p.id];
  }
  return kept;
}

// ---------- 转学挖角 ----------
export function poachTargets(): Player[] {
  const me = mySchool();
  const out: Player[] = [];
  for (const s of schoolsInPref(me.prefId)) {
    if (s.id === me.id || !s.roster) continue;
    for (const p of rosterPlayers(s)) {
      if (p.grade === 1 || p.grade === 2) out.push(p);
    }
  }
  return sortBy(out, (p) => (isPitcher(p) ? pitcherOverall(p) : batterOffense(p))).slice(0, 30);
}

export function poachChance(p: Player): number {
  const from = G.schools[p.schoolId];
  const me = mySchool();
  const x = (me.prestige - from.prestige) / 25 + (G.manager.skills.recruiting - 50) / 40 - (p.morale - 50) / 25 + (G.manager.reputation - 40) / 60 - 1.2;
  return clamp(1 / (1 + Math.exp(-x)), 0.02, 0.8);
}

export function poachCost(p: Player): number {
  return Math.round(30 + overall(p) * 2);
}

/** 尝试挖角，返回结果文本 */
export function poachPlayer(p: Player): { ok: boolean; text: string } {
  const cost = poachCost(p);
  if (G.club.funds < cost) return { ok: false, text: '资金不足' };
  addMoney(-cost, 'recruit', `转学斡旋 ${p.fam}${p.given}`);
  G.club.scandal += 8;
  const from = G.schools[p.schoolId];
  from.rivalry = clamp(from.rivalry + 20, 0, 100);
  if (!chance(poachChance(p))) {
    return { ok: false, text: `${p.fam}${p.given}拒绝了转学邀请。${from.name}对你的行为相当不满。` };
  }
  from.roster = (from.roster ?? []).filter((id) => id !== p.id);
  const me = mySchool();
  p.schoolId = me.id;
  p.joined = 'transfer';
  p.ineligibleUntil = G.absWeek + 48;
  p.morale = 60;
  p.trust = 40;
  me.roster = [...(me.roster ?? []), p.id];
  return { ok: true, text: `${p.fam}${p.given}从${from.name}转学加入！根据规定，转学生一年内不能参加公式战。` };
}

export const ATTR_SHOW: readonly AttrKey[] = ALL_ATTRS;
