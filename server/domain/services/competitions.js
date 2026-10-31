// Competition lifecycle: create → join → lock (countdown) → live → result → verify → settle
// (or dispute / cancel). Every seat in every competition is paid from a real wallet on the ledger — demo
// players included — so prize pools, platform fees and payouts always reconcile to the cent.
import { createCompetition, createMatch, createDispute } from '../models.js';
import { E } from '../errors.js';
import { evaluate, fraudSignals } from '../engines/compliance.js';
import { computePool, settle, challengeMultiplier } from '../engines/prize.js';
import { verifyReport } from '../engines/verification.js';
import { h2hDelta, placementDelta, challengeDelta, applyScore, recordResult, consistencyBonus } from '../engines/rating.js';
import { findOpponents } from '../engines/matchmaking.js';
import { evaluateAchievements } from '../engines/achievements.js';
import { debitEntry, refundRef, credit, balances, post } from '../ledger.js';
import { notify, feed, fraudAlert } from '../notify.js';
import { simStats, simH2H, simField, skillOf, meets, modeOf, statsSayWin } from '../sim.js';
import { trackMissionProgress } from './missions.js';
import { integrationFor } from '../../integrations/index.js';
import { uid, live, MIN } from '../util.js';
import { money, ordinal } from '../fmt.js';

export const gameOf = (db, id) => db.games.find((g) => g.id === id);
export const userOf = (db, id) => db.users.find((u) => u.id === id);
const refOf = (comp) => ({ kind: 'competition', id: comp.id, label: comp.title });
const linkFor = (comp) => `/app/compete/${comp.id}`;
const isHuman = (db, id) => {
  const u = userOf(db, id);
  return !!u && !u.isBot;
};

// ---------------------------------------------------------------------------------------------
// Money in

/** Demo players never run dry: they get a labelled demo top-up when their wallet can't cover a seat. */
export function ensureBotFunds(db, user, amount) {
  if (!user?.isBot || amount <= 0) return;
  if (balances(db, user.id).available >= amount) return;
  post(db, { userId: user.id, type: 'bonus', amount: Math.max(100_000, amount * 5), description: 'Demo top-up (practice account)', meta: { demo: true, bot: true } });
}

/** Charge one payer for `seats` seats. Returns the amount charged. */
export function payEntry(db, payer, comp, seats, description) {
  const amount = comp.entry * seats;
  if (amount <= 0) return 0;
  ensureBotFunds(db, payer, amount);
  debitEntry(db, payer.id, amount, refOf(comp), description);
  return amount;
}

function seat(db, comp, userId, f = {}) {
  const u = userOf(db, userId);
  if (u) u.stats.competitions = (u.stats.competitions || 0) + 1;
  comp.participants.push({ userId, teamId: f.teamId || null, squadName: f.squadName || null, joinedAt: Date.now(), status: 'in', paid: f.paid || 0, paidBy: f.paidBy || null, fill: !!f.fill });
}

// ---------------------------------------------------------------------------------------------
// Pools & projections

export function entrantsOf(db, comp) {
  if (comp.format !== 'team') {
    return comp.participants.map((p) => ({ entrantId: p.userId, name: userOf(db, p.userId)?.username || p.name || 'Player', members: [p.userId] }));
  }
  const map = new Map();
  for (const p of comp.participants) {
    const id = p.teamId || p.userId;
    if (!map.has(id)) map.set(id, { entrantId: id, name: p.squadName || db.teams.find((t) => t.id === id)?.name || 'Squad', members: [] });
    map.get(id).members.push(p.userId);
  }
  return [...map.values()];
}

export function poolFor(comp, players) {
  const n = players ?? comp.participants.length;
  if (comp.kind === 'challenge') return null;
  const teamSize = comp.format === 'team' ? comp.teamSize : 1;
  return computePool(comp.prize, { entry: comp.entry * teamSize, entrants: Math.max(0, Math.floor(n / teamSize)), teamSize });
}

// ---------------------------------------------------------------------------------------------
// Gates

export function gate(db, user, comp, game) {
  if (!game || game.status !== 'active') throw E.state(`${game?.short || 'This game'} isn't available right now.`);
  if (!game.regions.includes(user.country)) throw E.blocked([{ code: 'REGION', message: `${game.short} competitions aren't available in your country yet.` }]);
  const res = evaluate(db, user, comp.entry > 0 ? 'paid_entry' : 'free_entry', { amount: comp.entry, game, competition: comp });
  if (!res.allowed) throw E.blocked(res.reasons);
  return res;
}

// ---------------------------------------------------------------------------------------------
// Results shared by every competition type

/**
 * Apply one verified result to one player: W/L + streak, STACK Score (with consistency), season points,
 * prize credit, achievements, missions and notifications.
 */
