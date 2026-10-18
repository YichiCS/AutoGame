// 游戏厅首页：游戏列表 + 存档中心（分游戏 / 全部 导出、导入、清除）
import { loadRegistry, describeData, prepareImport } from './registry.js';
import { readGameData, writeGameData, clearGameData, isEmpty, dataBytes } from './storage.js';
import { makeBundle, parseBundle, bundleFileName, compareVersions, parseVersion, detectInGameExport } from './bundle.js';
import { whoIsRunning } from './presence.js';
import { $, esc, openDialog, toast, download, pickFile, formatDate, timeAgo, formatBytes } from './ui.js';
import { startStarfield } from './starfield.js';

const HUB_KEY = 'autogame:hub'; // 游戏厅自己的设置（上次全部导出的时间等）
const BACKUP_REMIND_DAYS = 7;

const state = {
  site: null,
  games: [],
  saves: new Map(), // id → { data, info, bytes } 或 { error }
  running: new Set(),
};
let busy = false;

const byId = (id) => state.games.find((g) => g.id === id);
const safeColor = (c) => (/^#[0-9a-fA-F]{3,8}$/.test(c || '') ? c : '');

function hubPrefs() {
  try {
    return JSON.parse(localStorage.getItem(HUB_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function setHubPrefs(patch) {
  try {
    localStorage.setItem(HUB_KEY, JSON.stringify({ ...hubPrefs(), ...patch }));
  } catch {
    /* ignore */
  }
}

boot();

async function boot() {
  startStarfield($('#bg'));
  let reg;
  try {
    reg = await loadRegistry();
  } catch (e) {
    console.error(e);
    $('#gameGrid').innerHTML = `<p class="empty">游戏清单加载失败。${
      location.protocol === 'file:'
        ? '请通过网页服务器打开本页：GitHub Pages，或在仓库根目录运行 <code>node scripts/serve.mjs</code>。'
        : '请刷新页面重试。'
    }</p>`;
    return;
  }
  state.site = reg.site;
  state.games = reg.games;
  reg.errors.forEach((x) => console.error(`[AutoGame] 读取 games/${x.id}/game.json 失败`, x.error));
  $('#hubVersion').textContent = `v${reg.site.version || ''}`;
  if (reg.site.repository) document.querySelectorAll('[data-repo]').forEach((a) => (a.href = reg.site.repository));
  renderGames();
  renderSaveRows();
  bindEvents();
  await refreshSaves();
  renderStorageInfo();
  handleHash();
  pingRunning();
}

// ---------- 游戏卡片 ----------
function renderGames() {
  $('#gameCount').textContent = state.games.length ? `× ${state.games.length}` : '';
  const grid = $('#gameGrid');
  if (!state.games.length) {
    grid.innerHTML = '<p class="empty">还没有收录游戏。</p>';
    return;
  }
  grid.innerHTML = state.games.map(cardHTML).join('');
}

function cardHTML(g) {
  const color = safeColor(g.color);
  return `<article class="card" data-id="${esc(g.id)}"${color ? ` style="--accent:${color}"` : ''}>
    <a class="cover" href="${esc(g.url)}" tabindex="-1" aria-hidden="true">
      ${g.coverUrl ? `<img src="${esc(g.coverUrl)}" alt="" decoding="async">` : `<span class="cover-ph">${esc([...g.name][0] || '?')}</span>`}
      <span class="badge running" hidden>运行中</span>
    </a>
    <div class="card-body">
      <h3 class="card-title"><a href="${esc(g.url)}">${esc(g.name)}</a>${g.subtitle ? `<small>${esc(g.subtitle)}</small>` : ''}</h3>
      <p class="card-meta"><span class="ver">v${esc(g.version)}</span>${g.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</p>
      <p class="card-desc">${esc(g.description || '')}</p>
      <p class="save-line" data-state="loading"><i class="dot"></i><span>读取存档…</span></p>
      <div class="card-actions">
        <a class="btn primary" href="${esc(g.url)}">▶ 开始游戏</a>
        <button class="btn" type="button" data-act="goto-saves" data-id="${esc(g.id)}">存档</button>
      </div>
    </div>
  </article>`;
}

// ---------- 存档中心 ----------
function renderSaveRows() {
  const rows = state.games.map((g) => {
    const id = esc(g.id);
    const color = safeColor(g.color);
    return `<li class="save-row" id="save-${id}" data-id="${id}"${color ? ` style="--accent:${color}"` : ''}>
      <div class="row-head"><span class="row-name">${esc(g.name)}</span><span class="ver">v${esc(g.version)}</span><span class="badge running" hidden>运行中</span><span class="row-size" data-size></span></div>
      <p class="save-line" data-state="loading"><i class="dot"></i><span>读取存档…</span></p>
      <ul class="slots" data-slots></ul>
      <div class="row-actions">
        <button class="btn small" type="button" data-act="export" data-id="${id}">导出</button>
        <button class="btn small" type="button" data-act="import" data-id="${id}">导入</button>
        <button class="btn small danger" type="button" data-act="clear" data-id="${id}">清除</button>
      </div>
    </li>`;
  });
  $('#saveRows').innerHTML = rows.join('') || '<li class="empty">还没有收录游戏。</li>';
}

async function refreshSaves() {
  await Promise.all(
    state.games.map(async (g) => {
      try {
        const data = await readGameData(g);
        const info = isEmpty(data) ? null : await describeData(g, data);
        state.saves.set(g.id, { data, info, bytes: isEmpty(data) ? 0 : dataBytes(data) });
      } catch (e) {
        console.error(`[AutoGame] 读取 ${g.id} 的存档失败`, e);
        state.saves.set(g.id, { error: e });
      }
      renderSaveStatus(g);
    }),
  );
  renderStorageInfo();
}

const latestOf = (info) => Math.max(0, ...((info && info.slots) || []).map((s) => s.savedAt || 0));
const hasData = (id) => {
  const s = state.saves.get(id);
  return !!(s && s.data && !isEmpty(s.data));
};

function summary(g) {
  const s = state.saves.get(g.id);
  if (!s) return { state: 'loading', text: '读取存档…' };
  if (s.error) return { state: 'bad', text: `读取存档出错：${s.error.message || s.error}` };
  if (isEmpty(s.data)) return { state: 'none', text: '暂无存档' };
  const slots = (s.info && s.info.slots) || [];
  if (s.info && !slots.length) return { state: 'some', text: '只有游戏设置，还没有存档' };
  if (!slots.length) return { state: 'ok', text: '有存档数据' };
  const latest = latestOf(s.info);
  return { state: 'ok', text: `${slots.length} 个存档${latest ? ` · 最近保存 ${timeAgo(latest)}` : ''}` };
}

function slotsHTML(info) {
  return ((info && info.slots) || [])
    .map((s) => `<li><b>${esc(s.label || '存档')}</b><span>${esc(s.detail || '')}</span>${s.savedAt ? `<time datetime="${new Date(s.savedAt).toISOString()}" title="${esc(formatDate(s.savedAt))}">${esc(timeAgo(s.savedAt))}</time>` : ''}</li>`)
    .join('');
}

function renderSaveStatus(g) {
  const sum = summary(g);
  const s = state.saves.get(g.id) || {};
  document.querySelectorAll(`[data-id="${CSS.escape(g.id)}"] .save-line`).forEach((el) => {
    el.dataset.state = sum.state;
    el.querySelector('span').textContent = sum.text;
  });
  const row = document.getElementById(`save-${g.id}`);
  if (!row) return;
  row.querySelector('[data-slots]').innerHTML = slotsHTML(s.info);
  row.querySelector('[data-size]').textContent = s.bytes ? formatBytes(s.bytes) : '';
  const empty = !hasData(g.id);
  row.querySelector('[data-act="export"]').disabled = empty;
  row.querySelector('[data-act="clear"]').disabled = empty;
}

async function renderStorageInfo() {
  const last = hubPrefs().lastExportAt;
  const anySaves = state.games.some((g) => hasData(g.id));
  const stale = anySaves && (!last || Date.now() - last > BACKUP_REMIND_DAYS * 86400000);
  const lastEl = $('#lastExport');
  lastEl.textContent = last ? `${formatDate(last)}（${timeAgo(last)}）` : '从未';
  lastEl.classList.toggle('warn', stale);
  lastEl.title = stale ? `超过 ${BACKUP_REMIND_DAYS} 天没有备份了，建议导出一次` : '';

  const st = navigator.storage;
  const persistEl = $('#persist');
  if (st && st.persisted) {
    const on = await st.persisted().catch(() => false);
    persistEl.innerHTML = on
      ? '<span class="good">已开启</span>'
      : '<span class="muted">未开启</span><button class="btn small" type="button" data-act="persist">申请</button>';
  } else persistEl.textContent = '浏览器不支持';
  if (st && st.estimate) {
    const est = await st.estimate().catch(() => null);
    $('#usage').textContent = est && est.usage != null ? formatBytes(est.usage) : '—';
  }
}

async function pingRunning() {
  state.running = await whoIsRunning();
  document.querySelectorAll('.badge.running').forEach((b) => {
    const id = b.closest('[data-id]').dataset.id;
    b.hidden = !state.running.has(id);
  });
}

// ---------- 事件 ----------
function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const g = el.dataset.id ? byId(el.dataset.id) : null;
    switch (el.dataset.act) {
      case 'goto-saves':
        if (location.hash === `#saves/${g.id}`) handleHash();
        else location.hash = `#saves/${g.id}`;
        break;
      case 'export-all':
        exportGames(state.games, '全部');
        break;
      case 'export':
        exportGames([g], g.name);
        break;
      case 'import':
        importFlow(g);
        break;
      case 'clear':
        clearFlow(g);
        break;
      case 'persist':
        requestPersist();
        break;
      default:
        break;
    }
  });
  addEventListener('hashchange', handleHash);
  // 从游戏的标签页切回来时，存档可能已经变了
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !busy) {
      refreshSaves();
      pingRunning();
    }
  });
  addEventListener('pageshow', (e) => {
    if (e.persisted && !busy) {
      refreshSaves();
      pingRunning();
    }
  });
}

