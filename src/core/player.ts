// 球员生成
import type { AttrKey, BatSide, Delivery, Hand, Personality, PitchSkill, PitchType, Player, Pos } from './types';
import { ALL_ATTRS } from './types';
import { chance, gauss, pick, randInt, weightedPick, rand } from './rng';
import { clamp } from './util';
import { emptyBlock, isPitcher } from './attrs';
import { aiGrow, emptyExp, MAX_VEL } from './growth';
import { FAMILY_NAMES, GIVEN_NAMES } from '../data/names';
import { TRAITS } from '../data/traits';
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

const SIMILAR: Record<Pos, Partial<Record<Pos, number>>> = {
  P: { RF: 35, LF: 35, '1B': 40 },
  C: { '1B': 45, '3B': 30 },
  '1B': { LF: 45, RF: 40, '3B': 35 },
  '2B': { SS: 62, '3B': 48, '1B': 45, CF: 35 },
  '3B': { '1B': 60, SS: 45, '2B': 45, LF: 40, RF: 40 },
  SS: { '2B': 75, '3B': 70, CF: 45, '1B': 40 },
  LF: { RF: 75, CF: 55, '1B': 40 },
  CF: { LF: 80, RF: 80 },
  RF: { LF: 75, CF: 55, '1B': 40 },
};

const PITCH_W: [PitchType, number][] = [['SL', 30], ['CB', 25], ['CH', 12], ['FK', 10], ['CT', 8], ['SH', 8], ['SK', 7]];

const PERS_W: [Personality, number][] = [
  ['hot', 14], ['calm', 14], ['diligent', 14], ['genius', 8], ['lazy', 10], ['proud', 12], ['shy', 10], ['leader', 6], ['cheerful', 12],
];

export interface GenOpts {
  quality: number; // 入学（1年4月）时的平均能力
  grade?: number; // 0..3，>1 时会补上成长
  pos?: Pos;
  schoolId?: number;
  enrollYear: number;
  monster?: boolean;
  potBias?: number;
  weeksGrown?: number; // 额外成长周数（入学后）
  growFactor?: number;
}

export function randomName(): { fam: string; given: string } {
  return { fam: pick(FAMILY_NAMES), given: pick(GIVEN_NAMES) };
}

function g(sd: number) {
  return gauss(0, sd);
}

