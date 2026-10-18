// 骨架人物：关键帧之间插值，画出投球、挥棒的分解动作。
// 坐标：站立身高 = 100 单位，原点在两脚中间的地面，y 向上为负；a / b 是画面左 / 右侧的肢体
import { PAL, disc, ellipse, limb, line, makeCanvas, outline, poly, rect, shade, type Ctx } from './pix';

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
}

const GLOVE = '#7a4a2a';
const BAT_METAL = '#c8d4dc';
const BAT_GRIP = PAL.ink;

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
  };
}

/** 左右镜像（左投手、左打者） */
export function mirror(p: Pose): Pose {
  const m = (q: P): P => [-q[0], q[1]];
  const m2 = (q: [P, P]): [P, P] => [m(q[1]), m(q[0])];
  const swap = (o?: Part[]) => o?.map((x) => (x === 'legA' ? 'legB' : x === 'legB' ? 'legA' : x === 'armA' ? 'armB' : x === 'armB' ? 'armA' : x)) as Part[] | undefined;
  return { head: m(p.head), sh: m2(p.sh), el: m2(p.el), ha: m2(p.ha), hip: m2(p.hip), kn: m2(p.kn), ft: m2(p.ft), bat: p.bat ? [m(p.bat[0]), m(p.bat[1])] : undefined, order: swap(p.order) };
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

// ---------------- 绘制 ----------------
const DIGITS: Record<string, string[]> = {
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

function number(c: Ctx, n: number, cx: number, cy: number, s: number, col: string): void {
  const str = String(n);
  const cw = 3 * s + s;
  let x = cx - (str.length * cw - s) / 2;
  for (const ch of str) {
    const g = DIGITS[ch];
    if (g) for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r][k] === '1') rect(c, x + k * s, cy - 2.5 * s + r * s, s, s, col);
    x += cw;
  }
}

