// Toutes les constantes de gameplay. Chaque ligne dit pourquoi.
// Unités : mètres (u), secondes, PV.

import type { EnemyKey, TomeKey, WeaponKey } from './types';
import { Trait } from './types';

export const STEP = 1 / 60; // pas fixe de la simulation

export const PLAYER = {
  hp: 100, // un run « nu » (dégâts ×0,95, milieu de partie raide) doit tomber vers 6 min (80/0,85 : 4:42 ; 95/0,95 : 5:27) ; la Vitalité (boutique) rend 3 PV par palier
  dmgMul: 0.95, // phase 8 : dégâts de base sous 1, la Puissance (boutique) apporte +2 % par palier (×1,11 au max)
  speed: 6.2 / 1.15, // u/s de base (Bûcheron, Sorcière) ; l'Éclaireuse ×1,15 = 6,2 est la référence de l'équilibrage (fuit un Spectre 2,7, pas un Dard 4,6)
  radius: 0.45,
  magnet: 3.8, // rayon de collecte initial : l'Orbe tue à distance, les gemmes doivent venir au joueur
  jumpVel: 9.5, // ~1.7 u de hauteur, passe au-dessus d'une Brute
  gravity: 26,
  airborneSafeY: 0.9, // au-dessus, les ennemis au sol ne touchent plus
  dashTime: 0.2, // Éclaireuse (référence) ; les autres personnages ont un dash plus long (CHARACTERS)
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
  shots: 128, // crachats ennemis (12 Cracheurs × 2,2 s de vie / 2,5 s de période) + éruptions et anneaux (phase 11)
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

// plateaux (phase 11, PLAN §3.4) : disques de roche surélevés que l'on monte d'un saut (jumpVel 9,5 ⇒ ~1,7 u > h)
// Les ennemis au sol butent au pied ; Volants, crachats, zones et Faucheur passent : un répit, pas un abri.
export const PLATEAUX = {
  n: 14,
  rMin: 2.5,
  rMax: 4,
  h: 1.4,
  edgeTol: 0.2, // en l'air à y ≥ h − edgeTol, on passe le bord et on atterrit dessus
  minDist: 18, // entre deux centres
  minFromCenter: 24, // le départ reste une clairière ouverte, comme les lacs et les bois (à 12 u : +5 points de morts avant 3 min, le bot se fait coincer au pied)
};

// dangers à esquiver par le mouvement (phase 11, PLAN §3.1) : le saut et le dash servent à autre chose qu'à fuir
export const HAZARDS = {
  eruption: {
    after: 150, // première éruption à 2:30 : le joueur a appris à bouger (à 2:00 : morts avant 3 min 13 % → 22 %)
    period0: 9, // entre deux éruptions à 2:30…
    period1: 4, // …et à `at` (15:00) puis constant
    at: 900,
    r: 1.6,
    telegraph: 0.8, // fenêtre de saut utile : en l'air ≥ 0,9 u entre 0,11 et 0,62 s après l'impulsion ⇒ sauter à mi-télégraphe
    track: 7, // u/s : la fissure suit le joueur (6,2 u/s en marchant) ; seuls le saut et le dash (×3,2) l'esquivent
    dmg: 13, // × dmgScale (×1,27 à 2:30 ⇒ 17 PV ; 34 PV à 15:00) ; phase 12 : 15 → 13, les éruptions faisaient 16 % des morts d'un personnage complet (porte ≤ 15 %)
    launch: 6, // vitesse verticale donnée au joueur touché : projeté, lisible
  },
  ring: {
    first: 3, // s après l'apparition du Gardien
    period: 6, // phase 2 : /2
    speed: 9, // u/s
    width: 0.8, // épaisseur de l'onde
    maxR: 14,
    dmg: 14, // × dmgScale ; une fois par onde
  },
  charge: {
    first: 2.5, // s après l'apparition d'une Brute élite
    range: 9, // charge seulement si le joueur est à moins de 9 u
    telegraph: 0.6, // ligne au sol : le dash (invulnérable 0,32 s) la traverse, un pas de côté suffit aussi
    dist: 7,
    speed: 16,
    recover: 0.7, // à l'arrêt après la charge : fenêtre de punition
    period: 5,
    dmg: 16, // × dmgScale, en un coup (le contact normal continue par ailleurs)
    invul: 0.5, // invulnérabilité après le coup : pas de double peine avec le contact
  },
};

export const XP = {
  // needFor(lv) = 5 + 2·lv + 0,15·lv²  → lv1:7, lv5:18, lv10:40, lv20:105, lv40:325 (phase 12 : ≈ 3× plus de cartes qu'avant,
  // ≈ 35 à 10 min, une carte toutes les ~15 s : la montée est longue et faite de petites lignes ; avant : 5 + 4·lv + 0,6·lv²)
  needFor: (lv: number) => Math.floor(5 + lv * 2 + lv * lv * 0.15),
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
  // phase 8 : milieu de partie plus raide à partir de 7:00 (midFrom). Avant, entre 6 et 15 min plus personne ne mourait :
  // la survie sautait de 5 à 15 min au moindre palier de boutique ; la puissance doit se traduire en minutes, pas en falaise.
  // Le surcroît est plafonné à 15:00 (midTo) : au-delà, la courbe d'origine reprend, le Faucheur reste atteignable.
  midFrom: 420,
  midTo: 900,
  rate: (t: number) =>
    Math.min(20, 0.7 + t / 240 + Math.max(0, t - 600) / 260 + Math.max(0, Math.min(t, 900) - 420) / 120), // ≈ 11,2/s à 20:00
  hpScale: (t: number) => 1 + t / 190 + Math.max(0, Math.min(t, 900) - 420) / 110 + Math.max(0, t - 900) / 120, // phase 12 : milieu plus doux (t/150 et /70 avant), fin de partie plus raide (+2,5 à 20:00) : 16 % de runs maxés allaient au bout // ×2 à 2:30, ×9,3 à 12:00, ×15,9 à 20:00 (/100 : le plateau 7–12 min subsistait, 4 paliers collaient au maxé)
  dmgScale: (t: number) => 1 + t / 560 + Math.max(0, t - 900) / 300, // phase 12 : ×4,1 à 20:00 (t/450 avant) ; après 15:00 les dégâts montent plus vite : une build qui a explosé n'est plus limitée par les PV ennemis
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
  key: EnemyKey;
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
  { key: 'spectre', hp: 10, speed: 2.7, r: 0.55, dmg: 12, xp: 1, y: 0.62, kbMul: 1, boss: false },
  { key: 'dard', hp: 7, speed: 4.6, r: 0.45, dmg: 6, xp: 1, y: 0.55, kbMul: 1, boss: false },
  { key: 'brute', hp: 80, speed: 1.8, r: 1.0, dmg: 24, xp: 4, y: 1.0, kbMul: 1 / 3, boss: false },
  { key: 'gardien', hp: 900, speed: 2.3, r: 2.0, dmg: 40, xp: 40, y: 2.2, kbMul: 0, boss: true },
  { key: 'volant', hp: 12, speed: 3.4, r: 0.5, dmg: 16, xp: 1, y: 1.6, kbMul: 0.5, boss: false },
  { key: 'cracheur', hp: 30, speed: 2.4, r: 0.6, dmg: 8, xp: 2, y: 0.8, kbMul: 0.7, boss: false },
  { key: 'essaim', hp: 1600, speed: 1.6, r: 2.4, dmg: 30, xp: 40, y: 2.4, kbMul: 0, boss: true },
  { key: 'colosse', hp: 2600, speed: 1.2, r: 2.6, dmg: 30, xp: 40, y: 2.6, kbMul: 0, boss: true }, // lent : ses cercles sont la menace, pas le contact (15:00 → 16:00 perdait 14 points)
  { key: 'faucheur', hp: 40000, speed: 7.1, r: 1.4, dmg: 150, xp: 100, y: 2.0, kbMul: 0, boss: true }, // 7,1 = joueur × 1,15 : il rattrape toujours
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
  shotDmg: 11, // phase 12 : 14 → 11, les crachats faisaient 57 % des morts d'un personnage complet (× dmgScale : 29 PV à 15:00)
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
  swarmN2: 8, // phase 12 : 10 → 8, l'Essaim-mère faisait une falaise à 10:00 pour un personnage complet
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

// lignes de stats (phase 12, PLAN §3.1) : une carte d'arme ou de tome apporte 1 à 3 lignes, chacune petite ; la montée
// est longue (100 améliorations par arme ou tome, jamais atteintes en 20 min). `pct` : base × (1 + step)^n ; `add` : base + step · n.
export interface StatLine {
  stat: string; // clé de stat (arme : clé de WEAPON_BASE ; tome : effet joueur, voir applyTomeLine)
  step: number; // par ligne
  kind: 'pct' | 'add';
  max?: number; // nombre de lignes maximum (plafond de la stat)
  weight: number; // poids de tirage (les lignes « rares » comptent 1 contre 3)
}
export const WEAPON_LINES: Record<WeaponKey, StatLine[]> = {
  // le niveau 5 d'avant (≈ ×3 de DPS) se retrouve vers 10–12 améliorations ; au-delà c'est la marge jusqu'à 100
  orbe: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'n', step: 1, kind: 'add', max: 5, weight: 1.5 },
    { stat: 'speed', step: 0.08, kind: 'pct', max: 12, weight: 2 },
    { stat: 'pierce', step: 1, kind: 'add', max: 3, weight: 1 },
  ],
  aura: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'r', step: 0.06, kind: 'pct', max: 20, weight: 3 },
    { stat: 'period', step: -0.05, kind: 'pct', max: 15, weight: 3 },
  ],
  lames: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'n', step: 1, kind: 'add', max: 8, weight: 1.5 },
    { stat: 'r', step: 0.04, kind: 'pct', max: 15, weight: 2 },
    { stat: 'spd', step: 0.06, kind: 'pct', max: 15, weight: 2 },
  ],
  foudre: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'chain', step: 1, kind: 'add', max: 10, weight: 1.5 },
  ],
  boomerang: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'range', step: 0.06, kind: 'pct', max: 12, weight: 2 },
    { stat: 'n', step: 1, kind: 'add', max: 3, weight: 1.5 },
    { stat: 'speed', step: 0.06, kind: 'pct', max: 12, weight: 2 },
  ],
  mines: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'r', step: 0.05, kind: 'pct', max: 15, weight: 2 },
    { stat: 'n', step: 1, kind: 'add', max: 12, weight: 2 },
    { stat: 'chain', step: 1, kind: 'add', max: 1, weight: 1 },
  ],
};
// tomes (remplacent les passifs) : chaque carte tire 1 à 3 lignes dans son tome, l'effet s'applique au joueur (applyTomeLine)
export const TOMES: Record<TomeKey, StatLine[]> = {
  degats: [
    { stat: 'dmg', step: 0.08, kind: 'add', weight: 3 },
    { stat: 'elite', step: 0.08, kind: 'add', weight: 2 },
    { stat: 'kb', step: 0.1, kind: 'add', weight: 2 },
  ],
  cadence: [
    { stat: 'cd', step: 0.04, kind: 'add', max: 18, weight: 3 },
    { stat: 'life', step: 0.06, kind: 'add', weight: 2 },
  ],
  projectiles: [
    { stat: 'proj', step: 1, kind: 'add', max: 3, weight: 1 },
    { stat: 'size', step: 0.06, kind: 'add', weight: 3 },
    { stat: 'pspeed', step: 0.06, kind: 'add', weight: 2 },
  ],
  vitalite: [
    { stat: 'hp', step: 12, kind: 'add', weight: 3 },
    { stat: 'regen', step: 0.4, kind: 'add', weight: 2 },
    { stat: 'armor', step: 0.03, kind: 'add', max: 15, weight: 2 },
  ],
  mouvement: [
    { stat: 'speed', step: 0.05, kind: 'add', weight: 3 },
    { stat: 'dashcd', step: 0.06, kind: 'add', max: 10, weight: 2 },
    { stat: 'dashinvul', step: 0.03, kind: 'add', max: 10, weight: 1 },
  ],
  savoir: [
    { stat: 'xp', step: 0.06, kind: 'add', weight: 3 },
    { stat: 'magnet', step: 0.08, kind: 'add', weight: 2 },
  ],
  chance: [
    { stat: 'luck', step: 0.5, kind: 'add', weight: 3 },
    { stat: 'chestgold', step: 0.2, kind: 'add', weight: 2 },
  ],
  or: [
    { stat: 'gold', step: 0.08, kind: 'add', weight: 3 },
    { stat: 'elitegold', step: 1, kind: 'add', weight: 2 },
  ],
};
export const TOME_KEYS = Object.keys(TOMES) as TomeKey[];
// rareté d'une carte = nombre de lignes : 1 (67 %), 2 (25 %), 3 (8 %) ; chaque point de chance décale vers 2 et 3
export const RARITY = {
  two: 0.25,
  three: 0.08,
  luckTwo: 0.02,
  luckThree: 0.01,
};