export function finishFor(db, user, { gameId, won, delta, payout, ref, label, link, place, field, kills, matchId, reason, quiet }) {
  const consistency = consistencyBonus(user, won);
  const streakBonus = recordResult(user, won);
  const total = delta + streakBonus + consistency;
  applyScore(user, gameId, total, won, { db, matchId, reason: reason || label });
  user.stats.seasonPoints = (user.stats.seasonPoints || 0) + Math.max(0, total) + (won ? 10 : 2);
  if (payout > 0) {
    credit(db, user.id, 'prize', payout, ref, `Prize: ${label}`);
    user.stats.earnings += payout;
  }
  const unlocked = evaluateAchievements(db.achievementDefs, user);
  if (!user.isBot) {
    if (!quiet) notify(db, user.id, won
      ? { type: 'prize', title: payout ? `You won ${money(payout)} DEMO` : 'You won', body: payout ? `${label}: prize credited to your wallet.` : label, link }
      : { type: 'result', title: 'You lost this one', body: `${label}: ${place ? `${ordinal(place)} place` : 'not this time'}. Run it back.`, link });
    unlocked.forEach((a) => notify(db, user.id, { type: 'achievement', title: `Achievement unlocked: ${a.name}`, body: a.blurb, link: '/app/profile' }));
    fraudSignals(db, user, { type: won ? 'win' : 'loss' }).forEach((a) => fraudAlert(db, user.id, a));
    trackMissionProgress(db, user, { gameId, won, place, field, kills, payout });
  }
  return { won, delta: total, streakBonus, consistency, payout, place: place || null, unlocked: unlocked.map((a) => a.id) };
}

function markEntry(comp, userId, res) {
  const p = comp.participants.find((x) => x.userId === userId);
  if (!p) return;
  p.placement = res.place || null;
  p.result = res.won ? 'won' : 'lost';
  p.winnings = res.payout || 0;
}

function settleMatch(db, comp, match) {
  match.status = 'settled';
  match.settledAt = Date.now();
  comp.status = 'settled';
  comp.endedAt = match.settledAt;
  match.timeline.push({ at: Date.now(), text: 'Settled and paid out' });
}

// ---------------------------------------------------------------------------------------------
// Challenges (bet on yourself) — the platform is the counterparty

export function createChallenge(db, user, { templateId, entry, platform }) {
  const tpl = db.challengeTemplates.find((t) => t.id === templateId);
  if (!tpl) throw E.notFound('Challenge');
  const game = gameOf(db, tpl.gameId);
  const mode = modeOf(game, tpl.modeId);
  if (!game.platforms.includes(platform)) throw E.invalid(`${game.short} isn't supported on that platform.`);
  const { min, max } = db.config.challengeEntry;
  if (entry !== 0 && (entry < min || entry > max)) throw E.invalid(`Entry must be between ${money(min)} and ${money(max)}.`);
  const score = user.gameScores[game.id]?.score ?? user.stackScore;
  const multiplier = challengeMultiplier(tpl, score, db.config.challengeMargin);

  const comp = createCompetition({
    kind: 'challenge', title: tpl.title, gameId: game.id, modeId: mode.id, platform, entry,
    minPlayers: 1, maxPlayers: 1, visibility: 'private', createdBy: user.id,
    challenge: { templateId, metric: tpl.metric, op: tpl.op, target: tpl.target, multiplier, payout: Math.floor(entry * multiplier) },
    rules: game.rules,
  });
  gate(db, user, comp, game);
  db.competitions.push(comp);
  const paid = payEntry(db, user, comp, 1, `${tpl.title} (${game.short}) entry`);
  seat(db, comp, user.id, { paid, paidBy: user.id });
  comp.status = 'live';

  const match = createMatch({ kind: 'challenge', refId: comp.id, gameId: game.id, modeId: mode.id, players: [user.id] });
  integrationFor(db, game, { automatic: false }).createMatch(match, { game, mode, players: [user.id], skills: [skillOf(user, game.id)] });
  db.matches.push(match);
  comp.matchId = match.id;
  notify(db, user.id, { type: 'joined', title: `Challenge on: ${tpl.title}`, body: `${money(entry)} DEMO in, ${money(comp.challenge.payout)} DEMO if you hit it.`, link: `/app/match/${match.id}` });
  return { competitionId: comp.id, matchId: match.id };
}

export function finalizeChallenge(db, comp, match, stats, note) {
  const user = userOf(db, comp.participants[0].userId);
  const hit = meets(stats, comp.challenge);
  const payout = hit ? comp.challenge.payout : 0;
  const delta = challengeDelta(user, hit, comp.challenge.multiplier);
  const res = finishFor(db, user, { gameId: comp.gameId, won: hit, delta, payout, ref: refOf(comp), label: comp.title, link: `/app/match/${match.id}`, matchId: match.id, kills: stats.kills });
  markEntry(comp, user.id, res);
  match.outcome = { hit, stats, perUser: { [user.id]: res }, note: note || null };
  db.revenue.push({ at: Date.now(), source: 'challenge', refId: comp.id, amount: comp.entry - payout });
  settleMatch(db, comp, match);
  if (payout) feed(db, { userId: user.id, gameId: comp.gameId, amount: payout, text: `hit "${comp.title}"` });
  return res;
}

// ---------------------------------------------------------------------------------------------
// Head-to-head

