export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
export const avg = (xs: readonly number[]): number => (xs.length ? sum(xs) / xs.length : 0);
/** (x-50)/50，把 0..100 的能力值映射到 -1..1 */
export const z = (x: number): number => (x - 50) / 50;

export function sortBy<T>(arr: T[], key: (t: T) => number, desc = true): T[] {
  return arr.sort((a, b) => (desc ? key(b) - key(a) : key(a) - key(b)));
}

export function maxBy<T>(arr: readonly T[], key: (t: T) => number): T | undefined {
  let best: T | undefined;
  let bv = -Infinity;
  for (const t of arr) {
    const v = key(t);
    if (v > bv) {
      bv = v;
      best = t;
    }
  }
  return best;
}

export function groupBy<T, K extends string | number>(arr: readonly T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const t of arr) {
    const k = key(t);
    (out[k] ||= []).push(t);
  }
  return out;
}

/** 金额（单位：万日元） */
export function money(v: number): string {
  const n = Math.round(v);
  const s = Math.abs(n) >= 10000 ? `${(n / 10000).toFixed(2)}亿` : `${n.toLocaleString('en-US')}万`;
  return `${s}円`;
}

export function signed(v: number, digits = 0): string {
  const s = v.toFixed(digits);
  return v > 0 ? `+${s}` : s;
}

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/** 打率风格 .312 */
export function rate3(v: number): string {
  if (!isFinite(v)) return '-';
  const s = v.toFixed(3);
  return s.startsWith('0') ? s.slice(1) : s;
}

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export function uniq<T>(arr: readonly T[]): T[] {
  return [...new Set(arr)];
}

export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
