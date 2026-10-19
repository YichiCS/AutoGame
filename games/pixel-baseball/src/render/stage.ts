// 比赛画面（长焦机位）：投球时从投手背后看，打击时从捕手背后看。
// 长焦把投手、打者、捕手「压」在一起；画面中间是放大的瞄准网格（11×11：好球带 9×9 + 外圈坏球区），
// 决定这一球时在网格上看热区、点目标；演出时球飞进网格里的落点。
import type { PitchType, TeamColors } from '../core/types';
import type { Alignment, BipInfo, PitchInfo } from '../sim/types';
import { PITCH_DEFS } from '../data/pitches';
import { CELL, GRID, HALF, cellCenter, zoneCenter } from '../sim/pitching';
import { PAL, disc, ease, ellipse, line, makeCanvas, poly, prng, rect, shade, type Ctx } from './pix';
import * as F from './figure';

export const SW = 360;
export const SH = 360;

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

/** 网格上画的东西（每一球之前由比赛界面设定） */
export interface Hud {
  /** 热区图：网格 121 格的概率（打击时是投手这一球的打算，投球时是瞄准点的散布预览） */
  heat: number[] | null;
  heatCol: string;
  /** 九宫格打击率（9 个，捕手视角左上 → 右下） */
  hot: number[] | null;
  /** 投球：瞄准点（好球带坐标） */
  aim: { x: number; y: number } | null;
  /** 打击：挥棒点（好球带坐标）；null 还没选。cover：挥棒热区（121 格的「合」） */
  hunt: { x: number; y: number } | null;
  cover: number[] | null;
  /** 投球：打者这一球的打算（121 格，0..1，越浓越是他在等、会出棒的地方） */
  intent: number[] | null;
  /** 打击：这一球不挥棒 */
  take: boolean;
  /** 网格能不能点 */
  active: boolean;
}

/** 演出到了某个时刻（出手、挥棒、碰到球、进手套、触身），让外面配上声音 */
export type StageCue =
  | { k: 'release'; kmh: number; dur: number; toward: boolean }
  | { k: 'swing' }
  | { k: 'contact'; q: 'hard' | 'solid' | 'weak' | 'foul' | 'bunt' }
  | { k: 'mitt'; kmh: number }
  | { k: 'hbp' };

/** 打击时热区图的颜色：洋红，和草地、红土、看台都分得开 */
export const HEAT_BAT = '#f45bd0';

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
  shape: PitchShape;
}

/** 落点标记的形状（按球种）：● 直球系、▲ 横向的滑球系、▼ 下坠的曲球 / 指叉、■ 变速球、◆ 下沉 / 螺旋、★ 蝴蝶球 / 陀螺球 */
export type PitchShape = 'o' | 'up' | 'down' | 'sq' | 'dia' | 'star';
export const SHAPE_GLYPH: Record<PitchShape, string> = { o: '●', up: '▲', down: '▼', sq: '■', dia: '◆', star: '★' };

export function pitchShape(t: PitchType | 'FB'): PitchShape {
  if (t === 'FB') return 'o';
  switch (PITCH_DEFS[t].family) {
    case 'fast':
      return 'o';
    case 'slide':
      return 'up';
    case 'drop':
      return 'down';
    case 'off':
      return 'sq';
    case 'reverse':
      return 'dia';
    default:
      return 'star';
  }
}

/** 落点标记的颜色和测速栏的字：按实际的判定（不是按落在好球带的哪里——好坏球边缘要看主审） */
const RES_MARK: Record<string, [string, string]> = {
  called: [PAL.yellow, '好球'],
  ball: [PAL.lime, '坏球'],
  pitchout: [PAL.lime, '坏球'],
  swinging: [PAL.orange, '挥空'],
  bunt_miss: [PAL.orange, '触击落空'],
  foul: [PAL.silver, '界外'],
  bunt_foul: [PAL.silver, '触击界外'],
  hbp: [PAL.red, '触身球'],
  inplay: [PAL.sky, '击中'],
};

const EMPTY_HUD: Hud = { heat: null, heatCol: HEAT_BAT, hot: null, aim: null, hunt: null, cover: null, intent: null, take: false, active: false };

// 球场的颜色（略微压暗、偏冷，让人物和网格更显眼）
const DIRT = '#a8774c';
const DIRT_D = '#8e6340';
const DIRT_L = '#b98757';
const GRASS = '#3c8a47';
const GRASS_D = '#337a3e';
const GRASS_L = '#46985a';
const WALL = '#1d3b33';
const SKY_T = '#5b8fc9';
const SKY_B = '#9cc3e6';

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

/** 画一个落点标记的形状（中心 x, y，半径 r） */
function markShape(c: Ctx, x: number, y: number, s: PitchShape, r: number, col: string): void {
  switch (s) {
    case 'o':
      disc(c, x, y, r - 0.5, col);
      break;
    case 'up':
      poly(c, [[x, y - r * 1.15], [x + r * 1.1, y + r * 0.8], [x - r * 1.1, y + r * 0.8]], col);
      break;
    case 'down':
      poly(c, [[x - r * 1.1, y - r * 0.8], [x + r * 1.1, y - r * 0.8], [x, y + r * 1.15]], col);
      break;
    case 'sq':
      rect(c, x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7, col);
      break;
    case 'dia':
      poly(c, [[x, y - r * 1.15], [x + r * 1.15, y], [x, y + r * 1.15], [x - r * 1.15, y]], col);
      break;
    default: {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.55 : r * 1.2;
        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
      }
      poly(c, pts, col);
    }
  }
}

