// 球场像素渲染与动画
import type { Pos, TeamColors } from '../core/types';
import type { BipInfo, PitchInfo, RunnerMove } from '../sim/types';
import { localRng } from '../core/rng';

export const FW = 360;
export const FH = 240;
const HX = 180;
const HY = 224;
const K = 1.55; // 像素/米

type XY = { x: number; y: number };

export function polar(distM: number, angDeg: number): XY {
  const a = (angDeg * Math.PI) / 180;
  return { x: HX + distM * K * Math.sin(a), y: HY - distM * K * Math.cos(a) };
}

export const BASES: XY[] = [polar(0, 0), polar(27.43, 45), polar(38.8, 0), polar(27.43, -45)];
const MOUND = polar(18.44, 0);

/** 标准守备位置（距本垒米数, 角度） */
const HOME_POLAR: Record<Pos, [number, number]> = {
  P: [18.4, 0],
  C: [-3.2, 0],
  '1B': [28, 38],
  '2B': [37, 13],
  SS: [37, -13],
  '3B': [28, -38],
  LF: [82, -28],
  CF: [95, 0],
  RF: [82, 28],
};

export type FieldAlign = 'normal' | 'infieldIn' | 'dp' | 'noDoubles' | 'buntShift' | 'close';

/** 俯视球场演出到了某个时刻（接住、落地、传球、进手套、飞出全垒打墙），让外面配上声音 */
export type FieldCue = { k: 'catch'; air: boolean } | { k: 'land' } | { k: 'throw' } | { k: 'glove' } | { k: 'hr' };

/** 打出去的球落下那一刻是什么声音：飞球被接住、滚地球被接到、安打落地、全垒打；滚地安打滚过去不出声 */
function landCue(b: BipInfo): FieldCue | null {
  if (b.res === 'HR') return { k: 'hr' };
  const air = b.kind === 'LD' || b.kind === 'FB' || b.kind === 'PU';
  const hit = b.res === '1B' || b.res === '2B' || b.res === '3B';
  if (air) return hit || b.res === 'E' ? { k: 'land' } : { k: 'catch', air: true };
  return hit ? null : { k: 'catch', air: false };
}

/** 根据守备阵型计算站位 */
function alignedPositions(align: FieldAlign): Record<Pos, XY> {
  const out = {} as Record<Pos, XY>;
  for (const k of Object.keys(HOME_POLAR) as Pos[]) {
    let [d, a] = HOME_POLAR[k];
    const infield = k === '1B' || k === '2B' || k === 'SS' || k === '3B';
    const outfield = k === 'LF' || k === 'CF' || k === 'RF';
    if (align === 'infieldIn' && infield) d -= 8;
    if ((align === 'dp' || align === 'close') && (k === '2B' || k === 'SS')) {
      d -= 2;
      a = a > 0 ? 8 : -8;
    }
    if (align === 'noDoubles' && outfield) d += 9;
    if ((align === 'buntShift' || align === 'close') && (k === '1B' || k === '3B')) d = 17;
    out[k] = polar(d, a);
  }
  return out;
}

export interface FieldOpts {
  koshien: boolean;
  fence: { line: number; center: number };
  homeColors: TeamColors;
  awayColors: TeamColors;
  seed: number;
}

interface Runner {
  pid: number;
  x: number;
  y: number;
  base: number;
}

