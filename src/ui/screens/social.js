import { html, useState, useEffect } from '../../lib/preact.js';
import { useRpc, useAction, useSession, useMeta, toast } from '../hooks.js';
import { navigate, setQuery } from '../router.js';
import { Icon } from '../icons.js';
import { Button, Badge, Seg, Chips, Tabs, Empty, Async, Sk, PageHead, Notice, Avatar, Rank, Progress, Stat, Select, Sheet, Textarea, ListSkeleton, FormDots, Who, Section } from '../components/base.js';
import { LeaderRow, Achievement, NotificationItem, MatchRow, TeamTag, TournamentCard } from '../components/cards.js';
import { GameCard, GameThumb } from '../components/game.js';
import { NewH2HSheet } from './compete.js';
import { money, short, num, ago, ordinal, PLATFORM, when } from '../format.js';

// ---- Leaderboards -----------------------------------------------------------------------------
const SCOPES = [['global', 'Global'], ['country', 'Country'], ['region', 'Region'], ['game', 'Game'], ['platform', 'Platform'], ['season', 'Season'], ['friends', 'Friends'], ['team', 'My team'], ['teams', 'Teams']];
const METRICS = [['score', 'STACK Score'], ['wins', 'Wins'], ['winRate', 'Win rate'], ['competitions', 'Competitions'], ['earnings', 'Winnings'], ['streak', 'Streak'], ['tournaments', 'Tournament wins']];

function TeamBoard({ d, fmt }) {
  return html`<div class="card"><div class="list">${d.rows.map((r) => html`<a class="li clickable" href=${`#/app/teams/${r.team.id}`} style=${r.mine ? 'background:var(--secondary-soft);margin:0 -12px;padding:12px;border-radius:10px' : ''}>
    <span class=${`pos p${r.position}`}>${r.position}</span>
    <${TeamTag} team=${r.team} size=${36} />
    <div class="grow" style="min-width:0"><p class="li-title truncate">${r.team.name}${r.mine ? html` <span class="xs muted">(your team)</span>` : ''}</p><p class="li-sub">${r.team.wins}W · ${r.team.winRate}% · ${r.team.competitions} comps · rating ${r.team.rating}</p></div>
    <span class="big-num" style="font-size:24px">${fmt(r.value)}</span>
  </a>`)}</div></div>`;
}

