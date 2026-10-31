import { html } from '../../lib/preact.js';
import { useRpc, useAction, useSession } from '../hooks.js';
import { navigate } from '../router.js';
import { Icon } from '../icons.js';
import { Button, Section, Badge, Avatar, Rank, Progress, Sk, CardsSkeleton, ErrorBox, Countdown, BigMoney, Notice } from '../components/base.js';
import { GameCard, GameArt, GameThumb } from '../components/game.js';
import { CompetitionCard, TournamentCard, MissionCard, StackCard, H2HCard, LeaderRow } from '../components/cards.js';
import { money, short, ago, KIND, PLATFORM, FORMAT } from '../format.js';
import { BigStackBanner } from './bigstack.js';

function LiveTile({ item }) {
  const c = item.item;
  const isT = item.type === 'tournament';
  const href = isT ? `/app/tournaments/${c.id}` : `/app/compete/${c.id}`;
  return html`<a class="live-tile" href=${'#' + href}>
    <${GameArt} game=${c.game} size="banner" word=${false} cls="live-art" />
    <div class="live-body">
      <div class="row between"><${Badge} tone="live">Live<//><span class="xs muted">${isT ? FORMAT[c.format] : c.kind === 'h2h' ? 'Head-to-head' : `${c.players} players`}</span></div>
      <p class="strong truncate mt-2">${isT ? c.name : c.kind === 'h2h' ? `${c.h2h?.challenger?.username} vs ${c.h2h?.opponent?.username}` : c.title}</p>
      <p class="xs muted truncate">${c.game?.short} ${c.mode?.name || ''}</p>
      <p class="num strong money mt-2">${money(isT ? c.pool?.net : c.kind === 'h2h' ? c.payout : c.pool?.net)}</p>
    </div>
  </a>`;
}

function UpNext({ items, invites }) {
  const accept = useAction('competitions.join', { success: 'Challenge accepted', onSuccess: (r) => navigate(`/app/match/${r.matchId}`) });
  if (!items.length && !invites.length) return null;
  return html`<${Section} title="You're up" id="upnext">
    <div class="stack tight">
      ${invites.map((t) => html`<a class="card clickable row" href=${`#/app/teams/${t.id}`}>
        <span style=${`width:36px;height:36px;border-radius:10px;background:${t.color};display:grid;place-items:center;color:#0c0d10;font-weight:900;font-size:13px`}>${t.tag}</span>
        <div class="grow"><p class="strong small">${t.name} invited you</p><p class="xs muted">Join the squad to enter team pools together</p></div>
        <${Icon} name="chevR" />
      </a>`)}
      ${items.map(({ type, item: c }) => {
        if (type === 'incoming') return html`<div class="card row wrap" style="gap:var(--s-3)">
          <${GameThumb} game=${c.game} />
          <div class="grow" style="min-width:180px"><p class="strong small">${c.h2h.challenger.username} challenged you</p><p class="xs muted">${c.game.short} ${c.mode.name} for ${money(c.entry)}. Winner takes ${money(c.payout)}.</p></div>
          <div class="row tight"><${Button} size="sm" variant="secondary" href=${`/app/compete/${c.id}`}>View<//><${Button} size="sm" loading=${accept.pending} onClick=${() => accept.run({ id: c.id })}>Accept<//></div>
        </div>`;
        if (type === 'tournament') return html`<a class="card clickable row" href=${`#/app/tournaments/${c.id}`}>
          <${GameThumb} game=${c.game} />
          <div class="grow"><p class="strong small">${c.name}</p><p class="xs muted">${c.status === 'live' ? 'Live now. Your match may be ready.' : html`<${Countdown} to=${c.startsAt} />`}</p></div>
          ${c.status === 'live' ? html`<${Badge} tone="live">Live<//>` : html`<${Badge}>Registered<//>`}
        </a>`;
        const live = ['live', 'verifying', 'disputed'].includes(c.status);
        return html`<a class="card clickable row" href=${live && c.matchId ? `#/app/match/${c.matchId}` : `#/app/compete/${c.id}`}>
          <${GameThumb} game=${c.game} />
          <div class="grow"><p class="strong small">${c.kind === 'h2h' ? `${c.h2h?.challenger?.username} vs ${c.h2h?.opponent?.username || 'waiting for opponent'}` : c.title}</p><p class="xs muted">${KIND[c.kind]} · ${c.status === 'open' ? (c.kind === 'h2h' ? 'Waiting for someone to accept' : html`<${Countdown} to=${c.startsAt} />`) : c.status === 'verifying' ? 'Result in review' : c.status === 'disputed' ? 'With a referee' : 'Match is live. Report when done.'}</p></div>
          ${live ? html`<${Badge} tone=${c.status === 'live' ? 'live' : 'warn'}>${c.status === 'live' ? 'Play' : 'Review'}<//>` : html`<${Icon} name="chevR" />`}
        </a>`;
      })}
    </div>
  <//>`;
}

function Rail({ q, render, skeletonH = 220, empty }) {
  if (q.loading && !q.data) return html`<div class="rail">${[1, 2, 3, 4].map(() => html`<${Sk} h=${skeletonH} r="14" />`)}</div>`;
  if (q.error) return html`<${ErrorBox} error=${q.error} retry=${q.reload} />`;
  const items = render();
  if (!items.length) return empty || null;
  return html`<div class="rail">${items}</div>`;
}

