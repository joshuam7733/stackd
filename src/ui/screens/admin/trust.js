import { html, useState, useEffect } from '../../../lib/preact.js';
import { useRpc, useAction, useMeta } from '../../hooks.js';
import { setQuery } from '../../router.js';
import { Icon } from '../../icons.js';
import { Button, Badge, Sk, Async, Empty, Input, Textarea, Notice, Sheet, Tabs, Toggle, Avatar, Who, ErrorBox } from '../../components/base.js';
import { money, short, ago, STATUS } from '../../format.js';

// ---- Compliance -------------------------------------------------------------------------------
export function Compliance() {
  const meta = useMeta().data;
  const q = useRpc('admin.compliance');
  const save = useAction('admin.jurisdictionSave', { success: 'Jurisdiction updated', onSuccess: () => q.refresh() });
  const gameRm = useAction('admin.gameRealMoney', { success: 'Game updated', onSuccess: () => q.refresh() });
  const kyc = useAction('admin.userAction', { success: 'KYC decision saved', onSuccess: () => q.refresh() });
  const cfg = useAction('admin.configSave', { success: 'Configuration saved', onSuccess: () => q.refresh() });
  const [ranks, setRanks] = useState(null);
  const [fees, setFees] = useState(null);
  useEffect(() => {
    if (q.data && !ranks) {
      setRanks(q.data.config.ranks.map((r) => ({ ...r })));
      setFees({ platformFeePct: q.data.config.platformFeePct, h2hFeePct: q.data.config.h2hFeePct, challengeMargin: q.data.config.challengeMargin, maxStake: q.data.config.maxStake, highStakesKyc: q.data.config.highStakesKyc });
    }
  }, [q.data]);
  if (q.loading && !q.data) return html`<${Sk} h=${400} r="14" />`;
  if (q.error) return html`<${ErrorBox} error=${q.error} retry=${q.reload} />`;
  const d = q.data;
  const name = (c) => meta?.countries.find((x) => x.code === c)?.name || c;
  const T = (j, k) => html`<td><input type="checkbox" checked=${j[k]} aria-label=${`${k} in ${name(j.code)}`} onChange=${(e) => save.run({ code: j.code, patch: { [k]: e.currentTarget.checked } })} style="width:18px;height:18px;accent-color:var(--secondary)" /></td>`;
  return html`<div class="stack loose">
    <div><h1 class="h1">Compliance</h1><p class="muted mt-2">Real-money and market features resolve as: global → country → game → competition → user. Any "off" wins.</p></div>
    <${Notice} tone="warn" title="Real money is locked off in this build">The global switch stays off in the prototype. Everything runs on demo credits. The rest of this page controls what would be allowed when it goes live, and the country-level feature switches apply right now.<//>
    <div class="panel"><div class="panel-head"><span class="strong">Jurisdiction matrix</span><span class="xs muted">Demo configuration. Legal review required before launch.</span></div><div class="table-wrap"><table class="table">
      <thead><tr><th>Country</th><th>Live</th><th>Real money</th><th>Backing players</th><th>Predictions</th><th>KYC to withdraw</th><th class="r">Min age</th><th class="r">Daily deposit cap</th></tr></thead>
      <tbody>${d.jurisdictions.map((j) => html`<tr><td class="strong">${name(j.code)}</td>${T(j, 'enabled')}${T(j, 'realMoney')}${T(j, 'staking')}${T(j, 'predictions')}${T(j, 'kycRequired')}
        <td class="r"><input class="input" style="height:32px;width:64px;text-align:right" type="number" min="13" max="25" value=${j.minAge} aria-label=${`Minimum age in ${name(j.code)}`} onChange=${(e) => save.run({ code: j.code, patch: { minAge: Number(e.currentTarget.value) } })} /></td>
        <td class="r"><input class="input" style="height:32px;width:120px;text-align:right" type="number" min="0" step="50000" value=${j.dailyDepositLimit} aria-label=${`Deposit cap in ${name(j.code)}`} onChange=${(e) => save.run({ code: j.code, patch: { dailyDepositLimit: Number(e.currentTarget.value) } })} /></td></tr>`)}</tbody>
    </table></div></div>

    <div class="split">
      <div class="panel"><div class="panel-head"><span class="strong">KYC queue</span><${Badge} tone="warn">${d.kycQueue.length}<//></div><div class="panel-body list">
        ${d.kycQueue.length ? d.kycQueue.map((u) => html`<div class="li"><${Who} user=${u} sub=${html`<span>${u.kyc.docType?.replace('_', ' ')} · ${ago(u.kyc.submittedAt)}</span>`} /><div class="row tight"><${Button} size="sm" variant="money" onClick=${() => kyc.run({ id: u.id, action: 'verify_kyc' })}>Approve<//><${Button} size="sm" variant="danger" onClick=${() => kyc.run({ id: u.id, action: 'reject_kyc', note: 'Document unreadable. Upload a clearer photo.' })}>Reject<//></div></div>`) : html`<p class="small muted">No one waiting.</p>`}
      </div></div>
      <div class="panel"><div class="panel-head"><span class="strong">Restricted & excluded accounts</span></div><div class="panel-body list">
        ${d.restricted.length ? d.restricted.map((u) => html`<a class="li clickable" href=${`#/admin/users/${u.id}`}><${Avatar} user=${u} size="sm" online=${false} /><span class="grow small strong">${u.username}</span><${Badge} tone=${u.status === 'suspended' ? 'err' : 'warn'}>${u.selfExcludedUntil > Date.now() ? 'Self-excluded' : u.coolOffUntil > Date.now() ? 'Cool-off' : u.status}<//></a>`) : html`<p class="small muted">None.</p>`}
      </div></div>
    </div>

    <div class="split">
      <div class="panel"><div class="panel-head"><span class="strong">Real money by game</span></div><div class="panel-body list">
        ${d.games.map((g) => html`<div class="li"><span class="grow small strong">${g.short}</span><${Toggle} label=${g.realMoney ? 'Eligible' : 'Credits only'} checked=${g.realMoney} onChange=${(v) => gameRm.run({ id: g.id, realMoney: v })} /></div>`)}
      </div></div>
      <div class="stack">
        ${ranks && html`<div class="panel"><div class="panel-head"><span class="strong">Rank thresholds</span><${Button} size="sm" loading=${cfg.pending} onClick=${() => cfg.run({ ranks: ranks.map((r) => ({ id: r.id, name: r.name, min: Number(r.min) })) })}>Save<//></div><div class="panel-body stack tight">
          ${ranks.map((r, i) => html`<div class="row"><span class=${`rank ${r.id} grow`}>${r.name}</span><input class="input" style="height:34px;width:110px;text-align:right" type="number" min="0" value=${r.min} aria-label=${`${r.name} minimum`} disabled=${i === 0} onInput=${(e) => setRanks(ranks.map((x, j) => (j === i ? { ...x, min: e.currentTarget.value } : x)))} /></div>`)}
          <p class="xs faint">STACK Score needed for each rank. The score formula stays server-side.</p>
        </div></div>`}
        ${fees && html`<div class="panel"><div class="panel-head"><span class="strong">Fees & margins</span><${Button} size="sm" loading=${cfg.pending} onClick=${() => cfg.run({ platformFeePct: Number(fees.platformFeePct), h2hFeePct: Number(fees.h2hFeePct), challengeMargin: Number(fees.challengeMargin), maxStake: Number(fees.maxStake), highStakesKyc: Number(fees.highStakesKyc) })}>Save<//></div><div class="panel-body form-grid">
          <${Input} label="Default pool fee %" type="number" value=${fees.platformFeePct} onInput=${(v) => setFees({ ...fees, platformFeePct: v })} />
          <${Input} label="H2H fee %" type="number" value=${fees.h2hFeePct} onInput=${(v) => setFees({ ...fees, h2hFeePct: v })} />
          <${Input} label="Challenge margin" type="number" step="0.01" value=${fees.challengeMargin} onInput=${(v) => setFees({ ...fees, challengeMargin: v })} hint="0.12 = 12%" />
          <${Input} label="Max stake per entry" prefix="UGX" value=${fees.maxStake} onInput=${(v) => setFees({ ...fees, maxStake: v.replace(/[^0-9]/g, '') })} hint="Challenges and H2H. Caps platform liability." />
          <${Input} label="ID required from" prefix="UGX" value=${fees.highStakesKyc} onInput=${(v) => setFees({ ...fees, highStakesKyc: v.replace(/[^0-9]/g, '') })} hint="Entries at or above this need verified KYC" />
        </div></div>`}
      </div>
    </div>
  </div>`;
}

// ---- Disputes & support -------------------------------------------------------------------------
function DecideSheet({ d, onClose, onDone }) {
  const [winner, setWinner] = useState(null);
  const [note, setNote] = useState('');
  const act = useAction('admin.disputeResolve', { success: 'Decision recorded', onSuccess: () => { onDone(); onClose(); } });
  const players = d?.match?.players || [];
  return html`<${Sheet} open=${!!d} onClose=${onClose} wide title="Referee decision" footer=${html`<${Button} variant="danger" loading=${act.pending} disabled=${note.length < 3} onClick=${() => act.run({ id: d.id, void: true, note })}>Void and refund<//><${Button} loading=${act.pending} disabled=${!winner || note.length < 3} onClick=${() => act.run({ id: d.id, winnerId: winner, note })}>Award the win<//>`}>
    ${d && html`<div class="stack">
      <p class="small"><strong>${d.raisedByUser.username}</strong>: ${d.details}</p>
      <div class="grid-2">${players.map((p) => {
        const r = d.match.reports[p.id];
        return html`<button type="button" class="opt-tile" aria-pressed=${winner === p.id ? 'true' : 'false'} onClick=${() => setWinner(p.id)} style="align-items:flex-start">
          <div class="stack tight grow"><${Who} user=${p} link=${false} />${r ? html`<p class="small">Reported a <strong>${r.outcome}</strong>${r.stats ? `: ${Object.entries(r.stats).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}</p><p class="xs muted">${(r.evidence || []).map((e) => e.name).join(', ') || 'No evidence'}</p>` : html`<p class="xs muted">No report</p>`}</div>
          <span class="check"><${Icon} name="check" /></span>
        </button>`;
      })}</div>
      <${Textarea} label="Decision note (shown to both players)" value=${note} onInput=${setNote} placeholder="VOD at 04:12 shows a 2–1 final score." />
    </div>`}
  <//>`;
}

function ReviewSheet({ m, onClose, onDone }) {
  const [note, setNote] = useState('');
  const act = useAction('admin.reviewDecide', { success: 'Review decided', onSuccess: () => { onDone(); onClose(); } });
  const rep = m ? Object.values(m.reports)[0] : null;
  return html`<${Sheet} open=${!!m} onClose=${onClose} title="Result review" footer=${html`<${Button} variant="danger" loading=${act.pending} disabled=${note.length < 3} onClick=${() => act.run({ matchId: m.id, approve: false, note })}>Settle on evidence<//><${Button} loading=${act.pending} disabled=${note.length < 3} onClick=${() => act.run({ matchId: m.id, approve: true, note })}>Approve claim<//>`}>
    ${m && html`<div class="stack">
      <p class="strong">${m.title}</p>
      <p class="small">Claimed: ${rep?.stats ? Object.entries(rep.stats).map(([k, v]) => `${k} ${v}`).join(', ') : '—'}</p>
      <ul class="stack tight">${(m.verification?.checks || []).map((c) => html`<li class="row top tight small"><${Icon} name=${c.ok ? 'check' : 'alert'} size="16" cls=${c.ok ? 'money' : 'heat'} /><span>${c.label}${c.note ? html`<span class="xs muted" style="display:block">${c.note}</span>` : ''}</span></li>`)}</ul>
      <${Textarea} label="Note" value=${note} onInput=${setNote} />
    </div>`}
  <//>`;
}

export function SupportAdmin({ query }) {
  const tab = query.tab || 'disputes';
  const q = useRpc('admin.disputes');
  const tickets = useRpc('admin.tickets');
  const [decide, setDecide] = useState(null);
  const [review, setReview] = useState(null);
  const [reply, setReply] = useState(null);
  const [body, setBody] = useState('');
  const send = useAction('admin.ticketReply', { success: 'Reply sent', onSuccess: () => { setReply(null); setBody(''); tickets.refresh(); } });
  const d = q.data;
  const open = (d?.disputes || []).filter((x) => ['open', 'under_review'].includes(x.status));
  const appeals = (d?.disputes || []).filter((x) => x.status === 'appealed');
  return html`<div class="stack">
    <div><h1 class="h1">Disputes & support</h1><p class="muted mt-2">Referee queue, result reviews, appeals, tickets and player reports.</p></div>
    <${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[
      { value: 'disputes', label: 'Disputes', count: open.length }, { value: 'reviews', label: 'Result reviews', count: d?.reviews.length },
      { value: 'appeals', label: 'Appeals', count: appeals.length }, { value: 'tickets', label: 'Tickets', count: (tickets.data || []).filter((t) => t.status === 'open').length },
      { value: 'reports', label: 'Player reports', count: d?.reports.length }, { value: 'closed', label: 'Closed' },
    ]} />
    <${Async} q=${q}>
      ${() => {
        const list = (rows, empty) => (rows.length ? html`<div class="panel"><div class="panel-body list">${rows}</div></div>` : html`<${Empty} icon="shield" title=${empty} />`);
        const drow = (x, label = 'Decide') => html`<div class="li"><div class="grow"><p class="li-title">${x.match?.title || 'Match'}</p><p class="li-sub">${x.raisedByUser.username} vs ${x.againstUser?.username || '—'} · ${x.reason.replace('_', ' ')} · ${ago(x.createdAt)}</p>${x.appeal && html`<p class="xs">Appeal: ${x.appeal.reason}</p>`}</div><${Badge} tone="warn">${STATUS[x.status]}<//><${Button} size="sm" onClick=${() => setDecide(x)}>${label}<//></div>`;
        if (tab === 'disputes') return list(open.map((x) => drow(x)), 'No open disputes');
        if (tab === 'appeals') return list(appeals.map((x) => drow(x, 'Re-decide')), 'No appeals');
        if (tab === 'reviews') return list(d.reviews.map((m) => html`<div class="li"><div class="grow"><p class="li-title">${m.title}</p><p class="li-sub">${m.players[0]?.username} · ${m.verification?.method} · ${Math.round((m.verification?.confidence || 0) * 100)}% confidence</p></div><${Button} size="sm" onClick=${() => setReview(m)}>Review<//></div>`), 'Review queue is clear');
        if (tab === 'reports') return list(d.reports.map((r) => html`<div class="li"><div class="grow"><p class="li-title">${r.byUser.username} reported ${r.target.username}</p><p class="li-sub">${r.reason} · ${ago(r.at)}</p><p class="xs">${r.details}</p></div><${Button} size="sm" variant="secondary" href=${`/admin/users/${r.userId}`}>Open account<//></div>`), 'No reports');
        if (tab === 'closed') return list(d.disputes.filter((x) => ['resolved', 'rejected'].includes(x.status)).map((x) => html`<div class="li"><div class="grow"><p class="li-title">${x.match?.title || 'Match'}</p><p class="li-sub">${x.resolution?.decision} · ${x.resolution?.by}</p></div><${Badge}>${STATUS[x.status]}<//></div>`), 'Nothing closed yet');
        return list((tickets.data || []).map((t) => html`<div class="li" style="align-items:flex-start"><div class="grow"><p class="li-title">${t.subject}</p><p class="li-sub">${t.user.username} · ${t.category} · ${ago(t.at)}</p><p class="small mt-2">${t.messages[t.messages.length - 1].body}</p></div><${Badge} tone=${t.status === 'open' ? 'warn' : ''}>${t.status}<//>${t.status !== 'closed' && html`<${Button} size="sm" onClick=${() => setReply(t)}>Reply<//>`}</div>`), 'No tickets');
      }}
    <//>
    <${DecideSheet} d=${decide} onClose=${() => setDecide(null)} onDone=${() => q.refresh()} />
    <${ReviewSheet} m=${review} onClose=${() => setReview(null)} onDone=${() => q.refresh()} />
    <${Sheet} open=${!!reply} onClose=${() => setReply(null)} title=${reply?.subject || ''} footer=${html`<${Button} variant="secondary" loading=${send.pending} disabled=${!body} onClick=${() => send.run({ id: reply.id, body, close: false })}>Reply<//><${Button} loading=${send.pending} disabled=${!body} onClick=${() => send.run({ id: reply.id, body, close: true })}>Reply and close<//>`}>
      ${reply && html`<div class="stack">${reply.messages.map((m) => html`<p class="small"><strong>${m.from === 'support' ? 'Support' : reply.user.username}:</strong> ${m.body}</p>`)}<${Textarea} label="Your reply" value=${body} onInput=${setBody} /></div>`}
    <//>
  </div>`;
}

// ---- Fraud ----------------------------------------------------------------------------------------
const KIND = { win_spike: 'Win spike', deposit_velocity: 'Deposit velocity', collusion: 'Collusion pattern', arcade_telemetry: 'Arcade telemetry', false_report: 'False result report' };
export function Fraud() {
  const q = useRpc('admin.fraud');
  const act = useAction('admin.fraudAction', { success: 'Alert handled', onSuccess: () => q.refresh() });
  return html`<div class="stack">
    <div><h1 class="h1">Fraud & risk</h1><p class="muted mt-2">Signals from deposits, results, arcade telemetry and repeat pairings.</p></div>
    <${Async} q=${q} empty=${html`<${Empty} icon="shield" title="No alerts" />`}>
      ${(rows) => html`<div class="panel"><div class="table-wrap"><table class="table">
        <thead><tr><th>Player</th><th>Signal</th><th>Detail</th><th>Severity</th><th>When</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows.map((f) => html`<tr><td><div class="row tight"><${Avatar} user=${f.user} size="sm" online=${false} /><a class="strong" href=${`#/admin/users/${f.user.id}`}>${f.user.username}</a></div></td><td class="small">${KIND[f.kind] || f.kind}</td><td class="small">${f.detail}</td>
          <td><${Badge} tone=${f.severity === 'high' ? 'err' : 'warn'}>${f.severity}<//></td><td class="xs muted">${ago(f.at)}</td><td>${f.status === 'open' ? html`<${Badge} tone="warn">Open<//>` : html`<${Badge}>${f.resolution?.action || 'Resolved'}<//>`}</td>
          <td>${f.status === 'open' && html`<div class="row tight"><${Button} size="sm" variant="ghost" onClick=${() => act.run({ id: f.id, action: 'dismiss' })}>Dismiss<//><${Button} size="sm" variant="secondary" onClick=${() => act.run({ id: f.id, action: 'restrict' })}>Restrict<//><${Button} size="sm" variant="danger" onClick=${() => act.run({ id: f.id, action: 'suspend' })}>Suspend<//></div>`}</td></tr>`)}</tbody>
      </table></div></div>`}
    <//>
  </div>`;
}

// ---- Audit ----------------------------------------------------------------------------------------
export function Audit() {
  const [term, setTerm] = useState('');
  const q = useRpc('admin.audit', { q: term || undefined });
  return html`<div class="stack">
    <div><h1 class="h1">Audit log</h1><p class="muted mt-2">Every privileged and financial action, with actor, target and parameters. Sensitive values are redacted.</p></div>
    <div class="toolbar"><input class="input" type="search" placeholder="Action, target or actor" aria-label="Filter audit log" value=${term} onInput=${(e) => setTerm(e.currentTarget.value)} /></div>
    <${Async} q=${q} empty=${html`<${Empty} icon="doc" title="No matching events" />`}>
      ${(rows) => html`<div class="panel"><div class="table-wrap"><table class="table">
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>IP</th><th>Params</th></tr></thead>
        <tbody>${rows.map((a) => html`<tr><td class="xs muted nowrap">${new Date(a.at).toLocaleString()}</td><td class="small strong">${a.actor.username}</td><td class="small"><code>${a.action}</code></td><td class="xs">${String(a.target ?? '')}</td><td class="xs muted">${a.ip}</td><td class="xs muted truncate" style="max-width:280px">${a.meta?.params ? JSON.stringify(a.meta.params) : ''}</td></tr>`)}</tbody>
      </table></div></div>`}
    <//>
  </div>`;
}
