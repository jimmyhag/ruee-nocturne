// Icônes dessinées (phase 28) : une image SVG en ligne par arme, tome, objet, bonus de sanctuaire et sort, plus quelques
// repères (verrou, or, coffre, trophée). Style toon de l'UI : contour sombre, aplats colorés, un reflet. Le fond rond ou
// carré (couleur de l'arme ou de la rareté) reste celui du conteneur `.glyph`. Aucune dépendance, aucune requête réseau :
// chaînes construites une fois au chargement du module. Le glyphe Unicode reste en repli texte (aria-label).
import type { BoonKey, ItemKey, PowerKey, SpellKey, TomeKey, WeaponKey } from '../sim/types';

const INK = '#1b1631';
const PAPER = '#fff1db';
const STEEL = '#e3e9f8';
const GOLD = '#ffcc4d';
const WOOD = '#8a5a36';
const RED = '#ff5470';
const ORANGE = '#ff8a3d';

/** Enveloppe commune : viewBox 64, contour sombre arrondi. */
const svg = (body: string): string =>
  `<svg class="ico" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
/** Reflet blanc sans contour. */
const hl = (d: string): string => `<path d="${d}" fill="#fff" fill-opacity=".6" stroke="none"/>`;
const circle = (cx: number, cy: number, r: number, fill: string): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const path = (d: string, fill: string): string => `<path d="${d}" fill="${fill}"/>`;
/** Trait épais à deux couches (contour puis couleur) : manches, chaînes. */
const pole = (d: string, color: string, w = 5): string =>
  `<path d="${d}" fill="none" stroke-width="${w + 4}"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
/** Étoile à `n` branches (rayons r1 / r2), points calculés une fois. */
function star(cx: number, cy: number, r1: number, r2: number, n: number, fill: string, rot = -Math.PI / 2): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n,
      r = i % 2 ? r2 : r1;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

// formes réutilisées
const SPIRAL = 'M32 32c0-4 6-4 6 0 0 8-12 8-12 0 0-12 18-12 18 0 0 16-24 16-24 0 0-18 30-18 30 0';
const HEART = 'M32 54C12 41 7 28 14 19c6-7 14-6 18 2 4-8 12-9 18-2 7 9 2 22-18 35z';
const heart = (fill = RED) => path(HEART, fill) + hl('M18 22c3-3 7-3 9 1-4 0-6 2-8 5-2-2-2-4-1-6z');
const coin = (cx = 32, cy = 32, r = 20) =>
  circle(cx, cy, r, GOLD) +
  `<circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="#ffe38a" stroke-width="2.5"/>` +
  hl(`M${cx - r * 0.6} ${cy - r * 0.2}a${r * 0.65} ${r * 0.65} 0 0 1 ${r * 0.5} -${r * 0.45}`);
const bag = (fill = '#c08a52') =>
  path('M24 14h16l-4 8c10 4 16 13 16 21 0 8-7 13-20 13S12 51 12 43c0-8 6-17 16-21z', fill) +
  path('M22 12c4 3 16 3 20 0', 'none') +
  circle(32, 42, 7, GOLD) +
  hl('M18 40c1-6 5-11 10-14-3 4-5 8-6 14z');
const magnet = () =>
  path('M14 12h12v22a6 6 0 0 0 12 0V12h12v22a18 18 0 0 1-36 0z', RED) +
  path('M14 12h12v9H14zM38 12h12v9H38z', STEEL) +
  hl('M18 26v8c0 4 2 8 5 10-4-1-7-5-7-10v-8z');
const comet = (fill = '#ff9a5a') =>
  path('M6 58l18-28 10 10z', '#ffd27a') +
  path('M10 50l16-22 6 6z', ORANGE) +
  circle(40, 24, 14, fill) +
  circle(36, 20, 3.5, '#d9733e') +
  circle(46, 28, 2.5, '#d9733e') +
  hl('M30 18a11 11 0 0 1 8-6c-3 3-5 5-6 9z');
const bolt = (fill = '#fff27a') => path('M38 4L14 36h14l-6 24 28-34H35l8-22z', fill) + hl('M36 9L20 31h6z');
const hourglass = () =>
  path('M16 8h32v6H16zM16 50h32v6H16z', WOOD) +
  path('M20 14h24c0 10-8 14-8 18s8 8 8 18H20c0-10 8-14 8-18s-8-8-8-18z', '#bff1ff') +
  path('M25 46h14l-7-8z', GOLD) +
  path('M27 20h10c-1 3-3 5-5 6-2-1-4-3-5-6z', GOLD);