// personnages (PLAN §3.5) : stats de départ différentes mais pas meilleures (survivor-design §8).
// Mesure 100 runs average seed 42 : Éclaireuse p50 7:52 ; Bûcheron Lames niv 1 et vitesse 1,0 → 5:11 (30 % de morts < 3 min) ;
// Sorcière à −20 % PV → 10:49 (trop forte). D'où Lames niv 2 + vitesse 1,05 et −30 % PV.
// passifs signature (phase 6, docs/PHASE6-PERSONNAGES.md) : une constante par passif, lue par la sim
export const TRAIT = {
  fendeur: { kbMul: 1.5 }, // Bûcheron : recul des Lames ×1,5
  braise: { perMin: 0.1, max: 0.5 }, // Veilleuse : rayon du Halo +10 %/min, plafonné à +50 % (5:00) ; 8 %/40 % donnait p50 5:26
  rapporteur: { refund: 0.6 }, // Braconnier : un boomerang attrapé rend 60 % de la recharge (50 % et Boomerang 1 : p50 4:47, 25 % de morts)
  trainee: { dashMul: 2, spacing: 0.7, life: 1.5, dps: 8, r: 0.9, period: 0.25, kb: 0.6 }, // Feu follet : dash 2× plus long, feu 1,5 s à 8 PV/s
  dejamorte: { revives: 1, airXpMul: 2 }, // Revenante : une réanimation gratuite, kills en l'air ×2 XP
  marchand: { minCards: 3 }, // Colporteur : jamais de coffre à 1 carte
};

