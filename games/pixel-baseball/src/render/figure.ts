// 骨架人物：关键帧之间插值，画出投球、挥棒的分解动作。
// 坐标：站立身高 = 100 单位，原点在两脚中间的地面，y 向上为负；a / b 是画面左 / 右侧的肢体
// 画法：腿、躯干、手臂、头、球棒、手套都由胶囊 / 椭圆 / 多边形拼成，逐像素按表面朝向分出明暗档（光从左上方来），
// 先记进离屏缓冲（材质、明暗档、图层），最后统一上色：前面的部件压住后面的部件时，在后面的部件上描一道暗线；
// 整个人物外圈描 1 像素深色轮廓。画好的小画布按「姿势 + 外观 + 尺寸」缓存，静止的人物不必每帧重画。
import { PAL, ellipse, makeCanvas, type Ctx } from './pix';

type P = [number, number];

export interface Pose {
  head: P;
  sh: [P, P];
  el: [P, P];
  ha: [P, P];
  hip: [P, P];
  kn: [P, P];
  ft: [P, P];
  /** 球棒：握把端、棒头 */
  bat?: [P, P];
  /** 绘制顺序（前面的先画，被后面的挡住） */
  order?: Part[];
  /** 脸朝哪边：-1 画面左，1 画面右，不填 = 正对 / 背对镜头（决定帽檐、护耳、鞋尖的方向） */
  face?: number;
}

export type Part = 'legA' | 'legB' | 'armA' | 'armB' | 'torso' | 'head' | 'bat' | 'glove';
export type View = 'back' | 'front';

export interface Look {
  skin: string;
  hair: string;
  /** 帽子 / 头盔颜色 */
  cap: string;
  helmet: boolean;
  /** 球衣 / 球裤 */
  shirt: string;
  /** 内衣袖子、袜子（球队颜色） */
  sleeve: string;
  sock: string;
  /** 背号颜色 */
  numCol: string;
  num: number | null;
  /** 戴手套的是画面左边（a）还是右边（b）的手 */
  glove: 'a' | 'b' | null;
  /** 捕手护具 / 主审 */
  gear?: 'catcher' | 'ump';
  /** 脚下的影子（默认画） */
  shadow?: boolean;
}

// ---------------- 插值 ----------------
const lp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const lp2 = (a: [P, P], b: [P, P], t: number): [P, P] => [lp(a[0], b[0], t), lp(a[1], b[1], t)];

export function mix(a: Pose, b: Pose, t: number): Pose {
  return {
    head: lp(a.head, b.head, t),
    sh: lp2(a.sh, b.sh, t),
    el: lp2(a.el, b.el, t),
    ha: lp2(a.ha, b.ha, t),
    hip: lp2(a.hip, b.hip, t),
    kn: lp2(a.kn, b.kn, t),
    ft: lp2(a.ft, b.ft, t),
    bat: a.bat && b.bat ? lp2(a.bat, b.bat, t) : t < 0.5 ? a.bat : b.bat,
    order: t < 0.5 ? a.order : b.order,
    face: t < 0.5 ? a.face : b.face,
  };
}

/** 左右镜像（左投手、左打者） */
export function mirror(p: Pose): Pose {
  const m = (q: P): P => [-q[0], q[1]];
  const m2 = (q: [P, P]): [P, P] => [m(q[1]), m(q[0])];
  const swap = (o?: Part[]) => o?.map((x) => (x === 'legA' ? 'legB' : x === 'legB' ? 'legA' : x === 'armA' ? 'armB' : x === 'armB' ? 'armA' : x)) as Part[] | undefined;
  return { head: m(p.head), sh: m2(p.sh), el: m2(p.el), ha: m2(p.ha), hip: m2(p.hip), kn: m2(p.kn), ft: m2(p.ft), bat: p.bat ? [m(p.bat[0]), m(p.bat[1])] : undefined, order: swap(p.order), face: p.face ? -p.face : p.face };
}

/** 关键帧序列：按时间 0..1 取姿势 */
export function track(keys: [number, Pose][], t: number, easeIt = true): Pose {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i];
    const [t1, p1] = keys[i + 1];
    if (t <= t1) {
      let k = (t - t0) / Math.max(1e-6, t1 - t0);
      if (easeIt) k = k * k * (3 - 2 * k);
      return mix(p0, p1, k);
    }
  }
  return keys[keys.length - 1][1];
}

// ======================= 调色 =======================
// 材质编号（缓冲里每个像素记一个）
const M_SKIN = 1;
const M_HAIR = 2;
const M_CAP = 3;
const M_BRIM = 4;
const M_SHIRT = 5;
const M_SLEEVE = 6;
const M_PANTS = 7;
const M_SOCK = 8;
const M_SHOE = 9;
const M_SOLE = 10;
const M_BELT = 11;
const M_NUM = 12;
const M_GLOVE = 13;
const M_WEB = 14;
const M_BAT = 15;
const M_GRIP = 16;
const M_MASK = 17;
const M_GEAR = 18;
const M_WHITE = 19;
const M_INK = 20;
const M_HELM = 21;
const M_METAL = 22;
const M_TRIM = 23;
const M_BAR = 24;
const N_MAT = 25;
// 明暗档：0 亮面，1 本色，2 暗面，3 最暗，4 接触线，5 高光点；第 4 位（8）= 远侧肢体，整体再压暗
const T_LINE = 4;
const FAR_BIT = 8;
// 色阶的种类
const K_CLOTH = 0;
const K_SKIN = 1;
const K_LEATHER = 2;
const K_METAL = 3;
const K_FLAT = 4;

const GLOVE = '#94582e';
const GLOVE_WEB = '#5e331c';
const BAT_METAL = '#c8d4dc';
const SHOE = '#2b2e42';
const BELT = '#272b40';
const UMP_SHIRT = '#29366f';
const UMP_PANTS = '#5d6a80';

