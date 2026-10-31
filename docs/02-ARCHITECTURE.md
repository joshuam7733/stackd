# Step 2 — Architecture

## Runtime shape

```
Browser
 ├─ UI (Preact + htm, hash router)         src/ui/**
 │    └─ only talks to →  client RPC        src/client/api.js   (simulated network latency, idempotency keys)
 └─ "Server" (in-browser for the prototype) src/server/**
      ├─ router.js      method registry · auth · roles · validation · rate limit · audit
      ├─ handlers/*.js  auth, catalog, competitions, matches, tournaments, teams, wallet, social, missions,
      │                 markets (staking + predictions), arcade, fairplay, admin, sponsor
      ├─ engines/       prize · rating (STACK Score) · matchmaking · compliance · payments · verification ·
      │                 achievements · world (keeps the demo world alive)
      └─ db.js          single JSON document persisted to localStorage (swap for Postgres later)
```

The UI never mutates data. Every write is an RPC (`rpc('competitions.join', {...})`). Wallet balances are **derived
from the ledger** on the server side — the client never sends a balance or an outcome it decided on. Arcade scores
are recomputed server-side from raw input telemetry. Moving to a real backend means replacing the transport in
`client/api.js` with `fetch('/rpc/' + method)` and porting `server/` to Node/Go — handler signatures stay the same.

## Information architecture

```
Public            /                     landing
                  /login  /signup  /onboarding
App (player)      /app                  Home
                  /app/play             Play hub ─┬─ /app/games ── /app/games/:slug
                                                  ├─ /app/challenges (+ /new)
                                                  ├─ /app/h2h (+ /new)
                                                  ├─ /app/arcade ── /app/arcade/:id
                                                  ├─ /app/teams ── /app/teams/:id (+ /new)
                                                  └─ /app/missions ── /app/missions/:id
                  /app/compete/:id      any competition (challenge, H2H, pool) → lobby
                  /app/match/:id        match room → submit → verification → result
                  /app/tournaments ── /app/tournaments/:id (bracket)
                  /app/leaderboards
                  /app/players          back a player (staking, jurisdiction-gated)
                  /app/predictions      prediction markets (jurisdiction-gated)
                  /app/wallet ── /app/wallet/tx/:id
                  /app/notifications  /app/search
                  /app/u/:username      player identity card
                  /app/settings         account · verification (KYC) · responsible play · region
                  /app/fairplay ── /app/disputes/:id     /app/support
Sponsor           /sponsor              campaign dashboard + mission builder
Admin             /admin  /admin/users(/:id)  /admin/games(/:id)  /admin/competitions  /admin/tournaments
                  /admin/wallet  /admin/sponsors  /admin/compliance  /admin/support  /admin/fraud  /admin/audit
```

Mobile bottom nav: **Home · Play · Tournaments · Wallet · Profile**. Desktop top nav: Home, Games, Challenges, H2H,
Tournaments, Arcade, Teams, Leaderboards + search, notifications, wallet, profile.

## Core flows

```
SIGN UP → age gate → pick games/platforms → HOME
HOME → PLAY → GAME → COMPETITION → JOIN (entry held in ledger) → MATCH ROOM
     → PLAY (launch game / simulate) → SUBMIT RESULT + EVIDENCE → VERIFY (adapter)
     → RESULT → PAYOUT (ledger credit) → STACK SCORE + ACHIEVEMENTS + NOTIFICATION → RUN IT BACK
```

H2H: `open → accepted → live → reporting → settled | disputed → referee → settled`.
Pool (battle royale): `open → filling → live → verifying → settled`, payouts from the prize engine.
Tournament: `registration → live (rounds) → completed`, bracket generated at start.
Withdrawal: `pending → (admin review) → completed | failed (refunded)`.
Mission: `scheduled → live → (start → complete → reward) → complete`.

## Data models (src/server/models.js documents every field)

User · Game · GameMode · Platform · Competition · Match · Team · Tournament · Wallet (derived) · Transaction (ledger
entry) · PrizePool (prize engine output) · Reward · Achievement · Sponsor · Campaign · Mission · Notification ·
Dispute · Leaderboard (computed view) · Jurisdiction · AuditEntry · FraudAlert · Ticket · Stake · Market.

## Screen inventory

| Area | Screens |
|---|---|
| Public | Landing, Log in, Sign up, Onboarding (3 steps) |
| Play | Home, Play hub, Games, Game detail, Challenges, New challenge, H2H, New H2H, Competition lobby, Match room, Result |
| Compete | Tournaments, Tournament detail + bracket, Arcade, Arcade game, Missions, Mission detail |
| Social | Teams, Team detail, Create team, Player profile, Leaderboards, Back a player, Predictions, Search |
| Money | Wallet, Deposit sheet, Withdraw sheet, Transaction detail |
| Account | Notifications, Settings (account, verification, responsible play, region), Fair play & disputes, Dispute detail, Support |
| Sponsor | Dashboard, Campaign detail, Mission builder |
| Admin | Overview, Users, User detail, Games, Game editor, Competitions (+ create with prize preview), Tournaments, Wallet, Sponsors, Compliance (jurisdictions, KYC queue, ranks), Support (tickets, disputes, appeals), Fraud, Audit log |

## Security model (prototype implements, backend must enforce)

- Sessions: opaque token, expiry; roles `player | sponsor | referee | admin`; per-method role guard.
- Validation: every RPC declares a schema; unknown fields are rejected.
- Rate limiting: token bucket per session + method class (financial methods are tighter).
- Idempotency: financial methods require an `Idempotency-Key`; replays return the original result.
- Ledger: append-only; corrections are reversal entries; balances derived, never stored client-side.
- Results: server-verified via adapters; conflicting reports open disputes automatically.
- Audit log: every privileged or financial action writes an entry (actor, action, target, metadata).
- Fraud signals: deposit velocity, implausible arcade telemetry, win-rate spikes, collusion (same opponents).
- Compliance: age, KYC, jurisdiction matrix, per-game / per-competition / per-user real-money switches,
  limits, cool-off and self-exclusion — all evaluated in `engines/compliance.js` before any entry or payout.
