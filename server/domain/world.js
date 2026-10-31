// The demo world clock (server-side, every few seconds): demo players accept challenges, lobbies fill,
// lock and play out through the game integration, referees review, payment providers call back.
import { createCompetition } from './models.js';
import { acceptH2H, startPool, finalizePool, finalizeH2H, fillPool, resolveMatchDecision, userOf, gameOf, createH2H, advancePools } from './services/competitions.js';
import { startTournament, advanceBots, humanEntrants, finalizeTournamentH2H, finalizeTournamentBr } from './services/tournaments.js';
import { findOpponents } from './engines/matchmaking.js';
import { paymentProviderFor } from '../payments/index.js';
import { credit, post } from './ledger.js';
import { notify, audit, fraudAlert } from './notify.js';
import { skillOf } from './sim.js';
import { live, MIN, HOUR, DAY } from './util.js';
import { money } from './fmt.js';

const POOL_TEMPLATES = [
  { title: 'Night Drop', gameId: 'codm', modeId: 'br_squad', format: 'team', teamSize: 4, minPlayers: 40, maxPlayers: 100, entry: 5000, prize: { model: 'team', feePct: 10, placements: [50, 25, 15, 10], teamSplit: 'equal' } },
  { title: 'Solo Grind', gameId: 'codm', modeId: 'br_solo', minPlayers: 30, maxPlayers: 100, entry: 3000, prize: { model: 'placement', feePct: 10, placements: [50, 30, 20] } },
  { title: 'Miramar Mayhem', gameId: 'pubgm', modeId: 'classic_squad', format: 'team', teamSize: 4, minPlayers: 40, maxPlayers: 100, entry: 8000, prize: { model: 'hybrid', feePct: 10, placements: [60, 30, 10], killPoolPct: 25, teamSplit: 'equal' } },
  { title: 'Booyah Hour', gameId: 'freefire', modeId: 'br_solo', minPlayers: 20, maxPlayers: 50, entry: 2000, prize: { model: 'placement', feePct: 10, placements: [50, 30, 20] } },
  { title: 'Clash Squad Cup', gameId: 'freefire', modeId: 'br_squad', format: 'team', teamSize: 4, minPlayers: 24, maxPlayers: 48, entry: 4000, prize: { model: 'team', feePct: 10, placements: [60, 30, 10], teamSplit: 'equal' } },
  { title: 'Showdown Sprint', gameId: 'brawl', modeId: 'showdown', minPlayers: 6, maxPlayers: 10, entry: 2000, prize: { model: 'winner_takes_all', feePct: 10 } },
];

function spawnPool(db, now) {
  const t = live.pick(POOL_TEMPLATES);
  const c = createCompetition({ kind: 'pool', createdBy: 'system', ...t, title: `${t.title} #${live.int(10, 99)}`, startsAt: now + live.int(12, 45) * MIN, prize: structuredClone(t.prize) });
  db.competitions.push(c);
  fillPool(db, c, Math.floor(c.maxPlayers * (0.2 + live.next() * 0.3)));
}

function spawnH2H(db, now) {
  const bots = db.users.filter((u) => u.isBot && u.status === 'active');
  const b = live.pick(bots);
  const games = db.games.filter((g) => g.status === 'active' && b.games.includes(g.id) && g.modes.some((m) => m.types.includes('h2h')));
  if (!games.length) return;
  const g = live.pick(games);
  const mode = live.pick(g.modes.filter((m) => m.types.includes('h2h')));
  const platform = g.platforms.find((p) => b.platforms.includes(p)) || g.platforms[0];
  // Same path a player takes: the demo player's entry is debited from their own demo wallet.
  createH2H(db, b, { gameId: g.id, modeId: mode.id, platform, entry: live.pick([2000, 3000, 5000, 5000, 10000, 20000]), type: 'open' });
}

