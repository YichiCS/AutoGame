// 部费与设施
import type { FacilityId, SchoolLite } from './types';
import { FACILITY_IDS } from './types';
import { G, log, milestone, mySchool, myPlayers } from './state';
import { yearIdx } from './calendar';

export interface FacilityDef {
  name: string;
  icon: string;
  desc: string;
  /** 每一级的效果说明 */
  effect: (lv: number) => string;
}

export const FACILITY_DEFS: Record<FacilityId, FacilityDef> = {
  field: { name: '球场', icon: '◆', desc: '整修草皮、加装照明，所有训练的基础', effect: (l) => `全部训练效率 +${l * 5}%${l >= 3 ? '，可以夜间练习' : ''}` },
  cage: { name: '打击笼', icon: '▤', desc: '多台发球机的打击练习场', effect: (l) => `打击训练（技术经验）+${l * 10}%` },
  bullpen: { name: '投球练习场', icon: '▲', desc: '带测速仪的牛棚', effect: (l) => `投手训练 +${l * 8}%，学新球种快 ${l * 12}%` },
  weight: { name: '力量训练室', icon: '■', desc: '杠铃、器械和营养指导', effect: (l) => `力量经验 +${l * 10}%，体质成长更快` },
  indoor: { name: '室内练习场', icon: '▣', desc: '下雨、下雪也能照常练习', effect: (l) => (l ? `雨天、冬季训练不打折（冬训效率 +${l * 4}%）` : '雨天和冬天训练效率下降') },
  medical: { name: '医务室', icon: '✚', desc: '驻校训练师与康复器材', effect: (l) => `受伤率 -${l * 11}%，伤愈快 ${l * 10}%` },
  analysis: { name: '影像分析室', icon: '◎', desc: '录像分析对手和自己的动作', effect: (l) => `比赛指挥 +${l * 3}，精神经验 +${l * 5}%，看清潜力` },
  dorm: { name: '宿舍', icon: '⌂', desc: '集体生活与营养餐', effect: (l) => `疲劳恢复 +${l * 8}%，招生人数与质量提升` },
};

export const MAX_LV = 5;
const COST = [0, 60, 150, 320, 600, 1000];
const DAYS = [0, 15, 30, 45, 60, 90];

export function upgradeCost(id: FacilityId): number {
  const lv = G.facilities[id];
  if (lv >= MAX_LV) return Infinity;
  const mult = id === 'dorm' ? 1.6 : id === 'indoor' ? 1.4 : id === 'field' ? 1.2 : 1;
  return Math.round(COST[lv + 1] * mult);
}

export function upgradeDays(id: FacilityId): number {
  return DAYS[Math.min(MAX_LV, G.facilities[id] + 1)];
}

export function canUpgrade(id: FacilityId): string | null {
  if (G.facilities[id] >= MAX_LV) return '已经是最高等级';
  if (G.building) return `${FACILITY_DEFS[G.building.id].name}正在施工`;
  if (G.funds < upgradeCost(id)) return '部费不够';
  return null;
}

export function startUpgrade(id: FacilityId): boolean {
  if (canUpgrade(id)) return false;
  const cost = upgradeCost(id);
  spend(cost, 'build');
  const days = upgradeDays(id);
  G.building = { id, left: days, total: days };
  log(`开始${G.facilities[id] ? '升级' : '修建'}${FACILITY_DEFS[id].name}（${cost} 万円，约 ${days} 天）`, 'info');
  return true;
}

export function buildingDaily(): void {
  const b = G.building;
  if (!b) return;
  b.left--;
  if (b.left > 0) return;
  G.facilities[b.id] = Math.min(MAX_LV, G.facilities[b.id] + 1);
  G.building = null;
  const lv = G.facilities[b.id];
  log(`${FACILITY_DEFS[b.id].name}${lv === 1 ? '落成' : `升级到 ${lv} 级`}！${FACILITY_DEFS[b.id].effect(lv)}`, 'good');
  if (lv === MAX_LV) milestone(`${FACILITY_DEFS[b.id].name}达到最高等级`);
}

