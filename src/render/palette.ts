// Palette partagée rendu ↔ UI. Les mêmes valeurs sont dans index.html (:root).
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
  grass1: [66, 108, 92] as const, // phase 15 : damier à peine marqué (il lisait « cubique »)
  grass2: [70, 114, 97] as const,
  tree: 0x2d5248,
  rock: 0x8a7f9a,
  lake: 0x3a8fc4,
  // index = type d'ennemi : une couleur franche par silhouette (survivor-design §6)
  // Spectre, Dard, Brute, Gardien, Volant, Cracheur, Essaim-mère, Colosse, Faucheur
  enemy: [0xc04a8a, 0xffb43d, 0x7a5ad8, 0xff3b5c, 0x9bf0e4, 0x6fd36f, 0xe05aa3, 0x7f8fb3, 0x24192f, 0x3fa7d6, 0xb455e0], // phase 16 : Archer bleu acier, Sorcier violet
  proj: 0xffe27a,
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
  // phase 37 : ambiance de chaque monde, du crépuscule (0:00) à la nuit (fin du chrono), et teinte du sol (multipliée)
  stages: [
    {
      // Nuit bleue (celle d'avant la phase 37)
      dusk: { fog: 0x182341, sky: 0xffcfa6, ground: 0x24305a, hemi: 1.0, sun: 0xffd6a8, sunI: 0.95 },
      night: { fog: 0x0f1628, sky: 0x8aa2e6, ground: 0x141c36, hemi: 0.9, sun: 0xa8bdff, sunI: 0.65 },
      tint: 0xffffff,
    },
    {
      // Bois de braise : brume ambrée, lune rousse
      dusk: { fog: 0x33221c, sky: 0xffc08a, ground: 0x44301f, hemi: 1.1, sun: 0xffb070, sunI: 1.05 },
      night: { fog: 0x241812, sky: 0xe8a478, ground: 0x2e1d14, hemi: 1.0, sun: 0xffa060, sunI: 0.85 },
      tint: 0xffe2c4,
    },
    {
      // Marais blême : vert pâle et violet
      dusk: { fog: 0x18262a, sky: 0xc6f2d6, ground: 0x2a2244, hemi: 1.0, sun: 0xd6ffe0, sunI: 0.9 },
      night: { fog: 0x0f1a1c, sky: 0x96d6b8, ground: 0x1c1632, hemi: 0.9, sun: 0xbaa8ff, sunI: 0.7 },
      tint: 0xc8ecd8,
    },
  ],
};
