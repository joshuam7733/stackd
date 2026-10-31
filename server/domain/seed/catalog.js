// Seed game catalog. In production this lives in the database and is managed from Admin → Games.
// Game names are used as references only. STACKD is not affiliated with any publisher.

const ALL = ['UG', 'KE', 'TZ', 'RW', 'NG', 'GH', 'ZA', 'GB', 'US'];

const M = {
  kills: { key: 'kills', label: 'Kills', min: 0, max: 45 },
  elims: { key: 'kills', label: 'Eliminations', min: 0, max: 40 },
  placement: (max) => ({ key: 'placement', label: 'Placement', min: 1, max, lowerBetter: true }),
  headshots: { key: 'headshots', label: 'Headshots', min: 0, max: 40 },
  survival: { key: 'survival', label: 'Minutes survived', min: 0, max: 35 },
  damage: { key: 'damage', label: 'Damage', min: 0, max: 6000 },
  won: { key: 'won', label: 'Won the match', type: 'bool' },
  goals: { key: 'goals', label: 'Goals scored', min: 0, max: 15 },
  conceded: { key: 'conceded', label: 'Goals conceded', min: 0, max: 15 },
  kda: { key: 'kda', label: 'KDA', min: 0, max: 30, step: 0.1 },
  mvp: { key: 'mvp', label: 'Match MVP', type: 'bool' },
  position: (max) => ({ key: 'placement', label: 'Finish position', min: 1, max, lowerBetter: true }),
  crowns: { key: 'crowns', label: 'Crowns', min: 0, max: 3 },
  rounds: { key: 'rounds', label: 'Rounds won', min: 0, max: 5 },
  roundsLost: { key: 'roundsLost', label: 'Rounds lost', min: 0, max: 5 },
  balls: { key: 'balls', label: 'Balls potted', min: 0, max: 8 },
};

const brRules = [
  'Public matchmaking lobbies only. Private rooms void the entry.',
  'Record or screenshot the final results screen showing your name, placement and eliminations.',
  'Teaming with opponents, AFK farming or exploiting bugs voids results and can ban the account.',
  'Disconnects count as the result at the moment you left.',
];
const h2hRules = [
  'Both players report the result within 30 minutes of the match ending.',
  'Agreed reports settle instantly. Conflicting reports go to a STACKD referee.',
  'If your opponent disconnects while you lead, you win. If you disconnect while you lead, the match is refunded.',
  'Settings must match the competition card (mode, time, difficulty).',
];

