import { html, useState, useEffect, useMemo } from '../../lib/preact.js';
import { useRpc, useAction, useSession, toast } from '../hooks.js';
import { navigate, setQuery } from '../router.js';
import { rpc } from '../../client/api.js';
import { Icon } from '../icons.js';
import { PlaySubnav } from '../components/shell.js';
import {
  Button, Badge, Seg, Chips, Tabs, Section, Empty, Async, CardsSkeleton, Sk, PageHead, Notice, Who, Avatar, Rank, BigMoney,
  Sheet, Select, Input, Textarea, AmountPicker, Countdown, Progress, Confirm, ListSkeleton,
} from '../components/base.js';
import { GameArt, GameThumb } from '../components/game.js';
import { H2HCard, PrizeBreakdown, StatusBadge } from '../components/cards.js';
import { ChallengeTile } from './play.js';
import { StakeInput, FitMoney } from '../components/stake.js';
import { money, short, PLATFORM, MODEL, H2H_TYPE, STATUS, ordinal, ago, when, opLabel } from '../format.js';

const ENTRIES = [1000, 2000, 5000, 10000, 20000, 50000];

function useDebounced(v, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v]);
  return d;
}

// Compliance check for an entry amount (debounced so typing a custom stake doesn't spam the server).
function useGate(amount) {
  const a = useDebounced(amount);
  return useRpc('compliance.check', { action: a > 0 ? 'paid_entry' : 'free_entry', amount: a }, { live: true });
}

function GateNotice({ gate }) {
  if (!gate || gate.allowed) return null;
  return html`<${Notice} tone="err" title="You can't enter this right now">${gate.reasons.map((r) => html`<p>${r.message}</p>`)}<//>`;
}

// ---- New challenge (bet on yourself) --------------------------------------------------------------
export function NewChallengeSheet({ open, onClose, template, templates, game }) {
  const { user } = useSession();
  const [tplId, setTplId] = useState(template?.id);
  const [entry, setEntry] = useState(5000);
  const tpl = templates?.find((t) => t.id === tplId) || template;
  const platforms = (game?.platforms || tpl?.game?.platforms || []).filter((p) => user.platforms.includes(p));
  const [platform, setPlatform] = useState(platforms[0]);
  useEffect(() => {
    if (open) {
      setTplId(template?.id);
      setPlatform(platforms[0]);
    }
  }, [open, template?.id]);
  const gate = useGate(entry);
  const create = useAction('challenges.create', { success: "You're locked in", onSuccess: (r) => { onClose(); navigate(`/app/match/${r.matchId}`); } });
  if (!tpl) return null;
  const payout = Math.floor(entry * tpl.multiplier);
  const enough = entry >= 1000 && user.wallet.available >= entry;
  return html`<${Sheet} open=${open} onClose=${onClose} title="Bet on yourself" footer=${html`
    <${Button} size="lg" block loading=${create.pending} disabled=${!platform || !enough || gate.data?.allowed === false}
      onClick=${() => create.run({ templateId: tpl.id, entry, platform })}>Lock it in for ${money(entry)}<//>`}>
    <div class="row"><${GameThumb} game=${game || tpl.game} size=${44} /><div><p class="strong">${(game || tpl.game).name}</p><p class="xs muted">${tpl.mode || game?.modes.find((m) => m.id === tpl.modeId)?.name}</p></div></div>
    ${templates?.length > 1 && html`<${Select} label="Challenge" value=${tpl.id} onChange=${setTplId} options=${templates.map((t) => ({ value: t.id, label: `${t.title} (${t.multiplier}×)` }))} />`}
    <div class="card" style="background:var(--elevated)">
      <p class="xs muted">Your target</p>
      <p class="h2" style="margin:4px 0 2px">${tpl.title}</p>
      <p class="small muted">One match. Report your stats with a screenshot when you're done.</p>
    </div>
    <${StakeInput} value=${entry} onChange=${setEntry} label="Bet on yourself: any amount" />
    ${platforms.length > 1 ? html`<div class="field"><span class="label">Platform</span><${Seg} value=${platform} onChange=${setPlatform} options=${platforms.map((p) => ({ value: p, label: PLATFORM[p] }))} /></div>` : platforms.length === 0 ? html`<${Notice} tone="warn">This game isn't on any of your platforms. Add one in Settings.<//>` : null}
    <div class="row between card payout-card" style="background:var(--elevated);gap:var(--s-4)">
      <div style="min-width:0"><p class="xs muted">Hit it and you get</p><${FitMoney} n=${payout} max=${40} cls="money" /></div>
      <div style="text-align:right"><p class="xs muted">Multiplier</p><p class="big-num" style="font-size:40px">${tpl.multiplier}×</p></div>
    </div>
    <${GateNotice} gate=${gate.data} />
    <p class="xs faint">Multipliers include a platform margin and adjust to your ${(game || tpl.game).short} rating. Results are verified before payout.</p>
  <//>`;
}

