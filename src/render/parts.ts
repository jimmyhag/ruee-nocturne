// Primitives low-poly partagées par les modèles procéduraux (personnages, ennemis) : une pièce = forme, taille,
// position, rotation, couleur ; les pièces sont fusionnées en une géométrie à couleurs par sommet.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * `box` : boîte, arrondie (phase 15) quand le modèle le demande (`round` de primGeometry : personnages et boss, un
 * modèle unique ou deux à l'écran) et que sa plus petite dimension dépasse ROUND_MIN ; `plate` : boîte toujours brute
 * (ailes, lames). Les familles instanciées en masse (Brute, Cracheur) restent en boîtes brutes : une boîte arrondie
 * pèse 300 triangles contre 12 (× 2 avec le contour), 120 Brutes arrondies dépasseraient à elles seules le budget.
 */
export type Shape = 'box' | 'plate' | 'cyl' | 'cone' | 'sphere' | 'ico' | 'octa';
/** Sous cette épaisseur une boîte reste brute (plaques fines) ; au-dessus elle est arrondie : rayon = ROUND × min(dims). */
const ROUND_MIN = 0.2;
const ROUND = 0.24;
export interface Prim {
  shape: Shape;
  /** box/plate : [w, h, d] ; cyl : [rTop, rBottom, h] ; cone : [r, h] ; sphere/ico/octa : [r] */
  size: number[];
  pos: [number, number, number];
  rot?: [number, number, number];
  /** segments radiaux (cyl, cone, sphere) ; 7 par défaut, moins pour ce qui est instancié en masse */
  seg?: number;
}

/** Segments par défaut des primitives sans `seg` (phase 9 : 12 en rendu net, 7 en pixel) ; les primitives de masse fixent le leur. */
let detail = 12;
export function setDetail(seg: number): void {
  detail = Math.max(3, seg | 0);
}
export function getDetail(): number {
  return detail;
}

/** Géométrie non indexée d'une primitive, déjà placée. `round` : les boîtes assez épaisses sont arrondies. */
export function primGeometry(p: Prim, round = false): THREE.BufferGeometry {
  const s = p.size;
  const seg = p.seg ?? detail;
  let g: THREE.BufferGeometry;
  switch (p.shape) {
    case 'box': {
      const m = Math.min(s[0], s[1], s[2]);
      // 2 segments d'arrondi en rendu net (300 tris), 1 en rendu pixel (108 tris) : le réglage de qualité agit aussi ici
      g =
        round && m >= ROUND_MIN
          ? new RoundedBoxGeometry(s[0], s[1], s[2], detail > 7 ? 2 : 1, m * ROUND)
          : new THREE.BoxGeometry(s[0], s[1], s[2]);
      break;
    }
    case 'plate':
      g = new THREE.BoxGeometry(s[0], s[1], s[2]);
      break;
    case 'cyl':
      g = new THREE.CylinderGeometry(s[0], s[1], s[2], seg);
      break;
    case 'cone':
      g = new THREE.ConeGeometry(s[0], s[1], seg);
      break;
    case 'sphere':
      g = new THREE.SphereGeometry(s[0], seg, Math.max(3, seg - 2));
      break;
    case 'ico':
      g = new THREE.IcosahedronGeometry(s[0], 0);
      break;
    case 'octa':
      g = new THREE.OctahedronGeometry(s[0], 0);
      break;
  }
  if (p.rot) g.rotateX(p.rot[0]).rotateY(p.rot[1]).rotateZ(p.rot[2]);
  g.translate(p.pos[0], p.pos[1], p.pos[2]);
  return g.index ? g.toNonIndexed() : g; // ico/octa sont déjà non indexés (toNonIndexed avertirait)
}

/** Attribut `color` constant (r, g, b peuvent dépasser 1 : multiplié par la couleur d'instance, puis écrêté). */
export function paint(g: THREE.BufferGeometry, r: number, gr: number, b: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = r;
    arr[i * 3 + 1] = gr;
    arr[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export function paintHex(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  return paint(g, c.r, c.g, c.b);
}

/** Fusionne et libère les morceaux. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts) ?? parts[0];
  for (const p of parts) if (p !== g) p.dispose();
  return g;
}

/**
 * Contour toon cuit dans la géométrie (phase 15) : une coque déplacée le long des normales LISSÉES (moyenne par
 * position : une boîte garde ses coins fermés), au vent inversé pour que seules ses faces arrière restent visibles
 * autour de la silhouette, peinte sombre. Fusionnée à l'original : aucun appel de rendu supplémentaire.
 */
export function withOutline(g: THREE.BufferGeometry, t: number, rgb: [number, number, number]): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.getAttribute('position') as THREE.BufferAttribute;
  const nor = src.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const n = pos.count;
  const out = new Float32Array(n * 3);
  // normales lissées : moyenne des normales de faces par position (clé quantifiée au millième)
  const acc = new Map<string, [number, number, number]>();
  const keys = new Array<string>(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    keys[i] = k;
    const a = acc.get(k) ?? [0, 0, 0];
    if (nor) {
      a[0] += nor.getX(i);
      a[1] += nor.getY(i);
      a[2] += nor.getZ(i);
    }
    acc.set(k, a);
  }
  // triangles au vent inversé : (0, 2, 1)
  for (let tri = 0; tri < n / 3; tri++) {
    const order = [0, 2, 1];
    for (let j = 0; j < 3; j++) {
      const i = tri * 3 + order[j];
      const a = acc.get(keys[i])!;
      const len = Math.hypot(a[0], a[1], a[2]) || 1;
      const o = (tri * 3 + j) * 3;
      out[o] = pos.getX(i) + (a[0] / len) * t;
      out[o + 1] = pos.getY(i) + (a[1] / len) * t;
      out[o + 2] = pos.getZ(i) + (a[2] / len) * t;
    }
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.BufferAttribute(out, 3));
  const nrm = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) nrm[i * 3 + 1] = 1; // normale factice : la couleur sombre ne dépend pas de la lumière
  hull.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (src.getAttribute('uv')) hull.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  paint(hull, rgb[0], rgb[1], rgb[2]);
  if (!src.getAttribute('color')) paint(src, 1, 1, 1);
  const merged = mergeGeometries([src, hull]) ?? src;
  if (src !== g) src.dispose();
  hull.dispose();
  return merged;
}
