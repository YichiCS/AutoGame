// 像素绘图：只用整数坐标的矩形拼出圆、线、多边形，放大后边缘清晰
export type Ctx = CanvasRenderingContext2D;

/** Sweetie 16 调色板 */
export const PAL = {
  ink: '#1a1c2c',
  plum: '#5d275d',
  red: '#b13e53',
  orange: '#ef7d57',
  yellow: '#ffcd75',
  lime: '#a7f070',
  green: '#38b764',
  teal: '#257179',
  navy: '#29366f',
  blue: '#3b5dc9',
  sky: '#41a6f6',
  cyan: '#73eff7',
  white: '#f4f4f4',
  silver: '#94b0c2',
  slate: '#566c86',
  dark: '#333c57',
} as const;

export function rect(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function dot(c: Ctx, x: number, y: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), 1, 1);
}

/** 实心圆（半径可以是小数） */
export function disc(c: Ctx, cx: number, cy: number, r: number, col: string): void {
  c.fillStyle = col;
  const R = Math.max(0.5, r);
  const y0 = Math.round(cy - R);
  const y1 = Math.round(cy + R);
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    const h = R * R - dy * dy;
    if (h < 0) continue;
    const dx = Math.sqrt(h);
    const xa = Math.round(cx - dx);
    const xb = Math.round(cx + dx);
    if (xb > xa) c.fillRect(xa, y, xb - xa, 1);
    else c.fillRect(xa, y, 1, 1);
  }
}

/** 实心椭圆 */
export function ellipse(c: Ctx, cx: number, cy: number, rx: number, ry: number, col: string): void {
  c.fillStyle = col;
  const y0 = Math.round(cy - ry);
  const y1 = Math.round(cy + ry);
  for (let y = y0; y <= y1; y++) {
    const t = (y + 0.5 - cy) / Math.max(0.5, ry);
    const h = 1 - t * t;
    if (h < 0) continue;
    const dx = rx * Math.sqrt(h);
    const xa = Math.round(cx - dx);
    const xb = Math.round(cx + dx);
    c.fillRect(xa, y, Math.max(1, xb - xa), 1);
  }
}

/** 粗线：沿线段盖方块 */
export function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, col: string): void {
  c.fillStyle = col;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const s = Math.max(1, Math.round(w));
  const off = s / 2;
  for (let i = 0; i <= n; i++) {
    const x = x0 + (dx * i) / n;
    const y = y0 + (dy * i) / n;
    c.fillRect(Math.round(x - off), Math.round(y - off), s, s);
  }
}

/** 粗细渐变的线（四肢用：从 w0 到 w1） */
export function limb(c: Ctx, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, col: string): void {
  c.fillStyle = col;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = w0 + (w1 - w0) * t;
    const r = w / 2;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    if (w <= 2.2) c.fillRect(Math.round(x - r), Math.round(y - r), Math.max(1, Math.round(w)), Math.max(1, Math.round(w)));
    else disc(c, x, y, r, col);
  }
}

/** 多边形（扫描线填充，奇偶规则） */
export function poly(c: Ctx, pts: [number, number][], col: string): void {
  if (pts.length < 3) return;
  c.fillStyle = col;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const [, y] of pts) {
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
  }
  for (let y = Math.floor(ymin); y <= Math.ceil(ymax); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.round(xs[i]);
      const xb = Math.round(xs[i + 1]);
      if (xb > xa) c.fillRect(xa, y, xb - xa, 1);
    }
  }
}

/** 颜色变暗 / 变亮（#rrggbb） */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (k < 0) {
    r = Math.round(r * (1 + k));
    g = Math.round(g * (1 + k));
    b = Math.round(b * (1 + k));
  } else {
    r = Math.round(r + (255 - r) * k);
    g = Math.round(g + (255 - g) * k);
    b = Math.round(b + (255 - b) * k);
  }
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** 给一块离屏画布上的图形描一圈深色轮廓（像素风精灵常用） */
export function outline(cv: HTMLCanvasElement, col = PAL.ink): void {
  const c = cv.getContext('2d')!;
  const { width: w, height: h } = cv;
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  c.fillStyle = col;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid[y * w + x]) continue;
      if ((x > 0 && solid[y * w + x - 1]) || (x < w - 1 && solid[y * w + x + 1]) || (y > 0 && solid[(y - 1) * w + x]) || (y < h - 1 && solid[(y + 1) * w + x])) c.fillRect(x, y, 1, 1);
    }
  }
}

/** 确定性的伪随机（画背景、人群用，不影响游戏的随机数） */
export function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const ease = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
