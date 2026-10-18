// 存档读写：按 game.json 里声明的 localStorage 键 / IndexedDB 数据库，做快照、恢复和清除。
// 只碰声明过的数据——同一个域名（yichics.github.io）下还有别的项目，不能误伤。
// 数据结构见 docs/architecture.md「存档数据」。

export const RESERVED_PREFIX = 'autogame:'; // 游戏厅自己用的 localStorage 前缀，游戏不能声明

export const emptyData = () => ({ localStorage: {}, indexedDB: [] });
export const isEmpty = (data) => !Object.keys(data.localStorage).length && !data.indexedDB.length;
export const dataBytes = (data) => new Blob([JSON.stringify(data)]).size;

// 'abc' 只匹配键 abc；'abc:*' 匹配所有以 abc: 开头的键
export function matchKey(key, patterns) {
  return patterns.some((p) => (p.endsWith('*') ? key.startsWith(p.slice(0, -1)) : key === p));
}

const lsPatterns = (game) => game.saves.localStorage;
const idbNames = (game) => game.saves.indexedDB;

// ---------- localStorage ----------
function lsKeys(patterns) {
  const out = [];
  if (!patterns.length) return out;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k != null && !k.startsWith(RESERVED_PREFIX) && matchKey(k, patterns)) out.push(k);
    }
  } catch {
    /* 隐私模式等情况下 localStorage 不可用 */
  }
  return out.sort();
}

// ---------- IndexedDB ----------
const hasIDB = () => {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
};

const txDone = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB 事务被中止'));
  });

// 打开已有的数据库；不存在时返回 null。
// 不能顺手建出一个空库：那样游戏自己打开时 onupgradeneeded 不会再触发，表就永远建不出来了。
async function openExisting(name) {
  if (!hasIDB()) return null;
  if (indexedDB.databases) {
    try {
      const list = await indexedDB.databases();
      if (!list.some((d) => d.name === name)) return null;
    } catch {
      /* 个别浏览器的隐私模式会报错，改用下面的办法 */
    }
  }
  return new Promise((resolve, reject) => {
    let fresh = false;
    const req = indexedDB.open(name);
    req.onupgradeneeded = (e) => {
      if (e.oldVersion === 0) {
        fresh = true;
        req.transaction.abort(); // 撤销创建
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => {
      if (fresh) {
        e.preventDefault();
        resolve(null);
      } else reject(req.error);
    };
  });
}

function openWithUpgrade(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    let gaveUp = false;
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => {
      if (gaveUp) req.result.close();
      else resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      gaveUp = true;
      reject(new Error(`数据库 ${name} 正被其他标签页使用，请先关闭正在运行的游戏`));
    };
  });
}

function createStores(db, stores) {
  for (const s of stores) {
    if (db.objectStoreNames.contains(s.name)) continue;
    const st = db.createObjectStore(s.name, { keyPath: s.keyPath ?? null, autoIncrement: !!s.autoIncrement });
    for (const ix of s.indexes || []) st.createIndex(ix.name, ix.keyPath, { unique: !!ix.unique, multiEntry: !!ix.multiEntry });
  }
}

async function readDB(name) {
  const db = await openExisting(name);
  if (!db) return null;
  try {
    const names = [...db.objectStoreNames];
    if (!names.length) return null;
    const tx = db.transaction(names, 'readonly');
    const pending = names.map((sn) => {
      const st = tx.objectStore(sn);
      const indexes = [...st.indexNames].map((n) => {
        const ix = st.index(n);
        return { name: n, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry };
      });
      return { name: sn, keyPath: st.keyPath, autoIncrement: st.autoIncrement, indexes, keys: st.getAllKeys(), values: st.getAll() };
    });
    await txDone(tx);
    const stores = pending.map(({ keys, values, ...info }) => ({
      ...info,
      records: keys.result.map((key, i) => ({ key, value: values.result[i] })),
    }));
    return { name, version: db.version, stores };
  } finally {
    db.close();
  }
}

// 替换语义：清空库里所有表，再写入快照里的记录。库不存在就按快照里的版本号和表结构新建。
async function writeDB(snap) {
  if (!hasIDB()) throw new Error('这个浏览器不支持 IndexedDB，无法恢复该游戏的存档');
  let db = await openExisting(snap.name);
  if (!db) {
    db = await openWithUpgrade(snap.name, Math.max(1, snap.version || 1), (d) => createStores(d, snap.stores));
  } else {
    const missing = snap.stores.filter((s) => !db.objectStoreNames.contains(s.name));
    if (missing.length) {
      const v = db.version + 1;
      db.close();
      db = await openWithUpgrade(snap.name, v, (d) => createStores(d, missing));
    }
  }
  try {
    const names = [...db.objectStoreNames];
    if (!names.length) return;
    const tx = db.transaction(names, 'readwrite');
    for (const sn of names) tx.objectStore(sn).clear();
    for (const s of snap.stores) {
      const st = tx.objectStore(s.name);
      for (const r of s.records) {
        if (st.keyPath != null) st.put(r.value);
        else st.put(r.value, r.key);
      }
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

// 清空表而不是删库：删库会被其他标签页的连接卡住，而且会在之后某个时刻突然生效
async function clearDB(name) {
  const db = await openExisting(name);
  if (!db) return;
  try {
    const names = [...db.objectStoreNames];
    if (!names.length) return;
    const tx = db.transaction(names, 'readwrite');
    for (const sn of names) tx.objectStore(sn).clear();
    await txDone(tx);
  } finally {
    db.close();
  }
}

// ---------- 对外接口 ----------

// 读出一个游戏的全部存档数据（只含声明过的键和库；没有记录的库不放进来）
export async function readGameData(game) {
  const data = emptyData();
  for (const k of lsKeys(lsPatterns(game))) data.localStorage[k] = localStorage.getItem(k);
  for (const name of idbNames(game)) {
    const snap = await readDB(name);
    if (snap && snap.stores.some((s) => s.records.length)) data.indexedDB.push(snap);
  }
  return data;
}

// 用 data 替换一个游戏现有的全部存档数据。不属于这个游戏声明范围的键和库会被跳过，返回 { skipped }。
export async function writeGameData(game, data) {
  const patterns = lsPatterns(game);
  const names = idbNames(game);
  const skipped = [];
  for (const k of lsKeys(patterns)) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(data.localStorage || {})) {
    if (k.startsWith(RESERVED_PREFIX) || !matchKey(k, patterns)) {
      skipped.push(k);
      continue;
    }
    localStorage.setItem(k, String(v));
  }
  const incoming = new Map((data.indexedDB || []).map((d) => [d.name, d]));
  for (const name of names) {
    if (incoming.has(name)) await writeDB(incoming.get(name));
    else await clearDB(name);
  }
  for (const name of incoming.keys()) if (!names.includes(name)) skipped.push(`IndexedDB:${name}`);
  return { skipped };
}

export async function clearGameData(game) {
  for (const k of lsKeys(lsPatterns(game))) localStorage.removeItem(k);
  for (const name of idbNames(game)) await clearDB(name);
}