function handleHash() {
  const m = /^#saves(?:\/(.+))?$/.exec(location.hash);
  if (!m) return;
  const target = m[1] ? document.getElementById(`save-${decodeURIComponent(m[1])}`) : $('#saves');
  if (!target) return;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: m[1] ? 'center' : 'start' });
  if (m[1]) {
    target.classList.remove('flash');
    void target.offsetWidth;
    target.classList.add('flash');
  }
}

// ---------- 导出 ----------
async function exportGames(games, scope) {
  if (busy) return;
  busy = true;
  try {
    const entries = [];
    for (const g of games) {
      const data = await readGameData(g);
      if (!isEmpty(data)) entries.push({ game: g, data });
    }
    if (!entries.length) {
      toast(games.length === 1 ? `「${games[0].name}」还没有存档` : '还没有任何存档可以导出', 'warn');
      return;
    }
    download(bundleFileName(scope), JSON.stringify(makeBundle(entries, state.site.version)));
    if (games.length > 1) setHubPrefs({ lastExportAt: Date.now() });
    renderStorageInfo();
    toast(entries.length === 1 ? `已导出「${entries[0].game.name}」的存档` : `已导出 ${entries.length} 个游戏的存档`, 'good');
  } catch (e) {
    console.error(e);
    toast(`导出失败：${e.message}`, 'bad');
  } finally {
    busy = false;
  }
}

