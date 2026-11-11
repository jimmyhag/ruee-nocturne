// Phase 45 (demande de Jimmy : refaire les sanctuaires). Le sanctuaire était un petit autel à bougies (KayKit) posé au
// milieu du cercle : le héros le traversait, et rien ne disait s'il était chargé ou éteint. Ici, un cercle de cinq
// stèles runiques dans la pierre du totem, ouvert vers la caméra pour ne jamais cacher le joueur, sur une dalle
// gravée. Les runes, la gravure et les cristaux qui flottent au-dessus des stèles prennent la couleur d'instance
// (bleu : libre ; de plus en plus clair pendant la charge ; gris : déjà utilisé) ; la pierre reste pierre.
// Une géométrie, un matériau, un appel (l'écrivain d'instances des sanctuaires). Rayon 1 avant mise à l'échelle.
import * as THREE from 'three';
import { stoneKit, stoneMaterial, STONES } from './totem';

/** [angle autour du centre (0 = vers la caméra, +z), hauteur du fût] : fer à cheval, plus haut au fond. */
const PILLARS: [a: number, h: number][] = [
  [Math.PI, 0.95],
  [Math.PI - 1.12, 0.76],
  [Math.PI + 1.12, 0.76],
  [Math.PI - 2.18, 0.48],
  [Math.PI + 2.18, 0.48],
];
const RING = 0.84;

export function buildShrine(): { geometry: THREE.BufferGeometry; material: THREE.Material } {
  const { add, build } = stoneKit();
  // dalle : deux marches hexagonales, une gravure lumineuse en anneau
  add(new THREE.CylinderGeometry(0.7, 0.76, 0.06, 6).translate(0, 0.03, 0), STONES.dark);
  add(new THREE.CylinderGeometry(0.52, 0.56, 0.04, 6).translate(0, 0.08, 0), STONES.base);
  add(new THREE.CylinderGeometry(0.4, 0.4, 0.012, 6).translate(0, 0.104, 0), 0xffffff, 1);
  add(new THREE.CylinderGeometry(0.31, 0.31, 0.014, 6).translate(0, 0.108, 0), STONES.light);
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 6).rotateY(Math.PI / 6).translate(0, 0.118, 0), 0xffffff, 1);
  PILLARS.forEach(([a, h], k) => {
    const turn = Math.PI / 4,
      lean = -0.09; // penchée vers le centre
    const place = (g: THREE.BufferGeometry): THREE.BufferGeometry =>
      g
        .rotateX(lean)
        .rotateY(a)
        .translate(Math.sin(a) * RING, 0, Math.cos(a) * RING);
    const lower = h * 0.66,
      upper = h * 0.26;
    add(place(new THREE.CylinderGeometry(0.19, 0.22, 0.07, 4).rotateY(turn).translate(0, 0.035, 0)), STONES.dark);
    add(
      place(new THREE.CylinderGeometry(0.13, 0.165, lower, 4).rotateY(turn).translate(0, 0.07 + lower / 2, 0)),
      k % 2 ? STONES.light : STONES.base,
    );
    // bandeau de runes, puis la tête de la stèle
    add(
      place(new THREE.CylinderGeometry(0.11, 0.11, 0.045, 4).rotateY(turn).translate(0, 0.09 + lower, 0)),
      0xffffff,
      1,
    );
    add(
      place(new THREE.CylinderGeometry(0.06, 0.13, upper, 4).rotateY(turn).translate(0, 0.11 + lower + upper / 2, 0)),
      STONES.base,
    );
    // œil de la stèle, tourné vers le centre (−z dans le repère de la stèle avant rotation : le centre est derrière)
    add(
      place(new THREE.OctahedronGeometry(0.06, 0).scale(1, 1.6, 0.4).translate(0, 0.07 + lower * 0.55, -0.11)),
      0xffffff,
      1,
    );
    // cristal qui flotte au-dessus
    add(
      place(new THREE.OctahedronGeometry(0.065, 0).scale(1, 1.8, 1).translate(0, 0.11 + h * 0.92 + 0.16, 0)),
      0xffffff,
      1,
    );
  });
  return { geometry: build(), material: stoneMaterial() };
}
