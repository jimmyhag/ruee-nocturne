// Toutes les constantes de gameplay. Chaque ligne dit pourquoi.
// Unités : mètres (u), secondes, PV.

import type { BoonKey, EnemyKey, ItemKey, PowerKey, TomeKey, WeaponKey } from './types';
import { Spell, Trait } from './types';

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
  dashTime: 0.2, // Bond de l'Éclaireuse (phase 19 : le dash n'existe plus que comme sort de deux classes, SPELL)
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
  shots: 192, // crachats, flèches et boules de feu (24 tireurs au plus, phase 16) + éruptions et anneaux (phase 11)
  gems: 900,
  chests: 16, // jamais plus de quelques coffres au sol en pratique (une élite / 40 s)
  powers: 8, // phase 35 : bonus au sol en même temps
  events: 1024,
};

// décor : généré par la seed, lu par le rendu via w.obstacles (arbres puis rochers)
export const DECOR = {
  trees: 200, // phase 16 : 380 → 200, rejetés hors des lieux et espacés de MAP.pass : le terrain se lit
  woodTrees: 300, // tentatives d'arbres dans les bois (espacés de MAP.pass : ≈ 40 par bois)
  rocks: 90, // phase 16 : 240 → 90
  lamps: 160,
};

// relief (phase 27, PLAN §3.4) : des plans nets plutôt que des collines. Plateaux à flancs plans, terrasses, longues
// rampes (pistes de glisse) et combes (demi-tubes). Jamais de marche : toute pente ≤ maxSlope (le champ de flux reste un
// BFS sur les obstacles). La sim garde y = hauteur au-dessus du sol local ; le rendu ajoute le sol.
export const TERRAIN = {
  cell: 2, // u : grille de hauteurs (interpolation bilinéaire)
  bank: 0.5, // pente des flancs (plans nets, ≈ 27°)
  plateaus: 18, // plateaux (phase 28 : 22 → 18, place aux grandes pistes) (rectangles arrondis orientés)…
  plateauMin: 9, // …demi-côtés de 9 à 20 u
  plateauMax: 20,
  levels: [2.5, 4, 5.5], // hauteurs des sommets, par paliers
  terrace: 0.4, // part des plateaux qui portent une terrasse…
  terraceUp: 2, // …2 u plus haut
  rampLen: [22, 34], // rampes : longueur (pente ≈ hauteur / longueur ≈ 0,1–0,25)…
  rampHalf: [4, 6], // …demi-largeur
  combes: 6, // combes : tranchées en ligne brisée (2 segments)…
  combeLen: [26, 46], // …longueur d'un segment
  combeHalf: [3, 5], // …demi-largeur du fond plat
  combeDepth: [1.6, 2.6], // …profondeur sous le sol de base
  peak: 7.5, // plus haut sommet d'un plateau (5,5 + terrasse) ; les montagnes des pistes montent plus haut
  // phase 28 : vraies pentes à rider. Grandes pistes : une montagne d'où part une longue descente droite, ponctuée de
  // bosses (on décolle en glissade), finie par un tremplin ; tremplins isolés sur le plat
  pistes: 4, // grandes pistes (tentatives : 3 ou 4 tiennent sur une carte)
  mountain: [9, 11], // hauteur du sommet d'où part une piste
  mountainHalf: [8, 11], // demi-côté du sommet
  pisteLen: [50, 78], // longueur de la descente (pente ≈ 0,12–0,22)
  pisteHalf: [6, 8], // demi-largeur
  bumpEvery: 12, // u entre deux bosses…
  bumpH: 0.8, // …hauteur d'une bosse…
  bumpLen: 2.5, // …demi-longueur (pente de la bosse 0,32, plus celle de la piste : ≤ 0,55)
  kickers: 6, // tremplins isolés (en plus de ceux des pistes)
  kickLen: 5, // tremplin : montée sur 5 u…
  kickH: 2.2, // …jusqu'à 2,2 u (pente 0,44), puis chute au flanc maximal
  kickHalf: 4, // demi-largeur d'un tremplin
  kickReach: 10, // u autour du pied d'un tremplin tenus libres (arbres, lieux)
  kickRun: 12, // tremplin au pied d'une rampe : emprise au sol testée (plate à ±0,3 u)…
  kickFlat: 0.3, // …écart de hauteur toléré sur cette emprise
  startFlat: 22, // clairière de départ plate (à 0)
  lakeDepth: 0.8, // fond plat des lacs sous la berge
  placeR: 0.85, // lieux construits posés à plat sur ce rayon (× empreinte), raccord à la pente des flancs
  maxSlope: 0.55, // pente maximale (≈ 29°), imposée après coup
};
// glissade (phase 27, PLAN §3.4) : en ligne droite, élan gagné en descente, perdu en montée et sur le plat ; un appui
// relève ; saut glissé, envol
// sur les crêtes, vrille en l'air (élan à la réception). Sur le plat, la glisse ne fait guère mieux que la marche.
export const SLIDE = {
  startMul: 1.35, // vitesse de départ ≥ marche × 1,35…
  maxMul: 2.6, // …plafond × marche
  grav: 30, // u/s² par unité de pente (rampe à 0,2 : +6 − frottement ; flanc à 0,5 : +15)
  friction: 3.2, // u/s² (sur le plat : 1,35 → 0,85 × marche en ≈ 0,85 s)
  lakeFriction: 14, // dans l'eau, la glisse cale
  endMul: 0.85, // sous marche × 0,85, la glissade s'arrête
  cd: 0.4, // s avant la glissade suivante
  airControl: 0.3, // part de la vitesse de marche que l'entrée ajoute en l'air après un saut glissé
  // 1.31.3 (Jimmy) : la glissade reste collée au sol dans les collines, les pentes et sur les crêtes (on saute quand on
  // veut, comme sur le plat) ; seul le bord d'un tremplin fait décoller : la pente y chute d'au moins 0,15 d'un pas à
  // l'autre, à moins de kickLip u du bord, en allant dans le sens du tremplin. Avant (1.31.2 : toute crête ; avant :
  // chaque arête de la grille de 2 u), les petits décollages mangeaient les appuis de saut et cassaient les pistes
  launchSlope: 0.15,
  kickLip: 2.5,
  launchMin: 1.2, // …à au moins marche × 1,2 (la marche en descente plafonne à 1,15)
  launchPop: 2.5, // u/s vers le haut à l'envol
  // 1.30.1 (Jimmy) : plus de vrille. Glisse au bon moment de la réception : appui dans les 0,25 s avant de toucher le
  // sol, ou dans les 0,12 s après ; on repart en glissade avec l'élan du vol (glisse parfaite)
  landPre: 0.25,
  landPost: 0.12,
  elanMul: 1.2, // glisse parfaite : vitesse × 1,2…
  elanTime: 1.5, // …pendant 1,5 s
  reaperMul: 1.1, // le Faucheur va toujours au moins 1,1 × la vitesse lissée du joueur (il rattrape toujours)
  startInput: 0.3, // entrée minimale (0–1) pour lancer une glissade
  spdSmooth: 2, // lissage de la vitesse du joueur lue par le Faucheur (1/s : ≈ 0,5 s)
  // 1.31.2 : tolérance du saut. Juste après un envol (pas un saut), l'appui compte encore comme saut glissé ; en l'air,
  // un appui fait juste avant de toucher le sol saute à la réception
  coyote: 0.12,
  jumpBuf: 0.15,
  teleport: 3, // u : un saut de sol plus grand en un pas est un déplacement forcé (test, réapparition), sans physique
};

