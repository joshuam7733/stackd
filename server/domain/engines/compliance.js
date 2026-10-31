// Compliance gate. Every entry, deposit, withdrawal, stake, prediction and payout goes through evaluate().
// Real-money availability resolves as: global flag → country → game → competition → user. Any "off" wins.
import { age, DAY } from '../util.js';
import { countryOf } from '../models.js';

const MONEY_ACTIONS = ['paid_entry', 'deposit', 'withdraw', 'stake', 'predict'];

export function startOfDay(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function evaluate(db, user, action, ctx = {}) {
  const reasons = [];
  const J = db.jurisdictions[user.country] || db.jurisdictions.UG;
  const now = Date.now();
  const block = (code, message) => reasons.push({ code, message });
  const isMoney = MONEY_ACTIONS.includes(action);

  if (user.status === 'suspended') block('SUSPENDED', 'Your account is suspended. Contact support to review it.');
  if (!J.enabled) block('JURISDICTION', `STACKD isn't live in ${countryOf(user.country).name} yet.`);

  if (isMoney) {
    if (user.status === 'restricted') block('RESTRICTED', 'Paid play is paused on your account while we review it.');
    if (user.selfExcludedUntil && user.selfExcludedUntil > now)
      block('SELF_EXCLUDED', `You're self-excluded until ${new Date(user.selfExcludedUntil).toLocaleDateString()}. Free play is still open.`);
    if (user.coolOffUntil && user.coolOffUntil > now && action !== 'withdraw')
      block('COOL_OFF', `You're on a break until ${new Date(user.coolOffUntil).toLocaleString()}.`);
    if (age(user.dob) < J.minAge && action !== 'withdraw')
      block('AGE', `Paid entries are ${J.minAge}+ in ${countryOf(user.country).name}. Free competitions and missions are open to you.`);
  }

  if (action === 'stake' && (!J.staking || user.restrictions?.staking))
    block('STAKING_OFF', `Backing players isn't available in ${countryOf(user.country).name}.`);
  if (action === 'predict' && (!J.predictions || user.restrictions?.predictions))
    block('PREDICTIONS_OFF', `Predictions aren't available in ${countryOf(user.country).name}.`);

  if (action === 'withdraw' && J.kycRequired && user.kyc?.status !== 'verified')
    block('KYC', 'Verify your identity before you withdraw. It takes about two minutes.');

  if (action === 'deposit' && ctx.amount) {
    const limit = minDefined(user.limits?.dailyDeposit, J.dailyDepositLimit);
    if (limit != null) {
      const today = sumToday(db, user.id, ['deposit'], (t) => t.amount > 0 && t.status !== 'failed');
      if (today + ctx.amount > limit) block('LIMIT', `That puts you over your daily deposit limit of UGX ${limit.toLocaleString()}.`);
    }
  }

  if (action === 'paid_entry' && ctx.amount) {
    if (ctx.game && ctx.game.realMoney === false) {
      // game is credits-only; allowed, but never real money
    }
    const hs = db.config.highStakesKyc;
    if (hs && ctx.amount >= hs && user.kyc?.status !== 'verified')
      block('HIGH_STAKES_KYC', `Entries of UGX ${hs.toLocaleString()} or more need a verified ID. Verify in Settings, it takes about two minutes.`);
    const limit = user.limits?.dailyEntry;
    if (limit != null) {
      const today = -sumToday(db, user.id, ['entry'], (t) => t.status === 'completed');
      if (today + ctx.amount > limit) block('LIMIT', `That puts you over your daily entry limit of UGX ${limit.toLocaleString()}.`);
    }
  }

  const realMoney =
    db.config.realMoney &&
    J.realMoney &&
    ctx.game?.realMoney !== false &&
    ctx.competition?.realMoney !== false &&
    !user.restrictions?.realMoney;

  return { allowed: reasons.length === 0, reasons, mode: realMoney ? 'real' : 'demo' };
}

function minDefined(a, b) {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(a, b);
}

function sumToday(db, userId, types, pred) {
  const since = startOfDay();
  return db.ledger
    .filter((t) => t.userId === userId && types.includes(t.type) && t.createdAt >= since && pred(t))
    .reduce((a, t) => a + t.amount, 0);
}

/** Fraud signals evaluated after sensitive actions. Returns alert payloads; caller persists them. */
export function fraudSignals(db, user, event) {
  const alerts = [];
  const since = Date.now() - DAY;
  if (event.type === 'deposit') {
    const n = db.ledger.filter((t) => t.userId === user.id && t.type === 'deposit' && t.createdAt > since).length;
    if (n >= 5) alerts.push({ kind: 'deposit_velocity', severity: 'medium', detail: `${n} deposits in 24h` });
  }
  if (event.type === 'win') {
    const recent = (user.form || []).slice(0, 10);
    if (recent.length === 10 && recent.every((x) => x === 'W') && user.stats.matches < 30)
      alerts.push({ kind: 'win_spike', severity: 'high', detail: '10 straight wins on a new account — possible smurf' });
  }
  if (event.type === 'arcade' && event.suspicious)
    alerts.push({ kind: 'arcade_telemetry', severity: 'high', detail: event.suspicious });
  if (event.type === 'h2h_repeat' && event.count >= 4)
    alerts.push({ kind: 'collusion', severity: 'medium', detail: `Played the same opponent ${event.count} times today` });
  return alerts;
}
