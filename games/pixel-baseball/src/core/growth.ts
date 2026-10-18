// 经验值 → 能力成长
import type { AttrKey, DevPlan, ExpKind, ExpPool, PitchType, Player } from './types';
import { ALL_ATTRS, EXP_KINDS } from './types';
import { ATTR_COST, attrLevel, has, isPitcher } from './attrs';
import { clamp } from './util';
import { TRAIT_BY_ID } from '../data/traits';
import { PITCH_DEFS } from '../data/pitches';

export const MAX_VEL = 163;
/** AI/补成长时每周获得的总经验（球队训练会在此基础上浮动） */
export const AI_WEEKLY_EXP = 8.5;

export function emptyExp(): ExpPool {
  return { str: 0, agi: 0, tech: 0, brk: 0, men: 0 };
}

function levelMult(v: number): number {
  return 1.6 + (v / 24) ** 2;
}

/** 提升 1 点所需经验 */
export function attrCost(p: Player, k: AttrKey): Partial<ExpPool> {
  const lv = attrLevel(p, k);
  let m = levelMult(lv);
  const cur = p.a[k];
  if (cur >= p.caps[k]) m *= 3;
  if (k === 'velocity') m *= 1.7;
  const out: Partial<ExpPool> = {};
  const base = ATTR_COST[k];
  for (const e in base) out[e as ExpKind] = Math.ceil((base[e as ExpKind] ?? 0) * m);
  return out;
}

export function attrMax(k: AttrKey): number {
  return k === 'velocity' ? MAX_VEL : 99;
}

export function canAfford(p: Player, cost: Partial<ExpPool>): boolean {
  for (const e in cost) if (p.exp[e as ExpKind] < (cost[e as ExpKind] ?? 0)) return false;
  return true;
}

function pay(p: Player, cost: Partial<ExpPool>): void {
  for (const e in cost) p.exp[e as ExpKind] -= cost[e as ExpKind] ?? 0;
}

export function costTotal(cost: Partial<ExpPool>): number {
  let s = 0;
  for (const e in cost) s += cost[e as ExpKind] ?? 0;
  return s;
}

export function raiseAttr(p: Player, k: AttrKey): boolean {
  if (p.a[k] >= attrMax(k)) return false;
  const c = attrCost(p, k);
  if (!canAfford(p, c)) return false;
  pay(p, c);
  p.a[k] = Math.min(attrMax(k), Math.floor(p.a[k]) + 1);
  if (k === 'power') updateTraj(p);
  return true;
}

export function updateTraj(p: Player): void {
  const want = p.a.power < 35 ? 1 : p.a.power < 55 ? 2 : p.a.power < 72 ? 3 : 4;
  if (want > p.traj) p.traj = Math.min(4, p.traj + 1);
}

export function maxPitchLv(p: Player): number {
  return clamp(3 + Math.round(p.pot / 25), 3, 7);
}

export function pitchCost(p: Player, idx: number): Partial<ExpPool> {
  const lv = p.pitches[idx].lv;
  const m = 6 + lv * lv * 4;
  const over = lv >= maxPitchLv(p) ? 3 : 1;
  return { brk: Math.ceil(1.15 * m * over), tech: Math.ceil(0.35 * m * over) };
}

export function raisePitch(p: Player, idx: number): boolean {
  const ps = p.pitches[idx];
  if (!ps || ps.lv >= 7) return false;
  const c = pitchCost(p, idx);
  if (!canAfford(p, c)) return false;
  pay(p, c);
  ps.lv += 1;
  return true;
}

/** 能掌握的变化球种数上限 */
export function maxPitchCount(p: Player): number {
  return clamp(2 + Math.floor(p.pot / 25) + (p.pers === 'genius' ? 1 : 0), 2, 6);
}

/** 学会某球种需要的变化经验 */
export function learnNeed(t: PitchType): number {
  return 40 + PITCH_DEFS[t].rarity * 30;
}

