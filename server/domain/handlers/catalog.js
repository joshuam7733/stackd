import { define } from '../router.js';
import { s } from '../validate.js';
import { E } from '../errors.js';
import { PLATFORMS, CATEGORIES, COUNTRIES, COMPETITION_TYPES, REGIONS } from '../models.js';
import { PAYOUT_MODELS } from '../engines/prize.js';
import { FORMATS } from '../engines/bracket.js';
import { VERIFIERS } from '../engines/verification.js';
import { PROVIDERS } from '../engines/payments.js';
import { challengeMultiplier } from '../engines/prize.js';
import { evaluate } from '../engines/compliance.js';
import { balances } from '../ledger.js';
import { gameMini, compView, tourView, pubUser, lite, missionView, findUser } from './views.js';
import { listIntegrations } from '../../integrations/index.js';
import { PROGRESS_METRICS } from '../services/missions.js';

// Players seen in the last 15 minutes (a real session or recent activity).
const activeRecently = (db) => {
  const cutoff = Date.now() - 15 * 60_000;
  return db.users.filter((u) => u.role === 'player' && (u.online || (u.lastSeen || 0) > cutoff));
};

define('meta.get', {
  auth: false,
  handler({ db }) {
    return {
      platforms: PLATFORMS, categories: CATEGORIES, countries: COUNTRIES, regions: REGIONS, competitionTypes: COMPETITION_TYPES,
      payoutModels: PAYOUT_MODELS, formats: FORMATS, verifiers: VERIFIERS,
      providers: Object.values(PROVIDERS).map(({ id, name, kind, countries, min, max, field, feePct, approveCopy }) => ({ id, name, kind, countries, min, max, field, feePct, approveCopy })),
      ranks: db.config.ranks, season: db.config.season, demoMode: db.config.demoMode, realMoney: db.config.realMoney,
      challengeEntry: db.config.challengeEntry, h2hEntry: db.config.h2hEntry, h2hFeePct: db.config.h2hFeePct, highStakesKyc: db.config.highStakesKyc,
      platformFeePct: db.config.platformFeePct, starterStack: db.config.starterStack, currency: 'UGX', demoLogins: process.env.DEMO_LOGINS !== 'false',
      integrations: listIntegrations(), progressMetrics: Object.fromEntries(Object.entries(PROGRESS_METRICS).map(([k, v]) => [k, v.label])),
      achievements: db.achievementDefs,
    };
  },
});

define('landing.get', {
  auth: false,
  handler({ db }) {
    const paid = db.ledger.filter((t) => t.type === 'prize' && t.status === 'completed').reduce((a, t) => a + t.amount, 0);
    return {
      games: db.games.filter((g) => g.status === 'active').sort((a, b) => b.popularity - a.popularity).map(gameMini),
      feed: db.feed.slice(0, 12).map((f) => ({ ...f, user: lite(db, f.userId), game: gameMini(db.games.find((g) => g.id === f.gameId)) })),
      pools: db.competitions.filter((c) => c.kind === 'pool' && c.status === 'open').sort((a, b) => (b.projected?.net || b.entry * b.maxPlayers) - (a.entry * a.maxPlayers)).slice(0, 3).map((c) => compView(db, c, null)),
      tournaments: db.tournaments.filter((t) => t.status === 'registration').sort((a, b) => a.startsAt - b.startsAt).slice(0, 3).map((t) => tourView(db, t, null)),
      missions: db.missions.filter((m) => m.status === 'live').slice(0, 3).map((m) => missionView(db, m, null)),
      leaders: db.users.filter((u) => u.role === 'player').sort((a, b) => b.stackScore - a.stackScore).slice(0, 5).map((u) => pubUser(db, u)),
      // Real counts from the database (demo money): no padding.
      stats: { players: db.users.filter((u) => u.role === 'player').length, paidOut: paid, games: db.games.filter((g) => g.status === 'active').length, liveNow: db.competitions.filter((c) => ['live', 'starting'].includes(c.status)).length + db.tournaments.filter((t) => t.status === 'live').length, demo: true },
    };
  },
});

