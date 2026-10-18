// 比赛画面：进攻时从打者（捕手）身后看，防守时从投手身后看。一球一球地演出投球、挥棒与球的变化
import type { PitchType, TeamColors } from '../core/types';
import type { Alignment, BipInfo, PitchInfo } from '../sim/types';
import { PITCH_DEFS } from '../data/pitches';
import { PAL, disc, ease, ellipse, line, makeCanvas, poly, prng, rect, shade, type Ctx } from './pix';
import * as F from './figure';

export const SW = 360;
export const SH = 240;

export type ViewMode = 'bat' | 'pitch';
/** 这一球打者的反应 */
export type Swing = 'take' | 'miss' | 'foul' | 'hit' | 'bunt' | 'buntMiss' | 'buntFoul' | 'hbp';

export interface Person {
  look: F.Look;
  /** 打者：站哪边；投手：哪只手投 */
  side: 'R' | 'L';
}

export interface StageScene {
  mode: ViewMode;
  batter: Person;
  pitcher: Person;
  /** 守方野手、攻方跑者的样子 */
  fielder: F.Look;
  runner: F.Look;
  bases: [boolean, boolean, boolean];
  align: Alignment;
  /** 这个打席是触击的架势 */
  bunting: boolean;
}

interface Track {
  t: number;
  dur: number;
  step: (k: number) => void;
  done?: () => void;
  resolve: () => void;
}

interface Marker {
  x: number;
  y: number;
  n: number;
  col: string;
}

const DIRT = '#b9804e';
const DIRT_D = '#9c6a3f';
const GRASS = '#3f9a4a';
const GRASS_D = '#358a41';
const GRASS_L = '#4aa955';
const SKIN = '#e8b48a';

/** 球种的变化（米）：dx 以右投手、从捕手看向右为正；dy 向下为正 */
function breakOf(t: PitchType | 'FB', lv: number, rnd: () => number): { dx: number; dy: number; wobble: boolean } {
  if (t === 'FB') return { dx: -0.03, dy: -0.04, wobble: false };
  const d = PITCH_DEFS[t];
  const L = Math.max(1, lv);
  const fast = d.family === 'fast';
  const lat = fast ? 0.05 + L * 0.012 : 0.09 + L * 0.03;
  const drop = fast ? 0.04 + L * 0.01 : 0.1 + L * 0.045;
  switch (d.dir) {
    case 'R':
      return { dx: lat, dy: fast ? 0.02 : drop * 0.25, wobble: false };
    case 'L':
      return { dx: -lat, dy: fast ? 0.03 : drop * 0.3, wobble: false };
    case 'D':
      return { dx: 0, dy: drop * 1.1, wobble: false };
    case 'DR':
      return { dx: lat * 0.7, dy: drop, wobble: false };
    case 'DL':
      return { dx: -lat * 0.7, dy: drop * 0.9, wobble: false };
    default:
      return { dx: (rnd() - 0.5) * 0.3, dy: 0.1 + rnd() * 0.2, wobble: true };
  }
}