interface Anim {
  dur: number;
  t: number;
  step: (k: number) => void;
  done?: () => void;
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function dim2(c: [number, number, number]): [number, number, number] {
  return [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7];
}

function fenceAt(o: FieldOpts, angle: number): number {
  const { line, center } = o.fence;
  return line + (center - line) * (1 - Math.pow(Math.abs(angle) / 45, 1.5));
}

/** 生成静态球场背景 */
export function drawStadium(o: FieldOpts): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FW;
  c.height = FH;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(FW, FH);
  const R = localRng(o.seed);
  // 观众：压暗的灰蓝色，不要太花
  const crowdPal = ['#4a5578', '#56607e', '#3f4a68', '#646b86', '#525873', '#6e6a80'];
  const grassA = hex(o.koshien ? '#3a8f3f' : '#38b764');
  const grassB = hex(o.koshien ? '#327f37' : '#2f9e55');
  const dirt = hex(o.koshien ? '#3b2a24' : '#a0663e');
  const dirtL = hex(o.koshien ? '#4a362e' : '#b47a4d');
  const track = hex(o.koshien ? '#5a4032' : '#8f5a37');
  const foul = hex(o.koshien ? '#2c6b31' : '#2a8a4a');
  const wall = hex(o.koshien ? '#1f5a2a' : '#1d2b53');
  const ivy = hex('#2f7a35');
  const ivy2 = hex('#4ba04a');
  const awayC = hex(o.awayColors.primary);
  const homeC = hex(o.homeColors.primary);
  const awayS = hex(o.awayColors.secondary);
  const homeS = hex(o.homeColors.secondary);
  const set = (x: number, y: number, rgb: [number, number, number]) => {
    const i = (y * FW + x) * 4;
    img.data[i] = rgb[0];
    img.data[i + 1] = rgb[1];
    img.data[i + 2] = rgb[2];
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const dx = x + 0.5 - HX;
      const dy = HY - (y + 0.5);
      const r = Math.sqrt(dx * dx + dy * dy) / K;
      const ang = (Math.atan2(dx, dy) * 180) / Math.PI;
      const fair = Math.abs(ang) <= 45 && dy > -4;
      const fz = fenceAt(o, Math.max(-45, Math.min(45, ang)));
      if (fair && r <= fz) {
        // 场内
        if (r >= fz - 4.5) set(x, y, track);
        else if (r <= 28.5 || (r <= 31 && Math.abs(ang) < 40 && o.koshien)) {
          // 内野
          const md = Math.hypot(x - MOUND.x, y - MOUND.y);
          if (md < 4.5) set(x, y, dirtL);
          else if (!o.koshien && r > 6 && r < 24 && Math.abs(ang) < 38 && Math.abs(Math.abs(ang) - 45) > 7) {
            set(x, y, ((Math.floor(r / 4) + (x >> 3)) & 1) === 0 ? grassA : grassB);
          } else set(x, y, dirt);
        } else {
          const band = Math.floor((x + y * 0.5) / 9) & 1;
          set(x, y, band ? grassA : grassB);
        }
      } else if (r <= fz + 7 && dy > -6 && Math.abs(ang) <= 47) {
        // 围墙
        const ivyOn = o.koshien && r > fz && r <= fz + 5;
        if (ivyOn) set(x, y, R() < 0.35 ? ivy2 : ivy);
        else set(x, y, wall);
      } else if (y > HY - 34 && Math.abs(dx) < 120 && dy > -14 && (Math.abs(ang) > 45 || dy < 0) && r < 75) {
        // 界外区（草地 / 土）
        if (Math.abs(ang) > 45 && r < 70) set(x, y, Math.abs(Math.abs(ang) - 45) < 3 && r < 35 ? dirt : foul);
        else set(x, y, dirt);
      } else {
        // 看台：每 3 行一排座位，观众是 2x2 的小色块
        const row = y % 3;
        const alpsLeft = x < 70 && y > 70;
        const alpsRight = x > 290 && y > 70;
        const seat = ((x >> 1) * 7 + Math.floor(y / 3) * 13) % 17;
        if (row === 2) set(x, y, [20, 22, 34]);
        else if (alpsLeft || alpsRight) {
          const base = alpsLeft ? awayC : homeC;
          const acc = alpsLeft ? awayS : homeS;
          const dim = (c: [number, number, number], f: number): [number, number, number] => [c[0] * f, c[1] * f, c[2] * f];
          // 阿尔卑斯看台：两队的颜色，也压暗一些
          set(x, y, seat < 3 ? dim(acc, 0.6) : seat < 12 ? dim(base, 0.62) : dim(base, 0.45));
        } else {
          const p = R();
          if (seat < 6 && p < 0.7) set(x, y, dim2(hex(crowdPal[(seat + (y >> 2)) % crowdPal.length])));
          else set(x, y, seat % 2 ? [44, 50, 74] : [36, 40, 62]);
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  // 记分板
  ctx.fillStyle = '#0f2a1b';
  ctx.fillRect(HX - 34, 2, 68, 22);
  ctx.fillStyle = '#3b5d45';
  ctx.fillRect(HX - 34, 2, 68, 2);
  ctx.fillStyle = '#ffcd75';
  for (let i = 0; i < 9; i++) ctx.fillRect(HX - 28 + i * 6, 10, 3, 4);
  ctx.fillStyle = '#f4f4f4';
  for (let i = 0; i < 9; i++) ctx.fillRect(HX - 28 + i * 6, 16, 3, 4);
  if (o.koshien) {
    // 记分板上方的时钟
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(HX - 4, 0, 8, 2);
  }
  // 白线
  ctx.fillStyle = '#f4f4f4';
  for (const sgn of [-1, 1]) {
    const end = polar(fenceAt(o, 45 * sgn), 45 * sgn);
    const n = Math.ceil(Math.hypot(end.x - HX, end.y - HY));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      ctx.fillRect(Math.round(HX + (end.x - HX) * t), Math.round(HY + (end.y - HY) * t), 1, 1);
    }
    // 标杆
    ctx.fillStyle = '#ffec27';
    ctx.fillRect(Math.round(end.x) - (sgn > 0 ? 0 : 1), Math.round(end.y) - 9, 1, 9);
    ctx.fillStyle = '#f4f4f4';
  }
  // 垒包
  for (let i = 1; i <= 3; i++) {
    const b = BASES[i];
    ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3);
  }
  ctx.fillRect(HX - 1, HY - 1, 3, 2);
  ctx.fillRect(HX, HY + 1, 1, 1);
  // 投手板
  ctx.fillRect(Math.round(MOUND.x) - 1, Math.round(MOUND.y), 3, 1);
  // 打击区
  ctx.fillStyle = 'rgba(244,244,244,0.55)';
  ctx.fillRect(HX - 7, HY - 4, 1, 7);
  ctx.fillRect(HX + 6, HY - 4, 1, 7);
  // 休息区
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(HX - 76, HY - 16, 22, 6);
  ctx.fillRect(HX + 54, HY - 16, 22, 6);
  return c;
}

/** 5x9 小人 */
function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, cap: string, uni: string, accent: string, frame: number, skin = '#f2c6a0'): void {
  const px = Math.round(x) - 2;
  const py = Math.round(y) - 8;
  const B = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(px + dx, py + dy, w, h);
  };
  B(1, 0, 3, 1, cap);
  B(0, 1, 4, 1, cap);
  B(1, 2, 3, 1, skin);
  B(0, 3, 5, 2, uni);
  B(1, 5, 3, 1, accent);
  if (frame === 0) {
    B(1, 6, 1, 2, uni);
    B(3, 6, 1, 2, uni);
    B(1, 8, 1, 1, '#1a1c2c');
    B(3, 8, 1, 1, '#1a1c2c');
  } else {
    B(0, 6, 1, 2, uni);
    B(4, 6, 1, 1, uni);
    B(0, 8, 1, 1, '#1a1c2c');
    B(4, 7, 1, 1, '#1a1c2c');
  }
}

