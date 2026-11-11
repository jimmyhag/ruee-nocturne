// Phase 20 : quels modèles KayKit (CC0, Kay Lousberg) entrent dans le jeu, avec quoi.
// Les packs sont clonés par tools/assets/build.ts dans un cache hors dépôt ; seules les sorties (public/models) sont commitées.

export const PACKS = {
  adventurers: 'KayKit-Character-Pack-Adventures-1.0',
  halloween: 'KayKit-Halloween-Bits-1.0',
  dungeon: 'KayKit-Dungeon-Remastered-1.0',
} as const;
export type PackKey = keyof typeof PACKS;

/**
 * Quaternius (CC0, quaternius.com, versions Standard gratuites, 2025), source d'animation depuis la phase 46 :
 * - Universal Animation Library 1 et 2 : les clips des héros et des ennemis ;
 * - Modular Character Outfits – Fantasy : le squelette d'une tenue (65 os, celui des bibliothèques) porte les clips, que
 *   `retargetClips` (kaykit.ts) reprend sur les personnages KayKit. Ni le squelette ni la tenue ne sont livrés.
 * quaternius.com est injoignable depuis l'environnement de build : les fichiers viennent d'un dépôt public qui les
 * redistribue tels quels (licences CC0 jointes).
 */
export const QUATERNIUS = {
  source: 'Quaternius (quaternius.com), CC0',
  /** dépôt git, dossier racine des fichiers dans ce dépôt */
  mirrors: {
    kit: { repo: 'https://github.com/kirbycope/godot-3d-player-controller-v2', dir: 'assets' },
  },
  /** fichiers du kit (relatifs à mirrors.kit.dir) */
  outfit: (sex: 'M' | 'F', kind: 'Ranger' | 'Peasant') =>
    `modular_character_outfits/Outfits/${sex === 'M' ? 'Male' : 'Female'}_${kind}.gltf`,
  anims: {
    ual1: 'universal_animation_library/UAL1.glb',
    ual2: 'universal_animation_library_2/UAL2.glb',
  },
  licenses: [
    'modular_character_outfits/License_Standard.txt',
    'universal_animation_library/License.txt',
    'universal_animation_library_2/License.txt',
  ],
} as const;

/**
 * Clips produits sur chaque héros, dans l'ordre de HeroAnim (src/render/heroes.ts) : bibliothèque, nom du clip.
 * `inPlace` : le jeu déplace le héros, le clip ne doit pas le faire. `speed` : clip raccourci pour coller au sort.
 */
export const HERO_CLIPS: { to: string; src: 'ual1' | 'ual2'; from: string; speed?: number; inPlace?: boolean }[] = [
  { to: 'Idle', src: 'ual1', from: 'Idle_Loop' },
  { to: 'Run', src: 'ual1', from: 'Jog_Fwd_Loop' },
  { to: 'Jump_Start', src: 'ual1', from: 'Jump_Start', inPlace: true, speed: 1.6 },
  { to: 'Jump_Idle', src: 'ual1', from: 'Jump_Loop', inPlace: true },
  { to: 'Jump_Land', src: 'ual1', from: 'Jump_Land', inPlace: true },
  { to: 'Hit', src: 'ual1', from: 'Hit_Chest' },
  { to: 'Death', src: 'ual1', from: 'Death01' },
  { to: 'Cheer', src: 'ual1', from: 'Dance_Loop' },
  { to: 'Dash', src: 'ual1', from: 'Roll', inPlace: true, speed: 1.6 }, // Bond, Comète
  { to: 'Spin', src: 'ual1', from: 'Sword_Attack', speed: 1.3 }, // Tourbillon
  { to: 'Cast', src: 'ual1', from: 'Spell_Simple_Shoot' }, // Clignement, Éclat
  { to: 'Throw', src: 'ual2', from: 'OverhandThrow' }, // Collet, Bourse
  { to: 'Long', src: 'ual1', from: 'Spell_Simple_Enter' }, // Voile
  { to: 'Raise', src: 'ual2', from: 'NinjaJump_Start', inPlace: true }, // Pétard (envol)
  { to: 'Slide', src: 'ual2', from: 'Slide_Loop', inPlace: true }, // phase 27 : glissade
];

/**
 * Source d'animation et budget de chaque héros (son modèle KayKit est dans `KAY_HEROES`) : sexe et tenue du squelette
 * Quaternius qui porte les clips avant leur reprise, repos propre au personnage, `tris` : triangles visés pour le tout,
 * fusionné en une primitive (un appel de rendu, plus la coque de contour).
 */