const hexN = (s: string): number => parseInt(s.slice(1, 7), 16) || 0;
function mixc(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * t);
  return (r << 16) | (g << 8) | bl;
}
const lumOf = (c: number): number => (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
/** 0xRRGGBB → ImageData 用的 ABGR（小端） */
const abgr = (c: number): number => (0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;

/** 一种颜色的 6 档：亮、本色、暗、最暗、接触线、高光点。暗部往冷色偏，皮肤往暖色偏 */
function ramp(c: number, kind: number): number[] {
  if (kind === K_FLAT) return [c, c, c, c, mixc(c, 0, 0.35), c];
  const lum = lumOf(c);
  // 很深的颜色稍微提亮，免得和轮廓线糊成一片
  if (lum < 0.16) c = mixc(c, 0x566c86, 0.22);
  if (kind === K_SKIN) return [mixc(c, 0xfff0d8, 0.4), c, mixc(c, 0x9a4436, 0.27), mixc(c, 0x6b2c35, 0.45), mixc(c, 0x3b1f2b, 0.62), mixc(c, 0xffffff, 0.6)];
  if (kind === K_LEATHER) return [mixc(c, 0xffcd75, 0.3), c, mixc(c, 0x2a140c, 0.3), mixc(c, 0x2a140c, 0.52), mixc(c, 0x1a0c08, 0.6), mixc(c, 0xffe7b0, 0.55)];
  if (kind === K_METAL) return [mixc(c, 0xffffff, 0.55), c, mixc(c, 0x29366f, 0.3), mixc(c, 0x1a1c2c, 0.5), mixc(c, 0x1a1c2c, 0.68), 0xffffff];
  // 布料：浅色往蓝灰偏，中间色往藏青偏，深色往黑偏
  const cool = lum > 0.62 ? 0x4a5a80 : lum > 0.25 ? 0x222850 : 0x0b0c16;
  // 白色本身已经最亮：本色压一点点，亮面才看得出来
  if (lum > 0.86) return [mixc(c, 0xffffff, 0.5), mixc(c, cool, 0.07), mixc(c, cool, 0.3), mixc(c, cool, 0.52), mixc(c, 0x1a1c2c, 0.58), 0xffffff];
  const hi = lum < 0.3 ? mixc(c, 0x94b0c2, 0.3) : mixc(c, 0xffffff, 0.4);
  return [hi, c, mixc(c, cool, 0.32), mixc(c, cool, lum > 0.62 ? 0.56 : 0.55), mixc(c, 0x1a1c2c, 0.62), mixc(c, 0xffffff, 0.7)];
}

const lutCache = new Map<string, Uint32Array>();
function lutFor(look: Look, key: string): Uint32Array {
  let L = lutCache.get(key);
  if (L) return L;
  L = new Uint32Array(N_MAT * 16);
  const lut = L;
  const set = (m: number, col: string | number, kind: number) => {
    const r = ramp(typeof col === 'number' ? col : hexN(col), kind);
    for (let t = 0; t < 6; t++) {
      lut[m * 16 + t] = abgr(r[t]);
      lut[m * 16 + FAR_BIT + t] = abgr(mixc(r[t], 0x1e2240, 0.2));
    }
  };
  const ump = look.gear === 'ump';
  set(M_SKIN, look.skin, K_SKIN);
  // 高中球员多是平头：头发里透一点头皮的颜色
  set(M_HAIR, mixc(hexN(look.hair), hexN(look.skin), 0.3), K_CLOTH);
  set(M_CAP, ump ? '#232b52' : look.cap, K_CLOTH);
  set(M_BRIM, mixc(hexN(ump ? '#232b52' : look.cap), 0x1a1c2c, 0.3), K_CLOTH);
  set(M_HELM, look.cap, K_METAL);
  set(M_SHIRT, ump ? UMP_SHIRT : look.shirt, K_CLOTH);
  set(M_SLEEVE, ump ? UMP_SHIRT : look.sleeve, K_CLOTH);
  set(M_TRIM, ump ? UMP_SHIRT : look.sleeve, K_CLOTH);
  set(M_PANTS, ump ? UMP_PANTS : look.shirt, K_CLOTH);
  set(M_SOCK, look.sock, K_CLOTH);
  set(M_SHOE, SHOE, K_CLOTH);
  set(M_SOLE, '#8b9bb4', K_CLOTH);
  set(M_BELT, BELT, K_CLOTH);
  set(M_NUM, look.numCol, K_CLOTH);
  set(M_GLOVE, GLOVE, K_LEATHER);
  set(M_WEB, GLOVE_WEB, K_LEATHER);
  set(M_BAT, BAT_METAL, K_METAL);
  set(M_GRIP, '#2a2c40', K_CLOTH);
  set(M_MASK, ump ? '#1f2233' : '#2b3048', K_METAL);
  set(M_GEAR, look.sleeve, K_METAL);
  set(M_WHITE, PAL.white, K_CLOTH);
  set(M_INK, PAL.ink, K_FLAT);
  set(M_METAL, '#c8d4dc', K_METAL);
  set(M_BAR, '#8b9bb4', K_METAL);
  if (lutCache.size > 64) lutCache.clear();
  lutCache.set(key, lut);
  return lut;
}

// ======================= 光栅化 =======================
// 离屏缓冲：行跨度 ST，当前用到 BW × BH
let ST = 0;
let ROWS = 0;
let BW = 0;
let BH = 0;
let MAT = new Uint8Array(0);
let TON = new Uint8Array(0);
let LAY = new Uint8Array(0);
let GRP = new Uint8Array(0);
let IMG: ImageData | null = null;
let PIX = new Uint32Array(0);
// 当前部件：图层号（越大越靠前）、组（同组之间不描接触线）、是否远侧
let LAYER = 0;
let GROUP = 0;
let FAR = 0;
// 组
const G_LEG = [1, 2];
const G_TORSO = 3;
const G_ARM = [4, 5];
const G_HEAD = 6;
const G_BAT = 7;
const G_GLOVE = 8;
const G_NECK = 9;
const G_GEAR = 10;

function begin(w: number, h: number): void {
  if (w > ST || h > ROWS) {
    ST = Math.max(ST, Math.ceil(w / 32) * 32);
    ROWS = Math.max(ROWS, h);
    const n = ST * ROWS;
    MAT = new Uint8Array(n);
    TON = new Uint8Array(n);
    LAY = new Uint8Array(n);
    GRP = new Uint8Array(n);
    IMG = new ImageData(ST, ROWS);
    PIX = new Uint32Array(IMG.data.buffer);
  }
  BW = w;
  BH = h;
  for (let y = 0; y < h; y++) MAT.fill(0, y * ST, y * ST + w);
  LAYER = 0;
  GROUP = 0;
  FAR = 0;
}

// 光从左上方、略朝镜头照来
const LX = -0.5;
const LY = -0.55;
const LZ = 0.67;
// 分档阈值（小尺寸时去掉亮面和最暗档）
let TH0 = 0.78;
let TH1 = 0.3;
let TH2 = -0.08;
let SPEC = true;
const band = (l: number): number => (l > TH0 ? 0 : l > TH1 ? 1 : l > TH2 ? 2 : 3);
const bandG = (l: number): number => (l > 0.972 && SPEC ? 5 : l > TH0 + 0.1 ? 0 : l > TH1 - 0.1 ? 1 : l > TH2 - 0.1 ? 2 : 3);
/** 金属棒：沿长度方向的条纹——受光的边、白色高光带、本色、暗色反光带、背光边的一点反光 */
const bandM = (u: number): number => (u < -0.72 ? 0 : u < -0.3 ? (SPEC ? 5 : 0) : u < 0.22 ? 1 : u < 0.72 ? 2 : 1);
const MINR = 0.62;

/** 粗细渐变的胶囊（像素坐标）。mode：0 布料，1 有光泽，2 金属圆柱，负数 = 固定明暗档 -(t+1) */
function capPx(ax: number, ay: number, ar: number, bx: number, by: number, br: number, m: number, mode: number): void {
  if (ar < MINR) ar = MINR;
  if (br < MINR) br = MINR;
  const x0 = Math.max(0, Math.floor(Math.min(ax - ar, bx - br)));
  const x1 = Math.min(BW - 1, Math.ceil(Math.max(ax + ar, bx + br)));
  const y0 = Math.max(0, Math.floor(Math.min(ay - ar, by - br)));
  const y1 = Math.min(BH - 1, Math.ceil(Math.max(ay + ar, by + br)));
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const inv = l2 > 1e-9 ? 1 / l2 : 0;
  const dr = br - ar;
  // 金属圆柱：横截方向，朝光的一侧为负
  let qx = l2 > 1e-9 ? -dy / Math.sqrt(l2) : 1;
  let qy = l2 > 1e-9 ? dx / Math.sqrt(l2) : 0;
  if (qx * LX + qy * LY > 0) {
    qx = -qx;
    qy = -qy;
  }
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    let i = y * ST + x0;
    for (let x = x0; x <= x1; x++, i++) {
      const px = x + 0.5;
      let t = ((px - ax) * dx + (py - ay) * dy) * inv;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const r = ar + dr * t;
      const ex = px - ax - dx * t;
      const ey = py - ay - dy * t;
      const d2 = ex * ex + ey * ey;
      if (d2 > r * r) continue;
      let tone: number;
      if (mode < 0) tone = -mode - 1;
      else if (mode === 2) tone = bandM((ex * qx + ey * qy) / r);
      else {
        const nx = ex / r;
        const ny = ey / r;
        const l = LX * nx + LY * ny + LZ * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        tone = mode === 1 ? bandG(l) : band(l);
      }
      MAT[i] = m;
      TON[i] = tone | FAR;
      LAY[i] = LAYER;
      GRP[i] = GROUP;
    }
  }
}

/** 旋转的椭圆（像素坐标），只画 clipY 以上的部分 */
function ellPx(cx: number, cy: number, rx: number, ry: number, ang: number, m: number, mode: number, clipY: number): void {
  if (rx < MINR) rx = MINR;
  if (ry < MINR) ry = MINR;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const R = Math.max(rx, ry);
  const x0 = Math.max(0, Math.floor(cx - R));
  const x1 = Math.min(BW - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R));
  const y1 = Math.min(BH - 1, Math.ceil(cy + R));
  for (let y = y0; y <= y1; y++) {
    if (y + 0.5 > clipY) break;
    const py = y + 0.5 - cy;
    let i = y * ST + x0;
    for (let x = x0; x <= x1; x++, i++) {
      const px = x + 0.5 - cx;
      const u = (px * ca + py * sa) / rx;
      const v = (py * ca - px * sa) / ry;
      const d = u * u + v * v;
      if (d > 1) continue;
      let tone: number;
      if (mode < 0) tone = -mode - 1;
      else {
        const l = LX * (u * ca - v * sa) + LY * (u * sa + v * ca) + LZ * Math.sqrt(1 - d);
        tone = mode === 1 ? bandG(l) : band(l);
      }
      MAT[i] = m;
      TON[i] = tone | FAR;
      LAY[i] = LAYER;
      GRP[i] = GROUP;
    }
  }
}

