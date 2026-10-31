import { define } from '../router.js';
import { s } from '../validate.js';
import { E } from '../errors.js';
import { createCompetition, createTournament, createMission, CATEGORIES } from '../models.js';
import { balances, post, refundRef } from '../ledger.js';
import { notify, audit } from '../notify.js';
import { computePool } from '../engines/prize.js';
import { cancelCompetition, startPool, resolveMatchDecision, fillPool, advancePools } from '../services/competitions.js';
import { cancelTournament, startTournament, finalizeTournamentH2H } from '../services/tournaments.js';
import { resolveMarket } from '../world.js';
import { lite, compView, tourView, gameMini, matchView, missionView, selfUser } from './views.js';
import { DAY, slugify, uid } from '../util.js';

const ADMIN = ['admin'];
const STAFF = ['admin', 'referee'];
const startOfDay = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// ---- overview ---------------------------------------------------------------------------------

define('admin.overview', {
  roles: STAFF,
  handler({ db }) {
    const now = Date.now();
    const today = startOfDay(now);
    const players = db.users.filter((u) => u.role === 'player');
    const series = Array.from({ length: 14 }, (_, i) => {
      const start = startOfDay(now - (13 - i) * DAY);
      const end = start + DAY;
      return {
        day: start,
        revenue: db.revenue.filter((r) => r.at >= start && r.at < end).reduce((a, r) => a + r.amount, 0),
        signups: players.filter((u) => u.createdAt >= start && u.createdAt < end).length,
      };
    });
    const openPools = db.competitions.filter((c) => c.kind === 'pool' && ['open', 'full', 'live'].includes(c.status));
    const byGame = {};
    for (const c of db.competitions.filter((x) => x.createdAt > now - 7 * DAY || ['open', 'live'].includes(x.status))) byGame[c.gameId] = (byGame[c.gameId] || 0) + c.participants.length;
    return {
      kpis: {
        players: players.length,
        newToday: players.filter((u) => u.createdAt >= today).length,
        online: players.filter((u) => u.online).length,
        activeCompetitions: db.competitions.filter((c) => ['open', 'full', 'live'].includes(c.status)).length,
        liveMatches: db.matches.filter((m) => ['live', 'reporting'].includes(m.status)).length,
        tournamentsLive: db.tournaments.filter((t) => t.status === 'live').length,
        tournamentsUpcoming: db.tournaments.filter((t) => t.status === 'registration').length,
        prizePools: openPools.reduce((a, c) => a + computePool(c.prize, { entry: c.entry * (c.format === 'team' ? c.teamSize : 1), entrants: Math.floor(c.participants.length / (c.format === 'team' ? c.teamSize : 1)), teamSize: c.teamSize }).net, 0),
        revenue30: db.revenue.filter((r) => r.at > now - 30 * DAY).reduce((a, r) => a + r.amount, 0),
        revenueToday: db.revenue.filter((r) => r.at >= today).reduce((a, r) => a + r.amount, 0),
        txToday: db.ledger.filter((t) => t.createdAt >= today).length,
        withdrawalsPending: db.ledger.filter((t) => t.type === 'withdrawal' && t.status === 'pending').length,
        disputesOpen: db.disputes.filter((d) => ['open', 'under_review', 'appealed'].includes(d.status)).length,
        reviewQueue: db.matches.filter((m) => m.status === 'verifying').length,
        fraudOpen: db.fraud.filter((f) => f.status === 'open').length,
        kycPending: db.users.filter((u) => u.kyc?.status === 'pending').length,
        ticketsOpen: db.tickets.filter((t) => t.status === 'open').length,
      },
      series,
      byGame: Object.entries(byGame).map(([id, n]) => ({ game: gameMini(db.games.find((g) => g.id === id)), entries: n })).sort((a, b) => b.entries - a.entries).slice(0, 8),
      audit: db.audit.slice(0, 8).map((a) => ({ ...a, actor: lite(db, a.actorId) })),
      fraud: db.fraud.filter((f) => f.status === 'open').slice(0, 5).map((f) => ({ ...f, user: lite(db, f.userId) })),
    };
  },
});

// ---- users ------------------------------------------------------------------------------------

define('admin.users', {
  roles: STAFF,
  schema: s.obj({ q: s.opt(s.str({ max: 60 })), status: s.opt(s.str({ max: 20 })), kyc: s.opt(s.str({ max: 20 })), role: s.opt(s.str({ max: 20 })) }),
  handler({ db }, p) {
    const q = (p.q || '').toLowerCase();
    return db.users
      .filter((u) => !q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.id.includes(q))
      .filter((u) => !p.status || u.status === p.status)
      .filter((u) => !p.kyc || u.kyc?.status === p.kyc)
      .filter((u) => !p.role || u.role === p.role)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 120)
      .map((u) => ({
        ...lite(db, u.id), email: u.email, role: u.role, status: u.status, kyc: u.kyc?.status, createdAt: u.createdAt, country: u.country,
        matches: u.stats.matches, earnings: u.stats.earnings, balance: balances(db, u.id).available, flags: db.fraud.filter((f) => f.userId === u.id && f.status === 'open').length,
        restrictions: u.restrictions, demo: u.isBot,
      }));
  },
});

define('admin.user', {
  roles: STAFF,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db }, p) {
    const u = db.users.find((x) => x.id === p.id);
    if (!u) throw E.notFound('User');
    return {
      user: selfUser(db, u),
      demo: u.isBot,
      ledger: db.ledger.filter((t) => t.userId === u.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 25),
      matches: db.matches.filter((m) => m.players.includes(u.id)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10).map((m) => ({ id: m.id, title: m.title || db.competitions.find((c) => c.id === m.refId)?.title || 'Match', status: m.status, kind: m.kind, at: m.settledAt || m.createdAt, result: m.outcome?.perUser?.[u.id] || null })),
      fraud: db.fraud.filter((f) => f.userId === u.id),
      audit: db.audit.filter((a) => a.actorId === u.id || a.target === u.id).slice(0, 20),
      teams: db.teams.filter((t) => t.members.some((m) => m.userId === u.id)).map((t) => ({ id: t.id, name: t.name, tag: t.tag })),
      reports: db.reports.filter((r) => r.userId === u.id),
    };
  },
});