export class MatchStage {
  readonly cv: HTMLCanvasElement;
  private c: Ctx;
  private bg: Record<ViewMode, HTMLCanvasElement>;
  private scene: StageScene | null = null;
  speed = 1;
  /** 立即完成所有动画（跳过） */
  private skipping = false;
  private tracks: Track[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  // 动态元素
  private pPose: F.Pose = F.PF_SET;
  private bPose: F.Pose = F.BAT_STANCE;
  private ball: { x: number; y: number; r: number } | null = null;
  private trail: { x: number; y: number; r: number }[] = [];
  private markers: Marker[] = [];
  private flash: { text: string; sub: string; col: string; t: number } | null = null;
  private radar: { kmh: number; name: string; t: number } | null = null;
  private mitt: { x: number; y: number } | null = null;
  private pop: { x: number; y: number; t: number } | null = null;
  private flinch = 0;
  private catcherMitt: [number, number] = [0, 0];
  private sb: { away: string; home: string; score: [number, number]; balls: number; strikes: number; outs: number } | null = null;

  /** 中外野记分牌上的比分与球数灯 */
  setBoard(b: { away: string; home: string; score: [number, number]; balls: number; strikes: number; outs: number }): void {
    this.sb = b;
  }

  constructor(cv: HTMLCanvasElement, o: { koshien: boolean; home: TeamColors; away: TeamColors }) {
    this.cv = cv;
    cv.width = SW;
    cv.height = SH;
    this.c = cv.getContext('2d')!;
    this.bg = { bat: drawBatBg(o.koshien, o.home, o.away), pitch: drawPitchBg(o.koshien, o.home, o.away) };
    this.draw();
  }

  /** 新的打席：设定双方人物、跑者、守备阵型 */
  setScene(s: StageScene): void {
    this.scene = s;
    this.markers = [];
    this.ball = null;
    this.trail = [];
    this.flash = null;
    this.mitt = null;
    this.pop = null;
    this.flinch = 0;
    this.pPose = s.mode === 'bat' ? this.pf(F.PF_SET) : this.pb(F.PB_SET);
    this.bPose = this.batterIdle();
    this.catcherMitt = [0, 0];
    this.kick();
  }

  /** 跑者有变化（盗垒、暴投之后） */
  setBases(b: [boolean, boolean, boolean]): void {
    if (this.scene) this.scene.bases = b;
    this.kick();
  }

  private batterIdle(): F.Pose {
    const s = this.scene!;
    const p = s.mode === 'bat' ? (s.bunting ? F.BAT_BUNT : F.BAT_STANCE) : s.bunting ? F.BF_BUNT : F.BF_STANCE;
    return this.bside(p);
  }

  /** 投手姿势：打者视角看正面（右投手的右手在画面左边），左投手镜像 */
  private pf(p: F.Pose): F.Pose {
    return this.scene?.pitcher.side === 'L' ? F.mirror(p) : p;
  }

  /** 投手姿势：投手视角看背面（右投手的右手在画面右边） */
  private pb(p: F.Pose): F.Pose {
    return this.scene?.pitcher.side === 'L' ? F.mirror(p) : p;
  }

  /** 打者姿势：打者视角里右打者站左边面向右；投手视角里右打者站右边面向左（姿势数据都按右打者画） */
  private bside(p: F.Pose): F.Pose {
    return this.scene?.batter.side === 'L' ? F.mirror(p) : p;
  }

  // ---------------- 几何 ----------------
  private zoneRect(): { cx: number; cy: number; hw: number; hh: number } {
    return this.scene?.mode === 'pitch' ? { cx: 180, cy: 113, hw: 6, hh: 8 } : { cx: 180, cy: 165, hw: 19, hh: 26 };
  }

  /** 好球带坐标 → 画面坐标（投手视角左右相反） */
  private zoneXY(x: number, y: number): [number, number] {
    const z = this.zoneRect();
    const sx = this.scene?.mode === 'pitch' ? -x : x;
    return [z.cx + sx * z.hw, z.cy - y * z.hh];
  }

  private batterFeet(): [number, number] {
    const s = this.scene!;
    if (s.mode === 'bat') return [s.batter.side === 'R' ? 120 : 240, 237];
    return [s.batter.side === 'R' ? 196 : 164, 132];
  }

  private pitcherFeet(): [number, number] {
    const s = this.scene!;
    if (s.mode === 'bat') return [180, 131];
    return [s.pitcher.side === 'R' ? 134 : 226, 266];
  }

  private pitcherH(): number {
    return this.scene?.mode === 'bat' ? 34 : 124;
  }

  private releasePoint(): [number, number] {
    const [fx, fy] = this.pitcherFeet();
    const h = this.pitcherH();
    const s = h / 100;
    const pose = this.scene!.mode === 'bat' ? this.pf(F.PF_RELEASE) : this.pb(F.PB_RELEASE);
    // 投球的手：打者视角里右投手是 a（画面左），投手视角里是 b（画面右）
    const hand = this.scene!.mode === 'bat' ? (this.scene!.pitcher.side === 'R' ? pose.ha[0] : pose.ha[1]) : this.scene!.pitcher.side === 'R' ? pose.ha[1] : pose.ha[0];
    return [fx + hand[0] * s, fy + hand[1] * s];
  }

  // ---------------- 动画 ----------------
  private kick(): void {
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (now: number): void => {
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    const sp = this.skipping ? 1000 : this.speed;
    for (const tr of this.tracks) {
      tr.t = Math.min(tr.dur, tr.t + dt * sp);
      tr.step(tr.dur ? tr.t / tr.dur : 1);
    }
    const fin = this.tracks.filter((t) => t.t >= t.dur);
    this.tracks = this.tracks.filter((t) => t.t < t.dur);
    for (const f of fin) {
      f.done?.();
      f.resolve();
    }
    if (this.flash) this.flash.t -= dt * (this.skipping ? 1000 : this.speed);
    if (this.flash && this.flash.t <= 0) this.flash = null;
    if (this.pop) {
      this.pop.t -= dt * 3;
      if (this.pop.t <= 0) this.pop = null;
    }
    if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt * 3);
    this.draw();
    // 观众的晃动需要一直画；没有动画时降低频率
    this.raf = requestAnimationFrame(this.frame);
  };

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.finishAll();
  }