export function tick(db) {
  const now = Date.now();
  let changed = false;
  const step = (fn) => {
    try {
      if (fn() !== false) changed = true;
    } catch (e) {
      console.warn('[world]', e.message);
    }
  };

  // Bots accept H2H challenges
  for (const c of db.competitions) {
    if (c.kind !== 'h2h' || c.status !== 'open' || !c.h2h.botAcceptAt || c.h2h.botAcceptAt > now) continue;
    step(() => {
      delete c.h2h.botAcceptAt;
      let opp = c.h2h.opponentId ? userOf(db, c.h2h.opponentId) : null;
      if (!opp) {
        const challenger = userOf(db, c.h2h.challengerId);
        opp = findOpponents(db.users.filter((u) => u.isBot), challenger, { gameId: c.gameId, platform: c.platform }, db.config.matchmaking)[0]?.user
          || db.users.find((u) => u.isBot && u.id !== challenger.id);
      }
      if (opp?.isBot) acceptH2H(db, opp, c);
    });
  }

  // Bot-only matches settle on their own
  for (const m of db.matches) {
    if (!m.botSettleAt || m.botSettleAt > now || m.status !== 'live') continue;
    step(() => {
      delete m.botSettleAt;
      const comp = db.competitions.find((c) => c.id === m.refId);
      if (m.kind === 'h2h') finalizeH2H(db, comp, m, m.truth.winner, m.truth.score);
      else if (m.kind === 'pool') finalizePool(db, comp, m);
    });
  }

  // Pools: fill gradually, lock on time, then the integration plays them out (countdown → live → result)
  for (const c of db.competitions) {
    if (c.kind !== 'pool' || !['open', 'full'].includes(c.status)) continue;
    if (c.startsAt <= now) {
      step(() => startPool(db, c, { fillTo: Math.max(c.minPlayers, Math.min(c.maxPlayers, c.participants.length + 8)) }));
    } else if (live.chance(0.25) && !c.noAutoFill) {
      const room = c.maxPlayers - c.participants.length;
      const ts = c.format === 'team' ? c.teamSize : 1;
      if (room > ts * 3) step(() => fillPool(db, c, c.participants.length + ts));
    }
  }
  step(() => advancePools(db, now));

  // Tournament reminders: registered players hear about it 10 minutes out
  for (const t of db.tournaments) {
    if (t.status !== 'registration' || t.remindedAt || t.startsAt - now > 10 * MIN) continue;
    step(() => {
      t.remindedAt = now;
      for (const e of humanEntrants(db, t)) e.members.filter((m) => !userOf(db, m)?.isBot).forEach((m) => notify(db, m, { type: 'tournament', title: `${t.name} starts soon`, body: 'Check in and be ready for round one.', link: `/app/tournaments/${t.id}` }));
    });
  }

  // Referee review queue (demo referee acts after ~25s)
  for (const m of db.matches) {
    if (m.status !== 'verifying' || !m.reviewSince || now - m.reviewSince < 25_000) continue;
    if (m.pendingResult) {
      step(() => {
        delete m.reviewSince;
        resolveMatchDecision(db, m, { approve: true }, 'Referee reviewed the integration result: confirmed.', 'Referee Amara');
      });
      continue;
    }
    step(() => {
      const uidr = Object.keys(m.reports)[0];
      const rep = m.reports[uidr];
      const truth = m.truth?.[uidr];
      const honest = !truth || Object.entries(rep.stats).every(([k, v]) => truth[k] == null || Math.abs(truth[k] - v) <= (k === 'damage' ? 50 : 0));
      const note = honest ? 'Evidence reviewed: result confirmed.' : 'Evidence shows a different result. Settled on what the evidence shows.';
      delete m.reviewSince;
      if (m.kind === 'tournament' && m.tournament?.br) {
        const tour = db.tournaments.find((t) => t.id === m.refId);
        finalizeTournamentBr(db, tour, m, honest ? rep.stats : truth);
      } else {
        resolveMatchDecision(db, m, { approve: honest }, note, 'Referee Amara');
      }
      notify(db, uidr, { type: 'review', title: honest ? 'Referee confirmed your result' : 'Referee corrected your result', body: note, link: `/app/match/${m.id}` });
    });
  }

  // Disputes that involve a real player get a demo referee decision after ~40s
  for (const d of db.disputes) {
    if (!['open', 'under_review'].includes(d.status)) continue;
    const m = db.matches.find((x) => x.id === d.matchId);
    if (!m || !m.truth?.winner) continue;
    const humanInvolved = m.players.some((p) => userOf(db, p) && !userOf(db, p).isBot);
    if (!humanInvolved) continue;
    if (d.status === 'open' && now - d.createdAt > 8000) {
      d.status = 'under_review';
      d.history.push({ at: now, text: 'Referee Amara is reviewing the evidence' });
      changed = true;
      continue;
    }
    if (now - d.createdAt < 40_000) continue;
    step(() => {
      const winner = userOf(db, m.truth.winner);
      const note = `Evidence reviewed. ${winner.username} won ${m.truth.score}.`;
      d.status = d.raisedBy === m.truth.winner ? 'resolved' : 'rejected';
      d.resolution = { decision: `${winner.username} wins`, note, by: 'Referee Amara', at: now };
      d.history.push({ at: now, text: `Referee: ${winner.username} wins` });
      const liar = m.players.find((p) => p !== m.truth.winner && m.reports[p]?.outcome === 'win');
      if (liar && !userOf(db, liar)?.isBot) fraudAlert(db, liar, { kind: 'false_report', severity: 'medium', detail: `Reported a win the evidence contradicts (${m.id})` });
      if (m.kind === 'tournament') finalizeTournamentH2H(db, db.tournaments.find((t) => t.id === m.refId), m, m.truth.winner, note);
      else resolveMatchDecision(db, m, { winnerId: m.truth.winner }, note, 'Referee Amara');
      m.players.forEach((p) => notify(db, p, { type: 'dispute', title: 'Dispute decided', body: note, link: `/app/disputes/${d.id}` }));
    });
  }

  // Tournaments
  for (const t of db.tournaments) {
    if (t.status === 'registration' && t.startsAt <= now) step(() => startTournament(db, t));
    else if (t.status === 'live' && !humanEntrants(db, t).length && now - (t.lastStepAt || 0) > 40_000) step(() => advanceBots(db, t, 1));
  }

  // Keep the lobby list fresh
  const openPools = db.competitions.filter((c) => c.kind === 'pool' && c.status === 'open').length;
  if (openPools < 7) step(() => spawnPool(db, now));
  const openH2H = db.competitions.filter((c) => c.kind === 'h2h' && c.status === 'open' && !c.h2h.opponentId).length;
  if (openH2H < 9) step(() => spawnH2H(db, now));
  if (!db.tournaments.some((t) => t.status === 'registration' && t.startsAt - now < 3 * HOUR)) {
    step(() => {
      const base = db.tournaments.find((t) => t.name.startsWith('Tekken Tuesday')) || db.tournaments[0];
      db.tournaments.push({ ...structuredClone(base), id: `trn_${now.toString(36)}`, name: `Quick Cup #${live.int(10, 99)}`, gameId: 'codm', modeId: 'gunfight', platform: 'mobile', format: 'single_elim', teamSize: 1, maxEntrants: 8, entry: 3000, status: 'registration', entrants: [], bracket: null, results: null, remindedAt: null, endedAt: null, lastStepAt: null, bigStack: false, bigStackPoints: null, createdAt: now, rules: ['First to 3 rounds', 'Report within 30 minutes'], startsAt: now + 45 * MIN, registrationDeadline: now + 40 * MIN, featured: false, sponsorId: null, guaranteed: 0, prize: { model: 'placement', feePct: 10, placements: [70, 30] } });
    });
  }

  // Payment provider callbacks for deposits (DemoPaymentProvider in DEMO MODE)
  for (const t of db.ledger) {
    if (t.status !== 'pending' || t.type !== 'deposit' || !t.meta.completeAt || t.meta.completeAt > now) continue;
    step(() => {
      const out = paymentProviderFor(db, t.provider).verifyDeposit(t, now);
      if (out.status === 'pending') return false;
      t.status = out.status;
      t.updatedAt = now;
      t.meta.providerRef = out.providerRef || null;
      t.meta.providerMessage = out.message;
      notify(db, t.userId, out.status === 'completed'
        ? { type: 'deposit', title: `Deposit received: ${money(t.amount)}`, body: 'Your stack is topped up.', link: `/app/wallet/tx/${t.id}` }
        : { type: 'deposit', title: 'Deposit failed', body: `${out.message} Nothing was taken from your account.`, link: `/app/wallet/tx/${t.id}` });
    });
  }

  // Withdrawals: the demo ops team clears the human player's withdrawals after ~60s if an admin hasn't
  for (const t of db.ledger) {
    if (t.status !== 'pending' || t.type !== 'withdrawal') continue;
    const u = userOf(db, t.userId);
    if (!u || u.isBot || now - t.createdAt < 60_000) continue;
    step(() => {
      const out = paymentProviderFor(db, t.provider).verifyWithdrawal(t, now);
      if (out.status === 'pending') return false;
      t.status = out.status;
      t.updatedAt = now;
      t.meta.providerRef = out.providerRef;
      t.meta.providerMessage = out.message;
      t.meta.reviewedBy = 'Ops (auto, demo)';
      notify(db, t.userId, { type: 'withdrawal', title: `Withdrawal sent: ${money(-t.amount)}`, body: 'Simulated payout. No money moved.', link: `/app/wallet/tx/${t.id}` });
      audit(db, 'system', 'wallet.withdrawal.auto_approve', t.id);
    });
  }

  // Staking runs settle ~90s after a real player backs them
  for (const run of db.stakingRuns) {
    if (run.status !== 'running' || run.settleAt > now) continue;
    step(() => {
      const p = userOf(db, run.playerId);
      const won = live.chance(0.3 + skillOf(p, run.gameId) * 0.4);
      const mult = won ? live.pick([1.6, 2.2, 3, 4.5]) : 0;
      run.status = won ? 'won' : 'lost';
      run.result = { won, winnings: Math.round(run.buyIn * mult), at: now };
      for (const s of db.stakes.filter((x) => x.runId === run.id && x.status === 'active')) {
        const back = Math.floor((run.result.winnings * s.pct) / 100);
        s.status = back > 0 ? 'won' : 'lost';
        s.payout = back;
        if (back > 0) credit(db, s.backerId, 'stake_return', back, { kind: 'stake', id: s.id, label: `Backing ${p.username}` }, `Return from backing ${p.username}`);
        notify(db, s.backerId, { type: 'stake', title: back > 0 ? `${p.username} cashed: you got ${money(back)}` : `${p.username} came up short`, body: run.label, link: '/app/players' });
      }
    });
  }

  // Prediction markets close and resolve
  for (const mk of db.markets) {
    if (mk.status === 'open' && mk.closesAt <= now) {
      mk.status = 'closed';
      changed = true;
    } else if (mk.status === 'closed' && now - mk.closesAt > 30_000) {
      step(() => {
        let roll = live.next() * mk.options.reduce((a, o) => a + o.price, 0);
        const win = mk.options.find((o) => (roll -= o.price) <= 0) || mk.options[0];
        resolveMarket(db, mk, win.id);
      });
    }
  }

  // Bots respond to friend requests and team invites from real players
  for (const u of db.users) {
    if (!u.isBot || !u.friendRequests.length) continue;
    step(() => {
      for (const from of u.friendRequests.splice(0)) {
        const f = userOf(db, from);
        if (!f) continue;
        if (!u.friends.includes(from)) u.friends.push(from);
        if (!f.friends.includes(u.id)) f.friends.push(u.id);
        notify(db, from, { type: 'friend', title: `${u.username} accepted your friend request`, body: 'You can send them direct challenges now.', link: `/app/u/${u.username}` });
      }
    });
  }
  for (const t of db.teams) {
    for (const inv of t.invites.filter((i) => userOf(db, i.userId)?.isBot && now - i.at > 6000)) {
      step(() => {
        t.invites = t.invites.filter((x) => x !== inv);
        if (!t.members.some((m) => m.userId === inv.userId)) t.members.push({ userId: inv.userId, role: 'member', joinedAt: now });
        notify(db, inv.by, { type: 'team', title: `${userOf(db, inv.userId).username} joined ${t.name}`, body: 'Your squad just got deeper.', link: `/app/teams/${t.id}` });
      });
    }
  }

  // The Big Stack grows only from real platform revenue: a share of every fee actually earned.
  if (db.bigStack) {
    const b = db.bigStack;
    const fresh = db.revenue.slice(b.revenueCursor || 0).filter((r) => r.source !== 'history' && r.amount > 0);
    b.revenueCursor = db.revenue.length;
    const add = fresh.reduce((a, r) => a + r.amount, 0) * (b.contributionPct / 100);
    if (add > 0) {
      b.contributedUGX += Math.round(add);
      changed = true;
    }
  }

  // KYC provider callback (demo: ~20s) and delayed limit increases
  for (const u of db.users) {
    if (u.isBot) continue;
    if (u.kyc?.status === 'pending' && now - (u.kyc.submittedAt || 0) > 20_000) {
      step(() => {
        u.kyc = { ...u.kyc, status: 'verified', level: 2, reviewedAt: now };
        notify(db, u.id, { type: 'kyc', title: "You're verified", body: 'Withdrawals and higher limits are unlocked.', link: '/app/settings' });
      });
    }
    if (u.limits?.pending && u.limits.pending.effectiveAt <= now) {
      step(() => {
        const { effectiveAt, ...next } = u.limits.pending;
        Object.assign(u.limits, next);
        u.limits.pending = null;
      });
    }
  }

  // Presence + housekeeping (demo players drift on and offline about once a minute)
  if (live.chance(0.04)) {
    const b = live.pick(db.users.filter((u) => u.isBot));
    b.online = !b.online;
    changed = true;
  }
  if (live.chance(0.05)) {
    for (const [k, v] of Object.entries(db.idempotency)) if (now - v.at > DAY) delete db.idempotency[k];
  }
  return changed;
}

export function resolveMarket(db, mk, optionId) {
  mk.status = 'resolved';
  mk.resolution = optionId;
  mk.resolvedAt = Date.now();
  for (const pos of db.positions.filter((p) => p.marketId === mk.id && p.status === 'open')) {
    const won = pos.optionId === optionId;
    pos.status = won ? 'won' : 'lost';
    pos.payout = won ? Math.floor(pos.shares) : 0;
    if (won) credit(db, pos.userId, 'prediction_payout', pos.payout, { kind: 'market', id: mk.id, label: mk.title }, `Prediction paid: ${mk.title}`);
    notify(db, pos.userId, { type: 'prediction', title: won ? `Called it: +${money(pos.payout)}` : 'Prediction settled', body: mk.title, link: '/app/predictions' });
  }
}
