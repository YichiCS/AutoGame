// 经营：资金、设施、赞助
import type { FacilityId, MonthBook, SponsorDeal } from './types';
import { G, mySchool, myPlayers, nextId, addRep } from './state';
import { chance, gauss, pick, randInt } from './rng';
import { clamp } from './util';
import { calYear, monthOf } from './calendar';
import { FACILITY_DEFS, type FacKey } from './training';
import { payroll, roleSkill, anyTrait } from './staff';
import { SPONSOR_NAMES } from '../data/names';

export const INCOME_NAME: Record<string, string> = {
  budget: '学校拨款', ob: 'OB会捐款', booster: '后援会会费', sponsor: '赞助收入', koshien: '甲子园募款', prize: '出场费/奖金', personal: '监督自掏腰包', other: '其他收入',
};
export const EXPENSE_NAME: Record<string, string> = {
  salary: '教练薪水', equip: '用具费', travel: '远征费', meal: '宿舍伙食', facility: '设施建设', upkeep: '设施维护', scholarship: '特待生奖学金',
  medical: '医疗费', recruit: '招募活动', camp: '合宿费', staff: '签约/违约金', fine: '罚款/处分', other: '其他支出',
};

function bookKey(): string {
  return `${calYear(G.year, G.week)}年${monthOf(G.week)}月`;
}

export function curBook(): MonthBook {
  const key = bookKey();
  let b = G.club.books[G.club.books.length - 1];
  if (!b || b.label !== key) {
    b = { label: key, income: {}, expense: {} };
    G.club.books.push(b);
    if (G.club.books.length > 24) G.club.books.shift();
  }
  return b;
}

export function addMoney(amount: number, cat: string, note: string): void {
  amount = Math.round(amount);
  if (!amount) return;
  G.club.funds += amount;
  G.club.ledger.push({ absWeek: G.absWeek, amount, cat, note });
  if (G.club.ledger.length > 300) G.club.ledger.shift();
  const b = curBook();
  if (amount > 0) b.income[cat] = (b.income[cat] ?? 0) + amount;
  else b.expense[cat] = (b.expense[cat] ?? 0) - amount;
}

export function yearlyBudget(): number {
  const s = mySchool();
  const base = s.type === 'public' ? 250 + s.prestige * 4 : 600 + s.prestige * 22;
  return Math.round(base * (0.7 + G.club.board / 170));
}

export function obMonthly(): number {
  const s = mySchool();
  const pros = G.records.alumni.filter((a) => a.pro && a.schoolName === s.name).length;
  return Math.round((s.prestige * 0.35 + G.club.ob / 3 + pros * 4) * (s.type === 'private' ? 1.4 : 1) * (0.8 + (roleSkill('director') || 30) / 150));
}

export function boosterMonthly(): number {
  return Math.round(G.club.fans / 600);
}

export function dormCapacity(): number {
  return [0, 20, 40, 70][G.club.facilities.dorm] ?? 0;
}

export function upgradeCost(id: FacilityId): number {
  const lv = G.club.facilities[id];
  return Math.round(FACILITY_DEFS[id as FacKey].base * Math.pow(lv + 1, 1.6));
}

export function upkeepMonthly(): number {
  return Object.values(G.club.facilities).reduce((a, b) => a + b, 0) * 2 + G.club.facilities.dorm * 6;
}

export function startUpgrade(id: FacilityId): string | null {
  const def = FACILITY_DEFS[id as FacKey];
  if (G.club.construction) return '已有设施正在施工中';
  if (G.club.facilities[id] >= def.max) return '已达最高等级';
  const cost = upgradeCost(id);
  if (G.club.funds < cost) return '资金不足';
  addMoney(-cost, 'facility', `${def.name}扩建`);
  G.club.construction = { id, weeksLeft: 4 + G.club.facilities[id] * 2 };
  return null;
}

export function weeklyEquipCost(): number {
  const n = myPlayers().filter((p) => !p.retired).length;
  const disc = G.club.sponsors.reduce((a, d) => Math.max(a, d.equipDiscount), 0);
  return n * 0.12 * (1 + G.club.equipment * 0.7) * (1 - disc);
}

export function weeklyMealCost(): number {
  const n = Math.min(dormCapacity(), myPlayers().filter((p) => !p.retired).length);
  return n * 0.5 * (1 + G.club.meal * 0.6);
}

