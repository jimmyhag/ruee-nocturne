// Décor procédural (phase 7) : arbres (sapin, feuillu), touffes d'herbe, lanternes sur pied, lucioles.
// Géométries fusionnées à couleurs par sommet (origine au sol) pour l'instancing statique de scene.ts ;
// les lucioles sont un nuage de points mis à jour sur place (aucune allocation par frame).
import * as THREE from 'three';
import { PAL } from './palette';
import { merge, paintHex, primGeometry, withOutline } from './parts';
import { softDiscTexture } from './textures';
import { OUTLINE, OUTLINE_RGB } from './toon';
import type { Prim } from './parts';
import type { World } from '../sim/world';

const TRUNK = 0x5a3d3a;
const WOOD_CUT = 0xc9a77a; // tranche de tronc
const STONE = 0x7d7894; // pierre des murets et menhirs, froide comme la nuit bleue
const MOSS = 0x56806a;
const LEAF2 = 0x37604f; // feuillage un peu plus clair (feuillu)
const build = (parts: (Prim & { color: number })[]) => merge(parts.map((p) => paintHex(primGeometry(p), p.color)));

/** Sapin : tronc + deux cônes étagés ; hauteur 3,1 avant mise à l'échelle. */
export const firGeometry = () =>
  build([
    { shape: 'cyl', size: [0.18, 0.24, 0.9], pos: [0, 0.45, 0], color: TRUNK, seg: 5 },
    { shape: 'cone', size: [1.0, 1.7], pos: [0, 1.45, 0], color: PAL.tree, seg: 5 },
    { shape: 'cone', size: [0.72, 1.4], pos: [0, 2.4, 0], color: PAL.tree, seg: 5 },
  ]);
/** Feuillu : tronc + couronne en deux icosaèdres. */
export const roundTreeGeometry = () =>
  build([
    { shape: 'cyl', size: [0.16, 0.22, 1.3], pos: [0, 0.65, 0], color: TRUNK, seg: 5 },
    { shape: 'ico', size: [1.05], pos: [0, 1.95, 0], color: PAL.tree },
    { shape: 'ico', size: [0.7], pos: [0.55, 2.5, 0.3], color: LEAF2 },
  ]);
/** Touffe d'herbe : trois brins fins (6 triangles chacun). */
export const grassGeometry = () =>
  build([
    { shape: 'cone', size: [0.14, 0.7], pos: [0, 0.35, 0], rot: [0.15, 0, 0], color: 0x6a9e78, seg: 3 },
    { shape: 'cone', size: [0.12, 0.56], pos: [-0.2, 0.28, 0.08], rot: [0, 0, 0.3], color: 0x5a8e6a, seg: 3 },
    { shape: 'cone', size: [0.12, 0.5], pos: [0.19, 0.25, -0.07], rot: [-0.1, 0, -0.3], color: 0x7aaa80, seg: 3 },
  ]);
/** Pied de lanterne (éclairé) ; la tête lumineuse est un mesh à part (MeshBasic). */
export const lampPostGeometry = () =>
  build([
    { shape: 'cyl', size: [0.07, 0.1, 1.6], pos: [0, 0.8, 0], color: 0x3a2a2e, seg: 5 },
    { shape: 'box', size: [0.3, 0.06, 0.3], pos: [0, 0.03, 0], color: 0x3a2a2e },
    { shape: 'cone', size: [0.3, 0.22], pos: [0, 2.05, 0], color: 0x3a2a2e, seg: 5 },
  ]);
export const lampHeadGeometry = () => new THREE.BoxGeometry(0.3, 0.34, 0.3).translate(0, 1.76, 0);
/**
 * Échoppe du marchand (phase 17) : comptoir, deux montants, auvent rayé, le colporteur encapuchonné derrière, des sacs.
 * Origine au sol, face au +z ; contour toon cuit. Une seule instance à la fois (pas d'InstancedMesh) ; la lanterne est
 * un mesh lumineux à part (MERCHANT_LANTERN_Y).
 */