define('admin.userAction', {
  roles: ADMIN, write: true,
  schema: s.obj({
    id: s.str({ max: 60 }),
    action: s.oneOf(['verify_kyc', 'reject_kyc', 'restrict', 'unrestrict', 'suspend', 'reinstate', 'toggle_real_money', 'toggle_staking', 'toggle_predictions', 'lift_self_exclusion']),
    note: s.opt(s.str({ max: 200 })),
  }),
  audit: (p) => `${p.id}:${p.action}`,
  handler({ db, user: admin }, p) {
    const u = db.users.find((x) => x.id === p.id);
    if (!u) throw E.notFound('User');
    if (u.role === 'admin' && ['restrict', 'suspend'].includes(p.action)) throw E.forbidden("Admins can't be restricted here.");
    const say = (title, body) => notify(db, u.id, { type: 'system', title, body: body || p.note || '', link: '/app/settings' });
    switch (p.action) {
      case 'verify_kyc': u.kyc = { ...u.kyc, status: 'verified', level: Math.max(1, u.kyc.level || 1), reviewedAt: Date.now() }; say("You're verified", 'Withdrawals and higher limits are unlocked.'); break;
      case 'reject_kyc': u.kyc = { ...u.kyc, status: 'rejected', reviewedAt: Date.now(), note: p.note }; say('Verification needs another try', p.note || 'The document was unreadable. Upload a clearer photo.'); break;
      case 'restrict': u.status = 'restricted'; say('Paid play is paused on your account', p.note || 'Our team is reviewing recent activity. Free play stays open.'); break;
      case 'unrestrict': u.status = 'active'; say('Your account is fully active again'); break;
      case 'suspend': u.status = 'suspended'; for (const [k, v] of Object.entries(db.sessions)) if (v.userId === u.id) delete db.sessions[k]; break;
      case 'reinstate': u.status = 'active'; say('Your account is reinstated'); break;
      case 'toggle_real_money': u.restrictions.realMoney = !u.restrictions.realMoney; break;
      case 'toggle_staking': u.restrictions.staking = !u.restrictions.staking; break;
      case 'toggle_predictions': u.restrictions.predictions = !u.restrictions.predictions; break;
      case 'lift_self_exclusion': throw E.forbidden('Self-exclusion can only end when the chosen period ends.');
      default: break;
    }
    return { ok: true, status: u.status, kyc: u.kyc, restrictions: u.restrictions };
  },
});

define('admin.adjust', {
  roles: ADMIN, write: true, idempotent: true, rate: 'financial',
  schema: s.obj({ userId: s.str({ max: 60 }), amount: s.int({ min: -10_000_000, max: 10_000_000 }), reason: s.str({ min: 5, max: 200 }) }),
  audit: (p) => `${p.userId}:${p.amount}`,
  handler({ db, user: admin }, p) {
    if (p.amount === 0) throw E.invalid('Amount cannot be zero.');
    const u = db.users.find((x) => x.id === p.userId);
    if (!u) throw E.notFound('User');
    return post(db, { userId: u.id, type: p.amount > 0 ? 'bonus' : 'reversal', amount: p.amount, description: `Adjustment: ${p.reason}`, meta: { by: admin.id } });
  },
});

// ---- games ------------------------------------------------------------------------------------

const modeSchema = s.obj({
  id: s.str({ min: 2, max: 30, pattern: '^[a-z0-9_]+$' }), name: s.str({ min: 2, max: 40 }), teamSize: s.int({ min: 1, max: 10 }), maxPlayers: s.int({ min: 1, max: 200 }),
  types: s.arr(s.oneOf(['challenge', 'h2h', 'pool', 'tournament']), { min: 1 }),
  metrics: s.arr(s.obj({ key: s.str({ max: 20 }), label: s.str({ max: 30 }), min: s.opt(s.num()), max: s.opt(s.num()), type: s.opt(s.str({ max: 10 })), lowerBetter: s.opt(s.bool()), step: s.opt(s.num()) }), { min: 1, max: 6 }),
});

define('admin.games', {
  roles: STAFF,
  handler({ db }) {
    return db.games.map((g) => ({ ...g, competitions: db.competitions.filter((c) => c.gameId === g.id).length, players: db.users.filter((u) => u.games.includes(g.id)).length }));
  },
});

define('admin.gameSave', {
  roles: ADMIN, write: true,
  schema: s.obj({
    id: s.opt(s.str({ max: 40 })),
    name: s.str({ min: 2, max: 60 }), short: s.str({ min: 2, max: 16 }), developer: s.str({ min: 2, max: 60 }),
    description: s.str({ min: 10, max: 300 }), category: s.oneOf(Object.keys(CATEGORIES)),
    platforms: s.arr(s.oneOf(['mobile', 'pc', 'playstation', 'xbox']), { min: 1 }),
    regions: s.arr(s.str({ max: 2 }), { min: 1 }),
    modes: s.arr(modeSchema, { min: 1, max: 8 }),
    rules: s.arr(s.str({ max: 240 }), { max: 12 }),
    eligibility: s.arr(s.str({ max: 120 }), { max: 8 }),
    verification: s.arr(s.oneOf(['api', 'video', 'screenshot', 'manual']), { min: 1 }),
    status: s.oneOf(['active', 'disabled', 'coming_soon']),
    realMoney: s.bool(),
    featured: s.bool(),
    art: s.obj({ bg: s.str({ pattern: '^#[0-9A-Fa-f]{6}$' }), fg: s.str({ pattern: '^#[0-9A-Fa-f]{6}$' }), motif: s.oneOf(['zone', 'lanes', 'pitch', 'rack', 'speed', 'burst', 'tiles', 'slash']) }),
    media: s.opt(s.obj({ source: s.opt(s.str({ max: 40 })), cover: s.opt(s.str({ max: 600, pattern: '^https://' })), banner: s.opt(s.str({ max: 600, pattern: '^https://' })), hero: s.opt(s.str({ max: 600, pattern: '^https://' })), icon: s.opt(s.str({ max: 600, pattern: '^https://' })), coverPos: s.opt(s.str({ max: 20 })), bannerPos: s.opt(s.str({ max: 20 })), logo: s.opt(s.bool()), rev: s.opt(s.int({ min: 0 })), custom: s.opt(s.bool()) })),
  }),
  audit: (p, out) => out?.id,
  handler({ db }, p) {
    const competitionTypes = [...new Set(p.modes.flatMap((m) => m.types))];
    if (p.media) p.media.custom = true;
    if (p.id) {
      const g = db.games.find((x) => x.id === p.id);
      if (!g) throw E.notFound('Game');
      Object.assign(g, { ...p, competitionTypes });
      return g;
    }
    const id = slugify(p.short).replace(/-/g, '') || uid('g');
    if (db.games.some((g) => g.id === id)) throw E.conflict('A game with that short name exists.');
    const g = { ...p, id, slug: slugify(p.name), popularity: 50, competitionTypes };
    db.games.push(g);
    return g;
  },
});

