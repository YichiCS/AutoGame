// 基于战力数值的快速比赛（AI 之间的比赛）
import type { Strength } from '../core/team';
import { chance, rand } from '../core/rng';

export interface QuickResult {
  sa: number;
  sb: number;
  inn: number;
  called: boolean;
}

/** 每局期望得分 */
export const QUICK_K = { base: 0.375, scale: 21.3, tiebreak: 2.4 };

function lambda(off: Strength, def: Strength): number {
  const d = off.off - (0.62 * def.pit + 0.38 * def.def);
  return QUICK_K.base * Math.exp(d / QUICK_K.scale);
}

function poisson(l: number): number {
  const L = Math.exp(-l);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L && k < 30);
  return k - 1;
}

function inningRuns(l: number): number {
  const events = poisson(l / 1.65);
  let runs = 0;
  for (let i = 0; i < events; i++) {
    runs += 1;
    while (chance(0.4) && runs < 15) runs++;
  }
  return runs;
}

export function quickGame(a: Strength, b: Strength, mercy: boolean): QuickResult {
  // a 先攻（客队）, b 后攻
  const la = lambda(a, b);
  const lb = lambda(b, a);
  let sa = 0;
  let sb = 0;
  for (let inn = 1; inn <= 25; inn++) {
    const tb = inn >= 10 ? QUICK_K.tiebreak : 1;
    sa += inningRuns(la * tb);
    if (inn >= 9 && sb > sa) return { sa, sb, inn, called: false };
    if (mercy && ((inn >= 5 && sb - sa >= 10) || (inn >= 7 && sb - sa >= 7))) return { sa, sb, inn, called: true };
    sb += inningRuns(lb * tb);
    if (inn >= 9 && sa !== sb) return { sa, sb, inn, called: false };
    if (mercy && ((inn >= 5 && Math.abs(sa - sb) >= 10) || (inn >= 7 && Math.abs(sa - sb) >= 7))) return { sa, sb, inn, called: true };
  }
  if (sa === sb) sb++;
  return { sa, sb, inn: 25, called: false };
}

/** 被动学校：由单一战力值与风格偏差得到三维战力 */
export function strengthFromRating(r: number, profile: { off: number; pit: number; def: number }): Strength {
  const off = r + profile.off;
  const pit = r + profile.pit;
  const def = r + profile.def;
  return { off, pit, def, total: 0.38 * off + 0.22 * def + 0.4 * pit };
}
