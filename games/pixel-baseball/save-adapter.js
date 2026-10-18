// 像素甲子园 · 存档适配器：只给 AutoGame 游戏厅用，游戏本身不加载。接口说明见仓库根目录 docs/architecture.md。
// 存档格式见 src/core/save.ts：IndexedDB「pixel-koshien」的 saves 表，每个栏位两条记录——
//   data:<栏位>  整局的 JSON 字符串
//   meta:<栏位>  { slot, name, school, date, savedAt, rep }
// IndexedDB 不可用时游戏退回 localStorage，键名是 pixel-koshien:data:<栏位> / pixel-koshien:meta:<栏位>。
const DB = 'pixel-koshien';
const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];
const SLOT_NAME = { auto: '自动存档', slot1: '存档 1', slot2: '存档 2', slot3: '存档 3' };

export function describe(data) {
  const metas = new Map();
  for (const db of data.indexedDB) {
    if (db.name !== DB) continue;
    for (const st of db.stores) {
      if (st.name !== 'saves') continue;
      for (const r of st.records) {
        if (typeof r.key === 'string' && r.key.startsWith('meta:') && r.value && typeof r.value === 'object') metas.set(r.key.slice(5), r.value);
      }
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
  const rank = (s) => (SLOTS.includes(s) ? SLOTS.indexOf(s) : SLOTS.length);
  const slots = [...metas.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([slot, m]) => ({
      label: SLOT_NAME[slot] || slot,
      detail: [m.school ? `${m.school}${m.name ? `（${m.name}）` : ''}` : m.name, m.date].filter(Boolean).join(' · '),
      savedAt: m.savedAt,
    }));
  return { slots };
}