/** 多边形（像素坐标，扫描线），每个像素交给 fn 决定画什么 */
function polyPx(pts: number[], fn: (x: number, y: number, i: number) => void): void {
  const n = pts.length >> 1;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (let k = 0; k < n; k++) {
    ymin = Math.min(ymin, pts[k * 2 + 1]);
    ymax = Math.max(ymax, pts[k * 2 + 1]);
  }
  const ya = Math.max(0, Math.floor(ymin));
  const yb = Math.min(BH - 1, Math.ceil(ymax));
  const cut: number[] = [];
  for (let y = ya; y <= yb; y++) {
    const yc = y + 0.5;
    cut.length = 0;
    for (let k = 0; k < n; k++) {
      const ax = pts[k * 2];
      const ay = pts[k * 2 + 1];
      const j = (k + 1) % n;
      const bx = pts[j * 2];
      const by = pts[j * 2 + 1];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) cut.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    cut.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cut.length; k += 2) {
      const xa = Math.max(0, Math.ceil(cut[k] - 0.5));
      const xb = Math.min(BW - 1, Math.floor(cut[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) fn(x, y, y * ST + x);
    }
  }
}

/** 写一个像素（多边形回调里用） */
function put(i: number, m: number, tone: number): void {
  MAT[i] = m;
  TON[i] = tone | FAR;
  LAY[i] = LAYER;
  GRP[i] = GROUP;
}

/** 改当前图层上某个像素的材质（明暗不变）；only 不为 0 时只改这种材质 */
function paintPx(x: number, y: number, m: number, only = 0): void {
  if (x < 0 || y < 0 || x >= BW || y >= BH) return;
  const i = y * ST + x;
  if (MAT[i] === 0 || LAY[i] !== LAYER || (only && MAT[i] !== only)) return;
  MAT[i] = m;
}

/** 改当前图层上某个像素的材质和明暗档 */
function setPx(x: number, y: number, m: number, t: number, only = 0): void {
  if (x < 0 || y < 0 || x >= BW || y >= BH) return;
  const i = y * ST + x;
  if (MAT[i] === 0 || LAY[i] !== LAYER || (only && MAT[i] !== only)) return;
  MAT[i] = m;
  TON[i] = (TON[i] & FAR_BIT) | t;
}

/** 把当前图层上某个像素压暗到至少第 t 档 */
function darkPx(x: number, y: number, t: number, only = 0): void {
  if (x < 0 || y < 0 || x >= BW || y >= BH) return;
  const i = y * ST + x;
  if (MAT[i] === 0 || LAY[i] !== LAYER || (only && MAT[i] !== only)) return;
  if ((TON[i] & 7) < t || (TON[i] & 7) === 5) TON[i] = (TON[i] & FAR_BIT) | t;
}

/** 上色：接触线、外轮廓，写进 ImageData */
function resolve(lut: Uint32Array, lines: boolean): void {
  const w = BW;
  const h = BH;
  const st = ST;
  const ink = abgr(hexN(PAL.ink));
  for (let y = 0; y < h; y++) {
    let i = y * st;
    for (let x = 0; x < w; x++, i++) {
      const m = MAT[i];
      if (m === 0) {
        const solid = (x > 0 && MAT[i - 1] !== 0) || (x < w - 1 && MAT[i + 1] !== 0) || (y > 0 && MAT[i - st] !== 0) || (y < h - 1 && MAT[i + st] !== 0);
        PIX[i] = solid ? ink : 0;
        continue;
      }
      let t = TON[i];
      if (lines) {
        const L = LAY[i];
        const g = GRP[i];
        if ((x > 0 && over(i - 1, L, g, m)) || (x < w - 1 && over(i + 1, L, g, m)) || (y > 0 && over(i - st, L, g, m)) || (y < h - 1 && over(i + st, L, g, m))) t = (t & FAR_BIT) | T_LINE;
      }
      PIX[i] = lut[m * 16 + t];
    }
  }
}

/** 邻居 j 是不是压在本像素上面的另一个部件（要描接触线） */
function over(j: number, L: number, g: number, m: number): boolean {
  const mj = MAT[j];
  if (mj === 0 || LAY[j] <= L || GRP[j] === g) return false;
  // 胯部和大腿是同一条球裤，不描线
  if (m === M_PANTS && mj === M_PANTS && (g === G_TORSO || GRP[j] === G_TORSO)) return false;
  // 后颈和头发 / 帽子之间不描线（背面）
  if (g === G_NECK && GRP[j] === G_HEAD && mj !== M_SKIN) return false;
  return true;
}

// ======================= 人物 =======================
// 本次绘制的状态
let POSE = null as unknown as Pose;
let LOOK = null as unknown as Look;
let VIEW: View = 'front';
let FACE = 0;
let S = 1;
let OX = 0;
let OY = 0;
/** 细节档位：DET 大尺寸（鼻子嘴、指节、口袋、褶皱），MED 中等（背号、滚边、眼睛、袜子横条），SML 小尺寸也保留的（简化背号、鞋底） */
let DET = false;
let MED = false;
let SML = false;
const ARM_DRAWN: [boolean, boolean] = [false, false];
const ARM_FAR: [number, number] = [0, 0];
let GLOVE_PART = false;

const X = (u: number): number => OX + u * S;
const Y = (v: number): number => OY + v * S;
const cap = (a: P, ra: number, b: P, rb: number, m: number, mode = 0): void => capPx(X(a[0]), Y(a[1]), ra * S, X(b[0]), Y(b[1]), rb * S, m, mode);
const ell = (cx: number, cy: number, rx: number, ry: number, m: number, mode = 0, ang = 0, clip = Infinity): void => ellPx(X(cx), Y(cy), rx * S, ry * S, ang, m, mode, clip === Infinity ? Infinity : Y(clip));
const dirOf = (a: P, b: P): P => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  return l > 1e-6 ? [dx / l, dy / l] : [0, 1];
};

/** 在单位坐标的矩形里逐像素调用 fn（像素中心落在矩形里） */
function eachPx(u0: number, v0: number, u1: number, v1: number, fn: (x: number, y: number) => void): void {
  const xa = Math.ceil(X(Math.min(u0, u1)) - 0.5);
  const xb = Math.floor(X(Math.max(u0, u1)) - 0.5);
  const ya = Math.ceil(Y(Math.min(v0, v1)) - 0.5);
  const yb = Math.floor(Y(Math.max(v0, v1)) - 0.5);
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) fn(x, y);
}

/** 以像素为单位的小方块（眼睛、扣子），至少 1 像素 */
function blockPx(u: number, v: number, w: number, h: number, m: number, only = 0): void {
  const x0 = Math.round(X(u) - w / 2);
  const y0 = Math.round(Y(v) - h / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) paintPx(x0 + x, y0 + y, m, only);
}

// ---------------- 腿 ----------------
function leg(i: 0 | 1, far: boolean): void {
  LAYER++;
  GROUP = G_LEG[i];
  FAR = far ? FAR_BIT : 0;
  const hp = POSE.hip[i];
  const kn = POSE.kn[i];
  const ft = POSE.ft[i];
  const ump = LOOK.gear === 'ump';
  const d = dirOf(ft, kn);
  const ank: P = [ft[0] + d[0] * 4, ft[1] + d[1] * 4];
  // 长袜（球队颜色）：小腿肚鼓一点，往脚踝收细；上端被裤脚盖住
  if (!ump) {
    const top = lp(kn, ank, 0.12);
    const calf = lp(kn, ank, 0.42);
    cap(top, 4.2, calf, 4.4, M_SOCK);
    cap(calf, 4.4, ank, 2.6, M_SOCK);
    // 长袜上的白色横条
    if (MED) sockStripes(top, ank);
  }
  shoe(i, ank);
  // 球裤：大腿 + 膝盖下一点，裤脚略鼓
  cap(hp, 6.1, kn, 4.6, M_PANTS);
  if (ump) cap(kn, 4.6, ank, 3.7, M_PANTS);
  else cap(kn, 4.6, lp(kn, ank, 0.24), 4.85, M_PANTS);
  // 背面：膝窝的一道褶
  if (DET && VIEW === 'back') {
    const t = dirOf(hp, kn);
    for (let s = -2.4; s <= 2.4; s += 0.5 / S) {
      const k = 0.9 - (s / 2.4) * (s / 2.4) * 1.1;
      darkPx(Math.floor(X(kn[0] - t[1] * s + t[0] * k)), Math.floor(Y(kn[1] + t[0] * s + t[1] * k)), 2, M_PANTS);
    }
  }
  // 捕手护腿
  if (LOOK.gear === 'catcher') {
    LAYER++;
    GROUP = G_GEAR;
    cap(lp(kn, ank, 0.12), 4.9, lp(ank, ft, -0.05), 4.1, M_GEAR, 1);
    ell(kn[0], kn[1], 4.8, 4.4, M_GEAR, 1);
    if (MED) {
      // 护腿中间的棱
      const a = lp(kn, ank, 0.25);
      const b = lp(kn, ank, 0.9);
      const n = Math.max(2, Math.round(Math.hypot(X(b[0]) - X(a[0]), Y(b[1]) - Y(a[1]))));
      for (let k = 0; k <= n; k++) darkPx(Math.round(X(a[0] + ((b[0] - a[0]) * k) / n) - 0.5), Math.round(Y(a[1] + ((b[1] - a[1]) * k) / n) - 0.5), 2);
    }
  }
}

/** 长袜上的白色横条（大尺寸两条，中等尺寸一条），至少 1 像素粗 */
function sockStripes(top: P, ank: P): void {
  const d = dirOf(top, ank);
  const len = Math.hypot(ank[0] - top[0], ank[1] - top[1]);
  const th = Math.max(1.25, 1.15 * S) / S;
  const bands = DET ? [0.4, 0.4 + (th + 1.1) / len] : [0.44];
  const x0 = Math.floor(Math.min(X(top[0]), X(ank[0])) - 5 * S);
  const x1 = Math.ceil(Math.max(X(top[0]), X(ank[0])) + 5 * S);
  const y0 = Math.floor(Math.min(Y(top[1]), Y(ank[1])) - 5 * S);
  const y1 = Math.ceil(Math.max(Y(top[1]), Y(ank[1])) + 5 * S);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - OX) / S - top[0];
      const v = (y + 0.5 - OY) / S - top[1];
      const t = (u * d[0] + v * d[1]) / len;
      for (const b of bands) if (t >= b && t < b + th / len) paintPx(x, y, M_WHITE, M_SOCK);
    }
  }
}

/** 钉鞋：黑色鞋面 + 浅色鞋底；侧着身时鞋尖朝脸的方向，正对 / 背对时两脚略向外 */
function shoe(i: 0 | 1, ank: P): void {
  const ft = POSE.ft[i];
  const fo = FACE;
  if (fo !== 0) {
    ell(ft[0] + fo * 2.4, ft[1] - 2.3, 5.6, 2.4, M_SHOE);
    ell(ank[0] + fo * 0.3, Math.min(ank[1] + 0.6, ft[1] - 2.6), 3.0, 2.3, M_SHOE);
  } else {
    const other = POSE.ft[1 - i];
    const out = ft[0] === other[0] ? (i === 0 ? -1 : 1) : ft[0] > other[0] ? 1 : -1;
    ell(ft[0] + out * 0.6, ft[1] - 2.3, 3.9, 2.4, M_SHOE);
    ell(ank[0], Math.min(ank[1] + 0.6, ft[1] - 2.6), 2.8, 2.2, M_SHOE);
  }
  if (SML) eachPx(ft[0] - 7, ft[1] - 0.9, ft[0] + 7, ft[1], (x, y) => paintPx(x, y, M_SOLE, M_SHOE));
}

