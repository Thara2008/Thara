'use strict';
/* ============================================================
 * FC Mobile League Manager — long-running server (zero deps)
 * ------------------------------------------------------------
 * For local dev, Render / Railway / Fly.io / a VPS.
 * Serves the app, the shared API (lib/handler.js), file-backed
 * persistence, and instant live updates via Server-Sent Events.
 *
 * For Vercel use api/[...all].js instead (serverless + Redis).
 *
 * Env vars:
 *   PORT            port (default 8123)
 *   DATA_DIR        folder for db.json + users.json (default ./data)
 *   ADMIN_USER      first admin username  (default admin)
 *   ADMIN_PASSWORD  first admin password  (default qwert — change in prod!)
 *   SECRET          random string for signed admin sessions
 *   OPEN_BROWSER    0 = do not auto-open a browser
 *
 * Start:  npm start   (or: node server.js)
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { fileStorage } = require('./lib/storage');
const { handleApi, bootstrapAdmin } = require('./lib/handler');

const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function envStr(k, d){ const v = process.env[k]; return v === undefined || v === '' ? d : v; }
function envInt(k, d){ const v = parseInt(process.env[k], 10); return isNaN(v) ? d : v; }

let DATA_DIR, BOOTSTRAP_USER, BOOTSTRAP_PASS;
function setConfig(){
  DATA_DIR = path.resolve(envStr('DATA_DIR', path.join(ROOT, 'data')));
  BOOTSTRAP_USER = envStr('ADMIN_USER', 'admin');
  BOOTSTRAP_PASS = envStr('ADMIN_PASSWORD', 'qwert');
}
setConfig(); // CLI default; startServer() re-reads so tests/hosts can configure via env

/* ---------------- SSE (instant live updates) ---------------- */
const sseClients = new Set();
function broadcastUpdate(){
  for (const res of sseClients){
    try { res.write('data: update\n\n'); } catch (e){ /* client gone */ }
  }
}
const heartbeat = setInterval(() => {
  for (const res of sseClients){
    try { res.write(': ping\n\n'); } catch (e){ /* client gone */ }
  }
}, 25000);
heartbeat.unref();

/* ---------------- static files ---------------- */
function serveStatic(req, res, pathname){
  let filePath = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT){
    res.writeHead(403); res.end('Forbidden'); return;
  }
  // never expose private files / the data dir
  const rel = path.relative(ROOT, filePath);
  const base = rel.split(path.sep)[0];
  if (base === 'data' || base === 'server.js' || base === 'api-test.js' || base === 'test.js' || base === 'render-smoke.js' || base === 'sync-test.js' || base === 'package.json' || base === 'README.md' || rel.startsWith('.')){
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch (e){
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err){ res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || ext === '.js' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

/* ---------------- server ---------------- */
function createServer(storage){
  return http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/events' && req.method === 'GET'){
      // long-running host → real-time push for viewers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }
    if (pathname.startsWith('/api/')){
      handleApi(storage, req, res, { streams: true, broadcast: broadcastUpdate }).catch(() => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Server error.' }));
      });
      return;
    }
    serveStatic(req, res, pathname === '/' ? '/' : pathname);
  });
}

async function startServer(port, opts){
  const { openBrowser = false } = opts || {};
  setConfig(); // pick up env vars (hosts/tests may set them after require)
  const storage = fileStorage(DATA_DIR);
  await bootstrapAdmin(storage, BOOTSTRAP_USER, BOOTSTRAP_PASS);
  const server = createServer(storage);
  return new Promise(resolve => {
    server.listen(port, () => {
      const real = server.address().port;
      if (openBrowser){
        const url = 'http://localhost:' + real + '/';
        console.log('⚽ FC Mobile League Manager');
        console.log('   ➜  ' + url);
        console.log('   ➜  Data: ' + DATA_DIR);
        const { exec } = require('child_process');
        const cmd = process.platform === 'win32' ? 'start "" ' : (process.platform === 'darwin' ? 'open ' : 'xdg-open ');
        if (envInt('OPEN_BROWSER', 1) !== 0) exec(cmd + '"' + url + '"');
        console.log('   Press Ctrl+C to stop.');
      }
      resolve(server);
    });
  });
}

if (require.main === module){
  startServer(envInt('PORT', 8123), { openBrowser: true });
}

module.exports = { startServer, createServer };