/** 在 (x, y)（脚底中点）画一个身高 h 像素的人 */
export function drawFigure(c: Ctx, x: number, y: number, h: number, pose: Pose, look: Look, view: View): void {
  const s = h / 100;
  const X = (p: P): number => x + p[0] * s;
  const Y = (p: P): number => y + p[1] * s;
  const W = (u: number): number => Math.max(1, u * s);
  const pants = look.shirt;
  const pantsD = shade(pants, -0.18);
  const order: Part[] = pose.order ?? ['legA', 'legB', 'armA', 'torso', 'head', 'armB', 'bat', 'glove'];
  const leg = (i: 0 | 1) => {
    const hp = pose.hip[i];
    const kn = pose.kn[i];
    const ft = pose.ft[i];
    // 大腿、小腿上半是球裤；小腿下半是球队颜色的长袜
    limb(c, X(hp), Y(hp), X(kn), Y(kn), W(10), W(8.5), i === 0 ? pantsD : pants);
    const mid: P = [kn[0] + (ft[0] - kn[0]) * 0.4, kn[1] + (ft[1] - kn[1]) * 0.4];
    limb(c, X(kn), Y(kn), X(mid), Y(mid), W(8.5), W(7), i === 0 ? pantsD : pants);
    limb(c, X(mid), Y(mid), X(ft), Y(ft), W(6.5), W(5.5), look.sock);
    // 鞋
    const dir = ft[0] >= (pose.ft[0][0] + pose.ft[1][0]) / 2 ? 1 : -1;
    ellipse(c, X(ft) + dir * W(2), Y(ft) - W(1.5), W(5.5), W(2.6), PAL.ink);
  };
  const arm = (i: 0 | 1) => {
    const sh = pose.sh[i];
    const el = pose.el[i];
    const ha = pose.ha[i];
    limb(c, X(sh), Y(sh), X(el), Y(el), W(7.5), W(6), look.gear === 'ump' ? PAL.navy : shade(look.sleeve, i === 0 ? -0.15 : 0));
    limb(c, X(el), Y(el), X(ha), Y(ha), W(6), W(5), look.gear === 'ump' ? PAL.navy : shade(look.sleeve, i === 0 ? -0.15 : 0));
    if (look.glove === (i === 0 ? 'a' : 'b')) disc(c, X(ha), Y(ha), W(look.gear === 'catcher' ? 7 : 5.5), GLOVE);
    else disc(c, X(ha), Y(ha), W(3), look.skin);
  };
  const torso = () => {
    const [sa, sb] = pose.sh;
    const [ha, hb] = pose.hip;
    const col = look.gear === 'ump' ? PAL.navy : look.shirt;
    poly(c, [[X(sa) - W(3), Y(sa) - W(1)], [X(sb) + W(3), Y(sb) - W(1)], [X(hb) + W(2), Y(hb) + W(2)], [X(ha) - W(2), Y(ha) + W(2)]], col);
    // 阴影：画面左半边暗一点
    poly(c, [[X(sa) - W(3), Y(sa) - W(1)], [(X(sa) + X(sb)) / 2, (Y(sa) + Y(sb)) / 2 - W(1)], [(X(ha) + X(hb)) / 2, (Y(ha) + Y(hb)) / 2 + W(2)], [X(ha) - W(2), Y(ha) + W(2)]], shade(col, -0.1));
    if (look.gear === 'catcher') {
      poly(c, [[X(sa), Y(sa) + W(2)], [X(sb), Y(sb) + W(2)], [X(hb), Y(hb) - W(4)], [X(ha), Y(ha) - W(4)]], PAL.dark);
    }
    // 腰带
    line(c, X(ha) - W(2), Y(ha), X(hb) + W(2), Y(hb), W(2.5), PAL.ink);
    // 背号 / 胸前的字
    const cx = (X(sa) + X(sb) + X(ha) + X(hb)) / 4;
    const cy = (Y(sa) + Y(sb)) / 2 * 0.55 + (Y(ha) + Y(hb)) / 2 * 0.45;
    if (view === 'back' && look.num !== null && !look.gear && h >= 40) number(c, look.num, cx, cy, Math.max(1, Math.round(h / 45)), look.numCol);
    if (view === 'front' && !look.gear && h >= 24) rect(c, cx - W(8), cy - W(9), W(16), W(3), look.numCol);
  };
  const head = () => {
    const [hx, hy] = pose.head;
    const r = 8.5;
    disc(c, X([hx, hy]), Y([hx, hy]), W(r), look.skin);
    if (view === 'front' && !look.gear) {
      // 眼睛
      if (h >= 30) {
        rect(c, X([hx - 3.5, hy]), Y([hx, hy + 0.5]), W(1.6), W(2), PAL.ink);
        rect(c, X([hx + 2, hy]), Y([hx, hy + 0.5]), W(1.6), W(2), PAL.ink);
      }
    } else if (view === 'back') {
      // 后脑勺的头发
      disc(c, X([hx, hy + 1]), Y([hx, hy + 1]), W(r - 1), look.hair);
    }
    if (look.gear === 'catcher' || look.gear === 'ump') {
      // 护面
      disc(c, X([hx, hy]), Y([hx, hy]), W(r + 0.5), look.gear === 'ump' ? PAL.ink : PAL.dark);
      if (view === 'front') for (let k = -1; k <= 1; k++) rect(c, X([hx - 6, hy + k * 3]), Y([hx, hy + k * 3]), W(12), W(1), PAL.slate);
      return;
    }
    if (look.helmet) {
      // 打击头盔：盖住耳朵，一侧有护耳
      poly(c, [[X([hx - r - 1.5, hy + 1]), Y([hx, hy + 1])], [X([hx - r, hy - r]), Y([hx, hy - r - 1.5])], [X([hx + r, hy - r]), Y([hx, hy - r - 1.5])], [X([hx + r + 1.5, hy + 1]), Y([hx, hy + 1])]], look.cap);
      disc(c, X([hx, hy - 2]), Y([hx, hy - 2]), W(r + 1.5), look.cap);
      rect(c, X([hx - 2, hy]), Y([hx, hy - r - 1]), W(4), W(2), shade(look.cap, 0.25));
      if (view === 'front') rect(c, X([hx - r - 1, hy]), Y([hx, hy - 3.5]), W(2 * r + 2), W(2.5), shade(look.cap, -0.3));
    } else {
      // 棒球帽
      disc(c, X([hx, hy - 3]), Y([hx, hy - 3]), W(r - 0.5), look.cap);
      rect(c, X([hx - r, hy]), Y([hx, hy - 3]), W(2 * r), W(3), look.cap);
      if (view === 'front') rect(c, X([hx - r - 1, hy]), Y([hx, hy - 1]), W(2 * r + 2), W(2.2), shade(look.cap, -0.35));
      else rect(c, X([hx - 2, hy]), Y([hx, hy - 1]), W(4), W(1.5), shade(look.cap, 0.2));
    }
  };
  const bat = () => {
    if (!pose.bat) return;
    const [g, t] = pose.bat;
    const gx = X(g);
    const gy = Y(g);
    const tx = X(t);
    const ty = Y(t);
    const k = 0.28;
    const mx = gx + (tx - gx) * k;
    const my = gy + (ty - gy) * k;
    limb(c, gx, gy, mx, my, W(2.6), W(2.8), BAT_GRIP);
    limb(c, mx, my, tx, ty, W(2.8), W(4.4), BAT_METAL);
    // 高光
    line(c, mx + (tx - mx) * 0.3, my + (ty - my) * 0.3 - W(0.8), mx + (tx - mx) * 0.85, my + (ty - my) * 0.85 - W(1.2), Math.max(1, W(0.8)), PAL.white);
  };
  for (const part of order) {
    switch (part) {
      case 'legA':
        leg(0);
        break;
      case 'legB':
        leg(1);
        break;
      case 'armA':
        arm(0);
        break;
      case 'armB':
        arm(1);
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
      default:
        break;
    }
  }
}

