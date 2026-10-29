'use strict';
/* Shared API logic, used by BOTH:
 *   - server.js            (long-running Node, file storage, SSE push)
 *   - api/[...all].js      (Vercel serverless function, Redis storage, polling clients)
 * The two only differ in storage + whether live pushes are available. */
const {
  HEAD_ADMIN, normalizeUsername, makeUser, makeHeadUser, setPassword,
  verifyPassword, publicUser, signSession, verifySession
} = require('./auth');

const MAX_BODY = 5 * 1024 * 1024;
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 5 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

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

/* Create the head admin account (idempotent, safe to call on every boot).
 * With no env override the built-in salted hash is seeded. ADMIN_USER /
 * ADMIN_PASSWORD may override it on a fresh deploy (the password is runtime
 * configuration, never stored in this repository). */
async function bootstrapAdmin(storage, username, password){
  const doc = await storage.getUsers();
  if (!Array.isArray(doc.users)) doc.users = [];
  if (!doc.loginLocks || typeof doc.loginLocks !== 'object') doc.loginLocks = {};
  let changed = false;

  doc.users.forEach(u => {
    if (!u || typeof u !== 'object') return;
    const un = normalizeUsername(u.username);
    if (u.username !== un){ u.username = un; changed = true; }
    if (u.role !== 'head' && u.role !== 'admin'){ u.role = 'admin'; changed = true; }
    if (!u.sessionVersion){ u.sessionVersion = 1; changed = true; }
    if (!u.algo){ u.algo = 'scrypt'; changed = true; }
  });

  const hasHead = doc.users.some(u => u.role === 'head');
  if (!hasHead){
    const overrideName = normalizeUsername(username);
    if (overrideName && password){
      const existing = doc.users.find(u => u.username === overrideName);
      if (existing){
        existing.role = 'head';
        existing.display = existing.display || 'Head Admin';
        existing.sessionVersion = 1;
      } else {
        doc.users.push(makeUser(username, password, 'Head Admin', 'head'));
      }
    } else {
      const existing = doc.users.find(u => u.username === normalizeUsername(HEAD_ADMIN.username));
      if (existing){
        existing.role = 'head';
        existing.display = existing.display || HEAD_ADMIN.display;
        existing.sessionVersion = 1;
      } else {
        doc.users.push(makeHeadUser());
      }
    }
    changed = true;
  }

  if (changed) await storage.putUsers(doc);
  return changed;
}

async function authFromReq(storage, req){
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return null;
  const s = verifySession(m[1]);
  if (!s) return null;
  const doc = await storage.getUsers();
  const user = (doc.users || []).find(u => normalizeUsername(u.username) === s.username);
  if (!user) return null;
  if ((Number(user.sessionVersion) || 1) !== (Number(s.sessionVersion) || 1)) return null;
  return {
    username: normalizeUsername(user.username),
    display: user.display || user.username,
    role: user.role === 'head' ? 'head' : 'admin',
    user: user,
    doc: doc
  };
}

function loginClientKey(req, username){
  const forwarded = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  const ip = forwarded || (req.socket && req.socket.remoteAddress) || 'unknown';
  return normalizeUsername(username) + '|' + ip;
}

async function logActivity(storage, s, message){
  const db = await storage.getDB();
  db.activity = Array.isArray(db.activity) ? db.activity : [];
  db.activity.unshift({
    ts: Date.now(),
    user: s.display || s.name || s.username,
    username: normalizeUsername(s.username),
    message: String(message || '').slice(0, 300)
  });
  db.activity = db.activity.slice(0, 100);
  await storage.putDB(db);
}

