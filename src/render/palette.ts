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
  enemy: [0xc04a8a, 0xffb43d, 0x7a5ad8, 0xff3b5c], // Spectre, Dard, Brute, Gardien
  proj: 0xffe27a,
  trail: [0xffcc4d, 0xffa53d, 0xff7a3d, 0xff5470],
  bolt: 0xd8f4ff,
  dust: 0xc7b3cf,
  cream: 0xfff1db,
  gem: 0x59d8ff,
  gem2: 0xff7ad0,
  gem3: 0xffcc4d,
};