// découverte de la carte (phase 27) : cases de 4 u révélées autour du joueur (minicarte, grande carte, écran de fin)
export const DISCOVER = {
  cell: 4,
  radius: 26,
  period: 0.25, // s entre deux mises à jour
};

// pistes chronométrées (phase 28) : passer l'arche du haut, atteindre celle du bas à temps (en glissant, pas en
// marchant) → un coffre d'objet ; une fois par piste
export const RACE = {
  r: 4.5, // rayon d'une arche (départ et arrivée)
  startDown: 2, // u : arche de départ un peu en aval du sommet de la piste
  refSpeed: 6.2 * 1.6, // u/s : temps alloué = longueur / cette vitesse (marche de l'Éclaireuse × 1,6 ; la glisse tient, la marche non)
  rearm: 8, // u : après un échec, s'éloigner du départ pour réarmer
};

export const SLOPE = {
  k: 1.1, // vitesse × (1 − k · pente dans le sens de la marche) : montée plus lente, descente plus rapide…
  min: 0.75, // …bornée
  max: 1.15,
};

// points d'intérêt (phase 18, PLAN §3.6) : coffres posés sur la carte (payés avec l'or de la partie, prix croissant) et
// sanctuaires (rester dedans pour gagner un bonus permanent) ; repérés de loin par une colonne de lumière
export const MAPCHEST = {
  count: 30, // phase 27 : 20 → 30 (carte plus remplie)
  spacing: 20, // u entre deux coffres
  fromStart: 32, // aucun dans la clairière de départ
  r: 1.2, // rester dans ce rayon…
  hold: 0.6, // …ce temps (s) pour ouvrir : on n'ouvre rien par accident, même règle au clavier et au doigt
  price: 40, // or, premier coffre…
  growth: 0.35, // …+35 % par coffre ouvert…
  timeScale: 250, // …et × (1 + t / 250) : ×2 à 4:10, ×3 à 8:20 (l'or gagné croît avec le temps ; /400 : 23 % de l'or dépensé en maxé)
  placeShare: 0.3, // part des coffres posés dans les lieux construits…
  glideShare: 0.25, // …au pied des rampes et au fond des combes (phase 27) ; campements en plus ; le reste sur les hauteurs
};
export const SHRINE = {
  count: 14, // phase 27 : 10 → 14
  spacing: 30,
  fromStart: 40,
  r: 3, // rayon du cercle
  charge: 4, // s à rester dedans
  decay: 1.5, // la jauge redescend à cette vitesse (×) hors du cercle
  offers: 3,
};
export const BOON_KEYS: BoonKey[] = ['hp', 'dmg', 'speed', 'cd', 'magnet', 'gold', 'spell'];
export const BOON = { hp: 12, dmg: 0.08, speed: 0.06, cd: 0.06, magnet: 0.25, gold: 0.2, spell: 0.12 }; // spell : phase 22, recharge du sort
// respiration avant un boss (phase 18) : bannière d'annonce, puis le spawn redescend le temps de se placer
export const BOSS_WARN = { lead: 15, lull: 10, lullMul: 0.6 };

// zones de terrain (PLAN §3.4) : lacs qui ralentissent, bois denses qui canalisent
export const ZONES = {
  lakes: 3,
  lakeRMin: 9,
  lakeRMax: 14,
  lakeSpeed: 0.55, // dans l'eau : joueur et ennemis au sol (Volant et Faucheur ignorent)
  woods: 5, // phase 16 : bosquets plus petits et plus nombreux (4 × 22 u → 5 × 15 u)
  woodR: 15,
  minFromCenter: 24, // le départ reste une clairière ouverte
};

// carte construite (phase 16, PLAN §3.4) : des lieux posés par la seed sur une grille de secteurs, tous ouverts.
// Règle d'accès : deux obstacles qui ne font pas partie du même ouvrage laissent toujours `pass` u de passage libre
// (entre eux et avec le bord de la carte),
// et chaque ouvrage a des brèches : une Brute élite (2,5 u de large) atteint toute case libre de la carte (map.test.ts).
export const MAP = {
  seed: 20261102, // la carte du jeu (main.ts) : toujours la même, celle que l'on dessine et que l'on vérifie
  sector: 28, // côté d'un secteur ; un lieu par secteur au plus (phase 27 : 34 → 28, carte plus remplie)
  jitter: 7, // décalage aléatoire du centre d'un lieu dans son secteur
  flatTries: 12, // phase 27 : essais pour trouver du plat dans le secteur…
  flatMax: 0.6, // …écart de hauteur toléré sur l'empreinte (le lieu est ensuite posé exactement à plat)
  placeExt: 7.6, // demi-emprise d'un lieu (cercle de pierres, enceinte, troncs) ; le cimetière : 7√2 + clôture ; deux lieux à demi-emprises + MAP.pass + 0,5
  startClear: 30, // aucun lieu à moins de 30 u du départ : la clairière de départ reste ouverte
  // part des secteurs libres (hors lacs et bois) : ruines, cercle de pierres, troncs couchés, le reste vide (respiration)
  ruins: 0.26,
  stones: 0.12,
  logs: 0.16,
  graveyards: 0.12, // phase 27 : cimetière (clôture à brèches, tombes)
  camps: 0.12, // campement abandonné (tonneaux et caisses en cercle, un coffre au milieu)
  pumpkins: 0.08, // champ de citrouilles (décor seul)
  fenceR: 0.3, // clôture : se saute comme un muret
  fenceH: 0.8,
  yardHalf: 7, // demi-côté du cimetière (une brèche de MAP.breach au milieu de chaque côté)
  graveR: 0.45, // tombe (obstacle bas, arrête les tirs)
  campRing: 5, // tonneaux et caisses sur un cercle de 5 u…
  campItems: 5, // …au nombre de 5 (passage ≥ 4,5 u entre deux)
  campR: 0.7,
  pass: 3, // passage libre minimal entre deux obstacles d'ouvrages différents (Brute élite 2,5 u + 0,5 de marge)
  breach: 4, // brèche d'un muret, bout à bout (passage libre 4 − 2 × wallR = 3,1 u)
  footprint: 10, // rayon réservé autour d'un lieu : arbres et rochers épars en sont exclus
  wallR: 0.45, // demi-épaisseur d'un muret
  wallH: 1.0, // hauteur d'un muret : le joueur le franchit d'un saut (apex 1,7 u), les ennemis au sol font le tour
  logR: 0.45,
  logH: 0.9, // tronc couché : se saute aussi
  overTol: 0.15, // en l'air à y ≥ h − overTol, on passe au-dessus d'un muret ou d'un tronc
  stoneR: 0.9, // menhir : ne se saute pas, arrête les tirs
  stoneRing: 6.5, // rayon du cercle de pierres (6 à 8 menhirs : 3,2 u de passage au plus serré)
  ruinHalf: 4, // demi-côté des ruines en L et en U
  keepHalf: 5, // demi-côté de l'enceinte brisée (une brèche par côté)
  logLen: [5, 8],
  logGap: 4.6, // entre deux troncs parallèles (passage 3,7 u)
  start: 8, // aucun arbre ni rocher à moins de 8 u du départ
  edge: 8, // marge entre les lieux et le bord de la zone jouable
  crossGap: 3, // croix : les bras partent à 3 u du centre (entre deux bras voisins : 4,2 u, passage 3,3 u)
  stonesMin: 6, // menhirs par cercle : 6 à 8
  stonesMax: 8,
  logShift: 1.5, // décalage des troncs le long de leur axe (± u)
};

