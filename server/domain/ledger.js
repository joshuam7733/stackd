// Append-only ledger. Balances are always derived from entries — never stored by hand, never sent by the
// client. (The `wallets` table is a projection refreshed from these entries in the same DB transaction.)
import { createTx } from './models.js';
import { E } from './errors.js';

const EARNING = ['prize', 'stake_return', 'prediction_payout'];
const REWARD = ['reward', 'sponsor_reward'];

// Per-user index over the ledger array. Entries are only ever appended, so the index catches up by
// scanning new items; a replaced array (rollback, reseed) gets a fresh index.
const indexes = new WeakMap();
function txsOf(db, userId) {
  let ix = indexes.get(db.ledger);
  if (!ix) indexes.set(db.ledger, (ix = { n: 0, by: new Map() }));
  for (; ix.n < db.ledger.length; ix.n++) {
    const t = db.ledger[ix.n];
    if (!ix.by.has(t.userId)) ix.by.set(t.userId, []);
    ix.by.get(t.userId).push(t);
  }
  return ix.by.get(userId) || [];
}
export const userLedger = txsOf;

export function balances(db, userId) {
  let cash = 0, bonus = 0, pending = 0, earnings = 0, rewards = 0, bonuses = 0, held = 0;
  for (const t of txsOf(db, userId)) {
    const counts = t.status === 'completed' || (t.status === 'pending' && t.amount < 0);
    if (counts) {
      if (t.bucket === 'bonus') bonus += t.amount;
      else cash += t.amount;
    }
    if (t.status === 'pending' && t.amount > 0) pending += t.amount;
    if (t.status === 'pending' && t.amount < 0) held += -t.amount;
    if (t.status === 'completed') {
      if (EARNING.includes(t.type)) earnings += t.amount;
      if (REWARD.includes(t.type)) rewards += t.amount;
      // Starter wallets and demo top-ups are funding, not bonuses.
      if (t.type === 'bonus' && !t.meta?.demo) bonuses += t.amount;
    }
  }
  return { available: cash + bonus, cash, bonus, pending, held, earnings, rewards, bonuses, currency: 'UGX', demo: true };
}

export function post(db, fields) {
  if (!Number.isFinite(fields.amount) || !Number.isInteger(fields.amount)) throw new Error(`Ledger amounts must be whole numbers (got ${fields.amount})`);
  const tx = createTx(fields);
  db.ledger.push(tx);
  return tx;
}

/** Debit an entry fee. Bonus credit is spent before cash. Throws if the wallet can't cover it. */
export function debitEntry(db, userId, amount, ref, description) {
  if (amount <= 0) return [];
  const b = balances(db, userId);
  if (b.available < amount) throw E.funds(amount);
  const fromBonus = Math.min(Math.max(0, b.bonus), amount);
  const fromCash = amount - fromBonus;
  const out = [];
  if (fromBonus > 0) out.push(post(db, { userId, type: 'entry', amount: -fromBonus, bucket: 'bonus', ref, description: `${description} (bonus credit)` }));
  if (fromCash > 0) out.push(post(db, { userId, type: 'entry', amount: -fromCash, bucket: 'cash', ref, description }));
  return out;
}

/**
 * Refund whatever is still owed on a ref: entries minus refunds already paid, per bucket. Idempotent
 * (a second call refunds nothing) and correct when a player leaves, rejoins and leaves again.
 */
export function refundRef(db, userId, refId, reason) {
  const owed = { cash: 0, bonus: 0 };
  let ref = null;
  for (const t of txsOf(db, userId)) {
    if (t.ref?.id !== refId || t.status !== 'completed' || !['entry', 'refund'].includes(t.type)) continue;
    owed[t.bucket === 'bonus' ? 'bonus' : 'cash'] -= t.amount;
    ref ||= t.ref;
  }
  const out = [];
  for (const [bucket, amount] of Object.entries(owed)) if (amount > 0) out.push(post(db, { userId, type: 'refund', amount, bucket, ref, description: reason || 'Entry refunded' }));
  return out;
}

export function credit(db, userId, type, amount, ref, description, extra = {}) {
  if (amount <= 0) return null;
  return post(db, { userId, type, amount: Math.floor(amount), ref, description, ...extra });
}
