import { define } from '../router.js';
import { s } from '../validate.js';
import { E } from '../errors.js';
import { balances, post, debitEntry, credit } from '../ledger.js';
import { evaluate, fraudSignals } from '../engines/compliance.js';
import { PROVIDERS, providersFor, validateIntent, feeFor } from '../engines/payments.js';
import { paymentProviderFor } from '../../payments/index.js';
import { evaluateAchievements } from '../engines/achievements.js';
import { verifyReport } from '../engines/verification.js';
import { scoreRun } from '../../../src/shared/arcade.js';
import { notify, fraudAlert } from '../notify.js';
import { simStats, skillOf, meets } from '../sim.js';
import { missionView, lite, pubUser, gameMini } from './views.js';
import { uid, live } from '../util.js';
import { money } from '../fmt.js';

const mask = (msisdn) => (msisdn ? `${msisdn.slice(0, 3)}•••••${msisdn.slice(-2)}` : null);

// ---- wallet -----------------------------------------------------------------------------------

define('wallet.summary', {
  handler({ db, user }) {
    const txs = db.ledger.filter((t) => t.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
    return {
      balances: balances(db, user.id),
      recent: txs.slice(0, 6),
      providers: providersFor(user.country).map((p) => ({ id: p.id, name: p.name, kind: p.kind, min: p.min, max: p.max, field: p.field, feePct: p.feePct, approveCopy: p.approveCopy })),
      canDeposit: evaluate(db, user, 'deposit'),
      canWithdraw: evaluate(db, user, 'withdraw'),
      mode: db.config.realMoney ? 'real' : 'demo',
      limits: user.limits,
      kyc: user.kyc,
    };
  },
});

define('wallet.transactions', {
  schema: s.obj({ type: s.opt(s.str({ max: 30 })), status: s.opt(s.str({ max: 20 })), limit: s.opt(s.int({ min: 1, max: 200 })) }),
  handler({ db, user }, p) {
    return db.ledger
      .filter((t) => t.userId === user.id)
      .filter((t) => !p.type || t.type === p.type || (p.type === 'winnings' && ['prize', 'stake_return', 'prediction_payout'].includes(t.type)) || (p.type === 'rewards' && ['reward', 'sponsor_reward', 'bonus'].includes(t.type)))
      .filter((t) => !p.status || t.status === p.status)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, p.limit || 100);
  },
});

define('wallet.tx', {
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const t = db.ledger.find((x) => x.id === p.id);
    if (!t || (t.userId !== user.id && user.role !== 'admin')) throw E.notFound('Transaction');
    const related = t.ref ? db.ledger.filter((x) => x.userId === t.userId && x.ref?.id === t.ref.id && x.id !== t.id) : [];
    return { ...t, providerName: t.provider ? PROVIDERS[t.provider]?.name : null, related };
  },
});

define('wallet.deposit', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ provider: s.oneOf(Object.keys(PROVIDERS)), amount: s.int({ min: 1, max: 100_000_000 }), msisdn: s.opt(s.str({ max: 16 })) }),
  audit: (p, out) => out?.id,
  handler({ db, user }, p) {
    const gate = evaluate(db, user, 'deposit', { amount: p.amount });
    if (!gate.allowed) throw E.blocked(gate.reasons);
    const err = validateIntent(p.provider, 'deposit', p.amount, { msisdn: p.msisdn });
    if (err) throw E.invalid(err);
    const prov = PROVIDERS[p.provider];
    if (!prov.countries.includes('*') && !prov.countries.includes(user.country)) throw E.invalid(`${prov.name} isn't available in your country.`);
    const gateway = paymentProviderFor(db, p.provider);
    const started = gateway.initiateDeposit({ method: p.provider, amount: p.amount, details: { msisdn: p.msisdn } });
    const tx = post(db, {
      userId: user.id, type: 'deposit', amount: p.amount, status: started.status, provider: p.provider,
      description: `Deposit via ${prov.name}${gateway.live ? '' : ' (simulated)'}`,
      meta: { gateway: gateway.id, providerRef: started.providerRef, completeAt: started.completeAt || null, msisdnMasked: mask(p.msisdn), fee: feeFor(p.provider, 'deposit', p.amount) },
    });
    fraudSignals(db, user, { type: 'deposit' }).forEach((a) => fraudAlert(db, user.id, a));
    return tx;
  },
});

