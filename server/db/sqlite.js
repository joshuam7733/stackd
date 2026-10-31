// Database adapter. STACKD talks to SQL through this small interface so the driver can change
// (SQLite today, Postgres for multi-instance production) without touching the domain code:
//   all(sql, params) · get(sql, params) · run(sql, params) · exec(sql) · transaction(fn) · close()
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** DATABASE_URL forms: `sqlite:./data/stackd.db`, `sqlite::memory:`, or a bare file path. */
export function resolveDatabasePath(url) {
  const raw = (url || 'sqlite:./data/stackd.db').trim();
  if (raw.startsWith('postgres')) throw new Error('DATABASE_URL points at Postgres. This build ships the SQLite adapter; see README → "Moving to Postgres".');
  return raw.replace(/^sqlite:(\/\/)?/, '') || './data/stackd.db';
}

export function openDatabase(url) {
  const path = resolveDatabasePath(url);
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = db.prepare(sql)));
    return s;
  };
  let depth = 0;
  return {
    path,
    all: (sql, params = []) => stmt(sql).all(...params),
    get: (sql, params = []) => stmt(sql).get(...params),
    run: (sql, params = []) => stmt(sql).run(...params),
    exec: (sql) => db.exec(sql),
    transaction(fn) {
      // Nested calls join the outer transaction.
      if (depth > 0) return fn();
      depth++;
      db.exec('BEGIN IMMEDIATE');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
    close: () => db.close(),
  };
}

/** Applies pending migrations in filename order. Each migration runs in its own transaction. */
export function migrate(sql, { log = console.log } = {}) {
  sql.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const applied = new Set(sql.all('SELECT version FROM schema_migrations').map((r) => r.version));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const ran = [];
  for (const file of files) {
    const version = file.split('_')[0];
    if (applied.has(version)) continue;
    const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    sql.transaction(() => {
      sql.exec(body);
      sql.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [version, file, Date.now()]);
    });
    ran.push(file);
    log(`[db] applied migration ${file}`);
  }
  return ran;
}

export function isSeeded(sql) {
  try {
    return !!sql.get("SELECT 1 AS ok FROM settings WHERE key = 'config'");
  } catch {
    return false;
  }
}
