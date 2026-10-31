import { html, useState, useEffect } from '../../lib/preact.js';
import { useRpc, useAction, useSession } from '../hooks.js';
import { navigate, setQuery } from '../router.js';
import { Icon } from '../icons.js';
import { PlaySubnav } from '../components/shell.js';
import { Button, Badge, Tabs, Empty, Async, CardsSkeleton, Sk, PageHead, Notice, Sheet, Input, Textarea, Toggle, Who, Avatar, Rank, Menu, Confirm, ListSkeleton, Stat } from '../components/base.js';
import { TeamCard, TeamTag } from '../components/cards.js';
import { GameThumb } from '../components/game.js';
import { ago, ordinal, money, short } from '../format.js';

const COLORS = ['#FF6B3D', '#5B6CFF', '#3DDC97', '#FFB547', '#59A8FF', '#C77DFF', '#FF5468', '#2EC4B6', '#E9C46A', '#F2EFE6'];

function CreateTeamSheet({ open, onClose }) {
  const { user } = useSession();
  const games = useRpc('games.list', {}, { live: false, skip: !open });
  const [f, setF] = useState({ name: '', tag: '', color: COLORS[0], games: [], bio: '', open: true });
  const [err, setErr] = useState({});
  useEffect(() => {
    if (open) setF({ name: '', tag: '', color: COLORS[0], games: user.games.slice(0, 2), bio: '', open: true });
  }, [open]);
  const create = useAction('teams.create', { success: (t) => `${t.name} is live`, onSuccess: (t) => { onClose(); navigate(`/app/teams/${t.id}`); } });
  const check = () => {
    const e = {};
    if (f.name.trim().length < 3) e.name = 'At least 3 characters.';
    if (!/^[A-Za-z0-9]{2,5}$/.test(f.tag)) e.tag = '2–5 letters or numbers.';
    if (!f.games.length) e.games = 'Pick at least one game.';
    setErr(e);
    return !Object.keys(e).length;
  };
  const preview = { tag: (f.tag || 'TAG').toUpperCase(), color: f.color };
  return html`<${Sheet} open=${open} onClose=${onClose} title="Create a team" footer=${html`<${Button} size="lg" block loading=${create.pending} onClick=${() => check() && create.run({ ...f, bio: f.bio || undefined })}>Create team<//>`}>
    <div class="row"><${TeamTag} team=${preview} size=${64} /><div><p class="h3">${f.name || 'Your team'}</p><p class="xs muted">You'll be captain</p></div></div>
    <div class="form-grid">
      <${Input} label="Team name" value=${f.name} error=${err.name} maxlength="24" onInput=${(v) => setF({ ...f, name: v })} />
      <${Input} label="Tag" value=${f.tag} error=${err.tag} maxlength="5" hint="Shows on brackets and pools." onInput=${(v) => setF({ ...f, tag: v.toUpperCase() })} />
    </div>
    <div class="field"><span class="label">Colour</span><div class="row tight wrap" role="radiogroup" aria-label="Team colour">${COLORS.map((c) => html`<button type="button" role="radio" aria-checked=${f.color === c} aria-label=${c} onClick=${() => setF({ ...f, color: c })} style=${`width:30px;height:30px;border-radius:8px;background:${c};box-shadow:${f.color === c ? '0 0 0 2px var(--surface), 0 0 0 4px var(--text)' : 'none'}`}></button>`)}</div></div>
    <div class="field"><span class="label">Games you play as a team</span>
      <div class="chips" style="flex-wrap:wrap">${(games.data || []).map((g) => html`<button type="button" class="chip" aria-pressed=${f.games.includes(g.id) ? 'true' : 'false'} onClick=${() => setF({ ...f, games: f.games.includes(g.id) ? f.games.filter((x) => x !== g.id) : [...f.games, g.id].slice(0, 6) })}>${g.short}</button>`)}</div>
      ${err.games && html`<p class="error-msg">${err.games}</p>`}
    </div>
    <${Textarea} label="Bio" optional value=${f.bio} maxlength="120" onInput=${(v) => setF({ ...f, bio: v })} placeholder="Squad up or step aside." />
    <${Toggle} label="Open to join" hint="Anyone can join without an invite. Turn off to make it invite-only." checked=${f.open} onChange=${(v) => setF({ ...f, open: v })} />
  <//>`;
}

