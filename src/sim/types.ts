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
  lastLance: number; // phase 28 : salve de Lance qui l'a touché en dernier
  lanceBits: number; // lances de cette salve qui l'ont déjà touché (un bit par lance : chacune ne touche qu'une fois)
  lastPatins: number; // phase 28 : dernier coup des Patins de braise
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
  // phase 43 : boss — minuteur de la seconde attaque, âge (rage), compteur d'attaque (cercles du sillage posés, salve
  // armée, parité des attaques du Colosse)
  t2: number;
  age: number;
  enraged: boolean;
  combo: number;
  /** Phase 45, Traque : cercles restant dans la salve en cours, et temps avant le prochain cercle ou la prochaine salve. */
  hunt: number;
  huntT: number;
  detour: number; // phase 16 : s restantes où il suit le champ de flux case par case (il butait sur un obstacle)
  stun: number; // phase 19 : s restantes d'immobilisation (Éclat, Collet) ; les boss n'y sont pas sensibles
  slowT: number; // phase 19 : s restantes de ralentissement (Voile, boss pris dans un Collet ou un Éclat)
}

export const enum ProjKind {
  Orbe = 0,
  Boomerang,
  Mine,
  Fire, // traînée de feu du Feu follet : zone au sol qui brûle par impulsions
  Lance, // phase 28 : perce tout, en ligne
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
  Eruption, // phase 11 : cercle sous le joueur, fixe depuis la 1.25.1, puis pic au même endroit — on en sort, le saute ou le dashe
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
  picks: number; // phase 43 : objets garantis (0 : coffre d'élite, un objet un coffre sur ITEM.eliteItemEvery)
}

/** Source d'un coup (Ev.Hit, champ x2) : couleur des particules et du son côté rendu. */
export const enum HitSrc {
  Orbe = 0,
  Aura,
  Lames,
  Foudre,
  Boomerang,
  Mines,
  Faux, // phase 28
  Lance,
  Meteores,
  Fire,
  Thorns, // phase 17 : objet Épines
  Talisman, // phase 17 : objet Talisman orageux
  Spell, // phase 19 : sort de classe
  Patins, // phase 28 : Patins de braise (glissade)
  Horn, // phase 28 : Corne de guerre
  Count, // phase 41 : nombre de sources (taille de w.srcKills)
}

export const enum Ev {
  Hit = 1,
  Kill,
  BossKill,
  Shoot,
  Jump,
  Land,
  Spell, // phase 19 : sort lancé (v = Spell, y2 = 0 au lancement, 1 à l'impact ; (x2, z2) = point visé)
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
  Item, // phase 17 : objet passif obtenu, v = index dans ITEM_KEYS, x2 = 1 s'il a été acheté
  Synergy, // phase 17 : synergie activée, v = index dans SYNERGIES
  MerchantArrive, // phase 17 : l'échoppe apparaît en (x,z)
  MerchantLeave, // phase 17 : l'échoppe repart
  Shockwave, // phase 17 : onde d'atterrissage des Bottes de saut en (x,z), v = rayon
  MapChestOpen, // phase 18 : coffre de carte ouvert en (x,z), v = prix payé
  ShrineDone, // phase 18 : sanctuaire chargé en (x,z) → choix d'un bonus
  BossWarn, // phase 37 : plus qu'une minute pour activer le totem, en (x,z) = totem, v = monde (1..), x2 = type du boss
  SurvivalWarn, // phase 42 : un boss de survie arrive dans STAGE.survival.warn s ; v = type du boss
  SlideStart, // phase 27 : glissade lancée en (x,z), v = vitesse
  SlideEnd, // phase 27 : fin de glissade
  Launch, // phase 27 : envol sur une crête ou saut glissé, v = vitesse horizontale
  Trick, // 1.30.1 : glisse parfaite (glisse au bon moment de la réception), v = vitesse de départ
  RaceStart, // phase 28 : piste chronométrée lancée en (x,z), v = temps alloué, (x2,z2) = arrivée
  RaceWin, // phase 28 : arrivée à temps en (x,z), v = temps mis
  RaceFail, // phase 28 : temps écoulé
  Scythe, // phase 28 : coup de Faux en (x,y,z), v = portée, x2/z2 = direction, y2 = angle de l'arc
  Blade, // phase 32 : coup des Lames centré sur la cible en (x,y,z), v = rayon de la zone, x2/z2 = direction héros → cible
  MeteorWarn, // phase 28 : cercle d'un météore à venir en (x,z), v = rayon, x2 = délai
  MeteorHit, // phase 28 : impact en (x,z), v = rayon
  ShieldBlock, // phase 28 : le Bouclier annule un coup en (x,z)
  ShieldReady, // phase 28 : le Bouclier est de nouveau prêt
  Horn, // phase 28 : onde de la Corne de guerre en (x,z), v = rayon
  Reroll, // phase 31 : cartes de montée de niveau relancées, v = relances restantes
  Heal, // phase 31 : PV rendus par les objets (vol de vie, kills) depuis la dernière annonce, en (x,y,z), v = PV
  PowerDrop, // phase 35 : bonus posé au sol en (x,z), v = Pw
  PowerUp, // phase 35 : bonus ramassé en (x,z), v = Pw, x2 = durée de l'effet (0 : instantané)
  PowerEnd, // phase 35 : effet d'un bonus terminé, v = Pw
  TotemOn, // phase 37 : totem activé en (x,z), v = monde (1..)
  PortalOpen, // phase 37 : boss du totem tué à temps, portail en (x,z), v = monde suivant (1..)
  StageStart, // phase 37 : arrivée dans un nouveau monde (nouvelle carte), v = monde (1..)
  TimeUp, // phase 37 : fin du chrono du monde, v = monde (1..), x2 = 1 si le portail est ouvert
  EndlessStart, // phase 39 : le joueur continue en monde infini
  EndlessWave, // phase 39 : vague de boss du monde infini, v = numéro (1..), x2 = nombre de boss
  BossEnrage, // phase 43 : un boss en vie depuis BOSS.enrage.after s enrage, en (x,y,z), v = type
  MerchantLast, // phase 43 : dernier passage du marchand en monde infini, échoppe en (x,z)
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
  spell: boolean; // phase 19 : sort de classe (remplace le dash)
  slide?: boolean; // phase 27 : glisse (front montant : au sol lance ou relève, en l'air vrille)
  pick: number; // -1 ou index de carte choisie (mode levelup)
}

