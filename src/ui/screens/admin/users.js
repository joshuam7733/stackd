import { html, useState } from '../../../lib/preact.js';
import { useRpc, useAction } from '../../hooks.js';
import { navigate, setQuery } from '../../router.js';
import { Icon } from '../../icons.js';
import { Button, Badge, Sk, ErrorBox, Avatar, Rank, Async, Empty, Notice, Sheet, Input, Textarea, Confirm, Stat } from '../../components/base.js';
import { money, short, ago, TX, STATUS } from '../../format.js';

const STATUS_TONE = { active: 'money', restricted: 'warn', suspended: 'err' };
const KYC_TONE = { verified: 'money', pending: 'warn', rejected: 'err', none: '' };

export function Users({ query }) {
  const [term, setTerm] = useState(query.q || '');
  const q = useRpc('admin.users', { q: query.q || undefined, status: query.status || undefined, kyc: query.kyc || undefined, role: query.role || undefined });
  return html`<div class="stack">
    <div><h1 class="h1">Users</h1><p class="muted mt-2">Search, verify, restrict and review accounts. Demo players are marked.</p></div>
    <form class="toolbar" onSubmit=${(e) => { e.preventDefault(); setQuery({ q: term }); }}>
      <input class="input" type="search" placeholder="Username, email or ID" aria-label="Search users" value=${term} onInput=${(e) => setTerm(e.currentTarget.value)} />
      <select class="select" aria-label="Status" value=${query.status || ''} onChange=${(e) => setQuery({ status: e.currentTarget.value })}><option value="">Any status</option><option value="active">Active</option><option value="restricted">Restricted</option><option value="suspended">Suspended</option></select>
      <select class="select" aria-label="KYC" value=${query.kyc || ''} onChange=${(e) => setQuery({ kyc: e.currentTarget.value })}><option value="">Any KYC</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="none">Not started</option><option value="rejected">Rejected</option></select>
      <select class="select" aria-label="Role" value=${query.role || ''} onChange=${(e) => setQuery({ role: e.currentTarget.value })}><option value="">Any role</option><option value="player">Player</option><option value="sponsor">Sponsor</option><option value="admin">Admin</option></select>
      <${Button} type="submit" size="sm">Search<//>
    </form>
    <${Async} q=${q} empty=${html`<${Empty} icon="users" title="No users match" body="Loosen the filters." />`}>
      ${(rows) => html`<div class="panel"><div class="table-wrap"><table class="table">
        <thead><tr><th>Player</th><th>Status</th><th>KYC</th><th>Country</th><th class="r">Score</th><th class="r">Matches</th><th class="r">Balance</th><th class="r">Flags</th><th>Joined</th></tr></thead>
        <tbody>${rows.map((u) => html`<tr class="clickable" onClick=${() => navigate(`/admin/users/${u.id}`)}>
          <td><div class="row tight"><${Avatar} user=${u} size="sm" online=${false} /><div><a class="strong" href=${`#/admin/users/${u.id}`}>${u.username}</a><p class="xs muted">${u.email}${u.demo ? ' · demo' : ''}</p></div></div></td>
          <td><${Badge} tone=${STATUS_TONE[u.status]}>${u.status}<//></td>
          <td><${Badge} tone=${KYC_TONE[u.kyc]}>${u.kyc}<//></td>
          <td>${u.country}</td><td class="r num">${u.stackScore ?? '—'}</td><td class="r num">${u.matches}</td><td class="r num">${short(u.balance)}</td>
          <td class="r">${u.flags ? html`<${Badge} tone="err">${u.flags}<//>` : '—'}</td><td class="xs muted">${ago(u.createdAt)}</td>
        </tr>`)}</tbody>
      </table></div></div>`}
    <//>
  </div>`;
}

export function UserDetail({ params }) {
  const q = useRpc('admin.user', { id: params.id });
  const [confirm, setConfirm] = useState(null);
  const [note, setNote] = useState('');
  const [adj, setAdj] = useState(false);
  const [amt, setAmt] = useState('');
  const [reason, setReason] = useState('');
  const act = useAction('admin.userAction', { success: 'Account updated', onSuccess: () => { setConfirm(null); setNote(''); q.refresh(); } });
  const adjust = useAction('admin.adjust', { success: 'Adjustment posted to the ledger', onSuccess: () => { setAdj(false); setAmt(''); setReason(''); q.refresh(); } });
  if (q.loading && !q.data) return html`<${Sk} h=${400} r="14" />`;
  if (q.error) return html`<${ErrorBox} error=${q.error} retry=${q.reload} />`;
  const { user: u, ledger, matches, fraud, audit, teams, reports } = q.data;
  const A = (action, label, variant = 'secondary', danger) => html`<${Button} size="sm" variant=${variant} onClick=${() => setConfirm({ action, label, danger })}>${label}<//>`;
  return html`<div class="stack loose">
    <a class="back" href="#/admin/users"><${Icon} name="chevL" />Users</a>
    <div class="row wrap" style="gap:var(--s-4)">
      <${Avatar} user=${u} size="lg" />
      <div class="grow"><h1 class="h1">${u.username}</h1><p class="small muted">${u.email} · ${u.id} · ${u.countryName} · age ${u.age}</p>
        <div class="row wrap tight mt-2"><${Badge} tone=${STATUS_TONE[u.status]}>${u.status}<//><${Badge} tone=${KYC_TONE[u.kyc.status]}>KYC ${u.kyc.status}<//><${Rank} rank=${u.rank} />${Object.entries(u.restrictions).filter(([, v]) => v).map(([k]) => html`<${Badge} tone="err">${k} off<//>`)}</div>
      </div>
    </div>
    <div class="panel"><div class="panel-head"><span class="strong">Actions</span></div><div class="panel-body row wrap" style="gap:var(--s-2)">
      ${u.kyc.status === 'pending' && [A('verify_kyc', 'Approve KYC', 'money'), A('reject_kyc', 'Reject KYC', 'danger')]}
      ${u.kyc.status !== 'verified' && u.kyc.status !== 'pending' && A('verify_kyc', 'Mark verified')}
      ${u.status === 'active' && A('restrict', 'Restrict paid play', 'secondary', true)}
      ${u.status === 'restricted' && A('unrestrict', 'Lift restriction')}
      ${u.status !== 'suspended' ? A('suspend', 'Suspend', 'danger', true) : A('reinstate', 'Reinstate')}
      ${A('toggle_real_money', u.restrictions.realMoney ? 'Allow real money' : 'Block real money')}
      ${A('toggle_staking', u.restrictions.staking ? 'Allow backing' : 'Block backing')}
      ${A('toggle_predictions', u.restrictions.predictions ? 'Allow predictions' : 'Block predictions')}
      <${Button} size="sm" variant="ghost" icon="wallet" onClick=${() => setAdj(true)}>Ledger adjustment<//>
    </div></div>
    <div class="kpis">
      <div class="kpi"><span class="l">Available</span><span class="v">${short(u.wallet.available)}</span><span class="d">${money(u.wallet.cash)} cash</span></div>
      <div class="kpi"><span class="l">STACK Score</span><span class="v">${u.stackScore}</span></div>
      <div class="kpi"><span class="l">Matches</span><span class="v">${u.stats.matches}</span><span class="d">${u.stats.winRate}% win rate</span></div>
      <div class="kpi"><span class="l">Earnings</span><span class="v">${short(u.stats.earnings)}</span></div>
      <div class="kpi"><span class="l">Limits</span><span class="v" style="font-size:20px">${u.limits.dailyDeposit ? short(u.limits.dailyDeposit) : 'Default'}</span><span class="d">${u.selfExcludedUntil > Date.now() ? 'Self-excluded' : u.coolOffUntil > Date.now() ? 'On a break' : 'No exclusions'}</span></div>
    </div>
    ${fraud.length > 0 && html`<${Notice} tone="err" title=${`${fraud.length} fraud alert(s)`}>${fraud.map((f) => html`<p>${f.detail} (${f.status})</p>`)}<//>`}
    <div class="split">
      <div class="panel"><div class="panel-head"><span class="strong">Ledger</span></div><div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Type</th><th>Description</th><th>Status</th><th class="r">Amount</th></tr></thead><tbody>
        ${ledger.map((t) => html`<tr><td class="xs muted">${ago(t.createdAt)}</td><td>${TX[t.type]}</td><td class="small truncate" style="max-width:240px">${t.description}</td><td><${Badge} tone=${t.status === 'completed' ? '' : t.status === 'pending' ? 'warn' : 'err'}>${t.status}<//></td><td class=${`r num strong ${t.amount > 0 ? 'money' : ''}`}>${money(t.amount, { sign: true, cur: false })}</td></tr>`)}
      </tbody></table></div></div>
      <div class="stack">
        <div class="panel"><div class="panel-head"><span class="strong">Matches</span></div><div class="panel-body list">${matches.map((m) => html`<div class="li"><span class="grow small">${m.title}</span><${Badge}>${m.status}<//>${m.result && html`<${Badge} tone=${m.result.won ? 'money' : ''}>${m.result.won ? 'W' : 'L'}<//>`}</div>`)}</div></div>
        <div class="panel"><div class="panel-head"><span class="strong">Audit trail</span></div><div class="panel-body list">${audit.length ? audit.map((a) => html`<div class="li"><span class="grow xs">${a.action}</span><span class="xs faint">${ago(a.at)}</span></div>`) : html`<p class="small muted">No events.</p>`}</div></div>
        ${reports.length > 0 && html`<div class="panel"><div class="panel-head"><span class="strong">Player reports</span></div><div class="panel-body list">${reports.map((r) => html`<div class="li"><span class="grow small">${r.reason}: ${r.details}</span></div>`)}</div></div>`}
        ${teams.length > 0 && html`<p class="small muted">Teams: ${teams.map((t) => t.name).join(', ')}</p>`}
      </div>
    </div>
    <${Sheet} open=${!!confirm} onClose=${() => setConfirm(null)} title=${confirm?.label || ''} footer=${html`<${Button} variant="secondary" onClick=${() => setConfirm(null)}>Keep it<//><${Button} variant=${confirm?.danger ? 'danger' : 'primary'} loading=${act.pending} onClick=${() => act.run({ id: u.id, action: confirm.action, note: note || undefined })}>${confirm?.label}<//>`}>
      <p class="small muted">${u.username} gets a notification. This action is written to the audit log.</p>
      <${Textarea} label="Note" optional value=${note} onInput=${setNote} placeholder="Reason shown to the player and kept for audit" />
    <//>
    <${Sheet} open=${adj} onClose=${() => setAdj(false)} title="Ledger adjustment" footer=${html`<${Button} block loading=${adjust.pending} disabled=${!amt || Number(amt) === 0 || reason.trim().length < 5} onClick=${() => adjust.run({ userId: u.id, amount: Number(amt), reason })}>Post adjustment<//>`}>
      <${Notice} tone="warn">Balances are never edited. This appends a bonus (positive) or reversal (negative) entry, with your name on it.<//>
      <${Input} label="Amount (negative to reverse)" prefix="UGX" value=${amt} onInput=${(v) => setAmt(v.replace(/[^0-9-]/g, ''))} />
      <${Input} label="Reason" value=${reason} onInput=${setReason} />
    <//>
  </div>`;
}
