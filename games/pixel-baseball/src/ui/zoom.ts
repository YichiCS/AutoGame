// 界面缩放（像素字体在 100% / 200% 时最清晰）
import { settings } from './settings';

export function applyZoom(): void {
  document.documentElement.style.setProperty('zoom', String(settings.zoom || 1));
}
