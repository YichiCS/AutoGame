// 日历：一年 360 天（每月 30 天），学年从 4 月 1 日开始。day = 0 是开局学年的 4 月 1 日。
export const YEAR = 360;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 学年内的第几天（0 = 4/1） */
export const doy = (day: number) => mod(day, YEAR);
/** 第几个学年（0 = 开局那年） */
export const yearIdx = (day: number) => Math.floor(day / YEAR);
/** 月份 1..12 */
export const monthOf = (day: number) => ((3 + Math.floor(doy(day) / 30)) % 12) + 1;
/** 日 1..30 */
export const domOf = (day: number) => mod(day, 30) + 1;
/** 学年的绝对 4/1 */
export const yearStart = (day: number) => yearIdx(day) * YEAR;

/** 月/日 → 学年内的第几天 */
export function doyOf(m: number, d: number): number {
  const idx = (m + 12 - 4) % 12; // 4 月 = 0
  return idx * 30 + (d - 1);
}

/** 学年 y（0 起）内 m/d 的绝对日 */
export function dayOf(y: number, m: number, d: number): number {
  return y * YEAR + doyOf(m, d);
}

/** 公历年（1~3 月属于下一个公历年） */
export function calYear(day: number, startYear: number): number {
  return startYear + yearIdx(day) + (monthOf(day) <= 3 ? 1 : 0);
}

/** 学年的名字（开始那年的公历年） */
export function schoolYear(day: number, startYear: number): number {
  return startYear + yearIdx(day);
}

export function dateStr(day: number, startYear: number): string {
  return `${calYear(day, startYear)}年${monthOf(day)}月${domOf(day)}日`;
}

export function mdStr(day: number): string {
  return `${monthOf(day)}/${domOf(day)}`;
}

export function seasonOf(day: number): '春' | '夏' | '秋' | '冬' {
  const m = monthOf(day);
  if (m >= 3 && m <= 5) return '春';
  if (m >= 6 && m <= 8) return '夏';
  if (m >= 9 && m <= 11) return '秋';
  return '冬';
}

/** 一周的第几天（0 = 周一，6 = 周日休养日） */
export const weekday = (day: number) => mod(day, 7);

/** 12/1 ~ 3/7 是对外比赛禁止期（冬训） */
export function isOffseason(day: number): boolean {
  const t = doy(day);
  return t >= doyOf(12, 1) && t < doyOf(3, 8);
}

export function daysText(n: number): string {
  if (n <= 0) return '今天';
  if (n === 1) return '明天';
  if (n < 30) return `${n} 天后`;
  return `${Math.round(n / 30)} 个月后`;
}

/** 年度日程（学年内的日子） */
export const SCHED = {
  newYear: doyOf(4, 1),
  springPref: doyOf(4, 15),
  springRegion: doyOf(5, 18),
  summerDraw: doyOf(6, 25),
  exam1: doyOf(7, 2),
  summerPref: doyOf(7, 8),
  koshien: doyOf(8, 6),
  newTeam: doyOf(8, 28),
  fallPref: doyOf(9, 10),
  fallRegion: doyOf(10, 14),
  draft: doyOf(10, 24),
  jingu: doyOf(11, 14),
  exam2: doyOf(12, 10),
  winterCamp: doyOf(12, 26),
  newYearDay: doyOf(1, 1),
  senbatsuAnnounce: doyOf(1, 24),
  graduation: doyOf(3, 1),
  senbatsu: doyOf(3, 18),
  yearEnd: doyOf(3, 30),
} as const;