// champ de flux (phase 16) : les ennemis au sol contournent les ouvrages au lieu de buter dessus
export const FLOW = {
  cell: 1, // côté d'une case (1,25 u fermait des passages de 3 u : des poches que le flux n'atteignait pas)
  half: 50, // demi-côté de la grille locale, en cases : 100 u de côté, couvre la distance de réapparition (50 u)
  period: 0.2, // recalcul (s)
  clear: 0.5, // une case est pleine si son centre est à moins de r + 0,5 u d'un obstacle (passage de 3 u : 2 u libres ; les gros
  // marcheurs ne rasent plus les murets)
  blocked: 0.35, // un marcheur qui avance de moins de 35 % de sa vitesse voulue bute sur un obstacle…
  detour: 0.6, // …et suit alors le flux case par case pendant 0,6 s : il glisse autour au lieu de pousser tout droit
};

// dangers à esquiver par le mouvement (phase 11, PLAN §3.1) : le saut et le dash servent à autre chose qu'à fuir
export const HAZARDS = {
  eruption: {
    after: 150, // première éruption à 2:30 : le joueur a appris à bouger (à 2:00 : morts avant 3 min 13 % → 22 %)
    period0: 9, // entre deux éruptions à 2:30…
    period1: 4, // …et à `at` (15:00) puis constant
    at: 900,
    r: 1.6,
    // 1.25.1 (retour de Jimmy) : le cercle ne suit plus le joueur, il pète là où il est apparu, plus vite (0,8 → 0,65 s).
    // On en sort en marchant (rayon + corps ≈ 2 u : 0,32 s à 6,2 u/s), ou on le saute : en l'air ≥ 0,9 u entre 0,11 et
    // 0,62 s après l'impulsion, donc un saut dès l'apparition retombe juste avant le pic (il faut viser, pas réagir)
    telegraph: 0.65,
    dmg: 12, // × dmgScale (×1,25 à 2:30 ⇒ 15 PV ; 31 PV à 15:00) ; phase 12 : 15 → 12, les éruptions faisaient 16–17 % des morts d'un personnage complet (porte ≤ 15 %)
    launch: 6, // vitesse verticale donnée au joueur touché : projeté, lisible
  },
  ring: {
    first: 3, // s après l'apparition du Gardien
    period: 6, // phase 2 : /2
    speed: 9, // u/s
    width: 0.8, // épaisseur de l'onde
    maxR: 14,
    dmg: 11, // × dmgScale ; une fois par onde (phase 27 : 14 → 11, sur le relief en plans l’onde faisait une falaise à 5:00)
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
  // needFor(lv) = 0,45·(5 + 2·lv + 0,15·lv²)  → lv1:3, lv10:18, lv20:47, lv40:146 (phase 12 : la montée est longue et faite de
  // petites lignes ; phase 17 : ×0,45, les coffres ne donnent plus de cartes mais des objets, les niveaux portent toutes les
  // cartes : ≈ 37 niveaux à 10 min au lieu de 26 + ≈ 12 cartes de coffre)
  needFor: (lv: number) => Math.floor((5 + lv * 2 + lv * lv * 0.15) * 0.45),
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
    // phase 18 : la rampe de fin de partie démarre à 8:00 en douceur (/360) au lieu de 10:00 (/260) : même densité à 15:00,
    // plus de mur au moment de l'Essaim-mère (−22 points de vivants en une minute à 10:00)
    Math.min(20, 0.7 + t / 240 + Math.max(0, t - 480) / 360 + Math.max(0, Math.min(t, 900) - 420) / 120),
  // phase 16 : fin de partie /50 → /5 (après 15:00 seulement : la médiane maxée tombe avant) ; avec la carte et les tireurs
  // plafonnés, la moitié des runs maxés vivants à 15:00 allaient au bout (fin 24 %). Mesuré (200 runs maxés) : /15 → 17 %,
  // /8 → 13 %, /5 → 7 % (cible 3–12 %). ×2 à 2:30, ×9,3 à 12:00, ×24 à 16:00, ×74 à 20:00
  // phase 18 : fin de partie /5 → /8 (les coffres de carte et les sanctuaires remplacent une part de la puissance)
  hpScale: (t: number) => 1 + t / 170 + Math.max(0, Math.min(t, 900) - 420) / 85 + Math.max(0, t - 900) / 8,
  dmgScale: (t: number) => 1 + t / 500 + Math.max(0, t - 900) / 45, // phase 12 : ×4,1 à 20:00 (t/450 avant) ; après 15:00 les dégâts montent plus vite : une build qui a explosé n'est plus limitée par les PV ennemis
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
  // probabilités par type selon le temps. Phase 16 : une bande de tireurs (part `shooterShare`) est tirée d'abord, le
  // reste du tirage garde exactement les proportions d'avant entre les marcheurs.
  pick: (t: number, r: number): number => {
    const s = SPAWN.shooterShare(t);
    if (r < s) {
      const u = r / s;
      if (t > SORCIER.after && u < 0.3) return SORCIER_TYPE;
      if (t > CRACHEUR.after && u < 0.55) return CRACHEUR_TYPE;
      return ARCHER_TYPE;
    }
    r = (r - s) / (1 - s);
    if (t > 180 && r < 0.05 + 0.12 * Math.min(1, (t - 180) / 600)) return 4; // Volant : 5 → 17 % à 13:00
    if (t > 90 && r < 0.08 + t / 3000) return 2; // Brute : 8 % à 1:30, 28 % à 10:00 (t/4000 donnait moins d'XP : p50 8:45 au lieu de 9:34)
    if (t > 40 && r < 0.42) return 1; // Dard
    return 0; // Spectre
  },
  // part des tireurs (Archer dès 1:30, Cracheur dès 3:00, Sorcier dès 4:00) : 4 % à 1:30, 18 % à 10:00
  shooterShare: (t: number): number => (t < ARCHER.after ? 0 : Math.min(0.18, 0.04 + (0.14 * (t - ARCHER.after)) / 510)),
  maxShooters: 24, // au-delà, le tirage retombe sur un Spectre : l'écran reste lisible
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
  { key: 'gardien', hp: 820, speed: 2.3, r: 2.0, dmg: 40, xp: 40, y: 2.2, kbMul: 0, boss: true },
  { key: 'volant', hp: 12, speed: 3.4, r: 0.5, dmg: 16, xp: 1, y: 1.6, kbMul: 0.5, boss: false },
  { key: 'cracheur', hp: 30, speed: 2.4, r: 0.6, dmg: 8, xp: 2, y: 0.8, kbMul: 0.7, boss: false },
  { key: 'essaim', hp: 1600, speed: 1.6, r: 2.4, dmg: 30, xp: 40, y: 2.4, kbMul: 0, boss: true },
  { key: 'colosse', hp: 2600, speed: 1.2, r: 2.6, dmg: 30, xp: 40, y: 2.6, kbMul: 0, boss: true }, // lent : ses cercles sont la menace, pas le contact (15:00 → 16:00 perdait 14 points)
  { key: 'faucheur', hp: 40000, speed: 7.1, r: 1.4, dmg: 150, xp: 100, y: 2.0, kbMul: 0, boss: true }, // 7,1 = joueur × 1,15 : il rattrape toujours
  // phase 16 : tireurs. Fragiles (ils meurent vite une fois rejoints), dangereux à distance
  { key: 'archer', hp: 14, speed: 2.6, r: 0.5, dmg: 6, xp: 2, y: 0.8, kbMul: 0.8, boss: false },
  { key: 'sorcier', hp: 24, speed: 2.1, r: 0.6, dmg: 8, xp: 3, y: 0.9, kbMul: 0.7, boss: false },
];
export const DARD_TYPE = 1;
export const BOSS_TYPE = 3; // Gardien (5:00)
export const ELITE_TYPE = 2; // Brute : gerbe, shake et son de kill renforcés
export const VOLANT_TYPE = 4;
export const CRACHEUR_TYPE = 5;
export const SWARM_TYPE = 6; // Essaim-mère (10:00)
export const COLOSSUS_TYPE = 7; // Colosse (15:00)
export const REAPER_TYPE = 8; // Faucheur (20:00)
export const ARCHER_TYPE = 9; // phase 16
export const SORCIER_TYPE = 10; // phase 16
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
  after: 180, // phase 16 : dès 3:00 (6:00 avant, et rare)
};

