// 逐球投打的模型：瞄准网格、球种质量、落点散布、打者的九宫格打击率、挥棒与击球质量。
// 坐标一律用「好球带坐标」：x、y ∈ [-1, 1] 是好球带；x > 0 是一垒侧（从捕手看过去的右边），y > 0 是高。
// 所有随机都通过参数里的 Rng，比赛用比赛自己的随机数，画面预览和教练用互不影响的本地随机数。
import type { PitchType, Player } from '../core/types';
import { PITCH_DEFS } from '../data/pitches';
import { clamp, z } from '../core/util';
import { has, velScore } from '../core/attrs';
import { hash32, localRng } from '../core/rng';

export interface Rng {
  rand(): number;
  gauss(mean?: number, sd?: number): number;
}

/** 不碰全局随机状态的随机数（画面预览、教练） */
export function makeRng(seed: number): Rng {
  const r = localRng(seed);
  let spare: number | null = null;
  return {
    rand: r,
    gauss(mean = 0, sd = 1) {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return mean + v * sd;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = r();
      while (v === 0) v = r();
      const mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v);
      return mean + mag * Math.cos(2 * Math.PI * v) * sd;
    },
  };
}

// ======================= 网格 =======================
/** 瞄准网格 11×11：中间 9×9 是好球带，外面一圈是坏球区 */
export const GRID = 11;
/** 一格的宽度（好球带坐标） */
export const CELL = 2 / 9;
/** 网格覆盖 [-HALF, HALF] */
export const HALF = 1 + CELL;

/** 第 i 列（从左到右，捕手视角）、第 j 行（从上到下）的中心 */
export function cellCenter(i: number, j: number): [number, number] {
  return [-HALF + (i + 0.5) * CELL, HALF - (j + 0.5) * CELL];
}

/** 落点在哪一格（网格外返回 -1）；格子编号 = j * GRID + i */
export function cellAt(x: number, y: number): number {
  const i = Math.floor((x + HALF) / CELL);
  const j = Math.floor((HALF - y) / CELL);
  if (i < 0 || i >= GRID || j < 0 || j >= GRID) return -1;
  return j * GRID + i;
}

export function inZone(x: number, y: number): boolean {
  return Math.abs(x) <= 1 && Math.abs(y) <= 1;
}

/** 九宫格 0..8：从捕手看，左上 → 右下 */
export function zoneCenter(zn: number): [number, number] {
  const col = zn % 3;
  const row = Math.floor(zn / 3);
  return [((col - 1) * 2) / 3, ((1 - row) * 2) / 3];
}

/** 落点所在的九宫格；好球带外的球算到离它最近的那一格 */
export function nearZone(x: number, y: number): number {
  const cx = clamp(x, -1, 1);
  const cy = clamp(y, -1, 1);
  const col = cx < -1 / 3 ? 0 : cx > 1 / 3 ? 2 : 1;
  const row = cy > 1 / 3 ? 0 : cy < -1 / 3 ? 2 : 1;
  return row * 3 + col;
}

/** 离好球带边缘多远（在好球带里为 0） */
export function outDist(x: number, y: number): number {
  const dx = Math.max(0, Math.abs(x) - 1);
  const dy = Math.max(0, Math.abs(y) - 1);
  return Math.hypot(dx, dy);
}

/** 旧引擎用的四档位置（触击、暴投等沿用） */
export type Loc = 'heart' | 'corner' | 'shadow' | 'waste';
export function locOf(x: number, y: number): Loc {
  if (Math.abs(x) <= 0.5 && Math.abs(y) <= 0.5) return 'heart';
  if (inZone(x, y)) return 'corner';
  return outDist(x, y) <= 0.34 ? 'shadow' : 'waste';
}

// ======================= 球种质量 =======================
export interface PitchOpt {
  type: PitchType | 'FB';
  lv: number;
  sig?: string;
  /** 质量 0..100 */
  q: number;
}

/** 比赛中的有效能力（疲劳、调子之后）；不给就用能力本身 */
export interface PitcherNow {
  vel: number;
  ctl: number;
  stuff: number;
}

export function nowOf(p: Player): PitcherNow {
  return { vel: p.a.velocity, ctl: p.a.control, stuff: p.a.stuff };
}