/** 每周结算，返回本周净收支 */
export function weeklyFinance(lines: { text: string; tone?: 'good' | 'bad' | 'info' }[]): number {
  const before = G.club.funds;
  addMoney(-weeklyEquipCost(), 'equip', '用具消耗');
  if (G.club.facilities.dorm) addMoney(-weeklyMealCost(), 'meal', '宿舍伙食');
  const injured = myPlayers().filter((p) => p.injury).length;
  if (injured) addMoney(-injured * 1.2, 'medical', '伤病治疗');
  if (G.week % 4 === 0) {
    // 月度结算
    addMoney(yearlyBudget() / 12, 'budget', '学校月度拨款');
    const ob = obMonthly();
    addMoney(ob * (0.8 + 0.4 * (G.club.ob / 100)), 'ob', 'OB会定期捐款');
    addMoney(boosterMonthly(), 'booster', '后援会会费');
    const pay = payroll();
    const dirSave = (roleSkill('director') || 0) / 1000;
    if (pay) addMoney(-(pay / 12) * (1 - dirSave), 'salary', '教练薪水');
    addMoney(-upkeepMonthly(), 'upkeep', '设施维护');
    const sch = myPlayers().filter((p) => p.scholarship && !p.retired).length;
    if (sch) addMoney(-sch * 4, 'scholarship', '特待生学费减免');
    for (const d of G.club.sponsors) if (d.monthly) addMoney(d.monthly, 'sponsor', d.name);
    // 监督个人薪水
    G.manager.money += G.manager.salary / 12;
    for (const d of G.club.sponsors) if (d.kind === 'endorse') G.manager.money += d.lump / 12;
  }
  // 施工
  if (G.club.construction) {
    G.club.construction.weeksLeft--;
    if (G.club.construction.weeksLeft <= 0) {
      const id = G.club.construction.id;
      G.club.facilities[id]++;
      lines.push({ text: `${FACILITY_DEFS[id as FacKey].name}扩建完成！（Lv${G.club.facilities[id]}）`, tone: 'good' });
      G.club.construction = null;
    }
  }
  if (G.club.funds < 0) {
    G.club.board = clamp(G.club.board - 1.5, 0, 100);
    if (G.week % 4 === 0) lines.push({ text: '部费出现赤字！校方满意度下降。请削减开支或寻找赞助。', tone: 'bad' });
  }
  return G.club.funds - before;
}

// ---------- 赞助 ----------
export const SPONSOR_KIND_NAME: Record<SponsorDeal['kind'], string> = {
  equipment: '球具合约', local: '地方企业', media: '媒体合作', endorse: '监督代言', drink: '饮料冠名', gray: '灰色交易',
};

export function genSponsorOffer(): SponsorDeal | null {
  const fans = G.club.fans;
  const rep = G.manager.reputation;
  const pres = mySchool().prestige;
  const power = fans / 1000 + rep / 2 + pres / 3;
  const kinds: SponsorDeal['kind'][] = ['local', 'local', 'equipment'];
  if (power > 25) kinds.push('media', 'drink');
  if (rep > 30) kinds.push('endorse');
  if (power > 35 && chance(0.25)) kinds.push('gray');
  const kind = pick(kinds);
  const k = 0.7 + power / 60 + (anyTrait('network') ? 0.2 : 0);
  const d: SponsorDeal = {
    id: nextId(), name: pick(SPONSOR_NAMES[kind] as readonly string[]), kind, monthly: 0, lump: 0, winBonus: 0, koshienBonus: 0,
    weeksLeft: 48, apPerMonth: 0, fatigue: 0, popBoost: 0, equipDiscount: 0, risk: 0, desc: '',
  };
  switch (kind) {
    case 'equipment':
      d.monthly = Math.round(randInt(5, 15) * k);
      d.equipDiscount = Math.min(0.7, 0.25 + power / 200);
      d.desc = `提供球具（用具费 -${Math.round(d.equipDiscount * 100)}%），并支付少量赞助金。`;
      break;
    case 'local':
      d.monthly = Math.round(randInt(5, 18) * k);
      d.apPerMonth = 1;
      d.weeksLeft = 24 + randInt(0, 24);
      d.winBonus = Math.round(randInt(1, 4) * k);
      d.desc = `地方企业赞助。每月需要监督出席 1 次活动（行动力 -1），公式战每胜奖励 ${d.winBonus} 万。`;
      break;
    case 'media':
      d.lump = Math.round(randInt(80, 260) * k);
      d.fatigue = 3;
      d.popBoost = Math.round(2000 * k);
      d.weeksLeft = 8;
      d.risk = 0.01;
      d.desc = `电视台跟拍纪录片 8 周：一次性 ${d.lump} 万，人气大涨，但球员每周额外疲劳。`;
      break;
    case 'drink':
      d.monthly = Math.round(randInt(12, 30) * k);
      d.koshienBonus = Math.round(randInt(150, 400) * k);
      d.risk = 0.005;
      d.desc = `饮料品牌冠名后援会活动。甲子园出场奖励 ${d.koshienBonus} 万。若发生丑闻会被解约并索赔。`;
      break;
    case 'endorse':
      d.lump = Math.round(randInt(40, 120) * k); // 监督年收入
      d.apPerMonth = 2;
      d.desc = `邀请监督本人拍摄广告：监督个人年收入 +${d.lump} 万，名声小幅提升；每月行动力 -2。`;
      break;
    case 'gray':
      d.lump = Math.round(randInt(500, 1200) * k);
      d.risk = 0.04;
      d.weeksLeft = 24;
      d.desc = `对方提出巨额"赞助"，但要求球员出镜宣传——这违反学生棒球宪章！每周都有被曝光的风险，一旦曝光将受到严重处分。`;
      break;
  }
  return d;
}

