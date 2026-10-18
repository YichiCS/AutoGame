// 主循环：模拟用 setInterval（后台也能跑），观战时按事件逐个重演比赛
import type { PendingMatch } from '../core/types';
import type { PlayEvent, Snap } from '../sim/types';
import { G, hasG, onLog } from '../core/state';
import { tick, blocked, finishPending, catchUp } from '../core/sim';
import { simulatePending, type SimResult } from '../core/matchday';
import { saveGame } from '../core/save';
import { settings, saveSettings } from './settings';
import { refresh, toast, ui } from './store';
import { sfx } from './sound';

export const SPEEDS = [1, 2, 4, 10];
/** 1 倍速下，游戏里的一天 = 1.5 秒 */
export const MS_PER_DAY = 1500;

export interface Live {
  res: SimResult;
  i: number;
  wait: number;
  lines: { t: string; big: boolean; side: 0 | 1 }[];
  snap: Snap | null;
  /** 每局得分（[客队, 主队]）与安打数 */
  line: [number[], number[]];
  hits: [number, number];
  /** 新事件的回调（画面用来播动画） */
  onEvent: ((e: PlayEvent) => void) | null;
}

export const loop = {
  paused: false,
  live: null as Live | null,
};

let acc = 0;
let last = performance.now();
let saveAcc = 0;
let dirty = false;
let lastRefresh = 0;
let timer = 0;

export const speed = (): number => SPEEDS[settings.speedIdx] ?? 1;

export function setSpeed(i: number): void {
  settings.speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, i));
  loop.paused = false;
  saveSettings();
  refresh();
}

export function togglePause(): void {
  loop.paused = !loop.paused;
  refresh();
}

export function markDirty(): void {
  dirty = true;
}

/** 这场比赛要不要观战 */
export function shouldWatch(pm: PendingMatch): boolean {
  if (settings.watch === 'off') return false;
  if (settings.watch === 'all') return true;
  if (!pm.tour) return false;
  const t = G.tours[pm.tour];
  if (!t) return false;
  if (pm.tour === 'koshien' || pm.tour === 'senbatsu' || pm.tour === 'jingu') return true;
  if (pm.tour === 'summerPref') return pm.round >= t.rounds.length - 3;
  return pm.round >= t.rounds.length - 2;
}

function announce(res: SimResult): void {
  const pm = res.pm;
  const mine = res.summary.score[res.mySide];
  const theirs = res.summary.score[1 - res.mySide];
  const win = res.summary.winner === res.mySide;
  if (pm.tour) {
    toast(`${pm.label}：${win ? '胜利' : '败北'} ${mine} - ${theirs}`, win ? 'good' : 'bad', 4500);
    sfx(win ? 'win' : 'lose');
  }
}

function startPending(): void {
  const pm = G.pending!;
  const res = simulatePending(pm);
  if (shouldWatch(pm) && !document.hidden) {
    loop.live = { res, i: 0, wait: 600, lines: [], snap: null, line: [[], []], hits: [0, 0], onEvent: null };
    sfx('siren');
    refresh();
    return;
  }
  finishPending(res);
  announce(res);
  dirty = true;
}

/** 每个事件之后停多久（毫秒，1 倍速） */
function eventDelay(e: PlayEvent): number {
  switch (e.k) {
    case 'pitch':
      return e.pitch?.res === 'inplay' ? 300 : 850;
    case 'play':
      return e.big ? 2600 : 1900;
    case 'half':
      return 1500;
    case 'end':
      return 2500;
    case 'steal':
    case 'wp':
    case 'pickoff':
      return 1400;
    default:
      return 700;
  }
}

function liveStep(dt: number): void {
  const L = loop.live!;
  if (loop.paused) return;
  L.wait -= dt * speed();
  let guard = 0;
  while (L.wait <= 0 && guard++ < 20) {
    const ev = L.res.events[L.i++];
    if (!ev) {
      finishLive();
      return;
    }
    if (ev.snap) {
      L.snap = ev.snap;
      const inn = ev.snap.inning - 1;
      if (L.line[ev.side][inn] === undefined) for (let k = L.line[ev.side].length; k <= inn; k++) L.line[ev.side][k] = 0;
      if (ev.runs) L.line[ev.side][inn] += ev.runs;
    }
    if (ev.bip && ['1B', '2B', '3B', 'HR', 'IH'].includes(ev.bip.res)) L.hits[ev.side]++;
    if (ev.k !== 'pitch' || ev.big) {
      L.lines.push({ t: ev.text, big: !!ev.big, side: ev.side });
      if (L.lines.length > 60) L.lines.shift();
    }
    L.onEvent?.(ev);
    if (ev.k === 'play' && ev.bip?.res === 'HR') sfx('hr');
    L.wait += eventDelay(ev);
    dirty = true;
  }
}

/** 跳过观战，直接出结果 */
export function finishLive(): void {
  const L = loop.live;
  if (!L) return;
  loop.live = null;
  finishPending(L.res);
  announce(L.res);
  refresh();
}

function pump(): void {
  const now = performance.now();
  const dt = Math.min(now - last, 120000);
  last = now;
  if (!hasG() || ui.screen !== 'game') return;
  saveAcc += dt;
  if (saveAcc > 15000) {
    saveAcc = 0;
    saveGame();
  }
  if (loop.live) liveStep(dt);
  else if (G.pending && !G.queue.length) startPending();
  else if (loop.paused || blocked()) acc = 0;
  else {
    acc += dt * speed();
    let n = 0;
    while (acc >= MS_PER_DAY && n < 60) {
      tick();
      acc -= MS_PER_DAY;
      n++;
      dirty = true;
      if (blocked()) {
        acc = 0;
        break;
      }
    }
  }
  if (dirty && now - lastRefresh > 160) {
    dirty = false;
    lastRefresh = now;
    refresh();
  }
}

/** 读档后：离线进度 */
export function resumeGame(): void {
  ui.screen = 'game';
  loop.live = null;
  loop.paused = false;
  if (settings.offline && G.savedAt) {
    const days = Math.min(120, Math.floor((Date.now() - G.savedAt) / MS_PER_DAY));
    if (days >= 2) {
      const n = catchUp(days);
      if (n > 0) setTimeout(() => toast(`你不在的时候，球队又练习了 ${n} 天`, 'info', 5000), 600);
    }
  }
  saveGame();
  refresh();
}

export function startLoop(): void {
  if (timer) return;
  timer = window.setInterval(pump, 100);
  window.addEventListener('beforeunload', () => {
    if (hasG() && ui.screen === 'game') saveGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && hasG() && ui.screen === 'game') saveGame();
  });
  onLog((text, kind) => {
    if (ui.screen !== 'game') return;
    if (kind === 'gold') {
      toast(text, 'gold', 5000);
      sfx('fanfare');
    } else if (kind === 'event') toast(text, 'info', 4000);
  });
}
