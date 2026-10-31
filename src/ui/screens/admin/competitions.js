import { html, useState, useEffect } from '../../../lib/preact.js';
import { useRpc, useAction, useMeta } from '../../hooks.js';
import { setQuery } from '../../router.js';
import { Icon } from '../../icons.js';
import { Button, Badge, Sk, Async, Empty, Input, Select, Textarea, Toggle, Notice, Sheet, Seg } from '../../components/base.js';
import { PrizeBreakdown, StatusBadge } from '../../components/cards.js';
import { GameThumb } from '../../components/game.js';
import { money, short, when, ago, MODEL, FORMAT, KIND, PLATFORM } from '../../format.js';

// ---- Prize engine editor (shared) ---------------------------------------------------------------
export function PrizeEditor({ prize, onChange, entry, entrants, teamSize, guaranteed }) {
  const [places, setPlaces] = useState((prize.placements || [60, 30, 10]).join(', '));
  const preview = useRpc('admin.prizePreview', { prize: { ...prize, guaranteed: guaranteed || undefined }, entry: Number(entry) || 0, entrants: Math.max(1, Number(entrants) || 1), teamSize: Number(teamSize) || 1 }, { live: false });
  const set = (k, v) => onChange({ ...prize, [k]: v });
  const usesPlaces = ['placement', 'team', 'hybrid'].includes(prize.model);
  const sum = places.split(',').map(Number).filter((x) => !isNaN(x)).reduce((a, b) => a + b, 0);
  return html`<div class="stack">
    <div class="form-grid">
      <${Select} label="Payout model" value=${prize.model} onChange=${(v) => set('model', v)} options=${Object.entries(MODEL).map(([value, label]) => ({ value, label }))} />
      <${Input} label="Platform fee %" type="number" min="0" max="50" value=${prize.feePct} onInput=${(v) => onChange({ ...prize, feePct: Number(v), poolPct: prize.poolPct != null ? Math.min(prize.poolPct, 100 - Number(v)) : undefined })} />
      <${Input} label="Prize pool %" type="number" min="0" max="100" value=${prize.poolPct ?? 100 - (prize.feePct || 0)} hint=${(prize.poolPct ?? 100 - (prize.feePct || 0)) < 100 - (prize.feePct || 0) ? `${100 - (prize.feePct || 0) - prize.poolPct}% goes to the season pool` : 'Of all entries, after the fee'} error=${(prize.poolPct ?? 0) + (prize.feePct || 0) > 100 ? 'Fee plus pool can’t pass 100%.' : null} onInput=${(v) => set('poolPct', v === '' ? undefined : Number(v))} />
    </div>
    ${usesPlaces && html`<${Input} label="Placement split %" value=${places} hint=${`Comma separated, 1st first. Total ${sum}%${sum !== 100 ? ' (must be 100)' : ''}.`} error=${sum !== 100 ? 'Splits must add up to 100%.' : null}
      onInput=${(v) => { setPlaces(v); onChange({ ...prize, placements: v.split(',').map((x) => Number(x.trim())).filter((x) => !isNaN(x) && x > 0) }); }} />`}
    ${prize.model === 'hybrid' && html`<${Input} label="Elimination pool % of net" type="number" min="0" max="100" value=${prize.killPoolPct ?? 30} onInput=${(v) => set('killPoolPct', Number(v))} />`}
    ${teamSize > 1 && html`<div class="field"><span class="label">Squad share split</span><${Seg} value=${prize.teamSplit || 'equal'} onChange=${(v) => set('teamSplit', v)} options=${[{ value: 'equal', label: 'Equal' }, { value: 'performance', label: 'By eliminations' }]} /></div>`}
    <div class="form-grid">
      <${Input} label="Sponsor boost" prefix="UGX" value=${prize.sponsorBoost || ''} onInput=${(v) => set('sponsorBoost', Number(v.replace(/[^0-9]/g, '')) || 0)} />
      <${Input} label="MVP bonus" prefix="UGX" value=${prize.bonuses?.[0]?.amount || ''} hint="Paid to the top fragger" onInput=${(v) => { const a = Number(v.replace(/[^0-9]/g, '')) || 0; set('bonuses', a ? [{ label: 'MVP bonus', amount: a, fundedBy: 'sponsor' }] : []); }} />
    </div>
    <div class="card" style="background:var(--elevated)">
      <p class="xs muted mb-2">Live preview at ${entrants} ${teamSize > 1 ? 'squads' : 'players'}</p>
      ${preview.data ? html`<${PrizeBreakdown} pool=${preview.data} teamSize=${Number(teamSize) || 1} />` : preview.error ? html`<p class="small err-text">${preview.error.message}</p>` : html`<${Sk} h=${120} />`}
    </div>
  </div>`;
}

