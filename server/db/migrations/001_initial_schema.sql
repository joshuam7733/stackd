-- STACKD initial schema.
-- Conventions: ids are TEXT, timestamps are INTEGER (ms since epoch), money is INTEGER (whole UGX),
-- booleans are INTEGER 0/1, structured fields are JSON stored as TEXT. Every table has an `extra` JSON
-- column for attributes that do not need to be queried; the named columns are the system of record for
-- everything listed in the product spec.

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE jurisdictions (
  code                 TEXT PRIMARY KEY,
  enabled              INTEGER NOT NULL DEFAULT 1,
  real_money           INTEGER NOT NULL DEFAULT 0,
  staking              INTEGER NOT NULL DEFAULT 0,
  predictions          INTEGER NOT NULL DEFAULT 0,
  min_age              INTEGER NOT NULL DEFAULT 18,
  kyc_required         INTEGER NOT NULL DEFAULT 1,
  daily_deposit_limit  INTEGER,
  extra                TEXT
);

-- ---------------------------------------------------------------------------------------------
-- Identity

CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  name              TEXT,
  username          TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email             TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash     TEXT,
  avatar            TEXT,               -- JSON { color, url? }
  country           TEXT NOT NULL,
  region            TEXT,
  dob               TEXT,
  bio               TEXT,
  selected_games    TEXT NOT NULL DEFAULT '[]',
  platforms         TEXT NOT NULL DEFAULT '[]',
  in_game_ids       TEXT,
  stack_score       INTEGER NOT NULL DEFAULT 1000,
  peak_score        INTEGER,
  level             INTEGER NOT NULL DEFAULT 1,
  role              TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','sponsor','referee','admin','system')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','restricted','suspended')),
  is_bot            INTEGER NOT NULL DEFAULT 0,
  onboarded         INTEGER NOT NULL DEFAULT 0,
  profile_complete  INTEGER NOT NULL DEFAULT 1,
  matches           INTEGER NOT NULL DEFAULT 0,
  wins              INTEGER NOT NULL DEFAULT 0,
  losses            INTEGER NOT NULL DEFAULT 0,
  competitions      INTEGER NOT NULL DEFAULT 0,
  streak            INTEGER NOT NULL DEFAULT 0,
  best_streak       INTEGER NOT NULL DEFAULT 0,
  earnings          INTEGER NOT NULL DEFAULT 0,
  tournament_wins   INTEGER NOT NULL DEFAULT 0,
  sponsor_id        TEXT,
  kyc               TEXT,
  limits            TEXT,
  restrictions      TEXT,
  game_scores       TEXT,
  form              TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  last_seen_at      INTEGER,
  extra             TEXT
);
CREATE INDEX users_score ON users (stack_score DESC);
CREATE INDEX users_country ON users (country);

-- External sign-in identities (Google today; Apple, phone, other OAuth providers later).
CREATE TABLE auth_identities (
  provider          TEXT NOT NULL,
  provider_user_id  TEXT NOT NULL,
  user_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email             TEXT,
  email_verified    INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  last_used_at      INTEGER,
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX auth_identities_user ON auth_identities (user_id);

-- Server-side sessions. Only a SHA-256 hash of the cookie token is stored.
CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  last_seen_at  INTEGER,
  ip            TEXT,
  user_agent    TEXT,
  provider      TEXT
);
CREATE INDEX sessions_user ON sessions (user_id);

-- Short-lived OAuth state (state, nonce, PKCE verifier) between redirect and callback.
CREATE TABLE oauth_states (
  state          TEXT PRIMARY KEY,
  provider       TEXT NOT NULL,
  code_verifier  TEXT NOT NULL,
  nonce          TEXT NOT NULL,
  next_path      TEXT,
  created_at     INTEGER NOT NULL
);