// ---------------- 躯干 ----------------
function torso(): void {
  const [A, B] = POSE.sh;
  const [C, D] = POSE.hip;
  const msx = (A[0] + B[0]) / 2;
  const msy = (A[1] + B[1]) / 2;
  const mhx = (C[0] + D[0]) / 2;
  const mhy = (C[1] + D[1]) / 2;
  let dx = mhx - msx;
  let dy = mhy - msy;
  const Lt = Math.hypot(dx, dy) || 1;
  dx /= Lt;
  dy /= Lt;
  // 躯干的横向（指向画面右）
  const lx = dy;
  const ly = -dx;
  const T = (p: P, a: number, b: number): number[] => [X(p[0] + lx * a + dx * b), Y(p[1] + ly * a + dy * b)];
  const Ms: P = [msx, msy];
  const Mh: P = [mhx, mhy];
  const ump = LOOK.gear === 'ump';
  const bulk = ump ? 1.4 : 0;
  const back = VIEW === 'back';

  // 脖子：上段皮肤，下段是球队颜色的内衣高领
  LAYER++;
  GROUP = G_NECK;
  FAR = 0;
  const hd = POSE.head;
  const nTop: P = [hd[0] * 0.7 + msx * 0.3, hd[1] + 3];
  const nBot: P = [msx - dx * 1, msy - dy * 1];
  cap(nTop, 3.5, nBot, 3.8, M_SKIN);
  if (!ump) cap(lp(nTop, nBot, 0.62), 3.9, nBot, 4.1, M_SLEEVE);

  LAYER++;
  GROUP = G_TORSO;
  const hs = Math.abs((B[0] - A[0]) * lx + (B[1] - A[1]) * ly) / 2;
  const hh = Math.abs((D[0] - C[0]) * lx + (D[1] - C[1]) * ly) / 2;
  // 轮廓：颈根 → 圆润的肩头（绕肩关节的一段弧）→ 腋下 → 收腰 → 胯 → 臀 → 裆，左右各一边
  const rS = 3.4 + bulk;
  const side = (J: P, K: P, sg: number): number[][] => {
    const o: number[][] = [T(Ms, sg * 3.3, -4.3)];
    for (const deg of [-112, -80, -50, -20, 12, 42]) {
      const r = (deg * Math.PI) / 180;
      o.push(T(J, sg * rS * Math.cos(r), rS * Math.sin(r)));
    }
    o.push(T(J, sg * (1.9 + bulk), 9.2), T(K, sg * (3.0 + bulk * 0.6), -6.8), T(K, sg * 4.0, 0.6), T(K, sg * 3.3, 4.4));
    return o;
  };
  const right = side(B, D, 1);
  const left = side(A, C, -1).reverse();
  const pts = [...right, T(Mh, 0, 5.0), ...left].flat();
  // 腰带线：胯关节连线往上 1.4~3.8 单位
  let hx = D[0] - C[0];
  let hy = D[1] - C[1];
  const hl = Math.hypot(hx, hy) || 1;
  hx /= hl;
  hy /= hl;
  const hnx = -hy;
  const hny = hx;
  const wS = hs + rS;
  const wW = hh + 3.2 + bulk * 0.6;
  const wH = hh + 4.2;
  polyPx(pts, (x, y, i) => {
    const u = (x + 0.5 - OX) / S;
    const v = (y + 0.5 - OY) / S;
    const rx = u - msx;
    const ry = v - msy;
    const a = rx * lx + ry * ly;
    const b = rx * dx + ry * dy;
    // 这一高度的半宽
    const k1 = Math.min(1, Math.max(0, (b - 2) / Math.max(1, Lt - 8.8)));
    const half = b < Lt - 6.8 ? wS + (wW - wS) * k1 : wW + (wH - wW) * Math.min(1, (b - (Lt - 6.8)) / 7.4);
    let nu = a / half;
    nu = nu < -1 ? -1 : nu > 1 ? 1 : nu;
    const tilt = b < 1.5 ? -0.55 : b < 9 ? -0.55 + (b - 1.5) * 0.06 : b > Lt + 1 ? 0.12 : -0.1;
    const nx = lx * nu * 0.95;
    const ny = ly * nu * 0.95 + tilt;
    const l = LX * nx + LY * ny + LZ * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    // 材质：腰带以上球衣，腰带，以下球裤
    const bb = (u - C[0]) * hnx + (v - C[1]) * hny;
    const m = bb < -3.8 ? M_SHIRT : bb < -1.3 ? M_BELT : M_PANTS;
    put(i, m, band(l));
  });

  // ---- 球衣上的细节 ----
  const at = (a: number, b: number): P => [msx + lx * a + dx * b, msy + ly * a + dy * b];
  const toPx = (p: P): [number, number] => [X(p[0]), Y(p[1])];
  /** 躯干坐标 (a 横, b 竖) 的区域里改材质 */
  const region = (a0: number, a1: number, b0: number, b1: number, fn: (x: number, y: number, a: number, b: number) => void) => {
    const cs = [at(a0, b0), at(a1, b0), at(a0, b1), at(a1, b1)];
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const [cu, cv] of cs) {
      u0 = Math.min(u0, cu);
      u1 = Math.max(u1, cu);
      v0 = Math.min(v0, cv);
      v1 = Math.max(v1, cv);
    }
    eachPx(u0, v0, u1, v1, (x, y) => {
      const u = (x + 0.5 - OX) / S - msx;
      const v = (y + 0.5 - OY) / S - msy;
      const a = u * lx + v * ly;
      const b = u * dx + v * dy;
      if (a >= a0 && a <= a1 && b >= b0 && b <= b1) fn(x, y, a, b);
    });
  };
  const narrow = hs < 7;
  if (!ump) {
    if (!back && MED) {
      // 领口：V 字开口露出内衣
      region(-3.8, 3.8, -3.6, 3.2, (x, y, a, b) => {
        if (Math.abs(a) < (3.2 - b) * 0.62 + 0.2) paintPx(x, y, M_SLEEVE, M_SHIRT);
        else if (DET && Math.abs(a) < (3.2 - b) * 0.62 + 0.2 + 1.1 / S) paintPx(x, y, M_TRIM, M_SHIRT);
      });
      // 前襟：一条暗线
      if (!LOOK.gear) region(-0.5, 0.5, 3, Lt, (x, y, a) => {
        if (Math.abs(a) < 0.5 / S + 0.01) darkPx(x, y, 2, M_SHIRT);
      });
    }
    if (back && MED) {
      // 背后领口滚边
      region(-4, 4, -3.6, -1.6, (x, y, a, b) => {
        if (b < -3.4 + 0.9 + Math.abs(a) * 0.05) paintPx(x, y, M_TRIM, M_SHIRT);
      });
    }
  }
  // 球衣塞进裤腰，腰带上方挤出几道褶
  if (DET && !LOOK.gear) {
    for (const sg of [-1, 1]) {
      for (const [a0, len] of [[0.34, 3.2], [0.62, 2.4]]) {
        const a = sg * a0 * wW;
        for (let k = 0; k <= len; k += 0.45 / S) {
          const p = at(a + sg * k * 0.35, Lt - 4.4 - len + k);
          darkPx(Math.floor(X(p[0])), Math.floor(Y(p[1])), 2, M_SHIRT);
        }
      }
    }
  }
  // 背号 / 胸前校名
  if (!LOOK.gear && !narrow) {
    if (back && LOOK.num !== null && SML) jerseyNumber(LOOK.num, toPx(at(0, 11.2)), Lt);
    if (!back && MED) chestLetters(toPx(at(0, 7.2)));
  }
  // 腰带扣、后口袋
  if (!ump && MED) {
    const beltMid: P = [mhx - hnx * 2.55, mhy - hny * 2.55];
    if (!back) eachPx(beltMid[0] - 1.6, beltMid[1] - 1.1, beltMid[0] + 1.6, beltMid[1] + 1.1, (x, y) => paintPx(x, y, M_METAL, M_BELT));
    if (back && DET) {
      // 后口袋：一道开口线
      for (const sgn of [-1, 1]) {
        const c: P = [mhx + hx * sgn * (hh * 0.55 + 1.2) + hnx * 1.4, mhy + hy * sgn * (hh * 0.55 + 1.2) + hny * 1.4];
        eachPx(c[0] - 2.3, c[1] - 0.45, c[0] + 2.3, c[1] + 0.45, (x, y) => darkPx(x, y, 3, M_PANTS));
      }
    }
  }
  // 主审：胸前的护具撑起来，口袋上的徽章
  if (ump && MED && !back) {
    const c = at(-hs * 0.45, 6.5);
    eachPx(c[0] - 1.1, c[1] - 1.2, c[0] + 1.1, c[1] + 1.2, (x, y) => paintPx(x, y, M_METAL, M_SHIRT));
  }
  // 捕手护胸
  if (LOOK.gear === 'catcher' && !back) {
    LAYER++;
    GROUP = G_GEAR;
    const g = [
      ...T(Ms, -3.4, -2.4),
      ...T(Ms, 3.4, -2.4),
      ...T(B, 1.8, 0.6),
      ...T(B, 1.2, 9),
      ...T(Mh, 3.6, -3.2),
      ...T(Mh, 0, -1.4),
      ...T(Mh, -3.6, -3.2),
      ...T(A, -1.2, 9),
      ...T(A, -1.8, 0.6),
    ];
    polyPx(g, (x, y, i) => {
      const u = (x + 0.5 - OX) / S - msx;
      const v = (y + 0.5 - OY) / S - msy;
      const a = u * lx + v * ly;
      const b = u * dx + v * dy;
      const nu = Math.max(-1, Math.min(1, a / (hs + 2)));
      const nb = b < 2 ? -0.5 : b > Lt - 6 ? 0.3 : -0.1;
      const nx = lx * nu * 0.9;
      const ny = ly * nu * 0.9 + nb;
      const l = LX * nx + LY * ny + LZ * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // 护胸分成几块：横向的接缝
      const seam = MED && (Math.abs(b - 8.5) < 0.45 / S || Math.abs(b - 15.5) < 0.45 / S);
      put(i, M_GEAR, seam ? 3 : bandG(l));
    });
  }
}

