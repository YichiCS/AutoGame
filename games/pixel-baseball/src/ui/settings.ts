// 界面设置（和存档分开保存）
export const SETTINGS_KEY = 'pixel-baseball:settings';

export const settings = {
  sound: true,
  /** 观战：全部比赛 / 只看重要比赛 / 不观战（直接出结果） */
  watch: 'important' as 'all' | 'important' | 'off',
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