// 写入 / 清除之前，把本机现有的存档下载一份
async function backupCurrent(games, label) {
  const entries = [];
  for (const g of games) {
    const data = await readGameData(g);
    if (!isEmpty(data)) entries.push({ game: g, data });
  }
  if (!entries.length) return;
  const scope = entries.length === 1 ? `${label}_${entries[0].game.name}` : label;
  download(bundleFileName(scope), JSON.stringify(makeBundle(entries, state.site.version)));
}

// 游戏开在别的标签页时不能写存档：游戏的自动保存会把刚写进去的内容覆盖掉
async function ensureNotRunning(games, verb) {
  for (;;) {
    await pingRunning();
    const open = games.filter((g) => state.running.has(g.id));
    if (!open.length) return true;
    const names = open.map((g) => `「${esc(g.name)}」`).join('、');
    const r = await openDialog({
      title: '请先关闭正在运行的游戏',
      body: `<p>${names}正开在另一个标签页里。</p><p>游戏会自动保存，可能把刚${esc(verb)}的存档覆盖掉。请先关掉那个标签页，再点「重新检测」。</p>`,
      actions: [
        { label: '取消', value: '' },
        { label: '重新检测', value: 'retry', kind: 'primary', autofocus: true },
      ],
    });
    if (r.value !== 'retry') return false;
  }
}

