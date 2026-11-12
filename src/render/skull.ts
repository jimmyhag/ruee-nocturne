// Phase 48 (demande de Jimmy : « un petit crâne activable sur la carte qui augmente la difficulté »). Un crâne planté
// sur un pieu, sur une dalle : il se lit de loin comme un avertissement, pas comme une récompense. Les orbites, la
// gravure de la dalle et les deux cornes prennent la couleur d'instance (violet : libre ; de plus en plus clair
// pendant la charge ; gris : déjà activé) ; l'os reste os. Une géométrie, un matériau, un appel (écrivain d'instances
// des crânes), sur le patron du sanctuaire. Tourné vers la caméra (+z). Hauteur ≈ 1,7 avant mise à l'échelle.
import * as THREE from 'three';
import { stoneKit, stoneMaterial, STONES } from './totem';

const BONE = 0xe9e3d2,
  BONE_DARK = 0xbdb5a0,
  WOOD = 0x4a3a2c;

export function buildSkull(): { geometry: THREE.BufferGeometry; material: THREE.Material } {
  const { add, build } = stoneKit();
  // dalle hexagonale et sa gravure
  add(new THREE.CylinderGeometry(0.5, 0.58, 0.07, 6).translate(0, 0.035, 0), STONES.dark);
  add(new THREE.CylinderGeometry(0.38, 0.38, 0.014, 6).translate(0, 0.076, 0), 0xffffff, 1);
  add(new THREE.CylinderGeometry(0.29, 0.29, 0.016, 6).translate(0, 0.08, 0), STONES.base);
  // pieu, légèrement penché, et deux os en croix à son pied
  add(new THREE.CylinderGeometry(0.045, 0.07, 1.05, 5).rotateZ(0.05).translate(0, 0.6, 0), WOOD);
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 5).rotateZ(Math.PI / 2 - 0.5).translate(0, 0.2, 0.1), BONE_DARK);
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 5).rotateZ(Math.PI / 2 + 0.5).translate(0, 0.2, 0.1), BONE_DARK);
  // crâne : boîte crânienne, pommettes, mâchoire, dents
  const y = 1.3;
  add(new THREE.IcosahedronGeometry(0.34, 1).scale(1, 0.94, 1.06).translate(0, y, 0), BONE);
  add(new THREE.BoxGeometry(0.46, 0.16, 0.3).translate(0, y - 0.2, 0.1), BONE);
  add(new THREE.BoxGeometry(0.3, 0.17, 0.26).translate(0, y - 0.36, 0.11), BONE_DARK);
  for (let k = -2; k <= 2; k++) add(new THREE.BoxGeometry(0.045, 0.07, 0.03).translate(k * 0.055, y - 0.3, 0.25), BONE);
  // orbites (lumineuses) et nez
  for (const s of [-1, 1])
    add(new THREE.IcosahedronGeometry(0.095, 0).scale(1, 1.05, 0.5).translate(s * 0.13, y - 0.02, 0.3), 0xffffff, 1);
  add(new THREE.ConeGeometry(0.045, 0.1, 3).rotateX(Math.PI).translate(0, y - 0.15, 0.33), WOOD);
  // cornes : la silhouette qui distingue le crâne d'un sanctuaire à quarante mètres
  for (const s of [-1, 1])
    add(new THREE.ConeGeometry(0.07, 0.42, 5).rotateZ(-s * 0.9).translate(s * 0.4, y + 0.22, -0.02), 0xffffff, 1);
  return { geometry: build(), material: stoneMaterial() };
}