export function createH2H(db, user, p) {
  const game = gameOf(db, p.gameId);
  if (!game) throw E.notFound('Game');
  const mode = modeOf(game, p.modeId);
  if (!mode.types.includes('h2h')) throw E.invalid(`${mode.name} doesn't support head-to-head.`);
  if (!game.platforms.includes(p.platform)) throw E.invalid(`${game.short} isn't supported on that platform.`);
  const { min, max } = db.config.h2hEntry;
  if (p.entry !== 0 && (p.entry < min || p.entry > max)) throw E.invalid(`Entry must be between ${money(min)} and ${money(max)}.`);

  let opponentId = p.opponentId || null;
  if (['direct', 'friend'].includes(p.type)) {
    if (!opponentId) throw E.invalid('Pick who you want to challenge.');
    if (opponentId === user.id) throw E.invalid("You can't challenge yourself.");
    const opp = userOf(db, opponentId);
    if (!opp || opp.role !== 'player') throw E.notFound('Player');
    if (p.type === 'friend' && !user.friends.includes(opponentId)) throw E.forbidden('Friend challenges are for people on your friends list.');
  }
  if (p.type === 'skill') {
    const recent = db.matches.filter((m) => m.kind === 'h2h' && m.players.includes(user.id)).slice(-10).flatMap((m) => m.players);
    const best = findOpponents(db.users, user, { gameId: game.id, platform: p.platform }, db.config.matchmaking, recent)[0];
    if (!best) throw E.state('No one at your level is around for this game right now. Try an open challenge.');
    opponentId = best.user.id;
  }

  const comp = createCompetition({
    kind: 'h2h', title: `${game.short} ${mode.name}`, gameId: game.id, modeId: mode.id, platform: p.platform,
    entry: p.entry, minPlayers: 2, maxPlayers: 2, createdBy: user.id,
    prize: { model: 'winner_takes_all', feePct: db.config.h2hFeePct },
    visibility: p.type === 'private' ? 'private' : p.type === 'friend' ? 'friends' : 'public',
    code: p.type === 'private' ? Math.random().toString(36).slice(2, 8).toUpperCase() : null,
    h2h: { type: p.type, challengerId: user.id, opponentId, bestOf: p.bestOf || 1, rematchOf: p.rematchOf || null, note: p.note || '' },
    rules: game.rules,
  });
  if (!user.isBot) gate(db, user, comp, game);
  db.competitions.push(comp);
  const paid = payEntry(db, user, comp, 1, `${comp.title} head-to-head entry`);
  seat(db, comp, user.id, { paid, paidBy: user.id });

  if (opponentId) {
    const opp = userOf(db, opponentId);
    if (opp.isBot) comp.h2h.botAcceptAt = Date.now() + live.int(3, 7) * 1000;
    else notify(db, opp.id, { type: 'challenge', title: `${user.username} challenged you`, body: `${comp.title} for ${money(p.entry)} DEMO`, link: linkFor(comp) });
  } else if (p.type === 'open' && !user.isBot) {
    comp.h2h.botAcceptAt = Date.now() + live.int(8, 16) * 1000;
  }
  return comp;
}

export function acceptH2H(db, user, comp) {
  if (comp.participants.some((x) => x.userId === user.id)) throw E.conflict("You're already in this one.");
  if (comp.participants.length >= comp.maxPlayers) throw E.state('This challenge already has two players.');
  if (comp.h2h.opponentId && comp.h2h.opponentId !== user.id) throw E.forbidden('This challenge was sent to someone else.');
  if (comp.h2h.type === 'friend' && !userOf(db, comp.h2h.challengerId).friends.includes(user.id)) throw E.forbidden('Only friends can take this challenge.');
  if (!user.isBot) gate(db, user, comp, gameOf(db, comp.gameId));
  const paid = payEntry(db, user, comp, 1, `${comp.title} head-to-head entry`);
  comp.h2h.opponentId = user.id;
  seat(db, comp, user.id, { paid, paidBy: user.id });
  notify(db, user.id, { type: 'joined', title: `You're in: ${comp.title}`, body: `${money(comp.entry)} DEMO entry recorded.`, link: linkFor(comp) });
  return startH2H(db, comp);
}

export function startH2H(db, comp) {
  const game = gameOf(db, comp.gameId);
  const a = userOf(db, comp.h2h.challengerId);
  const b = userOf(db, comp.h2h.opponentId);
  comp.status = 'live';
  const match = createMatch({ kind: 'h2h', refId: comp.id, gameId: game.id, modeId: comp.modeId, players: [a.id, b.id] });
  integrationFor(db, game, { automatic: false }).createMatch(match, { game, mode: modeOf(game, comp.modeId), players: [a.id, b.id], skills: [skillOf(a, game.id), skillOf(b, game.id)] });
  match.timeline.push({ at: Date.now(), text: `${b.username} accepted` });
  db.matches.push(match);
  comp.matchId = match.id;
  if (!a.isBot) notify(db, a.id, { type: 'accepted', title: `${b.username} accepted. Match starting.`, body: comp.title, link: `/app/match/${match.id}` });
  if (!b.isBot) notify(db, b.id, { type: 'match', title: `Match starting: you vs ${a.username}`, body: comp.title, link: `/app/match/${match.id}` });

  const today = db.matches.filter((m) => m.kind === 'h2h' && m.createdAt > Date.now() - 86400000 && m.players.includes(a.id) && m.players.includes(b.id)).length;
  for (const u of [a, b]) if (!u.isBot) fraudSignals(db, u, { type: 'h2h_repeat', count: today }).forEach((al) => fraudAlert(db, u.id, al));

  // bot-vs-bot challenges settle on their own a few minutes later
  if (a.isBot && b.isBot) match.botSettleAt = Date.now() + live.int(2, 6) * MIN;
  return match;
}

