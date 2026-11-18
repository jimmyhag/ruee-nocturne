// Lot L5 : apparence des paliers visuels d'arme (docs/specs/l5-paliers-arme.md, décision 4). Rien de nouveau à dessiner :
// les couleurs d'instance des effets d'une arme passent à la teinte de son palier (I argent bleuté, II or, III prisme
// qui tourne lentement) et ses projectiles grandissent de 8 % par palier. Couleurs calculées dans des objets réutilisés,
// une fois par image : zéro allocation.
import * as THREE from 'three';
import { PAL } from './palette';

export const TIER_LOOK = {
  grow: 0.08, // taille des projectiles et objets de l'arme : +8 % par palier (pas les zones, qui disent la portée réelle)
  mix: 0.8, // part de la teinte du palier dans une couleur d'effet (le reste garde un peu de l'arme)
  core: 0.35, // cœurs blancs des lueurs : à peine teintés, ils restent le point chaud
  bright: 0.12, // éclat en plus par palier : le palier se lit aussi à la luminosité
  prismSpeed: 0.1, // palier III : tours de la roue des teintes par seconde (un tour en 10 s)
  prismSpread: 0.09, // décalage de teinte d'un fantôme de traînée au suivant (un arc-en-ciel le long de la traînée)
  prismS: 0.9,
  prismL: 0.62,
  // lueurs ajoutées par un palier aux armes qui n'en ont pas, dans les écrivains que l'arme utilise déjà (aucun appel de
  // dessin en plus) : intensité d'une lueur ajoutée, halo extérieur des Esprits (× halo), anneau intérieur du Vitriol
  // (× rayon de la flaque), disque du Halo (× opacité, par palier)
  halo: 0.35,
  outer: 1.8,
  innerRing: 0.3,
  disc: 0.6,
};

const tint = new THREE.Color();
const scratch = new THREE.Color();
/** Luminance relative (composantes linéaires) : la teinte du palier garde la clarté de la couleur qu'elle remplace. */
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Échelle des projectiles et objets d'une arme au palier `tier` (0 à 3). */
export function tierScale(tier: number): number {
  return 1 + TIER_LOOK.grow * tier;
}

/**
 * `out` = `base` au palier `tier` à l'instant `now` (s) : palier 0, la couleur de l'arme ; I et II, la teinte du palier à
 * la clarté de `base` ; III, une teinte de la roue qui tourne (`phase` en tours la décale : fantômes d'une traînée).
 */
export function tierColor(
  out: THREE.Color,
  base: THREE.Color,
  tier: number,
  now: number,
  mix: number = TIER_LOOK.mix,
  phase = 0,
): THREE.Color {
  out.copy(base);
  if (tier <= 0) return out;
  if (tier >= 3) {
    const h = (now * TIER_LOOK.prismSpeed + phase) % 1;
    tint.setHSL(h < 0 ? h + 1 : h, TIER_LOOK.prismS, TIER_LOOK.prismL);
  } else tint.setHex(PAL.tier[tier - 1]);
  tint.multiplyScalar(lum(base) / Math.max(1e-3, lum(tint)));
  return out.lerp(tint, mix).multiplyScalar(1 + TIER_LOOK.bright * tier);
}

/** Variante en hexadécimal pour les particules (`hex` : couleur de l'arme ; `phase` comme `tierColor`). */
export function tierHex(hex: number, tier: number, now: number, phase = 0): number {
  if (tier <= 0) return hex;
  return tierColor(scratch, scratch.setHex(hex), tier, now, TIER_LOOK.mix, phase).getHex();
}

/** Une couleur d'effet d'arme et sa version au palier, recalculée par `update` (une fois par image). */
export class TierTint {
  /** Couleur à dessiner. */
  readonly c: THREE.Color;
  /** `base` : couleur de l'arme sans palier (un modèle chargé peut la remplacer : elle est relue à chaque mise à jour). */
  constructor(
    public base: THREE.Color,
    private mix: number = TIER_LOOK.mix,
    private phase = 0,
  ) {
    this.c = base.clone();
  }
  update(tier: number, now: number): void {
    tierColor(this.c, this.base, tier, now, this.mix, this.phase);
  }
}
