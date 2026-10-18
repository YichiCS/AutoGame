// 用 esbuild 打包并运行一个 TypeScript 脚本（用于无界面的平衡性测试）
//   node scripts/run-ts.mjs tests/balance.ts [args...]
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tooling = process.env.PB_TOOLING;
let esbuild;
try {
  esbuild = await import('esbuild');
} catch (e) {
  if (!tooling) throw e;
  esbuild = await import(pathToFileURL(join(tooling, 'node_modules/esbuild/lib/main.js')).href);
}

const entry = process.argv[2];
if (!entry) {
  console.error('用法: node scripts/run-ts.mjs <file.ts>');
  process.exit(1);
}
const outDir = join(root, '.tmp');
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, basename(entry).replace(/\.tsx?$/, '') + '.mjs');
await esbuild.build({
  entryPoints: [join(root, entry)],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  nodePaths: tooling ? [join(tooling, 'node_modules')] : [],
  logLevel: 'warning',
});
process.argv.splice(2, 1);
await import(pathToFileURL(outfile).href);
