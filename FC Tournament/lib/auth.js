'use strict';
/* Shared auth helpers: scrypt password hashing + stateless signed sessions.
 * Signed tokens (HMAC) work on long-running hosts AND serverless (Vercel),
 * because nothing is stored server-side. Set SECRET (a random string) in env
 * on any real deployment; tokens last 30 days. */
const crypto = require('crypto');

const SESSION_TTL = 30 * 24 * 3600 * 1000; // 30 days

function secret(){ return process.env.SECRET || 'fcm-dev-secret-change-me'; }

function hashPassword(pwd, salt){ return crypto.scryptSync(String(pwd), salt, 64).toString('hex'); }

function makeUser(username, password, display){
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    username: String(username).toLowerCase(),
    display: String(display || '').trim() || String(username),
    salt,
    hash: hashPassword(password, salt),
    createdAt: Date.now()
  };
}

function verifyPassword(u, pwd){
  try {
    const h = hashPassword(pwd, u.salt);
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.hash, 'hex'));
  } catch (e){ return false; }
}

function signSession(user){
  const e = Date.now() + SESSION_TTL;
  const payload = Buffer.from(JSON.stringify({ v: 1, u: user.username, n: user.display || user.username, e })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function verifySession(token){
  if (typeof token !== 'string' || token.length > 10000) return null;
  const i = token.indexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length) return null;
  let data = null;
  try {
    if (!crypto.timingSafeEqual(a, b)) return null;
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e){ return null; }
  if (data.v !== 1 || typeof data.u !== 'string' || typeof data.e !== 'number' || data.e < Date.now()) return null;
  return { username: data.u, display: data.n || data.u };
}

module.exports = { SESSION_TTL, secret, hashPassword, makeUser, verifyPassword, signSession, verifySession };