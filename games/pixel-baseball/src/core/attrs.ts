// 能力值元数据与评价函数
import type { AttrKey, ExpPool, Player, Pos, BatLine, PitLine, StatBlock, PitchSkill } from './types';
import { POSITIONS } from './types';
import { clamp } from './util';
import { TRAIT_BY_ID } from '../data/traits';

export const ATTR_NAME: Record<AttrKey, string> = {
  contact: '击球', power: '力量', eye: '选球眼', speed: '跑速', arm: '肩力', fielding: '守备', catching: '捕球',
  bunt: '触击', baserun: '跑垒', velocity: '球速', control: '控球', stamina: '耐力', stuff: '球威',
  mental: '精神', durability: '体质',
};

export const ATTR_DESC: Record<AttrKey, string> = {
  contact: '击中球的能力，影响安打率与三振',
  power: '击球的力量，影响长打与本垒打',
  eye: '辨别好坏球的能力，影响四坏球与追打',
  speed: '跑垒速度，影响内野安打、盗垒、守备范围',
  arm: '传球的力量与准确度',
  fielding: '守备范围与技巧',
  catching: '接球的稳定性，影响失误',
  bunt: '触击（短打）技巧',
  baserun: '跑垒判断与盗垒技术',
  velocity: '直球的最快球速（km/h）',
  control: '把球投到想投位置的能力',
  stamina: '可以投多少球而不疲劳',
  stuff: '球的威力与尾劲',
  mental: '抗压能力，影响关键时刻表现与动摇',
  durability: '身体强度，影响伤病与疲劳',
};

export const EXP_NAME: Record<keyof ExpPool, string> = { str: '力量', agi: '敏捷', tech: '技术', brk: '变化', men: '精神' };

/** 每提升 1 点所需的经验构成（会再乘以等级系数） */
export const ATTR_COST: Record<AttrKey, Partial<ExpPool>> = {
  contact: { tech: 1.0, men: 0.35 },
  power: { str: 1.0, tech: 0.3 },
  eye: { men: 0.8, tech: 0.45 },
  speed: { agi: 1.0, str: 0.35 },
  arm: { str: 0.8, agi: 0.4 },
  fielding: { agi: 0.75, tech: 0.55 },
  catching: { tech: 0.7, men: 0.45 },
  bunt: { tech: 0.65 },
  baserun: { agi: 0.5, men: 0.5 },
  velocity: { str: 1.0, agi: 0.45 },
  control: { tech: 0.75, men: 0.6 },
  stamina: { str: 0.6, men: 0.6 },
  stuff: { str: 0.6, brk: 0.55 },
  mental: { men: 1.1 },
  durability: { str: 0.6, men: 0.35 },
};

/** 球速换算为 0..100 的能力尺度 */
export function velScore(v: number): number {
  return clamp((v - 110) * 2.2, 0, 100);
}

/** 用于成本计算的"等级" */
export function attrLevel(p: Player, k: AttrKey): number {
  return k === 'velocity' ? velScore(p.a.velocity) : p.a[k];
}

export function gradeLetter(v: number): string {
  if (v >= 90) return 'S';
  if (v >= 80) return 'A';
  if (v >= 70) return 'B';
  if (v >= 60) return 'C';
  if (v >= 50) return 'D';
  if (v >= 40) return 'E';
  if (v >= 20) return 'F';
  return 'G';
}

export const GRADE_COLOR: Record<string, string> = {
  S: '#ff77a8', A: '#ff4d4d', B: '#ffa300', C: '#ffec27', D: '#a7f070', E: '#38b764', F: '#41a6f6', G: '#8b9bb4',
};

export function has(p: Player, trait: string): boolean {
  return p.traits.includes(trait);
}

export function fullName(p: Player): string {
  return `${p.fam} ${p.given}`;
}

export function isPitcher(p: Player): boolean {
  return p.pos === 'P';
}

export function breakingScore(pitches: readonly PitchSkill[]): number {
  const lv = pitches.map((x) => x.lv).sort((a, b) => b - a);
  const w = [9, 5, 3, 2, 1, 1, 1];
  let s = 0;
  lv.forEach((l, i) => (s += l * (w[i] ?? 1)));
  return clamp(s, 0, 100);
}

