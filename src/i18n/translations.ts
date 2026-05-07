export type Lang = 'en' | 'fr';

const T = {
  en: {
    // StartScreen
    tagline:    '> PORTFOLIO.EXE LOADED',
    subtitle:   'A SHOOTABLE RÉSUMÉ',
    story:      "Welcome, recruiter. You've entered the arena of my career. Each glowing pillar holds a piece of who I am — shoot them to read. Find the ABOUT, EXPERIENCE, EDUCATION, CONTACT, LOCATION, and PROJECTS monoliths. Drones may try to stop you. Don't let them.",
    ctrlMove:   'Move',   ctrlLook:   'Look',  ctrlShoot: 'Shoot',
    ctrlSprint: 'Sprint', ctrlJump:   'Jump',  ctrlPause: 'Pause',
    enterArena: '▶ ENTER ARENA',

    // HUD
    radar:      '// RADAR //',
    found:      'FOUND',
    drones:     'DRONES',
    objAll:     '// ALL STATIONS DISCOVERED //',
    objGoal:    (n: number) => `DISCOVER ALL ${n} STATIONS`,
    vitalsOk:   'VITALS · NOMINAL',
    vitalsCrit: 'VITALS · CRITICAL',
    weapon:     'PLASMA RIFLE MK-IV',

    // Pause menu
    paused:    '// SYSTEM PAUSED //',
    continue_: '▶  CONTINUE',
    restart:   '↺  RESTART',
    lobby:     '⌂  RETURN TO LOBBY',
    language:  'LANGUAGE',
    soundOn:   '🔊 SOUND ON',
    soundOff:  '🔇 SOUND OFF',

    // Death screen
    missionFailed:  '// MISSION FAILED //',
    allExplored:    (n: number) => `ALL ${n} STATIONS EXPLORED`,
    explored:       (a: number, b: number) => `YOU EXPLORED ${a} / ${b} STATIONS`,
    unexplored:     'UNEXPLORED :',
    returningLobby: 'RETURNING TO LOBBY...',

    // Click-to-re-engage
    clickPlay: 'CLICK TO RE-ENGAGE',

    // StationModal labels
    coreStack:    '// CORE STACK',
    contactIntro: 'Channels are open. Pick your protocol — fastest response on email.',
    viewOnMap:    '📍 VIEW ON MAP',
    locationNote: (name: string) => `Currently operating from ${name}. Available remote, hybrid, or on-site.`,
    openMap:      '📍 OPEN MAP',
    selectedWorks:'// SELECTED WORKS',
    viewProject:  '🔗 VIEW PROJECT',

    // MapModal labels
    geoRecon:    '// GEOSPATIAL.RECON //',
    locationInfo:'// LOCATION INFO //',
    noIntel:     'No additional intel available for this location.',
    mapStyle:    '// MAP STYLE //',
    actions:     '// ACTIONS //',
    openGoogle:  '🗺 OPEN IN GOOGLE MAPS',
    openOSM:     '🌐 OPEN IN OPENSTREETMAP',
    getDir:      '🧭 GET DIRECTIONS',
    recenter:    '⊕ RECENTER MAP',
    liveFeed:    '// LIVE FEED //',

    // Loader
    initArena:  'INITIALIZING ARENA...',

    // MapModal extras
    pinLabel:   '// PIN //',
    mapDark:    'DARK',
    mapLiberty: 'LIBERTY',
    mapLight:   'LIGHT',

    // Resume
    downloadResume: '⬇ DOWNLOAD PDF',

    // AI voice guide
    aiError:       'Connection error — try again.',
    voiceHint:     '[HOLD T] ASK AI',
    voiceListening:'🎤 LISTENING...',
    voiceThinking: '⏳ THINKING...',
    ariaWelcome:   "Welcome to the arena, recruiter. I'm ARIA — your tactical guide for this mission. Six data stations are scattered across the city. Shoot each pillar to unlock the intel inside. Watch your health, keep moving, and try not to get shot. Hold T to talk to me anytime. Good luck — you'll need it.",

    // Tactical map
    tacMap:    'TACTICAL MAP',
    tacBack:   'BACK',
    tacStation: { found: 'Station discovered', unknown: 'Not yet found' },
    tacDrone:   { label: 'HOSTILE DRONE', sub: 'Active threat' },
    tacHealth:  { label: 'HEALTH PACK', ready: 'Available', cd: 'Recharging...' },

    // Toasts
    toastStation: (title: string): [string, string] => ['STATION UNLOCKED', title],
    toastAllDone: ['ALL STATIONS DISCOVERED', 'Mission complete — explore freely'] as [string, string],
    toastRespawn: ['RESPAWNED', 'BACK IN THE ARENA'] as [string, string],
    toastHealth:  ['HEALTH PACK', '+40 HP'] as [string, string],
  },

  fr: {
    tagline:    '> PORTFOLIO.EXE CHARGÉ',
    subtitle:   'UN CV À ABATTRE',
    story:      "Bienvenue, recruteur. Vous êtes entré dans l'arène de ma carrière. Chaque pilier lumineux renferme une partie de qui je suis — tirez dessus pour lire. Trouvez les monolithes À PROPOS, EXPÉRIENCE, FORMATION, CONTACT, LOCALISATION et PROJETS. Des drones vont tenter de vous arrêter. Ne les laissez pas faire.",
    ctrlMove:   'Déplacer', ctrlLook:  'Regarder', ctrlShoot: 'Tirer',
    ctrlSprint: 'Sprint',   ctrlJump:  'Sauter',   ctrlPause: 'Pause',
    enterArena: "▶ ENTRER DANS L'ARÈNE",

    radar:      '// RADAR //',
    found:      'TROUVÉ',
    drones:     'DRONES',
    objAll:     '// TOUTES LES STATIONS DÉCOUVERTES //',
    objGoal:    (n: number) => `DÉCOUVRIR LES ${n} STATIONS`,
    vitalsOk:   'SIGNES VITAUX · NORMAUX',
    vitalsCrit: 'SIGNES VITAUX · CRITIQUES',
    weapon:     'PLASMA RIFLE MK-IV',

    paused:    '// SYSTÈME EN PAUSE //',
    continue_: '▶  CONTINUER',
    restart:   '↺  RECOMMENCER',
    lobby:     '⌂  RETOUR AU LOBBY',
    language:  'LANGUE',
    soundOn:   '🔊 SON ACTIVÉ',
    soundOff:  '🔇 SON DÉSACTIVÉ',

    missionFailed:  '// MISSION ÉCHOUÉE //',
    allExplored:    (n: number) => `${n} STATIONS EXPLORÉES`,
    explored:       (a: number, b: number) => `VOUS AVEZ EXPLORÉ ${a} / ${b} STATIONS`,
    unexplored:     'NON EXPLORÉES :',
    returningLobby: 'RETOUR AU LOBBY...',

    clickPlay: 'CLIQUER POUR REPRENDRE',

    coreStack:    '// COMPÉTENCES CLÉS',
    contactIntro: 'Les canaux sont ouverts. Choisissez votre protocole — réponse la plus rapide par e-mail.',
    viewOnMap:    '📍 VOIR SUR LA CARTE',
    locationNote: (name: string) => `Actuellement basé à ${name}. Disponible en télétravail, hybride ou sur site.`,
    openMap:      '📍 OUVRIR LA CARTE',
    selectedWorks:'// TRAVAUX SÉLECTIONNÉS',
    viewProject:  '🔗 VOIR LE PROJET',

    geoRecon:    '// RECONNAISSANCE GÉOSPATIALE //',
    locationInfo:'// INFO LOCALISATION //',
    noIntel:     'Aucune information supplémentaire disponible pour ce lieu.',
    mapStyle:    '// STYLE DE CARTE //',
    actions:     '// ACTIONS //',
    openGoogle:  '🗺 OUVRIR DANS GOOGLE MAPS',
    openOSM:     '🌐 OUVRIR DANS OPENSTREETMAP',
    getDir:      '🧭 OBTENIR UN ITINÉRAIRE',
    recenter:    '⊕ RECENTRER LA CARTE',
    liveFeed:    '// FLUX EN DIRECT //',

    // Loader
    initArena:  "INITIALISATION DE L'ARÈNE...",

    // MapModal extras
    pinLabel:   '// MARQUEUR //',
    mapDark:    'SOMBRE',
    mapLiberty: 'LIBERTY',
    mapLight:   'CLAIR',

    // Resume
    downloadResume: '⬇ TÉLÉCHARGER PDF',

    // AI voice guide
    aiError:       'Erreur de connexion — réessayez.',
    voiceHint:     '[TENIR T] DEMANDER',
    voiceListening:'🎤 EN ÉCOUTE...',
    voiceThinking: '⏳ TRAITEMENT...',
    ariaWelcome:   "Bienvenue dans l'arène, recruteur. Je suis ARIA — votre guide tactique pour cette mission. Six stations de données sont dispersées dans la ville. Tirez sur chaque pilier pour accéder aux informations. Surveillez votre santé, restez en mouvement, et essayez de ne pas vous faire toucher. Maintenez T pour me parler. Bonne chance — vous en aurez besoin.",

    // Tactical map
    tacMap:    'CARTE TACTIQUE',
    tacBack:   'RETOUR',
    tacStation: { found: 'Station découverte', unknown: 'Non trouvée' },
    tacDrone:   { label: 'DRONE HOSTILE', sub: 'Menace active' },
    tacHealth:  { label: 'KIT DE SOIN', ready: 'Disponible', cd: 'Recharge...' },

    toastStation: (title: string): [string, string] => ['STATION DÉVERROUILLÉE', title],
    toastAllDone: ['TOUTES LES STATIONS DÉCOUVERTES', 'Mission accomplie — explorez librement'] as [string, string],
    toastRespawn: ['RÉAPPARU', 'DE RETOUR DANS L\'ARÈNE'] as [string, string],
    toastHealth:  ['KIT DE SOIN', '+40 PV'] as [string, string],
  },
} as const;

export type Translations = typeof T.en;
export { T };
