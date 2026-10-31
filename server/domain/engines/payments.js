// Payment provider abstraction. Every provider implements the same interface:
//   collect(intent) → { status, providerRef, message }   (deposit)
//   payout(intent)  → { status, providerRef, message }   (withdrawal)
// In the prototype all providers are simulators. No network calls, no money moves.

export const PROVIDERS = {
  mtn_momo: {
    id: 'mtn_momo',
    name: 'MTN Mobile Money',
    kind: 'mobile_money',
    countries: ['UG', 'RW', 'GH', 'ZA', 'NG'],
    min: 1000,
    max: 5_000_000,
    feePct: { deposit: 0, withdraw: 1 },
    field: { key: 'msisdn', label: 'Mobile money number', hint: 'e.g. 0772 000 000', pattern: '^0?7[0-9]{8}$' },
    approveCopy: 'Approve the prompt on your phone to finish.',
  },
  airtel_money: {
    id: 'airtel_money',
    name: 'Airtel Money',
    kind: 'mobile_money',
    countries: ['UG', 'KE', 'TZ', 'RW', 'NG'],
    min: 1000,
    max: 5_000_000,
    feePct: { deposit: 0, withdraw: 1 },
    field: { key: 'msisdn', label: 'Airtel Money number', hint: 'e.g. 0752 000 000', pattern: '^0?7[0-9]{8}$' },
    approveCopy: 'Enter your PIN on the prompt to finish.',
  },
  card: {
    id: 'card',
    name: 'Debit card',
    kind: 'card',
    countries: ['*'],
    min: 5000,
    max: 10_000_000,
    feePct: { deposit: 2.5, withdraw: 2.5 },
    field: null,
    approveCopy: 'Card payments open a secure 3-D Secure page at the provider.',
  },
  bank: {
    id: 'bank',
    name: 'Bank transfer',
    kind: 'bank',
    countries: ['*'],
    min: 50_000,
    max: 50_000_000,
    feePct: { deposit: 0, withdraw: 0.5 },
    field: null,
    approveCopy: 'Bank transfers settle in 1–2 working days.',
  },
};

export function providersFor(country) {
  return Object.values(PROVIDERS).filter((p) => p.countries.includes('*') || p.countries.includes(country));
}

export function validateIntent(provider, direction, amount, details = {}) {
  const p = PROVIDERS[provider];
  if (!p) return 'Pick a payment method.';
  if (!Number.isInteger(amount) || amount < p.min) return `Minimum is UGX ${p.min.toLocaleString()}.`;
  if (amount > p.max) return `Maximum is UGX ${p.max.toLocaleString()}.`;
  if (p.field) {
    const v = String(details[p.field.key] || '').replace(/\s+/g, '');
    if (!new RegExp(p.field.pattern).test(v)) return `Enter a valid ${p.field.label.toLowerCase()}.`;
  }
  return null;
}

export function feeFor(provider, direction, amount) {
  const p = PROVIDERS[provider];
  return Math.ceil((amount * (p.feePct[direction] || 0)) / 100);
}

// Simulated provider callback. Deterministic failure on amounts ending in 13 so QA can test failures.
export function simulateOutcome(intent) {
  if (intent.amount % 1000 === 13 || String(intent.amount).endsWith('13'))
    return { status: 'failed', message: 'Declined by provider (simulated).' };
  return { status: 'completed', providerRef: 'SIM' + Math.random().toString(36).slice(2, 10).toUpperCase(), message: 'Approved (simulated).' };
}