/** 背号：5×7 的像素数字（小尺寸用 3×5），颜色跟着球衣的明暗 */
const DIG7: Record<string, string[]> = {
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};
const DIG3: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

function jerseyNumber(n: number, [cx, cy]: [number, number], Lt: number): void {
  const str = String(Math.abs(Math.round(n)) % 100);
  const hpx = 11.2 * S * (Lt / 27);
  const big = hpx >= 6.5;
  if (!big && hpx < 4.2) return;
  const font = big ? DIG7 : DIG3;
  const gw = big ? 5 : 3;
  const gh = big ? 7 : 5;
  const c = big ? Math.max(1, Math.round(hpx / 7)) : 1;
  const gap = c;
  const tw = str.length * gw * c + (str.length - 1) * gap;
  const x0 = Math.round(cx - tw / 2);
  const y0 = Math.round(cy - (gh * c) / 2);
  let xx = x0;
  for (const ch of str) {
    const g = font[ch];
    for (let r = 0; r < gh; r++) for (let k = 0; k < gw; k++) if (g[r][k] === '1') for (let yy = 0; yy < c; yy++) for (let q = 0; q < c; q++) paintPx(xx + k * c + q, y0 + r * c + yy, M_NUM, M_SHIRT);
    xx += gw * c + gap;
  }
}

/** 胸前的校名（看不清字，只要像一排字母） */
const LETTERS: string[][] = [
  ['111', '100', '100', '111'],
  ['101', '111', '101', '101'],
  ['111', '101', '101', '111'],
  ['111', '110', '011', '111'],
  ['101', '110', '101', '101'],
  ['111', '010', '010', '010'],
  ['110', '101', '110', '101'],
  ['111', '110', '100', '111'],
  ['101', '101', '101', '111'],
  ['010', '101', '111', '101'],
];
function chestLetters([cx, cy]: [number, number]): void {
  const c = Math.max(1, Math.round(S * 0.9));
  let seed = 0;
  for (const ch of LOOK.sleeve + LOOK.numCol) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const n = 5;
  const tw = n * 3 * c + (n - 1) * c;
  const x0 = Math.round(cx - tw / 2);
  for (let k = 0; k < n; k++) {
    const g = LETTERS[(seed >>> (k * 3)) % LETTERS.length];
    // 校名排成一道微微上拱的弧
    const arc = Math.round(Math.abs(k - (n - 1) / 2) * 0.5 * c);
    const y0 = Math.round(cy - 2 * c) + arc;
    for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) if (g[r][q] === '1') for (let yy = 0; yy < c; yy++) for (let xx = 0; xx < c; xx++) paintPx(x0 + k * 4 * c + q * c + xx, y0 + r * c + yy, M_NUM, M_SHIRT);
  }
}

// ---------------- 手臂 ----------------
function arm(i: 0 | 1, far: boolean): void {
  LAYER++;
  GROUP = G_ARM[i];
  FAR = far ? FAR_BIT : 0;
  const sh = POSE.sh[i];
  const el = POSE.el[i];
  const ha = POSE.ha[i];
  const ump = LOOK.gear === 'ump';
  const d = dirOf(el, ha);
  const wr: P = [ha[0] - d[0] * 1.6, ha[1] - d[1] * 1.6];
  // 内衣袖子（球队颜色）：上臂、前臂
  cap(sh, 3.9, el, 3.2, M_SLEEVE);
  cap(el, 3.2, wr, 2.4, M_SLEEVE);
  if (!ump) {
    // 球衣短袖，袖口一圈球队颜色的滚边
    if (MED) cap(sh, 4.2, lp(sh, el, 0.53), 3.95, M_TRIM);
    cap(sh, 4.2, lp(sh, el, 0.47), 4.0, M_SHIRT);
  } else cap(sh, 4.4, lp(sh, el, 0.5), 3.9, M_SLEEVE);
  ARM_DRAWN[i] = true;
  ARM_FAR[i] = FAR;
  if (LOOK.glove === (i === 0 ? 'a' : 'b')) {
    if (!GLOVE_PART) glove(i);
  } else fist(i);
}

function fist(i: 0 | 1): void {
  const el = POSE.el[i];
  const ha = POSE.ha[i];
  const d = dirOf(el, ha);
  ell(ha[0], ha[1], 2.7, 2.3, M_SKIN, 0, Math.atan2(d[1], d[0]));
  // 指节
  if (DET) {
    const k: P = [ha[0] + d[0] * 1.2, ha[1] + d[1] * 1.2];
    const n: P = [-d[1], d[0]];
    for (let s = -1; s <= 1; s += 0.5) darkPx(Math.floor(X(k[0] + n[0] * s * 1.6)), Math.floor(Y(k[1] + n[1] * s * 1.6)), 2, M_SKIN);
  }
}

function glove(i: 0 | 1): void {
  LAYER++;
  GROUP = G_GLOVE;
  const el = POSE.el[i];
  const ha = POSE.ha[i];
  const d = dirOf(el, ha);
  const ang = Math.atan2(d[1], d[0]);
  const back = VIEW === 'back';
  if (LOOK.gear === 'catcher') {
    // 捕手手套：又圆又厚，正面看得到深色的手套窝
    const c: P = [ha[0] + d[0] * 1.4, ha[1] + d[1] * 1.4];
    ell(c[0], c[1], 5.6, 5.3, M_GLOVE, 0, ang);
    if (!back && SML) ell(c[0] + d[0] * 0.6 + 0.4, c[1] + d[1] * 0.6 + 0.4, 3.0, 2.8, M_WEB, -3, ang);
  } else {
    const c: P = [ha[0] + d[0] * 2.0, ha[1] + d[1] * 2.0];
    ell(c[0], c[1], 4.8, 3.8, M_GLOVE, 0, ang);
    // 手指那头的网
    if (MED) ell(c[0] + d[0] * 2.9, c[1] + d[1] * 2.9, 1.9, 2.5, M_WEB, 0, ang);
    // 大拇指
    const n: P = [-d[1], d[0]];
    ell(c[0] - d[0] * 0.6 + n[0] * 3.1, c[1] - d[1] * 0.6 + n[1] * 3.1, 2.2, 1.5, M_GLOVE, 0, ang);
  }
}

// ---------------- 球棒 ----------------
function bat(): void {
  if (!POSE.bat) return;
  LAYER++;
  GROUP = G_BAT;
  FAR = 0;
  const [g, t] = POSE.bat;
  const d = dirOf(g, t);
  const k1 = lp(g, t, 0.34);
  const k2 = lp(g, t, 0.66);
  const knob: P = [g[0] - d[0] * 1.2, g[1] - d[1] * 1.2];
  // 握把缠着深色胶布，棒身是银色金属棒，往棒头逐渐变粗
  ell(knob[0], knob[1], 1.7, 1.7, M_GRIP);
  cap(knob, 1.0, k1, 1.05, M_GRIP);
  cap(k1, 1.05, k2, 2.05, M_BAT, 2);
  cap(k2, 2.05, t, 2.35, M_BAT, 2);
  // 握在手里：手画在球棒上面
  for (const i of [0, 1] as const) {
    if (!ARM_DRAWN[i] || LOOK.glove === (i === 0 ? 'a' : 'b')) continue;
    const h = POSE.ha[i];
    const dist = Math.abs((h[0] - g[0]) * d[1] - (h[1] - g[1]) * d[0]);
    const along = (h[0] - g[0]) * d[0] + (h[1] - g[1]) * d[1];
    if (dist < 5 && along > -6 && along < 16) {
      LAYER++;
      GROUP = G_ARM[i];
      FAR = ARM_FAR[i];
      fist(i);
    }
  }
}