export function reportH2H(db, user, match, comp, stats, evidence) {
  const outcome = statsSayWin(stats) ? 'win' : 'loss';
  match.reports[user.id] = { stats, outcome, evidence, at: Date.now() };
  match.timeline.push({ at: Date.now(), text: `${user.username} reported a ${outcome}` });
  for (const pid of match.players) {
    const other = userOf(db, pid);
    if (pid !== user.id && other.isBot && !match.reports[pid]) {
      const t = match.truth[pid];
      match.reports[pid] = { stats: t, outcome: match.truth.winner === pid ? 'win' : 'loss', evidence: [{ type: 'screenshot', name: 'result.png', demo: true }], at: Date.now() + 1500 };
      match.timeline.push({ at: Date.now() + 1500, text: `${other.username} reported a ${match.reports[pid].outcome}` });
    }
  }
  const [a, b] = match.players;
  const ra = match.reports[a];
  const rb = match.reports[b];
  if (!ra || !rb) {
    match.status = 'reporting';
    const other = match.players.find((x) => x !== user.id);
    notify(db, other, { type: 'match', title: `${user.username} reported the result`, body: `${comp.title}: report yours to settle it.`, link: `/app/match/${match.id}` });
    return { status: 'waiting' };
  }
  if ((ra.outcome === 'win') !== (rb.outcome === 'win')) {
    const winnerId = ra.outcome === 'win' ? a : b;
    match.timeline.push({ at: Date.now(), text: 'Reports agree' });
    finalizeH2H(db, comp, match, winnerId, `${headline(ra.stats, ra.outcome)}–${headline(rb.stats, rb.outcome)}`);
    return { status: 'settled' };
  }
  openDispute(db, match, comp, user.id, { reason: 'wrong_result', details: 'Both players reported the same outcome. Sent to a referee automatically.', evidence: evidence || [] });
  return { status: 'disputed' };
}

// The number that decides a head-to-head, from one side's stat line.
function headline(stats, outcome) {
  return stats.goals ?? stats.rounds ?? stats.crowns ?? stats.kills ?? (outcome === 'win' ? 'W' : 'L');
}

/** score is always "challenger–opponent" (players[0]–players[1]). */
export function finalizeH2H(db, comp, match, winnerId, score, note) {
  const [aId, bId] = match.players;
  const a = userOf(db, aId);
  const b = userOf(db, bId);
  const pool = computePool(comp.prize, { entry: comp.entry, entrants: 2 });
  const payout = pool.allocations[0]?.amount || 0;
  const [da, dbb] = h2hDelta(a, b, winnerId === aId);
  const perUser = {};
  for (const [u, d] of [[a, da], [b, dbb]]) {
    const won = u.id === winnerId;
    perUser[u.id] = finishFor(db, u, { gameId: comp.gameId, won, delta: d, payout: won ? payout : 0, ref: refOf(comp), label: comp.title, link: `/app/match/${match.id}`, place: won ? 1 : 2, field: 2, matchId: match.id });
    markEntry(comp, u.id, perUser[u.id]);
  }
  match.outcome = { winnerId, score, pool, perUser, note: note || null };
  db.revenue.push({ at: Date.now(), source: 'h2h', refId: comp.id, amount: pool.fee + pool.dust });
  comp.result = { winnerId, score };
  settleMatch(db, comp, match);
  feed(db, { userId: winnerId, gameId: comp.gameId, amount: payout, text: `beat ${userOf(db, winnerId === aId ? bId : aId).username} ${score}` });
}

// ---------------------------------------------------------------------------------------------
// Battle royale pools

const SQUAD_A = ['Rogue', 'Night', 'Iron', 'Wild', 'Zero', 'Ghost', 'Storm', 'Lucky', 'Savage', 'Silent', 'Red', 'Bush'];
const SQUAD_B = ['Unit', 'Five', 'Pack', 'Crew', 'Squad', 'Gang', 'Collective', 'Syndicate', 'Mob', 'Cartel'];

/** Demo players available for a pool, preferring people who actually play the game. */
function freeBots(db, comp, exclude = new Set()) {
  const inComp = new Set(comp.participants.map((p) => p.userId));
  const pool = db.users.filter((u) => u.isBot && u.status === 'active' && !inComp.has(u.id) && !exclude.has(u.id));
  const plays = pool.filter((u) => u.games.includes(comp.gameId)).sort(() => live.next() - 0.5);
  const rest = pool.filter((u) => !u.games.includes(comp.gameId)).sort(() => live.next() - 0.5);
  return [...plays, ...rest];
}