function CreatePool({ open, onClose, games, sponsors }) {
  const meta = useMeta().data;
  const [f, setF] = useState({ title: '', gameId: 'codm', modeId: 'br_squad', platform: 'mobile', entry: 10000, minPlayers: 40, maxPlayers: 100, startsInMin: 30, featured: false, realMoney: true, sponsorId: '', publish: true, prize: { model: 'winner_takes_all', feePct: 20, teamSplit: 'equal' } });
  useEffect(() => {
    if (meta?.platformFeePct != null) setF((x) => ({ ...x, prize: { ...x.prize, feePct: meta.platformFeePct } }));
  }, [meta?.platformFeePct]);
  const create = useAction('admin.compCreate', { success: (c) => (c.status === 'draft' ? 'Saved as a draft. Publish it when ready.' : 'Pool published and open for entries'), onSuccess: onClose });
  const g = games.find((x) => x.id === f.gameId);
  const poolModes = (g?.modes || []).filter((m) => m.types.includes('pool'));
  const mode = poolModes.find((m) => m.id === f.modeId) || poolModes[0];
  useEffect(() => {
    if (mode && mode.id !== f.modeId) setF((x) => ({ ...x, modeId: mode.id }));
    if (g && !g.platforms.includes(f.platform)) setF((x) => ({ ...x, platform: g.platforms[0] }));
  }, [f.gameId]);
  const ts = mode?.teamSize || 1;
  return html`<${Sheet} open=${open} onClose=${onClose} wide title="Create a pool" footer=${html`<${Button} block size="lg" loading=${create.pending} disabled=${!f.title || !mode} onClick=${() => create.run({ ...f, modeId: mode.id, entry: Number(f.entry), minPlayers: Number(f.minPlayers), maxPlayers: Number(f.maxPlayers), startsInMin: Number(f.startsInMin), sponsorId: f.sponsorId || undefined })}>${f.publish ? 'Create and publish' : 'Save draft'}<//>`}>
    <div class="form-grid">
      <${Input} label="Title" value=${f.title} onInput=${(v) => setF({ ...f, title: v })} placeholder="Friday Night Drop" />
      <${Select} label="Game" value=${f.gameId} onChange=${(v) => setF({ ...f, gameId: v })} options=${games.filter((x) => x.modes.some((m) => m.types.includes('pool'))).map((x) => ({ value: x.id, label: x.name }))} />
      <${Select} label="Mode" value=${mode?.id} onChange=${(v) => setF({ ...f, modeId: v })} options=${poolModes.map((m) => ({ value: m.id, label: `${m.name}${m.teamSize > 1 ? ` (teams of ${m.teamSize})` : ''}` }))} />
      <${Select} label="Platform" value=${f.platform} onChange=${(v) => setF({ ...f, platform: v })} options=${(g?.platforms || []).map((p) => ({ value: p, label: PLATFORM[p] }))} />
      <${Input} label="Entry per player" prefix="UGX" value=${f.entry} onInput=${(v) => setF({ ...f, entry: v.replace(/[^0-9]/g, '') })} />
      <${Input} label="Starts in (minutes)" type="number" value=${f.startsInMin} onInput=${(v) => setF({ ...f, startsInMin: v })} />
      <${Input} label="Min players" type="number" value=${f.minPlayers} onInput=${(v) => setF({ ...f, minPlayers: v })} />
      <${Input} label="Max players" type="number" value=${f.maxPlayers} onInput=${(v) => setF({ ...f, maxPlayers: v })} hint=${ts > 1 ? `Multiple of ${ts}` : undefined} />
      <${Select} label="Sponsor" value=${f.sponsorId} onChange=${(v) => setF({ ...f, sponsorId: v })} options=${[{ value: '', label: 'None' }, ...sponsors.map((s) => ({ value: s.id, label: s.name }))]} />
    </div>
    <div class="row wrap" style="gap:var(--s-6)"><${Toggle} label="Publish now" hint="Off saves a draft players can't see" checked=${f.publish} onChange=${(v) => setF({ ...f, publish: v })} /><${Toggle} label="Featured" checked=${f.featured} onChange=${(v) => setF({ ...f, featured: v })} /><${Toggle} label="Real-money eligible" hint="Still demo credits in this build" checked=${f.realMoney} onChange=${(v) => setF({ ...f, realMoney: v })} /></div>
    <p class="strong">Prize engine</p>
    <${PrizeEditor} prize=${f.prize} onChange=${(p) => setF({ ...f, prize: p })} entry=${f.entry} entrants=${Math.floor((Number(f.maxPlayers) || 0) / ts)} teamSize=${ts} />
  <//>`;
}