/** 先画到离屏画布、描轮廓，再贴到目标上（大尺寸人物用） */
const scratch = new Map<number, HTMLCanvasElement>();
export function drawFigureOutlined(c: Ctx, x: number, y: number, h: number, pose: Pose, look: Look, view: View): void {
  const size = Math.ceil(h * 1.9);
  let cv = scratch.get(size);
  if (!cv) {
    cv = makeCanvas(size, size);
    scratch.set(size, cv);
  }
  const cc = cv.getContext('2d')!;
  cc.clearRect(0, 0, size, size);
  const ox = size / 2;
  const oy = size * 0.86;
  drawFigure(cc, ox, oy, h, pose, look, view);
  outline(cv);
  c.drawImage(cv, Math.round(x - ox), Math.round(y - oy));
}

// ======================= 姿势 =======================
const P = (o: Partial<Pose> & Pick<Pose, 'head' | 'sh' | 'el' | 'ha' | 'hip' | 'kn' | 'ft'>): Pose => o as Pose;

// ---- 打者（从捕手身后看，右打者站在本垒左边、面向右边） ----
const BATTER_ORDER: Part[] = ['legA', 'legB', 'armB', 'torso', 'head', 'armA', 'bat'];
export const BAT_STANCE = P({ head: [-1, -86], sh: [[-13, -72], [11, -73]], el: [[-22, -66], [-4, -62]], ha: [[-14, -77], [-12, -75]], hip: [[-8, -46], [7, -46]], kn: [[-15, -23], [13, -24]], ft: [[-17, 0], [15, 0]], bat: [[-13, -79], [-20, -117]], order: BATTER_ORDER });
export const BAT_LOAD = P({ head: [-2, -86], sh: [[-14, -72], [10, -73]], el: [[-25, -66], [-7, -63]], ha: [[-19, -78], [-17, -76]], hip: [[-9, -46], [6, -46]], kn: [[-16, -23], [12, -27]], ft: [[-17, 0], [13, -4]], bat: [[-18, -80], [-30, -113]], order: BATTER_ORDER });
export const BAT_STRIDE = P({ head: [0, -85], sh: [[-12, -71], [12, -72]], el: [[-23, -64], [-6, -61]], ha: [[-17, -75], [-15, -73]], hip: [[-7, -45], [9, -45]], kn: [[-15, -22], [17, -23]], ft: [[-17, 0], [22, 0]], bat: [[-16, -77], [-26, -112]], order: BATTER_ORDER });
export const BAT_CONTACT = P({ head: [2, -84], sh: [[-7, -70], [15, -70]], el: [[3, -60], [10, -63]], ha: [[19, -58], [21, -58]], hip: [[-5, -45], [10, -45]], kn: [[-13, -21], [18, -23]], ft: [[-15, -2], [22, 0]], bat: [[18, -58], [55, -55]], order: ['legA', 'legB', 'torso', 'head', 'armB', 'armA', 'bat'] });
export const BAT_FOLLOW = P({ head: [3, -84], sh: [[-5, -71], [16, -72]], el: [[6, -78], [14, -74]], ha: [[13, -84], [15, -84]], hip: [[-4, -45], [10, -45]], kn: [[-10, -22], [18, -23]], ft: [[-13, -4], [22, 0]], bat: [[13, -85], [-14, -100]], order: ['legA', 'legB', 'bat', 'torso', 'head', 'armB', 'armA'] });
export const BAT_BUNT = P({ head: [3, -82], sh: [[-11, -69], [13, -69]], el: [[-6, -60], [12, -60]], ha: [[0, -63], [10, -64]], hip: [[-9, -43], [9, -43]], kn: [[-14, -20], [14, -20]], ft: [[-14, 0], [16, 0]], bat: [[-6, -63], [30, -66]], order: ['legA', 'legB', 'torso', 'head', 'armB', 'armA', 'bat'] });

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
export const PB_STRIDE = P({ head: [-2, -86], sh: [[-14, -73], [13, -71]], el: [[-17, -78], [22, -60]], ha: [[-13, -86], [27, -48]], hip: [[-8, -45], [8, -45]], kn: [[-10, -26], [12, -21]], ft: [[-7, -12], [15, 0]], order: ['armB', 'legA', 'legB', 'torso', 'head', 'armA', 'glove'] });
export const PB_RELEASE = P({ head: [-1, -90], sh: [[-12, -78], [13, -79]], el: [[-15, -64], [12, -93]], ha: [[-9, -60], [3, -106]], hip: [[-7, -46], [8, -46]], kn: [[-9, -27], [12, -22]], ft: [[-7, -12], [15, -2]], order: ['legA', 'legB', 'armA', 'glove', 'torso', 'head', 'armB'] });
export const PB_FOLLOW = P({ head: [-4, -86], sh: [[-15, -75], [10, -76]], el: [[-17, -62], [-6, -62]], ha: [[-11, -58], [-19, -48]], hip: [[-8, -46], [8, -46]], kn: [[-9, -27], [15, -30]], ft: [[-7, -12], [18, -16]], order: ['legA', 'legB', 'torso', 'head', 'armA', 'armB', 'glove'] });