export function joinPool(db, user, comp, teamId) {
  if (comp.participants.some((x) => x.userId === user.id)) throw E.conflict("You're already in.");
  gate(db, user, comp, gameOf(db, comp.gameId));
  const size = comp.format === 'team' ? comp.teamSize : 1;
  let mates = []; // STACKD teammates the captain pays for
  let squadId = null;
  let squadName = null;
  if (comp.format === 'team') {
    if (teamId) {
      const team = db.teams.find((t) => t.id === teamId);
      if (!team || !team.members.some((m) => m.userId === user.id)) throw E.forbidden("You're not on that team.");
      if (comp.participants.some((x) => x.teamId === teamId)) throw E.conflict('Your team is already in.');
      squadId = team.id;
      squadName = team.name;
      mates = team.members.map((m) => m.userId).filter((id) => id !== user.id && !comp.participants.some((x) => x.userId === id)).slice(0, size - 1);
    } else {
      squadId = uid('sq');
      squadName = `${user.username}'s squad`;
    }
  }
  const fillers = freeBots(db, comp, new Set([user.id, ...mates])).slice(0, size - 1 - mates.length);
  const seats = 1 + mates.length + fillers.length;
  if (comp.participants.length + seats > comp.maxPlayers) throw E.state(size > 1 ? 'Not enough slots left for your squad.' : 'This lobby is full.');
  if (seats < size) throw E.state('Not enough players are around to complete your squad right now.');

  // The player pays their own seat, plus their STACKD teammates' seats when entering as a team.
  const own = 1 + mates.length;
  const paid = payEntry(db, user, comp, own, own > 1 ? `${comp.title} entry (${own} seats for ${squadName})` : `${comp.title} entry`);
  seat(db, comp, user.id, { teamId: squadId, squadName, paid: paid / own, paidBy: user.id });
  for (const id of mates) {
    seat(db, comp, id, { teamId: squadId, squadName, paid: paid / own, paidBy: user.id });
    notify(db, id, { type: 'joined', title: `${user.username} entered ${squadName} in ${comp.title}`, body: 'Your seat is paid by your captain.', link: linkFor(comp) });
  }
  // Solo-queue fillers are independent demo players who pay for their own seats.
  for (const b of fillers) seat(db, comp, b.id, { teamId: squadId, squadName, paid: payEntry(db, b, comp, 1, `${comp.title} entry`), paidBy: b.id, fill: true });
  if (comp.participants.length >= comp.maxPlayers) comp.status = 'full';
  notify(db, user.id, { type: 'joined', title: `You're in: ${comp.title}`, body: `${money(paid)} DEMO entry recorded. Starts ${new Date(comp.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}; we'll ping you when the lobby locks.`, link: linkFor(comp) });
  return comp;
}

/** Fill seats with demo players (each pays their own entry) up to `target` players. */
export function fillPool(db, comp, target) {
  const teamSize = comp.format === 'team' ? comp.teamSize : 1;
  const bots = freeBots(db, comp);
  let i = 0;
  while (comp.participants.length + teamSize <= Math.min(target, comp.maxPlayers) && i + teamSize <= bots.length) {
    const squadId = teamSize > 1 ? uid('sq') : null;
    const squadName = teamSize > 1 ? `${live.pick(SQUAD_A)} ${live.pick(SQUAD_B)}` : null;
    for (let k = 0; k < teamSize; k++) {
      const b = bots[i++];
      seat(db, comp, b.id, { teamId: squadId, squadName, paid: payEntry(db, b, comp, 1, `${comp.title} entry`), paidBy: b.id });
    }
  }
  if (comp.participants.length >= comp.maxPlayers) comp.status = 'full';
}

/** Lock the lobby and hand the match to the game integration (simulator in DEMO MODE). */
export function startPool(db, comp, { fillTo } = {}) {
  if (!['open', 'full'].includes(comp.status)) throw E.state('This pool already started.');
  fillPool(db, comp, fillTo ?? Math.max(comp.minPlayers, Math.min(comp.maxPlayers, comp.participants.length)));
  const entrants = entrantsOf(db, comp);
  if (entrants.length < 2) {
    cancelCompetition(db, comp, 'Not enough players joined');
    return null;
  }
  const game = gameOf(db, comp.gameId);
  const now = Date.now();
  comp.startsAt = Math.min(comp.startsAt, now);
  const match = createMatch({
    kind: 'pool', refId: comp.id, gameId: comp.gameId, modeId: comp.modeId,
    players: comp.participants.map((p) => p.userId),
    teams: entrants.map((e) => ({ id: e.entrantId, name: e.name, members: e.members })),
  });
  db.matches.push(match);
  comp.matchId = match.id;
  const adapter = integrationFor(db, game);
  const humans = comp.participants.filter((p) => isHuman(db, p.userId));
  const pool = poolFor(comp);
  match.timeline.push({ at: now, text: `Lobby locked: ${comp.participants.length} players, ${entrants.length} ${comp.format === 'team' ? 'squads' : 'players'}. Prize pool ${money(pool.net)} DEMO after a ${pool.feePct}% platform fee.` });

  if (adapter.automatic) {
    const withSkill = entrants.map((e) => ({ ...e, skill: e.members.reduce((a, id) => a + skillOf(userOf(db, id), comp.gameId), 0) / e.members.length }));
    const sim = adapter.createMatch(match, { entrants: withSkill, now });
    comp.status = 'starting';
    match.status = 'starting';
    match.timeline.push({ at: now, text: `${adapter.name}: match starts in ${Math.round((sim.liveAt - now) / 1000)}s` });
    humans.forEach((h) => notify(db, h.userId, { type: 'match', title: `Lobby locked: ${comp.title}`, body: `Match starts in ${Math.round((sim.liveAt - now) / 1000)} seconds. Watch it live.`, link: `/app/match/${match.id}` }));
    return match;
  }

  // Evidence path (production without a game feed): players report placement + kills with evidence.
  comp.status = 'live';
  match.status = 'live';
  match.startedAt = now;
  adapter.createMatch(match, { game, mode: modeOf(game, comp.modeId), players: humans.map((h) => h.userId), skills: humans.map((h) => skillOf(userOf(db, h.userId), game.id)) });
  for (const t of Object.values(match.truth || {})) if (t.placement) t.placement = Math.min(t.placement, entrants.length);
  humans.forEach((h) => notify(db, h.userId, { type: 'match', title: `${comp.title} is live`, body: 'Drop in, then report your placement and kills.', link: `/app/match/${match.id}` }));
  if (!humans.length) match.botSettleAt = now + live.int(3, 8) * MIN;
  return match;
}