export function Teams({ path, query }) {
  const tab = query.tab || 'all';
  const [q, setQ] = useState('');
  const list = useRpc('teams.list', { q: q || undefined, mine: tab === 'mine' || undefined });
  const [create, setCreate] = useState(!!query.new);
  return html`<div class="container page">
    <${PlaySubnav} path=${path} />
    <${PageHead} title="Teams" sub="Build a STACK squad. Enter team pools and tournaments together, split the bag, climb the team ranking." actions=${html`<${Button} icon="plus" onClick=${() => setCreate(true)}>Create team<//>`} />
    <${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[{ value: 'all', label: 'All teams' }, { value: 'mine', label: 'Your teams' }]} />
    <div class="searchbox mt-4 mb-4" style="width:100%;max-width:420px"><${Icon} name="search" /><input class="input" type="search" placeholder="Search by name or tag" aria-label="Search teams" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} /></div>
    <${Async} q=${list} skeleton=${html`<${CardsSkeleton} n=${6} h=${200} />`}
      empty=${tab === 'mine' ? html`<${Empty} icon="users" title="You're not on a team yet" body="Create one and invite the crew, or join an open team." action=${html`<${Button} onClick=${() => setCreate(true)}>Create team<//>`} />` : html`<${Empty} icon="search" title="No teams match that" body="Try another name or tag." />`}>
      ${(l) => html`<div class="grid-3">${l.map((t) => html`<${TeamCard} t=${t} />`)}</div>`}
    <//>
    <${CreateTeamSheet} open=${create} onClose=${() => setCreate(false)} />
  </div>`;
}

function InviteSheet({ open, onClose, team }) {
  const [q, setQ] = useState('');
  const players = useRpc('players.list', { q: q || undefined }, { live: false, skip: !open });
  const invite = useAction('teams.invite', { success: 'Invite sent' });
  const ids = new Set([...team.members.map((m) => m.id), ...team.invites.map((i) => i.userId)]);
  return html`<${Sheet} open=${open} onClose=${onClose} title=${`Invite to ${team.name}`}>
    <${Input} label="Find a player" placeholder="Search by username" value=${q} onInput=${setQ} />
    ${players.loading ? html`<${ListSkeleton} n=${4} />` : html`<div class="list">${(players.data || []).slice(0, 12).map((p) => html`<div class="li">
      <${Who} user=${p} link=${false} />
      ${ids.has(p.id) ? html`<${Badge}>${team.members.some((m) => m.id === p.id) ? 'Member' : 'Invited'}<//>` : html`<${Button} size="sm" variant="secondary" loading=${invite.pending} onClick=${() => invite.run({ id: team.id, userId: p.id })}>Invite<//>`}
    </div>`)}</div>`}
  <//>`;
}