/** 直球的质量：球速为主，球威、控球为辅 */
export function fbQuality(p: Player, e: PitcherNow = nowOf(p)): number {
  return clamp(10 + 0.45 * velScore(e.vel) + 0.25 * e.stuff + 0.2 * e.ctl + (has(p, 'nobi') ? 5 : 0) + (has(p, 'powerPitcher') ? 3 : 0), 0, 100);
}

/** 某个球种的质量（0..100）。变化球看等级和球威；直球系变化球也看球速 */
export function pitchQuality(p: Player, type: PitchType | 'FB', e: PitcherNow = nowOf(p)): number {
  if (type === 'FB') return fbQuality(p, e);
  const own = p.pitches.find((x) => x.type === type);
  const lv = own?.lv ?? 1;
  const d = PITCH_DEFS[type];
  const base = 6 + 7.5 * lv + 0.3 * e.stuff + (own?.sig ? 8 : 0) + (has(p, 'kire') ? 4 : 0);
  return clamp((1 - d.velW) * base + d.velW * Math.max(base, fbQuality(p, e)), 0, 100);
}

/** 投手会的球：直球在最前 */
export function arsenal(p: Player, e: PitcherNow = nowOf(p)): PitchOpt[] {
  const out: PitchOpt[] = [{ type: 'FB', lv: 0, q: fbQuality(p, e) }];
  for (const x of p.pitches) out.push({ type: x.type, lv: x.lv, sig: x.sig, q: pitchQuality(p, x.type, e) });
  return out;
}

// ======================= 散布 =======================
export interface Spread {
  /** 基本散布（好球带单位的标准差） */
  s: number;
  /** 变化方向（单位向量，捕手视角）；直球为 0 向量 */
  u: [number, number];
  /** 顺着变化方向 / 逆着变化方向 / 垂直方向 的散布倍数 */
  over: number;
  under: number;
  perp: number;
  /** 失投（没有变化、留在高处）的概率 */
  hang: number;
  knuckle: boolean;
}

const DIR_VEC: Record<string, [number, number]> = {
  R: [1, -0.15],
  L: [-1, -0.2],
  D: [0, -1],
  DR: [0.6, -0.8],
  DL: [-0.55, -0.83],
};

/**
 * 落点散布：控球越好越集中；疲劳、低质量的球更散。
 * 直球是圆的正态分布；变化球顺着变化方向拉长并偏向变化的一侧（变多了跑得更远，变少了留在半路），
 * 还有一定概率「失投」——没变化、留在高处的好打的球；蝴蝶球乱飘。
 */
export function spreadOf(type: PitchType | 'FB', throws: 'R' | 'L', ctl: number, q: number, fatigue: number): Spread {
  let s = 0.13 + 0.35 * (1 - clamp(ctl, 0, 110) / 100);
  // 体力：从第一球起就一点点变散，过了一半以后明显变散
  s *= 1 + 0.07 * fatigue + 0.9 * Math.max(0, fatigue - 0.55);
  s *= 1.1 - (0.22 * q) / 100;
  // 再差的投手也有四成好球：散布有上限
  s = Math.min(s, 0.5);
  if (type === 'FB') return { s, u: [0, 0], over: 1, under: 1, perp: 1, hang: 0, knuckle: false };
  const d = PITCH_DEFS[type];
  s *= 1 + d.ctrl * 2.5;
  if (d.dir === 'X') return { s: s * 1.25, u: [0, 0], over: 1, under: 1, perp: 1, hang: 0, knuckle: true };
  const v = DIR_VEC[d.dir];
  const len = Math.hypot(v[0], v[1]);
  const u: [number, number] = [((throws === 'L' ? -1 : 1) * v[0]) / len, v[1] / len];
  const fast = d.family === 'fast';
  const hang = fast ? 0.01 : clamp(0.03 + 0.1 * (1 - q / 100) + 0.2 * Math.max(0, fatigue - 0.65), 0.02, 0.3);
  return fast ? { s, u, over: 1.15, under: 0.9, perp: 0.9, hang, knuckle: false } : { s, u, over: 1.45, under: 0.8, perp: 0.7, hang, knuckle: false };
}

export interface Landing {
  x: number;
  y: number;
  hang: boolean;
}

/** 偶尔控球大乱：这一球的散布放大（谁都有投歪的时候） */
export const WILD_P = 0.13;
export const WILD_K = 2.1;