define('admin.gameStatus', {
  roles: ADMIN, write: true,
  schema: s.obj({ id: s.str({ max: 40 }), status: s.oneOf(['active', 'disabled', 'coming_soon']) }),
  audit: (p) => `${p.id}:${p.status}`,
  handler({ db }, p) {
    const g = db.games.find((x) => x.id === p.id);
    if (!g) throw E.notFound('Game');
    g.status = p.status;
    return g;
  },
});

// ---- competitions & tournaments ---------------------------------------------------------------

const prizeSchema = s.obj({
  model: s.oneOf(['winner_takes_all', 'placement', 'team', 'individual', 'hybrid', 'custom']),
  feePct: s.num({ min: 0, max: 50 }),
  poolPct: s.opt(s.num({ min: 0, max: 100 })),
  placements: s.opt(s.arr(s.num({ min: 0, max: 100 }), { max: 20 })),
  killPoolPct: s.opt(s.num({ min: 0, max: 100 })),
  teamSplit: s.opt(s.oneOf(['equal', 'performance'])),
  sponsorBoost: s.opt(s.int({ min: 0 })),
  guaranteed: s.opt(s.int({ min: 0 })),
  custom: s.opt(s.arr(s.obj({ label: s.str({ max: 40 }), pct: s.num({ min: 0, max: 100 }) }), { max: 10 })),
  bonuses: s.opt(s.arr(s.obj({ label: s.str({ max: 40 }), amount: s.int({ min: 0 }), fundedBy: s.oneOf(['platform', 'sponsor']) }), { max: 5 })),
});

function checkPrize(prize) {
  if (prize.poolPct != null && prize.poolPct + prize.feePct > 100) throw E.invalid('Platform fee plus prize pool can’t be more than 100% of entries.');
  const pool = computePool(prize, { entry: 1000, entrants: 10 });
  if (!pool.valid) throw E.invalid('Payout percentages must add up to 100%.');
}

define('admin.competitions', {
  roles: STAFF,
  schema: s.obj({ status: s.opt(s.str({ max: 20 })), kind: s.opt(s.str({ max: 20 })) }),
  handler({ db, user }, p) {
    return db.competitions
      .filter((c) => !p.kind || c.kind === p.kind)
      .filter((c) => !p.status || (p.status === 'active' ? ['draft', 'open', 'full', 'starting', 'live', 'verifying', 'disputed'].includes(c.status) : c.status === p.status))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 150)
      .map((c) => ({ ...compView(db, c, user), creator: c.createdBy === 'system' || !c.createdBy ? { id: 'system', username: 'STACKD' } : lite(db, c.createdBy) }));
  },
});

define('admin.compCreate', {
  roles: ADMIN, write: true,
  schema: s.obj({
    title: s.str({ min: 3, max: 50 }), gameId: s.str({ max: 40 }), modeId: s.str({ max: 40 }), platform: s.oneOf(['mobile', 'pc', 'playstation', 'xbox']),
    entry: s.int({ min: 0, max: 10_000_000 }), minPlayers: s.int({ min: 2, max: 200 }), maxPlayers: s.int({ min: 2, max: 200 }),
    startsInMin: s.int({ min: 1, max: 60 * 24 * 14 }), prize: prizeSchema, featured: s.bool(), sponsorId: s.opt(s.str({ max: 40 })), realMoney: s.bool(),
    region: s.opt(s.str({ max: 30 })), publish: s.opt(s.bool()),
  }),
  audit: (p, out) => out?.id,
  handler({ db, user }, p) {
    if (p.entry > 0 && p.entry < 1000) throw E.invalid('Paid entries start at UGX 1,000.');
    const g = db.games.find((x) => x.id === p.gameId);
    const mode = g?.modes.find((m) => m.id === p.modeId);
    if (!g || !mode) throw E.invalid('Pick a game and mode.');
    if (!mode.types.includes('pool')) throw E.invalid(`${mode.name} doesn't support pools.`);
    if (p.minPlayers > p.maxPlayers) throw E.invalid('Minimum players is above the maximum.');
    if (mode.teamSize > 1 && p.maxPlayers % mode.teamSize) throw E.invalid(`Max players must be a multiple of the team size (${mode.teamSize}).`);
    checkPrize(p.prize);
    const c = createCompetition({
      kind: 'pool', title: p.title, gameId: g.id, modeId: mode.id, platform: p.platform, entry: p.entry,
      format: mode.teamSize > 1 ? 'team' : 'solo', teamSize: mode.teamSize, minPlayers: p.minPlayers, maxPlayers: p.maxPlayers,
      startsAt: Date.now() + p.startsInMin * 60_000, prize: p.prize, featured: p.featured, sponsorId: p.sponsorId || null, realMoney: p.realMoney,
      createdBy: user.id, rules: g.rules, region: p.region || 'east_africa',
      status: p.publish === false ? 'draft' : 'open', noAutoFill: true,
    });
    db.competitions.push(c);
    return compView(db, c, user);
  },
});