define('games.list', {
  auth: false,
  schema: s.obj({ platform: s.opt(s.str({ max: 20 })), category: s.opt(s.str({ max: 30 })), q: s.opt(s.str({ max: 40 })), includeDisabled: s.opt(s.bool()) }),
  handler({ db, user }, p) {
    const q = (p.q || '').toLowerCase();
    return db.games
      .filter((g) => (p.includeDisabled && user?.role === 'admin') || g.status === 'active')
      .filter((g) => !p.platform || g.platforms.includes(p.platform))
      .filter((g) => !p.category || g.category === p.category)
      .filter((g) => !q || g.name.toLowerCase().includes(q) || g.short.toLowerCase().includes(q))
      .sort((a, b) => b.popularity - a.popularity)
      .map((g) => ({
        ...gameMini(g), popularity: g.popularity, featured: g.featured, developer: g.developer,
        open: db.competitions.filter((c) => c.gameId === g.id && c.status === 'open' && c.visibility === 'public').length,
        playing: activeRecently(db).filter((u) => u.games.includes(g.id)).length,
      }));
  },
});

define('games.get', {
  auth: false,
  schema: s.obj({ slug: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const g = db.games.find((x) => x.slug === p.slug || x.id === p.slug);
    if (!g || (g.status !== 'active' && user?.role !== 'admin')) throw E.notFound('Game');
    const comps = db.competitions.filter((c) => c.gameId === g.id && ['open', 'live', 'full'].includes(c.status) && c.visibility === 'public');
    const score = user ? user.gameScores[g.id]?.score ?? user.stackScore : 1150;
    return {
      ...g,
      challengeTemplates: db.challengeTemplates.filter((t) => t.gameId === g.id).map((t) => ({ ...t, multiplier: challengeMultiplier(t, score, db.config.challengeMargin) })),
      pools: comps.filter((c) => c.kind === 'pool').map((c) => compView(db, c, user)),
      h2h: comps.filter((c) => c.kind === 'h2h' && c.status === 'open').map((c) => compView(db, c, user)),
      tournaments: db.tournaments.filter((t) => t.gameId === g.id && t.status !== 'cancelled').sort((a, b) => a.startsAt - b.startsAt).map((t) => tourView(db, t, user)),
      missions: db.missions.filter((m) => m.gameId === g.id && m.status === 'live').map((m) => missionView(db, m, user)),
      leaders: db.users.filter((u) => u.role === 'player' && u.gameScores[g.id]).sort((a, b) => b.gameScores[g.id].score - a.gameScores[g.id].score).slice(0, 8).map((u) => ({ ...lite(db, u.id), gameScore: u.gameScores[g.id].score, wins: u.gameScores[g.id].wins })),
      playing: activeRecently(db).filter((u) => u.games.includes(g.id)).length,
      myScore: user?.gameScores[g.id] || null,
    };
  },
});

define('home.get', {
  handler({ db, user }) {
    const now = Date.now();
    const mine = db.competitions.filter((c) => c.participants.some((p) => p.userId === user.id) && !['settled', 'cancelled'].includes(c.status));
    const incoming = db.competitions.filter((c) => c.kind === 'h2h' && c.status === 'open' && c.h2h.opponentId === user.id);
    const myTours = db.tournaments.filter((t) => ['registration', 'live'].includes(t.status) && t.entrants.some((e) => e.members.includes(user.id)));
    const live = [
      ...db.competitions.filter((c) => ['live', 'starting'].includes(c.status) && c.visibility === 'public' && c.kind !== 'challenge').map((c) => ({ type: 'competition', at: c.startsAt, item: compView(db, c, user) })),
      ...db.tournaments.filter((t) => t.status === 'live').map((t) => ({ type: 'tournament', at: t.startsAt, item: tourView(db, t, user) })),
    ].sort((a, b) => b.at - a.at).slice(0, 8);
    const myGames = new Set(user.games);
    return {
      upNext: [
        ...incoming.map((c) => ({ type: 'incoming', item: compView(db, c, user) })),
        ...mine.map((c) => ({ type: 'competition', item: compView(db, c, user) })),
        ...myTours.map((t) => ({ type: 'tournament', item: tourView(db, t, user) })),
      ].slice(0, 6),
      live,
      games: db.games.filter((g) => g.status === 'active' && g.platforms.includes('mobile')).sort((a, b) => (myGames.has(b.id) - myGames.has(a.id)) || b.popularity - a.popularity).slice(0, 10).map((g) => ({ ...gameMini(g), open: db.competitions.filter((c) => c.gameId === g.id && c.status === 'open').length })),
      featured: db.competitions.filter((c) => c.kind === 'pool' && c.status === 'open' && c.startsAt > now).sort((a, b) => (b.featured - a.featured) || (b.entry * b.maxPlayers - a.entry * a.maxPlayers)).slice(0, 6).map((c) => compView(db, c, user)),
      tournaments: db.tournaments.filter((t) => t.status === 'registration').sort((a, b) => a.startsAt - b.startsAt).slice(0, 6).map((t) => tourView(db, t, user)),
      missions: db.missions.filter((m) => m.status === 'live').map((m) => missionView(db, m, user)),
      topPlayers: db.users.filter((u) => u.role === 'player').sort((a, b) => b.stackScore - a.stackScore).slice(0, 5).map((u) => pubUser(db, u)),
      winners: db.feed.slice(0, 8).map((f) => ({ ...f, user: lite(db, f.userId), game: gameMini(db.games.find((g) => g.id === f.gameId)) })),
      stack: { wallet: balances(db, user.id), me: pubUser(db, user), season: db.config.season, position: db.users.filter((u) => u.role === 'player' && u.stackScore > user.stackScore).length + 1 },
      teamInvites: db.teams.filter((t) => t.invites.some((i) => i.userId === user.id)).map((t) => ({ id: t.id, name: t.name, tag: t.tag, color: t.color })),
    };
  },
});

define('search.all', {
  schema: s.obj({ q: s.str({ min: 1, max: 40 }) }),
  handler({ db, user }, p) {
    const q = p.q.toLowerCase();
    return {
      games: db.games.filter((g) => g.status === 'active' && (g.name.toLowerCase().includes(q) || g.short.toLowerCase().includes(q))).slice(0, 6).map(gameMini),
      players: db.users.filter((u) => u.role === 'player' && u.username.toLowerCase().includes(q)).slice(0, 8).map((u) => lite(db, u.id)),
      teams: db.teams.filter((t) => t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)).slice(0, 6).map((t) => ({ id: t.id, name: t.name, tag: t.tag, color: t.color, members: t.members.length })),
      tournaments: db.tournaments.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 6).map((t) => tourView(db, t, user)),
      competitions: db.competitions.filter((c) => c.visibility === 'public' && c.kind === 'pool' && c.title.toLowerCase().includes(q)).slice(0, 6).map((c) => compView(db, c, user)),
    };
  },
});

