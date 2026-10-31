import { html, useState } from '../../../lib/preact.js';
import { useRpc, useAction } from '../../hooks.js';
import { setQuery } from '../../router.js';
import { Button, Badge, Async, Empty, Avatar, Sheet, Input, Textarea, Notice } from '../../components/base.js';
import { money, short, ago, TX, STATUS } from '../../format.js';

export function WalletAdmin({ query }) {
  const type = query.type || '';
  const status = query.status || '';
  const [term, setTerm] = useState('');
  const q = useRpc('admin.ledger', { type: type || undefined, status: status || undefined, q: term || undefined });
  const pending = useRpc('admin.ledger', { type: 'withdrawal', status: 'pending' });
  const [reject, setReject] = useState(null);
  const [note, setNote] = useState('');
  const [refund, setRefund] = useState(null);
  const [reason, setReason] = useState('');
  const act = useAction('admin.withdrawalAction', { success: (t) => (t.status === 'completed' ? 'Withdrawal approved' : 'Withdrawal declined, funds returned'), onSuccess: () => { setReject(null); setNote(''); pending.refresh(); q.refresh(); } });
  const ref = useAction('admin.refund', { success: 'Refund posted', onSuccess: () => { setRefund(null); setReason(''); q.refresh(); } });
  const t = q.data?.totals;
  return html`<div class="stack loose">
    <div><h1 class="h1">Wallet & payouts</h1><p class="muted mt-2">Append-only ledger. Approve withdrawals, issue refunds. All money here is simulated.</p></div>
    ${t && html`<div class="kpis">
      <div class="kpi"><span class="l">Deposits</span><span class="v">${short(t.deposits)}</span></div>
      <div class="kpi"><span class="l">Withdrawals paid</span><span class="v">${short(t.withdrawals)}</span></div>
      <div class="kpi alert"><span class="l">Pending withdrawals</span><span class="v">${short(t.pendingWithdrawals)}</span></div>
      <div class="kpi"><span class="l">Entries</span><span class="v">${short(t.entries)}</span></div>
      <div class="kpi"><span class="l">Prizes paid</span><span class="v">${short(t.prizes)}</span></div>
    </div>`}
    <div class="panel"><div class="panel-head"><span class="strong">Withdrawal queue</span><${Badge} tone="warn">${pending.data?.rows.length || 0}<//></div>
      <${Async} q=${pending}>${(d) => (d.rows.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Player</th><th>Method</th><th class="r">Amount</th><th class="r">Fee</th><th>Requested</th><th></th></tr></thead><tbody>
        ${d.rows.map((x) => html`<tr><td><div class="row tight"><${Avatar} user=${x.user} size="sm" online=${false} /><a class="strong" href=${`#/admin/users/${x.user.id}`}>${x.user.username}</a></div></td><td class="small">${x.provider}${x.meta?.msisdnMasked ? ` ${x.meta.msisdnMasked}` : ''}</td><td class="r num strong">${money(-x.amount)}</td><td class="r num">${money(x.meta?.fee || 0)}</td><td class="xs muted">${ago(x.createdAt)}</td>
          <td><div class="row tight"><${Button} size="sm" variant="money" loading=${act.pending} onClick=${() => act.run({ id: x.id, approve: true })}>Approve<//><${Button} size="sm" variant="danger" onClick=${() => setReject(x)}>Decline<//></div></td></tr>`)}
      </tbody></table></div>` : html`<div class="panel-body"><p class="small muted">Queue is clear.</p></div>`)}<//>
    </div>
    <div class="stack">
      <div class="toolbar">
        <input class="input" type="search" placeholder="Player or transaction ID" aria-label="Search ledger" value=${term} onInput=${(e) => setTerm(e.currentTarget.value)} />
        <select class="select" aria-label="Type" value=${type} onChange=${(e) => setQuery({ type: e.currentTarget.value })}><option value="">All types</option>${Object.entries(TX).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>
        <select class="select" aria-label="Status" value=${status} onChange=${(e) => setQuery({ status: e.currentTarget.value })}><option value="">Any status</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option></select>
      </div>
      <${Async} q=${q} empty=${html`<${Empty} icon="wallet" title="No transactions" />`}>
        ${(d) => html`<div class="panel"><div class="table-wrap"><table class="table">
          <thead><tr><th>ID</th><th>Player</th><th>Type</th><th>Description</th><th>Status</th><th class="r">Amount</th><th>When</th><th></th></tr></thead>
          <tbody>${d.rows.map((x) => html`<tr><td class="xs muted">${x.id.slice(0, 14)}</td><td class="small strong">${x.user.username}</td><td class="small">${TX[x.type]}</td><td class="small truncate" style="max-width:260px">${x.description}</td>
            <td><${Badge} tone=${x.status === 'completed' ? '' : x.status === 'pending' ? 'warn' : 'err'}>${STATUS[x.status]}<//></td><td class=${`r num strong ${x.amount > 0 ? 'money' : ''}`}>${money(x.amount, { sign: true, cur: false })}</td><td class="xs muted">${ago(x.createdAt)}</td>
            <td>${['entry', 'stake', 'prediction'].includes(x.type) && x.status === 'completed' && html`<${Button} size="sm" variant="ghost" onClick=${() => setRefund(x)}>Refund<//>`}</td></tr>`)}</tbody>
        </table></div></div>`}
      <//>
    </div>
    <${Sheet} open=${!!reject} onClose=${() => setReject(null)} title="Decline withdrawal" footer=${html`<${Button} variant="danger" block loading=${act.pending} onClick=${() => act.run({ id: reject.id, approve: false, note: note || undefined })}>Decline and return funds<//>`}>
      <${Notice} tone="info">The amount goes back to the player's stack automatically.<//>
      <${Textarea} label="Reason shown to the player" value=${note} onInput=${setNote} placeholder="Account name didn't match the mobile money number." />
    <//>
    <${Sheet} open=${!!refund} onClose=${() => setRefund(null)} title="Refund entry" footer=${html`<${Button} block loading=${ref.pending} disabled=${reason.trim().length < 3} onClick=${() => ref.run({ txId: refund.id, reason })}>Refund ${refund ? money(-refund.amount) : ''}<//>`}>
      <p class="small muted">${refund?.description}</p>
      <${Input} label="Reason" value=${reason} onInput=${setReason} />
    <//>
  </div>`;
}
