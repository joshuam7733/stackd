import { html } from '../../lib/preact.js';
import { Icon } from '../icons.js';
import { GameArt, GameThumb } from './game.js';
import { Badge, Button, Avatar, Rank, Who, FormDots, Progress, BigMoney, Countdown, Money } from './base.js';
import { money, short, PLATFORM, FORMAT, MODEL, STATUS, TX, ago, when, ordinal, H2H_TYPE, until } from '../format.js';

const statusTone = { live: 'live', starting: 'live', open: 'accent', full: 'warn', verifying: 'warn', disputed: 'err', settled: '', cancelled: 'err', registration: 'accent', completed: '', draft: '' };

function StatusBadge({ status, startsAt }) {
  if (status === 'live') return html`<${Badge} tone="live">Live<//>`;
  if ((status === 'open' || status === 'registration') && startsAt) return html`<${Badge} icon="clock"><${Countdown} to=${startsAt} prefix="" live="Starting" /><//>`;
  return html`<${Badge} tone=${statusTone[status] || ''}>${STATUS[status] || status}<//>`;
}

// ---- Competition (pool) card --------------------------------------------------------------------
export function CompetitionCard({ c }) {
  const pool = c.status === 'open' || c.status === 'full' ? c.projected || c.pool : c.pool;
  const fill = c.maxPlayers ? c.players / c.maxPlayers : 0;
  return html`<a class="comp-card" href=${`#/app/compete/${c.id}`}>
    <div style="position:relative">
      <${GameArt} game=${c.game} size="banner" />
      <div class="cc-tags">
        <${StatusBadge} status=${c.status} startsAt=${c.startsAt} />
        ${c.format === 'team' && html`<${Badge}>Squads of ${c.teamSize}<//>`}
        ${c.sponsor && html`<${Badge}>${c.sponsor.name}<//>`}
        ${c.joined && html`<${Badge} tone="solid">You're in<//>`}
      </div>
    </div>
    <div class="cc-body">
      <div>
        <p class="cc-title">${c.title}</p>
        <p class="cc-meta"><span>${c.game?.short}</span><span>${c.mode?.name}</span><span>${PLATFORM[c.platform]}</span></p>
      </div>
      <div class="cc-prize">
        <div>
          <p class="xs muted">${c.status === 'open' ? 'Prize pool when full' : 'Prize pool'}</p>
          <${BigMoney} n=${pool?.net || 0} size=${32} />
        </div>
        <div style="text-align:right">
          <p class="xs muted">Entry</p>
          <p class="strong num">${c.entry ? money(c.entry) : 'Free'}</p>
        </div>
      </div>
      <div class="stack tight">
        <${Progress} value=${fill} tone=${fill > 0.85 ? 'heat' : ''} label="Lobby filled" />
        <p class="xs muted row between"><span>${c.players}/${c.maxPlayers} players</span><span>${MODEL[c.prize?.model] || ''}</span></p>
      </div>
    </div>
  </a>`;
}

// ---- H2H card -------------------------------------------------------------------------------
export function H2HCard({ c, onAccept }) {
  const ch = c.h2h.challenger;
  return html`<div class="card stack" style="gap:var(--s-3)">
    <div class="row between">
      <div class="row tight"><${GameThumb} game=${c.game} size=${36} /><div><p class="strong small">${c.game?.short} ${c.mode?.name}</p><p class="xs muted">${PLATFORM[c.platform]}${c.h2h.type !== 'open' ? ` · ${H2H_TYPE[c.h2h.type]}` : ''}</p></div></div>
      ${c.h2h.incoming ? html`<${Badge} tone="heat" icon="swords">For you<//>` : html`<${Badge}>${ago(c.createdAt)}<//>`}
    </div>
    <${Who} user=${ch} right=${html`<${FormDots} form=${[]} />`} />
    ${c.h2h.note && html`<p class="small muted" style="font-style:italic">"${c.h2h.note}"</p>`}
    <div class="row between" style="padding-top:var(--s-3);border-top:1px solid var(--border)">
      <div><p class="xs muted">Entry</p><p class="strong num">${c.entry ? money(c.entry) : 'Free'}</p></div>
      <div><p class="xs muted">Win</p><p class="strong num money">${money(c.payout)}</p></div>
      ${onAccept ? html`<${Button} size="sm" onClick=${() => onAccept(c)}>Accept<//>` : html`<${Button} size="sm" variant="secondary" href=${`/app/compete/${c.id}`}>View<//>`}
    </div>
  </div>`;
}

// ---- Tournament card ------------------------------------------------------------------------
export function TournamentCard({ t }) {
  return html`<a class="comp-card" href=${`#/app/tournaments/${t.id}`}>
    <div style="position:relative">
      <${GameArt} game=${t.game} size="banner" />
      <div class="cc-tags">
        <${StatusBadge} status=${t.status} startsAt=${t.startsAt} />
        <${Badge}>${FORMAT[t.format]}<//>
        ${t.sponsor && html`<${Badge}>${t.sponsor.name}<//>`}
        ${t.registered && html`<${Badge} tone="solid">Registered<//>`}
      </div>
    </div>
    <div class="cc-body">
      <div>
        <p class="cc-title">${t.name}</p>
        <p class="cc-meta"><span>${t.game?.short}</span><span>${t.mode?.name}</span><span>${PLATFORM[t.platform]}</span><span>${t.teamSize > 1 ? `Teams of ${t.teamSize}` : 'Solo'}</span></p>
      </div>
      <div class="cc-prize">
        <div><p class="xs muted">${t.guaranteed ? 'Guaranteed pool' : 'Prize pool'}</p><${BigMoney} n=${t.pool?.net || 0} size=${32} /></div>
        <div style="text-align:right"><p class="xs muted">Entry</p><p class="strong num">${t.entry ? money(t.entry) : 'Free'}</p></div>
      </div>
      <div class="cc-foot">
        <span class="xs muted"><${Icon} name="calendar" size="14" /> ${t.status === 'completed' ? `Won by ${t.champion?.name || '—'}` : when(t.startsAt)}</span>
        <span class="xs strong">${t.entrants}/${t.maxEntrants}</span>
      </div>
    </div>
  </a>`;
}

// ---- Mission card -----------------------------------------------------------------------------
export function MissionCard({ m }) {
  const done = m.progress?.completedAt;
  return html`<a class="comp-card" href=${`#/app/missions/${m.id}`}>
    <div style=${`position:relative;aspect-ratio:16/7;background:${m.sponsor?.color};overflow:hidden`}>
      <div style="position:absolute;inset:0;background:repeating-linear-gradient(-35deg, rgb(0 0 0 / 0.0) 0 22px, rgb(0 0 0 / 0.12) 22px 44px)"></div>
      <p class="display" style="position:absolute;left:14px;bottom:6px;font-size:52px;color:#0c0d10;opacity:.92">${m.sponsor?.name}</p>
      <div class="cc-tags">
        ${m.status === 'live' ? html`<${Badge} tone="live">Live<//>` : html`<${Badge}>${m.status === 'scheduled' ? `Starts ${when(m.startsAt)}` : 'Ended'}<//>`}
        <${Badge}>${m.type === 'hunt' ? 'Hunt' : m.game?.short || 'In-game'}<//>
        ${done && html`<${Badge} tone="solid" icon="check">Done<//>`}
      </div>
    </div>
    <div class="cc-body">
      <div>
        <p class="cc-title">${m.title}</p>
        <p class="small muted mt-2">${m.objective?.label}</p>
      </div>
      <div class="row tight"><${Icon} name="gift" size="18" /><p class="strong small">${m.reward.label}</p></div>
      <div class="stack tight">
        <${Progress} value=${m.quantity ? 1 - m.remaining / m.quantity : 0} tone="chalk" label="Rewards claimed" />
        <p class="xs muted row between"><span>${m.remaining.toLocaleString()} of ${m.quantity.toLocaleString()} left</span><span>${m.status === 'live' ? `Ends ${until(m.endsAt)}` : ''}</span></p>
      </div>
    </div>
  </a>`;
}

// ---- Team card --------------------------------------------------------------------------------
export function TeamTag({ team, size = 44 }) {
  return html`<span style=${`width:${size}px;height:${size}px;border-radius:${size > 60 ? 18 : 11}px;background:${team.color};color:#0c0d10;display:grid;place-items:center;flex-shrink:0;font-weight:900;font-stretch:62%;font-variation-settings:'wdth' 62;font-size:${Math.round(size * 0.36)}px;letter-spacing:.02em`} aria-hidden="true">${team.tag}</span>`;
}

export function TeamCard({ t }) {
  return html`<a class="card clickable stack" style="gap:var(--s-3)" href=${`#/app/teams/${t.id}`}>
    <div class="row">
      <${TeamTag} team=${t} />
      <div class="grow"><p class="strong truncate">${t.name}</p><p class="xs muted">${t.members.length} members${t.open ? ' · Open to join' : ' · Invite only'}</p></div>
      ${t.isMember && html`<${Badge} tone="solid">Your team<//>`}
    </div>
    <div class="row" style="gap:-6px">${t.members.slice(0, 6).map((m) => html`<span style="margin-right:-8px"><${Avatar} user=${m} size="sm" online=${false} /></span>`)}</div>
    <div class="stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat sm"><div class="v num">${t.rating}</div><div class="l">Rating</div></div>
      <div class="stat sm"><div class="v num">${t.stats.wins}</div><div class="l">Wins</div></div>
      <div class="stat sm"><div class="v num">#${t.ranking}</div><div class="l">Ranked</div></div>
    </div>
  </a>`;
}

// ---- Player card (staking / discovery) ------------------------------------------------------
export function PlayerCard({ p, children }) {
  return html`<div class="card stack" style="gap:var(--s-3)">
    <div class="row">
      <${Avatar} user=${p} size="lg" />
      <div class="grow">
        <a class="strong" href=${`#/app/u/${encodeURIComponent(p.username)}`}>${p.username}</a>
        <div class="row tight mt-2"><${Rank} rank=${p.rank} /><span class="xs muted">${p.countryName}</span></div>
      </div>
      <div style="text-align:right"><p class="big-num" style="font-size:30px">${p.stackScore}</p><p class="xs muted">STACK Score</p></div>
    </div>
    <div class="row between small">
      <span class="muted">Win rate <strong class="num" style="color:var(--text)">${p.stats.winRate}%</strong></span>
      <span class="muted">Streak <strong class="num heat">${p.stats.streak}</strong></span>
      <${FormDots} form=${p.form} />
    </div>
    ${children}
  </div>`;
}

// ---- Prize breakdown ------------------------------------------------------------------------
export function PrizeBreakdown({ pool, players, entry, projected, teamSize = 1 }) {
  if (!pool) return null;
  return html`<div class="stack" style="gap:var(--s-3)">
    <dl class="kv">
      <dt>Entries</dt><dd>${pool.entrants} ${teamSize > 1 ? 'squads' : 'players'} × ${money(pool.entry)}</dd>
      ${pool.gross - pool.entry * pool.entrants > 0 && html`<dt>Sponsor boost</dt><dd class="money">+${money(pool.gross - pool.entry * pool.entrants)}</dd>`}
      <dt>Gross pool</dt><dd>${money(pool.gross)}</dd>
      <dt>Platform fee (${pool.feePct}%)</dt><dd>−${money(pool.fee)}</dd>
      ${pool.topUp > 0 && html`<dt>Guarantee top-up</dt><dd class="money">+${money(pool.topUp)}</dd>`}
    </dl>
    <div class="row between" style="padding-top:var(--s-3);border-top:1px solid var(--border)">
      <span class="strong">Net prize pool</span><span class="big-num money" style="font-size:28px">${money(pool.net)}</span>
    </div>
    <div class="stack tight">
      ${pool.allocations.map((a) => html`<div class="row between small">
        <span class="row tight"><span class=${`pos ${a.place ? 'p' + a.place : ''}`} style="font-size:16px;width:auto">${a.place ? ordinal(a.place) : '•'}</span><span class="muted">${a.performance ? a.label : teamSize > 1 ? 'Squad' : 'Player'} ${a.pct ? `(${Math.round(a.pct * 10) / 10}%)` : ''}</span></span>
        <span class="num strong">${money(a.amount)}${a.perPlayer && teamSize > 1 ? html`<span class="xs muted" style="font-weight:500"> · ${money(a.perPlayer)} each</span>` : ''}</span>
      </div>`)}
      ${(pool.bonuses || []).map((b) => html`<div class="row between small"><span class="muted">${b.label}</span><span class="num strong money">+${money(b.amount)}</span></div>`)}
    </div>
    ${projected && html`<p class="xs faint">Pool shown at a full lobby. It's calculated from actual entries when the match locks.</p>`}
  </div>`;
}

// ---- Wallet ---------------------------------------------------------------------------------
export function StackCard({ wallet, compact, actions = true }) {
  return html`<div class="card pad-lg stack" style="gap:var(--s-4);background:linear-gradient(160deg,#181b22 0%,#121419 60%)">
    <div class="row between"><span class="strong small">Your stack</span><span class="demo-pill">Demo credits</span></div>
    <div>
      <${BigMoney} n=${wallet.available} size=${compact ? 44 : 64} />
      ${wallet.bonus > 0 && html`<p class="xs muted mt-2">Includes ${money(wallet.bonus)} bonus credit (playable, not withdrawable)</p>`}
    </div>
    <div class="stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat sm"><div class="v num">${short(wallet.pending + wallet.held)}</div><div class="l">Pending</div></div>
      <div class="stat sm"><div class="v num money">${short(wallet.earnings)}</div><div class="l">Winnings</div></div>
      <div class="stat sm"><div class="v num">${short(wallet.rewards + wallet.bonuses)}</div><div class="l">Rewards + bonus</div></div>
    </div>
    ${actions && html`<div class="row"><${Button} icon="plus" href="/app/wallet?sheet=deposit" class="grow">Deposit<//><${Button} variant="secondary" icon="arrowUp" href="/app/wallet?sheet=withdraw" class="grow">Withdraw<//></div>`}
  </div>`;
}

const TX_ICON = { deposit: 'plus', withdrawal: 'arrowUp', entry: 'play', prize: 'trophy', reward: 'gift', sponsor_reward: 'gift', bonus: 'star', refund: 'again', fee: 'minus', stake: 'users', stake_return: 'users', prediction: 'trend', prediction_payout: 'trend', reversal: 'again' };
export function TxRow({ t }) {
  return html`<a class="li clickable" href=${`#/app/wallet/tx/${t.id}`}>
    <span class="ntf" style="padding:0"><span class=${`ico ${t.amount > 0 ? 'money' : ''}`}><${Icon} name=${TX_ICON[t.type] || 'dot'} /></span></span>
    <div class="grow" style="min-width:0">
      <p class="li-title truncate">${t.description}</p>
      <p class="li-sub">${TX[t.type]} · ${ago(t.createdAt)}${t.status !== 'completed' ? html` · <span class=${t.status === 'failed' ? 'err-text' : ''} style=${t.status === 'pending' ? 'color:var(--warning)' : ''}>${STATUS[t.status]}</span>` : ''}</p>
    </div>
    <span class=${`tx-amt ${t.amount > 0 && t.status !== 'failed' ? 'plus' : ''}`} style=${t.status === 'failed' ? 'text-decoration:line-through;opacity:.5' : ''}>${money(t.amount, { sign: true })}</span>
  </a>`;
}

// ---- Leaderboard -------------------------------------------------------------------------------
export function LeaderRow({ position, user, value, valueLabel, me }) {
  return html`<a class="li clickable" href=${`#/app/u/${encodeURIComponent(user.username)}`} style=${me ? 'background:var(--secondary-soft);margin:0 -12px;padding:12px;border-radius:10px' : ''}>
    <span class=${`pos p${position}`}>${position}</span>
    <${Avatar} user=${user} size="sm" />
    <div class="grow" style="min-width:0"><p class="li-title truncate">${user.username}${me ? html` <span class="xs muted">(you)</span>` : ''}</p><p class="li-sub"><${Rank} rank=${user.rank} />${user.stats && html`<span class="xs muted truncate"> · ${user.stats.wins}W · ${user.stats.winRate}% · ${user.stats.competitions} comps</span>`}</p></div>
    <span class="big-num" style="font-size:24px">${value}</span>${valueLabel && html`<span class="xs muted">${valueLabel}</span>`}
  </a>`;
}

// ---- Achievements ----------------------------------------------------------------------------
export function Achievement({ def, earned }) {
  return html`<div class=${`ach t${def.tier} ${earned ? '' : 'locked'}`} title=${def.blurb}>
    <div class="medal">${def.glyph}</div>
    <p class="an">${def.name}</p>
    <p class="ad">${earned ? `Earned ${ago(earned.at)}` : def.blurb}</p>
  </div>`;
}

// ---- Notifications -----------------------------------------------------------------------------
const N_ICON = { challenge: ['swords', 'heat'], accepted: ['swords', 'heat'], match: ['play', 'heat'], prize: ['trophy', 'money'], result: ['flag', ''], achievement: ['star', 'accent'], team: ['users', 'accent'], friend: ['user', 'accent'], mission: ['gift', ''], deposit: ['wallet', 'money'], withdrawal: ['wallet', ''], refund: ['again', 'money'], dispute: ['shield', ''], review: ['shield', ''], tournament: ['trophy', 'heat'], system: ['info', ''], kyc: ['shield', 'accent'], stake: ['users', ''], prediction: ['trend', ''], joined: ['check', ''], support: ['message', ''] };
export function NotificationItem({ n, onOpen }) {
  const [ic, tone] = N_ICON[n.type] || ['bell', ''];
  return html`<a class=${`ntf ${n.read ? '' : 'unread'}`} href=${n.link ? '#' + n.link : undefined} onClick=${() => onOpen?.(n)}>
    <span class=${`ico ${tone}`}><${Icon} name=${ic} /></span>
    <div class="grow" style="min-width:0"><p class="strong small">${n.title}</p>${n.body && html`<p class="small muted">${n.body}</p>`}<p class="xs faint mt-2">${ago(n.at)}</p></div>
    ${!n.read && html`<span style="width:8px;height:8px;border-radius:50%;background:var(--secondary);margin-top:6px;flex-shrink:0" aria-label="Unread"></span>`}
  </a>`;
}

// ---- Match row (history) -----------------------------------------------------------------------
export function MatchRow({ m }) {
  const r = m.result || m.mine;
  return html`<a class="li clickable" href=${`#/app/match/${m.id}`}>
    <${GameThumb} game=${m.game} size=${38} />
    <div class="grow" style="min-width:0">
      <p class="li-title truncate">${m.title}</p>
      <p class="li-sub">${m.opponent ? `vs ${m.opponent.username} · ` : ''}${m.score ? `${m.score} · ` : ''}${r?.place ? `${ordinal(r.place)} · ` : ''}${ago(m.at || m.settledAt || m.createdAt)}</p>
    </div>
    ${r && html`<div style="text-align:right">
      <${Badge} tone=${r.won ? 'money' : ''}>${r.won ? 'W' : 'L'}<//>
      ${r.payout > 0 && html`<p class="xs money strong num mt-2">+${short(r.payout)}</p>`}
    </div>`}
  </a>`;
}

export { StatusBadge };
