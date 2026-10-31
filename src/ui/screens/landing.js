import { html, useState, useEffect } from '../../lib/preact.js';
import { useRpc, useSession } from '../hooks.js';
import { Icon } from '../icons.js';
import { PublicNav, Wordmark } from '../components/shell.js';
import { MotionBackdrop } from '../components/backdrop.js';
import { BigStackBanner } from './bigstack.js';
import { GameArt } from '../components/game.js';
import { Avatar, Rank, BigMoney } from '../components/base.js';
import { CompetitionCard, TournamentCard, MissionCard } from '../components/cards.js';
import { money, short, ago, PLATFORM } from '../format.js';

// The hero's memorable thing: a live stack of real results rising under the headline.
function WinStack({ feed }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!feed?.length) return;
    const t = setInterval(() => setOffset((o) => (o + 1) % feed.length), 2600);
    return () => clearInterval(t);
  }, [feed?.length]);
  if (!feed?.length) return null;
  const items = Array.from({ length: 5 }, (_, i) => feed[(offset + i) % feed.length]);
  return html`<div class="winstack" aria-label="Recent winners">
    ${items.map((f, i) => html`<div class="slip" key=${f.id + offset} style=${`--i:${i}`}>
      <${Avatar} user=${f.user} size="sm" online=${false} />
      <div class="grow" style="min-width:0">
        <p class="small strong truncate">${f.user.username}</p>
        <p class="xs muted truncate">${f.text}</p>
      </div>
      <span class="slip-amt num">+${short(f.amount)}</span>
    </div>`)}
  </div>`;
}

const FAQ = [
  ['Is this gambling?', 'No. You compete on your own skill in games you already play: hit a challenge, beat an opponent, place in a pool. Outcomes come from your performance, not chance. Where local law treats any of it differently, STACKD switches that feature off for that country.'],
  ['Which games can I play?', 'Call of Duty: Mobile, PUBG Mobile, Free Fire, MLBB, eFootball, FC Mobile, 8 Ball Pool, Asphalt, Brawl Stars, Clash Royale and Fortnite on mobile, plus Warzone, Apex, FC 26, Tekken 8, MK1, GT7 and Rocket League on PC and console. More get added all the time.'],
  ['How do you know I actually won?', 'Every match has an auditable result. Depending on the game we read your results screenshot, review a clip or VOD, or pull data from the game. Both sides report in head-to-heads. If reports clash, a STACKD referee decides.'],
  ['How do I get paid?', 'Winnings land in your stack instantly. Withdraw to MTN Mobile Money, Airtel Money, card or bank once your ID is verified. This preview runs entirely on demo credits — no real money moves.'],
  ['How do team pools split?', "Every pool card shows the split before you join. Most split equally across the winning squad; some pay per elimination or mix both. Nothing is hidden."],
  ['Do I need to be 18?', 'Paid entries are 18+ (or the local legal age). Free competitions, missions and arcade practice are open from 13.'],
];