// Archer (phase 16) : flèche rapide en ligne droite, arrêtée par les obstacles ; on l'esquive d'un pas de côté, d'un dash
// ou derrière un muret. L'élite tire une volée de trois en éventail.
export const ARCHER = {
  after: 90,
  keepMin: 10,
  keepMax: 13,
  aim: 0.5, // ligne de visée fine
  period: 2.4,
  shotSpeed: 14,
  shotLife: 1.15, // portée 16 u
  shotDmg: 8, // × dmgScale
  shotR: 0.3,
  orbit: 0.5,
  fireMargin: 3,
  firstShot: [0.8, 2], // s avant le premier tir d'un Archer ou d'un Sorcier qui arrive (désynchronisés)
  muzzle: 0.2, // la flèche part à r + 0,2 u devant l'Archer
  volley: 3, // élite
  spread: 0.22, // rad entre deux flèches de la volée
};

// Sorcier (phase 16) : boule de feu en cloche qui retombe là où était le joueur ; passe au-dessus des murs, se fuit
export const SORCIER = {
  after: 240,
  keepMin: 12,
  keepMax: 15,
  period: 3.8,
  windup: 0.35, // mains levées avant le lancer (lisible)
  cast: 1.1, // durée du vol = cercle rouge au sol qui se remplit
  r: 1.9,
  dmg: 11, // × dmgScale ; 13 → 11 : le feu faisait 26 % des morts d'un personnage complet (porte : une source de tir ≤ 30 %)
  orbit: 0.4,
  fireMargin: 3,
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
// phase 32 (demande de Jimmy) : les Lames ne tournent plus autour du héros (le Halo le fait déjà) ; toutes les `cd` s, elles
// frappent les `n` ennemis les plus proches à moins de `range` u, chaque coup touchant tout ce qui est à moins de `r` de la cible
export const LAMES = {
  range: 6, // u de détection (× portée du Bûcheron)
  kb: 5, // recul d'un coup (× Fendeur)
  wait: 0.15, // sans ennemi à portée, nouvel essai dans 0,15 s
  first: 0.3, // s avant le premier coup d'une partie
};
// phase 28 : comportement des armes nouvelles
export const FAUX = { kb: 7, wait: 0.15 }; // recul fort ; sans ennemi à portée, nouvel essai dans 0,15 s
export const LANCE = { range: 16, hitR: 0.45, kb: 2, spread: 0.16, lifeMargin: 1.15, retry: 0.25, maxPerSalvo: 30 }; // cible : l'ennemi le plus loin à moins de 16 u ; éventail de 0,16 rad entre lances ; sans cible, nouvel essai dans 0,25 s ; au plus 30 lances par salve (un bit par lance)
export const METEOR = { delay: 0.6, range: 13, around: 8, kb: 3, max: 32, tries: 8 }; // cercle annoncé 0,6 s ; sur un ennemi à < 13 u (8 tirages au plus), sinon autour du joueur ; 32 en attente au plus (le surplus d'une salve est perdu)
export const MINES = {
  spacing: 1.2, // u parcourus entre deux poses
  life: 14, // une mine jamais déclenchée expire
  triggerR: 1.2, // rayon de déclenchement (l'explosion couvre stats.r)
  armDelay: 0.3, // pas de déclenchement par l'ennemi qui a provoqué la pose
  chainR: 3, // niveau 5 : les mines à 3 u s'amorcent
};

export const CHEST = {
  pickupR: 1.1,
  bossPicks: 2, // phase 17 : un coffre d'élite = un objet au choix, un coffre de boss = deux (avant : 1 à 5 cartes de niveau)
  gold: 10, // or par coffre
};

/**
 * Bonus au sol (phase 35) : posés sur la carte devant le joueur et lâchés par les ennemis, ramassés en marchant
 * dessus (jamais attirés par l'aimant). Reprendre un bonus actif remet sa durée au maximum.
 */
export const POWER_KEYS: PowerKey[] = ['aimant', 'or', 'vitesse', 'gel', 'rage'];
export const POWER = {
  pickupR: 1.1,
  life: 30, // s au sol
  blink: 5, // clignote les dernières secondes
  weights: [25, 20, 20, 15, 20], // aimant, or, vitesse, gel, rage
  dur: [0, 15, 7, 3, 6], // s d'effet (aimant : instantané) ; phase 35 : 20/10/4/10 doublaient la survie du profil nu (9:35)
  goldMul: 2, // Pluie d'or : or des ennemis
  speedMul: 1.3, // Élan
  dmgMul: 1.25, // Rage (×1,5 pendant 10 s : 10:16 de survie nue à elle seule)
  killChance: 0.003, // ennemi normal
  eliteChance: 0.2,
  bossDrops: 2,
  mapFirst: 30, // premier bonus de carte
  mapEvery: [45, 70], // s entre deux bonus de carte
  mapDist: [14, 24], // u du joueur
  mapCone: Math.PI / 4, // demi-angle autour de la direction du héros
  placeTries: 6,
  bossScatter: 1.6, // u : écart des bonus lâchés par un boss
  mapMinGround: 1, // un bonus de carte n'est pas posé dans le lac (speedAt < 1)
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
  label?: string; // phase 32 : clé de texte si elle diffère de `stat` (Lames : `n` compte des cibles, pas des projectiles)
}
export const WEAPON_LINES: Record<WeaponKey, StatLine[]> = {
  // le niveau 5 d'avant (≈ ×3 de DPS) se retrouve vers 10–12 améliorations ; au-delà c'est la marge jusqu'à 100
  // phase 23 : chaque arme a aussi une ligne de coup critique (×CRIT.mul) ; une carte ne tire jamais deux fois la même ligne
  orbe: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'n', step: 1, kind: 'add', max: 5, weight: 1.5 },
    { stat: 'speed', step: 0.08, kind: 'pct', max: 12, weight: 2 },
    { stat: 'pierce', step: 1, kind: 'add', max: 3, weight: 1 },
    { stat: 'crit', step: 0.05, kind: 'add', max: 8, weight: 2 },
  ],
  aura: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'r', step: 0.06, kind: 'pct', max: 20, weight: 3 },
    { stat: 'period', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'crit', step: 0.05, kind: 'add', max: 8, weight: 2 },
    { stat: 'slow', step: 0.06, kind: 'add', max: 5, weight: 2 }, // chance par impulsion de ralentir (CRIT.slowT)
  ],
  lames: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'n', step: 1, kind: 'add', max: 4, weight: 1.5, label: 'targets' }, // cibles par coup (phase 32)
    { stat: 'r', step: 0.06, kind: 'pct', max: 15, weight: 2 }, // zone de coupe autour de chaque cible
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'crit', step: 0.05, kind: 'add', max: 8, weight: 2 },
  ],
  foudre: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'chain', step: 1, kind: 'add', max: 10, weight: 3 }, // phase 30 : les ricochets arrivent avec les cartes
    { stat: 'crit', step: 0.05, kind: 'add', max: 8, weight: 2 },
    { stat: 'stun', step: 0.05, kind: 'add', max: 5, weight: 2 }, // chance d'étourdir (CRIT.stunT), pas les boss
  ],
  boomerang: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'range', step: 0.06, kind: 'pct', max: 12, weight: 2 },
    { stat: 'n', step: 1, kind: 'add', max: 3, weight: 1.5 },
    { stat: 'speed', step: 0.06, kind: 'pct', max: 12, weight: 2 },
    { stat: 'crit', step: 0.03, kind: 'add', max: 8, weight: 2 }, // +3 % : le Braconnier nu passait à +4 min avec +5 %
  ],
  mines: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'r', step: 0.05, kind: 'pct', max: 15, weight: 2 },
    { stat: 'n', step: 1, kind: 'add', max: 12, weight: 2 },
    { stat: 'chain', step: 1, kind: 'add', max: 1, weight: 1 },
    { stat: 'crit', step: 0.05, kind: 'add', max: 8, weight: 2 },
  ],
  // phase 28
  faux: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'r', step: 0.05, kind: 'pct', max: 15, weight: 2 },
    { stat: 'arc', step: 15, kind: 'add', max: 16, weight: 2 }, // degrés : jusqu'au cercle complet
    { stat: 'crit', step: 0.05, kind: 'add', max: 8, weight: 2 },
  ],
  lance: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'n', step: 1, kind: 'add', max: 4, weight: 1.5 },
    { stat: 'speed', step: 0.08, kind: 'pct', max: 10, weight: 2 },
    { stat: 'crit', step: 0.05, kind: 'add', max: 8, weight: 2 },
  ],
  meteores: [
    { stat: 'dmg', step: 0.1, kind: 'pct', weight: 3 },
    { stat: 'cd', step: -0.05, kind: 'pct', max: 15, weight: 3 },
    { stat: 'r', step: 0.06, kind: 'pct', max: 15, weight: 2 },
    { stat: 'n', step: 1, kind: 'add', max: 6, weight: 1.5 },
    { stat: 'crit', step: 0.05, kind: 'add', max: 8, weight: 2 },
  ],
};
// tomes (remplacent les passifs) : chaque carte tire 1 à 3 lignes dans son tome, l'effet s'applique au joueur (applyTomeLine)
export const TOMES: Record<TomeKey, StatLine[]> = {
  degats: [
    { stat: 'dmg', step: 0.08, kind: 'add', weight: 3 },
    { stat: 'elite', step: 0.08, kind: 'add', weight: 2 },
    { stat: 'kb', step: 0.1, kind: 'add', weight: 2 },
    { stat: 'critdmg', step: 0.15, kind: 'add', max: 10, weight: 2 }, // phase 23 : dégâts des coups critiques
  ],
  cadence: [
    { stat: 'cd', step: 0.04, kind: 'add', max: 18, weight: 3 },
    { stat: 'life', step: 0.06, kind: 'add', max: 10, weight: 2 }, // ×1,6 au plus : le pool de projectiles (250) ne sature pas
    { stat: 'spellcd', step: 0.04, kind: 'add', max: 10, weight: 2 }, // phase 23 : recharge du sort, plancher commun
  ],
  projectiles: [
    { stat: 'proj', step: 1, kind: 'add', max: 3, weight: 1 },
    { stat: 'size', step: 0.06, kind: 'add', max: 15, weight: 3 }, // ×1,9 au plus : le Halo reste lisible
    { stat: 'pspeed', step: 0.06, kind: 'add', weight: 2 },
  ],
  vitalite: [
    { stat: 'hp', step: 12, kind: 'add', weight: 3 },
    { stat: 'regen', step: 0.4, kind: 'add', weight: 2 },
    { stat: 'armor', step: 0.03, kind: 'add', max: 12, weight: 2 }, // 12 × 3 % = TOME_CAPS.armorMax
    { stat: 'killheal', step: 0.1, kind: 'add', max: 5, weight: 2 }, // phase 23 : PV rendus par ennemi tué
  ],
  mouvement: [
    { stat: 'speed', step: 0.05, kind: 'add', weight: 3 },
    { stat: 'spellcd', step: 0.08, kind: 'add', max: 10, weight: 2 }, // phase 19 : recharge du sort de classe ; phase 22 : −6 → −8 %
    { stat: 'spellpow', step: 0.08, kind: 'add', max: 10, weight: 1 }, // phase 19 : puissance du sort (dégâts ; rayon et durée à moitié)
    { stat: 'jump', step: 0.08, kind: 'add', max: 5, weight: 1 }, // phase 23 : hauteur du saut
  ],
  savoir: [
    { stat: 'xp', step: 0.06, kind: 'add', weight: 3 }, // pas de plafond : les runs maxés qui vont au bout cumulent 8 lignes contre 3,4 pour les morts après 15:00, mais plafonner à 8 ne changeait rien (15 % de fins dans les deux cas)
    { stat: 'magnet', step: 0.08, kind: 'add', weight: 2 },
    { stat: 'lvlheal', step: 8, kind: 'add', max: 6, weight: 2 }, // phase 23 : PV soignés à chaque niveau
  ],
  chance: [
    { stat: 'luck', step: 0.5, kind: 'add', weight: 3 },
    { stat: 'chestgold', step: 0.2, kind: 'add', weight: 2 },
    { stat: 'crit', step: 0.03, kind: 'add', max: 10, weight: 2 }, // phase 23 : critique pour toutes les armes
  ],
  or: [
    { stat: 'gold', step: 0.08, kind: 'add', weight: 3 },
    { stat: 'elitegold', step: 1, kind: 'add', weight: 2 },
    { stat: 'shop', step: 0.06, kind: 'add', max: 5, weight: 2 }, // phase 23 : prix du marchand
  ],
};
// phase 23 : coups critiques (armes seulement), ralentissement du Halo, étourdissement de la Foudre
export const CRIT = { mul: 2, slowT: 0.6, stunT: 0.5, shopMin: 0.6 };
export const TOME_KEYS = Object.keys(TOMES) as TomeKey[];
// planchers et plafonds des effets cumulés des tomes (applyTomeLine) : la recharge ne descend pas sous 25 % de la base,
// l'armure n'annule pas plus de 36 % des dégâts (à 45 % les runs complets ne mouraient plus après 15:00), le sort garde 40 % de recharge
export const TOME_CAPS = { cdMin: 0.25, armorMax: 0.36, spellCdMin: 0.35 }; // phase 22 : recharge du sort −65 % au plus, toutes sources
// rareté d'une carte = nombre de lignes : 1 (67 %), 2 (25 %), 3 (8 %) ; chaque point de chance décale vers 2 et 3
export const RARITY = {
  two: 0.25,
  three: 0.08,
  luckTwo: 0.02,
  luckThree: 0.01,
};