export interface HeroSpec {
  sex: 'M' | 'F';
  outfit: 'Ranger' | 'Peasant';
  idle?: { src: 'ual1' | 'ual2'; from: string };
  tris: number;
}

export const HEROES: Record<string, HeroSpec> = {
  eclaireuse: { sex: 'F', outfit: 'Ranger', tris: 9000 },
  bucheron: { sex: 'M', outfit: 'Peasant', tris: 9000 },
  sorciere: { sex: 'F', outfit: 'Peasant', tris: 9000 },
  veilleuse: { sex: 'F', outfit: 'Ranger', idle: { src: 'ual1', from: 'Idle_Torch_Loop' }, tris: 9000 },
  braconnier: { sex: 'M', outfit: 'Ranger', tris: 9000 },
  sapeur: { sex: 'M', outfit: 'Peasant', tris: 9000 },
  feufollet: { sex: 'F', outfit: 'Peasant', tris: 9000 },
  revenante: { sex: 'F', outfit: 'Ranger', idle: { src: 'ual2', from: 'Zombie_Idle_Loop' }, tris: 9000 },
  colporteur: { sex: 'M', outfit: 'Ranger', idle: { src: 'ual2', from: 'Idle_FoldArms_Loop' }, tris: 9000 },
};

/**
 * Objets statiques fusionnés dans public/models/props.glb, un nœud par entrée (nom = clé). `tris` : plafond de triangles
 * vérifié par le script (beaucoup d'instances à l'écran pour les arbres et les lanternes).
 */
export const PROPS: Record<string, { pack: PackKey; file: string; tris: number }> = {
  tree_dead: { pack: 'halloween', file: 'Assets/gltf/tree_dead_large.gltf', tris: 600 },
  tree_dead_m: { pack: 'halloween', file: 'Assets/gltf/tree_dead_medium.gltf', tris: 500 },
  tree_pine: { pack: 'halloween', file: 'Assets/gltf/tree_pine_orange_large.gltf', tris: 600 },
  tree_pine_y: { pack: 'halloween', file: 'Assets/gltf/tree_pine_yellow_medium.gltf', tris: 600 },
  lantern: { pack: 'halloween', file: 'Assets/gltf/post_lantern.gltf', tris: 600 },
  grave: { pack: 'halloween', file: 'Assets/gltf/grave_A.gltf', tris: 400 },
  gravestone: { pack: 'halloween', file: 'Assets/gltf/gravestone.gltf', tris: 400 },
  pumpkin: { pack: 'halloween', file: 'Assets/gltf/pumpkin_orange_jackolantern.gltf', tris: 600 },
  fence: { pack: 'halloween', file: 'Assets/gltf/fence.gltf', tris: 400 },
  chest: { pack: 'dungeon', file: 'Assets/gltf/chest.glb', tris: 2000 }, // 40 coffres au plus à l'écran
  chest_gold: { pack: 'dungeon', file: 'Assets/gltf/chest_gold.glb', tris: 2000 },
  barrel: { pack: 'dungeon', file: 'Assets/gltf/barrel_large.gltf.glb', tris: 800 },
  crates: { pack: 'dungeon', file: 'Assets/gltf/crates_stacked.gltf.glb', tris: 1500 }, // échoppe : une seule à la fois
  coins: { pack: 'dungeon', file: 'Assets/gltf/coin_stack_large.gltf.glb', tris: 2000 },
  sword: { pack: 'adventurers', file: 'Assets/gltf/sword_1handed.gltf', tris: 400 },
  axe: { pack: 'adventurers', file: 'Assets/gltf/axe_1handed.gltf', tris: 400 },
  bomb: { pack: 'adventurers', file: 'Assets/gltf/smokebomb.gltf', tris: 500 },
};

/** Triangles visés pour le corps à chaque niveau : boss (hi), masse en rendu net (mid), masse en pixel (lo). */
export const ENEMY_LODS = { hi: 1800, mid: 330, lo: 110 } as const;

/** Budgets de téléchargement (porte de phase 20). */
// un joueur ne télécharge que son héros et props.glb (vite.config.ts : cache à l'usage, pas de précache)
// phase 25 : héros texturés (atlas JPEG) : 700 ko par héros, 7 Mo au total (un joueur ne charge que son héros)
export const BUDGET = {
  heroBytes: 700_000,
  enemyBytes: 750_000,
  natureBytes: 900_000, // phase 44 : décor stylisé (19 modèles et leur atlas)
  totalBytes: 8_400_000,
}; // phase 26 : ennemis texturés