const chevrons = (fill = ORANGE) =>
  path('M10 14l16 18-16 18h12l16-18-16-18z', fill) + path('M30 14l16 18-16 18h12l16-18-16-18z', fill);

export const WEAPON_ICON: Record<WeaponKey, string> = {
  orbe: svg(
    pole('M6 46l14-8', '#ffe8a0', 3) +
      pole('M10 58l16-10', '#ffe8a0', 3) +
      circle(38, 28, 16, GOLD) +
      hl('M28 24a11 11 0 0 1 9-8c-3 3-5 6-6 10z'),
  ),
  aura: svg(
    circle(32, 32, 24, '#bff1ff') +
      circle(32, 32, 15, '#59d8ff') +
      circle(32, 32, 6, PAPER) +
      hl('M14 26a19 19 0 0 1 10-11c-3 4-6 7-7 12z'),
  ),
  lames: svg(
    path('M29 6h6l3 34H26z', STEEL) +
      path('M18 40h28v6H18z', GOLD) +
      path('M29 46h6v9h-6z', WOOD) +
      circle(32, 57, 3, GOLD) +
      hl('M30 9h2l-1 28h-2z'),
  ),
  foudre: svg(bolt()),
  boomerang: svg(path('M8 48L28 8l12 5-16 30 32-1-2 12z', '#7ee0a1') + hl('M14 46L29 13l4 2-14 30z')),
  mines: svg(
    circle(28, 40, 17, '#433f66') +
      pole('M38 26c3-8 10-11 16-9', WOOD, 3) +
      star(54, 15, 8, 3.5, 6, ORANGE) +
      hl('M18 36a11 11 0 0 1 7-8c-2 3-3 5-4 9z'),
  ),
  faux: svg(
    pole('M14 58L40 8', WOOD) +
      path('M36 10c14-2 24 10 22 24-4-9-12-14-24-14z', STEEL) +
      hl('M40 12c7 0 13 4 15 11-4-5-9-8-15-9z'),
  ),
  lance: svg(
    pole('M8 56l34-34', WOOD) +
      path('M56 8l-4 20-6-6-6-6z', '#bff1ff') +
      path('M36 22l6 6-4 4-6-6z', GOLD) +
      hl('M53 12l-2 9-3-3z'),
  ),
  meteores: svg(comet()),
};

/** Tome : livre relié, emblème à la couleur du tome. */
const book = (emblem: string) =>
  svg(
    path('M14 8h34a4 4 0 0 1 4 4v40a4 4 0 0 1-4 4H14z', '#3e3266') +
      path('M14 8h7v48h-7z', '#2a2147') +
      path('M21 50h29v5H21z', PAPER) +
      emblem,
  );
export const TOME_ICON: Record<TomeKey, string> = {
  degats: book(path('M36 14l10 26H26z', GOLD) + path('M31 40h10v5H31z', GOLD)),
  cadence: book(circle(36, 29, 12, '#c7b3cf') + path('M36 21v8l6 4', 'none')),
  projectiles: book(circle(30, 22, 5, '#ffe27a') + circle(42, 26, 5, '#ffe27a') + circle(33, 36, 5, '#ffe27a')),
  vitalite: book(`<g transform="translate(16 10) scale(.62)">${path(HEART, RED)}</g>`),
  mouvement: book(
    path('M24 18l10 11-10 11h7l10-11-10-11z', ORANGE) + path('M35 18l10 11-10 11h6l10-11-10-11z', ORANGE),
  ),
  savoir: book(star(36, 29, 13, 4.5, 4, '#59d8ff')),
  chance: book(
    circle(31, 24, 6, '#7ee0a1') +
      circle(41, 24, 6, '#7ee0a1') +
      circle(36, 33, 6, '#7ee0a1') +
      pole('M36 38l2 8', '#56806a', 2),
  ),
  or: book(circle(36, 29, 11, GOLD) + `<circle cx="36" cy="29" r="6" fill="#ffe38a" stroke-width="2.5"/>`),
  // phase 47
  sang: book(path('M36 13c7 9 10 14 10 20a10 10 0 0 1-20 0c0-6 3-11 10-20z', '#e0354f')),
  givre: book(star(36, 29, 14, 4, 6, '#8fd8ff') + circle(36, 29, 3.5, PAPER)),
  bastion: book(path('M25 15h22v14c0 8-5 13-11 16-6-3-11-8-11-16z', '#b9a37a') + path('M36 19v20', 'none')),
  defi: book(
    path('M26 18h20v12c0 5-2 8-5 9v5H31v-5c-3-1-5-4-5-9z', PAPER) + circle(32, 27, 3, INK) + circle(40, 27, 3, INK),
  ),
};