/** 按散布从目标点抽一个实际落点 */
export function sampleLanding(tx: number, ty: number, sp0: Spread, r: Rng): Landing {
  const sp = r.rand() < WILD_P ? { ...sp0, s: Math.min(0.95, sp0.s * WILD_K) } : sp0;
  if (sp.knuckle) {
    // 蝴蝶球：一大一小两团，方向随机
    const a = r.rand() * Math.PI * 2;
    const k = r.rand() < 0.35 ? sp.s * 1.6 : 0;
    return { x: tx + r.gauss(0, sp.s) + Math.cos(a) * k, y: ty + r.gauss(0, sp.s) + Math.sin(a) * k, hang: false };
  }
  if (sp.u[0] === 0 && sp.u[1] === 0) return { x: tx + r.gauss(0, sp.s), y: ty + r.gauss(0, sp.s), hang: false };
  const [ux, uy] = sp.u;
  if (r.rand() < sp.hang) {
    // 失投：几乎没变化，往变化的反方向留，往下坠的球还会偏高
    const lift = uy < 0 ? 0.14 : 0.04;
    return { x: tx - ux * 0.42 + r.gauss(0, sp.s * 0.7), y: ty - uy * 0.42 + lift + r.gauss(0, sp.s * 0.7), hang: true };
  }
  const g = r.gauss(0, 1);
  const along = g >= 0 ? g * sp.s * sp.over : g * sp.s * sp.under;
  const perp = r.gauss(0, sp.s * sp.perp);
  return { x: tx + ux * along - uy * perp, y: ty + uy * along + ux * perp, hang: false };
}

export interface Aim {
  x: number;
  y: number;
  w: number;
  sp: Spread;
}

/** 落点的概率分布（11×11 网格上每一格的概率，网格外的不计入），用本地随机数估计 */
export function density(aims: Aim[], seed = 1, n = 1600): number[] {
  const out = new Array<number>(GRID * GRID).fill(0);
  const tot = aims.reduce((a, b) => a + b.w, 0) || 1;
  const r = makeRng(seed);
  for (const a of aims) {
    const k = Math.max(1, Math.round((n * a.w) / tot));
    for (let i = 0; i < k; i++) {
      const l = sampleLanding(a.x, a.y, a.sp, r);
      const c = cellAt(l.x, l.y);
      if (c >= 0) out[c] += a.w / tot / k;
    }
  }
  return out;
}

// ======================= 打者的九宫格打击率 =======================
/** 打者的类型（每个人固定）：决定哪几格是热区 */
export type HotType = 'low' | 'high' | 'pull' | 'oppo' | 'middle' | 'even';
export const HOT_NAME: Record<HotType, string> = { low: '低球打者', high: '高球打者', pull: '拉打型', oppo: '推打型', middle: '只打正中', even: '均衡' };

export function hotType(b: Player): HotType {
  const types: HotType[] = ['low', 'high', 'pull', 'oppo', 'middle', 'even'];
  return types[hash32(b.id, 7) % types.length];
}

/** 打者面对这一侧投手时站哪边（左右开弓的人站投手的另一侧） */
export function batSide(b: Player, throws: 'R' | 'L'): 'R' | 'L' {
  return b.bats === 'S' ? (throws === 'R' ? 'L' : 'R') : (b.bats as 'R' | 'L');
}

/**
 * 九宫格打击率（9 个，捕手视角左上 → 右下）。
 * 基础看击球和选球眼；正中最好打、四角最难；再按打者类型和力量调整，每个人还有一点固定的个性。
 */
export function hotZones(b: Player, side: 'R' | 'L'): number[] {
  const base = 0.165 + 0.0026 * b.a.contact + 0.0005 * (b.a.eye - 50);
  const insideCol = side === 'R' ? 0 : 2; // 右打者站三垒侧（x < 0），内角在左
  const outsideCol = 2 - insideCol;
  const ht = hotType(b);
  const out: number[] = [];
  for (let zn = 0; zn < 9; zn++) {
    const col = zn % 3;
    const row = Math.floor(zn / 3);
    let v = base;
    if (row === 1 && col === 1) v += 0.03;
    else if (row !== 1 && col !== 1) v -= 0.025;
    switch (ht) {
      case 'low':
        v += row === 2 ? 0.04 : row === 0 ? -0.03 : 0;
        break;
      case 'high':
        v += row === 0 ? 0.04 : row === 2 ? -0.03 : 0;
        break;
      case 'pull':
        v += col === insideCol ? 0.04 : col === outsideCol ? -0.025 : 0;
        break;
      case 'oppo':
        v += col === outsideCol ? 0.035 : col === insideCol ? -0.025 : 0;
        break;
      case 'middle':
        v += row === 1 && col === 1 ? 0.03 : row !== 1 && col !== 1 ? -0.02 : 0;
        break;
      default:
        break;
    }
    // 力量型打者：内角高的球打得远
    if (col === insideCol || row === 0) v += 0.0006 * (b.a.power - 50);
    v += ((hash32(b.id, 11, zn) % 1000) / 1000 - 0.5) * 0.04;
    out.push(clamp(v, 0.08, 0.5));
  }
  return out;
}