  private finishAll(): void {
    const ts = this.tracks;
    this.tracks = [];
    for (const t of ts) {
      t.step(1);
      t.done?.();
      t.resolve();
    }
  }

  /** 跳过：当前和之后的动画全部瞬间完成，直到 resume() */
  skip(): void {
    this.skipping = true;
    this.finishAll();
  }

  resume(): void {
    this.skipping = false;
  }

  get isSkipping(): boolean {
    return this.skipping;
  }

  private run(dur: number, step: (k: number) => void, done?: () => void): Promise<void> {
    if (this.skipping || dur <= 0) {
      step(1);
      done?.();
      return Promise.resolve();
    }
    this.kick();
    return new Promise((resolve) => this.tracks.push({ t: 0, dur, step, done, resolve }));
  }

  private wait(sec: number): Promise<void> {
    return this.run(sec, () => {});
  }

  /** 大字提示（安打！三振！） */
  banner(text: string, col: string = PAL.yellow, sub = '', secs = 1.1): Promise<void> {
    this.flash = { text, sub, col, t: secs };
    return this.wait(secs);
  }

  /** 演出一球 */
  async pitch(info: PitchInfo, swing: Swing, bip: BipInfo | null, n: number, lv = 3): Promise<void> {
    const s = this.scene;
    if (!s) return;
    const batView = s.mode === 'bat';
    const rnd = prng(Math.round(info.x * 1000) * 31 + Math.round(info.y * 1000) + n * 7);
    const br = breakOf(info.type, lv, rnd);
    const lefty = s.pitcher.side === 'L';
    const bx = (lefty ? -br.dx : br.dx) * (batView ? 1 : -1);
    const by = br.dy;
    const [tx, ty] = this.zoneXY(info.x, info.y);
    const [rx, ry] = this.releasePoint();
    const z = this.zoneRect();
    const pxm = z.hw / 0.216; // 每米多少像素（在本垒处）
    const Z0 = batView ? 20.5 : 3;
    const Z1 = batView ? 3 : 20.5;
    const w = (u: number) => {
      const Zu = Z0 + (Z1 - Z0) * u;
      return (1 / Zu - 1 / Z0) / (1 / Z1 - 1 / Z0);
    };
    const scaleAt = (u: number) => Z1 / (Z0 + (Z1 - Z0) * u); // 相对本垒处的大小
    const brk = (u: number): [number, number] => {
      // 晚变：大部分变化发生在后半程
      const k = u * u * u;
      const sc = scaleAt(u);
      let ox = bx * pxm * k * sc;
      const oy = by * pxm * k * sc;
      if (br.wobble) ox += Math.sin(u * 14 + rnd() * 6) * 2.5 * u * sc;
      return [ox, oy];
    };
    const [fbx, fby] = brk(1);
    const sx = tx - fbx;
    const sy = ty - fby;
    const ballR = (u: number) => {
      const r = batView ? 0.6 + 2.6 * Math.pow(w(u), 1.6) : 4 - 3.1 * w(u);
      return Math.max(0.6, r);
    };
    const flight = Math.min(1.25, Math.max(0.5, (18.4 / (info.kmh / 3.6)) * 1.55));
    this.mitt = { x: tx, y: ty };
    this.catcherMitt = [info.x, info.y];
    this.ball = null;
    this.trail = [];
    // 1. 投球动作
    const pf = (p: F.Pose) => (batView ? this.pf(p) : this.pb(p));
    const keysP: [number, F.Pose][] = batView
      ? [[0, pf(F.PF_SET)], [0.4, pf(F.PF_LIFT)], [0.75, pf(F.PF_STRIDE)], [1, pf(F.PF_RELEASE)]]
      : [[0, pf(F.PB_SET)], [0.4, pf(F.PB_LIFT)], [0.75, pf(F.PB_STRIDE)], [1, pf(F.PB_RELEASE)]];
    const idle = this.batterIdle();
    const bunt = swing === 'bunt' || swing === 'buntMiss' || swing === 'buntFoul' || s.bunting;
    const bk = (p: F.Pose) => this.bside(p);
    const load = batView ? (bunt ? F.BAT_BUNT : F.BAT_LOAD) : bunt ? F.BF_BUNT : F.BF_STANCE;
    await this.run(0.95, (k) => {
      this.pPose = F.track(keysP, k);
      // 打者在投手抬腿时引棒
      const kb = Math.max(0, (k - 0.45) / 0.55);
      this.bPose = F.mix(idle, bk(load), ease(kb));
    });
    // 2. 球飞行，同时投手送球、打者跨步与挥棒
    const strideP = batView ? (bunt ? F.BAT_BUNT : F.BAT_STRIDE) : bunt ? F.BF_BUNT : F.BF_STANCE;
    const contactP = batView ? F.BAT_CONTACT : F.BF_SWING;
    const followP = batView ? F.BAT_FOLLOW : F.BF_FOLLOW;
    const swings = swing === 'miss' || swing === 'foul' || swing === 'hit';
    const followKeys: [number, F.Pose][] = batView
      ? [[0, pf(F.PF_RELEASE)], [1, pf(F.PF_FOLLOW)]]
      : [[0, pf(F.PB_RELEASE)], [1, pf(F.PB_FOLLOW)]];
    await this.run(flight, (u) => {
      this.pPose = F.track(followKeys, Math.min(1, u * 1.6));
      const k = w(u);
      const [ox, oy] = brk(u);
      const x = rx + (sx - rx) * k + ox;
      const y = ry + (sy - ry) * k + oy;
      const r = ballR(u);
      if (this.ball) {
        this.trail.push({ ...this.ball });
        if (this.trail.length > 4) this.trail.shift();
      }
      this.ball = { x, y, r };
      // 打者：跨步，挥棒在球到本垒前一点开始
      if (swings) {
        const sw = (u - 0.72) / 0.28;
        if (sw < 0) this.bPose = F.mix(bk(load), bk(strideP), ease(u / 0.72));
        else this.bPose = F.mix(bk(strideP), bk(contactP), ease(sw));
      } else this.bPose = F.mix(bk(load), bk(strideP), ease(Math.min(1, u / 0.72)));
    });
    // 3. 结果
    const hitPt = { x: tx, y: ty };
    if (swing === 'hit' || swing === 'foul' || swing === 'bunt' || swing === 'buntFoul') {
      this.pop = { x: hitPt.x, y: hitPt.y, t: 1 };
      this.trail = [];
      const isBunt = swing === 'bunt' || swing === 'buntFoul';
      if (!isBunt) this.bPose = bk(contactP);
      const tgt = this.hitTarget(swing, bip, hitPt);
      const dur = isBunt ? 0.45 : swing === 'foul' ? 0.35 : 0.5;
      await this.run(
        dur,
        (k) => {
          if (!isBunt) this.bPose = F.mix(bk(contactP), bk(followP), ease(Math.min(1, k * 1.8)));
          const kk = ease(k);
          const x = hitPt.x + (tgt.x - hitPt.x) * kk;
          const yLine = hitPt.y + (tgt.y - hitPt.y) * kk;
          const y = yLine - tgt.arc * Math.sin(Math.PI * kk);
          this.ball = { x, y, r: Math.max(0.6, tgt.r0 + (tgt.r1 - tgt.r0) * kk) };
        },
        () => {
          this.ball = null;
        },
      );
    } else if (swing === 'hbp') {
      const [fx, fy] = this.batterFeet();
      this.ball = { x: fx + (batView ? (s.batter.side === 'R' ? 8 : -8) : 0), y: fy - (batView ? 70 : 26), r: batView ? 3 : 1.5 };
      this.flinch = 1;
      this.pop = { x: this.ball.x, y: this.ball.y, t: 1 };
      await this.wait(0.35);
      this.ball = null;
    } else {
      // 进了捕手手套
      if (swing === 'miss') this.bPose = bk(contactP);
      this.pop = { x: tx, y: ty, t: 0.8 };
      await this.run(0.3, (k) => {
        if (swing === 'miss') this.bPose = F.mix(bk(contactP), bk(followP), ease(k));
      });
      this.ball = null;
    }
    // 落点标记
    const col = swing === 'take' ? (Math.abs(info.x) <= 1 && Math.abs(info.y) <= 1 ? PAL.yellow : PAL.lime) : swing === 'miss' || swing === 'buntMiss' ? PAL.orange : swing === 'foul' || swing === 'buntFoul' ? PAL.silver : swing === 'hbp' ? PAL.red : PAL.sky;
    this.markers.push({ x: info.x, y: info.y, n, col });
    this.radar = { kmh: info.kmh, name: info.sig ?? (info.type === 'FB' ? '直球' : PITCH_DEFS[info.type as PitchType].name), t: 3 };
    // 回到预备姿势
    await this.run(0.35, (k) => {
      this.bPose = F.mix(this.bPose, idle, ease(k));
      this.pPose = F.mix(this.pPose, batView ? this.pf(F.PF_SET) : this.pb(F.PB_SET), ease(k));
    });
  }