export const enum Mode {
  Play = 0,
  LevelUp = 1,
  Dead = 2,
  Won = 3, // Faucheur vaincu
  Merchant = 4, // phase 17 : échoppe ouverte, la partie est en pause
}

export type WeaponKey = 'orbe' | 'aura' | 'lames' | 'foudre' | 'boomerang' | 'mines' | 'faux' | 'lance' | 'meteores';
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
  Trainee, // Feu follet : la Comète (son sort) laisse une traînée de feu
  DejaMorte, // Revenante : une réanimation gratuite, XP ×2 en l'air
  Marchand, // Colporteur : les coffres donnent au moins 3 cartes
}
/** Sort de classe (phase 19) : un par personnage, sur le bouton de l'ancien dash ; constantes dans SPELL. */
export const enum Spell {
  Bond = 0, // Éclaireuse : dash, puis salve d'orbes en étoile
  Tourbillon, // Bûcheron : coups tout autour, dégâts subis réduits
  Clignement, // Sorcière : téléportation, éclair en chaîne au départ
  Eclat, // Veilleuse : onde qui repousse et étourdit
  Collet, // Braconnier : filet lancé qui immobilise
  Petard, // Sapeur : explosion sous ses pieds qui le projette en l'air
  Comete, // Feu follet : dash long (la Traînée y pose du feu)
  Voile, // Revenante : forme spectrale, invulnérable et rapide, ralentit ce qu'elle traverse
  Bourse, // Colporteur : bourse lancée qui explose, plus fort avec l'or gardé
}
export type SpellKey = 'bond' | 'tourbillon' | 'clignement' | 'eclat' | 'collet' | 'petard' | 'comete' | 'voile' | 'bourse';
/** Identifiants des ennemis (index = type dans ENEMIES) : clés d'affichage côté UI, la sim ne porte aucun texte. */
export type EnemyKey = 'spectre' | 'dard' | 'brute' | 'gardien' | 'volant' | 'cracheur' | 'essaim' | 'colosse' | 'faucheur' | 'archer' | 'sorcier';

/** Ce que la méta injecte dans la sim à la création du monde (jamais lu depuis le stockage par la sim). */
export interface WorldOptions {
  character?: CharacterKey; // défaut : Éclaireuse
  unlocked?: WeaponKey[]; // armes proposables ; undefined = toutes
  slots?: { weapons: number; passives: number }; // emplacements débloqués (phase 10) ; undefined = plafonds max
  rerolls?: number; // phase 31 : relances de cartes pour la partie ; undefined = RUN_REROLL.base
  bannedItems?: ItemKey[]; // phase 40 : objets jamais proposés (verrouillés ou retirés du tirage) ; undefined = aucun
}
/** Tomes (phase 12) : remplacent les passifs ; chaque carte de tome apporte 1 à 3 lignes de stats de sa famille. */
export type TomeKey = 'degats' | 'cadence' | 'projectiles' | 'vitalite' | 'mouvement' | 'savoir' | 'chance' | 'or';

/** Bonus au sol (phase 35) : ramassés en marchant dessus, effet immédiat ou temporaire. */
export type PowerKey = 'aimant' | 'or' | 'vitesse' | 'gel' | 'rage';
/** Index des bonus dans POWER_KEYS et w.powerT. */
export const enum Pw {
  Aimant = 0,
  Or,
  Vitesse,
  Gel,
  Rage,
}