// sorts de classe (phase 19, PLAN §3.5) : un par personnage, sur le bouton de l'ancien dash. Dégâts × dmgMul du joueur
// (hitEnemy) × spellPow (tome Mouvement) ; rayons et durées × (1 + (spellPow − 1) / 2). Recharge × spellCdMul.
export const SPELL_KEYS = ['bond', 'tourbillon', 'clignement', 'eclat', 'collet', 'petard', 'comete', 'voile', 'bourse'] as const;
export const SPELL = {
  slow: 0.5, // vitesse des ennemis ralentis (Voile, boss dans un Collet ou un Éclat)
  sizeShare: 0.5, // rayons et durées : moitié du bonus de puissance (tome Mouvement)
  maxEnemyR: 2.6, // marge des requêtes de zone : plus grand rayon d'ennemi (Colosse)
  blinkStep: 0.5, // u : pas du Clignement jusqu'au premier obstacle
  holdPad: 0.05, // s : un ennemi reste figé un peu plus d'une impulsion du Collet (pas de trou entre deux)
  kbBlink: 2, // recul des éclairs du Clignement
  kbBourse: 6, // recul de l'explosion de la Bourse
  // phase 22 : recharges ×2,5 (le sort devient un temps fort, réductions à gagner) et puissance ≈ +30 %
  bond: { cd: 8, orbs: 7, dmg: 18, speed: 15, pierce: 2 }, // Éclaireuse : dash PLAYER.dashTime, puis orbes en étoile à l'arrivée
  tourbillon: { cd: 16, dur: 1.4, r: 3, period: 0.2, dmg: 16, kb: 7, dmgTaken: 0.5, speedMul: 0.8 }, // Bûcheron
  clignement: { cd: 12, dist: 6, invul: 0.4, targets: 7, dmg: 46, chainR: 7 }, // Sorcière : éclairs depuis le point de départ
  eclat: { cd: 18, r: 6, dmg: 16, kb: 14, stun: 1.4, bossSlow: 2.3 }, // Veilleuse
  collet: { cd: 16, range: 7, r: 3, dur: 3.5, dps: 8, period: 0.25 }, // Braconnier : immobilise (boss : ralentis)
  petard: { cd: 14, r: 4.2, dmg: 72, kb: 12, jumpMul: 1.6 }, // Sapeur : l'atterrissage pose une mine (Démolisseur) ; phase 22 : r 3,5 → 4,2 (nu : 14 → 8 % de morts < 3 min)
  comete: { cd: 6, time: 0.4 }, // Feu follet : dash 2× plus long que le Bond, la Traînée y pose du feu
  voile: { cd: 18, dur: 1.75, speedMul: 1.3, r: 1.4, slow: 2.3 }, // Revenante : invulnérable, ralentit ce qu'elle frôle
  bourse: { cd: 18, range: 5, r: 3.5, dmg: 21, perGold: 0.13, maxBonus: 78 }, // Colporteur : +1 dégât par 10 or gardés (+60 max) ; 30 dégâts / 6 s : 36 % des kills (nu), 24 / 7 s : 34 %
};

