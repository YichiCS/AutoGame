// 练习场的像素画面：设施随等级出现，球员按今天的训练内容活动，天色跟随现实时间，季节跟随游戏日期
import type { FacilityId, Player, TeamColors } from '../core/types';
import type { Act } from '../core/daily';
import { localRng } from '../core/rng';

export const SW = 480;
export const SH = 270;

export interface SceneData {
  month: number;
  colors: TeamColors;
  facilities: Record<FacilityId, number>;
  players: { p: Player; act: Act }[];
  rain: boolean;
  cat: boolean;
  matchDay: boolean;
  schoolName: string;
}

interface Sprite {
  pid: number;
  x: number;
  y: number;
  act: Act;
  phase: number;
  slot: number;
  pitcher: boolean;
  catcher: boolean;
  hurt: boolean;
}

interface Ball {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  h: number;
  t: number;
  dur: number;
  color: string;
}

const C = {
  night: '#1a1c2c',
  grass1: '#38b764',
  grass2: '#2f9c55',
  dirt: '#b86f50',
  dirt2: '#a05b3f',
  line: '#f4f4f4',
  fence: '#257179',
  wall: '#e8d9b5',
  wall2: '#cdbb94',
  roof: '#5d275d',
  window: '#3b5dc9',
  lit: '#ffcd75',
  skin: '#f2c6a0',
  skin2: '#d9a37c',
  dark: '#1a1c2c',
  shadow: 'rgba(11,12,20,0.25)',
};

/** 本地时间的天色 */
function skyColors(h: number): [string, string, string] {
  if (h >= 7 && h < 16) return ['#41a6f6', '#73eff7', '#a6e9f5'];
  if (h >= 16 && h < 18.5) return ['#5d275d', '#ef7d57', '#ffcd75'];
  if (h >= 5 && h < 7) return ['#3b5dc9', '#ef7d57', '#ffcd75'];
  return ['#0b0c1a', '#1a1c2c', '#29366f'];
}

function treeColor(month: number): [string, string] {
  if (month === 4) return ['#ff77a8', '#ffb0cc'];
  if (month >= 5 && month <= 8) return ['#257179', '#38b764'];
  if (month >= 9 && month <= 11) return month === 11 ? ['#b13e53', '#ef7d57'] : ['#ef7d57', '#ffcd75'];
  return ['#566c86', '#94b0c2'];
}

const HOME = { x: 250, y: 238 };
const BASE1 = { x: 318, y: 200 };
const BASE2 = { x: 250, y: 164 };
const BASE3 = { x: 182, y: 200 };
const MOUND = { x: 250, y: 205 };

/** 各活动的站位 */
const SLOTS: Record<string, { x: number; y: number }[]> = {
  field: [
    { x: 300, y: 184 }, { x: 274, y: 160 }, { x: 226, y: 160 }, { x: 200, y: 184 },
    { x: 250, y: 118 }, { x: 186, y: 128 }, { x: 314, y: 128 }, { x: 160, y: 205 }, { x: 150, y: 212 }, { x: 140, y: 219 },
  ],
  bat: [{ x: 40, y: 184 }, { x: 70, y: 184 }, { x: 100, y: 184 }, { x: 128, y: 214 }, { x: 138, y: 220 }],
  pitch: [{ x: 392, y: 186 }, { x: 434, y: 186 }, { x: 456, y: 230 }, { x: 466, y: 236 }],
  catch: [{ x: 392, y: 222 }, { x: 434, y: 222 }, { x: 250, y: 246 }],
  weight: [{ x: 66, y: 134 }, { x: 80, y: 136 }, { x: 94, y: 134 }, { x: 108, y: 136 }],
  rest: [{ x: 128, y: 258 }, { x: 140, y: 258 }, { x: 152, y: 258 }, { x: 164, y: 258 }, { x: 176, y: 258 }, { x: 188, y: 258 }, { x: 200, y: 258 }],
  injured: [{ x: 212, y: 258 }, { x: 222, y: 258 }],
  mental: [{ x: 340, y: 100 }, { x: 352, y: 104 }, { x: 364, y: 100 }, { x: 376, y: 104 }],
};

