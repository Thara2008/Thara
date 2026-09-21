'use strict';
/* Storage adapters behind one async interface:
 *   getDB()  -> Promise<{ state, activity }>
 *   putDB(db)
 *   getUsers() -> Promise<{ users }>
 *   putUsers(doc)
 *
 * - fileStorage:  plain JSON files on disk (local dev, Render/Railway, VPS)
 * - redisStorage: Upstash Redis over its REST API (serverless hosts: Vercel),
 *                 zero dependencies — uses global fetch. */
const fs = require('fs');
const path = require('path');

function fileStorage(dir){
  const dbFile = path.join(dir, 'db.json');
  const usersFile = path.join(dir, 'users.json');
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ state: { tournaments: [] }, activity: [] }));
  if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify({ users: [] }));
  return {
    kind: 'file',
    getDB: async () => {
      try { return JSON.parse(fs.readFileSync(dbFile, 'utf8')); }
      catch (e){ return { state: { tournaments: [] }, activity: [] }; }
    },
    putDB: async db => { fs.writeFileSync(dbFile, JSON.stringify(db)); },
    getUsers: async () => {
      try { return JSON.parse(fs.readFileSync(usersFile, 'utf8')); }
      catch (e){ return { users: [] }; }
    },
    putUsers: async doc => { fs.writeFileSync(usersFile, JSON.stringify(doc)); }
  };
}

function redisStorage(restUrl, restToken, prefix){
  const base = (restUrl || '').replace(/\/+$/, '');
  const P = prefix || 'fcm:';
  async function call(op, args){
    const url = base + '/' + op + '/' + args.map(encodeURIComponent).join('/');
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + restToken } });
    if (!res.ok) throw new Error('redis ' + op + ' -> ' + res.status);
    return res.json();
  }
  return {
    kind: 'redis',
    getDB: async () => {
      const j = await call('get', [P + 'db']);
      return j && j.result ? JSON.parse(j.result) : { state: { tournaments: [] }, activity: [] };
    },
    putDB: async db => { await call('set', [P + 'db', JSON.stringify(db)]); },
    getUsers: async () => {
      const j = await call('get', [P + 'users']);
      return j && j.result ? JSON.parse(j.result) : { users: [] };
    },
    putUsers: async doc => { await call('set', [P + 'users', JSON.stringify(doc)]); }
  };
}

module.exports = { fileStorage, redisStorage };