  /** 击中后球飞向哪里（画面坐标） */
  private hitTarget(swing: Swing, bip: BipInfo | null, from: { x: number; y: number }): { x: number; y: number; arc: number; r0: number; r1: number } {
    const batView = this.scene!.mode === 'bat';
    if (swing === 'bunt' || swing === 'buntFoul') {
      const side = swing === 'buntFoul' ? (from.x < 180 ? -1 : 1) * 90 : (bip ? bip.angle : 0) * 2.4;
      return batView ? { x: from.x + side, y: 214, arc: 4, r0: 2.6, r1: 2 } : { x: from.x - side * 0.6, y: 168, arc: 2, r0: 1.2, r1: 2.4 };
    }
    if (swing === 'foul') {
      return batView ? { x: from.x + (from.x < 180 ? -150 : 150), y: -20, arc: 0, r0: 3, r1: 5 } : { x: from.x + (from.x < 180 ? -60 : 60), y: -10, arc: 0, r0: 1.2, r1: 3 };
    }
    const ang = bip ? bip.angle : 0;
    const kind = bip?.kind ?? 'LD';
    if (batView) {
      // 打向外野：越远越小；滚地球贴着地面往内野滚
      const x = 180 + ang * 3.6;
      if (kind === 'GB') return { x: 180 + ang * 3.2, y: 128, arc: 3, r0: 3, r1: 1.4 };
      if (kind === 'PU') return { x: 180 + ang * 1.2, y: 60, arc: 60, r0: 3, r1: 1.6 };
      if (kind === 'LD') return { x, y: 98, arc: 8, r0: 3, r1: 1 };
      return { x, y: 70, arc: 50, r0: 3, r1: 0.8 };
    }
    // 投手视角：球朝镜头这边飞来
    const x = 180 - ang * 4;
    if (kind === 'GB') return { x: 180 - ang * 3.5, y: 236, arc: 4, r0: 1.2, r1: 3.5 };
    if (kind === 'PU') return { x: 180 - ang, y: 30, arc: 40, r0: 1.2, r1: 2.5 };
    return { x, y: -10, arc: kind === 'LD' ? 6 : 40, r0: 1.2, r1: 4.5 };
  }

