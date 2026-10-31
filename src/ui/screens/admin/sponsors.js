import { html, useState, useEffect } from '../../../lib/preact.js';
import { useRpc, useAction, useSession, useMeta } from '../../hooks.js';
import { setQuery } from '../../router.js';
import { Button, Badge, Sk, Async, Empty, Input, Select, Textarea, Notice, Sheet, Seg, Progress, ErrorBox } from '../../components/base.js';
import { Bars } from './overview.js';
import { money, short, when, ago } from '../../format.js';

const MS_TONE = { draft: '', pending: 'warn', scheduled: 'accent', live: 'live', paused: 'warn', complete: '' };
const REWARDS = [['cash', 'Prize money'], ['credit', 'STACKD credit'], ['gift', 'Gift'], ['merch', 'Merchandise'], ['giftcard', 'Gift card'], ['product', 'Product'], ['discount', 'Discount'], ['entry', 'Tournament entry'], ['digital', 'Digital reward']];
const DAY = 86400000;
const toDate = (t) => new Date(t).toISOString().slice(0, 10);

function CampaignSheet({ open, onClose, sponsorId, sponsors }) {
  const meta = useMeta().data;
  const [f, setF] = useState({ name: '', budget: 1000000, objective: 'Awareness', start: toDate(Date.now() + DAY), end: toDate(Date.now() + 15 * DAY), regions: ['UG'], sponsorId: sponsorId || sponsors[0]?.id });
  const save = useAction('sponsor.campaignSave', { success: 'Campaign created as a draft', onSuccess: onClose });
  return html`<${Sheet} open=${open} onClose=${onClose} title="New campaign" footer=${html`<${Button} block size="lg" loading=${save.pending} disabled=${f.name.length < 3} onClick=${() => save.run({ name: f.name, budget: Number(f.budget), objective: f.objective, startsAt: new Date(f.start).getTime(), endsAt: new Date(f.end).getTime(), regions: f.regions, sponsorId: f.sponsorId })}>Create campaign<//>`}>
    ${!sponsorId && html`<${Select} label="Sponsor" value=${f.sponsorId} onChange=${(v) => setF({ ...f, sponsorId: v })} options=${sponsors.map((s) => ({ value: s.id, label: s.name }))} />`}
    <${Input} label="Campaign name" value=${f.name} onInput=${(v) => setF({ ...f, name: v })} />
    <div class="form-grid"><${Input} label="Budget" prefix="UGX" value=${f.budget} onInput=${(v) => setF({ ...f, budget: v.replace(/[^0-9]/g, '') })} /><${Input} label="Objective" value=${f.objective} onInput=${(v) => setF({ ...f, objective: v })} /></div>
    <div class="form-grid"><${Input} label="Start" type="date" value=${f.start} onInput=${(v) => setF({ ...f, start: v })} /><${Input} label="End" type="date" value=${f.end} onInput=${(v) => setF({ ...f, end: v })} /></div>
    <div class="field"><span class="label">Regions</span><div class="chips" style="flex-wrap:wrap">${(meta?.countries || []).map((c) => html`<button type="button" class="chip" aria-pressed=${f.regions.includes(c.code) ? 'true' : 'false'} onClick=${() => setF({ ...f, regions: f.regions.includes(c.code) ? f.regions.filter((x) => x !== c.code) : [...f.regions, c.code] })}>${c.name}</button>`)}</div></div>
  <//>`;
}

