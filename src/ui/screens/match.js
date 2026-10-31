import { html, useState, useEffect, useRef } from '../../lib/preact.js';
import { useRpc, useAction, useSession, useNow, toast } from '../hooks.js';
import { navigate } from '../router.js';
import { rpc, newKey } from '../../client/api.js';
import { Icon } from '../icons.js';
import { Button, Badge, Seg, Empty, Sk, Notice, Avatar, Rank, Who, BigMoney, Sheet, Select, Textarea, Input, Progress } from '../components/base.js';
import { GameArt, GameThumb } from '../components/game.js';
import { StatusBadge } from '../components/cards.js';
import { money, ordinal, ago, clock, KIND, PLATFORM, opLabel } from '../format.js';

const VERIFIER = { api: 'Game data', video: 'Video / VOD review', screenshot: 'Screenshot check', manual: 'Referee review', simulation: 'Match simulator (demo)' };

// ---- Evidence picker (shared with missions + disputes) ---------------------------------------------
export function EvidencePicker({ value, onChange, required }) {
  const ref = useRef(null);
  const [link, setLink] = useState('');
  const [drag, setDrag] = useState(false);
  const add = (files) => {
    const items = [...files].slice(0, 5 - value.length).map((f) => ({
      type: f.type.startsWith('video') ? 'video' : 'screenshot', name: f.name, size: f.size,
      preview: f.type.startsWith('image') ? URL.createObjectURL(f) : null,
    }));
    if ([...files].some((f) => f.size > 50 * 1024 * 1024)) toast.err('That file is too big', 'Keep uploads under 50 MB, or paste a link to the clip instead.');
    onChange([...value, ...items.filter((i) => i.size <= 50 * 1024 * 1024)]);
  };
  const addLink = () => {
    if (!/^https?:\/\/\S+\.\S+/.test(link)) return toast.err('That link looks off', 'Paste the full URL, starting with https://');
    onChange([...value, { type: 'link', name: link }]);
    setLink('');
  };
  return html`<div class="stack tight">
    <span class="label">Evidence${required ? '' : html` <span class="faint" style="font-weight:500">(recommended)</span>`}</span>
    <div class=${`dropzone ${drag ? 'drag' : ''}`} role="button" tabindex="0" onClick=${() => ref.current.click()} onKeyDown=${(e) => (e.key === 'Enter' || e.key === ' ') && ref.current.click()}
      onDragOver=${(e) => { e.preventDefault(); setDrag(true); }} onDragLeave=${() => setDrag(false)} onDrop=${(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
      <${Icon} name="upload" />
      <p class="small strong">Upload a results screenshot or clip</p>
      <p class="xs">PNG, JPG or MP4, up to 50 MB. Your in-game name must be visible.</p>
      <input ref=${ref} type="file" accept="image/*,video/*" multiple hidden onChange=${(e) => { add(e.currentTarget.files); e.currentTarget.value = ''; }} />
    </div>
    <div class="row tight">
      <input class="input" style="height:40px" placeholder="Or paste a clip / VOD link" aria-label="Clip or VOD link" value=${link} onInput=${(e) => setLink(e.currentTarget.value)} />
      <${Button} size="sm" variant="secondary" onClick=${addLink} disabled=${!link}>Add<//>
    </div>
    ${value.length > 0 && html`<div class="stack tight">${value.map((e, i) => html`<div class="file-pill">
      ${e.preview ? html`<img src=${e.preview} alt="" style="width:32px;height:32px;object-fit:cover;border-radius:4px" />` : html`<${Icon} name=${e.type === 'video' ? 'video' : e.type === 'link' ? 'external' : 'image'} />`}
      <span class="grow truncate">${e.name}</span>${e.demo && html`<${Badge} tone="warn">Demo<//>`}
      <button type="button" class="icon-btn sm" aria-label=${`Remove ${e.name}`} onClick=${() => onChange(value.filter((_, j) => j !== i))}><${Icon} name="x" /></button>
    </div>`)}</div>`}
  </div>`;
}

function MetricInput({ metric, value, onChange }) {
  if (metric.type === 'bool')
    return html`<div class="field"><span class="label">${metric.label}</span><${Seg} value=${value === 1 ? 1 : value === 0 ? 0 : null} onChange=${onChange} options=${[{ value: 1, label: 'Yes' }, { value: 0, label: 'No' }]} /></div>`;
  return html`<${Input} label=${metric.label} type="number" inputmode="numeric" min=${metric.min} max=${metric.max} step=${metric.step || 1} value=${value ?? ''} onInput=${(v) => onChange(v === '' ? '' : Number(v))} />`;
}

function sayWin(stats) {
  if (stats.won != null && stats.won !== '') return stats.won === 1;
  if (stats.goals != null && stats.conceded != null && stats.goals !== '') return stats.goals > stats.conceded;
  if (stats.rounds != null && stats.roundsLost != null && stats.rounds !== '') return stats.rounds > stats.roundsLost;
  if (stats.placement != null && stats.placement !== '') return stats.placement === 1;
  if (stats.kills != null && stats.deaths != null) return stats.kills > stats.deaths;
  return null;
}

// ---- Play + report ------------------------------------------------------------------------------
function PlayPanel({ m, onReported }) {
  const metrics = m.mode?.metrics || [];
  const [stats, setStats] = useState(() => m.revealed || {});
  const [evidence, setEvidence] = useState([]);
  const [sim, setSim] = useState(m.revealed ? 'done' : 'idle');
  const [simPct, setSimPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const key = useRef(newKey());
  const start = useAction('matches.start', { quiet: true });
  const now = useNow(1000);
  const isH2H = m.kind === 'h2h' || (m.kind === 'tournament' && !m.tournament?.br);
  const needEvidence = !isH2H;

  const simulate = async () => {
    setSim('playing');
    setSimPct(0);
    const t0 = Date.now();
    const tick = setInterval(() => setSimPct(Math.min(1, (Date.now() - t0) / 2200)), 60);
    try {
      const [r] = await Promise.all([rpc('matches.simulate', { id: m.id }), new Promise((res) => setTimeout(res, 2200))]);
      setStats(r.stats);
      setEvidence((e) => [...e.filter((x) => !x.demo), r.evidence]);
      setSim('done');
    } catch (e) {
      toast.err("Couldn't simulate", e.message);
      setSim('idle');
    } finally {
      clearInterval(tick);
    }
  };

  const submit = async () => {
    setError(null);
    const missing = metrics.filter((x) => stats[x.key] === undefined || stats[x.key] === '' || stats[x.key] === null);
    if (missing.length) return setError(`Fill in ${missing.map((x) => x.label.toLowerCase()).join(', ')}.`);
    if (needEvidence && !evidence.length) return setError('Add a screenshot, clip or link so we can verify the result.');
    setBusy(true);
    try {
      const out = await rpc('matches.report', { id: m.id, stats, evidence: evidence.map(({ type, name, demo, size }) => ({ type, name, demo, size })) }, { idempotencyKey: key.current });
      onReported(out);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const win = sayWin(stats);
  const started = m.startedAt;
  return html`<div class="stack" style="gap:var(--s-5)">
    <div class="card pad-lg stack">
      <div class="row between"><p class="strong">1. Play the match</p>${started ? html`<${Badge} tone="live">Live ${clock(now - started)}<//>` : html`<${Badge}>Ready<//>`}</div>
      <ol class="stack tight small">${m.instructions.map((s, i) => html`<li class="row top tight"><span class="kbd">${i + 1}</span><span>${s}</span></li>`)}</ol>
      ${!started && html`<${Button} variant="secondary" icon="playTri" loading=${start.pending} onClick=${() => start.run({ id: m.id })}>I'm starting the match now<//>`}
      <div class="sim-box">
        <div class="row between"><div><p class="strong small">Demo mode</p><p class="xs muted">No game to launch? Play it out in the simulator. It generates a realistic result from your rating and attaches a demo screenshot.</p></div></div>
        ${sim === 'playing' ? html`<div class="stack tight"><${Progress} value=${simPct} tone="heat" label="Simulating" /><p class="xs muted">${simPct < 0.35 ? 'Dropping in…' : simPct < 0.7 ? 'Mid-match…' : 'Final circle…'}</p></div>`
          : sim === 'done' ? html`<div class="sim-result"><${Icon} name="check" size="18" /><span class="small">Played. The evidence shows: <strong>${metrics.map((x) => `${x.label} ${x.type === 'bool' ? (stats[x.key] ? 'yes' : 'no') : m.revealed?.[x.key] ?? stats[x.key]}`).join(', ')}</strong></span></div>`
          : html`<${Button} icon="zap" onClick=${simulate}>Simulate my match<//>`}
      </div>
    </div>

    <div class="card pad-lg stack">
      <p class="strong">2. Report your result</p>
      ${m.kind === 'pool' && html`<p class="small muted">Report your ${m.mode.teamSize > 1 ? "squad's placement and your" : 'placement and'} eliminations. ${m.playerCount} players in this lobby.</p>`}
      <div class="form-grid">${metrics.map((x) => html`<${MetricInput} metric=${x} value=${stats[x.key]} onChange=${(v) => setStats({ ...stats, [x.key]: v })} />`)}</div>
      ${isH2H && win !== null && html`<${Notice} tone=${win ? 'ok' : 'info'}>You're reporting a <strong>${win ? 'win' : 'loss'}</strong>. Your opponent reports too. If you disagree, a referee decides.<//>`}
      <${EvidencePicker} value=${evidence} onChange=${setEvidence} required=${needEvidence} />
      ${error && html`<${Notice} tone="err">${error}<//>`}
      <${Button} size="lg" block loading=${busy} onClick=${submit}>Submit result<//>
      <p class="xs faint">False reports void the result and can restrict your account. Reports are checked against the evidence.</p>
    </div>
  </div>`;
}

function Verifying({ out, onDone }) {
  const [n, setN] = useState(0);
  const checks = out?.verification?.checks || [];
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), 420);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (n > checks.length + 1) onDone();
  }, [n]);
  return html`<div class="card pad-lg stack" style="align-items:center;text-align:center;padding:var(--s-10) var(--s-6)" aria-live="polite">
    <span class="spin" style="width:32px;height:32px"></span>
    <p class="h2">Verifying your result</p>
    <p class="small muted">${VERIFIER[out?.verification?.method] || 'Checking'}</p>
    <ul class="stack tight" style="text-align:left;min-width:min(320px,100%)">
      ${checks.map((c, i) => html`<li class="row tight small" style=${`opacity:${i < n ? 1 : 0.25};transition:opacity 200ms`}>
        <${Icon} name=${i < n ? (c.ok ? 'check' : 'alert') : 'dot'} size="16" cls=${i < n ? (c.ok ? 'money' : 'heat') : ''} /><span>${c.label}</span>
      </li>`)}
    </ul>
  </div>`;
}

// ---- Live battle royale (played out by the game integration) -------------------------------------
function LiveBR({ m }) {
  const l = m.live;
  const offset = useRef(0);
  useEffect(() => {
    offset.current = l.serverNow - Date.now();
  }, [l.serverNow]);
  const now = useNow(250) + offset.current;
  const countdown = l.phase === 'countdown';
  const secs = Math.max(0, Math.ceil((l.liveAt - now) / 1000));
  const elapsed = Math.min(1, Math.max(0, (now - l.liveAt) / Math.max(1, l.endsAt - l.liveAt)));
  const me = l.me;
  return html`<div class="card pad-lg stack" aria-live="polite">
    <div class="row between wrap tight">
      <p class="strong">${countdown ? 'Lobby locked' : l.phase === 'live' ? 'Match in progress' : 'Final circle closed'}</p>
      <div class="row tight">${countdown ? html`<${Badge} tone="live">Starts in ${secs}s<//>` : html`<${Badge} tone="live">Live ${clock(Math.max(0, now - l.liveAt))}<//>`}<${Badge} tone="warn">Simulated<//></div>
    </div>
    ${countdown
      ? html`<div class="stack tight" style="align-items:center;text-align:center;padding:var(--s-4) 0">
          <span class="display" style="font-size:clamp(64px,12vw,112px)">${secs}</span>
          <p class="small muted">${l.players} players · ${l.teams} ${m.mode?.teamSize > 1 ? 'squads' : 'entrants'} · every seat paid</p>
        </div>`
      : html`<${Progress} value=${elapsed} tone="heat" label=${`Zone ${l.zone} of ${l.zones}`} />`}
    <div class="row wrap" style="gap:var(--s-6)">
      <div class="stat"><div class="v">${l.alivePlayers}</div><div class="l">Players alive</div></div>
      <div class="stat"><div class="v">${l.aliveTeams}</div><div class="l">${m.mode?.teamSize > 1 ? 'Squads left' : 'Left standing'}</div></div>
      ${me && html`<div class="stat"><div class=${`v ${me.alive ? 'money' : 'err-text'}`}>${me.alive ? 'Alive' : 'Out'}</div><div class="l">${me.alive ? 'You' : `By ${me.eliminatedBy}`}</div></div>`}
      ${me && html`<div class="stat"><div class="v">${me.kills}</div><div class="l">Your eliminations</div></div>`}
      ${me?.squad && html`<div class="stat"><div class="v">${me.squadAlive}/${me.squadSize}</div><div class="l">${me.squad}</div></div>`}
    </div>
    ${l.feed.length > 0 && html`<div><p class="strong small mb-2">Kill feed</p><div class="list">
      ${l.feed.map((e) => html`<div class="li" style=${e.mine ? 'background:var(--surface-2)' : ''}>
        <${Icon} name=${e.zone ? 'alert' : 'target'} size="16" cls=${e.mine ? 'heat' : ''} />
        <div class="grow" style="min-width:0"><p class="li-title truncate">${e.zone ? html`${e.victim} <span class="muted">was caught by the zone</span>` : html`${e.killer} <span class="muted">eliminated</span> ${e.victim}`}</p>
          ${e.teamOut && html`<p class="xs muted">${e.teamOut} is out</p>`}</div>
        <time class="xs muted num">${clock(Math.max(0, e.at - l.liveAt))}</time>
      </div>`)}
    </div></div>`}
    <p class="xs faint">DEMO MODE: this match is played out by the STACKD simulator through the same integration interface a real game feed will use. Results are never presented as live game data.</p>
  </div>`;
}

// ---- Result -------------------------------------------------------------------------------------
function ResultHero({ m, user }) {
  const r = m.mine || {};
  const won = r.won;
  const isPool = m.kind === 'pool' || m.tournament?.br;
  const tourNonFinal = m.kind === 'tournament';
  const title = m.kind === 'tournament' ? (won ? (m.tournament?.br ? 'Strong game.' : 'You advance.') : m.tournament?.br ? 'Game logged.' : 'Knocked out.') : won ? (r.payout > 0 ? 'Stacked.' : 'You won.') : 'Not this time.';
  return html`<section class=${`result-hero ${won ? 'won' : 'lost'}`}>
    <div class="row wrap tight"><${Badge} tone=${won ? 'money' : ''}>${won ? 'Win' : 'Loss'}<//>${isPool && r.place && html`<${Badge}>${ordinal(r.place)} place<//>`}${r.kills != null && html`<${Badge}>${r.kills} eliminations<//>`}</div>
    <h1 class="display result-title">${title}</h1>
    ${r.payout > 0 ? html`<div><p class="small muted">Added to your stack</p><${BigMoney} n=${r.payout} size=${72} cls="money" /></div>`
      : tourNonFinal ? html`<p class="muted">Prizes pay out when the tournament finishes.</p>` : html`<p class="muted">${m.kind === 'challenge' ? 'Close one. Same target, fresh match?' : 'Every run counts toward your rank. Run it back.'}</p>`}
    <div class="row wrap" style="gap:var(--s-6)">
      <div class="stat"><div class=${`v ${r.delta >= 0 ? 'money' : 'err-text'}`}>${r.delta >= 0 ? '+' : ''}${r.delta ?? 0}</div><div class="l">STACK Score</div></div>
      ${r.streakBonus > 0 && html`<div class="stat"><div class="v heat">+${r.streakBonus}</div><div class="l">Streak bonus</div></div>`}
      <div class="stat"><div class="v">${user.stackScore}</div><div class="l">${user.rank.name} rank</div></div>
      ${m.myScore && html`<div class="stat"><div class="v">${m.myScore}</div><div class="l">Final score</div></div>`}
    </div>
  </section>`;
}

function ShareButton({ m }) {
  const share = async () => {
    const r = m.mine || {};
    const text = r.won ? `Just ${r.payout ? `stacked ${money(r.payout)}` : 'won'} on STACKD in ${m.game.name}. Who's next?` : `Ran ${m.title} on STACKD. Running it back.`;
    try {
      if (navigator.share) await navigator.share({ text, title: 'STACKD' });
      else {
        await navigator.clipboard.writeText(text);
        toast.ok('Copied', 'Paste it anywhere.');
      }
    } catch {
      /* share sheet dismissed */
    }
  };
  return html`<${Button} variant="secondary" icon="share" onClick=${share}>Share<//>`;
}

