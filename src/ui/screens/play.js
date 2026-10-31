import { html, useState, useEffect } from '../../lib/preact.js';
import { useRpc, useSession } from '../hooks.js';
import { setQuery } from '../router.js';
import { Icon } from '../icons.js';
import { PlaySubnav } from '../components/shell.js';
import { Button, Badge, Seg, Chips, Tabs, Section, Empty, Async, CardsSkeleton, Sk, PageHead, Notice, Who, BigMoney, Rank } from '../components/base.js';
import { GameArt, GameCard, PlatformIcons } from '../components/game.js';
import { CompetitionCard, H2HCard, TournamentCard, MissionCard, LeaderRow } from '../components/cards.js';
import { NewChallengeSheet, NewH2HSheet } from './compete.js';
import { money, PLATFORM, CATEGORY } from '../format.js';

const MODES = [
  ['The Big Stack', 'USD 500,000+ season finals. Qualify by playing.', 'crown', '/app/bigstack'],
  ['Challenges', 'Bet on yourself. Hit the target, get paid.', 'target', '/app/challenges'],
  ['Head-to-head', 'Call someone out. Winner takes the pot.', 'swords', '/app/h2h'],
  ['Squad pools', '100 players, one pool, split by placement.', 'users', '/app/play?view=pools'],
  ['Tournaments', 'Brackets, Swiss, leagues, BR cups.', 'trophy', '/app/tournaments'],
  ['Arcade', 'Fast skill games. Thirty seconds a round.', 'zap', '/app/arcade'],
  ['Stack Missions', 'Sponsored drops in the games you play.', 'gift', '/app/missions'],
  ['Teams', 'Build your squad, climb together.', 'users', '/app/teams'],
  ['Back a player', 'Back someone’s run and share the upside.', 'trend', '/app/players'],
  ['Predictions', 'Call esports and match outcomes.', 'chart', '/app/predictions'],
];

