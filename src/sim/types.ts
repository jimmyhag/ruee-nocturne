export interface Enemy {
  alive: boolean;
  id: number; // identifiant unique (les indices bougent au compactage)
  type: number;
  elite: boolean; // variante dorée : ×6 PV, ×3 XP, lâche un coffre
  r: number;
  x: number;
  z: number;
  px: number; // position au step précédent (interpolation du rendu)
  pz: number;
  y: number; // hauteur (Volant : vol / plongée ; les autres : 0)
  hp: number;
  max: number;
  kx: number; // vitesse de recul
  kz: number;
  face: number;
  flash: number;
  lastBlade: number;
  lastBoom: number; // dernier coup de boomerang (un par passage)
  spd: number;
  dmgMul: number;
  bob: number;
  // scripts (Volant, Cracheur, boss) : état et minuteur, cible mémorisée
  state: number;
  timer: number;
  aim: number; // Cracheur : progression de la visée 0 → 1 (ligne de visée côté rendu)
  tx: number;
  tz: number;
  phase2: boolean; // boss : phase à 50 % PV déclenchée
}

export const enum ProjKind {
  Orbe = 0,
  Boomerang,
  Mine,
  Fire, // traînée de feu du Feu follet : zone au sol qui brûle par impulsions
}

export interface Projectile {
  alive: boolean;
  kind: ProjKind;
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
  ret: boolean; // boomerang : phase de retour
  r: number; // mine : rayon d'explosion ; boomerang : portée
  armed: boolean; // mine : amorcée (explose au prochain step)
}

export const enum ShotKind {
  Spit = 0, // crachat du Cracheur : au sol, lent, esquivable
  Zone, // Colosse : cercle rouge immobile qui explose à la fin de `life`
  Eruption, // phase 11 : fissure qui suit le joueur pendant le télégraphe puis pic sous ses pieds — se saute ou se dashe
  Ring, // phase 11 : anneau de choc du Gardien, rayon qui grandit (`r`), blesse une fois au passage — se saute
  Arrow, // phase 16 : flèche de l'Archer, rapide, en ligne droite, arrêtée par les obstacles ; touche aussi en l'air
  Fireball, // phase 16 : boule de feu du Sorcier, en cloche de (ox, oz) vers (x, z) ; explose à la fin de `life` comme une zone
}

/** Dernière source de dégâts subie par le joueur (statistiques de causes de mort, CLI). */
export const enum HurtSrc {
  Contact = 0,
  Spit,
  Zone,
  Eruption,
  Ring,
  Charge,
  Arrow, // phase 16
  Fire, // phase 16 : boule de feu du Sorcier
}