define('wallet.withdraw', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ provider: s.oneOf(Object.keys(PROVIDERS)), amount: s.int({ min: 1, max: 100_000_000 }), msisdn: s.opt(s.str({ max: 16 })) }),
  audit: (p, out) => out?.id,
  handler({ db, user }, p) {
    const gate = evaluate(db, user, 'withdraw', { amount: p.amount });
    if (!gate.allowed) throw E.blocked(gate.reasons);
    const err = validateIntent(p.provider, 'withdraw', p.amount, { msisdn: p.msisdn });
    if (err) throw E.invalid(err);
    const b = balances(db, user.id);
    if (p.amount > b.cash) throw E.state(`You can withdraw up to ${money(Math.max(0, b.cash))}. Bonus credit can be played but not withdrawn.`);
    const prov = PROVIDERS[p.provider];
    const fee = feeFor(p.provider, 'withdraw', p.amount);
    const gateway = paymentProviderFor(db, p.provider);
    const started = gateway.initiateWithdrawal({ method: p.provider, amount: p.amount, details: { msisdn: p.msisdn } });
    const tx = post(db, {
      userId: user.id, type: 'withdrawal', amount: -p.amount, status: 'pending', provider: p.provider,
      description: `Withdrawal to ${prov.name}${gateway.live ? '' : ' (simulated)'}`,
      meta: { gateway: gateway.id, providerRef: started.providerRef, fee, receive: p.amount - fee, msisdnMasked: mask(p.msisdn) },
    });
    notify(db, user.id, { type: 'withdrawal', title: `Withdrawal requested: ${money(p.amount)}`, body: 'Under review. Most clear within the hour (about a minute in the demo).', link: `/app/wallet/tx/${tx.id}` });
    return tx;
  },
});

// DEMO ONLY: load the stack with demo credits so large stakes can be tried without the provider caps.
define('wallet.demoTopUp', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ amount: s.oneOf([100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000]) }),
  audit: (p) => `demo_topup:${p.amount}`,
  handler({ db, user }, p) {
    if (!db.config.demoMode) throw E.forbidden('Demo credits are only available in demo mode.');
    return post(db, { userId: user.id, type: 'bonus', amount: p.amount, description: 'Demo credits top-up (not real money)', meta: { demo: true } });
  },
});

// ---- notifications ----------------------------------------------------------------------------

define('notifications.list', {
  schema: s.obj({ limit: s.opt(s.int({ min: 1, max: 100 })) }),
  handler({ db, user }, p) {
    return db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.at - a.at).slice(0, p.limit || 60);
  },
});

define('notifications.read', {
  write: true,
  schema: s.obj({ id: s.opt(s.str({ max: 60 })), all: s.opt(s.bool()) }),
  handler({ db, user }, p) {
    for (const n of db.notifications) if (n.userId === user.id && (p.all || n.id === p.id)) n.read = true;
    return { ok: true };
  },
});

// ---- missions ---------------------------------------------------------------------------------

const getMission = (db, id) => {
  const m = db.missions.find((x) => x.id === id);
  if (!m) throw E.notFound('Mission');
  return m;
};

function missionGate(db, user, m) {
  if (m.status !== 'live') throw E.state(m.status === 'complete' ? 'This mission has ended.' : 'This mission is not live yet.');
  if (!m.regions.includes(user.country)) throw E.blocked([{ code: 'REGION', message: "This mission isn't running in your country." }]);
  if (m.stats.completions >= m.quantity) throw E.state('All rewards for this mission have been claimed.');
  if (m.eligibility?.minScore && user.stackScore < m.eligibility.minScore) throw E.state(`You need a STACK Score of ${m.eligibility.minScore}+.`);
}

