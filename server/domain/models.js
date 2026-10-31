// Canonical data models. Each factory documents the fields a real backend table needs.
import { uid } from './util.js';

export const PLATFORMS = [
  { id: 'mobile', name: 'Mobile' },
  { id: 'pc', name: 'PC' },
  { id: 'playstation', name: 'PlayStation' },
  { id: 'xbox', name: 'Xbox' },
];

export const CATEGORIES = {
  battle_royale: 'Battle royale',
  fps: 'Shooter',
  sports: 'Sports',
  moba: 'MOBA',
  racing: 'Racing',
  fighting: 'Fighting',
  arena: 'Arena brawler',
  strategy: 'Strategy',
  casual: 'Casual',
};

export const COMPETITION_TYPES = {
  challenge: 'Challenge',
  h2h: 'Head-to-head',
  pool: 'Team pool',
  tournament: 'Tournament',
  mission: 'Mission',
};

export const REGIONS = {
  east_africa: 'East Africa',
  west_africa: 'West Africa',
  southern_africa: 'Southern Africa',
  europe: 'Europe',
  north_america: 'North America',
};

export const COUNTRIES = [
  { code: 'UG', name: 'Uganda', region: 'east_africa' },
  { code: 'KE', name: 'Kenya', region: 'east_africa' },
  { code: 'TZ', name: 'Tanzania', region: 'east_africa' },
  { code: 'RW', name: 'Rwanda', region: 'east_africa' },
  { code: 'NG', name: 'Nigeria', region: 'west_africa' },
  { code: 'GH', name: 'Ghana', region: 'west_africa' },
  { code: 'ZA', name: 'South Africa', region: 'southern_africa' },
  { code: 'GB', name: 'United Kingdom', region: 'europe' },
  { code: 'US', name: 'United States', region: 'north_america' },
];

export const countryOf = (code) => COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];

export const TX_TYPES = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  entry: 'Competition entry',
  prize: 'Prize',
  reward: 'Reward',
  sponsor_reward: 'Sponsor reward',
  bonus: 'Bonus',
  refund: 'Refund',
  fee: 'Fee',
  stake: 'Player backing',
  stake_return: 'Backing return',
  prediction: 'Prediction',
  prediction_payout: 'Prediction payout',
  reversal: 'Reversal',
};

/** User — the competitive identity. Wallet balance is NOT stored here (derived from the ledger). */
export function createUser(f) {
  return {
    id: f.id || uid('usr'),
    name: f.name || f.username,
    username: f.username,
    email: f.email,
    passwordHash: f.passwordHash || null, // scrypt (server/auth/passwords.js); null for Google-only accounts
    role: f.role || 'player', // player | sponsor | referee | admin
    sponsorId: f.sponsorId || null,
    avatar: f.avatar || { color: '#5468FF' },
    country: f.country || 'UG',
    dob: f.dob === undefined ? '2000-01-01' : f.dob,
    bio: f.bio || '',
    createdAt: f.createdAt || Date.now(),
    onboarded: f.onboarded ?? false,
    profileComplete: f.profileComplete ?? true, // false until a Google sign-up adds username, DOB and country
    isBot: f.isBot || false,
    status: f.status || 'active', // active | restricted | suspended
    restrictions: f.restrictions || { realMoney: false, staking: false, predictions: false },
    kyc: f.kyc || { status: 'none', level: 0, submittedAt: null, docType: null },
    games: f.games || [],
    platforms: f.platforms || ['mobile'],
    inGameIds: f.inGameIds || {},
    stackScore: f.stackScore ?? 1000,
    peakScore: f.peakScore ?? f.stackScore ?? 1000,
    gameScores: f.gameScores || {}, // gameId -> { score, matches, wins }
    stats: {
      matches: 0, wins: 0, losses: 0, competitions: 0, streak: 0, bestStreak: 0, earnings: 0, tournamentWins: 0,
      teamWins: 0, mvps: 0, top10: 0, missions: 0, rematches: 0, arcadeRuns: 0, ...(f.stats || {}),
    },
    form: f.form || [], // last results, newest first: 'W' | 'L'
    achievements: f.achievements || [], // { id, at }
    following: f.following || [],
    friends: f.friends || [],
    friendRequests: f.friendRequests || [], // incoming user ids
    limits: f.limits || { dailyDeposit: null, dailyEntry: null },
    coolOffUntil: f.coolOffUntil || null,
    selfExcludedUntil: f.selfExcludedUntil || null,
    online: f.online ?? false,
    lastSeen: f.lastSeen || Date.now(),
  };
}

