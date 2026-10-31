// STACKD HTTP server: static frontend, JSON RPC API, live update stream, OAuth endpoints.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { openDatabase, migrate, isSeeded } from './db/sqlite.js';
import { createStore, wipe } from './db/store.js';
import { buildSeed } from './db/seeding.js';
import { initDb, getDb, subscribe } from './domain/db.js';
import { dispatch, serialized, transact, upgradeModel, tick } from './domain/index.js';
import { define, setRateLimits, setRestore } from './domain/router.js';
import { ApiError } from './domain/errors.js';
import { providerStatus } from './auth/providers.js';
import { startOAuth, finishOAuth } from './auth/oauth.js';
import { SESSION_TTL } from './domain/handlers/auth.js';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const COOKIE = 'stackd_sid';
const SESSION_ISSUERS = new Set(['auth.signup', 'auth.login', 'auth.demo']);

// Only these paths are ever served to browsers. Server code, the database, .env and docs are not.
const PUBLIC = [/^\/index\.html$/, /^\/src\/main\.js$/, /^\/src\/(ui|client|lib|styles|shared)\/[\w\-./]+\.(js|css)$/, /^\/assets\/[\w\-./]+$/];
const DEV_PUBLIC = [/^\/tools\/[\w\-.]+\.js$/];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };
const STATUS = { UNAUTHENTICATED: 401, FORBIDDEN: 403, COMPLIANCE_BLOCKED: 403, VALIDATION: 400, NOT_FOUND: 404, STATE: 409, CONFLICT: 409, INSUFFICIENT_FUNDS: 409, RATE_LIMITED: 429 };

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(token, secure) {
  const attrs = [`${COOKIE}=${token || ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${token ? Math.floor(SESSION_TTL / 1000) : 0}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, obj, headers = {}) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new ApiError('VALIDATION', 'Request too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Boot the database and HTTP server.
 * opts: { port, host, databaseUrl, worldClock, quiet } — tests pass a temp database and port 0.
 */
export async function startApp(opts = {}) {
  const log = opts.quiet ? () => {} : (...a) => console.log(...a);
  const sql = openDatabase(opts.databaseUrl ?? config.databaseUrl);
  migrate(sql, { log });
  const store = createStore(sql);

  if (!isSeeded(sql)) {
    log('[db] empty database: seeding the demo world');
    const model = await buildSeed();
    store.save(model, { full: true });
  }
  const model = upgradeModel(store.load());
  model.config.demoMode = config.demoMode;
  store.save(model);

  const onReset = () =>
    serialized(async () => {
      const fresh = await buildSeed();
      wipe(sql);
      store.reset();
      store.save(fresh, { full: true });
      initDb(upgradeModel(store.load()), { save: store.save, onReset });
      log('[db] demo world reset');
    });
  initDb(model, { save: store.save, onReset });
  // A failed write is undone by reloading the last committed state from SQLite (only if it changed anything).
  setRestore(() => {
    if (!store.dirty(getDb())) return;
    const fresh = upgradeModel(store.load());
    fresh.config.demoMode = config.demoMode;
    initDb(fresh, { save: store.save, onReset });
  });
  if (opts.rateLimits === false) setRateLimits(false);

  define('auth.providers', { auth: false, handler: () => providerStatus() });

  // ---- live updates (Server-Sent Events) ----------------------------------------------------------
  const streams = new Set();
  let pending = null;
  subscribe((v) => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      for (const res of streams) res.write(`data: {"v":${v}}\n\n`);
    }, 400);
  });
  const heartbeat = setInterval(() => {
    for (const res of streams) res.write(': ping\n\n');
  }, 25_000);

  // ---- world clock: bots, lobbies, simulations, referees, provider callbacks ----------------------
  let ticking = false;
  const clock = (opts.worldClock ?? config.worldClock)
    ? setInterval(() => {
        if (ticking) return;
        ticking = true;
        // Writes only the rows the tick changed; live clients are pinged only if something did.
        transact((db) => tick(db))
          .catch((e) => console.error('[world] tick failed:', e))
          .finally(() => (ticking = false));
      }, opts.worldTickMs ?? config.worldTickMs)
    : null;

  const metaOf = (req) => ({
    ip: (config.trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
  });

  async function handleRpc(req, res, method) {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'METHOD', message: 'Use POST.' } });
    // CSRF: browsers can't send this custom header cross-site without a CORS preflight, which we never grant.
    if (req.headers['x-stackd-client'] !== 'web' || !String(req.headers['content-type'] || '').startsWith('application/json'))
      return sendJson(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Blocked request.' } });
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}` && origin !== config.publicUrl)
      return sendJson(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Cross-site request blocked.' } });
    try {
      const raw = await readBody(req);
      let params = {};
      try {
        params = raw ? JSON.parse(raw) : {};
      } catch {
        throw new ApiError('VALIDATION', 'Request body must be JSON.');
      }
      const token = parseCookies(req.headers.cookie)[COOKIE];
      const out = await dispatch(method, params, { ...metaOf(req), token, idempotencyKey: req.headers['idempotency-key'] || null });
      const headers = {};
      if (SESSION_ISSUERS.has(method) && out?.token) {
        headers['Set-Cookie'] = sessionCookie(out.token, config.cookieSecure);
        delete out.token;
      }
      if (method === 'auth.logout') headers['Set-Cookie'] = sessionCookie(null, config.cookieSecure);
      return sendJson(res, 200, { ok: true, data: out }, headers);
    } catch (e) {
      if (e instanceof ApiError || e?.code in STATUS) return sendJson(res, STATUS[e.code] || 400, { ok: false, error: { code: e.code, message: e.message, details: e.details || null } });
      console.error(`[rpc] ${method} failed:`, e);
      return sendJson(res, 500, { ok: false, error: { code: 'INTERNAL', message: 'Something broke on our side. Try again in a moment.' } });
    }
  }

  async function handleStatic(req, res, path) {
    if (path === '/' ) path = '/index.html';
    const allowed = PUBLIC.some((r) => r.test(path)) || (config.env !== 'production' && DEV_PUBLIC.some((r) => r.test(path)));
    const file = normalize(join(ROOT, decodeURIComponent(path)));
    if (!allowed || !file.startsWith(ROOT + sep) || path.includes('..')) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    try {
      const st = await stat(file);
      const etag = `W/"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
      const headers = { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', ETag: etag, 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=86400' : 'no-cache' };
      if (req.headers['if-none-match'] === etag) return send(res, 304, null, headers);
      return send(res, 200, req.method === 'HEAD' ? null : await readFile(file), headers);
    } catch {
      return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/rpc/')) return await handleRpc(req, res, path.slice('/api/rpc/'.length));
      if (path === '/api/events') {
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write('retry: 3000\n\n');
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return;
      }
      if (path === '/healthz') return sendJson(res, 200, { ok: true, db: 'sqlite', users: getDb().users.length, uptime: Math.round(process.uptime()) });
      const oauth = path.match(/^\/auth\/([a-z]+)\/(start|callback)$/);
      if (oauth) {
        const [, provider, step] = oauth;
        const out = step === 'start'
          ? await startOAuth(provider, url.searchParams.get('next'))
          : await finishOAuth(provider, new URL(`${config.publicUrl}${req.url}`), metaOf(req));
        const headers = { Location: out.redirect, 'Cache-Control': 'no-store' };
        if (out.token) headers['Set-Cookie'] = sessionCookie(out.token, config.cookieSecure);
        return send(res, 302, null, headers);
      }
      if (req.method === 'GET' || req.method === 'HEAD') return await handleStatic(req, res, path);
      return send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain' });
    } catch (e) {
      console.error('[http]', e);
      if (!res.headersSent) send(res, 500, 'Server error', { 'Content-Type': 'text/plain' });
    }
  });

  await new Promise((resolve) => server.listen(opts.port ?? config.port, opts.host ?? config.host, resolve));
  const { port } = server.address();
  const url = `http://${(opts.host ?? config.host) === '0.0.0.0' ? 'localhost' : opts.host ?? config.host}:${port}`;
  log(`[stackd] ${config.demoMode ? 'DEMO MODE · ' : ''}listening on ${url} · database ${sql.path}${config.google.enabled ? ' · Google sign-in on' : ' · Google sign-in not configured'}`);

  return {
    url,
    port,
    sql,
    async close() {
      clearInterval(clock);
      clearInterval(heartbeat);
      for (const r of streams) r.end();
      const closed = new Promise((r) => server.close(r));
      server.closeAllConnections();
      await closed;
      await serialized(() => sql.close());
    },
  };
}