/** 某个落点的打击率：好球带里就是那一格；坏球越远越差 */
export function hotAt(hot: number[], x: number, y: number): number {
  const v = hot[nearZone(x, y)];
  const d = outDist(x, y);
  return d <= 0 ? v : v * Math.max(0.15, 0.62 - d * 1.2);
}

// ======================= 挥棒 =======================
export type SwingRes = 'ball' | 'called' | 'swinging' | 'foul' | 'inplay' | 'hbp';

export interface SwingIn {
  /** 打者狙的九宫格（0..8），-1 = 不挥棒 */
  hunt: number;
  /** 不管来什么球都要挥（打带跑） */
  force?: boolean;
  /** 玩家按了「挥棒」：一定挥，朝着挥棒范围（at 是它的中心；没有就用狙的那一格）——来球离得越远越容易挥空、打得越差 */
  commit?: boolean;
  at?: [number, number];
  /** AI 打者看不透投手（对手是玩家、教练）：没来到狙的位置、但进了好球带的球也常出棒 */
  blind?: boolean;
  x: number;
  y: number;
  /** 这一球的有效质量 */
  q: number;
  hang: boolean;
  breaking: boolean;
  con: number;
  eye: number;
  strikes: number;
  balls?: number;
  hot: number[];
  /** 内角方向（右打者 -1：x < 0 是内角） */
  insideSign: -1 | 1;
  /** 捕手接球（好坏球边缘的判定） */
  framing: number;
}

export interface SwingOut {
  res: SwingRes;
  swing: boolean;
  /** 球和狙的位置有多合（0..1） */
  m: number;
  /** 打中时的扎实程度 0..1 */
  solid: number;
  /** 一定挥时：来球比挥棒点高（> 0，打到球的下半部，容易飞高）还是低（< 0，容易打成滚地），-1..1 */
  lift?: number;
}

/** 挥棒模型的参数（tests/balance.ts 校准：打率、三振率、保送率、挥空率接近旧版） */
export const SWING_K = {
  /** 出棒范围：狙的那一格中心多远以内 */
  reach0: 0.6,
  reachEye: 0.12,
  reach2s: 0.16,
  /** 「合」的衰减距离 */
  fit: 0.68,
  /** 追打坏球：狙的那一格附近、刚出好球带的球 */
  chaseBand: 0.22,
  chase0: 0.32,
  /** 打中的概率 */
  con0: 0.58,
  conFit: 0.42,
  conSkill: 0.16,
  /** 击球质量的基准 */
  solid0: 0.63,
  solidFit: 0.2,
  conQ: 0.18,
  conOut: 0.1,
  /** 界外球 */
  foul0: 0.36,
  foulFit: 0.24,
  /** AI 打者看不透投手（玩家亲手投）时：好球带里不是狙的位置的球出棒的基准、这样出棒的「合」 */
  blind0: 0.4,
  blindFit: 0.48,
  /** 玩家一定挥、球在挥棒范围里（合 ≥ 0.85）：等到了想要的球，打得更扎实 */
  cSit: 0.1,
  /** 玩家「一定挥」的挥棒热区：左右、上下的宽度 = 基本 + 击球能力 × 系数（左右差一点还能靠球棒长短补，上下差一点就挥空） */
  covH0: 1.1,
  covH1: 0.45,
  covV0: 0.76,
  covV1: 0.35,
  /** 一定挥：打中的概率、界外、击球质量随「合」变化 */
  cCon0: 0.15,
  cConFit: 0.83,
  cFoul0: 0.16,
  cFoulFit: 0.42,
  cSolidFit: 0.4,
};

/** 狙的那一格附近多远以内会出棒 */
export function reachOf(eye: number, strikes: number): number {
  return SWING_K.reach0 + (SWING_K.reachEye * clamp(eye, 0, 100)) / 100 + (strikes === 2 ? SWING_K.reach2s : 0);
}