export class PracticeScene {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  data: SceneData | null = null;
  sprites: Sprite[] = [];
  balls: Ball[] = [];
  particles: { x: number; y: number; v: number; kind: number }[] = [];
  time = 0;
  knockT = 0;
  cageT: number[] = [0, 0.4, 0.8];
  penT: number[] = [0, 1];
  stars: { x: number; y: number }[] = [];
  catX = 120;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = SW;
    canvas.height = SH;
    this.ctx = canvas.getContext('2d')!;
    const R = localRng(99);
    for (let i = 0; i < 40; i++) this.stars.push({ x: Math.floor(R() * SW), y: Math.floor(R() * 70) });
    for (let i = 0; i < 60; i++) this.particles.push({ x: R() * SW, y: R() * SH, v: 0.5 + R(), kind: Math.floor(R() * 3) });
  }

  /** 每天的数据变了（谁在练什么）就重新安排站位 */
  setData(d: SceneData): void {
    const prev = new Map(this.sprites.map((s) => [s.pid, s]));
    this.data = d;
    const counters: Record<string, number> = {};
    this.sprites = d.players.map(({ p, act }) => {
      let a: Act = act;
      if (a === 'study') a = 'mental';
      const key = a === 'run' ? 'run' : a;
      const slot = (counters[key] = (counters[key] ?? -1) + 1);
      const list = SLOTS[key];
      const pos = list ? list[slot % list.length] : { x: 60 + ((slot * 37) % 360), y: 92 };
      const old = prev.get(p.id);
      return {
        pid: p.id,
        x: old ? old.x : pos.x,
        y: old ? old.y : pos.y,
        act: a,
        phase: (p.id * 0.37) % 1,
        slot,
        pitcher: p.pos === 'P',
        catcher: p.pos === 'C',
        hurt: !!p.injury,
      };
    });
  }

  target(s: Sprite): { x: number; y: number } {
    if (s.act === 'run') {
      // 沿着外野警戒区来回跑
      const t = (this.time * 0.06 + s.phase + s.slot * 0.07) % 2;
      const k = t < 1 ? t : 2 - t;
      return { x: 20 + k * 440, y: 88 + (s.slot % 3) * 4 };
    }
    const list = SLOTS[s.act];
    if (!list) return { x: s.x, y: s.y };
    const base = list[s.slot % list.length];
    if (s.slot >= list.length) return { x: base.x + 8 * Math.floor(s.slot / list.length), y: base.y + 3 };
    return base;
  }

  hitTest(x: number, y: number): number | null {
    for (const s of this.sprites) if (Math.abs(x - s.x) <= 4 && y >= s.y - 11 && y <= s.y + 1) return s.pid;
    return null;
  }

  update(dt: number): void {
    this.time += dt;
    const d = this.data;
    if (!d) return;
    for (const s of this.sprites) {
      const t = this.target(s);
      const sp = s.act === 'run' ? 90 : 40;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        const m = Math.min(dist, sp * dt);
        s.x += (dx / dist) * m;
        s.y += (dy / dist) * m;
      }
    }
    // 监督打守备练习的滚地球
    this.knockT -= dt;
    const fielders = this.sprites.filter((s) => s.act === 'field' && s.slot < 7);
    if (this.knockT <= 0 && fielders.length) {
      this.knockT = 1.8 + Math.random() * 1.2;
      const f = fielders[Math.floor(Math.random() * fielders.length)];
      this.balls.push({ x0: HOME.x - 6, y0: HOME.y + 4, x1: f.x, y1: f.y - 2, h: f.slot >= 4 ? 40 : 4, t: 0, dur: f.slot >= 4 ? 1.2 : 0.7, color: '#f4f4f4' });
      setTimeout(() => this.balls.push({ x0: f.x, y0: f.y - 4, x1: BASE1.x, y1: BASE1.y - 4, h: 8, t: 0, dur: 0.5, color: '#f4f4f4' }), 900);
    }
    // 打击笼：发球机
    const hitters = this.sprites.filter((s) => s.act === 'bat' && s.slot < 3);
    hitters.forEach((h, i) => {
      this.cageT[i] = (this.cageT[i] ?? 0) - dt;
      if (this.cageT[i] <= 0) {
        this.cageT[i] = 1.4;
        this.balls.push({ x0: h.x, y0: 156, x1: h.x, y1: h.y - 6, h: 0, t: 0, dur: 0.35, color: '#f4f4f4' });
        setTimeout(() => this.balls.push({ x0: h.x, y0: h.y - 6, x1: h.x + (Math.random() * 24 - 12), y1: 152, h: 18, t: 0, dur: 0.4, color: '#f4f4f4' }), 380);
      }
    });
    // 牛棚
    const pens = this.sprites.filter((s) => s.act === 'pitch' && s.slot < 2);
    pens.forEach((p, i) => {
      this.penT[i] = (this.penT[i] ?? 0) - dt;
      if (this.penT[i] <= 0) {
        this.penT[i] = 2 + i * 0.3;
        setTimeout(() => this.balls.push({ x0: p.x + 2, y0: p.y - 8, x1: p.x, y1: p.y + 30, h: 3, t: 0, dur: 0.32, color: '#f4f4f4' }), 450);
      }
    });
    for (const b of this.balls) b.t += dt;
    this.balls = this.balls.filter((b) => b.t < b.dur);
    // 猫
    if (d.cat) this.catX = 120 + Math.sin(this.time * 0.15) * 30;
    // 天气粒子
    for (const p of this.particles) {
      p.y += p.v * dt * (d.rain ? 160 : 14);
      p.x += d.rain ? -p.v * dt * 30 : Math.sin(this.time + p.v * 9) * dt * 8;
      if (p.y > SH) {
        p.y = -2;
        p.x = Math.random() * SW;
      }
      if (p.x < 0) p.x = SW;
    }
  }

  draw(): void {
    const c = this.ctx;
    const d = this.data;
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const night = hour < 5 || hour >= 18.5;
    const [s1, s2, s3] = skyColors(hour);
    // 天空（像素风分层）
    c.fillStyle = s1;
    c.fillRect(0, 0, SW, 28);
    c.fillStyle = s2;
    c.fillRect(0, 28, SW, 22);
    c.fillStyle = s3;
    c.fillRect(0, 50, SW, 30);
    if (night) {
      c.fillStyle = '#f4f4f4';
      for (const st of this.stars) if ((Math.floor(this.time * 2 + st.x) % 7) !== 0) c.fillRect(st.x, st.y, 1, 1);
      this.px(400, 14, 7, 7, '#f4f4f4');
      this.px(402, 13, 5, 1, '#f4f4f4');
    } else {
      const sx = 40 + ((hour - 6) / 12) * 400;
      this.px(sx, 10 + Math.abs(12 - hour) * 2, 9, 9, hour >= 16 || hour < 7 ? '#ef7d57' : '#ffcd75');
      // 云
      c.fillStyle = 'rgba(244,244,244,0.85)';
      for (let i = 0; i < 3; i++) {
        const cx = ((this.time * 4 + i * 170) % (SW + 80)) - 40;
        c.fillRect(cx, 16 + i * 9, 34, 5);
        c.fillRect(cx + 6, 12 + i * 9, 20, 4);
      }
    }
    // 远山
    c.fillStyle = night ? '#29366f' : '#566c86';
    for (let x = 0; x < SW; x += 4) {
      const h = 10 + Math.sin(x * 0.02) * 6 + Math.sin(x * 0.05 + 1) * 3;
      c.fillRect(x, 74 - h, 4, h);
    }
    if (!d) return;
    const f = d.facilities;
    // 背景建筑
    this.drawBuildings(f, night, d);
    // 外野围栏
    c.fillStyle = C.fence;
    c.fillRect(0, 76, SW, 6);
    c.fillStyle = '#1d5a61';
    for (let x = 0; x < SW; x += 6) c.fillRect(x, 76, 1, 6);
    // 草地
    for (let y = 82; y < SH; y += 8) {
      c.fillStyle = Math.floor(y / 8) % 2 ? C.grass1 : C.grass2;
      c.fillRect(0, y, SW, 8);
    }
    if (d.month === 12 || d.month <= 2) {
      c.fillStyle = 'rgba(244,244,244,0.35)';
      for (let i = 0; i < 40; i++) c.fillRect((i * 97) % SW, 84 + ((i * 53) % 170), 14, 3);
    }
    // 警戒区
    c.fillStyle = C.dirt2;
    c.fillRect(0, 82, SW, 14);
    // 内野
    this.diamond();
    // 打击笼、牛棚、长凳、重训区
    this.cage();
    this.bullpen();
    this.bench();
    if (f.weight) this.weightRoom(f.weight);
    // 照明塔
    if (f.field >= 3) {
      for (const lx of [12, 466]) {
        this.px(lx, 30, 2, 52, '#94b0c2');
        this.px(lx - 4, 26, 10, 5, night ? '#ffcd75' : '#333c57');
      }
    }
    // 球
    for (const b of this.balls) {
      const k = b.t / b.dur;
      const x = b.x0 + (b.x1 - b.x0) * k;
      const y = b.y0 + (b.y1 - b.y0) * k - Math.sin(k * Math.PI) * b.h;
      this.px(x, y, 2, 2, b.color);
    }
    // 人物（按 y 排序）
    const sorted = this.sprites.slice().sort((a, b) => a.y - b.y);
    for (const s of sorted) this.person(s, d.colors);
    // 监督
    this.coach(HOME.x - 10, HOME.y + 10, d.colors);
    // 猫
    if (d.cat) this.cat(this.catX, 252);
    // 天气
    if (d.rain) {
      c.fillStyle = 'rgba(115,239,247,0.6)';
      for (const p of this.particles) c.fillRect(p.x, p.y, 1, 4);
    } else if (d.month === 12 || d.month <= 2) {
      c.fillStyle = '#f4f4f4';
      for (const p of this.particles) if (p.kind === 0) c.fillRect(p.x, p.y, 2, 2);
    } else if (d.month === 4) {
      c.fillStyle = '#ffb0cc';
      for (const p of this.particles) if (p.kind === 0) c.fillRect(p.x, p.y, 2, 1);
    } else if (d.month === 10 || d.month === 11) {
      c.fillStyle = '#ef7d57';
      for (const p of this.particles) if (p.kind === 0) c.fillRect(p.x, p.y, 2, 2);
    }
    // 夜晚
    if (night) {
      c.fillStyle = f.field >= 3 ? 'rgba(10,12,40,0.25)' : 'rgba(10,12,40,0.5)';
      c.fillRect(0, 76, SW, SH - 76);
    }
    if (d.matchDay) {
      c.fillStyle = 'rgba(26,28,44,0.75)';
      c.fillRect(SW / 2 - 70, 120, 140, 22);
      c.fillStyle = '#ffcd75';
      c.font = '12px FusionPixel, monospace';
      c.textAlign = 'center';
      c.fillText('今天是比赛日', SW / 2, 136);
      c.textAlign = 'left';
    }
  }

  private px(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  private drawBuildings(f: Record<FacilityId, number>, night: boolean, d: SceneData): void {
    const [t1, t2] = treeColor(d.month);
    const tree = (x: number, h = 16) => {
      this.px(x + 3, 76 - 6, 2, 6, '#5a3a22');
      this.px(x, 76 - h, 8, h - 6, t1);
      this.px(x + 1, 76 - h - 2, 6, 3, t2);
      this.px(x + 2, 76 - h + 3, 2, 2, t2);
    };
    // 校舍（右）
    this.px(300, 22, 170, 54, C.wall);
    this.px(300, 22, 170, 4, C.wall2);
    this.px(372, 10, 26, 14, C.wall);
    this.px(380, 13, 10, 8, '#f4f4f4');
    this.px(384, 14, 1, 4, C.dark);
    this.px(384, 17, 3, 1, C.dark);
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 11; k++) {
        const lit = night && ((r * 11 + k) * 7) % 5 === 0;
        this.px(306 + k * 15, 30 + r * 15, 9, 8, lit ? C.lit : C.window);
      }
    // 设施建筑（没有的位置种树）
    if (f.indoor) {
      this.px(8, 40, 108, 36, '#94b0c2');
      this.px(8, 36, 108, 6, '#566c86');
      this.px(14, 32, 96, 5, '#566c86');
      this.px(56, 56, 14, 20, '#333c57');
      if (f.indoor >= 3) this.px(20, 46, 30, 4, '#41a6f6');
    } else [10, 34, 58, 82].forEach((x) => tree(x));
    if (f.dorm) {
      this.px(124, 40, 58, 36, '#ef7d57');
      this.px(120, 36, 66, 5, C.roof);
      for (let k = 0; k < 4; k++) for (let r = 0; r < 2; r++) this.px(128 + k * 13, 46 + r * 13, 8, 7, night ? C.lit : C.window);
    } else [126, 150, 172].forEach((x) => tree(x, 18));
    if (f.medical) {
      this.px(192, 52, 30, 24, '#f4f4f4');
      this.px(203, 56, 8, 2, '#b13e53');
      this.px(206, 53, 2, 8, '#b13e53');
    } else tree(200, 14);
    if (f.analysis) {
      this.px(228, 50, 32, 26, '#333c57');
      this.px(232, 55, 24, 10, night ? '#73eff7' : '#41a6f6');
      this.px(252, 40, 2, 10, '#94b0c2');
      this.px(248, 38, 10, 3, '#94b0c2');
    } else tree(236, 15);
    tree(270, 17);
    tree(284, 14);
  }

  private diamond(): void {
    const c = this.ctx;
    c.fillStyle = C.dirt;
    c.beginPath();
    c.moveTo(HOME.x, HOME.y + 10);
    c.lineTo(BASE1.x + 16, BASE1.y);
    c.lineTo(BASE2.x, BASE2.y - 14);
    c.lineTo(BASE3.x - 16, BASE3.y);
    c.closePath();
    c.fill();
    c.fillStyle = C.grass2;
    c.beginPath();
    c.moveTo(HOME.x, HOME.y - 10);
    c.lineTo(BASE1.x - 14, BASE1.y);
    c.lineTo(BASE2.x, BASE2.y + 12);
    c.lineTo(BASE3.x + 14, BASE3.y);
    c.closePath();
    c.fill();
    this.px(MOUND.x - 6, MOUND.y - 3, 12, 6, C.dirt);
    this.px(MOUND.x - 2, MOUND.y - 1, 4, 1, C.line);
    // 边线
    c.fillStyle = C.line;
    for (let k = 0; k < 120; k++) {
      c.fillRect(Math.round(HOME.x + k * 1.9), Math.round(HOME.y - k * 1.12), 1, 1);
      c.fillRect(Math.round(HOME.x - k * 1.9), Math.round(HOME.y - k * 1.12), 1, 1);
    }
    for (const b of [BASE1, BASE2, BASE3]) this.px(b.x - 2, b.y - 2, 4, 3, C.line);
    this.px(HOME.x - 2, HOME.y, 5, 3, C.line);
  }

  private cage(): void {
    this.px(18, 148, 112, 44, 'rgba(26,28,44,0.35)');
    const c = this.ctx;
    c.fillStyle = '#1a1c2c';
    c.fillRect(18, 148, 112, 2);
    c.fillRect(18, 148, 2, 44);
    c.fillRect(128, 148, 2, 44);
    c.fillStyle = 'rgba(148,176,194,0.45)';
    for (let x = 22; x < 128; x += 5) c.fillRect(x, 150, 1, 42);
    for (let y = 152; y < 192; y += 5) c.fillRect(20, y, 108, 1);
    for (const x of [40, 70, 100]) this.px(x - 3, 152, 7, 5, '#566c86');
  }

  private bullpen(): void {
    for (const x of [392, 434]) {
      this.px(x - 7, 188, 14, 4, C.dirt);
      this.px(x - 4, 224, 8, 3, C.dirt);
      this.px(x - 1, 225, 3, 2, C.line);
    }
    this.px(372, 238, 100, 2, '#1d5a61');
  }

  private bench(): void {
    this.px(118, 246, 112, 4, '#333c57');
    this.px(120, 259, 108, 3, '#8b5a3c');
    this.px(120, 262, 2, 4, '#5a3a22');
    this.px(226, 262, 2, 4, '#5a3a22');
  }

  private weightRoom(lv: number): void {
    this.px(6, 100, 52, 34, '#566c86');
    this.px(4, 96, 56, 5, '#333c57');
    this.px(18, 108, 28, 4, '#f4f4f4');
    this.px(16, 106, 4, 8, '#1a1c2c');
    this.px(44, 106, 4, 8, '#1a1c2c');
    if (lv >= 3) this.px(26, 120, 12, 14, '#ffcd75');
  }

  private person(s: Sprite, col: TeamColors): void {
    const c = this.ctx;
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    const t = this.time + s.phase * 3;
    const f2 = Math.floor(t * 6) % 2;
    // 影子
    c.fillStyle = C.shadow;
    c.fillRect(x - 3, y, 7, 2);
    const cap = col.cap || col.primary;
    const uni = '#f4f4f4';
    let yo = 0;
    if (s.act === 'rest' || s.act === 'injured' || s.act === 'mental') yo = 3;
    if (s.act === 'catch') yo = 3;
    // 腿
    if (s.act === 'run' || (s.act === 'field' && Math.abs(s.x - this.target(s).x) > 1)) {
      this.px(x - 2 + f2, y - 3, 1, 3, uni);
      this.px(x + 1 - f2, y - 3, 1, 3, uni);
    } else if (yo === 0) {
      this.px(x - 2, y - 3, 1, 3, uni);
      this.px(x + 1, y - 3, 1, 3, uni);
    }
    // 身体
    this.px(x - 2, y - 8 + yo, 4, 5, uni);
    this.px(x - 2, y - 4 + yo, 4, 1, col.primary);
    // 头
    this.px(x - 2, y - 11 + yo, 4, 3, C.skin);
    this.px(x - 2, y - 12 + yo, 4, 2, cap);
    this.px(x + (s.act === 'run' && f2 ? -3 : 2), y - 11 + yo, 2, 1, cap);
    // 动作
    if (s.act === 'bat') {
      const swing = (t % 1.4) > 0.95;
      if (swing) this.px(x + 1, y - 8, 6, 1, '#c98f66');
      else this.px(x + 2, y - 13, 1, 6, '#c98f66');
    } else if (s.act === 'pitch') {
      const up = (t % 2) > 1.4;
      this.px(up ? x - 4 : x + 2, up ? y - 12 : y - 7, 2, 2, C.skin);
    } else if (s.act === 'weight') {
      const up = Math.floor(t * 1.5) % 2;
      this.px(x - 5, y - (up ? 13 : 10), 10, 1, '#333c57');
      this.px(x - 6, y - (up ? 14 : 11), 2, 3, '#1a1c2c');
      this.px(x + 4, y - (up ? 14 : 11), 2, 3, '#1a1c2c');
    } else if (s.act === 'catch') {
      this.px(x - 3, y - 6 + yo - 2, 2, 2, '#5a3a22');
    } else if (s.act === 'field') {
      this.px(x - 3, y - 6, 1, 2, '#5a3a22');
    } else if (s.act === 'injured' || s.hurt) {
      this.px(x - 1, y - 14 + yo, 3, 3, '#f4f4f4');
      this.px(x, y - 14 + yo, 1, 3, '#b13e53');
      this.px(x - 1, y - 13 + yo, 3, 1, '#b13e53');
    } else if (s.act === 'mental') {
      this.px(x - 3, y - 6 + yo, 6, 1, C.skin);
    }
  }

  private coach(x: number, y: number, col: TeamColors): void {
    this.px(x - 3, y, 7, 2, C.shadow);
    this.px(x - 2, y - 3, 1, 3, '#333c57');
    this.px(x + 1, y - 3, 1, 3, '#333c57');
    this.px(x - 2, y - 8, 4, 5, '#29366f');
    this.px(x - 2, y - 11, 4, 3, C.skin2);
    this.px(x - 2, y - 12, 4, 2, col.primary);
    const swing = this.knockT > 1.6;
    if (swing) this.px(x + 1, y - 8, 7, 1, '#c98f66');
    else this.px(x + 2, y - 14, 1, 7, '#c98f66');
  }

  private cat(x: number, y: number): void {
    this.px(x, y - 3, 6, 3, '#f4f4f4');
    this.px(x + 1, y - 3, 2, 2, '#ef7d57');
    this.px(x + 5, y - 5, 3, 3, '#f4f4f4');
    this.px(x + 5, y - 6, 1, 1, '#f4f4f4');
    this.px(x + 7, y - 6, 1, 1, '#f4f4f4');
    this.px(x - 2, y - 4, 2, 1, '#1a1c2c');
    this.px(x, y, 1, 1, '#f4f4f4');
    this.px(x + 4, y, 1, 1, '#f4f4f4');
  }
}