// ---------- 导入 ----------
async function importFlow(target) {
  if (busy) return;
  const file = await pickFile();
  if (!file) return;
  busy = true;
  try {
    let text;
    try {
      text = await file.text();
    } catch {
      toast('读取文件失败', 'bad');
      return;
    }
    const parsed = parseBundle(text);
    if (!parsed.ok) {
      await explainBadFile(parsed);
      return;
    }
    const { bundle } = parsed;
    const ids = Object.keys(bundle.games);
    if (target && !bundle.games[target.id]) {
      const list = ids.map((id) => `「${esc(bundle.games[id].name)}」`).join('、') || '（空）';
      await openDialog({
        title: `文件里没有「${target.name}」的存档`,
        body: `<p>这个存档包里只有：${list}。</p><p class="muted">要导入其中的游戏，请用存档中心上方的「导入存档文件」。</p>`,
      });
      return;
    }
    const picked = await previewImport(file.name, bundle, target ? [target.id] : ids);
    if (!picked) return;
    if (!picked.ids.length) {
      toast('没有选择要导入的游戏', 'warn');
      return;
    }
    const games = picked.ids.map(byId);
    if (!(await ensureNotRunning(games, '导入'))) return;
    if (picked.backup) await backupCurrent(games, '导入前备份');

    let ok = 0;
    const failed = [];
    for (const g of games) {
      const before = await readGameData(g);
      try {
        const data = await prepareImport(g, bundle.games[g.id].data);
        const { skipped } = await writeGameData(g, data);
        if (skipped.length) console.warn(`[AutoGame] ${g.id}：跳过了不属于这个游戏的数据`, skipped);
        ok++;
      } catch (e) {
        console.error(e);
        failed.push(`${g.name}：${e.message}`);
        try {
          await writeGameData(g, before);
        } catch (e2) {
          console.error('[AutoGame] 恢复导入前的存档失败', e2);
        }
      }
    }
    await refreshSaves();
    if (failed.length) {
      await openDialog({
        title: '有存档没能导入',
        body: `<p>${ok ? `成功导入 ${ok} 个游戏。` : ''}下面的游戏导入失败，已经恢复成导入前的存档：</p><ul>${failed.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`,
      });
    } else {
      toast(ok === 1 ? `已导入「${games[0].name}」的存档，打开游戏就能继续玩` : `已导入 ${ok} 个游戏的存档`, 'good', 4500);
    }
  } finally {
    busy = false;
  }
}

async function explainBadFile(parsed) {
  if (parsed.reason === 'format') {
    const g = detectInGameExport(parsed.json, state.games);
    if (g) {
      const r = await openDialog({
        title: '这是游戏里导出的存档',
        body: `<p>这个文件是「${esc(g.name)}」在游戏里导出的单局存档，和游戏厅的存档包不是一种格式。</p><p>请打开游戏，在<b>${esc(g.saves.inGameExport.hint || '游戏的设置')}</b>里导入它。</p>`,
        actions: [
          { label: '知道了', value: '' },
          { label: '打开游戏', value: 'open', kind: 'primary' },
        ],
      });
      if (r.value === 'open') location.href = g.url;
      return;
    }
  }
  const msg = {
    json: '这不是有效的 JSON 文件',
    format: '这不是 AutoGame 的存档文件',
    newer: '这个存档包来自更新版本的游戏厅，请先刷新页面再试',
    broken: '存档文件已损坏，无法读取',
  }[parsed.reason];
  toast(msg || '无法读取这个文件', 'bad');
}

