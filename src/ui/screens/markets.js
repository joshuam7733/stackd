import { html, useState } from '../../lib/preact.js';
import { useRpc, useAction, useSession } from '../hooks.js';
import { setQuery } from '../router.js';
import { Icon } from '../icons.js';
import { PlaySubnav } from '../components/shell.js';
import { Button, Badge, Tabs, Chips, Empty, Async, CardsSkeleton, PageHead, Notice, Sheet, AmountPicker, Progress, Countdown, Who } from '../components/base.js';
import { PlayerCard } from '../components/cards.js';
import { GameThumb } from '../components/game.js';
import { money, short, ago, when, pct } from '../format.js';

function GateBlock({ gate, what }) {
  if (!gate || gate.allowed) return null;
  return html`<div class="mb-4"><${Notice} tone="warn" title=${`${what} isn't available on your account`} action=${html`<${Button} size="sm" variant="secondary" href="/app/settings?tab=region">Region settings<//>`}>
    ${gate.reasons.map((r) => html`<p>${r.message}</p>`)}
  <//></div>`;
}

export function BackPlayers({ path, query }) {
  const { user } = useSession();
  const tab = query.tab || 'runs';
  const q = useRpc('staking.list');
  const [pick, setPick] = useState(null);
  const [amount, setAmount] = useState(5000);
  const back = useAction('staking.back', { success: (r) => `You own ${r.stake.pct.toFixed(1)}% of this run`, onSuccess: () => { setPick(null); q.refresh(); } });
  const gate = q.data?.gate;
  const share = pick ? (amount / (pick.buyIn * pick.markup)) * 100 : 0;
  return html`<div class="container page">
    <${PlaySubnav} path=${path} />
    <${PageHead} title="Back a player" sub="Buy a share of a player's next run. If they cash, you get your share of the winnings. Where permitted." />
    <${GateBlock} gate=${gate} what="Backing players" />
    <${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[{ value: 'runs', label: 'Open runs' }, { value: 'mine', label: 'Your backing', count: q.data?.mine?.length }]} />
    <div class="mt-6">
      <${Async} q=${q} skeleton=${html`<${CardsSkeleton} n=${6} h=${260} />`}>
        ${(d) => tab === 'runs'
          ? html`<div class="grid-3">${d.runs.map((r) => html`<${PlayerCard} p=${r.player}>
              <div class="card" style="background:var(--elevated);padding:12px">
                <div class="row tight"><${GameThumb} game=${r.game} size=${28} /><p class="small strong truncate">${r.label}</p></div>
                <div class="row between small mt-2"><span class="muted">Buy-in ${money(r.buyIn)}</span><span class="muted">Markup ${r.markup}×</span></div>
                <div class="mt-2"><${Progress} value=${r.soldPct / r.maxPct} tone="chalk" label="Sold" /></div>
                <p class="xs muted mt-2">${pct(r.soldPct, 1)} of ${r.maxPct}% sold${r.status === 'running' ? ' · run in progress' : r.status === 'won' ? ` · cashed ${money(r.result.winnings)}` : r.status === 'lost' ? ' · no cash' : ''}</p>
              </div>
              ${r.status === 'open' || r.status === 'running' ? html`<${Button} disabled=${!gate?.allowed || r.soldPct >= r.maxPct || r.status !== 'open' && r.status !== 'running'} onClick=${() => { setPick(r); setAmount(5000); }}>Back this run<//>` : html`<${Badge}>Run finished<//>`}
            <//>`)}</div>`
          : d.mine.length ? html`<div class="card"><div class="list">${d.mine.map((s) => html`<div class="li">
              <${Who} user=${s.player} sub=${html`<span>${s.run?.label}</span>`} />
              <div style="text-align:right"><p class="strong num">${money(s.amount)}</p><p class="xs muted">${pct(s.pct, 1)} share</p></div>
              <${Badge} tone=${s.status === 'won' ? 'money' : s.status === 'active' ? 'accent' : ''}>${s.status === 'won' ? `+${short(s.payout)}` : s.status === 'active' ? 'Running' : 'No cash'}<//>
            </div>`)}</div></div>`
          : html`<${Empty} icon="trend" title="You're not backing anyone yet" body="Find a player you believe in and back their next run." action=${html`<${Button} onClick=${() => setQuery({ tab: 'runs' })}>See open runs<//>`} />`}
      <//>
    </div>
    <${Sheet} open=${!!pick} onClose=${() => setPick(null)} title=${pick ? `Back ${pick.player.username}` : ''} footer=${html`<${Button} block size="lg" loading=${back.pending} disabled=${amount > user.wallet.available || (pick && pick.soldPct + share > pick.maxPct)} onClick=${() => back.run({ runId: pick.id, amount })}>Back for ${money(amount)}<//>`}>
      ${pick && html`<div class="stack">
        <p class="small muted">${pick.label}. Buy-in ${money(pick.buyIn)} at ${pick.markup}× markup.</p>
        <${AmountPicker} value=${amount} onChange=${setAmount} amounts=${[2000, 5000, 10000, 20000, 50000]} />
        <div class="card row between" style="background:var(--elevated)"><div><p class="xs muted">Your share</p><p class="big-num" style="font-size:36px">${share.toFixed(1)}%</p></div><div style="text-align:right"><p class="xs muted">If they cash 3× buy-in</p><p class="strong money num">${money((pick.buyIn * 3 * share) / 100)}</p></div></div>
        ${pick.soldPct + share > pick.maxPct && html`<${Notice} tone="warn">Only ${(pick.maxPct - pick.soldPct).toFixed(1)}% is left. Pick a smaller amount.<//>`}
        <p class="xs faint">You can lose the full amount. Results settle about 90 seconds after backing in the demo.</p>
      </div>`}
    <//>
  </div>`;
}

export function Predictions({ path, query }) {
  const { user } = useSession();
  const tab = query.tab || 'open';
  const cat = query.cat || '';
  const q = useRpc('predictions.list');
  const [pick, setPick] = useState(null); // { market, option }
  const [amount, setAmount] = useState(2000);
  const buy = useAction('predictions.buy', { success: 'Prediction placed', onSuccess: () => { setPick(null); q.refresh(); } });
  const gate = q.data?.gate;
  return html`<div class="container page">
    <${PlaySubnav} path=${path} />
    <${PageHead} title="Predictions" sub="Call outcomes on esports, STACKD events and sports. Prices move with demand. Available by jurisdiction." />
    <${GateBlock} gate=${gate} what="Predictions" />
    <${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[{ value: 'open', label: 'Markets' }, { value: 'mine', label: 'Your positions', count: q.data?.positions?.length }]} />
    ${tab === 'open' && html`<div class="mt-4"><${Chips} label="Category" value=${cat} onChange=${(v) => setQuery({ cat: v })} options=${[{ value: '', label: 'All' }, { value: 'esports', label: 'Esports' }, { value: 'gaming', label: 'STACKD events' }, { value: 'sports', label: 'Sports' }]} /></div>`}
    <div class="mt-6">
      <${Async} q=${q} skeleton=${html`<${CardsSkeleton} n=${4} h=${200} />`}>
        ${(d) => tab === 'open'
          ? html`<div class="grid-2">${d.markets.filter((m) => !cat || m.category === cat).map((m) => html`<div class="card stack" style="gap:var(--s-3)">
              <div class="row between"><${Badge}>${{ esports: 'Esports', gaming: 'STACKD', sports: 'Sports' }[m.category]}<//>${m.status === 'open' ? html`<span class="xs muted"><${Countdown} to=${m.closesAt} prefix="Closes" live="Closing" /></span>` : html`<${Badge} tone=${m.status === 'resolved' ? '' : 'warn'}>${m.status === 'resolved' ? 'Resolved' : 'Closed'}<//>`}</div>
              <p class="h3">${m.title}</p>
              <div class="stack tight">${m.options.map((o) => html`<button type="button" class=${`mk-opt ${m.resolution === o.id ? 'won' : ''}`} disabled=${m.status !== 'open' || !gate?.allowed} onClick=${() => { setPick({ market: m, option: o }); setAmount(2000); }}>
                <span class="grow strong small truncate">${o.label}</span>
                <span class="num xs muted">${Math.round(o.price * 100)}%</span>
                <span class="mk-price num">${(1 / o.price).toFixed(2)}×</span>
              </button>`)}</div>
              <p class="xs muted">Volume ${money(m.volume)}</p>
            </div>`)}</div>`
          : d.positions.length ? html`<div class="card"><div class="list">${d.positions.map((p) => html`<div class="li">
              <div class="grow" style="min-width:0"><p class="li-title truncate">${p.market?.title}</p><p class="li-sub">${p.optionLabel} at ${Math.round(p.price * 100)}% · ${ago(p.at)}</p></div>
              <div style="text-align:right"><p class="strong num">${money(p.amount)}</p><p class="xs muted">Pays ${money(Math.floor(p.shares))}</p></div>
              <${Badge} tone=${p.status === 'won' ? 'money' : p.status === 'open' ? 'accent' : ''}>${p.status === 'won' ? 'Won' : p.status === 'open' ? 'Open' : 'Lost'}<//>
            </div>`)}</div></div>`
          : html`<${Empty} icon="trend" title="No positions yet" body="Pick an outcome on any open market." />`}
      <//>
    </div>
    <${Sheet} open=${!!pick} onClose=${() => setPick(null)} title="Make your call" footer=${html`<${Button} block size="lg" loading=${buy.pending} disabled=${amount > user.wallet.available} onClick=${() => buy.run({ marketId: pick.market.id, optionId: pick.option.id, amount })}>Call it for ${money(amount)}<//>`}>
      ${pick && html`<div class="stack">
        <p class="small muted">${pick.market.title}</p>
        <p class="h2">${pick.option.label}</p>
        <${AmountPicker} value=${amount} onChange=${setAmount} amounts=${[1000, 2000, 5000, 10000, 20000]} />
        <div class="card row between" style="background:var(--elevated)"><div><p class="xs muted">Pays if right</p><p class="big-num money" style="font-size:36px">${money(Math.floor(amount / pick.option.price))}</p></div><p class="xs muted" style="max-width:18ch;text-align:right">Price ${Math.round(pick.option.price * 100)}%. Demo credits only.</p></div>
      </div>`}
    <//>
  </div>`;
}
