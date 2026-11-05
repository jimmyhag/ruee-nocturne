// Phase 20 : quels modèles KayKit (CC0, Kay Lousberg) entrent dans le jeu, avec quoi.
// Les packs sont clonés par tools/assets/build.ts dans un cache hors dépôt ; seules les sorties (public/models) sont commitées.

export const PACKS = {
  adventurers: 'KayKit-Character-Pack-Adventures-1.0',
  skeletons: 'KayKit-Character-Pack-Skeletons-1.0',
  halloween: 'KayKit-Halloween-Bits-1.0',
  dungeon: 'KayKit-Dungeon-Remastered-1.0',
} as const;
export type PackKey = keyof typeof PACKS;

/** Animations gardées sur chaque héros (les 76 d'origine pèsent 3,5 Mo par fichier). */
export const HERO_ANIMS = [
  'Idle',
  'Running_A',
  'Jump_Start',
  'Jump_Idle',
  'Jump_Land',
  'Hit_A',
  'Death_A',
  'Cheer',
  'Dodge_Forward', // Bond, Comète
  '2H_Melee_Attack_Spin', // Tourbillon
  'Spellcast_Shoot', // Clignement, Éclat
  'Throw', // Collet, Bourse
  'Spellcast_Long', // Voile
  'Spellcast_Raise', // Pétard (bras levés pendant l'envol)
] as const;

/**
 * Un fichier par modèle de héros. `keep` : maillages d'accessoires conservés (les autres sont retirés) ; chaque personnage
 * choisit ensuite les siens à l'exécution (src/render/heroes.ts).
 */
export const HEROES: Record<string, { pack: PackKey; file: string; keep: string[] }> = {
  rogue: { pack: 'adventurers', file: 'Characters/gltf/Rogue.glb', keep: ['Knife', 'Rogue_Cape'] },
  rogue_hooded: {
    pack: 'adventurers',
    file: 'Characters/gltf/Rogue_Hooded.glb',
    keep: ['Knife', 'Rogue_Cape', '1H_Crossbow'],
  },
  barbarian: {
    pack: 'adventurers',
    file: 'Characters/gltf/Barbarian.glb',
    keep: ['2H_Axe', 'Mug', 'Barbarian_Hat', 'Barbarian_Cape'],
  },
  mage: {
    pack: 'adventurers',
    file: 'Characters/gltf/Mage.glb',
    keep: ['2H_Staff', '1H_Wand', 'Mage_Hat', 'Mage_Cape'],
  },
  knight: {
    pack: 'adventurers',
    file: 'Characters/gltf/Knight.glb',
    keep: ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'],
  },
  skeleton_rogue: {
    pack: 'skeletons',
    file: 'Characters/gltf/Skeleton_Rogue.glb',
    keep: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'],
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
};

/** Budgets de téléchargement (porte de phase 20). */
// un joueur ne télécharge que son héros et props.glb (vite.config.ts : cache à l'usage, pas de précache)
export const BUDGET = { heroBytes: 450_000, totalBytes: 3_200_000 };