/**
 * Competition — anything a player can enter: a skill challenge, an H2H, a team pool.
 * prize: prize-engine config (see engines/prize.js). Results live on the linked Match.
 */
export function createCompetition(f) {
  return {
    id: f.id || uid('cmp'),
    kind: f.kind, // challenge | h2h | pool
    title: f.title,
    gameId: f.gameId,
    modeId: f.modeId,
    platform: f.platform || 'mobile',
    region: f.region || 'east_africa',
    format: f.format || 'solo', // solo | team
    teamSize: f.teamSize || 1,
    minPlayers: f.minPlayers ?? 2,
    maxPlayers: f.maxPlayers ?? 2,
    entry: f.entry ?? 0,
    prize: f.prize || { model: 'winner_takes_all', feePct: 10 },
    participants: f.participants || [], // { userId, teamId, joinedAt, status }
    status: f.status || 'open', // open | full | live | verifying | settled | cancelled | disputed
    startsAt: f.startsAt || Date.now(),
    createdAt: f.createdAt || Date.now(),
    createdBy: f.createdBy || 'system',
    visibility: f.visibility || 'public', // public | private | friends
    code: f.code || null,
    featured: f.featured || false,
    noAutoFill: f.noAutoFill || false, // demo players don't trickle in; the lobby fills from real joins / admin
    sponsorId: f.sponsorId || null,
    realMoney: f.realMoney ?? true,
    challenge: f.challenge || null, // { templateId, metric, op, target, multiplier }
    h2h: f.h2h || null, // { type, challengerId, opponentId, bestOf, rematchOf }
    matchId: f.matchId || null,
    result: f.result || null,
    rules: f.rules || [],
  };
}

/** Match — the auditable unit of play. Every report, check and decision is appended to `timeline`. */
export function createMatch(f) {
  return {
    id: f.id || uid('mch'),
    kind: f.kind, // challenge | h2h | pool | tournament
    title: f.title || null,
    refId: f.refId,
    bracketMatchId: f.bracketMatchId || null,
    gameId: f.gameId,
    modeId: f.modeId,
    players: f.players || [],
    teams: f.teams || null,
    status: f.status || 'ready', // ready | live | verifying | disputed | settled | cancelled
    reports: f.reports || {}, // userId -> { stats, outcome, evidence[], at }
    verification: f.verification || null,
    outcome: f.outcome || null,
    payouts: f.payouts || [],
    createdAt: Date.now(),
    startedAt: null,
    settledAt: null,
    timeline: f.timeline || [{ at: Date.now(), text: 'Match created' }],
  };
}

/** Team — a STACK squad. */
export function createTeam(f) {
  return {
    id: f.id || uid('tm'),
    name: f.name,
    tag: f.tag,
    color: f.color || '#5468FF',
    bio: f.bio || '',
    captainId: f.captainId,
    members: f.members || [], // { userId, role: 'captain' | 'member', joinedAt }
    invites: f.invites || [], // { userId, by, at }
    games: f.games || [],
    open: f.open ?? true,
    country: f.country || 'UG',
    rating: f.rating ?? 1000,
    stats: { matches: 0, wins: 0, competitions: 0, earnings: 0, ...(f.stats || {}) },
    recent: f.recent || [],
    createdAt: f.createdAt || Date.now(),
  };
}

