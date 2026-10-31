// Tournament lifecycle: registration → start (seed + bracket) → rounds → completion + payouts.
import { createMatch } from '../models.js';
import { E } from '../errors.js';
import { build, resolveMatch, resolveBrGame, isReady, participants, isComplete, finalOrder } from '../engines/bracket.js';
import { computePool } from '../engines/prize.js';
import { verifyReport } from '../engines/verification.js';
import { h2hDelta, placementDelta, applyScore, recordResult } from '../engines/rating.js';
import { evaluateAchievements } from '../engines/achievements.js';
import { debitEntry, refundRef, credit } from '../ledger.js';
import { notify, feed } from '../notify.js';
import { simStats, simH2H, skillOf, statsSayWin, scoreLine } from '../sim.js';
import { gate, gameOf, userOf, openDispute, ensureBotFunds, finishFor } from './competitions.js';
import { trackMissionProgress } from './missions.js';
import { live, uid } from '../util.js';
import { money, ordinal } from '../fmt.js';

const refOf = (t) => ({ kind: 'tournament', id: t.id, label: t.name });

/** Every entrant's seats are paid from a real wallet (the registering player or the demo captain). */
function payTour(db, payer, tour, seats, description) {
  const amount = tour.entry * seats;
  if (amount <= 0) return 0;
  ensureBotFunds(db, payer, amount);
  debitEntry(db, payer.id, amount, refOf(tour), description);
  return amount;
}
const countEntry = (db, members) => members.forEach((m) => {
  const u = userOf(db, m);
  if (u) u.stats.competitions = (u.stats.competitions || 0) + 1;
});
const isHuman = (db, id) => !!userOf(db, id) && !userOf(db, id).isBot;

export const humanEntrants = (db, tour) => tour.entrants.filter((e) => e.members.some((m) => isHuman(db, m)));
export const entrantOf = (tour, userId) => tour.entrants.find((e) => e.members.includes(userId));

function entrantSkill(db, tour, e) {
  const vals = e.members.map((m) => (userOf(db, m) ? skillOf(userOf(db, m), tour.gameId) : 0.35));
  return vals.reduce((a, v) => a + v, 0) / Math.max(1, vals.length);
}

export function registerTournament(db, user, tour, teamId) {
  if (tour.status !== 'registration') throw E.state('Registration is closed.');
  if (Date.now() > tour.registrationDeadline) throw E.state('The registration deadline has passed.');
  if (tour.entrants.length >= tour.maxEntrants) throw E.state('This tournament is full.');
  if (entrantOf(tour, user.id)) throw E.conflict("You're already registered.");
  const game = gameOf(db, tour.gameId);
  gate(db, user, { entry: tour.entry, realMoney: true }, game);

  let entrant;
  if (tour.teamSize > 1) {
    const team = db.teams.find((t) => t.id === teamId);
    if (!team) throw E.invalid('Pick the team you want to register.');
    if (!team.members.some((m) => m.userId === user.id)) throw E.forbidden("You're not on that team.");
    if (tour.entrants.some((e) => e.id === team.id)) throw E.conflict('Your team is already registered.');
    const members = [user.id, ...team.members.map((m) => m.userId).filter((id) => id !== user.id && !entrantOf(tour, id))].slice(0, tour.teamSize);
    const taken = new Set(tour.entrants.flatMap((e) => e.members));
    const subs = freeBots(db, tour, new Set([...taken, ...members])).slice(0, tour.teamSize - members.length).map((u) => u.id);
    entrant = { id: team.id, type: 'team', name: team.name, tag: team.tag, color: team.color, members: [...members, ...subs], rating: team.rating };
  } else {
    entrant = { id: user.id, type: 'user', name: user.username, members: [user.id], rating: user.gameScores[tour.gameId]?.score ?? user.stackScore };
  }
  // The registering player pays for every seat on their entry (a squad captain covers the squad).
  entrant.paid = payTour(db, user, tour, entrant.members.length, entrant.members.length > 1 ? `${tour.name} entry (${entrant.members.length} seats)` : `${tour.name} entry`);
  entrant.paidBy = user.id;
  tour.entrants.push(entrant);
  countEntry(db, entrant.members);
  notify(db, user.id, { type: 'tournament', title: `Registered: ${tour.name}`, body: `${tour.entry ? `${money(entrant.paid)} DEMO entry recorded. ` : ''}Starts ${new Date(tour.startsAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.`, link: `/app/tournaments/${tour.id}` });
  return entrant;
}

