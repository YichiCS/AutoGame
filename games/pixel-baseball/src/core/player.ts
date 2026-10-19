// 球员生成
import type { AttrKey, BatSide, Delivery, Hand, Personality, PitchSkill, PitchType, Player, Pos } from './types';
import { ALL_ATTRS, FIELD_POS } from './types';
import { chance, gauss, pick, randInt, weightedPick } from './rng';
import { clamp } from './util';
import { emptyBlock, posRating, refreshPos } from './attrs';
import { aiGrow, emptyExp, MAX_VEL } from './growth';
import { FAMILY_NAMES, GIVEN_NAMES } from '../data/names';
import { TRAITS } from '../data/traits';
import { PITCH_DEFS, PITCH_LIST, pitchAffinity } from '../data/pitches';
import { nextId } from './state';

const POS_WEIGHT: [Pos, number][] = [
  ['P', 0.3], ['C', 0.1], ['1B', 0.07], ['2B', 0.09], ['3B', 0.09], ['SS', 0.1], ['LF', 0.08], ['CF', 0.09], ['RF', 0.08],
];

const POS_OFFSET: Record<Exclude<Pos, 'P'>, Partial<Record<AttrKey, number>>> = {
  C: { arm: 4, catching: 8, fielding: 2, speed: -10, power: 2 },
  '1B': { power: 6, contact: 2, fielding: -6, speed: -6, arm: -6 },
  '2B': { fielding: 6, speed: 4, power: -6, bunt: 4, arm: -2 },
  '3B': { arm: 5, power: 3, fielding: 2, speed: -2 },
  SS: { fielding: 8, arm: 6, speed: 5, power: -4 },
  LF: { power: 3, contact: 2, fielding: -4, arm: -4 },
  CF: { speed: 8, fielding: 5, arm: 2, power: -2 },
  RF: { arm: 7, power: 3, fielding: -1 },
};

const PERS_W: [Personality, number][] = [
  ['hot', 14], ['calm', 14], ['diligent', 14], ['genius', 8], ['lazy', 10], ['proud', 12], ['shy', 10], ['leader', 6], ['cheerful', 12],
];

export interface GenOpts {
  quality: number; // 入学（1 年级 4 月）时的平均能力
  grade?: number; // 0..3；>1 时会补上成长
  /** 类型（投手型、游击型……）：只决定能力往哪边偏，最后守什么位置由能力决定 */
  pos?: Pos;
  enrollYear: number;
  monster?: boolean;
  potBias?: number;
  /** 额外补的训练周数（不给就按年级算） */
  weeksGrown?: number;
  growFactor?: number;
  id?: number;
}

export function randomName(): { fam: string; given: string } {
  return { fam: pick(FAMILY_NAMES), given: pick(GIVEN_NAMES) };
}

const g = (sd: number) => gauss(0, sd);

/** 按投球姿势和已有球种挑一个新球种 */
export function pickNewPitch(owned: PitchType[], delivery: Delivery, maxRarity = 3): PitchType | null {
  const cands = PITCH_LIST.map((t) => [t, pitchAffinity(owned, delivery, t)] as [PitchType, number]).filter(([t, w]) => w > 0 && PITCH_DEFS[t].rarity <= maxRarity);
  if (!cands.length) return null;
  return weightedPick(cands, (x) => x[1])[0];
}


