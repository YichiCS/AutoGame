// 教练团队
import type { Staff, StaffRole, StaffTrait } from './types';
import { G, nextId, hasG } from './state';
import { chance, gauss, pick, randInt } from './rng';
import { clamp } from './util';
import { FAMILY_NAMES, GIVEN_NAMES, STAFF_BG } from '../data/names';

export const ROLE_NAME: Record<StaffRole, string> = {
  pitching: '投手教练', batting: '打击教练', fielding: '守备走垒教练', trainer: '体能训练师', scout: '球探', analyst: '数据分析员', director: '部长',
};

export const ROLE_DESC: Record<StaffRole, string> = {
  pitching: '提升投手的训练效率，指导新变化球',
  batting: '提升打者的训练效率',
  fielding: '提升守备、跑垒训练效率与战术熟练度',
  trainer: '降低受伤概率，加快疲劳恢复与伤愈',
  scout: '每周自动视察中学生，提高情报准确度',
  analyst: '比赛前提供对手情报，提高战术成功率',
  director: '管理部务：降低开支、减少丑闻、改善与 OB 会的关系',
};

export const STAFF_TRAIT_NAME: Record<StaffTrait, string> = {
  strict: '严格', gentle: '温和', theory: '理论派', veteran: '老练', young: '年轻有为', network: '人脉广', medic: '医疗背景',
};
export const STAFF_TRAIT_DESC: Record<StaffTrait, string> = {
  strict: '训练效率+10%，但球员干劲容易下降',
  gentle: '球员干劲更稳定，训练效率-5%',
  theory: '技术类经验+10%',
  veteran: '精神类经验+10%，比赛中指挥更沉稳',
  young: '能力每年都会成长',
  network: '更容易发掘中学生、获得赞助',
  medic: '伤病恢复更快',
};

export const ROLES: readonly StaffRole[] = ['pitching', 'batting', 'fielding', 'trainer', 'scout', 'analyst', 'director'];

export function genStaff(role?: StaffRole, quality = 50): Staff {
  const r = role ?? pick(ROLES);
  const skill = Math.round(clamp(gauss(quality, 12), 15, 95));
  const traits: StaffTrait[] = ['strict', 'gentle', 'theory', 'veteran', 'young', 'network', 'medic'];
  const st: Staff = {
    id: nextId(),
    name: `${pick(FAMILY_NAMES)} ${pick(GIVEN_NAMES)}`,
    age: randInt(26, 66),
    role: r,
    skill,
    salary: Math.max(60, Math.round((40 + skill * 4 + gauss(0, 25)) / 10) * 10),
    years: randInt(1, 3),
    loyalty: randInt(35, 80),
    schoolId: -1,
    bg: pick(STAFF_BG),
    trait: chance(0.45) ? pick(traits) : null,
  };
  if (st.trait === 'young') st.age = randInt(26, 34);
  if (st.trait === 'veteran') st.age = randInt(50, 68);
  return st;
}

export function myStaff(): Staff[] {
  if (!hasG()) return [];
  const s = G.schools[G.club.schoolId];
  return s.staff.map((id) => G.staff[id]).filter(Boolean);
}

/** 某职能的有效能力（同职能多人时取最好者 + 其余的 30%） */
export function roleSkill(role: StaffRole): number {
  const xs = myStaff().filter((s) => s.role === role).map((s) => s.skill).sort((a, b) => b - a);
  if (!xs.length) return 0;
  return Math.min(99, xs[0] + xs.slice(1).reduce((a, b) => a + b * 0.3, 0) * 0.3);
}

export function hasTrait(role: StaffRole, t: StaffTrait): boolean {
  return myStaff().some((s) => s.role === role && s.trait === t);
}

export function anyTrait(t: StaffTrait): boolean {
  return myStaff().some((s) => s.trait === t);
}

/** 教练对训练的倍率 */
export function coachMult(role: StaffRole): number {
  const s = roleSkill(role);
  return s ? 1 + (s - 35) / 170 : 0.92;
}

export function payroll(): number {
  return myStaff().reduce((a, s) => a + s.salary, 0);
}

export const MAX_STAFF = 7;

/** 市场上的自由教练维持一定数量 */
export function refreshMarket(): void {
  G.freeStaff = G.freeStaff.filter((id) => G.staff[id] && G.staff[id].schoolId === -1);
  // 部分人离开市场
  G.freeStaff = G.freeStaff.filter((id) => {
    if (chance(0.08)) {
      delete G.staff[id];
      return false;
    }
    return true;
  });
  while (G.freeStaff.length < 12) {
    const st = genStaff(undefined, gauss(48, 12));
    G.staff[st.id] = st;
    G.freeStaff.push(st.id);
  }
}

export function signingCost(st: Staff): number {
  return Math.round(st.salary * 0.15);
}

/** 招聘自由教练 */
export function hireStaff(st: Staff, salary: number, years: number): string | null {
  const me = G.schools[G.club.schoolId];
  if (me.staff.length >= MAX_STAFF) return '教练团队已满（最多 7 人）';
  const accept = salary >= st.salary * 0.95 || chance(clamp((salary / st.salary - 0.8) * 3 + G.manager.reputation / 200, 0, 1));
  if (!accept) return `${st.name}拒绝了你的报价（期望年薪约 ${st.salary} 万円）`;
  st.salary = salary;
  st.years = years;
  st.schoolId = me.id;
  st.loyalty = clamp(st.loyalty + 10, 0, 100);
  me.staff.push(st.id);
  G.freeStaff = G.freeStaff.filter((id) => id !== st.id);
  return null;
}

/** 解雇：需支付剩余合同 30% 的违约金 */
export function fireCost(st: Staff): number {
  return Math.round(st.salary * Math.max(1, st.years) * 0.3);
}

export function fireStaff(st: Staff): number {
  const me = G.schools[G.club.schoolId];
  me.staff = me.staff.filter((id) => id !== st.id);
  st.schoolId = -1;
  st.loyalty = 20;
  G.freeStaff.push(st.id);
  return fireCost(st);
}

/** 挖角成功率 */
export function poachChance(st: Staff, salary: number): number {
  const from = G.schools[st.schoolId];
  const me = G.schools[G.club.schoolId];
  const ratio = salary / Math.max(50, st.salary);
  const x = (ratio - 1.2) * 4 + (me.prestige - from.prestige) / 35 + (G.manager.skills.negotiation - 50) / 60 - st.loyalty / 45 + G.manager.reputation / 120;
  return clamp(1 / (1 + Math.exp(-x)), 0.02, 0.95);
}

export function buyout(st: Staff): number {
  return Math.round(st.salary * 0.5);
}