// ---------------- 头 ----------------
function head(): void {
  LAYER++;
  GROUP = G_HEAD;
  FAR = 0;
  const [hx, hy] = POSE.head;
  const fo = FACE;
  const back = VIEW === 'back';
  const gear = LOOK.gear;
  const masked = !back && (gear === 'catcher' || gear === 'ump');
  const helmet = LOOK.helmet && !gear;
  // 耳朵（正面先画，被头挡住一半）
  if (!back && fo === 0) {
    ell(hx - 7.0, hy + 1.6, 1.7, 2.5, M_SKIN);
    ell(hx + 7.0, hy + 1.6, 1.7, 2.5, M_SKIN);
  }
  // 背面看不到下巴：后脑勺短一些，下面直接接脖子
  if (back) ell(hx, hy - 0.5, 7.1, 7.3, M_SKIN);
  else ell(hx, hy, 7.1, 8.0, M_SKIN);
  if (back) {
    // 后脑勺：短发一直盖到后颈，发际线两边往上收到耳后
    eachPx(hx - 7.4, hy - 8.2, hx + 7.4, hy + 8, (x, y) => {
      const u = (x + 0.5 - OX) / S - hx;
      const v = (y + 0.5 - OY) / S - hy;
      const k = (u / 7.1) * (u / 7.1);
      if (v < 6.0 - k * 4.6) paintPx(x, y, M_HAIR, M_SKIN);
    });
    // 耳朵贴在头发两侧
    ell(hx - 7.0, hy + 1.6, 1.6, 2.4, M_SKIN);
    ell(hx + 7.0, hy + 1.6, 1.6, 2.4, M_SKIN);
  } else if (!masked) {
    // 侧过脸：另一边的耳朵露在脸侧
    if (fo !== 0) ell(hx - fo * 5.2, hy + 1.4, 1.5, 2.3, M_SKIN);
    // 鬓角
    if (MED && !helmet) {
      for (const sx of fo === 0 ? [-1, 1] : [-fo]) eachPx(hx + sx * 5.6, hy - 1.8, hx + sx * 7.3, hy + 0.9, (x, y) => paintPx(x, y, M_HAIR, M_SKIN));
    }
    face(hx, hy, fo);
  }
  if (masked) {
    mask(hx, hy, gear === 'ump');
    return;
  }
  if (helmet) helmetShell(hx, hy, fo, back);
  else capCrown(hx, hy, fo, back);
  if (back && gear) {
    // 面罩的带子
    if (MED) eachPx(hx - 7.5, hy + 0.6, hx + 7.5, hy + 1.6, (x, y) => paintPx(x, y, M_MASK));
  }
}

/** 眼睛、鼻子、嘴（帽檐的影子之后画） */
function face(hx: number, hy: number, fo: number): void {
  if (!MED && !SML) return;
  const ex = hx + fo * 1.9;
  const ew = Math.max(1, Math.round(S * 0.95));
  const eh = Math.max(1, Math.round(S * 1.5));
  if (SML && S * 7.2 >= 3) {
    blockPx(ex - 2.7, hy + 1.9, ew, eh, M_INK, M_SKIN);
    blockPx(ex + 2.7, hy + 1.9, ew, eh, M_INK, M_SKIN);
  }
  if (DET) {
    // 眉毛：帽檐阴影里的两道短横
    const bw = Math.max(2, Math.round(S * 2.4));
    for (const sx of [-1, 1]) blockPx(ex + sx * 2.7 + sx * 0.3, hy + 0.35, bw, 1, M_HAIR, M_SKIN);
    // 鼻子：暗面一笔
    const nx = Math.round(X(ex + 0.7 + fo * 0.8));
    const ny = Math.round(Y(hy + 3.4));
    for (let k = 0; k < Math.max(1, Math.round(S * 1.2)); k++) darkPx(nx, ny + k, 2, M_SKIN);
    // 嘴
    const my = Math.round(Y(hy + 5.7));
    for (let x = Math.round(X(ex - 1.3)); x <= Math.round(X(ex + 1.3)); x++) darkPx(x, my, 3, M_SKIN);
  }
}

/** 棒球帽：帽顶 + 帽檐，帽檐在脸上投下一道影子 */
function capCrown(hx: number, hy: number, fo: number, back: boolean): void {
  if (back) {
    if (fo !== 0) ell(hx + fo * 7.6, hy - 1.7, 3.4, 1.3, M_BRIM);
    ell(hx, hy - 1.0, 7.7, 8.2, M_CAP, 0, 0, hy + 0.2);
    if (DET) {
      // 帽子后面的调节口
      eachPx(hx - 2.0, hy - 1.6, hx + 2.0, hy + 0.3, (x, y) => {
        const u = (x + 0.5 - OX) / S - hx;
        const v = (y + 0.5 - OY) / S - hy;
        if ((u / 2) * (u / 2) + ((v + 0.1) / 1.6) * ((v + 0.1) / 1.6) < 1 && v > -1.6) paintPx(x, y, M_HAIR, M_CAP);
      });
    }
    if (MED) blockPx(hx, hy - 8.7, Math.max(1, Math.round(S * 1.4)), Math.max(1, Math.round(S * 0.9)), M_BRIM, M_CAP);
    return;
  }
  ell(hx + fo * 0.5, hy - 1.2, 7.7, 8.0, M_CAP, 0, 0, hy - 2.1);
  // 帽徽
  if (MED) blockPx(hx + fo * 1.9, hy - 5.6, Math.max(1, Math.round(S * 2.4)), Math.max(1, Math.round(S * 2.6)), M_WHITE, M_CAP);
  // 帽檐（下沿更暗）
  ell(hx + fo * 2.2, hy - 2.0, 8.0 + Math.abs(fo) * 1.0, 1.6, M_BRIM);
  brimShadow(hx, hy);
}

/** 帽檐 / 头盔沿在脸上的影子 */
function brimShadow(hx: number, hy: number): void {
  eachPx(hx - 8, hy - 0.6, hx + 8, hy + 0.9, (x, y) => darkPx(x, y, 2, M_SKIN));
}

/** 打击头盔：亮面塑料，盖住耳朵，面向投手的一侧有护耳 */
function helmetShell(hx: number, hy: number, fo: number, back: boolean): void {
  const fs = fo !== 0 ? -fo : 1;
  if (back) {
    // 背面：头盔包到后脑勺下沿，护耳那一侧往下多出一块
    if (fo !== 0) ell(hx + fo * 8.0, hy - 1.5, 3.6, 1.4, M_BRIM, 1);
    ell(hx, hy - 0.6, 8.6, 8.9, M_HELM, 1, 0, hy + 5.0);
    flap(hx, hy, fs);
    return;
  }
  ell(hx + fo * 0.4, hy - 1.1, 8.5, 8.6, M_HELM, 1, 0, hy - 1.4);
  // 头盔两侧往下包住耳朵
  if (fo === 0) ell(hx - fs * 6.5, hy - 0.6, 2.5, 3.4, M_HELM, 1);
  flap(hx, hy, fs);
  // 帽徽
  if (MED) blockPx(hx + fo * 1.6, hy - 5.4, Math.max(1, Math.round(S * 2.4)), Math.max(1, Math.round(S * 2.4)), M_WHITE, M_HELM);
  ell(hx + fo * 2.4, hy - 2.0, 7.6 + Math.abs(fo) * 1.3, 1.5, M_BRIM, 1);
  brimShadow(hx, hy);
  // 另一侧的耳孔
  if (DET && fo === 0) blockPx(hx - fs * 7.4, hy + 0.6, Math.max(1, Math.round(S)), Math.max(1, Math.round(S)), M_INK, M_HELM);
}

function flap(hx: number, hy: number, fs: number): void {
  const pts = [
    [hx + fs * 3.4, hy - 1.4],
    [hx + fs * 8.8, hy - 1.8],
    [hx + fs * 8.9, hy + 3.6],
    [hx + fs * 7.6, hy + 6.6],
    [hx + fs * 5.4, hy + 7.4],
    [hx + fs * 3.8, hy + 5.0],
  ].flatMap(([u, v]) => [X(u), Y(v)]);
  polyPx(pts, (x, y, i) => {
    const u = ((x + 0.5 - OX) / S - hx) / 9;
    const v = ((y + 0.5 - OY) / S - hy) / 9;
    const l = LX * u + LY * v + LZ * Math.sqrt(Math.max(0, 1 - u * u - v * v));
    put(i, M_HELM, bandG(l));
  });
}

/** 捕手 / 主审的面罩（正面） */
function mask(hx: number, hy: number, ump: boolean): void {
  // 头盔（捕手）或帽子（主审）
  if (ump) ell(hx, hy - 1.2, 7.7, 8.0, M_CAP, 0, 0, hy - 2.2);
  else ell(hx, hy - 1.3, 8.2, 8.2, M_HELM, 1, 0, hy - 2.0);
  if (ump) ell(hx, hy - 2.4, 8.0, 1.5, M_BRIM);
  // 面罩框
  ell(hx, hy + 1.8, 6.4, 7.2, M_MASK, 1);
  if (S * 6.4 >= 3) {
    // 框里是脸（在阴影里），再横过几根栏杆（至少 1 像素粗）
    ell(hx, hy + 1.6, 4.4, 5.2, M_SKIN, -4);
    const bw = Math.max(1, Math.round(S * 0.9));
    const xa = Math.round(X(hx - 5));
    const xb = Math.round(X(hx + 5));
    for (const v of S * 6.4 >= 5 ? [-0.6, 2.0, 4.6] : [0.4, 3.6]) {
      const y0 = Math.round(Y(hy + v) - bw / 2);
      for (let y = y0; y < y0 + bw; y++) for (let x = xa; x <= xb; x++) setPx(x, y, M_BAR, x < (xa + xb) / 2 ? 0 : 1, M_SKIN);
    }
    if (MED) {
      const x0 = Math.round(X(hx) - bw / 2);
      for (let y = Math.round(Y(hy - 1)); y <= Math.round(Y(hy + 7)); y++) for (let x = x0; x < x0 + bw; x++) setPx(x, y, M_BAR, 1, M_SKIN);
    }
  }
  // 护喉
  ell(hx, hy + 9.4, 2.4, 2.0, M_MASK, 1);
}

