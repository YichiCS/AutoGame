// 像素甲子园 · 存档适配器：只给 AutoGame 游戏厅用，游戏本身不加载。接口说明见仓库根目录 docs/architecture.md。
// v1 起（挂机版）：localStorage 'pixel-baseball:save' 是整局的 JSON，设置在 'pixel-baseball:settings'。
// v0.x（经营版，已不能在新版里继续）：IndexedDB「pixel-koshien」的 saves 表，以及退回用的 localStorage 'pixel-koshien:*'。
const SAVE_KEY = 'pixel-baseball:save';
const LEGACY_DB = 'pixel-koshien';
const LEGACY_SLOT = { auto: '旧版·自动存档', slot1: '旧版·存档 1', slot2: '旧版·存档 2', slot3: '旧版·存档 3' };

// 与 src/core/calendar.ts 一致：一年 360 天，day 0 是开局那年的 4 月 1 日
const mod = (a, n) => ((a % n) + n) % n;
function dateStr(day, startYear) {
  const m = ((3 + Math.floor(mod(day, 360) / 30)) % 12) + 1;
  const y = startYear + Math.floor(day / 360) + (m <= 3 ? 1 : 0);
  return `${y}年${m}月${mod(day, 30) + 1}日`;
}

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
  const slots = [];
  const g = readSave(data);
  if (g && typeof g === 'object') {
    const s = g.schools && g.schools[g.schoolId];
    const t = (g.mgr && g.mgr.totals) || {};
    const parts = [s ? `${s.name}（${g.mgr ? g.mgr.name : ''} 监督）` : '', Number.isFinite(g.day) ? dateStr(g.day, g.startYear || 2026) : '', `通算 ${t.w || 0} 胜 ${t.l || 0} 负`];
    slots.push({ label: '挂机版存档', detail: parts.filter(Boolean).join(' · '), savedAt: g.savedAt });
  } else if (g === null) return null;
  // 旧版（经营版）的栏位
  const metas = new Map();
  for (const db of data.indexedDB) {
    if (db.name !== LEGACY_DB) continue;
    for (const st of db.stores) {
      if (st.name !== 'saves') continue;
      for (const r of st.records) if (typeof r.key === 'string' && r.key.startsWith('meta:') && r.value && typeof r.value === 'object') metas.set(r.key.slice(5), r.value);
    }
  }
  for (const [k, v] of Object.entries(data.localStorage)) {
    const m = /^pixel-koshien:meta:(.+)$/.exec(k);
    if (!m || metas.has(m[1])) continue;
    try {
      metas.set(m[1], JSON.parse(v));
    } catch {
      /* 坏掉的元数据跳过 */
    }
  }
  for (const [slot, m] of metas) {
    slots.push({ label: LEGACY_SLOT[slot] || `旧版·${slot}`, detail: [m.school ? `${m.school}${m.name ? `（${m.name}）` : ''}` : m.name, m.date, '经营版，新版里无法继续'].filter(Boolean).join(' · '), savedAt: m.savedAt });
  }
  return { slots };
}

// 读档时游戏会把「上次保存到现在」当成离线时间补上训练（最多 120 天）。导入不算离线：把保存时间改成现在。
export function beforeImport(data) {
  const g = readSave(data);
  if (g && typeof g === 'object') {
    g.savedAt = Date.now();
    data.localStorage[SAVE_KEY] = JSON.stringify(g);
  }
  return data;
}
