// Read projections. The client only ever receives these shapes — never raw rows with secrets
// (password hashes, hidden match truth, hunt locations, other users' contact details).
import { rankFor, levelFor } from '../engines/rating.js';
import { poolFor, entrantsOf } from '../services/competitions.js';
import { getIntegration } from '../../integrations/index.js';
import { computePool } from '../engines/prize.js';
import { participants, standings } from '../engines/bracket.js';
import { readyMatchFor, entrantOf } from '../services/tournaments.js';
import { balances } from '../ledger.js';
import { countryOf } from '../models.js';
import { age } from '../util.js';

export const findUser = (db, id) => db.users.find((u) => u.id === id);
export const findGame = (db, id) => db.games.find((g) => g.id === id);

export function gameMini(g) {
  if (!g) return null;
  return { id: g.id, slug: g.slug, name: g.name, short: g.short, art: g.art, media: g.media || null, category: g.category, platforms: g.platforms, status: g.status };
}

export function pubUser(db, u) {
  if (!u) return null;
  const rank = rankFor(u.stackScore, db.config.ranks);
  const s = u.stats;
  return {
    id: u.id,
    username: u.username,
    name: u.name || u.username,
    avatar: u.avatar,
    country: u.country,
    countryName: countryOf(u.country).name,
    region: countryOf(u.country).region,
    level: levelFor(u),
    role: u.role,
    bio: u.bio,
    stackScore: u.stackScore,
    peakScore: u.peakScore,
    rank: { id: rank.id, name: rank.name, tier: rank.tier, progress: rank.progress, next: rank.next?.name || null, nextAt: rank.next?.min || null },
    games: u.games,
    platforms: u.platforms,
    gameScores: u.gameScores,
    stats: {
      matches: s.matches, wins: s.wins, losses: s.losses, competitions: s.competitions || 0, streak: s.streak, bestStreak: s.bestStreak,
      winRate: s.matches ? Math.round((s.wins / s.matches) * 1000) / 10 : 0,
      earnings: s.earnings, tournamentWins: s.tournamentWins, mvps: s.mvps, top10: s.top10, seasonPoints: s.seasonPoints || 0,
    },
    form: u.form,
    achievements: u.achievements,
    online: u.online,
    verified: u.kyc?.status === 'verified',
    createdAt: u.createdAt,
    inGameIds: u.inGameIds,
  };
}

export function lite(db, id, fallbackName) {
  const u = findUser(db, id);
  if (!u) return { id, username: fallbackName || 'Open player', avatar: { color: '#3A3F4A' }, stackScore: null, rank: null, field: true };
  const rank = rankFor(u.stackScore, db.config.ranks);
  return { id: u.id, username: u.username, avatar: u.avatar, stackScore: u.stackScore, rank: { id: rank.id, name: rank.name }, country: u.country, online: u.online };
}

export function selfUser(db, u) {
  return {
    ...pubUser(db, u),
    email: u.email,
    dob: u.dob,
    age: age(u.dob),
    onboarded: u.onboarded,
    profileComplete: u.profileComplete !== false,
    authProviders: [...(u.passwordHash ? ['password'] : []), ...(db.identities || []).filter((i) => i.userId === u.id).map((i) => i.provider)],
    status: u.status,
    kyc: u.kyc,
    limits: u.limits,
    coolOffUntil: u.coolOffUntil,
    selfExcludedUntil: u.selfExcludedUntil,
    friends: u.friends,
    following: u.following,
    friendRequests: u.friendRequests,
    sponsorId: u.sponsorId,
    restrictions: u.restrictions,
    jurisdiction: db.jurisdictions[u.country],
    wallet: balances(db, u.id),
    unread: db.notifications.filter((n) => n.userId === u.id && !n.read).length,
  };
}