async function handleApi(storage, req, res, opts){
  const streams = !(opts && opts.streams === false);
  const broadcast = opts && opts.broadcast;
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (pathname === '/api/state' && req.method === 'GET'){
    const db = await storage.getDB();
    const s = await authFromReq(storage, req);
    send(res, 200, {
      state: db.state,
      activity: db.activity || [],
      me: s ? { name: s.display, display: s.display, username: s.username, role: s.role } : null,
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
    const supplied = String(body.username || '');
    const password = String(body.password || '');
    const key = loginClientKey(req, supplied);
    const doc = await storage.getUsers();
    if (!Array.isArray(doc.users)) doc.users = [];
    if (!doc.loginLocks || typeof doc.loginLocks !== 'object') doc.loginLocks = {};
    const now = Date.now();
    const lock = doc.loginLocks[key];
    if (lock && Number(lock.until) > now){
      return send(res, 429, { error: 'Too many failed attempts. Try again in 5 minutes.' });
    }
    const user = doc.users.find(x => normalizeUsername(x.username) === normalizeUsername(supplied));
    const ok = !!user && verifyPassword(user, password);
    if (!ok){
      const fresh = !lock || !lock.last || now - Number(lock.last) > LOGIN_WINDOW_MS;
      const count = fresh ? 1 : (Number(lock.count) || 0) + 1;
      const locked = count >= LOGIN_MAX_FAILS;
      doc.loginLocks[key] = { count: count, last: now, until: locked ? now + LOGIN_LOCK_MS : 0 };
      await storage.putUsers(doc);
      return send(res, locked ? 429 : 401, {
        error: locked ? 'Too many failed attempts. Try again in 5 minutes.' : 'Wrong username or password.'
      });
    }
    delete doc.loginLocks[key];
    user.lastLoginAt = now;
    user.sessionVersion = Number(user.sessionVersion) || 1;
    await storage.putUsers(doc);
    await logActivity(storage, { username: user.username, display: user.display, role: user.role }, 'Logged in');
    return send(res, 200, {
      token: signSession(user),
      name: user.display || user.username,
      username: normalizeUsername(user.username),
      role: user.role === 'head' ? 'head' : 'admin'
    });
  }

  if (pathname === '/api/logout' && req.method === 'POST'){
    const s = await authFromReq(storage, req);
    if (s) await logActivity(storage, s, 'Logged out');
    return send(res, 200, { ok: true }); // stateless tokens — the client discards it
  }

  if (pathname === '/api/save' && req.method === 'POST'){
    const s = await authFromReq(storage, req);
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

  if (pathname === '/api/users' && req.method === 'GET'){
    const s = await authFromReq(storage, req);
    if (!s) return send(res, 401, { error: 'Not logged in.' });
    if (s.role !== 'head') return send(res, 403, { error: 'Only the head admin can manage admin accounts.' });
    const doc = await storage.getUsers();
    return send(res, 200, { users: (doc.users || []).map(publicUser) });
  }

  if (pathname === '/api/users' && req.method === 'POST'){
    const s = await authFromReq(storage, req);
    if (!s) return send(res, 401, { error: 'Not logged in.' });
    if (s.role !== 'head') return send(res, 403, { error: 'Only the head admin can manage admin accounts.' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e){ return send(res, 400, { error: 'Bad request.' }); }
    const username = String(body.username == null ? '' : body.username).trim().replace(/\s+/g, ' ');
    const normalized = normalizeUsername(username);
    const password = String(body.password || '');
    const display = String(body.display || '').trim();
    if (normalized.length < 3) return send(res, 400, { error: 'Username must be at least 3 characters.' });
    if (normalized.length > 60) return send(res, 400, { error: 'Username must be 60 characters or fewer.' });
    if (password.length < 4) return send(res, 400, { error: 'Password must be at least 4 characters.' });
    const doc = await storage.getUsers();
    if (!Array.isArray(doc.users)) doc.users = [];
    if (doc.users.some(x => normalizeUsername(x.username) === normalized)) return send(res, 409, { error: 'That username already exists.' });
    const user = makeUser(username, password, display || username, 'admin');
    doc.users.push(user);
    await storage.putUsers(doc);
    await logActivity(storage, s, 'Added admin "' + (display || username) + '"');
    if (broadcast) broadcast();
    return send(res, 200, { ok: true, username: user.username, display: user.display });
  }

  if (pathname === '/api/users/delete' && req.method === 'POST'){
    const s = await authFromReq(storage, req);
    if (!s) return send(res, 401, { error: 'Not logged in.' });
    if (s.role !== 'head') return send(res, 403, { error: 'Only the head admin can manage admin accounts.' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e){ return send(res, 400, { error: 'Bad request.' }); }
    const target = normalizeUsername(body.username);
    const doc = await storage.getUsers();
    const user = (doc.users || []).find(u => normalizeUsername(u.username) === target);
    if (!user) return send(res, 404, { error: 'That admin could not be found.' });
    if (user.role === 'head') return send(res, 403, { error: 'The head admin account cannot be removed.' });
    doc.users = doc.users.filter(u => u !== user);
    await storage.putUsers(doc);
    await logActivity(storage, s, 'Removed admin "' + (user.display || user.username) + '"');
    if (broadcast) broadcast();
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/users/reset' && req.method === 'POST'){
    const s = await authFromReq(storage, req);
    if (!s) return send(res, 401, { error: 'Not logged in.' });
    if (s.role !== 'head') return send(res, 403, { error: 'Only the head admin can manage admin accounts.' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e){ return send(res, 400, { error: 'Bad request.' }); }
    const target = normalizeUsername(body.username);
    const password = String(body.password || '');
    if (password.length < 4) return send(res, 400, { error: 'Password must be at least 4 characters.' });
    const doc = await storage.getUsers();
    const user = (doc.users || []).find(u => normalizeUsername(u.username) === target);
    if (!user) return send(res, 404, { error: 'That admin could not be found.' });
    if (user.role === 'head') return send(res, 403, { error: 'Use the head admin settings to change this password.' });
    setPassword(user, password);
    await storage.putUsers(doc);
    await logActivity(storage, s, 'Reset the password for admin "' + (user.display || user.username) + '"');
    if (broadcast) broadcast();
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/account/password' && req.method === 'POST'){
    const s = await authFromReq(storage, req);
    if (!s) return send(res, 401, { error: 'Not logged in.' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e){ return send(res, 400, { error: 'Bad request.' }); }
    const current = String(body.currentPassword || '');
    const next = String(body.newPassword || '');
    if (!verifyPassword(s.user, current)) return send(res, 401, { error: 'Your current password is incorrect.' });
    if (next.length < 8) return send(res, 400, { error: 'The new password must be at least 8 characters.' });
    const doc = await storage.getUsers();
    const stored = (doc.users || []).find(u => normalizeUsername(u.username) === s.username);
    if (!stored) return send(res, 401, { error: 'Not logged in.' });
    setPassword(stored, next);
    await storage.putUsers(doc);
    await logActivity(storage, s, 'Changed their password');
    return send(res, 200, {
      ok: true,
      token: signSession(stored),
      name: stored.display || stored.username,
      username: normalizeUsername(stored.username),
      role: stored.role === 'head' ? 'head' : 'admin'
    });
  }

  if (pathname === '/api/fan' && req.method === 'POST'){
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e){ return send(res, 400, { error: 'Bad request.' }); }
    const device = String(body.device || '').trim().slice(0, 80);
    const action = String(body.action || '');
    if (device.length < 5) return send(res, 400, { error: 'This device could not be identified. Refresh the page and try again.' });
    const db = await storage.getDB();
    if (!db.state || typeof db.state !== 'object') db.state = { tournaments: [] };
    if (!db.state.site || typeof db.state.site !== 'object' || Array.isArray(db.state.site)) db.state.site = {};
    const site = db.state.site;

    const fail = (msg, code) => send(res, code || 400, { error: msg });
    const findMatch = key => {
      const parts = String(key || '').split(':');
      if (parts.length < 3) return null;
      const tid = parts[0], kind = parts[1], mid = parts.slice(2).join(':');
      const t = (db.state.tournaments || []).find(x => x.id === tid);
      if (!t) return null;
      if (kind === 'g'){
        const m = (t.matches || []).find(x => x.id === mid);
        if (!m) return null;
        return { t: t, m: m, kind: 'g', homeId: m.homeId, awayId: m.awayId, hs: m.homeGoals, as: m.awayGoals };
      }
      const rounds = t.knockouts && t.knockouts.rounds;
      if (!Array.isArray(rounds)) return null;
      for (let i = 0; i < rounds.length; i++){
        const m = (rounds[i] || []).find(x => x.id === mid);
        if (m) return { t: t, m: m, kind: 'k', homeId: m.homeId, awayId: m.awayId, hs: m.homeScore, as: m.awayScore };
      }
      return null;
    };
    const saveAndOk = async () => {
      await storage.putDB(db);
      if (broadcast) broadcast();
      return send(res, 200, { ok: true });
    };

    if (action === 'poll-vote'){
      const pollId = String(body.pollId || '').slice(0, 80);
      const optionId = String(body.optionId || '').slice(0, 80);
      if (!Array.isArray(site.polls)) site.polls = [];
      const poll = site.polls.find(p => p.id === pollId);
      if (!poll) return fail('That poll could not be found. Refresh the page.', 404);
      if (!poll.open) return fail('This poll is closed.');
      if (!Array.isArray(poll.options) || !poll.options.some(o => o.id === optionId)) return fail('Choose a valid poll option and try again.');
      if (!Array.isArray(poll.votes)) poll.votes = [];
      if (poll.votes.some(v => v.device === device)) return fail('You have already voted in this poll — one vote per device.', 409);
      poll.votes.push({ device: device, optionId: optionId, at: Date.now() });
      return saveAndOk();
    }

    if (action === 'predict'){
      const key = String(body.matchKey || '').slice(0, 200);
      const name = String(body.name || '').trim().slice(0, 40);
      const home = Number(body.home), away = Number(body.away);
      if (name.length < 2) return fail('Add a display name between 2 and 40 characters.');
      if (!Number.isInteger(home) || home < 0 || home > 99 || !Number.isInteger(away) || away < 0 || away > 99) return fail('Enter a whole-number score from 0 to 99 for both teams.');
      const meta = findMatch(key);
      if (!meta) return fail('That match could not be found. Refresh the page.', 404);
      if (!meta.homeId || !meta.awayId) return fail('That match does not have both teams yet.');
      if (meta.hs != null && meta.as != null) return fail('This match has already been played — predictions are closed.');
      const kick = Date.parse(meta.m.kickoff || '');
      if (Number.isFinite(kick) && Date.now() >= kick) return fail('Predictions are locked at kickoff.');
      if (!site.predictions || typeof site.predictions !== 'object' || Array.isArray(site.predictions)) site.predictions = {};
      const box = site.predictions[key] && typeof site.predictions[key] === 'object' ? site.predictions[key] : { entries: [] };
      if (!Array.isArray(box.entries)) box.entries = [];
      const existing = box.entries.find(e => e.device === device);
      if (existing){ existing.name = name; existing.home = home; existing.away = away; existing.at = Date.now(); }
      else box.entries.push({ device: device, name: name, home: home, away: away, at: Date.now() });
      site.predictions[key] = box;
      return saveAndOk();
    }

    if (action === 'motm-vote'){
      const key = String(body.matchKey || '').slice(0, 200);
      const playerId = String(body.playerId || '').slice(0, 80);
      const meta = findMatch(key);
      if (!meta) return fail('That match could not be found. Refresh the page.', 404);
      if (meta.hs == null || meta.as == null) return fail('Voting opens after the match finishes.');
      if (!Array.isArray(site.players)) site.players = [];
      const player = site.players.find(p => p.id === playerId);
      if (!player || (player.teamId !== meta.homeId && player.teamId !== meta.awayId)) return fail('Pick a player from one of the two teams.');
      if (!site.motm || typeof site.motm !== 'object' || Array.isArray(site.motm)) site.motm = {};
      const box = site.motm[key] && typeof site.motm[key] === 'object' ? site.motm[key] : { open: true, votes: [], winner: '' };
      if (!Array.isArray(box.votes)) box.votes = [];
      if (box.open === false) return fail('Voting is closed for this match.');
      if (box.votes.some(v => v.device === device)) return fail('You have already voted in this match — one vote per device.', 409);
      box.votes.push({ device: device, playerId: playerId, at: Date.now() });
      site.motm[key] = box;
      return saveAndOk();
    }

    if (action === 'fantasy-submit'){
      const key = String(body.roundKey || '').slice(0, 120);
      const name = String(body.name || '').trim().slice(0, 40);
      const picks = Array.isArray(body.picks) ? body.picks.map(x => String(x)).filter(Boolean) : [];
      if (name.length < 2) return fail('Add a display name between 2 and 40 characters.');
      if (picks.length !== 11 || new Set(picks).size !== 11) return fail('Pick exactly 11 different players for your XI.');
      const parts = key.split(':');
      const t = (db.state.tournaments || []).find(x => x.id === parts[0]);
      if (!t) return fail('That round could not be found. Refresh the page.', 404);
      let teamIds = [];
      if (parts[1] === 'G'){
        (t.matches || []).forEach(m => { if (m.homeId) teamIds.push(m.homeId); if (m.awayId) teamIds.push(m.awayId); });
      } else if (/^K\d+$/.test(parts[1] || '')){
        const ri = parseInt(parts[1].slice(1), 10);
        const rounds = t.knockouts && t.knockouts.rounds;
        if (Array.isArray(rounds) && rounds[ri]) (rounds[ri] || []).forEach(m => { if (m.homeId) teamIds.push(m.homeId); if (m.awayId) teamIds.push(m.awayId); });
      } else return fail('That round could not be found.');
      teamIds = Array.from(new Set(teamIds));
      if (!teamIds.length) return fail('This round does not have any teams yet.');
      if (!Array.isArray(site.players)) site.players = [];
      const eligible = site.players.filter(p => p.tournamentId === t.id && teamIds.indexOf(p.teamId) !== -1);
      if (!eligible.length) return fail('No players are listed for this round yet.');
      if (picks.some(id => !eligible.some(p => p.id === id))) return fail('One of those players is not part of this round. Choose again.');
      if (!site.fantasy || typeof site.fantasy !== 'object' || Array.isArray(site.fantasy)) site.fantasy = {};
      const store = site.fantasy[key] && typeof site.fantasy[key] === 'object' ? site.fantasy[key] : { formation: '4-3-3', picks: [], note: '', submissions: [] };
      if (!Array.isArray(store.submissions)) store.submissions = [];
      const existing = store.submissions.find(s => s.device === device);
      if (existing){ existing.name = name; existing.picks = picks; existing.at = Date.now(); }
      else store.submissions.push({ device: device, name: name, picks: picks, at: Date.now() });
      site.fantasy[key] = store;
      return saveAndOk();
    }

    return fail('Unknown fan action.', 404);
  }

  send(res, 404, { error: 'Unknown endpoint.' });
}

module.exports = { handleApi, bootstrapAdmin, readBody, send };