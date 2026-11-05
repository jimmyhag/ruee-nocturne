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
  bolt: 0xd8f4ff,
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
  // cycle de lumière : crépuscule (0:00) → nuit (8:00) → aube (20:00)
  light: {
    dusk: { fog: 0x182341, sky: 0xffcfa6, ground: 0x24305a, hemi: 1.0, sun: 0xffd6a8, sunI: 0.95 },
    night: { fog: 0x0f1628, sky: 0x8aa2e6, ground: 0x141c36, hemi: 0.9, sun: 0xa8bdff, sunI: 0.65 },
    dawn: { fog: 0x3b3f66, sky: 0xffe4c2, ground: 0x2a2d4e, hemi: 1.0, sun: 0xffc89a, sunI: 0.9 },
  },
};