export function compView(db, c, me) {
  const game = findGame(db, c.gameId);
  const mode = game?.modes.find((m) => m.id === c.modeId);
  const joined = me ? c.participants.some((p) => p.userId === me.id) : false;
  const view = {
    id: c.id, kind: c.kind, title: c.title, status: c.status, entry: c.entry, platform: c.platform, region: c.region,
    format: c.format, teamSize: c.teamSize, minPlayers: c.minPlayers, maxPlayers: c.maxPlayers,
    players: c.participants.length, spotsLeft: Math.max(0, c.maxPlayers - c.participants.length),
    startsAt: c.startsAt, createdAt: c.createdAt, featured: c.featured, visibility: c.visibility,
    game: gameMini(game), mode: mode ? { id: mode.id, name: mode.name, teamSize: mode.teamSize, metrics: mode.metrics } : null,
    prize: c.prize, matchId: c.matchId, joined, result: c.result, realMoney: c.realMoney, endedAt: c.endedAt || null,
    myEntry: joined ? (({ paid, paidBy, placement, result, winnings, status }) => ({ paid: paid || 0, paidByMe: !paidBy || paidBy === me.id, placement: placement ?? null, result: result ?? null, winnings: winnings || 0, status }))(c.participants.find((p) => p.userId === me.id)) : null,
    sponsor: c.sponsorId ? db.sponsors.find((s) => s.id === c.sponsorId) : null,
    rules: c.rules?.length ? c.rules : game?.rules || [],
  };
  if (c.kind === 'challenge') view.challenge = c.challenge;
  if (c.kind === 'h2h') {
    view.h2h = {
      type: c.h2h.type, bestOf: c.h2h.bestOf, note: c.h2h.note, rematchOf: c.h2h.rematchOf,
      challenger: lite(db, c.h2h.challengerId), opponent: c.h2h.opponentId ? lite(db, c.h2h.opponentId) : null,
      code: me && c.h2h.challengerId === me.id ? c.code : null,
      incoming: !!me && c.h2h.opponentId === me.id && !joined,
    };
    const pool = computePool(c.prize, { entry: c.entry, entrants: 2 });
    view.payout = pool.allocations[0]?.amount || 0;
    view.pool = pool;
  }
  if (c.kind === 'pool') {
    view.pool = poolFor(c);
    view.projected = poolFor(c, c.maxPlayers);
    const entrants = entrantsOf(db, c);
    view.entrants = entrants.length;
    view.maxEntrants = Math.floor(c.maxPlayers / (c.format === 'team' ? c.teamSize : 1));
    if (me && joined) {
      const mine = c.participants.find((p) => p.userId === me.id);
      const squad = entrants.find((e) => e.members.includes(me.id));
      view.mySquad = squad ? { name: squad.name, teamId: mine.teamId, members: squad.members.map((id) => lite(db, id, c.participants.find((p) => p.userId === id)?.name)) } : null;
    }
  }
  return view;
}

export function compDetail(db, c, me) {
  const v = compView(db, c, me);
  const entrants = entrantsOf(db, c);
  v.roster = entrants.slice(0, 40).map((e) => ({ name: e.name, members: e.members.map((id) => lite(db, id, c.participants.find((p) => p.userId === id)?.name)) }));
  if (c.matchId) {
    const m = db.matches.find((x) => x.id === c.matchId);
    if (m) v.match = { id: m.id, status: m.status, outcome: publicOutcome(db, m, me) };
  }
  return v;
}

function publicOutcome(db, m, me) {
  if (!m.outcome) return null;
  const o = { ...m.outcome };
  if (o.standings) o.standings = o.standings.slice(0, 12).map((s) => ({ place: s.place, name: s.name, kills: Object.values(s.kills || {}).reduce((a, b) => a + b, 0), members: s.members.map((id) => lite(db, id)) }));
  if (o.payouts) o.payouts = o.payouts.filter((p) => !me || p.userId === me.id || findUser(db, p.userId)).slice(0, 20).map((p) => ({ ...p, user: lite(db, p.userId) }));
  if (o.winnerId) o.winner = lite(db, o.winnerId);
  if (o.mvpId) o.mvp = lite(db, o.mvpId);
  return o;
}