// Edit a draft, or an open competition nobody has paid into yet (money terms are locked once anyone joins).
define('admin.compUpdate', {
  roles: ADMIN, write: true,
  schema: s.obj({
    id: s.str({ max: 60 }), title: s.opt(s.str({ min: 3, max: 50 })), entry: s.opt(s.int({ min: 0, max: 10_000_000 })),
    minPlayers: s.opt(s.int({ min: 2, max: 200 })), maxPlayers: s.opt(s.int({ min: 2, max: 200 })), startsInMin: s.opt(s.int({ min: 1, max: 60 * 24 * 14 })),
    prize: s.opt(prizeSchema), featured: s.opt(s.bool()), sponsorId: s.opt(s.str({ max: 40 })),
  }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    const c = db.competitions.find((x) => x.id === p.id && x.kind === 'pool');
    if (!c) throw E.notFound('Competition');
    if (!['draft', 'open', 'full'].includes(c.status)) throw E.state('Only competitions that haven’t started can be edited.');
    const moneyChange = p.entry != null || p.prize != null;
    if (moneyChange && c.participants.length) throw E.state('Players have already paid in. Entry fee and prize settings are locked; cancel and refund to change them.');
    if (p.prize) checkPrize(p.prize);
    const max = p.maxPlayers ?? c.maxPlayers;
    const min = p.minPlayers ?? c.minPlayers;
    if (min > max) throw E.invalid('Minimum players is above the maximum.');
    if (max < c.participants.length) throw E.invalid(`${c.participants.length} players are already in.`);
    if (c.teamSize > 1 && max % c.teamSize) throw E.invalid(`Max players must be a multiple of the team size (${c.teamSize}).`);
    if (p.entry != null && p.entry > 0 && p.entry < 1000) throw E.invalid('Paid entries start at UGX 1,000.');
    for (const k of ['title', 'entry', 'featured', 'prize']) if (p[k] != null) c[k] = p[k];
    if (p.sponsorId !== undefined) c.sponsorId = p.sponsorId || null;
    c.minPlayers = min;
    c.maxPlayers = max;
    if (p.startsInMin) c.startsAt = Date.now() + p.startsInMin * 60_000;
    if (c.status === 'full' && c.participants.length < c.maxPlayers) c.status = 'open';
    return compView(db, c, user);
  },
});

define('admin.compAction', {
  roles: ADMIN, write: true,
  schema: s.obj({ id: s.str({ max: 60 }), action: s.oneOf(['publish', 'unpublish', 'cancel', 'start', 'feature', 'fill', 'fill_all', 'finish']), reason: s.opt(s.str({ max: 200 })) }),
  audit: (p) => `${p.id}:${p.action}`,
  handler({ db, user }, p) {
    const c = db.competitions.find((x) => x.id === p.id);
    if (!c) throw E.notFound('Competition');
    if (p.action === 'publish') {
      if (c.status !== 'draft') throw E.state('Only drafts can be published.');
      c.status = 'open';
      if (c.startsAt < Date.now() + 60_000) c.startsAt = Date.now() + 10 * 60_000;
    }
    if (p.action === 'unpublish') {
      if (c.status !== 'open' || c.participants.length) throw E.state('Only open competitions with no entries can go back to draft.');
      c.status = 'draft';
    }
    if (p.action === 'cancel') cancelCompetition(db, c, p.reason || 'Cancelled by STACKD');
    if (p.action === 'start') {
      if (!['open', 'full'].includes(c.status)) throw E.state('Publish it first.');
      startPool(db, c, { fillTo: Math.max(c.minPlayers, c.participants.length) });
    }
    if (p.action === 'feature') c.featured = !c.featured;
    if (['fill', 'fill_all'].includes(p.action)) {
      if (!['open', 'full'].includes(c.status)) throw E.state('Only open lobbies can be filled.');
      fillPool(db, c, p.action === 'fill_all' ? c.maxPlayers : Math.min(c.maxPlayers, c.participants.length + 10 * (c.teamSize || 1)));
    }
    // DEMO: fast-forward a simulated match to its final whistle; the world clock settles it on the next tick.
    if (p.action === 'finish') {
      const m = db.matches.find((x) => x.id === c.matchId);
      if (!m?.sim || !['starting', 'live'].includes(m.status)) throw E.state('Only a running simulated match can be fast-forwarded.');
      const shift = m.sim.endsAt - Date.now();
      m.sim.liveAt -= shift;
      m.sim.endsAt -= shift;
      m.sim.lockedAt -= shift;
      m.timeline.push({ at: Date.now(), text: 'Admin fast-forwarded the simulation (demo)' });
      advancePools(db);
    }
    return compView(db, c, user);
  },
});

define('admin.compDetail', {
  roles: STAFF,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const c = db.competitions.find((x) => x.id === p.id);
    if (!c) throw E.notFound('Competition');
    const m = db.matches.find((x) => x.id === c.matchId);
    const txs = db.ledger.filter((t) => t.ref?.id === c.id);
    const sum = (type) => txs.filter((t) => t.type === type && t.status === 'completed').reduce((a, t) => a + t.amount, 0);
    return {
      competition: compView(db, c, user),
      entries: c.participants.map((x) => ({ user: lite(db, x.userId), squad: x.squadName, paid: x.paid || 0, paidBy: x.paidBy, placement: x.placement ?? null, result: x.result ?? null, winnings: x.winnings || 0, status: x.status })),
      match: m ? { id: m.id, status: m.status, verification: m.verification, integration: m.integration, reconciliation: m.outcome?.reconciliation || null, timeline: m.timeline } : null,
      ledger: { entries: -sum('entry'), refunds: sum('refund'), prizes: sum('prize'), transactions: txs.length },
      revenue: db.revenue.filter((r) => r.refId === c.id).reduce((a, r) => a + r.amount, 0),
    };
  },
});

define('admin.prizePreview', {
  roles: ['admin', 'sponsor'],
  schema: s.obj({ prize: prizeSchema, entry: s.int({ min: 0 }), entrants: s.int({ min: 1, max: 500 }), teamSize: s.int({ min: 1, max: 10 }) }),
  handler(_, p) {
    return computePool(p.prize, { entry: p.entry * p.teamSize, entrants: p.entrants, teamSize: p.teamSize });
  },
});

define('admin.tournaments', {
  roles: STAFF,
  handler({ db, user }) {
    return db.tournaments.sort((a, b) => b.startsAt - a.startsAt).map((t) => tourView(db, t, user));
  },
});

define('admin.tourCreate', {
  roles: ADMIN, write: true,
  schema: s.obj({
    name: s.str({ min: 3, max: 60 }), gameId: s.str({ max: 40 }), modeId: s.str({ max: 40 }), platform: s.oneOf(['mobile', 'pc', 'playstation', 'xbox']),
    format: s.oneOf(['single_elim', 'double_elim', 'round_robin', 'swiss', 'league', 'ladder', 'battle_royale']),
    maxEntrants: s.oneOf([4, 6, 8, 12, 16, 32]), entry: s.int({ min: 0, max: 10_000_000 }), startsInMin: s.int({ min: 5, max: 60 * 24 * 30 }),
    prize: prizeSchema, guaranteed: s.int({ min: 0 }), sponsorId: s.opt(s.str({ max: 40 })), featured: s.bool(), rules: s.arr(s.str({ max: 200 }), { max: 10 }),
  }),
  audit: (p, out) => out?.id,
  handler({ db, user }, p) {
    const g = db.games.find((x) => x.id === p.gameId);
    const mode = g?.modes.find((m) => m.id === p.modeId);
    if (!g || !mode) throw E.invalid('Pick a game and mode.');
    if (!mode.types.includes('tournament')) throw E.invalid(`${mode.name} doesn't support tournaments.`);
    if (['single_elim', 'double_elim'].includes(p.format) && ![4, 8, 16, 32].includes(p.maxEntrants)) throw E.invalid('Elimination brackets need 4, 8, 16 or 32 entrants.');
    checkPrize(p.prize);
    const startsAt = Date.now() + p.startsInMin * 60_000;
    const t = createTournament({ ...p, teamSize: mode.teamSize, startsAt, registrationDeadline: startsAt - Math.min(10, Math.floor(p.startsInMin / 2)) * 60_000, sponsorId: p.sponsorId || null });
    db.tournaments.push(t);
    return tourView(db, t, user);
  },
});