export function unregisterTournament(db, user, tour) {
  if (tour.status !== 'registration') throw E.state('You can only withdraw before the tournament starts.');
  const e = entrantOf(tour, user.id);
  if (!e) throw E.state("You're not registered.");
  if (e.paidBy && e.paidBy !== user.id) throw E.state('Your captain registered the squad. Ask them to withdraw it.');
  tour.entrants = tour.entrants.filter((x) => x !== e);
  refundRef(db, e.paidBy || user.id, tour.id, `Refund: withdrew from ${tour.name}`);
}

function freeBots(db, tour, taken) {
  const pool = db.users.filter((u) => u.isBot && u.status === 'active' && !taken.has(u.id));
  return [...pool.filter((u) => u.games.includes(tour.gameId)).sort(() => live.next() - 0.5), ...pool.filter((u) => !u.games.includes(tour.gameId)).sort(() => live.next() - 0.5)];
}

/** Register a demo entrant (a bot or an all-demo team); its captain pays from its own demo wallet. */
export function addDemoEntrant(db, tour, entrant) {
  const payer = userOf(db, entrant.members[0]);
  entrant.paid = payTour(db, payer, tour, entrant.members.length, `${tour.name} entry`);
  entrant.paidBy = payer.id;
  tour.entrants.push(entrant);
  countEntry(db, entrant.members);
  return entrant;
}

/** Fill open slots with demo entrants. */
export function fillTournament(db, tour, upTo = tour.maxEntrants) {
  const taken = new Set(tour.entrants.flatMap((e) => e.members));
  if (tour.teamSize > 1) {
    // Only all-demo teams are auto-entered: a real player's team must register itself.
    const teams = db.teams.filter((t) => !tour.entrants.some((e) => e.id === t.id) && !t.members.some((m) => isHuman(db, m.userId)));
    for (const t of teams) {
      if (tour.entrants.length >= upTo) break;
      const members = t.members.map((m) => m.userId).filter((id) => !taken.has(id)).slice(0, tour.teamSize);
      members.push(...freeBots(db, tour, new Set([...taken, ...members])).slice(0, tour.teamSize - members.length).map((u) => u.id));
      if (members.length < tour.teamSize) break;
      members.forEach((m) => taken.add(m));
      addDemoEntrant(db, tour, { id: t.id, type: 'team', name: t.name, tag: t.tag, color: t.color, members, rating: t.rating });
    }
    let n = 1;
    while (tour.entrants.length < upTo) {
      const members = freeBots(db, tour, taken).slice(0, tour.teamSize).map((u) => u.id);
      if (members.length < tour.teamSize) break;
      members.forEach((m) => taken.add(m));
      const rating = Math.round(members.reduce((a, m) => a + userOf(db, m).stackScore, 0) / members.length);
      addDemoEntrant(db, tour, { id: uid('sq'), type: 'team', name: `Open Squad ${n++}`, members, rating });
    }
  } else {
    for (const b of freeBots(db, tour, taken)) {
      if (tour.entrants.length >= upTo) break;
      addDemoEntrant(db, tour, { id: b.id, type: 'user', name: b.username, members: [b.id], rating: b.gameScores[tour.gameId]?.score ?? b.stackScore });
    }
  }
}

export function startTournament(db, tour) {
  if (tour.status !== 'registration') throw E.state('This tournament already started.');
  fillTournament(db, tour);
  if (tour.entrants.length < 2) {
    cancelTournament(db, tour, 'Not enough entrants');
    return;
  }
  tour.entrants.sort((a, b) => b.rating - a.rating).forEach((e, i) => (e.seed = i + 1));
  tour.bracket = build(tour.format, tour.entrants);
  tour.status = 'live';
  tour.startsAt = Math.min(tour.startsAt, Date.now());
  for (const e of humanEntrants(db, tour))
    e.members.filter((m) => isHuman(db, m)).forEach((m) => notify(db, m, { type: 'tournament', title: `${tour.name} is live`, body: 'Your first match is ready.', link: `/app/tournaments/${tour.id}` }));
  advanceBots(db, tour, humanEntrants(db, tour).length ? Infinity : 2);
}

function simBrPlacements(db, tour, entrantIds, fixed = {}) {
  const rows = entrantIds
    .filter((id) => !(id in fixed))
    .map((id) => ({ id, roll: entrantSkill(db, tour, tour.entrants.find((e) => e.id === id)) * 1.4 + live.next() }))
    .sort((a, b) => b.roll - a.roll);
  const used = new Set(Object.values(fixed).map((f) => f.place));
  const free = [];
  for (let p = 1; p <= entrantIds.length; p++) if (!used.has(p)) free.push(p);
  const out = rows.map((r, i) => ({ entrantId: r.id, place: free[i], kills: Math.max(0, Math.round(live.gauss(6 - free[i] * 0.3, 2))) }));
  for (const [id, f] of Object.entries(fixed)) out.push({ entrantId: id, place: f.place, kills: f.kills });
  return out.sort((a, b) => a.place - b.place);
}