export function Leaderboards({ query }) {
  const { user } = useSession();
  const meta = useMeta().data;
  const scope = query.scope || 'global';
  const metric = query.metric || 'score';
  const gameId = query.game || user.games[0];
  const platform = query.platform || 'mobile';
  const games = useRpc('games.list', {}, { live: false });
  const q = useRpc('leaderboards.get', { scope, metric, gameId: scope === 'game' ? gameId : undefined, platform: scope === 'platform' ? platform : undefined });
  const fmt = (v) => (metric === 'winRate' ? `${v}%` : metric === 'earnings' ? short(v) : num(v));
  const label = scope === 'season' && metric === 'score' ? 'Season points' : METRICS.find((m) => m[0] === metric)[1];
  return html`<div class="container page">
    <${PageHead} title="Leaderboards" sub=${scope === 'season' ? `${meta?.season?.name || 'Season'} ends ${meta ? when(meta.season.endsAt) : ''}.` : 'Where you stand. Updated after every verified result.'} />
    <div class="stack" style="gap:var(--s-3)">
      <${Seg} label="Scope" value=${scope} onChange=${(v) => setQuery({ scope: v })} options=${SCOPES.map(([value, l]) => ({ value, label: l }))} />
      <div class="row wrap">
        <${Chips} label="Metric" value=${metric} onChange=${(v) => setQuery({ metric: v })} options=${METRICS.map(([value, l]) => ({ value, label: l }))} />
      </div>
      ${scope === 'game' && html`<div style="max-width:320px"><${Select} label="Game" value=${gameId} onChange=${(v) => setQuery({ game: v })} options=${(games.data || []).map((g) => ({ value: g.id, label: g.name }))} /></div>`}
      ${scope === 'platform' && html`<${Seg} label="Platform" value=${platform} onChange=${(v) => setQuery({ platform: v })} options=${Object.entries(PLATFORM).map(([value, l]) => ({ value, label: l }))} />`}
    </div>
    <div class="mt-6">
      <${Async} q=${q} skeleton=${html`<${ListSkeleton} n=${8} />`}>
        ${(d) => (scope === 'teams' ? (d.rows.length ? html`<${TeamBoard} d=${d} fmt=${fmt} />` : html`<${Empty} icon="users" title="No teams yet" body="Create one from Teams." />`) : d.rows.length ? html`<div class="split">
          <div class="stack">
            <div class="podium">${d.rows.slice(0, 3).map((r) => html`<a class=${`pod p${r.position}`} href=${`#/app/u/${encodeURIComponent(r.user.username)}`}>
              <span class=${`pos p${r.position}`} style="font-size:30px;width:auto">${r.position}</span>
              <${Avatar} user=${r.user} size="lg" online=${false} />
              <p class="strong truncate" style="max-width:100%">${r.user.username}</p>
              <p class="big-num" style="font-size:28px">${fmt(r.value)}</p>
            </a>`)}</div>
            <div class="card"><div class="list">${d.rows.slice(3).map((r) => html`<${LeaderRow} position=${r.position} user=${r.user} value=${fmt(r.value)} me=${r.user.id === user.id} />`)}</div></div>
          </div>
          <aside class="stack">
            ${d.me ? html`<div class="card pad-lg stack" style="position:sticky;top:calc(var(--topbar-h) + 24px)">
              <p class="small muted">Your position</p>
              <div class="row between" style="align-items:flex-end"><span class="big-num" style="font-size:72px">#${d.me.position}</span><span class="small muted">of ${d.total}</span></div>
              <p class="small">${label}: <strong class="num">${fmt(d.me.value)}</strong></p>
              ${d.me.position > 1 && html`<p class="xs muted">${fmt(Math.abs(d.rows[Math.max(0, Math.min(d.rows.length, d.me.position - 1) - 1)]?.value - d.me.value) || 0)} behind #${d.me.position - 1}</p>`}
              <${Button} href="/app/play" icon="play">Climb it<//>
            </div>` : html`<${Notice} tone="info">You're not on this board yet. Play a few matches.<//>`}
          </aside>
        </div>` : html`<${Empty} icon="chart" title="Nobody here yet" body=${scope === 'friends' ? 'Add friends from their profiles to compare.' : 'Try another scope.'} />`)}
      <//>
    </div>
  </div>`;
}

// ---- Profile ------------------------------------------------------------------------------------
function ReportSheet({ open, onClose, target }) {
  const [reason, setReason] = useState('cheating');
  const [details, setDetails] = useState('');
  const send = useAction('reports.create', { success: 'Report sent to the fair play team', onSuccess: onClose });
  return html`<${Sheet} open=${open} onClose=${onClose} title=${`Report ${target?.username}`} footer=${html`<${Button} block size="lg" loading=${send.pending} disabled=${details.trim().length < 10} onClick=${() => send.run({ userId: target.id, reason, details })}>Send report<//>`}>
    <p class="small muted">Reports are confidential. The fair play team reviews match history, telemetry and evidence.</p>
    <${Select} label="Reason" value=${reason} onChange=${setReason} options=${[{ value: 'cheating', label: 'Cheating or hacks' }, { value: 'smurfing', label: 'Smurfing (playing below their level)' }, { value: 'collusion', label: 'Collusion or match fixing' }, { value: 'abuse', label: 'Abuse or harassment' }, { value: 'other', label: 'Something else' }]} />
    <${Textarea} label="What happened" value=${details} onInput=${setDetails} hint="10 characters or more. Include match IDs if you have them." />
  <//>`;
}

export function Profile({ params, query, path }) {
  const { user } = useSession();
  const meta = useMeta().data;
  const username = params.username || user.username;
  const q = useRpc('players.get', { username });
  const games = useRpc('games.list', {}, { live: false });
  const tab = query.tab || 'overview';
  const [challenge, setChallenge] = useState(false);
  const [report, setReport] = useState(false);
  const friend = useAction('social.friendRequest', { success: (r) => (r.status === 'friends' ? "You're friends now" : 'Friend request sent'), onSuccess: () => q.refresh() });
  const follow = useAction('social.follow', { onSuccess: () => q.refresh() });
  if (q.loading && !q.data) return html`<div class="container page stack"><${Sk} h=${280} r="20" /><${Sk} h=${200} r="14" /></div>`;
  if (q.error) return html`<div class="container page"><${Empty} icon="user" title="Player not found" body=${q.error.message} action=${html`<${Button} href="/app/leaderboards">Leaderboards<//>`} /></div>`;
  const { user: p, matches, teams, tournaments, relationship: rel, drops } = q.data;
  const isMe = rel?.isMe;
  const earned = new Map(p.achievements.map((a) => [a.id, a]));
  const gameMap = new Map((games.data || []).map((g) => [g.id, g]));
  const share = async () => {
    const text = `${p.username} on STACKD: ${p.rank.name}, ${p.stackScore} STACK Score, ${p.stats.winRate}% win rate.`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast.ok('Profile copied');
      }
    } catch {
      /* dismissed */
    }
  };
  return html`<div class="container page">
    <section class="id-card">
      <div class="id-top">
        <${Avatar} user=${p} size="xl" />
        <div class="grow" style="min-width:0">
          <div class="row wrap tight"><${Rank} rank=${p.rank} />${p.verified && html`<${Badge} icon="shield">Verified<//>`}${p.stats.streak >= 3 && html`<${Badge} tone="live">On a run<//>`}</div>
          <h1 class="display id-name">${p.username}</h1>
          <p class="small muted">${p.countryName} · Member since ${new Date(p.createdAt).toLocaleDateString([], { month: 'short', year: 'numeric' })}${p.platforms.length ? ` · ${p.platforms.map((x) => PLATFORM[x]).join(', ')}` : ''}</p>
          ${p.bio && html`<p class="mt-2">${p.bio}</p>`}
        </div>
      </div>
      <div class="id-stats">
        <div><p class="id-v">${p.stackScore.toLocaleString()}</p><p class="id-l">STACK Score</p></div>
        <div><p class="id-v rank-${p.rank.id}">${p.rank.name}</p><p class="id-l">Rank</p></div>
        <div><p class="id-v">${p.stats.winRate}%</p><p class="id-l">Win rate</p></div>
        <div><p class="id-v heat">${p.stats.streak}</p><p class="id-l">Streak</p></div>
      </div>
      ${p.rank.next && html`<div class="stack tight"><${Progress} value=${p.rank.progress} label="Rank progress" /><p class="xs muted">${p.rank.nextAt - p.stackScore} to ${p.rank.next}. Peak ${p.peakScore}.</p></div>`}
      <div class="row wrap" style="gap:var(--s-2)">
        ${isMe ? html`<${Button} variant="secondary" icon="edit" href="/app/settings">Edit profile<//><${Button} variant="secondary" icon="share" onClick=${share}>Share<//><${Button} variant="ghost" icon="bell" href="/app/notifications">Notifications<//>`
          : html`<${Button} icon="swords" onClick=${() => setChallenge(true)}>Challenge<//>
            ${rel?.friend ? html`<${Button} variant="secondary" icon="check" disabled>Friends<//>` : rel?.requested ? html`<${Button} variant="secondary" disabled>Request sent<//>` : html`<${Button} variant="secondary" icon="plus" loading=${friend.pending} onClick=${() => friend.run({ userId: p.id })}>${rel?.incoming ? 'Accept friend request' : 'Add friend'}<//>`}
            <${Button} variant="ghost" loading=${follow.pending} onClick=${() => follow.run({ userId: p.id, follow: !rel?.following })}>${rel?.following ? 'Following' : 'Follow'}<//>
            <${Button} variant="ghost" icon="flag" onClick=${() => setReport(true)}>Report<//>`}
      </div>
    </section>

    <div class="mt-6"><${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[
      { value: 'overview', label: 'Overview' },
      { value: 'achievements', label: 'Achievements', count: p.achievements.length },
      { value: 'teams', label: 'Teams', count: teams.length },
      { value: 'tournaments', label: 'Tournaments', count: tournaments.length },
      ...(isMe ? [{ value: 'drops', label: 'Drops', count: drops.length }] : []),
    ]} /></div>

    ${tab === 'overview' && html`<div class="split mt-6">
      <div class="stack">
        <div class="card"><p class="strong mb-2">Recent results</p>${matches.length ? html`<div class="list">${matches.map((m) => html`<${MatchRow} m=${m} />`)}</div>` : html`<p class="small muted">No results yet.</p>`}</div>
      </div>
      <div class="stack">
        <div class="card stats" style="grid-template-columns:repeat(3,1fr)">
          <${Stat} size="sm" value=${num(p.stats.matches)} label="Matches" />
          <${Stat} size="sm" value=${num(p.stats.wins)} label="Wins" />
          <${Stat} size="sm" value=${p.stats.bestStreak} label="Best streak" />
          <${Stat} size="sm" value=${p.stats.tournamentWins} label="Cups won" />
          <${Stat} size="sm" value=${p.stats.mvps} label="MVPs" />
          <${Stat} size="sm" value=${short(p.stats.earnings)} label="UGX won" tone="money" />
        </div>
        <div class="card"><div class="row between mb-2"><p class="strong">Games</p><${FormDots} form=${p.form} n=${10} /></div>
          <div class="list">${p.games.map((id) => {
            const g = gameMap.get(id);
            const s = p.gameScores[id];
            if (!g) return null;
            return html`<a class="li clickable" href=${`#/app/games/${g.slug}`}><${GameThumb} game=${g} size=${36} /><div class="grow"><p class="li-title">${g.name}</p><p class="li-sub">${s ? `${s.matches} matches, ${s.wins} wins` : 'No matches yet'}</p></div><span class="big-num" style="font-size:22px">${s?.score ?? '—'}</span></a>`;
          })}</div>
        </div>
        ${Object.keys(p.inGameIds || {}).length > 0 && html`<div class="card"><p class="strong mb-2">In-game IDs</p><dl class="kv">${Object.entries(p.inGameIds).filter(([, v]) => v).map(([k, v]) => html`<dt>${gameMap.get(k)?.short || k}</dt><dd>${v}</dd>`)}</dl></div>`}
      </div>
    </div>`}

    ${tab === 'achievements' && html`<div class="grid-4 mt-6">${(meta?.achievements || []).map((d) => html`<${Achievement} def=${d} earned=${earned.get(d.id)} />`)}</div>`}
    ${tab === 'teams' && html`<div class="mt-6">${teams.length ? html`<div class="grid-3">${teams.map((t) => html`<a class="card clickable row" href=${`#/app/teams/${t.id}`}><${TeamTag} team=${t} /><div class="grow"><p class="strong">${t.name}</p><p class="xs muted">${t.role === 'captain' ? 'Captain' : 'Member'}</p></div></a>`)}</div>` : html`<${Empty} icon="users" title="No team yet" body=${isMe ? 'Create one or join an open team.' : `${p.username} plays solo for now.`} action=${isMe && html`<${Button} href="/app/teams">Find a team<//>`} />`}</div>`}
    ${tab === 'tournaments' && html`<div class="mt-6">${tournaments.length ? html`<div class="card"><div class="list">${tournaments.map((t) => html`<a class="li clickable" href=${`#/app/tournaments/${t.id}`}><span class=${`pos p${t.place}`}>${t.place || '—'}</span><div class="grow"><p class="li-title">${t.name}</p><p class="li-sub">${t.place ? `${ordinal(t.place)} of ${t.entrants}` : `Out of ${t.entrants}`} · ${ago(t.at)}</p></div></a>`)}</div></div>` : html`<${Empty} icon="trophy" title="No tournaments yet" body="Completed tournaments show up here." />`}</div>`}
    ${tab === 'drops' && html`<div class="mt-6">${drops.length ? html`<div class="grid-3">${drops.map((d) => html`<div class="card"><p class="strong">${d.label}</p><p class="num small mt-2">${d.code}</p><p class="xs muted">${ago(d.at)}</p></div>`)}</div>` : html`<${Empty} icon="gift" title="No drops yet" body="Complete missions to collect sponsor rewards." action=${html`<${Button} href="/app/missions">Missions<//>`} />`}</div>`}

    ${!isMe && html`<${NewH2HSheet} open=${challenge} onClose=${() => setChallenge(false)} opponent=${p} gameId=${p.games.find((g) => user.games.includes(g)) || p.games[0]} />`}
    ${!isMe && html`<${ReportSheet} open=${report} onClose=${() => setReport(false)} target=${p} />`}
  </div>`;
}

// ---- Search ---------------------------------------------------------------------------------------
export function Search({ query }) {
  const [term, setTerm] = useState(query.q || '');
  useEffect(() => setTerm(query.q || ''), [query.q]);
  const q = useRpc('search.all', { q: query.q || 'x' }, { live: false, skip: !query.q });
  const d = q.data;
  const total = d ? d.games.length + d.players.length + d.teams.length + d.tournaments.length + d.competitions.length : 0;
  return html`<div class="container page">
    <${PageHead} title="Search" />
    <form class="row" role="search" onSubmit=${(e) => { e.preventDefault(); setQuery({ q: term.trim() }); }}>
      <div class="searchbox grow" style="width:auto"><${Icon} name="search" /><input class="input" type="search" placeholder="Players, games, teams, tournaments" aria-label="Search" value=${term} onInput=${(e) => setTerm(e.currentTarget.value)} data-autofocus autofocus /></div>
      <${Button} type="submit">Search<//>
    </form>
    <div class="mt-6">
      ${!query.q ? html`<${Empty} icon="search" title="Find anyone, anything" body="Search players by tag, games by name, teams by tag." />`
        : q.loading ? html`<${ListSkeleton} />`
        : !total ? html`<${Empty} icon="search" title=${`No results for "${query.q}"`} body="Check the spelling or try a shorter search." />`
        : html`<div class="stack loose">
          ${d.players.length > 0 && html`<div><p class="strong mb-2">Players</p><div class="card"><div class="list">${d.players.map((p) => html`<div class="li"><${Who} user=${p} /></div>`)}</div></div></div>`}
          ${d.games.length > 0 && html`<div><p class="strong mb-2">Games</p><div class="games-grid">${d.games.map((g) => html`<${GameCard} game=${g} />`)}</div></div>`}
          ${d.teams.length > 0 && html`<div><p class="strong mb-2">Teams</p><div class="grid-3">${d.teams.map((t) => html`<a class="card clickable row" href=${`#/app/teams/${t.id}`}><${TeamTag} team=${t} /><div><p class="strong">${t.name}</p><p class="xs muted">${t.members} members</p></div></a>`)}</div></div>`}
          ${d.tournaments.length > 0 && html`<div><p class="strong mb-2">Tournaments</p><div class="grid-3">${d.tournaments.map((t) => html`<${TournamentCard} t=${t} />`)}</div></div>`}
          ${d.competitions.length > 0 && html`<div><p class="strong mb-2">Pools</p><div class="card"><div class="list">${d.competitions.map((c) => html`<a class="li clickable" href=${`#/app/compete/${c.id}`}><${GameThumb} game=${c.game} size=${36} /><div class="grow"><p class="li-title">${c.title}</p><p class="li-sub">${c.players}/${c.maxPlayers} players</p></div></a>`)}</div></div></div>`}
        </div>`}
    </div>
  </div>`;
}

// ---- Notifications --------------------------------------------------------------------------------
export function Notifications({ query }) {
  const tab = query.tab || 'all';
  const q = useRpc('notifications.list', {});
  const read = useAction('notifications.read', { quiet: true, onSuccess: () => q.refresh() });
  const list = (q.data || []).filter((n) => tab === 'all' || !n.read);
  return html`<div class="container page" style="max-width:820px">
    <${PageHead} title="Notifications" actions=${html`<${Button} variant="secondary" size="sm" icon="check" loading=${read.pending} onClick=${() => read.run({ all: true })}>Mark all read<//>`} />
    <${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: (q.data || []).filter((n) => !n.read).length }]} />
    <div class="mt-4">
      <${Async} q=${q}>
        ${() => (list.length ? html`<div class="panel"><div class="list">${list.map((n) => html`<${NotificationItem} n=${n} onOpen=${() => !n.read && read.run({ id: n.id })} />`)}</div></div>`
          : html`<${Empty} icon="bell" title=${tab === 'unread' ? "You're all caught up" : 'Nothing yet'} body="Challenges, results, payouts and invites show up here." />`)}
      <//>
    </div>
  </div>`;
}
