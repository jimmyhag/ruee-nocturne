// Silhouettes des ennemis (phase 7) : chaque type est décrit en primitives fusionnées en UNE géométrie à couleurs
// par sommet, instanciée comme avant (un draw call par type). La couleur de sommet est un MULTIPLICATEUR de la
// couleur d'instance (teinte du type, or des élites, blanc du flash) : 1 = corps, < 1 = ombre (cornes, bouche),
// > 1 = clair (yeux, crocs, lames), écrêté à blanc par le shader. Les rayons suivent ENEMIES[].r (collisions).
import type * as THREE from 'three';
import { ENEMIES } from '../sim/balance';
import { merge, paint, primGeometry } from './parts';
import type { Prim } from './parts';

/** Multiplicateur : corps (1), sombre, clair (yeux), lumineux (lames, crocs) */
type Shade = 'body' | 'dark' | 'mid' | 'eye' | 'bright';
const SHADE: Record<Shade, [number, number, number]> = {
  body: [1, 1, 1],
  dark: [0.28, 0.24, 0.34],
  mid: [0.62, 0.6, 0.7],
  eye: [4, 4, 4],
  bright: [2.2, 2.2, 2.2],
};
type EPart = Prim & { shade?: Shade };
const eyes = (x: number, y: number, z: number, s = 0.12): EPart[] => [
  { shape: 'box', size: [s, s, s * 0.5], pos: [-x, y, z], shade: 'eye' },
  { shape: 'box', size: [s, s, s * 0.5], pos: [x, y, z], shade: 'eye' },
];

