// 可存档的伪随机数发生器 (sfc32)。整个游戏共用一个状态，读档时恢复。
let s0 = 0x9e3779b9;
let s1 = 0x243f6a88;
let s2 = 0xb7e15162;
let s3 = 1;
// Box-Muller 一次产生两个正态值，另一个缓存起来
let spare: number | null = null;

export function rand(): number {
  s0 >>>= 0;
  s1 >>>= 0;
  s2 >>>= 0;
  s3 >>>= 0;
  let t = (s0 + s1) | 0;
  s0 = s1 ^ (s1 >>> 9);
  s1 = (s2 + (s2 << 3)) | 0;
  s2 = (s2 << 21) | (s2 >>> 11);
  s3 = (s3 + 1) | 0;
  t = (t + s3) | 0;
  s2 = (s2 + t) | 0;
  return (t >>> 0) / 4294967296;
}

export function seedRng(seed: number): void {
  s0 = 0x9e3779b9 ^ seed;
  s1 = (0x243f6a88 + Math.imul(seed, 31)) | 0;
  s2 = 0xb7e15162 ^ (seed << 7);
  s3 = 1;
  spare = null;
  for (let i = 0; i < 20; i++) rand();
}

/** 第 5 个元素是 gauss 缓存的另一半（没有则省略） */
export function getRngState(): number[] {
  const st = [s0 >>> 0, s1 >>> 0, s2 >>> 0, s3 >>> 0];
  return spare === null ? st : [...st, spare];
}

export function setRngState(s: number[]): void {
  [s0, s1, s2, s3] = s;
  spare = s.length > 4 ? s[4] : null;
}

/** 闭区间 [min, max] 的整数 */
export function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

export function randRange(min: number, max: number): number {
  return min + rand() * (max - min);
}

export function chance(p: number): boolean {
  return rand() < p;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function weightedPick<T>(items: readonly T[], weight: (t: T) => number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return items[Math.floor(rand() * items.length)];
  let r = rand() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

export function gauss(mean = 0, sd = 1): number {
  if (spare !== null) {
    const v = spare;
    spare = null;
    return mean + v * sd;
  }
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  const mag = Math.sqrt(-2 * Math.log(u));
  spare = mag * Math.sin(2 * Math.PI * v);
  return mean + mag * Math.cos(2 * Math.PI * v) * sd;
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 不消耗全局随机状态的确定性哈希（用于头像等） */
export function hash32(...xs: number[]): number {
  let h = 2166136261;
  for (const x of xs) {
    h ^= x | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** 一个独立的小型 PRNG（mulberry32），用于不影响存档随机序列的场合 */
export function localRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
