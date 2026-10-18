// 游戏清单：autogame.json 列出游戏 id（也决定展示顺序），每个游戏的信息在 games/<id>/game.json。
// 字段说明见 docs/architecture.md「game.json」。

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function normalize(raw, id, dir) {
  const saves = raw.saves || {};
  return {
    ...raw,
    id,
    dir,
    url: new URL(raw.entry || 'index.html', dir).href,
    coverUrl: raw.cover ? new URL(raw.cover, dir).href : null,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    saves: {
      ...saves,
      localStorage: Array.isArray(saves.localStorage) ? saves.localStorage : [],
      indexedDB: Array.isArray(saves.indexedDB) ? saves.indexedDB : [],
    },
  };
}

export async function loadRegistry(base = new URL('./', location.href)) {
  const site = await getJSON(new URL('autogame.json', base));
  const ids = Array.isArray(site.games) ? site.games : [];
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const dir = new URL(`games/${id}/`, base);
      return normalize(await getJSON(new URL('game.json', dir)), id, dir);
    }),
  );
  const games = [];
  const errors = [];
  results.forEach((r, i) => (r.status === 'fulfilled' ? games.push(r.value) : errors.push({ id: ids[i], error: r.reason })));
  return { site, games, errors };
}

// ---------- 存档适配器（可选，games/<id>/ 下的 ES 模块） ----------
// export function describe(data)      → { slots: [{ label, detail, savedAt }] } | null   用来在游戏厅里显示存档内容
// export function beforeImport(data)  → data                                           导入写入前的调整
const adapters = new Map();

function adapterOf(game) {
  if (!game.saves.adapter) return Promise.resolve(null);
  if (!adapters.has(game.id)) {
    adapters.set(
      game.id,
      import(new URL(game.saves.adapter, game.dir).href).catch((e) => {
        console.warn(`[AutoGame] ${game.id} 的存档适配器加载失败`, e);
        return null;
      }),
    );
  }
  return adapters.get(game.id);
}

export async function describeData(game, data) {
  try {
    const a = await adapterOf(game);
    return (a && a.describe && a.describe(data)) || null;
  } catch (e) {
    console.warn(`[AutoGame] ${game.id} 的 describe() 出错`, e);
    return null;
  }
}

export async function prepareImport(game, data) {
  try {
    const a = await adapterOf(game);
    if (a && a.beforeImport) return (await a.beforeImport(structuredClone(data))) || data;
  } catch (e) {
    console.warn(`[AutoGame] ${game.id} 的 beforeImport() 出错，按原样导入`, e);
  }
  return data;
}