export const ITEM_ICON: Record<ItemKey, string> = {
  phenix: svg(
    path(
      'M32 58c-14 0-20-10-17-22 2 6 6 8 8 8-3-10 2-22 9-30 0 9 6 12 6 20 2-3 3-6 2-10 7 6 10 14 9 22-1 7-7 12-17 12z',
      ORANGE,
    ) + path('M32 54c-6 0-9-4-8-9 3 3 5 3 6 2-1-5 1-10 4-13 0 5 4 7 4 12 0 5-2 8-6 8z', '#ffd27a'),
  ),
  cape: svg(
    path('M22 10h20l12 42c-14 8-30 8-44 0z', '#7a3fb0') +
      path('M22 10h20l-4 8H26z', '#a46be0') +
      circle(32, 16, 3, GOLD) +
      hl('M24 22l-6 26c3 1 5 2 7 2l3-26z'),
  ),
  lanterne: svg(
    path('M26 6h12v6H26z', '#433f66') +
      path('M20 12h24l-3 6H23z', '#433f66') +
      path('M22 18h20v28H22z', '#ffe38a') +
      path('M20 46h24v8H20z', '#433f66') +
      path('M32 22c4 4 5 8 3 12-1 2-5 2-6 0-2-4-1-8 3-12z', ORANGE) +
      path('M28 18v28M36 18v28', 'none'),
  ),
  coeur: svg(heart()),
  talisman: svg(
    pole('M14 6l18 22 18-22', '#c9a77a', 2) +
      path('M32 26l14 14-14 18-14-18z', '#9e7bff') +
      path('M34 32l-6 9h5l-3 9 8-11h-5l3-7z', '#fff27a'),
  ),
  sablier: svg(hourglass()),
  epines: svg(
    star(32, 32, 26, 12, 8, '#7ee0a1') + circle(32, 32, 9, '#56806a') + hl('M24 26a9 9 0 0 1 6-5c-2 2-3 4-3 7z'),
  ),
  bottes: svg(
    path('M20 6h18v30l16 8v10H12V44l8-4z', '#8a5a36') +
      path('M12 50h42v4H12z', '#433f66') +
      path('M20 6h18v6H20z', '#c9a77a') +
      hl('M24 14h4v22l-4 3z'),
  ),
  oeil: svg(
    path('M4 32c8-12 18-18 28-18s20 6 28 18c-8 12-18 18-28 18S12 44 4 32z', PAPER) +
      circle(32, 32, 11, '#59d8ff') +
      circle(32, 32, 5, INK) +
      `<circle cx="28" cy="28" r="2.5" fill="#fff" stroke="none"/>`,
  ),
  aimant: svg(magnet()),
  fer: svg(
    path('M12 52V30a20 20 0 0 1 40 0v22h-11V30a9 9 0 0 0-18 0v22z', '#a9b0c8') +
      circle(17, 44, 1.8, INK) +
      circle(47, 44, 1.8, INK) +
      circle(17, 34, 1.8, INK) +
      circle(47, 34, 1.8, INK) +
      hl('M15 30a17 17 0 0 1 9-14c-3 4-5 8-5 14z'),
  ),
  bourse: svg(bag()),
  rune: svg(
    path('M18 8h28l6 46H12z', '#7d7894') +
      path('M27 18v28M27 22l10 6-10 6M37 34l-4 12', 'none') +
      hl('M20 12h6l-4 36h-4z'),
  ),
  collier: svg(
    pole('M10 8c2 20 12 30 22 30s20-10 22-30', '#c9a77a', 2) +
      path('M22 36c0-8 4-12 10-12s10 4 10 12c0 4-2 6-4 7v7h-12v-7c-2-1-4-3-4-7z', PAPER) +
      circle(28, 35, 3, INK) +
      circle(36, 35, 3, INK) +
      path('M29 46v4M32 46v4M35 46v4', 'none'),
  ),
  patins: svg(
    path('M14 8h16v18l18 8v10H14z', '#8a5a36') +
      path('M10 50h44', 'none') +
      pole('M10 50h40c4 0 6-3 6-6', STEEL, 3) +
      path('M18 44v6M42 44v6', 'none') +
      path('M44 4c6 4 8 10 4 16-1-4-3-5-5-6 1 4 0 7-3 9 0-6-2-9 4-19z', ORANGE),
  ),
  echarpe: svg(
    path('M8 18c10-6 18 6 28 0s16-6 20-2v10c-4-4-10-4-20 2S18 22 8 28z', '#5fd8ff') +
      path('M38 26l4 28-8-4-4 6-2-26z', '#3fa9d8') +
      hl('M12 20c6-2 11 1 15 3-5 0-9-1-15 1z'),
  ),
  plume: svg(
    path('M50 6C30 8 16 24 14 46l6-4c2-14 10-24 22-30-10 8-16 18-18 30 14-4 24-18 26-36z', PAPER) +
      pole('M8 58l20-24', WOOD, 2),
  ),
  boussole: svg(
    circle(32, 32, 24, '#c9a77a') +
      circle(32, 32, 18, PAPER) +
      path('M32 14l6 18H26z', RED) +
      path('M32 50l-6-18h12z', '#7d7894') +
      circle(32, 32, 3, GOLD),
  ),
  bouclier: svg(
    path('M32 6l22 8v14c0 14-9 24-22 30C19 52 10 42 10 28V14z', '#5fa8ff') +
      path('M32 14l14 5v9c0 10-6 17-14 21z', '#bfe0ff') +
      hl('M16 18l12-4v6l-10 3c0 6 1 11 3 15-4-4-5-12-5-20z'),
  ),
  corne: svg(
    path('M6 46C22 50 38 40 46 12l14 10C50 48 26 58 6 50z', '#f3e2c0') +
      `<ellipse cx="53" cy="17" rx="9" ry="4.5" transform="rotate(36 53 17)" fill="${GOLD}"/>` +
      path('M28 47l4-10 6 2-3 10zM40 38l5-9 5 4-5 8z', '#c9a77a') +
      hl('M10 47c12 1 24-4 32-16-4 9-14 17-32 18z'),
  ),
  // phase 31 : vol de vie, régénération, pourcentages
  croc: svg(
    path('M10 8h44v9H10z', '#8f1d3a') +
      path('M16 17h12l-6 28z', PAPER) +
      path('M36 17h12l-6 28z', PAPER) +
      path('M42 46c4 5 5 8 0 11-5-3-4-6 0-11z', RED) +
      hl('M18 19h4l-3 14z'),
  ),
  calice: svg(
    path('M12 8h40c0 15-9 24-20 24S12 23 12 8z', GOLD) +
      path('M17 13h30c-2 9-8 14-15 14s-13-5-15-14z', RED) +
      path('M29 32h6v13h-6z', GOLD) +
      path('M18 45h28v9H18z', GOLD) +
      hl('M20 15h5c1 5 3 8 6 10-6-1-10-5-11-10z'),
  ),
  mousse: svg(
    path('M6 54c0-16 11-26 26-26s26 10 26 26z', '#5fb36a') +
      circle(22, 42, 4, '#3f8a4c') +
      circle(38, 38, 3, '#3f8a4c') +
      circle(44, 48, 3.5, '#3f8a4c') +
      path('M28 6h8v8h8v8h-8v8h-8v-8h-8v-8h8z', '#7ee0a1') +
      hl('M12 48c2-8 8-13 15-15-5 4-9 9-11 15z'),
  ),
  souffle: svg(
    `<g transform="translate(14 14) scale(.78)">${path(HEART, '#ff8aa0')}</g>` +
      pole('M4 18c10-7 18 5 28-2', '#bff1ff', 3) +
      pole('M30 8c8-5 16 2 26-2', '#bff1ff', 3),
  ),
  pierre: svg(
    path('M6 42L34 14l22 20-28 28z', '#9aa0b8') +
      path('M14 42L34 22l14 12-20 20z', '#c3c8dc') +
      star(50, 12, 9, 3.5, 4, PAPER) +
      hl('M14 41l17-17 3 3-17 17z'),
  ),
  de: svg(
    `<rect x="10" y="10" width="44" height="44" rx="9" fill="${PAPER}"/>` +
      circle(22, 22, 4, INK) +
      circle(42, 22, 4, INK) +
      circle(32, 32, 5, GOLD) +
      circle(22, 42, 4, INK) +
      circle(42, 42, 4, INK),
  ),
  gant: svg(
    path('M16 58V32l-5-13 7-2 5 10V10h7v17V7h7v20V10h7v20l5-9 7 3-9 20v14z', '#7d7894') +
      path('M16 50h31v8H16z', '#4b4766') +
      hl('M24 12h3v15h-3z'),
  ),
  brume: svg(
    pole('M12 6c2 13 9 19 20 19s18-6 20-19', '#c9a77a', 2) +
      path('M32 22c9 11 13 17 13 24a13 13 0 0 1-26 0c0-7 4-13 13-24z', '#b3a2ff') +
      path('M32 32c4 6 6 9 6 13a6 6 0 0 1-12 0c0-4 2-7 6-13z', '#e3dcff') +
      hl('M25 42c0-5 3-9 6-13-2 5-3 9-3 14z'),
  ),
  sandales: svg(
    path('M6 46h36c7 0 12 4 12 9H6z', WOOD) +
      pole('M14 46l8-12M30 46l-6-12', '#c9a77a', 3) +
      path('M30 38c4-17 16-27 28-29-4 6-6 10-12 12 4 2 7 2 11 2-5 7-13 11-27 15z', PAPER) +
      hl('M36 30c4-9 10-15 17-18-5 5-9 10-12 17z'),
  ),
  amulette: svg(
    pole('M14 6c2 12 8 18 18 18s16-6 18-18', '#c9a77a', 2) +
      circle(32, 40, 17, GOLD) +
      circle(32, 40, 11, '#2f5c8a') +
      star(32, 40, 8, 3.5, 5, '#59d8ff') +
      hl('M19 36a14 14 0 0 1 8-9c-3 3-5 6-5 10z'),
  ),
  ecorce: svg(
    path('M12 8h40l-4 40-16 10-16-10z', WOOD) +
      path('M22 14c2 10-2 20 0 34M32 12c-2 14 2 26 0 40M42 14c-2 10 2 20 0 34', 'none') +
      path('M16 8h32v6H16z', '#5fb36a') +
      hl('M17 16h4l-2 26-3-2z'),
  ),
  couronne: svg(
    path('M8 48V18l12 12 12-20 12 20 12-12v30z', GOLD) +
      path('M8 46h48v10H8z', '#b3263f') +
      circle(32, 30, 5, RED) +
      circle(18, 38, 3.5, RED) +
      circle(46, 38, 3.5, RED) +
      hl('M12 26l6 6v12h-6z'),
  ),
  // phase 47 B
  bandage: svg(
    path('M10 24h44v16H10z', PAPER) +
      path('M24 24h16v16H24z', '#f3c9c0') +
      circle(29, 29, 1.5, RED) +
      circle(35, 35, 1.5, RED) +
      circle(35, 29, 1.5, RED) +
      circle(29, 35, 1.5, RED) +
      hl('M13 27h8v3h-8z'),
  ),
  savon: svg(
    path('M10 30c0-6 4-10 10-10h24c6 0 10 4 10 10v10c0 6-4 10-10 10H20c-6 0-10-4-10-10z', '#f7a8d0') +
      circle(46, 14, 5, '#bfe9ff') +
      circle(54, 24, 3, '#bfe9ff') +
      hl('M16 28c1-3 3-4 6-4h10c-6 1-11 3-16 8z'),
  ),
  enclume: svg(
    path('M6 16h40c6 0 12 3 14 8H44c-2 6-6 9-10 10v6h10v10H16V40h10v-6c-8-1-14-6-14-14H6z', '#8b93a8') +
      hl('M10 19h28v3H12z'),
  ),
  cle: svg(
    circle(20, 22, 12, '#b87a4a') +
      circle(20, 22, 4, INK) +
      path('M28 28l24 24-5 5-5-5-4 4-5-5 4-4-14-14z', '#b87a4a') +
      hl('M12 18c2-4 6-6 10-5-4 1-7 3-9 7z'),
  ),
  encens: svg(
    path('M14 44h36c0 8-8 12-18 12s-18-4-18-12z', GOLD) +
      pole('M32 44V28', WOOD, 3) +
      path('M32 26c-8-6 4-10-2-18 8 4 2 10 8 14-2 2-4 4-6 4z', '#c9b3ff') +
      hl('M18 46h10c-1 3-3 5-6 6-2-1-4-3-4-6z'),
  ),
  tirelire: svg(
    path('M10 34c0-10 10-18 24-18s22 8 22 18c0 6-3 11-8 14v6h-8v-3H28v3h-8v-6c-6-3-10-8-10-14z', '#f39ab5') +
      path('M28 14h10v4H28z', GOLD) +
      circle(48, 30, 2, INK) +
      path('M4 30h8v8H4z', '#f39ab5') +
      hl('M16 28c3-5 8-7 14-8-5 3-9 7-11 12z'),
  ),
  fiole: svg(
    path('M26 6h12v6h-2v10l10 18c4 8-2 16-14 16s-18-8-14-16l10-18V12h-2z', '#bfe9ff') +
      path('M22 38h20l4 6c2 6-4 10-14 10s-16-4-14-10z', RED) +
      hl('M24 42c-2 4-1 7 3 9-5-1-8-4-6-8z'),
  ),
  miroir: svg(
    path('M32 4c12 0 18 9 18 20s-6 20-18 20-18-9-18-20S20 4 32 4z', GOLD) +
      path('M32 9c9 0 13 7 13 15s-4 15-13 15-13-7-13-15S23 9 32 9z', '#bfe9ff') +
      pole('M32 44v16', WOOD, 5) +
      hl('M24 16c2-3 5-4 8-4-4 3-6 7-6 12-2-2-3-5-2-8z'),
  ),
  glace: svg(
    path('M32 56C12 43 7 30 14 21c6-7 14-6 18 2 4-8 12-9 18-2 7 9 2 22-18 35z', '#8fd8ff') +
      path('M32 18l4 12 12 2-10 6 2 12-8-8-8 8 2-12-10-6 12-2z', '#e8f8ff') +
      hl('M18 24c3-3 7-3 9 1-4 0-6 2-8 5-2-2-2-4-1-6z'),
  ),
  ailes: svg(
    path('M32 20C22 8 8 8 4 20c8 0 10 4 6 8 8-2 12 2 10 8 6-2 10-4 12-8z', PAPER) +
      path('M32 20c10-12 24-12 28 0-8 0-10 4-6 8-8-2-12 2-10 8-6-2-10-4-12-8z', PAPER) +
      path('M28 22h8v26l-4 8-4-8z', GOLD) +
      hl('M10 18c4-4 10-4 14 0-5 0-9 1-12 4z'),
  ),
  coquille: svg(
    path('M6 44c0-18 12-32 26-32s26 14 26 32z', '#e0a66a') +
      path('M32 12v32M20 16l6 28M44 16l-6 28M10 28l10 16M54 28L44 44', 'none') +
      path('M4 44h56v8H4z', '#b87a4a') +
      hl('M12 36c2-10 8-17 16-20-6 5-9 12-10 20z'),
  ),
  cloche: svg(
    path('M32 8c12 0 16 10 16 22 0 8 4 12 8 14H8c4-2 8-6 8-14 0-12 4-22 16-22z', '#d9a441') +
      circle(32, 52, 5, '#b87a2a') +
      path('M28 4h8v6h-8z', '#b87a2a') +
      hl('M22 18c2-4 5-6 9-6-4 4-6 9-6 16-3-2-4-6-3-10z'),
  ),
  trophee: svg(
    path('M18 8h28v14c0 9-6 16-14 16s-14-7-14-16z', GOLD) +
      path('M18 12H8c0 8 4 12 10 12zM46 12h10c0 8-4 12-10 12z', GOLD) +
      path('M28 38h8v8h-8z', GOLD) +
      path('M18 46h28v10H18z', WOOD) +
      hl('M22 12h5v10c0 4 1 7 3 9-5-2-8-6-8-11z'),
  ),
  idole: svg(
    path('M20 6h24l6 10v22l-8 8v12H22V46l-8-8V16z', '#7a8f6a') +
      circle(25, 24, 4, RED) +
      circle(39, 24, 4, RED) +
      path('M24 36h16v5H24z', INK) +
      hl('M20 12h8l-6 8z'),
  ),
  dent: svg(
    path('M14 8h36c0 22-8 38-18 50C22 46 14 30 14 8z', PAPER) +
      path('M38 34c6 4 14 4 18-2-2 10-10 16-20 14z', ORANGE) +
      path('M44 26c4 2 8 1 10-3 0 6-4 10-10 9z', GOLD) +
      hl('M20 12h6c0 12 2 22 6 30-7-8-12-18-12-30z'),
  ),
  grimoire: svg(
    path('M10 8h36c4 0 8 4 8 8v40H18c-4 0-8-4-8-8z', '#6a3fa0') +
      path('M18 48h36v8H18c-3 0-5-2-5-4s2-4 5-4z', PAPER) +
      star(32, 27, 11, 5, 5, GOLD) +
      hl('M14 14c1-2 3-3 5-3h6c-5 2-9 6-11 12z'),
  ),
};