function grantReward(db, user, m) {
  const ref = { kind: 'mission', id: m.id, label: m.title };
  const sponsor = db.sponsors.find((s) => s.id === m.sponsorId);
  if (m.reward.type === 'cash' && m.reward.value) credit(db, user.id, 'sponsor_reward', m.reward.value, ref, `${sponsor.name} mission reward`);
  if (m.reward.type === 'credit' && m.reward.value) credit(db, user.id, 'sponsor_reward', m.reward.value, ref, `${sponsor.name} STACKD credit`, { bucket: 'bonus' });
  const drop = { id: uid('drp'), userId: user.id, missionId: m.id, sponsorId: m.sponsorId, label: m.reward.label, type: m.reward.type, code: `${sponsor.name.slice(0, 4).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, at: Date.now(), status: 'ready' };
  db.drops.push(drop);
  m.stats.completions += 1;
  m.winners.push(user.id);
  const camp = db.campaigns.find((c) => c.id === m.campaignId);
  if (camp) camp.spent += m.reward.value || 2500;
  user.stats.missions += 1;
  evaluateAchievements(db.achievementDefs, user).forEach((a) => notify(db, user.id, { type: 'achievement', title: `Achievement unlocked: ${a.name}`, body: a.blurb, link: '/app/profile' }));
  notify(db, user.id, { type: 'mission', title: `Mission complete: ${m.reward.label}`, body: `${sponsor.name} drop added to your stack.`, link: `/app/missions/${m.id}` });
  return drop;
}

define('missions.list', {
  handler({ db, user }) {
    return {
      missions: db.missions.filter((m) => ['live', 'scheduled', 'complete'].includes(m.status)).sort((a, b) => (a.status !== 'live') - (b.status !== 'live')).map((m) => missionView(db, m, user)),
      drops: db.drops.filter((d) => d.userId === user.id).sort((a, b) => b.at - a.at).map((d) => ({ ...d, sponsor: db.sponsors.find((s) => s.id === d.sponsorId) })),
    };
  },
});

define('missions.get', {
  schema: s.obj({ id: s.str({ max: 60 }) }),
  write: true,
  handler({ db, user }, p) {
    const m = getMission(db, p.id);
    m.stats.views += 1;
    const v = missionView(db, m, user);
    v.myDrop = db.drops.find((d) => d.userId === user.id && d.missionId === m.id) || null;
    v.revealed = m.progress[user.id]?.revealed ? m.progress[user.id].truth : null;
    return v;
  },
});

define('missions.start', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    const m = getMission(db, p.id);
    missionGate(db, user, m);
    const prev = m.progress[user.id];
    if (prev?.completedAt) throw E.conflict("You've already completed this mission.");
    if (!prev) m.stats.starts += 1;
    const game = db.games.find((g) => g.id === m.gameId);
    m.progress[user.id] = {
      startedAt: Date.now(), scans: [], found: false, failed: false,
      secret: m.type === 'hunt' ? live.int(0, m.hunt.size * m.hunt.size - 1) : null,
      truth: m.type === 'in_game' ? simStats(game, m.modeId, skillOf(user, m.gameId)) : null,
    };
    return missionView(db, m, user);
  },
});

define('missions.scan', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }), cell: s.int({ min: 0, max: 400 }) }),
  handler({ db, user }, p) {
    const m = getMission(db, p.id);
    missionGate(db, user, m);
    const pr = m.progress[user.id];
    if (!pr || m.type !== 'hunt') throw E.state('Start the mission first.');
    if (pr.found || pr.failed) throw E.state('This run is over.');
    if (pr.scans.some((x) => x.cell === p.cell)) throw E.invalid('You already scanned there.');
    const n = m.hunt.size;
    const dist = Math.abs((p.cell % n) - (pr.secret % n)) + Math.abs(Math.floor(p.cell / n) - Math.floor(pr.secret / n));
    const heat = dist === 0 ? 'found' : dist <= 1 ? 'burning' : dist <= 2 ? 'hot' : dist <= 4 ? 'warm' : 'cold';
    pr.scans.push({ cell: p.cell, heat });
    let drop = null;
    if (heat === 'found') {
      pr.found = true;
      pr.completedAt = Date.now();
      drop = grantReward(db, user, m);
    } else if (pr.scans.length >= m.hunt.maxScans) {
      pr.failed = true;
    }
    return { heat, mission: missionView(db, m, user), drop, secret: pr.failed ? pr.secret : undefined };
  },
});

define('missions.simulate', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const m = getMission(db, p.id);
    const pr = m.progress[user.id];
    if (!pr?.truth) throw E.state('Start the mission first.');
    pr.revealed = true;
    const game = db.games.find((g) => g.id === m.gameId);
    return { stats: pr.truth, evidence: { type: 'screenshot', name: `${game.slug}-mission-${Date.now().toString(36)}.png`, demo: true } };
  },
});

define('missions.submit', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ id: s.str({ max: 60 }), stats: s.record(), evidence: s.arr(s.obj({ type: s.oneOf(['screenshot', 'video', 'link']), name: s.str({ max: 200 }), demo: s.opt(s.bool()), size: s.opt(s.int({ min: 0 })) }), { min: 1, max: 5 }) }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    const m = getMission(db, p.id);
    missionGate(db, user, m);
    const pr = m.progress[user.id];
    if (!pr?.truth) throw E.state('Start the mission first.');
    if (pr.completedAt) throw E.conflict("You've already completed this mission.");
    const game = db.games.find((g) => g.id === m.gameId);
    const stats = Object.fromEntries(Object.entries(p.stats).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    const ver = verifyReport(game, { startedAt: pr.startedAt }, { stats, evidence: p.evidence }, pr.truth);
    pr.attempts = (pr.attempts || 0) + 1;
    if (ver.status !== 'verified') {
      pr.truth = simStats(game, m.modeId, skillOf(user, m.gameId));
      pr.revealed = false;
      return { status: 'rejected', verification: ver, message: "Your evidence didn't match what you reported. Play another match and try again." };
    }
    if (!meets(stats, m.objective)) {
      pr.truth = simStats(game, m.modeId, skillOf(user, m.gameId));
      pr.revealed = false;
      return { status: 'missed', verification: ver, message: `Not quite: ${m.objective.label.toLowerCase()}. Run it back.` };
    }
    pr.completedAt = Date.now();
    pr.found = true;
    return { status: 'complete', verification: ver, drop: grantReward(db, user, m) };
  },
});

// ---- arcade -----------------------------------------------------------------------------------

const best = (runs, lowerBetter) => runs.reduce((b, r) => (b == null || (lowerBetter ? r.score < b.score : r.score > b.score) ? r : b), null);

function arcadeBoard(db, g) {
  const byUser = new Map();
  for (const r of db.arcadeRuns.filter((x) => x.gameId === g.id && x.status === 'done')) {
    const cur = byUser.get(r.userId);
    if (!cur || (g.lowerBetter ? r.score < cur.score : r.score > cur.score)) byUser.set(r.userId, r);
  }
  return [...byUser.values()].sort((a, b) => (g.lowerBetter ? a.score - b.score : b.score - a.score)).slice(0, 15).map((r, i) => ({ position: i + 1, score: r.score, user: lite(db, r.userId), at: r.at }));
}

define('arcade.list', {
  handler({ db, user }) {
    return db.arcade.map((g) => {
      const mine = db.arcadeRuns.filter((r) => r.gameId === g.id && r.userId === user.id && r.status === 'done');
      return { ...g, myBest: best(mine, g.lowerBetter)?.score ?? null, plays: db.arcadeRuns.filter((r) => r.gameId === g.id).length, top: arcadeBoard(db, g).slice(0, 3) };
    });
  },
});

define('arcade.get', {
  schema: s.obj({ id: s.str({ max: 40 }) }),
  handler({ db, user }, p) {
    const g = db.arcade.find((x) => x.id === p.id);
    if (!g) throw E.notFound('Arcade game');
    const mine = db.arcadeRuns.filter((r) => r.gameId === g.id && r.userId === user.id && r.status === 'done').sort((a, b) => b.at - a.at);
    return { ...g, board: arcadeBoard(db, g), myRuns: mine.slice(0, 10), myBest: best(mine, g.lowerBetter)?.score ?? null };
  },
});

define('arcade.start', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ id: s.str({ max: 40 }), entry: s.int({ min: 0, max: 100000 }) }),
  handler({ db, user }, p) {
    const g = db.arcade.find((x) => x.id === p.id);
    if (!g || g.status !== 'live') throw E.notFound('Arcade game');
    if (!g.entries.includes(p.entry)) throw E.invalid('Pick one of the listed entries.');
    if (p.entry > 0) {
      const gate = evaluate(db, user, 'paid_entry', { amount: p.entry });
      if (!gate.allowed) throw E.blocked(gate.reasons);
    }
    const myBest = best(db.arcadeRuns.filter((r) => r.gameId === g.id && r.userId === user.id && r.status === 'done'), g.lowerBetter)?.score;
    const pool = db.arcadeRuns.filter((r) => r.gameId === g.id && r.userId !== user.id && r.status === 'done');
    const sorted = pool.map((r) => r.score).sort((a, b) => a - b);
    const target = myBest ?? sorted[Math.floor(sorted.length / 2)];
    const ghostRun = pool.sort((a, b) => Math.abs(a.score - target) - Math.abs(b.score - target))[live.int(0, Math.min(4, pool.length - 1))];
    const run = { id: uid('arn'), userId: user.id, gameId: g.id, entry: p.entry, seed: live.int(1, 2 ** 30), status: 'running', at: Date.now(), ghost: { userId: ghostRun.userId, score: ghostRun.score } };
    db.arcadeRuns.push(run);
    if (p.entry > 0) debitEntry(db, user.id, p.entry, { kind: 'arcade', id: run.id, label: g.name }, `${g.name} arcade entry`);
    return { runId: run.id, seed: run.seed, ghost: { user: lite(db, ghostRun.userId), score: ghostRun.score } };
  },
});

define('arcade.finish', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ runId: s.str({ max: 60 }), telemetry: s.any() }),
  handler({ db, user }, p) {
    const run = db.arcadeRuns.find((r) => r.id === p.runId);
    if (!run || run.userId !== user.id) throw E.notFound('Run');
    if (run.status !== 'running') throw E.conflict('This run is already scored.');
    if (Date.now() - run.at > 10 * 60_000) throw E.state('This run expired.');
    const g = db.arcade.find((x) => x.id === run.gameId);
    const t = p.telemetry || {};
    const clip = (arr) => (Array.isArray(arr) ? arr.slice(0, 60).map((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v === 'number'))) : []);
    const result = scoreRun(g.kind, run.seed, { taps: clip(t.taps), hits: clip(t.hits), stops: clip(t.stops) });
    run.score = result.score;
    run.detail = result;
    run.status = 'done';
    const won = g.lowerBetter ? run.score < run.ghost.score : run.score > run.ghost.score;
    const tie = run.score === run.ghost.score;
    run.won = won;
    let payout = 0;
    if (result.suspicious) {
      fraudAlert(db, user.id, { kind: 'arcade_telemetry', severity: 'high', detail: result.suspicious });
      run.flagged = true;
    } else if (run.entry > 0 && (won || tie)) {
      payout = tie ? run.entry : Math.floor(run.entry * g.payoutMult);
      credit(db, user.id, tie ? 'refund' : 'prize', payout, { kind: 'arcade', id: run.id, label: g.name }, tie ? `${g.name}: tie, entry back` : `${g.name} win`);
      if (!tie) user.stats.earnings += payout;
    }
    if (run.entry > 0) db.revenue.push({ at: Date.now(), source: 'arcade', refId: run.id, amount: run.entry - payout });
    run.payout = payout;
    user.stats.arcadeRuns += 1;
    const unlocked = evaluateAchievements(db.achievementDefs, user);
    unlocked.forEach((a) => notify(db, user.id, { type: 'achievement', title: `Achievement unlocked: ${a.name}`, body: a.blurb, link: '/app/profile' }));
    const board = arcadeBoard(db, g);
    return { score: run.score, detail: result, won, tie, payout, flagged: !!run.flagged, ghost: { user: lite(db, run.ghost.userId), score: run.ghost.score }, position: board.find((b) => b.user.id === user.id)?.position || null, unlocked: unlocked.map((a) => a.id) };
  },
});

// ---- staking ("back a player") ------------------------------------------------------------------

define('staking.list', {
  handler({ db, user }) {
    return {
      gate: evaluate(db, user, 'stake'),
      runs: db.stakingRuns.filter((r) => r.status !== 'closed').map((r) => {
        const p = db.users.find((u) => u.id === r.playerId);
        return { ...r, player: pubUser(db, p), game: gameMini(db.games.find((g) => g.id === r.gameId)), mine: db.stakes.filter((s) => s.runId === r.id && s.backerId === user.id) };
      }),
      mine: db.stakes.filter((s) => s.backerId === user.id).sort((a, b) => b.at - a.at).map((s) => ({ ...s, player: lite(db, s.playerId), run: db.stakingRuns.find((r) => r.id === s.runId) })),
    };
  },
});

define('staking.back', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ runId: s.str({ max: 60 }), amount: s.int({ min: 1000, max: 5_000_000 }) }),
  audit: (p) => p.runId,
  handler({ db, user }, p) {
    const gate = evaluate(db, user, 'stake', { amount: p.amount });
    if (!gate.allowed) throw E.blocked(gate.reasons);
    const run = db.stakingRuns.find((r) => r.id === p.runId);
    if (!run || run.status !== 'open') throw E.state('This run is closed to new backers.');
    if (run.playerId === user.id) throw E.invalid("You can't back yourself.");
    const pct = (p.amount / (run.buyIn * run.markup)) * 100;
    if (run.soldPct + pct > run.maxPct + 0.001) throw E.state(`Only ${(run.maxPct - run.soldPct).toFixed(1)}% of this run is left. Try a smaller amount.`);
    const b = balances(db, user.id);
    if (b.available < p.amount) throw E.funds(p.amount);
    const stake = { id: uid('stk'), backerId: user.id, runId: run.id, playerId: run.playerId, amount: p.amount, pct, status: 'active', at: Date.now() };
    db.stakes.push(stake);
    const fromBonus = Math.min(Math.max(0, b.bonus), p.amount);
    if (fromBonus) post(db, { userId: user.id, type: 'stake', amount: -fromBonus, bucket: 'bonus', ref: { kind: 'stake', id: stake.id, label: 'Player backing' }, description: 'Player backing (bonus credit)' });
    if (p.amount - fromBonus) post(db, { userId: user.id, type: 'stake', amount: -(p.amount - fromBonus), ref: { kind: 'stake', id: stake.id, label: 'Player backing' }, description: `Backed ${db.users.find((u) => u.id === run.playerId).username}: ${run.label}` });
    run.soldPct += pct;
    run.status = 'running';
    run.settleAt = Date.now() + 90_000;
    return { stake, run };
  },
});

// ---- predictions --------------------------------------------------------------------------------

define('predictions.list', {
  handler({ db, user }) {
    return {
      gate: evaluate(db, user, 'predict'),
      categories: db.config.predictionCategories,
      markets: db.markets.filter((m) => db.config.predictionCategories[m.category] !== false).sort((a, b) => (a.status !== 'open') - (b.status !== 'open') || a.closesAt - b.closesAt),
      positions: db.positions.filter((x) => x.userId === user.id).sort((a, b) => b.at - a.at).map((x) => ({ ...x, market: db.markets.find((m) => m.id === x.marketId) })),
    };
  },
});

define('predictions.buy', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ marketId: s.str({ max: 60 }), optionId: s.str({ max: 60 }), amount: s.int({ min: 500, max: 2_000_000 }) }),
  audit: (p) => p.marketId,
  handler({ db, user }, p) {
    const gate = evaluate(db, user, 'predict', { amount: p.amount });
    if (!gate.allowed) throw E.blocked(gate.reasons);
    const mk = db.markets.find((m) => m.id === p.marketId);
    if (!mk || mk.status !== 'open' || mk.closesAt <= Date.now()) throw E.state('This market is closed.');
    if (db.config.predictionCategories[mk.category] === false) throw E.blocked([{ code: 'CATEGORY_OFF', message: 'This market category is turned off.' }]);
    const opt = mk.options.find((o) => o.id === p.optionId);
    if (!opt) throw E.invalid('Pick an outcome.');
    const b = balances(db, user.id);
    if (b.available < p.amount) throw E.funds(p.amount);
    const pos = { id: uid('pos'), userId: user.id, marketId: mk.id, optionId: opt.id, optionLabel: opt.label, amount: p.amount, price: opt.price, shares: p.amount / opt.price, status: 'open', at: Date.now() };
    db.positions.push(pos);
    post(db, { userId: user.id, type: 'prediction', amount: -p.amount, ref: { kind: 'market', id: mk.id, label: mk.title }, description: `Prediction: ${opt.label}` });
    mk.volume += p.amount;
    const nudge = Math.min(0.03, p.amount / 2_000_000);
    opt.price = Math.min(0.95, Math.round((opt.price + nudge) * 100) / 100);
    mk.options.filter((o) => o !== opt).forEach((o) => (o.price = Math.max(0.03, Math.round((o.price - nudge / (mk.options.length - 1)) * 100) / 100)));
    return pos;
  },
});

// ---- support ----------------------------------------------------------------------------------

define('support.tickets', {
  handler({ db, user }) {
    return db.tickets.filter((t) => t.userId === user.id).sort((a, b) => b.at - a.at);
  },
});

define('support.create', {
  write: true,
  schema: s.obj({ subject: s.str({ min: 4, max: 80 }), category: s.oneOf(['wallet', 'competitions', 'account', 'fairplay', 'other']), body: s.str({ min: 10, max: 1000 }) }),
  handler({ db, user }, p) {
    const t = { id: uid('tkt'), userId: user.id, subject: p.subject, category: p.category, status: 'open', at: Date.now(), messages: [{ from: 'user', body: p.body, at: Date.now() }] };
    db.tickets.push(t);
    return t;
  },
});

define('support.reply', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }), body: s.str({ min: 1, max: 1000 }) }),
  handler({ db, user }, p) {
    const t = db.tickets.find((x) => x.id === p.id && x.userId === user.id);
    if (!t) throw E.notFound('Ticket');
    t.messages.push({ from: 'user', body: p.body, at: Date.now() });
    t.status = 'open';
    return t;
  },
});