define('admin.tourAction', {
  roles: ADMIN, write: true,
  schema: s.obj({ id: s.str({ max: 60 }), action: s.oneOf(['cancel', 'start', 'feature']), reason: s.opt(s.str({ max: 200 })) }),
  audit: (p) => `${p.id}:${p.action}`,
  handler({ db, user }, p) {
    const t = db.tournaments.find((x) => x.id === p.id);
    if (!t) throw E.notFound('Tournament');
    if (p.action === 'cancel') cancelTournament(db, t, p.reason || 'Cancelled by STACKD');
    if (p.action === 'start') startTournament(db, t);
    if (p.action === 'feature') t.featured = !t.featured;
    return tourView(db, t, user);
  },
});

// ---- wallet -----------------------------------------------------------------------------------

define('admin.ledger', {
  roles: STAFF,
  schema: s.obj({ type: s.opt(s.str({ max: 30 })), status: s.opt(s.str({ max: 20 })), q: s.opt(s.str({ max: 60 })) }),
  handler({ db }, p) {
    const q = (p.q || '').toLowerCase();
    const rows = db.ledger
      .filter((t) => !p.type || t.type === p.type)
      .filter((t) => !p.status || t.status === p.status)
      .filter((t) => !q || t.id.includes(q) || (db.users.find((u) => u.id === t.userId)?.username || '').toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 200)
      .map((t) => ({ ...t, user: lite(db, t.userId) }));
    const sumType = (type) => db.ledger.filter((t) => t.type === type && t.status === 'completed').reduce((a, t) => a + t.amount, 0);
    return { rows, totals: { deposits: sumType('deposit'), withdrawals: -sumType('withdrawal'), prizes: sumType('prize'), entries: -sumType('entry'), pendingWithdrawals: db.ledger.filter((t) => t.type === 'withdrawal' && t.status === 'pending').reduce((a, t) => a - t.amount, 0) } };
  },
});

define('admin.withdrawalAction', {
  roles: ADMIN, write: true, rate: 'financial',
  schema: s.obj({ id: s.str({ max: 60 }), approve: s.bool(), note: s.opt(s.str({ max: 200 })) }),
  audit: (p) => `${p.id}:${p.approve ? 'approve' : 'reject'}`,
  handler({ db, user }, p) {
    const t = db.ledger.find((x) => x.id === p.id);
    if (!t || t.type !== 'withdrawal') throw E.notFound('Withdrawal');
    if (t.status !== 'pending') throw E.state('This withdrawal was already processed.');
    t.status = p.approve ? 'completed' : 'failed';
    t.updatedAt = Date.now();
    t.meta.reviewedBy = user.username;
    t.meta.note = p.note || null;
    if (p.approve) t.meta.providerRef = 'SIMW' + Math.random().toString(36).slice(2, 9).toUpperCase();
    notify(db, t.userId, p.approve
      ? { type: 'withdrawal', title: 'Withdrawal sent', body: 'Simulated payout. No money moved.', link: `/app/wallet/tx/${t.id}` }
      : { type: 'withdrawal', title: 'Withdrawal declined', body: p.note || 'The amount is back in your stack.', link: `/app/wallet/tx/${t.id}` });
    return t;
  },
});

define('admin.refund', {
  roles: ADMIN, write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ txId: s.str({ max: 60 }), reason: s.str({ min: 3, max: 200 }) }),
  audit: (p) => p.txId,
  handler({ db }, p) {
    const t = db.ledger.find((x) => x.id === p.txId);
    if (!t || !['entry', 'stake', 'prediction'].includes(t.type) || t.status !== 'completed') throw E.state('Only completed entries can be refunded.');
    if (db.ledger.some((x) => x.type === 'refund' && x.meta?.refundOf === t.id)) throw E.conflict('Already refunded.');
    const r = post(db, { userId: t.userId, type: 'refund', amount: -t.amount, bucket: t.bucket, ref: t.ref, description: `Refund: ${p.reason}`, meta: { refundOf: t.id } });
    notify(db, t.userId, { type: 'refund', title: 'You got a refund', body: p.reason, link: `/app/wallet/tx/${r.id}` });
    return r;
  },
});

// ---- disputes, reviews, appeals, tickets --------------------------------------------------------

define('admin.disputes', {
  roles: STAFF,
  handler({ db, user }) {
    const view = (d) => {
      const m = db.matches.find((x) => x.id === d.matchId);
      return { ...d, raisedByUser: lite(db, d.raisedBy), againstUser: d.against ? lite(db, d.against) : null, match: m ? { id: m.id, title: m.title || db.competitions.find((c) => c.id === m.refId)?.title || db.tournaments.find((t) => t.id === m.refId)?.name, kind: m.kind, players: m.players.map((id) => lite(db, id)), reports: Object.fromEntries(Object.entries(m.reports).map(([k, r]) => [k, { outcome: r.outcome, stats: r.stats, evidence: r.evidence }])) } : null };
    };
    return {
      disputes: db.disputes.sort((a, b) => b.createdAt - a.createdAt).map(view),
      reviews: db.matches.filter((m) => m.status === 'verifying').map((m) => matchView(db, m, user)),
      reports: db.reports.sort((a, b) => b.at - a.at).map((r) => ({ ...r, byUser: lite(db, r.by), target: lite(db, r.userId) })),
    };
  },
});