export function pitcherOverall(p: Player): number {
  return (
    0.32 * velScore(p.a.velocity) +
    0.24 * p.a.control +
    0.14 * p.a.stamina +
    0.14 * p.a.stuff +
    0.16 * breakingScore(p.pitches)
  );
}

export function batterOffense(p: Player): number {
  return 0.34 * p.a.contact + 0.28 * p.a.power + 0.14 * p.a.eye + 0.16 * p.a.speed + 0.08 * p.a.baserun;
}

const FIELD_W: Record<Exclude<Pos, 'P'>, Partial<Record<AttrKey, number>>> = {
  C: { catching: 0.35, arm: 0.35, fielding: 0.15, mental: 0.15 },
  '1B': { catching: 0.5, fielding: 0.4, arm: 0.1 },
  '2B': { fielding: 0.5, catching: 0.2, speed: 0.2, arm: 0.1 },
  '3B': { fielding: 0.4, arm: 0.35, catching: 0.25 },
  SS: { fielding: 0.45, arm: 0.3, speed: 0.15, catching: 0.1 },
  LF: { speed: 0.35, fielding: 0.35, arm: 0.15, catching: 0.15 },
  CF: { speed: 0.45, fielding: 0.35, arm: 0.1, catching: 0.1 },
  RF: { arm: 0.4, fielding: 0.3, speed: 0.2, catching: 0.1 },
};

/** 左投的人守捕手、二垒、三垒、游击传球不顺 */
const LEFTY_HARD: readonly Pos[] = ['C', '2B', '3B', 'SS'];

/** 位置适应（0..100）：谁都能守任何位置，好不好只看能力；唯一的例外是左投守捕手和二三游 */
export function aptOf(p: Player, pos: Pos): number {
  return p.throws === 'L' && LEFTY_HARD.includes(pos) ? 60 : 100;
}

/** 在某守备位置的守备价值 */
export function fieldAt(p: Player, pos: Pos): number {
  if (pos === 'P') return 0.5 * p.a.fielding + 0.5 * p.a.catching;
  const w = FIELD_W[pos];
  let v = 0;
  for (const k in w) v += p.a[k as AttrKey] * (w[k as AttrKey] ?? 0);
  if (pos === 'C') {
    if (has(p, 'leader')) v += 6;
    if (has(p, 'leaderX')) v -= 6;
  }
  if (has(p, 'glove')) v += 4;
  if (has(p, 'errorProne')) v -= 5;
  if (aptOf(p, pos) < 100) v -= 15;
  return v;
}

const OFF_W: Record<Pos, number> = { P: 0.5, C: 0.5, '1B': 0.76, '2B': 0.58, '3B': 0.64, SS: 0.52, LF: 0.72, CF: 0.6, RF: 0.68 };

export function batterOverall(p: Player, pos: Pos = p.pos === 'P' ? 'RF' : p.pos): number {
  const w = OFF_W[pos];
  return batterOffense(p) * w + fieldAt(p, pos) * (1 - w);
}

/** 投手评价换算到和野手同一把尺子上（同样素质的投手和野手总评差不多），见 tests/rating.ts */
const P_SCALE = { k: 0.9, c: 10.5 };

/** 在某个位置上的总评（0..100）：投手看投球，其他位置看打击 + 这个位置的守备 */
export function posRating(p: Player, pos: Pos): number {
  if (pos === 'P') return clamp(pitcherOverall(p) * P_SCALE.k + P_SCALE.c, 0, 100);
  return batterOverall(p, pos);
}

/** 最适合的位置：完全由能力决定 */
export function bestPos(p: Player): Pos {
  let best: Pos = 'P';
  let bv = -Infinity;
  for (const pos of POSITIONS) {
    const v = posRating(p, pos);
    if (v > bv) {
      bv = v;
      best = pos;
    }
  }
  return best;
}

/** 总评：在最适合的位置上的评价 */
export function overall(p: Player): number {
  return posRating(p, bestPos(p));
}

/** AI 用的「能投」：本职投手，或者投球评价接近总评的二刀流。玩家自己可以让任何人投 */
export function pitchable(p: Player): boolean {
  return p.pos === 'P' || posRating(p, 'P') >= overall(p) - 8;
}

