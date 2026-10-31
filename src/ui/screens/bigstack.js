import { html, useState, useEffect, useRef } from '../../lib/preact.js';
import { useRpc, useSession, useNow } from '../hooks.js';
import { Icon } from '../icons.js';
import { Button, Badge, Sk, ErrorBox, Avatar, Rank, Progress, Notice, Empty } from '../components/base.js';
import { TournamentCard } from '../components/cards.js';
import { GameThumb } from '../components/game.js';
import { money, short, ordinal, when } from '../format.js';

export const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Animated number: eases from its previous value (or from 70% on first paint) to the new one. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-US'), ms = 1400 }) {
  const [shown, setShown] = useState(value * 0.7);
  const from = useRef(value * 0.7);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(value);
    const start = performance.now();
    const a = from.current;
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return html`<span class="countup">${format(shown)}</span>`;
}

function Clock({ to }) {
  const now = useNow(1000);
  const d = Math.max(0, to - now);
  const parts = [[Math.floor(d / 86400000), 'days'], [Math.floor((d % 86400000) / 3600000), 'hrs'], [Math.floor((d % 3600000) / 60000), 'min'], [Math.floor((d % 60000) / 1000), 'sec']];
  return html`<div class="bs-clock" aria-label=${`Finals ${when(to)}`}>${parts.map(([v, l]) => html`<div><span class="big-num">${String(v).padStart(2, '0')}</span><span class="xs muted">${l}</span></div>`)}</div>`;
}

/** Compact promo used on Home and the landing page. */
export function BigStackBanner({ b, href = '/app/bigstack', cta = 'See how to qualify' }) {
  if (!b) return null;
  return html`<a class="bs-banner" href=${'#' + href} style=${`--sc:${b.sponsor?.color || '#F5D300'}`}>
    <div class="bs-banner-glow" aria-hidden="true"></div>
    <div class="grow" style="min-width:0">
      <div class="row wrap tight"><span class="badge live">Qualifying now</span><span class="badge">Presented by ${b.sponsor?.name}</span></div>
      <p class="display bs-banner-title">${b.name}</p>
      <p class="small muted">${b.season} finals. Guaranteed by ${b.sponsor?.name}, and growing with every entry.</p>
    </div>
    <div class="bs-banner-amt">
      <p class="xs muted">Prize pool</p>
      <p class="big-num bs-usd"><${CountUp} value=${b.poolUSD} format=${usd} /></p>
      <p class="xs muted num">${money(b.poolUGX)}</p>
      <span class="btn btn-primary btn-sm mt-2">${cta}</span>
    </div>
  </a>`;
}

