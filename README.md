# STACKD — Play for the bag.

A mobile-first competitive gaming platform. Players compete in the games they already play (bet-on-yourself
challenges, head-to-heads, 100-player battle royale pools, tournaments, arcade, sponsored missions) and win prizes.

**DEMO MODE.** Every wallet holds demo money (UGX, clearly labelled DEMO). No real payment provider is connected and
no game publisher API is connected; matches are played out by a server-side simulator that is labelled as such
wherever its results appear. Everything else (accounts, sessions, wallets, ledger, prize pools, fees, payouts,
ratings, leaderboards, achievements, teams, tournaments, notifications, admin) is real, server-side and stored in a
database.

---

## Run it locally (fresh machine)

Requirements: **Node.js 22.13 or newer** (24 LTS recommended). Nothing else: the database is SQLite, built into Node.

```bash
npm install
npm start
```

Open http://localhost:5173. On first start the server creates `./data/stackd.db`, applies the migrations and seeds the
demo world. On Windows you can double-click `start.cmd` instead.

Useful scripts:

| Command | What it does |
|---|---|
| `npm start` | Start the server (API + frontend) on `PORT` (default 5173) |
| `npm run dev` | Same, restarting when server files change |
| `npm run db:migrate` | Apply pending migrations (`server/db/migrations/*.sql`) |
| `npm run db:seed` | Seed an empty database with the demo world |
| `npm run db:reset` | Wipe all data and reseed (schema kept). Stop the server first. |
| `npm run db:check` | Integrity checks: lossless storage, wallets = ledger, every settled pool reconciles |
| `npm run admin:create -- --email you@x.com --password "…"` | Create (or promote) an admin. Stop the server first. |
| `npm test` | End-to-end test suite against a real server and a temporary database |

Configuration lives in environment variables. Copy `.env.example` to `.env`; every variable is optional locally.

### Demo access

The login page has one-tap demo buttons (turn them off with `DEMO_LOGINS=false` on any shared server). Or log in with
password `demo1234`:

| Account | Login | |
|---|---|---|
| Player | `player@stackd.demo` | `nilewave`: Gold rank, history, a team, incoming challenges |
| Admin | `admin@stackd.demo` | Admin console |
| Sponsor | `sponsor@fizzup.demo` | FIZZUP campaign dashboard + mission builder |

New accounts start with **UGX 100,000 DEMO**.

### Ten-minute walkthrough

