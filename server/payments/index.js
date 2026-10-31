// Payment provider abstraction. LIVE PAYMENTS ARE INTENTIONALLY NOT IMPLEMENTED YET (next phase).
//
// Every provider implements:
//   initiateDeposit({ tx, method, amount, details })     → { status: 'pending' | 'failed', providerRef, message, completeAt? }
//   verifyDeposit(tx, now)                                → { status: 'pending' | 'completed' | 'failed', providerRef, message }
//   initiateWithdrawal({ tx, method, amount, details })  → { status, providerRef, message }
//   verifyWithdrawal(tx, now)                            → { status, providerRef, message }
//   refund(tx, reason)                                   → { status, providerRef, message }
//   transactionStatus(tx)                                → 'pending' | 'completed' | 'failed' | 'reversed'
//
// The ledger, limits, KYC gates and the wallet UI only ever talk to this interface. DemoPaymentProvider is the
// working implementation: no network calls, no money moves, every transaction is labelled simulated.
import { simulateOutcome } from '../domain/engines/payments.js';

const ref = (p) => `${p}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

export const DemoPaymentProvider = {
  id: 'demo',
  name: 'Demo payments (simulated)',
  live: false,
  configured: true,
  initiateDeposit({ amount }) {
    return { status: 'pending', providerRef: ref('SIMD'), message: 'Approval requested (simulated).', completeAt: Date.now() + 3000, amount };
  },
  verifyDeposit(tx, now = Date.now()) {
    if (tx.meta?.completeAt && tx.meta.completeAt > now) return { status: 'pending' };
    const out = simulateOutcome(tx); // amounts ending in 13 decline, so failure paths can be tested
    return { status: out.status, providerRef: out.providerRef || tx.meta?.providerRef || null, message: out.message };
  },
  initiateWithdrawal() {
    return { status: 'pending', providerRef: ref('SIMW'), message: 'Queued for review (simulated).' };
  },
  verifyWithdrawal(tx, now = Date.now()) {
    if (now - tx.createdAt < 60_000) return { status: 'pending' };
    return { status: 'completed', providerRef: tx.meta?.providerRef || ref('SIMW'), message: 'Paid out (simulated). No money moved.' };
  },
  refund() {
    return { status: 'completed', providerRef: ref('SIMR'), message: 'Refunded (simulated).' };
  },
  transactionStatus(tx) {
    return tx.status;
  },
};

// Real providers: interface placeholders only. They refuse to run until credentials exist and the
// platform is explicitly switched to real money after legal review.
const notConfigured = (id, name, env) => {
  const fail = () => {
    const e = new Error(`${name} is not connected yet. Set ${env.join(', ')} and implement server/payments/${id}.js.`);
    e.code = 'PAYMENT_PROVIDER_NOT_CONFIGURED';
    throw e;
  };
  // `configured` stays false until a real adapter exists, even if the env vars are present.
  return { id, name, live: true, configured: false, credentialsPresent: env.every((k) => !!process.env[k]), initiateDeposit: fail, verifyDeposit: fail, initiateWithdrawal: fail, verifyWithdrawal: fail, refund: fail, transactionStatus: fail };
};

const LIVE = {
  mtn_momo: notConfigured('mtn_momo', 'MTN Mobile Money', ['MTN_MOMO_SUBSCRIPTION_KEY', 'MTN_MOMO_API_USER', 'MTN_MOMO_API_KEY']),
  airtel_money: notConfigured('airtel_money', 'Airtel Money', ['AIRTEL_CLIENT_ID', 'AIRTEL_CLIENT_SECRET']),
  card: notConfigured('card', 'Card payments', ['CARD_PROVIDER_SECRET_KEY']),
  bank: notConfigured('bank', 'Bank transfer', ['BANK_PROVIDER_API_KEY']),
};

/** The provider that handles a payment method right now. In DEMO MODE (or with real money off) it is always the demo provider. */
export function paymentProviderFor(db, method) {
  if (db.config.demoMode || !db.config.realMoney) return DemoPaymentProvider;
  const p = LIVE[method];
  return p?.configured ? p : DemoPaymentProvider;
}

export const paymentProviders = () => [DemoPaymentProvider, ...Object.values(LIVE)].map(({ id, name, live, configured }) => ({ id, name, live, configured }));