/**
 * Phase 44 : décor stylisé, Quaternius « Ultimate Stylized Nature » (CC0, quaternius.com). Le site est injoignable
 * depuis l'environnement de build : les FBX et textures viennent d'un dépôt public qui redistribue le pack tel quel.
 * Chaque modèle est allégé par tools/assets/nature.ts (voir son en-tête) et réuni dans public/models/nature.glb.
 */
export interface NatureSpec {
  /** fichier FBX du pack, sans extension */
  file: string;
  /** arbre : origine au pied du tronc ; objet : origine au centre de l'emprise */
  kind: 'tree' | 'prop';
  /** triangles visés pour la partie pleine (tronc, rocher) */
  solid?: number;
  /** cartes de feuilles gardées, agrandissement maximal, facteur de taille des feuilles */
  cards?: number;
  grow?: number;
  leaf?: number;
  /** cœurs opaques du houppier (0 : aucun), taille relative, finesse de l'icosaèdre */
  cores?: number;
  core?: number;
  coreDetail?: number;
  /** brins gardés dans une touffe d'herbe (0 : tous) */
  blades?: number;
  /** triangles visés pour le feuillage en maillage (branches de sapin, fleurs) */
  mesh?: number;
  /** la partie pleine prend aussi la teinte du monde (arbres morts : bois gris du marais) */
  tintSolid?: boolean;
  /** couleur de la partie pleine (sRGB 0..1) à la place de la moyenne de la texture du pack */
  color?: number[];
  /** plafond de triangles, vérifié par le script et par les tests */
  tris: number;
}
/** Pierre claire : la texture de roche du pack, vert sombre, se perd sur l'herbe vue d'en haut. */
const STONE = [0.7, 0.7, 0.66];
export const NATURE = {
  source: 'Quaternius, Ultimate Stylized Nature (quaternius.com), CC0',
  repo: 'https://github.com/walterpalladino/godot-quaternius-ultimate-stylized-nature',
  dir: 'ultimate-stylized-nature/sources',
  atlas: 1024,
  models: {
    leafy_a: { file: 'NormalTree_1', kind: 'tree', solid: 180, cards: 105, grow: 2.6, cores: 5, tris: 600 },
    leafy_b: { file: 'NormalTree_5', kind: 'tree', solid: 140, cards: 90, grow: 2.6, cores: 4, tris: 600 },
    leafy_c: { file: 'NormalTree_3', kind: 'tree', solid: 180, cards: 105, grow: 2.6, cores: 5, tris: 600 },
    birch_a: { file: 'BirchTree_4', kind: 'tree', solid: 160, cards: 100, grow: 2.6, cores: 5, tris: 600 },
    birch_b: { file: 'BirchTree_1', kind: 'tree', solid: 160, cards: 100, grow: 2.6, cores: 5, tris: 600 },
    maple_a: { file: 'MapleTree_1', kind: 'tree', solid: 190, cards: 105, grow: 2.4, cores: 5, tris: 600 },
    maple_b: { file: 'MapleTree_4', kind: 'tree', solid: 140, cards: 90, grow: 2.4, cores: 4, tris: 600 },
    maple_c: { file: 'MapleTree_5', kind: 'tree', solid: 190, cards: 105, grow: 2.4, cores: 5, tris: 600 },
    pine_a: { file: 'PineTree_1', kind: 'tree', solid: 120, mesh: 400, tris: 600 },
    pine_b: { file: 'PineTree_5', kind: 'tree', solid: 80, mesh: 420, tris: 600 },
    pine_c: { file: 'PineTree_2', kind: 'tree', solid: 120, mesh: 400, tris: 600 },
    dead_a: { file: 'DeadTree_1', kind: 'tree', solid: 480, tintSolid: true, tris: 600 },
    dead_b: { file: 'DeadTree_6', kind: 'tree', solid: 480, tintSolid: true, tris: 600 },
    dead_c: { file: 'DeadTree_3', kind: 'tree', solid: 480, tintSolid: true, tris: 600 },
    bush: { file: 'Bush', kind: 'prop', cards: 70, cores: 1, core: 1.6, coreDetail: 1, tris: 400 },
    bush_flowers: {
      file: 'Bush_Flowers',
      kind: 'prop',
      cards: 70,
      cores: 1,
      core: 1.6,
      coreDetail: 1,
      mesh: 80,
      tris: 400,
    },
    grass: { file: 'Grass_Small', kind: 'prop', blades: 6, tris: 40 },
    grass_tall: { file: 'Grass_Large', kind: 'prop', tris: 120 },
    flowers_a: { file: 'Flower_2_Clump', kind: 'prop', mesh: 140, tris: 200 },
    flowers_b: { file: 'Flower_1_Clump', kind: 'prop', mesh: 160, tris: 200 },
    flowers_c: { file: 'Flower_4_Clump', kind: 'prop', mesh: 140, tris: 200 },
    plant: { file: 'Plant_1', kind: 'prop', mesh: 200, tris: 260 },
    rock_a: { file: 'Rock_1', kind: 'prop', solid: 90, color: STONE, tris: 120 },
    rock_b: { file: 'Rock_2', kind: 'prop', solid: 90, color: STONE, tris: 120 },
    rock_c: { file: 'Rock_4', kind: 'prop', solid: 110, color: STONE, tris: 140 },
    rocks: { file: 'Rock_5', kind: 'prop', solid: 200, color: STONE, tris: 240 },
  } as Record<string, NatureSpec>,
};

