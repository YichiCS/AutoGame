// 构建脚本：
//   node scripts/build.mjs          → 生成单文件 dist/index.html（双击即可游玩）
//   node scripts/build.mjs --serve  → 开发服务器 http://localhost:5173 （保存自动刷新）
// 若依赖装在别处，可通过环境变量 PB_TOOLING 指向含 node_modules 的目录。
// 页面末尾引入 AutoGame 游戏厅的悬浮标签（../../../hub/dock.js，相对 dist/index.html）；双击打开本地文件时它不显示。
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tooling = process.env.PB_TOOLING;

async function loadEsbuild() {
  try {
    return await import('esbuild');
  } catch (e) {
    if (tooling) return await import(pathToFileURL(join(tooling, 'node_modules/esbuild/lib/main.js')).href);
    throw e;
  }
}

const esbuild = await loadEsbuild();
const serve = process.argv.includes('--serve');

const common = {
  entryPoints: [join(root, 'src/main.tsx')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.woff2': 'dataurl', '.png': 'dataurl' },
  nodePaths: tooling ? [join(tooling, 'node_modules')] : [],
  logLevel: 'info',
  charset: 'utf8',
};

const page = (head, body) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1a1c2c">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="像素甲子园">
<title>像素甲子园：监督之路</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'%3E%3Crect x='2' y='1' width='4' height='6' fill='%23f4f4f4'/%3E%3Crect x='1' y='2' width='6' height='4' fill='%23f4f4f4'/%3E%3Crect x='2' y='2' width='1' height='1' fill='%23e43b44'/%3E%3Crect x='5' y='5' width='1' height='1' fill='%23e43b44'/%3E%3Crect x='2' y='5' width='1' height='1' fill='%23e43b44'/%3E%3Crect x='5' y='2' width='1' height='1' fill='%23e43b44'/%3E%3C/svg%3E">
${head}
</head>
<body>
<div id="app"></div>
${body}
<script src="../../../hub/dock.js" data-game="pixel-baseball" defer></script>
</body>
</html>
`;

if (serve) {
  const devDir = join(root, 'dev');
  mkdirSync(devDir, { recursive: true });
  writeFileSync(join(devDir, 'index.html'), page('<link rel="stylesheet" href="main.css">',
    `<script>new EventSource('/esbuild').addEventListener('change', () => location.reload());</script>\n<script src="main.js"></script>`));
  const ctx = await esbuild.context({ ...common, outdir: devDir, sourcemap: true, define: { 'process.env.NODE_ENV': '"development"' } });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: devDir, port: 5173 });
  console.log(`开发服务器: http://localhost:${port}/`);
} else {
  const result = await esbuild.build({
    ...common,
    write: false,
    minify: true,
    outdir: join(root, '.tmp'),
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  let js = '';
  let css = '';
  for (const f of result.outputFiles) {
    if (f.path.endsWith('.js')) js = f.text;
    else if (f.path.endsWith('.css')) css = f.text;
  }
  js = js.replace(/<\/script/gi, '<\\/script');
  css = css.replace(/<\/style/gi, '<\\/style');
  mkdirSync(join(root, 'dist'), { recursive: true });
  const html = page(`<style>${css}</style>`, `<script>${js}</script>`);
  writeFileSync(join(root, 'dist/index.html'), html);
  console.log(`dist/index.html  ${(html.length / 1024).toFixed(0)} KB`);
}