/** 两条腿（大腿、小腿两段）之间最近的距离 */
function legGap(p: Pose): number {
  const segD = (a: P, b: P, c: P, d: P): number => {
    // 两条线段的最近距离：相交为 0，否则取四个端点到另一条线段距离的最小值
    const cross = (o: P, u: P, v: P) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
    const d1 = cross(a, b, c);
    const d2 = cross(a, b, d);
    const d3 = cross(c, d, a);
    const d4 = cross(c, d, b);
    if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
    const pt = (q: P, s0: P, s1: P) => {
      const dx = s1[0] - s0[0];
      const dy = s1[1] - s0[1];
      const l2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((q[0] - s0[0]) * dx + (q[1] - s0[1]) * dy) / l2));
      return Math.hypot(q[0] - s0[0] - dx * t, q[1] - s0[1] - dy * t);
    };
    return Math.min(pt(a, c, d), pt(b, c, d), pt(c, a, b), pt(d, a, b));
  };
  const A = [p.hip[0], p.kn[0], p.ft[0]];
  const B = [p.hip[1], p.kn[1], p.ft[1]];
  let m = Infinity;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) m = Math.min(m, segD(A[i], A[i + 1], B[j], B[j + 1]));
  return m;
}

// ======================= 渲染与缓存 =======================
interface Sprite {
  cv: HTMLCanvasElement;
  w: number;
  h: number;
  ox: number;
  oy: number;
}

function render(pose: Pose, look: Look, view: View, h: number, lookKey: string, sp: Sprite): void {
  POSE = pose;
  LOOK = look;
  VIEW = view;
  FACE = pose.face ? Math.sign(pose.face) : 0;
  S = h / 100;
  DET = h >= 100;
  MED = h >= 56;
  SML = h >= 34;
  if (h >= 34) {
    TH0 = 0.78;
    TH1 = 0.3;
    TH2 = -0.08;
  } else {
    // 小人：只分本色和暗面两档
    TH0 = 9;
    TH1 = 0.3;
    TH2 = -9;
  }
  SPEC = h >= 56;
  // 包围盒（单位）
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  const add = (p: P, r: number) => {
    x0 = Math.min(x0, p[0] - r);
    x1 = Math.max(x1, p[0] + r);
    y0 = Math.min(y0, p[1] - r);
    y1 = Math.max(y1, p[1] + r);
  };
  add(pose.head, 12);
  for (const k of [0, 1]) {
    add(pose.sh[k], 7);
    add(pose.el[k], 6);
    add(pose.ha[k], 9);
    add(pose.hip[k], 8);
    add(pose.kn[k], 7);
    add(pose.ft[k], 8);
  }
  if (pose.bat) {
    add(pose.bat[0], 4);
    add(pose.bat[1], 4);
  }
  OX = 2 - Math.floor(x0 * S);
  OY = 2 - Math.floor(y0 * S);
  const w = Math.ceil(x1 * S) + OX + 3;
  const hh = Math.ceil(y1 * S) + OY + 3;
  // 坐标坏掉（NaN）或大得离谱时不画，免得把共用的缓冲弄坏
  if (!(w > 0 && hh > 0 && w <= 2048 && hh <= 2048)) {
    sp.w = sp.h = 0;
    return;
  }
  begin(w, hh);
  ARM_DRAWN[0] = ARM_DRAWN[1] = false;
  const order: Part[] = pose.order ?? ['legA', 'legB', 'armA', 'torso', 'head', 'armB', 'bat', 'glove'];
  GLOVE_PART = order.includes('glove');
  const ti = order.indexOf('torso');
  const farArm = (p: Part) => ti >= 0 && order.indexOf(p) < ti;
  // 两条腿叠在一起时，先画的那条在后面、压暗一档；分开站时都按正常光照
  const legsCross = legGap(pose) < 9;
  const farLegA = legsCross && order.indexOf('legA') < order.indexOf('legB');
  const farLegB = legsCross && !farLegA;
  for (const part of order) {
    switch (part) {
      case 'legA':
        leg(0, farLegA);
        break;
      case 'legB':
        leg(1, farLegB);
        break;
      case 'armA':
        arm(0, farArm('armA'));
        break;
      case 'armB':
        arm(1, farArm('armB'));
        break;
      case 'torso':
        torso();
        break;
      case 'head':
        head();
        break;
      case 'bat':
        bat();
        break;
      case 'glove':
        if (look.glove) {
          const gi = look.glove === 'a' ? 0 : 1;
          FAR = farArm(gi === 0 ? 'armA' : 'armB') ? FAR_BIT : 0;
          glove(gi);
        }
        break;
      default:
        break;
    }
  }
  resolve(lutFor(look, lookKey), h >= 40);
  if (sp.cv.width < w || sp.cv.height < hh) {
    sp.cv.width = Math.max(sp.cv.width, w);
    sp.cv.height = Math.max(sp.cv.height, hh);
  }
  sp.cv.getContext('2d')!.putImageData(IMG!, 0, 0, 0, 0, w, hh);
  sp.w = w;
  sp.h = hh;
  sp.ox = OX;
  sp.oy = OY;
}

// 画好的人物按「姿势 + 外观 + 尺寸 + 朝向」缓存（最近用过的留着，旧的画布拿来重用）
const CACHE_MAX = 48;
const cache = new Map<string, Sprite>();

function lookKeyOf(l: Look): string {
  return `${l.skin}|${l.hair}|${l.cap}|${l.helmet ? 1 : 0}|${l.shirt}|${l.sleeve}|${l.sock}|${l.numCol}|${l.num ?? '-'}|${l.glove ?? '-'}|${l.gear ?? '-'}`;
}

function poseKeyOf(p: Pose): string {
  const q = (v: P) => `${Math.round(v[0] * 8)},${Math.round(v[1] * 8)}`;
  const q2 = (v: [P, P]) => `${q(v[0])},${q(v[1])}`;
  return `${q(p.head)}|${q2(p.sh)}|${q2(p.el)}|${q2(p.ha)}|${q2(p.hip)}|${q2(p.kn)}|${q2(p.ft)}|${p.bat ? q2(p.bat) : ''}|${p.order ? p.order.join('') : ''}|${p.face ?? 0}`;
}

