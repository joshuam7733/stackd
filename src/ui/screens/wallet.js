import { html, useState, useEffect, useRef } from '../../lib/preact.js';
import { useRpc, useSession, toast } from '../hooks.js';
import { navigate, setQuery } from '../router.js';
import { rpc, newKey } from '../../client/api.js';
import { Icon } from '../icons.js';
import { Button, Badge, Chips, Empty, Async, Sk, PageHead, Notice, Sheet, Input, AmountPicker, ListSkeleton, BigMoney } from '../components/base.js';
import { StackCard, TxRow } from '../components/cards.js';
import { money, short, ago, when, TX, STATUS } from '../format.js';

const PROVIDER_ICON = { mobile_money: 'phone', card: 'card', bank: 'bank' };

function MoneySheet({ open, onClose, direction, summary, onDone }) {
  const { user, refresh } = useSession();
  const providers = summary?.providers || [];
  const [prov, setProv] = useState(providers[0]?.id);
  const [amount, setAmount] = useState(direction === 'deposit' ? 20000 : 10000);
  const [custom, setCustom] = useState('');
  const [msisdn, setMsisdn] = useState('0772000000');
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState(null);
  const key = useRef(newKey());
  useEffect(() => {
    if (open) {
      setProv(providers[0]?.id);
      setTx(null);
      setErr({});
      setCustom('');
      key.current = newKey();
    }
  }, [open]);
  useEffect(() => {
    if (open && !providers.some((x) => x.id === prov) && providers.length) setProv(providers[0].id);
  }, [open, providers.length]);
  const live = useRpc('wallet.tx', { id: tx?.id || 'x' }, { skip: !tx });
  const p = providers.find((x) => x.id === prov);
  const value = custom ? Number(custom) : amount;
  const fee = p ? Math.ceil((value * (p.feePct[direction === 'deposit' ? 'deposit' : 'withdraw'] || 0)) / 100) : 0;
  const gate = direction === 'deposit' ? summary?.canDeposit : summary?.canWithdraw;
  const maxW = Math.max(0, summary?.balances.cash || 0);

  const validate = () => {
    const e = {};
    if (!Number.isInteger(value) || value <= 0) e.amount = 'Enter a whole amount.';
    else if (p && value < p.min) e.amount = `Minimum is ${money(p.min)}.`;
    else if (p && value > p.max) e.amount = `Maximum is ${money(p.max)}.`;
    else if (direction === 'withdraw' && value > maxW) e.amount = `You can withdraw up to ${money(maxW)}.`;
    if (p?.field && !new RegExp(p.field.pattern).test(msisdn.replace(/\s+/g, ''))) e.msisdn = `Enter a valid ${p.field.label.toLowerCase()}.`;
    setErr(e);
    return !Object.keys(e).length;
  };
  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const r = await rpc(direction === 'deposit' ? 'wallet.deposit' : 'wallet.withdraw', { provider: prov, amount: value, msisdn: p?.field ? msisdn.replace(/\s+/g, '') : undefined }, { idempotencyKey: key.current });
      setTx(r);
      refresh();
    } catch (e) {
      setErr({ form: e.message });
    } finally {
      setBusy(false);
    }
  };
  const status = live.data?.status || tx?.status;
  const title = direction === 'deposit' ? 'Deposit' : 'Withdraw';
  return html`<${Sheet} open=${open} onClose=${onClose} title=${title} footer=${tx
      ? html`<${Button} block size="lg" variant=${status === 'pending' ? 'secondary' : 'primary'} onClick=${() => { onClose(); onDone?.(); }}>${status === 'pending' ? 'Close, it finishes in the background' : 'Done'}<//>`
      : html`<${Button} block size="lg" loading=${busy} disabled=${!gate?.allowed} onClick=${submit}>${title} ${money(value || 0)}<//>`}>
    <${Notice} tone="warn" title="Simulated payments">This prototype never contacts MTN, Airtel, card networks or banks. Amounts ending in 13 simulate a declined payment.<//>
    ${tx ? html`<div class="stack" style="align-items:center;text-align:center;padding:var(--s-6) 0">
        ${status === 'pending' ? html`<span class="spin" style="width:34px;height:34px"></span>` : html`<span class=${`badge ${status === 'completed' ? 'money' : 'err'}`} style="height:34px;padding:0 14px;font-size:14px">${status === 'completed' ? 'Completed' : 'Failed'}</span>`}
        <p class="h2">${status === 'pending' ? (direction === 'deposit' ? p?.approveCopy || 'Processing…' : 'Withdrawal under review') : status === 'completed' ? (direction === 'deposit' ? 'Your stack is topped up' : 'Payout sent') : 'That payment didn’t go through'}</p>
        <${BigMoney} n=${Math.abs(tx.amount)} size=${48} cls=${status === 'completed' ? 'money' : ''} />
        <p class="small muted">${status === 'failed' ? `${live.data?.meta?.providerMessage || 'Declined by provider.'} Nothing was taken from your account.` : direction === 'withdraw' && status === 'pending' ? 'Withdrawals are checked before they go out. In the demo this takes about a minute.' : `Reference ${tx.id}`}</p>
        <a class="link small" href=${`#/app/wallet/tx/${tx.id}`} onClick=${onClose}>View transaction</a>
      </div>`
    : html`<div class="stack">
      ${gate && !gate.allowed && html`<${Notice} tone="err" title=${`You can't ${direction} right now`} action=${gate.reasons.some((r) => r.code === 'KYC') ? html`<${Button} size="sm" href="/app/settings?tab=verify" onClick=${onClose}>Verify ID<//>` : null}>${gate.reasons.map((r) => html`<p>${r.message}</p>`)}<//>`}
      ${err.form && html`<${Notice} tone="err">${err.form}<//>`}
      <div class="field"><span class="label">${direction === 'deposit' ? 'Pay with' : 'Send to'}</span>
        <div class="stack tight">${providers.map((x) => html`<button type="button" class="opt-tile" aria-pressed=${prov === x.id ? 'true' : 'false'} onClick=${() => setProv(x.id)}>
          <${Icon} name=${PROVIDER_ICON[x.kind]} /><div class="grow"><p class="strong small">${x.name}</p><p class="xs muted">${x.feePct[direction === 'deposit' ? 'deposit' : 'withdraw'] ? `${x.feePct[direction === 'deposit' ? 'deposit' : 'withdraw']}% fee` : 'No fee'} · min ${short(x.min)}</p></div><span class="check"><${Icon} name="check" /></span>
        </button>`)}</div>
      </div>
      <div class="field"><span class="label">Amount</span>
        <${AmountPicker} value=${custom ? null : amount} onChange=${(v) => { setAmount(v); setCustom(''); }} amounts=${direction === 'deposit' ? [10000, 20000, 50000, 100000, 200000] : [5000, 10000, 20000, 50000].filter((a) => a <= Math.max(maxW, 5000))} />
        <${Input} label="Or enter an amount" prefix="UGX" inputmode="numeric" value=${custom} error=${err.amount} onInput=${(v) => setCustom(v.replace(/[^0-9]/g, ''))} hint=${direction === 'withdraw' ? `Withdrawable: ${money(maxW)}. Bonus credit can't be withdrawn.` : undefined} />
      </div>
      ${p?.field && html`<${Input} label=${p.field.label} inputmode="tel" autocomplete="tel" value=${msisdn} error=${err.msisdn} hint=${`${p.field.hint}. Demo number prefilled.`} onInput=${setMsisdn} />`}
      ${!p?.field && p && html`<p class="small muted">${p.approveCopy}</p>`}
      <dl class="kv"><dt>Amount</dt><dd>${money(value || 0)}</dd><dt>Provider fee</dt><dd>${fee ? money(fee) : 'None'}</dd><dt>${direction === 'deposit' ? 'Added to your stack' : "You'll receive"}</dt><dd class="money">${money(Math.max(0, (value || 0) - (direction === 'withdraw' ? fee : 0)))}</dd></dl>
    </div>`}
  <//>`;
}

const FILTERS = [['', 'All'], ['deposit', 'Deposits'], ['withdrawal', 'Withdrawals'], ['entry', 'Entries'], ['winnings', 'Winnings'], ['rewards', 'Rewards'], ['refund', 'Refunds']];

export function Wallet({ query }) {
  const { user } = useSession();
  const s = useRpc('wallet.summary');
  const type = query.type || '';
  const txs = useRpc('wallet.transactions', { type: type || undefined, limit: 100 });
  const sheet = query.sheet;
  const b = s.data?.balances;
  return html`<div class="container page">
    <${PageHead} title="Wallet" sub="Your stack, every entry and every payout. All amounts are demo credits." />
    <div class="with-rail">
      <div class="stack" style="gap:var(--s-6);min-width:0">
        ${b ? html`<${StackCard} wallet=${b} />` : html`<${Sk} h=${300} r="14" />`}
        ${b && html`<div class="grid-4">
          <div class="card"><p class="xs muted">Withdrawable</p><p class="big-num" style="font-size:28px">${short(Math.max(0, b.cash))}</p></div>
          <div class="card"><p class="xs muted">Bonus credit</p><p class="big-num" style="font-size:28px">${short(b.bonus)}</p></div>
          <div class="card"><p class="xs muted">Pending in</p><p class="big-num" style="font-size:28px">${short(b.pending)}</p></div>
          <div class="card"><p class="xs muted">Held for withdrawal</p><p class="big-num" style="font-size:28px">${short(b.held)}</p></div>
        </div>`}
        <div>
          <div class="section-head"><h2>Transactions</h2></div>
          <${Chips} label="Filter" value=${type} onChange=${(v) => setQuery({ type: v })} options=${FILTERS.map(([value, label]) => ({ value, label }))} />
          <div class="card mt-4">
            <${Async} q=${txs} skeleton=${html`<${ListSkeleton} n=${6} />`} empty=${html`<${Empty} icon="wallet" title="Nothing here yet" body="Entries, prizes and deposits show up here the moment they happen." />`}>
              ${(l) => html`<div class="list">${l.map((t) => html`<${TxRow} t=${t} />`)}</div>`}
            <//>
          </div>
        </div>
      </div>
      <aside class="stack" style="gap:var(--s-4)">
        <div class="card stack tight">
          <p class="strong small">Payment methods in ${user.countryName}</p>
          ${(s.data?.providers || []).map((p) => html`<div class="li"><${Icon} name=${PROVIDER_ICON[p.kind]} size="20" /><span class="grow small">${p.name}</span><${Badge}>Simulated<//></div>`)}
        </div>
        <div class="card stack tight">
          <p class="strong small">Identity</p>
          ${user.kyc.status === 'verified' ? html`<p class="small row tight"><${Icon} name="shield" size="16" cls="money" />Verified. Withdrawals unlocked.</p>` : html`<p class="small muted">${user.kyc.status === 'pending' ? 'Verification in progress.' : 'Verify your ID to withdraw.'}</p><${Button} size="sm" variant="secondary" href="/app/settings?tab=verify">Verify ID<//>`}
        </div>
        <div class="card stack tight">
          <p class="strong small">Limits</p>
          <dl class="kv"><dt>Daily deposit</dt><dd>${user.limits.dailyDeposit ? money(user.limits.dailyDeposit) : `Country max ${money(user.jurisdiction?.dailyDepositLimit || 0)}`}</dd><dt>Daily entries</dt><dd>${user.limits.dailyEntry ? money(user.limits.dailyEntry) : 'No limit set'}</dd></dl>
          <a class="text-btn" href="#/app/settings?tab=play">Responsible play settings<${Icon} name="chevR" /></a>
        </div>
      </aside>
    </div>
    <${MoneySheet} open=${sheet === 'deposit'} direction="deposit" summary=${s.data} onClose=${() => setQuery({ sheet: '' })} />
    <${MoneySheet} open=${sheet === 'withdraw'} direction="withdraw" summary=${s.data} onClose=${() => setQuery({ sheet: '' })} />
  </div>`;
}

export function TxDetail({ params }) {
  const q = useRpc('wallet.tx', { id: params.id });
  const t = q.data;
  if (q.loading && !t) return html`<div class="container page"><${Sk} h=${300} r="14" /></div>`;
  if (q.error) return html`<div class="container page"><${Empty} icon="alert" title="Transaction not found" body=${q.error.message} action=${html`<${Button} href="/app/wallet">Wallet<//>`} /></div>`;
  const refLink = t.ref ? { competition: `/app/compete/${t.ref.id}`, match: `/app/match/${t.ref.id}`, tournament: `/app/tournaments/${t.ref.id}`, mission: `/app/missions/${t.ref.id}`, arcade: '/app/arcade', stake: '/app/players?tab=mine', market: '/app/predictions?tab=mine' }[t.ref.kind] : null;
  return html`<div class="container page" style="max-width:720px">
    <a class="back" href="#/app/wallet"><${Icon} name="chevL" />Wallet</a>
    <div class="card pad-lg stack" style="align-items:flex-start">
      <div class="row wrap tight"><${Badge}>${TX[t.type]}<//><${Badge} tone=${t.status === 'completed' ? 'money' : t.status === 'pending' ? 'warn' : 'err'}>${STATUS[t.status]}<//>${t.bucket === 'bonus' && html`<${Badge}>Bonus credit<//>`}</div>
      <p class=${`big-num ${t.amount > 0 ? 'money' : ''}`} style="font-size:clamp(56px,10vw,88px)">${money(t.amount, { sign: true })}</p>
      <p class="h3" style="font-weight:600">${t.description}</p>
      <dl class="kv" style="width:100%">
        <dt>Date</dt><dd>${new Date(t.createdAt).toLocaleString()}</dd>
        ${t.updatedAt !== t.createdAt && html`<dt>Last update</dt><dd>${new Date(t.updatedAt).toLocaleString()}</dd>`}
        <dt>Transaction ID</dt><dd><button type="button" class="text-btn" onClick=${() => { navigator.clipboard?.writeText(t.id); toast.ok('ID copied'); }}>${t.id}<${Icon} name="copy" /></button></dd>
        ${t.providerName && html`<dt>Provider</dt><dd>${t.providerName} (simulated)</dd>`}
        ${t.meta?.msisdnMasked && html`<dt>Account</dt><dd>${t.meta.msisdnMasked}</dd>`}
        ${t.meta?.providerRef && html`<dt>Provider ref</dt><dd>${t.meta.providerRef}</dd>`}
        ${t.meta?.fee != null && html`<dt>Fee</dt><dd>${money(t.meta.fee)}</dd>`}
        ${t.meta?.receive != null && html`<dt>You receive</dt><dd>${money(t.meta.receive)}</dd>`}
        ${t.meta?.reviewedBy && html`<dt>Reviewed by</dt><dd>${t.meta.reviewedBy}</dd>`}
        ${t.ref && html`<dt>Related</dt><dd>${refLink ? html`<a class="link" href=${'#' + refLink}>${t.ref.label}</a>` : t.ref.label}</dd>`}
      </dl>
      ${t.status === 'failed' && html`<${Notice} tone="info">Failed transactions never move money. Nothing was taken from your stack.<//>`}
      ${t.related?.length > 0 && html`<div style="width:100%"><p class="strong small mb-2">Linked entries</p><div class="list">${t.related.map((r) => html`<${TxRow} t=${r} />`)}</div></div>`}
    </div>
    <p class="xs faint mt-4">Ledger entries are append-only. Corrections show as separate reversal or refund entries, never as edits.</p>
  </div>`;
}
