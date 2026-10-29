'use strict';
/* Shared auth helpers: scrypt password hashing + stateless signed sessions.
 * Signed tokens (HMAC) work on long-running hosts AND serverless (Vercel),
 * because nothing is stored server-side. Set SECRET (a random string) in env
 * on any real deployment; tokens last 30 days.
 *
 * The built-in head-admin record below contains only a random salt + scrypt
 * hash. The plain-text password is never present in this source tree.
 */
const crypto = require('crypto');

const SESSION_TTL = 30 * 24 * 3600 * 1000; // 30 days

/* Built-in head admin. Password: supplied by the league owner. Only the salt
 * and hash are stored here; never add the plain password to the repo. */
const HEAD_ADMIN = Object.freeze({
  username: 'Tharana is the Goat',
  display: 'Tharana is the Goat',
  role: 'head',
  salt: 'dffaa8a6e40c3863a5f778f91aadc39f',
  hash: 'e5e22bbd756ef0dd8347053bd0f1c6434f97170f07373e87dcc37d0b6fc1eae9a7c2d754094961e93ff950b2688c13dd997f490d0b85b41807147f4305b340b0',
  algo: 'scrypt',
  createdAt: 0,
  sessionVersion: 1
});

function secret(){ return process.env.SECRET || 'fcm-dev-secret-change-me'; }

function normalizeUsername(value){
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function hashPassword(pwd, salt){ return crypto.scryptSync(String(pwd), salt, 64).toString('hex'); }

function makeUser(username, password, display, role){
  const salt = crypto.randomBytes(16).toString('hex');
  const clean = String(username == null ? '' : username).trim().replace(/\s+/g, ' ');
  return {
    id: 'u_' + crypto.randomBytes(8).toString('hex'),
    username: normalizeUsername(clean),
    display: String(display || '').trim() || clean,
    role: role === 'head' ? 'head' : 'admin',
    salt,
    hash: hashPassword(password, salt),
    algo: 'scrypt',
    sessionVersion: 1,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function makeHeadUser(){
  return {
    id: 'u_head',
    username: normalizeUsername(HEAD_ADMIN.username),
    display: HEAD_ADMIN.display,
    role: 'head',
    salt: HEAD_ADMIN.salt,
    hash: HEAD_ADMIN.hash,
    algo: 'scrypt',
    sessionVersion: 1,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function setPassword(user, password){
  user.salt = crypto.randomBytes(16).toString('hex');
  user.hash = hashPassword(password, user.salt);
  user.algo = 'scrypt';
  user.sessionVersion = (Number(user.sessionVersion) || 1) + 1;
  user.updatedAt = Date.now();
  return user;
}

function verifyPassword(u, pwd){
  try {
    if (!u || u.algo !== 'scrypt' || !u.salt || !u.hash) return false;
    const h = hashPassword(pwd, u.salt);
    const a = Buffer.from(h, 'hex');
    const b = Buffer.from(String(u.hash), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e){ return false; }
}

function publicUser(u){
  return {
    username: u.username,
    display: u.display || u.username,
    role: u.role === 'head' ? 'head' : 'admin',
    isHead: u.role === 'head',
    createdAt: u.createdAt || 0,
    lastLoginAt: u.lastLoginAt || 0
  };
}

function signSession(user){
  const e = Date.now() + SESSION_TTL;
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    u: normalizeUsername(user.username),
    n: user.display || user.username,
    r: user.role === 'head' ? 'head' : 'admin',
    sv: Number(user.sessionVersion) || 1,
    e
  })).toString('base64url');
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
  return {
    username: normalizeUsername(data.u),
    display: data.n || data.u,
    role: data.r === 'head' ? 'head' : 'admin',
    sessionVersion: Number(data.sv) || 1
  };
}

module.exports = {
  SESSION_TTL, HEAD_ADMIN, secret, normalizeUsername, hashPassword, makeUser,
  makeHeadUser, setPassword, verifyPassword, publicUser, signSession, verifySession
};
