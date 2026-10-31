import { html, useState } from '../../lib/preact.js';
import { useRpc, useAction, useSession } from '../hooks.js';
import { navigate, setQuery } from '../router.js';
import { Icon } from '../icons.js';
import { Button, Badge, Chips, Tabs, Empty, Async, CardsSkeleton, Sk, PageHead, Notice, Select, Countdown, Confirm, Progress } from '../components/base.js';
import { GameArt } from '../components/game.js';
import { TournamentCard, PrizeBreakdown, StatusBadge, TeamTag } from '../components/cards.js';
import { money, when, ordinal, FORMAT, PLATFORM } from '../format.js';

export function Tournaments({ query }) {
  const tab = query.tab || 'registration';
  const game = query.game || '';
  const q = useRpc('tournaments.list', { status: tab === 'mine' ? undefined : tab, gameId: game || undefined, mine: tab === 'mine' || undefined });
  const games = useRpc('games.list', {}, { live: false });
  return html`<div class="container page">
    <${PageHead} title="Tournaments" sub="Brackets, Swiss, leagues, ladders and battle-royale points cups. Every result is verified." />
    <${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[
      { value: 'registration', label: 'Upcoming' }, { value: 'live', label: 'Live' }, { value: 'completed', label: 'Completed' }, { value: 'mine', label: 'Yours' },
    ]} />
    <div class="mt-4 mb-4"><${Chips} label="Game" value=${game} onChange=${(v) => setQuery({ game: v })} options=${[{ value: '', label: 'All games' }, ...(games.data || []).slice(0, 14).map((g) => ({ value: g.id, label: g.short }))]} /></div>
    <${Async} q=${q} skeleton=${html`<${CardsSkeleton} n=${6} h=${300} />`}
      empty=${html`<${Empty} icon="trophy" title=${tab === 'mine' ? "You haven't entered a tournament yet" : 'Nothing here for that filter'} body=${tab === 'mine' ? 'Upcoming cups are a tap away. Some are free.' : 'Try another game or tab.'} action=${tab === 'mine' ? html`<${Button} onClick=${() => setQuery({ tab: 'registration' })}>See upcoming<//>` : null} />`}>
      ${(list) => html`<div class="grid-3">${list.map((t) => html`<${TournamentCard} t=${t} />`)}</div>`}
    <//>
  </div>`;
}

// ---- Bracket views ----------------------------------------------------------------------------
function Slot({ e, winner, mine }) {
  if (!e) return html`<div class="bslot empty"><span>Bye</span></div>`;
  if (e.tbd) return html`<div class="bslot empty"><span>TBD</span></div>`;
  const won = winner && winner === e.id;
  const lost = winner && winner !== e.id;
  return html`<div class=${`bslot ${won ? 'won' : ''} ${lost ? 'lost' : ''} ${mine === e.id ? 'mine' : ''}`}><span class="truncate">${e.name}</span>${won && html`<${Icon} name="check" size="14" />`}</div>`;
}

function BracketColumns({ matches, mine }) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  return html`<div class="bracket">
    ${rounds.map((r) => {
      const ms = matches.filter((m) => m.round === r);
      return html`<div class="bround">
        <p class="xs muted strong bround-l">${ms[0].label}</p>
        <div class="bround-list">${ms.map((m) => html`<div class="bmatch ${m.void ? 'void' : ''}">
          <${Slot} e=${m.a} winner=${m.winner} mine=${mine} />
          <${Slot} e=${m.b} winner=${m.winner} mine=${mine} />
          ${m.score && m.score !== 'bye' && m.score !== 'void' && html`<span class="bscore num">${m.score}</span>`}
        </div>`)}</div>
      </div>`;
    })}
  </div>`;
}

