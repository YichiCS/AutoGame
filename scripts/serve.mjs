#!/usr/bin/env node
// 本地预览：node scripts/serve.mjs [端口]
// 和 GitHub Pages 一样把仓库挂在 /AutoGame/ 子路径下，这样用了绝对路径的地方在本地就会暴露出来。
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, extname, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const BASE = '/AutoGame/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith(BASE)) {
    res.writeHead(302, { Location: BASE });
    return res.end();
  }
  let file = resolve(join(ROOT, path.slice(BASE.length)));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    let st = statSync(file);
    if (st.isDirectory()) {
      if (!path.endsWith('/')) {
        res.writeHead(301, { Location: `${path}/` });
        return res.end();
      }
      file = join(file, 'index.html');
      st = statSync(file);
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}).listen(PORT, () => console.log(`AutoGame 本地预览：http://localhost:${PORT}${BASE}  （Ctrl+C 结束）`));
