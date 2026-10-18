// 日程：一个学年 48 周（每月 4 周），从 4 月第 1 周开始
export const WEEKS = 48;

export const SCHED = {
  newYear: 0,
  springPref: [1, 2, 3, 4, 5],
  springRegion: [6, 7],
  summerDraw: 11,
  summerPref: [12, 13, 14, 15],
  koshien: [16, 17, 18],
  newTeam: 19,
  fallPref: [21, 22, 23, 24],
  fallRegion: [25, 26, 27],
  draft: 27,
  jingu: [29, 30],
  offStart: 32, // 12 月 1 日起禁止对外比赛
  offEnd: 44, // 3 月第 1 周结束
  senbatsuAnnounce: 39,
  recruitDecision: 42,
  graduation: 44,
  senbatsu: [45, 46, 47],
  exams: [14, 35], // 期末考试（7 月、12 月）
} as const;

export function monthOf(week: number): number {
  return ((3 + Math.floor(week / 4)) % 12) + 1;
}

export function weekOfMonth(week: number): number {
  return (week % 4) + 1;
}

export function calYear(year: number, week: number): number {
  return week >= 36 ? year + 1 : year;
}

export function dateLabel(year: number, week: number): string {
  return `${calYear(year, week)}年${monthOf(week)}月 第${weekOfMonth(week)}周`;
}

export function shortDate(week: number): string {
  return `${monthOf(week)}月${weekOfMonth(week)}周`;
}

export function seasonOf(week: number): '春' | '夏' | '秋' | '冬' {
  const m = monthOf(week);
  if (m >= 3 && m <= 5) return '春';
  if (m >= 6 && m <= 8) return '夏';
  if (m >= 9 && m <= 11) return '秋';
  return '冬';
}

/** 是否处于对外比赛禁止期 */
export function isOffseason(week: number): boolean {
  return week >= SCHED.offStart && week <= SCHED.offEnd;
}

/** 把 n 轮分配到若干周：前面的周承担更多轮次 */
export function spreadRounds(n: number, weeks: readonly number[]): number[] {
  const out: number[] = [];
  const w = weeks.length;
  const base = Math.floor(n / w);
  let extra = n % w;
  for (let i = 0; i < w; i++) {
    const k = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    for (let j = 0; j < k; j++) out.push(weeks[i]);
  }
  return out;
}

export function absToYW(abs: number, startYear: number): { year: number; week: number } {
  return { year: startYear + Math.floor(abs / WEEKS), week: abs % WEEKS };
}