function EditPool({ c, onClose }) {
  const locked = c.players > 0;
  const [f, setF] = useState({ title: c.title, entry: c.entry, minPlayers: c.minPlayers, maxPlayers: c.maxPlayers, startsInMin: '', featured: c.featured, prize: c.prize });
  const save = useAction('admin.compUpdate', { success: 'Competition updated', onSuccess: onClose });
  const run = () => save.run({
    id: c.id, title: f.title, minPlayers: Number(f.minPlayers), maxPlayers: Number(f.maxPlayers), featured: f.featured,
    ...(f.startsInMin ? { startsInMin: Number(f.startsInMin) } : {}),
    ...(locked ? {} : { entry: Number(f.entry), prize: f.prize }),
  });
  return html`<${Sheet} open onClose=${onClose} wide title=${`Edit ${c.title}`} footer=${html`<${Button} block size="lg" loading=${save.pending} onClick=${run}>Save changes<//>`}>
    ${locked && html`<${Notice} tone="info" title="Money terms locked">${c.players} players have paid in, so the entry fee and prize settings can't change. Cancel and refund to change them.<//>`}
    <div class="form-grid">
      <${Input} label="Title" value=${f.title} onInput=${(v) => setF({ ...f, title: v })} />
      <${Input} label="Entry per player" prefix="UGX" value=${f.entry} disabled=${locked} onInput=${(v) => setF({ ...f, entry: v.replace(/[^0-9]/g, '') })} />
      <${Input} label="Min players" type="number" value=${f.minPlayers} onInput=${(v) => setF({ ...f, minPlayers: v })} />
      <${Input} label="Max players" type="number" value=${f.maxPlayers} onInput=${(v) => setF({ ...f, maxPlayers: v })} hint=${c.teamSize > 1 ? `Multiple of ${c.teamSize}` : undefined} />
      <${Input} label="Restart countdown (minutes)" type="number" value=${f.startsInMin} placeholder="Keep current" onInput=${(v) => setF({ ...f, startsInMin: v })} />
    </div>
    <${Toggle} label="Featured" checked=${f.featured} onChange=${(v) => setF({ ...f, featured: v })} />
    ${!locked && html`<p class="strong">Prize engine</p><${PrizeEditor} prize=${f.prize} onChange=${(p) => setF({ ...f, prize: p })} entry=${f.entry} entrants=${Math.floor((Number(f.maxPlayers) || 0) / (c.teamSize || 1))} teamSize=${c.teamSize || 1} />`}
  <//>`;
}

