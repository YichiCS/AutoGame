// 界面设置（和存档分开保存）
export const SETTINGS_KEY = 'pixel-baseball:settings';

export const settings = {
  sound: true,
  /** 旧版的观战设置（读旧设置时换算成 command） */
  watch: undefined as 'all' | 'important' | 'off' | undefined,
  /** 亲自指挥哪些比赛：全部 / 正式比赛 / 重要比赛（甲子园、神宫、选拔、县大会八强以后）/ 都不指挥 */
  command: 'official' as 'all' | 'official' | 'big' | 'off',
  /** 打席自动化 */
  matchAuto: 'off' as 'off' | 'key' | 'bat' | 'pitch' | 'all',
  /** 比赛演出速度 */
  matchSpeed: 2,
  /** 关掉页面期间按 1 倍速继续（最多 120 天） */
  offline: true,
  speedIdx: 0,
  zoom: 1,
  logOpen: false,
  sub: {} as Record<string, string>,
};

export function loadSettings(): void {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) Object.assign(settings, JSON.parse(s));
    if (settings.watch) {
      settings.command = settings.watch === 'off' ? 'off' : settings.watch === 'all' ? 'all' : 'official';
      settings.watch = undefined;
    }
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}

export function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