/**
 * Phase 44 : textures de sol, Poly Haven (polyhaven.com, CC0). Par monde : `a` le tapis (herbe, feuilles, lande),
 * `b` la terre. `tint` : teinte visée (sRGB 0..1) ; `mix` : part de la teinte (le reste garde la couleur de la photo) ;
 * `contrast` : part du grain de la photo gardée.
 */
export interface GroundSpec {
  id: string;
  tint: [number, number, number];
  mix: number;
  contrast: number;
  blur?: number;
}
export const GROUND = {
  source: 'Poly Haven (polyhaven.com), CC0',
  size: 512,
  worlds: [
    {
      // clairière : herbe verte, terre brune
      a: { id: 'forrest_ground_01', tint: [0.36, 0.6, 0.24], mix: 0.85, contrast: 0.6, blur: 0.9 },
      b: { id: 'dirt_floor', tint: [0.58, 0.43, 0.29], mix: 0.6, contrast: 1.2 },
    },
    {
      // bois de braise : herbe dorée, tapis de feuilles mortes
      a: { id: 'leafy_grass', tint: [0.66, 0.56, 0.22], mix: 0.75, contrast: 0.9 },
      b: { id: 'dry_decay_leaves', tint: [0.66, 0.36, 0.18], mix: 0.45, contrast: 1.0 },
    },
    {
      // marais blême : mousse pâle, vase sombre
      a: { id: 'aerial_grass_rock', tint: [0.42, 0.56, 0.5], mix: 0.8, contrast: 0.8 },
      b: { id: 'brown_mud_03', tint: [0.45, 0.39, 0.47], mix: 0.8, contrast: 0.45, blur: 1.2 },
    },
  ] as { a: GroundSpec; b: GroundSpec }[],
};

// ---------- phase 46 : personnages KayKit en proportions humanoïdes ----------

/** Miroir public des packs de personnages KayKit (Kay Lousberg, CC0), épinglé par commit. */
export const KAYKIT2 = {
  raw: 'https://raw.githubusercontent.com/GeorgeQLe/assets-kaykit-3d-characters/af08a62d3669',
  license: 'LICENSES/KayKit-CC0-License.txt',
  source: 'KayKit Adventurers 2.0, Skeletons 1.1 et Mystery Monthly 4 à 6 by Kay Lousberg (www.kaylousberg.com), CC0',
} as const;

/** Étirement par os (nom sans côté), dans le repère de l'os : y le long de l'os, x et z son épaisseur. */
export type Proportions = Record<string, [number, number, number]>;

/**
 * « Affiné » (choix de Jimmy sur planche, 11 nov.) : tête réduite, jambes, torse et bras allongés, taille marquée,
 * bassin étroit, membres fins, épaules gardées. Rig_Medium de KayKit (2,7 têtes de haut) → environ 5,5 têtes.
 */