export function generatePlayer(o: GenOpts): Player {
  const q = o.quality;
  const pos: Pos = o.pos ?? weightedPick(POS_WEIGHT, (x) => x[1])[0];
  const pitcher = pos === 'P';
  // 所有能力都围绕同一个素质 q：投手型打击略弱、野手型投球略弱，但不会差到断层
  let throws: Hand = 'R';
  if (pitcher) throws = chance(0.3) ? 'L' : 'R';
  else if (pos === '1B' || pos === 'LF' || pos === 'CF' || pos === 'RF') throws = chance(0.22) ? 'L' : 'R';
  let bats: BatSide = throws === 'L' ? (chance(0.88) ? 'L' : 'R') : chance(0.3) ? 'L' : 'R';
  if (chance(0.05)) bats = 'S';

  const a = {} as Record<AttrKey, number>;
  const off = pitcher ? {} : POS_OFFSET[pos as Exclude<Pos, 'P'>];
  const bq = pitcher ? q - 5 : q;
  const B = (k: AttrKey, base: number, sd: number) => (a[k] = clamp(base + (off[k] ?? 0) + g(sd), 5, 95));
  B('contact', bq, 8);
  B('power', bq, 9);
  B('eye', bq - 3, 8);
  B('speed', bq, 10);
  B('arm', pitcher ? q + 4 : bq, 9);
  B('fielding', pitcher ? q - 5 : bq, 8);
  B('catching', pitcher ? q - 5 : bq, 8);
  B('bunt', bq - 6, 10);
  B('baserun', bq - 4, 9);
  a.mental = clamp(q - 3 + g(10), 5, 95);
  a.durability = clamp(42 + q * 0.2 + g(10), 10, 95);
  // 投球能力：野手型的略低，肩力好的更能投
  const pq = pitcher ? q : q - 8 + (a.arm - q) * 0.25;
  a.velocity = pitcher ? clamp(108 + q * 0.36 + g(4), 100, 150) : clamp(104 + pq * 0.32 + g(4), 98, 145);
  a.control = clamp(pq + g(9), 5, 95);
  a.stamina = clamp(pq - 3 + g(9), 5, 95);
  a.stuff = clamp(pq + g(8), 5, 95);
  if (o.monster) {
    for (const k of ALL_ATTRS) if (k !== 'velocity') a[k] = clamp(a[k] + 6, 5, 97);
    if (pitcher) a.velocity = clamp(a.velocity + 6, 100, 152);
  }

  const delivery: Delivery = weightedPick<[Delivery, number]>(
    pitcher ? [['over', 42], ['three', 36], ['side', 16], ['under', 6]] : [['over', 55], ['three', 35], ['side', 8], ['under', 2]],
    (x) => x[1],
  )[0];

  // 变化球：数量看素质，球种看投球姿势和亲缘
  const pitches: PitchSkill[] = [];
  if (pitcher) {
    const n = q < 28 ? 1 : q < 45 ? randInt(1, 2) : q < 60 ? randInt(2, 3) : randInt(3, 4);
    for (let i = 0; i < n; i++) {
      const t = pickNewPitch(pitches.map((x) => x.type), delivery, q >= 55 ? 3 : 2);
      if (!t) break;
      pitches.push({ type: t, lv: clamp(Math.round((q - 18) / 16 + g(0.7)), 1, 4) });
    }
  } else if (chance(clamp((pq - 30) / 60, 0, 0.6))) {
    // 野手型也有人会投一种变化球
    const t = pickNewPitch([], delivery, 2);
    if (t) pitches.push({ type: t, lv: clamp(Math.round((pq - 25) / 18 + g(0.6)), 1, 3) });
  }

  // 潜力与上限
  let pot = clamp(gauss(30 + q * 0.6 + (o.potBias ?? 0), 14), 5, 99);
  if (o.monster) pot = clamp(92 + g(3), 90, 99);
  const caps = {} as Record<AttrKey, number>;
  for (const k of ALL_ATTRS) {
    if (k === 'velocity') caps[k] = clamp(a[k] + 3 + pot * 0.17 + g(3), a[k] + 2, MAX_VEL);
    else caps[k] = clamp(a[k] + 5 + pot * 0.36 + g(6), a[k] + 3, 99);
  }

  const pers = weightedPick(PERS_W, (x) => x[1])[0];
  const ethicBase = pers === 'diligent' ? 75 : pers === 'lazy' ? 32 : 55;
  const { fam, given } = randomName();

  const p: Player = {
    id: o.id ?? nextId(),
    fam,
    given,
    grade: o.grade ?? 1,
    enrollYear: o.enrollYear,
    throws,
    bats,
    pos,
    a,
    caps,
    traj: a.power < 35 ? 1 : a.power < 55 ? 2 : a.power < 72 ? 3 : 4,
    pitches,
    delivery,
    traits: [],
    pot,
    growth: weightedPick<[Player['growth'], number]>([['early', 25], ['normal', 50], ['late', 25]], (x) => x[1])[0],
    pers,
    ethic: clamp(ethicBase + g(12), 5, 99),
    height: Math.round(clamp(gauss(pitcher ? 177 : 173, 6), 158, 195)),
    fatigue: randInt(0, 15),
    cond: 0,
    morale: randInt(55, 75),
    trust: 50,
    injury: null,
    academics: clamp(gauss(50, 18), 5, 98),
    pop: clamp(q - 40 + g(8), 0, 100),
    exp: emptyExp(),
    plan: 'auto',
    learning: null,
    wish: 'univ',
    pw: [0, 0, 0, 0, 0, 0, 0],
    pitchesWeek: 0,
    benched: 0,
    retired: false,
    face: randInt(1, 2 ** 30),
    joined: 'regular',
    stats: { season: emptyBlock(), career: emptyBlock(), koshien: emptyBlock() },
    notes: [],
  };

  // 特殊能力
  const pool = TRAITS.filter((t) => !t.rare && (pitcher ? t.kind !== 'bat' || chance(0.3) : t.kind !== 'pit' && !t.pitcherOnly) && (!t.catcherOnly || pos === 'C'));
  const goods = pool.filter((t) => t.good);
  const bads = pool.filter((t) => !t.good);
  const nGood = (chance(0.08 + q * 0.006) ? 1 : 0) + (chance(q * 0.003) ? 1 : 0);
  for (let i = 0; i < nGood; i++) {
    const t = pick(goods);
    if (!p.traits.includes(t.id) && !p.traits.includes(t.opp ?? '') && (!t.req || t.req(p))) p.traits.push(t.id);
  }
  if (chance(0.28 - q * 0.002)) {
    const t = pick(bads);
    if (!p.traits.includes(t.id) && !p.traits.includes(t.opp ?? '')) p.traits.push(t.id);
  }
  if (o.monster) p.traits.push('monster');

  p.wish = q > 50 && chance(0.6) ? 'pro' : weightedPick<[Player['wish'], number]>([['univ', 45], ['corp', 20], ['job', 25], ['pro', 10]], (x) => x[1])[0];
  if (o.monster) p.pop = 70 + randInt(0, 20);

  // 已入学者补成长
  const weeks = o.weeksGrown ?? Math.max(0, (o.grade ?? 1) - 1) * 44;
  if (weeks > 0) growPlayerOver(p, weeks, o.growFactor ?? 1);
  // 野手型落到评价最高的守备位置；投手型和野手型之间要明显更合适才换（同 refreshPos）
  if (!pitcher) p.pos = FIELD_POS.reduce((x, y) => (posRating(p, y) > posRating(p, x) ? y : x));
  refreshPos(p);
  return p;
}

/** 让球员按年级逐年补成长（生成高年级球员用） */
export function growPlayerOver(p: Player, weeks: number, factor: number): void {
  const finalGrade = p.grade;
  let left = weeks;
  let g2 = Math.max(1, finalGrade - Math.ceil(weeks / 44));
  while (left > 0) {
    const chunk = Math.min(44, left);
    p.grade = Math.min(finalGrade, g2);
    aiGrow(p, chunk, factor);
    left -= chunk;
    g2++;
  }
  p.grade = finalGrade;
}

/** 可以出场（无伤、不在停赛/补习中、在籍） */
export function available(p: Player): boolean {
  return !p.injury && !p.retired && p.benched <= 0 && p.grade >= 1 && p.grade <= 3;
}

