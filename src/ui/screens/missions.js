import { html, useState, useRef } from '../../lib/preact.js';
import { useRpc, useAction, useSession, useMeta, toast } from '../hooks.js';
import { setQuery } from '../router.js';
import { rpc, newKey } from '../../client/api.js';
import { Icon } from '../icons.js';
import { PlaySubnav } from '../components/shell.js';
import { Button, Badge, Tabs, Empty, Async, CardsSkeleton, Sk, PageHead, Notice, Input, Seg, Progress, Countdown } from '../components/base.js';
import { MissionCard } from '../components/cards.js';
import { GameThumb } from '../components/game.js';
import { EvidencePicker } from './match.js';
import { when, until, ago, money } from '../format.js';

export function Missions({ path, query }) {
  const tab = query.tab || 'live';
  const q = useRpc('missions.list');
  return html`<div class="container page">
    <${PlaySubnav} path=${path} />
    <${PageHead} title="Stack Missions" sub="Brands drop missions into the games you play. Complete them, collect the drop." />
    <${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[
      { value: 'live', label: 'Live', count: (q.data?.missions || []).filter((m) => m.status === 'live').length },
      { value: 'soon', label: 'Coming up' },
      { value: 'ended', label: 'Ended' },
      { value: 'drops', label: 'Your drops', count: q.data?.drops?.length },
    ]} />
    <div class="mt-6">
      <${Async} q=${q} skeleton=${html`<${CardsSkeleton} n=${3} h=${300} />`}>
        ${(d) => {
          if (tab === 'drops')
            return d.drops.length
              ? html`<div class="grid-3">${d.drops.map((x) => html`<div class="card stack tight" style=${`border-left:4px solid ${x.sponsor?.color}`}>
                  <div class="row between"><span class="strong">${x.sponsor?.name}</span><${Badge} tone=${x.status === 'redeemed' ? '' : 'money'}>${x.status === 'redeemed' ? 'Redeemed' : 'Ready'}<//></div>
                  <p class="h3">${x.label}</p>
                  <div class="row between"><span class="num strong" style="letter-spacing:.08em">${x.code}</span><button type="button" class="text-btn" onClick=${() => { navigator.clipboard?.writeText(x.code); toast.ok('Code copied'); }}><${Icon} name="copy" />Copy</button></div>
                  <p class="xs muted">${ago(x.at)}</p>
                </div>`)}</div>`
              : html`<${Empty} icon="gift" title="No drops yet" body="Complete a mission and your reward lands here with its code." action=${html`<${Button} onClick=${() => setQuery({ tab: 'live' })}>See live missions<//>`} />`;
          const list = d.missions.filter((m) => (tab === 'live' ? m.status === 'live' : tab === 'soon' ? ['scheduled', 'pending'].includes(m.status) : m.status === 'complete'));
          return list.length ? html`<div class="grid-3">${list.map((m) => html`<${MissionCard} m=${m} />`)}</div>` : html`<${Empty} icon="gift" title="Nothing here right now" body="New missions drop every week." />`;
        }}
      <//>
    </div>
  </div>`;
}

const HEAT = { cold: 'Cold', warm: 'Warm', hot: 'Hot', burning: 'Burning', found: 'Found it' };

