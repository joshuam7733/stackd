# Step 3 — STACKD design system

**Concept:** scoreboard type on matte black. Chalk-white actions. Colour is reserved for meaning, never decoration.
Gaming culture × premium fintech × streetwear, without the neon-casino clichés.

## Type

One family, two widths: **Archivo** (variable `wdth` axis, Google Fonts).

| Role | Setting | Used for |
|---|---|---|
| Display | wdth 62, weight 900, uppercase, line-height 0.9 | PLAY FOR THE BAG., result titles, player names on the ID card |
| Big numbers | wdth 62, weight 900, tabular | prize pools, STACK Score, balances, streaks, ranks |
| Headings | wdth 70–85, weight 750–850, sentence case | page and section titles |
| UI / body | wdth 100, 400–700 | everything else |

Labels stay sentence case. All-caps is only for brand phrases and scoreboard numbers.

## Colour tokens (`src/styles/tokens.css`)

| Token | Hex | Role |
|---|---|---|
| `--bg` | #0C0D10 | page |
| `--surface` | #15171C | cards, panels |
| `--elevated` | #1D2027 | inputs, nested blocks |
| `--overlay` | #262A33 | hover, menus |
| `--border` / `--border-strong` | #2A2E37 / #3A3F4A | structure (elevation is borders, not shadows) |
| `--text` / `--primary` | #F2EFE6 | chalk: text and primary buttons |
| `--muted` / `--faint` | #9EA1AA / #6A6E78 | secondary text |
| `--secondary` | #5B6CFF | cobalt: selection, focus rings, progress |
| `--money` / `--success` | #3DDC97 | winnings, balances, positive deltas |
| `--heat` | #FF6B3D | live, streaks ("on a run") |
| `--warning` | #FFB547 | review, pending, demo markers |
| `--error` | #FF5468 | errors, destructive |
| `--info` | #59A8FF | informational notices |

Rank colours: Bronze → Silver → Gold → Platinum → Diamond → Elite → Master (`--rank-*`).

## Shape, space, motion

- Radius follows hierarchy: 6 (chips, inputs) → 10 (buttons) → 14 (cards) → 20 (media/hero) → pill (filters).
- 4-pt spacing scale (`--s-1` … `--s-20`); gutters 16 / 24 / 32 px at phone / tablet / desktop.
- Motion: 120 / 220 / 380 ms with one ease curve. Only transform and opacity animate. One orchestrated moment per
  screen (hero headline, result reveal, the landing "win stack"). `prefers-reduced-motion` disables all of it.

## Game artwork

`GameArt` generates duotone key art per game from its catalog entry (`art.bg`, `art.fg`, `art.motif`): zone circles
for battle royale, lanes for MOBA, pitch lines for football, a rack for pool, speed lines for racing, slashes for
fighters, tiles for strategy, bursts for arena. No publisher artwork is used; licensed art can replace it per game.

## Components (`src/ui/components`)

`base.js` Button (primary, secondary, ghost, accent, money, danger, brand; sm/lg/block; loading) · IconButton ·
Badge · Chips · Seg · Tabs · Input / Select / Textarea / Toggle / AmountPicker with label, hint, error ·
Sheet (bottom sheet on phones, modal on desktop, focus trap, Esc, focus restore) · Confirm · Menu · Toasts ·
Avatar · Rank · Who · FormDots · BigMoney · Countdown · Progress · Stat · Notice · Empty · ErrorBox · skeletons ·
Async (loading / error / empty / data).

`cards.js` CompetitionCard · H2HCard · TournamentCard · MissionCard · TeamCard / TeamTag · PlayerCard ·
PrizeBreakdown · StackCard (wallet) · TxRow · LeaderRow · Achievement · NotificationItem · MatchRow · StatusBadge.

States covered: default, hover, focus-visible, pressed (scale), disabled, loading (spinner + aria-busy),
error (field + notice), success (toast + notice), empty and skeleton.

## Layouts

- **Phone:** sticky top bar (wordmark, search, bell, wallet chip) + 5-tab bottom nav (Home, Play, Tournaments, Wallet,
  Profile). Play sub-sections as a chip row. Carousels scroll with snap.
- **Tablet:** same chrome, 2–3 column grids.
- **Desktop (≥1024):** top nav (Home, Games, Challenges, H2H, Tournaments, Arcade, Teams, Leaderboards) + search
  (press `/`), notifications, wallet, account menu. Content with a sticky right rail (Your stack, STACK Score,
  top players, winners). Tables where density helps.
- **Admin:** left sidebar grouped Operate / Money / Growth / Trust with live queue counts, drawer on phones.
