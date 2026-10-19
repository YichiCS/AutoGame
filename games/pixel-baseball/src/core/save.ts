// 存档：localStorage 'pixel-baseball:save'（整局一个 JSON）。旧的经营版存档在 IndexedDB 'pixel-koshien'，不再读取
import type { AttrKey, GameState } from './types';
import { FIELD_POS } from './types';
import { G, setG } from './state';
import { getRngState, hash32, setRngState } from './rng';
import { posRating, refreshPos } from './attrs';
import { PITCH_DEFS, PITCH_LIST, pitchAffinity } from '../data/pitches';
import type { PitchType } from './types';
import { MAX_VEL } from './growth';
import { clamp } from './util';
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

/**
 * v3 → v4（游戏 v2.2.0）：谁都能守任何位置，最适合的位置由能力决定（去掉守备适性 apt）。
 * 旧的野手投球能力只有 15 左右、上限 45，按他的打击和守备水平补到正常（只升不降），位置按能力重新判断。
 */
function migrateV4(g: GameState): void {
  for (const p of Object.values(g.players)) {
    delete (p as { apt?: unknown }).apt;
    if (p.pos !== 'P') {
      const bat = (p.a.contact + p.a.power + p.a.eye + p.a.speed + p.a.arm + p.a.fielding + p.a.catching) / 7;
      const pq = bat - 8 + (p.a.arm - bat) * 0.25;
      // 每个人固定的一点浮动（不消耗随机数，同一个存档迁移几次结果都一样）
      const j = (k: number) => (hash32(p.id, k) / 4294967296) * 2 - 1;
      const up = (k: AttrKey, v: number) => (p.a[k] = Math.max(p.a[k], clamp(v, 5, 95)));
      up('control', pq + j(1) * 6);
      up('stamina', pq - 3 + j(2) * 6);
      up('stuff', pq + j(3) * 5);
      p.a.velocity = Math.max(p.a.velocity, clamp(104 + pq * 0.32 + j(4) * 3, 98, 145));
      for (const k of ['control', 'stamina', 'stuff'] as AttrKey[]) p.caps[k] = Math.max(p.caps[k], Math.min(99, p.a[k] + 5 + p.pot * 0.36));
      p.caps.velocity = Math.max(p.caps.velocity, Math.min(MAX_VEL, p.a.velocity + 3 + p.pot * 0.17));
      // 旧的位置是按守备适性定的：野手直接换到评价最高的守备位置
      p.pos = FIELD_POS.reduce((x, y) => (posRating(p, y) > posRating(p, x) ? y : x));
    }
    refreshPos(p);
  }
  // 比赛打到一半的存档：阵容、能力、对手名单都变了，没法按记录重演，从开赛前重新开始
  if (g.pending?.live) delete g.pending.live;
}

/**
 * v4 → v5（游戏 v2.3.0）：投手的变化球补到至少两种（新补的是 1 级）。打者会从比赛里学投手的配球，球种太少容易被抓住。
 * 球种按投球姿势和亲缘挑；用每个人固定的哈希挑，不消耗随机数，同一个存档迁移几次结果都一样。
 */
function migrateV5(g: GameState): void {
  for (const p of Object.values(g.players)) {
    if (p.pos !== 'P') continue;
    for (let k = 0; p.pitches.length < 2 && k < 4; k++) {
      const owned = p.pitches.map((x) => x.type);
      if (p.learning) owned.push(p.learning.pitch);
      const cands = PITCH_LIST.map((t) => [t, pitchAffinity(owned, p.delivery, t)] as [PitchType, number]).filter(([t, w]) => w > 0 && PITCH_DEFS[t].rarity <= 2);
      const tot = cands.reduce((a, c) => a + c[1], 0);
      if (!tot) break;
      let x = (hash32(p.id, 501 + k) / 4294967296) * tot;
      const pick = cands.find((c) => (x -= c[1]) < 0) ?? cands[cands.length - 1];
      p.pitches.push({ type: pick[0], lv: 1 });
    }
  }
}

/** 旧存档缺少的字段在这里补上 */
function migrate(g: GameState): GameState {
  if (g.v < 4) migrateV4(g);
  if (g.v < 5) migrateV5(g);
  g.flags ??= {};
  g.cooldowns ??= {};
  g.schedule ??= [];
  g.timeline ??= [];
  g.achievements ??= {};
  g.senbatsuPick ??= [];
  g.lineup ??= null;
  g.nextStarter ??= null;
  if (g.lineup) g.lineup.practice ??= false;
  g.v = SAVE_VERSION;
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

/** 浏览器里有没有旧版（经营版 v1.x，原 v0.x）的存档 */
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