// personnages (PLAN §3.5) : stats de départ différentes mais pas meilleures (survivor-design §8).
// Mesure 100 runs average seed 42 : Éclaireuse p50 7:52 ; Bûcheron Lames niv 1 et vitesse 1,0 → 5:11 (30 % de morts < 3 min) ;
// Sorcière à −20 % PV → 10:49 (trop forte). D'où Lames niv 2 + vitesse 1,05 et −30 % PV.
// passifs signature (phase 6, docs/PHASE6-PERSONNAGES.md) : une constante par passif, lue par la sim
export const TRAIT = {
  fendeur: { kbMul: 1.5 }, // Bûcheron : recul des Lames ×1,5
  braise: { perMin: 0.1, max: 0.5 }, // Veilleuse : rayon du Halo +10 %/min, plafonné à +50 % (5:00) ; 8 %/40 % donnait p50 5:26
  // Braconnier : un boomerang attrapé rend 30 % de la recharge. Phase 17 : 60 % avec 4 lignes de dégâts valaient à eux seuls
  // ≈ +11 min de médiane au kit de départ (15:23 contre 5:46 pour l'Éclaireuse) ; 30 % et 2 lignes : 5:31 (60 runs)
  rapporteur: { refund: 0.3 },
  trainee: { spacing: 0.7, life: 1.5, dps: 8, r: 0.9, period: 0.25, kb: 0.6 }, // Feu follet : la Comète pose un feu de 1,5 s à 8 PV/s
  dejamorte: { revives: 1, airXpMul: 2, chill: 0.8, chillR: 3.5 }, // Revenante : une réanimation gratuite, kills en l'air ×2 XP ; phase 34 : frisson du tombeau, les ennemis à moins de chillR u sont ralentis (0,8 s entretenues) ; au seul contact, 40 % de morts < 3 min (Dards), à 2,5 u 26 %, à 3,5 u 13 %
  marchand: { offers: 4, luck: 1, goldMul: 0.4 }, // Colporteur (phase 17) : les coffres proposent 4 objets ; phase 34 : flair (+1 Chance, +40 % d'or) à la place des tomes de départ
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
  spell: Spell; // phase 19 : sort de classe (bouton de l'ancien dash)
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
  { key: 'eclaireuse', weapon: 'orbe', trait: Trait.None, speedMul: 1.15, hpAdd: 0, hpMul: 1, spell: Spell.Bond, bladeRangeMul: 1, unlock: '', price: 0 },
  { key: 'bucheron', weapon: 'lames', // phase 32 : Lames ciblées sans lignes de départ ni portée bonus (avec : 13–16 min nu, 19–27 % de fins)
    trait: Trait.Fendeur, speedMul: 1.05, hpAdd: 30, hpMul: 1, spell: Spell.Tourbillon, bladeRangeMul: 1, unlock: 'survie10', price: 0 },
  { key: 'sorciere', weapon: 'foudre', trait: Trait.Paratonnerre, speedMul: 1, hpAdd: 0, hpMul: 0.7, spell: Spell.Clignement, bladeRangeMul: 1, unlock: 'kills500', price: 0 },
  // phase 6 : un personnage par arme manquante (Halo, Boomerang, Mines), deux variantes extrêmes, un économe
  { key: 'veilleuse', weapon: 'aura', trait: Trait.Braise, speedMul: 1, hpAdd: 20, hpMul: 1, spell: Spell.Eclat, bladeRangeMul: 1, unlock: '', price: 800 },
  { key: 'braconnier', weapon: 'boomerang', // phase 33 : plus de lignes de départ (une arme part de zéro) ; avant : // phase 17 : 4 → 2 lignes de dégâts (avec le remboursement à 30 %) ; phase 18 : 2 → 1 (relief et sanctuaires : nu 9:34, +3:48 sur l'Éclaireuse)
    // phase 33 : 10 → 35 PV (sans lignes de départ : 22 % de morts < 3 min avec 10, 21 % avec 25)
    trait: Trait.Rapporteur, speedMul: 1, hpAdd: 35, hpMul: 1, spell: Spell.Collet, bladeRangeMul: 1, unlock: '', price: 1200 },
  { key: 'sapeur', weapon: 'mines', trait: Trait.Demolisseur, speedMul: 0.92, hpAdd: 0, hpMul: 0.8, spell: Spell.Petard, bladeRangeMul: 1, unlock: 'boss1', price: 0 },
  { key: 'feufollet', weapon: 'orbe', trait: Trait.Trainee, speedMul: 1.3, hpAdd: 0, hpMul: 0.6, // phase 10 : 0,5 → 0,6, seul avec l'Orbe il passait sous 4 min (3:51) et 20 % de morts < 3 min
    spell: Spell.Comete, bladeRangeMul: 1, unlock: 'intouchable', price: 0 },
  { key: 'revenante', weapon: 'foudre', trait: Trait.DejaMorte, // phase 34 : une seule arme au départ (plus de Halo)
    speedMul: 0.9, hpAdd: 0, hpMul: 0.45, spell: Spell.Voile, bladeRangeMul: 1, unlock: 'win', price: 0 },
  { key: 'colporteur', weapon: 'lames', // phase 33 : plus de lignes de départ (une arme part de zéro) ; avant : // ≈ l'ancien Lames 3 ; avec 1 lame et 1 ligne de dégâts, 2:19 et 78 % de morts < 3 min
    // phase 34 : plus de tomes de départ (Chance, Or) : le flair du Marchand les remplace (TRAIT.marchand)
    trait: Trait.Marchand, speedMul: 1.03, hpAdd: 15, hpMul: 1, spell: Spell.Bourse, bladeRangeMul: 1, unlock: '', price: 2000 },
];

