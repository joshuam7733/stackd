# Step 1 — Reference analysis (Players' Lounge, public surface)

Inspected: public homepage and the public Fair Play policy (Oct 2026). The logged-in product is not public, so the
functional map below combines what the public surface states with standard patterns for skill-competition apps.
Nothing (code, copy, art, marks) was copied — this is a functional map only.

## What the reference offers

| Pillar | What it is | STACKD equivalent |
|---|---|---|
| Bet on yourself | Pick a challenge in a game, matched to skill; paid if you hit it | **Challenges** — objective templates per game + mode, payout multiplier by difficulty |
| Stake players | Back a player's next run and share the upside | **Back a player** — jurisdiction-gated, share-of-winnings model |
| Predictions | Prediction markets on sports/outcomes | **Predictions** — configurable markets, disabled per jurisdiction |
| Arcade | Fast PvP skill mini-games | **Arcade** — playable reaction / aim / timing games, server-scored from telemetry |
| Head-to-head | 1v1 matches and tournaments | **H2H** — direct, open, friend, private, skill-matched, rematch ("Run it back") |
| First-deposit bonus | Acquisition hook | Demo starter stack + bonus bucket in the ledger |
| Social proof | "Paid out to date" counter | Live "Recent winners" stack on landing + home |

## Fair-play mechanics worth keeping (re-expressed for STACKD)

- **Eligibility minimums per game** — minimum account level / rank / hours / match count to stop smurfing.
  → `game.eligibility[]` shown on every game page and checked at join time.
- **Verification evidence** — stream/VOD requirements, lobby must be visible, no overlays hiding match info.
  → `game.verification` methods (manual, screenshot, video/VOD link, API) via a verification adapter layer.
- **Disconnect rules** — refund vs. forfeit depending on game state at disconnect.
  → per-game `rules[]`, dispute reasons include "disconnect".
- **Public lobbies only, no collusion, no AFK farming, no match fixing.**
  → global fair-play rules + player reports + fraud alerts in admin.
- **Payout review / reversal** — results can be re-reviewed after payout.
  → disputes, appeals, referee review, ledger `reversal` entries (never edits history).

## Journeys mapped

1. Visitor → landing → sign up → age gate → pick games/platforms → home.
2. Home → Play → game → competition (challenge / H2H / pool / tournament) → join (entry debited) → match room →
   play → submit result + evidence → verification → payout → notification → "Run it back".
3. H2H: create (open/direct/friend/private/skill-matched) → opponent accepts → both report → agree = settle,
   disagree = dispute → referee.
4. Tournament: register (solo/team) → bracket seeded at start → play rounds → champion → prize allocation.
5. Wallet: deposit (provider adapter) → pending → completed; withdraw → pending review → completed/failed.
6. Sponsor: build campaign → missions → live → players complete → rewards distributed → analytics.
7. Admin: monitor KPIs, resolve disputes, review KYC, toggle jurisdictions, manage catalog, approve withdrawals.

## Where STACKD diverges on purpose

- Gaming first, money second: every screen leads with the game, the mode and the people; amounts support it.
- Mobile titles are the core catalog (CODM, PUBG Mobile, Free Fire, MLBB, eFootball…), PC/console supported.
- Battle-royale **team pools** with a configurable prize engine are a headline feature, not an afterthought.
- Sponsored **Stack Missions** turn the platform into an activation channel for brands.
- Uganda-first payments (MTN MoMo / Airtel Money adapters), UGX by default, jurisdiction matrix for everything else.