  // ---------------- 绘制 ----------------
  draw(): void {
    const c = this.c;
    const s = this.scene;
    const mode: ViewMode = s?.mode ?? 'bat';
    c.drawImage(this.bg[mode], 0, 0);
    crowdShimmer(c, mode, this.time);
    if (!s) return;
    if (mode === 'bat') this.drawBat(s);
    else this.drawPitch(s);
    this.drawHud();
  }

  private drawBat(s: StageScene): void {
    const c = this.c;
    // 野手
    const fl = s.fielder;
    const inf = s.align === 'infieldIn' ? 10 : s.align === 'buntShift' ? 14 : 0;
    const deep = s.align === 'noDoubles' ? -6 : 0;
    const dp = s.align === 'dp' ? 6 : 0;
    const fp: [number, number, number][] = [
      [84, 93 + deep, 11],
      [180, 89 + deep, 11],
      [276, 93 + deep, 11],
      [128 + dp, 117 + inf * 0.6, 15],
      [232 - dp, 117 + inf * 0.6, 15],
      [64 + inf, 157 + inf * 0.5, 17],
      [296 - inf, 157 + inf * 0.5, 17],
    ];
    for (const [x, y, h] of fp) F.drawFigure(c, x, y, h, F.FIELDER, fl, 'front');
    // 跑者
    const bp: [number, number][] = [[318, 152], [180, 107], [42, 152]];
    s.bases.forEach((on, i) => {
      if (!on) return;
      const [x, y] = bp[i];
      F.drawFigure(c, x + (i === 0 ? -8 : i === 2 ? 8 : -6), y + 1, i === 1 ? 14 : 17, i === 2 ? F.mirror(F.RUNNER) : F.RUNNER, s.runner, 'front');
    });
    // 投手
    const [px, py] = this.pitcherFeet();
    F.drawFigure(c, px, py, this.pitcherH(), this.pPose, s.pitcher.look, 'front');
    // 好球带
    this.drawZone();
    // 球
    this.drawBall();
    // 打者（最近）
    const [bx, by] = this.batterFeet();
    const fl2 = this.flinch * (s.batter.side === 'R' ? -6 : 6);
    F.drawFigureOutlined(c, bx + fl2, by, 118, this.bPose, s.batter.look, 'back');
    // 击中 / 进手套的闪光
    this.drawPop();
  }