/** 打中时的声音分量：本垒打、打得又远又平的是「强」，平飞球或打到外野深处是「实」，其余是软弱的「弱」 */
function contactQ(bip: BipInfo | null): 'hard' | 'solid' | 'weak' {
  if (!bip) return 'solid';
  if (bip.res === 'HR' || ((bip.kind === 'LD' || bip.kind === 'FB') && bip.dist >= 85)) return 'hard';
  if (bip.kind === 'LD' || bip.dist >= 55 || bip.res === '2B' || bip.res === '3B') return 'solid';
  return 'weak';
}

/** 颜色往灰蓝里压（观众、应援团用：不要太花） */
function mute(hex: string, k: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt('5a6378', 16);
  const mix = (sh: number) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k);
  return `#${((1 << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).slice(1)}`;
}

export class MatchStage {
  readonly cv: HTMLCanvasElement;
  private c: Ctx;
  private bg: Record<ViewMode, HTMLCanvasElement>;
  private scene: StageScene | null = null;
  private hud: Hud = EMPTY_HUD;
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
  private radar: { kmh: number; name: string; q: number | null; res: string; col: string; shape: PitchShape; t: number } | null = null;
  private pop: { x: number; y: number; t: number } | null = null;
  /** 演出中这一球的瞄准点（看投手投得准不准） */
  private aimShow: { x: number; y: number } | null = null;
  private flinch = 0;
  /** 捕手的手套（好球带坐标） */
  private mitt: [number, number] = [0, 0];
  /** 网格的透明度（演出时淡出） */
  private gridA = 1;
  /** 上次画的时间；有变化要马上重画 */
  private drawnAt = -1;
  private dirty = true;
  /** 演出到了出手、挥棒、碰到球、进手套的那一刻（跳过时不通知） */
  onCue: ((c: StageCue) => void) | null = null;

  constructor(cv: HTMLCanvasElement, o: { koshien: boolean; home: TeamColors; away: TeamColors }) {
    this.cv = cv;
    cv.width = SW;
    cv.height = SH;
    this.c = cv.getContext('2d')!;
    this.bg = { bat: drawBatBg(o.koshien, o.home, o.away), pitch: drawPitchBg(o.koshien, o.home, o.away) };
    this.draw();
  }

  /** 旧接口：比分改由页面上方显示 */
  setBoard(_b: unknown): void {}

  /** 新的打席：设定双方人物、跑者 */
  setScene(s: StageScene): void {
    const sameBatter = this.scene && this.scene.mode === s.mode && this.scene.batter.look === s.batter.look;
    this.scene = s;
    if (!sameBatter) this.markers = [];
    this.ball = null;
    this.trail = [];
    this.flash = null;
    this.pop = null;
    this.flinch = 0;
    this.aimShow = null;
    this.gridA = 1;
    this.pPose = s.mode === 'bat' ? this.pf(F.PF_SET) : this.pb(F.PB_SET);
    this.bPose = this.batterIdle();
    this.mitt = [0, 0];
    this.kick();
  }

  /** 新打席开始：清掉上一个打席的落点 */
  clearMarkers(): void {
    this.markers = [];
    this.kick();
  }