function Standings({ rows, mine, br }) {
  return html`<div class="panel"><div class="table-wrap"><table class="table">
    <thead><tr><th>#</th><th>${br ? 'Squad' : 'Player'}</th><th class="r">P</th><th class="r">W</th>${!br && html`<th class="r">L</th>`}${br && html`<th class="r">Elims</th>`}<th class="r">Pts</th></tr></thead>
    <tbody>${rows.map((r, i) => html`<tr style=${r.entrantId === mine ? 'background:var(--secondary-soft)' : ''}>
      <td><span class=${`pos p${i + 1}`} style="font-size:16px">${i + 1}</span></td><td class="strong">${r.name}</td>
      <td class="r num">${r.played}</td><td class="r num">${r.wins}</td>${!br && html`<td class="r num">${r.losses}</td>`}${br && html`<td class="r num">${r.kills}</td>`}<td class="r num strong">${r.points}</td>
    </tr>`)}</tbody>
  </table></div></div>`;
}

function BracketView({ t }) {
  const b = t.bracket;
  const mine = t.myEntrant?.id;
  if (!b) return html`<${Empty} icon="trophy" title="Bracket drops at start time" body=${`Seeds are set by rating when registration closes ${when(t.registrationDeadline)}.`} />`;
  if (b.format === 'single_elim') return html`<${BracketColumns} matches=${b.matches} mine=${mine} />`;
  if (b.format === 'double_elim')
    return html`<div class="stack">
      <p class="strong small">Winners bracket</p><${BracketColumns} matches=${b.matches.filter((m) => m.side === 'W')} mine=${mine} />
      <p class="strong small">Losers bracket</p><${BracketColumns} matches=${b.matches.filter((m) => m.side === 'L')} mine=${mine} />
      <p class="strong small">Grand final</p><${BracketColumns} matches=${b.matches.filter((m) => m.side === 'GF')} mine=${mine} />
    </div>`;
  if (b.format === 'battle_royale')
    return html`<div class="stack">
      <${Standings} rows=${b.standings} mine=${mine} br />
      <div class="grid-3">${b.matches.map((g) => html`<div class="card"><div class="row between mb-2"><p class="strong small">${g.label}</p>${g.done ? html`<${Badge} tone="money">Done<//>` : html`<${Badge}>Pending<//>`}</div>
        ${g.done ? html`<div class="list">${g.placements.slice(0, 5).map((p) => html`<div class="li" style="padding:6px 0"><span class=${`pos p${p.place}`} style="font-size:15px">${p.place}</span><span class="small grow truncate">${p.name}</span><span class="xs muted">${p.kills} elims</span></div>`)}</div>` : html`<p class="xs muted">Plays after the previous game.</p>`}
      </div>`)}</div>
    </div>`;
  const rounds = [...new Set(b.matches.map((m) => m.round))].sort((x, y) => x - y);
  return html`<div class="stack">
    <${Standings} rows=${b.standings} mine=${mine} />
    <div class="grid-3">${rounds.map((r) => html`<div class="card"><p class="strong small mb-2">Round ${r}</p><div class="stack tight">
      ${b.matches.filter((m) => m.round === r).map((m) => html`<div class="row between small" style=${[m.a?.id, m.b?.id].includes(mine) ? 'color:#aab3ff' : ''}>
        <span class="truncate" style=${m.winner === m.a?.id ? 'font-weight:700' : 'color:var(--muted)'}>${m.a?.name}</span>
        <span class="xs faint num">${m.winner ? m.score || 'vs' : 'vs'}</span>
        <span class="truncate" style=${`text-align:right;${m.winner === m.b?.id ? 'font-weight:700' : 'color:var(--muted)'}`}>${m.b?.name}</span>
      </div>`)}
    </div></div>`)}</div>
  </div>`;
}

