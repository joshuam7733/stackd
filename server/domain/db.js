// The live domain model and its commit hook.
//
// Domain services read and mutate plain objects. After every successful write the router calls
// commit(), which hands the model to the persistence layer (server/db/store.js → SQLite). If the database
// write fails, commit() throws and the router restores the pre-request snapshot, so memory and disk never
// disagree. Nothing here touches the browser.

let db = null;
let version = 0;
let persist = null;
let resetHook = null;
const listeners = new Set();

export const getDb = () => db;
export const getVersion = () => version;

/** Install the loaded model and the function that writes it to the database. */
export function initDb(model, { save, onReset } = {}) {
  db = model;
  persist = save || null;
  resetHook = onReset || null;
}

// Used by the router to roll back a failed write transaction.
export function replaceDb(next) {
  db = next;
}

/** Persist the current model (throws if the database rejects it) and notify live subscribers if anything changed. */
export function commit() {
  const written = persist ? persist(db) : 1;
  if (written) bump();
  return written;
}

function bump() {
  version++;
  listeners.forEach((fn) => {
    try {
      fn(version);
    } catch {
      /* a broken listener must not fail a commit */
    }
  });
}

/** Replace the whole world with a fresh seed (admin "reset demo data"). */
export function resetDb(seed) {
  if (resetHook) resetHook(seed);
  else db = seed();
  bump();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Small query helper.
export const byId = (coll, id) => db[coll].find((x) => x.id === id);
