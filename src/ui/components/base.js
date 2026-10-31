import { html, useEffect, useRef, useState } from '../../lib/preact.js';
import { Icon } from '../icons.js';
import { useToasts, useNow } from '../hooks.js';
import { money, initials, until, clock } from '../format.js';
import { Link } from '../router.js';

// ---- Buttons ----------------------------------------------------------------------------------

export function Button({ variant = 'primary', size, block, loading, icon, iconRight, children, class: cls = '', href, type = 'button', ...rest }) {
  const c = `btn btn-${variant} ${size ? 'btn-' + size : ''} ${block ? 'btn-block' : ''} ${loading ? 'is-loading' : ''} ${cls}`;
  const inner = [
    loading ? html`<span class="spin" aria-hidden="true"></span>` : icon ? html`<${Icon} name=${icon} />` : null,
    html`<span>${children}</span>`,
    iconRight && !loading ? html`<${Icon} name=${iconRight} />` : null,
  ];
  if (href) return html`<a class=${c} href=${'#' + href} ...${rest}>${inner}</a>`;
  return html`<button type=${type} class=${c} aria-busy=${loading ? 'true' : undefined} disabled=${rest.disabled || loading} ...${rest}>${inner}</button>`;
}

export function IconButton({ icon, label, badge, size, href, onClick, class: cls = '', ...rest }) {
  const c = `icon-btn ${size || ''} ${cls}`;
  const inner = [html`<${Icon} name=${icon} />`, badge ? html`<span class="dot">${badge > 9 ? '9+' : badge}</span>` : null];
  if (href) return html`<a class=${c} href=${'#' + href} aria-label=${label} title=${label} ...${rest}>${inner}</a>`;
  return html`<button type="button" class=${c} aria-label=${label} title=${label} onClick=${onClick} ...${rest}>${inner}</button>`;
}

export function Badge({ tone = '', icon, children }) {
  return html`<span class=${`badge ${tone}`}>${icon && html`<${Icon} name=${icon} />`}${children}</span>`;
}

// ---- Form controls ------------------------------------------------------------------------------

let fid = 0;
export function Field({ label, hint, error, children, id, optional }) {
  return html`<div class="field">
    ${label && html`<label class="label" for=${id}>${label}${optional && html` <span class="faint" style="font-weight:500">(optional)</span>`}</label>`}
    ${children}
    ${error ? html`<p class="error-msg" id=${id && id + '-err'} role="alert"><${Icon} name="alert" size="14" />${error}</p>` : hint ? html`<p class="hint" id=${id && id + '-hint'}>${hint}</p>` : null}
  </div>`;
}

export function useFieldId(prefix = 'f') {
  const r = useRef(null);
  if (!r.current) r.current = `${prefix}-${++fid}`;
  return r.current;
}

export function Input({ label, hint, error, optional, value, onInput, prefix, ...rest }) {
  const id = useFieldId();
  const input = html`<input id=${id} class="input" value=${value ?? ''} onInput=${(e) => onInput?.(e.currentTarget.value, e)} aria-invalid=${error ? 'true' : undefined} aria-describedby=${error ? id + '-err' : hint ? id + '-hint' : undefined} ...${rest} />`;
  return html`<${Field} label=${label} hint=${hint} error=${error} id=${id} optional=${optional}>
    ${prefix ? html`<div class="input-group"><span class="prefix">${prefix}</span>${input}</div>` : input}
  <//>`;
}

export function Select({ label, hint, error, value, onChange, options, ...rest }) {
  const id = useFieldId();
  return html`<${Field} label=${label} hint=${hint} error=${error} id=${id}>
    <select id=${id} class="select" value=${value} onChange=${(e) => onChange?.(e.currentTarget.value)} aria-invalid=${error ? 'true' : undefined} ...${rest}>
      ${options.map((o) => (typeof o === 'string' ? html`<option value=${o}>${o}</option>` : html`<option value=${o.value} disabled=${o.disabled}>${o.label}</option>`))}
    </select>
  <//>`;
}

export function Textarea({ label, hint, error, value, onInput, optional, ...rest }) {
  const id = useFieldId();
  return html`<${Field} label=${label} hint=${hint} error=${error} id=${id} optional=${optional}>
    <textarea id=${id} class="textarea" value=${value ?? ''} onInput=${(e) => onInput?.(e.currentTarget.value)} aria-invalid=${error ? 'true' : undefined} ...${rest}></textarea>
  <//>`;
}

export function Toggle({ label, checked, onChange, disabled, hint }) {
  return html`<label class="switch">
    <input type="checkbox" checked=${checked} disabled=${disabled} onChange=${(e) => onChange?.(e.currentTarget.checked)} />
    <span class="track"></span>
    <span class="stack" style="gap:0"><span class="strong small">${label}</span>${hint && html`<span class="hint">${hint}</span>`}</span>
  </label>`;
}

export function Seg({ value, onChange, options, label }) {
  return html`<div class="seg" role="group" aria-label=${label}>
    ${options.map((o) => html`<button type="button" aria-pressed=${value === o.value ? 'true' : 'false'} onClick=${() => onChange(o.value)}>${o.label}</button>`)}
  </div>`;
}