export const BOON_ICON: Record<BoonKey, string> = {
  hp: svg(heart() + path('M44 6h6v6h6v6h-6v6h-6v-6h-6v-6h6z', '#7ee0a1')),
  dmg: svg(
    pole('M12 52L46 10', STEEL, 4) +
      pole('M52 52L18 10', STEEL, 4) +
      path('M12 46l8 8-6 2-4-4z', GOLD) +
      path('M52 46l-8 8 6 2 4-4z', GOLD),
  ),
  speed: svg(chevrons()),
  cd: svg(
    `<path d="M50 28a18 18 0 1 0-4 16" fill="none" stroke-width="11"/><path d="M50 28a18 18 0 1 0-4 16" fill="none" stroke="#bff1ff" stroke-width="5"/>` +
      path('M58 18l-4 16-14-6z', '#bff1ff'),
  ),
  magnet: svg(magnet()),
  gold: svg(coin()),
  spell: svg(star(32, 32, 26, 8, 4, '#c9b3ff') + star(50, 14, 8, 3, 4, PAPER)),
  // phase 47 : toutes les stats
  regen: svg(heart('#7ee0a1') + path('M27 22h10v8h8v10h-8v8H27v-8h-8V30h8z', PAPER)),
  armor: svg(
    path('M12 10h40v20c0 14-9 22-20 28C21 52 12 44 12 30z', STEEL) +
      path('M32 10v48', 'none') +
      hl('M17 15h10v22c-5-3-9-8-10-14z'),
  ),
  steal: svg(
    path('M32 6c12 15 18 24 18 34a18 18 0 0 1-36 0c0-10 6-19 18-34z', '#e0354f') +
      hl('M24 36c0-6 3-11 7-17-1 6-1 11 0 17z'),
  ),
  crit: svg(star(32, 32, 28, 11, 8, '#ffd23f') + circle(32, 32, 7, PAPER)),
  critdmg: svg(star(32, 32, 28, 9, 5, RED) + star(32, 32, 14, 5, 5, '#ffd23f')),
  elite: svg(
    path('M8 48l4-30 12 14 8-22 8 22 12-14 4 30z', GOLD) + path('M8 48h48v8H8z', '#e0a52e') + circle(32, 40, 4, RED),
  ),
  size: svg(
    `<circle cx="32" cy="32" r="24" fill="none" stroke-width="9"/><circle cx="32" cy="32" r="24" fill="none" stroke="#bff1ff" stroke-width="4"/>` +
      circle(32, 32, 9, '#59d8ff'),
  ),
  jump: svg(path('M32 6l20 22H40v14H24V28H12z', '#7ee0a1') + path('M22 48h20v8H22z', WOOD)),
  spellpow: svg(
    star(32, 30, 26, 10, 6, '#c9b3ff') + circle(32, 30, 8, '#7a4dff') + hl('M28 26a5 5 0 0 1 5-3c-2 2-3 3-3 6z'),
  ),
  luck: svg(
    circle(22, 24, 11, '#7ee0a1') +
      circle(42, 24, 11, '#7ee0a1') +
      circle(22, 40, 11, '#7ee0a1') +
      circle(42, 40, 11, '#7ee0a1') +
      pole('M32 34l8 24', '#56806a', 3),
  ),
  xp: svg(path('M32 4l18 22-18 34-18-34z', '#59d8ff') + path('M32 4l-18 22h36z', '#bff1ff') + hl('M22 28l8 20-12-20z')),
};