export const FIT: Proportions = {
  head: [0.5, 0.5, 0.5],
  hips: [0.8, 1, 0.78],
  spine: [0.7, 1.55, 0.68],
  chest: [0.86, 1.5, 0.74],
  upperleg: [0.8, 3.0, 0.8],
  lowerleg: [0.74, 3.0, 0.74],
  foot: [0.72, 0.8, 0.72],
  toes: [0.72, 0.8, 0.72],
  upperarm: [0.74, 1.95, 0.74],
  lowerarm: [0.7, 1.95, 0.7],
  wrist: [0.72, 1, 0.72],
  hand: [0.72, 0.72, 0.72],
};

/** Objet tenu : fichier du miroir, os porteur (les `handslot` de KayKit sont faits pour ça), réglages facultatifs. */
export interface KayProp {
  file: string;
  bone: string;
  scale?: number;
  /** degrés, XYZ, dans le repère de l'os */
  rot?: [number, number, number];
  pos?: [number, number, number];
  /** l'axe long de l'objet pointe vers le haut quand le héros est au repos (bâton, faux) */
  upright?: boolean;
}
export interface KayHero {
  file: string;
  prop: Proportions;
  props: KayProp[];
}
const ADV = 'assets/kaykit/adventurers-2.0';
// objets du pack taillés pour des mains « chibi » : réduits pour les mains affinées
const kayR = (file: string, scale = 0.8): KayProp => ({ file, bone: 'handslot.r', scale });
const kayL = (file: string, scale = 0.8): KayProp => ({ file, bone: 'handslot.l', scale });

/** Modèle KayKit de chaque héros (la source d'animation reste `HEROES` : squelette UE et clips UAL). */
export const KAY_HEROES: Record<string, KayHero> = {
  eclaireuse: { file: `${ADV}/Characters/gltf/Rogue.glb`, prop: FIT, props: [kayR(`${ADV}/Assets/gltf/dagger.gltf`)] },
  bucheron: {
    file: `${ADV}/Characters/gltf/Barbarian.glb`,
    // le bûcheron garde de la carrure : bras et torse moins affinés
    prop: { ...FIT, chest: [0.95, 1.5, 0.84], upperarm: [0.92, 1.9, 0.92], lowerarm: [0.86, 1.9, 0.86] },
    props: [kayR(`${ADV}/Assets/gltf/axe_1handed.gltf`), kayL(`${ADV}/Assets/gltf/axe_1handed.gltf`)],
  },
  sorciere: {
    file: `${ADV}/Characters/gltf/Mage.glb`,
    prop: FIT, // bâton et faux : retournés, la tête de l'arme vers le haut quand le bras pend
    props: [{ ...kayR(`${ADV}/Assets/gltf/staff.gltf`), upright: true }],
  },
  veilleuse: {
    file: 'assets/kaykit/mystery-monthly-series-6/3 - September 2025 - Cleric/characters/Cleric.glb',
    prop: FIT,
    props: [kayR('assets/kaykit/mystery-monthly-series-6/3 - September 2025 - Cleric/assets/gltf/Cleric_Mace.gltf')],
  },
  braconnier: {
    file: `${ADV}/Characters/gltf/Ranger.glb`,
    prop: FIT,
    props: [kayL(`${ADV}/Assets/gltf/bow_withString.gltf`)],
  },
  sapeur: {
    file: `${ADV}/Characters/gltf/Engineer.glb`,
    prop: FIT,
    props: [kayL(`${ADV}/Assets/gltf/smokebomb.gltf`)],
  },
  feufollet: {
    file: 'assets/kaykit/mystery-monthly-series-6/5 - November 2025 - Plant Warrior/characters/PlantWarrior.glb',
    prop: FIT,
    props: [],
  },
  revenante: {
    file: 'assets/kaykit/skeletons-1.1/characters/gltf/Necromancer.glb',
    prop: FIT,
    props: [{ ...kayR('assets/kaykit/skeletons-1.1/assets/gltf/Skeleton_Scythe.gltf'), upright: true }],
  },
  colporteur: {
    file: 'assets/kaykit/mystery-monthly-series-6/8 - February 2026 - Hoarder/characters/Hoarder.glb',
    prop: FIT,
    props: [],
  },
};

/**
 * Phase 46 B : ennemis et boss KayKit, aux mêmes proportions humanoïdes affinées que les héros et animés comme eux :
 * les clips UAL des ennemis d'avant (marche, course, coup d'épée, sort, tir) sont repris sur leur squelette. Le
 * Dragonnet de Quaternius garde son squelette et ses clips. Réunis dans public/models/enemies.glb : un nœud par
 * modèle, corps simplifié à chaque niveau (`<clé>__body__<niveau>`), clips `<clé>__<clip>`, un atlas par modèle.
 * Les poses sont cuites à l'exécution (src/render/enemyModels.ts). `clips` : boucle de marche puis geste éventuel.
 */
