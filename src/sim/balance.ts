// Toutes les constantes de gameplay. Chaque ligne dit pourquoi.
// Unités : mètres (u), secondes, PV.

export const STEP = 1 / 60; // pas fixe de la simulation

export const PLAYER = {
  hp: 100,
  speed: 6.2, // u/s — assez vite pour fuir un Spectre (2.7) mais pas un Dard (4.6)
  radius: 0.45,
  magnet: 3.8, // rayon de collecte initial : l'Orbe tue à distance, les gemmes doivent venir au joueur
  jumpVel: 9.5, // ~1.7 u de hauteur, passe au-dessus d'une Brute
  gravity: 26,
  airborneSafeY: 0.9, // au-dessus, les ennemis au sol ne touchent plus
  dashTime: 0.2,
  dashCd: 1.1,
  dashMul: 3.2,
  dashInvul: 0.32, // un peu plus long que le dash : marge de sortie
  recoil: 0.14,
};

export const WORLD_HALF = 170; // demi-côté du terrain
export const PLAY_LIMIT = WORLD_HALF - 6;
export const TREE_CELL = 6;
export const GRID_CELL = 2.5; // ≥ plus grand rayon ennemi normal + marge
export const GRID_HALF_CELLS = 80; // grille centrée joueur : 160 cellules × 2.5 = 400 u

export const CAPS = {
  enemies: 520, // perf mobile (PLAN §4.3)
  projectiles: 250,
  shots: 96, // crachats ennemis : 12 Cracheurs × 2,2 s de vie / 2,5 s de période, large
  gems: 900,
  chests: 16, // jamais plus de quelques coffres au sol en pratique (une élite / 40 s)
  events: 1024,
};

// décor : généré par la seed, lu par le rendu via w.obstacles (arbres puis rochers)
export const DECOR = {
  trees: 380,
  woodTrees: 300, // arbres supplémentaires dans les bois denses : couloirs
  rocks: 240,
  lamps: 160,
};

// zones de terrain (PLAN §3.4) : lacs qui ralentissent, bois denses qui canalisent
export const ZONES = {
  lakes: 3,
  lakeRMin: 9,
  lakeRMax: 14,
  lakeSpeed: 0.55, // dans l'eau : joueur et ennemis au sol (Volant et Faucheur ignorent)
  woods: 4,
  woodR: 22,
  minFromCenter: 24, // le départ reste une clairière ouverte
};

export const XP = {
  // needFor(lv) = 5 + 4·lv + 0.6·lv²  → lv1:10, lv5:40, lv10:105, lv20:325
  needFor: (lv: number) => Math.floor(5 + lv * 4 + lv * lv * 0.6),
  gemMergeAbove: 880, // au-delà, les nouvelles gemmes fusionnent avec une existante
  magnetAccel: 45,
  magnetMax: 26,
  pickupRadius: 0.75,
};

// or (phase 4 : boutique) : compté dès maintenant pour donner un sens à la Bourse
export const GOLD = {
  perKill: 1,
  eliteMul: 3,
  bossMul: 20,
  perSecond: 0.1, // bonus de fin = secondes survécues / 10
  bourseMul: 1.25, // Bourse : ×1,25 par niveau
};

