'use strict';
/* Shared API logic, used by BOTH:
 *   - server.js            (long-running Node, file storage, SSE push)
 *   - api/[...all].js      (Vercel serverless function, Redis storage, polling clients)
 * The two only differ in storage + whether live pushes are available. */
const { makeUser, verifyPassword, signSession, verifySession } = require('./auth');

const MAX_BODY = 5 * 1024 * 1024;

function readBody(req){
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY){ reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, code, obj){
  const body = JSON.stringify(obj);
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

/* create the very first admin account (idempotent, safe to call on every boot) */
async function bootstrapAdmin(storage, username, password){
  const doc = await storage.getUsers();
  if (!doc.users.some(u => u.username === String(username).toLowerCase())){
    doc.users.push(makeUser(username, password, 'Head Admin'));
    await storage.putUsers(doc);
    return true;
  }
  return false;
}

function authFromReq(req){
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return null;
  return verifySession(m[1]);
}

async function handleApi(storage, req, res, opts){
  const streams = !(opts && opts.streams === false);
  const broadcast = opts && opts.broadcast;
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (pathname === '/api/state' && req.method === 'GET'){
    const db = await storage.getDB();
    const s = authFromReq(req);
    send(res, 200, {
      state: db.state,
      activity: db.activity || [],
      me: s ? { name: s.display, username: s.username } : null,
      streams // false on serverless hosts → the browser polls instead of SSE
    });
    return;
  }

  if (pathname === '/api/events' && req.method === 'GET'){
    // server.js intercepts this route and streams SSE. Everywhere else (Vercel)
    // the client polls /api/state — so just say so clearly.
    send(res, 200, { streams, error: streams ? 'SSE is served by the long-running server.' : 'Streaming is not available here — the app polls /api/state instead.' });
    return;
  }

  if (pathname === '/api/login' && req.method === 'POST'){
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e){ return send(res, 400, { error: 'Bad request.' }); }
    const doc = await storage.getUsers();
    const user = doc.users.find(x => x.username === String(body.username || '').toLowerCase());
    if (!user || !verifyPassword(user, String(body.password || ''))) return send(res, 401, { error: 'Wrong username or password.' });
    return send(res, 200, { token: signSession({ username: user.username, display: user.display }), name: user.display });
  }

  if (pathname === '/api/logout' && req.method === 'POST'){
    return send(res, 200, { ok: true }); // stateless tokens — the client discards it
  }

  if (pathname === '/api/save' && req.method === 'POST'){
    const s = authFromReq(req);
    if (!s) return send(res, 401, { error: 'Not logged in.' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e){ return send(res, 400, { error: 'Bad request.' }); }
    if (!body.state || typeof body.state !== 'object') return send(res, 400, { error: 'Missing state.' });
    const db = await storage.getDB();
    db.state = body.state;
    db.activity = db.activity || [];
    db.activity.unshift({ ts: Date.now(), user: s.display, username: s.username, message: String(body.message || '') });
    db.activity = db.activity.slice(0, 100);
    await storage.putDB(db);
    if (broadcast) broadcast();
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/users' && req.method === 'POST'){
    const s = authFromReq(req);
    if (!s) return send(res, 401, { error: 'Not logged in.' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e){ return send(res, 400, { error: 'Bad request.' }); }
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (username.length < 3) return send(res, 400, { error: 'Username must be at least 3 characters.' });
    if (password.length < 4) return send(res, 400, { error: 'Password must be at least 4 characters.' });
    const doc = await storage.getUsers();
    if (doc.users.some(x => x.username === username)) return send(res, 409, { error: 'That username already exists.' });
    doc.users.push(makeUser(username, password, String(body.display || '')));
    await storage.putUsers(doc);
    if (broadcast) broadcast();
    return send(res, 200, { ok: true, username });
  }

  send(res, 404, { error: 'Unknown endpoint.' });
}

module.exports = { handleApi, bootstrapAdmin, readBody, send };