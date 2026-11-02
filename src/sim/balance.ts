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
  gems: 900,
  events: 1024,
};

export const XP = {
  // needFor(lv) = 5 + 4·lv + 0.6·lv²  → lv1:10, lv5:40, lv10:105, lv20:325
  needFor: (lv: number) => Math.floor(5 + lv * 4 + lv * lv * 0.6),
  gemMergeAbove: 880, // au-delà, les nouvelles gemmes fusionnent avec une existante
  magnetAccel: 45,
  magnetMax: 26,
  pickupRadius: 0.75,
};

export const SPAWN = {
  // ennemis/s : 0.7 au départ, ~2 à 5:00, ~3 à 10:00, ~7 à 15:00, ~11 à 20:00.
  // Calé sur la croissance du DPS d'une build moyenne (≈ kills/s égal au spawn). L'ancienne courbe (6/s à 2:00) noyait tout le monde à 2:30.
  rate: (t: number) => Math.min(20, 0.7 + t / 240 + Math.max(0, t - 600) / 120),
  hpScale: (t: number) => 1 + t / 120, // ×2 à 2:00, ×11 à 20:00
  dmgScale: (t: number) => 1 + t / 300, // ×5 à 20:00
  spdScale: (t: number) => 1 + Math.min(t / 600, 0.35),
  ringMin: 24,
  ringMax: 30, // hors écran (fog à 16–44)
  despawnDist: 50, // au-delà, téléporté devant le joueur
  wavePeriod: 60,
  waveCount: (t: number) => 16 + Math.floor(t / 30), // 18 à 1:00, 36 à 10:00
  waveDardAfter: 240, // avant 4:00 l'anneau est en Spectres : un anneau de Dards à 2:00 était une falaise (95 % → 8 % de survie)
  waveDist: 19,
  bossPeriod: 300, // boss à 5:00, 10:00, 15:00 (PLAN §2.3) ; à 2:30 il tuait 70 % des runs du bot
  bossDist: 26,
  initial: 8,
  boredomAfter: 4, // s sans coup donné ni reçu → compensation
  boredomMul: 2,
  boredomFor: 6,
  // probabilités par type selon le temps
  pick: (t: number, r: number): number => {
    if (t > 90 && r < 0.06 + t / 4000) return 2; // Brute
    if (t > 40 && r < 0.38) return 1; // Dard
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
export const ENEMIES: EnemyDef[] = [
  { name: 'Spectre', hp: 10, speed: 2.7, r: 0.55, dmg: 12, xp: 1, y: 0.62, kbMul: 1, boss: false },
  { name: 'Dard', hp: 7, speed: 4.6, r: 0.45, dmg: 6, xp: 1, y: 0.55, kbMul: 1, boss: false },
  { name: 'Brute', hp: 80, speed: 1.8, r: 1.0, dmg: 24, xp: 4, y: 1.0, kbMul: 1 / 3, boss: false },
  { name: 'Gardien', hp: 900, speed: 2.3, r: 2.0, dmg: 40, xp: 40, y: 2.2, kbMul: 0, boss: true },
];
export const BOSS_TYPE = 3;
export const ENEMY_SEPARATION = 3.2;
export const KNOCKBACK_DECAY = 0.004; // facteur par seconde

export const WEAPON_MAX = 5;
export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4;

export const CHOICE = {
  ownedWeight: 1.6, // favorise la cohérence de build
  newWeight: 1.3, // découverte
  cards: 3,
};
