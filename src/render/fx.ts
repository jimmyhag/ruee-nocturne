// Effets côté rendu : particules, éclairs, chiffres de dégâts. Pilotés par les événements de la sim.
// Non déterministes (Math.random autorisé ici) : ils n'influencent jamais la sim.
import * as THREE from 'three';
import { FEEL } from './feel';
import { InstanceWriter, makeInstanced } from './instancing';
import { beamTexture, hardDiscTexture, softGlow } from './textures';
import { PAL } from './palette';
import { POWER } from '../sim/balance';
import type { Power } from '../sim/types';

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
/** Hauteur du sol local (phase 18) : les effets reçoivent des y au-dessus du sol, comme la sim. Défaut : sol plat. */
export type GroundFn = (x: number, z: number) => number;
const FLAT: GroundFn = () => 0;

/** Pool unique de particules (InstancedMesh, cap 500). Plein : on remplace la plus ancienne, on ne saute jamais un effet. */
export class Particles {
  ground: GroundFn = FLAT;
  mesh: THREE.InstancedMesh;
  private w: InstanceWriter;
  private items: Particle[] = [];
  private count = 0;
  private next = 0; // remplacement circulaire quand plein
  /** Inclinaison (rotation X) qui fait face à la caméra ; mise à jour par la scène à chaque frame. */
  billboardRx = -0.87;
  /** Particules vivantes (onglet perf, tests). */
  get alive(): number {
    return this.count;
  }

  constructor(scene: THREE.Scene) {
    // phase 9 : disques ronds orientés vers la caméra (billboardRx = inclinaison de la caméra, posée par la scène)
    this.mesh = makeInstanced(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, map: hardDiscTexture(), transparent: true, depthWrite: false }),
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
      p.y = y + this.ground(x, z);
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
      p.y = y + this.ground(x, z);
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
      const floor = p.grav ? this.ground(p.x, p.z) + 0.08 : -1e9;
      if (p.y < floor) {
        // rebond au sol local 0,3
        p.y = floor;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      const s = Math.max(0.05, p.life / p.max) * 1.4; // scale ∝ vie restante
      w.put(p.x, p.y, p.z, 0, s, p.c, this.billboardRx, p.life * 9);
    }
    if (this.next >= this.count) this.next = 0;
    w.end();
  }
}

const BOLT_MAX = 40; // éclairs vivants en même temps
const BOLT_SEG = 6; // segments en zigzag par éclair
/**
 * Éclairs (phase 30) : chaque segment du zigzag est un rayon (quad orienté vers la caméra) en deux couches additives,
 * une lueur cyan large et un cœur blanc fin ; un seul appel. Les lignes de 1 px d'avant étaient invisibles sur
 * téléphone (WebGL ignore la largeur des lignes).
 */