export function stallGeometry(): THREE.BufferGeometry {
  const WOOD = 0x7a5238,
    DARK = 0x3a2a2e,
    CLOTH = 0xc0504d,
    CLOTH2 = 0xe8d8b0,
    CLOAK = 0x4a4f7a;
  const parts: (Prim & { color: number })[] = [
    { shape: 'box', size: [1.9, 0.8, 0.6], pos: [0, 0.4, 0.35], color: WOOD },
    { shape: 'box', size: [2.0, 0.08, 0.7], pos: [0, 0.82, 0.35], color: DARK },
    { shape: 'cyl', size: [0.07, 0.07, 2.3], pos: [-0.9, 1.15, -0.35], color: DARK, seg: 5 },
    { shape: 'cyl', size: [0.07, 0.07, 2.3], pos: [0.9, 1.15, -0.35], color: DARK, seg: 5 },
    { shape: 'cyl', size: [0.06, 0.06, 1.9], pos: [-0.9, 0.95, 0.6], color: DARK, seg: 5 },
    { shape: 'cyl', size: [0.06, 0.06, 1.9], pos: [0.9, 0.95, 0.6], color: DARK, seg: 5 },
    // auvent : trois bandes alternées, penchées vers l'avant
    { shape: 'box', size: [0.7, 0.07, 1.4], pos: [-0.7, 2.15, 0.15], rot: [0.32, 0, 0], color: CLOTH },
    { shape: 'box', size: [0.7, 0.07, 1.4], pos: [0, 2.15, 0.15], rot: [0.32, 0, 0], color: CLOTH2 },
    { shape: 'box', size: [0.7, 0.07, 1.4], pos: [0.7, 2.15, 0.15], rot: [0.32, 0, 0], color: CLOTH },
    // colporteur : manteau, capuche, deux yeux qui luisent
    { shape: 'cone', size: [0.42, 1.25], pos: [0, 0.62, -0.25], color: CLOAK, seg: 6 },
    { shape: 'ico', size: [0.26], pos: [0, 1.38, -0.25], color: CLOAK },
    { shape: 'box', size: [0.07, 0.05, 0.04], pos: [-0.08, 1.38, -0.02], color: 0xffd27a },
    { shape: 'box', size: [0.07, 0.05, 0.04], pos: [0.08, 1.38, -0.02], color: 0xffd27a },
    // marchandises sur le comptoir
    { shape: 'ico', size: [0.14], pos: [-0.55, 0.98, 0.35], color: PAL.gem },
    { shape: 'box', size: [0.24, 0.2, 0.2], pos: [0.5, 0.96, 0.35], rot: [0, 0.4, 0], color: PAL.gold },
    { shape: 'cyl', size: [0.08, 0.1, 0.26], pos: [0.05, 0.99, 0.4], color: 0x9fd6c9, seg: 5 },
    // sacs au pied
    { shape: 'ico', size: [0.28], pos: [-1.2, 0.24, 0.5], color: 0x8a6a4a },
    { shape: 'ico', size: [0.22], pos: [1.2, 0.2, 0.6], color: 0x8a6a4a },
  ];
  return withOutline(build(parts), OUTLINE.decor, OUTLINE_RGB);
}
/** Coffre de carte (phase 18) : caisse de bois cerclée d'or, couvercle bombé, serrure ; origine au sol, contour toon. */
export function mapChestGeometry(): THREE.BufferGeometry {
  const WOOD = 0x6b4630,
    GOLD = PAL.gold;
  return withOutline(
    build([
      { shape: 'box', size: [1.1, 0.62, 0.74], pos: [0, 0.31, 0], color: WOOD },
      { shape: 'cyl', size: [0.37, 0.37, 1.1], pos: [0, 0.62, 0], rot: [0, 0, Math.PI / 2], color: WOOD, seg: 8 },
      { shape: 'box', size: [0.12, 0.66, 0.78], pos: [-0.38, 0.33, 0], color: GOLD },
      { shape: 'box', size: [0.12, 0.66, 0.78], pos: [0.38, 0.33, 0], color: GOLD },
      { shape: 'box', size: [0.2, 0.24, 0.06], pos: [0, 0.5, 0.39], color: GOLD },
    ]),
    OUTLINE.decor,
    OUTLINE_RGB,
  );
}
/** Sanctuaire (phase 18) : six pierres levées en cercle (rayon 1 avant mise à l'échelle) et une dalle centrale. */
export function shrineGeometry(): THREE.BufferGeometry {
  const parts: (Prim & { color: number })[] = [
    { shape: 'cyl', size: [0.55, 0.62, 0.16], pos: [0, 0.08, 0], color: 0x8a86a8, seg: 10 },
  ];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    parts.push({
      shape: 'box',
      size: [0.16, 0.5 + (k % 2) * 0.16, 0.16],
      pos: [Math.sin(a), 0.28, Math.cos(a)],
      rot: [0, a, 0],
      color: STONE,
    });
  }
  return withOutline(build(parts), OUTLINE.decor, OUTLINE_RGB);
}