// ---------- 账本 ----------
export const IN_CAT: Record<string, string> = { school: '学校拨款', ob: 'OB 会捐款', fans: '后援会', koshien: '甲子园募款', prize: '奖励与奖金', media: '媒体与赞助', other: '其他收入' };
export const OUT_CAT: Record<string, string> = { gear: '用具与器材', food: '伙食与营养', travel: '远征与合宿', build: '设施建设', medical: '医疗', upkeep: '设施维护', scholar: '特待生奖学金', other: '其他支出' };

function book(): { in: Record<string, number>; out: Record<string, number> } {
  const y = yearIdx(G.day);
  let b = G.books.find((x) => x.year === y);
  if (!b) {
    b = { year: y, in: {}, out: {} };
    G.books.push(b);
    if (G.books.length > 6) G.books.shift();
  }
  return b;
}

export function earn(v: number, cat: string): void {
  if (v <= 0) return;
  G.funds += v;
  const b = book();
  b.in[cat] = (b.in[cat] ?? 0) + v;
}

export function spend(v: number, cat: string): void {
  if (v <= 0) return;
  G.funds -= v;
  const b = book();
  b.out[cat] = (b.out[cat] ?? 0) + v;
}

/** 学校每月的拨款（万円） */
export function schoolBudget(s: SchoolLite = mySchool()): number {
  return s.type === 'private' ? 42 + s.prestige * 0.55 : 30 + s.prestige * 0.35;
}

/** 每月 1 日：收支 */
export function monthlyMoney(): { income: number; expense: number } {
  const s = mySchool();
  const c = G.club;
  const neg = G.mgr.skills.negotiation;
  const school = Math.round(schoolBudget() * (0.9 + neg / 500));
  const ob = Math.round((c.ob / 100) * (10 + G.mgr.rep * 0.4) * (0.9 + neg / 400));
  const fans = Math.round(c.fans / 600);
  earn(school, 'school');
  earn(ob, 'ob');
  earn(fans, 'fans');
  const n = myPlayers().length;
  const gear = Math.round(3 + n * 0.12);
  const food = Math.round(2 + n * 0.1 + G.facilities.dorm * 3);
  const upkeep = Math.round(FACILITY_IDS.reduce((a, id) => a + G.facilities[id], 0) * 1.0);
  spend(gear, 'gear');
  spend(food, 'food');
  spend(upkeep, 'upkeep');
  return { income: school + ob + fans, expense: gear + food + upkeep };
}

/** 预计每月净收入（显示用） */
export function monthlyNet(): number {
  const c = G.club;
  const neg = G.mgr.skills.negotiation;
  const inc = schoolBudget() * (0.9 + neg / 500) + (c.ob / 100) * (10 + G.mgr.rep * 0.4) * (0.9 + neg / 400) + c.fans / 600;
  const n = myPlayers().length;
  const out = 3 + n * 0.12 + 2 + n * 0.1 + G.facilities.dorm * 3 + FACILITY_IDS.reduce((a, id) => a + G.facilities[id], 0) * 1.0;
  return Math.round(inc - out);
}

/** 托管：部费宽裕又没在施工时，自动升级一项设施 */
const AUTO_ORDER: FacilityId[] = ['field', 'cage', 'bullpen', 'medical', 'weight', 'indoor', 'analysis', 'field', 'dorm'];
export function autoBuildPick(): FacilityId | null {
  if (G.building) return null;
  const reserve = monthlyNet() < 0 ? 300 : 150;
  let best: FacilityId | null = null;
  let bestScore = -Infinity;
  for (const id of AUTO_ORDER) {
    if (G.facilities[id] >= MAX_LV) continue;
    if (id === 'dorm' && mySchool().type === 'public' && G.facilities.dorm >= 2) continue;
    const cost = upgradeCost(id);
    if (G.funds - cost < reserve) continue;
    const score = -G.facilities[id] * 10 - cost / 100 - AUTO_ORDER.indexOf(id);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

export function moneyStr(v: number): string {
  const n = Math.round(v);
  const s = Math.abs(n) >= 10000 ? `${(n / 10000).toFixed(2)}亿` : `${n.toLocaleString('en-US')}万`;
  return `${s}円`;
}