export interface CharacterDef {
  key: CharacterKeyDef; // nom et texte : src/i18n (char.<key>.name / .text)
  weapon: WeaponKey;
  weapon2?: WeaponKey; // seconde arme de départ (Revenante)
  startLines?: Partial<Record<WeaponKey, string[]>>; // lignes d'arme fixes au départ (Bûcheron, Colporteur, Braconnier) : niveau = 1 + lignes
  startTomes?: Partial<Record<TomeKey, string[]>>; // lignes de tome fixes au départ (Colporteur)
  trait: Trait; // passif signature
  speedMul: number;
  hpAdd: number;
  hpMul: number;
  dashTime: number;
  bladeRangeMul: number;
  unlock: string; // identifiant de succès ('' = aucun)
  price: number; // or (0 = pas en vente) ; un personnage est débloqué par son succès OU son achat
}
type CharacterKeyDef =
  | 'eclaireuse'
  | 'bucheron'
  | 'sorciere'
  | 'veilleuse'
  | 'braconnier'
  | 'sapeur'
  | 'feufollet'
  | 'revenante'
  | 'colporteur';
// tenue alternative d'un personnage (phase 7) : prix en or, cosmétique uniquement
export const OUTFIT = { price: 400 };

export const CHARACTERS: CharacterDef[] = [
  // l'Éclaireuse est exactement le joueur de la phase 3 (6,2 u/s, dash 0,2 s) : la porte de phase 3 reste mesurée telle quelle
  { key: 'eclaireuse', weapon: 'orbe', trait: Trait.None, speedMul: 1.15, hpAdd: 0, hpMul: 1, dashTime: PLAYER.dashTime, bladeRangeMul: 1, unlock: '', price: 0 },
  { key: 'bucheron', weapon: 'lames', startLines: { lames: ['n', 'dmg'] }, // phase 10 : Lames 3 (une lame et des dégâts en plus) ; à Lames 2, 3:31 et 41 % de morts < 3 min
    trait: Trait.Fendeur, speedMul: 1.05, hpAdd: 30, hpMul: 1, dashTime: PLAYER.dashTime * 1.3, bladeRangeMul: 1.2, unlock: 'survie10', price: 0 },
  { key: 'sorciere', weapon: 'foudre', trait: Trait.Paratonnerre, speedMul: 1, hpAdd: 0, hpMul: 0.7, dashTime: PLAYER.dashTime * 1.3, bladeRangeMul: 1, unlock: 'kills500', price: 0 },
  // phase 6 : un personnage par arme manquante (Halo, Boomerang, Mines), deux variantes extrêmes, un économe
  { key: 'veilleuse', weapon: 'aura', trait: Trait.Braise, speedMul: 1, hpAdd: 20, hpMul: 1, dashTime: PLAYER.dashTime * 1.3, bladeRangeMul: 1, unlock: '', price: 800 },
  { key: 'braconnier', weapon: 'boomerang', startLines: { boomerang: ['dmg'] }, trait: Trait.Rapporteur, speedMul: 1, hpAdd: 10, hpMul: 1, dashTime: PLAYER.dashTime * 1.3, bladeRangeMul: 1, unlock: '', price: 1200 },
  { key: 'sapeur', weapon: 'mines', trait: Trait.Demolisseur, speedMul: 0.92, hpAdd: 0, hpMul: 0.8, dashTime: PLAYER.dashTime * 1.3, bladeRangeMul: 1, unlock: 'boss1', price: 0 },
  { key: 'feufollet', weapon: 'orbe', trait: Trait.Trainee, speedMul: 1.3, hpAdd: 0, hpMul: 0.6, // phase 10 : 0,5 → 0,6, seul avec l'Orbe il passait sous 4 min (3:51) et 20 % de morts < 3 min
    dashTime: PLAYER.dashTime * TRAIT.trainee.dashMul, bladeRangeMul: 1, unlock: 'intouchable', price: 0 },
  { key: 'revenante', weapon: 'foudre', weapon2: 'aura', trait: Trait.DejaMorte, speedMul: 0.9, hpAdd: 0, hpMul: 0.45, dashTime: PLAYER.dashTime * 1.3, bladeRangeMul: 1, unlock: 'win', price: 0 },
  { key: 'colporteur', weapon: 'lames', startLines: { lames: ['n', 'dmg'] }, // phase 10 : Lames 3 ; à Lames 2, 3:18 et 43 % de morts < 3 min
    startTomes: { chance: ['luck', 'luck'], or: ['gold', 'gold', 'gold'] }, // ≈ Trèfle 1 et Bourse 1 d'avant
    trait: Trait.Marchand, speedMul: 1.03, hpAdd: 15, hpMul: 1, dashTime: PLAYER.dashTime * 1.3, bladeRangeMul: 1, unlock: '', price: 2000 },
];

