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
  // crâne : la caméra regarde de haut, la tête est donc renversée en arrière (elle fixe le joueur qui approche), sinon on
  // ne voit qu'une boule blanche. Les pièces sont posées autour de l'origine, puis basculées et montées sur le pieu.
  const head = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.rotateX(-0.62).translate(0, 1.28, 0.04);
  add(head(new THREE.IcosahedronGeometry(0.36, 1).scale(1, 0.94, 1.06)), BONE);
  add(head(new THREE.BoxGeometry(0.5, 0.16, 0.3).translate(0, -0.2, 0.12)), BONE);
  add(head(new THREE.BoxGeometry(0.32, 0.18, 0.26).translate(0, -0.37, 0.13)), BONE_DARK);
  for (let k = -2; k <= 2; k++)
    add(head(new THREE.BoxGeometry(0.048, 0.08, 0.03).translate(k * 0.06, -0.31, 0.275)), BONE);
  // orbites (lumineuses, grandes : c'est elles qu'on lit de loin) et nez
  for (const s of [-1, 1])
    add(head(new THREE.IcosahedronGeometry(0.125, 0).scale(1, 1.1, 0.55).translate(s * 0.15, -0.02, 0.3)), 0xffffff, 1);
  add(head(new THREE.ConeGeometry(0.05, 0.11, 3).rotateX(Math.PI).translate(0, -0.17, 0.35)), WOOD);
  // cornes : la silhouette qui distingue le crâne d'un sanctuaire à quarante mètres
  for (const s of [-1, 1])
    add(head(new THREE.ConeGeometry(0.085, 0.56, 5).rotateZ(-s * 0.95).translate(s * 0.46, 0.24, -0.04)), 0xffffff, 1);
  return { geometry: build(), material: stoneMaterial() };
}