function DisputeSheet({ open, onClose, m }) {
  const [reason, setReason] = useState('wrong_result');
  const [details, setDetails] = useState('');
  const [evidence, setEvidence] = useState([]);
  const [err, setErr] = useState(null);
  const create = useAction('disputes.create', { success: 'Dispute opened. A referee is on it.', onSuccess: (r) => { onClose(); navigate(`/app/disputes/${r.id}`); } });
  const submit = () => {
    if (details.trim().length < 10) return setErr('Tell the referee what happened (10 characters or more).');
    setErr(null);
    create.run({ matchId: m.id, reason, details, evidence: evidence.map(({ type, name }) => ({ type, name })) });
  };
  return html`<${Sheet} open=${open} onClose=${onClose} title="Dispute this result" footer=${html`<${Button} block size="lg" loading=${create.pending} onClick=${submit}>Send to a referee<//>`}>
    <p class="small muted">Disputes must be raised within 24 hours. A referee reviews both sides and the evidence. Most are decided the same day.</p>
    <${Select} label="What went wrong?" value=${reason} onChange=${setReason} options=${[{ value: 'wrong_result', label: 'The result is wrong' }, { value: 'cheating', label: 'My opponent cheated' }, { value: 'disconnect', label: 'Disconnect' }, { value: 'no_show', label: 'Opponent never showed' }, { value: 'other', label: 'Something else' }]} />
    <${Textarea} label="What happened" value=${details} onInput=${setDetails} error=${err} placeholder="Score at the end, what you saw, timestamps in the clip…" maxlength="600" />
    <${EvidencePicker} value=${evidence} onChange=${setEvidence} />
  <//>`;
}

