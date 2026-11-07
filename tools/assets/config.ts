// Phase 20 : quels modèles KayKit (CC0, Kay Lousberg) entrent dans le jeu, avec quoi.
// Les packs sont clonés par tools/assets/build.ts dans un cache hors dépôt ; seules les sorties (public/models) sont commitées.

export const PACKS = {
  adventurers: 'KayKit-Character-Pack-Adventures-1.0',
  halloween: 'KayKit-Halloween-Bits-1.0',
  dungeon: 'KayKit-Dungeon-Remastered-1.0',
} as const;
export type PackKey = keyof typeof PACKS;

/**
 * Phase 25 : héros Quaternius « HD » (CC0, quaternius.com, versions Standard gratuites, 2025) :
 * - Universal Base Characters : tête, yeux, sourcils, coiffures ;
 * - Modular Character Outfits – Fantasy : tenues Rôdeur et Paysan, homme et femme ;
 * - Universal Animation Library 1 et 2 : 88 clips sur le même squelette (aucun reciblage).
 * quaternius.com est injoignable depuis l'environnement de build : les fichiers viennent d'un dépôt public qui les
 * redistribue tels quels (licences CC0 jointes). Les objets tenus viennent du miroir quaternius-showcase.
 */
export const QUATERNIUS = {
  source: 'Quaternius (quaternius.com), CC0',
  /** dépôt git, dossier racine des fichiers dans ce dépôt */
  mirrors: {
    kit: { repo: 'https://github.com/kirbycope/godot-3d-player-controller-v2', dir: 'assets' },
    showcase: { repo: 'https://github.com/trebeljahr/quaternius-showcase', dir: 'public/glb' },
  },
  /** fichiers du kit (relatifs à mirrors.kit.dir) */
  base: {
    M: 'universal_base_characters/Base Characters/Superhero_Male_FullBody.gltf',
    F: 'universal_base_characters/Base Characters/Superhero_Female_FullBody.gltf',
  },
  outfit: (sex: 'M' | 'F', kind: 'Ranger' | 'Peasant') =>
    `modular_character_outfits/Outfits/${sex === 'M' ? 'Male' : 'Female'}_${kind}.gltf`,
  hair: (name: string) => `universal_base_characters/Hairstyles/Rigged/${name}.gltf`,
  anims: {
    ual1: 'universal_animation_library/UAL1.glb',
    ual2: 'universal_animation_library_2/UAL2.glb',
  },
  licenses: [
    'universal_base_characters/License_Standard.txt',
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
 * Objet tenu : fichier du miroir showcase, os porteur, longueur voulue (m, le long de son axe vertical), point de
 * prise (0 = bas, 1 = haut), rotation (degrés, XYZ) et décalage (m) dans le repère de l'os.
 */
export interface HeroProp {
  file: string;
  bone: 'hand_r' | 'hand_l';
  size: number;
  grip: number;
  rot: [number, number, number];
  pos?: [number, number, number];
}

/** Teinte d'une zone de texture : décalage de teinte (degrés), saturation et luminosité multipliées. */
export interface Tint {
  hue?: number;
  sat?: number;
  light?: number;
}

/**
 * Un fichier par personnage : sexe, tenue (capuche du Rôdeur en option, parties retirées), coiffures, couleurs (tenue,
 * cheveux, peau), repos propre au personnage, objets tenus. `tris` : triangles visés pour le tout, fusionné en une
 * primitive (un appel de rendu, plus la coque de contour). La seconde tenue est teintée à l'exécution (heroes.ts).
 */
export interface HeroSpec {
  sex: 'M' | 'F';
  outfit: 'Ranger' | 'Peasant';
  hood?: boolean;
  /** maillages de la tenue retirés (sous-chaîne du nom : 'Pauldron', 'Bracer'…) */
  hide?: string[];
  hair: string[];
  hairColor?: string;
  outfitTint?: Tint;
  skinTint?: Tint;
  idle?: { src: 'ual1' | 'ual2'; from: string };
  props: HeroProp[];
  tris: number;
}

const R = (file: string, size: number, grip: number): HeroProp => ({
  file,
  bone: 'hand_r',
  size,
  grip,
  rot: [0, 0, 0],
});
const L = (file: string, size: number, grip: number): HeroProp => ({
  file,
  bone: 'hand_l',
  size,
  grip,
  rot: [0, 0, 0],
});

export const HEROES: Record<string, HeroSpec> = {
  eclaireuse: {
    sex: 'F',
    outfit: 'Ranger',
    hood: false,
    hair: ['Hair_Buns'],
    hairColor: '#7a3b1e',
    props: [R('medieval_weapons_pack/Dagger.glb', 0.45, 0.2)],
    tris: 9000,
  },
  bucheron: {
    sex: 'M',
    outfit: 'Peasant',
    hair: ['Hair_Buzzed', 'Hair_Beard'],
    hairColor: '#5a2e14',
    outfitTint: { hue: -25, sat: 1.4 },
    props: [R('medieval_weapons_pack/Axe.glb', 0.95, 0.15)],
    tris: 9000,
  },
  sorciere: {
    sex: 'F',
    outfit: 'Peasant',
    hair: ['Hair_Long'],
    hairColor: '#1e1a26',
    outfitTint: { hue: 245, sat: 1.3, light: 0.85 },
    props: [L('rpg_items_pack/Crystal1.glb', 0.18, 0.5)],
    tris: 9000,
  },
  veilleuse: {
    sex: 'F',
    outfit: 'Ranger',
    hair: [],
    outfitTint: { hue: 160, sat: 0.8 },
    idle: { src: 'ual1', from: 'Idle_Torch_Loop' },
    props: [L('survival_pack/WoodenTorch_Fire.glb', 0.6, 0.2), R('medieval_weapons_pack/Sword.glb', 1.0, 0.15)],
    tris: 9000,
  },
  braconnier: {
    sex: 'M',
    outfit: 'Ranger',
    hair: ['Hair_Beard'],
    hairColor: '#3a2614',
    outfitTint: { hue: -85, sat: 0.55, light: 0.85 }, // cuir brun
    props: [L('medieval_weapons_pack/Bow_Wooden.glb', 1.2, 0.5)],
    tris: 9000,
  },
  sapeur: {
    sex: 'M',
    outfit: 'Peasant',
    hide: [],
    hair: ['Hair_SimpleParted', 'Hair_Beard'],
    hairColor: '#24201c',
    outfitTint: { hue: 190, sat: 0.9, light: 0.75 }, // bleu de travail
    props: [{ ...R('survival_pack/Shovel.glb', 1.15, 0.75), rot: [180, 0, 0] }], // pelle : fer vers le bas
    tris: 9000,
  },
  feufollet: {
    sex: 'F',
    outfit: 'Peasant',
    hair: ['Hair_BuzzedFemale'],
    hairColor: '#ff7a1a',
    outfitTint: { hue: -10, sat: 1.6, light: 1.05 },
    props: [],
    tris: 9000,
  },
  revenante: {
    sex: 'F',
    outfit: 'Ranger',
    hair: [],
    outfitTint: { hue: 200, sat: 0.45, light: 1.2 }, // spectre bleuté
    skinTint: { hue: 180, sat: 0.2, light: 1.1 },
    idle: { src: 'ual2', from: 'Zombie_Idle_Loop' },
    props: [{ ...R('medieval_weapons_pack/Scythe.glb', 1.7, 0.4), rot: [180, 0, 0] }], // faux : lame en haut
    tris: 9000,
  },
  colporteur: {
    sex: 'M',
    outfit: 'Ranger',
    hood: false,
    hair: ['Hair_SimpleParted', 'Hair_Beard'],
    hairColor: '#b9b6b0',
    outfitTint: { hue: -115, sat: 1.25, light: 1.0 }, // pourpre et or
    idle: { src: 'ual2', from: 'Idle_FoldArms_Loop' },
    props: [L('rpg_items_pack/Pouch.glb', 0.28, 0.95)],
    tris: 9000,
  },
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
  shrine: { pack: 'halloween', file: 'Assets/gltf/shrine_candles.gltf', tris: 2500 },
  fence: { pack: 'halloween', file: 'Assets/gltf/fence.gltf', tris: 400 },
  chest: { pack: 'dungeon', file: 'Assets/gltf/chest.glb', tris: 2000 }, // 40 coffres au plus à l'écran
  chest_gold: { pack: 'dungeon', file: 'Assets/gltf/chest_gold.glb', tris: 2000 },
  barrel: { pack: 'dungeon', file: 'Assets/gltf/barrel_large.gltf.glb', tris: 800 },
  crates: { pack: 'dungeon', file: 'Assets/gltf/crates_stacked.gltf.glb', tris: 1500 }, // échoppe : une seule à la fois
  coins: { pack: 'dungeon', file: 'Assets/gltf/coin_stack_large.gltf.glb', tris: 2000 },
  sword: { pack: 'adventurers', file: 'Assets/gltf/sword_1handed.gltf', tris: 400 },
  axe: { pack: 'adventurers', file: 'Assets/gltf/axe_1handed.gltf', tris: 400 },
  bomb: { pack: 'adventurers', file: 'Assets/gltf/smokebomb.gltf', tris: 500 },
  skull: { pack: 'halloween', file: 'Assets/gltf/skull.gltf', tris: 500 }, // phase 21 : le Volant (120 à l'écran au plus)
};

/**
 * Phase 26 : ennemis morts-vivants assortis aux héros HD, assemblés avec le même kit Quaternius (tenue, tête, coiffure,
 * objets tenus ; peau verdâtre, vêtements ternis) et animés par les mêmes bibliothèques (marche de zombie, griffure,
 * coups d'épée, sorts). Réunis dans public/models/enemies.glb : un nœud par modèle, corps simplifié à chaque niveau
 * (`<clé>__body__<niveau>`), clips `<clé>__<clip>`, atlas 512². Les poses sont cuites à l'exécution
 * (src/render/enemyModels.ts). `clips` : boucle de marche puis geste éventuel.
 */
export type EnemySpec = Omit<HeroSpec, 'idle' | 'tris'> & {
  clips: { src: 'ual1' | 'ual2'; from: string }[];
  /** niveaux construits (hi : boss ; mid, lo : masse) et taille de l'atlas (256 suffit à la masse, vue de loin) */
  lods: ('hi' | 'mid' | 'lo')[];
  atlas: 256 | 512;
};
const MASS = { lods: ['mid', 'lo'] as EnemySpec['lods'], atlas: 256 as const };
const BOSS = { lods: ['hi'] as EnemySpec['lods'], atlas: 512 as const };
const BOTH = { lods: ['hi', 'mid', 'lo'] as EnemySpec['lods'], atlas: 512 as const };

const ZOMBIE: Tint = { hue: 60, sat: 0.6, light: 1.0 }; // peau gris-vert
const DIRTY: Tint = { sat: 0.6, light: 0.9 }; // vêtements ternis
const Z_WALK = { src: 'ual2', from: 'Zombie_Walk_Fwd_Loop' } as const;
const WALK = { src: 'ual1', from: 'Walk_Loop' } as const;
const SPRINT = { src: 'ual1', from: 'Sprint_Loop' } as const;

export const ENEMY_MODELS: Record<string, EnemySpec> = {
  // Spectre : le gros de la horde
  zombie: {
    sex: 'M',
    outfit: 'Peasant',
    hair: ['Hair_Buzzed'],
    hairColor: '#4a4a44',
    skinTint: ZOMBIE,
    outfitTint: DIRTY,
    props: [],
    clips: [Z_WALK, { src: 'ual2', from: 'Zombie_Scratch' }],
    ...MASS,
  },
  // Cracheur : crache à distance
  zombief: {
    sex: 'F',
    outfit: 'Peasant',
    hair: ['Hair_Long'],
    hairColor: '#3a3833',
    skinTint: ZOMBIE,
    outfitTint: { hue: 200, sat: 0.6, light: 0.9 },
    props: [],
    clips: [Z_WALK, { src: 'ual1', from: 'Spell_Simple_Shoot' }],
    ...MASS,
  },
  // Dard : rapide, petit, une dague
  runner: {
    sex: 'F',
    outfit: 'Ranger',
    hood: false,
    hide: ['Pauldron'],
    hair: ['Hair_BuzzedFemale'],
    hairColor: '#2a2622',
    skinTint: ZOMBIE,
    outfitTint: { hue: 140, sat: 0.7, light: 0.9 },
    props: [R('medieval_weapons_pack/Dagger.glb', 0.45, 0.2)],
    clips: [SPRINT],
    ...MASS,
  },
  // Brute et Colosse : la hache
  brute: {
    sex: 'M',
    outfit: 'Peasant',
    hair: ['Hair_Beard'],
    hairColor: '#2e2a26',
    skinTint: ZOMBIE,
    outfitTint: { hue: -20, sat: 0.8, light: 0.85 },
    props: [R('medieval_weapons_pack/Axe.glb', 1.1, 0.15)],
    clips: [WALK, { src: 'ual1', from: 'Sword_Attack' }],
    ...BOTH,
  },
  // Gardien : épée et bouclier
  knight: {
    sex: 'M',
    outfit: 'Ranger',
    hair: [],
    skinTint: ZOMBIE,
    outfitTint: { hue: 180, sat: 0.4, light: 1.0 },
    props: [R('medieval_weapons_pack/Sword.glb', 1.1, 0.15), L('medieval_weapons_pack/Shield_Heater.glb', 0.75, 0.5)],
    clips: [WALK, { src: 'ual1', from: 'Sword_Attack' }],
    ...BOSS,
  },
  // Archer : l'arc
  archer: {
    sex: 'M',
    outfit: 'Ranger',
    hair: [],
    skinTint: ZOMBIE,
    outfitTint: { hue: -60, sat: 0.6, light: 0.9 },
    props: [L('medieval_weapons_pack/Bow_Wooden.glb', 1.2, 0.5)],
    clips: [WALK, { src: 'ual1', from: 'Pistol_Shoot' }],
    ...MASS,
  },
  // Sorcier et Essaim-mère : cristal
  caster: {
    sex: 'F',
    outfit: 'Ranger',
    hair: [],
    skinTint: ZOMBIE,
    outfitTint: { hue: 250, sat: 0.9, light: 0.9 },
    props: [L('rpg_items_pack/Crystal1.glb', 0.25, 0.5)],
    clips: [WALK, { src: 'ual1', from: 'Spell_Simple_Shoot' }],
    ...BOTH,
  },
  // Faucheur : la faux
  reaper: {
    sex: 'M',
    outfit: 'Ranger',
    hair: [],
    skinTint: { hue: 180, sat: 0.15, light: 0.8 },
    outfitTint: { sat: 0.15, light: 0.55 },
    props: [{ ...R('medieval_weapons_pack/Scythe.glb', 1.8, 0.4), rot: [180, 0, 0] }],
    clips: [SPRINT],
    ...BOSS,
  },
};
/** Triangles visés pour le corps à chaque niveau : boss (hi), masse en rendu net (mid), masse en pixel (lo). */
export const ENEMY_LODS = { hi: 1800, mid: 330, lo: 110 } as const;

/** Budgets de téléchargement (porte de phase 20). */
// un joueur ne télécharge que son héros et props.glb (vite.config.ts : cache à l'usage, pas de précache)
// phase 25 : héros texturés (atlas JPEG) : 700 ko par héros, 7 Mo au total (un joueur ne charge que son héros)
export const BUDGET = { heroBytes: 700_000, enemyBytes: 750_000, totalBytes: 7_500_000 }; // phase 26 : ennemis texturés
