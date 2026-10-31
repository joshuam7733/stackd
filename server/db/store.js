// Persistence for the domain model.
//
// The domain services work on plain objects (the same code the prototype ran in the browser). This module
// loads those objects from SQLite at boot and writes every change back inside a single SQL transaction
// before the API responds. SQLite is the system of record: restart the server and everything is rebuilt
// from the tables. Changes are detected per record (serialized snapshot comparison), so a request only
// writes the rows it actually touched.
import { SPECS, SINGLETONS } from './tables.js';
import { balances } from '../domain/ledger.js';
import { uid } from '../domain/util.js';

// ---- path helpers ---------------------------------------------------------------------------------
const getPath = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function setPath(o, path, v) {
  const keys = path.split('.');
  let cur = o;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]] ??= {};
  cur[keys.at(-1)] = v;
}
function deletePath(o, path) {
  const keys = path.split('.');
  let cur = o;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur?.[keys[i]];
    if (cur == null) return;
  }
  if (cur) delete cur[keys.at(-1)];
}

// ---- value codecs ---------------------------------------------------------------------------------
function toDb(v, type) {
  if (type && typeof type === 'object') return type.toDb(v);
  if (v === undefined || v === null) return null;
  if (type === 'json') return JSON.stringify(v);
  if (type === 'bool' || typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}
function fromDb(v, type) {
  if (type && typeof type === 'object') return type.fromDb(v);
  if (v === null || v === undefined) return null;
  if (type === 'json') return JSON.parse(v);
  if (type === 'bool') return !!v;
  return v;
}

// ---- row <-> object -------------------------------------------------------------------------------
function encode(spec, obj, keyValue, parentId) {
  const row = {};
  for (const [path, col, type] of spec.cols) {
    const v = path === '$key' ? keyValue : getPath(obj, path);
    row[col] = toDb(v === undefined ? spec.defaults?.[path] ?? null : v, type);
  }
  for (const [col, fn] of Object.entries(spec.derive || {})) row[col] = toDb(fn(obj, parentId ?? keyValue));
  if (spec.kind === 'map' && !spec.cols.some(([, c]) => c === spec.key)) row[spec.key] = keyValue;
  if (!spec.noExtra) {
    const rest = structuredClone(obj);
    for (const [path] of spec.cols) if (path !== '$key') deletePath(rest, path);
    for (const c of spec.children || []) delete rest[c.prop];
    row[spec.extraColumn || 'extra'] = Object.keys(rest).length ? JSON.stringify(rest) : null;
  }
  return row;
}

function decode(spec, row) {
  const extra = spec.noExtra ? null : row[spec.extraColumn || 'extra'];
  const obj = extra ? JSON.parse(extra) : {};
  for (const [path, col, type] of spec.cols) if (path !== '$key') setPath(obj, path, fromDb(row[col], type));
  for (const g of spec.nullGroups || []) {
    const v = obj[g];
    if (v && typeof v === 'object' && Object.values(v).every((x) => x == null)) obj[g] = null;
  }
  return obj;
}

const keyOf = (spec, obj) => (Array.isArray(spec.key) ? spec.key.map((k) => obj[k]).join('|') : obj[spec.key]);
const pkCols = (spec) => (Array.isArray(spec.key) ? spec.key.map((k) => spec.cols.find(([p]) => p === k)[1]) : [spec.kind === 'map' ? spec.key : spec.cols.find(([p]) => p === spec.key)[1]]);

// ---- statements -----------------------------------------------------------------------------------
function upsert(sql, table, row, pk) {
  const cols = Object.keys(row);
  const updates = cols.filter((c) => !pk.includes(c)).map((c) => `${c} = excluded.${c}`);
  const text = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT (${pk.join(', ')}) DO ${updates.length ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}`;
  sql.run(text, cols.map((c) => row[c]));
}
function insert(sql, table, row) {
  const cols = Object.keys(row);
  sql.run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => row[c]));
}

// ---- the store ------------------------------------------------------------------------------------
export function createStore(sql) {
  // collection -> Map(key -> serialized record) as last written to SQL
  const persisted = new Map(SPECS.map((s) => [s.coll, new Map()]));
  const persistedSingletons = new Map();

  function entries(db, spec) {
    const c = db[spec.coll];
    if (!c) return [];
    if (spec.kind === 'map') return Object.entries(c);
    return c.map((o) => {
      if (spec.autoId && !o.id) o.id = uid(spec.autoId);
      return [keyOf(spec, o), o];
    });
  }

  function writeChildren(spec, parentKey, obj) {
    for (const c of spec.children || []) {
      sql.run(`DELETE FROM ${c.table} WHERE ${c.fk} = ?`, [parentKey]);
      const val = obj[c.prop];
      if (!val) continue;
      const list = c.kind === 'map' ? Object.entries(val) : val.map((v) => [null, v]);
      list.forEach(([k, item], i) => {
        const row = encode(c, item, k, parentKey);
        if (c.kind === 'map') row[c.key] = k;
        row[c.fk] = parentKey;
        row.ord = i;
        insert(sql, c.table, row);
      });
    }
  }

  /** Load the whole domain model from SQL. */
  function load() {
    const db = {};
    for (const r of sql.all('SELECT key, value FROM settings')) db[r.key] = JSON.parse(r.value);
    for (const k of SINGLETONS) persistedSingletons.set(k, JSON.stringify(db[k] ?? null));
    for (const spec of SPECS) {
      const order = spec.orderBy ? ` ORDER BY ${spec.orderBy}` : ' ORDER BY rowid';
      const rows = sql.all(`SELECT * FROM ${spec.table}${order}`);
      const childRows = (spec.children || []).map((c) => {
        const by = new Map();
        for (const r of sql.all(`SELECT * FROM ${c.table} ORDER BY ${c.fk}, ord`)) {
          if (!by.has(r[c.fk])) by.set(r[c.fk], []);
          by.get(r[c.fk]).push(r);
        }
        return [c, by];
      });
      const pk = pkCols(spec)[0];
      const items = rows.map((row) => {
        const obj = decode(spec, row);
        for (const [c, by] of childRows) {
          const kids = by.get(row[pk]) || [];
          if (c.kind === 'map') obj[c.prop] = Object.fromEntries(kids.map((r) => [r[c.key], decode(c, r)]));
          else obj[c.prop] = kids.map((r) => decode(c, r));
        }
        return { key: spec.kind === 'map' ? row[spec.key] : null, obj };
      });
      db[spec.coll] = spec.kind === 'map' ? Object.fromEntries(items.map((x) => [x.key, x.obj])) : items.map((x) => x.obj);
      const snap = persisted.get(spec.coll);
      snap.clear();
      for (const [k, o] of entries(db, spec)) snap.set(k, JSON.stringify(o));
    }
    return db;
  }

  /**
   * Write every changed record. Runs in one SQL transaction; throws (and rolls back) on any error so the
   * caller can restore its in-memory snapshot. Returns the number of rows touched.
   */
  function save(db, { full = false } = {}) {
    const ops = [];
    const walletUsers = new Set();
    for (const k of SINGLETONS) {
      const json = JSON.stringify(db[k] ?? null);
      if (full || persistedSingletons.get(k) !== json) ops.push({ singleton: k, json });
    }
    for (const spec of SPECS) {
      const snap = persisted.get(spec.coll);
      const seen = new Set();
      for (const [key, obj] of entries(db, spec)) {
        seen.add(key);
        const json = JSON.stringify(obj);
        if (!full && snap.get(key) === json) continue;
        ops.push({ spec, key, obj, json });
        if (spec.coll === 'ledger') walletUsers.add(obj.userId);
      }
      for (const key of snap.keys()) if (!seen.has(key)) ops.push({ spec, key, del: true });
    }
    if (full) for (const u of db.users || []) walletUsers.add(u.id);
    if (!ops.length && !walletUsers.size) return 0;

    sql.transaction(() => {
      sql.exec('PRAGMA defer_foreign_keys = ON');
      const now = Date.now();
      for (const op of ops) {
        if (op.singleton) {
          sql.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', [op.singleton, op.json, now]);
          continue;
        }
        const { spec } = op;
        const pk = pkCols(spec);
        if (op.del) {
          const vals = Array.isArray(spec.key) ? String(op.key).split('|') : [op.key];
          sql.run(`DELETE FROM ${spec.table} WHERE ${pk.map((c) => `${c} = ?`).join(' AND ')}`, vals);
          continue;
        }
        const row = encode(spec, op.obj, spec.kind === 'map' ? op.key : undefined);
        upsert(sql, spec.table, row, pk);
        if (spec.children) writeChildren(spec, row[pk[0]], op.obj);
      }
      // Wallet projection for every user whose ledger moved, in the same transaction.
      for (const userId of walletUsers) {
        if (!userId) continue;
        const b = balances(db, userId);
        sql.run(
          `INSERT INTO wallets (id, user_id, currency, is_demo, demo_balance, cash_balance, bonus_balance, pending_balance, held_balance, lifetime_earnings, updated_at)
           VALUES (?, ?, 'UGX', 1, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET demo_balance = excluded.demo_balance, cash_balance = excluded.cash_balance, bonus_balance = excluded.bonus_balance,
             pending_balance = excluded.pending_balance, held_balance = excluded.held_balance, lifetime_earnings = excluded.lifetime_earnings, updated_at = excluded.updated_at`,
          [`wal_${userId}`, userId, b.available, b.cash, b.bonus, b.pending, b.held, b.earnings, now],
        );
      }
    });

    // Only after a successful commit does the in-memory "last written" state move forward.
    for (const op of ops) {
      if (op.singleton) persistedSingletons.set(op.singleton, op.json);
      else if (op.del) persisted.get(op.spec.coll).delete(op.key);
      else persisted.get(op.spec.coll).set(op.key, op.json);
    }
    return ops.length;
  }

  /** True if the model differs from what was last written (stops at the first difference). */
  function dirty(db) {
    for (const k of SINGLETONS) if (persistedSingletons.get(k) !== JSON.stringify(db[k] ?? null)) return true;
    for (const spec of SPECS) {
      const snap = persisted.get(spec.coll);
      const list = entries(db, spec);
      if (list.length !== snap.size) return true;
      for (const [key, obj] of list) if (snap.get(key) !== JSON.stringify(obj)) return true;
    }
    return false;
  }

  /** Forget what was written (used after a full reseed). */
  function reset() {
    for (const m of persisted.values()) m.clear();
    persistedSingletons.clear();
  }

  return { load, save, reset, dirty };
}

/** Delete every domain row (used by `npm run db:reset`). Schema and migrations stay. */
export function wipe(sql) {
  sql.transaction(() => {
    sql.exec('PRAGMA defer_foreign_keys = ON');
    const tables = ['wallets', 'settings', ...SPECS.flatMap((s) => [...(s.children || []).map((c) => c.table), s.table])];
    for (const t of [...new Set(tables)]) sql.exec(`DELETE FROM ${t}`);
  });
}