/** Hauteur de la lanterne pendue à l'auvent de l'échoppe (coin avant droit). */
export const MERCHANT_LANTERN = { x: 1.0, y: 1.75, z: 0.75 };
/**
 * Plateau (phase 11) : fût de roche légèrement évasé (rayon 1, hauteur 1, origine au sol) coiffé d'un disque de mousse
 * qui laisse une lèvre de pierre ; mis à l'échelle (r, h, r) par instance. 10 segments : 80 triangles, 14 instances.
 */
/**
 * Ouvrages de la carte (phase 16) : murets, troncs couchés et menhirs cuits en UNE géométrie statique (un seul appel de
 * rendu pour toute la carte), chaque pièce avec son contour toon. Construit une fois, au chargement du décor.
 */
export function worksGeometry(w: World, gy: (x: number, z: number) => number = () => 0): THREE.BufferGeometry | null {
  const pieces: THREE.BufferGeometry[] = [];
  const piece = (parts: (Prim & { color: number })[]) =>
    pieces.push(withOutline(build(parts), OUTLINE.decor, OUTLINE_RGB));
  for (let i = 0; i < w.walls.length; i++) {
    const s = w.walls[i];
    const dx = s.x2 - s.x1,
      dz = s.z2 - s.z1,
      L = Math.hypot(dx, dz),
      th = Math.atan2(dz, dx),
      mx = (s.x1 + s.x2) / 2,
      mz = (s.z1 + s.z2) / 2;
    const v = ((i * 7) % 5) * 0.06; // teinte variée d'un pan à l'autre
    if (s.kind === 0) {
      // muret de pierres sèches : blocs d'environ 1,1 u, hauteurs et teintes légèrement variées (lisible, pas une dalle)
      const span = L + s.r * 1.6,
        n = Math.max(2, Math.round(span / 1.1)),
        bl = span / n,
        ux = dx / L,
        uz = dz / L;
      const parts: (Prim & { color: number })[] = [];
      for (let b = 0; b < n; b++) {
        const t = -span / 2 + (b + 0.5) * bl,
          hj = s.h * (0.9 + (((i + b) * 7) % 4) * 0.05),
          c = new THREE.Color(STONE).multiplyScalar(0.88 + v + ((i * 3 + b * 5) % 4) * 0.04).getHex();
        parts.push({
          shape: 'box',
          size: [bl * 0.96, hj, s.r * 2 * (0.94 + (b % 2) * 0.06)],
          pos: [mx + ux * t, gy(mx + ux * t, mz + uz * t) + hj / 2, mz + uz * t],
          rot: [0, -th + (((b * 13) % 5) - 2) * 0.02, 0],
          color: c,
        });
      }
      piece(parts);
    } else {
      // tronc couché : écorce, deux tranches claires aux bouts
      const ux = dx / L,
        uz = dz / L;
      piece([
        {
          shape: 'cyl',
          size: [s.r, s.r, L],
          pos: [mx, gy(mx, mz) + s.r, mz],
          rot: [0, -th, Math.PI / 2],
          color: TRUNK,
          seg: 8,
        },
        {
          shape: 'cyl',
          size: [s.r * 0.86, s.r * 0.86, 0.04],
          pos: [s.x1 - ux * 0.01, gy(mx, mz) + s.r, s.z1 - uz * 0.01],
          rot: [0, -th, Math.PI / 2],
          color: WOOD_CUT,
          seg: 8,
        },
        {
          shape: 'cyl',
          size: [s.r * 0.86, s.r * 0.86, 0.04],
          pos: [s.x2 + ux * 0.01, gy(mx, mz) + s.r, s.z2 + uz * 0.01],
          rot: [0, -th, Math.PI / 2],
          color: WOOD_CUT,
          seg: 8,
        },
      ]);
    }
  }
  // menhirs : pierres dressées à six pans, effilées vers le haut, légèrement penchées, coiffées de mousse
  for (let i = w.rockEnd; i < w.obstacles.length; i++) {
    const o = w.obstacles[i];
    const k = i - w.rockEnd,
      h = 2.4 + ((k * 5) % 4) * 0.25,
      a = (k * 2.399) % (Math.PI * 2),
      tilt: [number, number, number] = [((k % 3) - 1) * 0.07, a, ((k % 2) * 2 - 1) * 0.06];
    const g = gy(o.x, o.z);
    piece([
      {
        shape: 'cyl',
        size: [o.r * 0.62, o.r * 1.0, h],
        pos: [o.x, g + h / 2 - 0.1, o.z],
        rot: tilt,
        color: STONE,
        seg: 6,
      },
      { shape: 'cone', size: [o.r * 0.64, 0.45], pos: [o.x, g + h - 0.02, o.z], rot: tilt, color: MOSS, seg: 6 },
    ]);
  }
  return pieces.length ? merge(pieces) : null;
}

