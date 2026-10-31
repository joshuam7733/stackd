// The Big Stack: a season-long, sponsor-guaranteed mega prize pool (USD 500,000+).
// The pool = sponsor guarantee + a share of platform fees from every paid entry on STACKD.
// Players qualify through season points (and bonus points from Big Stack qualifier cups); the top N play the finals.
import { define } from '../router.js';
import { s } from '../validate.js';
import { E } from '../errors.js';
import { pubUser, tourView, gameMini } from './views.js';
import { DAY } from '../util.js';

export const FINALS_SPLIT = [30, 16, 10, 7, 5, 5, 4, 4, 2.375, 2.375, 2.375, 2.375, 2.375, 2.375, 2.375, 2.375];

export function bigStackPool(db) {
  const b = db.bigStack;
  const guaranteedUGX = Math.round(b.guaranteedUSD * b.fx);
  const poolUGX = guaranteedUGX + Math.round(b.contributedUGX);
  return { guaranteedUGX, poolUGX, poolUSD: poolUGX / b.fx, stretchUGX: Math.round(b.stretchUSD * b.fx) };
}

function view(db, user) {
  const b = db.bigStack;
  const pool = bigStackPool(db);
  const ranked = db.users.filter((u) => u.role === 'player' && u.status !== 'suspended').sort((a, z) => (z.stats.seasonPoints || 0) - (a.stats.seasonPoints || 0));
  const cutoff = ranked[b.qualifySpots - 1]?.stats.seasonPoints || 0;
  const myPos = user ? ranked.findIndex((u) => u.id === user.id) + 1 : 0;
  const myPts = user?.stats.seasonPoints || 0;
  return {
    ...b,
    sponsor: db.sponsors.find((x) => x.id === b.sponsorId) || null,
    ...pool,
    payouts: FINALS_SPLIT.map((pct, i) => ({ place: i + 1, pct, ugx: Math.floor((pool.poolUGX * pct) / 100), usd: Math.floor((pool.poolUSD * pct) / 100) })),
    leaders: ranked.slice(0, 20).map((u, i) => ({ position: i + 1, points: u.stats.seasonPoints || 0, user: pubUser(db, u) })),
    cutoff,
    me: user && user.role === 'player' ? { position: myPos, points: myPts, qualified: myPos > 0 && myPos <= b.qualifySpots, toQualify: Math.max(0, cutoff - myPts + 1) } : null,
    qualifiers: db.tournaments.filter((t) => t.bigStack && t.status !== 'cancelled').sort((a, z) => a.startsAt - z.startsAt).map((t) => tourView(db, t, user)),
    games: b.games.map((g) => gameMini(db.games.find((x) => x.id === g))).filter(Boolean),
    players: ranked.length + 48210,
  };
}

define('bigstack.get', {
  auth: false,
  handler({ db, user }) {
    if (!db.bigStack) throw E.notFound('Event');
    return view(db, user);
  },
});

define('admin.bigstackSave', {
  roles: ['admin'], write: true,
  schema: s.obj({
    name: s.str({ min: 3, max: 60 }), sponsorId: s.str({ max: 40 }), guaranteedUSD: s.int({ min: 0, max: 100_000_000 }),
    stretchUSD: s.int({ min: 0, max: 200_000_000 }), contributionPct: s.num({ min: 0, max: 100 }), qualifySpots: s.int({ min: 8, max: 1024 }),
    finalsInDays: s.int({ min: 1, max: 365 }), fx: s.num({ min: 1, max: 100000 }), status: s.oneOf(['qualifying', 'finals', 'complete']),
  }),
  audit: (p) => `bigstack:${p.guaranteedUSD}`,
  handler({ db }, p) {
    if (!db.sponsors.some((x) => x.id === p.sponsorId)) throw E.invalid('Pick a sponsor.');
    const { finalsInDays, ...rest } = p;
    Object.assign(db.bigStack, rest, { finalsAt: Date.now() + finalsInDays * DAY });
    return view(db, null);
  },
});