/** World clock: move simulated pools from countdown → live → result. Returns true if anything changed. */
export function advancePools(db, now = Date.now()) {
  let changed = false;
  for (const match of db.matches) {
    if (match.kind !== 'pool' || !match.sim || !['starting', 'live'].includes(match.status)) continue;
    const comp = db.competitions.find((c) => c.id === match.refId);
    if (!comp) continue;
    const adapter = integrationFor(db, gameOf(db, match.gameId));
    if (match.status === 'starting' && now >= match.sim.liveAt) {
      match.status = 'live';
      comp.status = 'live';
      match.startedAt = match.sim.liveAt;
      match.timeline.push({ at: now, text: 'Match live: drop in' });
      comp.participants.filter((p) => isHuman(db, p.userId)).forEach((p) => notify(db, p.userId, { type: 'match', title: `${comp.title} is live`, body: `${match.sim.players} players dropping now.`, link: `/app/match/${match.id}` }));
      changed = true;
    }
    if (match.status === 'live') {
      const result = adapter.getResult(match, now);
      if (!result) continue;
      const ver = adapter.verifyResult(match, result);
      match.verification = ver;
      match.timeline.push({ at: now, text: `Result received from ${adapter.name}: ${ver.status}` });
      if (ver.status === 'verified') finalizePool(db, comp, match, result);
      else {
        match.status = 'verifying';
        comp.status = 'verifying';
        match.reviewSince = now;
        match.pendingResult = result;
      }
      changed = true;
    }
  }
  return changed;
}

export function finalizePool(db, comp, match, result) {
  const entrants = entrantsOf(db, comp).map((e) => ({ ...e, skill: e.members.reduce((a, id) => a + skillOf(userOf(db, id), comp.gameId), 0) / e.members.length }));
  let standings = result?.standings;
  if (!standings) {
    // Evidence path: reported placements are fixed, the rest of the field comes from the referee/evidence.
    const fixed = {};
    const killsFixed = {};
    for (const [uidr, rep] of Object.entries(match.reports)) {
      const e = entrants.find((x) => x.members.includes(uidr));
      if (!e) continue;
      if (rep.stats.placement && !Object.values(fixed).includes(rep.stats.placement)) fixed[e.entrantId] = Math.min(rep.stats.placement, entrants.length);
      if (rep.stats.kills != null) killsFixed[uidr] = rep.stats.kills;
    }
    standings = simField(entrants, fixed, killsFixed);
  }
  const pool = poolFor(comp);
  const allKills = standings.flatMap((s) => Object.entries(s.kills));
  const mvpId = result?.mvpId ?? (allKills.sort((x, y) => y[1] - x[1])[0] || [])[0];
  if (comp.prize.bonuses?.length) comp.prize.bonuses.forEach((b) => (b.awardedTo = b.label.toLowerCase().includes('mvp') ? mvpId : null));
  const payouts = settle(comp.prize, { ...pool, bonuses: comp.prize.bonuses || [] }, { standings });

  const avg = entrants.reduce((a, e) => a + e.skill, 0) / Math.max(1, entrants.length);
  const avgOpp = 700 + avg * 1300;
  const perUser = {};
  for (const s of standings) {
    for (const m of s.members) {
      const u = userOf(db, m);
      if (!u) continue;
      const payout = payouts.filter((p) => p.userId === m).reduce((a, p) => a + p.amount, 0);
      const delta = placementDelta(u, s.place, standings.length, avgOpp);
      if (s.place <= 10 && standings.length >= 10) u.stats.top10 += 1;
      if (m === mvpId) u.stats.mvps += 1;
      if (s.place === 1 && comp.format === 'team') u.stats.teamWins += 1;
      perUser[m] = finishFor(db, u, { gameId: comp.gameId, won: payout > 0, delta, payout, ref: refOf(comp), label: comp.title, link: `/app/match/${match.id}`, place: s.place, field: standings.length, kills: s.kills[m] || 0, matchId: match.id });
      perUser[m].kills = s.kills[m] || 0;
      markEntry(comp, m, perUser[m]);
    }
    const team = db.teams.find((t) => t.id === s.entrantId);
    if (team) {
      team.stats.competitions += 1;
      team.stats.matches += 1;
      if (s.place === 1) team.stats.wins += 1;
      team.stats.earnings += payouts.filter((p) => s.members.includes(p.userId)).reduce((a, p) => a + p.amount, 0);
      team.recent = [{ at: Date.now(), label: comp.title, place: s.place, field: standings.length }, ...team.recent].slice(0, 8);
      team.rating = Math.max(0, team.rating + Math.round(20 * (1 - (s.place - 1) / Math.max(1, standings.length - 1)) - 8));
    }
  }
  // Reconciliation: entries + sponsor money in = prizes paid + platform revenue (fee + rounding dust − top-ups).
  const paidOut = payouts.reduce((a, p) => a + p.amount, 0);
  const boost = comp.prize.sponsorBoost || 0;
  const sponsorBonuses = (comp.prize.bonuses || []).filter((b) => b.fundedBy === 'sponsor' && b.awardedTo).reduce((a, b) => a + b.amount, 0);
  const platformRevenue = pool.gross + sponsorBonuses - paidOut;
  const named = standings.map((s) => ({ ...s, name: s.name || entrants.find((e) => e.entrantId === s.entrantId)?.name }));
  match.outcome = { standings: named, pool, payouts, perUser, mvpId: mvpId || null, simulated: !!result, reconciliation: { entries: pool.gross - boost, sponsorFunded: boost + sponsorBonuses, paidOut, platformFee: pool.fee, platformTopUp: pool.topUp, platformRevenue } };
  comp.result = { winner: named[0]?.name, winnerMembers: named[0]?.members, paidOut };
  db.revenue.push({ at: Date.now(), source: 'pool', refId: comp.id, amount: platformRevenue });
  settleMatch(db, comp, match);
  const top = named[0];
  const firstReal = top?.members.find((m) => userOf(db, m));
  if (firstReal) feed(db, { userId: firstReal, gameId: comp.gameId, amount: payouts.filter((p) => top.members.includes(p.userId)).reduce((a, p) => a + p.amount, 0), text: `${top.name} took ${comp.title}` });
}

