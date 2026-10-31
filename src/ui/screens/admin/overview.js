import { html } from '../../../lib/preact.js';
import { useRpc } from '../../hooks.js';
import { Icon } from '../../icons.js';
import { Badge, Sk, ErrorBox, Avatar } from '../../components/base.js';
import { GameThumb } from '../../components/game.js';
import { money, short, ago } from '../../format.js';

// Simple bar chart: one series, labelled values, no decoration.
export function Bars({ data, value, label, fmt = short, color = 'var(--money)', height = 160 }) {
  const max = Math.max(1, ...data.map(value));
  return html`<div class="bars" style=${`height:${height}px`} role="img" aria-label=${data.map((d) => `${label(d)}: ${fmt(value(d))}`).join(', ')}>
    ${data.map((d) => {
      const v = value(d);
      return html`<div class="bar-col" title=${`${label(d)}: ${fmt(v)}`}>
        <span class="bar-v">${fmt(v)}</span>
        <span class="bar" style=${`height:${Math.max(2, (Math.max(0, v) / max) * 100)}%;background:${color}`}></span>
        <span class="bar-l">${label(d)}</span>
      </div>`;
    })}
  </div>`;
}

const day = (t) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' }).replace(' ', ' ');

export default function Overview() {
  const q = useRpc('admin.overview');
  if (q.loading && !q.data) return html`<div class="stack"><${Sk} h=${40} w="30%" /><div class="kpis">${Array.from({ length: 8 }, () => html`<${Sk} h=${96} r="14" />`)}</div></div>`;
  if (q.error) return html`<${ErrorBox} error=${q.error} retry=${q.reload} />`;
  const { kpis: k, series, byGame, audit, fraud } = q.data;
  const K = (l, v, d, href, alert) => html`<a class=${`kpi ${alert ? 'alert' : ''}`} href=${href ? '#' + href : undefined}><span class="l">${l}</span><span class="v">${v}</span>${d && html`<span class="d">${d}</span>`}</a>`;
  return html`<div class="stack loose">
    <div><h1 class="h1">Operations</h1><p class="muted mt-2">Live view of the STACKD demo world. Numbers update as the world ticks.</p></div>
    <div class="kpis">
      ${K('Players', short(k.players), `${k.online} online, ${k.newToday} new today`, '/admin/users')}
      ${K('Active competitions', k.activeCompetitions, `${k.liveMatches} live matches`, '/admin/competitions')}
      ${K('Tournaments', k.tournamentsLive + k.tournamentsUpcoming, `${k.tournamentsLive} live, ${k.tournamentsUpcoming} upcoming`, '/admin/tournaments')}
      ${K('Prize pools in play', short(k.prizePools), 'UGX, open and live pools', '/admin/competitions')}
      ${K('Revenue (30 days)', short(k.revenue30), `${money(k.revenueToday)} today`, '/admin/wallet')}
      ${K('Transactions today', k.txToday, null, '/admin/wallet')}
      ${K('Withdrawals pending', k.withdrawalsPending, 'Needs review', '/admin/wallet', k.withdrawalsPending > 0)}
      ${K('Disputes & reviews', k.disputesOpen + k.reviewQueue, `${k.disputesOpen} disputes, ${k.reviewQueue} reviews`, '/admin/support', k.disputesOpen > 0)}
      ${K('Fraud alerts', k.fraudOpen, 'Open', '/admin/fraud', k.fraudOpen > 0)}
      ${K('KYC queue', k.kycPending, 'Awaiting review', '/admin/compliance', k.kycPending > 0)}
      ${K('Support tickets', k.ticketsOpen, 'Open', '/admin/support')}
    </div>
    <div class="split">
      <div class="panel"><div class="panel-head"><span class="strong">Platform revenue, last 14 days</span><span class="xs muted">UGX</span></div><div class="panel-body"><${Bars} data=${series} value=${(d) => d.revenue} label=${(d) => day(d.day)} /></div></div>
      <div class="panel"><div class="panel-head"><span class="strong">Entries by game</span><span class="xs muted">Players, last 7 days</span></div><div class="panel-body list">
        ${byGame.map((g) => html`<div class="li"><${GameThumb} game=${g.game} size=${30} /><span class="grow small strong">${g.game?.name}</span><span class="num strong">${g.entries.toLocaleString()}</span></div>`)}
      </div></div>
    </div>
    <div class="split">
      <div class="panel"><div class="panel-head"><span class="strong">Open fraud alerts</span><a class="text-btn" href="#/admin/fraud">All<${Icon} name="chevR" /></a></div><div class="panel-body list">
        ${fraud.length ? fraud.map((f) => html`<div class="li"><${Avatar} user=${f.user} size="sm" /><div class="grow"><p class="small strong">${f.user.username}</p><p class="xs muted">${f.detail}</p></div><${Badge} tone=${f.severity === 'high' ? 'err' : 'warn'}>${f.severity}<//></div>`) : html`<p class="small muted">All clear.</p>`}
      </div></div>
      <div class="panel"><div class="panel-head"><span class="strong">Recent audit events</span><a class="text-btn" href="#/admin/audit">Audit log<${Icon} name="chevR" /></a></div><div class="panel-body list">
        ${audit.map((a) => html`<div class="li"><span class="grow small"><strong>${a.actor.username}</strong> <span class="muted">${a.action}</span></span><span class="xs faint">${ago(a.at)}</span></div>`)}
      </div></div>
    </div>
  </div>`;
}
