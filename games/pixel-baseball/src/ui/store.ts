// 界面状态与刷新机制
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export type Tab =
  | 'home' | 'roster' | 'player' | 'training' | 'lineup' | 'schedule' | 'recruit' | 'staff' | 'finance' | 'manager' | 'news' | 'records' | 'system';

export interface ModalEntry {
  id: number;
  render: (close: (v?: unknown) => void) => ComponentChildren;
  resolve: (v: unknown) => void;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
}

export const ui = {
  screen: 'title' as 'title' | 'newgame' | 'game' | 'match',
  tab: 'home' as Tab,
  playerId: null as number | null,
  schoolView: null as number | null,
  modals: [] as ModalEntry[],
  toasts: [] as Toast[],
  busy: false,
  backTab: 'roster' as Tab,
};

let version = 0;
const subs = new Set<() => void>();
let seq = 1;

export function refresh(): void {
  version++;
  for (const f of subs) f();
}

export function useRefresh(): number {
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

export function go(tab: Tab): void {
  ui.tab = tab;
  ui.screen = 'game';
  refresh();
  scrollMainTop();
}

export function openPlayer(id: number, back?: Tab): void {
  ui.backTab = back ?? (ui.tab === 'player' ? ui.backTab : ui.tab);
  ui.playerId = id;
  ui.tab = 'player';
  refresh();
  scrollMainTop();
}

/** 切换页面后回到顶部（各页面共用同一个滚动容器） */
function scrollMainTop(): void {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(() => document.querySelector('.app .main')?.scrollTo(0, 0));
}

/** 手机竖屏上「列表 + 详情」是上下排列的：选中后把详情滚动到可见处 */
export function revealOnNarrow(id: string): void {
  if (typeof window === 'undefined' || window.innerWidth > 760) return;
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/** 打开一个模态框，返回关闭时的值 */
export function openModal<T = unknown>(render: (close: (v?: T) => void) => ComponentChildren): Promise<T | undefined> {
  return new Promise((resolve) => {
    const id = seq++;
    const entry: ModalEntry = {
      id,
      render: render as ModalEntry['render'],
      resolve: (v) => resolve(v as T),
    };
    ui.modals.push(entry);
    refresh();
  });
}

export function closeModal(id: number, v?: unknown): void {
  const i = ui.modals.findIndex((m) => m.id === id);
  if (i < 0) return;
  const [m] = ui.modals.splice(i, 1);
  refresh();
  m.resolve(v);
}

export function toast(text: string, tone: Toast['tone'] = 'info'): void {
  const id = seq++;
  ui.toasts.push({ id, text, tone });
  if (ui.toasts.length > 4) ui.toasts.shift();
  refresh();
  setTimeout(() => {
    ui.toasts = ui.toasts.filter((t) => t.id !== id);
    refresh();
  }, 2800);
}

export function setBusy(b: boolean): void {
  ui.busy = b;
  refresh();
}