export function Challenges({ path, query }) {
  const { user } = useSession();
  const game = query.game || '';
  const tpls = useRpc('challenges.templates', {}, { live: false });
  const mine = useRpc('competitions.list', { kind: 'challenge', mine: true });
  const games = useRpc('games.list', {}, { live: false });
  const [pick, setPick] = useState(null);
  const gameOpts = (games.data || []).filter((g) => (tpls.data || []).some((t) => t.gameId === g.id) || !tpls.data).sort((a, b) => user.games.includes(b.id) - user.games.includes(a.id));
  const grouped = useMemo(() => {
    const m = new Map();
    for (const t of tpls.data || []) {
      if (game && t.gameId !== game) continue;
      if (!m.has(t.gameId)) m.set(t.gameId, []);
      m.get(t.gameId).push(t);
    }
    return [...m.entries()].sort(([a], [b]) => user.games.includes(b) - user.games.includes(a));
  }, [tpls.data, game]);
  const active = (mine.data || []).filter((c) => !['settled', 'cancelled'].includes(c.status));
  return html`<div class="container page">
    <${PlaySubnav} path=${path} />
    <${PageHead} title="Bet on yourself" sub="Pick a target in a game you play. Hit it in one match and get paid the multiplier. Harder targets pay more." />
    ${active.length > 0 && html`<div class="stack tight mb-4">${active.map((c) => html`<a class="card clickable row" href=${`#/app/match/${c.matchId}`}>
      <${GameThumb} game=${c.game} /><div class="grow"><p class="strong small">${c.title}</p><p class="xs muted">${c.game.short}. ${money(c.entry)} to win ${money(c.challenge.payout)}</p></div><${StatusBadge} status=${c.status} /></a>`)}</div>`}
    <${Chips} label="Game" value=${game} onChange=${(v) => setQuery({ game: v })} options=${[{ value: '', label: 'All games' }, ...gameOpts.slice(0, 18).map((g) => ({ value: g.id, label: g.short }))]} />
    <${Async} q=${tpls} skeleton=${html`<div class="mt-6"><${CardsSkeleton} n=${6} h=${140} /></div>`}>
      ${() => html`<div>${grouped.map(([gid, list]) => html`<${Section} title=${list[0].game.name} sub=${list[0].mode}>
        <div class="grid-3">${list.map((t) => html`<${ChallengeTile} t=${t} onPick=${() => setPick(t)} />`)}</div>
      <//>`)}</div>`}
    <//>
    ${(mine.data || []).filter((c) => c.status === 'settled').length > 0 && html`<${Section} title="Your recent challenges">
      <div class="card"><div class="list">${mine.data.filter((c) => c.status === 'settled').slice(0, 8).map((c) => html`<a class="li clickable" href=${`#/app/match/${c.matchId}`}>
        <${GameThumb} game=${c.game} size=${36} /><div class="grow"><p class="li-title">${c.title}</p><p class="li-sub">${c.game.short} · ${ago(c.createdAt)}</p></div>
        <span class="num strong small">${money(c.entry)}</span>
      </a>`)}</div></div>
    <//>`}
    <${NewChallengeSheet} open=${!!pick} template=${pick} templates=${pick ? (tpls.data || []).filter((t) => t.gameId === pick.gameId) : []} game=${pick ? (games.data || []).find((g) => g.id === pick.gameId) : null} onClose=${() => setPick(null)} />
  </div>`;
}

// ---- Head-to-head -----------------------------------------------------------------------------
export function NewH2HSheet({ open, onClose, gameId, opponent }) {
  const { user } = useSession();
  const games = useRpc('games.list', {}, { live: false, skip: !open });
  const [gid, setGid] = useState(gameId || '');
  const [mode, setMode] = useState('');
  const [platform, setPlatform] = useState('');
  const [entry, setEntry] = useState(5000);
  const [type, setType] = useState(opponent ? 'direct' : 'open');
  const [opp, setOpp] = useState(opponent || null);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const g = useRpc('games.get', { slug: gid || 'x' }, { live: false, skip: !open || !gid }).data;
  const h2hModes = (g?.modes || []).filter((m) => m.types.includes('h2h'));
  const plats = (g?.platforms || []).filter((p) => user.platforms.includes(p));
  useEffect(() => {
    if (open) {
      setGid(gameId || user.games.find(() => true) || 'efootball');
      setType(opponent ? 'direct' : 'open');
      setOpp(opponent || null);
    }
  }, [open]);
  useEffect(() => {
    setMode(h2hModes[0]?.id || '');
    setPlatform(plats[0] || '');
  }, [g?.id]);
  const friends = useRpc('social.friends', {}, { live: false, skip: !open });
  const players = useRpc('players.list', { q: search || undefined, gameId: gid || undefined }, { live: false, skip: !open || type !== 'direct' });
  const mm = useRpc('matchmaking.preview', { gameId: gid, platform: platform || undefined }, { live: false, skip: !open || type !== 'skill' || !gid });
  const gate = useGate(entry);
  const create = useAction('h2h.create', { success: (c) => (c.h2h.type === 'private' ? `Private challenge created. Code ${c.h2h.code}` : 'Challenge posted'), onSuccess: (c) => { onClose(); navigate(`/app/compete/${c.id}`); } });
  const h2hGames = (games.data || []).filter((x) => x.platforms.some((p) => user.platforms.includes(p)));
  const payout = Math.floor(entry * 2 * 0.9);
  const needsOpp = ['direct', 'friend'].includes(type);
  const canSubmit = gid && mode && platform && (!needsOpp || opp) && entry >= 1000 && user.wallet.available >= entry && gate.data?.allowed !== false;
  return html`<${Sheet} open=${open} onClose=${onClose} title="New head-to-head" footer=${html`<${Button} size="lg" block loading=${create.pending} disabled=${!canSubmit}
      onClick=${() => create.run({ gameId: gid, modeId: mode, platform, entry, type, opponentId: needsOpp ? opp?.id : undefined, note: note || undefined })}>
      ${type === 'open' ? 'Post open challenge' : type === 'private' ? 'Create private challenge' : type === 'skill' ? 'Find my match' : `Challenge ${opp?.username || 'player'}`}<//>`}>
    <div class="form-grid">
      <${Select} label="Game" value=${gid} onChange=${setGid} options=${h2hGames.map((x) => ({ value: x.id, label: x.name }))} />
      ${h2hModes.length ? html`<${Select} label="Mode" value=${mode} onChange=${setMode} options=${h2hModes.map((m) => ({ value: m.id, label: m.name }))} />` : html`<${Notice} tone="warn">No head-to-head modes for this game.<//>`}
    </div>
    ${plats.length > 1 && html`<div class="field"><span class="label">Platform</span><${Seg} value=${platform} onChange=${setPlatform} options=${plats.map((p) => ({ value: p, label: PLATFORM[p] }))} /></div>`}
    <div class="field"><span class="label">Who can take it</span>
      <${Chips} value=${type} onChange=${(v) => { setType(v); if (!['direct', 'friend'].includes(v)) setOpp(null); }} options=${[
        { value: 'open', label: 'Anyone' }, { value: 'skill', label: 'Skill-matched' }, { value: 'friend', label: 'A friend' }, { value: 'direct', label: 'A specific player' }, { value: 'private', label: 'Private code' },
      ]} />
      <p class="hint">${{ open: 'Anyone at any level can accept.', skill: 'We match you with someone close to your rating with a good connection.', friend: 'Only people on your friends list.', direct: 'Send it to one player.', private: 'You get a code to share. Only people with the code can join.' }[type]}</p>
    </div>
    ${type === 'friend' && html`<div class="stack tight">${(friends.data?.friends || []).length ? friends.data.friends.map((f) => html`<button type="button" class="opt-tile" aria-pressed=${opp?.id === f.id ? 'true' : 'false'} onClick=${() => setOpp(f)}><${Who} user=${f} link=${false} /><span class="check"><${Icon} name="check" /></span></button>`) : html`<p class="small muted">No friends yet. Add players from their profile.</p>`}</div>`}
    ${type === 'direct' && html`<div class="stack tight">
      <${Input} label="Find a player" placeholder="Search by username" value=${search} onInput=${setSearch} />
      <div class="stack tight" style="max-height:220px;overflow:auto">${players.loading ? html`<${ListSkeleton} n=${3} />` : (players.data || []).slice(0, 8).map((p) => html`<button type="button" class="opt-tile" aria-pressed=${opp?.id === p.id ? 'true' : 'false'} onClick=${() => setOpp(p)}><${Who} user=${p} link=${false} /><span class="check"><${Icon} name="check" /></span></button>`)}</div>
    </div>`}
    ${type === 'skill' && html`<div class="card" style="background:var(--elevated)">
      <p class="small strong mb-2">Likely opponents right now</p>
      ${mm.loading ? html`<${ListSkeleton} n=${3} />` : (mm.data || []).slice(0, 3).map((c) => html`<div class="li"><${Avatar} user=${c.user} size="sm" /><div class="grow"><p class="small strong">${c.user.username}</p><p class="xs muted">${c.score} rating · ${c.ping} ms</p></div><span class="badge ${c.quality > 70 ? 'money' : c.quality > 45 ? 'warn' : ''}">${c.quality}% match<//></div>`)}
    </div>`}
    <${StakeInput} value=${entry} onChange=${setEntry} label="Entry each (any amount)" />
    <${Input} label="Trash talk" optional placeholder="Run it. First to 3." value=${note} onInput=${setNote} maxlength="80" />
    <div class="row between card" style="background:var(--elevated)">
      <div style="min-width:0"><p class="xs muted">Winner takes</p><${FitMoney} n=${payout} max=${36} cls="money" /></div>
      <p class="xs muted" style="max-width:20ch;text-align:right">Both pay ${money(entry)}. 10% platform fee.</p>
    </div>
    <${GateNotice} gate=${gate.data} />
  <//>`;
}

export function H2H({ path, query }) {
  const { user } = useSession();
  const tab = query.tab || 'open';
  const game = query.game || '';
  const open = useRpc('competitions.list', { kind: 'h2h', status: 'open', gameId: game || undefined });
  const mine = useRpc('competitions.list', { kind: 'h2h', mine: true });
  const [sheet, setSheet] = useState(!!query.new);
  const [confirm, setConfirm] = useState(null);
  const accept = useAction('competitions.join', { success: "You're on. Go win it.", onSuccess: (r) => { setConfirm(null); navigate(`/app/match/${r.matchId}`); } });
  const list = (open.data || []).filter((c) => c.h2h.challenger.id !== user.id);
  const incoming = list.filter((c) => c.h2h.incoming);
  const openList = list.filter((c) => !c.h2h.opponent);
  const myList = mine.data || [];
  return html`<div class="container page">
    <${PlaySubnav} path=${path} />
    <${PageHead} title="Head-to-head" sub="You versus them. Both pay in, winner takes the pot. Lose? Run it back." actions=${html`<${Button} icon="plus" onClick=${() => setSheet(true)}>New challenge<//>`} />
    <${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[
      { value: 'open', label: 'Open challenges', count: openList.length },
      { value: 'incoming', label: 'For you', count: incoming.length },
      { value: 'mine', label: 'Yours', count: myList.filter((c) => !['settled', 'cancelled'].includes(c.status)).length },
    ]} />
    <div class="mt-6">
      ${tab === 'open' && html`<${Async} q=${open} skeleton=${html`<${CardsSkeleton} n=${6} h=${210} />`}>
        ${() => (openList.length ? html`<div class="grid-3">${openList.map((c) => html`<${H2HCard} c=${c} onAccept=${setConfirm} />`)}</div>` : html`<${Empty} icon="swords" title="No open challenges right now" body="Post one and someone will pick it up, usually inside a minute." action=${html`<${Button} onClick=${() => setSheet(true)}>Post a challenge<//>`} />`)}
      <//>`}
      ${tab === 'incoming' && (incoming.length ? html`<div class="grid-3">${incoming.map((c) => html`<${H2HCard} c=${c} onAccept=${setConfirm} />`)}</div>` : html`<${Empty} icon="bell" title="Nobody's called you out yet" body="When someone challenges you directly, it shows up here and in notifications." />`)}
      ${tab === 'mine' && html`<${Async} q=${mine} empty=${html`<${Empty} icon="swords" title="You haven't played a head-to-head yet" body="Post an open challenge or accept one to get started." action=${html`<${Button} onClick=${() => setSheet(true)}>New challenge<//>`} />`}>
        ${(l) => html`<div class="card"><div class="list">${l.map((c) => {
          const opp = c.h2h.challenger.id === user.id ? c.h2h.opponent : c.h2h.challenger;
          return html`<a class="li clickable" href=${c.matchId ? `#/app/match/${c.matchId}` : `#/app/compete/${c.id}`}>
            <${GameThumb} game=${c.game} size=${38} />
            <div class="grow" style="min-width:0"><p class="li-title truncate">${opp ? `vs ${opp.username}` : 'Waiting for an opponent'}</p><p class="li-sub">${c.game.short} ${c.mode.name} · ${money(c.entry)}</p></div>
            <${StatusBadge} status=${c.status} />
          </a>`;
        })}</div></div>`}
      <//>`}
    </div>
    <${NewH2HSheet} open=${sheet} onClose=${() => setSheet(false)} />
    <${Confirm} open=${!!confirm} onClose=${() => setConfirm(null)} pending=${accept.pending} title="Accept this challenge?"
      body=${confirm ? `${confirm.game.short} ${confirm.mode.name} against ${confirm.h2h.challenger.username}. ${money(confirm.entry)} comes out of your stack now. Winner takes ${money(confirm.payout)}.` : ''}
      confirmLabel=${confirm ? `Accept for ${money(confirm.entry)}` : 'Accept'} onConfirm=${() => accept.run({ id: confirm.id })} />
  </div>`;
}

// ---- Competition lobby ------------------------------------------------------------------------
export function CompetitionDetail({ params }) {
  const { user } = useSession();
  const q = useRpc('competitions.get', { id: params.id });
  const teams = useRpc('teams.list', { mine: true }, { live: false });
  const [teamId, setTeamId] = useState('');
  const [code, setCode] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const c = q.data;
  const gate = useGate(c?.entry || 0);
  const join = useAction('competitions.join', { success: (r) => (r.matchId ? "You're on" : "You're in"), onSuccess: (r) => (r.matchId ? navigate(`/app/match/${r.matchId}`) : q.refresh()) });
  const leave = useAction('competitions.leave', { success: 'Entry refunded', onSuccess: () => { setLeaveOpen(false); q.refresh(); } });
  const start = useAction('competitions.startNow', { onSuccess: (r) => navigate(`/app/match/${r.matchId}`) });
  const decline = useAction('h2h.decline', { success: 'Challenge declined', onSuccess: () => navigate('/app/h2h') });
  const rematch = useAction('competitions.rematch', { success: 'Run it back', onSuccess: (r) => navigate(r.matchId ? `/app/match/${r.matchId}` : `/app/compete/${r.competitionId}`) });

  if (q.loading && !c) return html`<div class="container page stack"><${Sk} h=${200} r="20" /><${Sk} h=${40} w="50%" /><${Sk} h=${300} r="14" /></div>`;
  if (q.error) return html`<div class="container page"><${Empty} icon="alert" title="Competition not found" body=${q.error.message} action=${html`<${Button} href="/app/play">Back to Play<//>`} /></div>`;
  if (c.kind === 'challenge' && c.matchId) {
    navigate(`/app/match/${c.matchId}`, { replace: true });
    return null;
  }
  const myTeams = (teams.data || []).filter((t) => t.isMember);
  const enough = user.wallet.available >= c.entry;
  const isH2H = c.kind === 'h2h';
  const mineH2H = isH2H && c.h2h.challenger.id === user.id;
  const canJoin = c.status === 'open' && !c.joined && !mineH2H;
  const blocked = gate.data && !gate.data.allowed;

  return html`<div class="container page">
    <a class="back" href=${isH2H ? '#/app/h2h' : '#/app/play'}><${Icon} name="chevL" />${isH2H ? 'Head-to-head' : 'Play'}</a>
    <section class="comp-hero">
      <${GameArt} game=${c.game} size="hero" word=${false} />
      <div class="comp-hero-copy">
        <div class="row wrap tight"><${StatusBadge} status=${c.status} startsAt=${c.startsAt} />${isH2H ? html`<${Badge}>${H2H_TYPE[c.h2h.type]}<//>` : html`<${Badge}>${c.format === 'team' ? `Squads of ${c.teamSize}` : 'Solo'}<//>`}${c.sponsor && html`<${Badge}>Sponsored by ${c.sponsor.name}<//>`}</div>
        <h1 class="display" style="font-size:clamp(44px,7vw,88px);margin:10px 0 4px">${isH2H ? `${c.game.short} 1v1` : c.title}</h1>
        <p class="muted">${c.game.name}, ${c.mode.name}, ${PLATFORM[c.platform]}</p>
      </div>
    </section>

    <div class="with-rail mt-6">
      <div class="stack" style="gap:var(--s-6);min-width:0">
        ${isH2H && html`<div class="card pad-lg">
          <div class="h2h-row">
            <div class="stack tight" style="align-items:center;text-align:center"><${Avatar} user=${c.h2h.challenger} size="lg" /><a class="strong" href=${`#/app/u/${c.h2h.challenger.username}`}>${c.h2h.challenger.username}</a><${Rank} rank=${c.h2h.challenger.rank} /></div>
            <span class="display" style="font-size:44px;color:var(--faint)">vs</span>
            <div class="stack tight" style="align-items:center;text-align:center">${c.h2h.opponent ? html`<${Avatar} user=${c.h2h.opponent} size="lg" /><a class="strong" href=${`#/app/u/${c.h2h.opponent.username}`}>${c.h2h.opponent.username}</a><${Rank} rank=${c.h2h.opponent.rank} />` : html`<span class="avatar lg field">?</span><span class="strong muted">Open seat</span><span class="xs faint">Anyone can take it</span>`}</div>
          </div>
          ${c.h2h.note && html`<p class="center muted mt-4" style="font-style:italic">"${c.h2h.note}"</p>`}
        </div>`}

        ${c.kind === 'pool' && c.status !== 'settled' && html`<div class="card">
          <div class="row between mb-2"><span class="strong">Lobby</span><span class="small muted num">${c.players}/${c.maxPlayers} players${c.format === 'team' ? `, ${c.entrants}/${c.maxEntrants} squads` : ''}</span></div>
          <${Progress} value=${c.players / c.maxPlayers} tone=${c.players / c.maxPlayers > 0.85 ? 'heat' : ''} label="Lobby filled" />
          <div class="roster mt-4">${c.roster.slice(0, 24).map((e) => html`<div class="roster-item">
            ${c.format === 'team' ? html`<p class="small strong truncate">${e.name}</p><div class="row" style="gap:4px">${e.members.map((m) => html`<${Avatar} user=${m} size="xs" online=${false} />`)}</div>` : html`<div class="row tight"><${Avatar} user=${e.members[0]} size="xs" online=${false} /><span class="small truncate">${e.name}</span></div>`}
          </div>`)}</div>
          ${c.roster.length > 24 && html`<p class="xs muted mt-2">+${c.roster.length - 24} more</p>`}
        </div>`}

        ${c.status === 'settled' && c.match?.outcome && html`<div class="card">
          <p class="strong mb-2">Result</p>
          ${isH2H ? html`<p class="h2">${c.match.outcome.winner?.username} won ${c.match.outcome.score || ''}</p>` : html`<div class="list">${(c.match.outcome.standings || []).slice(0, 10).map((s) => html`<div class="li"><span class=${`pos p${s.place}`}>${s.place}</span><div class="grow"><p class="li-title">${s.name}</p><p class="li-sub">${s.kills} eliminations</p></div></div>`)}</div>`}
          <div class="row mt-4"><${Button} href=${`/app/match/${c.match.id}`} variant="secondary">Full result<//>${c.joined && html`<${Button} icon="again" loading=${rematch.pending} onClick=${() => rematch.run({ id: c.id })}>Run it back<//>`}</div>
        </div>`}

        <div class="card"><p class="strong mb-2">Rules</p><ul class="stack tight small">${c.rules.map((r) => html`<li class="row top tight"><${Icon} name="check" size="16" /><span>${r}</span></li>`)}</ul>
          <p class="xs muted mt-4">Results are verified by screenshot, video or game data. Read the <a class="link" href="#/app/fairplay">fair play rules</a>.</p></div>
      </div>

      <aside class="stack" style="gap:var(--s-4)">
        <div class="card pad-lg stack">
          ${isH2H ? html`<div class="row between"><div><p class="xs muted">Entry each</p><p class="h2 num">${money(c.entry)}</p></div><div style="text-align:right"><p class="xs muted">Winner takes</p><p class="h2 num money">${money(c.payout)}</p></div></div>`
            : html`<${PrizeBreakdown} pool=${c.status === 'open' || c.status === 'full' ? c.projected : c.pool} teamSize=${c.teamSize} projected=${c.status === 'open'} />`}
          ${!isH2H && html`<p class="xs muted">${MODEL[c.prize.model]}${c.prize.teamSplit === 'performance' ? ', squad share split by eliminations' : c.teamSize > 1 ? ', squad share split equally' : ''}.</p>`}
          <hr />
          ${c.status === 'open' && !isH2H && html`<p class="small row tight"><${Icon} name="clock" size="16" /><${Countdown} to=${c.startsAt} prefix="Lobby locks" /></p>`}

          ${canJoin && html`<div class="stack">
            ${c.format === 'team' && html`<${Select} label="Enter as" value=${teamId} onChange=${setTeamId} options=${[{ value: '', label: 'Solo queue (we fill your squad)' }, ...myTeams.map((t) => ({ value: t.id, label: `${t.name} [${t.tag}]` }))]} hint=${teamId ? 'Your teammates are added to the squad automatically in the demo.' : 'You get matched with players at your level.'} />`}
            ${c.visibility === 'private' && !c.h2h?.incoming && html`<${Input} label="Invite code" value=${code} onInput=${setCode} placeholder="6 characters" />`}
            ${blocked && html`<${GateNotice} gate=${gate.data} />`}
            ${!enough && html`<${Notice} tone="warn" title="Not enough in your stack" action=${html`<${Button} size="sm" variant="secondary" href="/app/wallet?sheet=deposit">Deposit<//>`}>Entry is ${money(c.entry)}. You have ${money(user.wallet.available)}.<//>`}
            <${Button} size="lg" block loading=${join.pending} disabled=${!enough || blocked} onClick=${() => join.run({ id: c.id, teamId: teamId || undefined, code: code || undefined })}>${isH2H ? 'Accept' : 'Join'} for ${c.entry ? money(c.entry) : 'free'}<//>
            ${c.h2h?.incoming && html`<${Button} variant="ghost" block loading=${decline.pending} onClick=${() => decline.run({ id: c.id })}>Decline<//>`}
          </div>`}

          ${c.joined && c.status === 'open' && !isH2H && html`<div class="stack">
            <${Notice} tone="ok" title="You're in">${c.mySquad ? `${c.mySquad.name}: ${c.mySquad.members.map((m) => m.username).join(', ')}` : "We'll ping you when the lobby locks."}<//>
            <${Button} block icon="zap" loading=${start.pending} onClick=${() => start.run({ id: c.id })}>Skip the wait (demo)<//>
            <p class="xs faint">Fills the lobby with demo players and locks it now.</p>
            <${Button} variant="ghost" block onClick=${() => setLeaveOpen(true)}>Leave and refund<//>
          </div>`}
          ${mineH2H && c.status === 'open' && html`<div class="stack">
            <${Notice} tone="info" title=${c.h2h.opponent ? `Waiting for ${c.h2h.opponent.username}` : 'Waiting for someone to accept'}>${c.h2h.code ? html`Share code <strong class="num" style="letter-spacing:.1em;color:var(--text)">${c.h2h.code}</strong>` : 'Demo players usually accept within a few seconds.'}<//>
            ${c.h2h.code && html`<${Button} variant="secondary" icon="copy" onClick=${() => { navigator.clipboard?.writeText(c.h2h.code); toast.ok('Code copied'); }}>Copy code<//>`}
            <${Button} variant="ghost" block onClick=${() => setLeaveOpen(true)}>Withdraw challenge<//>
          </div>`}
          ${['live', 'verifying', 'disputed'].includes(c.status) && c.joined && c.matchId && html`<${Button} size="lg" block href=${`/app/match/${c.matchId}`} icon="play">Go to match room<//>`}
          ${c.status === 'live' && !c.joined && html`<${Notice} tone="info">This one's already running.<//>`}
          ${c.status === 'cancelled' && html`<${Notice} tone="warn" title="Cancelled">${c.result?.reason || 'Entries were refunded.'}<//>`}
        </div>
      </aside>
    </div>
    <${Confirm} open=${leaveOpen} onClose=${() => setLeaveOpen(false)} pending=${leave.pending} title=${isH2H ? 'Withdraw this challenge?' : 'Leave this pool?'} body=${`Your ${money(c.entry)} entry goes back to your stack.`} confirmLabel=${isH2H ? 'Withdraw' : 'Leave pool'} tone="danger" onConfirm=${() => leave.run({ id: c.id })} />
  </div>`;
}