  private drawPitch(s: StageScene): void {
    const c = this.c;
    // 主审、捕手、打者
    const umpL: F.Look = { ...s.fielder, gear: 'ump', glove: null };
    F.drawFigure(c, 180, 121, 38, F.UMP, umpL, 'front');
    const catL: F.Look = { ...s.fielder, gear: 'catcher', glove: 'b' };
    const cp = { ...F.CATCHER, ha: [F.CATCHER.ha[0], [F.CATCHER.ha[1][0] - this.catcherMitt[0] * 9, F.CATCHER.ha[1][1] - this.catcherMitt[1] * 9]] as [[number, number], [number, number]] };
    F.drawFigure(c, 180, 127, 30, cp, catL, 'front');
    const [bx, by] = this.batterFeet();
    const fl2 = this.flinch * (s.batter.side === 'R' ? 3 : -3);
    // 投手视角里右打者站右边、面向左：姿势数据按「右打者站右边」画，左打者镜像
    F.drawFigure(c, bx + fl2, by, 46, this.bPose, s.batter.look, 'front');
    this.drawZone();
    this.drawBall();
    this.drawPop();
    // 投手（最近，背面）
    const [px, py] = this.pitcherFeet();
    F.drawFigureOutlined(c, px, py, this.pitcherH(), this.pPose, s.pitcher.look, 'back');
  }

  private drawZone(): void {
    const c = this.c;
    const z = this.zoneRect();
    const x0 = Math.round(z.cx - z.hw);
    const y0 = Math.round(z.cy - z.hh);
    const w = Math.round(z.hw * 2);
    const h = Math.round(z.hh * 2);
    if (this.scene?.mode === 'pitch') {
      // 远处的小好球带：先描一圈深色，看得清楚些
      c.globalAlpha = 0.6;
      rect(c, x0 - 1, y0 - 1, w + 3, 1, PAL.ink);
      rect(c, x0 - 1, y0 + h + 1, w + 3, 1, PAL.ink);
      rect(c, x0 - 1, y0 - 1, 1, h + 3, PAL.ink);
      rect(c, x0 + w + 1, y0 - 1, 1, h + 3, PAL.ink);
      c.globalAlpha = 0.9;
    } else c.globalAlpha = 0.55;
    rect(c, x0, y0, w, 1, PAL.white);
    rect(c, x0, y0 + h, w + 1, 1, PAL.white);
    rect(c, x0, y0, 1, h, PAL.white);
    rect(c, x0 + w, y0, 1, h, PAL.white);
    if (this.scene?.mode === 'bat') {
      c.globalAlpha = 0.22;
      for (let i = 1; i < 3; i++) {
        rect(c, x0 + Math.round((w * i) / 3), y0 + 1, 1, h - 1, PAL.white);
        rect(c, x0 + 1, y0 + Math.round((h * i) / 3), w - 1, 1, PAL.white);
      }
    }
    c.globalAlpha = 1;
    // 这个打席每一球的落点
    for (const m of this.markers) {
      const [x, y] = this.zoneXY(m.x, m.y);
      if (this.scene?.mode === 'bat') {
        disc(this.c, x, y, 3.5, PAL.ink);
        disc(this.c, x, y, 2.6, m.col);
      } else {
        rect(this.c, x - 1, y - 1, 2, 2, m.col);
      }
    }
  }

  private drawBall(): void {
    const c = this.c;
    if (!this.ball) return;
    c.globalAlpha = 0.35;
    for (const t of this.trail) disc(c, t.x, t.y, Math.max(0.5, t.r * 0.8), PAL.white);
    c.globalAlpha = 1;
    const b = this.ball;
    if (b.r >= 2) disc(c, b.x, b.y, b.r + 0.6, PAL.ink);
    disc(c, b.x, b.y, b.r, PAL.white);
    if (b.r >= 2.5) rect(c, b.x - 1, b.y - 1, 1, 2, PAL.red);
  }