export function TournamentDetail({ params, query }) {
  const { user } = useSession();
  const q = useRpc('tournaments.get', { id: params.id });
  const teams = useRpc('teams.list', { mine: true }, { live: false });
  const [teamId, setTeamId] = useState('');
  const [leave, setLeave] = useState(false);
  const gate = useRpc('compliance.check', { action: (q.data?.entry || 0) > 0 ? 'paid_entry' : 'free_entry', amount: q.data?.entry || 0 });
  const reg = useAction('tournaments.register', { success: "You're registered", onSuccess: () => q.refresh() });
  const unreg = useAction('tournaments.unregister', { success: 'Withdrawn and refunded', onSuccess: () => { setLeave(false); q.refresh(); } });
  const start = useAction('tournaments.startNow', { success: 'Tournament started', onSuccess: () => q.refresh() });
  const play = useAction('tournaments.playMatch', { onSuccess: (m) => navigate(`/app/match/${m.id}`) });
  const t = q.data;
  if (q.loading && !t) return html`<div class="container page stack"><${Sk} h=${240} r="20" /><${Sk} h=${300} r="14" /></div>`;
  if (q.error) return html`<div class="container page"><${Empty} icon="alert" title="Tournament not found" body=${q.error.message} action=${html`<${Button} href="/app/tournaments">All tournaments<//>`} /></div>`;
  const tab = query.tab || (t.bracket ? 'bracket' : 'entrants');
  const myTeams = (teams.data || []).filter((x) => x.isMember);
  const needTeam = t.teamSize > 1;
  const enough = user.wallet.available >= t.entry;
  const blocked = gate.data && !gate.data.allowed;
  const full = t.entrants >= t.maxEntrants;
  const closed = Date.now() > t.registrationDeadline;

  return html`<div class="container page">
    <a class="back" href="#/app/tournaments"><${Icon} name="chevL" />Tournaments</a>
    <section class="comp-hero">
      <${GameArt} game=${t.game} size="hero" word=${false} />
      <div class="comp-hero-copy">
        <div class="row wrap tight"><${StatusBadge} status=${t.status} startsAt=${t.startsAt} /><${Badge}>${FORMAT[t.format]}<//><${Badge}>${t.teamSize > 1 ? `Teams of ${t.teamSize}` : 'Solo'}<//>${t.sponsor && html`<${Badge}>Presented by ${t.sponsor.name}<//>`}</div>
        <h1 class="display" style="font-size:clamp(44px,7vw,92px);margin:10px 0 4px">${t.name}</h1>
        <p class="muted">${t.game.name}, ${t.mode.name}, ${PLATFORM[t.platform]}. ${t.status === 'completed' ? 'Finished' : when(t.startsAt)}.</p>
      </div>
    </section>

    <div class="with-rail mt-6">
      <div style="min-width:0">
        ${t.status === 'completed' && t.results && html`<div class="podium mb-4">${t.results.order.slice(0, 3).map((r) => html`<div class=${`pod p${r.place}`}><span class="pos p${r.place}" style="font-size:34px;width:auto">${ordinal(r.place)}</span><p class="strong truncate">${r.name}</p><p class="small money num">${money(t.results.pool.allocations.find((a) => a.place === r.place)?.amount || 0)}</p></div>`)}</div>`}
        <${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[
          { value: 'bracket', label: t.bracket?.table ? 'Standings' : 'Bracket' },
          { value: 'entrants', label: 'Entrants', count: t.entrants },
          { value: 'rules', label: 'Rules' },
        ]} />
        <div class="mt-4">
          ${tab === 'bracket' && html`<${BracketView} t=${t} />`}
          ${tab === 'entrants' && (t.entrantList.length ? html`<div class="roster">${t.entrantList.map((e) => html`<div class="roster-item" style=${e.id === t.myEntrant?.id ? 'outline:1px solid var(--secondary)' : ''}>
            <div class="row tight">${e.type === 'team' && e.tag ? html`<${TeamTag} team=${e} size=${24} />` : null}<span class="small strong truncate">${e.name}</span></div>
            <span class="xs muted">${e.seed ? `Seed ${e.seed} · ` : ''}${e.rating} rating</span>
          </div>`)}</div>` : html`<${Empty} icon="users" title="No one's registered yet" body="Get in first." />`)}
          ${tab === 'rules' && html`<div class="card"><ul class="stack tight small">${t.rules.map((r) => html`<li class="row top tight"><${Icon} name="check" size="16" /><span>${r}</span></li>`)}</ul></div>`}
        </div>
      </div>

      <aside class="stack" style="gap:var(--s-4)">
        <div class="card pad-lg stack">
          <${PrizeBreakdown} pool=${t.pool} teamSize=${t.teamSize} projected=${t.status === 'registration'} />
          <hr />
          <div class="row between small"><span class="muted">Entrants</span><span class="strong num">${t.entrants}/${t.maxEntrants}</span></div>
          <${Progress} value=${t.entrants / t.maxEntrants} label="Registration" />
          ${t.status === 'registration' && html`<p class="small row tight"><${Icon} name="clock" size="16" /><${Countdown} to=${t.registrationDeadline} prefix="Registration closes" live="Registration closed" /></p>`}

          ${t.status === 'registration' && !t.registered && html`<div class="stack">
            ${needTeam && (myTeams.length ? html`<${Select} label="Register your team" value=${teamId || myTeams[0].id} onChange=${setTeamId} options=${myTeams.map((x) => ({ value: x.id, label: `${x.name} [${x.tag}]` }))} hint=${`Teams of ${t.teamSize}. Short-handed teams get demo subs.`} />`
              : html`<${Notice} tone="warn" title="You need a team" action=${html`<${Button} size="sm" variant="secondary" href="/app/teams?new=1">Create team<//>`}>This is a ${t.teamSize}-player team tournament.<//>`)}
            ${blocked && html`<${Notice} tone="err" title="You can't enter right now">${gate.data.reasons.map((r) => html`<p>${r.message}</p>`)}<//>`}
            ${!enough && html`<${Notice} tone="warn" title="Not enough in your stack">Entry is ${money(t.entry)}.<//>`}
            <${Button} size="lg" block loading=${reg.pending} disabled=${full || closed || blocked || !enough || (needTeam && !myTeams.length)}
              onClick=${() => reg.run({ id: t.id, teamId: needTeam ? teamId || myTeams[0]?.id : undefined })}>${full ? 'Full' : closed ? 'Registration closed' : `Register${t.entry ? ` for ${money(t.entry)}` : ' free'}`}<//>
          </div>`}

          ${t.status === 'registration' && t.registered && html`<div class="stack">
            <${Notice} tone="ok" title="You're registered">${t.myEntrant.name}. We'll notify you when your first match is ready.<//>
            <${Button} block icon="zap" loading=${start.pending} onClick=${() => start.run({ id: t.id })}>Start now (demo)<//>
            <p class="xs faint">Fills the remaining seats with demo players and seeds the bracket.</p>
            <${Button} variant="ghost" block onClick=${() => setLeave(true)}>Withdraw and refund<//>
          </div>`}

          ${t.status === 'live' && t.registered && (t.myNext
            ? html`<div class="stack"><${Notice} tone="info" title=${`You're up: ${t.myNext.label}`}>Play it, report it, move on.<//><${Button} size="lg" block icon="play" loading=${play.pending} onClick=${() => (t.myNext.matchId ? navigate(`/app/match/${t.myNext.matchId}`) : play.run({ id: t.id }))}>Play your match<//></div>`
            : t.eliminated ? html`<${Notice} tone="warn" title="You're out">Good run. Prize places pay when the tournament finishes.<//>`
            : html`<${Notice} tone="info" title="Waiting on the bracket">Your next opponent is still playing.<//>`)}
          ${t.status === 'completed' && html`<${Notice} tone=${t.champion?.entrantId === t.myEntrant?.id ? 'ok' : 'info'} title=${`Champion: ${t.champion?.name || '—'}`}>${t.registered ? 'Prizes have been paid to the places shown.' : 'Next cup is on the Tournaments page.'}<//>`}
        </div>
      </aside>
    </div>
    <${Confirm} open=${leave} onClose=${() => setLeave(false)} pending=${unreg.pending} title="Withdraw from this tournament?" body=${`Your ${money(t.entry)} entry comes back to your stack.`} confirmLabel="Withdraw" tone="danger" onConfirm=${() => unreg.run({ id: t.id })} />
  </div>`;
}