// index = type (ENEMIES). Origine = centre de rendu (ENEMIES[].y au-dessus du sol) ; +Z = face au joueur.
const LOOKS: EPart[][] = [
  // 0 Spectre : fantôme rond à traîne effilée, deux yeux
  [
    { shape: 'sphere', size: [0.5], pos: [0, 0.1, 0] },
    { shape: 'cone', size: [0.5, 0.8], pos: [0, -0.35, 0], rot: [Math.PI, 0, 0] },
    ...eyes(0.17, 0.18, 0.44, 0.13),
  ],
  // 1 Dard : fuseau pointé vers +Z, ailes claires, dard sombre
  [
    { shape: 'cone', size: [0.36, 0.95], pos: [0, 0, 0.1], rot: [Math.PI / 2, 0, 0] },
    { shape: 'cone', size: [0.1, 0.32], pos: [0, 0, 0.72], rot: [Math.PI / 2, 0, 0], shade: 'dark' },
    { shape: 'box', size: [0.55, 0.04, 0.34], pos: [-0.42, 0.14, -0.1], rot: [0, 0.4, 0.25], shade: 'bright' },
    { shape: 'box', size: [0.55, 0.04, 0.34], pos: [0.42, 0.14, -0.1], rot: [0, -0.4, -0.25], shade: 'bright' },
    ...eyes(0.14, 0.1, 0.3, 0.1),
  ],
  // 2 Brute : masse carrée, cornes, poings
  [
    { shape: 'box', size: [1.5, 1.3, 1.1], pos: [0, -0.15, 0] },
    { shape: 'box', size: [1.0, 0.7, 0.9], pos: [0, 0.75, 0.1] },
    { shape: 'cone', size: [0.18, 0.5], pos: [-0.45, 1.2, 0.1], rot: [0, 0, 0.35], shade: 'dark' },
    { shape: 'cone', size: [0.18, 0.5], pos: [0.45, 1.2, 0.1], rot: [0, 0, -0.35], shade: 'dark' },
    { shape: 'box', size: [0.5, 0.5, 0.5], pos: [-0.95, -0.45, 0.2], shade: 'mid' },
    { shape: 'box', size: [0.5, 0.5, 0.5], pos: [0.95, -0.45, 0.2], shade: 'mid' },
    ...eyes(0.24, 0.78, 0.56, 0.16),
  ],
  // 3 Gardien : cristal octaédrique entouré de quatre éclats (il tourne sur lui-même)
  [
    { shape: 'octa', size: [1.9], pos: [0, 0, 0] },
    { shape: 'octa', size: [0.55], pos: [2.3, 0.3, 0], shade: 'bright' },
    { shape: 'octa', size: [0.55], pos: [-2.3, 0.3, 0], shade: 'bright' },
    { shape: 'octa', size: [0.55], pos: [0, 0.3, 2.3], shade: 'bright' },
    { shape: 'octa', size: [0.55], pos: [0, 0.3, -2.3], shade: 'bright' },
    { shape: 'octa', size: [0.8], pos: [0, 0, 0], shade: 'dark' },
  ],
  // 4 Volant : chauve-souris — petit corps, deux ailes, oreilles
  [
    { shape: 'sphere', size: [0.34], pos: [0, 0, 0] },
    { shape: 'box', size: [1.1, 0.05, 0.5], pos: [-0.72, 0.08, 0], rot: [0, 0, 0.22], shade: 'mid' },
    { shape: 'box', size: [1.1, 0.05, 0.5], pos: [0.72, 0.08, 0], rot: [0, 0, -0.22], shade: 'mid' },
    { shape: 'cone', size: [0.1, 0.3], pos: [-0.16, 0.4, 0], shade: 'dark' },
    { shape: 'cone', size: [0.1, 0.3], pos: [0.16, 0.4, 0], shade: 'dark' },
    ...eyes(0.12, 0.06, 0.3, 0.1),
  ],
  // 5 Cracheur : crapaud trapu, gueule sombre, yeux globuleux
  [
    { shape: 'cyl', size: [0.5, 0.65, 1.1], pos: [0, -0.1, 0] },
    { shape: 'box', size: [0.7, 0.22, 0.3], pos: [0, 0.05, 0.5], shade: 'dark' },
    { shape: 'sphere', size: [0.2], pos: [-0.3, 0.58, 0.25], shade: 'eye' },
    { shape: 'sphere', size: [0.2], pos: [0.3, 0.58, 0.25], shade: 'eye' },
    { shape: 'box', size: [0.1, 0.1, 0.1], pos: [-0.3, 0.6, 0.42], shade: 'dark' },
    { shape: 'box', size: [0.1, 0.1, 0.1], pos: [0.3, 0.6, 0.42], shade: 'dark' },
  ],
  // 6 Essaim-mère : sphère pustuleuse (elle tourne lentement)
  [
    { shape: 'sphere', size: [2.3], pos: [0, 0, 0] },
    { shape: 'sphere', size: [0.7], pos: [1.9, 0.8, 0.9], shade: 'mid' },
    { shape: 'sphere', size: [0.6], pos: [-1.6, 1.2, -1.2], shade: 'mid' },
    { shape: 'sphere', size: [0.75], pos: [-0.4, -1.0, 2.1], shade: 'mid' },
    { shape: 'sphere', size: [0.55], pos: [1.2, -1.4, -1.6], shade: 'mid' },
    { shape: 'sphere', size: [0.5], pos: [-2.0, -0.4, 1.0], shade: 'mid' },
    { shape: 'sphere', size: [0.35], pos: [0.9, 1.0, 2.0], shade: 'eye' },
    { shape: 'sphere', size: [0.35], pos: [-1.2, 0.2, 2.0], shade: 'eye' },
    { shape: 'sphere', size: [0.3], pos: [0.2, 2.1, 0.9], shade: 'eye' },
  ],
  // 7 Colosse : golem de pierre — tronc, tête, bras, yeux (origine à 2,6 du sol)
  [
    { shape: 'box', size: [4.0, 3.4, 3.4], pos: [0, -0.7, 0] },
    { shape: 'box', size: [2.4, 1.9, 2.4], pos: [0, 2.0, 0.2] },
    { shape: 'box', size: [1.3, 3.6, 1.3], pos: [-2.75, -0.5, 0.3], shade: 'mid' },
    { shape: 'box', size: [1.3, 3.6, 1.3], pos: [2.75, -0.5, 0.3], shade: 'mid' },
    { shape: 'box', size: [1.0, 0.5, 1.0], pos: [-1.6, -2.4, 0], shade: 'dark' },
    { shape: 'box', size: [1.0, 0.5, 1.0], pos: [1.6, -2.4, 0], shade: 'dark' },
    ...eyes(0.6, 2.1, 1.42, 0.4),
  ],
  // 8 Faucheur : robe en cône, capuche sombre, faux à lame claire (il tourne sur lui-même)
  [
    { shape: 'cone', size: [1.3, 3.6], pos: [0, -0.3, 0] },
    { shape: 'cone', size: [0.8, 1.3], pos: [0, 1.9, 0], shade: 'dark' },
    { shape: 'sphere', size: [0.5], pos: [0, 1.35, 0.15], shade: 'dark' },
    ...eyes(0.2, 1.4, 0.55, 0.18),
    { shape: 'cyl', size: [0.08, 0.08, 4.4], pos: [1.5, 0.2, 0.2], rot: [0, 0, 0.1], shade: 'dark' },
    { shape: 'box', size: [1.9, 0.18, 0.5], pos: [0.7, 2.35, 0.2], rot: [0, 0, 0.5], shade: 'bright' },
  ],
];

/** Géométrie fusionnée d'un type d'ennemi (une par type, instanciée). */
export function buildEnemyGeometry(type: number): THREE.BufferGeometry {
  const look = LOOKS[type] ?? LOOKS[0];
  const parts = look.map((p) => {
    const [r, g, b] = SHADE[p.shade ?? 'body'];
    return paint(primGeometry(p), r, g, b);
  });
  return merge(parts);
}

/** Une géométrie par type de ENEMIES, dans l'ordre. */
export function buildEnemyGeometries(): THREE.BufferGeometry[] {
  return ENEMIES.map((_, t) => buildEnemyGeometry(t));
}