// Resolve bot-only matches. Tournaments with a human resolve eagerly so the player never waits on bots;
// bot-only tournaments move a few matches per world tick so "Live now" has something to watch.
export function advanceBots(db, tour, maxSteps = Infinity) {
  if (tour.status !== 'live') return;
  const humans = new Set(humanEntrants(db, tour).map((e) => e.id));
  let steps = 0;
  let progressed = true;
  while (progressed && steps < maxSteps) {
    progressed = false;
    for (const m of tour.bracket.matches) {
      if (steps >= maxSteps) break;
      if (!isReady(tour.bracket, m)) continue;
      if (m.side === 'BR') {
        if (m.entrants.some((id) => humans.has(id))) continue;
        resolveBrGame(tour.bracket, m.id, simBrPlacements(db, tour, m.entrants));
      } else {
        const [a, b] = participants(tour.bracket, m);
        if (humans.has(a) || humans.has(b)) continue;
        const ea = tour.entrants.find((e) => e.id === a);
        const eb = tour.entrants.find((e) => e.id === b);
        const sim = simH2H(gameOf(db, tour.gameId), tour.modeId, entrantSkill(db, tour, ea), entrantSkill(db, tour, eb));
        resolveMatch(tour.bracket, m.id, sim.winner === 'a' ? a : b, sim.score);
      }
      progressed = true;
      steps++;
    }
  }
  tour.lastStepAt = Date.now();
  if (isComplete(tour.bracket)) completeTournament(db, tour);
}

export function readyMatchFor(tour, userId) {
  const e = entrantOf(tour, userId);
  if (!e || tour.status !== 'live') return { entrant: e, bm: null };
  const bm = tour.bracket.matches.find((m) => isReady(tour.bracket, m) && (m.side === 'BR' ? m.entrants.includes(e.id) : participants(tour.bracket, m).includes(e.id)));
  return { entrant: e, bm };
}

export function openTournamentMatch(db, user, tour) {
  const { entrant, bm } = readyMatchFor(tour, user.id);
  if (!entrant) throw E.forbidden("You're not in this tournament.");
  if (!bm) throw E.state('Your next match is not ready yet.');
  if (bm.matchId) return db.matches.find((x) => x.id === bm.matchId);
  const game = gameOf(db, tour.gameId);
  let match;
  if (bm.side === 'BR') {
    match = createMatch({ kind: 'tournament', refId: tour.id, bracketMatchId: bm.id, gameId: tour.gameId, modeId: tour.modeId, players: [user.id] });
    const t = simStats(game, tour.modeId, skillOf(user, tour.gameId));
    if (t.placement) t.placement = Math.min(t.placement, bm.entrants.length);
    match.truth = { [user.id]: t };
    match.tournament = { id: tour.id, bmId: bm.id, entrantId: entrant.id, label: bm.label, br: true };
  } else {
    const [a, b] = participants(tour.bracket, bm);
    const oppId = a === entrant.id ? b : a;
    const opp = tour.entrants.find((e) => e.id === oppId);
    const oppLead = opp.members.find((m) => userOf(db, m)) || opp.members[0];
    match = createMatch({ kind: 'tournament', refId: tour.id, bracketMatchId: bm.id, gameId: tour.gameId, modeId: tour.modeId, players: [user.id, oppLead] });
    const sim = simH2H(game, tour.modeId, entrantSkill(db, tour, entrant), entrantSkill(db, tour, opp));
    match.truth = { [user.id]: sim.a, [oppLead]: sim.b, winner: sim.winner === 'a' ? user.id : oppLead, score: sim.score };
    match.tournament = { id: tour.id, bmId: bm.id, entrantId: entrant.id, oppEntrantId: oppId, oppName: opp.name, label: bm.label };
  }
  match.status = 'live';
  match.startedAt = Date.now();
  match.timeline.push({ at: Date.now(), text: `${tour.name}: ${bm.label}` });
  db.matches.push(match);
  bm.matchId = match.id;
  return match;
}