define('admin.disputeResolve', {
  roles: STAFF, write: true,
  schema: s.obj({ id: s.str({ max: 60 }), winnerId: s.opt(s.str({ max: 60 })), void: s.opt(s.bool()), note: s.str({ min: 3, max: 300 }) }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    const d = db.disputes.find((x) => x.id === p.id);
    if (!d) throw E.notFound('Dispute');
    if (!['open', 'under_review', 'appealed'].includes(d.status)) throw E.state('This dispute is closed.');
    const m = db.matches.find((x) => x.id === d.matchId);
    if (!p.void && (!p.winnerId || !m?.players.includes(p.winnerId))) throw E.invalid('Pick the winner, or void the match.');
    const appeal = d.status === 'appealed';
    d.status = p.void ? 'resolved' : p.winnerId === d.raisedBy ? 'resolved' : 'rejected';
    d.resolution = { decision: p.void ? 'Match voided, entries refunded' : `${lite(db, p.winnerId).username} wins`, note: p.note, by: user.username, at: Date.now() };
    d.history.push({ at: Date.now(), text: `${user.username}: ${d.resolution.decision}` });
    if (appeal) {
      d.appeal.status = 'decided';
      return { ok: true };
    }
    if (m && m.status === 'disputed') {
      if (m.kind === 'tournament' && !p.void) finalizeTournamentH2H(db, db.tournaments.find((t) => t.id === m.refId), m, p.winnerId, p.note);
      else if (m.refId && db.competitions.some((c) => c.id === m.refId)) resolveMatchDecision(db, m, p.void ? { void: true } : { winnerId: p.winnerId }, p.note, user.username);
      else {
        m.status = 'settled';
        m.outcome = { winnerId: p.void ? null : p.winnerId, perUser: {}, note: p.note };
      }
    }
    m?.players.forEach((pl) => notify(db, pl, { type: 'dispute', title: 'Dispute decided', body: d.resolution.decision, link: `/app/disputes/${d.id}` }));
    return { ok: true };
  },
});

define('admin.reviewDecide', {
  roles: STAFF, write: true,
  schema: s.obj({ matchId: s.str({ max: 60 }), approve: s.bool(), note: s.str({ min: 3, max: 300 }) }),
  audit: (p) => p.matchId,
  handler({ db, user }, p) {
    const m = db.matches.find((x) => x.id === p.matchId);
    if (!m || m.status !== 'verifying') throw E.state('This match is not waiting on review.');
    delete m.reviewSince;
    resolveMatchDecision(db, m, { approve: p.approve }, p.note, user.username);
    return { ok: true };
  },
});

define('admin.tickets', {
  roles: STAFF,
  handler({ db }) {
    return db.tickets.sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || b.at - a.at).map((t) => ({ ...t, user: lite(db, t.userId) }));
  },
});

define('admin.ticketReply', {
  roles: STAFF, write: true,
  schema: s.obj({ id: s.str({ max: 60 }), body: s.str({ min: 1, max: 1000 }), close: s.bool() }),
  handler({ db }, p) {
    const t = db.tickets.find((x) => x.id === p.id);
    if (!t) throw E.notFound('Ticket');
    t.messages.push({ from: 'support', body: p.body, at: Date.now() });
    t.status = p.close ? 'closed' : 'answered';
    notify(db, t.userId, { type: 'support', title: `Support replied: ${t.subject}`, body: p.body.slice(0, 80), link: '/app/support' });
    return t;
  },
});

// ---- compliance, config, fraud, audit -----------------------------------------------------------

define('admin.compliance', {
  roles: STAFF,
  handler({ db }) {
    return {
      jurisdictions: Object.values(db.jurisdictions),
      config: { realMoney: db.config.realMoney, demoMode: db.config.demoMode, maxStake: db.config.challengeEntry.max, highStakesKyc: db.config.highStakesKyc, platformFeePct: db.config.platformFeePct, h2hFeePct: db.config.h2hFeePct, challengeMargin: db.config.challengeMargin, ranks: db.config.ranks, predictionCategories: db.config.predictionCategories, matchmaking: db.config.matchmaking },
      kycQueue: db.users.filter((u) => u.kyc?.status === 'pending').map((u) => ({ ...lite(db, u.id), kyc: u.kyc, email: u.email })),
      restricted: db.users.filter((u) => u.status !== 'active' || Object.values(u.restrictions || {}).some(Boolean) || (u.selfExcludedUntil && u.selfExcludedUntil > Date.now())).map((u) => ({ ...lite(db, u.id), status: u.status, restrictions: u.restrictions, selfExcludedUntil: u.selfExcludedUntil, coolOffUntil: u.coolOffUntil })),
      games: db.games.map((g) => ({ id: g.id, short: g.short, realMoney: g.realMoney, status: g.status })),
    };
  },
});

define('admin.jurisdictionSave', {
  roles: ADMIN, write: true,
  schema: s.obj({ code: s.str({ max: 2 }), patch: s.obj({ enabled: s.opt(s.bool()), realMoney: s.opt(s.bool()), staking: s.opt(s.bool()), predictions: s.opt(s.bool()), kycRequired: s.opt(s.bool()), minAge: s.opt(s.int({ min: 13, max: 25 })), dailyDepositLimit: s.opt(s.int({ min: 0 })) }) }),
  audit: (p) => `${p.code}:${Object.keys(p.patch).join(',')}`,
  handler({ db }, p) {
    const j = db.jurisdictions[p.code];
    if (!j) throw E.notFound('Jurisdiction');
    Object.assign(j, p.patch);
    return j;
  },
});

define('admin.gameRealMoney', {
  roles: ADMIN, write: true,
  schema: s.obj({ id: s.str({ max: 40 }), realMoney: s.bool() }),
  audit: (p) => `${p.id}:${p.realMoney}`,
  handler({ db }, p) {
    const g = db.games.find((x) => x.id === p.id);
    if (!g) throw E.notFound('Game');
    g.realMoney = p.realMoney;
    return { ok: true };
  },
});