CREATE TABLE idempotency_keys (
  key         TEXT PRIMARY KEY,
  user_id     TEXT,
  result      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------------------------
-- Catalog

CREATE TABLE games (
  id                    TEXT PRIMARY KEY,
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  short_name            TEXT,
  description           TEXT,
  developer             TEXT,
  genre                 TEXT,
  platforms             TEXT NOT NULL DEFAULT '[]',
  status                TEXT NOT NULL DEFAULT 'active',     -- supported status: active | disabled | coming_soon
  verification_methods  TEXT NOT NULL DEFAULT '[]',         -- preference order: api | video | screenshot | manual
  integration           TEXT NOT NULL DEFAULT 'simulation', -- game integration adapter id
  image                 TEXT,                               -- JSON media { icon, cover, banner, hero }
  art                   TEXT,
  regions               TEXT,
  rules                 TEXT,
  eligibility           TEXT,
  popularity            INTEGER NOT NULL DEFAULT 0,
  featured              INTEGER NOT NULL DEFAULT 0,
  updated_at            INTEGER,
  extra                 TEXT
);

CREATE TABLE game_modes (
  game_id      TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  id           TEXT NOT NULL,
  name         TEXT NOT NULL,
  team_size    INTEGER NOT NULL DEFAULT 1,
  max_players  INTEGER NOT NULL DEFAULT 2,
  rules        TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  types        TEXT,
  metrics      TEXT,
  ord          INTEGER NOT NULL DEFAULT 0,
  extra        TEXT,
  PRIMARY KEY (game_id, id)
);

CREATE TABLE challenge_templates (
  id         TEXT PRIMARY KEY,
  game_id    TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  mode_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  metric     TEXT NOT NULL,
  op         TEXT NOT NULL,
  target     REAL NOT NULL,
  base_prob  REAL,
  extra      TEXT
);

CREATE TABLE achievements (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  requirements  TEXT NOT NULL,   -- JSON { stat, gte } | { score: true, gte }
  tier          INTEGER,
  glyph         TEXT,
  ord           INTEGER,
  extra         TEXT
);

CREATE TABLE user_achievements (
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id  TEXT NOT NULL,
  unlocked_at     INTEGER NOT NULL,
  ord             INTEGER NOT NULL DEFAULT 0,
  extra           TEXT,
  PRIMARY KEY (user_id, achievement_id)
);

-- ---------------------------------------------------------------------------------------------
-- Teams

CREATE TABLE teams (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  tag         TEXT NOT NULL,
  logo        TEXT,                 -- JSON { color, tag, url? }
  color       TEXT,
  captain_id  TEXT REFERENCES users (id),
  games       TEXT NOT NULL DEFAULT '[]',
  rating      INTEGER NOT NULL DEFAULT 1000,
  matches     INTEGER NOT NULL DEFAULT 0,
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  is_open     INTEGER NOT NULL DEFAULT 1,
  country     TEXT,
  bio         TEXT,
  created_at  INTEGER NOT NULL,
  extra       TEXT
);

CREATE TABLE team_members (
  team_id    TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  joined_at  INTEGER,
  ord        INTEGER NOT NULL DEFAULT 0,
  extra      TEXT,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX team_members_user ON team_members (user_id);

CREATE TABLE team_invites (
  team_id     TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  invited_by  TEXT,
  created_at  INTEGER,
  ord         INTEGER NOT NULL DEFAULT 0,
  extra       TEXT,
  PRIMARY KEY (team_id, user_id)
);

-- ---------------------------------------------------------------------------------------------
-- Competitions (challenges, head-to-heads, battle royale pools)

CREATE TABLE competitions (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,         -- challenge | h2h | pool
  game_id           TEXT REFERENCES games (id),
  mode_id           TEXT,
  platform          TEXT,
  region            TEXT,
  format            TEXT,                  -- solo | team
  team_size         INTEGER NOT NULL DEFAULT 1,
  entry_fee         INTEGER NOT NULL DEFAULT 0,
  platform_fee_pct  REAL,
  prize_pool_pct    REAL,
  payout_model      TEXT,
  prize_config      TEXT,                  -- JSON prize-engine config (placements, splits, bonuses…)
  prize_pool        INTEGER,               -- current net prize pool (derived on write)
  gross_pool        INTEGER,
  platform_fee      INTEGER,
  min_players       INTEGER NOT NULL DEFAULT 2,
  max_players       INTEGER NOT NULL DEFAULT 2,
  players           INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL CHECK (status IN ('DRAFT','OPEN','FULL','STARTING','LIVE','VERIFYING','COMPLETED','CANCELLED','DISPUTED')),
  visibility        TEXT,
  code              TEXT,
  featured          INTEGER NOT NULL DEFAULT 0,
  sponsor_id        TEXT,
  created_by        TEXT,
  match_id          TEXT,
  start_time        INTEGER,
  end_time          INTEGER,
  rules             TEXT,
  result            TEXT,
  challenge         TEXT,
  h2h               TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  extra             TEXT
);
CREATE INDEX competitions_status ON competitions (status, start_time);
CREATE INDEX competitions_game ON competitions (game_id);

CREATE TABLE competition_entries (
  id              TEXT PRIMARY KEY,        -- competitionId:userId
  competition_id  TEXT NOT NULL REFERENCES competitions (id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users (id),
  team_id         TEXT,                    -- STACKD team id, or a squad id for solo-queue squads
  squad_name      TEXT,
  entry_amount    INTEGER NOT NULL DEFAULT 0,
  paid_by         TEXT,
  placement       INTEGER,
  result          TEXT,                    -- won | lost | null while open
  winnings        INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'in',
  joined_at       INTEGER,
  ord             INTEGER NOT NULL DEFAULT 0,
  extra           TEXT,
  UNIQUE (competition_id, user_id)
);
CREATE INDEX competition_entries_user ON competition_entries (user_id);

CREATE TABLE matches (
  id                   TEXT PRIMARY KEY,
  kind                 TEXT NOT NULL,       -- challenge | h2h | pool | tournament
  ref_id               TEXT,                -- competition or tournament id
  competition_id       TEXT,
  tournament_id        TEXT,
  bracket_match_id     TEXT,
  game_id              TEXT,
  mode_id              TEXT,
  participants         TEXT NOT NULL,       -- JSON user ids
  teams                TEXT,
  status               TEXT NOT NULL,
  result               TEXT,                -- JSON outcome (standings, payouts, per-user results)
  verification_status  TEXT CHECK (verification_status IS NULL OR verification_status IN ('PENDING','VERIFIED','REJECTED','DISPUTED')),
  verification         TEXT,
  integration          TEXT,                -- adapter that produced / will produce the result
  start_time           INTEGER,
  end_time             INTEGER,
  created_at           INTEGER NOT NULL,
  reports              TEXT,
  timeline             TEXT,
  hidden_truth         TEXT,                -- simulator / evidence ground truth, never sent to clients
  simulation           TEXT,                -- simulation adapter script (eliminations, standings)
  extra                TEXT
);
CREATE INDEX matches_ref ON matches (ref_id);
CREATE INDEX matches_status ON matches (status);

-- ---------------------------------------------------------------------------------------------
-- Tournaments

CREATE TABLE tournaments (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  game_id                TEXT REFERENCES games (id),
  mode_id                TEXT,
  platform               TEXT,
  format                 TEXT NOT NULL,
  team_size              INTEGER NOT NULL DEFAULT 1,
  max_entrants           INTEGER NOT NULL,
  entry_fee              INTEGER NOT NULL DEFAULT 0,
  platform_fee_pct       REAL,
  prize_config           TEXT,
  prize_pool             INTEGER,
  guaranteed             INTEGER NOT NULL DEFAULT 0,
  participants           INTEGER NOT NULL DEFAULT 0,
  bracket                TEXT,
  results                TEXT,
  status                 TEXT NOT NULL,
  start_time             INTEGER,
  registration_deadline  INTEGER,
  sponsor_id             TEXT,
  featured               INTEGER NOT NULL DEFAULT 0,
  region                 TEXT,
  rules                  TEXT,
  created_at             INTEGER,
  extra                  TEXT
);

CREATE TABLE tournament_entrants (
  tournament_id  TEXT NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  entrant_id     TEXT NOT NULL,
  type           TEXT NOT NULL,     -- user | team
  name           TEXT,
  seed           INTEGER,
  rating         INTEGER,
  members        TEXT NOT NULL,     -- JSON user ids
  ord            INTEGER NOT NULL DEFAULT 0,
  extra          TEXT,
  PRIMARY KEY (tournament_id, entrant_id)
);

-- ---------------------------------------------------------------------------------------------
-- Money (DEMO MODE: every amount is simulated UGX)

-- Wallet balances are a projection of the ledger, refreshed in the same database transaction as every
-- ledger write. The ledger (transactions) is the source of truth.
CREATE TABLE wallets (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  currency           TEXT NOT NULL DEFAULT 'UGX',
  is_demo            INTEGER NOT NULL DEFAULT 1,
  demo_balance       INTEGER NOT NULL DEFAULT 0,   -- spendable (cash + bonus)
  cash_balance       INTEGER NOT NULL DEFAULT 0,
  bonus_balance      INTEGER NOT NULL DEFAULT 0,
  pending_balance    INTEGER NOT NULL DEFAULT 0,   -- incoming, not yet settled
  held_balance       INTEGER NOT NULL DEFAULT 0,   -- outgoing, reserved
  lifetime_earnings  INTEGER NOT NULL DEFAULT 0,
  updated_at         INTEGER NOT NULL
);

-- Append-only ledger. Amounts are signed: credits > 0, debits < 0.
CREATE TABLE transactions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id),
  type             TEXT NOT NULL,   -- COMPETITION_ENTRY | PRIZE_WIN | REFUND | DEPOSIT | WITHDRAWAL | DEMO_CREDIT | ...
  amount           INTEGER NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'UGX',
  is_demo          INTEGER NOT NULL DEFAULT 1,
  bucket           TEXT NOT NULL DEFAULT 'cash',
  status           TEXT NOT NULL,   -- pending | completed | failed | reversed
  reference        TEXT,            -- competition / tournament / match / mission id
  reference_kind   TEXT,
  reference_label  TEXT,
  description      TEXT,
  provider         TEXT,
  idempotency_key  TEXT,
  meta             TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX transactions_user ON transactions (user_id, created_at DESC);
CREATE INDEX transactions_ref ON transactions (reference);

-- Platform side of the ledger: fees earned, house edge, guarantee top-ups, sponsor funding.
CREATE TABLE platform_revenue (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  reference   TEXT,
  amount      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  extra       TEXT
);

-- ---------------------------------------------------------------------------------------------
-- Engagement

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT,
  link        TEXT,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX notifications_user ON notifications (user_id, created_at DESC);

-- STACK Score history: one row per rating change, with the reason.
CREATE TABLE score_events (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  match_id     TEXT,
  game_id      TEXT,
  delta        INTEGER NOT NULL,
  score_after  INTEGER NOT NULL,
  reason       TEXT,
  created_at   INTEGER NOT NULL,
  extra        TEXT
);
CREATE INDEX score_events_user ON score_events (user_id, created_at DESC);

CREATE TABLE feed_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  game_id     TEXT,
  amount      INTEGER,
  text        TEXT,
  created_at  INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------------------------
-- Sponsors and missions

CREATE TABLE sponsors (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  logo      TEXT,
  color     TEXT,
  category  TEXT,
  contact   TEXT,
  status    TEXT NOT NULL DEFAULT 'active',
  extra     TEXT
);

CREATE TABLE campaigns (
  id          TEXT PRIMARY KEY,
  sponsor_id  TEXT REFERENCES sponsors (id),
  name        TEXT NOT NULL,
  budget      INTEGER,
  spent       INTEGER,
  status      TEXT,
  starts_at   INTEGER,
  ends_at     INTEGER,
  created_at  INTEGER,
  extra       TEXT
);

CREATE TABLE missions (
  id            TEXT PRIMARY KEY,
  campaign_id   TEXT,
  sponsor_id    TEXT REFERENCES sponsors (id),
  name          TEXT NOT NULL,
  description   TEXT,
  type          TEXT NOT NULL,        -- in_game | hunt | progress
  game_id       TEXT,
  mode_id       TEXT,
  requirements  TEXT,                 -- JSON objective / requirement list
  reward        TEXT,                 -- JSON { type, value, label }
  quantity      INTEGER,
  completions   INTEGER NOT NULL DEFAULT 0,
  participants  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL,        -- draft | pending | scheduled | live | paused | complete
  starts_at     INTEGER,
  ends_at       INTEGER,
  created_at    INTEGER,
  extra         TEXT
);

CREATE TABLE mission_participants (
  mission_id    TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status        TEXT NOT NULL,        -- in_progress | completed | failed
  progress      TEXT,                 -- JSON counters / scans / attempts
  started_at    INTEGER,
  completed_at  INTEGER,
  ord           INTEGER NOT NULL DEFAULT 0,
  extra         TEXT,
  PRIMARY KEY (mission_id, user_id)
);

CREATE TABLE reward_drops (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mission_id  TEXT,
  sponsor_id  TEXT,
  label       TEXT,
  type        TEXT,
  code        TEXT,
  status      TEXT,
  created_at  INTEGER,
  extra       TEXT
);

-- ---------------------------------------------------------------------------------------------
-- Trust and safety

CREATE TABLE disputes (
  id               TEXT PRIMARY KEY,
  match_id         TEXT,
  competition_id   TEXT,
  user_id          TEXT,               -- raised by
  against_user_id  TEXT,
  reason           TEXT NOT NULL,
  details          TEXT,
  evidence         TEXT,
  status           TEXT NOT NULL,      -- open | under_review | resolved | rejected | appealed
  resolution       TEXT,
  appeal           TEXT,
  history          TEXT,
  created_at       INTEGER NOT NULL,
  extra            TEXT
);

CREATE TABLE player_reports (
  id           TEXT PRIMARY KEY,
  reporter_id  TEXT,
  user_id      TEXT,
  reason       TEXT,
  details      TEXT,
  match_id     TEXT,
  status       TEXT,
  created_at   INTEGER,
  extra        TEXT
);

CREATE TABLE support_tickets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  subject     TEXT,
  category    TEXT,
  status      TEXT,
  messages    TEXT,
  created_at  INTEGER,
  extra       TEXT
);

CREATE TABLE fraud_alerts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  kind        TEXT,
  severity    TEXT,
  detail      TEXT,
  status      TEXT,
  created_at  INTEGER,
  extra       TEXT
);

