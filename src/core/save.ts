// 存档：IndexedDB（不可用时退回 localStorage）
import type { GameState } from './types';
import { G, setG } from './state';
import { getRngState, setRngState } from './rng';
import { dateLabel } from './calendar';
import { resetNameRegistry, clearStrengthCache } from './world';
import { SAVE_VERSION } from './newgame';

export interface SaveMeta {
  slot: string;
  name: string;
  school: string;
  date: string;
  savedAt: number;
  rep: number;
}

const DB = 'pixel-koshien';
const STORE = 'saves';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  const v = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
  db.close();
  return v;
}

async function idbDel(key: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

const hasIDB = (): boolean => {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
};

async function put(key: string, value: unknown): Promise<void> {
  if (hasIDB()) {
    try {
      await idbPut(key, value);
      return;
    } catch {
      /* 退回 localStorage */
    }
  }
  localStorage.setItem(`${DB}:${key}`, JSON.stringify(value));
}

async function get<T>(key: string): Promise<T | undefined> {
  if (hasIDB()) {
    try {
      const v = await idbGet<T>(key);
      if (v !== undefined) return v;
    } catch {
      /* 退回 localStorage */
    }
  }
  try {
    const s = localStorage.getItem(`${DB}:${key}`);
    return s ? (JSON.parse(s) as T) : undefined;
  } catch {
    return undefined;
  }
}

async function del(key: string): Promise<void> {
  if (hasIDB()) {
    try {
      await idbDel(key);
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(`${DB}:${key}`);
  } catch {
    /* ignore */
  }
}

export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;

export function snapshot(): string {
  G.rng = getRngState();
  return JSON.stringify(G);
}

export async function saveGame(slot: string): Promise<void> {
  const json = snapshot();
  const s = G.schools[G.club.schoolId];
  const meta: SaveMeta = { slot, name: G.manager.name, school: s?.name ?? '', date: dateLabel(G.year, G.week), savedAt: Date.now(), rep: Math.round(G.manager.reputation) };
  await put(`data:${slot}`, json);
  await put(`meta:${slot}`, meta);
}

export async function listSaves(): Promise<(SaveMeta | null)[]> {
  const out: (SaveMeta | null)[] = [];
  for (const s of SLOTS) out.push((await get<SaveMeta>(`meta:${s}`)) ?? null);
  return out;
}

export function loadState(st: GameState): void {
  if (!st || typeof st !== 'object' || !st.schools || !st.club) throw new Error('存档格式不正确');
  if ((st.version ?? 0) > SAVE_VERSION) throw new Error('存档来自更新版本的游戏');
  migrate(st);
  setG(st);
  setRngState(st.rng);
  resetNameRegistry();
  clearStrengthCache();
}

function migrate(st: GameState): void {
  st.notices ??= [];
  st.choice ??= null;
  st.regionRank ??= {};
  st.draftLog ??= [];
  st.reports ??= [];
}

export async function loadGame(slot: string): Promise<boolean> {
  const json = await get<string>(`data:${slot}`);
  if (!json) return false;
  loadState(JSON.parse(json) as GameState);
  return true;
}

export async function deleteSave(slot: string): Promise<void> {
  await del(`data:${slot}`);
  await del(`meta:${slot}`);
}

export function exportFile(): void {
  const json = snapshot();
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const s = G.schools[G.club.schoolId];
  a.download = `像素甲子园_${s?.short ?? 'save'}_${G.year}_${G.week}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export function importFile(file: File): Promise<void> {
  return file.text().then((t) => loadState(JSON.parse(t) as GameState));
}
