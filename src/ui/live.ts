import type { Match } from '../sim/match';
import type { PendingMatch } from '../core/types';

export interface LiveMatch {
  match: Match;
  mySide: 0 | 1;
  pm: PendingMatch;
  watch: boolean;
  done: () => void;
}

export const liveState: { cur: LiveMatch | null } = { cur: null };

export const settings = {
  animSpeed: 1,
  stopAtKey: true,
  sound: true,
  zoom: 1,
};

export function loadSettings(): void {
  try {
    const s = localStorage.getItem('pixel-koshien:settings');
    if (s) Object.assign(settings, JSON.parse(s));
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}

export function saveSettings(): void {
  try {
    localStorage.setItem('pixel-koshien:settings', JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