  setHud(h: Hud): void {
    this.hud = h;
    if (h.aim) this.mitt = [h.aim.x, h.aim.y];
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

  /** 打者姿势（姿势数据都按右打者画，左打者镜像） */
  private bside(p: F.Pose): F.Pose {
    return this.scene?.batter.side === 'L' ? F.mirror(p) : p;
  }

  // ---------------- 几何 ----------------
  /** 网格的位置：中心、每格像素、左右是否镜像（投手视角里一垒侧在画面左边） */
  private grid(): { cx: number; cy: number; cs: number; mx: 1 | -1 } {
    return this.scene?.mode === 'pitch' ? { cx: 180, cy: 168, cs: 19, mx: -1 } : { cx: 180, cy: 170, cs: 20, mx: 1 };
  }

  /** 好球带坐标 → 画面坐标 */
  zoneXY(x: number, y: number): [number, number] {
    const g = this.grid();
    const k = g.cs / CELL;
    return [g.cx + g.mx * x * k, g.cy - y * k];
  }

  /** 画面坐标 → 好球带坐标 */
  private screenToZone(px: number, py: number): [number, number] {
    const g = this.grid();
    const k = g.cs / CELL;
    return [((px - g.cx) / k) * g.mx, (g.cy - py) / k];
  }

  /** 点到网格的哪一格（返回那一格中心的好球带坐标）；网格外返回 null */
  cellAtPoint(px: number, py: number): { x: number; y: number } | null {
    const [x, y] = this.screenToZone(px, py);
    if (Math.abs(x) > HALF || Math.abs(y) > HALF) return null;
    const i = Math.min(GRID - 1, Math.floor((x + HALF) / CELL));
    const j = Math.min(GRID - 1, Math.floor((HALF - y) / CELL));
    const [cx, cy] = cellCenter(i, j);
    return { x: cx, y: cy };
  }

  /** 点到九宫格的哪一格（好球带外圈也算到最近的那一格）；网格外返回 -1 */
  zoneAtPoint(px: number, py: number): number {
    const [x, y] = this.screenToZone(px, py);
    if (Math.abs(x) > HALF || Math.abs(y) > HALF) return -1;
    const cx = Math.max(-0.999, Math.min(0.999, x));
    const cy = Math.max(-0.999, Math.min(0.999, y));
    const col = cx < -1 / 3 ? 0 : cx > 1 / 3 ? 2 : 1;
    const row = cy > 1 / 3 ? 0 : cy < -1 / 3 ? 2 : 1;
    return row * 3 + col;
  }

  private batterFeet(): [number, number, number] {
    const s = this.scene!;
    if (s.mode === 'bat') return [s.batter.side === 'R' ? 36 : 324, 430, 290];
    return [s.batter.side === 'R' ? 314 : 46, 300, 158];
  }

  private pitcherFeet(): [number, number, number] {
    const s = this.scene!;
    if (s.mode === 'bat') return [180, 152, 112];
    // 机位偏向一边，投手不挡住打者：打者站右边（右打）投手就在左边，反之亦然
    return [s.batter.side === 'R' ? 58 : 302, 480, 330];
  }

  private releasePoint(): [number, number] {
    const [fx, fy, h] = this.pitcherFeet();
    const s = h / 100;
    const pose = this.scene!.mode === 'bat' ? this.pf(F.PF_RELEASE) : this.pb(F.PB_RELEASE);
    // 投球的手：打者视角里右投手是 a（画面左），投手视角里是 b（画面右）
    const hand = this.scene!.mode === 'bat' ? (this.scene!.pitcher.side === 'R' ? pose.ha[0] : pose.ha[1]) : this.scene!.pitcher.side === 'R' ? pose.ha[1] : pose.ha[0];
    return [fx + hand[0] * s, fy + hand[1] * s];
  }

  // ---------------- 动画 ----------------
  private kick(): void {
    this.dirty = true;
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
    if (this.radar) this.radar.t -= dt;
    if (this.pop) {
      this.pop.t -= dt * 3;
      if (this.pop.t <= 0) this.pop = null;
    }
    if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt * 3);
    // 没有动画时只为观众的小动作慢慢画（省电）
    const idle = !this.tracks.length && !this.flash && !this.pop && !this.flinch && !this.dirty;
    if (!idle || this.time - this.drawnAt > 0.12) {
      this.draw();
      this.drawnAt = this.time;
      this.dirty = false;
    }
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

  private cue(c: StageCue): void {
    if (!this.skipping) this.onCue?.(c);
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
    const g = this.grid();
    const [tx, ty] = this.zoneXY(info.x, info.y);
    const [rx, ry] = this.releasePoint();
    // 长焦下变化看起来更夸张，收一点
    const pxm = (g.cs / CELL / 0.216) * 0.55;
    const bx = (lefty ? -br.dx : br.dx) * g.mx;
    const by = br.dy;
    const brk = (u: number): [number, number] => {
      // 晚变：大部分变化发生在后半程
      const k = u * u * u;
      let ox = bx * pxm * k;
      const oy = by * pxm * k;
      if (br.wobble) ox += Math.sin(u * 14 + rnd() * 6) * 3 * u;
      return [ox, oy];
    };
    const [fbx, fby] = brk(1);
    const sx = tx - fbx;
    const sy = ty - fby;
    // 长焦：远近的大小差别小
    const ballR = (u: number) => (batView ? 1.4 + 3.4 * u * u : 4.2 - 2.4 * u);
    const flight = Math.min(1.25, Math.max(0.5, (18.4 / (info.kmh / 3.6)) * 1.55));
    this.aimShow = info.tx !== undefined && info.ty !== undefined ? { x: info.tx, y: info.ty } : null;
    this.ball = null;
    this.trail = [];
    // 1. 投球动作（网格淡出，看清投手）
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
      this.gridA = 1 - 0.55 * ease(k);
      const kb = Math.max(0, (k - 0.45) / 0.55);
      this.bPose = F.mix(idle, bk(load), ease(kb));
    });
    // 2. 球飞行，同时投手送球、打者跨步与挥棒；捕手的手套移到落点
    const strideP = batView ? (bunt ? F.BAT_BUNT : F.BAT_STRIDE) : bunt ? F.BF_BUNT : F.BF_STANCE;
    const contactP = batView ? F.BAT_CONTACT : F.BF_SWING;
    const followP = batView ? F.BAT_FOLLOW : F.BF_FOLLOW;
    const swings = swing === 'miss' || swing === 'foul' || swing === 'hit';
    const followKeys: [number, F.Pose][] = batView ? [[0, pf(F.PF_RELEASE)], [1, pf(F.PF_FOLLOW)]] : [[0, pf(F.PB_RELEASE)], [1, pf(F.PB_FOLLOW)]];
    const m0: [number, number] = [...this.mitt];
    // 出手的那一刻：出手声（打击视角里球朝镜头飞来，带一点风声，到本垒时最响）
    this.cue({ k: 'release', kmh: info.kmh, dur: flight / Math.max(0.1, this.speed), toward: batView });
    let swung = false;
    await this.run(flight, (u) => {
      // 挥棒开始（跨步之后）：挥棒的风声
      if (swings && !swung && u >= 0.72) {
        swung = true;
        this.cue({ k: 'swing' });
      }
      this.pPose = F.track(followKeys, Math.min(1, u * 1.6));
      const k = batView ? u * u * 0.35 + u * 0.65 : 1 - (1 - u) * (1 - u) * 0.35 - (1 - u) * 0.65 * (1 - u);
      const [ox, oy] = brk(u);
      const x = rx + (sx - rx) * k + ox;
      const y = ry + (sy - ry) * k + oy;
      const r = ballR(u);
      if (this.ball) {
        this.trail.push({ ...this.ball });
        if (this.trail.length > 4) this.trail.shift();
      }
      this.ball = { x, y, r };
      this.mitt = [m0[0] + (info.x - m0[0]) * ease(u * 1.3), m0[1] + (info.y - m0[1]) * ease(u * 1.3)];
      if (swings) {
        const sw = (u - 0.72) / 0.28;
        if (sw < 0) this.bPose = F.mix(bk(load), bk(strideP), ease(u / 0.72));
        else this.bPose = F.mix(bk(strideP), bk(contactP), ease(sw));
      } else this.bPose = F.mix(bk(load), bk(strideP), ease(Math.min(1, u / 0.72)));
    });
    // 3. 结果（球到本垒的这一刻：碰到球棒 / 打到身上 / 进手套）
    const hitPt = { x: tx, y: ty };
    if (swing === 'hit' || swing === 'foul' || swing === 'bunt' || swing === 'buntFoul') {
      this.cue({ k: 'contact', q: swing === 'bunt' || swing === 'buntFoul' ? 'bunt' : swing === 'foul' ? 'foul' : contactQ(bip) });
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
      this.cue({ k: 'hbp' });
      const [fx, fy, h] = this.batterFeet();
      this.ball = { x: fx + (s.batter.side === 'R' ? 1 : -1) * (batView ? 30 : -10) * (batView ? 1 : g.mx), y: fy - h * 0.55, r: 3 };
      this.flinch = 1;
      this.pop = { x: this.ball.x, y: this.ball.y, t: 1 };
      await this.wait(0.35);
      this.ball = null;
    } else {
      // 进了捕手手套
      this.cue({ k: 'mitt', kmh: info.kmh });
      if (swing === 'miss') this.bPose = bk(contactP);
      this.pop = { x: tx, y: ty, t: 0.8 };
      await this.run(0.3, (k) => {
        if (swing === 'miss') this.bPose = F.mix(bk(contactP), bk(followP), ease(k));
      });
      this.ball = null;
    }
    // 落点标记：颜色是实际的判定，形状是球种
    const [col, resText] = RES_MARK[info.res] ?? [PAL.white, ''];
    const shape = pitchShape(info.type);
    this.markers.push({ x: info.x, y: info.y, n, col, shape });
    this.radar = { kmh: info.kmh, name: info.sig ? `「${info.sig}」` : info.type === 'FB' ? '直球' : PITCH_DEFS[info.type as PitchType].name, q: info.q ?? null, res: resText, col, shape, t: 4 };
    // 回到预备姿势，网格回来
    await this.run(0.35, (k) => {
      this.bPose = F.mix(this.bPose, idle, ease(k));
      this.pPose = F.mix(this.pPose, batView ? this.pf(F.PF_SET) : this.pb(F.PB_SET), ease(k));
      this.gridA = 0.45 + 0.55 * ease(k);
    });
    this.aimShow = null;
  }

  /** 击中后球飞向哪里（画面坐标） */
  private hitTarget(swing: Swing, bip: BipInfo | null, from: { x: number; y: number }): { x: number; y: number; arc: number; r0: number; r1: number } {
    const batView = this.scene!.mode === 'bat';
    const side = from.x < 180 ? -1 : 1;
    if (swing === 'bunt' || swing === 'buntFoul') {
      const dx = swing === 'buntFoul' ? side * 110 : (bip ? bip.angle : 0) * 2.6;
      return batView ? { x: from.x + dx, y: 250, arc: 4, r0: 3, r1: 2.4 } : { x: from.x - dx * 0.6, y: 236, arc: 3, r0: 1.8, r1: 2.4 };
    }
    if (swing === 'foul') {
      return batView ? { x: from.x + side * 170, y: -20, arc: 0, r0: 4, r1: 5 } : { x: from.x + side * 90, y: 40, arc: 30, r0: 1.8, r1: 1 };
    }
    const ang = bip ? bip.angle : 0;
    const kind = bip?.kind ?? 'LD';
    if (batView) {
      // 打向外野：越远越小；滚地球贴着地面往内野滚（机位压低：内野、外野都挤在地平线附近）
      if (kind === 'GB') return { x: 180 + ang * 3.2, y: 146, arc: 2, r0: 4, r1: 1.6 };
      if (kind === 'PU') return { x: 180 + ang * 1.2, y: 22, arc: 70, r0: 4, r1: 1.4 };
      if (kind === 'LD') return { x: 180 + ang * 3.8, y: 98, arc: 6, r0: 4, r1: 1.2 };
      return { x: 180 + ang * 3.8, y: 56, arc: 54, r0: 4, r1: 0.9 };
    }
    // 投手视角：球朝镜头这边飞来
    if (kind === 'GB') return { x: 180 - ang * 3.5, y: 300, arc: 4, r0: 1.8, r1: 4 };
    if (kind === 'PU') return { x: 180 - ang, y: 30, arc: 50, r0: 1.8, r1: 2.6 };
    return { x: 180 - ang * 4.2, y: -16, arc: kind === 'LD' ? 6 : 46, r0: 1.8, r1: 5 };
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
    // 远处的野手（长焦、机位低：都挤在地平线附近，比较大）
    const fl = s.fielder;
    const inf = s.align === 'infieldIn' ? 6 : s.align === 'buntShift' || s.align === 'close' ? 9 : 0;
    const deep = s.align === 'noDoubles' ? -4 : 0;
    const dp = s.align === 'dp' || s.align === 'close' ? 6 : 0;
    const fp: [number, number, number][] = [
      [40, 106 + deep * 0.5, 13],
      [180, 104 + deep * 0.5, 13],
      [320, 106 + deep * 0.5, 13],
      [118 + dp, 128 + inf * 0.3, 22],
      [242 - dp, 128 + inf * 0.3, 22],
      [34 + inf, 145 + inf * 0.3, 26],
      [326 - inf, 145 + inf * 0.3, 26],
    ];
    for (const [x, y, h] of fp) F.drawFigure(c, x, y, h, F.FIELDER, fl, 'front');
    // 跑者
    const bp: [number, number, number][] = [
      [344, 148, 26],
      [198, 127, 20],
      [16, 148, 26],
    ];
    s.bases.forEach((on, i) => {
      if (!on) return;
      const [x, y, h] = bp[i];
      // 一垒、二垒的跑者往画面左边（下一个垒）跑，三垒的往右边（本垒）跑
      F.drawFigure(c, x, y, h, i === 2 ? F.RUNNER : F.mirror(F.RUNNER), s.runner, 'front');
    });
    // 投手
    const [px, py, ph] = this.pitcherFeet();
    F.drawFigure(c, px, py, ph, this.pPose, s.pitcher.look, 'front');
    // 打者（最近，背面；捕手在镜头后面，不画）
    const [bx, by, bh] = this.batterFeet();
    const fl2 = this.flinch * (s.batter.side === 'R' ? -8 : 8);
    F.drawFigure(c, bx + fl2, by, bh, this.bPose, s.batter.look, 'back');
    // 网格在人物上面，热区、打击率不会被挡住；球在最上面
    this.drawGrid();
    this.drawBall();
    this.drawPop();
  }

  private drawPitch(s: StageScene): void {
    const c = this.c;
    // 主审、捕手（手套跟着目标 / 落点）、打者
    const umpL: F.Look = { ...s.fielder, gear: 'ump', glove: null };
    F.drawFigure(c, 180, 286, 106, F.UMP, umpL, 'front');
    const catL: F.Look = { ...s.fielder, gear: 'catcher', glove: 'b' };
    const k = this.grid().cs / CELL / 1.25;
    const cp = { ...F.CATCHER, ha: [F.CATCHER.ha[0], [F.CATCHER.ha[1][0] - this.mitt[0] * k, F.CATCHER.ha[1][1] - this.mitt[1] * k]] as [[number, number], [number, number]] };
    F.drawFigure(c, 180, 296, 80, cp, catL, 'front');
    const [bx, by, bh] = this.batterFeet();
    const fl2 = this.flinch * (s.batter.side === 'R' ? 4 : -4);
    F.drawFigure(c, bx + fl2, by, bh, this.bPose, s.batter.look, 'front');
    // 投手（最近，背面，下半身在画面外）
    const [px, py, ph] = this.pitcherFeet();
    F.drawFigure(c, px, py, ph, this.pPose, s.pitcher.look, 'back');
    // 网格在人物上面；球在最上面
    this.drawGrid();
    this.drawBall();
    this.drawPop();
  }

  /** 瞄准网格：好球带 9×9 + 外圈坏球区、九宫格打击率、热区、瞄准点 / 狙的格、这个打席每一球的落点 */
  private drawGrid(): void {
    const c = this.c;
    const g = this.grid();
    const h = this.hud;
    const A = this.gridA;
    const n = GRID;
    const x0 = g.cx - (g.cs * n) / 2;
    const y0 = g.cy - (g.cs * n) / 2;
    const cellXY = (i: number, j: number): [number, number] => {
      // 第 i 列（好球带坐标从左到右）在画面上的位置：投手视角左右相反
      const si = g.mx === 1 ? i : n - 1 - i;
      return [x0 + si * g.cs, y0 + j * g.cs];
    };
    // 底：压暗一层，热区看得清（打击时背后是草皮和红土，压得更暗）
    const bat = this.scene?.mode === 'bat';
    c.globalAlpha = (bat ? 0.42 : 0.16) * A;
    rect(c, x0, y0, g.cs * n, g.cs * n, PAL.ink);
    // 投球：打者的打算（橙色，越浓越是他在等、会出棒的地方）
    if (h.intent) {
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const v = h.intent[j * n + i];
          if (v < 0.25) continue;
          const [x, y] = cellXY(i, j);
          c.globalAlpha = (0.08 + 0.7 * v) * A;
          rect(c, x + 1, y + 1, g.cs - 1, g.cs - 1, PAL.orange);
        }
      c.globalAlpha = 1;
    }
    // 热区（概率）
    if (h.heat) {
      let mx = 0;
      for (const v of h.heat) mx = Math.max(mx, v);
      if (mx > 0) {
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const v = h.heat[j * n + i] / mx;
            if (v < 0.04) continue;
            const [x, y] = cellXY(i, j);
            c.globalAlpha = Math.min(0.9, 0.2 + v * 0.7) * A;
            rect(c, x + 1, y + 1, g.cs - 1, g.cs - 1, v > 0.66 ? shade(h.heatCol, 0.25) : h.heatCol);
          }
        }
      }
    }
    // 细线：外圈很淡，好球带里 9×9 淡、3×3 明显、边框最亮
    c.globalAlpha = 0.1 * A;
    for (let k = 0; k <= n; k++) {
      rect(c, x0 + k * g.cs, y0, 1, g.cs * n, PAL.white);
      rect(c, x0, y0 + k * g.cs, g.cs * n, 1, PAL.white);
    }
    const zx0 = x0 + g.cs;
    const zy0 = y0 + g.cs;
    const zw = g.cs * 9;
    c.globalAlpha = 0.45 * A;
    for (let k = 1; k < 3; k++) {
      rect(c, zx0 + k * g.cs * 3, zy0, 1, zw, PAL.white);
      rect(c, zx0, zy0 + k * g.cs * 3, zw, 1, PAL.white);
    }
    c.globalAlpha = 0.95 * A;
    rect(c, zx0 - 1, zy0 - 1, zw + 2, 2, PAL.white);
    rect(c, zx0 - 1, zy0 + zw - 1, zw + 2, 2, PAL.white);
    rect(c, zx0 - 1, zy0 - 1, 2, zw + 2, PAL.white);
    rect(c, zx0 + zw - 1, zy0 - 1, 2, zw + 2, PAL.white);
    c.globalAlpha = 1;
    // 打击率数字
    if (h.hot) {
      c.font = '12px FusionPixel, monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (let zn = 0; zn < 9; zn++) {
        const [zx, zy] = zoneCenter(zn);
        const [sx, sy] = this.zoneXY(zx, zy);
        const t = h.hot[zn].toFixed(3).slice(1);
        c.globalAlpha = 0.9 * A;
        c.fillStyle = PAL.ink;
        c.fillText(t, sx + 1, sy + 1);
        c.fillStyle = h.hot[zn] >= 0.31 ? '#ffb4a8' : h.hot[zn] <= 0.25 ? '#b4d2ff' : PAL.white;
        c.fillText(t, sx, sy);
      }
      c.globalAlpha = 1;
      c.textAlign = 'left';
    }
    // 挥棒热区（黄）：越浓的格子越容易打中、打得越扎实；和投手的热区（洋红）对齐。中心一点是挥棒点
    if (h.cover) {
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const v = h.cover[j * n + i];
          if (v < 0.3) continue;
          const [x, y] = cellXY(i, j);
          c.globalAlpha = (0.06 + 0.34 * v) * A;
          rect(c, x + 1, y + 1, g.cs - 1, g.cs - 1, PAL.yellow);
          // 浓的一圈描边，看得出热区的形状
          if (v >= 0.8) {
            c.globalAlpha = 0.95 * A;
            const edge = (di: number, dj: number) => {
              const ii = i + di;
              const jj = j + dj;
              return ii < 0 || jj < 0 || ii >= n || jj >= n || h.cover![jj * n + ii] < 0.8;
            };
            if (edge(0, -1)) rect(c, x, y, g.cs + 1, 1, PAL.yellow);
            if (edge(0, 1)) rect(c, x, y + g.cs, g.cs + 1, 1, PAL.yellow);
            if (edge(g.mx === 1 ? -1 : 1, 0)) rect(c, x, y, 1, g.cs + 1, PAL.yellow);
            if (edge(g.mx === 1 ? 1 : -1, 0)) rect(c, x + g.cs, y, 1, g.cs + 1, PAL.yellow);
          }
        }
      c.globalAlpha = 1;
    }
    if (h.hunt) {
      const [hx, hy] = this.zoneXY(h.hunt.x, h.hunt.y);
      c.globalAlpha = A;
      rect(c, hx - 2, hy - 0.5, 5, 2, PAL.yellow);
      rect(c, hx - 0.5, hy - 2, 2, 5, PAL.yellow);
      c.globalAlpha = 1;
    }
    // 瞄准点（投球）
    const aim = this.aimShow ?? h.aim;
    if (aim) {
      const [ax, ay] = this.zoneXY(aim.x, aim.y);
      const r = g.cs * 0.55;
      c.globalAlpha = this.aimShow ? 0.75 : 1;
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2;
        rect(c, ax + Math.cos(t) * r - 0.5, ay + Math.sin(t) * r - 0.5, 1.5, 1.5, PAL.cyan);
      }
      rect(c, ax - r - 3, ay, r - 1, 1, PAL.cyan);
      rect(c, ax + 4, ay, r - 1, 1, PAL.cyan);
      rect(c, ax, ay - r - 3, 1, r - 1, PAL.cyan);
      rect(c, ax, ay + 4, 1, r - 1, PAL.cyan);
      c.globalAlpha = 1;
    }
    // 这个打席每一球的落点
    c.font = '12px FusionPixel, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const m of this.markers) {
      const [x, y] = this.zoneXY(m.x, m.y);
      markShape(c, x, y, m.shape, 6.5, PAL.ink);
      markShape(c, x, y, m.shape, 5.2, m.col);
      c.fillStyle = PAL.ink;
      c.fillText(String(m.n), x, y + (m.shape === 'up' ? 2 : m.shape === 'down' ? 0 : 1));
    }
    c.textAlign = 'left';
    // 「不挥棒」
    if (h.take) {
      c.font = '12px FusionPixel, monospace';
      c.textBaseline = 'top';
      const t = '不挥棒';
      const w = Math.ceil(c.measureText(t).width) + 8;
      c.globalAlpha = 0.85;
      rect(c, g.cx - w / 2, y0 - 18, w, 15, PAL.ink);
      c.globalAlpha = 1;
      c.fillStyle = PAL.lime;
      c.fillText(t, g.cx - w / 2 + 4, y0 - 16);
    }
  }

  private drawBall(): void {
    const c = this.c;
    if (!this.ball) return;
    c.globalAlpha = 0.35;
    for (const t of this.trail) disc(c, t.x, t.y, Math.max(0.5, t.r * 0.8), PAL.white);
    c.globalAlpha = 1;
    const b = this.ball;
    if (b.r >= 1.6) disc(c, b.x, b.y, b.r + 0.8, PAL.ink);
    disc(c, b.x, b.y, b.r, PAL.white);
    if (b.r >= 2.5) rect(c, b.x - 1, b.y - 1, 1, 2, PAL.red);
  }

  private drawPop(): void {
    if (!this.pop) return;
    const c = this.c;
    const { x, y, t } = this.pop;
    const r = 4 + (1 - t) * 10;
    c.globalAlpha = Math.max(0, t);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      line(c, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, x + Math.cos(a) * r, y + Math.sin(a) * r, 1, PAL.yellow);
    }
    c.globalAlpha = 1;
  }

  private drawHud(): void {
    const c = this.c;
    if (this.radar && this.radar.t > 0) {
      c.font = '12px FusionPixel, monospace';
      c.textBaseline = 'top';
      // 测速：球速、球种、质量，后面是这一球的判定（颜色和落点标记一样）
      const r = this.radar;
      const txt = `${r.kmh}km/h ${r.name}${r.q !== null ? ` 质量 ${r.q}` : ''}`;
      const res = r.res ? ` · ${r.res}` : '';
      const w1 = Math.ceil(c.measureText(txt).width);
      const w = 14 + w1 + Math.ceil(c.measureText(res).width) + 8;
      const x = SW - w - 4;
      const y = 4;
      c.globalAlpha = 0.82;
      rect(c, x, y, w, 15, PAL.ink);
      c.globalAlpha = 1;
      markShape(c, x + 8, y + 7.5, r.shape, 4.5, r.col);
      c.fillStyle = PAL.yellow;
      c.fillText(txt, x + 14, y + 2);
      c.fillStyle = r.col;
      c.fillText(res, x + 14 + w1, y + 2);
    }
    if (this.flash) {
      const f = this.flash;
      c.font = '24px FusionPixel, monospace';
      c.textBaseline = 'middle';
      c.textAlign = 'center';
      const y = 40;
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
/** 看台：颜色压在灰蓝里，只在甲子园的阿尔卑斯看台用两队的颜色（也压暗） */
function stands(c: Ctx, x0: number, y0: number, w: number, y1: number, seed: number, home: TeamColors, away: TeamColors, koshien: boolean): void {
  const rnd = prng(seed);
  rect(c, x0, y0, w, y1 - y0, '#262d44');
  const crowd = ['#3b4563', '#46506e', '#525c78', '#34405c', '#5f6782', '#4b4e68'];
  for (let y = y0 + 2; y < y1; y += 4) {
    rect(c, x0, y + 3, w, 1, '#1f2539');
    for (let x = x0 + ((y / 4) % 2 ? 1 : 3); x < x0 + w; x += 3 + Math.floor(rnd() * 2)) {
      if (rnd() < 0.22) continue;
      const side = x < SW * 0.3 ? 0 : x > SW * 0.7 ? 1 : -1;
      let col: string;
      if (koshien && side >= 0 && rnd() < 0.7) col = mute(side === 0 ? away.primary : home.primary, 0.45);
      else col = crowd[Math.floor(rnd() * crowd.length)];
      rect(c, x, y, 2, 2, col);
      rect(c, x, y - 1, 2, 1, '#a88a78');
    }
  }
}

function drawBatBg(koshien: boolean, home: TeamColors, away: TeamColors): HTMLCanvasElement {
  const cv = makeCanvas(SW, SH);
  const c = cv.getContext('2d')!;
  // 机位压低（接近平视）：看台占上面四分之一，外野、内野挤在地平线附近，下面是本垒前的草皮
  for (let y = 0; y < 10; y++) rect(c, 0, y, SW, 1, y < 5 ? SKY_T : SKY_B);
  stands(c, 0, 8, SW, 92, 11, home, away, koshien);
  // 看台中段的通道，让一大片看台不那么花
  rect(c, 0, 48, SW, 2, '#1f2539');
  // 中外野的背景墙（打者看球用的深色板）：在投手正后方
  rect(c, 124, 30, 112, 62, '#1f3a32');
  rect(c, 124, 30, 112, 1, '#2d5246');
  // 外野围墙
  rect(c, 0, 92, SW, 10, WALL);
  rect(c, 0, 92, SW, 1, PAL.yellow);
  for (let x = 4; x < SW; x += 40) rect(c, x, 95, 18, 4, '#28503f');
  // 草皮：远处压得很扁，越往镜头越宽
  let y = 102;
  let k = 0;
  while (y < SH) {
    const hgt = 2 + k * 0.9;
    rect(c, 0, y, SW, Math.ceil(hgt), k % 2 ? GRASS : GRASS_L);
    y += hgt;
    k++;
  }
  // 内野：一二三垒后面那一圈泥土（扁），里面一小块草皮
  ellipse(c, 180, 141, 320, 32, DIRT);
  poly(c, [[180, 130], [298, 143], [180, 156], [62, 143]], GRASS_D);
  // 跑垒道：一垒、三垒往本垒（镜头这边）
  line(c, 326, 144, 214, 360, 3, DIRT);
  line(c, 34, 144, 146, 360, 3, DIRT);
  // 投手丘
  ellipse(c, 180, 152, 36, 8, DIRT);
  ellipse(c, 180, 151, 26, 6, DIRT_L);
  rect(c, 171, 150, 18, 1, PAL.white);
  // 垒包
  for (const [x, yy] of [[330, 143], [180, 125], [30, 143]] as [number, number][]) poly(c, [[x, yy - 2], [x + 6, yy], [x, yy + 2], [x - 6, yy]], PAL.white);
  // 本垒周围的泥土（离镜头近，画面最下面）
  ellipse(c, 180, 384, 250, 74, DIRT_D);
  ellipse(c, 180, 384, 238, 66, DIRT);
  // 边线：从本垒经过一垒、三垒伸向外野
  line(c, 180, 430, 352, 102, 1, PAL.white);
  line(c, 180, 430, 8, 102, 1, PAL.white);
  return cv;
}

function drawPitchBg(koshien: boolean, home: TeamColors, away: TeamColors): HTMLCanvasElement {
  const cv = makeCanvas(SW, SH);
  const c = cv.getContext('2d')!;
  stands(c, 0, 0, SW, 112, 23, home, away, koshien);
  // 本垒后方的挡网与围墙
  rect(c, 0, 112, SW, 64, '#1d2c34');
  for (let x = 0; x < SW; x += 5) rect(c, x, 112, 1, 64, '#273b45');
  for (let y = 114; y < 176; y += 5) rect(c, 0, y, SW, 1, '#273b45');
  rect(c, 0, 174, SW, 8, PAL.navy);
  rect(c, 0, 174, SW, 1, '#5577aa');
  // 草皮
  for (let y = 182; y < SH; y += 7) rect(c, 0, y, SW, 7, (y / 7) % 2 ? GRASS : GRASS_L);
  // 本垒周围的泥土（长焦：大而扁）
  ellipse(c, 180, 290, 176, 44, DIRT);
  ellipse(c, 180, 290, 164, 37, DIRT_L);
  // 边线（一垒在画面左边）
  line(c, 180, 292, -40, 356, 1, PAL.white);
  line(c, 180, 292, 400, 356, 1, PAL.white);
  // 打击区与本垒板
  for (const x0 of [136, 196]) {
    rect(c, x0, 282, 28, 1, PAL.white);
    rect(c, x0, 282, 1, 17, PAL.white);
    rect(c, x0 + 28, 282, 1, 17, PAL.white);
  }
  poly(c, [[169, 290], [191, 290], [193, 294], [180, 299], [167, 294]], PAL.white);
  // 近处的投手丘
  ellipse(c, 180, 400, 240, 76, DIRT);
  ellipse(c, 180, 400, 200, 60, DIRT_L);
  return cv;
}

/** 观众的小动作：少量像素慢慢地亮一下 */
function crowdShimmer(c: Ctx, mode: ViewMode, time: number): void {
  const rnd = prng(Math.floor(time * 2.5) + (mode === 'bat' ? 1 : 2));
  const y0 = mode === 'bat' ? 10 : 2;
  const y1 = mode === 'bat' ? 90 : 110;
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(rnd() * SW);
    const y = y0 + Math.floor(rnd() * ((y1 - y0) / 4)) * 4;
    rect(c, x, y, 2, 2, '#6d7591');
  }
}
