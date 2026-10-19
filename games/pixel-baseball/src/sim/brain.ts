// 逐球的打算：投手这一球想投什么、瞄哪里（可能同时有好几个打算，这就是打者看到的热区图），
// 打者狙哪一格，跑者跑不跑。对手 AI 用比赛自己的随机数；替玩家拿主意的教练用本地随机数（不影响比赛重演）。
import type { Match, TeamState } from './match';
import type { PitchType, Player } from '../core/types';
import type { PAMemo } from './types';
import { PITCH_DEFS } from '../data/pitches';
import { clamp, z } from '../core/util';
import { has } from '../core/attrs';
import { hash32 } from '../core/rng';
import { arsenal, batSide, density, hotAt, hotZones, inZone, makeRng, nearZone, spreadOf, zoneCenter, type PitchOpt, type PitcherNow, type Rng, type Spread } from './pitching';

/** 投手这一球的一个打算 */
export interface MindOpt {
  type: PitchType | 'FB';
  x: number;
  y: number;
  w: number;
}

/** 投手这一球的打算：1～3 个目标，权重加起来是 1 */
export interface Mind {
  opts: MindOpt[];
}

/** 候选目标：九宫格中心、好球带边缘、坏球区一圈 */
const TARGETS: [number, number][] = (() => {
  const t: [number, number][] = [];
  for (let zn = 0; zn < 9; zn++) t.push(zoneCenter(zn));
  for (const v of [-0.86, 0, 0.86]) for (const w of [-0.86, 0, 0.86]) if (v !== 0 || w !== 0) t.push([v, w]);
  for (const v of [-1.14, 0, 1.14]) for (const w of [-1.14, 0, 1.14]) if (v !== 0 || w !== 0) t.push([v, w]);
  t.push([0, -1.36], [-1.36, -0.5], [1.36, -0.5]);
  return t;
})();

/** 标准正态分布函数（近似） */
function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** 瞄准 (x, y) 时进好球带的概率（按圆形散布近似） */
export function strikeProb(x: number, y: number, s: number): number {
  const px = phi((1 - x) / s) - phi((-1 - x) / s);
  const py = phi((1 - y) / s) - phi((-1 - y) / s);
  return px * py;
}

/** 上一个打席这个打者被怎么解决 / 怎么打中（AI 据此调整） */
function lastVs(m: Match, bat: number, side: 0 | 1): PAMemo | null {
  for (let i = m.memo.length - 1; i >= 0; i--) {
    const x = m.memo[i];
    if (x.bat === bat && x.side === side) return x;
  }
  return null;
}

const isHitRes = (r: string) => r === '1B' || r === '2B' || r === '3B' || r === 'HR';

/**
 * 投手这一球的打算。看球数、打者的冷热区、自己各球种的质量、这个打者上一个打席的结果；
 * 选出最好的一个，再按投手的心思加上一两个分量差不多、但球种或位置不同的备选（打者要猜）。
 */