export function TeamDetail({ params }) {
  const { user } = useSession();
  const q = useRpc('teams.get', { id: params.id });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const join = useAction('teams.join', { success: 'Welcome to the squad', onSuccess: () => q.refresh() });
  const respond = useAction('teams.respond', { onSuccess: () => q.refresh() });
  const leave = useAction('teams.leave', { success: 'You left the team', onSuccess: () => navigate('/app/teams') });
  const setCap = useAction('teams.setCaptain', { success: 'Captain updated', onSuccess: () => q.refresh() });
  const remove = useAction('teams.removeMember', { success: 'Member removed', onSuccess: () => q.refresh() });
  const update = useAction('teams.update', { success: 'Team updated', onSuccess: () => q.refresh() });
  const t = q.data;
  if (q.loading && !t) return html`<div class="container page stack"><${Sk} h=${180} r="20" /><${Sk} h=${300} r="14" /></div>`;
  if (q.error) return html`<div class="container page"><${Empty} icon="alert" title="Team not found" body=${q.error.message} action=${html`<${Button} href="/app/teams">All teams<//>`} /></div>`;
  return html`<div class="container page">
    <a class="back" href="#/app/teams"><${Icon} name="chevL" />Teams</a>
    <section class="team-hero" style=${`--tc:${t.color}`}>
      <${TeamTag} team=${t} size=${96} />
      <div class="grow" style="min-width:0">
        <div class="row wrap tight"><${Badge}>Ranked #${t.ranking}<//><${Badge}>${t.open ? 'Open to join' : 'Invite only'}<//>${t.isMember && html`<${Badge} tone="solid">${t.isCaptain ? 'Captain' : 'Member'}<//>`}</div>
        <h1 class="display" style="font-size:clamp(44px,7vw,84px);margin:8px 0 4px">${t.name}</h1>
        ${t.bio && html`<p class="muted">${t.bio}</p>`}
      </div>
    </section>

    ${t.invited && html`<div class="mt-4"><${Notice} tone="info" title=${`${t.name} invited you`} action=${html`<div class="row tight"><${Button} size="sm" variant="ghost" onClick=${() => respond.run({ id: t.id, accept: false })}>Decline<//><${Button} size="sm" loading=${respond.pending} onClick=${() => respond.run({ id: t.id, accept: true })}>Join team<//></div>`}>Accept to enter team pools and tournaments with them.<//></div>`}

    <div class="stats card pad-lg mt-6" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
      <${Stat} value=${t.rating} label="Team rating" />
      <${Stat} value=${t.stats.wins} label="Wins" />
      <${Stat} value=${`${t.stats.winRate}%`} label="Win rate" />
      <${Stat} value=${t.stats.competitions} label="Competitions" />
      <${Stat} value=${short(t.stats.earnings)} label="UGX won" tone="money" />
    </div>

    <div class="split mt-6">
      <div class="stack">
        <div class="panel">
          <div class="panel-head"><span class="strong">Roster <span class="muted">${t.members.length}/8</span></span>
            <div class="row tight">
              ${t.isCaptain && html`<${Button} size="sm" icon="plus" onClick=${() => setInviteOpen(true)}>Invite<//>`}
              ${!t.isMember && t.open && !t.invited && html`<${Button} size="sm" loading=${join.pending} onClick=${() => join.run({ id: t.id })}>Join team<//>`}
            </div>
          </div>
          <div class="panel-body list">${t.members.map((m) => html`<div class="li">
            <${Who} user=${m} />
            ${m.role === 'captain' ? html`<${Badge} icon="crown">Captain<//>` : html`<span class="xs muted">${ago(m.joinedAt)}</span>`}
            ${t.isCaptain && m.id !== user.id && html`<${Menu} label="Member actions" trigger=${({ toggle }) => html`<button type="button" class="icon-btn sm" aria-label=${`Actions for ${m.username}`} onClick=${(e) => { e.stopPropagation(); toggle(); }}><${Icon} name="more" /></button>`}>
              <button type="button" role="menuitem" onClick=${() => setCap.run({ id: t.id, userId: m.id })}><${Icon} name="crown" />Make captain</button>
              <button type="button" role="menuitem" onClick=${() => remove.run({ id: t.id, userId: m.id })}><${Icon} name="x" />Remove from team</button>
            <//>`}
          </div>`)}</div>
          ${t.isCaptain && t.invites.length > 0 && html`<div class="panel-body" style="border-top:1px solid var(--border)"><p class="xs muted mb-2">Pending invites</p>${t.invites.map((i) => html`<div class="li"><${Who} user=${i.user} /><span class="xs muted">${ago(i.at)}</span></div>`)}</div>`}
        </div>
        ${t.isMember && html`<div class="row wrap">
          ${t.isCaptain && html`<${Button} variant="secondary" size="sm" onClick=${() => update.run({ id: t.id, open: !t.open })}>${t.open ? 'Make invite-only' : 'Open to anyone'}<//>`}
          <${Button} variant="ghost" size="sm" onClick=${() => setLeaveOpen(true)}>Leave team<//>
        </div>`}
      </div>
      <div class="stack">
        <div class="card"><p class="strong mb-2">Plays</p><div class="row wrap">${t.games.map((g) => html`<a class="row tight" href=${`#/app/games/${g.slug}`}><${GameThumb} game=${g} size=${32} /><span class="small strong">${g.short}</span></a>`)}</div></div>
        <div class="card"><p class="strong mb-2">Recent results</p>${t.recent.length ? html`<div class="list">${t.recent.map((r) => html`<div class="li"><span class=${`pos p${r.place}`}>${r.place}</span><div class="grow"><p class="li-title">${r.label}</p><p class="li-sub">${ordinal(r.place)} of ${r.field} · ${ago(r.at)}</p></div></div>`)}</div>` : html`<p class="small muted">No results yet. Enter a team pool together.</p>`}</div>
        ${t.isMember && html`<${Button} variant="secondary" href="/app/play" icon="users">Find a team pool<//>`}
      </div>
    </div>
    ${t.isCaptain && html`<${InviteSheet} open=${inviteOpen} onClose=${() => { setInviteOpen(false); q.refresh(); }} team=${t} />`}
    <${Confirm} open=${leaveOpen} onClose=${() => setLeaveOpen(false)} pending=${leave.pending} title=${`Leave ${t.name}?`} body=${t.isCaptain && t.members.length > 1 ? 'Hand the captaincy to someone first, then you can leave.' : "You can rejoin later if it's open, or with an invite."} confirmLabel="Leave team" tone="danger" onConfirm=${() => leave.run({ id: t.id })} />
  </div>`;
}