// boutique permanente (survivor-design §8), PAR PERSONNAGE depuis la phase 8 : 8 lignes, 8 paliers, coût base · growth^palier.
// Un run nu (≈ 6 min, ≈ 700 or) paie 1 à 2 paliers ; un personnage complet ≈ 42 000 or ≈ 30 runs.
// phase 17 : la boutique par personnage (8 lignes × 8 paliers) est retirée, sur demande de Jimmy. La puissance hors
// tomes vient maintenant d'objets passifs trouvés dans les coffres ou achetés au marchand pendant la partie.

// objets passifs (phase 17, PLAN §3.6) : une règle de jeu chacun, uniques, au plus ITEM.max par run
export const ITEM_KEYS: ItemKey[] = ['phenix', 'cape', 'lanterne', 'coeur', 'talisman', 'sablier', 'epines', 'bottes', 'oeil', 'aimant', 'fer', 'bourse', 'rune', 'collier', 'patins', 'echarpe', 'plume', 'boussole', 'bouclier', 'corne', 'croc', 'calice', 'mousse', 'souffle', 'pierre', 'de', 'gant', 'brume', 'sandales', 'amulette', 'ecorce', 'couronne'];
/** Index fixes (drapeaux de w.items) : l'ordre suit ITEM_KEYS. */
export const enum It {
  Phenix = 0,
  Cape,
  Lanterne,
  Coeur,
  Talisman,
  Sablier,
  Epines,
  Bottes,
  Oeil,
  Aimant,
  Fer,
  Bourse,
  Rune, // phase 22
  Collier,
  Patins, // phase 28
  Echarpe,
  Plume,
  Boussole,
  Bouclier,
  Corne,
  Croc, // phase 31 : vol de vie, régénération, pourcentages
  Calice,
  Mousse,
  Souffle,
  Pierre,
  De,
  Gant,
  Brume,
  Sandales,
  Amulette,
  Ecorce,
  Couronne,
}
/** Rareté par objet : 0 commun, 1 rare, 2 épique (couleur de carte, prix, poids de tirage). */
export const ITEM_RARITY: number[] = [
  2, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1,
  // phase 31 : croc, calice, mousse, souffle, pierre, dé, gant, brume, sandales, amulette, écorce, couronne
  1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 2,
];
export const ITEM = {
  max: 6, // objets par run
  offers: 3, // choix d'un coffre et offres du marchand (4 avec le Fer à cheval ou le Colporteur dans un coffre)
  weight: [1, 0.55, 0.2], // poids de tirage par rareté…
  luckWeight: [0, 0.08, 0.04], // …décalés par point de Chance
  chestGoldIfFull: 60, // coffre sans objet possible : sac d'or (× multiplicateurs d'or)
  cape: { invul: 0.4, cdMul: 0.75 }, // phase 19 : après chaque sort, 0,4 s d'invulnérabilité ; recharge du sort −15 % (phase 22 : −25 %)
  lanterne: { magnetMul: 1.6 },
  coeur: { hp: 30, speedMul: 0.97 },
  talisman: { every: 25, targets: 5, frac: 0.5, bossFrac: 0.05, range: 14 }, // part des PV max retirée à chaque cible
  sablier: { slow: 0.8 }, // élites et boss
  epines: { mul: 3, period: 0.25 }, // dégâts renvoyés (× ceux du contact), appliqués toutes les 0,25 s
  bottes: { jumpMul: 1.15, r: 3.2, kb: 9 },
  oeil: { eliteDmg: 0.25 },
  aimant: { heal: 0.15 }, // PV par gemme ramassée
  fer: { luck: 1 },
  bourse: { goldMul: 0.4, discount: 0.15 },
  rune: { cdMul: 0.7 }, // phase 22 : Rune de rappel, recharge du sort −30 %
  // phase 22 : Collier d'os, chaque kill rend 0,1 s de recharge (au plus 1 s par seconde, réserve de 1 s), un boss 4 s
  collier: { perKill: 0.1, perBoss: 4, perSec: 1, bank: 1 },
  // phase 28
  patins: { perSpeed: 1.6, minMul: 1.15, r: 1.1, rehit: 0.35, kb: 6 }, // en glissade (≥ marche × 1,15) : dégâts = 1,6 × vitesse (u/s) aux ennemis traversés
  echarpe: { heal: 8, spell: 1 }, // vrille réussie : 8 PV et 1 s de recharge du sort
  plume: { gravMul: 0.8 }, // en l'air avec l'élan d'une glissade
  boussole: { radiusMul: 1.8 }, // découverte ; la carte montre aussi coffres et sanctuaires non découverts
  bouclier: { period: 20, invul: 0.6 }, // un coup annulé toutes les 20 s
  corne: { period: 25, r: 7, kb: 10, stun: 0.5 }, // onde qui repousse et étourdit (pas les boss)
  // phase 31 (demande de Jimmy : vol de vie, régénération, pourcentages). Les soins des objets (vol de vie, kills)
  // puisent dans une réserve de `healCap` PV par seconde : en fin de partie, les dégâts se comptent en milliers et un
  // vol de vie sans plafond rendrait le héros immortel
  croc: { steal: 0.03, cap: 1 }, // part des dégâts infligés rendue en PV ; PV/s au plus
  calice: { perKill: 1, cap: 1.5 }, // PV par ennemi tué ; PV/s au plus
  mousse: { pct: 0.002 }, // part des PV max régénérée par seconde
  souffle: { below: 0.35, pct: 0.015 }, // sous 35 % des PV : part des PV max régénérée par seconde
  pierre: { dmg: 0.08 },
  de: { crit: 0.06 },
  gant: { below: 0.3, dmg: 0.4 }, // ennemis sous 30 % de leurs PV : +40 % de dégâts
  brume: { dmgTaken: 0.92 }, // −8 % de dégâts subis
  sandales: { speedMul: 1.1 },
  amulette: { xp: 0.15 },
  ecorce: { armor: 0.05 }, // dans le plafond TOME_CAPS.armorMax
  couronne: { dmg: 0.5, steal: 0.02, cap: 1 }, // dégâts × (1 + 0,5 × part des PV manquants) ; vol de vie 2 %
  healReport: 1, // s : les soins des objets sont annoncés (chiffre vert) au plus une fois par seconde
};