export default function Landing() {
  const { user } = useSession();
  const q = useRpc('landing.get', {}, { live: true });
  const bs = useRpc('bigstack.get');
  const d = q.data;
  const [faq, setFaq] = useState(0);
  return html`<div class="landing">
    <${MotionBackdrop} cls="landing-bd" height="" energy=${1.1} />
    <${PublicNav} />

    <section class="hero container">
      <div class="hero-copy">
        <p class="hero-kicker">Competitive gaming, with something on it.</p>
        <h1 class="display hero-title">Play for<br />the bag.</h1>
        <p class="hero-sub">You already put the hours in. STACKD gives that skill somewhere to go: challenges, head-to-heads, tournaments and 100-player squad pools in the games on your phone.</p>
        <div class="row wrap" style="gap:var(--s-3)">
          ${user ? html`<a class="btn btn-primary btn-brand" href="#/app">Open STACKD</a>` : html`<a class="btn btn-primary btn-brand" href="#/signup">Get started</a>`}
          <a class="btn btn-secondary btn-lg" href="#games">Explore games</a>
        </div>
        <div class="hero-proof">
          <div><p class="big-num" style="font-size:40px">${d ? short(d.stats.paidOut) : '—'}</p><p class="xs muted">UGX paid out (demo)</p></div>
          <div><p class="big-num" style="font-size:40px">${d ? short(d.stats.players) : '—'}</p><p class="xs muted">Players</p></div>
          <div><p class="big-num heat" style="font-size:40px">${d ? d.stats.liveNow : '—'}</p><p class="xs muted">Live right now</p></div>
        </div>
      </div>
      <div class="hero-side">
        <p class="hero-side-l"><span class="badge live">Live</span> Recent winners</p>
        <${WinStack} feed=${d?.feed} />
      </div>
    </section>

    <div class="ticker" aria-hidden="true"><div class="ticker-in">
      ${[0, 1].map(() => html`<span>Play for the bag</span><span>Play. Win. Stack up.</span><span>Run it back</span><span>You got the skill. Put it to work.</span><span>Who's next?</span>`)}
    </div></div>

    ${bs.data && html`<section class="container l-sec" id="bigstack"><${BigStackBanner} b=${bs.data} href="/signup" cta="Get in the game" /></section>`}

    <section class="container l-sec" id="how">
      <div class="how">
        ${[
          ['Play.', 'Pick a game you’re already good at. Choose a challenge, call someone out, or drop into a squad pool.', 'play'],
          ['Win.', 'Play the match like normal. Report your result with a screenshot or clip. We verify it.', 'trophy'],
          ['Stack up.', 'Winnings hit your stack the moment the result clears. Climb ranks, build a rep, cash out.', 'wallet'],
        ].map(([t, b, ic], i) => html`<div class="how-step">
          <span class="how-n">${i + 1}</span>
          <h3 class="display" style="font-size:clamp(48px,7vw,84px)">${t}</h3>
          <p class="muted">${b}</p>
        </div>`)}
      </div>
    </section>

    <section class="container l-sec" id="games">
      <div class="l-head"><h2 class="h1">Your games. Your edge.</h2><p class="muted">Mobile first. PC and console too.</p></div>
      <div class="l-games">
        ${(d?.games || []).slice(0, 12).map((g) => html`<a class="l-game" href="#/signup"><${GameArt} game=${g} /><p class="small strong mt-2 truncate">${g.name}</p><p class="xs muted">${g.platforms.map((p) => PLATFORM[p]).join(', ')}</p></a>`)}
      </div>
      <p class="xs faint mt-4">Game names are used for reference. STACKD is not affiliated with or endorsed by any game publisher.</p>
    </section>

    <section class="container l-sec" id="compete">
      <div class="l-head"><h2 class="h1">Four ways to win.</h2></div>
      <div class="ways">
        ${[
          ['Challenges', 'Bet on yourself. "10 kills in BR Solo." Hit it, get paid. The harder the target, the bigger the multiplier.', 'target'],
          ['Head-to-head', 'Call out a friend, accept an open challenge, or get matched with someone at your level. Run it back if you lose.', 'swords'],
          ['Squad pools', '100 players, one pool. Your squad’s placement decides the split. Every pool shows the payout before you join.', 'users'],
          ['Tournaments', 'Brackets, Swiss, leagues and battle-royale points cups. Some free, some sponsored, all verified.', 'trophy'],
        ].map(([t, b, ic]) => html`<div class="way"><${Icon} name=${ic} /><h3 class="h3">${t}</h3><p class="muted small">${b}</p></div>`)}
      </div>
      ${d?.pools?.length ? html`<div class="grid-3 mt-8">${d.pools.map((c) => html`<${CompetitionCard} c=${c} />`)}</div>` : null}
    </section>

    <section class="container l-sec">
      <div class="split">
        <div>
          <div class="l-head"><h2 class="h1">Tournaments every night.</h2><p class="muted">Single and double elimination, Swiss, leagues, ladders, and BR points cups.</p></div>
          <div class="stack">${(d?.tournaments || []).map((t) => html`<${TournamentCard} t=${t} />`)}</div>
        </div>
        <div id="teams">
          <div class="l-head"><h2 class="h1">Bring your squad.</h2><p class="muted">Create a team, invite the crew, enter as one. Team ratings, team history, team payouts.</p></div>
          <div class="card pad-lg stack">
            <p class="small muted">Top players this season</p>
            ${(d?.leaders || []).map((u, i) => html`<div class="li"><span class=${`pos p${i + 1}`}>${i + 1}</span><${Avatar} user=${u} size="sm" online=${false} /><div class="grow"><p class="li-title">${u.username}</p><p class="li-sub"><${Rank} rank=${u.rank} /></p></div><span class="big-num" style="font-size:24px">${u.stackScore}</span></div>`)}
          </div>
        </div>
      </div>
    </section>

    <section class="container l-sec" id="missions">
      <div class="l-head"><h2 class="h1">Stack Missions.</h2><p class="muted measure">Brands drop missions straight into the games you play. Find the hidden can, keep a clean sheet, finish top 10. Win cash, credit, data, gear.</p></div>
      <div class="grid-3">${(d?.missions || []).map((m) => html`<${MissionCard} m=${m} />`)}</div>
      <p class="small muted mt-4">Run a brand? <a class="link" href="#/login">Sponsor a mission</a>. Campaign builder and live analytics included.</p>
    </section>

    <section class="container l-sec" id="faq">
      <div class="split">
        <div class="l-head"><h2 class="h1">Straight answers.</h2><p class="muted">Fair play, payouts, the legal bits.</p></div>
        <div class="faq">
          ${FAQ.map(([qq, a], i) => html`<div class="faq-item">
            <button type="button" aria-expanded=${faq === i} onClick=${() => setFaq(faq === i ? -1 : i)}><span>${qq}</span><${Icon} name=${faq === i ? 'minus' : 'plus'} /></button>
            ${faq === i && html`<p class="muted">${a}</p>`}
          </div>`)}
        </div>
      </div>
    </section>

    <section class="container l-cta">
      <h2 class="display" style="font-size:var(--d-2)">Who's next?</h2>
      <a class="btn btn-primary btn-brand" href=${user ? '#/app' : '#/signup'}>${user ? 'Open STACKD' : 'Get started'}</a>
    </section>

    <footer class="l-foot">
      <div class="container">
        <div class="l-foot-grid">
          <div class="stack tight"><${Wordmark} href="/" /><p class="small muted">Play for the bag.</p></div>
          <div class="stack tight small"><p class="strong">Play</p><a class="muted" href="#/signup">Games</a><a class="muted" href="#/signup">Tournaments</a><a class="muted" href="#/signup">Arcade</a></div>
          <div class="stack tight small"><p class="strong">Company</p><a class="muted" href="#missions">For brands</a><a class="muted" href="#faq">FAQ</a><a class="muted" href="#/signup">Fair play</a></div>
          <div class="stack tight small"><p class="strong">Responsible play</p><p class="muted">18+ for paid entries. Set limits, take a break or self-exclude any time from Settings.</p></div>
        </div>
        <p class="xs faint mt-8">© 2026 STACKD. Prototype running in demo mode: all balances, payments and payouts are simulated. Game titles are trademarks of their respective owners and are shown for reference only; STACKD is not affiliated with any publisher.</p>
      </div>
    </footer>
  </div>`;
}