/** Tournament — bracket / points structure lives in `bracket`, built at start by engines/bracket.js. */
export function createTournament(f) {
  return {
    id: f.id || uid('trn'),
    name: f.name,
    gameId: f.gameId,
    modeId: f.modeId,
    platform: f.platform || 'mobile',
    format: f.format || 'single_elim', // single_elim | double_elim | round_robin | swiss | league | ladder | battle_royale
    teamSize: f.teamSize || 1,
    maxEntrants: f.maxEntrants || 8,
    entry: f.entry ?? 0,
    prize: f.prize || { model: 'placement', feePct: 10, placements: [60, 30, 10] },
    guaranteed: f.guaranteed || 0,
    startsAt: f.startsAt,
    registrationDeadline: f.registrationDeadline || f.startsAt,
    status: f.status || 'registration', // registration | live | completed | cancelled
    entrants: f.entrants || [], // { id, type: 'user' | 'team', name, seed, members[] }
    bracket: f.bracket || null,
    sponsorId: f.sponsorId || null,
    featured: f.featured || false,
    region: f.region || 'east_africa',
    rules: f.rules || [],
    results: f.results || null,
    createdAt: Date.now(),
  };
}

/** Ledger entry. Append-only. amount is signed (credit > 0, debit < 0). */
export function createTx(f) {
  return {
    id: f.id || uid('tx'),
    userId: f.userId,
    type: f.type,
    amount: f.amount,
    bucket: f.bucket || 'cash', // cash | bonus
    status: f.status || 'completed', // pending | completed | failed | reversed
    ref: f.ref || null, // { kind, id, label }
    description: f.description || TX_TYPES[f.type] || f.type,
    provider: f.provider || null,
    idempotencyKey: f.idempotencyKey || null,
    meta: f.meta || {},
    createdAt: f.createdAt || Date.now(),
    updatedAt: f.createdAt || Date.now(),
  };
}

export function createNotification(f) {
  return {
    id: uid('ntf'),
    userId: f.userId,
    type: f.type,
    title: f.title,
    body: f.body || '',
    link: f.link || null,
    read: false,
    at: f.at || Date.now(),
  };
}

/** Mission — sponsored challenge. reward.type: cash | credit | gift | merch | giftcard | product | discount | entry | digital */
export function createMission(f) {
  return {
    id: f.id || uid('msn'),
    campaignId: f.campaignId,
    sponsorId: f.sponsorId,
    title: f.title,
    brief: f.brief,
    type: f.type || 'in_game', // in_game | hunt
    gameId: f.gameId || null,
    modeId: f.modeId || null,
    objective: f.objective,
    reward: f.reward,
    quantity: f.quantity ?? 100,
    winners: f.winners || [],
    startsAt: f.startsAt,
    endsAt: f.endsAt,
    regions: f.regions || ['UG'],
    eligibility: f.eligibility || { minAge: 13, minScore: 0 },
    terms: f.terms || '',
    status: f.status || 'draft', // draft | pending | scheduled | live | paused | complete
    stats: f.stats || { views: 0, starts: 0, completions: 0 },
    progress: f.progress || {}, // userId -> { startedAt, completedAt, attempts, found }
    hunt: f.hunt || null, // { size, secret } for hunt missions (secret never sent to client)
    createdAt: Date.now(),
  };
}

export function createDispute(f) {
  return {
    id: f.id || uid('dsp'),
    matchId: f.matchId,
    raisedBy: f.raisedBy,
    against: f.against || null,
    reason: f.reason, // wrong_result | cheating | disconnect | no_show | other
    details: f.details || '',
    evidence: f.evidence || [],
    status: f.status || 'open', // open | under_review | resolved | rejected | appealed
    resolution: null,
    appeal: null,
    createdAt: Date.now(),
    history: [{ at: Date.now(), text: 'Dispute opened' }],
  };
}
