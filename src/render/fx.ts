// Effets côté rendu : particules, éclairs, chiffres de dégâts. Pilotés par les événements de la sim.
// Non déterministes (Math.random autorisé ici) : ils n'influencent jamais la sim.
import * as THREE from 'three';
import { FEEL } from './feel';
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
const PART_CAP = FEEL.particles.cap;

/** Pool unique de particules (InstancedMesh, cap 500). Plein : on remplace la plus ancienne, on ne saute jamais un effet. */
export class Particles {
  mesh: THREE.InstancedMesh;
  private w: InstanceWriter;
  private items: Particle[] = [];
  private count = 0;
  private next = 0; // remplacement circulaire quand plein
  /** Particules vivantes (onglet perf, tests). */
  get alive(): number {
    return this.count;
  }

  constructor(scene: THREE.Scene) {
    this.mesh = makeInstanced(
      new THREE.BoxGeometry(0.17, 0.17, 0.17),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      PART_CAP,
    );
    scene.add(this.mesh);
    this.w = new InstanceWriter(this.mesh);
    for (let i = 0; i < PART_CAP; i++)
      this.items.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, c: new THREE.Color(), grav: true });
  }
  private alloc(): Particle {
    if (this.count < PART_CAP) return this.items[this.count++];
    const p = this.items[this.next];
    this.next = (this.next + 1) % PART_CAP;
    return p;
  }
  /**
   * Gerbe de n particules. `dx,dz` (unitaire) et `bias` orientent la gerbe (ex. opposée à la source du coup) ;
   * `grav = false` : pas de chute, simple fondu (dash, tir, montée de niveau).
   */
  burst(
    x: number,
    y: number,
    z: number,
    color: number,
    n: number,
    speed: number,
    up: number,
    grav = true,
    dx = 0,
    dz = 0,
    bias = 0,
  ): void {
    for (let i = 0; i < n; i++) {
      const p = this.alloc();
      const a = rnd(0, TAU),
        sp = rnd(speed * 0.4, speed);
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.sin(a) * sp + dx * speed * bias;
      p.vz = Math.cos(a) * sp + dz * speed * bias;
      p.vy = rnd(up * 0.5, up);
      p.life = p.max = rnd(0.3, 0.6);
      p.c.setHex(color);
      p.grav = grav;
    }
  }
  /** Anneau de n particules à vitesse radiale constante, qui montent sans gravité (montée de niveau). */
  ring(x: number, y: number, z: number, color: number, n: number, speed: number, up: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.alloc();
      const a = (i / n) * TAU;
      p.x = x + Math.sin(a) * 0.4;
      p.y = y;
      p.z = z + Math.cos(a) * 0.4;
      p.vx = Math.sin(a) * speed;
      p.vz = Math.cos(a) * speed;
      p.vy = up * rnd(0.6, 1);
      p.life = p.max = rnd(0.45, 0.6);
      p.c.setHex(color);
      p.grav = false;
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
        // rebond au sol 0,3
        p.y = 0.08;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      const s = Math.max(0.05, p.life / p.max) * 1.4; // scale ∝ vie restante
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

interface DmgItem {
  el: HTMLSpanElement;
  life: number;
  x: number;
  y: number;
  z: number;
  v: number;
}
const DMG_CAP = 48;
const MERGE_SLOTS = 16;

/**
 * Chiffres de dégâts en DOM, projetés depuis la 3D. 48 éléments recyclés.
 * Les coups d'une même frame à moins de 1,5 u l'un de l'autre fusionnent (somme) : une pulsation de Halo sur
 * 40 ennemis écrit quelques chiffres lisibles, pas 40 illisibles, et le nombre d'écritures DOM par frame est borné.
 */
export class DamageNumbers {
  private items: DmgItem[] = [];
  private idx = 0;
  private v = new THREE.Vector3();
  private frame = new Int32Array(MERGE_SLOTS); // indices ajoutés pendant la frame courante
  private frameN = 0;
  constructor(layer: HTMLElement) {
    for (let i = 0; i < DMG_CAP; i++) {
      const el = document.createElement('span');
      el.hidden = true;
      layer.appendChild(el);
      this.items.push({ el, life: 0, x: 0, y: 0, z: 0, v: 0 });
    }
  }
  add(x: number, y: number, z: number, v: number): void {
    const D = FEEL.damageNumbers;
    const r2 = D.mergeRadius * D.mergeRadius;
    for (let k = 0; k < this.frameN; k++) {
      const d = this.items[this.frame[k]];
      const dx = d.x - x,
        dz = d.z - z;
      if (dx * dx + dz * dz < r2) {
        d.v += v;
        d.el.textContent = String(Math.round(d.v));
        if (d.v >= D.bigAbove) d.el.className = 'big';
        return;
      }
    }
    const i = this.idx;
    const d = this.items[i];
    this.idx = (i + 1) % DMG_CAP;
    d.x = x + rnd(-0.3, 0.3);
    d.y = y + 0.7;
    d.z = z + rnd(-0.3, 0.3);
    d.life = D.life;
    d.v = v;
    d.el.textContent = String(Math.round(v));
    d.el.className = v >= D.bigAbove ? 'big' : '';
    d.el.hidden = false;
    if (this.frameN < MERGE_SLOTS) this.frame[this.frameN++] = i;
  }
  update(dt: number, camera: THREE.Camera, w: number, h: number): void {
    const D = FEEL.damageNumbers;
    this.frameN = 0;
    for (let i = 0; i < DMG_CAP; i++) {
      const d = this.items[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.el.hidden = true;
        continue;
      }
      d.y += dt * D.rise;
      this.v.set(d.x, d.y, d.z).project(camera);
      const a = Math.min(1, d.life / D.fadeFor);
      const popT = Math.max(0, (d.life - (D.life - D.popFor)) / D.popFor); // 1 → 0 sur les 100 premières ms
      const pop = 1 + 0.35 * popT;
      d.el.style.transform = `translate(${(((this.v.x + 1) / 2) * w).toFixed(1)}px,${(((1 - this.v.y) / 2) * h).toFixed(1)}px) translate(-50%,-50%) scale(${pop.toFixed(3)})`;
      d.el.style.opacity = a.toFixed(2);
    }
  }
  clear(): void {
    for (const d of this.items) {
      d.life = 0;
      d.el.hidden = true;
    }
    this.frameN = 0;
  }
}