define('compliance.check', {
  schema: s.obj({ action: s.oneOf(['paid_entry', 'deposit', 'withdraw', 'stake', 'predict', 'free_entry']), amount: s.opt(s.int({ min: 0 })) }),
  handler({ db, user }, p) {
    return evaluate(db, user, p.action, { amount: p.amount });
  },
});

define('players.get', {
  auth: false,
  schema: s.obj({ username: s.str({ max: 40 }) }),
  handler({ db, user }, p) {
    const u = db.users.find((x) => x.username.toLowerCase() === p.username.toLowerCase() && x.role === 'player');
    if (!u) throw E.notFound('Player');
    const matches = db.matches
      .filter((m) => m.players.includes(u.id) && m.status === 'settled' && m.outcome?.perUser?.[u.id])
      .sort((a, b) => b.settledAt - a.settledAt)
      .slice(0, 10)
      .map((m) => {
        const comp = db.competitions.find((c) => c.id === m.refId);
        const tour = db.tournaments.find((t) => t.id === m.refId);
        const opp = m.kind === 'h2h' ? m.players.find((x) => x !== u.id) : null;
        return { id: m.id, kind: m.kind, title: m.title || comp?.title || tour?.name, game: gameMini(db.games.find((g) => g.id === m.gameId)), at: m.settledAt, result: m.outcome.perUser[u.id], score: m.outcome.score && m.players[1] === u.id ? m.outcome.score.split('–').reverse().join('–') : m.outcome.score, opponent: opp ? lite(db, opp) : null };
      });
    const teams = db.teams.filter((t) => t.members.some((m) => m.userId === u.id)).map((t) => ({ id: t.id, name: t.name, tag: t.tag, color: t.color, role: t.members.find((m) => m.userId === u.id).role }));
    const tournaments = db.tournaments.filter((t) => t.status === 'completed' && t.entrants.some((e) => e.members.includes(u.id))).map((t) => {
      const e = t.entrants.find((x) => x.members.includes(u.id));
      const place = (t.results?.order || []).find((o) => o.entrantId === e.id)?.place || null;
      return { id: t.id, name: t.name, place, entrants: t.entrants.length, at: t.startsAt };
    });
    const isMe = user?.id === u.id;
    return {
      user: pubUser(db, u),
      matches, teams, tournaments,
      relationship: user ? { isMe, following: user.following.includes(u.id), friend: user.friends.includes(u.id), requested: u.friendRequests.includes(user.id), incoming: user.friendRequests.includes(u.id) } : null,
      drops: isMe ? db.drops.filter((d) => d.userId === u.id) : [],
      earningsVisible: isMe || u.stats.earnings > 0,
    };
  },
});