export function MatchRoom({ params }) {
  const { user } = useSession();
  const q = useRpc('matches.get', { id: params.id });
  const [phase, setPhase] = useState(null); // null | { out } while the verification animation runs
  const [dispute, setDispute] = useState(false);
  const rematch = useAction('competitions.rematch', { success: 'Run it back', onSuccess: (r) => navigate(r.matchId ? `/app/match/${r.matchId}` : `/app/compete/${r.competitionId}`) });
  const m = q.data;
  // Simulated matches move between server commits (eliminations replay against the clock): poll while live.
  const watching = !!m?.live && ['starting', 'live'].includes(m.status);
  useEffect(() => {
    if (!watching) return undefined;
    const t = setInterval(() => q.refresh(), 2000);
    return () => clearInterval(t);
  }, [watching, params.id]);
  if (q.loading && !m) return html`<div class="container page stack"><${Sk} h=${120} r="20" /><${Sk} h=${300} r="14" /></div>`;
  if (q.error) return html`<div class="container page"><${Empty} icon="alert" title="Match not found" body=${q.error.message} action=${html`<${Button} href="/app">Home<//>`} /></div>`;

  const comp = m.competition;
  const opp = m.players.find((p) => p.id !== user.id);
  const isH2H = m.kind === 'h2h' || (m.kind === 'tournament' && !m.tournament?.br);
  const settled = m.status === 'settled';
  const withinDispute = settled && Date.now() - m.settledAt < 86400000 && !m.disputeId;

  return html`<div class="container page">
    <a class="back" href=${m.tournament ? `#/app/tournaments/${m.tournament.id}` : comp ? `#/app/compete/${comp.id}` : '#/app'}><${Icon} name="chevL" />${m.tournament ? m.tournament.name : comp ? (comp.kind === 'challenge' ? 'Challenges' : comp.title) : 'Home'}</a>
    <div class="match-head">
      <${GameThumb} game=${m.game} size=${56} />
      <div class="grow" style="min-width:0">
        <div class="row wrap tight"><${StatusBadge} status=${m.status} /><${Badge}>${m.tournament ? m.tournament.label || 'Tournament' : KIND[m.kind]}<//></div>
        <h1 class="h1 mt-2" style="font-size:clamp(28px,4vw,44px)">${m.title}</h1>
        <p class="small muted">${m.game.name}, ${m.mode.name}${comp ? `, ${PLATFORM[comp.platform]}` : ''}</p>
      </div>
    </div>

    <div class="with-rail mt-6">
      <div class="stack" style="gap:var(--s-5);min-width:0">
        ${m.kind === 'challenge' && comp?.challenge && html`<div class="card pad-lg row wrap between" style="gap:var(--s-4)">
          <div><p class="xs muted">Target</p><p class="h2">${comp.title}</p></div>
          <div class="row" style="gap:var(--s-6)"><div><p class="xs muted">Entry</p><p class="strong num">${money(comp.entry)}</p></div><div><p class="xs muted">Pays</p><p class="strong num money">${money(comp.challenge.payout)}</p></div><div><p class="xs muted">Multiplier</p><p class="strong num">${comp.challenge.multiplier}×</p></div></div>
        </div>`}
        ${isH2H && opp && html`<div class="card pad-lg"><div class="h2h-row">
          <div class="stack tight" style="align-items:center;text-align:center"><${Avatar} user=${user} size="lg" /><span class="strong">You</span><${Rank} rank=${user.rank} /></div>
          <span class="display" style="font-size:40px;color:var(--faint)">${settled && m.myScore ? m.myScore : 'vs'}</span>
          <div class="stack tight" style="align-items:center;text-align:center"><${Avatar} user=${opp} size="lg" /><a class="strong" href=${`#/app/u/${opp.username}`}>${m.tournament?.oppName && m.tournament.oppName !== opp.username ? m.tournament.oppName : opp.username}</a><${Rank} rank=${opp.rank} /></div>
        </div>
        ${m.reports[opp.id] && !settled && html`<p class="xs muted center mt-4">${opp.username} has reported.</p>`}</div>`}

        ${phase ? html`<${Verifying} out=${phase.out} onDone=${() => { setPhase(null); q.reload(); }} />`
          : watching ? html`<${LiveBR} m=${m} />`
          : m.canReport ? html`<${PlayPanel} m=${m} onReported=${(out) => { setPhase({ out }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />`
          : m.status === 'reporting' ? html`<${Notice} tone="info" title="Waiting on your opponent">You reported. As soon as they do, the match settles. If reports clash, a referee decides.<//>`
          : m.status === 'verifying' ? html`<div class="card pad-lg stack"><div class="row"><span class="spin"></span><p class="strong">With a referee</p></div><p class="small muted">Some checks need a human. Reviews in the demo take about 30 seconds. You'll get a notification.</p></div>`
          : m.status === 'disputed' ? html`<${Notice} tone="warn" title="Disputed" action=${m.disputeId && html`<${Button} size="sm" variant="secondary" href=${`/app/disputes/${m.disputeId}`}>View dispute<//>`}>Reports didn't match, so a referee is reviewing the evidence.<//>`
          : m.status === 'cancelled' ? html`<${Notice} tone="warn" title="Cancelled">This match was cancelled and entries refunded.<//>`
          : settled ? html`<div class="stack" style="gap:var(--s-5)">
              <${ResultHero} m=${m} user=${user} />
              ${m.outcome?.note && html`<${Notice} tone="info" title="Referee note">${m.outcome.note}<//>`}
              ${m.outcome?.simulated && html`<${Notice} tone="info" title="Demo result">Played out by the STACKD match simulator (DEMO MODE). Prizes are demo credit; nothing here is live game data.<//>`}
              ${m.kind === 'challenge' && m.outcome?.stats && comp?.challenge && html`<div class="card row between"><span class="small muted">Target ${opLabel(comp.challenge.op, comp.challenge.target, comp.challenge.metric)} ${comp.challenge.metric === 'won' ? '' : comp.challenge.metric}</span><span class="strong">You: ${m.outcome.stats[comp.challenge.metric]}</span></div>`}
              ${m.mine?.unlocked?.length > 0 && html`<${Notice} tone="ok" title="Achievement unlocked">${m.mine.unlocked.join(', ').replace(/_/g, ' ')}<//>`}
              <div class="row wrap">
                ${comp && html`<${Button} size="lg" icon="again" loading=${rematch.pending} onClick=${() => rematch.run({ id: comp.id })}>Run it back<//>`}
                ${m.tournament && html`<${Button} size="lg" href=${`/app/tournaments/${m.tournament.id}`}>Back to the bracket<//>`}
                <${ShareButton} m=${m} />
                <${Button} variant="ghost" href="/app/wallet">View wallet<//>
              </div>
              ${(m.outcome?.standings || m.outcome?.placements) && html`<div class="card"><p class="strong mb-2">Final standings</p><div class="list">
                ${(m.outcome.standings || m.outcome.placements).slice(0, 10).map((s) => html`<div class="li"><span class=${`pos p${s.place}`}>${s.place}</span><div class="grow"><p class="li-title">${s.name}</p></div><span class="small muted num">${typeof s.kills === 'number' ? `${s.kills} elims` : ''}</span></div>`)}
              </div></div>`}
            </div>` : null}
      </div>

      <aside class="stack" style="gap:var(--s-4)">
        ${m.verification && html`<div class="card stack tight">
          <div class="row between"><p class="strong small">Verification</p><${Badge} tone=${m.verification.status === 'verified' ? 'money' : m.verification.status === 'rejected' ? 'err' : 'warn'}>${m.verification.status}<//></div>
          <p class="xs muted">${VERIFIER[m.verification.method] || m.verification.method}${m.verification.simulated ? ' · demo evidence, simulated' : `, ${Math.round(m.verification.confidence * 100)}% confidence`}</p>
          <ul class="stack tight mt-2">${m.verification.checks.map((c) => html`<li class="row top tight small"><${Icon} name=${c.ok ? 'check' : 'alert'} size="16" cls=${c.ok ? 'money' : 'heat'} /><span>${c.label}${c.note && html`<span class="xs muted" style="display:block">${c.note}</span>`}</span></li>`)}</ul>
        </div>`}
        <div class="card"><p class="strong small mb-2">Match log</p><ol class="timeline">${[...m.timeline].map((t) => html`<li>${t.text}<time>${ago(t.at)}</time></li>`)}</ol>
          <p class="xs faint mt-2">Match ID ${m.id}. Every report, check and decision is logged.</p></div>
        <div class="card stack tight"><p class="strong small">Something off?</p>
          ${withinDispute ? html`<${Button} variant="secondary" size="sm" icon="shield" onClick=${() => setDispute(true)}>Dispute result<//>` : m.disputeId ? html`<${Button} variant="secondary" size="sm" href=${`/app/disputes/${m.disputeId}`}>View dispute<//>` : html`<p class="xs muted">You can dispute within 24 hours of the result.</p>`}
          <a class="text-btn" href="#/app/fairplay">Fair play rules<${Icon} name="chevR" /></a>
        </div>
      </aside>
    </div>
    <${DisputeSheet} open=${dispute} onClose=${() => setDispute(false)} m=${m} />
  </div>`;
}
