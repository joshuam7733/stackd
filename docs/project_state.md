# STACKD: project state

_Last updated: 18 Oct 2026. Project root: `E:\CLAUDE CODE\stackd`. Brand line: **PLAY FOR THE BAG.**_

## What it is now
The approved STACKD frontend now runs on a real backend: a **Node.js 24 server with SQLite** (`node:sqlite`), cookie
sessions, scrypt passwords and Google OAuth via openid-client (switched off until credentials are set). It has a
server-side competition engine, a ledger-backed demo wallet, a battle royale simulation adapter, tournaments, teams,
missions, achievements, leaderboards, notifications and the admin console. Everything runs in **DEMO MODE**. The
README is the full reference (architecture, DB, auth, Google setup, env, engine, integrations, payments, hosting).

## How to run
`npm install` → `npm start` → http://localhost:5173. On first start the server creates and seeds `data/stackd.db`.
`npm test` runs 10 end-to-end tests; all pass. `npm run db:check` runs the integrity checks.
Preview config: `.claude/launch.json` and `docs/.claude/launch.json` (both named "stackd").

## Done in this session
- Moved the domain code from `src/server` to `server/domain`. Added `server/{app,main,config}.js`, `server/db`
  (migrations, table mapping, write-through store, wallets projection, rollback by reload), `server/auth`,
  `server/integrations` (working simulation and evidence adapters; publisher and platform stubs) and
  `server/payments` (working DemoPaymentProvider; MTN, Airtel, card and bank stubs).
- Every seat is paid on the ledger (150 demo players with demo wallets; no phantom "field" players). Pools reconcile.
- BR lifecycle: OPEN → FULL → STARTING (countdown) → LIVE (kill feed) → verified (simulated) → COMPLETED + payouts.
- Admin: draft / publish / edit / fill / start / finish-now (demo) / review. Prize engine has a prize pool %.
- UI additions only where functionality needed them: Google button, onboarding profile step, live BR view,
  progress missions, Teams leaderboard plus a competitions stat, admin controls. "Run it up" replaced with
  "Play for the bag."
- Fake counters removed (landing and admin padded totals, "playing" ×37, Big Stack trickle).
- QA: 0 typography/overflow issues on 28 player routes at 1024px and 375px (fixed a nav overflow at 1024px).

- Fixed (follow-up): leaving a detail page briefly re-rendered the old screen with the next route's params and
  fired a request with a missing id (HTTP 400). `Screen` in `src/ui/app.js` now only renders a component for the
  route it was loaded for. Sweep: 0 failed requests and 0 layout issues on all player and admin routes.
- Fixed (follow-up): the starter wallet no longer counts as "Rewards + bonus"; existing data is upgraded at boot.
  Demo-player presence churn was reduced, so live-update pushes are less frequent.

- Landing: the hero now reads "Play for the bag." (one "Run it up." had survived behind a line break). Guests see
  **Get started** (nav, hero, closing CTA) → sign-up → onboarding → app; signed-in visitors see **Open STACKD**.
- Online preview: `npm run build:static` builds `deploy/` plus `stackd-netlify.zip` for Netlify or Vercel. The
  domain code runs in the visitor's browser (IndexedDB), with browser stand-ins in `web-demo/`. Verified on a plain
  static server: sign-up, BR demo (−1,000,000 entries / 4 × 200,000 prizes / 200,000 revenue), reload persistence.
  **Pending user action:** drag `stackd-netlify.zip` onto the Netlify site's Deploys tab.

## Known issues / next steps
1. Live refetching: every committed change pushes a version bump, and visible screens quietly refetch
   (throttled to 700 ms). This is fine at demo scale; scope pushes per user or topic before real traffic.
2. The model is held in memory per process (write-through to SQLite): single instance only. Postgres and
   multi-instance plan are in the README.
3. Netlify hosts only the old static build. The new server needs a Node host with a persistent disk
   (Dockerfile included, untested; Docker isn't installed here).
4. Google sign-in needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`; the flow is tested against a mock OIDC provider.
5. Live payments and real game integrations are deliberately deferred (next phase).
6. No git repository (git not installed).