define('leaderboards.get', {
  schema: s.obj({
    scope: s.oneOf(['global', 'country', 'region', 'game', 'platform', 'season', 'friends', 'team', 'teams']),
    metric: s.oneOf(['score', 'wins', 'winRate', 'earnings', 'streak', 'tournaments', 'competitions']),
    gameId: s.opt(s.str({ max: 40 })),
    platform: s.opt(s.str({ max: 20 })),
    country: s.opt(s.str({ max: 2 })),
  }),
  handler({ db, user }, p) {
    const myTeams = db.teams.filter((t) => t.members.some((m) => m.userId === user.id));
    if (p.scope === 'teams') {
      const tv = (t) => {
        const s = t.stats;
        switch (p.metric) {
          case 'wins': return s.wins;
          case 'winRate': return s.matches >= 5 ? Math.round((s.wins / s.matches) * 1000) / 10 : 0;
          case 'earnings': return s.earnings;
          case 'competitions': return s.competitions;
          default: return t.rating;
        }
      };
      const list = db.teams.map((t) => ({ t, v: tv(t) })).sort((a, b) => b.v - a.v).map((r, i) => ({
        position: i + 1, value: r.v, mine: myTeams.includes(r.t),
        team: { id: r.t.id, name: r.t.name, tag: r.t.tag, color: r.t.color, rating: r.t.rating, wins: r.t.stats.wins, matches: r.t.stats.matches, competitions: r.t.stats.competitions, winRate: r.t.stats.matches ? Math.round((r.t.stats.wins / r.t.stats.matches) * 100) : 0, members: r.t.members.length },
      }));
      return { rows: list.slice(0, 50), me: list.find((r) => r.mine) || null, total: list.length };
    }
    let rows = db.users.filter((u) => u.role === 'player' && u.status !== 'suspended');
    const regionOf = (c) => db.jurisdictions && (COUNTRIES.find((x) => x.code === c)?.region);
    if (p.scope === 'country') rows = rows.filter((u) => u.country === (p.country || user.country));
    if (p.scope === 'region') rows = rows.filter((u) => regionOf(u.country) === regionOf(user.country));
    if (p.scope === 'game') rows = rows.filter((u) => u.gameScores[p.gameId || user.games[0]]);
    if (p.scope === 'platform') rows = rows.filter((u) => u.platforms.includes(p.platform || 'mobile'));
    if (p.scope === 'friends') rows = rows.filter((u) => u.id === user.id || user.friends.includes(u.id));
    if (p.scope === 'team') rows = rows.filter((u) => u.id === user.id || myTeams.some((t) => t.members.some((m) => m.userId === u.id)));
    const gid = p.gameId || user.games[0];
    const val = (u) => {
      if (p.scope === 'game' && p.metric === 'score') return u.gameScores[gid]?.score || 0;
      if (p.scope === 'season' && p.metric === 'score') return u.stats.seasonPoints || 0;
      switch (p.metric) {
        case 'wins': return u.stats.wins;
        case 'winRate': return u.stats.matches >= 20 ? Math.round((u.stats.wins / u.stats.matches) * 1000) / 10 : 0;
        case 'earnings': return u.stats.earnings;
        case 'streak': return u.stats.streak;
        case 'tournaments': return u.stats.tournamentWins;
        case 'competitions': return u.stats.competitions || 0;
        default: return u.stackScore;
      }
    };
    const sorted = rows.map((u) => ({ u, v: val(u) })).sort((a, b) => b.v - a.v);
    const list = sorted.map((r, i) => ({ position: i + 1, value: r.v, user: pubUser(db, r.u) }));
    return { rows: list.slice(0, 50), me: list.find((r) => r.user.id === user.id) || null, total: list.length };
  },
});