1. **Sign up** (email + password) → onboarding (platforms, games, avatar, in-game IDs) → home. Refresh: you stay
   signed in. Log out and back in: everything is still there (it's in the database, not the browser).
2. **The 100-player Battle Royale.** Home → *Battle Royale Demo: 100 Players* (CODM BR Squads, UGX 10,000 entry,
   20% fee). The card shows the maths: 1,000,000 gross → 200,000 fee → 800,000 prize pool → 200,000 per winning
   squad member. **Join** (UGX 10,000 DEMO leaves your wallet as a `COMPETITION_ENTRY`), then **Skip the wait
   (demo)**: the lobby fills with demo players who each pay their own entry, locks, counts down, and the match plays
   out live (kill feed, players and squads left, your status). At the final circle the result is verified (marked
   *simulated*), prizes are paid as `PRIZE_WIN`, your STACK Score moves, notifications arrive.
3. **Challenges** (bet on yourself, any stake) → *Simulate my match* → submit → verified → paid.
4. **H2H** → accept a challenge → report. Report a false result to see the automatic dispute and referee decision.
5. **Tournaments** → register → *Start now (demo)* → play your bracket matches; prizes pay when it completes.
6. **Teams** → create a team, invite a player, they accept; enter a squad pool as the team (you pay your teammates' seats).
7. **Missions** → *Play 3, finish top 10 once*: start it, then play; progress updates from your verified results.
8. **Leaderboards** → global / country / region / game / friends / my team / **teams**; wins, win rate, competitions.
9. **Admin** (`admin@stackd.demo`) → Competitions → *Create pool*: game, mode, entry fee, platform fee %, prize
   pool %, payout model and split (live preview), save as draft or publish → Fill → Start → Watch → *Finish now
   (demo)* → **Review** (every entry, placement, winnings and a reconciliation line). Also: users, KYC, wallets and
   withdrawals, tournaments, disputes, missions, fraud, audit log, compliance.

---

## Architecture

```
Browser (Preact + htm, no build step)            Node.js server (server/)
  index.html → src/main.js → src/ui/app.js          app.js        HTTP: static files, /api/rpc/:method, /api/events (SSE),
  src/ui/        screens + components                             /auth/:provider/start|callback, /healthz
  src/client/api.js  fetch('/api/rpc/<method>')     domain/       router (sessions, roles, validation, rate limits,
                     + EventSource('/api/events')                 idempotency, serialized transactions, audit),
                                                                  handlers/, services/, engines/, world clock, seed
                                                    auth/         passwords (scrypt), OAuth/OIDC providers (Google)
                                                    db/           SQLite adapter, migrations, table mapping, store
                                                    integrations/ game integration adapters (simulation, evidence, …)
                                                    payments/     payment provider adapters (demo, MTN, Airtel, …)
                                                    scripts/      migrate, seed, reset, check, create-admin
                                                    tests/        end-to-end tests (node:test)
```

- **The server is the source of truth.** The browser never decides balances, winnings, fees, prize pools, winners,
  ratings or permissions; it calls named RPC methods and renders what comes back.
- **Only public files are served.** `index.html`, `src/{main.js,ui,client,lib,styles,shared}` and `assets/`.
  Server code, the database, `.env`, docs and `node_modules` are never served.
- **Live updates.** Every committed write bumps a version that is pushed over Server-Sent Events; screens refetch
  quietly. Live matches also poll every 2 s while they play out.

### Frontend

Unchanged design and screens. What changed underneath: `src/client/api.js` now talks HTTP (`POST /api/rpc/<method>`
with `X-Stackd-Client` and `Idempotency-Key` headers, session in an HttpOnly cookie) instead of an in-browser fake
server. New UI only where functionality needed it: *Continue with Google* (with a clear "not switched on" state), a
profile step in onboarding for Google sign-ups, the live battle royale view in the match room, progress missions,
the Teams leaderboard scope and a competitions column, and admin draft / publish / edit / review controls.

### Backend and request lifecycle

`POST /api/rpc/competitions.join` → CSRF check (custom header + same origin) → session from cookie → role check →
rate limit → schema validation (unknown fields rejected) → **write queue** (one transaction at a time) → snapshot →
handler mutates the domain model → `commit()` writes every changed row to SQLite in one SQL transaction → response.
If the handler or the database throws, the snapshot is restored and nothing is written. Idempotency keys make
financial calls safe to retry.

### Database

SQLite (Node's built-in `node:sqlite`, WAL mode, foreign keys on). Schema: `server/db/migrations/001_initial_schema.sql`.

| Area | Tables |
|---|---|
| Identity | `users`, `auth_identities` (Google today), `sessions` (SHA-256 of the token only), `oauth_states`, `idempotency_keys` |
| Catalog | `games`, `game_modes`, `challenge_templates`, `achievements`, `user_achievements` |
| Play | `competitions`, `competition_entries`, `matches`, `tournaments`, `tournament_entrants`, `teams`, `team_members`, `team_invites` |
| Money (demo) | `transactions` (append-only ledger), `wallets` (projection of the ledger), `platform_revenue` |
| Engagement | `notifications`, `score_events` (every STACK Score change and why), `feed_events`, `missions`, `mission_participants`, `reward_drops`, `sponsors`, `campaigns` |
| Trust | `disputes`, `player_reports`, `fraud_alerts`, `audit_logs`, `support_tickets`, `jurisdictions`, `settings` |
| Reporting views | `leaderboard_players`, `leaderboard_teams`, `ledger_integrity` |

Every spec field has a real column (e.g. `users.stack_score`, `competitions.entry_fee`, `competitions.platform_fee_pct`,
`competition_entries.placement / winnings`, `matches.verification_status`, `transactions.type` =
`COMPETITION_ENTRY | PRIZE_WIN | REFUND | DEPOSIT | WITHDRAWAL | DEMO_CREDIT | MISSION_REWARD …`). Statuses use the
spec's states (`DRAFT, OPEN, FULL, STARTING, LIVE, COMPLETED, CANCELLED, DISPUTED`; verification
`PENDING, VERIFIED, REJECTED, DISPUTED`). Each table also has an `extra` JSON column for attributes nobody queries.

How the domain uses it (`server/db/store.js`): at boot the model is loaded from the tables; the existing domain
services (built for the original prototype) work on it in memory; after every request the store compares each record
with what was last written and writes only the rows that changed, inside one SQL transaction, before replying.
Restart the server and everything is rebuilt from SQLite. `npm run db:check` proves the mapping is lossless.

**Migrations:** numbered SQL files in `server/db/migrations/`, tracked in `schema_migrations`, applied automatically on
start (or with `npm run db:migrate`). **Seed:** `server/domain/seed/` builds the demo world (153 players incl. 150 demo
players with demo wallets, 18 games, 38 modes, teams, competitions, tournaments, missions, sponsors); seeding goes
through the same services as live play, so every seeded entry is on the ledger.

**Moving to Postgres:** the store talks SQL through a 6-method adapter (`server/db/sqlite.js`: `all/get/run/exec/
transaction/close`). Add a Postgres adapter with the same methods (e.g. `pg`), translate the migration (types are
portable; swap `INTEGER` ms timestamps for `BIGINT`), and point `DATABASE_URL` at it. For several server instances,
move from the in-memory model to per-request queries per service, starting with wallets and competitions.

### Authentication

- **Email + password:** passwords hashed with scrypt (N=2¹⁵, r=8, p=1, 16-byte salt) via Node's crypto; constant-time
  compare; login timing doesn't reveal which emails exist.
- **Sessions:** 32 random bytes in an `HttpOnly; SameSite=Lax` cookie (`Secure` on https); only the SHA-256 is stored
  server-side; 30-day expiry; logout deletes it.
- **CSRF:** every API call needs the `X-Stackd-Client` header and JSON body (cross-site forms can't send either) and a
  same-origin `Origin`.
- **Guards:** `/app/*` needs a session, `/admin/*` needs the admin role. The server enforces both on every method;
  the frontend guards are only for navigation.

#### Google OAuth setup

1. Google Cloud Console → *APIs & Services* → *Credentials* → *Create credentials* → *OAuth client ID* →
   *Web application*.
2. Authorised redirect URI: `<PUBLIC_URL>/auth/google/callback` (locally `http://localhost:5173/auth/google/callback`).
3. Put the values in `.env`: `GOOGLE_CLIENT_ID=…`, `GOOGLE_CLIENT_SECRET=…` (and `PUBLIC_URL` if not localhost:5173).
4. Restart. The *Continue with Google* button switches on.

The flow (`server/auth/providers.js`, `server/auth/oauth.js`) uses **openid-client** (OpenID Certified): discovery,
PKCE (S256), state and nonce, ID-token validation. New Google users get a STACKD account with UGX 100,000 DEMO and are
asked for username, date of birth and country in onboarding. A Google account whose verified email matches an existing
STACKD account is linked to it. The test suite runs this whole flow against a local mock OpenID provider.

*Adding a sign-in provider:* register another OIDC provider in `server/auth/providers.js` (Apple uses the same shape);
`auth_identities` already keys identities by `(provider, provider_user_id)`. Phone-number sign-in needs an SMS
provider and is shown as coming soon.

#### Admin setup

The seed creates `admin@stackd.demo` (password `demo1234`). For a real deployment, create your own admin with
`npm run admin:create -- --email … --password "12+ chars"` and set `DEMO_LOGINS=false`.

### Competition engine and payouts

- Lifecycle: `DRAFT → OPEN → FULL → STARTING (countdown) → LIVE → COMPLETED`, or `CANCELLED` (everyone refunded)
  or `DISPUTED`. Enforced server-side: capacity, no double entry, edits locked once anyone has paid, region and
  compliance gates.
- **Every seat is paid from a real wallet.** Players pay their own entry; a captain entering their STACKD team pays
  their teammates' seats; demo players filling a lobby pay their own. Leaving refunds whoever paid.
- **Prize engine** (`server/domain/engines/prize.js`), fully admin-configurable per competition: entry fee, platform
  fee %, prize pool % (any gap goes to the season pool), payout model (winner takes all, placement, team, per
  elimination, hybrid, custom), number of winners and split, sponsor boost, bonuses, guaranteed pool.
  Example: 100 × 10,000 = 1,000,000 gross; 20% fee = 200,000; prize pool 800,000; winning squad of 4 → 200,000 each.
- Settlement writes `PRIZE_WIN` transactions, updates each entry's placement / result / winnings, records platform
  revenue and stores a reconciliation (entries + sponsor money = prizes + platform revenue).

### Battle Royale simulation and game integrations

STACKD can't read results out of PUBG Mobile, CODM or any other game without an integration, and doesn't pretend to.
`server/integrations/` defines one contract that the competition engine uses for every result:
`authenticatePlayer · createMatch · getMatch · getResult · verifyResult · getPlayerStats`.

| Adapter | Status |
|---|---|
| `simulation` | **Working (DEMO MODE).** When a lobby locks it scripts the whole match server-side: countdown, zone phases, every elimination (who, by whom, when), team survival, placements. The script replays against the clock (players only ever see what has already happened), then `getResult → verifyResult → settle`. Results are flagged `simulated` in the data and the UI. |
| `evidence` | **Working.** Player reports + screenshot / clip / VOD evidence + automatic checks + referee review. Used for head-to-heads, challenges, tournament matches and missions. In demo mode the "evidence" is generated by the simulator and flagged as such. |
| `publisher_api` | Interface only. Needs publisher credentials; refuses to run until implemented. |
| `tournament_platform` | Interface only. For third-party tournament systems. |

Swapping the simulator for a real feed means implementing the same six methods; payouts, ratings, leaderboards,
achievements and notifications don't change.

### Stack Score, leaderboards, achievements

- **STACK Score** (`engines/rating.js`): Elo-family. Moves with wins/losses, opponent strength (expected score),
  difficulty (challenge multiplier, field size and average rating in pools), tournament weight (1.2×), win streaks
  and consistency (form over the last ten). Only verified results count. Money never affects it. Every change is a
  `score_events` row.
- **Leaderboards** are calculated from persisted results on every request: global, country, region, game, platform,
  season, friends, my team, and team rankings; player, STACK Score, wins, win rate, competitions.
- **Achievements** (`engines/achievements.js`, rows in `achievements`): First Win, 10 Wins, 100 Matches, 10-Win
  Streak, Top 10, Tournament Champion, Team Champion and more, unlocked from real events, stored in
  `user_achievements`, announced as notifications.

### Payments (deliberately not live yet)

`server/payments/index.js` defines `initiateDeposit · verifyDeposit · initiateWithdrawal · verifyWithdrawal · refund ·
transactionStatus`. **DemoPaymentProvider** is the working implementation (simulated MTN MoMo / Airtel / card / bank
flows; amounts ending in 13 decline so failures can be tested). MTN MoMo, Airtel Money, card and bank adapters are
placeholders that refuse to run. Connecting them is the next phase: implement the adapter, add credentials (see
`.env.example`), complete legal review, then switch `realMoney` on per jurisdiction.

### Security checklist

Protected routes and admin-only methods (server-enforced) · scrypt passwords · hashed server-side sessions in HttpOnly
cookies · CSRF protection · schema validation on every method (unknown fields rejected) · server-side money maths ·
serialized write transactions with rollback · idempotency keys on financial calls · token-bucket rate limits (auth
calls are the strictest) · audit log with IP · CSP and security headers · no secrets in the frontend · `.env` ignored
by git.

---

## Hosting

The server is a single Node process with a SQLite file, so it needs a host that runs Node with a **persistent disk**
(Render, Railway or Fly.io with a volume, a VPS, or the included `Dockerfile`). Set `HOST=0.0.0.0`, `PUBLIC_URL`,
`TRUST_PROXY=true` behind a proxy, `DEMO_LOGINS=false`, and mount `/app/data`.

### Online preview on Netlify or Vercel (static demo build)

Netlify and Vercel can't run this server (no long-running process, no persistent disk), so there is a static
preview build for sharing a link:

```bash
npm run build:static
```

This writes `deploy/`: the same frontend plus the same domain code (engines, ledger, competition engine, simulation
adapter, world clock), running **inside each visitor's browser** and saved to IndexedDB. `web-demo/` holds the
browser stand-ins for the few Node-only pieces (`node:crypto`, password hashing, the HTTP transport). Every visitor
gets a private demo world: sign-up, onboarding, wallets, the 100-player battle royale, tournaments, teams and admin all
work, but accounts aren't shared between people and Google sign-in isn't available.

- **Netlify:** zip the contents of `deploy/` (`stackd-netlify.zip` is generated alongside), then drag the zip onto
  your site's *Deploys* tab (updates the existing link), or onto https://app.netlify.com/drop for a new site.
- **Vercel:** `npx vercel deploy deploy --prod` (log in when asked), or import the folder in the dashboard. Static
  hosting, no build command; `vercel.json` sets the headers.

Drag-and-drop deploys don't update automatically: rebuild and re-upload after changes.

## Notes

- Game artwork is official store art hot-linked from each game's listing; it belongs to the publishers. Fine for a
  prototype; license it before a public launch. STACKD is not affiliated with any publisher.
- Sponsors (FIZZUP, Rapid Data, Kampala Kicks, Boda Bites, Glowpad, VOLTA) are fictional.
- The 150 demo players are labelled as demo accounts in the admin console. They keep lobbies alive and pay real
  (demo) entries from their own demo wallets.
- The jurisdiction matrix is demo configuration, not legal advice.
- Internet access is needed for the Preact module (unpkg), the Archivo font (Google Fonts) and game art.
