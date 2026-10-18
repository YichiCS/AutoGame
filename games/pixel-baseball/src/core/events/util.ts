// 事件里常用的小工具
import type { Ctx, Player } from '../types';
import { G, myPlayers } from '../state';
import { weightedPick } from '../rng';
import { clamp, sortBy } from '../util';
import { fullName, overall } from '../attrs';

export const P = (c: Ctx, k = 'pid'): Player => G.players[c[k] as number];
export const N = (c: Ctx, k = 'pid'): string => {
  const p = P(c, k);
  return p ? fullName(p) : '那名部员';
};
export const F = (c: Ctx, k = 'pid'): string => P(c, k)?.fam ?? '他';
export const alive = (c: Ctx, k = 'pid'): boolean => !!P(c, k) && G.roster.includes(P(c, k).id);

export const active = (): Player[] => myPlayers();

export function pickPlayer(f: (p: Player) => boolean, w: (p: Player) => number = () => 1): Player | null {
  const list = active().filter(f);
  if (!list.length) return null;
  return weightedPick(list, (p) => Math.max(0.01, w(p)));
}

export function starters(n = 10): Player[] {
  return sortBy(active().filter((p) => !p.injury), overall).slice(0, n);
}

export const mor = (p: Player | null | undefined, d: number): void => {
  if (p) p.morale = clamp(p.morale + d, 0, 100);
};
export const allMor = (d: number): void => active().forEach((p) => mor(p, d));
export const trust = (p: Player | null | undefined, d: number): void => {
  if (p) p.trust = clamp(p.trust + d, 0, 100);
};
export const fat = (p: Player | null | undefined, d: number): void => {
  if (p) p.fatigue = clamp(p.fatigue + d, 0, 100);
};
export const chem = (d: number): void => {
  G.club.chemistry = clamp(G.club.chemistry + d, 0, 100);
};
export const board = (d: number): void => {
  G.club.board = clamp(G.club.board + d, 0, 100);
};
export const ob = (d: number): void => {
  G.club.ob = clamp(G.club.ob + d, 0, 100);
};
export const fans = (d: number): void => {
  G.club.fans = Math.max(0, Math.round(G.club.fans + d));
};

/** 把正文里的一段话连起来（避免很长的字符串字面量） */
export const lines = (...xs: (string | false | null | undefined)[]): string => xs.filter(Boolean).join('\n');