// ---------------------------------------------------------------------------------------------
// Reporting (player-reported results: challenges, head-to-heads, evidence-path pools)

export function report(db, user, match, stats, evidence) {
  const comp = db.competitions.find((c) => c.id === match.refId);
  const game = gameOf(db, match.gameId);
  if (!match.players.includes(user.id)) throw E.forbidden("You're not in this match.");
  if (match.sim) throw E.state('This match is played out by the game integration. Results arrive automatically.');
  if (!['live', 'reporting', 'ready'].includes(match.status)) throw E.state('Results are closed for this match.');
  if (match.reports[user.id]) throw E.conflict('You already reported this match.');
  const allowed = modeOf(game, match.modeId).metrics.map((m) => m.key);
  const clean = {};
  for (const k of allowed) if (stats[k] != null && stats[k] !== '') clean[k] = Number(stats[k]);
  const truth = match.truth?.[user.id];
  const adapter = integrationFor(db, game, { automatic: false });
  const ver = adapter.verifyResult(match, { game, report: { stats: clean, evidence }, truth, demo: db.config.demoMode });

  if (match.kind === 'h2h') {
    match.verification = ver;
    return { kind: 'h2h', verification: ver, ...reportH2H(db, user, match, comp, clean, evidence) };
  }

  match.reports[user.id] = { stats: clean, evidence, at: Date.now(), verification: ver };
  match.verification = ver;
  match.timeline.push({ at: Date.now(), text: `${user.username} reported the result` });
  match.timeline.push({ at: Date.now(), text: `${ver.method === 'manual' ? 'Referee' : 'Automatic'} check: ${ver.status}` });
  if (ver.status !== 'verified') {
    match.status = 'verifying';
    comp.status = 'verifying';
    match.reviewSince = Date.now();
    notify(db, user.id, { type: 'review', title: 'Result sent to a referee', body: 'Some checks need a human. Most reviews take a few minutes.', link: `/app/match/${match.id}` });
    return { kind: match.kind, status: 'review', verification: ver };
  }
  if (match.kind === 'challenge') finalizeChallenge(db, comp, match, clean);
  else if (match.kind === 'pool') finalizePool(db, comp, match);
  return { kind: match.kind, status: 'settled', verification: ver };
}

// ---------------------------------------------------------------------------------------------
// Disputes, reviews, cancellation, rematch

export function openDispute(db, match, comp, raisedBy, { reason, details, evidence }) {
  if (db.disputes.some((d) => d.matchId === match.id && ['open', 'under_review', 'appealed'].includes(d.status))) throw E.conflict('There is already an open dispute on this match.');
  const against = match.players.find((p) => p !== raisedBy) || null;
  const d = createDispute({ matchId: match.id, raisedBy, against, reason, details, evidence });
  d.competitionId = comp?.id || null;
  db.disputes.push(d);
  match.status = 'disputed';
  if (comp) comp.status = 'disputed';
  match.disputeId = d.id;
  match.timeline.push({ at: Date.now(), text: 'Dispute opened, referee assigned' });
  match.players.forEach((p) => notify(db, p, { type: 'dispute', title: 'Match sent to a referee', body: `${comp?.title || 'Match'}: we're reviewing both reports.`, link: `/app/disputes/${d.id}` }));
  return d;
}

