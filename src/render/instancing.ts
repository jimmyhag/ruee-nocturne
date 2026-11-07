import * as THREE from 'three';

const WHITE = new THREE.Color(0xffffff);

/** InstancedMesh prêt pour un usage dynamique : couleurs allouées à pleine capacité, count = 0. */
export function makeInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number): THREE.InstancedMesh {
  // capacité ≥ 1 : à 0, `instanceColor` resterait null (création paresseuse dans setColorAt) et le rendu planterait
  const n = Math.max(1, cap);
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < n; i++) m.setColorAt(i, WHITE);
  m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}

/** Écriture rapide d'une instance : position, rotation Y, scale uniforme (ou non), couleur. */
export class InstanceWriter {
  n = 0;
  /** index de la dernière instance écrite, -1 si le dernier put a été refusé (capacité pleine) */
  last = -1;
  private d = new THREE.Object3D();
  constructor(public mesh: THREE.InstancedMesh) {}
  begin(): void {
    this.n = 0;
  }
  put(
    x: number,
    y: number,
    z: number,
    ry: number,
    s: number,
    color: THREE.Color,
    rx = 0,
    rz = 0,
    sy = s,
    sz = s,
  ): void {
    if (this.n >= this.mesh.instanceMatrix.count) {
      this.last = -1;
      return;
    }
    this.last = this.n;
    const d = this.d;
    d.position.set(x, y, z);
    d.rotation.set(rx, ry, rz, 'XZY'); // inclinaison (rx, rz) indépendante de la rotation ry (phase 18 : ombres sur les pentes)
    d.scale.set(s, sy, sz);
    d.updateMatrix();
    this.mesh.setMatrixAt(this.n, d.matrix);
    this.mesh.setColorAt(this.n, color);
    this.n++;
  }
  // plages d'envoi réutilisées (phase 30) : seules les n instances écrites partent vers la carte graphique
  private rangeM = { start: 0, count: 0 };
  private rangeC = { start: 0, count: 0 };
  end(): void {
    this.mesh.count = this.n;
    // phase 30 : vide, rien à envoyer (count = 0 ne dessine rien). Avant, chaque écrivain renvoyait toute sa capacité
    // à chaque image, même vide : sur un rendu logiciel (SwiftShader), 18 → 8 fps avec un écrivain de 1 024 sprites
    if (this.n === 0) return;
    const m = this.mesh.instanceMatrix,
      c = this.mesh.instanceColor!;
    // une seule plage par attribut, objet réutilisé (addUpdateRange en allouerait un à chaque image) ; three vide la
    // liste après l'envoi
    this.rangeM.count = this.n * 16;
    this.rangeC.count = this.n * 3;
    m.updateRanges.length = 0;
    m.updateRanges.push(this.rangeM);
    c.updateRanges.length = 0;
    c.updateRanges.push(this.rangeC);
    m.needsUpdate = true;
    c.needsUpdate = true;
  }
}
