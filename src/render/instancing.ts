import * as THREE from 'three';

const WHITE = new THREE.Color(0xffffff);

/** InstancedMesh prêt pour un usage dynamique : couleurs allouées à pleine capacité, count = 0. */
export function makeInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < cap; i++) m.setColorAt(i, WHITE);
  m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}

/** Écriture rapide d'une instance : position, rotation Y, scale uniforme (ou non), couleur. */
export class InstanceWriter {
  n = 0;
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
    if (this.n >= this.mesh.instanceMatrix.count) return;
    const d = this.d;
    d.position.set(x, y, z);
    d.rotation.set(rx, ry, rz);
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