CREATE TABLE audit_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  target      TEXT,
  meta        TEXT,
  ip          TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX audit_logs_time ON audit_logs (created_at DESC);

-- ---------------------------------------------------------------------------------------------
-- Secondary products (demo)

CREATE TABLE prediction_markets (
  id          TEXT PRIMARY KEY,
  category    TEXT,
  title       TEXT,
  status      TEXT,
  closes_at   INTEGER,
  volume      INTEGER,
  resolution  TEXT,
  options     TEXT,
  extra       TEXT
);

CREATE TABLE prediction_positions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  market_id   TEXT,
  option_id   TEXT,
  amount      INTEGER,
  status      TEXT,
  payout      INTEGER,
  created_at  INTEGER,
  extra       TEXT
);

CREATE TABLE staking_runs (
  id          TEXT PRIMARY KEY,
  player_id   TEXT,
  game_id     TEXT,
  label       TEXT,
  buy_in      INTEGER,
  status      TEXT,
  created_at  INTEGER,
  extra       TEXT
);

CREATE TABLE stakes (
  id          TEXT PRIMARY KEY,
  backer_id   TEXT,
  run_id      TEXT,
  player_id   TEXT,
  amount      INTEGER,
  status      TEXT,
  created_at  INTEGER,
  extra       TEXT
);