export class Bolts {
  ground: GroundFn = FLAT;
  /** Inclinaison qui fait face à la caméra (comme les particules), posée par la scène à chaque frame. */
  billboardRx = -0.87;
  private w: InstanceWriter;
  private items: { pts: Float32Array; life: number; warm: boolean }[] = [];
  private count = 0;
  private cGlow = new THREE.Color();
  private cCore = new THREE.Color();
  private glowHex = new THREE.Color(PAL.boltGlow);
  private coreHex = new THREE.Color(PAL.bolt);
  // phase 47 C : le Fouet réutilise le trait de l'éclair, en orangé et presque droit (`warm`)
  private warmGlow = new THREE.Color(0xff8a3d);
  private warmCore = new THREE.Color(0xffe6bf);
  constructor(scene: THREE.Scene) {
    const mesh = makeInstanced(
      new THREE.PlaneGeometry(1, 1),
      softGlow(new THREE.MeshBasicMaterial({ color: 0xffffff, map: beamTexture(), side: THREE.DoubleSide }), 0.6, 0.7),
      BOLT_MAX * BOLT_SEG * 2,
    );
    scene.add(mesh);
    this.w = new InstanceWriter(mesh);
    for (let i = 0; i < BOLT_MAX; i++)
      this.items.push({ pts: new Float32Array((BOLT_SEG + 1) * 3), life: 0, warm: false });
  }
  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, warm = false): void {
    const b = this.items[this.count < BOLT_MAX ? this.count++ : 0];
    b.warm = warm;
    ay += this.ground(ax, az);
    by += this.ground(bx, bz);
    for (let i = 0; i <= BOLT_SEG; i++) {
      const f = i / BOLT_SEG,
        j = i === 0 || i === BOLT_SEG ? 0 : warm ? FEEL.bolt.whipJitter : FEEL.bolt.jitter;
      b.pts[i * 3] = ax + (bx - ax) * f + rnd(-j, j);
      b.pts[i * 3 + 1] = ay + (by - ay) * f + rnd(-j, j) * 0.5;
      b.pts[i * 3 + 2] = az + (bz - az) * f + rnd(-j, j);
    }
    b.life = FEEL.bolt.life;
  }
  update(dt: number): void {
    const w = this.w,
      rx = this.billboardRx,
      cr = Math.cos(rx),
      sr = Math.sin(rx);
    w.begin();
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
      const f = b.life / FEEL.bolt.life; // 1 → 0 : l'éclair s'éteint en s'amincissant
      this.cGlow.copy(b.warm ? this.warmGlow : this.glowHex).multiplyScalar(f);
      this.cCore.copy(b.warm ? this.warmCore : this.coreHex).multiplyScalar(Math.min(1, f * 1.6));
      const P = b.pts;
      for (let k = 0; k < BOLT_SEG; k++) {
        const o = k * 3;
        const dx = P[o + 3] - P[o],
          dy = P[o + 4] - P[o + 1],
          dz = P[o + 5] - P[o + 2];
        // projection du segment dans le plan face à la caméra (base : x monde, et y monde incliné de rx)
        const su = dx,
          sv = dy * cr + dz * sr,
          len = Math.sqrt(su * su + sv * sv) + 0.08,
          rz = Math.atan2(sv, su);
        const mx = P[o] + dx * 0.5,
          my = P[o + 1] + dy * 0.5,
          mz = P[o + 2] + dz * 0.5;
        w.put(mx, my, mz, 0, len, this.cGlow, rx, rz, FEEL.bolt.glowW * (0.6 + 0.4 * f), 1);
        w.put(mx, my, mz, 0, len, this.cCore, rx, rz, FEEL.bolt.coreW, 1);
      }
    }
    w.end();
  }
}

const AIM_CAP = 64;
/** Lignes de visée des Cracheurs (télégraphe 0,6 s) : segments rouges dont la longueur suit la progression. */
export class AimLines {
  ground: GroundFn = FLAT;
  private pos = new Float32Array(AIM_CAP * 6);
  private geo = new THREE.BufferGeometry();
  private n = 0;
  constructor(scene: THREE.Scene) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setDrawRange(0, 0);
    const lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ color: PAL.telegraph }));
    lines.frustumCulled = false;
    scene.add(lines);
  }
  begin(): void {
    this.n = 0;
  }
  /** Segment de (ax,ay,az) vers (bx,by,bz), tracé sur la fraction `f` ∈ [0,1] de sa longueur. */
  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, f: number): void {
    if (this.n >= AIM_CAP) return;
    const o = this.n * 6;
    ay += this.ground(ax, az);
    by += this.ground(bx, bz);
    this.pos[o] = ax;
    this.pos[o + 1] = ay;
    this.pos[o + 2] = az;
    this.pos[o + 3] = ax + (bx - ax) * f;
    this.pos[o + 4] = ay + (by - ay) * f;
    this.pos[o + 5] = az + (bz - az) * f;
    this.n++;
  }
  end(): void {
    this.geo.setDrawRange(0, this.n * 2);
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
  op: number; // dernière opacité écrite (évite une écriture DOM par frame tant que le chiffre est opaque)
}
const DMG_CAP = 48;
const MERGE_SLOTS = 16;

/**
 * Phase 35 : icône de chaque bonus au sol, en DOM au-dessus de son cristal (aucun appel de dessin en plus).
 * Un élément par place du pool ; l'icône n'est réécrite que quand le bonus de la place change.
 */
