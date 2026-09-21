'use strict';
/* ============================================================
 * Vercel serverless entry point (catch-all for /api/*)
 * ------------------------------------------------------------
 * Everything the app needs over HTTP lives behind /api/state,
 * /api/login, /api/logout, /api/save, /api/users (see lib/handler.js).
 *
 * Data + admin accounts live in Upstash Redis (REST — zero deps).
 * No SSE here: the app auto-detects `streams: false` and polls
 * /api/state every few seconds instead, so everyone still sees
 * admin changes live.
 *
 * Required env vars (set in Vercel dashboard):
 *   UPSTASH_REDIS_REST_URL     e.g. https://xx.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN   the REST token from the same DB
 *   SECRET                     random string for admin sessions
 * Optional:
 *   ADMIN_USER / ADMIN_PASSWORD   bootstrap admin (default admin / qwert)
 *   REDIS_PREFIX                  namespacing key (default fcm:)
 * ============================================================ */
const { redisStorage } = require('../lib/storage');
const { handleApi, bootstrapAdmin } = require('../lib/handler');

module.exports = async (req, res) => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token){
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN env vars.' }));
    return;
  }
  const storage = redisStorage(url, token, process.env.REDIS_PREFIX || 'fcm:');
  try {
    await bootstrapAdmin(storage, process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASSWORD || 'qwert');
    await handleApi(storage, req, res, { streams: false });
  } catch (e){
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: e && e.message ? e.message : 'Server error.' }));
  }
};