export function pitcherMind(m: Match, t: TeamState, now: PitcherNow, r: Rng): Mind {
  const p = t.get(t.pitcher);
  const b = m.batter();
  const side = batSide(b, p.throws);
  const hot = hotZones(b, side);
  const f = t.fatigueRatio(p.id);
  const ars = arsenal(p, now);
  const balls = m.balls;
  const strikes = m.strikes;
  const behind = balls === 3 || (balls - strikes >= 2);
  const ahead = strikes === 2 && balls <= 2;
  const prev = lastVs(m, b.id, m.half);
  const read = 0.35 + t.s.mgrTactics / 160;
  const u = m.useOf(p.id);
  // 投手眼里每种结果的分量（正 = 对投手有利）：坏球（第四个是保送）、好球（第三个是三振）、界外、被打进场
  const vBall = balls === 3 ? -0.34 : -0.04 - balls * 0.015;
  const vStrike = strikes === 2 ? 0.3 : 0.07;
  const vFoul = strikes === 2 ? 0 : 0.05;
  const vPlay = (ba: number) => -1.25 * ba + 0.18 * (1 - ba);
  const cands: { o: PitchOpt; x: number; y: number; v: number }[] = [];
  for (const o of ars) {
    const sp = spreadOf(o.type, p.throws, now.ctl, o.q, f);
    const breaking = o.type !== 'FB' && PITCH_DEFS[o.type].family !== 'fast';
    const qz = (o.q - 50) / 50;
    for (const [x, y] of TARGETS) {
      // 变化球的落点会顺着变化方向偏一点
      const ex = x + sp.u[0] * sp.s * 0.3;
      const ey = y + sp.u[1] * sp.s * 0.3;
      const pz = strikeProb(ex, ey, sp.s);
      const baIn = hot[nearZone(ex, ey)];
      const baOut = hotAt(hot, ex, ey) * (inZone(ex, ey) ? 0.45 : 1);
      // 一般打者的反应：好球带里多半出棒；坏球要看球的质量（变化球、两好球后更容易追打）
      const swIn = strikes === 2 ? 0.82 : balls === 3 ? 0.5 : 0.64;
      const swOut = clamp(0.22 + 0.12 * qz + (breaking ? 0.08 : 0) + (strikes === 2 ? 0.14 : 0) - (balls === 3 ? 0.1 : 0), 0.05, 0.6);
      const whIn = clamp(0.2 + 0.2 * qz, 0.05, 0.55);
      const whOut = clamp(0.42 + 0.2 * qz, 0.15, 0.8);
      const vIn = swIn * (whIn * vStrike + (1 - whIn) * (0.38 * vFoul + 0.62 * vPlay(baIn))) + (1 - swIn) * vStrike;
      const vOut = swOut * (whOut * vStrike + (1 - whOut) * (0.5 * vFoul + 0.5 * vPlay(baOut))) + (1 - swOut) * vBall;
      let v = (pz * vIn + (1 - pz) * vOut) * 100;
      // 正中的球：失投被打远的风险
      if (Math.abs(x) < 0.4 && Math.abs(y) < 0.4) v -= behind ? 1 : 4;
      // 累了多用直球
      if (f > 0.85 && o.type === 'FB') v += 1.5;
      // 上一个打席
      if (prev?.last) {
        const L = prev.last;
        if (isHitRes(prev.res) && L.t === o.type) v -= 3 * read;
        if (prev.res === 'K' && L.t === o.type && ahead) v += 3 * read;
      }
      // 打者会从这场比赛学：同一个球种、同一个位置用得太多容易被抓住
      if (u.tw > 3) v -= (6 * Math.max(0, (u.rt[o.type] ?? 0) / u.tw - 0.45) + 5 * Math.max(0, u.rz[nearZone(x, y)] / u.tw - 0.3)) * read;
      // 直球是根本：落后时多投直球抢好球，两好球后才多用变化球（高中投手大约六成是直球）
      if (o.type === 'FB') v += behind ? 3 : ahead ? 0.5 : 1.5;
      v += r.gauss(0, 1.2);
      cands.push({ o, x, y, v });
    }
  }
  cands.sort((a, c) => c.v - a.v);
  const best = cands[0];
  const picked = [best];
  // 再加一两个备选：球种不同，或者位置离得远
  const extra = (r.rand() < 0.55 ? 1 : 0) + (r.rand() < 0.25 ? 1 : 0);
  for (const c of cands.slice(1)) {
    if (picked.length > extra) break;
    if (c.v < best.v - 3.5) break;
    const far = picked.every((q) => Math.hypot(q.x - c.x, q.y - c.y) > 0.7 || q.o.type !== c.o.type);
    const differ = picked.every((q) => q.o.type !== c.o.type || Math.hypot(q.x - c.x, q.y - c.y) > 0.9);
    if (far && differ) picked.push(c);
  }
  const ws = picked.map((c) => Math.exp((c.v - best.v) / 1.8));
  const tot = ws.reduce((a, c) => a + c, 0);
  return { opts: picked.map((c, i) => ({ type: c.o.type, x: c.x, y: c.y, w: ws[i] / tot })) };
}

/** 打者眼里的热区图有多不准：落点偏多少（err0 + err1 ×（1 - 准确度））、糊多少、多看出假热点的机会 */
export const VIEW_K = { err0: 0.03, err1: 0.16, blur: 0.22, decoyAcc: 0.5, decoyP: 0.6, decoyW: 0.25 };

/** 打者读投手的准确度 0..1：看选球眼（「选球眼差」的人再打折） */
export function eyeAccuracy(b: Player): number {
  const eye = b.a.eye - (has(b, 'eyeX') ? 10 : 0);
  return clamp((eye - 15) / 75, 0, 1);
}