export function reportTournament(db, user, match, stats, evidence) {
  const tour = db.tournaments.find((t) => t.id === match.refId);
  const game = gameOf(db, tour.gameId);
  if (match.reports[user.id]) throw E.conflict('You already reported this match.');
  const ver = verifyReport(game, match, { stats, evidence }, match.truth?.[user.id]);
  match.reports[user.id] = { stats, evidence, at: Date.now(), verification: ver };
  match.verification = ver;
  match.timeline.push({ at: Date.now(), text: `${user.username} reported the result` });

  if (match.tournament.br) {
    if (ver.status !== 'verified') {
      match.status = 'verifying';
      match.reviewSince = Date.now();
      return { status: 'review', verification: ver };
    }
    finalizeTournamentBr(db, tour, match, stats);
    return { status: 'settled', verification: ver };
  }

  const claimsWin = statsSayWin(stats);
  const truthWin = match.truth.winner === user.id;
  if (claimsWin !== truthWin) {
    const oppId = match.players.find((p) => p !== user.id);
    match.reports[oppId] = { stats: match.truth[oppId], outcome: truthWin ? 'loss' : 'win', evidence: [{ type: 'screenshot', name: 'result.png', demo: true }], at: Date.now() };
    openDispute(db, match, null, user.id, { reason: 'wrong_result', details: 'Both sides reported a win. A referee will check the evidence.', evidence });
    return { status: 'disputed', verification: ver };
  }
  finalizeTournamentH2H(db, tour, match, claimsWin ? user.id : match.players.find((p) => p !== user.id));
  return { status: 'settled', verification: ver };
}

export function finalizeTournamentH2H(db, tour, match, winnerUserId, note) {
  const me = match.players[0];
  const user = userOf(db, me);
  const oppUser = userOf(db, match.players[1]);
  const won = winnerUserId === me;
  const winnerEntrant = won ? match.tournament.entrantId : match.tournament.oppEntrantId;
  const score = match.truth.score; // players[0] is always the reporting player, so this is already "you–them"
  resolveMatch(tour.bracket, match.tournament.bmId, winnerEntrant, match.truth.score);
  // Tournament results carry extra weight (1.2×). Both sides are rated; prizes pay at the end of the event.
  const [d, dOpp] = h2hDelta(user, oppUser, won, 1.2);
  const perUser = {};
  for (const [u, delta, w] of [[user, d, won], [oppUser, dOpp, !won]]) {
    if (!u) continue;
    perUser[u.id] = finishFor(db, u, { gameId: tour.gameId, won: w, delta, payout: 0, ref: refOf(tour), label: `${tour.name}: ${match.tournament.label}`, link: `/app/tournaments/${tour.id}`, place: w ? 1 : 2, field: 2, matchId: match.id, quiet: true });
  }
  match.outcome = { winnerId: winnerUserId, score, perUser, tournamentId: tour.id, note: note || null };
  match.status = 'settled';
  match.settledAt = Date.now();
  match.timeline.push({ at: Date.now(), text: `${userOf(db, winnerUserId)?.username || 'Winner'} advances` });
  for (const [u, w] of [[user, won], [oppUser, !won]])
    if (u && !u.isBot) notify(db, u.id, { type: 'result', title: w ? `You advance: ${tour.name}` : `Out of ${tour.name}`, body: w ? 'Next match unlocks when your opponent is decided.' : 'Run it back in the next one.', link: `/app/tournaments/${tour.id}` });
  advanceBots(db, tour);
}

export function finalizeTournamentBr(db, tour, match, stats) {
  const bm = tour.bracket.matches.find((m) => m.id === match.tournament.bmId);
  const user = userOf(db, match.players[0]);
  const place = Math.min(stats.placement || bm.entrants.length, bm.entrants.length);
  const placements = simBrPlacements(db, tour, bm.entrants, { [match.tournament.entrantId]: { place, kills: stats.kills || 0 } });
  resolveBrGame(tour.bracket, bm.id, placements);
  const d = placementDelta(user, place, bm.entrants.length, 1150);
  const res = finishFor(db, user, { gameId: tour.gameId, won: place <= 3, delta: d, payout: 0, ref: refOf(tour), label: `${tour.name}: ${bm.label}`, link: `/app/tournaments/${tour.id}`, place, field: bm.entrants.length, kills: stats.kills || 0, matchId: match.id, quiet: true });
  match.outcome = { placements: placements.slice(0, 10).map((p) => ({ ...p, name: tour.entrants.find((e) => e.id === p.entrantId)?.name })), perUser: { [user.id]: res }, tournamentId: tour.id };
  match.status = 'settled';
  match.settledAt = Date.now();
  advanceBots(db, tour);
}

