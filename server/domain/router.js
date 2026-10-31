// RPC router: the only door into the domain. Handles sessions, roles, validation, rate limits,
// idempotency, atomic writes (serialized, snapshot + rollback, persisted before the response) and audit.
import { createHash } from 'node:crypto';
import { getDb, replaceDb, commit } from './db.js';
import { E, ApiError } from './errors.js';
import { check } from './validate.js';
import { audit } from './notify.js';

const methods = new Map();
const buckets = new Map();

const LIMITS = {
  default: { capacity: 120, perSec: 12 },
  write: { capacity: 40, perSec: 4 },
  financial: { capacity: 24, perSec: 2 },
  auth: { capacity: 10, perSec: 0.2 },
};

/**
 * define('competitions.join', { schema, roles, write, rate, idempotent, audit, handler(ctx, params) })
 *   auth: false      → callable without a session
 *   roles: [...]     → required role(s)
 *   write: true      → runs in a transaction and persists
 *   idempotent: true → requires an idempotency key; replays return the first result
 */
export function define(name, def) {
  methods.set(name, def);
}

export const listMethods = () => [...methods.keys()];
export const methodDef = (name) => methods.get(name);

let rateLimits = true;
export const setRateLimits = (on) => (rateLimits = on);

function rateLimit(key, cls) {
  if (!rateLimits) return;
  const lim = LIMITS[cls] || LIMITS.default;
  const id = `${key}:${cls}`;
  const now = Date.now();
  const b = buckets.get(id) || { tokens: lim.capacity, at: now };
  b.tokens = Math.min(lim.capacity, b.tokens + ((now - b.at) / 1000) * lim.perSec);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(id, b);
    throw E.rate();
  }
  b.tokens -= 1;
  buckets.set(id, b);
}
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, b] of buckets) if (b.at < cutoff) buckets.delete(k);
}, 60_000).unref?.();

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

export function sessionUser(db, token) {
  if (!token) return { session: null, user: null, tokenHash: null };
  const tokenHash = hashToken(token);
  const session = db.sessions[tokenHash];
  if (!session || session.expiresAt < Date.now()) return { session: null, user: null, tokenHash };
  const user = db.users.find((u) => u.id === session.userId) || null;
  return { session, user, tokenHash };
}

// ---- write serialization ------------------------------------------------------------------------
// Handlers may await (password hashing), so writes are queued: one transaction at a time, ever.
let queue = Promise.resolve();
export function serialized(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// How a failed write is undone. With a database attached, the server reloads the model from SQLite (the
// system of record), so successful writes never pay for a snapshot. Without one, a snapshot is used.
let restore = null;
export const setRestore = (fn) => (restore = fn);

/**
 * Run fn(db) as one atomic write: mutate, then persist every changed row in one SQL transaction. Any throw
 * (including a database error) restores the last committed state. Used by RPC writes, the world clock and
 * the OAuth callback.
 */
export function transact(fn) {
  return serialized(async () => {
    const snapshot = restore ? null : structuredClone(getDb());
    try {
      const out = await fn(getDb());
      commit();
      return out;
    } catch (e) {
      if (restore) restore();
      else replaceDb(snapshot);
      throw e;
    }
  });
}

export async function dispatch(name, params = {}, meta = {}) {
  const def = methods.get(name);
  if (!def) throw new ApiError('NOT_FOUND', `Unknown method ${name}`);

  const authorize = (db) => {
    const ctxSession = sessionUser(db, meta.token);
    const { user } = ctxSession;
    if (def.auth !== false && !user) throw E.auth();
    if (def.roles && (!user || !def.roles.includes(user.role))) throw E.forbidden();
    if (def.write && user?.status === 'suspended' && !def.allowSuspended) throw E.forbidden('Your account is suspended. Contact support.');
    return ctxSession;
  };

  // Cheap checks before queueing.
  const pre = authorize(getDb());
  rateLimit(pre.tokenHash || meta.ip || 'anon', def.rate || (def.write ? 'write' : 'default'));
  const p = def.schema ? check(def.schema, params || {}) : {};

  if (!def.write) {
    const db = getDb();
    const out = await def.handler({ db, user: pre.user, session: pre.session, tokenHash: pre.tokenHash, meta }, p);
    return out === undefined ? null : JSON.parse(JSON.stringify(out));
  }

  return transact(async (db) => {
    // Re-read the session inside the lock: another request may have changed it.
    const { user, session, tokenHash } = authorize(db);
    let idemKey = null;
    if (def.idempotent) {
      if (!meta.idempotencyKey) throw E.invalid('Missing idempotency key.');
      idemKey = `${user?.id || 'anon'}:${name}:${meta.idempotencyKey}`;
      const prior = db.idempotency[idemKey];
      if (prior) return JSON.parse(prior.result);
    }
    const out = await def.handler({ db, user, session, tokenHash, meta }, p);
    const json = JSON.stringify(out === undefined ? null : out);
    if (idemKey) db.idempotency[idemKey] = { at: Date.now(), result: json };
    if (def.audit) audit(db, user?.id || out?.user?.id || 'anon', name, def.audit(p, out), { params: redact(p) }, meta.ip);
    return JSON.parse(json);
  });
}

function redact(p) {
  const out = { ...p };
  for (const k of Object.keys(out)) if (/password|pin|msisdn|token|secret/i.test(k)) out[k] = '•••';
  return out;
}