export default function BigStack() {
  const { user } = useSession();
  const q = useRpc('bigstack.get');
  const b = q.data;
  if (q.loading && !b) return html`<div class="container page stack"><${Sk} h=${360} r="20" /><${Sk} h=${240} r="14" /></div>`;
  if (q.error) return html`<div class="container page"><${ErrorBox} error=${q.error} retry=${q.reload} /></div>`;
  const guaranteedPct = b.guaranteedUGX / Math.max(b.poolUGX, b.stretchUGX);
  const stretch = Math.min(1, b.poolUGX / b.stretchUGX);
  const me = b.me;
  return html`<div class="bs-page">
    <section class="bs-hero container">
      <div class="row wrap tight"><span class="badge live">Qualifying now</span><span class="badge">${b.season}</span><span class="badge" style=${`background:${b.sponsor?.color};color:#0c0d10`}>Presented by ${b.sponsor?.name}</span></div>
      <h1 class="display bs-title">${b.name}.</h1>
      <div class="bs-hero-card">
        <p class="small muted">Total prize pool</p>
        <p class="big-num bs-pool"><${CountUp} value=${b.poolUSD} format=${usd} /></p>
        <p class="strong num">${money(b.poolUGX)} <span class="muted xs">at ${b.fx.toLocaleString()} UGX per USD</span></p>
        <div class="bs-meter" role="img" aria-label=${`${usd(b.guaranteedUSD)} guaranteed, ${usd(b.poolUSD - b.guaranteedUSD)} added by players, stretch goal ${usd(b.stretchUSD)}`}>
          <span class="seg-g" style=${`width:${guaranteedPct * 100}%`}></span>
          <span class="seg-c" style=${`width:${Math.max(0, stretch - guaranteedPct) * 100}%`}></span>
        </div>
        <div class="row between xs muted wrap"><span><span class="key g"></span>${usd(b.guaranteedUSD)} guaranteed by ${b.sponsor?.name}</span><span><span class="key c"></span>+${usd(b.poolUSD - b.guaranteedUSD)} from entries (${b.contributionPct}% of fees)</span><span>Stretch ${usd(b.stretchUSD)}</span></div>
      </div>
      <div class="row wrap" style="gap:var(--s-6);align-items:flex-end">
        <div><p class="xs muted mb-2">Finals start in</p><${Clock} to=${b.finalsAt} /></div>
        <div class="row tight"><${Button} size="lg" href="/app/play" icon="play">Earn points now<//><${Button} size="lg" variant="secondary" href="/app/tournaments">Qualifier cups<//></div>
      </div>
    </section>

    <div class="container stack loose" style="margin-top:var(--s-10)">
      ${me && html`<div class=${`card pad-lg bs-me ${me.qualified ? 'in' : ''}`}>
        <div class="row wrap between" style="gap:var(--s-5)">
          <div><p class="small muted">Your qualification</p>
            <p class="display" style="font-size:clamp(44px,7vw,72px)">${me.qualified ? "You're in." : `${me.toQualify} pts to go`}</p>
            <p class="small muted">${me.qualified ? `Hold a top ${b.qualifySpots} spot until qualifying closes.` : `Top ${b.qualifySpots} qualify. The cut line is ${b.cutoff} points right now.`}</p>
          </div>
          <div class="row" style="gap:var(--s-8)">
            <div class="stat lg"><div class="v">#${me.position}</div><div class="l">Season rank</div></div>
            <div class="stat lg"><div class="v">${me.points}</div><div class="l">Season points</div></div>
          </div>
        </div>
        <div class="mt-4"><${Progress} value=${Math.min(1, me.points / Math.max(1, b.cutoff))} tone=${me.qualified ? 'money' : 'heat'} label="Progress to the cut line" /></div>
      </div>`}

      <div class="split">
        <div class="stack">
          <h2 class="h2">How to qualify</h2>
          <div class="bs-steps">
            ${[
              ['Play anything', 'Every verified challenge, H2H, pool and tournament earns season points. Wins and deep runs earn more.', 'play'],
              ['Win a qualifier cup', 'Free Big Stack qualifier cups pay bonus points to the top four.', 'trophy'],
              [`Finish top ${b.qualifySpots}`, 'When qualifying closes, the top of the season table plays the finals for the whole pool.', 'crown'],
            ].map(([t, d, ic], i) => html`<div class="bs-step"><span class="bs-n">${i + 1}</span><div><p class="strong"><${Icon} name=${ic} size="16" /> ${t}</p><p class="small muted">${d}</p></div></div>`)}
          </div>
          <h2 class="h2 mt-6">Qualifier cups</h2>
          ${b.qualifiers.length ? html`<div class="grid-2">${b.qualifiers.map((t) => html`<${TournamentCard} t=${t} />`)}</div>` : html`<${Empty} icon="trophy" title="Next qualifier drops soon" />`}
          <h2 class="h2 mt-6">Featured games</h2>
          <div class="row wrap">${b.games.map((g) => html`<a class="row tight card tight" href=${`#/app/games/${g.slug}`}><${GameThumb} game=${g} size=${32} /><span class="small strong">${g.short}</span></a>`)}</div>
        </div>
        <div class="stack">
          <div class="panel"><div class="panel-head"><span class="strong">Finals payouts</span><span class="xs muted">Grows with the pool</span></div>
            <div class="panel-body list">${b.payouts.map((p, i) => (i < 8 || i === 8) && html`<div class="li"><span class=${`pos p${p.place}`}>${i === 8 ? '9–16' : ordinal(p.place)}</span><span class="grow small muted">${p.pct}%${i === 8 ? ' each' : ''}</span><span class="num strong">${usd(p.usd)}</span><span class="xs muted num" style="min-width:110px;text-align:right">${short(p.ugx)} UGX</span></div>`)}</div>
          </div>
          <div class="panel"><div class="panel-head"><span class="strong">Qualification table</span><span class="xs muted">Top ${b.qualifySpots} qualify</span></div>
            <div class="panel-body list">${b.leaders.map((r) => html`<a class=${`li clickable ${r.position === b.qualifySpots ? 'cut' : ''}`} href=${`#/app/u/${encodeURIComponent(r.user.username)}`} style=${r.user.id === user.id ? 'background:var(--secondary-soft);margin:0 -12px;padding:12px;border-radius:10px' : ''}>
              <span class=${`pos p${r.position}`}>${r.position}</span><${Avatar} user=${r.user} size="sm" online=${false} /><div class="grow" style="min-width:0"><p class="li-title truncate">${r.user.username}</p><p class="li-sub"><${Rank} rank=${r.user.rank} /></p></div><span class="big-num" style="font-size:22px">${r.points}</span>
            </a>`)}</div>
          </div>
          <div class="card"><p class="strong mb-2">Rules</p><ul class="stack tight small">${b.rules.map((r) => html`<li class="row top tight"><${Icon} name="check" size="16" /><span>${r}</span></li>`)}</ul>
            <p class="xs faint mt-4">Demo event. ${b.sponsor?.name} is a fictional sponsor and no real prize is offered in this prototype.</p></div>
        </div>
      </div>
    </div>
  </div>`;
}
