// 当前游戏状态（全局单例）
import type { GameState, Player, School, Staff } from './types';

export let G: GameState = null as unknown as GameState;
let fallbackId = 1;

export function setG(s: GameState): void {
  G = s;
}

export function hasG(): boolean {
  return G !== null && G !== undefined;
}

export function nextId(): number {
  if (hasG()) return G.nextId++;
  return fallbackId++;
}

export function P(id: number): Player {
  return G.players[id];
}

export function S(id: number): School {
  return G.schools[id];
}

export function ST(id: number): Staff {
  return G.staff[id];
}

export function mySchool(): School {
  return G.schools[G.club.schoolId];
}

export function myPlayers(): Player[] {
  const s = mySchool();
  return (s.roster ?? []).map((id) => G.players[id]).filter(Boolean);
}

/** 名声变化：正向收益随名声升高递减 */
export function addRep(v: number): void {
  const m = G.manager;
  const gain = v > 0 ? v * Math.max(0.15, 1.15 - m.reputation / 90) : v;
  m.reputation = Math.max(0, Math.min(100, m.reputation + gain));
}