/** 球离狙的位置这么远时的「合」（0..1） */
export function fitOf(d: number): number {
  return Math.exp(-((d / SWING_K.fit) ** 2));
}

/**
 * 一球的结果。打者事先选好狙哪一格：球来到那一格附近就挥棒（变化球质量高会骗得更远，
 * 刚出好球带的球有时也会追打，选球眼好的人忍得住），别处的球放过（两好球后好球带里的球会勉强碰一碰）；
 * 选「不挥棒」整球都看。离狙的位置越近越容易打中、打得越扎实；落点的九宫格打击率决定击球质量。
 */
export function swingOutcome(o: SwingIn, r: Rng): SwingOut {
  const K = SWING_K;
  const strike = inZone(o.x, o.y);
  const qz = (o.q - 50) / 50;
  if (o.commit && o.hunt >= 0) return committedSwing(o, r, strike, qz);
  let swing = false;
  let m = 0;
  if (o.force) {
    swing = true;
    const [nx, ny] = zoneCenter(nearZone(o.x, o.y));
    m = 0.8 * fitOf(Math.hypot(o.x - nx, o.y - ny));
  } else if (o.hunt >= 0) {
    const [hx, hy] = zoneCenter(o.hunt);
    const d = Math.hypot(o.x - hx, o.y - hy);
    const reach = reachOf(o.eye, o.strikes) + (o.breaking && !strike ? (0.12 * o.q) / 100 : 0);
    if (d <= reach) {
      swing = true;
      m = fitOf(d);
    } else if (!strike && d <= reach + K.chaseBand && r.rand() < clamp(K.chase0 + 0.25 * qz - 0.3 * z(o.eye) + (o.strikes === 2 ? 0.15 : 0), 0.05, 0.85)) {
      // 追打：差一点就到狙的位置的坏球
      swing = true;
      m = fitOf(d) * 0.8;
    } else if (o.blind && strike && o.strikes < 2 && r.rand() < clamp(K.blind0 + 0.1 * z(o.eye) - ((o.balls ?? 0) >= 3 ? 0.2 : 0), 0.15, 0.75)) {
      // 看不透投手：不是狙的位置，进了好球带也出棒（合得差一些）
      swing = true;
      const [nx, ny] = zoneCenter(nearZone(o.x, o.y));
      m = K.blindFit * fitOf(Math.hypot(o.x - nx, o.y - ny));
    } else if (o.strikes === 2 && strike && r.rand() < 0.5 + 0.25 * (1 - o.eye / 100)) {
      // 两好球：不是狙的球也得碰一碰
      swing = true;
      const [nx, ny] = zoneCenter(nearZone(o.x, o.y));
      m = 0.45 * fitOf(Math.hypot(o.x - nx, o.y - ny));
    }
  }
  if (!swing) {
    // 极端内角：触身球
    const inside = o.x * o.insideSign;
    if (inside > 1.65 && r.rand() < 0.22) return { res: 'hbp', swing: false, m: 0, solid: 0 };
    // 好坏球边缘：看主审和捕手的接球
    const edge = Math.max(Math.abs(o.x), Math.abs(o.y));
    if (edge > 0.97 && edge < 1.06) {
      const pCall = clamp(0.5 + (1 - edge) * 6 + (o.framing - 50) * 0.004, 0.05, 0.95);
      return { res: r.rand() < pCall ? 'called' : 'ball', swing: false, m: 0, solid: 0 };
    }
    return { res: strike ? 'called' : 'ball', swing: false, m: 0, solid: 0 };
  }
  const outside = !strike;
  const pc = clamp(K.con0 + K.conFit * m + K.conSkill * z(o.con) - K.conQ * qz - (outside ? K.conOut : 0) + (o.strikes === 2 ? 0.04 : 0) + (o.hang ? 0.12 : 0), 0.06, 0.98);
  if (r.rand() >= pc) return { res: 'swinging', swing: true, m, solid: 0 };
  const pf = clamp(K.foul0 + K.foulFit * (1 - m) + (outside ? 0.1 : 0) + (o.strikes === 2 ? 0.05 : 0) - (o.hang ? 0.08 : 0), 0.15, 0.75);
  if (r.rand() < pf) return { res: 'foul', swing: true, m, solid: 0 };
  const ba = hotAt(o.hot, o.x, o.y);
  const solid = clamp(K.solid0 + 1.9 * (ba - 0.29) + K.solidFit * (m - 0.6) - 0.13 * qz + (o.hang ? 0.12 : 0) + r.gauss(0, 0.17), 0.01, 0.99);
  return { res: 'inplay', swing: true, m, solid };
}

