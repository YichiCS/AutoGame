#!/usr/bin/env node
// 仓库检查（GitHub Actions 和本地共用，只依赖 Node 20+）
//
//   node scripts/check.mjs                                   校验 autogame.json、每个 games/<id>/game.json 和它们引用的文件
//   node scripts/check.mjs --branch <分支名> --base <基准>    另外校验分支规则：分支名 = <游戏id>-v<版本号>，
//                                                            版本号与清单一致且比基准新，只改了该游戏自己的目录
//   node scripts/check.mjs --build                           运行声明了 build 的游戏的构建命令，确认构建产物已经提交
//
// 规则说明见 CONTRIBUTING.md，字段说明见 docs/architecture.md。
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HUB_ID = 'hub';
const RESERVED = 'autogame';
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BRANCH = /^([a-z0-9]+(?:-[a-z0-9]+)*)-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;

const args = parseArgs(process.argv.slice(2));
const errors = [];
const warnings = [];
const inCI = !!process.env.GITHUB_ACTIONS;

function parseArgs(argv) {
  const out = { branch: null, base: null, build: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--branch') out.branch = argv[++i] || '';
    else if (argv[i] === '--base') out.base = argv[++i] || '';
    else if (argv[i] === '--build') out.build = true;
    else {
      console.error(`不认识的参数：${argv[i]}`);
      process.exit(2);
    }
  }
  return out;
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');
function err(msg, file) {
  errors.push(msg);
  console.log(`  ✗ ${msg}`);
  if (inCI) console.log(`::error${file ? ` file=${rel(file)}` : ''}::${msg}`);
}
function warn(msg, file) {
  warnings.push(msg);
  console.log(`  ! ${msg}`);
  if (inCI) console.log(`::warning${file ? ` file=${rel(file)}` : ''}::${msg}`);
}

function readJSON(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    err(`${rel(file)} 读取失败：${e.message}`, file);
    return null;
  }
}
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const git = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function cmpVer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}
function changelogHas(file, version) {
  if (!isFile(file)) return false;
  const v = version.replace(/\./g, '\\.');
  return new RegExp(`^##\\s*v?${v}(\\s|$)`, 'm').test(readFileSync(file, 'utf8'));
}

// ---------- 站点配置 ----------
console.log('autogame.json');
const sitePath = join(ROOT, 'autogame.json');
const site = readJSON(sitePath) || {};
if (!isStr(site.name)) err('autogame.json 缺少 name', sitePath);
if (!SEMVER.test(site.version || '')) err(`autogame.json 的 version「${site.version}」不是 x.y.z 格式`, sitePath);
else if (!changelogHas(join(ROOT, 'CHANGELOG.md'), site.version)) err(`CHANGELOG.md 里没有游戏厅当前版本 v${site.version} 的条目`, join(ROOT, 'CHANGELOG.md'));
const ids = Array.isArray(site.games) ? site.games : [];
if (!Array.isArray(site.games)) err('autogame.json 的 games 必须是数组', sitePath);
if (new Set(ids).size !== ids.length) err('autogame.json 的 games 里有重复的 id', sitePath);