function sprite(pose: Pose, look: Look, view: View, h: number): Sprite {
  const lk = lookKeyOf(look);
  const key = `${view}${Math.round(h * 4)}|${lk}|${poseKeyOf(pose)}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  let sp: Sprite;
  if (cache.size >= CACHE_MAX) {
    const old = cache.keys().next().value as string;
    sp = cache.get(old)!;
    cache.delete(old);
  } else sp = { cv: makeCanvas(1, 1), w: 0, h: 0, ox: 0, oy: 0 };
  render(pose, look, view, h, lk, sp);
  cache.set(key, sp);
  return sp;
}

/** 脚下的影子：半透明的扁椭圆 */
function groundShadow(c: Ctx, x: number, y: number, h: number, pose: Pose): void {
  const s = h / 100;
  const fa = pose.ft[0][0];
  const fb = pose.ft[1][0];
  const rx = Math.max(2, (Math.abs(fb - fa) / 2 + 10) * s);
  const ry = Math.max(1, rx * 0.2);
  const a = c.globalAlpha;
  c.globalAlpha = a * 0.28;
  ellipse(c, Math.round(x + ((fa + fb) / 2) * s), Math.round(y), rx, ry, PAL.ink);
  c.globalAlpha = a;
}

/** 在 (x, y)（脚底中点）画一个身高 h 像素的人 */
export function drawFigure(c: Ctx, x: number, y: number, h: number, pose: Pose, look: Look, view: View): void {
  if (!(h > 1)) return;
  const sp = sprite(pose, look, view, h);
  if (!sp.w) return;
  if (look.shadow !== false) groundShadow(c, x, y, h, pose);
  c.drawImage(sp.cv, 0, 0, sp.w, sp.h, Math.round(x) - sp.ox, Math.round(y) - sp.oy, sp.w, sp.h);
}

/** 带深色轮廓的人物（现在所有人物都描轮廓，保留这个名字给旧代码用） */
export function drawFigureOutlined(c: Ctx, x: number, y: number, h: number, pose: Pose, look: Look, view: View): void {
  drawFigure(c, x, y, h, pose, look, view);
}

// ======================= 姿势 =======================
const P = (o: Partial<Pose> & Pick<Pose, 'head' | 'sh' | 'el' | 'ha' | 'hip' | 'kn' | 'ft'>): Pose => o as Pose;

// ---- 打者（从捕手身后看，右打者站在本垒左边、面向右边） ----
const BATTER_ORDER: Part[] = ['legA', 'legB', 'armB', 'torso', 'head', 'armA', 'bat'];
export const BAT_STANCE = P({ head: [-1, -86], sh: [[-13, -72], [11, -73]], el: [[-22, -66], [-4, -62]], ha: [[-14, -77], [-12, -75]], hip: [[-8, -46], [7, -46]], kn: [[-15, -23], [13, -24]], ft: [[-17, 0], [15, 0]], bat: [[-13, -79], [-20, -117]], order: BATTER_ORDER, face: 1 });
export const BAT_LOAD = P({ head: [-2, -86], sh: [[-14, -72], [10, -73]], el: [[-25, -66], [-7, -63]], ha: [[-19, -78], [-17, -76]], hip: [[-9, -46], [6, -46]], kn: [[-16, -23], [12, -27]], ft: [[-17, 0], [13, -4]], bat: [[-18, -80], [-30, -113]], order: BATTER_ORDER, face: 1 });
export const BAT_STRIDE = P({ head: [0, -85], sh: [[-12, -71], [12, -72]], el: [[-23, -64], [-6, -61]], ha: [[-17, -75], [-15, -73]], hip: [[-7, -45], [9, -45]], kn: [[-15, -22], [17, -23]], ft: [[-17, 0], [22, 0]], bat: [[-16, -77], [-26, -112]], order: BATTER_ORDER, face: 1 });
export const BAT_CONTACT = P({ head: [2, -84], sh: [[-7, -70], [15, -70]], el: [[5, -59], [19, -63]], ha: [[21, -58], [23, -58]], hip: [[-5, -45], [10, -45]], kn: [[-13, -21], [18, -23]], ft: [[-15, -2], [22, 0]], bat: [[20, -58], [57, -55]], order: ['legA', 'legB', 'armA', 'torso', 'head', 'armB', 'bat'], face: 1 });
export const BAT_FOLLOW = P({ head: [3, -84], sh: [[-5, -71], [16, -72]], el: [[6, -78], [17, -76]], ha: [[13, -85], [15, -85]], hip: [[-4, -45], [10, -45]], kn: [[-10, -22], [18, -23]], ft: [[-13, -4], [22, 0]], bat: [[13, -86], [-16, -99]], order: ['legA', 'legB', 'armA', 'armB', 'torso', 'head', 'bat'], face: 1 });
export const BAT_BUNT = P({ head: [3, -82], sh: [[-11, -69], [13, -69]], el: [[-6, -60], [12, -60]], ha: [[0, -63], [10, -64]], hip: [[-9, -43], [9, -43]], kn: [[-14, -20], [14, -20]], ft: [[-14, 0], [16, 0]], bat: [[-6, -63], [30, -66]], order: ['legA', 'legB', 'torso', 'head', 'armB', 'armA', 'bat'], face: 1 });

// ---- 投手（从本垒看，正面） ----
const PF_ORDER: Part[] = ['legA', 'legB', 'torso', 'head', 'armA', 'armB', 'glove'];
export const PF_SET = P({ head: [0, -87], sh: [[-13, -73], [13, -73]], el: [[-11, -58], [11, -58]], ha: [[-2, -62], [2, -62]], hip: [[-7, -46], [7, -46]], kn: [[-7, -23], [7, -23]], ft: [[-7, 0], [7, 0]], order: PF_ORDER });
export const PF_LIFT = P({ head: [-1, -89], sh: [[-9, -75], [9, -75]], el: [[-8, -61], [8, -61]], ha: [[0, -66], [2, -66]], hip: [[-5, -48], [6, -48]], kn: [[-5, -24], [10, -54]], ft: [[-5, 0], [5, -34]], order: PF_ORDER });
export const PF_STRIDE = P({ head: [2, -82], sh: [[-14, -70], [14, -71]], el: [[-21, -72], [14, -67]], ha: [[-28, -66], [17, -64]], hip: [[-7, -44], [7, -44]], kn: [[-12, -20], [13, -21]], ft: [[-16, 0], [14, 5]], order: PF_ORDER });
export const PF_RELEASE = P({ head: [4, -76], sh: [[-10, -66], [14, -66]], el: [[-8, -82], [9, -56]], ha: [[1, -90], [6, -54]], hip: [[-6, -42], [7, -42]], kn: [[-12, -18], [12, -20]], ft: [[-16, -2], [14, 5]], order: ['legA', 'legB', 'torso', 'head', 'armB', 'glove', 'armA'] });
export const PF_FOLLOW = P({ head: [6, -72], sh: [[-6, -62], [16, -63]], el: [[2, -50], [12, -54]], ha: [[13, -36], [8, -50]], hip: [[-4, -42], [8, -42]], kn: [[-10, -28], [12, -20]], ft: [[-16, -16], [14, 5]], order: ['legA', 'legB', 'torso', 'head', 'armB', 'armA'] });

// ---- 投手（从投手身后看，背面；右投手的右手在画面右边） ----
const PB_ORDER: Part[] = ['armA', 'armB', 'glove', 'legA', 'legB', 'torso', 'head'];
export const PB_SET = P({ head: [0, -87], sh: [[-14, -73], [14, -73]], el: [[-15, -58], [15, -58]], ha: [[-5, -62], [5, -62]], hip: [[-8, -46], [8, -46]], kn: [[-8, -23], [8, -23]], ft: [[-8, 0], [8, 0]], order: PB_ORDER });
export const PB_LIFT = P({ head: [1, -89], sh: [[-10, -75], [10, -75]], el: [[-11, -61], [11, -61]], ha: [[-3, -66], [3, -66]], hip: [[-6, -48], [7, -48]], kn: [[-11, -54], [6, -24]], ft: [[-6, -34], [6, 0]], order: PB_ORDER });
export const PB_STRIDE = P({ head: [-2, -86], sh: [[-14, -73], [13, -71]], el: [[-20, -77], [22, -60]], ha: [[-17, -86], [27, -48]], hip: [[-8, -45], [8, -45]], kn: [[-10, -26], [12, -21]], ft: [[-7, -12], [15, 0]], order: ['armA', 'glove', 'legA', 'legB', 'torso', 'head', 'armB'] });
export const PB_RELEASE = P({ head: [-1, -90], sh: [[-12, -78], [13, -79]], el: [[-15, -64], [12, -93]], ha: [[-9, -60], [3, -106]], hip: [[-7, -46], [8, -46]], kn: [[-9, -27], [12, -22]], ft: [[-7, -12], [15, -2]], order: ['legA', 'legB', 'armA', 'glove', 'torso', 'head', 'armB'] });
export const PB_FOLLOW = P({ head: [-4, -86], sh: [[-15, -75], [10, -76]], el: [[-17, -62], [-8, -61]], ha: [[-10, -60], [-21, -47]], hip: [[-8, -46], [8, -46]], kn: [[-9, -27], [15, -30]], ft: [[-7, -12], [18, -16]], order: ['armA', 'glove', 'armB', 'legA', 'legB', 'torso', 'head'] });

// ---- 打者（从投手那边看，正面；右打者站在本垒右边、面向左边） ----
const BF_ORDER: Part[] = ['legB', 'legA', 'armB', 'torso', 'head', 'armA', 'bat'];
export const BF_STANCE = P({ head: [1, -86], sh: [[-11, -72], [11, -72]], el: [[2, -64], [19, -66]], ha: [[11, -76], [13, -77]], hip: [[-6, -46], [6, -46]], kn: [[-12, -22], [10, -23]], ft: [[-13, 1], [12, -1]], bat: [[12, -78], [18, -114]], order: BF_ORDER, face: -1 });
export const BF_SWING = P({ head: [-1, -84], sh: [[-13, -70], [9, -70]], el: [[-6, -62], [-2, -60]], ha: [[-14, -58], [-12, -58]], hip: [[-7, -45], [6, -45]], kn: [[-15, -21], [10, -22]], ft: [[-17, 1], [12, -1]], bat: [[-12, -58], [-50, -56]], order: ['legB', 'legA', 'torso', 'head', 'armB', 'armA', 'bat'], face: -1 });
export const BF_FOLLOW = P({ head: [-2, -84], sh: [[-14, -71], [8, -71]], el: [[-12, -78], [-4, -74]], ha: [[-12, -84], [-10, -84]], hip: [[-7, -45], [6, -45]], kn: [[-15, -21], [10, -22]], ft: [[-17, 1], [12, -3]], bat: [[-11, -85], [14, -100]], order: ['legB', 'legA', 'bat', 'torso', 'head', 'armB', 'armA'], face: -1 });
export const BF_BUNT = P({ head: [0, -82], sh: [[-12, -69], [12, -69]], el: [[-12, -60], [8, -60]], ha: [[-8, -64], [2, -64]], hip: [[-8, -43], [8, -43]], kn: [[-13, -20], [13, -20]], ft: [[-14, 0], [14, 0]], bat: [[4, -64], [-30, -66]], order: ['legB', 'legA', 'torso', 'head', 'armB', 'armA', 'bat'], face: -1 });

// ---- 捕手、主审（从投手那边看） ----
export const CATCHER = P({ head: [0, -58], sh: [[-11, -47], [11, -47]], el: [[-15, -36], [14, -40]], ha: [[-9, -30], [8, -48]], hip: [[-7, -22], [7, -22]], kn: [[-14, -14], [14, -14]], ft: [[-9, 0], [9, 0]], order: ['legA', 'legB', 'torso', 'head', 'armA', 'armB', 'glove'] });
export const UMP = P({ head: [0, -74], sh: [[-12, -63], [12, -63]], el: [[-14, -48], [14, -48]], ha: [[-8, -42], [8, -42]], hip: [[-8, -38], [8, -38]], kn: [[-12, -19], [12, -19]], ft: [[-9, 0], [9, 0]], order: ['legA', 'legB', 'torso', 'head', 'armA', 'armB'] });
// ---- 野手（远处的小人） ----
// 守备的准备姿势：膝盖微屈，双手在身前
export const FIELDER = P({ head: [0, -82], sh: [[-12, -68], [12, -68]], el: [[-15, -52], [15, -52]], ha: [[-9, -43], [9, -43]], hip: [[-8, -42], [8, -42]], kn: [[-12, -21], [12, -21]], ft: [[-13, 0], [13, 0]], order: ['legA', 'legB', 'torso', 'head', 'armA', 'armB', 'glove'] });
// 跑者：侧面冲刺，身体前倾，前臂摆起、后腿蹬地
export const RUNNER = P({ head: [7, -82], sh: [[-1, -69], [4, -70]], el: [[-9, -60], [11, -60]], ha: [[-12, -51], [15, -69]], hip: [[-2, -44], [2, -44]], kn: [[-6, -26], [11, -27]], ft: [[-17, -13], [7, 0]], order: ['armA', 'legA', 'legB', 'torso', 'head', 'armB'], face: 1 });