export const SPELL_ICON: Record<SpellKey, string> = {
  bond: svg(
    `<path d="M10 52c6-26 30-34 42-22" fill="none" stroke-width="10"/><path d="M10 52c6-26 30-34 42-22" fill="none" stroke="#bff1ff" stroke-width="4"/>` +
      path('M56 18l2 18-16-4z', '#bff1ff') +
      path('M6 54h14', 'none'),
  ),
  tourbillon: svg(
    `<g transform="translate(32 32) scale(1.75) translate(-32 -32)"><path d="${SPIRAL}" fill="none" stroke-width="5.5"/><path d="${SPIRAL}" fill="none" stroke="#9fe8ff" stroke-width="2.4"/></g>`,
  ),
  clignement: svg(bolt('#c9b3ff') + circle(12, 50, 4, '#c9b3ff') + circle(52, 12, 3, '#c9b3ff')),
  eclat: svg(star(32, 32, 27, 11, 8, '#ffe27a') + circle(32, 32, 8, PAPER)),
  collet: svg(
    path('M10 10h44v44H10z', '#c9a77a') +
      path('M10 25h44M10 39h44M25 10v44M39 10v44', 'none') +
      circle(10, 10, 4, '#7d7894') +
      circle(54, 10, 4, '#7d7894') +
      circle(10, 54, 4, '#7d7894') +
      circle(54, 54, 4, '#7d7894'),
  ),
  petard: svg(
    path('M14 30l22-14 12 18-22 14z', RED) +
      path('M20 26l4 6M28 21l4 6M34 39l4 6', 'none') +
      pole('M42 22c4-6 8-8 12-8', WOOD, 2) +
      star(54, 12, 7, 3, 6, GOLD),
  ),
  comete: svg(comet('#9fe8ff')),
  voile: svg(
    path('M42 6a26 26 0 1 0 16 40A20 20 0 0 1 42 6z', '#c9b3ff') +
      star(46, 22, 6, 2.5, 4, PAPER) +
      hl('M18 22a20 20 0 0 1 12-12c-5 5-8 9-9 16z'),
  ),
  bourse: svg(bag()),
};