function ReviewPool({ id, onClose }) {
  const q = useRpc('admin.compDetail', { id });
  const d = q.data;
  const r = d?.match?.reconciliation;
  return html`<${Sheet} open onClose=${onClose} wide title="Results and money">
    <${Async} q=${q}>${() => html`<div class="stack">
      <div class="row wrap" style="gap:var(--s-6)">
        <div class="stat"><div class="v num">${money(d.ledger.entries)}</div><div class="l">Entries collected</div></div>
        <div class="stat"><div class="v num money">${money(d.ledger.prizes)}</div><div class="l">Prizes paid</div></div>
        <div class="stat"><div class="v num">${money(d.ledger.refunds)}</div><div class="l">Refunded</div></div>
        <div class="stat"><div class="v num">${money(d.revenue)}</div><div class="l">Platform revenue</div></div>
      </div>
      ${r && html`<${Notice} tone=${r.entries + r.sponsorFunded === r.paidOut + r.platformRevenue ? 'ok' : 'err'} title="Reconciliation">Entries ${money(r.entries)} + sponsor ${money(r.sponsorFunded)} = prizes ${money(r.paidOut)} + platform ${money(r.platformRevenue)} (fee ${money(r.platformFee)}${r.platformTopUp ? `, top-up −${money(r.platformTopUp)}` : ''}).<//>`}
      ${d.match && html`<p class="small muted">Match ${d.match.id} · ${d.match.status} · result source: ${d.match.integration || 'reports'}${d.match.verification ? ` · ${d.match.verification.status}${d.match.verification.simulated ? ' (simulated, demo)' : ''}` : ''}</p>`}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Player</th><th>Squad</th><th class="r">Paid</th><th class="r">Place</th><th>Result</th><th class="r">Winnings</th></tr></thead>
        <tbody>${[...d.entries].sort((a, b) => (a.placement || 999) - (b.placement || 999)).map((e) => html`<tr>
          <td class="small">${e.user.username}</td><td class="xs muted">${e.squad || '—'}</td><td class="r num small">${short(e.paid)}</td>
          <td class="r num small">${e.placement || '—'}</td><td class="small">${e.result || e.status}</td><td class="r num small ${e.winnings ? 'money' : ''}">${e.winnings ? short(e.winnings) : '—'}</td>
        </tr>`)}</tbody>
      </table></div>
    </div>`}<//>
  <//>`;
}

