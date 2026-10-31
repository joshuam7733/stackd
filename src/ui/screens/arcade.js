import { html, useState, useEffect, useRef } from '../../lib/preact.js';
import { useRpc, useSession, toast } from '../hooks.js';
import { rpc, newKey } from '../../client/api.js';
import { Icon } from '../icons.js';
import { PlaySubnav } from '../components/shell.js';
import { Button, Badge, Empty, Async, CardsSkeleton, Sk, PageHead, Notice, AmountPicker, Avatar, Who, BigMoney } from '../components/base.js';
import { LeaderRow } from '../components/cards.js';
import { reactionDelays, REACTION_ROUNDS, aimTarget, AIM_TARGETS, AIM_LIMIT_MS, AIM_RADIUS, needlePos, TIMING_ROUNDS } from '../../shared/arcade.js';
import { money, ago } from '../format.js';

const KIND_ICON = { reaction: 'zap', aim: 'target', timing: 'clock', memory: 'grid', racing: 'trend' };

export function Arcade({ path }) {
  const q = useRpc('arcade.list');
  return html`<div class="container page">
    <${PlaySubnav} path=${path} />
    <${PageHead} title="Arcade" sub="Thirty-second skill games. Play free to warm up, or put an entry on it against a matched ghost run." />
    <${Async} q=${q} skeleton=${html`<${CardsSkeleton} n=${3} h=${260} />`}>
      ${(list) => html`<div class="grid-3">${list.map((g) => html`<a class=${`card clickable arcade-card ${g.status !== 'live' ? 'soon' : ''}`} href=${g.status === 'live' ? `#/app/arcade/${g.id}` : undefined} aria-disabled=${g.status !== 'live'}>
        <div class="arcade-icon"><${Icon} name=${KIND_ICON[g.kind]} /></div>
        <div class="row between"><p class="h3">${g.name}</p>${g.status === 'live' ? html`<${Badge}>${g.plays.toLocaleString()} plays<//>` : html`<${Badge} tone="warn">Coming soon<//>`}</div>
        <p class="small muted">${g.blurb}</p>
        ${g.status === 'live' && html`<div class="row between small mt-2"><span class="muted">Your best <strong class="num" style="color:var(--text)">${g.myBest ?? '—'}${g.myBest != null ? ` ${g.unit}` : ''}</strong></span><span class="muted">Top <strong class="num" style="color:var(--text)">${g.top[0]?.score ?? '—'} ${g.unit}</strong></span></div>`}
      </a>`)}</div>`}
    <//>
  </div>`;
}

// ---- Games --------------------------------------------------------------------------------------

function QuickDraw({ seed, onDone }) {
  const delays = useRef(reactionDelays(seed)).current;
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState('wait'); // wait | go | between
  const [times, setTimes] = useState([]);
  const taps = useRef([]);
  const t0 = useRef(0);
  const timer = useRef(null);
  useEffect(() => {
    if (round >= REACTION_ROUNDS) return;
    setPhase('wait');
    t0.current = performance.now();
    timer.current = setTimeout(() => setPhase('go'), delays[round]);
    return () => clearTimeout(timer.current);
  }, [round]);
  const tap = () => {
    if (phase === 'between' || round >= REACTION_ROUNDS) return;
    const t = Math.round(performance.now() - t0.current);
    clearTimeout(timer.current);
    taps.current.push({ round, t });
    const rt = t - delays[round];
    setTimes((x) => [...x, rt < 0 ? 'early' : rt]);
    setPhase('between');
    setTimeout(() => {
      if (round + 1 >= REACTION_ROUNDS) onDone({ taps: taps.current });
      else setRound(round + 1);
    }, 800);
  };
  useEffect(() => {
    const k = (e) => (e.code === 'Space' || e.key === 'Enter') && (e.preventDefault(), tap());
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  const last = times[times.length - 1];
  return html`<div class="arena qd ${phase}" role="button" tabindex="0" aria-label="Reaction area. Tap when it turns green." onPointerDown=${tap}>
    <p class="xs strong" style="opacity:.7">Round ${Math.min(round + 1, REACTION_ROUNDS)} of ${REACTION_ROUNDS}</p>
    <p class="display" style="font-size:clamp(48px,10vw,96px)">${phase === 'go' ? 'Tap!' : phase === 'between' ? (last === 'early' ? 'Too early' : `${last} ms`) : 'Wait…'}</p>
    <p class="small" style="opacity:.75">${phase === 'wait' ? 'Tap the moment this turns green. Space works too.' : ''}</p>
    <div class="row tight mt-4">${times.map((t) => html`<span class="badge ${t === 'early' ? 'err' : 'outline'}">${t === 'early' ? 'early' : `${t}`}</span>`)}</div>
  </div>`;
}

function Flick({ seed, onDone }) {
  const [i, setI] = useState(0);
  const [misses, setMisses] = useState(0);
  const [now, setNow] = useState(0);
  const hits = useRef([]);
  const start = useRef(performance.now());
  const box = useRef(null);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone({ hits: hits.current });
  };
  useEffect(() => {
    const t = setInterval(() => {
      const el = performance.now() - start.current;
      setNow(el);
      if (el >= AIM_LIMIT_MS) finish();
    }, 100);
    return () => clearInterval(t);
  }, []);
  const target = aimTarget(seed, i);
  const down = (e) => {
    if (done.current) return;
    const r = box.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const t = Math.round(performance.now() - start.current);
    if (Math.hypot(x - target.x, y - target.y) <= AIM_RADIUS * 1.15) {
      hits.current.push({ i, t, x, y });
      if (i + 1 >= AIM_TARGETS) finish();
      else setI(i + 1);
    } else setMisses((m) => m + 1);
  };
  return html`<div class="stack tight">
    <div class="row between small"><span>Targets <strong class="num">${i}/${AIM_TARGETS}</strong></span><span>Misses <strong class="num">${misses}</strong></span><span class="num strong">${Math.max(0, (AIM_LIMIT_MS - now) / 1000).toFixed(1)}s</span></div>
    <div class="arena aim" ref=${box} onPointerDown=${down} aria-label="Aim arena. Hit each target as fast as you can.">
      <span class="target" style=${`left:${target.x * 100}%;top:${target.y * 100}%;width:${AIM_RADIUS * 200}%;`}></span>
    </div>
  </div>`;
}

function DeadStop({ seed, onDone }) {
  const [round, setRound] = useState(0);
  const [pos, setPos] = useState(0);
  const [scores, setScores] = useState([]);
  const [stopped, setStopped] = useState(false);
  const stops = useRef([]);
  const t0 = useRef(performance.now());
  const raf = useRef(0);
  useEffect(() => {
    t0.current = performance.now();
    setStopped(false);
    const loop = () => {
      setPos(needlePos(seed, round, performance.now() - t0.current));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [round]);
  const stop = () => {
    if (stopped || round >= TIMING_ROUNDS) return;
    cancelAnimationFrame(raf.current);
    const t = Math.round(performance.now() - t0.current);
    const p = needlePos(seed, round, t);
    setPos(p);
    setStopped(true);
    stops.current.push({ round, t });
    setScores((s) => [...s, Math.max(0, Math.round(100 - Math.abs(p - 0.5) * 400))]);
    setTimeout(() => {
      if (round + 1 >= TIMING_ROUNDS) onDone({ stops: stops.current });
      else setRound(round + 1);
    }, 900);
  };
  useEffect(() => {
    const k = (e) => (e.code === 'Space' || e.key === 'Enter') && (e.preventDefault(), stop());
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return html`<div class="arena ds" role="button" tabindex="0" aria-label="Tap to stop the needle on the centre line" onPointerDown=${stop}>
    <p class="xs strong" style="opacity:.7">Round ${Math.min(round + 1, TIMING_ROUNDS)} of ${TIMING_ROUNDS}</p>
    <div class="ds-track"><span class="ds-zone"></span><span class="ds-line"></span><span class="ds-needle" style=${`left:${pos * 100}%`}></span></div>
    <p class="display" style="font-size:56px">${stopped ? scores[scores.length - 1] : 'Tap'}</p>
    <div class="row tight">${scores.map((s) => html`<span class="badge outline num">${s}</span>`)}</div>
  </div>`;
}

const GAMES = { reaction: QuickDraw, aim: Flick, timing: DeadStop };

export function ArcadeGame({ params }) {
  const { user } = useSession();
  const q = useRpc('arcade.get', { id: params.id });
  const [entry, setEntry] = useState(0);
  const [run, setRun] = useState(null); // { runId, seed, ghost }
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const keyStart = useRef(newKey());
  const keyFinish = useRef(newKey());
  const g = q.data;
  if (q.loading && !g) return html`<div class="container page"><${Sk} h=${400} r="14" /></div>`;
  if (q.error) return html`<div class="container page"><${Empty} icon="alert" title="Game not found" body=${q.error.message} action=${html`<${Button} href="/app/arcade">Arcade<//>`} /></div>`;
  const Game = GAMES[g.kind];
  const begin = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await rpc('arcade.start', { id: g.id, entry }, { idempotencyKey: keyStart.current });
      keyStart.current = newKey();
      setRun(r);
    } catch (e) {
      toast.err("Couldn't start", e.message);
    } finally {
      setBusy(false);
    }
  };
  const finish = async (telemetry) => {
    setBusy(true);
    try {
      const r = await rpc('arcade.finish', { runId: run.runId, telemetry }, { idempotencyKey: keyFinish.current });
      keyFinish.current = newKey();
      setResult(r);
      setRun(null);
      q.refresh();
    } catch (e) {
      toast.err("Couldn't score that run", e.message);
      setRun(null);
    } finally {
      setBusy(false);
    }
  };
  return html`<div class="container page">
    <a class="back" href="#/app/arcade"><${Icon} name="chevL" />Arcade</a>
    <${PageHead} title=${g.name} sub=${g.blurb} />
    <div class="with-rail">
      <div class="stack" style="min-width:0">
        ${run ? html`<div class="stack">
            <div class="row between"><${Who} user=${run.ghost.user} sub=${html`<span>Ghost run: <strong class="num">${run.ghost.score} ${g.unit}</strong></span>`} />${run && entry > 0 ? html`<${Badge} tone="money">${money(entry)} on it<//>` : html`<${Badge}>Practice<//>`}</div>
            ${busy ? html`<div class="arena"><span class="spin"></span><p class="small">Scoring your run on the server…</p></div>` : html`<${Game} seed=${run.seed} onDone=${finish} />`}
          </div>`
          : result ? html`<div class=${`result-hero ${result.won ? 'won' : 'lost'}`}>
            <div class="row wrap tight"><${Badge} tone=${result.won ? 'money' : ''}>${result.tie ? 'Tie' : result.won ? 'Win' : 'Loss'}<//>${result.position && html`<${Badge}>#${result.position} on the board<//>`}${result.flagged && html`<${Badge} tone="err">Flagged for review<//>`}</div>
            <h2 class="display result-title" style="font-size:clamp(56px,10vw,110px)">${result.score} ${g.unit}</h2>
            <p class="muted">vs ${result.ghost.user.username}'s ${result.ghost.score} ${g.unit}. ${g.lowerBetter ? 'Lower wins.' : 'Higher wins.'}</p>
            ${result.payout > 0 && html`<div><p class="small muted">${result.tie ? 'Entry back' : 'Added to your stack'}</p><${BigMoney} n=${result.payout} size=${56} cls="money" /></div>`}
            ${result.flagged && html`<${Notice} tone="err" title="This run looked off">${result.detail.suspicious}. No payout until a referee reviews it.<//>`}
            <div class="row wrap"><${Button} size="lg" icon="again" onClick=${begin} loading=${busy}>Run it back<//><${Button} variant="secondary" onClick=${() => setResult(null)}>Change entry<//></div>
          </div>`
          : html`<div class="card pad-lg stack">
            <p class="strong">Entry</p>
            <${AmountPicker} value=${entry} onChange=${setEntry} amounts=${g.entries} />
            <p class="small muted">${entry ? `Beat a matched ghost run and win ${money(Math.floor(entry * g.payoutMult))}. Ties refund your entry.` : 'Free practice. Your score still counts on the leaderboard.'}</p>
            ${entry > user.wallet.available && html`<${Notice} tone="warn">Not enough in your stack for that entry.<//>`}
            <${Button} size="lg" loading=${busy} disabled=${entry > user.wallet.available} onClick=${begin}>${entry ? `Play for ${money(entry)}` : 'Play free'}<//>
          </div>`}
        <div class="card"><p class="strong mb-2">How it works</p><ul class="stack tight small">${g.rules.map((r) => html`<li class="row top tight"><${Icon} name="check" size="16" /><span>${r}</span></li>`)}</ul>
          <p class="xs muted mt-4">Scores are recalculated on our servers from your raw inputs, never taken from your device. Inhuman input patterns are flagged.</p></div>
      </div>
      <aside class="stack" style="gap:var(--s-4)">
        <div class="card"><p class="strong small mb-2">Leaderboard</p><div class="list">${g.board.slice(0, 10).map((r) => html`<${LeaderRow} position=${r.position} user=${r.user} value=${r.score} valueLabel=${g.unit} me=${r.user.id === user.id} />`)}</div></div>
        <div class="card"><p class="strong small mb-2">Your recent runs</p>${g.myRuns.length ? html`<div class="list">${g.myRuns.map((r) => html`<div class="li"><span class="grow small">${ago(r.at)}${r.entry ? ` · ${money(r.entry)}` : ' · practice'}</span><span class="num strong">${r.score} ${g.unit}</span>${r.entry > 0 && html`<${Badge} tone=${r.won ? 'money' : ''}>${r.won ? 'W' : 'L'}<//>`}</div>`)}</div>` : html`<p class="small muted">No runs yet. Warm up with a free one.</p>`}</div>
      </aside>
    </div>
  </div>`;
}
