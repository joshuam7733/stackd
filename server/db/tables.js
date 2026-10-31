// Table mappings: how each domain collection is stored in SQL.
//
// cols:     [objectPath, column, type?]   type: 'json' | 'bool' | an enum codec ({ toDb, fromDb })
// derive:   { column: (obj, key) => value }  write-only columns calculated from the object (reporting / integrity)
// children: nested arrays or maps that live in their own table (participants → competition_entries, …)
// Anything not mapped is kept in the row's `extra` JSON column so no domain attribute is ever lost.
import { countryOf } from '../domain/models.js';
import { poolFor } from '../domain/services/competitions.js';
import { computePool } from '../domain/engines/prize.js';
import { levelFor } from '../domain/engines/rating.js';

const enumCodec = (map) => {
  const back = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
  return { toDb: (v) => (v == null ? null : map[v] || String(v).toUpperCase()), fromDb: (v) => (v == null ? null : back[v] || String(v).toLowerCase()) };
};

export const COMPETITION_STATUS = enumCodec({
  draft: 'DRAFT', open: 'OPEN', full: 'FULL', starting: 'STARTING', live: 'LIVE', verifying: 'VERIFYING',
  settled: 'COMPLETED', cancelled: 'CANCELLED', disputed: 'DISPUTED',
});

export const TX_TYPE = enumCodec({
  entry: 'COMPETITION_ENTRY', prize: 'PRIZE_WIN', refund: 'REFUND', deposit: 'DEPOSIT', withdrawal: 'WITHDRAWAL',
  bonus: 'DEMO_CREDIT', reward: 'REWARD', sponsor_reward: 'MISSION_REWARD', fee: 'FEE', stake: 'STAKE',
  stake_return: 'STAKE_RETURN', prediction: 'PREDICTION', prediction_payout: 'PREDICTION_PAYOUT', reversal: 'REVERSAL',
});

function verificationStatus(m) {
  if (m.status === 'disputed') return 'DISPUTED';
  const s = m.verification?.status;
  if (!s) return null;
  return s === 'verified' ? 'VERIFIED' : s === 'rejected' ? 'REJECTED' : 'PENDING';
}

export const SINGLETONS = ['config', 'bigStack', 'schema', 'seededAt'];

