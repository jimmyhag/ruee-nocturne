export interface Enemy {
  alive: boolean;
  id: number; // identifiant unique (les indices bougent au compactage)
  type: number;
  r: number;
  x: number;
  z: number;
  px: number; // position au step précédent (interpolation du rendu)
  pz: number;
  hp: number;
  max: number;
  kx: number; // vitesse de recul
  kz: number;
  face: number;
  flash: number;
  lastBlade: number;
  spd: number;
  dmgMul: number;
  bob: number;
}

export interface Projectile {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  px: number;
  pz: number;
  vx: number;
  vz: number;
  life: number;
  age: number;
  dmg: number;
  pierce: number;
  // ennemis déjà touchés (petit tableau fixe, suffisant pour pierce ≤ 3)
  hit0: number;
  hit1: number;
  hit2: number;
}

export interface Gem {
  alive: boolean;
  x: number;
  z: number;
  v: number;
  mag: boolean;
  s: number;
  age: number; // s depuis l'apparition (rendu : pop 0 → 1,3 → 1)
}

/** Source d'un coup (Ev.Hit, champ x2) : couleur des particules et du son côté rendu. */
export const enum HitSrc {
  Orbe = 0,
  Aura,
  Lames,
  Foudre,
}

export const enum Ev {
  Hit = 1,
  Kill,
  BossKill,
  Shoot,
  Jump,
  Land,
  Dash,
  Pickup,
  LevelUp,
  PlayerHurt,
  Wave,
  BossSpawn,
  Bolt, // éclair : (x,y,z) → (x2,y2,z2)
  AuraPulse,
  Death,
  Evolve,
}

export interface GameEvent {
  type: Ev;
  x: number;
  y: number;
  z: number;
  x2: number; // Hit : source (HitSrc) · Bolt : point d'arrivée
  y2: number; // Hit : direction du recul (x) · Bolt : point d'arrivée
  z2: number; // Hit : direction du recul (z) · Bolt : point d'arrivée
  v: number; // valeur (dégâts, xp, type d'ennemi…)
}

export interface Input {
  mx: number; // [-1,1]
  mz: number;
  jump: boolean; // front montant géré par la plateforme
  dash: boolean;
  pick: number; // -1 ou index de carte choisie (mode levelup)
}

export const enum Mode {
  Play = 0,
  LevelUp = 1,
  Dead = 2,
}

export type WeaponKey = 'orbe' | 'aura' | 'lames' | 'foudre';
export type PassiveKey = 'vitesse' | 'coeur' | 'regen' | 'aimant' | 'force' | 'cadence';

export interface Card {
  kind: 'w' | 's' | 'heal';
  key: WeaponKey | PassiveKey | '';
  lv: number;
}

export interface Player {
  x: number;
  z: number;
  y: number;
  px: number;
  pz: number;
  py: number;
  vx: number;
  vz: number;
  vy: number;
  onGround: boolean;
  hp: number;
  maxHp: number;
  regen: number;
  speed: number;
  magnet: number;
  dmgMul: number;
  cdMul: number;
  level: number;
  xp: number;
  need: number;
  dirX: number;
  dirZ: number;
  dashT: number;
  dashCd: number;
  invul: number;
  walk: number;
  recoil: number;
}