// boutique permanente (survivor-design §8), PAR PERSONNAGE depuis la phase 8 : 8 lignes, 8 paliers, coût base · growth^palier.
// Un run nu (≈ 6 min, ≈ 700 or) paie 1 à 2 paliers ; un personnage complet ≈ 42 000 or ≈ 30 runs.
export interface ShopLine {
  key: 'hp' | 'dmg' | 'speed' | 'luck' | 'gold' | 'magnet' | 'cd' | 'revive'; // nom et texte : src/i18n (shop.<key>.name / .text)
  per: number; // effet par palier
  tiers: number;
}
export const SHOP = {
  base: 200,
  growth: 1.3, // paliers : 200, 260, 338, 439, 571, 743, 965, 1 255 or (≈ 4 800 par ligne, ≈ 34 000 par personnage)
  lines: [
    // la survie est très sensible à la puissance (hp +40, dmg ×1,2, cd ×0,88 seuls : 5:11 → 16:03) : paliers petits
    { key: 'hp', per: 3, tiers: 8 },
    { key: 'dmg', per: 0.02, tiers: 8 },
    { key: 'speed', per: 0.015, tiers: 8 },
    { key: 'luck', per: 0.4, tiers: 8 }, // +0,4 Trèfle par palier : +3,2 au max (5 paliers de +1 avant)
    { key: 'gold', per: 0.1, tiers: 8 },
    { key: 'magnet', per: 0.1, tiers: 8 },
    { key: 'cd', per: 0.01, tiers: 8 },
    { key: 'revive', per: 1, tiers: 1 }, // une seule réanimation : deux seules valaient 5:11 → 13:18
  ] as ShopLine[],
};
export const REVIVE = {
  // phase 8 (relecture) : à 50 % et 2 s, la Réanimation à 200 or valait +4 min à elle seule (5:29 → 9:33) et sautait la falaise 2–6 min
  hpFrac: 0.25, // on revient à 25 % des PV max
  invul: 1, // s d'invulnérabilité pour sortir de la masse
};