/** 某个守备位置最看重的能力（练这个位置时提升） */
export function posKeyAttrs(pos: Pos): AttrKey[] {
  if (pos === 'P') return ['control', 'stuff', 'stamina'];
  return (Object.entries(FIELD_W[pos]) as [AttrKey, number][]).filter(([, w]) => w >= 0.3).map(([k]) => k);
}

/**
 * 能力变了以后更新位置（训练方向跟着位置走）。免得在差不多的位置之间来回跳：
 * 守备位置之间，新的要高出 2 才换；投手和野手之间要高出 5 才换（练投球和练打击是两条路）。
 */
export function refreshPos(p: Player): boolean {
  const b = bestPos(p);
  if (b === p.pos) return false;
  const margin = (b === 'P') !== (p.pos === 'P') ? 5 : 2;
  if (posRating(p, b) < posRating(p, p.pos) + margin) return false;
  p.pos = b;
  return true;
}

/** 星级 1..5（用于潜力、球探评价） */
export function stars(v: number): number {
  return clamp(Math.round((v - 10) / 18), 1, 5);
}

// ---------- 统计 ----------
export function emptyBat(): BatLine {
  return { g: 0, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, r: 0, bb: 0, hbp: 0, so: 0, sb: 0, cs: 0, sac: 0, sf: 0, e: 0 };
}
export function emptyPit(): PitLine {
  return { g: 0, gs: 0, outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, np: 0, bf: 0, w: 0, l: 0, sv: 0, cg: 0, sho: 0 };
}
export function emptyBlock(): StatBlock {
  return { bat: emptyBat(), pit: emptyPit() };
}

export function addBat(to: BatLine, from: BatLine): void {
  for (const k in from) (to as unknown as Record<string, number>)[k] += (from as unknown as Record<string, number>)[k];
}
export function addPit(to: PitLine, from: PitLine): void {
  for (const k in from) (to as unknown as Record<string, number>)[k] += (from as unknown as Record<string, number>)[k];
}

export function avgOf(b: BatLine): number {
  return b.ab ? b.h / b.ab : 0;
}
export function obpOf(b: BatLine): number {
  const d = b.ab + b.bb + b.hbp + b.sf;
  return d ? (b.h + b.bb + b.hbp) / d : 0;
}
export function slgOf(b: BatLine): number {
  return b.ab ? (b.h + b.d + 2 * b.t + 3 * b.hr) / b.ab : 0;
}
export function eraOf(p: PitLine): number {
  return p.outs ? (p.er * 27) / p.outs : 0;
}
export function ipStr(outs: number): string {
  return `${Math.floor(outs / 3)}${outs % 3 ? '.' + (outs % 3) : ''}`;
}

export function traitList(p: Player): { id: string; name: string; good: boolean }[] {
  return p.traits.map((t) => ({ id: t, name: TRAIT_BY_ID[t]?.name ?? t, good: TRAIT_BY_ID[t]?.good ?? true }));
}

export const PERS_NAME: Record<Player['pers'], string> = {
  hot: '热血', calm: '冷静', diligent: '努力家', genius: '天才型', lazy: '懒散', proud: '自信家', shy: '内向', leader: '领袖型', cheerful: '开朗',
};
export const PERS_DESC: Record<Player['pers'], string> = {
  hot: '情绪起伏大，赢球时干劲暴涨，输球时也容易消沉',
  calm: '情绪稳定，调子不易大起大落',
  diligent: '练习非常认真，经验获取更多',
  genius: '技术类成长快，但不太喜欢枯燥的练习',
  lazy: '容易偷懒，严格训练时干劲下降明显',
  proud: '自尊心强，坐冷板凳会非常不满',
  shy: '在大舞台上容易紧张，但很听监督的话',
  leader: '天生的领导者，能带动全队的气氛',
  cheerful: '性格开朗，干劲不容易下降',
};
export const GROWTH_NAME: Record<Player['growth'], string> = { early: '早熟', normal: '普通', late: '晚成' };
export const WISH_NAME: Record<Player['wish'], string> = { pro: '职业', univ: '大学', corp: '社会人', job: '就业' };