  private drawPop(): void {
    if (!this.pop) return;
    const c = this.c;
    const { x, y, t } = this.pop;
    const r = 3 + (1 - t) * 8;
    c.globalAlpha = Math.max(0, t);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      line(c, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, x + Math.cos(a) * r, y + Math.sin(a) * r, 1, PAL.yellow);
    }
    c.globalAlpha = 1;
  }

  private drawHud(): void {
    const c = this.c;
    if (this.sb && this.scene?.mode === 'bat') {
      const b = this.sb;
      c.font = '12px FusionPixel, monospace';
      c.textBaseline = 'top';
      c.fillStyle = PAL.white;
      const nm = (s: string) => s.slice(0, 3);
      c.fillText(nm(b.away), 144, 6);
      c.fillText(nm(b.home), 144, 20);
      c.fillStyle = PAL.yellow;
      c.textAlign = 'right';
      c.fillText(String(b.score[0]), 192, 6);
      c.fillText(String(b.score[1]), 192, 20);
      c.textAlign = 'left';
      const lights: [number, number, string][] = [[b.balls, 3, PAL.lime], [b.strikes, 2, PAL.yellow], [b.outs, 2, PAL.red]];
      lights.forEach(([n, max, col], row) => {
        for (let i = 0; i < max; i++) rect(c, 198 + i * 6, 8 + row * 8, 4, 4, i < n ? col : '#2b4a3a');
      });
    }
    if (this.radar && this.radar.t > 0) {
      c.font = '12px FusionPixel, monospace';
      c.textBaseline = 'top';
      const txt = `${this.radar.kmh}km/h ${this.radar.name}`;
      const w = Math.ceil(c.measureText(txt).width) + 8;
      const x = this.scene?.mode === 'bat' ? SW - w - 4 : 4;
      const y = this.scene?.mode === 'bat' ? 44 : 4;
      c.globalAlpha = 0.8;
      rect(c, x, y, w, 15, PAL.ink);
      c.globalAlpha = 1;
      c.fillStyle = PAL.yellow;
      c.fillText(txt, x + 4, y + 2);
    }
    if (this.flash) {
      const f = this.flash;
      c.font = '24px FusionPixel, monospace';
      c.textBaseline = 'middle';
      c.textAlign = 'center';
      const y = this.scene?.mode === 'bat' ? 60 : 168;
      c.fillStyle = PAL.ink;
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [2, 2]]) c.fillText(f.text, SW / 2 + dx, y + dy);
      c.fillStyle = f.col;
      c.fillText(f.text, SW / 2, y);
      if (f.sub) {
        c.font = '12px FusionPixel, monospace';
        c.fillStyle = PAL.ink;
        c.fillText(f.sub, SW / 2 + 1, y + 21);
        c.fillStyle = PAL.white;
        c.fillText(f.sub, SW / 2, y + 20);
      }
      c.textAlign = 'left';
    }
  }
}

// ======================= 背景 =======================
function stands(c: Ctx, y0: number, y1: number, seed: number, home: TeamColors, away: TeamColors, koshien: boolean): void {
  const rnd = prng(seed);
  rect(c, 0, y0, SW, y1 - y0, '#2b3350');
  for (let y = y0 + 2; y < y1; y += 4) {
    rect(c, 0, y + 3, SW, 1, '#22283f');
    for (let x = (y / 4) % 2 ? 1 : 3; x < SW; x += 3 + Math.floor(rnd() * 2)) {
      if (rnd() < 0.18) continue;
      // 阿尔卑斯看台：两边是两队的应援团颜色
      let col: string;
      const side = x < SW * 0.3 ? 0 : x > SW * 0.7 ? 1 : -1;
      if (koshien && side >= 0 && rnd() < 0.75) col = side === 0 ? away.primary : home.primary;
      else col = [PAL.white, PAL.silver, PAL.slate, PAL.yellow, PAL.sky, PAL.red, PAL.green][Math.floor(rnd() * 7)];
      rect(c, x, y, 2, 2, col);
      rect(c, x, y - 1, 2, 1, SKIN);
    }
  }
}