export function PlayHub({ path, query }) {
  const { user } = useSession();
  const game = query.game || '';
  const platform = query.platform || '';
  const pools = useRpc('competitions.list', { kind: 'pool', status: 'open', gameId: game || undefined, platform: platform || undefined });
  const games = useRpc('games.list', {}, { live: false });
  const mine = (games.data || []).filter((g) => user.games.includes(g.id));
  useEffect(() => {
    if (query.view === 'pools') setTimeout(() => document.getElementById('pools')?.scrollIntoView({ behavior: 'smooth' }), 150);
  }, [query.view]);
  return html`<div class="container page">
    <${PlaySubnav} path=${path} />
    <${PageHead} title="Play" sub="Pick how you want to compete." />
    <div class="modes">
      ${MODES.map(([t, b, ic, href]) => html`<a class="mode-tile" href=${'#' + href}>
        <${Icon} name=${ic} />
        <div><p class="strong">${t}</p><p class="xs muted">${b}</p></div>
      </a>`)}
    </div>

    ${mine.length > 0 && html`<${Section} title="Your games" action=${{ label: 'All games', href: '/app/games' }}>
      <div class="rail games">${mine.map((g) => html`<${GameCard} game=${g} />`)}</div>
    <//>`}

    <${Section} title="Squad pools" sub="Lobbies lock at the start time. The pool is split by the card's payout model." id="pools">
      <div class="stack" style="gap:var(--s-3);margin-bottom:var(--s-4)">
        <${Chips} label="Game" value=${game} onChange=${(v) => setQuery({ game: v })} options=${[{ value: '', label: 'All games' }, ...(games.data || []).filter((g) => g.open > 0).map((g) => ({ value: g.id, label: g.short }))]} />
        <${Seg} label="Platform" value=${platform} onChange=${(v) => setQuery({ platform: v })} options=${[{ value: '', label: 'All' }, ...Object.entries(PLATFORM).map(([value, label]) => ({ value, label }))]} />
      </div>
      <${Async} q=${pools} skeleton=${html`<${CardsSkeleton} n=${6} h=${300} />`}
        empty=${html`<${Empty} icon="users" title="No open pools for that filter" body="Try another game or platform. New lobbies open every few minutes." action=${html`<${Button} variant="secondary" onClick=${() => setQuery({ game: '', platform: '' })}>Clear filters<//>`} />`}>
        ${(list) => html`<div class="grid-3">${list.map((c) => html`<${CompetitionCard} c=${c} />`)}</div>`}
      <//>
    <//>
  </div>`;
}

export function Games({ path, query }) {
  const platform = query.platform || '';
  const category = query.category || '';
  const [q, setQ] = useState(query.q || '');
  const games = useRpc('games.list', { platform: platform || undefined, category: category || undefined, q: query.q || undefined }, { live: false });
  return html`<div class="container page">
    <${PlaySubnav} path=${path} />
    <${PageHead} title="Games" sub="Mobile first. PC and console supported. Every game lists its platform, modes and rules." />
    <div class="stack" style="gap:var(--s-3);margin-bottom:var(--s-6)">
      <form class="row" onSubmit=${(e) => { e.preventDefault(); setQuery({ q }); }} role="search">
        <div class="searchbox grow" style="width:auto"><${Icon} name="search" /><input class="input" type="search" placeholder="Search games" aria-label="Search games" value=${q} onInput=${(e) => { setQ(e.currentTarget.value); if (!e.currentTarget.value) setQuery({ q: '' }); }} /></div>
        <${Button} type="submit" variant="secondary">Search<//>
      </form>
      <${Seg} label="Platform" value=${platform} onChange=${(v) => setQuery({ platform: v })} options=${[{ value: '', label: 'All platforms' }, ...Object.entries(PLATFORM).map(([value, label]) => ({ value, label }))]} />
      <${Chips} label="Category" value=${category} onChange=${(v) => setQuery({ category: v })} options=${[{ value: '', label: 'All' }, ...Object.entries(CATEGORY).filter(([k]) => k !== 'fps').map(([value, label]) => ({ value, label }))]} />
    </div>
    <${Async} q=${games} skeleton=${html`<div class="grid-4">${Array.from({ length: 8 }, () => html`<${Sk} h=${260} r="14" />`)}</div>`}
      empty=${html`<${Empty} icon="search" title="No games match that" body="Try a different platform or category, or clear the search." action=${html`<${Button} variant="secondary" onClick=${() => { setQ(''); setQuery({ q: '', platform: '', category: '' }); }}>Clear filters<//>`} />`}>
      ${(list) => html`<div class="games-grid">${list.map((g) => html`<${GameCard} game=${g} sub=${`${g.playing.toLocaleString()} playing · ${g.open} open`} />`)}</div>`}
    <//>
    <p class="xs faint mt-8">Game names and categories are used for reference only. STACKD isn't affiliated with or endorsed by any publisher.</p>
  </div>`;
}

export function GameDetail({ params, query, path }) {
  const { user } = useSession();
  const q = useRpc('games.get', { slug: params.slug });
  const tab = query.tab || 'compete';
  const [challenge, setChallenge] = useState(null);
  const [h2h, setH2H] = useState(false);
  if (q.loading && !q.data) return html`<div class="container page stack"><${Sk} h=${260} r="20" /><${Sk} h=${40} w="60%" /><${CardsSkeleton} n=${3} /></div>`;
  if (q.error) return html`<div class="container page"><${Empty} icon="alert" title="Game not found" body=${q.error.message} action=${html`<${Button} href="/app/games">All games<//>`} /></div>`;
  const g = q.data;
  const supportsH2H = g.modes.some((m) => m.types.includes('h2h'));
  const onMyPlatform = g.platforms.some((p) => user.platforms.includes(p));
  return html`<div class="container page">
    <${PlaySubnav} path=${path} />
    <a class="back" href="#/app/games"><${Icon} name="chevL" />Games</a>
    <section class="game-hero">
      <${GameArt} game=${g} size="hero" word=${false} />
      <div class="game-hero-copy">
        <div class="row wrap tight"><${Badge}>${CATEGORY[g.category]}<//>${g.platforms.map((p) => html`<${Badge} tone="outline">${PLATFORM[p]}<//>`)}</div>
        <h1 class="display" style="font-size:clamp(48px,8vw,104px);margin:10px 0 6px">${g.name}</h1>
        <p class="muted measure">${g.description}</p>
        <p class="xs muted mt-2">${g.developer} · <span class="heat">${g.playing.toLocaleString()} playing now</span></p>
      </div>
    </section>

    ${!onMyPlatform && html`<div class="mt-4"><${Notice} tone="warn" title="Not on your platforms">${g.name} runs on ${g.platforms.map((p) => PLATFORM[p]).join(', ')}. Add a platform in Settings to enter.<//></div>`}

    <div class="row wrap mt-6" style="gap:var(--s-3)">
      ${g.challengeTemplates.length > 0 && html`<${Button} icon="target" onClick=${() => setChallenge(g.challengeTemplates[0])}>Start a challenge<//>`}
      ${supportsH2H && html`<${Button} variant="secondary" icon="swords" onClick=${() => setH2H(true)}>Challenge a player<//>`}
      ${g.myScore && html`<span class="badge outline" style="height:34px;padding:0 12px">Your ${g.short} score <strong class="num" style="color:var(--text);margin-left:4px">${g.myScore.score}</strong></span>`}
    </div>

    <div class="mt-6"><${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[
      { value: 'compete', label: 'Compete', count: g.pools.length + g.h2h.length },
      { value: 'tournaments', label: 'Tournaments', count: g.tournaments.length },
      { value: 'leaders', label: 'Leaderboard' },
      { value: 'rules', label: 'Modes & rules' },
    ]} /></div>

    ${tab === 'compete' && html`<div>
      ${g.challengeTemplates.length > 0 && html`<${Section} title="Bet on yourself" sub="Multipliers adjust to your ${g.short} rating.">
        <div class="grid-3">${g.challengeTemplates.map((t) => html`<${ChallengeTile} t=${t} game=${g} onPick=${() => setChallenge(t)} />`)}</div>
      <//>`}
      <${Section} title="Squad pools">
        ${g.pools.length ? html`<div class="grid-3">${g.pools.map((c) => html`<${CompetitionCard} c=${c} />`)}</div>` : html`<${Empty} icon="users" title=${`No ${g.short} pools open right now`} body="Pools open through the day. Start a challenge or a head-to-head meanwhile." />`}
      <//>
      ${supportsH2H && html`<${Section} title="Open head-to-heads" action=${html`<${Button} size="sm" variant="secondary" icon="plus" onClick=${() => setH2H(true)}>New<//>`}>
        ${g.h2h.length ? html`<div class="grid-3">${g.h2h.map((c) => html`<${H2HCard} c=${c} />`)}</div>` : html`<${Empty} icon="swords" title="No open challenges" body="Be the first. Post an open challenge and someone at your level will pick it up." action=${html`<${Button} onClick=${() => setH2H(true)}>Post a challenge<//>`} />`}
      <//>`}
      ${g.missions.length > 0 && html`<${Section} title="Missions in ${g.short}"><div class="grid-3">${g.missions.map((m) => html`<${MissionCard} m=${m} />`)}</div><//>`}
    </div>`}

    ${tab === 'tournaments' && html`<div class="mt-6">${g.tournaments.length ? html`<div class="grid-3">${g.tournaments.map((t) => html`<${TournamentCard} t=${t} />`)}</div>` : html`<${Empty} icon="trophy" title="No tournaments scheduled" body=${`${g.short} cups get added weekly.`} />`}</div>`}

    ${tab === 'leaders' && html`<div class="card mt-6"><div class="list">
      ${g.leaders.map((u, i) => html`<${LeaderRow} position=${i + 1} user=${u} value=${u.gameScore} me=${u.id === user.id} />`)}
    </div></div>`}

    ${tab === 'rules' && html`<div class="split mt-6">
      <div class="stack">
        <div class="panel"><div class="panel-head"><span class="strong">Modes</span></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Mode</th><th>Format</th><th>Competitions</th><th>Tracked stats</th></tr></thead><tbody>
            ${g.modes.map((m) => html`<tr><td class="strong">${m.name}</td><td>${m.teamSize > 1 ? `Teams of ${m.teamSize}` : 'Solo'}, up to ${m.maxPlayers}</td><td>${m.types.map((t) => ({ challenge: 'Challenge', h2h: 'H2H', pool: 'Pool', tournament: 'Tournament' })[t]).join(', ')}</td><td class="muted">${m.metrics.map((x) => x.label).join(', ')}</td></tr>`)}
          </tbody></table></div>
        </div>
        <div class="card"><p class="strong mb-2">Rules</p><ul class="stack tight small">${g.rules.map((r) => html`<li class="row top tight"><${Icon} name="check" size="16" /><span>${r}</span></li>`)}</ul></div>
      </div>
      <div class="stack">
        <div class="card"><p class="strong mb-2">Eligibility</p><ul class="stack tight small">${g.eligibility.map((r) => html`<li class="row top tight"><${Icon} name="shield" size="16" /><span>${r}</span></li>`)}</ul></div>
        <div class="card"><p class="strong mb-2">How results are verified</p><p class="small muted">${g.verification.map((v) => ({ api: 'Game data', video: 'Video or VOD review', screenshot: 'Results screenshot', manual: 'Referee review' })[v]).join(' → ')}</p><p class="xs faint mt-2">If the first method isn't available for a match, the next one applies.</p></div>
        <p class="xs faint">${g.name} is a trademark of its owner. STACKD is not affiliated with ${g.developer}.</p>
      </div>
    </div>`}

    <${NewChallengeSheet} open=${!!challenge} template=${challenge} game=${g} templates=${g.challengeTemplates} onClose=${() => setChallenge(null)} />
    <${NewH2HSheet} open=${h2h} gameId=${g.id} onClose=${() => setH2H(false)} />
  </div>`;
}

export function ChallengeTile({ t, game, onPick }) {
  return html`<button type="button" class="card clickable ch-tile" onClick=${onPick}>
    <div class="row between"><span class="xs muted">${game?.short || t.game?.short} ${t.mode || game?.modes.find((m) => m.id === t.modeId)?.name || ''}</span><span class="mult">${t.multiplier}×</span></div>
    <p class="h3" style="margin:8px 0 10px">${t.title}</p>
    <p class="small muted">UGX 5,000 pays <strong class="money num">${money(Math.floor(5000 * t.multiplier))}</strong></p>
  </button>`;
}
