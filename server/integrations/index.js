// Game integration layer.
//
// STACKD cannot read results out of PUBG Mobile, CODM or any other game on its own: every game needs an
// integration. Each adapter implements the same contract, and the competition engine only ever talks to
// that contract, so swapping the demo simulator for a real publisher feed doesn't touch payouts, ratings,
// leaderboards or achievements.
//
//   authenticatePlayer(user, game)            → { linked, inGameId, method }
//   createMatch(match, { entrants, mode, now }) → adapter state stored on the match (match.sim)
//   getMatch(match, now)                      → live state (phase, alive counts, recent events)
//   getResult(match, now)                     → final standings, or null while the match is running
//   verifyResult(match, result)               → { status: verified | review | rejected, method, confidence, checks[] }
//   getPlayerStats(user, game)                → recent stats the adapter can vouch for
//
// Adapters:
//   simulation          working (DEMO MODE). Plays matches out server-side and marks results "simulated".
//   evidence            working. Player reports + screenshot/video evidence + referee review (screenshot,
//                       video and manual verification); used for head-to-heads, challenges and missions.
//   publisher_api       architecture only. Needs publisher credentials (see .env.example). Not configured.
//   tournament_platform architecture only. For third-party tournament systems. Not configured.
import { simulation } from './simulation.js';
import { evidence } from './evidence.js';

const notConfigured = (id, name, envHint) => {
  const fail = () => {
    const e = new Error(`${name} is not configured. ${envHint}`);
    e.code = 'INTEGRATION_NOT_CONFIGURED';
    throw e;
  };
  return { id, name, configured: false, automatic: true, authenticatePlayer: fail, createMatch: fail, getMatch: fail, getResult: fail, verifyResult: fail, getPlayerStats: fail };
};

const ADAPTERS = {
  simulation,
  evidence,
  publisher_api: notConfigured('publisher_api', 'Publisher API integration', 'Add the publisher key for this game (e.g. PUBG_API_KEY) and an adapter in server/integrations/.'),
  tournament_platform: notConfigured('tournament_platform', 'Tournament platform integration', 'Set TOURNAMENT_PLATFORM_URL and TOURNAMENT_PLATFORM_KEY.'),
};

export const listIntegrations = () => Object.values(ADAPTERS).map(({ id, name, configured, automatic }) => ({ id, name, configured, automatic }));

/**
 * The adapter that decides results for a game. In DEMO MODE every automatic result comes from the
 * simulator; a game configured for a real adapter that isn't set up falls back to evidence review rather
 * than pretending to have data.
 */
export function integrationFor(db, game, { automatic = true } = {}) {
  if (!automatic) return ADAPTERS.evidence;
  const wanted = ADAPTERS[game?.integration] || ADAPTERS.simulation;
  if (wanted.configured === false) return db.config.demoMode ? ADAPTERS.simulation : ADAPTERS.evidence;
  if (wanted === ADAPTERS.simulation && !db.config.demoMode) return ADAPTERS.evidence;
  return wanted;
}

export const getIntegration = (id) => ADAPTERS[id] || null;