function MissionBuilder({ open, onClose, campaigns, games }) {
  const meta = useMeta().data;
  const init = () => ({ campaignId: campaigns[0]?.id, title: '', brief: '', type: 'in_game', gameId: games[0]?.id, modeId: games[0]?.modes[0]?.id, metric: '', op: 'gte', target: 5, label: '', rewardType: 'cash', rewardValue: 5000, rewardLabel: '', quantity: 100, start: toDate(Date.now() + DAY), end: toDate(Date.now() + 14 * DAY), regions: ['UG'], minAge: 13, minScore: 0, terms: 'One reward per player. Results screen must show your in-game name.' });
  const [f, setF] = useState(init);
  useEffect(() => open && setF(init()), [open]);
  const save = useAction('sponsor.missionSave', { success: 'Mission saved as a draft', onSuccess: onClose });
  const g = games.find((x) => x.id === f.gameId);
  const mode = g?.modes.find((m) => m.id === f.modeId) || g?.modes[0];
  const metric = mode?.metrics.find((m) => m.key === f.metric) || mode?.metrics[0];
  const camp = campaigns.find((c) => c.id === f.campaignId);
  const autoLabel = metric ? (metric.type === 'bool' ? `${metric.label} in ${mode.name}` : `${f.op === 'lte' ? (metric.key === 'placement' ? 'Finish top' : 'At most') : f.op === 'eq' ? 'Exactly' : 'Get'} ${f.target} ${metric.key === 'placement' ? '' : metric.label.toLowerCase()} in ${mode.name}`.replace(/\s+/g, ' ')) : '';
  const submit = () => save.run({
    campaignId: f.campaignId, title: f.title, brief: f.brief, type: f.type,
    gameId: f.type === 'in_game' ? g.id : undefined, modeId: f.type === 'in_game' ? mode.id : undefined,
    objective: f.type === 'in_game' ? { label: f.label || autoLabel, metric: metric.key, op: metric.type === 'bool' ? 'eq' : f.op, target: metric.type === 'bool' ? 1 : Number(f.target) } : { label: f.label || 'Find it within 8 scans' },
    reward: { type: f.rewardType, value: Number(f.rewardValue) || 0, label: f.rewardLabel || `${money(Number(f.rewardValue) || 0)} ${f.rewardType === 'credit' ? 'credit' : ''}`.trim() },
    quantity: Number(f.quantity), startsAt: new Date(f.start).getTime(), endsAt: new Date(f.end).getTime(), regions: f.regions, minAge: Number(f.minAge), minScore: Number(f.minScore), terms: f.terms,
  });
  return html`<${Sheet} open=${open} onClose=${onClose} wide title="Mission builder" footer=${html`<${Button} block size="lg" loading=${save.pending} disabled=${!f.title || f.brief.length < 10 || !camp} onClick=${submit}>Save draft<//>`}>
    ${!campaigns.length ? html`<${Notice} tone="warn">Create a campaign first.<//>` : html`<div class="stack">
      <div class="form-grid">
        <${Select} label="Campaign" value=${f.campaignId} onChange=${(v) => setF({ ...f, campaignId: v })} options=${campaigns.map((c) => ({ value: c.id, label: c.name }))} />
        <div class="field"><span class="label">Mission type</span><${Seg} value=${f.type} onChange=${(v) => setF({ ...f, type: v })} options=${[{ value: 'in_game', label: 'In-game objective' }, { value: 'hunt', label: 'Hidden collectible' }]} /></div>
      </div>
      <${Input} label="Mission title" value=${f.title} onInput=${(v) => setF({ ...f, title: v })} placeholder="Ice cold top 10" />
      <${Textarea} label="Brief" value=${f.brief} onInput=${(v) => setF({ ...f, brief: v })} placeholder="What players do, in one or two sentences." />
      ${f.type === 'in_game' ? html`<div class="form-grid">
          <${Select} label="Game" value=${f.gameId} onChange=${(v) => { const ng = games.find((x) => x.id === v); setF({ ...f, gameId: v, modeId: ng.modes[0].id, metric: '' }); }} options=${games.map((x) => ({ value: x.id, label: x.name }))} />
          <${Select} label="Mode" value=${mode?.id} onChange=${(v) => setF({ ...f, modeId: v, metric: '' })} options=${(g?.modes || []).map((m) => ({ value: m.id, label: m.name }))} />
          <${Select} label="Objective stat" value=${metric?.key} onChange=${(v) => setF({ ...f, metric: v })} options=${(mode?.metrics || []).map((m) => ({ value: m.key, label: m.label }))} />
          ${metric?.type !== 'bool' && html`<${Select} label="Condition" value=${f.op} onChange=${(v) => setF({ ...f, op: v })} options=${[{ value: 'gte', label: 'At least' }, { value: 'lte', label: 'At most' }, { value: 'eq', label: 'Exactly' }]} />`}
          ${metric?.type !== 'bool' && html`<${Input} label="Target" type="number" value=${f.target} onInput=${(v) => setF({ ...f, target: v })} />`}
        </div>
        <${Input} label="Objective shown to players" value=${f.label} placeholder=${autoLabel} onInput=${(v) => setF({ ...f, label: v })} hint="Leave blank to use the generated one." />`
        : html`<${Notice} tone="info">Players get a 6×6 map and 8 scans with hot/cold hints. The location is random per player and never sent to the device.<//>`}
      <div class="form-grid">
        <${Select} label="Reward type" value=${f.rewardType} onChange=${(v) => setF({ ...f, rewardType: v })} options=${REWARDS.map(([value, label]) => ({ value, label }))} />
        <${Input} label="Cash value" prefix="UGX" value=${f.rewardValue} onInput=${(v) => setF({ ...f, rewardValue: v.replace(/[^0-9]/g, '') })} hint="0 for non-cash rewards" />
        <${Input} label="Reward label" value=${f.rewardLabel} onInput=${(v) => setF({ ...f, rewardLabel: v })} placeholder="2 free FIZZUPs" />
        <${Input} label="Winners (quantity)" type="number" value=${f.quantity} onInput=${(v) => setF({ ...f, quantity: v })} />
        <${Input} label="Start" type="date" value=${f.start} onInput=${(v) => setF({ ...f, start: v })} />
        <${Input} label="End" type="date" value=${f.end} onInput=${(v) => setF({ ...f, end: v })} />
        <${Input} label="Minimum age" type="number" value=${f.minAge} onInput=${(v) => setF({ ...f, minAge: v })} />
        <${Input} label="Minimum STACK Score" type="number" value=${f.minScore} onInput=${(v) => setF({ ...f, minScore: v })} />
      </div>
      <div class="field"><span class="label">Regions</span><div class="chips" style="flex-wrap:wrap">${(meta?.countries || []).filter((c) => !camp || camp.regions.includes(c.code) || true).map((c) => html`<button type="button" class="chip" aria-pressed=${f.regions.includes(c.code) ? 'true' : 'false'} onClick=${() => setF({ ...f, regions: f.regions.includes(c.code) ? f.regions.filter((x) => x !== c.code) : [...f.regions, c.code] })}>${c.name}</button>`)}</div></div>
      <${Textarea} label="Terms" value=${f.terms} onInput=${(v) => setF({ ...f, terms: v })} />
      <p class="xs faint">Assets (logos, in-game skins, collectible art) are attached during STACKD review. Missions go Draft → Pending review → Scheduled/Live.</p>
    </div>`}
  <//>`;
}

export function SponsorDashboard({ sponsorId, isAdmin }) {
  const q = useRpc('sponsor.dashboard', { sponsorId: sponsorId || undefined });
  const [camp, setCamp] = useState(false);
  const [builder, setBuilder] = useState(false);
  const status = useAction('sponsor.missionStatus', { success: (m) => `Mission is ${m.status}`, onSuccess: () => q.refresh() });
  if (q.loading && !q.data) return html`<div class="stack"><${Sk} h=${100} r="14" /><${Sk} h=${300} r="14" /></div>`;
  if (q.error) return html`<${ErrorBox} error=${q.error} retry=${q.reload} />`;
  const { campaigns, missions, totals: t, days, games, sponsors } = q.data;
  const moves = (m) => isAdmin
    ? { draft: ['pending'], pending: ['live', 'scheduled', 'draft'], scheduled: ['live', 'paused'], live: ['paused', 'complete'], paused: ['live', 'complete'], complete: [] }[m.status]
    : { draft: ['pending'], pending: ['draft'], scheduled: ['paused'], live: ['paused', 'complete'], paused: ['live', 'complete'], complete: [] }[m.status];
  return html`<div class="stack loose">
    <div class="row between wrap">
      <div><h1 class="h1">${sponsors.length === 1 ? sponsors[0].name : 'All sponsors'}</h1><p class="muted mt-2">Campaign performance across Stack Missions.</p></div>
      <div class="row tight"><${Button} variant="secondary" icon="plus" onClick=${() => setCamp(true)}>New campaign<//><${Button} icon="flag" onClick=${() => setBuilder(true)}>Build a mission<//></div>
    </div>
    <div class="kpis">
      <div class="kpi"><span class="l">Campaigns</span><span class="v">${campaigns.length}</span><span class="d">${campaigns.filter((c) => c.status === 'live').length} live</span></div>
      <div class="kpi"><span class="l">Reach</span><span class="v">${short(t.reach || 0)}</span><span class="d">Estimated unique players</span></div>
      <div class="kpi"><span class="l">Mission views</span><span class="v">${short(t.views || 0)}</span></div>
      <div class="kpi"><span class="l">Participants</span><span class="v">${short(t.starts || 0)}</span><span class="d">Mission starts</span></div>
      <div class="kpi"><span class="l">Completions</span><span class="v">${short(t.completions || 0)}</span><span class="d">${t.completionRate}% completion rate</span></div>
      <div class="kpi"><span class="l">Rewards distributed</span><span class="v">${short(t.completions || 0)}</span></div>
      <div class="kpi"><span class="l">Spend</span><span class="v">${short(t.cost || 0)}</span><span class="d">${t.completions ? `${money(Math.round(t.cost / t.completions))} per completion` : ''}</span></div>
    </div>
    <div class="panel"><div class="panel-head"><span class="strong">Mission starts, last 14 days</span></div><div class="panel-body"><${Bars} data=${days} value=${(d) => d.starts} label=${(d) => new Date(d.day).getDate()} color="var(--secondary)" height=${140} /></div></div>
    <div class="panel"><div class="panel-head"><span class="strong">Campaigns</span></div><div class="table-wrap"><table class="table">
      <thead><tr><th>Campaign</th><th>Status</th><th>Dates</th><th class="r">Starts</th><th class="r">Completion</th><th class="r">Engagement</th><th>Budget used</th></tr></thead>
      <tbody>${campaigns.map((c) => html`<tr><td><p class="strong">${c.name}</p><p class="xs muted">${c.sponsor.name} · ${c.objective} · ${c.regions.join(', ')}</p></td><td><${Badge} tone=${MS_TONE[c.status]}>${c.status}<//></td>
        <td class="xs muted">${new Date(c.startsAt).toLocaleDateString()} – ${new Date(c.endsAt).toLocaleDateString()}</td><td class="r num">${c.stats.starts.toLocaleString()}</td><td class="r num">${c.stats.completionRate}%</td><td class="r num">${c.stats.engagement}%</td>
        <td style="min-width:140px"><${Progress} value=${c.stats.budgetUsed / 100} tone=${c.stats.budgetUsed > 90 ? 'heat' : ''} label="Budget used" /><p class="xs muted mt-2">${short(c.spent)} of ${short(c.budget)}</p></td></tr>`)}</tbody>
    </table></div></div>
    <div class="panel"><div class="panel-head"><span class="strong">Missions</span></div>
      ${missions.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Mission</th><th>Status</th><th>Reward</th><th class="r">Starts</th><th class="r">Done</th><th class="r">Left</th><th>Actions</th></tr></thead>
        <tbody>${missions.map((m) => html`<tr><td><a class="strong" href=${`#/app/missions/${m.id}`}>${m.title}</a><p class="xs muted">${m.type === 'hunt' ? 'Hidden collectible' : `${m.game?.short}: ${m.objective.label}`}</p></td>
          <td><${Badge} tone=${MS_TONE[m.status]}>${m.status}<//></td><td class="small">${m.reward.label}</td><td class="r num">${m.stats.starts.toLocaleString()}</td><td class="r num">${m.stats.completions.toLocaleString()}</td><td class="r num">${m.remaining.toLocaleString()}</td>
          <td><div class="row tight">${(moves(m) || []).map((s) => html`<${Button} size="sm" variant=${s === 'complete' ? 'danger' : 'secondary'} onClick=${() => status.run({ id: m.id, status: s })}>${{ pending: 'Submit for review', draft: 'Back to draft', live: m.status === 'paused' ? 'Resume' : 'Go live', scheduled: 'Approve', paused: 'Pause', complete: 'End' }[s]}<//>`)}</div></td></tr>`)}</tbody>
      </table></div>` : html`<div class="panel-body"><${Empty} icon="flag" title="No missions yet" body="Build one and submit it for review." /></div>`}
    </div>
    <${CampaignSheet} open=${camp} onClose=${() => { setCamp(false); q.refresh(); }} sponsorId=${sponsorId} sponsors=${sponsors} />
    <${MissionBuilder} open=${builder} onClose=${() => { setBuilder(false); q.refresh(); }} campaigns=${campaigns.filter((c) => c.status !== 'complete')} games=${games} />
  </div>`;
}

export function SponsorsAdmin({ query }) {
  const all = useRpc('sponsor.dashboard', {}, { live: false });
  const sid = query.sponsor || '';
  return html`<div class="stack">
    <div class="toolbar"><select class="select" aria-label="Sponsor" value=${sid} onChange=${(e) => setQuery({ sponsor: e.currentTarget.value })}><option value="">All sponsors</option>${(all.data?.sponsors || []).map((s) => html`<option value=${s.id}>${s.name}</option>`)}</select></div>
    <${SponsorDashboard} key=${sid} sponsorId=${sid} isAdmin />
  </div>`;
}

export function SponsorPortal() {
  const { user } = useSession();
  return html`<div class="container page"><${SponsorDashboard} sponsorId=${user.role === 'admin' ? '' : user.sponsorId} isAdmin=${user.role === 'admin'} /></div>`;
}