/** Nombre de touffes et de lucioles (statique / par frame). */
export const GRASS = 700;
export const FIREFLIES = 90;

/** Lucioles : points additifs qui dérivent autour du joueur, visibles la nuit (opacité pilotée par le cycle). */
export class Fireflies {
  /** Sol local (phase 18) : les lucioles flottent au-dessus des collines. */
  ground: (x: number, z: number) => number = () => 0;
  readonly points: THREE.Points;
  private pos: Float32Array;
  private attr: THREE.BufferAttribute;
  private mat: THREE.PointsMaterial;
  private ox = new Float32Array(FIREFLIES);
  private oz = new Float32Array(FIREFLIES);
  private ph = new Float32Array(FIREFLIES);
  private readonly tile = 44; // motif périodique : les lucioles sont ancrées au monde, pas au joueur

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(FIREFLIES * 3);
    let s = 12345;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < FIREFLIES; i++) {
      this.ox[i] = rnd() * this.tile;
      this.oz[i] = rnd() * this.tile;
      this.ph[i] = rnd() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    this.mat = new THREE.PointsMaterial({
      color: 0xffe27a,
      size: 0.4,
      map: softDiscTexture(), // phase 9 : points ronds et doux
      alphaTest: 0.02,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  /** `night` ∈ [0,1] : 0 = invisibles (crépuscule, aube). */
  update(px: number, pz: number, now: number, night: number): void {
    this.mat.opacity = night * 0.9;
    this.points.visible = night > 0.02;
    if (!this.points.visible) return;
    const T = this.tile;
    const p = this.pos;
    for (let i = 0; i < FIREFLIES; i++) {
      const ph = this.ph[i];
      // copie du motif la plus proche du joueur, puis dérive lente
      let dx = this.ox[i] - px;
      dx -= T * Math.round(dx / T);
      let dz = this.oz[i] - pz;
      dz -= T * Math.round(dz / T);
      const fx = px + dx + Math.sin(now * 0.5 + ph) * 1.6,
        fz = pz + dz + Math.cos(now * 0.4 + ph * 1.7) * 1.6;
      p[i * 3] = fx;
      p[i * 3 + 1] = this.ground(fx, fz) + 0.7 + Math.sin(now * 1.1 + ph * 2) * 0.45 + 0.45;
      p[i * 3 + 2] = fz;
    }
    this.attr.needsUpdate = true;
  }
}