// relances des cartes de montée de niveau (phase 31, demande de Jimmy) : une par partie au départ, jusqu'à 3 de plus
// achetées dans la boutique permanente (prix croissants, sans succès requis)
export const RUN_REROLL = { base: 1, avoid: 1e-3 }; // avoid : poids des cartes déjà proposées (elles reviennent seulement si le pool est maigre)
export const REROLL_SHOP = [500, 1500, 4000];

// marchand (phase 17, PLAN §3.6) : échoppe qui s'installe près du joueur, payée avec l'or de la partie
export const MERCHANT = {
  times: [150, 390, 630, 870], // 2:30, 6:30, 10:30, 14:30
  distMin: 10,
  distMax: 14,
  stay: 45, // s avant de repartir
  r: 1.8, // entrer dans ce rayon ouvre l'échoppe
  price: [70, 140, 240], // par rareté, à la première visite…
  growth: 0.25, // …+25 % à chaque visite
  reroll: 40, // relance : 40 or, puis +40 à chaque fois pendant la visite
  placeTries: 8, // essais de placement autour du joueur, hors obstacle
  placeMargin: 0.5, // u de dégagement autour de l'échoppe
};

// synergies tome + arme (phase 17) : l'arme équipée et au moins SYN.tome cartes du tome
// phase 17 : sans la boutique, les synergies sont ce qui rend un kit complet (4 armes, 4 tomes) plus fort qu'un kit de
// départ (une arme qui concentre toutes ses lignes) : effets francs, et chaque synergie active ajoute des PV max et de
// l'armure, d'autant plus qu'elle est la 2e, la 3e… (k-ième synergie : hp·k, armor·k). Mesuré (60 runs maxés) : synergies
// de base 8:03 ; effets francs + 20 PV fixes 9:39 ; bonus progressif 10:52 ; le kit de départ n'a qu'une paire possible.
export const SYN = {
  tome: 3,
  hp: 20, // PV max par synergie, × son rang
  armor: 0.03, // armure par synergie, × son rang (plafond TOME_CAPS.armorMax)
  orage: { chain: 3 }, // Cadence + Foudre (phase 30 : +4 → +3)
  essaim: { pierce: 1, n: 1 }, // Projectiles + Orbe (la seule paire du kit de départ de l'Éclaireuse : modérée)
  brasier: { dmg: 0.8 }, // Dégâts + Halo
  tourbillon: { cd: 0.7, r: 0.25 }, // phase 32 : Lames qui frappent 30 % plus souvent, zone +25 % // Mouvement + Lames
  charge: { r: 0.6 }, // Dégâts + Mines
  ricochet: { n: 2, range: 0.3 }, // Chance + Boomerang
  moisson: { magnet: 0.5 }, // Savoir + Lames
  rempart: { dmgTaken: 0.6 }, // Vitalité + Halo : contact des ennemis dans le Halo
  moissonneuse: { heal: 1, max: 6 }, // phase 28 : Vitalité + Faux, PV rendus par ennemi fauché (au plus 6 par coup)
  volee: { n: 1 }, // Projectiles + Lance
  pluie: { n: 1 }, // Savoir + Météores
};
export interface Synergy {
  key: string;
  tome: TomeKey;
  weapon: WeaponKey;
}
export const SYNERGIES: Synergy[] = [
  { key: 'orage', tome: 'cadence', weapon: 'foudre' },
  { key: 'essaim', tome: 'projectiles', weapon: 'orbe' },
  { key: 'brasier', tome: 'degats', weapon: 'aura' },
  { key: 'tourbillon', tome: 'mouvement', weapon: 'lames' },
  { key: 'charge', tome: 'degats', weapon: 'mines' },
  { key: 'ricochet', tome: 'chance', weapon: 'boomerang' },
  { key: 'moisson', tome: 'savoir', weapon: 'lames' },
  { key: 'rempart', tome: 'vitalite', weapon: 'aura' },
  { key: 'moissonneuse', tome: 'vitalite', weapon: 'faux' }, // phase 28
  { key: 'volee', tome: 'projectiles', weapon: 'lance' },
  { key: 'pluie', tome: 'savoir', weapon: 'meteores' },
];
export const enum Syn {
  Orage = 0,
  Essaim,
  Brasier,
  Tourbillon,
  Charge,
  Ricochet,
  Moisson,
  Rempart,
  Moissonneuse, // phase 28
  Volee,
  Pluie,
}

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