/** 投入变化经验学习新球种 */
export function progressLearning(p: Player, brk: number): PitchType | null {
  if (!p.learning) return null;
  p.learning.progress += brk;
  if (p.learning.progress >= learnNeed(p.learning.pitch)) {
    const t = p.learning.pitch;
    if (!p.pitches.some((x) => x.type === t)) p.pitches.push({ type: t, lv: 1 });
    p.learning = null;
    return t;
  }
  return null;
}

export function traitCost(p: Player, id: string): Partial<ExpPool> | null {
  const def = TRAIT_BY_ID[id];
  if (!def) return null;
  if (def.good) return def.cost ?? null;
  // 克服负面特性：精神为主
  return { men: 70, tech: 20 };
}

export function canLearnTrait(p: Player, id: string): boolean {
  const def = TRAIT_BY_ID[id];
  if (!def || !def.good || def.rare || !def.cost) return false;
  if (p.traits.includes(id)) return false;
  if (def.pitcherOnly && !isPitcher(p)) return false;
  if (def.req && !def.req(p)) return false;
  return true;
}

export function learnTrait(p: Player, id: string): boolean {
  const def = TRAIT_BY_ID[id];
  if (!def) return false;
  if (def.good) {
    if (!canLearnTrait(p, id)) return false;
    const c = def.cost!;
    if (!canAfford(p, c)) return false;
    pay(p, c);
    p.traits = p.traits.filter((t) => t !== def.opp);
    p.traits.push(id);
    return true;
  }
  // 克服负面
  if (!p.traits.includes(id)) return false;
  const c = traitCost(p, id)!;
  if (!canAfford(p, c)) return false;
  pay(p, c);
  p.traits = p.traits.filter((t) => t !== id);
  return true;
}

// ---------- 自动分配 ----------
type Weights = Partial<Record<AttrKey | 'pitch', number>>;

function planWeights(p: Player, plan: DevPlan): Weights {
  if (isPitcher(p)) {
    switch (plan) {
      case 'pit_velo': return { velocity: 1.7, stuff: 0.9, control: 0.5, stamina: 0.4, pitch: 0.4 };
      case 'pit_ctrl': return { control: 1.7, mental: 0.6, stuff: 0.5, stamina: 0.4, velocity: 0.4, pitch: 0.4 };
      case 'pit_brk': return { pitch: 1.7, stuff: 0.7, control: 0.6, velocity: 0.3, stamina: 0.3 };
      case 'pit_stam': return { stamina: 1.6, durability: 0.6, control: 0.6, velocity: 0.4, pitch: 0.4 };
      case 'balanced': return { velocity: 1, control: 1, stamina: 1, stuff: 1, pitch: 1, mental: 0.5, durability: 0.3 };
      default: return { velocity: 1.0, control: 1.15, stamina: 0.85, stuff: 0.8, pitch: 1.0, mental: 0.35, durability: 0.2, fielding: 0.1 };
    }
  }
  switch (plan) {
    case 'contact': return { contact: 1.7, eye: 0.8, bunt: 0.4, speed: 0.4, fielding: 0.4 };
    case 'power': return { power: 1.7, contact: 0.7, eye: 0.3, arm: 0.3, fielding: 0.3 };
    case 'speed': return { speed: 1.6, baserun: 0.9, fielding: 0.6, contact: 0.5, bunt: 0.3 };
    case 'defense': return { fielding: 1.5, catching: 1.0, arm: 1.0, speed: 0.4, contact: 0.3 };
    case 'balanced': return { contact: 1, power: 1, eye: 0.7, speed: 1, arm: 1, fielding: 1, catching: 0.8, bunt: 0.4, baserun: 0.5, mental: 0.4 };
    default: {
      const w: Weights = { contact: 1.0, power: 0.85, eye: 0.45, speed: 0.6, arm: 0.45, fielding: 0.7, catching: 0.45, bunt: 0.2, baserun: 0.3, mental: 0.3, durability: 0.15 };
      if (p.pos === 'C') Object.assign(w, { catching: 1.0, arm: 0.9, fielding: 0.6, speed: 0.2 });
      if (p.pos === 'SS' || p.pos === '2B') Object.assign(w, { fielding: 1.1, speed: 0.8, power: 0.55 });
      if (p.pos === 'CF') Object.assign(w, { speed: 1.0, fielding: 0.9 });
      if (p.pos === '1B' || p.pos === 'LF') Object.assign(w, { power: 1.15, fielding: 0.4, arm: 0.25 });
      if (p.pos === 'RF') Object.assign(w, { arm: 0.8, power: 1.0 });
      if (p.pos === '3B') Object.assign(w, { arm: 0.75, power: 1.0 });
      return w;
    }
  }
}

