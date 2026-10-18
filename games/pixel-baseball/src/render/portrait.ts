// 程序生成的像素头像（24x24）
import { localRng } from '../core/rng';
import type { TeamColors } from '../core/types';

const SKIN = [
  ['#f7d7b5', '#e2b48e'],
  ['#f2c6a0', '#d9a37c'],
  ['#e8b48a', '#c98f66'],
  ['#d9a06e', '#b67d52'],
  ['#c98b5a', '#a36b43'],
];
const HAIR = ['#1a1c2c', '#1a1c2c', '#2b2118', '#3d2b1f', '#5a3a22', '#26203a'];

/** 和头像一致的肤色、发色（比赛画面的人物用） */
export function faceColors(face: number): { skin: string; hair: string } {
  const R = localRng(face);
  const ri = (n: number) => Math.floor(R() * n);
  const [skin] = SKIN[ri(SKIN.length)];
  return { skin, hair: HAIR[ri(HAIR.length)] };
}

const cache = new Map<string, string>();

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * f)));
  g = Math.max(0, Math.min(255, Math.round(g * f)));
  b = Math.max(0, Math.min(255, Math.round(b * f)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export interface FaceOpts {
  face: number;
  colors: TeamColors;
  mood: number; // 干劲 0..100
  injured?: boolean;
  pitcher?: boolean;
  size?: number;
}

export function drawFace(ctx: CanvasRenderingContext2D, o: FaceOpts, ox = 0, oy = 0): void {
  const R = localRng(o.face);
  const ri = (n: number) => Math.floor(R() * n);
  const P = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, oy + y, 1, 1);
  };
  const B = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, oy + y, w, h);
  };
  const [skin, skinD] = SKIN[ri(SKIN.length)];
  const hair = HAIR[ri(HAIR.length)];
  const cap = o.colors.cap || o.colors.primary;
  const cap2 = o.colors.secondary;
  const wide = ri(3); // 脸宽
  const eyeStyle = ri(5);
  const browStyle = ri(4);
  const hairStyle = ri(4); // 0 光头 1 短 2 侧边长 3 鬓角
  const freckle = R() < 0.15;
  // 背景
  B(0, 0, 24, 24, shade(o.colors.primary, 0.45));
  B(0, 18, 24, 6, shade(o.colors.primary, 0.35));
  for (let i = 0; i < 6; i++) P(ri(24), ri(16), shade(o.colors.primary, 0.6));
  // 肩膀/球衣
  const uni = R() < 0.5 ? '#f4f4f4' : '#d7dce6';
  B(3, 20, 18, 4, uni);
  B(2, 21, 1, 3, uni);
  B(21, 21, 1, 3, uni);
  B(9, 19, 6, 2, skin);
  B(8, 20, 1, 2, cap);
  B(15, 20, 1, 2, cap);
  B(9, 21, 6, 1, cap);
  B(3, 23, 18, 1, shade(uni, 0.8));
  if (o.pitcher) B(4, 22, 3, 1, cap2);
  // 脖子
  B(10, 17, 4, 3, skinD);
  // 头
  const L = 6 - (wide === 2 ? 1 : 0);
  const W = 12 + (wide === 2 ? 2 : wide === 0 ? -1 : 0);
  B(L, 8, W, 9, skin);
  B(L + 1, 17, W - 2, 1, skin);
  B(L + 2, 18, W - 4, 0, skin);
  // 下巴阴影
  B(L + 1, 16, 1, 1, skinD);
  B(L + W - 2, 16, 1, 1, skinD);
  B(L + 2, 17, W - 4, 1, skinD);
  // 耳朵
  B(L - 1, 11, 1, 3, skin);
  B(L + W, 11, 1, 3, skin);
  P(L - 1, 12, skinD);
  P(L + W, 12, skinD);
  // 头发（帽子下）
  if (hairStyle === 2) {
    B(L - 1, 8, 2, 4, hair);
    B(L + W - 1, 8, 2, 4, hair);
  } else if (hairStyle === 3) {
    B(L, 9, 1, 3, hair);
    B(L + W - 1, 9, 1, 3, hair);
  } else if (hairStyle === 1) {
    B(L, 9, 1, 1, hair);
    B(L + W - 1, 9, 1, 1, hair);
  } else {
    P(L, 9, shade(skin, 0.85));
    P(L + W - 1, 9, shade(skin, 0.85));
  }
  // 帽子
  B(L, 3, W, 6, cap);
  B(L + 1, 2, W - 2, 1, cap);
  B(L + 1, 3, W - 2, 1, shade(cap, 1.25));
  B(L - 1, 8, W + 2, 2, shade(cap, 0.7));
  B(L - 1, 9, W + 2, 1, shade(cap, 0.55));
  // 帽徽
  const cx = L + Math.floor(W / 2) - 1;
  B(cx, 4, 3, 3, cap2);
  P(cx + 1, 5, cap);
  // 眉毛
  const browY = 10;
  const ex1 = L + 2;
  const ex2 = L + W - 4;
  const bc = shade(hair, 1.1);
  if (browStyle === 0) {
    B(ex1, browY, 2, 1, bc);
    B(ex2, browY, 2, 1, bc);
  } else if (browStyle === 1) {
    B(ex1 - 1, browY, 3, 1, bc);
    B(ex2, browY, 3, 1, bc);
  } else if (browStyle === 2) {
    // 怒眉
    P(ex1, browY, bc);
    P(ex1 + 1, browY + 1, bc);
    P(ex2 + 1, browY, bc);
    P(ex2, browY + 1, bc);
  } else {
    P(ex1 + 1, browY, bc);
    P(ex2, browY, bc);
  }
  // 眼睛
  const ey = 12;
  const eyeC = '#1a1c2c';
  switch (eyeStyle) {
    case 0:
      B(ex1 + 1, ey, 1, 2, eyeC);
      B(ex2, ey, 1, 2, eyeC);
      break;
    case 1:
      B(ex1, ey, 2, 2, eyeC);
      B(ex2, ey, 2, 2, eyeC);
      P(ex1, ey, '#f4f4f4');
      P(ex2, ey, '#f4f4f4');
      break;
    case 2:
      B(ex1, ey + 1, 2, 1, eyeC);
      B(ex2, ey + 1, 2, 1, eyeC);
      break;
    case 3:
      B(ex1, ey, 2, 1, eyeC);
      B(ex2, ey, 2, 1, eyeC);
      P(ex1 + 1, ey + 1, eyeC);
      P(ex2, ey + 1, eyeC);
      break;
    default:
      B(ex1 + 1, ey, 1, 1, eyeC);
      B(ex2, ey, 1, 1, eyeC);
  }
  // 鼻子
  const nx = L + Math.floor(W / 2) - 1;
  P(nx + 1, 14, skinD);
  P(nx, 14, shade(skin, 0.93));
  // 嘴巴（按干劲）
  const my = 16;
  const mc = '#8a3b3b';
  if (o.mood >= 70) {
    P(nx - 1, my - 1, mc);
    B(nx, my, 3, 1, mc);
    P(nx + 3, my - 1, mc);
  } else if (o.mood >= 40) {
    B(nx, my, 3, 1, mc);
  } else {
    P(nx - 1, my, mc);
    B(nx, my - 1, 3, 1, mc);
    P(nx + 3, my, mc);
  }
  if (freckle || o.mood >= 85) {
    P(ex1 - 1, 14, '#e8939a');
    P(ex2 + 2, 14, '#e8939a');
  }
  if (o.injured) {
    B(ex2, 14, 3, 2, '#f4f4f4');
    P(ex2 + 1, 14, '#e43b44');
    P(ex2 + 1, 15, '#e43b44');
  }
}

export function portraitURL(o: FaceOpts): string {
  const moodKey = o.mood >= 70 ? 2 : o.mood >= 40 ? 1 : 0;
  const key = `${o.face}|${o.colors.primary}|${o.colors.secondary}|${moodKey}|${o.injured ? 1 : 0}|${o.pitcher ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 24;
  const ctx = c.getContext('2d')!;
  drawFace(ctx, { ...o, mood: moodKey === 2 ? 80 : moodKey === 1 ? 50 : 20 });
  const url = c.toDataURL();
  cache.set(key, url);
  if (cache.size > 800) cache.delete(cache.keys().next().value as string);
  return url;
}
