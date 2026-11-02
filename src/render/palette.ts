// Palette partagée rendu ↔ UI. Les mêmes valeurs sont dans index.html (:root).
export const PAL = {
  ink: 0x1c1226,
  fog: 0x5d4f7d,
  paper: 0xfff1db,
  muted: 0xc7b3cf,
  accent: 0xff8a3d,
  hp: 0xff5470,
  xp: 0x59d8ff,
  gold: 0xffcc4d,
  grass1: [63, 104, 88] as const,
  grass2: [72, 118, 98] as const,
  tree: 0x2d5248,
  rock: 0x8a7f9a,
  lake: 0x3a8fc4,
  // index = type d'ennemi : une couleur franche par silhouette (survivor-design §6)
  // Spectre, Dard, Brute, Gardien, Volant, Cracheur, Essaim-mère, Colosse, Faucheur
  enemy: [0xc04a8a, 0xffb43d, 0x7a5ad8, 0xff3b5c, 0x9bf0e4, 0x6fd36f, 0xe05aa3, 0x7f8fb3, 0x24192f],
  proj: 0xffe27a,
  trail: [0xffcc4d, 0xffa53d, 0xff7a3d, 0xff5470],
  bolt: 0xd8f4ff,
  boomerang: 0x9fe8b4,
  mine: 0xff6a3d,
  spit: 0x8cf08c,
  telegraph: 0xff3b5c,
  dust: 0xc7b3cf,
  cream: 0xfff1db,
  gem: 0x59d8ff,
  gem2: 0xff7ad0,
  gem3: 0xffcc4d,
  // cycle de lumière : crépuscule (0:00) → nuit (8:00) → aube (20:00)
  light: {
    dusk: { fog: 0x5d4f7d, sky: 0xffd9c2, ground: 0x3a2f55, hemi: 0.9, sun: 0xffe2b8, sunI: 0.85 },
    night: { fog: 0x2b2546, sky: 0x8fa3ff, ground: 0x1d1830, hemi: 0.75, sun: 0x9db4ff, sunI: 0.5 },
    dawn: { fog: 0x8a6a7a, sky: 0xffe9c9, ground: 0x4a3350, hemi: 1.0, sun: 0xffc89a, sunI: 0.9 },
  },
};
