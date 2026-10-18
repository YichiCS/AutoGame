// 当前游戏状态（全局单例）与常用查询
import type { GameState, LogKind, Player, SchoolLite } from './types';
import { dateStr } from './calendar';

export let G: GameState = null as unknown as GameState;
let fallbackId = 1;
/** 临时 id（按需生成的对手球员用负数，不占存档里的 id） */
let tempIdMode = false;
let tempId = -1;

export function setG(s: GameState): void {
  G = s;
}

export function hasG(): boolean {
  return G !== null && G !== undefined;
}

export function nextId(): number {
  if (tempIdMode) return tempId--;
  if (hasG()) return G.nextId++;
  return fallbackId++;
}

/** 在这段逻辑里生成的对象使用临时（负数）id */
export function withTempIds<T>(fn: () => T): T {
  const prev = tempIdMode;
  tempIdMode = true;
  try {
    return fn();
  } finally {
    tempIdMode = prev;
    if (!prev && tempId < -1e9) tempId = -1;
  }
}

export function P(id: number): Player {
  return G.players[id];
}

export function mySchool(): SchoolLite {
  return G.schools[G.schoolId];
}

/** 在籍的高中球员（不含内定的新生） */
export function myPlayers(): Player[] {
  return G.roster.map((id) => G.players[id]).filter((p): p is Player => !!p && p.grade >= 1 && p.grade <= 3 && !p.retired);
}

/** 已引退、等待毕业的三年级 */
export function seniors(): Player[] {
  return G.roster.map((id) => G.players[id]).filter((p): p is Player => !!p && p.retired);
}

/** 写一条球队动态 */
export function log(text: string, kind: LogKind = 'info'): void {
  G.logs.unshift({ d: G.day, t: text, k: kind });
  if (G.logs.length > 200) G.logs.length = 200;
  for (const fn of listeners) fn(text, kind);
}

/** 写进大事记（只记重要的事） */
export function milestone(text: string): void {
  G.timeline.push({ d: G.day, t: text });
  if (G.timeline.length > 400) G.timeline.splice(0, G.timeline.length - 400);
}

/** 写进球员个人档案 */
export function note(p: Player, text: string): void {
  p.notes.push({ d: G.day, t: text });
  if (p.notes.length > 30) p.notes.splice(0, p.notes.length - 30);
}

type LogListener = (text: string, kind: LogKind) => void;
const listeners: LogListener[] = [];
/** 界面订阅动态（提示条、音效） */
export function onLog(fn: LogListener): void {
  listeners.push(fn);
}

export function today(): string {
  return dateStr(G.day, G.startYear);
}

/** 名声变化：正向收益随名声升高递减 */
export function addRep(v: number): void {
  const m = G.mgr;
  const gain = v > 0 ? v * Math.max(0.15, 1.15 - m.rep / 90) : v;
  m.rep = Math.max(0, Math.min(100, m.rep + gain));
}

/** 本校名门度：越高越难再往上涨 */
export function addPrestige(v: number): void {
  const s = mySchool();
  const gain = v > 0 ? v * Math.max(0.12, Math.min(1.2, (105 - s.prestige) / 70)) : v;
  s.prestige = Math.max(1, Math.min(99, s.prestige + gain));
}

export function clampStat(v: number): number {
  return Math.max(0, Math.min(100, v));
}