// ---- 打者（从投手那边看，正面；右打者站在本垒右边、面向左边） ----
const BF_ORDER: Part[] = ['legB', 'legA', 'armB', 'torso', 'head', 'armA', 'bat'];
export const BF_STANCE = P({ head: [1, -86], sh: [[-11, -72], [11, -72]], el: [[2, -64], [19, -66]], ha: [[11, -76], [13, -77]], hip: [[-6, -46], [6, -46]], kn: [[-12, -22], [10, -23]], ft: [[-13, 1], [12, -1]], bat: [[12, -78], [18, -114]], order: BF_ORDER });
export const BF_SWING = P({ head: [-1, -84], sh: [[-13, -70], [9, -70]], el: [[-6, -62], [-2, -60]], ha: [[-14, -58], [-12, -58]], hip: [[-7, -45], [6, -45]], kn: [[-15, -21], [10, -22]], ft: [[-17, 1], [12, -1]], bat: [[-12, -58], [-50, -56]], order: ['legB', 'legA', 'torso', 'head', 'armB', 'armA', 'bat'] });
export const BF_FOLLOW = P({ head: [-2, -84], sh: [[-14, -71], [8, -71]], el: [[-12, -78], [-4, -74]], ha: [[-12, -84], [-10, -84]], hip: [[-7, -45], [6, -45]], kn: [[-15, -21], [10, -22]], ft: [[-17, 1], [12, -3]], bat: [[-11, -85], [14, -100]], order: ['legB', 'legA', 'bat', 'torso', 'head', 'armB', 'armA'] });
export const BF_BUNT = P({ head: [0, -82], sh: [[-12, -69], [12, -69]], el: [[-12, -60], [8, -60]], ha: [[-8, -64], [2, -64]], hip: [[-8, -43], [8, -43]], kn: [[-13, -20], [13, -20]], ft: [[-14, 0], [14, 0]], bat: [[4, -64], [-30, -66]], order: ['legB', 'legA', 'torso', 'head', 'armB', 'armA', 'bat'] });

// ---- 捕手、主审（从投手那边看） ----
export const CATCHER = P({ head: [0, -58], sh: [[-11, -47], [11, -47]], el: [[-15, -36], [14, -40]], ha: [[-9, -30], [8, -48]], hip: [[-7, -22], [7, -22]], kn: [[-14, -14], [14, -14]], ft: [[-9, 0], [9, 0]], order: ['legA', 'legB', 'torso', 'head', 'armA', 'armB', 'glove'] });
export const UMP = P({ head: [0, -74], sh: [[-12, -63], [12, -63]], el: [[-14, -48], [14, -48]], ha: [[-8, -42], [8, -42]], hip: [[-8, -38], [8, -38]], kn: [[-12, -19], [12, -19]], ft: [[-9, 0], [9, 0]], order: ['legA', 'legB', 'armA', 'armB', 'torso', 'head'] });
// ---- 野手（远处的小人） ----
export const FIELDER = P({ head: [0, -84], sh: [[-12, -70], [12, -70]], el: [[-15, -52], [15, -52]], ha: [[-12, -40], [12, -40]], hip: [[-8, -44], [8, -44]], kn: [[-11, -22], [11, -22]], ft: [[-12, 0], [12, 0]], order: ['legA', 'legB', 'torso', 'armA', 'armB', 'head', 'glove'] });
export const RUNNER = P({ head: [3, -84], sh: [[-9, -70], [13, -70]], el: [[-16, -58], [18, -62]], ha: [[-12, -48], [22, -72]], hip: [[-6, -44], [8, -44]], kn: [[-14, -26], [14, -30]], ft: [[-18, -6], [10, 0]], order: ['legA', 'legB', 'armA', 'torso', 'head', 'armB'] });