function drawBatBg(koshien: boolean, home: TeamColors, away: TeamColors): HTMLCanvasElement {
  const cv = makeCanvas(SW, SH);
  const c = cv.getContext('2d')!;
  // 天空
  for (let y = 0; y < 26; y++) rect(c, 0, y, SW, 1, shade('#5fa6e8', y / 60));
  stands(c, 22, 72, 11, home, away, koshien);
  // 记分牌
  rect(c, 138, 2, 84, 34, PAL.ink);
  rect(c, 140, 4, 80, 30, '#1f4a33');
  rect(c, 140, 4, 80, 1, PAL.slate);
  // 外野围墙
  rect(c, 0, 72, SW, 10, '#1f5a35');
  rect(c, 0, 72, SW, 2, PAL.yellow);
  for (let x = 6; x < SW; x += 46) rect(c, x, 75, 20, 4, '#2a6e43');
  // 外野草皮（远处窄、近处宽的条纹）
  let y = 82;
  let k = 0;
  while (y < SH) {
    const hgt = 3 + k * 1.3;
    rect(c, 0, y, SW, Math.ceil(hgt), k % 2 ? GRASS : GRASS_L);
    y += hgt;
    k++;
  }
  // 内野泥土
  ellipse(c, 180, 246, 196, 150, DIRT);
  // 内野草皮
  poly(c, [[180, 116], [300, 158], [180, 206], [60, 158]], GRASS);
  poly(c, [[180, 122], [286, 158], [180, 198], [74, 158]], GRASS_D);
  // 投手丘
  ellipse(c, 180, 131, 16, 5, DIRT);
  ellipse(c, 180, 130, 12, 3.5, shade(DIRT, 0.1));
  rect(c, 176, 129, 8, 1, PAL.white);
  // 垒包
  for (const [x, yy] of [[316, 152], [180, 106], [44, 152]] as [number, number][]) {
    poly(c, [[x, yy - 3], [x + 5, yy], [x, yy + 3], [x - 5, yy]], PAL.white);
  }
  // 本垒附近
  ellipse(c, 180, 232, 80, 22, DIRT_D);
  ellipse(c, 180, 232, 72, 18, DIRT);
  // 边线
  line(c, 180, 225, -40, 109, 1, PAL.white);
  line(c, 180, 225, 400, 109, 1, PAL.white);
  // 打击区
  for (const x0 of [124, 196]) {
    rect(c, x0, 212, 40, 1, PAL.white);
    rect(c, x0, 212, 1, 28, PAL.white);
    rect(c, x0 + 40, 212, 1, 28, PAL.white);
  }
  // 本垒板
  poly(c, [[169, 220], [191, 220], [193, 225], [180, 231], [167, 225]], PAL.white);
  return cv;
}

function drawPitchBg(koshien: boolean, home: TeamColors, away: TeamColors): HTMLCanvasElement {
  const cv = makeCanvas(SW, SH);
  const c = cv.getContext('2d')!;
  stands(c, 0, 66, 23, home, away, koshien);
  // 本垒后方的挡网
  rect(c, 0, 62, SW, 34, '#20333a');
  for (let x = 0; x < SW; x += 4) rect(c, x, 62, 1, 34, '#2c464f');
  for (let y = 64; y < 96; y += 4) rect(c, 0, y, SW, 1, '#2c464f');
  rect(c, 0, 94, SW, 6, PAL.navy);
  rect(c, 0, 94, SW, 1, PAL.sky);
  // 草皮
  for (let y = 100; y < SH; y += 6) rect(c, 0, y, SW, 6, (y / 6) % 2 ? GRASS : GRASS_L);
  // 本垒周围的泥土
  ellipse(c, 180, 128, 98, 26, DIRT);
  // 边线（一垒在画面左边）
  line(c, 180, 128, -30, 210, 1, PAL.white);
  line(c, 180, 128, 390, 210, 1, PAL.white);
  // 打击区与本垒板
  for (const x0 of [160, 189]) {
    rect(c, x0, 123, 11, 1, PAL.white);
    rect(c, x0, 123, 1, 10, PAL.white);
    rect(c, x0 + 11, 123, 1, 10, PAL.white);
  }
  poly(c, [[175, 128], [185, 128], [186, 130], [180, 132], [174, 130]], PAL.white);
  // 投手丘（近处）
  ellipse(c, 180, 262, 150, 52, DIRT);
  ellipse(c, 180, 262, 120, 40, shade(DIRT, 0.08));
  rect(c, 160, 226, 40, 3, PAL.white);
  return cv;
}

/** 观众的小动作：随机几个像素闪一下 */
function crowdShimmer(c: Ctx, mode: ViewMode, time: number): void {
  const rnd = prng(Math.floor(time * 6) + (mode === 'bat' ? 1 : 2));
  const y0 = mode === 'bat' ? 24 : 2;
  const y1 = mode === 'bat' ? 70 : 60;
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rnd() * SW);
    const y = y0 + Math.floor(rnd() * ((y1 - y0) / 4)) * 4;
    rect(c, x, y - 2, 2, 1, SKIN);
  }
}

export { SKIN };
