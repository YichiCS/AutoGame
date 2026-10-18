// 主循环：模拟用 setInterval（后台也能跑）。比赛日要亲自指挥的比赛会打开比赛画面，其他的直接出结果
import { G, hasG, onLog } from '../core/state';
import { tick, blocked, finishPending, catchUp } from '../core/sim';
import { simulatePending, type SimResult } from '../core/matchday';
import { MatchSession, shouldCommand } from './match/session';
import { saveGame } from '../core/save';
import { settings, saveSettings } from './settings';
import { refresh, toast, ui } from './store';
import { sfx } from './sound';

export const SPEEDS = [1, 2, 4, 10];
/** 1 倍速下，游戏里的一天 = 1.5 秒 */
export const MS_PER_DAY = 1500;

export const loop = {
  paused: false,
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

/** 比赛日：要亲自指挥的打开比赛画面，其余直接出结果 */
function startPending(): void {
  const pm = G.pending!;
  if (pm.live || shouldCommand(pm)) {
    if (!ui.match) {
      ui.match = new MatchSession(pm);
      sfx('siren');
      refresh();
    }
    return;
  }
  const res = simulatePending(pm);
  finishPending(res);
  announce(res);
  dirty = true;
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
  if (ui.match) {
    // 比赛进行中：时间停住
  } else if (G.pending && !G.queue.length) startPending();
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
  ui.match = null;
  loop.paused = false;
  if (settings.offline && G.savedAt) {
    const days = Math.min(120, Math.floor((Date.now() - G.savedAt) / MS_PER_DAY));
    if (days >= 2) {
      // 要亲自指挥的比赛不会被离线进度打掉：补到那一天就停下
      const n = catchUp(days, shouldCommand);
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