export function generatePlayer(o: GenOpts): Player {
  const q = o.quality;
  const pos: Pos = o.pos ?? weightedPick(POS_WEIGHT, (x) => x[1])[0];
  const pitcher = pos === 'P';
  let throws: Hand = 'R';
  if (pitcher) throws = chance(0.3) ? 'L' : 'R';
  else if (pos === '1B' || pos === 'LF' || pos === 'CF' || pos === 'RF') throws = chance(0.22) ? 'L' : 'R';
  let bats: BatSide = throws === 'L' ? (chance(0.88) ? 'L' : 'R') : chance(0.3) ? 'L' : 'R';
  if (chance(0.05)) bats = 'S';

  const a = {} as Record<AttrKey, number>;
  const off = pitcher ? {} : POS_OFFSET[pos as Exclude<Pos, 'P'>];
  const bq = pitcher ? q - 7 : q;
  const B = (k: AttrKey, base: number, sd: number) => (a[k] = clamp(base + (off[k] ?? 0) + g(sd), 5, 95));
  B('contact', bq, 8);
  B('power', bq, 9);
  B('eye', bq - 3, 8);
  B('speed', bq, 10);
  B('arm', pitcher ? q + 4 : bq, 9);
  B('fielding', pitcher ? q - 6 : bq, 8);
  B('catching', pitcher ? q - 6 : bq, 8);
  B('bunt', bq - 6, 10);
  B('baserun', bq - 4, 9);
  a.mental = clamp(q - 3 + g(10), 5, 95);
  a.durability = clamp(42 + q * 0.2 + g(10), 10, 95);
  if (pitcher) {
    a.velocity = clamp(108 + q * 0.36 + g(4), 100, 150);
    a.control = clamp(q + g(9), 5, 95);
    a.stamina = clamp(q - 3 + g(9), 5, 95);
    a.stuff = clamp(q + g(8), 5, 95);
  } else {
    a.velocity = clamp(97 + a.arm * 0.3 + g(3), 95, 135);
    a.control = clamp(15 + g(5), 5, 40);
    a.stamina = clamp(20 + g(6), 5, 40);
    a.stuff = clamp(15 + g(5), 5, 40);
  }
  if (o.monster) {
    for (const k of ALL_ATTRS) if (k !== 'velocity') a[k] = clamp(a[k] + 6, 5, 97);
    if (pitcher) a.velocity = clamp(a.velocity + 6, 100, 152);
  }

  // 变化球
  const pitches: PitchSkill[] = [];
  if (pitcher) {
    const n = q < 30 ? 1 : q < 50 ? randInt(1, 2) : q < 65 ? randInt(2, 3) : 3;
    const pool = PITCH_W.slice();
    for (let i = 0; i < n; i++) {
      const t = weightedPick(pool, (x) => x[1]);
      pool.splice(pool.indexOf(t), 1);
      pitches.push({ type: t[0], lv: clamp(Math.round((q - 18) / 16 + g(0.7)), 1, 4) });
    }
  }
  let delivery: Delivery = 'over';
  if (pitcher) delivery = weightedPick<[Delivery, number]>([['over', 45], ['three', 35], ['side', 15], ['under', 5]], (x) => x[1])[0];
  if (pitcher && (delivery === 'side' || delivery === 'under') && !pitches.some((x) => x.type === 'SK' || x.type === 'SH')) {
    if (pitches.length) pitches[pitches.length - 1].type = chance(0.5) ? 'SK' : 'SH';
  }

  // 守备适性
  const apt: Partial<Record<Pos, number>> = { [pos]: clamp(85 + g(8), 70, 100) };
  for (const [p2, v] of Object.entries(SIMILAR[pos])) apt[p2 as Pos] = clamp(v + g(10), 15, 90);
  if (!pitcher && a.arm > 60 && chance(0.12)) apt.P = clamp(30 + g(10), 15, 60);
  if (throws === 'L') {
    for (const p2 of ['C', '2B', '3B', 'SS'] as Pos[]) if (p2 !== pos) apt[p2] = Math.min(apt[p2] ?? 15, 15);
  }

  // 潜力与上限
  let pot = clamp(gauss(30 + q * 0.6 + (o.potBias ?? 0), 14), 5, 99);
  if (o.monster) pot = clamp(92 + g(3), 90, 99);
  const caps = {} as Record<AttrKey, number>;
  for (const k of ALL_ATTRS) {
    if (k === 'velocity') caps[k] = clamp(a[k] + 3 + pot * 0.17 + g(3), a[k] + 2, MAX_VEL);
    else caps[k] = clamp(a[k] + 5 + pot * 0.36 + g(6), a[k] + 3, 99);
  }
  if (!pitcher) {
    caps.control = Math.min(caps.control, 45);
    caps.stamina = Math.min(caps.stamina, 50);
    caps.stuff = Math.min(caps.stuff, 45);
  }

  // 特性
  const traits: string[] = [];
  const pool = TRAITS.filter((t) => !t.rare && (pitcher ? t.kind !== 'bat' || chance(0.3) : t.kind !== 'pit' && !t.pitcherOnly) && (!t.catcherOnly || pos === 'C'));
  const goods = pool.filter((t) => t.good);
  const bads = pool.filter((t) => !t.good);
  const nGood = (chance(0.08 + q * 0.006) ? 1 : 0) + (chance(q * 0.003) ? 1 : 0);
  for (let i = 0; i < nGood; i++) {
    const t = pick(goods);
    if (!traits.includes(t.id) && !traits.includes(t.opp ?? '') && (!t.req || t.req({ a, apt, pos } as Player))) traits.push(t.id);
  }
  if (chance(0.28 - q * 0.002)) {
    const t = pick(bads);
    if (!traits.includes(t.id) && !traits.includes(t.opp ?? '')) traits.push(t.id);
  }
  if (o.monster) traits.push('monster');

  const pers = weightedPick(PERS_W, (x) => x[1])[0];
  const ethicBase = pers === 'diligent' ? 75 : pers === 'lazy' ? 32 : 55;
  const { fam, given } = randomName();

  const p: Player = {
    id: nextId(),
    fam,
    given,
    schoolId: o.schoolId ?? -1,
    grade: o.grade ?? 1,
    enrollYear: o.enrollYear,
    throws,
    bats,
    pos,
    apt,
    a,
    caps,
    traj: a.power < 35 ? 1 : a.power < 55 ? 2 : a.power < 72 ? 3 : 4,
    pitches,
    delivery,
    traits,
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
    focus: null,
    learning: null,
    wish: 'univ',
    pitchesWeek: 0,
    retired: false,
    ineligibleUntil: 0,
    face: randInt(1, 2 ** 30),
    joined: 'gen',
    scholarship: false,
    supplementary: 0,
    stats: { season: emptyBlock(), career: emptyBlock(), koshien: emptyBlock() },
    notes: [],
  };
  p.wish = q > 50 && chance(0.6) ? 'pro' : weightedPick<[Player['wish'], number]>([['univ', 45], ['corp', 20], ['job', 25], ['pro', 10]], (x) => x[1])[0];
  if (o.monster) p.pop = 70 + randInt(0, 20);

  // 已入学者补成长
  const weeks = o.weeksGrown ?? (Math.max(0, (o.grade ?? 1) - 1) * 44);
  if (weeks > 0) growPlayerOver(p, weeks, o.growFactor ?? 1);
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

/** 某球员是否可以出场（无伤、未引退、非禁赛） */
export function available(p: Player, absWeek: number): boolean {
  return !p.injury && !p.retired && p.grade >= 1 && p.grade <= 3 && p.ineligibleUntil <= absWeek && p.supplementary <= 0;
}

export function pitcherFresh(p: Player): number {
  // 0..1，越大越适合登板
  return clamp(1 - p.fatigue / 100, 0, 1) * clamp((500 - p.pitchesWeek) / 150, 0, 1);
}

export function isPitcherP(p: Player): boolean {
  return isPitcher(p);
}

export function randomBetween(lo: number, hi: number): number {
  return lo + rand() * (hi - lo);
}