export class PowerMarks {
  ground: GroundFn = FLAT;
  private els: HTMLElement[] = [];
  private kind: Int8Array;
  private shown: Uint8Array;
  private px: Int16Array;
  private py: Int16Array;
  private v = new THREE.Vector3();
  constructor(
    layer: HTMLElement,
    private icons: readonly string[],
    cap: number,
  ) {
    this.kind = new Int8Array(cap).fill(-1);
    this.shown = new Uint8Array(cap);
    this.px = new Int16Array(cap);
    this.py = new Int16Array(cap);
    for (let i = 0; i < cap; i++) {
      const el = document.createElement('div');
      el.className = 'pmark';
      el.hidden = true;
      layer.appendChild(el);
      this.els.push(el);
    }
  }
  update(powers: readonly Power[], count: number, now: number, camera: THREE.Camera, w: number, h: number): void {
    const PF = FEEL.power;
    for (let i = 0; i < this.els.length; i++) {
      const el = this.els[i];
      const p = i < count ? powers[i] : null;
      const blinkOff = p !== null && p.age > POWER.life - POWER.blink && Math.sin(now * PF.blinkHz * Math.PI * 2) < 0;
      if (p === null || blinkOff) {
        if (this.shown[i]) {
          this.shown[i] = 0;
          el.hidden = true;
        }
        continue;
      }
      if (this.kind[i] !== p.kind) {
        this.kind[i] = p.kind;
        el.innerHTML = this.icons[p.kind];
      }
      this.v
        .set(p.x, this.ground(p.x, p.z) + PF.lift + PF.iconLift + Math.sin(now * 2.4 + p.x) * PF.bob, p.z)
        .project(camera);
      if (this.v.z > 1) {
        if (this.shown[i]) {
          this.shown[i] = 0;
          el.hidden = true;
        }
        continue;
      }
      if (!this.shown[i]) {
        this.shown[i] = 1;
        el.hidden = false;
        this.px[i] = this.py[i] = -32768; // réécrit la position au retour
      }
      // pixel entier, écrit seulement au changement : un bonus reste 30 s au sol, pas de chaîne neuve par frame à l'arrêt
      const sx = Math.round(((this.v.x + 1) / 2) * w),
        sy = Math.round(((1 - this.v.y) / 2) * h);
      if (sx !== this.px[i] || sy !== this.py[i]) {
        this.px[i] = sx;
        this.py[i] = sy;
        el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-100%)`;
      }
    }
  }
  clear(): void {
    for (let i = 0; i < this.els.length; i++) {
      this.shown[i] = 0;
      this.els[i].hidden = true;
    }
  }
}

/**
 * Chiffres de dégâts en DOM, projetés depuis la 3D. 48 éléments recyclés.
 * Les coups d'une même frame à moins de 1,5 u l'un de l'autre fusionnent (somme) : une pulsation de Halo sur
 * 40 ennemis écrit quelques chiffres lisibles, pas 40 illisibles, et le nombre d'écritures DOM par frame est borné.
 */
export class DamageNumbers {
  ground: GroundFn = FLAT;
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
      this.items.push({ el, life: 0, x: 0, y: 0, z: 0, v: 0, op: 1 });
    }
  }
  add(x: number, y: number, z: number, v: number, crit = false): void {
    const D = FEEL.damageNumbers;
    y += this.ground(x, z);
    const r2 = D.mergeRadius * D.mergeRadius;
    for (let k = 0; k < this.frameN && !crit; k++) {
      const d = this.items[this.frame[k]];
      if (d.el.className === 'crit') continue; // un critique garde son propre chiffre
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
    d.el.textContent = crit ? Math.round(v) + '!' : String(Math.round(v));
    d.el.className = crit ? 'crit' : v >= D.bigAbove ? 'big' : '';
    if (d.op !== 1) {
      d.op = 1;
      d.el.style.opacity = '1';
    }
    d.el.hidden = false;
    if (this.frameN < MERGE_SLOTS) this.frame[this.frameN++] = i;
  }
  /** Un mot (glisse parfaite, 1.30.1) ou un soin à la place d'un chiffre ; jamais fusionné. */
  text(x: number, y: number, z: number, label: string, kind: 'gold' | 'heal'): void {
    const D = FEEL.damageNumbers;
    const i = this.idx;
    const d = this.items[i];
    this.idx = (i + 1) % DMG_CAP;
    d.x = x;
    d.y = y + this.ground(x, z);
    d.z = z;
    d.life = D.life * 1.4;
    d.v = 0;
    d.el.textContent = label;
    d.el.className = kind === 'gold' ? 'trick' : 'heal';
    if (d.op !== 1) {
      d.op = 1;
      d.el.style.opacity = '1';
    }
    d.el.hidden = false;
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
      const a = Math.round(Math.min(1, d.life / D.fadeFor) * 20) / 20;
      const popT = Math.max(0, (d.life - (D.life - D.popFor)) / D.popFor); // 1 → 0 sur les 100 premières ms
      const pop = 1 + 0.35 * popT;
      d.el.style.transform = `translate(${(((this.v.x + 1) / 2) * w).toFixed(1)}px,${(((1 - this.v.y) / 2) * h).toFixed(1)}px) translate(-50%,-50%) scale(${pop.toFixed(3)})`;
      if (a !== d.op) {
        d.op = a;
        d.el.style.opacity = String(a);
      }
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
