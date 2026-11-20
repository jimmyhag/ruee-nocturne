// 1.69.0 (docs/specs/rafales-faux-guidage.md, décision 8) : la vraie faux, un modèle procédural (pas de dépendance, pas
// de fichier à charger) instancié une fois pour toutes les faux de l'écran : un seul appel de dessin.
//
// Repère du modèle, en unités de portée (la scène l'agrandit à la portée de l'arme) : le manche part du héros vers +z, la
// lame est au bout, courbée vers +x (le sens du balayage) et vers le héros. Une silhouette sombre un peu plus grande,
// posée juste dessous, fait le contour vu d'en haut (même géométrie, même matériau : pas de seconde passe).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Couleurs de sommet (la couleur d'instance, celle de l'arme à son palier, les multiplie). */
const BLADE = new THREE.Color(1, 1, 1);
const EDGE = new THREE.Color(1.6, 1.6, 1.6); // tranchant plus clair que la lame (au-delà de 1 : il reste vif une fois teinté)
const HAFT = new THREE.Color(0.42, 0.28, 0.2); // bois du manche
const RIM = new THREE.Color(0.04, 0.02, 0.07); // contour

/** Ligne médiane de la lame, du bout du manche (t = 0) à la pointe (t = 1). */
function spine(t: number, out: THREE.Vector2): THREE.Vector2 {
  return out.set(0.62 * t, 1.02 - 0.36 * t * t);
}

/**
 * Lame en croissant : bord extérieur (côté opposé au héros) puis bord intérieur, `grow` d'épaisseur en plus (contour).
 * Plan (x, z) du modèle ; la forme 2D (X, Y) devient (x, z) après rotation.
 */
function bladeShape(grow: number): THREE.Shape {
  const N = 14,
    p = new THREE.Vector2(),
    q = new THREE.Vector2();
  const outer: THREE.Vector2[] = [],
    inner: THREE.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    spine(t, p);
    spine(Math.min(1, t + 0.01), q);
    const tx = q.x - p.x || 1e-6,
      tz = q.y - p.y,
      l = Math.hypot(tx, tz);
    const nx = -tz / l,
      nz = tx / l; // normale côté +z (extérieur)
    const w = 0.15 * Math.pow(1 - t, 0.75) + 0.012 + grow; // large au talon, pointue au bout
    outer.push(new THREE.Vector2(p.x + nx * w * 0.35, p.y + nz * w * 0.35));
    inner.push(new THREE.Vector2(p.x - nx * w * 0.65, p.y - nz * w * 0.65));
  }
  // pointe un peu prolongée pour le contour
  const tip = spine(1, new THREE.Vector2());
  const s = new THREE.Shape();
  s.moveTo(outer[0].x - grow, outer[0].y);
  for (let i = 1; i <= N; i++) s.lineTo(outer[i].x, outer[i].y);
  s.lineTo(tip.x + grow * 1.5, tip.y - grow * 0.5);
  for (let i = N; i >= 0; i--) s.lineTo(inner[i].x, inner[i].y);
  s.closePath();
  return s;
}

/** Extrusion plate dans le plan (x, z), épaisseur `h` sous y = y0 ; couleur `c` (et `edge` sur le bord extérieur). */
function flat(shape: THREE.Shape, y0: number, h: number, c: THREE.Color, edge?: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(Math.PI / 2); // (X, Y, profondeur) → (x, z, −y)
  g.translate(0, y0, 0);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    // bord extérieur de la lame : au-dessus de la ligne médiane (z plus grand que la courbe à ce x)
    const x = pos.getX(i),
      z = pos.getZ(i);
    const t = Math.min(1, Math.max(0, x / 0.62));
    const k = edge && z > 1.02 - 0.36 * t * t + 0.01 ? edge : c;
    col[i * 3] = k.r;
    col[i * 3 + 1] = k.g;
    col[i * 3 + 2] = k.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

/** Pavé de couleur unie (manche, poignée), centré en (x, y, z). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z); // sans index, comme l'extrusion (fusion)
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

/** Géométrie de la faux (≈ 200 triangles), couleurs par sommet, contour compris. */
export function scytheGeometry(): THREE.BufferGeometry {
  const R = 0.022; // marge du contour
  const parts = [
    // contour : silhouettes sombres juste dessous
    flat(bladeShape(R), -0.035, 0.03, RIM),
    box(0.075 + 2 * R, 0.04, 0.95 + 2 * R, 0, -0.045, 0.55, RIM),
    box(0.24 + 2 * R, 0.04, 0.06 + 2 * R, 0, -0.045, 0.52, RIM),
    // faux
    flat(bladeShape(0), 0.02, 0.04, BLADE, EDGE),
    box(0.075, 0.06, 0.95, 0, 0, 0.55, HAFT), // manche, du héros au talon de la lame
    box(0.24, 0.05, 0.06, 0, 0.01, 0.52, HAFT), // poignée du milieu
  ];
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}
