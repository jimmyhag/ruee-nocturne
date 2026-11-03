// Primitives low-poly partagées par les modèles procéduraux (personnages, ennemis) : une pièce = forme, taille,
// position, rotation, couleur ; les pièces sont fusionnées en une géométrie à couleurs par sommet.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Shape = 'box' | 'cyl' | 'cone' | 'sphere' | 'ico' | 'octa';
export interface Prim {
  shape: Shape;
  /** box : [w, h, d] ; cyl : [rTop, rBottom, h] ; cone : [r, h] ; sphere/ico/octa : [r] */
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

/** Géométrie non indexée d'une primitive, déjà placée. */
export function primGeometry(p: Prim): THREE.BufferGeometry {
  const s = p.size;
  const seg = p.seg ?? detail;
  let g: THREE.BufferGeometry;
  switch (p.shape) {
    case 'box':
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