export const WEAPON_MAX = 100; // phase 12 : 100 améliorations par arme (jamais atteint en 20 min : la montée est longue)
export const TOME_MAX = 100;
export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4; // tomes (le nom « passives » reste dans la méta et les emplacements sauvegardés)

// emplacements (phase 10, progression lente) : on part avec 1 arme (celle du personnage) et 2 améliorations ;
// chaque emplacement suivant se débloque par un succès ET de l'or, pour tous les personnages à la fois.
// Les armes et passifs de départ d'un personnage ne comptent pas contre le plafond (identité conservée).
export interface SlotUnlock {
  kind: 'weapon' | 'passive';
  n: number; // numéro de l'emplacement obtenu (2 = 2e arme…)
  ach: string; // succès requis (id dans src/meta/achievements.ts)
  price: number; // or
}
export const SLOTS_START = { weapons: 1, passives: 2 };
export const SLOTS: SlotUnlock[] = [
  // prix ≈ 1,5–2 runs d'or au moment où le succès tombe (relecture phase 10 : l'or par run passe de 170 à 7 000
  // entre le 1er et le 10e run ; à 800 / 1 500 / 3 000 / 5 000 les emplacements coûtaient moins d'un run dès le 3e)
  { kind: 'weapon', n: 2, ach: 'survie3', price: 300 },
  { kind: 'passive', n: 3, ach: 'kills500', price: 2000 },
  { kind: 'weapon', n: 3, ach: 'boss1', price: 4000 },
  { kind: 'passive', n: 4, ach: 'survie10', price: 8000 },
  { kind: 'weapon', n: 4, ach: 'survie15', price: 12000 },
];

export const CHOICE = {
  ownedWeight: 1.6, // favorise la cohérence de build
  newWeight: 1.3, // découverte
  cards: 3,
};
