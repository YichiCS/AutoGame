// 科研模拟器 · 存档适配器：只给 AutoGame 游戏厅用，游戏本身不加载。接口说明见仓库根目录 docs/architecture.md。
// 存档格式见 js/core/state.js：localStorage['research-sim-save-v1'] 是整个游戏状态的 JSON。
const SAVE_KEY = 'research-sim-save-v1';
const BASE_YEAR = 2026; // 与 js/core/state.js 的 G.BASE_YEAR 一致

const mod = (a, n) => ((a % n) + n) % n;
const dateStr = (day) => `${BASE_YEAR + Math.floor(day / 360)}年${Math.floor(mod(day, 360) / 30) + 1}月${mod(day, 30) + 1}日`;

function readSave(data) {
  const raw = data.localStorage[SAVE_KEY];
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function describe(data) {
  const g = readSave(data);
  if (g === undefined) return { slots: [] }; // 只有设置，还没开局
  if (!g || typeof g !== 'object') return null;
  const who = g.phd ? `${g.phd.name} · 读博中` : `${(g.pi && g.pi.name) || '你'} · ${g.labName || '实验室'}`;
  const parts = [who, g.school, Number.isFinite(g.day) ? dateStr(g.day) : '', g.ended && !(g.flags && g.flags.continued) ? '已结束' : ''];
  return { slots: [{ label: '自动存档', detail: parts.filter(Boolean).join(' · '), savedAt: g.savedAt }] };
}

// 读档时，游戏会把「上次保存到现在」的时间当成离线时间快进（最多 120 天）。
// 导入不算离线：和游戏内导入一样，把保存时间改成现在。
export function beforeImport(data) {
  const g = readSave(data);
  if (g && typeof g === 'object') {
    g.savedAt = Date.now();
    data.localStorage[SAVE_KEY] = JSON.stringify(g);
  }
  return data;
}
