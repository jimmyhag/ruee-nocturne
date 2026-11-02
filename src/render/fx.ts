// Effets côté rendu : particules, éclairs, chiffres de dégâts. Pilotés par les événements de la sim.
// Non déterministes (Math.random autorisé ici) : ils n'influencent jamais la sim.
import * as THREE from 'three';
import { InstanceWriter, makeInstanced } from './instancing';
import { PAL } from './palette';

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  c: THREE.Color;
  grav: boolean;
}
const PART_CAP = 500;

export class Particles {
  mesh: THREE.InstancedMesh;
  private w: InstanceWriter;
  private items: Particle[] = [];
  private count = 0;
  private next = 0; // remplacement circulaire quand plein : on ne saute jamais un effet

  constructor(scene: THREE.Scene) {
    this.mesh = makeInstanced(new THREE.BoxGeometry(0.17, 0.17, 0.17), new THREE.MeshBasicMaterial({ color: 0xffffff }), PART_CAP);
    scene.add(this.mesh);
    this.w = new InstanceWriter(this.mesh);
    for (let i = 0; i < PART_CAP; i++) this.items.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, c: new THREE.Color(), grav: true });
  }
  burst(x: number, y: number, z: number, color: number, n: number, speed: number, up: number, grav = true): void {
    for (let i = 0; i < n; i++) {
      let p: Particle;
      if (this.count < PART_CAP) p = this.items[this.count++];
      else {
        p = this.items[this.next];
        this.next = (this.next + 1) % PART_CAP;
      }
      const a = rnd(0, TAU),
        sp = rnd(speed * 0.4, speed);
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.sin(a) * sp;
      p.vz = Math.cos(a) * sp;
      p.vy = rnd(up * 0.5, up);
      p.life = p.max = rnd(0.3, 0.6);
      p.c.setHex(color);
      p.grav = grav;
    }
  }
  update(dt: number): void {
    const w = this.w;
    w.begin();
    for (let i = this.count - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        // swap-remove
        this.count--;
        const last = this.items[this.count];
        this.items[this.count] = p;
        this.items[i] = last;
        continue;
      }
      if (p.grav) p.vy -= 22 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.08 && p.grav) {
        p.y = 0.08;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      const s = Math.max(0.05, p.life / p.max) * 1.4;
      w.put(p.x, p.y, p.z, p.life * 7, s, p.c, p.life * 9, 0);
    }
    if (this.next >= this.count) this.next = 0;
    w.end();
  }
}

const BOLT_CAP = 800;
export class Bolts {
  private pos = new Float32Array(BOLT_CAP * 3);
  private geo = new THREE.BufferGeometry();
  private lines: THREE.LineSegments;
  private items: { pts: Float32Array; life: number }[] = [];
  private count = 0;
  constructor(scene: THREE.Scene) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ color: PAL.bolt }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    for (let i = 0; i < 40; i++) this.items.push({ pts: new Float32Array(7 * 3), life: 0 });
  }
  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const b = this.items[this.count < 40 ? this.count++ : 0];
    for (let i = 0; i <= 6; i++) {
      const f = i / 6,
        j = i === 0 || i === 6 ? 0 : 0.5;
      b.pts[i * 3] = ax + (bx - ax) * f + rnd(-j, j);
      b.pts[i * 3 + 1] = ay + (by - ay) * f + rnd(-j, j);
      b.pts[i * 3 + 2] = az + (bz - az) * f + rnd(-j, j);
    }
    b.life = 0.16;
  }
  update(dt: number): void {
    let v = 0;
    for (let i = this.count - 1; i >= 0; i--) {
      const b = this.items[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.count--;
        const last = this.items[this.count];
        this.items[this.count] = b;
        this.items[i] = last;
        continue;
      }
      for (let k = 0; k < 6 && v < BOLT_CAP - 2; k++) {
        this.pos.set(b.pts.subarray(k * 3, k * 3 + 3), v * 3);
        this.pos.set(b.pts.subarray(k * 3 + 3, k * 3 + 6), v * 3 + 3);
        v += 2;
      }
    }
    this.geo.setDrawRange(0, v);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Chiffres de dégâts en DOM, projetés depuis la 3D. 48 éléments recyclés. */
export class DamageNumbers {
  private items: { el: HTMLSpanElement; life: number; x: number; y: number; z: number }[] = [];
  private idx = 0;
  private v = new THREE.Vector3();
  private acc: Record<number, number> = {}; // agrégation par ennemi-ish (clé = position arrondie) sur une frame
  constructor(layer: HTMLElement) {
    for (let i = 0; i < 48; i++) {
      const el = document.createElement('span');
      el.hidden = true;
      layer.appendChild(el);
      this.items.push({ el, life: 0, x: 0, y: 0, z: 0 });
    }
  }
  add(x: number, y: number, z: number, v: number): void {
    const d = this.items[this.idx];
    this.idx = (this.idx + 1) % this.items.length;
    d.x = x + rnd(-0.3, 0.3);
    d.y = y + 0.7;
    d.z = z + rnd(-0.3, 0.3);
    d.life = 0.6;
    d.el.textContent = String(Math.round(v));
    d.el.className = v >= 40 ? 'big' : '';
    d.el.hidden = false;
  }
  update(dt: number, camera: THREE.Camera, w: number, h: number): void {
    for (const d of this.items) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.el.hidden = true;
        continue;
      }
      d.y += dt * 1.8;
      this.v.set(d.x, d.y, d.z).project(camera);
      const a = Math.min(1, d.life / 0.25),
        pop = d.life > 0.5 ? 1.35 : 1;
      d.el.style.transform = `translate(${(((this.v.x + 1) / 2) * w).toFixed(1)}px,${(((1 - this.v.y) / 2) * h).toFixed(1)}px) translate(-50%,-50%) scale(${pop})`;
      d.el.style.opacity = String(a);
    }
    void this.acc;
  }
  clear(): void {
    for (const d of this.items) {
      d.life = 0;
      d.el.hidden = true;
    }
  }
}