// ---------- 每个游戏 ----------
const games = new Map();
for (const id of ids) {
  console.log(`games/${id}`);
  if (!ID.test(id) || id === HUB_ID || id.startsWith(RESERVED)) {
    err(`游戏 id「${id}」不合规：只能用小写字母、数字和连字符，且不能是 ${HUB_ID} 或以 ${RESERVED} 开头`, sitePath);
    continue;
  }
  const dir = join(ROOT, 'games', id);
  const manifestPath = join(dir, 'game.json');
  if (!isFile(manifestPath)) {
    err(`缺少 games/${id}/game.json`);
    continue;
  }
  const g = readJSON(manifestPath);
  if (!g) continue;
  games.set(id, g);
  const E = (m) => err(`games/${id}/game.json：${m}`, manifestPath);

  if (g.id !== id) E(`id 应该是「${id}」（和目录名一致），现在是「${g.id}」`);
  if (!isStr(g.name)) E('缺少 name');
  if (!isStr(g.description)) E('缺少 description');
  if (!SEMVER.test(g.version || '')) E(`version「${g.version}」不是 x.y.z 格式`);
  else {
    const pkg = join(dir, 'package.json');
    if (isFile(pkg)) {
      const p = readJSON(pkg);
      if (p && p.version !== g.version) err(`games/${id}/package.json 的 version（${p.version}）和 game.json（${g.version}）不一致`, pkg);
    }
    if (!changelogHas(join(dir, 'CHANGELOG.md'), g.version)) err(`games/${id}/CHANGELOG.md 里没有 v${g.version} 的条目`, join(dir, 'CHANGELOG.md'));
  }
  // 旧版本号 → 新版本号：旧的必须比当前版本小（以后的版本号不会和它重复），新的不能比当前版本大
  const lv = g.legacyVersions;
  if (lv !== undefined) {
    if (!lv || typeof lv !== 'object' || Array.isArray(lv)) E('legacyVersions 必须是 { "旧版本号": "新版本号" } 对象');
    else
      for (const [from, to] of Object.entries(lv)) {
        if (!SEMVER.test(from) || !SEMVER.test(to)) E(`legacyVersions 里的「${from}」→「${to}」不是 x.y.z 格式`);
        else if (SEMVER.test(g.version || '') && (cmpVer(from, g.version) >= 0 || cmpVer(to, g.version) > 0))
          E(`legacyVersions 里的 ${from} → ${to}：旧版本号必须比当前版本 v${g.version} 小，新版本号不能比它大`);
      }
  }
  if (g.tags !== undefined && !(Array.isArray(g.tags) && g.tags.every(isStr))) E('tags 必须是字符串数组');
  if (g.color !== undefined && !/^#[0-9a-fA-F]{3,8}$/.test(g.color)) E(`color「${g.color}」不是 #rrggbb 格式`);
  if (g.cover !== undefined && !isFile(join(dir, g.cover || ''))) E(`cover 指向的文件不存在：${g.cover}`);

  // 入口页面：必须存在，并且引入了游戏厅的接入脚本
  if (!isStr(g.entry) || !/\.html?$/.test(g.entry)) E('entry 必须是 .html 文件的相对路径');
  else if (!isFile(join(dir, g.entry))) E(`entry 指向的文件不存在：${g.entry}（需要构建的游戏要把构建产物提交上来）`);
  else checkDock(id, join(dir, g.entry));

  // 存档声明
  const s = g.saves;
  if (!s || typeof s !== 'object') E('缺少 saves（存档声明）');
  else {
    const ls = s.localStorage ?? [];
    const idb = s.indexedDB ?? [];
    if (!Array.isArray(ls) || !ls.every(isStr)) E('saves.localStorage 必须是字符串数组');
    else
      for (const p of ls) {
        if (p.toLowerCase().startsWith(RESERVED)) E(`saves.localStorage 不能使用游戏厅保留的前缀：${p}`);
        if (p.endsWith('*') && p.length - 1 < 3) E(`saves.localStorage 的前缀太短，会误伤别的数据：${p}`);
        if (p.indexOf('*') !== -1 && p.indexOf('*') !== p.length - 1) E(`saves.localStorage 里 * 只能放在末尾：${p}`);
      }
    if (!Array.isArray(idb) || !idb.every(isStr)) E('saves.indexedDB 必须是字符串数组');
    else for (const n of idb) if (n.toLowerCase().startsWith(RESERVED)) E(`saves.indexedDB 不能使用游戏厅保留的名字：${n}`);
    if (Array.isArray(ls) && Array.isArray(idb) && !ls.length && !idb.length) warn(`games/${id} 没有声明任何存档位置，游戏厅无法导出它的存档`, manifestPath);
    if (s.adapter !== undefined && !(isStr(s.adapter) && /\.m?js$/.test(s.adapter) && isFile(join(dir, s.adapter)))) E(`saves.adapter 指向的文件不存在或不是 .js：${s.adapter}`);
    if (s.inGameExport !== undefined) {
      const x = s.inGameExport;
      if (!x || !Array.isArray(x.match) || !x.match.length || !x.match.every(isStr)) E('saves.inGameExport.match 必须是非空字符串数组');
      if (x && x.hint !== undefined && !isStr(x.hint)) E('saves.inGameExport.hint 必须是字符串');
    }
  }

  if (g.dock !== undefined) {
    warn(`games/${id}/game.json 的 dock 字段已经不用了（游戏厅 v1.2.0 去掉了悬浮标签），可以删掉`);
  }

  if (g.build !== undefined) {
    if (!g.build || !isStr(g.build.command)) E('build.command 必须是字符串');
    if (!g.build || !Array.isArray(g.build.outputs) || !g.build.outputs.length) E('build.outputs 必须列出构建产物（相对游戏目录）');
    else for (const o of g.build.outputs) if (!isFile(join(dir, o))) E(`build.outputs 里的文件不存在：${o}（构建产物要提交）`);
  }
}

// 入口 HTML 里要有 <script src=".../hub/dock.js" data-game="<id>">，路径要真的指向仓库根目录的 hub/dock.js
function checkDock(id, entryFile) {
  const html = readFileSync(entryFile, 'utf8');
  const tags = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /\bsrc\s*=\s*["'][^"']*hub\/dock\.js["']/i.test(t));
  if (!tags.length) {
    err(`games/${id} 的入口页面没有引入游戏厅接入脚本 hub/dock.js`, entryFile);
    return;
  }
  const t = tags[0];
  const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(t)[1];
  const game = (/\bdata-game\s*=\s*["']([^"']*)["']/i.exec(t) || [])[1];
  if (game !== id) err(`games/${id} 入口页面里 dock.js 的 data-game 应该是「${id}」，现在是「${game ?? '（没写）'}」`, entryFile);
  if (/^(https?:)?\/\//.test(src) || src.startsWith('/')) err(`games/${id} 引入 dock.js 要用相对路径（GitHub Pages 的站点在 /AutoGame/ 子路径下）：${src}`, entryFile);
  else if (resolve(dirname(entryFile), src.split(/[?#]/)[0]) !== join(ROOT, 'hub', 'dock.js')) err(`games/${id} 引入 dock.js 的相对路径不对：${src}`, entryFile);
}

// ---------- 游戏之间的存档声明不能重叠（同一个域名下 localStorage / IndexedDB 是共用的） ----------
const overlap = (a, b) => {
  const pa = a.endsWith('*') ? a.slice(0, -1) : null;
  const pb = b.endsWith('*') ? b.slice(0, -1) : null;
  if (pa === null && pb === null) return a === b;
  if (pa !== null && pb !== null) return pa.startsWith(pb) || pb.startsWith(pa);
  return pa !== null ? b.startsWith(pa) : a.startsWith(pb);
};
const list = [...games.entries()];
for (let i = 0; i < list.length; i++)
  for (let j = i + 1; j < list.length; j++) {
    const [ia, ga] = list[i];
    const [ib, gb] = list[j];
    for (const a of ga.saves?.localStorage || []) for (const b of gb.saves?.localStorage || []) if (overlap(a, b)) err(`${ia} 和 ${ib} 声明的 localStorage 键重叠：${a} / ${b}`);
    for (const a of ga.saves?.indexedDB || []) if ((gb.saves?.indexedDB || []).includes(a)) err(`${ia} 和 ${ib} 声明了同一个 IndexedDB 数据库：${a}`);
  }

const gamesDir = join(ROOT, 'games');
if (existsSync(gamesDir))
  for (const d of readdirSync(gamesDir, { withFileTypes: true }))
    if (d.isDirectory() && !ids.includes(d.name)) warn(`games/${d.name} 没有登记在 autogame.json 的 games 里，游戏厅不会显示它`);

// ---------- 分支规则 ----------
if (args.branch !== null) {
  console.log(`分支 ${args.branch}`);
  const m = BRANCH.exec(args.branch);
  if (!m) {
    err(`分支名「${args.branch}」不符合规则：应为 <游戏id>-v<版本号>，例如 pixel-baseball-v2.2.0；修改游戏厅框架用 hub-v<版本号>`);
  } else {
    const [, id, ver] = m;
    const isHub = id === HUB_ID;
    const current = isHub ? site.version : games.get(id)?.version;
    if (!isHub && !games.has(id)) err(`分支对应的游戏「${id}」不在 autogame.json 的 games 里（新游戏要在同一个分支里登记）`);
    else if (current !== ver) err(`分支版本 v${ver} 和${isHub ? ' autogame.json' : ` games/${id}/game.json`} 里的版本 v${current} 不一致`);
    if (args.base) {
      const show = (ref, path) => {
        try {
          return JSON.parse(git(['show', `${ref}:${path}`]));
        } catch {
          return null;
        }
      };
      // 版本号要比基准（main）现在的新
      const baseVer = (isHub ? show(args.base, 'autogame.json') : show(args.base, `games/${id}/game.json`))?.version;
      if (baseVer && SEMVER.test(baseVer) && cmpVer(ver, baseVer) <= 0) err(`版本号没有提升：${args.base} 上是 v${baseVer}，这个分支是 v${ver}`);
      // 改动范围从分叉点算起（main 之后又合并了别的分支也不会误报），包括还没提交的改动
      let mb = '';
      let files = [];
      try {
        mb = git(['merge-base', args.base, 'HEAD']).trim();
        const changed = git(['diff', '--name-only', mb]).split('\n');
        const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n');
        files = [...new Set([...changed, ...untracked].filter(Boolean))];
      } catch (e) {
        err(`无法和 ${args.base} 比较：${e.stderr || e.message}`);
      }
      const allowed = isHub ? (f) => !f.startsWith('games/') : (f) => f.startsWith(`games/${id}/`) || f === 'autogame.json' || f === 'README.md';
      const bad = files.filter((f) => !allowed(f));
      if (bad.length)
        err(
          isHub
            ? `游戏厅分支不能修改游戏目录（每个游戏用自己的 <游戏id>-v<版本号> 分支）：${bad.join('、')}`
            : `游戏分支只能修改 games/${id}/（以及登记用的 autogame.json、README.md），但改了：${bad.join('、')}`,
        );
      if (!isHub && mb && files.includes('autogame.json')) {
        const before = show(mb, 'autogame.json');
        if (before) {
          const strip = (s) => JSON.stringify({ ...s, games: null });
          if (strip(before) !== strip(site)) err('游戏分支只能在 autogame.json 的 games 列表里登记自己，不能改其他字段');
          const changed = [...ids.filter((x) => !before.games.includes(x)), ...before.games.filter((x) => !ids.includes(x))];
          if (changed.some((x) => x !== id)) err(`游戏分支只能在 games 列表里增删「${id}」自己`);
        }
      }
    }
  }
}

// ---------- 构建产物 ----------
if (args.build) {
  for (const [id, g] of games) {
    if (!g.build || !isStr(g.build.command)) continue;
    const dir = join(ROOT, 'games', id);
    console.log(`构建 games/${id}：${g.build.command}`);
    try {
      execSync(g.build.command, { cwd: dir, stdio: 'inherit' });
    } catch {
      err(`games/${id} 构建失败`);
      continue;
    }
    const outs = (g.build.outputs || []).map((o) => rel(join(dir, o)));
    const dirty = git(['status', '--porcelain', '--', ...outs]).trim();
    if (dirty) err(`games/${id} 的构建产物和提交的不一致，请在分支上重新构建并提交：\n${dirty}`);
    else console.log(`  ✓ 构建产物与提交一致`);
  }
}

console.log('');
if (errors.length) {
  console.log(`✗ ${errors.length} 个错误${warnings.length ? `，${warnings.length} 个提醒` : ''}`);
  process.exit(1);
}
console.log(`✓ 检查通过${warnings.length ? `（${warnings.length} 个提醒）` : ''}`);