CREATE TABLE arcade_games (
  id      TEXT PRIMARY KEY,
  name    TEXT,
  kind    TEXT,
  status  TEXT,
  ord     INTEGER,
  extra   TEXT
);

CREATE TABLE arcade_runs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  game_id     TEXT,
  score       REAL,
  entry       INTEGER,
  payout      INTEGER,
  status      TEXT,
  created_at  INTEGER,
  extra       TEXT
);

-- ---------------------------------------------------------------------------------------------
-- Reporting views (rankings are calculated from persisted results, never stored by hand)

CREATE VIEW leaderboard_players AS
  SELECT u.id, u.username, u.country, u.region, u.stack_score, u.wins, u.losses, u.matches, u.competitions,
         CASE WHEN u.matches > 0 THEN ROUND(100.0 * u.wins / u.matches, 1) ELSE 0 END AS win_rate,
         RANK() OVER (ORDER BY u.stack_score DESC) AS position
  FROM users u
  WHERE u.role = 'player' AND u.status <> 'suspended';

CREATE VIEW leaderboard_teams AS
  SELECT t.id, t.name, t.tag, t.rating, t.wins, t.losses, t.matches,
         RANK() OVER (ORDER BY t.rating DESC) AS position
  FROM teams t;

CREATE VIEW ledger_integrity AS
  SELECT w.user_id, w.demo_balance AS wallet_balance,
         COALESCE((SELECT SUM(t.amount) FROM transactions t
                   WHERE t.user_id = w.user_id AND (t.status = 'completed' OR (t.status = 'pending' AND t.amount < 0))), 0) AS ledger_balance
  FROM wallets w;