/** decision: { winnerId } for H2H, { approve: bool } for reviews, { void: true } to refund everyone. */
export function resolveMatchDecision(db, match, decision, note, actorName = 'Referee') {
  const comp = db.competitions.find((c) => c.id === match.refId);
  match.timeline.push({ at: Date.now(), text: `${actorName}: ${note || 'decision made'}` });
  if (decision.void) {
    cancelCompetition(db, comp, note || 'Voided by referee');
    match.status = 'cancelled';
    return;
  }
  if (match.kind === 'h2h') {
    finalizeH2H(db, comp, match, decision.winnerId, match.truth?.score || '—', note);
  } else if (match.kind === 'challenge') {
    const uidr = match.players[0];
    const stats = decision.approve ? match.reports[uidr].stats : match.truth?.[uidr] || { ...match.reports[uidr].stats, won: 0 };
    finalizeChallenge(db, comp, match, stats, note);
  } else if (match.kind === 'pool') {
    if (match.pendingResult) {
      const result = match.pendingResult;
      delete match.pendingResult;
      match.verification = { ...(match.verification || {}), status: 'verified', by: actorName };
      return finalizePool(db, comp, match, result);
    }
    if (!decision.approve) for (const [u, r] of Object.entries(match.reports)) r.stats = match.truth?.[u] || r.stats;
    finalizePool(db, comp, match);
  } else if (match.kind === 'tournament') {
    return { tournament: true };
  }
}

/** Cancel and refund every seat to whoever paid for it (players, captains and demo players alike). */
export function cancelCompetition(db, comp, reason) {
  if (['settled', 'cancelled'].includes(comp.status)) throw E.state('This competition is already closed.');
  const payers = new Set(comp.participants.map((p) => p.paidBy || p.userId));
  for (const id of payers) {
    const refunded = refundRef(db, id, comp.id, `Refund: ${comp.title} (${reason})`);
    if (refunded.length && isHuman(db, id)) notify(db, id, { type: 'refund', title: `Refunded: ${comp.title}`, body: `${money(refunded.reduce((a, t) => a + t.amount, 0))} DEMO back in your wallet. ${reason}.`, link: '/app/wallet' });
  }
  for (const p of comp.participants) if (p.status === 'in') p.status = 'refunded';
  comp.status = 'cancelled';
  comp.endedAt = Date.now();
  comp.result = { cancelled: true, reason };
  const m = db.matches.find((x) => x.id === comp.matchId);
  if (m && m.status !== 'settled') m.status = 'cancelled';
}

export function leaveCompetition(db, user, comp) {
  if (!['open', 'full'].includes(comp.status)) throw E.state('You can only leave before the lobby locks.');
  const mine = comp.participants.find((p) => p.userId === user.id);
  if (!mine) throw E.state("You're not in this competition.");
  if (comp.kind === 'h2h' && comp.h2h.challengerId === user.id) {
    cancelCompetition(db, comp, 'Challenge withdrawn');
    return;
  }
  if (mine.paidBy && mine.paidBy !== user.id) throw E.state('Your captain entered you. Ask them to withdraw the squad.');
  // Leaving takes your whole squad with you; everyone who paid gets their entry back.
  const leaving = comp.format === 'team' && mine.teamId ? comp.participants.filter((p) => p.teamId === mine.teamId) : [mine];
  comp.participants = comp.participants.filter((p) => !leaving.includes(p));
  for (const id of new Set(leaving.map((p) => p.paidBy || p.userId))) refundRef(db, id, comp.id, `Refund: left ${comp.title}`);
  for (const p of leaving) {
    const u = userOf(db, p.userId);
    if (u) u.stats.competitions = Math.max(0, (u.stats.competitions || 0) - 1);
  }
  if (comp.status === 'full') comp.status = 'open';
}

export function rematch(db, user, comp) {
  user.stats.rematches += 1;
  evaluateAchievements(db.achievementDefs, user).forEach((a) => notify(db, user.id, { type: 'achievement', title: `Achievement unlocked: ${a.name}`, body: a.blurb, link: '/app/profile' }));
  if (comp.kind === 'challenge') {
    return createChallenge(db, user, { templateId: comp.challenge.templateId, entry: comp.entry, platform: comp.platform });
  }
  if (comp.kind === 'h2h') {
    const other = comp.participants.map((p) => p.userId).find((id) => id !== user.id);
    const c = createH2H(db, user, { gameId: comp.gameId, modeId: comp.modeId, platform: comp.platform, entry: comp.entry, type: 'direct', opponentId: other, rematchOf: comp.id });
    return { competitionId: c.id };
  }
  const next = db.competitions.find((c) => c.kind === 'pool' && c.status === 'open' && c.gameId === comp.gameId && c.modeId === comp.modeId && !c.participants.some((p) => p.userId === user.id));
  if (next) {
    joinPool(db, user, next, null);
    return { competitionId: next.id };
  }
  const clone = createCompetition({ ...structuredClone(comp), id: undefined, participants: [], status: 'open', matchId: null, result: null, endedAt: null, startsAt: Date.now() + 10 * MIN, createdAt: Date.now(), title: comp.title.replace(/ #\d+$/, '') + ' #' + live.int(2, 99) });
  db.competitions.push(clone);
  joinPool(db, user, clone, null);
  return { competitionId: clone.id };
}

export { verifyReport, simStats, simH2H };
