// STATIC DEMO BUILD transport (Netlify / Vercel). Replaces src/client/api.js in the published package.
//
// The full server-side domain (router, engines, ledger, competition engine, simulation adapter, world clock)
// runs inside the visitor's browser and saves to IndexedDB. Every visitor gets a private demo world: there are
// no shared accounts and no Google sign-in in this build. The Node server (npm start) is the real backend.
import { dispatch, transact, tick, upgradeModel } from '../../server/domain/index.js';
import { initDb, subscribe as subscribeDb, getDb } from '../../server/domain/db.js';
import { define } from '../../server/domain/router.js';
import { seed } from '../../server/domain/seed/index.js';
import { hashPassword } from '../../server/auth/passwords.js';

const DB_NAME = 'stackd-demo';
const KEY = 'world.v6';
const TOKEN_KEY = 'stackd.demo.session';

export class RpcError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// ---- IndexedDB (one JSON document; plenty of room compared with localStorage) -------------------
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result ?? null);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}
function flush() {
  saveTimer = null;
  idbSet(KEY, JSON.stringify(getDb())).catch((e) => console.warn('STACKD demo: could not save', e));
}
addEventListener('pagehide', () => saveTimer && flush());
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveTimer && flush());

async function buildSeed() {
  const db = upgradeModel(seed());
  const hash = await hashPassword('demo1234');
  for (const u of db.users) {
    if (u.demoPassword) u.passwordHash = hash;
    delete u.demoPassword;
  }
  return db;
}

const persist = () => {
  scheduleSave();
  return 1;
};

async function boot() {
  let model = null;
  try {
    const raw = await idbGet(KEY);
    if (raw) model = upgradeModel(JSON.parse(raw));
  } catch {
    model = null;
  }
  if (!model) model = await buildSeed();
  const onReset = async () => {
    initDb(await buildSeed(), { save: persist, onReset });
    flush();
    setToken(null);
  };
  initDb(model, { save: persist, onReset });
  flush();
  define('auth.providers', {
    auth: false,
    handler: () => ({ password: { enabled: true }, google: { enabled: false, name: 'Google' }, apple: { enabled: false, comingSoon: true }, phone: { enabled: false, comingSoon: true }, demoBuild: true }),
  });
  // World clock: demo players, lobby timers, simulated matches, provider callbacks.
  const NO_CHANGE = Symbol('no-change');
  let ticking = false;
  setInterval(() => {
    if (ticking) return;
    ticking = true;
    transact((db) => {
      if (!tick(db)) throw NO_CHANGE;
    })
      .catch((e) => e !== NO_CHANGE && console.error('[world] tick failed', e))
      .finally(() => (ticking = false));
  }, 2500);
}

const ready = boot();

// ---- session token (this browser only) ------------------------------------------------------------
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session lasts for this tab */
  }
}

/** rpc(method, params, { idempotencyKey }) — same contract as the HTTP client. */
export async function rpc(method, params = {}, opts = {}) {
  await ready;
  try {
    const out = await dispatch(method, structuredClone(params ?? {}), { token: getToken(), idempotencyKey: opts.idempotencyKey || crypto.randomUUID(), ip: 'browser', userAgent: navigator.userAgent });
    if (out && typeof out === 'object' && out.token && ['auth.signup', 'auth.login', 'auth.demo'].includes(method)) setToken(out.token);
    if (method === 'auth.logout') setToken(null);
    return out;
  } catch (e) {
    if (e?.code) throw new RpcError(e.code, e.message, e.details);
    console.error(`[rpc] ${method} failed`, e);
    throw new RpcError('INTERNAL', 'Something broke on our side. Try again in a moment.');
  }
}

export const newKey = () => crypto.randomUUID();

export function subscribe(fn) {
  return subscribeDb(fn);
}