define('admin.configSave', {
  roles: ADMIN, write: true,
  schema: s.obj({
    platformFeePct: s.opt(s.num({ min: 0, max: 30 })), h2hFeePct: s.opt(s.num({ min: 0, max: 30 })), challengeMargin: s.opt(s.num({ min: 0, max: 0.4 })),
    maxStake: s.opt(s.int({ min: 1000, max: 1_000_000_000_000 })), highStakesKyc: s.opt(s.int({ min: 0, max: 1_000_000_000_000 })),
    ranks: s.opt(s.arr(s.obj({ id: s.str({ max: 20 }), name: s.str({ max: 20 }), min: s.int({ min: 0, max: 5000 }) }), { min: 2, max: 12 })),
    predictionCategories: s.opt(s.obj({ esports: s.bool(), gaming: s.bool(), sports: s.bool() })),
    matchmaking: s.opt(s.obj({ rating: s.num({ min: 0, max: 3 }), ping: s.num({ min: 0, max: 3 }), availability: s.num({ min: 0, max: 3 }), maxRatingGap: s.int({ min: 50, max: 1000 }), maxPing: s.int({ min: 60, max: 400 }) })),
  }),
  audit: (p) => Object.keys(p).join(','),
  handler({ db }, p) {
    if (p.ranks) {
      const sorted = [...p.ranks].sort((a, b) => a.min - b.min);
      if (sorted[0].min !== 0) throw E.invalid('The lowest rank must start at 0.');
      for (let i = 1; i < sorted.length; i++) if (sorted[i].min === sorted[i - 1].min) throw E.invalid('Two ranks share a threshold.');
      p.ranks = sorted;
    }
    const { maxStake, ...rest } = p;
    if (maxStake) {
      db.config.challengeEntry = { ...db.config.challengeEntry, max: maxStake };
      db.config.h2hEntry = { ...db.config.h2hEntry, max: maxStake };
    }
    Object.assign(db.config, rest);
    return { ok: true };
  },
});

define('admin.fraud', {
  roles: STAFF,
  handler({ db }) {
    return db.fraud.sort((a, b) => (a.status !== 'open') - (b.status !== 'open') || b.at - a.at).map((f) => ({ ...f, user: lite(db, f.userId) }));
  },
});

define('admin.fraudAction', {
  roles: ADMIN, write: true,
  schema: s.obj({ id: s.str({ max: 60 }), action: s.oneOf(['dismiss', 'restrict', 'suspend']), note: s.opt(s.str({ max: 200 })) }),
  audit: (p) => `${p.id}:${p.action}`,
  handler({ db, user }, p) {
    const f = db.fraud.find((x) => x.id === p.id);
    if (!f) throw E.notFound('Alert');
    const u = db.users.find((x) => x.id === f.userId);
    if (p.action === 'restrict' && u) u.status = 'restricted';
    if (p.action === 'suspend' && u) u.status = 'suspended';
    f.status = 'resolved';
    f.resolution = { action: p.action, by: user.username, note: p.note || null, at: Date.now() };
    return f;
  },
});

define('admin.audit', {
  roles: STAFF,
  schema: s.obj({ q: s.opt(s.str({ max: 60 })) }),
  handler({ db }, p) {
    const q = (p.q || '').toLowerCase();
    return db.audit.filter((a) => !q || a.action.toLowerCase().includes(q) || String(a.target).toLowerCase().includes(q) || (lite(db, a.actorId).username || '').toLowerCase().includes(q)).slice(0, 300).map((a) => ({ ...a, actor: lite(db, a.actorId) }));
  },
});

define('admin.markets', {
  roles: STAFF,
  handler({ db }) {
    return db.markets.map((m) => ({ ...m, positions: db.positions.filter((x) => x.marketId === m.id).length }));
  },
});

define('admin.marketResolve', {
  roles: ADMIN, write: true,
  schema: s.obj({ id: s.str({ max: 60 }), optionId: s.str({ max: 60 }) }),
  audit: (p) => `${p.id}:${p.optionId}`,
  handler({ db }, p) {
    const mk = db.markets.find((m) => m.id === p.id);
    if (!mk || mk.status === 'resolved') throw E.state('Market is already resolved.');
    if (!mk.options.some((o) => o.id === p.optionId)) throw E.invalid('Unknown outcome.');
    resolveMarket(db, mk, p.optionId);
    return mk;
  },
});

// ---- sponsors -----------------------------------------------------------------------------------

function sponsorScope(user, sponsorId) {
  if (user.role === 'admin') return sponsorId;
  if (sponsorId && sponsorId !== user.sponsorId) throw E.forbidden();
  return user.sponsorId;
}

function campaignStats(db, c) {
  const ms = db.missions.filter((m) => m.campaignId === c.id);
  const views = ms.reduce((a, m) => a + m.stats.views, 0);
  const starts = ms.reduce((a, m) => a + m.stats.starts, 0);
  const completions = ms.reduce((a, m) => a + m.stats.completions, 0);
  return {
    missions: ms.length, views, reach: Math.round(views * 2.6), starts, completions,
    completionRate: starts ? Math.round((completions / starts) * 1000) / 10 : 0,
    engagement: views ? Math.round((starts / views) * 1000) / 10 : 0,
    rewardsDistributed: completions, cost: c.spent, costPerCompletion: completions ? Math.round(c.spent / completions) : 0,
    budgetUsed: c.budget ? Math.round((c.spent / c.budget) * 100) : 0,
  };
}

define('sponsor.dashboard', {
  roles: ['sponsor', 'admin'],
  schema: s.obj({ sponsorId: s.opt(s.str({ max: 40 })) }),
  handler({ db, user }, p) {
    const sid = sponsorScope(user, p.sponsorId);
    const sponsors = sid ? db.sponsors.filter((x) => x.id === sid) : db.sponsors;
    const campaigns = db.campaigns.filter((c) => sponsors.some((x) => x.id === c.sponsorId)).map((c) => ({ ...c, sponsor: db.sponsors.find((x) => x.id === c.sponsorId), stats: campaignStats(db, c) }));
    const missions = db.missions.filter((m) => sponsors.some((x) => x.id === m.sponsorId)).map((m) => ({ ...missionView(db, m, null), sponsorId: m.sponsorId, campaignId: m.campaignId }));
    const totals = campaigns.reduce((a, c) => {
      for (const k of ['views', 'reach', 'starts', 'completions', 'cost']) a[k] = (a[k] || 0) + c.stats[k];
      return a;
    }, {});
    totals.completionRate = totals.starts ? Math.round((totals.completions / totals.starts) * 1000) / 10 : 0;
    const days = Array.from({ length: 14 }, (_, i) => {
      const w = 0.55 + Math.sin(i / 2) * 0.15 + i * 0.03;
      return { day: Date.now() - (13 - i) * DAY, starts: Math.round(((totals.starts || 0) / 14) * w), completions: Math.round(((totals.completions || 0) / 14) * w) };
    });
    return { sponsors, campaigns, missions, totals, days, games: db.games.filter((g) => g.status === 'active').map((g) => ({ ...gameMini(g), modes: g.modes.map((m) => ({ id: m.id, name: m.name, metrics: m.metrics })) })) };
  },
});