/** 挥棒范围（3×3）：中心格的列、行（好球带 9×9 的格，左上为 0；-1 和 9 是外面一圈坏球区） → 中心的好球带坐标 */
export function rangeCenter(c: [number, number]): [number, number] {
  return [-1 + CELL * (c[0] + 0.5), 1 - CELL * (c[1] + 0.5)];
}

/** 挥棒范围的中心格：网格里哪一格都可以（-1..9，外面一圈坏球区也行——专等引诱球） */
export function clampRange(i: number, j: number): [number, number] {
  return [Math.max(-1, Math.min(9, Math.round(i))), Math.max(-1, Math.min(9, Math.round(j)))];
}

/** 挥棒热区的左右、上下宽度（好球带单位）：击球能力越好越宽 */
export function coverWidth(con: number): [number, number] {
  const K = SWING_K;
  const c = clamp(con, 0, 100) / 100;
  return [K.covH0 + K.covH1 * c, K.covV0 + K.covV1 * c];
}

/**
 * 一定挥的「合」（0..1）= 打者的挥棒热区在来球位置的浓度：以挥棒点为中心向四周渐淡（和投手的散布一样是一块热区），
 * 宽窄看击球能力；左右宽、上下窄——左右差一点还能靠球棒长短补，上下差一点就挥空。
 */
export function commitFit(dx: number, dy: number, con: number): number {
  const [sh, sv] = coverWidth(con);
  return Math.exp(-((dx / sh) ** 2) - (dy / sv) ** 2);
}

/** 挥棒热区画在网格上（121 格，每格的「合」） */
export function coverMap(cx: number, cy: number, con: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const [x, y] = cellCenter(i, j);
      out.push(commitFit(x - cx, y - cy, con));
    }
  return out;
}

/**
 * 玩家按了「挥棒」：一定出棒（坏球也挥），挥棒热区对着自己定的挥棒点。来球落在热区越浓的地方越容易打中、打得越扎实，离得远就挥空或界外、软弱；
 * 上下差得比左右更要命。打到球的下半部（球比范围中心高）容易飞高，上半部容易打成滚地。
 */
function committedSwing(o: SwingIn, r: Rng, strike: boolean, qz: number): SwingOut {
  const K = SWING_K;
  // 极端内角：躲不开，触身球
  if (o.x * o.insideSign > 1.65 && r.rand() < 0.22) return { res: 'hbp', swing: false, m: 0, solid: 0 };
  const [hx, hy] = o.at ?? zoneCenter(o.hunt);
  const dy = o.y - hy;
  const m = commitFit(o.x - hx, dy, o.con);
  const pc = clamp(K.cCon0 + K.cConFit * m + 0.5 * K.conSkill * z(o.con) - K.conQ * qz + (o.hang ? 0.1 : 0), 0.02, 0.97);
  if (r.rand() >= pc) return { res: 'swinging', swing: true, m, solid: 0 };
  const pf = clamp(K.cFoul0 + K.cFoulFit * (1 - m) + (strike ? 0 : 0.06) - (o.hang ? 0.08 : 0), 0.12, 0.8);
  if (r.rand() < pf) return { res: 'foul', swing: true, m, solid: 0 };
  const ba = hotAt(o.hot, o.x, o.y);
  const solid = clamp(K.solid0 + 1.9 * (ba - 0.29) + K.cSolidFit * (m - 0.75) + (m >= 0.85 ? K.cSit : 0) - 0.13 * qz + (o.hang ? 0.12 : 0) + r.gauss(0, 0.17), 0.01, 0.99);
  return { res: 'inplay', swing: true, m, solid, lift: clamp(dy / 0.67, -1, 1) };
}

// ======================= 牵制 =======================
/** 投手的牵制能力 0..100：控球、守备、肩力、沉着，左投手牵制一垒更有利，有「牵制○」「快速投球」再加分 */
export function pickoffSkill(p: Player): number {
  return clamp(
    0.35 * p.a.control + 0.25 * p.a.fielding + 0.2 * p.a.arm + 0.2 * p.a.mental + (p.throws === 'L' ? 8 : 0) + (has(p, 'pickoff') ? 15 : 0) + (has(p, 'quick') ? 8 : 0),
    0,
    100,
  );
}
