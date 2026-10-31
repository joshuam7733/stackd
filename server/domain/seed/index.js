// Demo world. Deterministic (seeded RNG) so every reset looks the same, with times relative to "now".
import { rng, MIN, HOUR, DAY, clamp, uid } from '../util.js';
import { createUser, createCompetition, createTeam, createTournament, createMission, createTx, createMatch, createDispute, createNotification } from '../models.js';
import { GAMES, CHALLENGE_TEMPLATES } from './catalog.js';
import { DEFAULT_RANKS } from '../engines/rating.js';
import { DEFAULT_ACHIEVEMENTS, evaluateAchievements } from '../engines/achievements.js';
import { DEFAULT_WEIGHTS } from '../engines/matchmaking.js';
import { fillPool, startPool, createH2H, acceptH2H } from '../services/competitions.js';
import { startTournament, advanceBots, addDemoEntrant } from '../services/tournaments.js';
import { post } from '../ledger.js';

// Extra demo players so a full 100-player lobby is made of real accounts with real (demo) wallets.
const EXTRA_A = ['Swift', 'Mad', 'Calm', 'Neon', 'Grim', 'Cold', 'Rapid', 'Iron', 'Lazy', 'Wild', 'Silent', 'Lucky', 'Zero', 'Night', 'Brave'];
const EXTRA_B = ['Fox', 'Rhino', 'Kite', 'Hawk', 'Viper', 'Sparrow', 'Byte', 'Drift', 'Lion', 'Storm'];
const EXTRA_C = ['UG', 'UG', 'UG', 'KE', 'UG', 'TZ', 'UG', 'RW', 'NG', 'UG'];

const TAGS = [
  ['Ssebo_Snipes', 'UG'], ['KampalaKid', 'UG'], ['NileViper', 'UG'], ['BodaBoss', 'UG'], ['Gulu.Ghost', 'UG'],
  ['EntebbeEcho', 'UG'], ['MbararaMamba', 'UG'], ['JinjaJet', 'UG'], ['QueenNakato', 'UG'], ['AcholiAce', 'UG'],
  ['RwenzoriRaid', 'UG'], ['MukonoMenace', 'UG'], ['Okello_OP', 'UG'], ['Achieng.Aims', 'UG'], ['TendoTTV', 'UG'],
  ['Namuli_N', 'UG'], ['KatoKills', 'UG'], ['Babirye.B', 'UG'], ['OpioOne', 'UG'], ['LubowaLethal', 'UG'],
  ['Kololo.K', 'UG'], ['MasakaMVP', 'UG'], ['Wakiso_Wolf', 'UG'], ['NtindaNova', 'UG'], ['ZaddyZed', 'UG'],
  ['Nakawa.Nyx', 'UG'], ['ArinaAce', 'UG'], ['Kabaka_K', 'UG'], ['SoroSniper', 'UG'], ['MuyengaMax', 'UG'],
  ['NairobiNitro', 'KE'], ['Wanjiku_W', 'KE'], ['Chege.Ghost', 'KE'], ['Baraka99', 'KE'], ['MombasaMoves', 'KE'],
  ['KisumuKing', 'KE'], ['Amani.FC', 'KE'], ['Achieng_Q', 'KE'],
  ['DarDemon', 'TZ'], ['Zuri.Zap', 'TZ'], ['Pendo.Plays', 'TZ'], ['ArushaAim', 'TZ'],
  ['KigaliKraken', 'RW'], ['Malaika_MVP', 'RW'], ['IremboIce', 'RW'],
  ['LagosLeo', 'NG'], ['Tunde.exe', 'NG'], ['Ada_Clutch', 'NG'], ['AbujaAxe', 'NG'], ['Ikeja.Ice', 'NG'], ['Chi.Snipes', 'NG'],
  ['AccraAim', 'GH'], ['Kofi_Clutch', 'GH'], ['Ama.Aims', 'GH'],
  ['JoziJuke', 'ZA'], ['CapeCrusher', 'ZA'], ['Thandi.T', 'ZA'],
  ['frostbyte', 'GB'], ['noScopeNala', 'GB'],
  ['ghxst', 'US'],
];

const COLORS = ['#5468FF', '#3DDC97', '#FF6A3D', '#FFB547', '#59A8FF', '#C77DFF', '#FF5468', '#2EC4B6', '#E9C46A', '#F28482'];
const MOBILE = ['codm', 'pubgm', 'freefire', 'mlbb', 'efootball', 'fcm', 'pool8', 'asphalt', 'brawl', 'clashroyale', 'fortnite'];
const CONSOLE = ['eafc', 'tekken8', 'mk1', 'gt7', 'warzone', 'apex', 'fortnite', 'rocketleague', 'efootball'];

