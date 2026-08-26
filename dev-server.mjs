// Local dev server: serves the static site and runs the /api/* Vercel
// functions in-process, so the Fourthwall proxy can be exercised locally.
// Not deployed (see .vercelignore). Run: node dev-server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// load .env
for (const line of fs.existsSync(path.join(root, '.env')) ? fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/) : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    const file = path.join(root, 'api', url.pathname.slice(5) + '.js');
    if (!fs.existsSync(file)) { res.writeHead(404).end('no such function'); return; }
    delete require.cache[require.resolve(file)];
    const handler = require(file);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    req.query = Object.fromEntries(url.searchParams);
    req.body = raw;
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    res.send = (s) => { res.end(s); return res; };
    try { await handler(req, res); } catch (e) { res.statusCode = 500; res.end(String(e)); }
    return;
  }

  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(root, decodeURIComponent(p));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(4321, () => console.log('coldwake dev on http://localhost:4321'));