export function CompetitionsAdmin({ query }) {
  const status = query.status || 'active';
  const kind = query.kind || '';
  const q = useRpc('admin.competitions', { status: status || undefined, kind: kind || undefined });
  const games = useRpc('admin.games', {}, { live: false });
  const sp = useRpc('sponsor.dashboard', {}, { live: false });
  const [create, setCreate] = useState(false);
  const [cancel, setCancel] = useState(null);
  const [edit, setEdit] = useState(null);
  const [review, setReview] = useState(null);
  const [reason, setReason] = useState('');
  const act = useAction('admin.compAction', { success: 'Done', onSuccess: () => { setCancel(null); q.refresh(); } });
  return html`<div class="stack">
    <div class="row between wrap"><div><h1 class="h1">Competitions</h1><p class="muted mt-2">Pools, head-to-heads and challenges. Create, publish, monitor, start, review results, cancel with refunds.</p></div><${Button} icon="plus" onClick=${() => setCreate(true)}>Create pool<//></div>
    <div class="toolbar">
      <${Seg} label="Status" value=${status} onChange=${(v) => setQuery({ status: v })} options=${[{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Drafts' }, { value: 'settled', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }, { value: '', label: 'All' }]} />
      <${Seg} label="Kind" value=${kind} onChange=${(v) => setQuery({ kind: v })} options=${[{ value: '', label: 'All kinds' }, { value: 'pool', label: 'Pools' }, { value: 'h2h', label: 'H2H' }, { value: 'challenge', label: 'Challenges' }]} />
    </div>
    <${Async} q=${q} empty=${html`<${Empty} icon="swords" title="Nothing matches" body="Try another filter." />`}>
      ${(rows) => html`<div class="panel"><div class="table-wrap"><table class="table">
        <thead><tr><th>Competition</th><th>Kind</th><th>Status</th><th class="r">Players</th><th class="r">Entry</th><th class="r">Net pool</th><th>Starts</th><th>Actions</th></tr></thead>
        <tbody>${rows.map((c) => html`<tr>
          <td><div class="row tight"><${GameThumb} game=${c.game} size=${30} /><div><a class="strong" href=${`#/app/compete/${c.id}`}>${c.kind === 'h2h' ? `${c.h2h.challenger.username} vs ${c.h2h.opponent?.username || 'open'}` : c.title}</a><p class="xs muted">${c.game.short} ${c.mode.name} · by ${c.creator.username}</p></div></div></td>
          <td>${KIND[c.kind]}${c.featured ? html` <${Badge} tone="accent">Featured<//>` : ''}</td><td><${StatusBadge} status=${c.status} /></td>
          <td class="r num">${c.players}/${c.maxPlayers}</td><td class="r num">${short(c.entry)}</td><td class="r num">${c.kind === 'challenge' ? short(c.challenge.payout) : short((c.status === 'open' ? c.pool : c.pool)?.net || c.payout || 0)}</td>
          <td class="xs muted">${when(c.startsAt)}</td>
          <td><div class="row tight">
            ${c.kind === 'pool' && c.status === 'draft' && html`<${Button} size="sm" onClick=${() => act.run({ id: c.id, action: 'publish' })}>Publish<//>`}
            ${c.kind === 'pool' && ['draft', 'open', 'full'].includes(c.status) && html`<${Button} size="sm" variant="secondary" onClick=${() => setEdit(c)}>Edit<//>`}
            ${c.kind === 'pool' && ['open', 'full'].includes(c.status) && html`${c.status === 'open' && html`<${Button} size="sm" variant="secondary" onClick=${() => act.run({ id: c.id, action: 'fill' })}>Fill<//><${Button} size="sm" variant="secondary" onClick=${() => act.run({ id: c.id, action: 'fill_all' })}>Fill to max<//>`}<${Button} size="sm" variant="secondary" onClick=${() => act.run({ id: c.id, action: 'start' })}>Start<//>`}
            ${c.kind === 'pool' && ['starting', 'live'].includes(c.status) && html`<${Button} size="sm" variant="secondary" href=${`/app/match/${c.matchId}`}>Watch<//><${Button} size="sm" variant="secondary" onClick=${() => act.run({ id: c.id, action: 'finish' })}>Finish now (demo)<//>`}
            ${c.kind === 'pool' && c.players > 0 && html`<${Button} size="sm" variant="ghost" onClick=${() => setReview(c.id)}>Review<//>`}
            ${c.kind === 'pool' && c.status !== 'draft' && html`<${Button} size="sm" variant="ghost" onClick=${() => act.run({ id: c.id, action: 'feature' })}>${c.featured ? 'Unfeature' : 'Feature'}<//>`}
            ${!['settled', 'cancelled'].includes(c.status) && html`<${Button} size="sm" variant="danger" onClick=${() => { setCancel(c); setReason(''); }}>Cancel<//>`}
          </div></td>
        </tr>`)}</tbody>
      </table></div></div>`}
    <//>
    ${games.data && html`<${CreatePool} open=${create} onClose=${() => { setCreate(false); q.refresh(); }} games=${games.data} sponsors=${sp.data?.sponsors || []} />`}
    ${edit && html`<${EditPool} c=${edit} onClose=${() => { setEdit(null); q.refresh(); }} />`}
    ${review && html`<${ReviewPool} id=${review} onClose=${() => setReview(null)} />`}
    <${Sheet} open=${!!cancel} onClose=${() => setCancel(null)} title="Cancel and refund" footer=${html`<${Button} variant="secondary" onClick=${() => setCancel(null)}>Keep it<//><${Button} variant="danger" loading=${act.pending} onClick=${() => act.run({ id: cancel.id, action: 'cancel', reason: reason || undefined })}>Cancel competition<//>`}>
      <p class="small muted">Every paid seat is refunded to whoever paid for it, through the ledger, and players are notified.</p>
      <${Textarea} label="Reason shown to players" value=${reason} onInput=${setReason} placeholder="Server issues in the game" />
    <//>
  </div>`;
}

function CreateTournament({ open, onClose, games, sponsors }) {
  const [f, setF] = useState({ name: '', gameId: 'efootball', modeId: 'h2h', platform: 'mobile', format: 'single_elim', maxEntrants: 8, entry: 5000, startsInMin: 60, guaranteed: 0, sponsorId: '', featured: false, rules: 'Report within 30 minutes\nScreenshot the final score', prize: { model: 'placement', feePct: 10, placements: [60, 30, 10] } });
  const create = useAction('admin.tourCreate', { success: 'Tournament created', onSuccess: onClose });
  const g = games.find((x) => x.id === f.gameId);
  const modes = (g?.modes || []).filter((m) => m.types.includes('tournament'));
  const mode = modes.find((m) => m.id === f.modeId) || modes[0];
  useEffect(() => {
    if (mode && mode.id !== f.modeId) setF((x) => ({ ...x, modeId: mode.id }));
    if (g && !g.platforms.includes(f.platform)) setF((x) => ({ ...x, platform: g.platforms[0] }));
  }, [f.gameId]);
  return html`<${Sheet} open=${open} onClose=${onClose} wide title="Create a tournament" footer=${html`<${Button} block size="lg" loading=${create.pending} disabled=${!f.name || !mode} onClick=${() => create.run({ ...f, modeId: mode.id, maxEntrants: Number(f.maxEntrants), entry: Number(f.entry), startsInMin: Number(f.startsInMin), guaranteed: Number(f.guaranteed) || 0, sponsorId: f.sponsorId || undefined, rules: f.rules.split('\n').filter(Boolean) })}>Create tournament<//>`}>
    <div class="form-grid">
      <${Input} label="Name" value=${f.name} onInput=${(v) => setF({ ...f, name: v })} />
      <${Select} label="Game" value=${f.gameId} onChange=${(v) => setF({ ...f, gameId: v })} options=${games.filter((x) => x.modes.some((m) => m.types.includes('tournament'))).map((x) => ({ value: x.id, label: x.name }))} />
      <${Select} label="Mode" value=${mode?.id} onChange=${(v) => setF({ ...f, modeId: v })} options=${modes.map((m) => ({ value: m.id, label: m.name }))} />
      <${Select} label="Platform" value=${f.platform} onChange=${(v) => setF({ ...f, platform: v })} options=${(g?.platforms || []).map((p) => ({ value: p, label: PLATFORM[p] }))} />
      <${Select} label="Format" value=${f.format} onChange=${(v) => setF({ ...f, format: v })} options=${Object.entries(FORMAT).map(([value, label]) => ({ value, label }))} />
      <${Select} label="Entrants" value=${String(f.maxEntrants)} onChange=${(v) => setF({ ...f, maxEntrants: Number(v) })} options=${['4', '6', '8', '12', '16', '32']} />
      <${Input} label="Entry per player" prefix="UGX" value=${f.entry} onInput=${(v) => setF({ ...f, entry: v.replace(/[^0-9]/g, '') })} />
      <${Input} label="Guaranteed pool" prefix="UGX" value=${f.guaranteed} onInput=${(v) => setF({ ...f, guaranteed: v.replace(/[^0-9]/g, '') })} />
      <${Input} label="Starts in (minutes)" type="number" value=${f.startsInMin} onInput=${(v) => setF({ ...f, startsInMin: v })} />
      <${Select} label="Sponsor" value=${f.sponsorId} onChange=${(v) => setF({ ...f, sponsorId: v })} options=${[{ value: '', label: 'None' }, ...sponsors.map((s) => ({ value: s.id, label: s.name }))]} />
    </div>
    <${Textarea} label="Rules (one per line)" value=${f.rules} onInput=${(v) => setF({ ...f, rules: v })} />
    <${Toggle} label="Featured" checked=${f.featured} onChange=${(v) => setF({ ...f, featured: v })} />
    <p class="strong">Prize engine</p>
    <${PrizeEditor} prize=${f.prize} onChange=${(p) => setF({ ...f, prize: p })} entry=${f.entry} entrants=${f.maxEntrants} teamSize=${mode?.teamSize || 1} guaranteed=${Number(f.guaranteed)} />
  <//>`;
}

export function TournamentsAdmin() {
  const q = useRpc('admin.tournaments');
  const games = useRpc('admin.games', {}, { live: false });
  const sp = useRpc('sponsor.dashboard', {}, { live: false });
  const [create, setCreate] = useState(false);
  const act = useAction('admin.tourAction', { success: 'Done', onSuccess: () => q.refresh() });
  return html`<div class="stack">
    <div class="row between wrap"><div><h1 class="h1">Tournaments</h1><p class="muted mt-2">Configure formats and prize structures, start, monitor, cancel with refunds.</p></div><${Button} icon="plus" onClick=${() => setCreate(true)}>Create tournament<//></div>
    <${Async} q=${q}>
      ${(rows) => html`<div class="panel"><div class="table-wrap"><table class="table">
        <thead><tr><th>Tournament</th><th>Format</th><th>Status</th><th class="r">Entrants</th><th class="r">Pool</th><th>Starts</th><th>Champion</th><th>Actions</th></tr></thead>
        <tbody>${rows.map((t) => html`<tr>
          <td><div class="row tight"><${GameThumb} game=${t.game} size=${30} /><div><a class="strong" href=${`#/app/tournaments/${t.id}`}>${t.name}</a><p class="xs muted">${t.game.short} ${t.mode?.name}${t.sponsor ? ` · ${t.sponsor.name}` : ''}</p></div></div></td>
          <td class="small">${FORMAT[t.format]}</td><td><${StatusBadge} status=${t.status} /></td><td class="r num">${t.entrants}/${t.maxEntrants}</td><td class="r num">${short(t.pool.net)}</td>
          <td class="xs muted">${when(t.startsAt)}</td><td class="small">${t.champion?.name || '—'}</td>
          <td><div class="row tight">
            ${t.status === 'registration' && html`<${Button} size="sm" variant="secondary" onClick=${() => act.run({ id: t.id, action: 'start' })}>Start<//>`}
            <${Button} size="sm" variant="ghost" onClick=${() => act.run({ id: t.id, action: 'feature' })}>${t.featured ? 'Unfeature' : 'Feature'}<//>
            ${['registration', 'live'].includes(t.status) && html`<${Button} size="sm" variant="danger" onClick=${() => act.run({ id: t.id, action: 'cancel', reason: 'Cancelled by STACKD' })}>Cancel<//>`}
          </div></td>
        </tr>`)}</tbody>
      </table></div></div>`}
    <//>
    ${games.data && html`<${CreateTournament} open=${create} onClose=${() => { setCreate(false); q.refresh(); }} games=${games.data} sponsors=${sp.data?.sponsors || []} />`}
  </div>`;
}

export function MarketsAdmin() {
  const q = useRpc('admin.markets');
  const comp = useRpc('admin.compliance', {}, { live: false });
  const resolve = useAction('admin.marketResolve', { success: 'Market resolved and paid', onSuccess: () => q.refresh() });
  const cfg = useAction('admin.configSave', { success: 'Categories updated', onSuccess: () => comp.refresh() });
  const cats = comp.data?.config.predictionCategories;
  return html`<div class="stack">
    <div><h1 class="h1">Prediction markets</h1><p class="muted mt-2">Resolve outcomes and switch categories. Country availability lives in Compliance.</p></div>
    ${cats && html`<div class="panel"><div class="panel-head"><span class="strong">Categories</span></div><div class="panel-body row wrap" style="gap:var(--s-6)">
      ${['esports', 'gaming', 'sports'].map((k) => html`<${Toggle} label=${{ esports: 'Esports', gaming: 'STACKD events', sports: 'Sports' }[k]} checked=${cats[k]} onChange=${(v) => cfg.run({ predictionCategories: { ...cats, [k]: v } })} />`)}
    </div></div>`}
    <${Async} q=${q}>
      ${(rows) => html`<div class="stack">${rows.map((m) => html`<div class="panel"><div class="panel-head"><div><p class="strong">${m.title}</p><p class="xs muted">${m.category} · closes ${when(m.closesAt)} · ${m.positions} positions · ${money(m.volume)} volume</p></div><${Badge} tone=${m.status === 'open' ? 'accent' : m.status === 'closed' ? 'warn' : ''}>${m.status}<//></div>
        <div class="panel-body row wrap" style="gap:var(--s-2)">${m.options.map((o) => html`<${Button} size="sm" variant=${m.resolution === o.id ? 'money' : 'secondary'} disabled=${m.status === 'resolved'} loading=${resolve.pending} onClick=${() => resolve.run({ id: m.id, optionId: o.id })}>${m.status === 'resolved' ? o.label : `Resolve: ${o.label}`} (${Math.round(o.price * 100)}%)<//>`)}</div>
      </div>`)}</div>`}
    <//>
  </div>`;
}