export const SPECS = [
  {
    coll: 'jurisdictions', table: 'jurisdictions', kind: 'map', key: 'code',
    cols: [['code', 'code'], ['enabled', 'enabled', 'bool'], ['realMoney', 'real_money', 'bool'], ['staking', 'staking', 'bool'], ['predictions', 'predictions', 'bool'], ['minAge', 'min_age'], ['kycRequired', 'kyc_required', 'bool'], ['dailyDepositLimit', 'daily_deposit_limit']],
  },
  {
    coll: 'users', table: 'users', key: 'id',
    cols: [
      ['id', 'id'], ['name', 'name'], ['username', 'username'], ['email', 'email'], ['passwordHash', 'password_hash'], ['avatar', 'avatar', 'json'],
      ['country', 'country'], ['dob', 'dob'], ['bio', 'bio'], ['games', 'selected_games', 'json'], ['platforms', 'platforms', 'json'], ['inGameIds', 'in_game_ids', 'json'],
      ['stackScore', 'stack_score'], ['peakScore', 'peak_score'], ['role', 'role'], ['status', 'status'], ['isBot', 'is_bot', 'bool'],
      ['onboarded', 'onboarded', 'bool'], ['profileComplete', 'profile_complete', 'bool'],
      ['stats.matches', 'matches'], ['stats.wins', 'wins'], ['stats.losses', 'losses'], ['stats.competitions', 'competitions'], ['stats.streak', 'streak'],
      ['stats.bestStreak', 'best_streak'], ['stats.earnings', 'earnings'], ['stats.tournamentWins', 'tournament_wins'],
      ['sponsorId', 'sponsor_id'], ['kyc', 'kyc', 'json'], ['limits', 'limits', 'json'], ['restrictions', 'restrictions', 'json'],
      ['gameScores', 'game_scores', 'json'], ['form', 'form', 'json'], ['createdAt', 'created_at'], ['lastSeen', 'last_seen_at'],
    ],
    derive: { region: (u) => countryOf(u.country).region, level: (u) => levelFor(u), updated_at: () => Date.now() },
    children: [{ prop: 'achievements', table: 'user_achievements', fk: 'user_id', key: 'achievement_id', cols: [['id', 'achievement_id'], ['at', 'unlocked_at']] }],
  },
  {
    coll: 'identities', table: 'auth_identities', key: ['provider', 'providerUserId'],
    cols: [['provider', 'provider'], ['providerUserId', 'provider_user_id'], ['userId', 'user_id'], ['email', 'email'], ['emailVerified', 'email_verified', 'bool'], ['createdAt', 'created_at'], ['lastUsedAt', 'last_used_at']],
    noExtra: true,
  },
  {
    coll: 'sessions', table: 'sessions', kind: 'map', key: 'token_hash',
    cols: [['userId', 'user_id'], ['createdAt', 'created_at'], ['expiresAt', 'expires_at'], ['lastSeenAt', 'last_seen_at'], ['ip', 'ip'], ['userAgent', 'user_agent'], ['provider', 'provider']],
    noExtra: true,
  },
  {
    coll: 'oauthStates', table: 'oauth_states', kind: 'map', key: 'state',
    cols: [['provider', 'provider'], ['codeVerifier', 'code_verifier'], ['nonce', 'nonce'], ['next', 'next_path'], ['createdAt', 'created_at']],
    noExtra: true,
  },
  {
    coll: 'idempotency', table: 'idempotency_keys', kind: 'map', key: 'key',
    cols: [['at', 'created_at'], ['result', 'result']],
    derive: { user_id: (v, key) => String(key).split(':')[0] || null },
    noExtra: true,
  },
  {
    coll: 'games', table: 'games', key: 'id',
    cols: [
      ['id', 'id'], ['slug', 'slug'], ['name', 'name'], ['short', 'short_name'], ['description', 'description'], ['developer', 'developer'], ['category', 'genre'],
      ['platforms', 'platforms', 'json'], ['status', 'status'], ['verification', 'verification_methods', 'json'], ['integration', 'integration'],
      ['media', 'image', 'json'], ['art', 'art', 'json'], ['regions', 'regions', 'json'], ['rules', 'rules', 'json'], ['eligibility', 'eligibility', 'json'],
      ['popularity', 'popularity'], ['featured', 'featured', 'bool'],
    ],
    derive: { updated_at: () => Date.now() },
    children: [{
      prop: 'modes', table: 'game_modes', fk: 'game_id', key: 'id',
      cols: [['id', 'id'], ['name', 'name'], ['teamSize', 'team_size'], ['maxPlayers', 'max_players'], ['rules', 'rules', 'json'], ['status', 'status'], ['types', 'types', 'json'], ['metrics', 'metrics', 'json']],
      defaults: { status: 'active' },
    }],
  },
  {
    coll: 'challengeTemplates', table: 'challenge_templates', key: 'id',
    cols: [['id', 'id'], ['gameId', 'game_id'], ['modeId', 'mode_id'], ['title', 'title'], ['metric', 'metric'], ['op', 'op'], ['target', 'target'], ['baseProb', 'base_prob']],
  },
  {
    coll: 'achievementDefs', table: 'achievements', key: 'id', ordered: true,
    cols: [['id', 'id'], ['name', 'name'], ['blurb', 'description'], ['criteria', 'requirements', 'json'], ['tier', 'tier'], ['glyph', 'glyph']],
  },
  {
    coll: 'teams', table: 'teams', key: 'id',
    cols: [
      ['id', 'id'], ['name', 'name'], ['tag', 'tag'], ['color', 'color'], ['captainId', 'captain_id'], ['games', 'games', 'json'], ['rating', 'rating'],
      ['stats.matches', 'matches'], ['stats.wins', 'wins'], ['open', 'is_open', 'bool'], ['country', 'country'], ['bio', 'bio'], ['createdAt', 'created_at'],
    ],
    derive: { logo: (t) => JSON.stringify({ color: t.color, tag: t.tag, url: t.logoUrl || null }), losses: (t) => Math.max(0, (t.stats?.matches || 0) - (t.stats?.wins || 0)) },
    children: [
      { prop: 'members', table: 'team_members', fk: 'team_id', key: 'user_id', cols: [['userId', 'user_id'], ['role', 'role'], ['joinedAt', 'joined_at']] },
      { prop: 'invites', table: 'team_invites', fk: 'team_id', key: 'user_id', cols: [['userId', 'user_id'], ['by', 'invited_by'], ['at', 'created_at']] },
    ],
  },
  {
    coll: 'competitions', table: 'competitions', key: 'id',
    cols: [
      ['id', 'id'], ['title', 'name'], ['kind', 'type'], ['gameId', 'game_id'], ['modeId', 'mode_id'], ['platform', 'platform'], ['region', 'region'], ['format', 'format'],
      ['teamSize', 'team_size'], ['entry', 'entry_fee'], ['prize', 'prize_config', 'json'], ['minPlayers', 'min_players'], ['maxPlayers', 'max_players'],
      ['status', 'status', COMPETITION_STATUS], ['visibility', 'visibility'], ['code', 'code'], ['featured', 'featured', 'bool'], ['sponsorId', 'sponsor_id'],
      ['createdBy', 'created_by'], ['matchId', 'match_id'], ['startsAt', 'start_time'], ['endedAt', 'end_time'], ['rules', 'rules', 'json'], ['result', 'result', 'json'],
      ['challenge', 'challenge', 'json'], ['h2h', 'h2h', 'json'], ['createdAt', 'created_at'],
    ],
    derive: {
      platform_fee_pct: (c) => c.prize?.feePct ?? null,
      prize_pool_pct: (c) => (c.prize?.poolPct ?? (c.prize ? 100 - (c.prize.feePct ?? 10) : null)),
      payout_model: (c) => c.prize?.model || null,
      prize_pool: (c) => (c.kind === 'challenge' ? c.challenge?.payout ?? null : (c.kind === 'h2h' ? computePool(c.prize, { entry: c.entry, entrants: 2 }) : poolFor(c))?.net ?? null),
      gross_pool: (c) => (c.kind === 'challenge' ? c.entry : (c.kind === 'h2h' ? computePool(c.prize, { entry: c.entry, entrants: c.participants.length }) : poolFor(c))?.gross ?? null),
      platform_fee: (c) => (c.kind === 'challenge' ? null : (c.kind === 'h2h' ? computePool(c.prize, { entry: c.entry, entrants: c.participants.length }) : poolFor(c))?.fee ?? null),
      players: (c) => c.participants.length,
      updated_at: () => Date.now(),
    },
    children: [{
      prop: 'participants', table: 'competition_entries', fk: 'competition_id', key: 'user_id',
      cols: [['userId', 'user_id'], ['teamId', 'team_id'], ['squadName', 'squad_name'], ['paid', 'entry_amount'], ['paidBy', 'paid_by'], ['placement', 'placement'], ['result', 'result'], ['winnings', 'winnings'], ['status', 'status'], ['joinedAt', 'joined_at']],
      derive: { id: (p, parentId) => `${parentId}:${p.userId}` },
      defaults: { paid: 0, winnings: 0, status: 'in' },
    }],
  },
  {
    coll: 'matches', table: 'matches', key: 'id',
    cols: [
      ['id', 'id'], ['kind', 'kind'], ['refId', 'ref_id'], ['bracketMatchId', 'bracket_match_id'], ['gameId', 'game_id'], ['modeId', 'mode_id'],
      ['players', 'participants', 'json'], ['teams', 'teams', 'json'], ['status', 'status'], ['outcome', 'result', 'json'], ['verification', 'verification', 'json'],
      ['integration', 'integration'], ['startedAt', 'start_time'], ['settledAt', 'end_time'], ['createdAt', 'created_at'], ['reports', 'reports', 'json'],
      ['timeline', 'timeline', 'json'], ['truth', 'hidden_truth', 'json'], ['sim', 'simulation', 'json'],
    ],
    derive: {
      competition_id: (m) => (m.kind !== 'tournament' ? m.refId || null : null),
      tournament_id: (m) => (m.kind === 'tournament' ? m.refId || null : null),
      verification_status: verificationStatus,
    },
  },
  {
    coll: 'tournaments', table: 'tournaments', key: 'id',
    cols: [
      ['id', 'id'], ['name', 'name'], ['gameId', 'game_id'], ['modeId', 'mode_id'], ['platform', 'platform'], ['format', 'format'], ['teamSize', 'team_size'],
      ['maxEntrants', 'max_entrants'], ['entry', 'entry_fee'], ['prize', 'prize_config', 'json'], ['guaranteed', 'guaranteed'], ['bracket', 'bracket', 'json'],
      ['results', 'results', 'json'], ['status', 'status'], ['startsAt', 'start_time'], ['registrationDeadline', 'registration_deadline'], ['sponsorId', 'sponsor_id'],
      ['featured', 'featured', 'bool'], ['region', 'region'], ['rules', 'rules', 'json'], ['createdAt', 'created_at'],
    ],
    derive: {
      platform_fee_pct: (t) => t.prize?.feePct ?? null,
      participants: (t) => t.entrants.length,
      prize_pool: (t) => computePool({ ...t.prize, guaranteed: t.guaranteed }, { entry: t.entry * t.teamSize, entrants: t.entrants.length, teamSize: t.teamSize }).net,
    },
    children: [{
      prop: 'entrants', table: 'tournament_entrants', fk: 'tournament_id', key: 'entrant_id',
      cols: [['id', 'entrant_id'], ['type', 'type'], ['name', 'name'], ['seed', 'seed'], ['rating', 'rating'], ['members', 'members', 'json']],
    }],
  },
  {
    coll: 'ledger', table: 'transactions', key: 'id',
    cols: [
      ['id', 'id'], ['userId', 'user_id'], ['type', 'type', TX_TYPE], ['amount', 'amount'], ['bucket', 'bucket'], ['status', 'status'],
      ['ref.id', 'reference'], ['ref.kind', 'reference_kind'], ['ref.label', 'reference_label'], ['description', 'description'], ['provider', 'provider'],
      ['idempotencyKey', 'idempotency_key'], ['meta', 'meta', 'json'], ['createdAt', 'created_at'], ['updatedAt', 'updated_at'],
    ],
    derive: { currency: () => 'UGX', is_demo: (t) => (t.real ? 0 : 1) },
    noExtra: true,
    nullGroups: ['ref'],
  },
  {
    coll: 'revenue', table: 'platform_revenue', key: 'id', autoId: 'rev',
    cols: [['id', 'id'], ['source', 'source'], ['refId', 'reference'], ['amount', 'amount'], ['at', 'created_at']],
  },
  {
    coll: 'notifications', table: 'notifications', key: 'id',
    cols: [['id', 'id'], ['userId', 'user_id'], ['type', 'type'], ['title', 'title'], ['body', 'message'], ['link', 'link'], ['read', 'read', 'bool'], ['at', 'created_at']],
    noExtra: true,
  },
  {
    coll: 'scoreEvents', table: 'score_events', key: 'id',
    cols: [['id', 'id'], ['userId', 'user_id'], ['matchId', 'match_id'], ['gameId', 'game_id'], ['delta', 'delta'], ['scoreAfter', 'score_after'], ['reason', 'reason'], ['at', 'created_at']],
  },
  {
    coll: 'feed', table: 'feed_events', key: 'id', autoId: 'fd', orderBy: 'created_at DESC',
    cols: [['id', 'id'], ['userId', 'user_id'], ['gameId', 'game_id'], ['amount', 'amount'], ['text', 'text'], ['at', 'created_at']],
    noExtra: true,
  },
  {
    coll: 'sponsors', table: 'sponsors', key: 'id',
    cols: [['id', 'id'], ['name', 'name'], ['logo', 'logo'], ['color', 'color'], ['category', 'category'], ['contact', 'contact'], ['status', 'status']],
    defaults: { status: 'active' },
  },
  {
    coll: 'campaigns', table: 'campaigns', key: 'id',
    cols: [['id', 'id'], ['sponsorId', 'sponsor_id'], ['name', 'name'], ['budget', 'budget'], ['spent', 'spent'], ['status', 'status'], ['startsAt', 'starts_at'], ['endsAt', 'ends_at'], ['createdAt', 'created_at']],
  },
  {
    coll: 'missions', table: 'missions', key: 'id',
    cols: [
      ['id', 'id'], ['campaignId', 'campaign_id'], ['sponsorId', 'sponsor_id'], ['title', 'name'], ['brief', 'description'], ['type', 'type'], ['gameId', 'game_id'], ['modeId', 'mode_id'],
      ['objective', 'requirements', 'json'], ['reward', 'reward', 'json'], ['quantity', 'quantity'], ['stats.completions', 'completions'], ['status', 'status'],
      ['startsAt', 'starts_at'], ['endsAt', 'ends_at'], ['createdAt', 'created_at'],
    ],
    derive: { participants: (m) => Object.keys(m.progress || {}).length },
    children: [{
      prop: 'progress', kind: 'map', table: 'mission_participants', fk: 'mission_id', key: 'user_id', extraColumn: 'progress',
      cols: [['startedAt', 'started_at'], ['completedAt', 'completed_at']],
      derive: { status: (p) => (p.completedAt ? 'completed' : p.failed ? 'failed' : 'in_progress') },
    }],
  },
  {
    coll: 'drops', table: 'reward_drops', key: 'id',
    cols: [['id', 'id'], ['userId', 'user_id'], ['missionId', 'mission_id'], ['sponsorId', 'sponsor_id'], ['label', 'label'], ['type', 'type'], ['code', 'code'], ['status', 'status'], ['at', 'created_at']],
  },
  {
    coll: 'disputes', table: 'disputes', key: 'id',
    cols: [
      ['id', 'id'], ['matchId', 'match_id'], ['raisedBy', 'user_id'], ['against', 'against_user_id'], ['reason', 'reason'], ['details', 'details'], ['evidence', 'evidence', 'json'],
      ['status', 'status'], ['resolution', 'resolution', 'json'], ['appeal', 'appeal', 'json'], ['history', 'history', 'json'], ['createdAt', 'created_at'],
    ],
    derive: { competition_id: (d) => d.competitionId || null },
  },
  {
    coll: 'reports', table: 'player_reports', key: 'id',
    cols: [['id', 'id'], ['by', 'reporter_id'], ['userId', 'user_id'], ['reason', 'reason'], ['details', 'details'], ['matchId', 'match_id'], ['status', 'status'], ['at', 'created_at']],
  },
  {
    coll: 'tickets', table: 'support_tickets', key: 'id',
    cols: [['id', 'id'], ['userId', 'user_id'], ['subject', 'subject'], ['category', 'category'], ['status', 'status'], ['messages', 'messages', 'json'], ['at', 'created_at']],
  },
  {
    coll: 'fraud', table: 'fraud_alerts', key: 'id', orderBy: 'created_at DESC',
    cols: [['id', 'id'], ['userId', 'user_id'], ['kind', 'kind'], ['severity', 'severity'], ['detail', 'detail'], ['status', 'status'], ['at', 'created_at']],
  },
  {
    coll: 'audit', table: 'audit_logs', key: 'id', orderBy: 'created_at DESC',
    cols: [['id', 'id'], ['actorId', 'actor_id'], ['action', 'action'], ['target', 'target'], ['meta', 'meta', 'json'], ['ip', 'ip'], ['at', 'created_at']],
    noExtra: true,
  },
  {
    coll: 'markets', table: 'prediction_markets', key: 'id',
    cols: [['id', 'id'], ['category', 'category'], ['title', 'title'], ['status', 'status'], ['closesAt', 'closes_at'], ['volume', 'volume'], ['resolution', 'resolution'], ['options', 'options', 'json']],
  },
  {
    coll: 'positions', table: 'prediction_positions', key: 'id',
    cols: [['id', 'id'], ['userId', 'user_id'], ['marketId', 'market_id'], ['optionId', 'option_id'], ['amount', 'amount'], ['status', 'status'], ['payout', 'payout'], ['at', 'created_at']],
  },
  {
    coll: 'stakingRuns', table: 'staking_runs', key: 'id',
    cols: [['id', 'id'], ['playerId', 'player_id'], ['gameId', 'game_id'], ['label', 'label'], ['buyIn', 'buy_in'], ['status', 'status'], ['createdAt', 'created_at']],
  },
  {
    coll: 'stakes', table: 'stakes', key: 'id',
    cols: [['id', 'id'], ['backerId', 'backer_id'], ['runId', 'run_id'], ['playerId', 'player_id'], ['amount', 'amount'], ['status', 'status'], ['at', 'created_at']],
  },
  {
    coll: 'arcade', table: 'arcade_games', key: 'id', ordered: true,
    cols: [['id', 'id'], ['name', 'name'], ['kind', 'kind'], ['status', 'status']],
  },
  {
    coll: 'arcadeRuns', table: 'arcade_runs', key: 'id',
    cols: [['id', 'id'], ['userId', 'user_id'], ['gameId', 'game_id'], ['score', 'score'], ['entry', 'entry'], ['payout', 'payout'], ['status', 'status'], ['at', 'created_at']],
  },
];