export function completeTournament(db, tour) {
  const order = finalOrder(tour.bracket);
  const pool = computePool({ ...tour.prize, guaranteed: tour.guaranteed }, { entry: tour.entry * tour.teamSize, entrants: tour.entrants.length, teamSize: tour.teamSize });
  const payouts = [];
  for (const a of pool.allocations) {
    if (!a.place) continue;
    const e = tour.entrants.find((x) => x.id === order[a.place - 1]);
    if (!e) continue;
    const each = Math.floor(a.amount / e.members.length);
    for (const m of e.members) {
      payouts.push({ userId: m, amount: each, place: a.place });
      const u = userOf(db, m);
      if (!u) continue;
      u.stats.earnings += each;
      credit(db, u.id, 'prize', each, refOf(tour), `Prize: ${tour.name} (${ordinal(a.place)})`);
      if (!u.isBot) notify(db, u.id, { type: 'prize', title: `${ordinal(a.place)} place: ${money(each)} DEMO`, body: `${tour.name}: prize credited to your wallet.`, link: `/app/tournaments/${tour.id}` });
    }
  }
  for (const e of tour.entrants)
    if (e.id !== order[0] && !payouts.some((p) => e.members.includes(p.userId)))
      e.members.filter((m) => isHuman(db, m)).forEach((m) => notify(db, m, { type: 'tournament', title: `${tour.name} is complete`, body: `${tour.entrants.find((x) => x.id === order[0])?.name} took the title.`, link: `/app/tournaments/${tour.id}` }));
  const champ = tour.entrants.find((e) => e.id === order[0]);
  for (const m of champ?.members || []) {
    const u = userOf(db, m);
    if (!u) continue;
    u.stats.tournamentWins += 1;
    if (tour.teamSize > 1) u.stats.teamWins += 1;
    const unlocked = evaluateAchievements(db.achievementDefs, u);
    if (!u.isBot) unlocked.forEach((a) => notify(db, u.id, { type: 'achievement', title: `Achievement unlocked: ${a.name}`, body: a.blurb, link: '/app/profile' }));
  }
  const team = db.teams.find((t) => t.id === champ?.id);
  if (team) {
    team.stats.wins += 1;
    team.recent = [{ at: Date.now(), label: tour.name, place: 1, field: tour.entrants.length }, ...team.recent].slice(0, 8);
  }
  // Big Stack qualifiers award season points to the top places.
  if (tour.bigStack && tour.bigStackPoints) {
    tour.bigStackPoints.forEach((pts, i) => {
      const e = tour.entrants.find((x) => x.id === order[i]);
      for (const m of e?.members || []) {
        const u = userOf(db, m);
        if (!u) continue;
        u.stats.seasonPoints = (u.stats.seasonPoints || 0) + pts;
        if (!u.isBot) notify(db, u.id, { type: 'tournament', title: `+${pts} Big Stack points`, body: `${ordinal(i + 1)} in ${tour.name}`, link: '/app/bigstack' });
      }
    });
  }
  tour.results = {
    order: order.slice(0, 8).map((id, i) => ({ entrantId: id, place: i + 1, name: tour.entrants.find((e) => e.id === id)?.name })),
    pool,
    payouts,
  };
  tour.status = 'completed';
  tour.endedAt = Date.now();
  // Entries collected minus prizes paid: the platform fee, rounding dust, less any guarantee top-up.
  const collected = tour.entrants.reduce((a, e) => a + (e.paid || 0), 0);
  db.revenue.push({ at: Date.now(), source: 'tournament', refId: tour.id, amount: collected - payouts.reduce((a, p) => a + p.amount, 0) });
  const lead = champ?.members.find((m) => userOf(db, m));
  if (lead) feed(db, { userId: lead, gameId: tour.gameId, amount: pool.allocations[0]?.amount || 0, text: `${champ.name} won ${tour.name}` });
}

export function cancelTournament(db, tour, reason) {
  if (['completed', 'cancelled'].includes(tour.status)) throw E.state('This tournament is already closed.');
  for (const id of new Set(tour.entrants.map((e) => e.paidBy || e.members[0]))) {
    const back = refundRef(db, id, tour.id, `Refund: ${tour.name} (${reason})`);
    if (back.length && isHuman(db, id)) notify(db, id, { type: 'refund', title: `Refunded: ${tour.name}`, body: `${money(back.reduce((a, t) => a + t.amount, 0))} DEMO back in your wallet. ${reason}.`, link: '/app/wallet' });
  }
  tour.status = 'cancelled';
  tour.endedAt = Date.now();
}