export function Chips({ value, onChange, options, label }) {
  return html`<div class="chips" role="group" aria-label=${label}>
    ${options.map((o) => html`<button type="button" class="chip" aria-pressed=${value === o.value ? 'true' : 'false'} onClick=${() => onChange(o.value)}>${o.icon && html`<${Icon} name=${o.icon} />`}${o.label}</button>`)}
  </div>`;
}

export function Tabs({ value, onChange, tabs, label }) {
  return html`<div class="tabs" role="tablist" aria-label=${label}>
    ${tabs.map((t) =>
      t.href
        ? html`<a role="tab" class="tab" href=${'#' + t.href} aria-selected=${value === t.value ? 'true' : 'false'}>${t.label}${t.count != null && html`<span class="count">${t.count}</span>`}</a>`
        : html`<button role="tab" type="button" class="tab" aria-selected=${value === t.value ? 'true' : 'false'} onClick=${() => onChange(t.value)}>${t.label}${t.count != null && html`<span class="count">${t.count}</span>`}</button>`,
    )}
  </div>`;
}

export function AmountPicker({ value, onChange, amounts, label = 'Amount' }) {
  return html`<div class="amount-picker" role="group" aria-label=${label}>
    ${amounts.map((a) => html`<button type="button" aria-pressed=${value === a ? 'true' : 'false'} onClick=${() => onChange(a)}>${a === 0 ? 'Free' : a >= 1000 ? `${a / 1000}K` : a}</button>`)}
  </div>`;
}

// ---- Layout + feedback ------------------------------------------------------------------------

export function PageHead({ title, sub, back, actions, children }) {
  return html`<div>
    ${back && html`<a class="back" href=${'#' + back.href}><${Icon} name="chevL" />${back.label}</a>`}
    <div class="page-head">
      <div class="grow">
        <h1 class="h1">${title}</h1>
        ${sub && html`<p>${sub}</p>`}
      </div>
      ${actions && html`<div class="row wrap">${actions}</div>`}
    </div>
    ${children}
  </div>`;
}

export function Section({ title, sub, action, children, id }) {
  return html`<section class="section" id=${id} aria-labelledby=${id && id + '-h'}>
    <div class="section-head">
      <div><h2 id=${id && id + '-h'}>${title}</h2>${sub && html`<p>${sub}</p>`}</div>
      ${action && (action.href ? html`<a class="text-btn" href=${'#' + action.href}>${action.label}<${Icon} name="chevR" /></a>` : action)}
    </div>
    ${children}
  </section>`;
}

export function Empty({ icon = 'info', title, body, action }) {
  return html`<div class="empty">
    <div class="ico"><${Icon} name=${icon} /></div>
    <h3>${title}</h3>
    ${body && html`<p>${body}</p>`}
    ${action}
  </div>`;
}

export function ErrorBox({ error, retry }) {
  return html`<div class="notice err" role="alert">
    <${Icon} name="alert" />
    <div class="grow"><p class="title">Couldn't load this</p><p class="muted">${error?.message || 'Something went wrong.'}</p></div>
    ${retry && html`<${Button} size="sm" variant="secondary" onClick=${retry}>Try again<//>`}
  </div>`;
}

export function Notice({ tone = 'info', icon, title, children, action }) {
  const ic = icon || { warn: 'alert', err: 'alert', ok: 'check', info: 'info' }[tone];
  return html`<div class=${`notice ${tone}`}>
    <${Icon} name=${ic} />
    <div class="grow">${title && html`<p class="title">${title}</p>`}${children && html`<div class=${title ? 'muted' : ''}>${children}</div>`}</div>
    ${action}
  </div>`;
}

export function Sk({ h = 16, w = '100%', r }) {
  return html`<span class="sk" style=${`height:${typeof h === 'number' ? h + 'px' : h};width:${typeof w === 'number' ? w + 'px' : w};${r ? `border-radius:${r}px` : ''}`}></span>`;
}

export function CardsSkeleton({ n = 4, h = 220 }) {
  return html`<div class="grid-3">${Array.from({ length: n }, () => html`<${Sk} h=${h} r="14" />`)}</div>`;
}

export function ListSkeleton({ n = 5 }) {
  return html`<div class="stack tight">${Array.from({ length: n }, () => html`<div class="row" style="padding:10px 0"><${Sk} h=${36} w=${36} r="18" /><div class="stack tight grow"><${Sk} h=${12} w="50%" /><${Sk} h=${10} w="30%" /></div></div>`)}</div>`;
}

/** Async: renders loading / error / empty / data from a useRpc result. */
export function Async({ q, skeleton, empty, children }) {
  if (q.loading && !q.data) return skeleton || html`<${ListSkeleton} />`;
  if (q.error) return html`<${ErrorBox} error=${q.error} retry=${q.reload} />`;
  if (empty && (q.data == null || (Array.isArray(q.data) && q.data.length === 0))) return empty;
  return children(q.data);
}

// ---- Overlays --------------------------------------------------------------------------------

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, children, footer, wide, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const el = ref.current;
    const first = el?.querySelector('[data-autofocus]') || el?.querySelector(FOCUSABLE);
    setTimeout(() => first?.focus(), 30);
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const f = items[0];
        const l = items[items.length - 1];
        if (e.shiftKey && document.activeElement === f) { e.preventDefault(); l.focus(); }
        else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return html`<div>
    <div class="scrim" onClick=${onClose}></div>
    <div class=${`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label=${label || title} ref=${ref}>
      <div class="sheet-head"><h2>${title}</h2><${IconButton} icon="x" label="Close" size="sm" onClick=${onClose} /></div>
      <div class="sheet-body">${children}</div>
      ${footer && html`<div class="sheet-foot">${footer}</div>`}
    </div>
  </div>`;
}

export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel, tone = 'primary', pending }) {
  return html`<${Sheet} open=${open} onClose=${onClose} title=${title} footer=${[
    html`<${Button} variant="secondary" onClick=${onClose}>Keep it<//>`,
    html`<${Button} variant=${tone} loading=${pending} onClick=${onConfirm}>${confirmLabel}<//>`,
  ]}>
    <p class="muted">${body}</p>
  <//>`;
}