export default function Home() {
  const { user } = useSession();
  const q = useRpc('home.get');
  const bs = useRpc('bigstack.get');
  const d = q.data;
  const me = d?.stack.me;

  const rail = html`<aside class="stack" style="gap:var(--s-5)">
    ${d ? html`<${StackCard} wallet=${d.stack.wallet} compact />` : html`<${Sk} h=${280} r="14" />`}
    ${me && html`<a class="card clickable stack" href="#/app/profile" style="gap:var(--s-3)">
      <div class="row between"><span class="strong small">STACK Score</span><${Rank} rank=${me.rank} /></div>
      <div class="row between" style="align-items:flex-end">
        <span class="big-num" style="font-size:52px">${me.stackScore.toLocaleString()}</span>
        <div style="text-align:right"><p class="big-num heat" style="font-size:28px">${me.stats.streak}</p><p class="xs muted">${me.stats.streak >= 3 ? 'On a run' : 'Win streak'}</p></div>
      </div>
      ${me.rank.next && html`<${Progress} value=${me.rank.progress} label="Progress to next rank" /><p class="xs muted">${me.rank.nextAt - me.stackScore} to ${me.rank.next} · #${d.stack.position} overall</p>`}
    </a>`}
    <div class="card desk-only">
      <div class="row between mb-2"><span class="strong small">Top players</span><a class="text-btn" href="#/app/leaderboards">All<${Icon} name="chevR" /></a></div>
      <div class="list">${(d?.topPlayers || []).map((u, i) => html`<${LeaderRow} position=${i + 1} user=${u} value=${u.stackScore} />`)}</div>
    </div>
    <div class="card desk-only">
      <p class="strong small mb-2">Recent winners</p>
      <div class="list">${(d?.winners || []).slice(0, 6).map((w) => html`<div class="li"><${Avatar} user=${w.user} size="sm" online=${false} /><div class="grow" style="min-width:0"><p class="small strong truncate">${w.user.username}</p><p class="xs muted truncate">${w.text}</p></div><span class="num strong money small">+${short(w.amount)}</span></div>`)}</div>
    </div>
  </aside>`;

  return html`<div class="container page">
    <div class="with-rail">
      <div style="min-width:0">
        <section class="home-hero">
          <div class="home-hero-art" aria-hidden="true">${d?.games?.slice(0, 3).map((g) => html`<${GameArt} game=${g} word=${false} />`)}</div>
          <div class="home-hero-copy">
            <p class="small muted">${greeting()}, ${user?.username}</p>
            <h1 class="display" style="font-size:clamp(64px,11vw,128px)">Play for the bag.</h1>
            <p class="h3" style="font-weight:600;color:var(--muted)">Compete in the games you already play.</p>
            <div class="row wrap mt-4" style="gap:var(--s-3)">
              <a class="btn btn-primary btn-brand" href="#/app/play">Play now</a>
              <a class="btn btn-secondary btn-lg" href="#/app/games">Explore games</a>
            </div>
          </div>
        </section>

        ${bs.data && html`<div class="mt-6"><${BigStackBanner} b=${bs.data} /></div>`}
        ${q.error && html`<div class="mt-6"><${ErrorBox} error=${q.error} retry=${q.reload} /></div>`}
        ${d && html`<${UpNext} items=${d.upNext} invites=${d.teamInvites} />`}

        <${Section} title="Live now" sub="Matches happening right now" id="live">
          <${Rail} q=${q} skeletonH=${150} render=${() => (d?.live || []).map((it) => html`<${LiveTile} item=${it} />`)} empty=${html`<p class="muted small">Nothing live this second. Lobbies lock every few minutes.</p>`} />
        <//>

        <${Section} title="Popular on mobile" action=${{ label: 'All games', href: '/app/games' }} id="games">
          ${q.loading && !d ? html`<div class="rail games">${[1, 2, 3, 4, 5, 6].map(() => html`<${Sk} h=${240} r="14" />`)}</div>` : html`<div class="rail games">${(d?.games || []).map((g) => html`<${GameCard} game=${g} />`)}</div>`}
        <//>

        <${Section} title="Big pools" sub="Biggest pools filling now" action=${{ label: 'All pools', href: '/app/play' }} id="featured">
          ${q.loading && !d ? html`<${CardsSkeleton} n=${3} h=${300} />` : html`<div class="grid-3">${(d?.featured || []).slice(0, 6).map((c) => html`<${CompetitionCard} c=${c} />`)}</div>`}
        <//>

        <${Section} title="Tournaments" action=${{ label: 'All tournaments', href: '/app/tournaments' }} id="tournaments">
          <${Rail} q=${q} skeletonH=${300} render=${() => (d?.tournaments || []).map((t) => html`<${TournamentCard} t=${t} />`)} />
        <//>

        <${Section} title="Stack Missions" sub="Sponsored. Complete them in-game, get rewarded." action=${{ label: 'All missions', href: '/app/missions' }} id="missions">
          <${Rail} q=${q} skeletonH=${300} render=${() => (d?.missions || []).map((m) => html`<${MissionCard} m=${m} />`)} />
        <//>

        <div class="mob-only">
          <${Section} title="Top players" action=${{ label: 'Leaderboards', href: '/app/leaderboards' }}>
            <div class="card"><div class="list">${(d?.topPlayers || []).map((u, i) => html`<${LeaderRow} position=${i + 1} user=${u} value=${u.stackScore} />`)}</div></div>
          <//>
          <${Section} title="Recent winners">
            <div class="card"><div class="list">${(d?.winners || []).slice(0, 6).map((w) => html`<div class="li"><${Avatar} user=${w.user} size="sm" online=${false} /><div class="grow" style="min-width:0"><p class="small strong truncate">${w.user.username}</p><p class="xs muted truncate">${w.text}</p></div><span class="num strong money small">+${short(w.amount)}</span></div>`)}</div></div>
          <//>
          <${Section} title="Your stack">${rail}<//>
        </div>
      </div>
      <div class="desk-only">${rail}</div>
    </div>
  </div>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}
