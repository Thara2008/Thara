'use strict';
/* API test suite for the multi-user backend (lib/handler.js + storage adapters).
 * Starts the file-backed server on a random port with a temp DATA_DIR and exercises:
 *   static serving, public read, login/logout, auth-gated save,
 *   activity logging, admin-created accounts, duplicate usernames,
 *   invalid tokens, SSE live broadcasts, and stateless signed sessions.
 * Run: node api-test.js   (also part of `npm test`) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { signSession, verifySession, secret } = require('./lib/auth');
const { redisStorage } = require('./lib/storage');

// Configure via env BEFORE requiring server.js so its start-time config picks this up.
const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fcm-api-'));
process.env.DATA_DIR = TMPDIR;
process.env.ADMIN_USER = 'head';
process.env.ADMIN_PASSWORD = 'secret42';

const { startServer } = require('./server.js');

function readWithTimeout(reader, ms){
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('SSE read timed out')), ms);
    reader.read().then(v => { clearTimeout(to); resolve(v); }, e => { clearTimeout(to); reject(e); });
  });
}

(async () => {
  const server = await startServer(0);
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  let fails = 0;
  const T = (name, cond, extra) => {
    if (cond){ console.log('  ✅ ' + name); }
    else { console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); fails++; }
  };

  const post = (p, body, token) =>
    fetch(base + p, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify(body)
    });
  const get = (p, token) =>
    fetch(base + p, token ? { headers: { Authorization: 'Bearer ' + token } } : undefined);

  try {
    // ---- static ----
    let r = await fetch(base);
    let html = await r.text();
    T('serves index.html', r.status === 200 && html.includes('FC Mobile League Manager'));
    r = await fetch(base + 'server.js');
    T('source files are not exposed', r.status === 404);
    r = await fetch(base + 'data/db.json');
    T('data dir is not exposed', r.status === 404);

    // ---- public state read ----
    r = await get('api/state');
    let d = await r.json();
    T('public state read (no auth)', r.status === 200 && Array.isArray(d.state.tournaments));
    T('empty activity on a fresh server', Array.isArray(d.activity) && d.activity.length === 0);
    T('no me when anonymous', d.me === null);
    T('file server advertises live streams (SSE)', d.streams === true);

    // ---- login ----
    r = await post('api/login', { username: 'head', password: 'wrong' });
    T('wrong password rejected', r.status === 401);
    r = await post('api/login', { username: 'HEAD', password: 'secret42' });
    T('login is case-insensitive on username', r.status === 200);
    const login = await r.json();
    const tok = login.token;
    T('login returns a token + display name', !!tok && login.name === 'Head Admin');

    // ---- auth-gated save ----
    r = await post('api/save', { state: { tournaments: [] }, message: 'no token' });
    T('save without token -> 401', r.status === 401);

    const st = { tournaments: [{ id: 't1', name: 'API Test', createdAt: Date.now(), groups: [{ id: 'g1', name: 'Group A', teams: [{ id: 'x', name: 'Xero', note: '' }] }], matches: [], knockouts: null }] };
    r = await post('api/save', { state: st, message: 'Recorded a test' }, tok);
    T('authorized save -> 200', r.status === 200);

    r = await get('api/state');
    d = await r.json();
    T('state persisted', d.state.tournaments.length === 1 && d.state.tournaments[0].name === 'API Test');
    T('change logged with actor + message',
      d.activity.length === 1 && d.activity[0].message === 'Recorded a test' && d.activity[0].user === 'Head Admin');

    // ---- me via token ----
    r = await get('api/state', tok);
    d = await r.json();
    T('GET /api/state includes me for a valid token', d.me && d.me.name === 'Head Admin');

    // ---- stateless signed sessions ----
    const stok = signSession({ username: 'head', display: 'Head Admin' });
    const vtok = verifySession(stok);
    T('signed token verifies with username + display', vtok && vtok.username === 'head' && vtok.display === 'Head Admin');
    T('tampered token rejected', verifySession(stok + 'x') === null);
    const expPayload = Buffer.from(JSON.stringify({ v: 1, u: 'x', n: 'X', e: Date.now() - 1000 })).toString('base64url');
    const expSig = crypto.createHmac('sha256', secret()).update(expPayload).digest('base64url');
    T('expired token rejected', verifySession(expPayload + '.' + expSig) === null);

    // ---- admins create admins ----
    r = await post('api/users', { username: 'sam', password: 'pass123', display: 'Sammy' }, tok);
    T('admin creates another admin', r.status === 200);
    r = await post('api/users', { username: 'sam', password: 'pass123', display: 'Sammy' }, tok);
    T('duplicate username -> 409', r.status === 409);
    r = await post('api/users', { username: 'ab', password: 'pass123' }, tok);
    T('short username rejected', r.status === 400);
    r = await post('api/users', { username: 'sam2', password: '123' }, tok);
    T('short password rejected', r.status === 400);
    r = await post('api/users', { username: 'sam3', password: 'pass123' });
    T('non-admin cannot create users', r.status === 401); // anonymous

    const login2 = await (await post('api/login', { username: 'sam', password: 'pass123' })).json();
    T('new admin can log in', !!login2.token);
    r = await post('api/save', { state: st, message: 'Edited by Sam' }, login2.token);
    T('new admin can edit', r.status === 200);
    r = await get('api/state');
    d = await r.json();
    T('feed shows both actors', d.activity.length === 2 && d.activity[0].user === 'Sammy');

    // ---- invalid token ----
    r = await post('api/save', { state: st, message: 'x' }, 'deadbeef');
    T('invalid token rejected -> 401', r.status === 401);

    // ---- logout (stateless sessions → client discards the token) ----
    r = await post('api/logout', {}, tok);
    T('logout works', r.status === 200);
    T('token stays self-verifiable by design (revoked client-side only)', verifySession(tok) !== null);

    // ---- SSE live broadcast ----
    const ac = new AbortController();
    const esRes = await fetch(base + 'api/events', { headers: { Accept: 'text/event-stream' }, signal: ac.signal });
    const reader = esRes.body.getReader();
    const tok2 = (await (await post('api/login', { username: 'head', password: 'secret42' })).json()).token;
    await post('api/save', { state: st, message: 'SSE poke' }, tok2);
    let buf = '';
    for (let i = 0; i < 10 && !buf.includes('update'); i++){
      const { value } = await readWithTimeout(reader, 5000);
      buf += value ? new TextDecoder().decode(value) : '';
    }
    T('SSE broadcasts an update event', buf.includes('update'), buf.slice(0, 80));
    try { await reader.cancel(); } catch (e){}
    ac.abort();

    // ---- persistence across reads ----
    r = await get('api/state');
    d = await r.json();
    T('feed persisted (latest entry first)', d.activity[0].message === 'SSE poke' && d.activity.length === 3);

    // ---- unknown endpoint ----
    r = await get('api/nope');
    T('unknown api endpoint -> 404', r.status === 404);

    // ---- redis storage adapter (against a mock Upstash REST server) ----
    const mockStore = {};
    const mock = http.createServer((mreq, mres) => {
      const parts = mreq.url.split('/').filter(Boolean);
      const cmd = parts[0];
      mres.setHeader('Content-Type', 'application/json');
      if (cmd === 'get'){ const k = decodeURIComponent(parts[1] || ''); mres.end(JSON.stringify({ result: k in mockStore ? mockStore[k] : null })); }
      else if (cmd === 'set'){ const k = decodeURIComponent(parts[1] || ''); const v = decodeURIComponent(parts[2] || ''); mockStore[k] = v; mres.end(JSON.stringify({ result: 'OK' })); }
      else { mres.statusCode = 404; mres.end('{}'); }
    });
    await new Promise(res => mock.listen(0, res));
    const rstore = redisStorage('http://127.0.0.1:' + mock.address().port + '/', 'test-token', 'fcmt:');
    let rd = await rstore.getDB();
    T('redis storage starts empty', Array.isArray(rd.state.tournaments) && rd.state.tournaments.length === 0);
    rd.state.tournaments.push({ id: 'r1', name: 'Redis Cup', createdAt: 1, groups: [], matches: [], knockouts: null });
    await rstore.putDB(rd);
    rd = await rstore.getDB();
    T('redis storage round-trips tournaments', rd.state.tournaments.length === 1 && rd.state.tournaments[0].name === 'Redis Cup');
    await rstore.putUsers({ users: [{ username: 'alex', display: 'Alex' }] });
    rd = await rstore.getUsers();
    T('redis storage round-trips users', rd.users.length === 1 && rd.users[0].username === 'alex');
    mock.close();

    console.log('\n' + (fails === 0 ? '🎉 API TESTS PASSED' : '⚠️  ' + fails + ' API TEST(S) FAILED'));
  } catch (err){
    console.error('API TEST ERROR:', err && err.message ? err.message : err);
    fails++;
  } finally {
    server.close();
    try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch (e){}
  }
  process.exit(fails === 0 ? 0 : 1);
})();