async function previewImport(fileName, bundle, ids) {
  const items = [];
  let anyExisting = false;
  for (const id of ids) {
    const entry = bundle.games[id];
    const g = byId(id);
    if (!g) {
      items.push(`<li class="pick off"><label><input type="checkbox" disabled> <b>${esc(entry.name)}</b></label><p class="muted">游戏厅里没有这个游戏（${esc(id)}），会跳过。</p></li>`);
      continue;
    }
    const info = await describeData(g, entry.data);
    const notes = [];
    if (entry.version && compareVersions(entry.version, g.version) > 0) {
      notes.push(`存档来自更新的版本 v${esc(entry.version)}，当前游戏是 v${esc(g.version)}，可能读不出来。`);
    } else if (entry.version && parseVersion(entry.version)[0] < parseVersion(g.version)[0]) {
      notes.push(`存档来自较早的大版本 v${esc(entry.version)}，当前游戏是 v${esc(g.version)}，可能不兼容。`);
    }
    if (hasData(id)) {
      anyExisting = true;
      const latest = latestOf(state.saves.get(id).info);
      notes.push(`会覆盖本机现有的存档${latest ? `（最近保存 ${esc(timeAgo(latest))}）` : ''}。`);
    }
    items.push(`<li class="pick"><label><input type="checkbox" name="game" value="${esc(id)}" checked> <b>${esc(g.name)}</b><span class="muted">存档 v${esc(entry.version || '?')} · 当前 v${esc(g.version)}</span></label>
      ${info && info.slots && info.slots.length ? `<ul class="slots">${slotsHTML(info)}</ul>` : ''}
      ${notes.map((n) => `<p class="warn">${n}</p>`).join('')}</li>`);
  }
  const when = Date.parse(bundle.exportedAt);
  const body = `<p class="muted">${esc(fileName)} · ${Number.isFinite(when) ? `导出于 ${esc(formatDate(when))}` : '导出时间未知'}</p>
    <ul class="pick-list">${items.join('')}</ul>
    ${anyExisting ? '<label class="check"><input type="checkbox" name="backup" checked> 导入前先下载一份本机现有存档的备份</label>' : ''}`;
  const r = await openDialog({
    title: '导入存档',
    body,
    actions: [
      { label: '取消', value: '' },
      { label: '导入所选', value: 'ok', kind: 'primary' },
    ],
  });
  if (r.value !== 'ok') return null;
  return {
    ids: [...r.el.querySelectorAll('input[name="game"]:checked')].map((x) => x.value),
    backup: !!r.el.querySelector('input[name="backup"]:checked'),
  };
}

// ---------- 清除 ----------
async function clearFlow(g) {
  if (busy || !hasData(g.id)) return;
  const r = await openDialog({
    title: `清除「${g.name}」的存档`,
    body: `<p>会删除这个浏览器里「${esc(g.name)}」的全部存档和游戏设置，<b>无法撤销</b>。</p><label class="check"><input type="checkbox" name="backup" checked> 清除前先下载一份备份</label>`,
    actions: [
      { label: '取消', value: '' },
      { label: '清除', value: 'ok', kind: 'danger' },
    ],
  });
  if (r.value !== 'ok') return;
  const backup = !!r.el.querySelector('input[name="backup"]:checked');
  busy = true;
  try {
    if (!(await ensureNotRunning([g], '清除'))) return;
    if (backup) await backupCurrent([g], '清除前备份');
    await clearGameData(g);
    toast(`已清除「${g.name}」的存档`, 'good');
  } catch (e) {
    console.error(e);
    toast(`清除失败：${e.message}`, 'bad');
  } finally {
    busy = false;
    await refreshSaves();
  }
}

// ---------- 持久存储 ----------
async function requestPersist() {
  const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist().catch(() => false) : false;
  toast(
    ok ? '已开启持久存储：浏览器清理空间时不会自动删掉这里的存档' : '浏览器暂时没有同意。多玩几次、或把本站加入书签后再试试',
    ok ? 'good' : 'warn',
    4500,
  );
  renderStorageInfo();
}
