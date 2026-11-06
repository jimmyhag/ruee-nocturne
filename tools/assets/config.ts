// Phase 20 : quels modèles KayKit (CC0, Kay Lousberg) entrent dans le jeu, avec quoi.
// Les packs sont clonés par tools/assets/build.ts dans un cache hors dépôt ; seules les sorties (public/models) sont commitées.

export const PACKS = {
  adventurers: 'KayKit-Character-Pack-Adventures-1.0',
  skeletons: 'KayKit-Character-Pack-Skeletons-1.0',
  halloween: 'KayKit-Halloween-Bits-1.0',
  dungeon: 'KayKit-Dungeon-Remastered-1.0',
} as const;
export type PackKey = keyof typeof PACKS;

/**
 * Phase 24 : héros Quaternius (CC0, quaternius.com), personnages modulaires adultes. Ils n'ont aucune animation : on leur
 * cuit celles du personnage du Cyberpunk Game Kit et du Platformer Game Kit (même auteur, mêmes noms d'os) par
 * reciblage (tools/assets/retarget.ts). Les fichiers viennent du miroir public quaternius-showcase (LICENSES.md : CC0).
 */
export const QUATERNIUS = {
  repo: 'https://github.com/trebeljahr/quaternius-showcase',
  dir: 'public/glb',
  source: 'Quaternius (quaternius.com), CC0',
} as const;
export const ANIM_SOURCES = {
  cyber: 'cyberpunk_pack/Character.glb',
  plat: 'platformer_game_pack/Character.glb',
} as const;
type AnimSource = keyof typeof ANIM_SOURCES;
const FIST = { 'Fist.L': 'Hand.L', 'Fist.R': 'Hand.R' }; // le personnage plateforme a des poings, pas de mains

/**
 * Clips produits sur chaque héros, dans l'ordre de HeroAnim (src/render/heroes.ts). `inPlace` : le jeu déplace le
 * héros, le clip ne doit pas le faire (roulade, sauts). `speed` : clip raccourci pour coller à la durée du sort.
 */
export const HERO_CLIPS: {
  to: string;
  src: AnimSource;
  from: string;
  speed?: number;
  inPlace?: boolean;
  names?: Record<string, string>;
}[] = [
  { to: 'Idle', src: 'cyber', from: 'Idle_Neutral' },
  { to: 'Run', src: 'cyber', from: 'Run' },
  { to: 'Jump_Start', src: 'plat', from: 'Jump', inPlace: true, names: FIST },
  { to: 'Jump_Idle', src: 'plat', from: 'Jump_Idle', inPlace: true, names: FIST },
  { to: 'Jump_Land', src: 'plat', from: 'Jump_Land', inPlace: true, names: FIST },
  { to: 'Hit', src: 'cyber', from: 'HitRecieve' },
  { to: 'Death', src: 'cyber', from: 'Death' },
  { to: 'Cheer', src: 'cyber', from: 'Wave' },
  { to: 'Dash', src: 'cyber', from: 'Roll', inPlace: true, speed: 1.6 }, // Bond, Comète
  { to: 'Spin', src: 'cyber', from: 'Sword_Slash' }, // Tourbillon
  { to: 'Cast', src: 'cyber', from: 'Gun_Shoot' }, // Clignement, Éclat
  { to: 'Throw', src: 'cyber', from: 'Punch_Right' }, // Collet, Bourse
  { to: 'Long', src: 'cyber', from: 'Interact' }, // Voile
  { to: 'Raise', src: 'plat', from: 'Wave', names: FIST, speed: 1.5 }, // Pétard (bras levé pendant l'envol)
];

/**
 * Objet tenu : fichier du miroir, os porteur, longueur voulue (m, le long de son axe vertical : les objets Quaternius
 * sont exportés à ≈ 5 m), point de prise (0 = bas, 1 = haut), rotation (degrés, XYZ) et décalage (m) dans le repère
 * de l'os.
 */
export interface HeroProp {
  file: string;
  bone: 'Hand.R' | 'Hand.L';
  size: number;
  grip: number;
  rot: [number, number, number];
  pos?: [number, number, number];
}

/**
 * Un fichier par personnage. `colors` : couleurs de matériaux remplacées (sRGB) pour la tenue de base ; tenue 2 :
 * teinte décalée de `hue` degrés (peau, yeux, cheveux, métaux épargnés), puis `colors2`. `tris` : triangles visés pour
 * le corps et ses objets fusionnés (un seul appel de rendu, plus la coque de contour).
 */
export const HEROES: Record<
  string,
  {
    model: string;
    props: HeroProp[];
    hue: number;
    colors?: Record<string, string>;
    colors2?: Record<string, string>;
    tris: number;
  }