/**
 * 打者眼里这一球的热区图（网格 121 格的概率）：选球眼越好越接近投手真正的打算；
 * 眼力差的人看到的热点会偏、会糊，分量看不准，还可能多看出一个假的热点。按比赛种子和第几球固定，同一球怎么看都一样。
 */
export function batterView(m: Match, seed: number, step: number): number[] | null {
  const mind = m.mind;
  const sp = m.mindSp;
  if (!mind || !sp) return null;
  // 选球眼越好越准；同一个投手看到第二、第三个打席也越来越准
  const b = m.batter();
  const acc = clamp(eyeAccuracy(b) + 0.06 * Math.min(3, m.timesFaced(b.id, m.pitcher().id)), 0, 1);
  const r = makeRng(hash32(seed, step, 7));
  const K = VIEW_K;
  const err = K.err0 + K.err1 * (1 - acc);
  const n = mind.opts.length;
  const aims = mind.opts.map((o, i) => ({
    x: o.x + r.gauss(0, err),
    y: o.y + r.gauss(0, err),
    w: o.w * (0.4 + 0.6 * acc) + ((1 - acc) * 0.6) / n,
    sp: { ...sp[i], s: sp[i].s * (1 + K.blur * (1 - acc)) },
  }));
  if (acc < K.decoyAcc && r.rand() < K.decoyP - acc) aims.push({ x: r.gauss(0, 0.55), y: r.gauss(0, 0.55), w: K.decoyW * (1 - acc), sp: { ...sp[0], s: sp[0].s * 1.15 } });
  return density(aims, hash32(seed, step, 5));
}

/** 按权重从打算里挑出这一球 */
export function pickOpt(mind: Mind, r: Rng): MindOpt {
  let x = r.rand();
  for (const o of mind.opts) {
    x -= o.w;
    if (x < 0) return o;
  }
  return mind.opts[mind.opts.length - 1];
}

/** 每个打算的散布（画热区图、估计落点用） */
export function mindSpreads(mind: Mind, p: Player, now: PitcherNow, fatigue: number): Spread[] {
  const ars = arsenal(p, now);
  return mind.opts.map((o) => {
    const q = ars.find((a) => a.type === o.type)?.q ?? 40;
    return spreadOf(o.type, p.throws, now.ctl, q, fatigue);
  });
}

/**
 * 打者这一球狙哪一格（-1 = 不挥棒）。看得到投手打算的时候（mind），挑球最可能来、自己又打得好的那一格；
 * 看不到（对手是玩家）就按球数和这个投手今天的配球猜。选球眼越好挑得越准；两好球后不会不挥棒。
 */