export function seed() {
  const r = rng(2026);
  const now = Date.now();
  const db = {
    schema: 5,
    seededAt: now,
    config: {
      realMoney: false, // locked off in the prototype
      demoMode: true,
      platformFeePct: 20, // default for new competitions; each competition stores its own fee
      h2hFeePct: 10,
      challengeMargin: 0.12,
      challengeEntry: { min: 1000, max: 1_000_000_000 },
      h2hEntry: { min: 1000, max: 1_000_000_000 },
      highStakesKyc: 1_000_000, // entries at or above this need a verified ID
      ranks: DEFAULT_RANKS,
      matchmaking: DEFAULT_WEIGHTS,
      season: { id: 's4', name: 'Season 4', endsAt: now + 23 * DAY },
      predictionCategories: { esports: true, gaming: true, sports: true },
      starterStack: 100000, // every new account: UGX 100,000 DEMO
      starterBonus: 0,
      botWallet: 500000,
    },
    jurisdictions: {
      UG: { code: 'UG', enabled: true, realMoney: true, staking: true, predictions: true, minAge: 18, kycRequired: true, dailyDepositLimit: 2_000_000 },
      KE: { code: 'KE', enabled: true, realMoney: true, staking: false, predictions: false, minAge: 18, kycRequired: true, dailyDepositLimit: 1_500_000 },
      TZ: { code: 'TZ', enabled: true, realMoney: false, staking: false, predictions: false, minAge: 18, kycRequired: true, dailyDepositLimit: 1_000_000 },
      RW: { code: 'RW', enabled: true, realMoney: true, staking: true, predictions: false, minAge: 18, kycRequired: true, dailyDepositLimit: 1_000_000 },
      NG: { code: 'NG', enabled: true, realMoney: true, staking: true, predictions: true, minAge: 18, kycRequired: true, dailyDepositLimit: 2_000_000 },
      GH: { code: 'GH', enabled: true, realMoney: false, staking: false, predictions: false, minAge: 18, kycRequired: true, dailyDepositLimit: 1_000_000 },
      ZA: { code: 'ZA', enabled: true, realMoney: true, staking: true, predictions: true, minAge: 18, kycRequired: true, dailyDepositLimit: 3_000_000 },
      GB: { code: 'GB', enabled: true, realMoney: false, staking: false, predictions: false, minAge: 18, kycRequired: true, dailyDepositLimit: 500_000 },
      US: { code: 'US', enabled: false, realMoney: false, staking: false, predictions: false, minAge: 18, kycRequired: true, dailyDepositLimit: 0 },
    },
    games: GAMES,
    challengeTemplates: CHALLENGE_TEMPLATES,
    achievementDefs: DEFAULT_ACHIEVEMENTS,
    users: [],
    identities: [],
    sessions: {},
    oauthStates: {},
    idempotency: {},
    scoreEvents: [],
    teams: [],
    competitions: [],
    matches: [],
    tournaments: [],
    ledger: [],
    notifications: [],
    sponsors: [],
    campaigns: [],
    missions: [],
    drops: [],
    disputes: [],
    reports: [],
    tickets: [],
    fraud: [],
    audit: [],
    revenue: [],
    feed: [],
    markets: [],
    positions: [],
    stakingRuns: [],
    stakes: [],
    arcade: [],
    arcadeRuns: [],
  };

  // ---- players ------------------------------------------------------------------------------
  const handles = [...TAGS];
  for (let i = 0; handles.length < 150; i++) handles.push([`${EXTRA_A[i % EXTRA_A.length]}${EXTRA_B[Math.floor(i / EXTRA_A.length) % EXTRA_B.length]}${10 + ((i * 7) % 89)}`, EXTRA_C[i % EXTRA_C.length]]);
  for (const [i, [username, country]] of handles.entries()) {
    const consoleGamer = r.chance(country === 'UG' ? 0.18 : 0.4);
    const pool = consoleGamer ? CONSOLE : MOBILE;
    const games = r.shuffle(pool).slice(0, r.int(2, 5));
    if (!consoleGamer && r.chance(0.6) && !games.includes('codm')) games.push('codm');
    const platforms = consoleGamer ? r.shuffle(['pc', 'playstation', 'xbox']).slice(0, r.int(1, 2)).concat(r.chance(0.4) ? ['mobile'] : []) : ['mobile'].concat(r.chance(0.15) ? ['playstation'] : []);
    const score = Math.round(clamp(i < 3 ? 1650 + r.int(0, 300) : r.gauss(1210, 200), 830, 1990));
    const matches = r.int(25, 650);
    const wr = clamp(0.3 + (score - 900) / 2600 + r.gauss(0, 0.05), 0.24, 0.79);
    const wins = Math.round(matches * wr);
    const streak = r.chance(0.12) ? r.int(5, 11) : r.int(0, 4);
    const form = Array.from({ length: 10 }, (_, k) => (k < streak ? 'W' : r.chance(wr) ? 'W' : 'L'));
    const u = createUser({
      id: `usr_${username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      username, country, isBot: true, onboarded: true,
      email: `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@players.stackd.demo`,
      dob: `${r.int(1994, 2006)}-0${r.int(1, 9)}-1${r.int(0, 9)}`,
      avatar: { color: COLORS[i % COLORS.length] },
      games, platforms, stackScore: score, peakScore: score + r.int(0, 80),
      createdAt: now - r.int(20, 400) * DAY,
      kyc: { status: i % 17 === 5 ? 'pending' : r.chance(0.8) ? 'verified' : 'none', level: 1, submittedAt: now - r.int(1, 30) * HOUR, docType: 'national_id' },
      stats: {
        matches, wins, losses: matches - wins, competitions: Math.round(matches * 0.85), streak, bestStreak: Math.max(streak, r.int(3, 12)),
        earnings: Math.round((wins * r.int(2500, 22000)) / 500) * 500,
        tournamentWins: score > 1450 ? r.int(1, 5) : r.chance(0.2) ? 1 : 0,
        teamWins: r.int(0, 4), mvps: r.int(0, 9), top10: r.int(0, 30), missions: r.int(0, 4), rematches: r.int(0, 20),
        arcadeRuns: r.int(0, 40), seasonPoints: Math.max(0, Math.round((score - 900) * 1.2 + r.int(0, 300))),
      },
      form,
      bio: r.pick(['Drop hot. Stay hot.', 'Clutch or kick.', 'Rank 1 or nothing.', 'Mobile only. No excuses.', 'Weekend warrior.', 'Find me in the finals.', '', '']),
      online: r.chance(0.45),
      inGameIds: Object.fromEntries(games.map((g) => [g, String(r.int(10000000, 99999999))])),
    });
    u.gameScores = Object.fromEntries(games.map((g) => [g, { score: Math.round(score + r.gauss(0, 60)), matches: r.int(10, Math.max(11, Math.round(matches / games.length))), wins: 0 }]));
    for (const g of Object.values(u.gameScores)) g.wins = Math.round(g.matches * wr);
    evaluateAchievements(DEFAULT_ACHIEVEMENTS, u);
    u.achievements.forEach((a) => (a.at = now - r.int(1, 200) * DAY));
    db.users.push(u);
  }
  const bots = db.users.slice();
  const bot = (name) => db.users.find((u) => u.username === name);
  // Demo players hold demo wallets like everyone else; every entry they make is debited from these.
  for (const b of bots) post(db, { userId: b.id, type: 'bonus', amount: db.config.botWallet, description: 'Demo wallet (practice account)', meta: { demo: true, bot: true }, createdAt: b.createdAt });

  // demo player
  const me = createUser({
    id: 'usr_demo', username: 'nilewave', email: 'player@stackd.demo', country: 'UG', dob: '2001-04-12',
    avatar: { color: '#FF6A3D' }, onboarded: true, createdAt: now - 41 * DAY,
    games: ['codm', 'pubgm', 'efootball', 'freefire', 'clashroyale'], platforms: ['mobile', 'playstation'],
    stackScore: 1236, peakScore: 1288,
    kyc: { status: 'verified', level: 2, submittedAt: now - 30 * DAY, docType: 'national_id' },
    stats: { matches: 84, wins: 47, losses: 37, competitions: 71, streak: 2, bestStreak: 6, earnings: 286500, tournamentWins: 0, teamWins: 1, mvps: 2, top10: 9, missions: 1, rematches: 7, arcadeRuns: 3, seasonPoints: 412 },
    form: ['W', 'W', 'L', 'W', 'L', 'L', 'W', 'W', 'W', 'L'],
    bio: 'CODM on weekdays. eFootball when the boys call.',
    inGameIds: { codm: '6754321908', pubgm: '5123498761', efootball: 'NILEWAVE-UG', freefire: '9988776655', clashroyale: '#2PQ9LV8' },
    online: true,
  });
  me.demoPassword = true;
  me.gameScores = {
    codm: { score: 1281, matches: 39, wins: 24 },
    pubgm: { score: 1190, matches: 17, wins: 8 },
    efootball: { score: 1244, matches: 21, wins: 12 },
    freefire: { score: 1105, matches: 5, wins: 2 },
    clashroyale: { score: 1150, matches: 2, wins: 1 },
  };
  evaluateAchievements(DEFAULT_ACHIEVEMENTS, me);
  me.achievements.forEach((a, i) => (a.at = now - (30 - i * 3) * DAY));
  me.friends = ['Ssebo_Snipes', 'KampalaKid', 'QueenNakato', 'JinjaJet', 'NairobiNitro', 'TendoTTV'].map((n) => bot(n).id);
  me.following = [...me.friends, bot('NileViper').id, bot('LagosLeo').id];
  me.friendRequests = [bot('AcholiAce').id];
  me.friends.forEach((id) => db.users.find((u) => u.id === id).friends.push(me.id));
  db.users.push(me);

  db.users.push(createUser({ id: 'usr_admin', username: 'stackd_ops', email: 'admin@stackd.demo', role: 'admin', onboarded: true, avatar: { color: '#EDEAE2' }, country: 'UG', dob: '1993-02-02', kyc: { status: 'verified', level: 3 } }));
  db.users.at(-1).demoPassword = true;
  db.users.push(createUser({ id: 'usr_sponsor', username: 'fizzup_brand', email: 'sponsor@fizzup.demo', role: 'sponsor', sponsorId: 'sp_fizzup', onboarded: true, avatar: { color: '#E2342D' }, country: 'UG', dob: '1990-06-06', kyc: { status: 'verified', level: 3 } }));
  db.users.at(-1).demoPassword = true;

  // ---- teams --------------------------------------------------------------------------------
  const TEAMS = [
    ['Nile Snipers', 'NILE', '#FF6A3D', ['nilewave', 'Ssebo_Snipes', 'JinjaJet', 'TendoTTV'], ['codm', 'pubgm']],
    ['Kampala Kartel', 'KK', '#5468FF', ['KampalaKid', 'BodaBoss', 'Kololo.K', 'ZaddyZed', 'NtindaNova'], ['codm', 'freefire']],
    ['Pearl Phantoms', 'PRL', '#3DDC97', ['QueenNakato', 'Namuli_N', 'Babirye.B', 'ArinaAce'], ['pubgm', 'mlbb']],
    ['Boda Gang', 'BODA', '#FFB547', ['MbararaMamba', 'MukonoMenace', 'Wakiso_Wolf', 'SoroSniper'], ['freefire', 'codm']],
    ['Equator Esports', 'EQX', '#59A8FF', ['NileViper', 'RwenzoriRaid', 'Okello_OP', 'Kabaka_K', 'MasakaMVP'], ['mlbb', 'codm']],
    ['Gulu Grind', 'GLU', '#C77DFF', ['Gulu.Ghost', 'AcholiAce', 'OpioOne', 'Achieng.Aims'], ['codm', 'pubgm']],
    ['Rift Valley Rush', 'RVR', '#2EC4B6', ['NairobiNitro', 'Wanjiku_W', 'Chege.Ghost', 'Baraka99'], ['pubgm', 'freefire']],
    ['Mamba Unit', 'MMB', '#FF5468', ['MombasaMoves', 'KisumuKing', 'Amani.FC', 'Achieng_Q'], ['codm', 'brawl']],
    ['Lagos Lit', 'LIT', '#E9C46A', ['LagosLeo', 'Tunde.exe', 'Ada_Clutch', 'AbujaAxe', 'Chi.Snipes'], ['freefire', 'codm', 'mlbb']],
    ['Kili Kings', 'KILI', '#F28482', ['DarDemon', 'Zuri.Zap', 'Pendo.Plays', 'ArushaAim'], ['pubgm', 'codm']],
    ['Gold Coast Ghosts', 'GCG', '#FFD166', ['AccraAim', 'Kofi_Clutch', 'Ama.Aims', 'Ikeja.Ice'], ['freefire', 'mlbb']],
    ['Highveld Heat', 'HVH', '#06D6A0', ['JoziJuke', 'CapeCrusher', 'Thandi.T', 'frostbyte'], ['warzone', 'apex']],
  ];
  for (const [name, tag, color, members, games] of TEAMS) {
    const ids = members.map((m) => (m === 'nilewave' ? me.id : bot(m).id));
    const avg = ids.reduce((a, id) => a + db.users.find((u) => u.id === id).stackScore, 0) / ids.length;
    const wins = r.int(4, 40);
    db.teams.push(createTeam({
      id: `tm_${tag.toLowerCase()}`, name, tag, color, captainId: ids[0], games, country: db.users.find((u) => u.id === ids[0]).country,
      members: ids.map((id, i) => ({ userId: id, role: i === 0 ? 'captain' : 'member', joinedAt: now - r.int(5, 200) * DAY })),
      rating: Math.round(avg + r.gauss(0, 40)),
      stats: { matches: wins + r.int(5, 50), wins, competitions: wins + r.int(3, 20), earnings: wins * r.int(20000, 90000) },
      bio: r.pick(['Squad up or step aside.', 'Weekly scrims, Sunday cups.', 'Recruiting snipers. DM the captain.', 'East Africa’s loudest lobby.']),
      open: r.chance(0.6),
      createdAt: now - r.int(30, 300) * DAY,
      recent: Array.from({ length: 4 }, () => ({ at: now - r.int(1, 20) * DAY, label: r.pick(['Friday Night Drop', 'Squad Showdown', 'Night Cup', 'Sunday Scrim Cup']), place: r.int(1, 12), field: 25 })),
    }));
  }
  db.teams.find((t) => t.id === 'tm_kk').invites.push({ userId: me.id, by: bot('KampalaKid').id, at: now - 3 * HOUR });

  // ---- sponsors, campaigns, missions --------------------------------------------------------
  db.sponsors = [
    { id: 'sp_fizzup', name: 'FIZZUP', category: 'Soft drinks', color: '#E2342D', contact: 'brand@fizzup.demo' },
    { id: 'sp_rapid', name: 'Rapid Data', category: 'Mobile data', color: '#00A3FF', contact: 'growth@rapiddata.demo' },
    { id: 'sp_kicks', name: 'Kampala Kicks', category: 'Sneakers', color: '#F2C14E', contact: 'hello@kampalakicks.demo' },
    { id: 'sp_boda', name: 'Boda Bites', category: 'Snacks', color: '#FF8A00', contact: 'team@bodabites.demo' },
    { id: 'sp_glow', name: 'Glowpad', category: 'Audio', color: '#A97CFF', contact: 'partners@glowpad.demo' },
    { id: 'sp_volta', name: 'VOLTA', category: 'Energy drinks', color: '#F5D300', contact: 'esports@volta.demo' },
  ];
  db.campaigns = [
    { id: 'cp_fizz_summer', sponsorId: 'sp_fizzup', name: 'FIZZUP Summer Drop', budget: 6_000_000, spent: 1_840_000, status: 'live', startsAt: now - 6 * DAY, endsAt: now + 15 * DAY, regions: ['UG', 'KE', 'RW'], objective: 'Awareness + trial', createdAt: now - 12 * DAY },
    { id: 'cp_rapid_rift', sponsorId: 'sp_rapid', name: 'Rapid Data Rift Cup', budget: 4_000_000, spent: 900_000, status: 'live', startsAt: now - 2 * DAY, endsAt: now + 9 * DAY, regions: ['UG'], objective: 'Data bundle sign-ups', createdAt: now - 7 * DAY },
    { id: 'cp_kicks_clutch', sponsorId: 'sp_kicks', name: 'Clutch Kings', budget: 2_500_000, spent: 300_000, status: 'live', startsAt: now - 1 * DAY, endsAt: now + 6 * DAY, regions: ['UG'], objective: 'Store visits', createdAt: now - 4 * DAY },
    { id: 'cp_glow_sound', sponsorId: 'sp_glow', name: 'Sound Check', budget: 3_000_000, spent: 0, status: 'scheduled', startsAt: now + 3 * DAY, endsAt: now + 20 * DAY, regions: ['UG', 'NG', 'GH'], objective: 'Launch', createdAt: now - 1 * DAY },
    { id: 'cp_boda_lunch', sponsorId: 'sp_boda', name: 'Lunch Break Run', budget: 1_200_000, spent: 1_200_000, status: 'complete', startsAt: now - 30 * DAY, endsAt: now - 10 * DAY, regions: ['UG'], objective: 'Trial', createdAt: now - 35 * DAY },
  ];
  const mission = (f) => db.missions.push(createMission(f));
  mission({
    id: 'msn_fizz_hunt', campaignId: 'cp_fizz_summer', sponsorId: 'sp_fizzup', type: 'hunt', status: 'live',
    title: 'Find the hidden FIZZUP can', brief: 'A cold one is hidden somewhere on the map. Eight scans, hot-or-cold hints. Find it, you keep it.',
    objective: { label: 'Find the can within 8 scans' },
    reward: { type: 'cash', value: 5000, label: 'UGX 5,000 + 2 free FIZZUPs' }, quantity: 2000, startsAt: now - 6 * DAY, endsAt: now + 15 * DAY,
    regions: ['UG', 'KE', 'RW'], terms: 'One reward per player. Drinks redeemable at partner shops in Kampala. Demo campaign.',
    stats: { views: 18240, starts: 6120, completions: 1460 }, hunt: { size: 6, maxScans: 8 },
  });
  mission({
    id: 'msn_fizz_codm', campaignId: 'cp_fizz_summer', sponsorId: 'sp_fizzup', type: 'in_game', status: 'live', gameId: 'codm', modeId: 'br_solo',
    title: 'Ice cold top 10', brief: 'Finish top 10 in a CODM BR Solo match. Screenshot the results screen.',
    objective: { label: 'Finish top 10 in BR Solo', metric: 'placement', op: 'lte', target: 10 },
    reward: { type: 'credit', value: 10000, label: 'UGX 10,000 STACKD credit' }, quantity: 1000, startsAt: now - 6 * DAY, endsAt: now + 15 * DAY,
    regions: ['UG', 'KE', 'RW'], terms: 'Results screen must show your in-game name. Demo campaign.', stats: { views: 9930, starts: 3010, completions: 702 },
  });
  mission({
    id: 'msn_rapid_mlbb', campaignId: 'cp_rapid_rift', sponsorId: 'sp_rapid', type: 'in_game', status: 'live', gameId: 'mlbb', modeId: 'ranked',
    title: 'Rift runner', brief: 'Win a ranked MLBB match. Rapid Data loads you with a gaming bundle.',
    objective: { label: 'Win one ranked 5v5', metric: 'won', op: 'eq', target: 1 },
    reward: { type: 'digital', value: 0, label: '5 GB gaming data bundle' }, quantity: 1500, startsAt: now - 2 * DAY, endsAt: now + 9 * DAY,
    regions: ['UG'], terms: 'Bundle credited to your registered number within 24h. Demo campaign.', stats: { views: 7320, starts: 2210, completions: 980 },
  });
  mission({
    id: 'msn_kicks_gunfight', campaignId: 'cp_kicks_clutch', sponsorId: 'sp_kicks', type: 'in_game', status: 'live', gameId: 'efootball', modeId: 'division',
    title: 'Clean sheet, clean kicks', brief: 'Keep a clean sheet in an eFootball division match. Top 10 completions win a pair of sneakers.',
    objective: { label: 'Concede 0 goals in a division match', metric: 'conceded', op: 'lte', target: 0 },
    reward: { type: 'merch', value: 0, label: 'Kampala Kicks sneakers (first 10)' }, quantity: 10, startsAt: now - 1 * DAY, endsAt: now + 6 * DAY,
    regions: ['UG'], terms: 'Pickup at Kampala Kicks, Acacia Mall. Size on request. Demo campaign.', stats: { views: 4100, starts: 860, completions: 4 },
  });
  mission({
    id: 'msn_boda_hunt', campaignId: 'cp_boda_lunch', sponsorId: 'sp_boda', type: 'hunt', status: 'complete',
    title: 'Lunch box hunt', brief: 'Find the Boda Bites lunch box.', objective: { label: 'Find it within 8 scans' },
    reward: { type: 'discount', value: 0, label: '30% off Boda Bites' }, quantity: 1000, startsAt: now - 30 * DAY, endsAt: now - 10 * DAY,
    regions: ['UG'], stats: { views: 22000, starts: 8000, completions: 1000 }, hunt: { size: 6, maxScans: 8 },
  });
  mission({
    id: 'msn_glow_tourn', campaignId: 'cp_glow_sound', sponsorId: 'sp_glow', type: 'in_game', status: 'scheduled', gameId: 'freefire', modeId: 'br_solo',
    title: 'Hear them first', brief: 'Get 6 kills in a Free Fire BR Solo match.', objective: { label: 'Get 6 kills', metric: 'kills', op: 'gte', target: 6 },
    reward: { type: 'entry', value: 0, label: 'Free entry: Glowpad Sound Cup' }, quantity: 200, startsAt: now + 3 * DAY, endsAt: now + 20 * DAY, regions: ['UG', 'NG', 'GH'],
  });
  mission({
    id: 'msn_rapid_grind', campaignId: 'cp_rapid_rift', sponsorId: 'sp_rapid', type: 'progress', status: 'live',
    title: 'Play 3, finish top 10 once', brief: 'Play 3 matches in any game and finish top 10 in at least one battle royale. Progress counts from verified results after you start.',
    objective: { label: 'Play 3 matches and finish Top 10 once', requirements: [{ metric: 'matches', target: 3 }, { metric: 'top10', target: 1 }] },
    reward: { type: 'cash', value: 10000, label: 'UGX 10,000 DEMO' }, quantity: 500, startsAt: now - 1 * DAY, endsAt: now + 14 * DAY,
    regions: ['UG', 'KE', 'TZ', 'RW', 'NG', 'GH', 'ZA', 'GB'], terms: 'One reward per player. Demo campaign: rewards are demo credit.', stats: { views: 1200, starts: 340, completions: 41 },
  });
  me.missionsDone = ['msn_boda_hunt'];
  db.missions.find((m) => m.id === 'msn_boda_hunt').progress[me.id] = { startedAt: now - 20 * DAY, completedAt: now - 20 * DAY, scans: [], found: true };
  db.drops.push({ id: 'drp_seed1', userId: me.id, missionId: 'msn_boda_hunt', sponsorId: 'sp_boda', label: '30% off Boda Bites', type: 'discount', code: 'BODA-30-7QX2', at: now - 20 * DAY, status: 'redeemed' });

  // ---- competitions -------------------------------------------------------------------------
  const pool = (f, prefill) => {
    const c = createCompetition({ kind: 'pool', createdBy: 'system', ...f });
    db.competitions.push(c);
    if (prefill) fillPool(db, c, prefill);
    if (c.participants.length >= c.maxPlayers) c.status = 'full';
    return c;
  };
  pool({ title: 'Friday Night Drop', gameId: 'codm', modeId: 'br_squad', format: 'team', teamSize: 4, minPlayers: 40, maxPlayers: 100, entry: 10000, startsAt: now + 25 * MIN, featured: true,
    prize: { model: 'team', feePct: 10, placements: [50, 25, 15, 10], teamSplit: 'equal' } }, 56);
  pool({ title: 'Erangel Rush', gameId: 'pubgm', modeId: 'classic_solo', minPlayers: 30, maxPlayers: 100, entry: 5000, startsAt: now + 12 * MIN, featured: true,
    prize: { model: 'placement', feePct: 10, placements: [40, 25, 15, 10, 10] } }, 61);
  pool({ title: 'Bermuda Booyah', gameId: 'freefire', modeId: 'br_squad', format: 'team', teamSize: 4, minPlayers: 24, maxPlayers: 48, entry: 3000, startsAt: now + 40 * MIN,
    prize: { model: 'hybrid', feePct: 10, placements: [60, 30, 10], killPoolPct: 30, teamSplit: 'equal' } }, 20);
  pool({ title: 'Zero Build Cash Cup', gameId: 'fortnite', modeId: 'zb_solo', platform: 'pc', region: 'europe', minPlayers: 30, maxPlayers: 100, entry: 8000, startsAt: now + 2 * HOUR,
    prize: { model: 'placement', feePct: 10, placements: [50, 30, 20] } }, 33);
  pool({ title: 'Resurgence Kill Race', gameId: 'warzone', modeId: 'resurgence', platform: 'playstation', minPlayers: 20, maxPlayers: 52, entry: 15000, startsAt: now + 55 * MIN,
    prize: { model: 'individual', feePct: 10 } }, 18);
  pool({ title: 'Showdown Sprint', gameId: 'brawl', modeId: 'showdown', minPlayers: 6, maxPlayers: 10, entry: 2000, startsAt: now + 8 * MIN,
    prize: { model: 'winner_takes_all', feePct: 10 } }, 6);
  pool({ title: 'Apex Trios Night', gameId: 'apex', modeId: 'trios', platform: 'pc', format: 'team', teamSize: 3, minPlayers: 30, maxPlayers: 60, entry: 6000, startsAt: now + 3 * HOUR, sponsorId: 'sp_glow',
    prize: { model: 'team', feePct: 10, placements: [60, 25, 15], teamSplit: 'equal', sponsorBoost: 100000, bonuses: [{ label: 'Glowpad MVP bonus', amount: 20000, fundedBy: 'sponsor' }] } }, 21);
  pool({ title: 'Asphalt Street Sprint', gameId: 'asphalt', modeId: 'mp', minPlayers: 6, maxPlayers: 8, entry: 3000, startsAt: now + 15 * MIN,
    prize: { model: 'placement', feePct: 10, placements: [60, 30, 10] } }, 5);
  pool({ title: 'Free Entry Freefall', gameId: 'codm', modeId: 'br_solo', minPlayers: 20, maxPlayers: 100, entry: 0, startsAt: now + 35 * MIN, sponsorId: 'sp_fizzup',
    prize: { model: 'placement', feePct: 0, placements: [50, 30, 20], sponsorBoost: 150000 } }, 47);

  // The reference end-to-end demo: 100 players × UGX 10,000 = 1,000,000 gross, 20% fee = 200,000,
  // 800,000 to the winning squad of four = 200,000 each.
  pool({ title: 'Battle Royale Demo: 100 Players', gameId: 'codm', modeId: 'br_squad', format: 'team', teamSize: 4, minPlayers: 100, maxPlayers: 100, entry: 10000, startsAt: now + 45 * MIN, featured: true, noAutoFill: true,
    prize: { model: 'winner_takes_all', feePct: 20, teamSplit: 'equal' } }, 60);

  const liveA = pool({ title: 'Lunch Drop', gameId: 'codm', modeId: 'br_solo', minPlayers: 30, maxPlayers: 100, entry: 5000, startsAt: now - 6 * MIN,
    prize: { model: 'placement', feePct: 10, placements: [50, 30, 20] } }, 88);
  startPool(db, liveA, { fillTo: 100 });
  const liveB = pool({ title: 'Midday Miramar', gameId: 'pubgm', modeId: 'classic_squad', format: 'team', teamSize: 4, minPlayers: 40, maxPlayers: 100, entry: 4000, startsAt: now - 11 * MIN,
    prize: { model: 'team', feePct: 10, placements: [50, 30, 20], teamSplit: 'equal' } }, 92);
  startPool(db, liveB, { fillTo: 100 });

  // Seeded challenges go through the real H2H service, so the challenger's entry is on the ledger.
  const h2h = (challenger, f, opponent) => {
    const g = db.games.find((x) => x.id === f.gameId);
    const c = createH2H(db, bot(challenger), { platform: g.platforms[0], type: opponent ? 'direct' : 'open', opponentId: opponent || null, note: f.note || '', ...f });
    c.createdAt = now - r.int(2, 90) * MIN;
    delete c.h2h.botAcceptAt;
    return c;
  };
  h2h('Ssebo_Snipes', { gameId: 'codm', modeId: 'gunfight', entry: 5000, note: 'Run it. Gunfight, first to 3.' }, me.id);
  h2h('QueenNakato', { gameId: 'efootball', modeId: 'h2h', entry: 10000, note: 'You said your Arsenal was better.' }, me.id);
  h2h('KampalaKid', { gameId: 'efootball', modeId: 'h2h', entry: 5000 });
  h2h('LagosLeo', { gameId: 'freefire', modeId: 'cs', entry: 3000 });
  h2h('NairobiNitro', { gameId: 'codm', modeId: 'gunfight', entry: 10000 });
  h2h('Wanjiku_W', { gameId: 'clashroyale', modeId: 'duel', entry: 2000 });
  h2h('BodaBoss', { gameId: 'pool8', modeId: 'h2h', entry: 2000 });
  h2h('frostbyte', { gameId: 'eafc', modeId: 'kickoff', platform: 'playstation', entry: 20000 });
  h2h('JoziJuke', { gameId: 'tekken8', modeId: 'ft3', platform: 'playstation', entry: 15000 });
  h2h('JinjaJet', { gameId: 'pubgm', modeId: 'tdm', entry: 4000 });
  h2h('AccraAim', { gameId: 'mlbb', modeId: 'brawl1', entry: 3000 });
  h2h('Tunde.exe', { gameId: 'fcm', modeId: 'h2h', entry: 5000 });
  db.notifications = db.notifications.filter((n) => n.type !== 'challenge'); // the seeded inbox below adds these with nicer timing
  for (const [a, b, f] of [['NileViper', 'MbararaMamba', { gameId: 'codm', modeId: 'gunfight', entry: 20000 }], ['Chege.Ghost', 'DarDemon', { gameId: 'efootball', modeId: 'h2h', entry: 8000 }], ['CapeCrusher', 'ghxst', { gameId: 'tekken8', modeId: 'ft3', platform: 'pc', entry: 25000 }]]) {
    const c = h2h(a, f);
    acceptH2H(db, bot(b), c);
  }

  // ---- tournaments --------------------------------------------------------------------------
  const tour = (f, regBots = 0) => {
    const t = createTournament({ registrationDeadline: f.startsAt - 5 * MIN, ...f });
    db.tournaments.push(t);
    if (regBots) {
      if (t.teamSize > 1) {
        for (const tm of db.teams.filter((x) => x.id !== 'tm_nile' && x.games.includes(t.gameId)).slice(0, regBots))
          addDemoEntrant(db, t, { id: tm.id, type: 'team', name: tm.name, tag: tm.tag, color: tm.color, members: tm.members.map((m) => m.userId).filter((id) => id !== me.id).slice(0, t.teamSize), rating: tm.rating });
      } else {
        for (const b of bots.filter((u) => u.games.includes(t.gameId)).slice(0, regBots))
          addDemoEntrant(db, t, { id: b.id, type: 'user', name: b.username, members: [b.id], rating: b.gameScores[t.gameId]?.score ?? b.stackScore });
      }
    }
    return t;
  };
  tour({ name: 'Kampala Open: eFootball', gameId: 'efootball', modeId: 'h2h', format: 'single_elim', maxEntrants: 16, entry: 10000, startsAt: now + 2 * HOUR, featured: true,
    prize: { model: 'placement', feePct: 10, placements: [60, 25, 15] }, guaranteed: 250000, rules: ['6-minute halves', 'No extra time, straight to penalties', 'Report within 30 minutes'] }, 9);
  tour({ name: 'CODM Squad Showdown', gameId: 'codm', modeId: 'br_squad', format: 'battle_royale', teamSize: 4, maxEntrants: 12, entry: 20000, startsAt: now + 26 * HOUR, featured: true,
    prize: { model: 'placement', feePct: 10, placements: [50, 25, 15, 10] }, rules: ['3 games, points for placement + 1 per kill', 'Same squad across all 3 games', 'Results screenshot after every game'] }, 6);
  tour({ name: 'Tekken Tuesday', gameId: 'tekken8', modeId: 'ft3', platform: 'playstation', format: 'double_elim', maxEntrants: 8, entry: 5000, startsAt: now + 50 * MIN,
    prize: { model: 'placement', feePct: 10, placements: [60, 30, 10] }, rules: ['First to 3 rounds', 'Double elimination: lose twice, you’re out'] }, 4);
  tour({ name: 'Rapid Data Rift Cup', gameId: 'mlbb', modeId: 'custom5', format: 'single_elim', teamSize: 5, maxEntrants: 8, entry: 0, startsAt: now + 2 * DAY, sponsorId: 'sp_rapid', featured: true,
    prize: { model: 'placement', feePct: 0, placements: [60, 30, 10] }, guaranteed: 2000000, rules: ['Draft pick', 'Best of 1 until the final, final is best of 3'] }, 4);
  tour({ name: 'Clash Royale Swiss Weekly', gameId: 'clashroyale', modeId: 'duel', format: 'swiss', maxEntrants: 16, entry: 0, startsAt: now + 5 * HOUR, sponsorId: 'sp_fizzup',
    prize: { model: 'placement', feePct: 0, placements: [50, 30, 20] }, guaranteed: 300000, rules: ['Tournament standard levels', '4 Swiss rounds, no elimination'] }, 7);
  tour({ name: '8 Ball League Night', gameId: 'pool8', modeId: 'h2h', format: 'league', maxEntrants: 6, entry: 2000, startsAt: now + 4 * HOUR,
    prize: { model: 'placement', feePct: 10, placements: [70, 30] }, rules: ['Everyone plays everyone', '3 points per win'] }, 3);
  tour({ name: 'FC Mobile Ladder', gameId: 'fcm', modeId: 'h2h', format: 'ladder', maxEntrants: 8, entry: 3000, startsAt: now + 7 * HOUR,
    prize: { model: 'placement', feePct: 10, placements: [60, 30, 10] }, rules: ['Climb the ladder: every result moves you'] }, 4);
  const liveT = tour({ name: 'Free Fire Night Cup', gameId: 'freefire', modeId: 'cs', format: 'single_elim', teamSize: 4, maxEntrants: 8, entry: 5000, startsAt: now - 20 * MIN,
    prize: { model: 'placement', feePct: 10, placements: [70, 30] } }, 4);
  liveT.registrationDeadline = now - 25 * MIN;
  startTournament(db, liveT);
  const doneT = tour({ name: 'PUBG Mobile Masters S3', gameId: 'pubgm', modeId: 'tdm', format: 'single_elim', maxEntrants: 16, entry: 10000, startsAt: now - 2 * DAY,
    prize: { model: 'placement', feePct: 10, placements: [60, 25, 15] } }, 16);
  doneT.registrationDeadline = now - 2 * DAY;
  startTournament(db, doneT);
  advanceBots(db, doneT);

  // ---- The Big Stack: sponsor-guaranteed season mega pool ------------------------------------
  db.bigStack = {
    id: 'bigstack_s4', name: 'The Big Stack', season: 'Season 4', sponsorId: 'sp_volta', status: 'qualifying',
    guaranteedUSD: 500_000, stretchUSD: 1_000_000, fx: 3700, contributionPct: 20,
    contributedUGX: 412_650_000, revenueCursor: 0,
    qualifySpots: 24, finalsAt: now + 23 * DAY,
    games: ['codm', 'pubgm', 'freefire', 'efootball', 'eafc'],
    rules: [
      'Every verified competition you play earns season points. Wins and deep runs earn more.',
      'Big Stack qualifier cups award bonus points to the top four.',
      'The top players on the season points table when qualifying closes play the finals.',
      'Finals are played online across the featured games, with STACKD referees on every match.',
      'The sponsor guarantees the base pool. A share of platform fees from every paid entry is added on top.',
      'Winners are paid after ID verification. Prizes above local thresholds may be subject to tax.',
    ],
  };
  const bsQ = (f, reg, points) => {
    const t = tour({ sponsorId: 'sp_volta', featured: true, entry: 0, prize: { model: 'placement', feePct: 0, placements: [50, 30, 20] }, ...f }, reg);
    t.bigStack = true;
    t.bigStackPoints = points;
    return t;
  };
  bsQ({ name: 'Big Stack Qualifier: CODM Gunfight', gameId: 'codm', modeId: 'gunfight', format: 'single_elim', maxEntrants: 16, startsAt: now + 90 * MIN, guaranteed: 500000,
    rules: ['Free entry', 'Top four earn Big Stack points: 150 / 90 / 60 / 60', 'First to 3 rounds'] }, 9, [150, 90, 60, 60]);
  bsQ({ name: 'Big Stack Qualifier: eFootball', gameId: 'efootball', modeId: 'h2h', format: 'single_elim', maxEntrants: 16, startsAt: now + 5 * HOUR, guaranteed: 500000,
    rules: ['Free entry', 'Top four earn Big Stack points: 150 / 90 / 60 / 60', '6-minute halves'] }, 7, [150, 90, 60, 60]);
  bsQ({ name: 'Big Stack Qualifier: Free Fire Squads', gameId: 'freefire', modeId: 'br_squad', format: 'battle_royale', teamSize: 4, maxEntrants: 12, startsAt: now + 28 * HOUR, guaranteed: 1000000,
    rules: ['Free entry for squads', '3 games, placement + kill points', 'Top four squads: every member earns 120 / 80 / 50 / 50'] }, 5, [120, 80, 50, 50]);

  // ---- markets ------------------------------------------------------------------------------
  const seeds = db.tournaments[0].entrants.slice(0, 3);
  db.markets = [
    { id: 'mk_kopen', category: 'esports', title: 'Who wins the Kampala Open: eFootball?', closesAt: now + 2 * HOUR, status: 'open', volume: 1_240_000,
      options: [...seeds.map((s, i) => ({ id: s.id, label: s.name, price: [0.24, 0.19, 0.14][i] })), { id: 'field', label: 'Anyone else', price: 0.47 }] },
    { id: 'mk_fnd_kills', category: 'gaming', title: 'Friday Night Drop: winning squad gets 30+ kills?', closesAt: now + 25 * MIN, status: 'open', volume: 420_000,
      options: [{ id: 'yes', label: 'Yes', price: 0.41 }, { id: 'no', label: 'No', price: 0.61 }] },
    { id: 'mk_nile_top3', category: 'esports', title: 'Nile Snipers finish top 3 at CODM Squad Showdown?', closesAt: now + 26 * HOUR, status: 'open', volume: 310_000,
      options: [{ id: 'yes', label: 'Yes', price: 0.33 }, { id: 'no', label: 'No', price: 0.69 }] },
    { id: 'mk_cranes', category: 'sports', title: 'Uganda vs Kenya friendly: result', closesAt: now + 3 * DAY, status: 'open', volume: 2_900_000,
      options: [{ id: 'ug', label: 'Uganda', price: 0.44 }, { id: 'draw', label: 'Draw', price: 0.29 }, { id: 'ke', label: 'Kenya', price: 0.3 }] },
    { id: 'mk_tekken_upset', category: 'esports', title: 'Tekken Tuesday: a seed outside the top 4 wins?', closesAt: now + 50 * MIN, status: 'open', volume: 150_000,
      options: [{ id: 'yes', label: 'Yes', price: 0.28 }, { id: 'no', label: 'No', price: 0.74 }] },
    { id: 'mk_s4_entries', category: 'gaming', title: 'Season 4 finals: 500+ players qualify?', closesAt: now + 20 * DAY, status: 'open', volume: 88_000,
      options: [{ id: 'yes', label: 'Yes', price: 0.57 }, { id: 'no', label: 'No', price: 0.45 }] },
    { id: 'mk_masters', category: 'esports', title: 'PUBG Mobile Masters S3 champion from Uganda?', closesAt: now - 2 * DAY, status: 'resolved', volume: 640_000, resolution: 'yes',
      options: [{ id: 'yes', label: 'Yes', price: 0.5 }, { id: 'no', label: 'No', price: 0.5 }] },
  ];

  // ---- staking runs -------------------------------------------------------------------------
  const runFor = (name, label, gameId, buyIn, markup) => db.stakingRuns.push({ id: uid('run'), playerId: bot(name).id, label, gameId, buyIn, markup, maxPct: 60, soldPct: r.int(5, 40), status: 'open', createdAt: now - r.int(1, 10) * HOUR });
  runFor('NileViper', 'CODM Squad Showdown entry + side pools', 'codm', 80000, 1.15);
  runFor('Ssebo_Snipes', 'Friday Night Drop + Gunfight ladder', 'codm', 40000, 1.1);
  runFor('LagosLeo', 'Free Fire Night Cup run', 'freefire', 50000, 1.2);
  runFor('QueenNakato', 'Kampala Open: eFootball', 'efootball', 30000, 1.1);
  runFor('KigaliKraken', 'Erangel Rush x3 sessions', 'pubgm', 25000, 1.05);
  runFor('JoziJuke', 'Tekken Tuesday + money matches', 'tekken8', 60000, 1.25);
  db.stakes.push({ id: uid('stk'), backerId: me.id, runId: db.stakingRuns[0].id, playerId: bot('NileViper').id, amount: 10000, pct: (10000 / (80000 * 1.15)) * 100, status: 'active', at: now - 5 * HOUR });

  // ---- arcade -------------------------------------------------------------------------------
  db.arcade = [
    { id: 'quickdraw', kind: 'reaction', name: 'Quick Draw', status: 'live', blurb: 'Wait for the signal. Tap. Five rounds, average reaction time wins.', rules: ['Tap only after the screen changes', 'Early taps cost 500 ms', '5 rounds, lowest average wins'], unit: 'ms', lowerBetter: true, entries: [0, 1000, 2000, 5000], payoutMult: 1.8, format: 'You vs a matched ghost run' },
    { id: 'flick', kind: 'aim', name: 'Flick', status: 'live', blurb: '20 targets. Hit them fast. Misses cost time.', rules: ['20 targets appear one at a time', 'Each hit scores 100, speed adds a bonus', '30-second limit'], unit: 'pts', lowerBetter: false, entries: [0, 1000, 2000, 5000], payoutMult: 1.8, format: 'You vs a matched ghost run' },
    { id: 'deadstop', kind: 'timing', name: 'Dead Stop', status: 'live', blurb: 'Stop the needle on the line. Five rounds, closer scores more.', rules: ['Tap to stop the needle', 'Dead centre scores 100', 'Each round speeds up'], unit: 'pts', lowerBetter: false, entries: [0, 1000, 2000, 5000], payoutMult: 1.8, format: 'You vs a matched ghost run' },
    { id: 'memgrid', kind: 'memory', name: 'Memory Grid', status: 'soon', blurb: 'Remember the pattern. Repeat it. It gets longer.', rules: [], unit: 'lvl', lowerBetter: false, entries: [], payoutMult: 1.8, format: 'Coming soon' },
    { id: 'driftline', kind: 'racing', name: 'Drift Line', status: 'soon', blurb: 'One-thumb racing on a tightening line.', rules: [], unit: 's', lowerBetter: true, entries: [], payoutMult: 1.8, format: 'Coming soon' },
  ];
  for (const b of bots.slice(0, 40)) {
    db.arcadeRuns.push({ id: uid('arn'), userId: b.id, gameId: 'quickdraw', score: Math.round(clamp(r.gauss(300 - (b.stackScore - 1100) / 8, 35), 170, 480)), at: now - r.int(1, 200) * HOUR, entry: 0, status: 'done' });
    db.arcadeRuns.push({ id: uid('arn'), userId: b.id, gameId: 'flick', score: Math.round(clamp(r.gauss(2350 + (b.stackScore - 1100), 260), 900, 3300)), at: now - r.int(1, 200) * HOUR, entry: 0, status: 'done' });
    db.arcadeRuns.push({ id: uid('arn'), userId: b.id, gameId: 'deadstop', score: Math.round(clamp(r.gauss(360 + (b.stackScore - 1100) / 6, 50), 120, 495)), at: now - r.int(1, 200) * HOUR, entry: 0, status: 'done' });
  }

  // ---- demo player history ------------------------------------------------------------------
  const L = (f) => db.ledger.push(createTx(f));
  L({ userId: me.id, type: 'bonus', amount: 100000, description: 'Demo starter wallet (not real money)', meta: { demo: true }, createdAt: now - 41 * DAY });
  L({ userId: me.id, type: 'bonus', amount: 10000, bucket: 'bonus', description: 'Welcome bonus credit', createdAt: now - 41 * DAY });
  L({ userId: me.id, type: 'deposit', amount: 50000, provider: 'mtn_momo', description: 'Deposit via MTN Mobile Money (simulated)', meta: { providerRef: 'SIM7Q2LK9PA', msisdnMasked: '077•••••21' }, createdAt: now - 30 * DAY });
  const hist = [
    [29, 'codm', 'br_solo', 'challenge', 'Get 10 kills', 5000, 12000, true, 18],
    [25, 'efootball', 'h2h', 'h2h', 'eFootball 1v1 Friend Match', 10000, 18000, true, 14],
    [21, 'codm', 'br_squad', 'pool', 'Friday Night Drop', 10000, 0, false, -6],
    [18, 'pubgm', 'classic_solo', 'challenge', 'Finish top 5', 5000, 0, false, -4],
    [14, 'codm', 'br_squad', 'pool', 'Friday Night Drop', 10000, 45000, true, 21],
    [10, 'efootball', 'h2h', 'h2h', 'eFootball 1v1 Friend Match', 5000, 0, false, -12],
    [7, 'codm', 'gunfight', 'h2h', 'CODM Gunfight 1v1', 5000, 9000, true, 11],
    [4, 'freefire', 'br_solo', 'challenge', 'Get 6 kills', 3000, 0, false, -5],
    [2, 'codm', 'br_solo', 'challenge', 'Finish top 10', 5000, 9000, true, 9],
    [1, 'efootball', 'division', 'challenge', 'Score 3 goals', 4000, 9600, true, 12],
  ];
  const opps = ['KampalaKid', 'JinjaJet', 'NairobiNitro', 'QueenNakato', 'BodaBoss'];
  for (const [d, gameId, modeId, kind, title, entry, prize, won, delta] of hist) {
    const at = now - d * DAY - r.int(1, 8) * HOUR;
    const oppId = kind === 'h2h' ? bot(r.pick(opps)).id : null;
    const m = createMatch({ kind, refId: null, gameId, modeId, players: oppId ? [me.id, oppId] : [me.id] });
    m.title = title;
    m.status = 'settled';
    m.createdAt = at - 40 * MIN;
    m.startedAt = at - 35 * MIN;
    m.settledAt = at;
    m.outcome = {
      winnerId: kind === 'h2h' ? (won ? me.id : oppId) : null,
      score: kind === 'h2h' ? (won ? '3–1' : '1–2') : null,
      perUser: { [me.id]: { won, delta, payout: prize, place: kind === 'pool' ? (won ? 2 : 14) : null, unlocked: [] } },
    };
    m.timeline = [{ at: m.createdAt, text: 'Match created' }, { at, text: 'Settled and paid out' }];
    db.matches.push(m);
    L({ userId: me.id, type: 'entry', amount: -entry, ref: { kind: 'match', id: m.id, label: title }, description: `${title} entry`, createdAt: at - 40 * MIN });
    if (prize) L({ userId: me.id, type: 'prize', amount: prize, ref: { kind: 'match', id: m.id, label: title }, description: `Prize: ${title}`, createdAt: at });
  }
  L({ userId: me.id, type: 'withdrawal', amount: -20000, provider: 'mtn_momo', description: 'Withdrawal to MTN Mobile Money (simulated)', meta: { providerRef: 'SIMW8N3D1QE', fee: 200, msisdnMasked: '077•••••21' }, createdAt: now - 12 * DAY });
  L({ userId: me.id, type: 'sponsor_reward', amount: 5000, ref: { kind: 'mission', id: 'msn_boda_hunt', label: 'Lunch box hunt' }, description: 'Boda Bites mission reward', createdAt: now - 20 * DAY });
  L({ userId: me.id, type: 'stake', amount: -10000, ref: { kind: 'stake', id: db.stakes[0].id, label: 'Backing NileViper' }, description: 'Backed NileViper: CODM Squad Showdown run', createdAt: now - 5 * HOUR });

  // bot money movements for the admin wallet queue
  for (const name of ['KampalaKid', 'LagosLeo', 'QueenNakato', 'NileViper', 'Tunde.exe', 'JoziJuke']) {
    const u = bot(name);
    L({ userId: u.id, type: 'deposit', amount: r.int(5, 40) * 5000, provider: u.country === 'UG' ? 'mtn_momo' : 'card', description: 'Deposit (simulated)', createdAt: now - r.int(1, 9) * DAY });
    L({ userId: u.id, type: 'prize', amount: r.int(5, 30) * 4000, description: 'Prize', createdAt: now - r.int(1, 5) * DAY });
  }
  for (const name of ['NileViper', 'LagosLeo', 'QueenNakato']) {
    const u = bot(name);
    L({ userId: u.id, type: 'withdrawal', amount: -r.int(4, 16) * 5000, status: 'pending', provider: u.country === 'UG' ? 'airtel_money' : 'bank', description: 'Withdrawal (simulated)', meta: { fee: 300 }, createdAt: now - r.int(1, 20) * HOUR });
  }

  // ---- disputes, tickets, fraud, audit ------------------------------------------------------
  const dm = (a, b, gameId, modeId, title) => {
    const m = createMatch({ kind: 'h2h', refId: null, gameId, modeId, players: [bot(a).id, bot(b).id] });
    m.title = title;
    m.status = 'disputed';
    m.reports = {
      [bot(a).id]: { stats: { goals: 2, conceded: 1 }, outcome: 'win', evidence: [{ type: 'screenshot', name: 'final_score.jpg' }], at: now - 50 * MIN },
      [bot(b).id]: { stats: { goals: 2, conceded: 1 }, outcome: 'win', evidence: [{ type: 'video', name: 'https://twitch.tv/videos/demo' }], at: now - 45 * MIN },
    };
    m.truth = { winner: bot(b).id, score: '1–2' };
    db.matches.push(m);
    const d = createDispute({ matchId: m.id, raisedBy: bot(a).id, against: bot(b).id, reason: 'wrong_result', details: 'Opponent claims a win. My screenshot shows 2–1 at full time.', evidence: m.reports[bot(a).id].evidence });
    d.createdAt = now - 40 * MIN;
    m.disputeId = d.id;
    db.disputes.push(d);
  };
  dm('KampalaKid', 'BodaBoss', 'efootball', 'h2h', 'eFootball 1v1 Friend Match');
  dm('Tunde.exe', 'Ada_Clutch', 'fcm', 'h2h', 'FC Mobile H2H');
  const resolvedD = createDispute({ matchId: db.matches.find((m) => m.players.includes(me.id) && m.kind === 'h2h' && !m.outcome.perUser[me.id].won)?.id, raisedBy: me.id, reason: 'disconnect', details: 'Opponent quit while I was up 1–0.' });
  resolvedD.status = 'rejected';
  resolvedD.resolution = { decision: 'Result stands', note: 'VOD shows you were down 0–1 at the disconnect. Disconnect rule: trailing player loses.', by: 'Referee Amara', at: now - 9 * DAY };
  resolvedD.createdAt = now - 10 * DAY;
  resolvedD.history.push({ at: now - 9 * DAY, text: 'Referee: result stands' });
  db.disputes.push(resolvedD);

  db.tickets = [
    { id: 'tkt_1', userId: bot('JinjaJet').id, subject: 'Withdrawal still pending', category: 'wallet', status: 'open', at: now - 3 * HOUR, messages: [{ from: 'user', body: 'Requested a withdrawal to Airtel 5 hours ago. Still pending.', at: now - 3 * HOUR }] },
    { id: 'tkt_2', userId: bot('Wanjiku_W').id, subject: 'Can’t back players in Kenya?', category: 'account', status: 'open', at: now - 9 * HOUR, messages: [{ from: 'user', body: 'The Back a player tab says not available.', at: now - 9 * HOUR }] },
    { id: 'tkt_3', userId: me.id, subject: 'How do squad payouts split?', category: 'competitions', status: 'closed', at: now - 15 * DAY, messages: [{ from: 'user', body: 'If my squad wins, does everyone get the same?', at: now - 15 * DAY }, { from: 'support', body: 'Yes by default — the team allocation splits equally. Some pools split by eliminations; the prize card always says which.', at: now - 15 * DAY + 2 * HOUR }] },
  ];
  db.fraud = [
    { id: 'frd_1', userId: bot('Ikeja.Ice').id, kind: 'win_spike', severity: 'high', detail: '10 straight wins on a 9-day-old account', status: 'open', at: now - 2 * HOUR },
    { id: 'frd_2', userId: bot('MuyengaMax').id, kind: 'deposit_velocity', severity: 'medium', detail: '6 deposits in 24h from 3 different numbers', status: 'open', at: now - 7 * HOUR },
    { id: 'frd_3', userId: bot('ZaddyZed').id, kind: 'collusion', severity: 'medium', detail: 'Played the same opponent 5 times today, alternating wins', status: 'open', at: now - 26 * HOUR },
    { id: 'frd_4', userId: bot('SoroSniper').id, kind: 'arcade_telemetry', severity: 'high', detail: 'Reaction times under 80 ms on 4 of 5 rounds', status: 'resolved', at: now - 3 * DAY },
  ];
  const AUD = ['auth.login', 'competitions.join', 'wallet.deposit', 'admin.userAction', 'admin.gameSave', 'tournaments.register', 'wallet.withdraw', 'admin.disputeResolve'];
  for (let i = 0; i < 30; i++) db.audit.push({ id: uid('aud'), at: now - i * 47 * MIN, actorId: r.pick([...bots.slice(0, 12).map((b) => b.id), 'usr_admin']), action: r.pick(AUD), target: r.pick(['cmp', 'usr', 'tx', 'gm']) + '_' + r.int(1000, 9999), meta: {}, ip: `41.210.${r.int(1, 250)}.${r.int(1, 250)}` });

  for (let d = 30; d >= 0; d--) {
    const base = 180000 + (30 - d) * 9000;
    db.revenue.push({ at: now - d * DAY - (d === 0 ? 2 * HOUR : 0), source: 'history', refId: null, amount: Math.round(r.gauss(base, base * 0.18) * (d === 0 ? 0.6 : 1)) });
  }
  for (const u of bots) u.createdAt = Math.min(u.createdAt, now - r.int(1, 60) * DAY);

  // ---- feed + notifications -----------------------------------------------------------------
  const FEED = [
    ['NileViper', 'codm', 120000, 'took Friday Night Drop with Equator Esports'],
    ['QueenNakato', 'efootball', 18000, 'beat KampalaKid 3–1'],
    ['LagosLeo', 'freefire', 54000, 'won Bermuda Booyah'],
    ['Ssebo_Snipes', 'codm', 9000, 'hit "Get 10 kills"'],
    ['KigaliKraken', 'pubgm', 40500, 'finished 1st in Erangel Rush'],
    ['frostbyte', 'eafc', 36000, 'beat noScopeNala 2–0'],
    ['Wanjiku_W', 'clashroyale', 3600, 'hit "Win with 3 crowns"'],
    ['JoziJuke', 'tekken8', 27000, 'beat CapeCrusher 3–2'],
    ['AccraAim', 'mlbb', 5400, 'took match MVP'],
    ['TendoTTV', 'pubgm', 22500, 'hit "Winner winner"'],
    ['BodaBoss', 'pool8', 3600, 'ran the table on Okello_OP'],
    ['DarDemon', 'efootball', 14400, 'beat Chege.Ghost 4–2'],
  ];
  FEED.forEach(([n, g, amt, text], i) => db.feed.push({ id: uid('fd'), at: now - (i * 7 + 2) * MIN, userId: bot(n).id, gameId: g, amount: amt, text }));

  const N = (f) => db.notifications.push({ ...createNotification({ userId: me.id, ...f }), read: f.read || false });
  N({ type: 'challenge', title: 'Ssebo_Snipes challenged you', body: 'CODM Gunfight 1v1 for UGX 5,000', link: `/app/compete/${db.competitions.find((c) => c.h2h?.challengerId === bot('Ssebo_Snipes').id).id}`, at: now - 9 * MIN });
  N({ type: 'challenge', title: 'QueenNakato challenged you', body: 'eFootball 1v1 Friend Match for UGX 10,000', link: `/app/compete/${db.competitions.find((c) => c.h2h?.challengerId === bot('QueenNakato').id).id}`, at: now - 34 * MIN });
  N({ type: 'team', title: 'Kampala Kartel invited you', body: 'KampalaKid wants you on the squad.', link: '/app/teams/tm_kk', at: now - 3 * HOUR });
  N({ type: 'friend', title: 'AcholiAce sent a friend request', body: 'Add them back to challenge each other directly.', link: '/app/u/AcholiAce', at: now - 5 * HOUR });
  N({ type: 'mission', title: 'New mission: Find the hidden FIZZUP can', body: 'UGX 5,000 + 2 free FIZZUPs. 2,000 rewards.', link: '/app/missions/msn_fizz_hunt', at: now - 20 * HOUR, read: true });
  N({ type: 'prize', title: 'You won UGX 9,600', body: 'Score 3 goals (eFootball)', link: '/app/wallet', at: now - 1 * DAY, read: true });
  N({ type: 'system', title: 'The Big Stack: USD 500,000 guaranteed', body: 'Presented by VOLTA. Earn season points to qualify for the finals.', link: '/app/bigstack', at: now - 2 * HOUR });
  N({ type: 'system', title: 'Season 4 is live', body: 'Ranks reset softly. Your placement matches start now.', link: '/app/leaderboards', at: now - 6 * DAY, read: true });

  db.bigStack.revenueCursor = db.revenue.length;
  return db;
}