/** Phase 35 : bonus au sol (dessins propres, distincts des objets et des bonus de sanctuaire). */
export const POWER_ICON: Record<PowerKey, string> = {
  aimant: svg(magnet() + star(52, 12, 8, 3, 4, '#c08cff') + star(10, 54, 6, 2.5, 4, '#c08cff')),
  or: svg(coin(24, 38, 16) + coin(42, 26, 16) + star(54, 52, 7, 2.5, 4, PAPER)),
  vitesse: svg(chevrons('#7ee0a1') + hl('M12 16l12 14-3 3-11-13z')),
  gel: svg(hourglass() + pole('M50 4v20M40 14h20M43 7l14 14M57 7L43 21', '#9fe8ff', 3) + circle(50, 14, 3, PAPER)),
  rage: svg(
    path('M32 4c6 10 18 14 18 30a18 18 0 0 1-36 0c0-8 4-12 8-16 0 6 3 9 6 9-2-9 0-17 4-23z', '#ff5a3c') +
      path('M32 26c3 5 9 8 9 15a9 9 0 0 1-18 0c0-4 2-6 4-8 1 3 2 4 4 4-1-4 0-8 1-11z', GOLD) +
      hl('M20 34c0-5 2-8 5-11-1 4-1 7 0 11z'),
  ),
};