// Official store artwork, hot-linked from the publishers' own listings on the App Store (mzstatic), Steam and the
// PlayStation Store. `{w}` is replaced with the width the UI needs, so the CDN returns a right-sized, compressed
// file (WebP from the App Store). Publisher-owned: fine for an internal prototype, needs licensing before launch.
const MZ = 'https://is1-ssl.mzstatic.com/image/thumb/';
const mz = (path) => `${MZ}${path}/{w}x0w.webp`;
const mzIcon = (path) => `${MZ}${path}/{w}x{w}bb.webp`;
const STEAM = (id) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}`;
const steam = (id, pos = {}) => ({ source: 'Steam', logo: true, cover: `${STEAM(id)}/library_600x900.jpg`, banner: `${STEAM(id)}/capsule_616x353.jpg`, hero: `${STEAM(id)}/library_hero.jpg`, icon: `${STEAM(id)}/library_600x900.jpg`, ...pos });

export const MEDIA_REV = 2;
export const MEDIA = {
  codm: { source: 'App Store', icon: mzIcon('Purple211/v4/bc/66/35/bc6635d9-68f4-6ab5-969f-92e034a50cfa/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png'), banner: mz('PurpleSource221/v4/73/22/c5/7322c584-de7b-a2bb-f332-2f7ab4f88d73/Roach_2688x1242_Final.jpg'), cover: mz('PurpleSource221/v4/5e/68/51/5e6851c6-77b2-a1cb-fbbe-c2fa7900ffe7/Sniper_Games_2688x1242.jpg'), coverPos: '58% 50%' },
  pubgm: { source: 'App Store', icon: mzIcon('Purple211/v4/6d/98/24/6d9824dd-f75f-9bd6-221e-33324fedecb2/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png'), banner: mz('PurpleSource221/v4/12/44/11/124411bd-7435-f006-e5b7-6203ada37693/0.jpg'), cover: mz('PurpleSource211/v4/b0/e3/13/b0e3138d-3a72-291c-1d5e-ee7cb015601e/2.jpg'), coverPos: '62% 50%' },
  freefire: { source: 'App Store', icon: mzIcon('Purple211/v4/ef/16/6b/ef166bba-1d69-85f5-ed84-6b7c6e73b55c/AppIcon-1788350393-0-0-1x_U007emarketing-0-8-0-85-220.png'), banner: mz('PurpleSource211/v4/36/fe/fe/36fefef8-723e-7917-d6a8-8e7cfb84dc8b/FFO_01_2208x1242.jpg'), cover: mz('PurpleSource211/v4/79/e5/44/79e544fa-7874-5f9f-f6a0-0b860fbace90/FFO_02_2208x1242.jpg'), coverPos: '70% 50%' },
  mlbb: { source: 'App Store', icon: mzIcon('Purple211/v4/78/e1/77/78e177f1-e174-dfe5-bbd9-f4f2988d9b89/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png'), banner: mz('PurpleSource221/v4/5a/7a/b7/5a7ab7fd-8d22-7263-c33b-5642618261ac/1_EN.jpg'), cover: mz('PurpleSource211/v4/79/24/97/792497f9-e47b-fafb-cd77-3b3ed31a39cd/3-en.jpg'), coverPos: '25% 50%' },
  efootball: { source: 'App Store', icon: mzIcon('Purple211/v4/50/8c/42/508c42ee-b55e-375a-63dc-158374da9693/PesMobile-0-0-1x_U007emarketing-0-8-0-85-220.png'), banner: mz('PurpleSource221/v4/8b/26/b7/8b26b755-3c46-a189-7bc6-c76378704d46/2868x1320_USA_02.jpg'), cover: mz('PurpleSource211/v4/95/cd/97/95cd97bd-e73f-0240-6e69-3587055f87b5/2868x1320_USA_04.jpg'), coverPos: '78% 50%' },
  fcm: { source: 'App Store', icon: mzIcon('Purple211/v4/41/d1/84/41d18457-ec03-6812-f0a7-8a83686c6009/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png'), banner: mz('PurpleSource221/v4/71/f3/21/71f321d5-4867-f6d2-7f72-003a0118dfd5/1_RMAvsATM_Mbappe_2688_1242_EN.jpg'), cover: mz('PurpleSource221/v4/71/f3/21/71f321d5-4867-f6d2-7f72-003a0118dfd5/1_RMAvsATM_Mbappe_2688_1242_EN.jpg'), coverPos: '40% 50%' },
  pool8: { source: 'App Store', icon: mzIcon('Purple211/v4/fc/32/a9/fc32a999-5384-bdef-1af1-2f7aa5259871/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png'), banner: mz('PurpleSource221/v4/b8/99/e1/b899e1fb-d391-44d2-c9c7-2fa076e14fd1/9ccfe621-dd6e-4885-aa43-c120b3dfede7_8BP-SCR-Screenshots_iPhoneXSMax_004.jpg'), cover: mz('PurpleSource221/v4/b8/99/e1/b899e1fb-d391-44d2-c9c7-2fa076e14fd1/9ccfe621-dd6e-4885-aa43-c120b3dfede7_8BP-SCR-Screenshots_iPhoneXSMax_004.jpg'), coverPos: '50% 50%' },
  asphalt: { source: 'App Store', icon: mzIcon('Purple211/v4/02/7f/68/027f6829-5efb-e396-7857-c6dab8208bbd/AppIcon-0-0-1x_U007epad-0-1-85-220.png'), banner: mz('PurpleSource221/v4/98/aa/36/98aa3682-504b-ceb1-609f-f081dabd965c/ALU_25082_S_RebrandedScreenshots_E_01_2796x1290_LS_EN.jpg'), cover: mz('PurpleSource221/v4/d1/e5/1f/d1e51feb-0681-ef41-3348-8d383b39b576/ALU_25082_S_RebrandedScreenshots_C_01_2796x1290_LS_EN.jpg'), coverPos: '45% 50%' },
  brawl: { source: 'App Store', icon: mzIcon('Purple221/v4/ee/a7/00/eea700d3-6cec-f063-b86c-3dfd251c95bd/AppIcon-0-0-1x_U007epad-0-1-85-220.png'), banner: mz('PurpleSource211/v4/59/dc/85/59dc8534-df6a-1c19-2c4c-033e1343b92d/4716c361-ce1b-4af0-b456-29fd61e1cf0c_Fast_Paced_3v3_Battles_2208x1242_EN.png'), cover: mz('PurpleSource211/v4/59/dc/85/59dc8534-df6a-1c19-2c4c-033e1343b92d/4716c361-ce1b-4af0-b456-29fd61e1cf0c_Fast_Paced_3v3_Battles_2208x1242_EN.png'), coverPos: '18% 50%' },
  clashroyale: { source: 'App Store', icon: mzIcon('Purple211/v4/82/ed/07/82ed0701-46d9-219c-cea6-73ad9f64774b/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png'), banner: mz('PurpleSource221/v4/99/ac/fa/99acfa7b-2d92-b49f-05ea-ab35a1992371/CR_enUS_FullGameplay_V1_SS1_iOS_6.9_1320X2868.jpg'), cover: mz('PurpleSource221/v4/99/ac/fa/99acfa7b-2d92-b49f-05ea-ab35a1992371/CR_enUS_FullGameplay_V1_SS1_iOS_6.9_1320X2868.jpg'), coverPos: '50% 30%', bannerPos: '50% 38%' },
  fortnite: { source: 'App Store', icon: mzIcon('Purple211/v4/6d/86/93/6d8693b7-1679-8e21-7e38-cf8505ad2f5d/AppIcon-0-0-1x_U007epad-0-1-85-220.png'), banner: mz('PurpleSource211/v4/bd/a7/e3/bda7e31a-7341-2cf8-d54f-880aec955620/EN_FNBR_42-00_C7S4_Shot_1_iOS_AppStore_Screenshot_iPhone_2868x1320.jpg'), cover: mz('PurpleSource221/v4/c1/27/16/c12716b1-67cd-f26b-2bfa-b96d652f528b/EN_FNBR_42-00_C7S4_Shot_5_iOS_AppStore_Screenshot_iPhone_2868x1320.jpg'), coverPos: '75% 50%' },
  warzone: steam(1962663),
  apex: steam(1172470),
  tekken8: steam(1778820),
  mk1: steam(1971870),
  rocketleague: steam(252950),
  eafc: {
    source: 'Steam',
    cover: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3405690/1d3064a6f7b0f8e1c00fa8a70307a67e95c090ea/ss_1d3064a6f7b0f8e1c00fa8a70307a67e95c090ea.600x338.jpg',
    banner: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3405690/1d3064a6f7b0f8e1c00fa8a70307a67e95c090ea/ss_1d3064a6f7b0f8e1c00fa8a70307a67e95c090ea.600x338.jpg',
    hero: `${STEAM(3405690)}/library_hero.jpg`,
    icon: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3405690/2d96aa1b06e453cd62dae9029d412f19e61932c3/header.jpg',
    coverPos: '50% 50%',
  },
  gt7: {
    source: 'PlayStation Store',
    cover: 'https://image.api.playstation.com/vulcan/ap/rnd/202109/1321/y7iyxoBE8VKotN89QCFhLgLM.png?w={w}',
    banner: 'https://image.api.playstation.com/vulcan/ap/rnd/202109/1321/y7iyxoBE8VKotN89QCFhLgLM.png?w={w}',
    icon: 'https://image.api.playstation.com/vulcan/ap/rnd/202109/1321/y7iyxoBE8VKotN89QCFhLgLM.png?w={w}',
    coverPos: '45% 50%',
  },
};

export const GAMES = [
  {
    id: 'codm', name: 'Call of Duty: Mobile', short: 'CODM', developer: 'Activision · TiMi Studio', category: 'battle_royale',
    platforms: ['mobile'], popularity: 99, featured: true,
    description: 'Battle royale drops and quick 1v1 gunfights. The biggest competitive mobile shooter on STACKD.',
    art: { bg: '#1E2620', fg: '#C9D86B', motif: 'zone' },
    modes: [
      { id: 'br_solo', name: 'BR Solo', teamSize: 1, maxPlayers: 100, types: ['challenge', 'pool', 'tournament'], metrics: [M.kills, M.placement(100), M.headshots] },
      { id: 'br_squad', name: 'BR Squads', teamSize: 4, maxPlayers: 100, types: ['pool', 'tournament'], metrics: [M.kills, M.placement(25)] },
      { id: 'gunfight', name: 'Gunfight 1v1', teamSize: 1, maxPlayers: 2, types: ['h2h', 'tournament'], metrics: [M.rounds, M.roundsLost] },
      { id: 'snd', name: 'Search & Destroy 5v5', teamSize: 5, maxPlayers: 10, types: ['h2h', 'tournament'], metrics: [M.rounds, M.roundsLost, M.kills] },
    ],
    eligibility: ['Account level 30 or higher', 'At least 10 hours played in the mode', 'Public lobbies only'],
    verification: ['screenshot', 'video', 'manual'], rules: brRules,
  },
  {
    id: 'pubgm', name: 'PUBG Mobile', short: 'PUBGM', developer: 'Krafton · Lightspeed', category: 'battle_royale',
    platforms: ['mobile'], popularity: 96, featured: true,
    description: 'Classic 100-player drops on Erangel and Miramar. Solo challenges and squad pools.',
    art: { bg: '#2A2116', fg: '#F0B54A', motif: 'zone' },
    modes: [
      { id: 'classic_solo', name: 'Classic Solo', teamSize: 1, maxPlayers: 100, types: ['challenge', 'pool', 'tournament'], metrics: [M.elims, M.placement(100), M.survival] },
      { id: 'classic_squad', name: 'Classic Squads', teamSize: 4, maxPlayers: 100, types: ['pool', 'tournament'], metrics: [M.elims, M.placement(25)] },
      { id: 'tdm', name: 'TDM 1v1', teamSize: 1, maxPlayers: 2, types: ['h2h'], metrics: [M.kills, { ...M.kills, key: 'deaths', label: 'Deaths' }] },
    ],
    eligibility: ['Tier Platinum or higher in ranked', 'Public lobbies only'],
    verification: ['screenshot', 'video', 'manual'], rules: brRules,
  },
  {
    id: 'freefire', name: 'Free Fire', short: 'FF', developer: 'Garena', category: 'battle_royale',
    platforms: ['mobile'], popularity: 94, featured: true,
    description: 'Ten-minute battle royale built for phones. Fast drops, fast payouts.',
    art: { bg: '#2B1A14', fg: '#FF8A3D', motif: 'zone' },
    modes: [
      { id: 'br_solo', name: 'BR Solo', teamSize: 1, maxPlayers: 50, types: ['challenge', 'pool'], metrics: [M.kills, M.placement(50)] },
      { id: 'br_squad', name: 'BR Squads', teamSize: 4, maxPlayers: 48, types: ['pool', 'tournament'], metrics: [M.kills, M.placement(12)] },
      { id: 'cs', name: 'Clash Squad 4v4', teamSize: 4, maxPlayers: 8, types: ['h2h', 'tournament'], metrics: [M.rounds, M.roundsLost] },
    ],
    eligibility: ['Account level 40 or higher', 'Public lobbies only'],
    verification: ['screenshot', 'manual'], rules: brRules,
  },
  {
    id: 'mlbb', name: 'Mobile Legends: Bang Bang', short: 'MLBB', developer: 'Moonton', category: 'moba',
    platforms: ['mobile'], popularity: 90, featured: true,
    description: '5v5 lane battles. Team tournaments and ranked challenges.',
    art: { bg: '#161D33', fg: '#7FA2FF', motif: 'lanes' },
    modes: [
      { id: 'ranked', name: 'Ranked 5v5', teamSize: 1, maxPlayers: 1, types: ['challenge'], metrics: [M.won, M.kda, M.mvp] },
      { id: 'custom5', name: 'Team 5v5', teamSize: 5, maxPlayers: 10, types: ['h2h', 'tournament'], metrics: [M.won, M.kills] },
      { id: 'brawl1', name: '1v1 Mid', teamSize: 1, maxPlayers: 2, types: ['h2h'], metrics: [M.won, M.kills] },
    ],
    eligibility: ['Rank Epic or higher', 'Account older than 30 days'],
    verification: ['screenshot', 'manual'], rules: h2hRules,
  },
  {
    id: 'efootball', name: 'eFootball', short: 'eFootball', developer: 'Konami', category: 'sports',
    platforms: ['mobile', 'pc', 'playstation', 'xbox'], popularity: 93, featured: true,
    description: 'Friend matches and divisions. The 1v1 that settles every argument.',
    art: { bg: '#11261E', fg: '#5BE3A1', motif: 'pitch' },
    modes: [
      { id: 'h2h', name: '1v1 Friend Match', teamSize: 1, maxPlayers: 2, types: ['h2h', 'tournament'], metrics: [M.goals, M.conceded] },
      { id: 'division', name: 'Division Match', teamSize: 1, maxPlayers: 1, types: ['challenge'], metrics: [M.won, M.goals, M.conceded] },
    ],
    eligibility: ['Division 5 or higher', '6-minute halves, no extra time'],
    verification: ['screenshot', 'video', 'manual'], rules: h2hRules,
  },
  {
    id: 'fcm', name: 'EA SPORTS FC Mobile', short: 'FC Mobile', developer: 'Electronic Arts', category: 'sports',
    platforms: ['mobile'], popularity: 88,
    description: 'H2H and VS Attack on your phone.',
    art: { bg: '#14202A', fg: '#62D2FF', motif: 'pitch' },
    modes: [
      { id: 'h2h', name: 'H2H', teamSize: 1, maxPlayers: 2, types: ['h2h', 'tournament'], metrics: [M.goals, M.conceded] },
      { id: 'vsa', name: 'VS Attack', teamSize: 1, maxPlayers: 1, types: ['challenge'], metrics: [M.won, M.goals] },
    ],
    eligibility: ['Team OVR 90 or higher'],
    verification: ['screenshot', 'manual'], rules: h2hRules,
  },
  {
    id: 'pool8', name: '8 Ball Pool', short: '8 Ball', developer: 'Miniclip', category: 'casual',
    platforms: ['mobile'], popularity: 84,
    description: 'One table, one shot to run the rack.',
    art: { bg: '#0F2420', fg: '#3FD0A0', motif: 'rack' },
    modes: [
      { id: 'h2h', name: '1v1 Table', teamSize: 1, maxPlayers: 2, types: ['h2h', 'tournament'], metrics: [M.won, M.balls] },
      { id: 'ranked', name: 'Ranked Table', teamSize: 1, maxPlayers: 1, types: ['challenge'], metrics: [M.won, M.balls] },
    ],
    eligibility: ['Level 50 or higher'],
    verification: ['screenshot', 'manual'], rules: h2hRules,
  },
  {
    id: 'asphalt', name: 'Asphalt Legends', short: 'Asphalt', developer: 'Gameloft', category: 'racing',
    platforms: ['mobile', 'pc', 'xbox'], popularity: 78,
    description: 'Eight-car sprints and time-trial challenges.',
    art: { bg: '#25161C', fg: '#FF5C7A', motif: 'speed' },
    modes: [
      { id: 'mp', name: 'Multiplayer Race', teamSize: 1, maxPlayers: 8, types: ['challenge', 'pool', 'tournament'], metrics: [M.position(8)] },
      { id: 'duel', name: 'Duel', teamSize: 1, maxPlayers: 2, types: ['h2h'], metrics: [M.position(2)] },
    ],
    eligibility: ['Multiplayer league Silver or higher'],
    verification: ['screenshot', 'manual'], rules: h2hRules,
  },
  {
    id: 'brawl', name: 'Brawl Stars', short: 'Brawl', developer: 'Supercell', category: 'arena',
    platforms: ['mobile'], popularity: 86,
    description: '3v3 brawls and showdown. Short matches, big streaks.',
    art: { bg: '#231A33', fg: '#FFC93D', motif: 'burst' },
    modes: [
      { id: 'showdown', name: 'Solo Showdown', teamSize: 1, maxPlayers: 10, types: ['challenge', 'pool'], metrics: [M.position(10), M.kills] },
      { id: 'gemgrab', name: 'Gem Grab 3v3', teamSize: 3, maxPlayers: 6, types: ['h2h', 'tournament'], metrics: [M.won] },
    ],
    eligibility: ['10,000 trophies or more'],
    verification: ['screenshot', 'manual'], rules: h2hRules,
  },
  {
    id: 'clashroyale', name: 'Clash Royale', short: 'Clash', developer: 'Supercell', category: 'strategy',
    platforms: ['mobile'], popularity: 87,
    description: 'Three-minute duels. Read the elixir, take the crowns.',
    art: { bg: '#1A1F33', fg: '#8FB8FF', motif: 'tiles' },
    modes: [
      { id: 'duel', name: '1v1 Battle', teamSize: 1, maxPlayers: 2, types: ['h2h', 'tournament', 'challenge'], metrics: [M.won, M.crowns] },
    ],
    eligibility: ['Arena 12 or higher', 'Tournament standard levels'],
    verification: ['screenshot', 'manual'], rules: h2hRules,
  },
  {
    id: 'fortnite', name: 'Fortnite', short: 'Fortnite', developer: 'Epic Games', category: 'battle_royale',
    platforms: ['pc', 'playstation', 'xbox', 'mobile'], popularity: 92, featured: true,
    description: 'Build or Zero Build. Victory royales, elimination challenges and creative 1v1s.',
    art: { bg: '#1B1833', fg: '#B69CFF', motif: 'zone' },
    modes: [
      { id: 'zb_solo', name: 'Zero Build Solo', teamSize: 1, maxPlayers: 100, types: ['challenge', 'pool', 'tournament'], metrics: [M.elims, M.placement(100)] },
      { id: 'boxfight', name: 'Box Fight 1v1', teamSize: 1, maxPlayers: 2, types: ['h2h', 'tournament'], metrics: [M.rounds, M.roundsLost] },
    ],
    eligibility: ['250+ matches played', 'Public lobbies only'],
    verification: ['screenshot', 'video', 'manual'], rules: brRules,
  },
  {
    id: 'warzone', name: 'Call of Duty: Warzone', short: 'Warzone', developer: 'Activision', category: 'battle_royale',
    platforms: ['pc', 'playstation', 'xbox'], popularity: 89,
    description: 'Big-map battle royale on PC and console. Kill races and squad pools.',
    art: { bg: '#1C2229', fg: '#9FB4C7', motif: 'zone' },
    modes: [
      { id: 'br_quads', name: 'BR Quads', teamSize: 4, maxPlayers: 150, types: ['pool', 'tournament'], metrics: [M.kills, M.placement(38)] },
      { id: 'resurgence', name: 'Resurgence Solo', teamSize: 1, maxPlayers: 52, types: ['challenge', 'pool'], metrics: [M.kills, M.placement(52), M.damage] },
    ],
    eligibility: ['Account level 55 or higher', 'Gold rank or higher for ranked'],
    verification: ['video', 'screenshot', 'manual'], rules: brRules,
  },
  {
    id: 'apex', name: 'Apex Legends', short: 'Apex', developer: 'Respawn', category: 'battle_royale',
    platforms: ['pc', 'playstation', 'xbox'], popularity: 82,
    description: 'Trios battle royale with damage and kill challenges.',
    art: { bg: '#2A1617', fg: '#FF6A55', motif: 'zone' },
    modes: [
      { id: 'trios', name: 'Trios', teamSize: 3, maxPlayers: 60, types: ['pool', 'tournament'], metrics: [M.kills, M.placement(20), M.damage] },
      { id: 'solo_ch', name: 'Trios (solo challenge)', teamSize: 1, maxPlayers: 1, types: ['challenge'], metrics: [M.kills, M.placement(20), M.damage] },
    ],
    eligibility: ['Account level 30 or higher', 'Gold 1 or higher'],
    verification: ['video', 'screenshot', 'manual'], rules: brRules,
  },
  {
    id: 'eafc', name: 'EA SPORTS FC 26', short: 'FC 26', developer: 'Electronic Arts', category: 'sports',
    platforms: ['pc', 'playstation', 'xbox'], popularity: 91, featured: true,
    description: 'Ultimate Team and Kick-Off head-to-heads on console and PC.',
    art: { bg: '#0F2233', fg: '#5BC8FF', motif: 'pitch' },
    modes: [
      { id: 'kickoff', name: 'Online Kick-Off 1v1', teamSize: 1, maxPlayers: 2, types: ['h2h', 'tournament'], metrics: [M.goals, M.conceded] },
      { id: 'rivals', name: 'Division Rivals', teamSize: 1, maxPlayers: 1, types: ['challenge'], metrics: [M.won, M.goals, M.conceded] },
    ],
    eligibility: ['Division 4 or higher for Rivals'],
    verification: ['screenshot', 'video', 'manual'], rules: h2hRules,
  },
  {
    id: 'tekken8', name: 'Tekken 8', short: 'Tekken', developer: 'Bandai Namco', category: 'fighting',
    platforms: ['pc', 'playstation', 'xbox'], popularity: 80,
    description: 'First to three. No excuses.',
    art: { bg: '#2B1416', fg: '#FF4F5E', motif: 'slash' },
    modes: [
      { id: 'ft3', name: 'Ranked FT3', teamSize: 1, maxPlayers: 2, types: ['h2h', 'tournament', 'challenge'], metrics: [M.rounds, M.roundsLost, M.won] },
    ],
    eligibility: ['Rank Garyu or higher'],
    verification: ['video', 'screenshot', 'manual'], rules: h2hRules,
  },
  {
    id: 'mk1', name: 'Mortal Kombat 1', short: 'MK1', developer: 'NetherRealm', category: 'fighting',
    platforms: ['pc', 'playstation', 'xbox'], popularity: 74,
    description: 'Kombat league sets and flawless-round challenges.',
    art: { bg: '#2A2012', fg: '#F2B33D', motif: 'slash' },
    modes: [
      { id: 'ft3', name: 'Kombat League FT3', teamSize: 1, maxPlayers: 2, types: ['h2h', 'tournament', 'challenge'], metrics: [M.rounds, M.roundsLost, M.won] },
    ],
    eligibility: ['Kombat League rank Gold or higher'],
    verification: ['video', 'screenshot', 'manual'], rules: h2hRules,
  },
  {
    id: 'gt7', name: 'Gran Turismo 7', short: 'GT7', developer: 'Polyphony Digital', category: 'racing',
    platforms: ['playstation'], popularity: 70,
    description: 'Sport mode races and lobby duels.',
    art: { bg: '#161F2B', fg: '#6EC1FF', motif: 'speed' },
    modes: [
      { id: 'sport', name: 'Sport Mode Race', teamSize: 1, maxPlayers: 16, types: ['challenge', 'tournament'], metrics: [M.position(16)] },
      { id: 'duel', name: 'Lobby Duel', teamSize: 1, maxPlayers: 2, types: ['h2h'], metrics: [M.position(2)] },
    ],
    eligibility: ['Driver rating B or higher', 'Sportsmanship rating S'],
    verification: ['video', 'screenshot', 'manual'], rules: h2hRules,
  },
  {
    id: 'rocketleague', name: 'Rocket League', short: 'RL', developer: 'Psyonix', category: 'sports',
    platforms: ['pc', 'playstation', 'xbox'], popularity: 76,
    description: 'Car soccer. 1v1 duels and 3v3 team cups.',
    art: { bg: '#141B33', fg: '#FF9A3D', motif: 'pitch' },
    modes: [
      { id: 'duel', name: '1v1 Duel', teamSize: 1, maxPlayers: 2, types: ['h2h', 'tournament'], metrics: [M.goals, M.conceded] },
      { id: 'standard', name: '3v3 Standard', teamSize: 3, maxPlayers: 6, types: ['h2h', 'tournament'], metrics: [M.goals, M.conceded] },
    ],
    eligibility: ['Level 20 or higher', 'Rank Platinum or higher'],
    verification: ['screenshot', 'manual'], rules: h2hRules,
  },
].map((g) => ({
  slug: g.id,
  regions: ALL,
  status: 'active',
  realMoney: true,
  featured: false,
  competitionTypes: [...new Set(g.modes.flatMap((m) => m.types))],
  media: MEDIA[g.id] ? { ...MEDIA[g.id], rev: MEDIA_REV } : null,
  ...g,
}));

// Bet-on-yourself challenge templates. baseProb is the typical hit rate for a mid-rated player.
const T = (gameId, modeId, title, metric, op, target, baseProb) => ({ id: `${gameId}.${modeId}.${metric}.${op}${target}`, gameId, modeId, title, metric, op, target, baseProb });

export const CHALLENGE_TEMPLATES = [
  T('codm', 'br_solo', 'Get 10 kills', 'kills', 'gte', 10, 0.3),
  T('codm', 'br_solo', 'Finish top 10', 'placement', 'lte', 10, 0.45),
  T('codm', 'br_solo', 'Win the match', 'placement', 'lte', 1, 0.08),
  T('codm', 'br_solo', 'Get 5 headshots', 'headshots', 'gte', 5, 0.3),
  T('pubgm', 'classic_solo', 'Finish top 5', 'placement', 'lte', 5, 0.3),
  T('pubgm', 'classic_solo', 'Get 8 eliminations', 'kills', 'gte', 8, 0.24),
  T('pubgm', 'classic_solo', 'Survive 20 minutes', 'survival', 'gte', 20, 0.45),
  T('pubgm', 'classic_solo', 'Winner winner', 'placement', 'lte', 1, 0.06),
  T('freefire', 'br_solo', 'Booyah', 'placement', 'lte', 1, 0.08),
  T('freefire', 'br_solo', 'Get 6 kills', 'kills', 'gte', 6, 0.3),
  T('freefire', 'br_solo', 'Finish top 3', 'placement', 'lte', 3, 0.25),
  T('mlbb', 'ranked', 'Win the match', 'won', 'eq', 1, 0.5),
  T('mlbb', 'ranked', 'KDA of 5 or more', 'kda', 'gte', 5, 0.3),
  T('mlbb', 'ranked', 'Take match MVP', 'mvp', 'eq', 1, 0.2),
  T('efootball', 'division', 'Win the match', 'won', 'eq', 1, 0.45),
  T('efootball', 'division', 'Score 3 goals', 'goals', 'gte', 3, 0.3),
  T('efootball', 'division', 'Keep a clean sheet', 'conceded', 'lte', 0, 0.28),
  T('fcm', 'vsa', 'Win the match', 'won', 'eq', 1, 0.47),
  T('fcm', 'vsa', 'Score 4 goals', 'goals', 'gte', 4, 0.3),
  T('pool8', 'ranked', 'Win the table', 'won', 'eq', 1, 0.48),
  T('pool8', 'ranked', 'Win with 4+ balls potted', 'balls', 'gte', 4, 0.35),
  T('asphalt', 'mp', 'Finish on the podium', 'placement', 'lte', 3, 0.42),
  T('asphalt', 'mp', 'Take 1st place', 'placement', 'lte', 1, 0.18),
  T('brawl', 'showdown', 'Finish top 3', 'placement', 'lte', 3, 0.35),
  T('brawl', 'showdown', 'Win showdown', 'placement', 'lte', 1, 0.14),
  T('clashroyale', 'duel', 'Win the battle', 'won', 'eq', 1, 0.48),
  T('clashroyale', 'duel', 'Win with 3 crowns', 'crowns', 'gte', 3, 0.2),
  T('fortnite', 'zb_solo', 'Victory royale', 'placement', 'lte', 1, 0.05),
  T('fortnite', 'zb_solo', 'Get 5 eliminations', 'kills', 'gte', 5, 0.3),
  T('fortnite', 'zb_solo', 'Finish top 10', 'placement', 'lte', 10, 0.38),
  T('warzone', 'resurgence', 'Get 8 kills', 'kills', 'gte', 8, 0.3),
  T('warzone', 'resurgence', 'Finish top 5', 'placement', 'lte', 5, 0.28),
  T('warzone', 'resurgence', 'Deal 2,500 damage', 'damage', 'gte', 2500, 0.3),
  T('apex', 'solo_ch', 'Deal 1,500 damage', 'damage', 'gte', 1500, 0.32),
  T('apex', 'solo_ch', 'Get 5 kills', 'kills', 'gte', 5, 0.3),
  T('apex', 'solo_ch', 'Become champion', 'placement', 'lte', 1, 0.07),
  T('eafc', 'rivals', 'Win the match', 'won', 'eq', 1, 0.45),
  T('eafc', 'rivals', 'Score 3 goals', 'goals', 'gte', 3, 0.3),
  T('tekken8', 'ft3', 'Win the set', 'won', 'eq', 1, 0.48),
  T('tekken8', 'ft3', 'Win without dropping a round', 'roundsLost', 'lte', 0, 0.15),
  T('mk1', 'ft3', 'Win the set', 'won', 'eq', 1, 0.48),
  T('mk1', 'ft3', 'Win 3-1 or better', 'roundsLost', 'lte', 1, 0.3),
  T('gt7', 'sport', 'Finish on the podium', 'placement', 'lte', 3, 0.3),
  T('gt7', 'sport', 'Win the race', 'placement', 'lte', 1, 0.12),
];