export interface EnemySpec {
  /** fichier du miroir KayKit ; pour `rig: 'own'`, chemin dans `MONSTERS` */
  file: string;
  /** `kay` : personnage KayKit, proportions `prop`, clips UAL repris ; `own` : modèle et clips gardés tels quels */
  rig: 'kay' | 'own';
  prop?: Proportions;
  /** texture du personnage quand le fichier ne l'embarque pas */
  texture?: string;
  props: KayProp[];
  /** `src` : bibliothèque UAL du clip ; absente pour `own` (clip du modèle) */
  clips: { src?: 'ual1' | 'ual2'; from: string }[];
  /** niveaux construits (hi : boss ; mid, lo : masse) et taille de l'atlas (256 suffit à la masse, vue de loin) */
  lods: ('hi' | 'mid' | 'lo')[];
  atlas: 256 | 512;
  /** triangles visés propres au modèle, à la place de `ENEMY_LODS` (la brute, grande et rare, garde son visage) */
  tris?: Partial<Record<'hi' | 'mid' | 'lo', number>>;
}
const MASS = { lods: ['mid', 'lo'] as EnemySpec['lods'], atlas: 256 as const };
const BOSS = { lods: ['hi'] as EnemySpec['lods'], atlas: 512 as const };

/** Dragonnet : Ultimate Monsters de Quaternius (CC0), miroir épinglé ; les modèles sont en Git LFS. */
export const MONSTERS = {
  media:
    'https://media.githubusercontent.com/media/series-ai/jam-ready-assets/397bf9ec084a/quaternius-ultimate-monsters/3D/monster',
  raw: 'https://raw.githubusercontent.com/series-ai/jam-ready-assets/397bf9ec084a/quaternius-ultimate-monsters/3D/monster',
  license: 'License.txt',
  source: 'Ultimate Monsters by Quaternius (quaternius.com), CC0',
} as const;

/**
 * Grands gabarits (Rig_Large : brute, chevalier, golem) : affinés plus doucement, ils gardent leur carrure
 * (planche validée par Jimmy, 11 nov.).
 */
export const FIT_LARGE: Proportions = {
  head: [0.7, 0.7, 0.7],
  upperleg: [0.98, 1.7, 0.98],
  lowerleg: [0.95, 1.7, 0.95],
  spine: [0.94, 1.2, 0.92],
  chest: [0.98, 1.12, 0.94],
  upperarm: [0.95, 1.15, 0.95],
  lowerarm: [0.95, 1.15, 0.95],
};

/**
 * Sbires (330 triangles, vus de loin et de haut) : mêmes longueurs humanoïdes, mais tête et membres un peu plus forts
 * que les héros. À ce niveau de détail, un membre affiné se réduit à un fil et la tête, seule partie bien visible
 * depuis la caméra, doit porter l'identité de la créature (essai en jeu du 11 nov.).
 */
export const FIT_MASS: Proportions = {
  head: [0.62, 0.62, 0.62],
  hips: [0.9, 1, 0.88],
  spine: [0.85, 1.45, 0.82],
  chest: [0.95, 1.4, 0.88],
  upperleg: [1.0, 2.6, 1.0],
  lowerleg: [0.95, 2.6, 0.95],
  foot: [0.9, 0.9, 0.9],
  toes: [0.9, 0.9, 0.9],
  upperarm: [0.95, 1.8, 0.95],
  lowerarm: [0.92, 1.8, 0.92],
  wrist: [0.9, 1, 0.9],
  hand: [0.9, 0.9, 0.9],
};

const MM4 = 'assets/kaykit/mystery-monthly-series-4';
const MM5 = 'assets/kaykit/mystery-monthly-series-5';
const MM6 = 'assets/kaykit/mystery-monthly-series-6';
const WALK = { src: 'ual1', from: 'Walk_Loop' } as const;
const JOG = { src: 'ual1', from: 'Jog_Fwd_Loop' } as const;
const SPRINT = { src: 'ual1', from: 'Sprint_Loop' } as const;
const SLASH = { src: 'ual1', from: 'Sword_Attack' } as const;
const CAST = { src: 'ual1', from: 'Spell_Simple_Shoot' } as const;

