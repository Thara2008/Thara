'use strict';
/* Client-side SERVER-MODE sync tests.
 * Runs the real index.html <script> in a vm with a simulated http(s) origin,
 * fake fetch(), fake EventSource, and a stubbed DOM, then verifies:
 *
 *   Scenario A — long-running host (streams:true): online boot, admin login,
 *     authenticated saves with change messages, live SSE refresh, and that
 *     unchanged polls don't rebuild the DOM.
 *
 *   Scenario B — serverless host (streams:false, e.g. Vercel): no SSE used,
 *     a 4s polling interval drives updates so everyone still sees changes.
 *
 * Run: node sync-test.js   (also part of `npm test`) */
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const appScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function keyedStorage(init = {}){
  const d = Object.assign({}, init);
  return {
    getItem: k => (k in d ? d[k] : null),
    setItem: (k, v) => { d[k] = String(v); },
    removeItem: k => { delete d[k]; }
  };
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function buildSandbox(opts){
  const streams = !!opts.streams;
  const server = { state: { tournaments: [] }, activity: [{ ts: Date.now(), user: 'Sam', message: 'Created the league' }] };
  const saveCalls = [];
  const esHolder = { inst: null };
  const intervals = [];
  const renders = { n: 0 };
  let serverToken = null;
  let me = null;

  const mkEl = () => ({ value: '', dataset: {} });
  const elementRegistry = {};
  const appEl = { _html: '' };
  Object.defineProperty(appEl, 'innerHTML', {
    get(){ return this._html; },
    set(v){ this._html = v; renders.n++; }
  });
  elementRegistry.app = appEl;

  const sb = {
    console,
    setTimeout,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    location: { protocol: 'http:' },
    document: {
      addEventListener(){},
      getElementById(id){ if (!elementRegistry[id]) elementRegistry[id] = mkEl(); return elementRegistry[id]; },
      querySelector(){ return null; },
      querySelectorAll(){ return []; },
      createElement(){ return {}; }
    },
    localStorage: keyedStorage(),
    sessionStorage: keyedStorage(),
    alert(){}, confirm: () => true, prompt: () => null,
    URL: { createObjectURL: () => '', revokeObjectURL(){} },
    FileReader: function(){}, Blob: function(){},
    fetch: async (url, opts = {}) => {
      const u = String(url);
      if (u === '/api/state'){
        return { ok: true, status: 200, json: async () => ({ state: server.state, activity: server.activity, me: serverToken ? me : null, streams }) };
      }
      if (u === '/api/login'){
        const b = JSON.parse(opts.body || '{}');
        if (b.username === 'sam' && b.password === 'pass123'){
          serverToken = 'tk-sam'; me = { name: 'Sam', username: 'sam' };
          return { ok: true, status: 200, json: async () => ({ token: 'tk-sam', name: 'Sam' }) };
        }
        return { ok: false, status: 401, json: async () => ({ error: 'Wrong' }) };
      }
      if (u === '/api/save'){
        const b = JSON.parse(opts.body || '{}');
        saveCalls.push({ url: u, auth: (opts.headers || {}).Authorization || null, body: b });
        server.state = b.state;
        server.activity = [{ ts: Date.now(), user: me ? me.name : '?', message: b.message || '' }].concat(server.activity).slice(0, 100);
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      throw new Error('unexpected fetch: ' + u);
    },
    EventSource: function(){ esHolder.inst = this; }
  };
  sb.__server = server;
  sb.__saveCalls = saveCalls;
  sb.__esHolder = esHolder;
  sb.__appEl = appEl;
  sb.__renders = renders;
  sb.__intervals = intervals;
  return { sb, server, saveCalls, esHolder, appEl, renders, intervals };
}

const SUITE_SSE = `
(async function(){
  let fails = 0;
  const T = (name, cond, extra) => {
    if (cond) console.log('  ✅ ' + name);
    else { console.log('  ❌ ' + name + (extra ? ' — ' + JSON.stringify(extra) : '')); fails++; }
  };
  const setEl = (id, val) => { document.getElementById(id).value = val; };
  const click = (action, id) => handle(action, id || null, { dataset: {}, getAttribute(){return null;} });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  console.log('\\n[server-mode client A: SSE host] boots online');
  T('IS_SERVER true', IS_SERVER === true);
  T('starts read-only (no token)', unlocked === false && serverMe === null);
  T('header shows the Admin Login button', __appEl.innerHTML.indexOf('Admin Login') !== -1);
  T('dashboard renders the Recent changes feed', __appEl.innerHTML.indexOf('Recent changes') !== -1 && __appEl.innerHTML.indexOf('Created the league') !== -1);
  T('activity list includes the actor name', __appEl.innerHTML.indexOf('>Sam<') !== -1);
  T('no polling started when SSE is available', __intervals.length === 0);

  console.log('\\n[server-mode client A] unchanged sync skips re-render');
  await sleep(5);
  const before = __renders.n;
  await refreshFromServer();
  T('DOM not rebuilt when nothing changed', __renders.n === before);

  console.log('\\n[server-mode client A] admin login');
  setEl('loginUser', 'sam'); setEl('loginPass', 'pass123');
  click('login');
  await sleep(10);
  T('login unlocks and caches the token', unlocked === true && sessionStorage.getItem('fcm_token') === 'tk-sam');
  T('header shows the admin badge + name', __appEl.innerHTML.indexOf('Logout') !== -1 && __appEl.innerHTML.indexOf('>Sam<') !== -1);

  console.log('\\n[server-mode client A] admin save goes to the server');
  setEl('newTournamentName', 'World Cup');
  click('create-tournament');
  await sleep(10);
  T('state mutated locally', state.tournaments.length === 1);
  const last = __saveCalls[__saveCalls.length - 1];
  T('save POSTed to /api/save', last && last.url === '/api/save');
  T('save carries the bearer token', last && last.auth === 'Bearer tk-sam');
  T('change message attached (activity feed)', last && last.body.message.indexOf('Created tournament') !== -1);
  T('server now holds the new state', __server.state.tournaments.length === 1);

  console.log('\\n[server-mode client A] live update via SSE');
  __server.state.tournaments.push({ id: 't2', name: 'From another admin', createdAt: 1, groups: [], matches: [], knockouts: null });
  __server.activity.unshift({ ts: Date.now(), user: 'Alex', message: 'Added a group' });
  __esHolder.inst.onmessage({ data: 'update' });
  await sleep(10);
  T('sees another admin\\'s change without reloading', state.tournaments.length === 2 && state.tournaments.some(x => x.name === 'From another admin'));
  T('recent-changes feed refreshed with the new entry', activity.length >= 2 && __appEl.innerHTML.indexOf('Added a group') !== -1);

  console.log('\\n' + (fails === 0 ? '🎉 CLIENT SYNC (SSE) TESTS PASSED' : '⚠️  ' + fails + ' SYNC TEST(S) FAILED'));
  globalThis.__exitCode = fails;
})();
`;

const SUITE_POLL = `
(async function(){
  let fails = 0;
  const T = (name, cond, extra) => {
    if (cond) console.log('  ✅ ' + name);
    else { console.log('  ❌ ' + name + (extra ? ' — ' + JSON.stringify(extra) : '')); fails++; }
  };

  console.log('\\n[server-mode client B: serverless / Vercel] boots online with polling');
  T('IS_SERVER true', IS_SERVER === true);
  T('no EventSource used', __esHolder.inst === null);
  T('4s polling interval scheduled', __intervals.length >= 1 && __intervals[0].ms === 4000);
  T('dashboard shows the Recent changes feed', __appEl.innerHTML.indexOf('Recent changes') !== -1);

  console.log('\\n[server-mode client B] poll picks up another admin\\'s change');
  __server.state.tournaments.push({ id: 't2', name: 'From another admin', createdAt: 1, groups: [], matches: [], knockouts: null });
  __server.activity.unshift({ ts: Date.now(), user: 'Alex', message: 'Added a group' });
  await __intervals[0].fn();
  T('poll refreshes state', state.tournaments.length === 1 && state.tournaments.some(x => x.name === 'From another admin'));
  T('activity feed updated via polling', __appEl.innerHTML.indexOf('Added a group') !== -1);

  console.log('\\n' + (fails === 0 ? '🎉 CLIENT SYNC (POLLING) TESTS PASSED' : '⚠️  ' + fails + ' SYNC TEST(S) FAILED'));
  globalThis.__exitCode = fails;
})();
`;

(async () => {
  const A = buildSandbox({ streams: true });
  vm.createContext(A.sb);
  vm.runInContext(appScript, A.sb);
  await sleep(25);
  vm.runInContext(SUITE_SSE, A.sb);
  while (A.sb.__exitCode === undefined) await sleep(5);
  const failsA = A.sb.__exitCode || 0;

  const B = buildSandbox({ streams: false });
  vm.createContext(B.sb);
  vm.runInContext(appScript, B.sb);
  await sleep(25);
  vm.runInContext(SUITE_POLL, B.sb);
  while (B.sb.__exitCode === undefined) await sleep(5);
  const failsB = B.sb.__exitCode || 0;

  const total = failsA + failsB;
  console.log(total === 0 ? '\n🎉 ALL CLIENT SYNC TESTS PASSED' : '\n⚠️ ' + total + ' SYNC TEST(S) FAILED');
  process.exit(total === 0 ? 0 : 1);
})().catch(err => { console.error('SYNC TEST ERROR:', err); process.exit(1); });