export function acceptSponsor(d: SponsorDeal): void {
  G.club.sponsorOffers = G.club.sponsorOffers.filter((x) => x.id !== d.id);
  G.club.sponsors.push(d);
  if (d.lump && d.kind !== 'endorse') addMoney(d.lump, 'sponsor', `${d.name}签约金`);
  if (d.popBoost) G.club.fans += d.popBoost;
  if (d.kind === 'endorse') addRep(2);
  if (d.kind === 'gray') G.club.scandal += 10;
}

export function rejectSponsor(d: SponsorDeal): void {
  G.club.sponsorOffers = G.club.sponsorOffers.filter((x) => x.id !== d.id);
}

/** 赞助的每周处理；返回需要触发的丑闻事件 id（若有） */
export function sponsorsWeekly(lines: { text: string; tone?: 'good' | 'bad' | 'info' }[]): string | null {
  let scandal: string | null = null;
  for (const d of G.club.sponsors) {
    d.weeksLeft--;
    if (d.fatigue) for (const p of myPlayers()) p.fatigue = clamp(p.fatigue + d.fatigue, 0, 100);
    if (d.kind === 'gray' && chance(d.risk)) scandal = 'grayExposed';
  }
  const ended = G.club.sponsors.filter((d) => d.weeksLeft <= 0);
  for (const d of ended) lines.push({ text: `与${d.name}的${SPONSOR_KIND_NAME[d.kind]}合约到期。`, tone: 'info' });
  G.club.sponsors = G.club.sponsors.filter((d) => d.weeksLeft > 0);
  // 新报价
  const rate = 0.12 + G.club.fans / 150000 + G.manager.reputation / 800;
  if (G.club.sponsorOffers.length < 4 && chance(rate)) {
    const o = genSponsorOffer();
    if (o) {
      G.club.sponsorOffers.push(o);
      lines.push({ text: `${o.name}发来了${SPONSOR_KIND_NAME[o.kind]}的提案。（经营 → 赞助）`, tone: 'info' });
    }
  }
  return scandal;
}

/** 行动力占用 */
export function sponsorAP(): number {
  return G.club.sponsors.reduce((a, d) => a + d.apPerMonth, 0) / 4;
}

export function onOfficialWin(): void {
  for (const d of G.club.sponsors) if (d.winBonus) addMoney(d.winBonus, 'sponsor', `${d.name}胜利奖金`);
}

export function koshienFundraise(): number {
  const s = mySchool();
  const amt = (200 + G.club.fans / 40 + s.prestige * 12 + G.club.ob * 6) * (0.85 + Math.abs(gauss(0, 0.15)));
  return Math.round(amt * (s.type === 'private' ? 1.2 : 1.35));
}

export function koshienTravel(games: number): number {
  return Math.round(500 + games * 160 + (G.club.fans / 200));
}

export function regionTravel(): number {
  return 60 + randInt(0, 40);
}