> = {
  eclaireuse: {
    model: 'modular_women/Adventurer.glb',
    props: [{ file: 'medieval_weapons_pack/Dagger.glb', bone: 'Hand.R', size: 0.45, grip: 0.2, rot: [0, 0, -90] }],
    hue: 150,
    tris: 6000,
  },
  bucheron: {
    model: 'modular_men/Farmer.glb',
    props: [{ file: 'medieval_weapons_pack/Axe.glb', bone: 'Hand.R', size: 0.95, grip: 0.15, rot: [0, 0, -90] }],
    hue: 200,
    colors: { Beige: '#8f2a24', LightBlue: '#3b4a63' }, // chemise rouge, salopette en toile
    tris: 6000,
  },
  sorciere: {
    model: 'modular_women/Witch.glb',
    props: [{ file: 'rpg_items_pack/Crystal1.glb', bone: 'Hand.L', size: 0.3, grip: 0.5, rot: [0, 0, 90] }],
    hue: 120,
    tris: 6000,
  },
  veilleuse: {
    model: 'modular_women/Medieval.glb',
    colors2: { LightBrown: '#2f4b6e', DarkBrown: '#1e2f47' }, // cuir bleu nuit
    props: [
      { file: 'survival_pack/WoodenTorch_Fire.glb', bone: 'Hand.L', size: 0.6, grip: 0.2, rot: [0, 0, 90] },
      { file: 'medieval_weapons_pack/Sword.glb', bone: 'Hand.R', size: 1.0, grip: 0.15, rot: [0, 0, -90] },
    ],
    hue: 200,
    tris: 6000,
  },
  braconnier: {
    model: 'modular_men/Adventurer.glb',
    props: [{ file: 'medieval_weapons_pack/Bow_Wooden.glb', bone: 'Hand.L', size: 1.2, grip: 0.5, rot: [0, 0, 0] }],
    hue: 90,
    tris: 6000,
  },
  sapeur: {
    model: 'modular_men/Worker.glb',
    props: [{ file: 'survival_pack/Shovel.glb', bone: 'Hand.R', size: 1.15, grip: 0.75, rot: [0, 0, -90] }],
    hue: 260,
    tris: 6000,
  },
  feufollet: {
    model: 'modular_women/Punk.glb',
    props: [],
    hue: 320,
    colors: { Pink: '#d9561c', Hair_Brown: '#ff8a1f' }, // flamme orange
    colors2: { Pink: '#2f7fd6', Hair_Brown: '#7fd4ff' }, // flamme bleue
    tris: 6000,
  },
  revenante: {
    model: 'modular_women/Formal.glb',
    colors: { LimeGreen: '#8fa3b8', Skin: '#b3bcc4', Red: '#e3e6ec' }, // robe spectrale, peau blême, cheveux blancs
    colors2: { LimeGreen: '#4e3f6e', Skin: '#b3bcc4', Red: '#2b2a33' },
    props: [{ file: 'medieval_weapons_pack/Scythe.glb', bone: 'Hand.R', size: 1.7, grip: 0.4, rot: [0, 0, -90] }],
    hue: 200,
    tris: 6000,
  },
  colporteur: {
    model: 'modular_men/King.glb',
    props: [{ file: 'rpg_items_pack/Pouch.glb', bone: 'Hand.L', size: 0.28, grip: 0.95, rot: [0, 0, 90] }],
    hue: 100,
    tris: 6000,
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
 * Phase 21 : squelettes ennemis (pack Skeletons), réunis dans public/models/enemies.glb. Le corps (parties skinnées)
 * est fusionné puis simplifié à chaque niveau de détail ; accessoires (`keep`, enfants des os) et armes (`weapons`,
 * fichiers du pack attachés à un os) suivent la même réduction. Les poses sont cuites à l'exécution (src/render/enemyModels.ts).
 */
export const ENEMY_MODELS: Record<
  string,
  { file: string; anims: string[]; keep: string[]; weapons: [file: string, bone: string][] }
> = {
  minion: { file: 'Characters/gltf/Skeleton_Minion.glb', anims: ['Walking_D_Skeletons'], keep: [], weapons: [] },
  warrior: {
    file: 'Characters/gltf/Skeleton_Warrior.glb',
    anims: ['Walking_A', '1H_Melee_Attack_Chop', '2H_Melee_Attack_Chop'],
    keep: ['Skeleton_Warrior_Helmet'],
    weapons: [
      ['Skeleton_Axe', 'handslot.r'],
      ['Skeleton_Blade', 'handslot.r'],
      ['Skeleton_Shield_Large_A', 'handslot.l'],
    ],
  },
  mage: {
    file: 'Characters/gltf/Skeleton_Mage.glb',
    anims: ['Walking_A', 'Spellcast_Shoot', 'Spellcast_Summon'],
    keep: ['Skeleton_Mage_Hat'],
    weapons: [['Skeleton_Staff', 'handslot.r']],
  },
  rogue: {
    file: 'Characters/gltf/Skeleton_Rogue.glb',
    anims: ['Running_A', 'Walking_A', '1H_Ranged_Shoot'],
    keep: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'],
    weapons: [
      ['Skeleton_Blade', 'handslot.r'],
      ['Skeleton_Crossbow', 'handslot.r'],
    ],
  },
};
/** Triangles visés pour le corps à chaque niveau : boss (hi), masse en rendu net (mid), masse en pixel (lo). */
export const ENEMY_LODS = { hi: 1800, mid: 330, lo: 110 } as const;

/** Budgets de téléchargement (porte de phase 20). */
// un joueur ne télécharge que son héros et props.glb (vite.config.ts : cache à l'usage, pas de précache)
export const BUDGET = { heroBytes: 450_000, enemyBytes: 700_000, totalBytes: 3_900_000 }; // phase 21 : + enemies.glb