export function matchView(db, m, me) {
  const game = findGame(db, m.gameId);
  const mode = game?.modes.find((x) => x.id === m.modeId);
  const comp = db.competitions.find((c) => c.id === m.refId);
  const tour = db.tournaments.find((t) => t.id === m.refId);
  const revealed = me && m.revealed?.[me.id];
  return {
    id: m.id, kind: m.kind, status: m.status,
    title: m.title || comp?.title || (tour ? `${tour.name}: ${m.tournament?.label || ''}` : 'Match'),
    game: gameMini(game), mode: mode ? { id: mode.id, name: mode.name, metrics: mode.metrics, teamSize: mode.teamSize } : null,
    competition: comp ? compView(db, comp, me) : null,
    tournament: tour ? { id: tour.id, name: tour.name, format: tour.format, label: m.tournament?.label, oppName: m.tournament?.oppName, br: !!m.tournament?.br } : null,
    players: m.players.slice(0, 10).map((id) => lite(db, id)),
    playerCount: m.players.length,
    teams: m.teams ? m.teams.length : null,
    reports: Object.fromEntries(Object.entries(m.reports).filter(([k]) => m.players.includes(k)).map(([k, r]) => [k, { outcome: r.outcome, stats: k === me?.id || m.status === 'settled' ? r.stats : null, evidence: (r.evidence || []).map((e) => ({ type: e.type, name: e.name })), at: r.at, verification: r.verification }])),
    myReport: me ? m.reports[me.id] || null : null,
    verification: m.verification,
    outcome: publicOutcome(db, m, me),
    mine: me ? m.outcome?.perUser?.[me.id] || null : null,
    // outcome.score is "players[0]–players[1]"; flip it so the viewer always reads their own number first
    myScore: m.outcome?.score && me && m.players[1] === me.id ? m.outcome.score.split('–').reverse().join('–') : m.outcome?.score || null,
    revealed: revealed ? m.truth?.[me.id] : null,
    timeline: m.timeline,
    createdAt: m.createdAt, startedAt: m.startedAt, settledAt: m.settledAt,
    disputeId: m.disputeId || null,
    integration: m.integration || null,
    live: m.sim ? liveView(db, m, me) : null,
    canReport: !!me && !m.sim && m.players.includes(me.id) && !m.reports[me.id] && ['ready', 'live', 'reporting'].includes(m.status),
    instructions: game ? instructionsFor(game, mode, m, me) : [],
    rules: game?.rules || [],
    verificationMethods: game?.verification || [],
  };
}

/** What a viewer may see of a simulated match right now: only what has already happened. */
function liveView(db, m, me) {
  const g = getIntegration(m.sim.adapter)?.getMatch(m, Date.now());
  if (!g) return null;
  const name = (id) => findUser(db, id)?.username || 'Player';
  const teamName = (id) => m.teams?.find((t) => t.id === id)?.name || null;
  const mineTeam = me ? m.teams?.find((t) => t.members.includes(me.id)) : null;
  const myDeath = me ? g.happened.find((e) => e.victim === me.id) : null;
  const myKills = me ? g.happened.filter((e) => e.killer === me.id).length : 0;
  const squadAlive = mineTeam ? mineTeam.members.filter((x) => !g.happened.some((e) => e.victim === x)).length : null;
  return {
    phase: g.phase, liveAt: g.liveAt, endsAt: g.endsAt, serverNow: g.now, progress: Math.round(g.progress * 1000) / 1000,
    players: g.players, alivePlayers: g.alivePlayers, teams: g.field, aliveTeams: g.aliveTeams, zone: g.zone, zones: g.zones,
    simulated: true, adapter: 'simulation',
    feed: g.happened.slice(-14).reverse().map((e) => ({
      at: g.liveAt + e.t, victim: name(e.victim), killer: e.killer ? name(e.killer) : null, zone: e.zone,
      teamOut: e.teamOut ? teamName(e.team) || name(e.victim) : null, mine: !!me && (e.victim === me.id || e.killer === me.id || (mineTeam && mineTeam.members.includes(e.victim))),
    })),
    me: me && m.players.includes(me.id) ? { alive: !myDeath, kills: myKills, squad: mineTeam?.name || null, squadAlive, squadSize: mineTeam?.members.length || 1, eliminatedBy: myDeath?.killer ? name(myDeath.killer) : myDeath ? 'the zone' : null } : null,
  };
}

function instructionsFor(game, mode, m, me) {
  const id = me?.inGameIds?.[game.id];
  const steps = [`Open ${game.name} and queue ${mode?.name || 'the mode on your card'}.`];
  if (m.kind === 'h2h' || (m.kind === 'tournament' && !m.tournament?.br)) steps.push('Add your opponent in-game using their ID from their profile, then start a match with the settings on the card.');
  else steps.push('Use public matchmaking. Private rooms void the result.');
  steps.push('Screenshot or record the final results screen. Your in-game name must be visible.');
  if (id) steps.push(`Play on your linked account (${id}).`);
  return steps;
}