export const ENEMY_MODELS: Record<string, EnemySpec> = {
  // Spectre : le gros de la horde, un gobelin et sa massue
  goblin: {
    file: `${MM4}/1 - July 2023 - Orc Raider/character/OrcRaider.glb`,
    texture: `${MM4}/1 - July 2023 - Orc Raider/textures/orc_texture_A.png`,
    rig: 'kay',
    prop: FIT_MASS,
    props: [kayR(`${MM4}/1 - July 2023 - Orc Raider/assets/gltf/Orc_Club.gltf.glb`)],
    clips: [JOG],
    ...MASS,
  },
  // Dard : rapide, un loup-garou
  wolf: {
    file: `${MM4}/4 - October 2023 - Werewolf/characters/gltf/Werewolf_Wolf.glb`,
    rig: 'kay',
    prop: FIT_MASS,
    props: [],
    clips: [SPRINT],
    ...MASS,
  },
  // Brute : l'orc et sa hache
  brute: {
    file: `${MM6}/2 - August 2025 - Orc Brute/characters/OrcBrute.glb`,
    rig: 'kay',
    prop: FIT_LARGE,
    props: [kayR(`${MM6}/2 - August 2025 - Orc Brute/assets/gltf/Orc_Axe_Large.gltf`, 1)],
    clips: [WALK],
    ...MASS,
    tris: { mid: 360, lo: 130 },
  },
  // Gardien : le chevalier noir, épée et bouclier
  knight: {
    file: `${MM5}/3 - September 2024 - Black Knight/characters/BlackKnight.glb`,
    rig: 'kay',
    prop: FIT_LARGE,
    props: [
      kayR(`${MM5}/3 - September 2024 - Black Knight/assets/gltf/BlackKnight_Sword_Large.gltf`, 1),
      kayL(`${MM5}/3 - September 2024 - Black Knight/assets/gltf/BlackKnight_Shield_Large.gltf`, 1),
    ],
    clips: [WALK, SLASH],
    ...BOSS,
  },
  // Volant : le dragonnet
  dragon: {
    file: 'Flying/glTF/Dragon.gltf',
    rig: 'own',
    props: [],
    clips: [{ from: 'Fast_Flying' }],
    ...MASS,
  },
  // Cracheur : le ninja lance ses étoiles
  ninja: {
    file: `${MM4}/8 - February 2024 - Ninja/character/Ninja.glb`,
    rig: 'kay',
    prop: FIT_MASS,
    props: [],
    clips: [WALK, { src: 'ual2', from: 'OverhandThrow' }],
    ...MASS,
  },
  // Essaim-mère : la chamane de la meute et son bâton
  shaman: {
    file: `${ADV}/Characters/gltf/Druid.glb`,
    rig: 'kay',
    prop: FIT,
    props: [{ ...kayR(`${ADV}/Assets/gltf/druid_staff.gltf`), upright: true }],
    clips: [WALK, CAST],
    ...BOSS,
  },
  // Colosse : le golem de glace
  golem: {
    file: `${MM5}/7 - January 2025 - FrostGolem/characters/FrostGolem.glb`,
    rig: 'kay',
    prop: FIT_LARGE,
    props: [],
    clips: [WALK, SLASH],
    ...BOSS,
  },
  // Faucheur : le seigneur vampire et sa faux
  vampire: {
    file: `${MM5}/4 - October 2024 - Vampire/characters/Vampire.glb`,
    rig: 'kay',
    prop: FIT,
    props: [{ ...kayR('assets/kaykit/skeletons-1.1/assets/gltf/Skeleton_Scythe.gltf'), upright: true }],
    clips: [SPRINT],
    ...BOSS,
  },
  // Archer : l'homme-oiseau et son arc
  avian: {
    file: `${MM6}/9 - March 2026 - Avian Swordsman/characters/AvianSwordsman.glb`,
    rig: 'kay',
    prop: FIT_MASS,
    props: [kayL(`${ADV}/Assets/gltf/bow_withString.gltf`)],
    clips: [WALK, { src: 'ual1', from: 'Pistol_Shoot' }],
    ...MASS,
  },
  // Sorcier : la démone
  demon: {
    file: `${MM5}/12 - June 2025 - Tiefling/characters/Tiefling.glb`,
    rig: 'kay',
    prop: FIT_MASS,
    props: [],
    clips: [WALK, CAST],
    ...MASS,
  },
};
