// 界面状态（不存档）与刷新机制
import { useEffect, useState } from 'preact/hooks';
import type { MatchSession } from './match/session';

export type Tab = 'overview' | 'players' | 'lineup' | 'games' | 'facilities' | 'policies' | 'records';

export type Modal =
  | { kind: 'box'; gameId: number }
  | { kind: 'settings' }
  | { kind: 'help' }
  | { kind: 'player'; pid: number }
  | { kind: 'confirm'; title: string; text: string; ok: string; onOk: () => void };

export interface Toast {
  id: number;
  text: string;
  kind: string;
}

export const ui = {
  screen: 'start' as 'start' | 'game',
  tab: 'overview' as Tab,
  sub: {} as Record<string, string>,
  playerId: null as number | null,
  modal: null as Modal | null,
  toasts: [] as Toast[],
  /** 事件弹窗暂时收起（可以先看看球员再决定） */
  queueMin: false,
  /** 正在亲自指挥的比赛 */
  match: null as MatchSession | null,
};

let version = 0;
const subs = new Set<() => void>();

export function refresh(): void {
  version++;
  for (const f of subs) f();
}

/** 订阅刷新：组件里调用一次即可 */
export function useStore(): number {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((v) => v + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return version;
}

let toastId = 1;
export function toast(text: string, kind = 'info', ms = 3600): void {
  const t = { id: toastId++, text, kind };
  ui.toasts = [...ui.toasts.slice(-3), t];
  refresh();
  setTimeout(() => {
    ui.toasts = ui.toasts.filter((x) => x.id !== t.id);
    refresh();
  }, ms);
}

export function openPlayer(pid: number): void {
  ui.tab = 'players';
  ui.playerId = pid;
  ui.queueMin = true;
  refresh();
}

export function setSub(tab: string, sub: string): void {
  ui.sub[tab] = sub;
  refresh();
}