define('sponsor.campaignSave', {
  roles: ['sponsor', 'admin'], write: true,
  schema: s.obj({
    id: s.opt(s.str({ max: 60 })), sponsorId: s.opt(s.str({ max: 40 })), name: s.str({ min: 3, max: 60 }), budget: s.int({ min: 100_000, max: 1_000_000_000 }),
    startsAt: s.int({ min: 0 }), endsAt: s.int({ min: 0 }), regions: s.arr(s.str({ max: 2 }), { min: 1 }), objective: s.str({ min: 3, max: 80 }),
  }),
  audit: (p, out) => out?.id,
  handler({ db, user }, p) {
    const sid = sponsorScope(user, p.sponsorId) || p.sponsorId;
    if (!sid) throw E.invalid('Pick a sponsor.');
    if (p.endsAt <= p.startsAt) throw E.invalid('The end date has to be after the start date.');
    if (p.id) {
      const c = db.campaigns.find((x) => x.id === p.id && x.sponsorId === sid);
      if (!c) throw E.notFound('Campaign');
      Object.assign(c, { name: p.name, budget: p.budget, startsAt: p.startsAt, endsAt: p.endsAt, regions: p.regions, objective: p.objective });
      return c;
    }
    const c = { id: uid('cp'), sponsorId: sid, name: p.name, budget: p.budget, spent: 0, status: 'draft', startsAt: p.startsAt, endsAt: p.endsAt, regions: p.regions, objective: p.objective, createdAt: Date.now() };
    db.campaigns.push(c);
    return c;
  },
});

define('sponsor.missionSave', {
  roles: ['sponsor', 'admin'], write: true,
  schema: s.obj({
    id: s.opt(s.str({ max: 60 })), campaignId: s.str({ max: 60 }), title: s.str({ min: 3, max: 60 }), brief: s.str({ min: 10, max: 300 }),
    type: s.oneOf(['in_game', 'hunt']), gameId: s.opt(s.str({ max: 40 })), modeId: s.opt(s.str({ max: 40 })),
    objective: s.obj({ label: s.str({ min: 3, max: 80 }), metric: s.opt(s.str({ max: 20 })), op: s.opt(s.oneOf(['gte', 'lte', 'eq'])), target: s.opt(s.num()) }),
    reward: s.obj({ type: s.oneOf(['cash', 'credit', 'gift', 'merch', 'giftcard', 'product', 'discount', 'entry', 'digital']), value: s.int({ min: 0, max: 10_000_000 }), label: s.str({ min: 3, max: 60 }) }),
    quantity: s.int({ min: 1, max: 100000 }), startsAt: s.int({ min: 0 }), endsAt: s.int({ min: 0 }), regions: s.arr(s.str({ max: 2 }), { min: 1 }),
    minAge: s.int({ min: 13, max: 25 }), minScore: s.int({ min: 0, max: 3000 }), terms: s.str({ min: 10, max: 600 }),
  }),
  audit: (p, out) => out?.id,
  handler({ db, user }, p) {
    const camp = db.campaigns.find((c) => c.id === p.campaignId);
    if (!camp) throw E.notFound('Campaign');
    sponsorScope(user, camp.sponsorId);
    if (p.type === 'in_game') {
      const g = db.games.find((x) => x.id === p.gameId);
      const mode = g?.modes.find((m) => m.id === p.modeId);
      if (!mode) throw E.invalid('Pick a game and mode for an in-game mission.');
      if (!p.objective.metric || !mode.metrics.some((m) => m.key === p.objective.metric)) throw E.invalid('Pick an objective stat that this mode tracks.');
      if (p.objective.target == null) throw E.invalid('Set a target for the objective.');
    }
    if (p.endsAt <= p.startsAt) throw E.invalid('The end date has to be after the start date.');
    const fields = {
      campaignId: camp.id, sponsorId: camp.sponsorId, title: p.title, brief: p.brief, type: p.type,
      gameId: p.type === 'in_game' ? p.gameId : null, modeId: p.type === 'in_game' ? p.modeId : null,
      objective: p.objective, reward: p.reward, quantity: p.quantity, startsAt: p.startsAt, endsAt: p.endsAt, regions: p.regions,
      eligibility: { minAge: p.minAge, minScore: p.minScore }, terms: p.terms, hunt: p.type === 'hunt' ? { size: 6, maxScans: 8 } : null,
    };
    if (p.id) {
      const m = db.missions.find((x) => x.id === p.id && x.campaignId === camp.id);
      if (!m) throw E.notFound('Mission');
      if (!['draft', 'pending', 'paused', 'scheduled'].includes(m.status)) throw E.state('Pause the mission before editing it.');
      Object.assign(m, fields);
      return missionView(db, m, null);
    }
    const m = createMission({ ...fields, status: 'draft' });
    db.missions.push(m);
    return missionView(db, m, null);
  },
});

define('sponsor.missionStatus', {
  roles: ['sponsor', 'admin'], write: true,
  schema: s.obj({ id: s.str({ max: 60 }), status: s.oneOf(['draft', 'pending', 'scheduled', 'live', 'paused', 'complete']) }),
  audit: (p) => `${p.id}:${p.status}`,
  handler({ db, user }, p) {
    const m = db.missions.find((x) => x.id === p.id);
    if (!m) throw E.notFound('Mission');
    sponsorScope(user, m.sponsorId);
    const sponsorMoves = { draft: ['pending'], pending: ['draft'], scheduled: ['paused'], live: ['paused', 'complete'], paused: ['live', 'complete'] };
    if (user.role !== 'admin' && !(sponsorMoves[m.status] || []).includes(p.status))
      throw E.forbidden(m.status === 'pending' ? 'STACKD reviews pending missions before they go live.' : `You can't move a ${m.status} mission to ${p.status}.`);
    m.status = p.status;
    const camp = db.campaigns.find((c) => c.id === m.campaignId);
    if (p.status === 'live' && camp && ['draft', 'scheduled'].includes(camp.status)) camp.status = 'live';
    if (p.status === 'live') for (const u of db.users.filter((x) => !x.isBot && x.role === 'player' && m.regions.includes(x.country))) notify(db, u.id, { type: 'mission', title: `New mission: ${m.title}`, body: m.reward.label, link: `/app/missions/${m.id}` });
    return missionView(db, m, null);
  },
});
