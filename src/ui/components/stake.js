import { html, useState, useEffect } from '../../lib/preact.js';
import { useAction, useSession, useMeta } from '../hooks.js';
import { Icon } from '../icons.js';
import { Button, Notice } from './base.js';
import { money, short } from '../format.js';

const PRESETS = [1000, 5000, 20000, 100000, 1000000];

/** Big number that shrinks to fit long amounts. */
export function FitMoney({ n, max = 44, cls = '' }) {
  const digits = Math.round(n || 0).toLocaleString('en-US').length;
  const size = Math.max(22, Math.min(max, Math.round((max * 9) / Math.max(9, digits))));
  return html`<span class=${`row tight ${cls}`} style="align-items:baseline;gap:6px;min-width:0"><span class="small strong muted">UGX</span><span class="big-num" style=${`font-size:${size}px;overflow-wrap:anywhere`}>${Math.round(n || 0).toLocaleString('en-US')}</span></span>`;
}

/**
 * Stake picker with no fixed menu: presets, any custom amount, or Max (your whole available stack).
 * value / onChange are numbers in UGX.
 */
export function StakeInput({ value, onChange, label = 'Your stake', max: maxCap }) {
  const { user, refresh } = useSession();
  const meta = useMeta().data;
  const [text, setText] = useState(String(value || ''));
  useEffect(() => {
    if (Number(text.replace(/,/g, '')) !== value) setText(value ? value.toLocaleString('en-US') : '');
  }, [value]);
  const min = meta?.challengeEntry?.min ?? 1000;
  const cap = maxCap ?? meta?.challengeEntry?.max ?? 1_000_000_000;
  const avail = Math.max(0, Math.floor(user.wallet.available));
  const hs = meta?.highStakesKyc;
  const top = useAction('wallet.demoTopUp', { success: (t) => `${money(t.amount)} demo credits added`, onSuccess: refresh });
  const set = (n) => {
    onChange(n);
    setText(n ? n.toLocaleString('en-US') : '');
  };
  const err = value && value < min ? `Minimum stake is ${money(min)}.` : value > cap ? `Maximum stake right now is ${money(cap)}.` : null;
  const short_ = value > avail;
  return html`<div class="stack tight">
    <div class="row between"><span class="label">${label}</span><span class="xs muted">In your stack: <strong class="num" style="color:var(--text)">${money(avail)}</strong></span></div>
    <div class="stake-box ${err ? 'bad' : ''}">
      <span class="stake-cur">UGX</span>
      <input class="stake-in" inputmode="numeric" aria-label=${label} placeholder="Any amount" value=${text}
        onInput=${(e) => {
          const raw = e.currentTarget.value.replace(/[^0-9]/g, '').slice(0, 13);
          const n = raw ? Number(raw) : 0;
          setText(raw ? n.toLocaleString('en-US') : '');
          onChange(n);
        }} />
      ${value >= 10000 && html`<span class="stake-short">${short(value)}</span>`}
    </div>
    <div class="amount-picker stake-presets" role="group" aria-label="Quick amounts">
      ${PRESETS.map((a) => html`<button type="button" aria-pressed=${value === a ? 'true' : 'false'} onClick=${() => set(a)}>${short(a)}</button>`)}
      <button type="button" aria-pressed=${value === avail && avail > 0 ? 'true' : 'false'} onClick=${() => set(Math.min(avail, cap))} disabled=${avail < min}>Max</button>
    </div>
    ${err && html`<p class="error-msg" role="alert"><${Icon} name="alert" size="14" />${err}</p>`}
    ${!err && short_ && html`<${Notice} tone="warn" title="That's more than your stack" action=${meta?.demoMode !== false && html`<${Button} size="sm" variant="secondary" loading=${top.pending} onClick=${() => top.run({ amount: [100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000].find((x) => x >= value - avail) || 1_000_000_000 })}>Add demo credits<//>`}>
      You need ${money(value - avail)} more. ${meta?.demoMode !== false ? 'In demo mode you can top up instantly.' : ''}<//>`}
    ${hs && value >= hs && user.kyc?.status !== 'verified' && html`<${Notice} tone="info" title="High-stakes entry" action=${html`<${Button} size="sm" variant="secondary" href="/app/settings?tab=verify">Verify ID<//>`}>Stakes of ${money(hs)} or more need a verified ID.<//>`}
  </div>`;
}