/** Bonus posé au sol (phase 35). */
export interface Power {
  alive: boolean;
  x: number;
  z: number;
  kind: Pw;
  age: number; // s depuis l'apparition (rendu : pop, clignotement avant de disparaître)
}

/** Objets passifs (phase 17) : une règle de jeu chacun, obtenus dans les coffres et chez le marchand. */
/** Bonus de sanctuaire (phase 18) : permanents pour la partie. */
export type BoonKey = 'hp' | 'dmg' | 'speed' | 'cd' | 'magnet' | 'gold' | 'spell';
export type ItemKey =
  | 'phenix'
  | 'cape'
  | 'lanterne'
  | 'coeur'
  | 'talisman'
  | 'sablier'
  | 'epines'
  | 'bottes'
  | 'oeil'
  | 'aimant'
  | 'fer'
  | 'bourse'
  | 'rune'
  | 'collier'
  | 'patins' // phase 28
  | 'echarpe'
  | 'plume'
  | 'boussole'
  | 'bouclier'
  | 'corne'
  | 'croc' // phase 31
  | 'calice'
  | 'mousse'
  | 'souffle'
  | 'pierre'
  | 'de'
  | 'gant'
  | 'brume'
  | 'sandales'
  | 'amulette'
  | 'ecorce'
  | 'couronne';

/**
 * Carte de montée de niveau : arme ou tome avec `n` lignes (1 à 3, indices s0..s2 dans WEAPON_LINES / TOMES), ou soin.
 * Phase 17, kind 'i' : objet passif (coffre ou marchand) ; lv = rareté (0 commun, 1 rare, 2 épique), n = lv + 1 (cadre),
 * s0 = prix chez le marchand (0 dans un coffre), s1 = 1 si déjà vendu, s2 = exemplaires après l'avoir pris (phase 38 :
 * 1 pour un nouvel objet, 2 et plus pour un cumul).
 */
export interface Card {
  kind: 'w' | 't' | 'heal' | 'i' | 'b'; // 'b' : bonus de sanctuaire (phase 18)
  key: WeaponKey | TomeKey | ItemKey | BoonKey | '';
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
  spellCdMul: number; // phase 19 : tome Mouvement (recharge du sort) et Cape ; phase 22 : Rune, sanctuaire de l'arcane
  spellRefund: number; // phase 22 : Collier d'os, réserve de recharge rendue par les kills (s)
  spellPow: number; // phase 19 : tome Mouvement (puissance du sort : dégâts, rayon, durée)
  xpMul: number;
  chestGoldMul: number;
  eliteGold: number; // or en plus par élite tuée
  crit: number; // phase 23 : chance de critique globale (tome Chance), s'ajoute à celle de l'arme
  critMul: number; // multiplicateur d'un critique (tome Dégâts)
  killHeal: number; // PV par ennemi tué (tome Vitalité)
  lvlHeal: number; // PV soignés à chaque niveau (tome Savoir)
  shopMul: number; // prix du marchand (tome Or)
  revives: number; // réanimations restantes (boutique)
  dashTime: number; // durée du déplacement éclair (Bond, Comète ; 0 pour les autres sorts)
  jumpMul: number; // phase 17 : Bottes de saut
  level: number;
  xp: number;
  need: number;
  dirX: number;
  dirZ: number;
  dashT: number;
  spellCd: number; // s avant de pouvoir relancer le sort
  spellT: number; // s restantes d'un sort qui dure (Tourbillon, Voile, Collet)
  dmgTaken: number; // multiplicateur des dégâts subis (Tourbillon : 0,5 pendant le sort)
  invul: number;
  walk: number;
  recoil: number;
  // phase 27 : glissade, élan et figures
  sliding: boolean;
  slideHeld: boolean; // touche de glisse tenue au pas précédent (seul le front montant compte)
  slideCd: number;
  mvx: number; // vitesse conservée (glissade, saut glissé, envol)
  mvz: number;
  airMom: boolean; // en l'air avec l'élan d'une glissade
  slideJump: boolean; // 1.24.1 : cet élan vient d'un saut (la glissade est annulée : réception debout), pas d'un envol
  airT: number; // temps passé en l'air
  slideBuf: number; // 1.30.1 : s restantes d'un appui de glisse fait en l'air (il servira à la réception)
  jumpBuf: number; // 1.31.2 : s restantes d'un appui de saut fait en l'air (sauté dès la réception)
  coyote: number; // 1.31.2 : s restantes après un envol pendant lesquelles un appui de saut compte encore (saut glissé)
  landGrace: number; // 1.30.1 : s restantes après une réception pendant lesquelles un appui de glisse est parfait
  landMx: number; // élan horizontal au moment de la réception
  landMz: number;
  elanT: number; // s restantes de l'élan gagné par une glisse parfaite
  gPrev: number; // hauteur du sol au pas précédent (altitude absolue en l'air)
  gv: number; // vitesse verticale du sol sous les pieds (u/s, envol sur une crête)
  spd: number; // vitesse au sol lissée (le Faucheur s'y règle)
}
