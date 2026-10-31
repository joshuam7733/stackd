// Prize engine. Pure functions: config in, numbers out. Nothing is hard-coded per game or competition.
//
// config = {
//   model: 'winner_takes_all' | 'placement' | 'team' | 'individual' | 'hybrid' | 'custom',
//   feePct: 10,               platform fee on the gross pool
//   feeFlat: 0,               optional flat fee
//   placements: [50, 30, 20], % of the placement pool per place (placement / team / hybrid)
//   teamSplit: 'equal' | 'performance',
//   killPoolPct: 30,          hybrid: share of net reserved for performance (kills)
//   custom: [{ label, pct }], custom: arbitrary named allocations
//   bonuses: [{ label, amount, fundedBy: 'platform' | 'sponsor' }],
//   sponsorBoost: 0,          added to the pool by a sponsor
//   guaranteed: 0,            minimum net pool the platform tops up to
// }

export const PAYOUT_MODELS = {
  winner_takes_all: { name: 'Winner takes pool', blurb: 'One winner (player or team) takes the full net pool.' },
  placement: { name: 'Placement based', blurb: 'Pool split across finishing places.' },
  team: { name: 'Team based', blurb: 'Placement split by team, then divided between teammates.' },
  individual: { name: 'Individual performance', blurb: 'Paid per elimination from the net pool.' },
  hybrid: { name: 'Hybrid', blurb: 'Part placement, part performance (eliminations).' },
  custom: { name: 'Custom', blurb: 'Named allocations set by an admin.' },
};

const r = (v) => Math.floor(v); // never round prizes up — remainder stays with the platform as dust

export function computePool(cfg, { entry, entrants, teamSize = 1 }) {
  const gross = Math.max(0, entry * entrants) + (cfg.sponsorBoost || 0);
  const fee = r((gross * (cfg.feePct ?? 10)) / 100) + (cfg.feeFlat || 0);
  // Prize pool %: by default everything after the fee is prize money. An admin can set a lower pool %;
  // the gap (reserve) is held by the platform for the season pool (The Big Stack).
  const poolPct = cfg.poolPct ?? 100 - (cfg.feePct ?? 10);
  const reserve = Math.max(0, r((gross * (100 - (cfg.feePct ?? 10) - poolPct)) / 100));
  let net = Math.max(0, gross - fee - reserve);
  let topUp = 0;
  if (cfg.guaranteed && net < cfg.guaranteed) {
    topUp = cfg.guaranteed - net;
    net = cfg.guaranteed;
  }

  const model = cfg.model || 'winner_takes_all';
  const allocations = [];
  let performancePool = 0;

  const placementRows = (pool, places, unit) =>
    places.forEach((pct, i) => {
      const amount = r((pool * pct) / 100);
      allocations.push({
        key: `p${i + 1}`,
        label: ordinal(i + 1) + (unit === 'team' && teamSize > 1 ? ' (team)' : ''),
        place: i + 1,
        pct,
        amount,
        perPlayer: unit === 'team' && teamSize > 1 ? r(amount / teamSize) : amount,
      });
    });

  if (model === 'winner_takes_all') {
    allocations.push({ key: 'p1', label: teamSize > 1 ? 'Winning team' : 'Winner', place: 1, pct: 100, amount: net, perPlayer: r(net / teamSize) });
  } else if (model === 'placement') {
    placementRows(net, cfg.placements || [60, 30, 10], teamSize > 1 ? 'team' : 'player');
  } else if (model === 'team') {
    placementRows(net, cfg.placements || [100], 'team');
  } else if (model === 'individual') {
    performancePool = net;
    allocations.push({ key: 'kills', label: 'Per elimination', pct: 100, amount: net, perPlayer: null, performance: true });
  } else if (model === 'hybrid') {
    const killPct = cfg.killPoolPct ?? 30;
    performancePool = r((net * killPct) / 100);
    // placement percentages are expressed against the whole net pool
    placementRows(net, (cfg.placements || [60, 30, 10]).map((p) => (p * (100 - killPct)) / 100), teamSize > 1 ? 'team' : 'player');
    allocations.push({ key: 'kills', label: 'Elimination pool', pct: killPct, amount: performancePool, perPlayer: null, performance: true });
  } else if (model === 'custom') {
    (cfg.custom || []).forEach((c, i) => allocations.push({ key: `c${i}`, label: c.label, place: c.place || null, pct: c.pct, amount: r((net * c.pct) / 100), perPlayer: null }));
  }

  const allocated = allocations.reduce((a, x) => a + x.amount, 0);
  const bonuses = (cfg.bonuses || []).map((b) => ({ ...b }));
  const pctTotal = allocations.reduce((a, x) => a + x.pct, 0);

  return {
    model,
    entry,
    entrants,
    teamSize,
    gross,
    fee,
    feePct: cfg.feePct ?? 10,
    poolPct,
    reserve,
    net,
    topUp,
    allocations,
    performancePool,
    bonuses,
    dust: Math.max(0, net - allocated),
    valid: Math.abs(pctTotal - 100) < 0.01 || model === 'winner_takes_all',
  };
}

/**
 * Settle a pool against an outcome.
 * outcome.standings: [{ entrantId, place, members: [userId], kills: { userId: n } }]
 * Returns [{ userId, amount, reason }] — the caller writes these to the ledger.
 */
export function settle(cfg, pool, outcome) {
  const payouts = [];
  const add = (userId, amount, reason) => {
    if (amount <= 0) return;
    const ex = payouts.find((p) => p.userId === userId && p.reason === reason);
    if (ex) ex.amount += amount;
    else payouts.push({ userId, amount, reason });
  };

  for (const a of pool.allocations) {
    if (a.performance) continue;
    const st = outcome.standings.find((s) => s.place === a.place);
    if (!st) continue;
    const members = st.members.length ? st.members : [st.entrantId];
    if (cfg.teamSplit === 'performance' && members.length > 1) {
      const k = members.map((m) => (st.kills?.[m] || 0) + 1);
      const tot = k.reduce((x, y) => x + y, 0);
      members.forEach((m, i) => add(m, r((a.amount * k[i]) / tot), `${a.label}`));
    } else {
      members.forEach((m) => add(m, r(a.amount / members.length), `${a.label}`));
    }
  }

  if (pool.performancePool > 0) {
    const all = outcome.standings.flatMap((s) => Object.entries(s.kills || {}));
    const totalKills = all.reduce((x, [, k]) => x + k, 0);
    if (totalKills > 0) {
      const perKill = pool.performancePool / totalKills;
      all.forEach(([userId, k]) => add(userId, r(perKill * k), 'Eliminations'));
    }
  }

  for (const b of pool.bonuses || []) {
    if (b.awardedTo) add(b.awardedTo, b.amount, b.label);
  }
  return payouts;
}

// Bet-on-yourself pricing. Probability comes from the template, adjusted for the player's rating vs the
// mode's typical rating. The platform margin is applied to the fair multiplier.
export function challengeMultiplier(template, playerScore, margin = 0.12) {
  const skillAdj = Math.max(-0.15, Math.min(0.15, (playerScore - 1150) / 2000));
  const p = Math.max(0.05, Math.min(0.85, template.baseProb + skillAdj));
  const fair = 1 / p;
  return Math.max(1.1, Math.round(fair * (1 - margin) * 10) / 10);
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