export function tourView(db, t, me, detail = false) {
  const game = findGame(db, t.gameId);
  const mode = game?.modes.find((x) => x.id === t.modeId);
  const pool = computePool({ ...t.prize, guaranteed: t.guaranteed }, { entry: t.entry * t.teamSize, entrants: t.status === 'registration' ? t.maxEntrants : t.entrants.length, teamSize: t.teamSize });
  const myEntrant = me ? entrantOf(t, me.id) : null;
  const v = {
    id: t.id, name: t.name, status: t.status, format: t.format, teamSize: t.teamSize, maxEntrants: t.maxEntrants,
    entrants: t.entrants.length, entry: t.entry, startsAt: t.startsAt, registrationDeadline: t.registrationDeadline,
    game: gameMini(game), mode: mode ? { id: mode.id, name: mode.name } : null, platform: t.platform,
    pool, guaranteed: t.guaranteed, featured: t.featured, region: t.region,
    sponsor: t.sponsorId ? db.sponsors.find((s) => s.id === t.sponsorId) : null,
    registered: !!myEntrant, myEntrant: myEntrant ? { id: myEntrant.id, name: myEntrant.name } : null,
    champion: t.results?.order?.[0] || null,
  };
  if (!detail) return v;
  v.rules = [...t.rules, ...(game?.rules || []).slice(0, 2)];
  v.entrantList = t.entrants.map((e) => ({ id: e.id, name: e.name, tag: e.tag, color: e.color, seed: e.seed, rating: e.rating, type: e.type, members: e.members.map((id) => lite(db, id)), human: e.members.some((id) => findUser(db, id) && !findUser(db, id).isBot) }));
  v.results = t.results ? { ...t.results, payouts: undefined } : null;
  if (t.bracket) {
    const name = (id) => t.entrants.find((e) => e.id === id)?.name || (id ? 'TBD' : 'Bye');
    v.bracket = {
      format: t.bracket.format,
      table: !!t.bracket.table,
      matches: t.bracket.matches.map((m) => {
        if (m.side === 'BR') return { id: m.id, round: m.round, label: m.label, side: 'BR', done: !!m.placements, placements: (m.placements || []).slice(0, 12).map((p) => ({ ...p, name: name(p.entrantId) })) };
        const [a, b] = participants(t.bracket, m);
        // A slot fed by an unfinished match is "TBD", not a bye.
        const pending = (slot) => slot && !('entrantId' in slot) && !t.bracket.matches.some((x) => x.id === slot.from.match && (x.winner || x.void));
        const slot = (id, s) => (id ? { id, name: name(id) } : pending(s) ? { tbd: true, name: 'TBD' } : null);
        return { id: m.id, round: m.round, label: m.label, side: m.side, a: slot(a, m.a), b: slot(b, m.b), winner: m.winner, score: m.score, void: !!m.void, matchId: m.matchId };
      }),
      standings: t.bracket.table ? standings(t.bracket).map((r) => ({ ...r, name: name(r.entrantId) })) : null,
    };
    if (me) {
      const { bm } = readyMatchFor(t, me.id);
      v.myNext = bm ? { id: bm.id, label: bm.label, matchId: bm.matchId } : null;
      v.eliminated = !!myEntrant && t.status === 'live' && !bm && isEliminated(t, myEntrant.id);
    }
  }
  return v;
}

function isEliminated(t, entrantId) {
  const b = t.bracket;
  if (b.table) return false;
  const losses = b.matches.filter((m) => m.loser === entrantId).length;
  return b.format === 'double_elim' ? losses >= 2 : losses >= 1;
}

export function missionView(db, m, me) {
  const sponsor = db.sponsors.find((s) => s.id === m.sponsorId);
  const prog = me ? m.progress[me.id] : null;
  return {
    id: m.id, title: m.title, brief: m.brief, type: m.type, status: m.status, objective: m.objective, reward: m.reward,
    quantity: m.quantity, remaining: Math.max(0, m.quantity - m.stats.completions), startsAt: m.startsAt, endsAt: m.endsAt,
    regions: m.regions, terms: m.terms, eligibility: m.eligibility,
    game: gameMini(findGame(db, m.gameId)), modeId: m.modeId,
    sponsor, campaignId: m.campaignId,
    hunt: m.hunt ? { size: m.hunt.size, maxScans: m.hunt.maxScans } : null,
    progress: prog ? { startedAt: prog.startedAt, completedAt: prog.completedAt, scans: prog.scans || [], found: !!prog.found, failed: !!prog.failed, matchId: prog.matchId || null, counts: prog.counts || {} } : null,
    stats: m.stats,
  };
}