/** 按方针自动消耗经验，返回提升记录 */
export function autoSpend(p: Player, plan: DevPlan = p.plan, budget = 60): Partial<Record<AttrKey | 'pitch', number>> {
  const gained: Partial<Record<AttrKey | 'pitch', number>> = {};
  const w = planWeights(p, plan === 'auto' ? 'auto' : plan);
  for (let iter = 0; iter < budget; iter++) {
    let best: { key: AttrKey | 'pitch'; idx: number; score: number } | null = null;
    for (const key in w) {
      const wt = w[key as AttrKey | 'pitch'] ?? 0;
      if (wt <= 0) continue;
      if (key === 'pitch') {
        p.pitches.forEach((ps, idx) => {
          if (ps.lv >= 7) return;
          const c = pitchCost(p, idx);
          if (!canAfford(p, c)) return;
          const score = (wt * 9) / costTotal(c) / (1 + idx * 0.15);
          if (!best || score > best.score) best = { key: 'pitch', idx, score };
        });
        continue;
      }
      const k = key as AttrKey;
      if (p.a[k] >= attrMax(k)) continue;
      const c = attrCost(p, k);
      if (!canAfford(p, c)) continue;
      // 球速 1km/h 约相当于 2.2 点能力
      const value = k === 'velocity' ? 2.2 : 1;
      const score = (wt * value) / costTotal(c);
      if (!best || score > best.score) best = { key: k, idx: -1, score };
    }
    if (!best) break;
    const b = best as { key: AttrKey | 'pitch'; idx: number; score: number };
    const ok = b.key === 'pitch' ? raisePitch(p, b.idx) : raiseAttr(p, b.key);
    if (!ok) break;
    gained[b.key] = (gained[b.key] ?? 0) + 1;
  }
  return gained;
}

// ---------- 成长系数 ----------
export function talentMult(p: Player): number {
  let m = 0.55 + p.pot * 0.009;
  if (has(p, 'monster')) m *= 1.3;
  return m;
}

export function curveMult(p: Player): number {
  const g = clamp(p.grade, 1, 3);
  const table: Record<Player['growth'], number[]> = {
    early: [1.25, 1.05, 0.75],
    normal: [1.0, 1.05, 0.95],
    late: [0.7, 0.95, 1.3],
  };
  return table[p.growth][g - 1];
}

export function ethicMult(p: Player): number {
  let m = 0.8 + p.ethic * 0.004;
  if (p.pers === 'diligent') m *= 1.1;
  if (p.pers === 'lazy') m *= 0.88;
  return m;
}

/** AI 球员（或生成时补成长）简化成长：weeks 周的训练 */
export function aiGrow(p: Player, weeks: number, factor = 1): void {
  const per = AI_WEEKLY_EXP * talentMult(p) * curveMult(p) * ethicMult(p) * factor;
  const total = per * weeks;
  const dist: ExpPool = isPitcher(p)
    ? { str: 0.24, agi: 0.14, tech: 0.18, brk: 0.26, men: 0.18 }
    : { str: 0.26, agi: 0.25, tech: 0.33, brk: 0, men: 0.16 };
  for (const e of EXP_KINDS) p.exp[e] += total * dist[e];
  autoSpend(p, 'auto', 400);
}

export function addExp(p: Player, gain: Partial<ExpPool>): void {
  for (const e in gain) p.exp[e as ExpKind] += gain[e as ExpKind] ?? 0;
}

export function totalExp(p: Player): number {
  return EXP_KINDS.reduce((s, e) => s + p.exp[e], 0);
}

export function pitchName(t: PitchType): string {
  return PITCH_DEFS[t].name;
}

export const ALL_ATTR_KEYS = ALL_ATTRS;
