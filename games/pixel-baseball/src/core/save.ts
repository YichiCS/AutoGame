// 存档：localStorage 'pixel-baseball:save'（整局一个 JSON）。旧的经营版存档在 IndexedDB 'pixel-koshien'，不再读取
import type { GameState } from './types';
import { G, setG } from './state';
import { getRngState, setRngState } from './rng';
import { clearWorldCache } from './world';
import { SAVE_VERSION } from './newgame';

export const SAVE_KEY = 'pixel-baseball:save';

export function snapshot(): string {
  G.rng = getRngState();
  G.savedAt = Date.now();
  return JSON.stringify(G);
}

export function saveGame(): boolean {
  if (!G) return false;
  try {
    localStorage.setItem(SAVE_KEY, snapshot());
    return true;
  } catch (e) {
    console.error('存档失败', e);
    return false;
  }
}

function valid(s: unknown): s is GameState {
  const g = s as GameState;
  return !!g && typeof g === 'object' && g.game === 'pixel-baseball' && typeof g.v === 'number' && !!g.players && !!g.schools && Array.isArray(g.roster);
}

/** 旧存档缺少的字段在这里补上 */
function migrate(g: GameState): GameState {
  g.flags ??= {};
  g.cooldowns ??= {};
  g.schedule ??= [];
  g.timeline ??= [];
  g.achievements ??= {};
  g.senbatsuPick ??= [];
  g.policies.autoCats ??= {};
  for (const p of Object.values(g.players)) {
    p.pw ??= [0, 0, 0, 0, 0, 0, 0];
    p.notes ??= [];
    p.retired ??= false;
    p.benched ??= 0;
  }
  return g;
}

export function loadState(s: unknown): GameState {
  if (!valid(s)) throw new Error('这不是像素甲子园（挂机版）的存档');
  if (s.v > SAVE_VERSION) throw new Error('存档来自更新版本的游戏，请刷新页面');
  const g = migrate(s);
  setG(g);
  if (Array.isArray(g.rng) && g.rng.length >= 4) setRngState(g.rng);
  clearWorldCache();
  return g;
}

export function peekSave(): GameState | null {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return null;
    const g = JSON.parse(s);
    return valid(g) ? g : null;
  } catch {
    return null;
  }
}

export function loadGame(): GameState | null {
  const g = peekSave();
  if (!g) return null;
  try {
    return loadState(g);
  } catch (e) {
    console.error('读档失败', e);
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function exportFile(): void {
  const json = snapshot();
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  a.download = `像素甲子园_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 800);
}

export async function importFile(file: File): Promise<GameState> {
  const g = loadState(JSON.parse(await file.text()));
  g.savedAt = Date.now(); // 导入不算离线时间
  saveGame();
  return g;
}

/** 浏览器里有没有旧版（经营版 v0.x）的存档 */
export async function hasLegacySave(): Promise<boolean> {
  try {
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('pixel-koshien:data:')) return true;
  } catch {
    /* ignore */
  }
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
      const list = await indexedDB.databases();
      return list.some((d) => d.name === 'pixel-koshien');
    }
  } catch {
    /* ignore */
  }
  return false;
}