export class FieldRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  o: FieldOpts;
  bg: HTMLCanvasElement;
  fielders: Record<Pos, XY>;
  runners: Runner[] = [];
  batterOn = true;
  batterSide: 'R' | 'L' = 'R';
  align: FieldAlign = 'normal';
  base: Record<Pos, XY> = alignedPositions('normal');
  ball: (XY & { h: number }) | null = null;
  defHome = true; // 守方是否为主队
  anims: Anim[] = [];
  raf = 0;
  last = 0;
  speed = 1;
  /** 演出到了接住、落地、传球、进手套的那一刻（瞬间完成时不通知） */
  onCue: ((c: FieldCue) => void) | null = null;
  private quiet = false;
  frame = 0;
  flash: { text: string; t: number; color: string } | null = null;
  private resolves: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, o: FieldOpts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    canvas.width = FW;
    canvas.height = FH;
    this.o = o;
    this.bg = drawStadium(o);
    this.fielders = this.homePositions();
    this.draw();
  }

  homePositions(): Record<Pos, XY> {
    return alignedPositions(this.align);
  }

  setDefense(home: boolean): void {
    this.defHome = home;
  }

  /** 设置守备阵型（不在动画中时立即移动到新站位） */
  setAlignment(a: FieldAlign): void {
    if (a === this.align) return;
    this.align = a;
    this.base = this.homePositions();
    if (!this.anims.length) {
      this.fielders = this.homePositions();
      this.draw();
    }
  }

  setBases(bases: (number | null)[]): void {
    this.runners = [];
    bases.forEach((pid, i) => {
      if (pid !== null) this.runners.push({ pid, x: BASES[i + 1].x, y: BASES[i + 1].y, base: i + 1 });
    });
  }

  resetPositions(): void {
    this.fielders = this.homePositions();
    this.ball = null;
    this.batterOn = true;
  }

  private colorsOf(def: boolean): { cap: string; uni: string; acc: string } {
    const home = def ? this.defHome : !this.defHome;
    const c = home ? this.o.homeColors : this.o.awayColors;
    return { cap: c.cap || c.primary, uni: home ? '#f4f4f4' : '#b8c0cf', acc: c.primary };
  }

  draw(): void {
    const ctx = this.ctx;
    ctx.drawImage(this.bg, 0, 0);
    const d = this.colorsOf(true);
    const of = this.colorsOf(false);
    const f = Math.floor(this.frame / 8) % 2;
    for (const k of Object.keys(this.fielders) as Pos[]) {
      const p = this.fielders[k];
      const moving = Math.abs(p.x - this.base[k].x) + Math.abs(p.y - this.base[k].y) > 2;
      drawPerson(ctx, p.x, p.y, d.cap, d.uni, d.acc, moving ? f : 0);
    }
    if (this.batterOn) {
      const bx = this.batterSide === 'R' ? HX - 5 : HX + 5;
      drawPerson(ctx, bx, HY + 2, of.cap, of.uni, of.acc, 0);
      ctx.fillStyle = '#c98b5a';
      ctx.fillRect(bx + (this.batterSide === 'R' ? 2 : -3), HY - 9, 1, 4);
    }
    for (const r of this.runners) drawPerson(ctx, r.x, r.y, of.cap, of.uni, of.acc, f);
    // 裁判
    drawPerson(ctx, HX, HY + 12, '#1a1c2c', '#1a1c2c', '#566c86', 0);
    if (this.ball) {
      const b = this.ball;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y), 3, 1);
      ctx.fillStyle = '#ffffff';
      const by = Math.round(b.y - b.h);
      ctx.fillRect(Math.round(b.x) - 1, by - 1, 2, 2);
      if (b.h > 6) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(Math.round(b.x) - 1, by + 1, 2, 1);
      }
    }
    if (this.flash) {
      const fl = this.flash;
      ctx.font = '24px FusionPixel, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0b0c14';
      ctx.fillText(fl.text, HX + 2, 122);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, HX, 120);
    }
  }

  private tick = (now: number): void => {
    // rAF 的时间戳是这一帧的开始时间，可能比启动时记下的 performance.now() 还早：增量不能为负
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)) * this.speed;
    this.last = now;
    this.frame++;
    for (const a of this.anims) {
      a.t = Math.min(a.dur, a.t + dt);
      a.step(a.dur ? a.t / a.dur : 1);
    }
    const finished = this.anims.filter((a) => a.t >= a.dur);
    this.anims = this.anims.filter((a) => a.t < a.dur);
    for (const a of finished) a.done?.();
    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
    }
    this.draw();
    if (this.anims.length || this.flash) this.raf = requestAnimationFrame(this.tick);
    else {
      this.raf = 0;
      const rs = this.resolves;
      this.resolves = [];
      for (const r of rs) r();
    }
  };

  private cue(c: FieldCue | null): void {
    if (c && !this.quiet) this.onCue?.(c);
  }

  private run(anims: Anim[]): Promise<void> {
    if (this.speed >= 50) {
      // 瞬间完成：不出声
      this.quiet = true;
      for (const a of anims) {
        a.step(1);
        a.done?.();
      }
      this.quiet = false;
      this.draw();
      return Promise.resolve();
    }
    this.anims.push(...anims);
    return new Promise((resolve) => {
      this.resolves.push(resolve);
      if (!this.raf) {
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.tick);
      }
    });
  }

  showFlash(text: string, color = '#ffcd75', secs = 1.2): void {
    this.flash = { text, t: secs, color };
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.anims = [];
    const rs = this.resolves;
    this.resolves = [];
    for (const r of rs) r();
  }

  playPitch(p: PitchInfo): Promise<void> {
    const from = { x: MOUND.x, y: MOUND.y - 3 };
    const to = { x: HX + p.x * 2, y: HY - 3 - p.y * 1.5 };
    const dur = 0.42 * (130 / Math.max(90, p.kmh));
    this.ball = { ...from, h: 4 };
    return this.run([
      {
        dur,
        t: 0,
        step: (k) => {
          this.ball = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, h: 4 - 2 * k };
        },
        done: () => {
          if (p.res !== 'inplay') this.ball = null;
        },
      },
    ]);
  }

  /** 击球动画（含跑者推进） */
  playBip(b: BipInfo, moves: RunnerMove[]): Promise<void> {
    this.batterOn = false;
    const land = b.res === 'HR' ? polar(b.dist + 6, b.angle) : polar(Math.min(b.dist, 125), b.angle);
    const peak = b.kind === 'GB' || b.kind === 'BU' ? 0 : b.kind === 'LD' ? 10 : b.kind === 'PU' ? 48 : 18 + b.dist * 0.25;
    const flight = b.kind === 'GB' ? 0.35 + b.dist / 90 : b.kind === 'BU' ? 0.4 : b.kind === 'LD' ? 0.35 + b.dist / 140 : b.kind === 'PU' ? 1.1 : 0.7 + b.dist / 110;
    const start = { x: HX, y: HY - 4 };
    const fielder = b.fielder;
    const f0 = { ...this.fielders[fielder] };
    const anims: Anim[] = [];
    anims.push({
      dur: flight,
      t: 0,
      step: (k) => {
        this.ball = { x: start.x + (land.x - start.x) * k, y: start.y + (land.y - start.y) * k, h: peak * 4 * k * (1 - k) };
      },
      done: () => this.cue(landCue(b)),
    });
    // 野手跑向落点
    if (b.res !== 'HR') {
      const target = b.kind === 'GB' && (fielder === 'LF' || fielder === 'CF' || fielder === 'RF') ? land : land;
      const dist = Math.hypot(target.x - f0.x, target.y - f0.y);
      const reach = Math.min(1, (flight * 70) / Math.max(1, dist));
      anims.push({
        dur: flight,
        t: 0,
        step: (k) => {
          const kk = Math.min(1, k * (1 / Math.max(0.3, reach)) * reach);
          this.fielders[fielder] = { x: f0.x + (target.x - f0.x) * kk * reach, y: f0.y + (target.y - f0.y) * kk * reach };
        },
      });
    } else {
      this.showFlash('HOME RUN!', '#ffcd75', 1.6);
    }
    // 跑者
    const runDur = flight + 0.5;
    for (const m of moves) anims.push(this.runnerAnim(m, runDur));
    return this.run(anims).then(() => {
      // 传球
      if (b.res === 'HR') return;
      const ballAt = this.ball ? { x: this.ball.x, y: this.ball.y } : land;
      let dest: XY | null = null;
      if (b.res === 'out' && b.kind === 'GB') dest = BASES[1];
      else if (b.res === 'DP') dest = BASES[2];
      else if (b.res === '1B' || b.res === '2B' || b.res === '3B') dest = BASES[2];
      else if (b.res === 'SAC' || b.res === 'FC') dest = BASES[1];
      if (!dest) return;
      const d = dest;
      this.cue({ k: 'throw' });
      return this.run([
        {
          dur: 0.28,
          t: 0,
          done: () => this.cue({ k: 'glove' }),
          step: (k) => {
            this.ball = { x: ballAt.x + (d.x - ballAt.x) * k, y: ballAt.y + (d.y - ballAt.y) * k, h: 4 * k * (1 - k) * 8 };
          },
        },
      ]);
    });
  }

  private basePath(from: number, to: number): XY[] {
    const pts: XY[] = [];
    const f = from === 0 ? 0 : from;
    for (let b = f; b <= Math.min(4, to); b++) pts.push(b === 4 ? BASES[0] : BASES[b]);
    return pts;
  }

  private runnerAnim(m: RunnerMove, dur: number): Anim {
    const path = this.basePath(m.from, m.to);
    let r = this.runners.find((x) => x.pid === m.pid);
    if (!r) {
      r = { pid: m.pid, x: path[0].x, y: path[0].y, base: m.from };
      this.runners.push(r);
    }
    const runner = r;
    const segs = Math.max(1, path.length - 1);
    const total = dur * (0.6 + 0.4 * segs);
    return {
      dur: m.out && m.to === m.from ? 0.3 : total,
      t: 0,
      step: (k) => {
        if (path.length < 2) return;
        const pos = k * segs;
        const i = Math.max(0, Math.min(segs - 1, Math.floor(pos)));
        const lt = pos - i;
        const a = path[i];
        const b = path[i + 1];
        const stopAt = m.out ? 0.85 : 1;
        const kk = i === segs - 1 ? Math.min(lt, stopAt) : lt;
        runner.x = a.x + (b.x - a.x) * kk;
        runner.y = a.y + (b.y - a.y) * kk;
      },
      done: () => {
        if (m.out || m.to >= 4) this.runners = this.runners.filter((x) => x !== runner);
        else runner.base = m.to;
      },
    };
  }

  playMoves(moves: RunnerMove[], dur = 0.6): Promise<void> {
    if (!moves.length) return Promise.resolve();
    return this.run(moves.map((m) => this.runnerAnim(m, dur)));
  }
}
