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
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}