export function batterHunt(m: Match, t: TeamState, mind: Mind | null, spreads: Spread[] | null, r: Rng): number {
  const b = m.batter();
  const p = m.pitcher();
  const side = batSide(b, p.throws);
  const hot = hotZones(b, side);
  const balls = m.balls;
  const strikes = m.strikes;
  const eye = b.a.eye - (has(b, 'eyeX') ? 10 : 0);
  // 每一格球来的可能
  const arrive = new Array<number>(9).fill(0);
  let pStrike = 0.55;
  if (mind && spreads) {
    pStrike = 0;
    mind.opts.forEach((o, i) => {
      const sp = spreads[i];
      // 变化球会顺着变化方向偏一点
      const ox = o.x + sp.u[0] * sp.s * 0.4;
      const oy = o.y + sp.u[1] * sp.s * 0.4;
      pStrike += o.w * strikeProb(ox, oy, sp.s);
      for (let zn = 0; zn < 9; zn++) {
        const [cx, cy] = zoneCenter(zn);
        arrive[zn] += o.w * Math.exp(-((Math.hypot(ox - cx, oy - cy) / (0.42 + sp.s)) ** 2));
      }
    });
  } else {
    const u = m.useOf(p.id);
    for (let zn = 0; zn < 9; zn++) {
      const col = zn % 3;
      const row = Math.floor(zn / 3);
      let a = row === 1 && col === 1 ? 1 : row === 1 || col === 1 ? 0.8 : 0.6;
      if (u.n >= 12) {
        const insideCol = side === 'R' ? 0 : 2;
        if (col === insideCol) a *= 0.7 + (u.in / u.n) * 1.5;
        else if (col === 2 - insideCol) a *= 0.7 + (u.out / u.n) * 1.5;
        if (row === 0) a *= 0.7 + (u.high / u.n) * 1.5;
        else if (row === 2) a *= 0.7 + (u.low / u.n) * 1.5;
      }
      arrive[zn] = a;
    }
  }
  // 看不透投手（对手是玩家、教练，只能猜）：参考这场比赛学到的这个投手的落点，越有把握越照着猜
  const lz = mind && (mind === m.mind || mind === m.coachMind) ? null : m.learnedZones(p.id, b);
  if (lz) {
    const tot = arrive.reduce((a, c) => a + c, 0) || 1;
    for (let zn = 0; zn < 9; zn++) arrive[zn] = (1 - lz.L) * (arrive[zn] / tot) + lz.L * lz.z[zn];
  }
  // 打者有利的球数、投手又不太进好球带：等
  if (strikes < 2) {
    let pTake = 0;
    if (balls === 3 && strikes === 0) pTake = 0.75;
    else if (balls >= 2 && balls > strikes) pTake = pStrike < 0.5 ? 0.42 : 0.16;
    else if (balls === 0 && strikes === 0) pTake = 0.08 - (has(b, 'firstPitch') ? 0.08 : 0);
    pTake += 0.12 * z(eye) * (pStrike < 0.5 ? 1 : -0.5);
    if (r.rand() < clamp(pTake, 0, 0.9)) return -1;
  }
  const score = arrive.map((a, zn) => a * (strikes === 2 ? 1 : 0.55 + 3 * (hot[zn] - 0.2)));
  // 选球眼越好越会挑：好的打者几乎按分数选，差的打者常常乱猜
  const temp = 0.06 + 0.28 * (1 - clamp(eye, 0, 100) / 100);
  const top = Math.max(...score);
  const w = score.map((s) => Math.exp((s - top) / Math.max(0.02, temp * top)));
  let x = r.rand() * w.reduce((a, c) => a + c, 0);
  for (let zn = 0; zn < 9; zn++) {
    x -= w[zn];
    if (x < 0) return zn;
  }
  return 4;
}

/** 教练替玩家决定跑者：脚快、捕手肩弱、球数有利才跑；二垒有人时一垒不单独跑 */
export function coachRun(m: Match, t: TeamState, r: Rng): [boolean, boolean, boolean] {
  const run: [boolean, boolean, boolean] = [false, false, false];
  if (m.outs >= 2 && m.strikes === 2) return run;
  const cat = m.dfn.fielder('C');
  const [r1, r2, r3] = m.bases;
  if (r1 && !r2) {
    const rp = t.get(r1.pid);
    const spd = rp.a.speed + (has(rp, 'steal') ? 10 : 0) + 0.3 * (rp.a.baserun - 50);
    if (spd >= 64 && cat.a.arm <= 75 && r.rand() < 0.08 * ((spd - 55) / 15) * (m.balls > m.strikes ? 1.4 : 1)) run[0] = true;
  }
  if (r2 && !r3 && !r1 && m.outs === 1) {
    const rp = t.get(r2.pid);
    if (rp.a.speed >= 75 && r.rand() < 0.03) run[1] = true;
  }
  return run;
}

/** 教练替玩家决定这一球投什么、瞄哪里（用投手打算里权重最高的那个，偶尔用备选） */
export function coachThrow(m: Match, t: TeamState, now: PitcherNow, r: Rng): { type: PitchType | 'FB'; x: number; y: number; mind: Mind } {
  const mind = pitcherMind(m, t, now, r);
  const o = pickOpt(mind, r);
  return { type: o.type, x: o.x, y: o.y, mind };
}

/** 教练替玩家决定这一球狙哪一格 */
export function coachHunt(m: Match, t: TeamState, mind: Mind | null, spreads: Spread[] | null, r: Rng): number {
  return batterHunt(m, t, mind, spreads, r);
}

/** 跑者离垒的大小：要跑的人多半离得大，不跑的人偶尔也故意离大（虚张声势） */
export function leadFor(going: boolean, rp: Player, r: Rng): 'big' | 'normal' {
  const bold = 0.08 + Math.max(0, rp.a.speed - 60) * 0.004 + (has(rp, 'steal') ? 0.06 : 0);
  return r.rand() < (going ? 0.8 : bold) ? 'big' : 'normal';
}

export { nearZone };
