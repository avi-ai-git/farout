// Local development server for FAROUT.
//
// Why this exists: the production app runs on Vercel serverless functions
// (the files in api/). Those need the Vercel CLI plus a logged-in account to
// run locally. This tiny server runs the SAME api/*.ts handlers directly in
// Node (type stripping), so you can develop with live NASA data using only a
// local .env file and no Vercel login.
//
//   node --experimental-strip-types dev-server.mjs
//
// The NASA key is read from .env server-side and never reaches the browser,
// exactly like production.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const API = join(__dirname, 'api');
const PORT = process.env.PORT || 5051;

// Minimal .env loader so the handlers see process.env.NASA_API_KEY.
try {
  for (const line of readFileSync(join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env, handlers will return 503 */ }

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json',
};

const handlers = {};
async function getHandler(name) {
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  if (!(name in handlers)) {
    const file = join(API, `${name}.ts`);
    handlers[name] = existsSync(file) ? (await import(pathToFileURL(file).href)).default : null;
  }
  return handlers[name];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    const handler = await getHandler(url.pathname.slice(5).replace(/\/+$/, ''));
    if (!handler) { res.statusCode = 404; res.end('Unknown API route'); return; }
    req.query = Object.fromEntries(url.searchParams);
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    res.send = (b) => { res.end(b); return res; };
    try { await handler(req, res); }
    catch (e) { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); } }
    return;
  }

  const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC, rel);
  if (!filePath.startsWith(PUBLIC)) { res.statusCode = 403; res.end('Forbidden'); return; }
  try {
    const data = await readFile(filePath);
    res.setHeader('content-type', TYPES[extname(filePath)] || 'application/octet-stream');
    res.end(data);
  } catch { res.statusCode = 404; res.end('Not found'); }
});

server.listen(PORT, () => console.log(`FAROUT dev server running: http://localhost:${PORT}`));