/** Repères hors catalogue. */
export const MISC_ICON = {
  lock: svg(
    pole('M22 30v-8a10 10 0 0 1 20 0v8', '#a9b0c8', 4) +
      path('M14 30h36v26H14z', GOLD) +
      circle(32, 41, 4, INK) +
      path('M32 44v6', 'none'),
  ),
  gold: svg(coin()),
  chest: svg(
    path('M8 28h48v26H8z', '#a8704a') +
      path('M8 28c0-10 8-16 24-16s24 6 24 16z', '#c08a52') +
      path('M8 28h48v6H8z', GOLD) +
      path('M27 30h10v10H27z', GOLD),
  ),
  trophy: svg(
    path('M18 8h28v12c0 10-6 16-14 16s-14-6-14-16z', GOLD) +
      path('M18 12H8c0 8 4 12 10 12M46 12h10c0 8-4 12-10 12', 'none') +
      path('M28 36h8v8h-8zM20 44h24v10H20z', '#c9a77a') +
      hl('M22 12h4v8c0 4 1 7 3 9-4-1-7-5-7-9z'),
  ),
} as const;

/** Icône d'une arme, d'un tome, d'un objet, d'un bonus ou d'un sort ; chaîne vide si inconnue. */
export function iconFor(kind: 'w' | 't' | 'i' | 'b' | 's', key: string): string {
  const table: Record<string, string> =
    kind === 'w'
      ? WEAPON_ICON
      : kind === 't'
        ? TOME_ICON
        : kind === 'i'
          ? ITEM_ICON
          : kind === 'b'
            ? BOON_ICON
            : SPELL_ICON;
  return table[key] ?? '';
}