export const SPAWN = {
  // ennemis/s : 0.7 au départ, ~2 à 5:00, ~3 à 10:00, ~7 à 15:00, ~11 à 20:00.
  // Calé sur la croissance du DPS d'une build moyenne (≈ kills/s égal au spawn). L'ancienne courbe (6/s à 2:00) noyait tout le monde à 2:30.
  rate: (t: number) => Math.min(20, 0.7 + t / 240 + Math.max(0, t - 600) / 260), // ≈ 7,2/s à 20:00 ; /120 : 15:00–17:00 perdait 17 points de survie ; /200 : fin atteinte 7,5 % sur deux seeds
  hpScale: (t: number) => 1 + t / 150, // ×2 à 2:30, ×9 à 20:00 (t/120 : falaise 3:00–6:00, p50 5:31 en phase 3)
  dmgScale: (t: number) => 1 + t / 450, // ×3,7 à 20:00 ; t/400 : fin atteinte 5–9 % selon la seed, trop près du plancher 8 %
  spdScale: (t: number) => 1 + Math.min(t / 600, 0.35),
  ringMin: 24,
  ringMax: 30, // hors écran (fog à 16–44)
  despawnDist: 50, // au-delà, téléporté devant le joueur
  wavePeriod: 60,
  waveCount: (t: number) => 16 + Math.floor(t / 30), // 18 à 1:00, 36 à 10:00
  waveDardAfter: 420, // avant 7:00 l'anneau est en Spectres : un anneau de Dards à 4:00 coûtait 15 points de survie
  waveDist: 19,
  bossPeriod: 300, // boss à 5:00, 10:00, 15:00 (PLAN §2.3) ; à 2:30 il tuait 70 % des runs du bot
  bossDist: 26,
  reaperAt: 1200, // Faucheur à 20:00 : fin de run forcée (PLAN §2.3)
  initial: 8,
  boredomAfter: 4, // s sans coup donné ni reçu → compensation
  boredomMul: 2,
  boredomFor: 6,
  volantAfter: 180, // le Volant demande de sauter au bon moment : pas avant que le joueur ait une build
  cracheurAfter: 360, // le Cracheur demande de bouger en permanence : milieu de run
  eliteAfter: 120,
  elitePeriod: 40, // une élite (coffre) toutes les 40 s : ~25 coffres par run complet
  // probabilités par type selon le temps
  pick: (t: number, r: number): number => {
    if (t > 360 && r < 0.05) return 5; // Cracheur
    if (t > 180 && r < 0.05 + 0.12 * Math.min(1, (t - 180) / 600)) return 4; // Volant : 5 → 17 % à 13:00
    if (t > 90 && r < 0.08 + t / 3000) return 2; // Brute : 8 % à 1:30, 28 % à 10:00 (t/4000 donnait moins d'XP : p50 8:45 au lieu de 9:34)
    if (t > 40 && r < 0.42) return 1; // Dard
    return 0; // Spectre
  },
};

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  r: number;
  dmg: number; // PV/s au contact
  xp: number;
  y: number; // hauteur de rendu
  kbMul: number; // sensibilité au recul
  boss: boolean;
}
// index = type. 0–2 masse, 3 boss 5:00, 4–5 ennemis de milieu de run, 6–7 boss 10:00 et 15:00, 8 Faucheur.
export const ENEMIES: EnemyDef[] = [
  { name: 'Spectre', hp: 10, speed: 2.7, r: 0.55, dmg: 12, xp: 1, y: 0.62, kbMul: 1, boss: false },
  { name: 'Dard', hp: 7, speed: 4.6, r: 0.45, dmg: 6, xp: 1, y: 0.55, kbMul: 1, boss: false },
  { name: 'Brute', hp: 80, speed: 1.8, r: 1.0, dmg: 24, xp: 4, y: 1.0, kbMul: 1 / 3, boss: false },
  { name: 'Gardien', hp: 900, speed: 2.3, r: 2.0, dmg: 40, xp: 40, y: 2.2, kbMul: 0, boss: true },
  { name: 'Volant', hp: 12, speed: 3.4, r: 0.5, dmg: 16, xp: 1, y: 1.6, kbMul: 0.5, boss: false },
  { name: 'Cracheur', hp: 30, speed: 2.4, r: 0.6, dmg: 8, xp: 2, y: 0.8, kbMul: 0.7, boss: false },
  { name: 'Essaim-mère', hp: 1600, speed: 1.6, r: 2.4, dmg: 30, xp: 40, y: 2.4, kbMul: 0, boss: true },
  { name: 'Colosse', hp: 2600, speed: 1.2, r: 2.6, dmg: 30, xp: 40, y: 2.6, kbMul: 0, boss: true }, // lent : ses cercles sont la menace, pas le contact (15:00 → 16:00 perdait 14 points)
  { name: 'Faucheur', hp: 40000, speed: 7.1, r: 1.4, dmg: 150, xp: 100, y: 2.0, kbMul: 0, boss: true }, // 7,1 = joueur × 1,15 : il rattrape toujours
];
export const DARD_TYPE = 1;
export const BOSS_TYPE = 3; // Gardien (5:00)
export const ELITE_TYPE = 2; // Brute : gerbe, shake et son de kill renforcés
export const VOLANT_TYPE = 4;
export const CRACHEUR_TYPE = 5;
export const SWARM_TYPE = 6; // Essaim-mère (10:00)
export const COLOSSUS_TYPE = 7; // Colosse (15:00)
export const REAPER_TYPE = 8; // Faucheur (20:00)
export const BOSSES = [BOSS_TYPE, SWARM_TYPE, COLOSSUS_TYPE]; // par ordre d'apparition
export const ENEMY_SEPARATION = 3.2;
export const KNOCKBACK_DECAY = 0.004; // facteur par seconde

export const ELITE = {
  hpMul: 6,
  xpMul: 3,
  rMul: 1.25, // un peu plus grosse : lisible dans la masse avec la teinte or
};