export function Toasts() {
  const list = useToasts();
  return html`<div class="toasts" role="status" aria-live="polite">
    ${list.map((t) => html`<div class=${`toast ${t.kind}`} key=${t.id}>
      <${Icon} name=${t.kind === 'ok' ? 'check' : t.kind === 'err' ? 'alert' : 'info'} />
      <div><p class="t">${t.title}</p>${t.body && html`<p class="muted">${t.body}</p>`}</div>
    </div>`)}
  </div>`;
}

export function Menu({ trigger, children, label = 'Menu' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const off = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('click', off);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', off);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return html`<div style="position:relative" ref=${ref}>
    ${trigger({ open, toggle: () => setOpen(!open), label })}
    ${open && html`<div class="menu" role="menu" onClick=${() => setOpen(false)}>${children}</div>`}
  </div>`;
}

// ---- Identity ----------------------------------------------------------------------------------

export function Avatar({ user, size = 'md', online }) {
  if (!user) return html`<span class=${`avatar ${size} field`}>?</span>`;
  return html`<span class=${`avatar ${size} ${user.field ? 'field' : ''}`} style=${`background:${user.avatar?.color || '#3a3f4a'}`} aria-hidden="true">
    ${initials(user.username)}
    ${(online ?? user.online) && size !== 'xs' && html`<span class="on"></span>`}
  </span>`;
}

const RANK_GLYPH = '<path d="M12 2 21 12 12 22 3 12z" fill="currentColor"/>';
export function Rank({ rank }) {
  if (!rank) return null;
  return html`<span class=${`rank ${rank.id}`}><svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: RANK_GLYPH }}></svg>${rank.name}</span>`;
}

export function Who({ user, sub, size = 'md', link = true, right }) {
  if (!user) return null;
  const name = html`<span class="name">${user.username}</span>`;
  return html`<div class="who">
    <${Avatar} user=${user} size=${size} />
    <div class="grow" style="min-width:0">
      ${link && !user.field ? html`<a href=${`#/app/u/${encodeURIComponent(user.username)}`} class="name" style="display:block">${user.username}</a>` : name}
      <div class="meta">${sub ?? html`<${Rank} rank=${user.rank} />${user.stackScore ? html`<span class="num">${user.stackScore.toLocaleString()}</span>` : null}`}</div>
    </div>
    ${right}
  </div>`;
}

export function FormDots({ form = [], n = 5 }) {
  return html`<span class="form-dots" aria-label=${`Last ${n}: ${form.slice(0, n).join(' ')}`}>${form.slice(0, n).map((r) => html`<span class=${r}>${r}</span>`)}</span>`;
}

// ---- Numbers ----------------------------------------------------------------------------------

export function Money({ n, sign, cls = '' }) {
  return html`<span class=${`num ${cls}`}>${money(n, { sign })}</span>`;
}

/** Big scoreboard amount: small currency + large condensed number. */
export function BigMoney({ n, size = 34, cls = '' }) {
  return html`<span class=${`row tight ${cls}`} style="align-items:baseline;gap:6px">
    <span class="small strong muted">UGX</span>
    <span class="big-num" style=${`font-size:${size}px`}>${Math.round(n || 0).toLocaleString('en-US')}</span>
  </span>`;
}

export function Countdown({ to, prefix = 'Starts', live = 'Live' }) {
  const now = useNow(1000);
  const d = to - now;
  if (d <= 0) return html`<span>${live}</span>`;
  return html`<span class="num">${prefix} ${d < 3600_000 ? `in ${clock(d)}` : until(to)}</span>`;
}

export function Progress({ value, tone = '', label }) {
  return html`<div class=${`progress ${tone}`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(value * 100)} aria-label=${label}>
    <span style=${`width:${Math.max(0, Math.min(100, value * 100))}%`}></span>
  </div>`;
}

export function Stat({ value, label, size = '', tone = '' }) {
  return html`<div class=${`stat ${size}`}><div class=${`v ${tone}`}>${value}</div><div class="l">${label}</div></div>`;
}

export { Link };