/** Projectile ennemi : ne touche jamais un joueur en l'air (airborneSafeY). */
export interface Shot {
  alive: boolean;
  kind: ShotKind;
  r: number; // rayon de l'impact
  x: number;
  z: number;
  px: number;
  pz: number;
  vx: number;
  vz: number;
  life: number;
  dmg: number;
  hit: boolean; // anneau : le joueur a déjà été touché par cette onde
  ox: number; // boule de feu : point de départ du vol (rendu de l'arc)
  oz: number;
  t0: number; // boule de feu : durée totale du vol
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

/** Coffre lâché par une élite ou un boss : 1, 3 ou 5 cartes, évolution garantie si disponible. */
export interface Chest {
  alive: boolean;
  x: number;
  z: number;
  age: number;
  boss: boolean; // coffre de boss : 3 à 5 cartes
}

/** Source d'un coup (Ev.Hit, champ x2) : couleur des particules et du son côté rendu. */
export const enum HitSrc {
  Orbe = 0,
  Aura,
  Lames,
  Foudre,
  Boomerang,
  Mines,
  Fire,
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
  BossSpawn, // v = index du boss (1..), x2 = type
  Bolt, // éclair : (x,y,z) → (x2,y2,z2)
  AuraPulse,
  Death,
  Chest, // coffre ramassé : v = nombre de cartes
  Telegraph, // cercle rouge au sol : v = rayon, x2 = durée
  BossRoar, // charge du Gardien : télégraphe
  Spit, // crachat : (x,z) → direction (x2,z2)
  Dive, // Volant : début de plongée
  Throw, // boomerang lancé
  MineBlast, // v = rayon
  ZoneBlast, // Colosse : fin d'un cercle rouge, v = rayon
  Victory, // Faucheur vaincu
  Revive, // réanimation (boutique) : v = réanimations restantes
  Eruption, // phase 11 : pic sorti du sol en (x,y,z), v = rayon
  Ring, // phase 11 : anneau de choc émis par le Gardien, v = rayon final
  Charge, // phase 11 : Brute élite qui arme sa charge : (x,z) → (x2,z2), v = durée du télégraphe
  Arrow, // phase 16 : flèche tirée en (x,y,z), direction (x2,z2)
  Cast, // phase 16 : boule de feu lancée de (x,y,z) vers (x2,z2), v = rayon, y2 = durée du vol
  ShotBlocked, // phase 16 : tir arrêté par un obstacle en (x,y,z), v = ShotKind
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
  Won = 3, // Faucheur vaincu
}

export type WeaponKey = 'orbe' | 'aura' | 'lames' | 'foudre' | 'boomerang' | 'mines';
export type CharacterKey =
  | 'eclaireuse'
  | 'bucheron'
  | 'sorciere'
  | 'veilleuse'
  | 'braconnier'
  | 'sapeur'
  | 'feufollet'
  | 'revenante'
  | 'colporteur';
/** Passif signature d'un personnage (phase 6) : une règle de jeu lue par la sim aux bons endroits, constantes dans TRAIT. */
export const enum Trait {
  None = 0,
  Fendeur, // Bûcheron : les Lames repoussent plus fort
  Paratonnerre, // Sorcière : la Foudre vise d'abord le plus proche
  Braise, // Veilleuse : le Halo grandit avec le temps
  Rapporteur, // Braconnier : un boomerang attrapé rend de la recharge
  Demolisseur, // Sapeur : chaque atterrissage pose une mine
  Trainee, // Feu follet : le dash laisse une traînée de feu
  DejaMorte, // Revenante : une réanimation gratuite, XP ×2 en l'air
  Marchand, // Colporteur : les coffres donnent au moins 3 cartes
}
/** Identifiants des ennemis (index = type dans ENEMIES) : clés d'affichage côté UI, la sim ne porte aucun texte. */
export type EnemyKey = 'spectre' | 'dard' | 'brute' | 'gardien' | 'volant' | 'cracheur' | 'essaim' | 'colosse' | 'faucheur' | 'archer' | 'sorcier';

/** Ce que la méta injecte dans la sim à la création du monde (jamais lu depuis le stockage par la sim). */
export interface WorldOptions {
  character?: CharacterKey; // défaut : Éclaireuse
  upgrades?: number[]; // palier acheté par ligne de boutique (ordre de SHOP.lines), défaut 0
  unlocked?: WeaponKey[]; // armes proposables ; undefined = toutes
  slots?: { weapons: number; passives: number }; // emplacements débloqués (phase 10) ; undefined = plafonds max
}
/** Tomes (phase 12) : remplacent les passifs ; chaque carte de tome apporte 1 à 3 lignes de stats de sa famille. */
export type TomeKey = 'degats' | 'cadence' | 'projectiles' | 'vitalite' | 'mouvement' | 'savoir' | 'chance' | 'or';

/** Carte de montée de niveau : arme ou tome avec `n` lignes (1 à 3, indices s0..s2 dans WEAPON_LINES / TOMES), ou soin. */
export interface Card {
  kind: 'w' | 't' | 'heal';
  key: WeaponKey | TomeKey | '';
  lv: number; // niveau atteint si prise (1 = nouvelle)
  n: number; // nombre de lignes (rareté)
  s0: number;
  s1: number;
  s2: number;
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
  luck: number; // chance : boutique + tome Chance (lignes rares, coffres, 4e carte)
  goldMul: number; // or
  // tomes (phase 12)
  projAdd: number; // projectiles en plus pour toutes les armes (Orbe, Boomerang, Lames, Mines, cibles de la Foudre)
  sizeMul: number; // taille des zones et projectiles
  projSpeedMul: number;
  projLifeMul: number; // durée des projectiles
  eliteDmgMul: number; // dégâts aux élites et boss
  kbMul: number; // recul
  armor: number; // part des dégâts subis annulée (≤ 0,36)
  dashCdMul: number;
  dashInvulAdd: number; // s
  xpMul: number;
  chestGoldMul: number;
  eliteGold: number; // or en plus par élite tuée
  revives: number; // réanimations restantes (boutique)
  dashTime: number; // durée du dash (personnage)
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
