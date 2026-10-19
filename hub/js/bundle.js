// 存档包：游戏厅统一的导出 / 导入文件格式。单个游戏和全部游戏用的是同一种格式，
// 区别只在 games 里有几个游戏。格式说明见 docs/architecture.md「存档包格式」。

export const FORMAT = 'autogame-saves';
export const FORMAT_VERSION = 1;

// entries: [{ game, data }]
export function makeBundle(entries, hubVersion) {
  const games = {};
  for (const { game, data } of entries) games[game.id] = { name: game.name, version: game.version, data };
  return { format: FORMAT, formatVersion: FORMAT_VERSION, exportedAt: new Date().toISOString(), hub: { version: hubVersion }, games };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function cleanData(d) {
  if (!isObj(d)) return null;
  const ls = {};
  if (d.localStorage !== undefined) {
    if (!isObj(d.localStorage)) return null;
    for (const [k, v] of Object.entries(d.localStorage)) {
      if (typeof v !== 'string') return null;
      ls[k] = v;
    }
  }
  const idb = [];
  if (d.indexedDB !== undefined) {
    if (!Array.isArray(d.indexedDB)) return null;
    for (const db of d.indexedDB) {
      if (!isObj(db) || typeof db.name !== 'string' || !Array.isArray(db.stores)) return null;
      const stores = [];
      for (const s of db.stores) {
        if (!isObj(s) || typeof s.name !== 'string' || !Array.isArray(s.records)) return null;
        if (!s.records.every((r) => isObj(r) && 'key' in r)) return null;
        stores.push({
          name: s.name,
          keyPath: s.keyPath ?? null,
          autoIncrement: !!s.autoIncrement,
          indexes: Array.isArray(s.indexes) ? s.indexes.filter((ix) => isObj(ix) && typeof ix.name === 'string') : [],
          records: s.records,
        });
      }
      idb.push({ name: db.name, version: Number.isInteger(db.version) && db.version > 0 ? db.version : 1, stores });
    }
  }
  return { localStorage: ls, indexedDB: idb };
}

// 返回 { ok: true, bundle } 或 { ok: false, reason, json }
// reason: 'json' 不是 JSON；'format' 不是存档包（json 里是解析出来的内容，用来识别游戏内导出的文件）；
//         'newer' 来自更新版本的游戏厅；'broken' 存档包内容损坏
export function parseBundle(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!isObj(json) || json.format !== FORMAT) return { ok: false, reason: 'format', json };
  if (!Number.isInteger(json.formatVersion) || json.formatVersion > FORMAT_VERSION) return { ok: false, reason: 'newer' };
  if (!isObj(json.games)) return { ok: false, reason: 'broken' };
  const games = {};
  for (const [id, g] of Object.entries(json.games)) {
    const data = isObj(g) ? cleanData(g.data) : null;
    if (!data) return { ok: false, reason: 'broken' };
    games[id] = { name: typeof g.name === 'string' ? g.name : id, version: typeof g.version === 'string' ? g.version : '', data };
  }
  return { ok: true, bundle: { ...json, games } };
}

// 游戏内「导出存档」得到的是游戏自己的格式。按 game.json 里 saves.inGameExport.match 的字段认出是哪个游戏
export function detectInGameExport(json, games) {
  if (!isObj(json)) return null;
  return games.find((g) => {
    const m = g.saves.inGameExport?.match;
    return Array.isArray(m) && m.length > 0 && m.every((k) => k in json);
  }) || null;
}

export function bundleFileName(scope, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const safe = String(scope).replace(/[\\/:*?"<>|\s]+/g, '_');
  return `AutoGame存档_${safe}_${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}.json`;
}

// 语义化版本比较：a < b 返回负数，相等 0，a > b 正数。不认识的写法当作 0.0.0
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}
export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}
// 重新编号过的游戏：存档包里的旧版本号按 game.json 的 legacyVersions 换成现在的编号，不在表里的原样返回
export function renumberVersion(v, legacy) {
  return legacy && Object.hasOwn(legacy, v) && typeof legacy[v] === 'string' ? legacy[v] : v;
}