export const VOLANT = {
  hover: 1.6, // hauteur de vol : hors de portée du contact
  divePeriod: 2.2, // entre deux plongées
  telegraph: 0.6, // l'ombre grossit avant la plongée
  diveTime: 0.35, // temps au sol (blesse)
  diveRange: 9, // plonge seulement si le joueur est à moins de 9 u
  diveSpeed: 13, // vitesse pendant la plongée
  telegraphSlow: 0.3, // facteur de vitesse pendant le télégraphe
};

export const CRACHEUR = {
  keepMin: 7, // en deçà il recule
  keepMax: 9, // au-delà il approche
  aim: 0.6, // ligne de visée visible 0,6 s (PLAN §3.3)
  period: 2.5,
  shotSpeed: 6, // lent : esquivable en marchant
  shotLife: 2.2,
  shotDmg: 14,
  shotR: 0.4,
  orbit: 0.4, // facteur de vitesse latérale quand il est à bonne distance
  fireMargin: 3, // vise seulement à moins de keepMax + 3 u
};

export const BOSS = {
  chargeRange: 14, // Gardien : charge seulement si le joueur est à moins de 14 u
  chargeTelegraph: 0.8, // Gardien : recul + rugissement avant la charge
  chargeBack: 1.5, // vitesse de recul pendant le télégraphe (u/s)
  chargeSpeed: 10,
  chargeTime: 1.0,
  chargePeriod: 5, // entre deux charges (phase 2 : charge double)
  swarmPeriod: 4, // Essaim-mère : ponte
  swarmN: 6,
  swarmN2: 10,
  swarmDist: 2.5,
  swarmPulse: 0.3, // durée de la pulsation (rendu) à la ponte
  zonePeriod: 4.5, // Colosse : cercles rouges (3,5 s : falaise à 15:00)
  zoneTelegraph: 1,
  zoneR: 2.6,
  zoneN: 3,
  zoneN2: 5,
  zoneSpread: 4.5, // cercles autour de la position du joueur
  zoneDmg: 9, // × dmgScale (×3,5 à 15:00 ⇒ 32) : 35 tuait 100 % des runs à 15:00, 12 en tuait encore 65 %
  phase2At: 0.5, // phase 2 à 50 % PV (survivor-design §7)
};

// armes de phase 3 : comportement (les stats par niveau restent dans weapons/defs.ts)
export const BOOMERANG = {
  rehit: 0.45, // un ennemi n'est touché qu'une fois par passage (aller, puis retour)
  safetyLife: 6, // libéré bien avant par le retour ; sécurité si le joueur fuit plus vite
};
export const MINES = {
  spacing: 1.2, // u parcourus entre deux poses
  life: 14, // une mine jamais déclenchée expire
  triggerR: 1.2, // rayon de déclenchement (l'explosion couvre stats.r)
  armDelay: 0.3, // pas de déclenchement par l'ennemi qui a provoqué la pose
  chainR: 3, // niveau 5 : les mines à 3 u s'amorcent
};

export const CHEST = {
  pickupR: 1.1,
  p3: 0.25, // 1 carte 70 %, 3 cartes 25 %, 5 cartes 5 % (jackpot rare, PLAN §2.3)
  p5: 0.05,
  luckShift: 0.04, // Trèfle : +4 pts par niveau vers 3 et 5 cartes
  bossMin: 3, // coffre de boss : 3 à 5 cartes
  bossMax: 5,
  gold: 10, // or par coffre
};

export const LUCK = {
  extraCardPerPt: 0.06, // Trèfle : +6 % par niveau de proposer 4 cartes (survivor-design §3)
};

// évolutions (survivor-design §5) : ≈ ×2,5 par rapport au niveau 5
export const EVOLVE = {
  nova: { n: 8 }, // salve circulaire de 8 orbes (3 au niveau 5) : ×2,7 mesuré sur un mur de Brutes
  soleil: { rMul: 1.5, dmgMul: 2, healPerKill: 1 },
  tempete: { rMul: 1.5, spdMul: 2, dmgMul: 1.4, hitWindow: 0.2 }, // lames 2× plus vite ⇒ chaque ennemi touché 2× plus souvent (0,4 s → 0,2 s)
  orage: { cdDiv: 2, chainPlus: 2 }, // ×2 de cadence, 2 cibles de plus : ×2,5
};

export const WEAPON_MAX = 5;
export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4;

export const CHOICE = {
  ownedWeight: 1.6, // favorise la cohérence de build
  newWeight: 1.3, // découverte
  evolveWeight: 2.2, // composant d'une évolution en cours
  evolveFrom: 3, // un passif « complète » une évolution dès que l'arme associée est au niveau 3
  cards: 3,
};