function Hunt({ m, onChange }) {
  const [busy, setBusy] = useState(null);
  const [secret, setSecret] = useState(null);
  const scans = m.progress?.scans || [];
  const n = m.hunt.size;
  const left = m.hunt.maxScans - scans.length;
  const over = m.progress?.found || m.progress?.failed;
  const scan = async (cell) => {
    if (busy != null || over || scans.some((s) => s.cell === cell)) return;
    setBusy(cell);
    try {
      const r = await rpc('missions.scan', { id: m.id, cell }, { fast: true });
      if (r.secret != null) setSecret(r.secret);
      if (r.heat === 'found') toast.ok('Found it', m.reward.label);
      onChange();
    } catch (e) {
      toast.err("Couldn't scan", e.message);
    } finally {
      setBusy(null);
    }
  };
  const last = scans[scans.length - 1];
  return html`<div class="stack">
    <div class="row between"><p class="strong">Scan the map</p><span class="small">${over ? '' : html`<strong class="num">${left}</strong> scans left`}</span></div>
    <div class="hunt" style=${`grid-template-columns:repeat(${n},1fr)`} role="grid" aria-label="Mission map">
      ${Array.from({ length: n * n }, (_, i) => {
        const s = scans.find((x) => x.cell === i);
        const isSecret = secret === i;
        return html`<button type="button" class=${`cell ${s ? s.heat : ''} ${isSecret ? 'secret' : ''}`} disabled=${over || !!s} aria-label=${s ? `${HEAT[s.heat]}` : `Scan square ${i + 1}`} onClick=${() => scan(i)}>
          ${busy === i ? html`<span class="spin" style="width:14px;height:14px"></span>` : s?.heat === 'found' || isSecret ? html`<${Icon} name="gift" />` : s ? html`<span class="xs strong">${HEAT[s.heat]}</span>` : ''}
        </button>`;
      })}
    </div>
    ${last && !over && html`<p class="small center"><strong>${HEAT[last.heat]}.</strong> ${{ cold: 'Nowhere near.', warm: 'Getting there.', hot: 'Close.', burning: "It's right next to you." }[last.heat]}</p>`}
    ${m.progress?.failed && html`<${Notice} tone="warn" title="Out of scans" action=${html`<${Button} size="sm" onClick=${onChange.retry}>Try again<//>`}>${secret != null ? "That's where it was hiding." : ''} You can start a fresh map.<//>`}
  </div>`;
}

function InGame({ m, onDone }) {
  const game = useRpc('games.get', { slug: m.game.slug }, { live: false });
  const mode = game.data?.modes.find((x) => x.id === m.modeId);
  const [stats, setStats] = useState({});
  const [evidence, setEvidence] = useState([]);
  const [busy, setBusy] = useState(false);
  const [simulating, setSim] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const key = useRef(newKey());
  const simulate = async () => {
    setSim(true);
    try {
      const [r] = await Promise.all([rpc('missions.simulate', { id: m.id }), new Promise((res) => setTimeout(res, 1600))]);
      setStats(r.stats);
      setEvidence([r.evidence]);
      setOutcome(null);
    } catch (e) {
      toast.err("Couldn't simulate", e.message);
    } finally {
      setSim(false);
    }
  };
  const submit = async () => {
    if (!evidence.length) return toast.err('Add your evidence', 'A results screenshot or clip is required for missions.');
    setBusy(true);
    try {
      const r = await rpc('missions.submit', { id: m.id, stats, evidence: evidence.map(({ type, name, demo, size }) => ({ type, name, demo, size })) }, { idempotencyKey: key.current });
      key.current = newKey();
      setOutcome(r);
      if (r.status === 'complete') onDone();
      else {
        setStats({});
        setEvidence([]);
      }
    } catch (e) {
      toast.err("Couldn't submit", e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!mode) return html`<${Sk} h=${200} r="14" />`;
  return html`<div class="stack">
    <div class="row"><${GameThumb} game=${m.game} size=${44} /><div><p class="strong">${m.game.name}, ${mode.name}</p><p class="xs muted">Objective: ${m.objective.label}</p></div></div>
    ${outcome && outcome.status !== 'complete' && html`<${Notice} tone=${outcome.status === 'rejected' ? 'err' : 'warn'} title=${outcome.status === 'rejected' ? 'Evidence mismatch' : 'Not this time'}>${outcome.message}<//>`}
    <div class="sim-box"><p class="xs muted">Demo mode: play the match out in the simulator, or enter your real stats.</p><${Button} variant="secondary" icon="zap" loading=${simulating} onClick=${simulate}>Simulate a match<//></div>
    <div class="form-grid">${mode.metrics.map((x) => x.type === 'bool'
      ? html`<div class="field"><span class="label">${x.label}</span><${Seg} value=${stats[x.key]} onChange=${(v) => setStats({ ...stats, [x.key]: v })} options=${[{ value: 1, label: 'Yes' }, { value: 0, label: 'No' }]} /></div>`
      : html`<${Input} label=${x.label} type="number" min=${x.min} max=${x.max} value=${stats[x.key] ?? ''} onInput=${(v) => setStats({ ...stats, [x.key]: v === '' ? '' : Number(v) })} />`)}</div>
    <${EvidencePicker} value=${evidence} onChange=${setEvidence} required />
    <${Button} size="lg" block loading=${busy} onClick=${submit}>Submit for verification<//>
  </div>`;
}

// Progress missions track real, verified results (no submission step).
function ProgressMission({ m }) {
  const meta = useMeta().data;
  const reqs = m.objective.requirements || [];
  return html`<div class="stack">
    <p class="h3">${m.objective.label}</p>
    <div class="stack">${reqs.map((r) => {
      const n = m.progress?.counts?.[r.metric] || 0;
      return html`<div class="stack tight">
        <div class="row between small"><span>${meta?.progressMetrics?.[r.metric] || r.metric}</span><span class="num strong">${n}/${r.target}</span></div>
        <${Progress} value=${Math.min(1, n / r.target)} tone=${n >= r.target ? 'money' : 'heat'} />
      </div>`;
    })}</div>
    <p class="xs muted">Counts every verified result since you started ${m.game ? `in ${m.game.name}` : 'in any game'}. The reward is credited the moment you finish.</p>
    <div class="row"><${Button} href="/app/play" icon="play">Find a match<//></div>
  </div>`;
}

export function MissionDetail({ params }) {
  const { user } = useSession();
  const q = useRpc('missions.get', { id: params.id }, { live: false });
  const start = useAction('missions.start', { onSuccess: () => q.refresh() });
  const m = q.data;
  if (q.loading && !m) return html`<div class="container page stack"><${Sk} h=${220} r="20" /><${Sk} h=${300} r="14" /></div>`;
  if (q.error) return html`<div class="container page"><${Empty} icon="alert" title="Mission not found" body=${q.error.message} action=${html`<${Button} href="/app/missions">All missions<//>`} /></div>`;
  const done = m.progress?.completedAt;
  const inRegion = m.regions.includes(user.country);
  const refresh = () => q.refresh();
  refresh.retry = () => start.run({ id: m.id });
  return html`<div class="container page">
    <a class="back" href="#/app/missions"><${Icon} name="chevL" />Missions</a>
    <section class="mission-hero" style=${`--sc:${m.sponsor.color}`}>
      <p class="display sponsor-word">${m.sponsor.name}</p>
      <div class="mission-hero-copy">
        <div class="row wrap tight"><${Badge} tone=${m.status === 'live' ? 'live' : ''}>${m.status === 'live' ? 'Live' : m.status === 'scheduled' ? `Starts ${when(m.startsAt)}` : 'Ended'}<//><${Badge}>Sponsored by ${m.sponsor.name}<//></div>
        <h1 class="h1" style="margin:10px 0 6px">${m.title}</h1>
        <p class="muted measure">${m.brief}</p>
      </div>
    </section>
    <div class="with-rail mt-6">
      <div class="card pad-lg" style="min-width:0">
        ${done ? html`<div class="stack" style="align-items:flex-start">
            <${Badge} tone="money" icon="check">Mission complete<//>
            <h2 class="display" style="font-size:clamp(48px,8vw,88px)">Drop secured.</h2>
            ${m.myDrop && html`<div class="card" style="background:var(--elevated)"><p class="xs muted">${m.myDrop.label}</p><p class="h2 num" style="letter-spacing:.08em">${m.myDrop.code}</p></div>`}
            <div class="row"><${Button} href="/app/missions?tab=drops">Your drops<//><${Button} variant="secondary" href="/app/missions">More missions<//></div>
          </div>`
          : m.status !== 'live' ? html`<${Empty} icon="clock" title=${m.status === 'complete' ? 'This mission has ended' : 'Not live yet'} body=${m.status === 'complete' ? 'All rewards were claimed or the campaign closed.' : `It opens ${when(m.startsAt)}.`} />`
          : !inRegion ? html`<${Notice} tone="warn" title="Not running in your country">This mission is open in ${m.regions.join(', ')}.<//>`
          : m.remaining === 0 ? html`<${Notice} tone="warn" title="All rewards claimed">Every drop for this mission has been taken.<//>`
          : !m.progress ? html`<div class="stack" style="align-items:flex-start">
              <p class="h3">${m.objective.label}</p>
              <p class="muted small">${m.type === 'hunt' ? `A ${m.hunt.size}×${m.hunt.size} map, ${m.hunt.maxScans} scans. Each scan tells you how close you are.` : m.type === 'progress' ? 'Start the mission, then play. Every verified result after you start counts toward it automatically.' : 'Play a normal match, then submit your results screenshot. We verify it like any competition.'}</p>
              <${Button} size="lg" icon="flag" loading=${start.pending} onClick=${() => start.run({ id: m.id })}>Start mission<//>
            </div>`
          : m.type === 'hunt' ? html`<${Hunt} m=${m} onChange=${refresh} />`
          : m.type === 'progress' ? html`<${ProgressMission} m=${m} />`
          : html`<${InGame} m=${m} onDone=${refresh} />`}
      </div>
      <aside class="stack" style="gap:var(--s-4)">
        <div class="card stack tight">
          <p class="xs muted">Reward</p><p class="h3">${m.reward.label}</p>
          ${m.reward.value > 0 && html`<p class="small money strong num">${money(m.reward.value)} ${m.reward.type === 'credit' ? 'credit' : ''}</p>`}
          <${Progress} value=${1 - m.remaining / m.quantity} tone="chalk" label="Claimed" />
          <p class="xs muted">${m.remaining.toLocaleString()} of ${m.quantity.toLocaleString()} left${m.status === 'live' ? `, ends ${until(m.endsAt)}` : ''}</p>
        </div>
        <div class="card stack tight small"><p class="strong">Eligibility</p><p class="muted">Ages ${m.eligibility?.minAge || 13}+${m.eligibility?.minScore ? `, STACK Score ${m.eligibility.minScore}+` : ''}. Regions: ${m.regions.join(', ')}.</p></div>
        <div class="card stack tight small"><p class="strong">Terms</p><p class="muted">${m.terms || 'One reward per player.'}</p></div>
      </aside>
    </div>
  </div>`;
}
