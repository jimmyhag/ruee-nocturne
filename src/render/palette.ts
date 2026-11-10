// Palette partagée rendu ↔ UI. Les mêmes valeurs sont dans index.html (:root).
/** Phase 44 : décor stylisé d'un monde : modèle et teinte des quatre familles d'arbres, de l'herbe, du buisson. */
interface StageDecor {
  trees: [string, number][];
  grass: number;
  bush: [string, number];
  flowers: string[];
}
export const PAL = {
  // phase 14 : nuit bleue profonde, lanternes chaudes (les anciennes valeurs violettes : 1c1226 / 5d4f7d / ff8a3d / ffcc4d)
  ink: 0x0f1628,
  fog: 0x182341,
  paper: 0xf3ecdc,
  muted: 0x9aa4c2,
  accent: 0xffb347,
  hp: 0xff5d73,
  xp: 0x5fd3ff,
  gold: 0xffd166,
  lantern: 0xffb347, // lumière des lanternes et des halos chauds
  grass1: [94, 152, 64] as const, // phase 44 : vert de la clairière (repli tant que la texture de sol charge)
  grass2: [98, 158, 68] as const,
  tree: 0x2d5248,
  rock: 0x8a7f9a,
  lake: 0x3a8fc4,
  // index = type d'ennemi : une couleur franche par silhouette (survivor-design §6)
  // Spectre, Dard, Brute, Gardien, Volant, Cracheur, Essaim-mère, Colosse, Faucheur
  enemy: [0xc04a8a, 0xffb43d, 0x7a5ad8, 0xff3b5c, 0x9bf0e4, 0x6fd36f, 0xe05aa3, 0x7f8fb3, 0x24192f, 0x3fa7d6, 0xb455e0], // phase 16 : Archer bleu acier, Sorcier violet
  proj: 0xffc62e, // 1.42.1 : or franc (0xffe27a se délavait sur le sol clair)
  trail: [0xffcc4d, 0xffa53d, 0xff7a3d, 0xff5470],
  bolt: 0xf2fbff, // cœur blanc de l'éclair
  boltGlow: 0x46b8ff, // phase 30 : lueur de l'éclair
  boomerang: 0x9fe8b4,
  mine: 0xff6a3d,
  spit: 0x8cf08c,
  arrow: 0xf3ecdc, // phase 16 : flèche de l'Archer, claire sur la nuit bleue
  fire: 0xff8a3d, // phase 16 : boule de feu du Sorcier
  telegraph: 0xff3b5c,
  dust: 0x9aa4c2,
  cream: 0xf3ecdc,
  gem: 0x59d8ff,
  gem2: 0xff7ad0,
  gem3: 0xffcc4d,
  // phase 35 : bonus au sol (ordre Pw : aimant, or, vitesse, gel, rage), gel des ennemis
  power: [0xc08cff, 0xffcc4d, 0x7ee0a1, 0x9fe8ff, 0xff5a3c],
  freeze: 0xd6f4ff,
  // cycle de lumière : crépuscule (0:00) → nuit (8:00) → aube (20:00)
  light: {
    dusk: { fog: 0x182341, sky: 0xffcfa6, ground: 0x24305a, hemi: 1.0, sun: 0xffd6a8, sunI: 0.95 },
    night: { fog: 0x0f1628, sky: 0x8aa2e6, ground: 0x141c36, hemi: 0.9, sun: 0xa8bdff, sunI: 0.65 },
    dawn: { fog: 0x3b3f66, sky: 0xffe4c2, ground: 0x2a2d4e, hemi: 1.0, sun: 0xffc89a, sunI: 0.9 },
  },
  // phase 37 : ambiance de chaque monde, du crépuscule (0:00) à la nuit (fin du chrono), et teinte du sol (multipliée).
  // Phase 44 : scène claire et couleurs franches. Les intensités sont en unités de three (une lumière de 1 éclaire
  // une surface blanche à 1/π) : hémisphère ≈ 2 et soleil ≈ 2,4 donnent une herbe à sa vraie couleur. La nuit reste
  // bleue mais lisible. `decor` : modèles et teintes du décor stylisé (nature.glb) ; arbres dans l'ordre des quatre
  // familles (deux essences communes, deux plus rares).
  stages: [
    {
      // Clairière : herbe verte, lumière dorée du soir puis nuit claire
      dusk: { fog: 0x9fc7c4, sky: 0xfff0d2, ground: 0x6f8a52, hemi: 2.0, sun: 0xffe6b8, sunI: 2.5 },
      night: { fog: 0x3c5a8c, sky: 0xb4ccff, ground: 0x3a5078, hemi: 1.75, sun: 0xcfdcff, sunI: 1.7 },
      tint: 0xffffff,
      decor: {
        trees: [
          ['pine_a', 0x9ad06a],
          ['leafy_b', 0x74c63e],
          ['leafy_a', 0x5fb83a],
          ['birch_a', 0xb4d63e],
        ],
        grass: 0x86d054,
        bush: ['bush_flowers', 0x62b83a],
        flowers: ['flowers_a', 'flowers_b'],
      } as StageDecor,
    },
    {
      // Bois de braise : érables rouges, herbe dorée, tapis de feuilles
      dusk: { fog: 0xd9a070, sky: 0xffe2bc, ground: 0x8a5a36, hemi: 2.0, sun: 0xffd09a, sunI: 2.5 },
      night: { fog: 0x5a3a44, sky: 0xe6bfd2, ground: 0x5a3a3a, hemi: 1.75, sun: 0xffc0a0, sunI: 1.7 },
      tint: 0xffffff,
      decor: {
        trees: [
          ['maple_a', 0xe85a36],
          ['birch_b', 0xf0b82c],
          ['maple_c', 0xe07e2c],
          ['pine_c', 0xc8b060],
        ],
        grass: 0xd6b446,
        bush: ['bush', 0xd0702c],
        flowers: ['flowers_c', 'flowers_b'],
      } as StageDecor,
    },
    {
      // Marais blême : mousse pâle, vase violette, arbres morts
      dusk: { fog: 0x8fb4b0, sky: 0xdaf5e6, ground: 0x4a4a6a, hemi: 1.9, sun: 0xe4ffe9, sunI: 2.2 },
      night: { fog: 0x2f4654, sky: 0xa6dcc8, ground: 0x34304e, hemi: 1.7, sun: 0xc8b8ff, sunI: 1.6 },
      tint: 0xffffff,
      decor: {
        trees: [
          ['dead_a', 0x8f9ab8],
          ['pine_b', 0x4f8292],
          ['dead_b', 0x8894b0],
          ['leafy_c', 0x7fae9e],
        ],
        grass: 0x8dbfae,
        bush: ['bush', 0x5f9486],
        flowers: ['plant', 'flowers_a'],
      } as StageDecor,
    },
  ],
};
