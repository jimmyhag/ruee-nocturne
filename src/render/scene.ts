import * as THREE from 'three';
import { BOSS_TYPE, ENEMIES, WORLD_HALF } from '../sim/balance';
import type { World } from '../sim/world';
import { WEAPONS } from '../sim/weapons/defs';
import { Bolts, DamageNumbers, Particles } from './fx';
import { InstanceWriter, makeInstanced } from './instancing';
import { PAL } from './palette';

const TAU = Math.PI * 2;
const WHITE = new THREE.Color(0xffffff);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });

export class GameScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  particles: Particles;
  bolts: Bolts;
  dmg: DamageNumbers;

  private player = new THREE.Group();
  private pBody: THREE.Mesh;
  private pLegL: THREE.Mesh;
  private pLegR: THREE.Mesh;
  private blob: THREE.Mesh;
  private face = 0;

  private enemyW: InstanceWriter[] = [];
  private enemyColor: THREE.Color[] = [];
  private projW: InstanceWriter;
  private trailW: InstanceWriter;
  private gemW: InstanceWriter;
  private cProj = new THREE.Color(PAL.proj);
  private cTrail = PAL.trail.map((c) => new THREE.Color(c));
  private cGem = [new THREE.Color(PAL.gem), new THREE.Color(PAL.gem2), new THREE.Color(PAL.gem3)];

  private aura: THREE.Mesh;
  private auraDisc: THREE.Mesh;
  private blades: THREE.Mesh[] = [];

  private camPos = new THREE.Vector3(0, 14, 12);
  private camLook = new THREE.Vector3();
  camScale = 1;
  shake = 0;
  dashGhost = 0;

  constructor(canvas: HTMLCanvasElement, dmgLayer: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.scene.background = new THREE.Color(PAL.fog);
    this.scene.fog = new THREE.Fog(PAL.fog, 16, 44);
    this.scene.add(new THREE.HemisphereLight(0xffd9c2, 0x3a2f55, 0.9));
    const sun = new THREE.DirectionalLight(0xffe2b8, 0.85);
    sun.position.set(-8, 14, 6);
    this.scene.add(sun);

    // sol
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2), new THREE.MeshLambertMaterial({ map: groundTexture() }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // joueur
    this.pBody = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.75, 0.6), lam(PAL.accent));
    this.pBody.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.62, 0.72), lam(PAL.paper));
    head.position.y = 1.45;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.13, 0.06), new THREE.MeshBasicMaterial({ color: PAL.ink }));
    visor.position.set(0, 1.45, 0.37);
    const plume = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.5), lam(PAL.hp));
    plume.position.set(0, 1.9, -0.05);
    const legGeo = new THREE.BoxGeometry(0.24, 0.42, 0.26);
    this.pLegL = new THREE.Mesh(legGeo, lam(0x3d2b52));
    this.pLegL.position.set(-0.2, 0.22, 0);
    this.pLegR = new THREE.Mesh(legGeo, lam(0x3d2b52));
    this.pLegR.position.set(0.2, 0.22, 0);
    this.player.add(this.pBody, head, visor, plume, this.pLegL, this.pLegR);
    this.scene.add(this.player);
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.6, 12), new THREE.MeshBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.4, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.scene.add(this.blob);

    // ennemis
    const geos = [new THREE.IcosahedronGeometry(0.55, 0), new THREE.ConeGeometry(0.4, 1.0, 4), new THREE.DodecahedronGeometry(1.0, 0), new THREE.OctahedronGeometry(2.0, 0)];
    const caps = [450, 450, 120, 4];
    for (let t = 0; t < 4; t++) {
      const m = makeInstanced(geos[t], new THREE.MeshLambertMaterial({ color: 0xffffff }), caps[t]);
      this.scene.add(m);
      this.enemyW.push(new InstanceWriter(m));
      this.enemyColor.push(new THREE.Color(PAL.enemy[t]));
    }
    // projectiles, traînées, gemmes
    this.projW = new InstanceWriter(makeInstanced(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 250));
    this.trailW = new InstanceWriter(
      makeInstanced(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }), 1000),
    );
    this.gemW = new InstanceWriter(makeInstanced(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 900));
    this.scene.add(this.projW.mesh, this.trailW.mesh, this.gemW.mesh);

    // armes
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), new THREE.MeshBasicMaterial({ color: PAL.xp, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.visible = false;
    this.auraDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: PAL.xp, transparent: true, opacity: 0.08, depthWrite: false }));
    this.auraDisc.rotation.x = -Math.PI / 2;
    this.auraDisc.visible = false;
    this.scene.add(this.aura, this.auraDisc);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.26), new THREE.MeshBasicMaterial({ color: PAL.paper }));
      b.visible = false;
      this.scene.add(b);
      this.blades.push(b);
    }

    this.particles = new Particles(this.scene);
    this.bolts = new Bolts(this.scene);
    this.dmg = new DamageNumbers(dmgLayer);
  }

  /** Décor statique généré depuis les obstacles de la sim (même seed ⇒ même décor). */
  buildDecor(w: World): void {
    const d = new THREE.Object3D();
    const trees = makeInstanced(new THREE.ConeGeometry(1, 2.8, 5), lam(PAL.tree), 380);
    const trunks = makeInstanced(new THREE.CylinderGeometry(0.18, 0.22, 0.8, 5), lam(0x5a3d3a), 380);
    const rocks = makeInstanced(new THREE.DodecahedronGeometry(0.8, 0), lam(PAL.rock), 240);
    const lamps = makeInstanced(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: PAL.gold }), 160);
    const green = new THREE.Color(PAL.tree);
    for (let i = 0; i < 380; i++) {
      const o = w.obstacles[i];
      const s = o.r / 0.7;
      d.position.set(o.x, 1.4 * s, o.z);
      d.rotation.set(0, (i * 2.399) % TAU, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      trees.setMatrixAt(i, d.matrix);
      trees.setColorAt(i, green.clone().offsetHSL(0, 0, ((i * 7) % 10) * 0.012 - 0.06));
      d.position.y = 0.4 * s;
      d.updateMatrix();
      trunks.setMatrixAt(i, d.matrix);
    }
    for (let i = 0; i < 240; i++) {
      const o = w.obstacles[380 + i];
      const s = o.r / 0.75;
      d.position.set(o.x, 0.3 * s, o.z);
      d.rotation.set(0, (i * 1.7) % TAU, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      rocks.setMatrixAt(i, d.matrix);
    }
    // lanternes : positions dérivées des arbres (pas de collision)
    for (let i = 0; i < 160; i++) {
      const o = w.obstacles[(i * 37) % 380];
      d.position.set(o.x + 2.2, 0.5, o.z + 1.3);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(0.9);
      d.updateMatrix();
      lamps.setMatrixAt(i, d.matrix);
    }
    for (const m of [trees, trunks, rocks, lamps]) {
      m.count = m.instanceMatrix.count;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
      this.scene.add(m);
    }
  }

  resize(wpx: number, hpx: number): void {
    // résolution interne ≈ 380 px de haut (look pixelisé + 3–5× moins de fragments)
    const s = Math.max(1, Math.min(hpx, wpx * 1.2) / 380);
    this.renderer.setSize(Math.max(1, Math.round(wpx / s)), Math.max(1, Math.round(hpx / s)), false);
    this.camera.aspect = wpx / hpx;
    this.camera.updateProjectionMatrix();
    this.camScale = wpx < hpx ? 1.35 : 1;
  }

  /** Dessine le monde interpolé entre le step précédent et le courant (alpha ∈ [0,1]). */
  render(w: World, alpha: number, dt: number, now: number, hurtFlash: boolean): void {
    const P = w.player;
    const px = lerp(P.px, P.x, alpha),
      pz = lerp(P.pz, P.z, alpha),
      py = lerp(P.py, P.y, alpha);

    // joueur
    this.player.position.set(px, py, pz);
    const target = Math.atan2(P.dirX, P.dirZ);
    let diff = target - this.face;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.face += diff * Math.min(1, dt * 18);
    this.player.rotation.y = this.face;
    const moving = P.vx * P.vx + P.vz * P.vz > 0.1;
    const sw = moving && P.onGround ? Math.sin(P.walk) * 0.6 : 0;
    this.pLegL.rotation.x = sw;
    this.pLegR.rotation.x = -sw;
    this.pBody.position.y = 0.75 + (moving && P.onGround ? Math.abs(Math.cos(P.walk)) * 0.06 : 0);
    const rc = P.recoil;
    this.pBody.scale.set(1 + rc, 1 - rc * 0.8, 1 + rc);
    this.player.scale.set(1, P.onGround ? 1 : 1.08, 1);
    this.player.visible = !(P.invul > 0 && P.dashT <= 0 && Math.floor(now * 20) % 2 === 1) || hurtFlash;
    this.blob.position.set(px, 0.03, pz);
    this.blob.scale.setScalar(Math.max(0.4, 1 - py * 0.25));

    // ennemis
    for (const ew of this.enemyW) ew.begin();
    for (let i = 0; i < w.enemyCount; i++) {
      const e = w.enemies[i];
      if (!e.alive) continue;
      const def = ENEMIES[e.type];
      const ex = lerp(e.px, e.x, alpha),
        ez = lerp(e.pz, e.z, alpha);
      const hop = Math.abs(Math.sin(now * 8 + e.bob)) * (e.type === 1 ? 0.12 : e.type === BOSS_TYPE ? 0.25 : 0.1);
      const col = e.flash > 0 ? WHITE : this.enemyColor[e.type];
      const s = e.flash > 0 ? 1.18 : 1;
      if (e.type === 1) this.enemyW[1].put(ex, def.y + hop, ez, e.face, s, col, Math.PI / 2, 0);
      else if (e.type === BOSS_TYPE) this.enemyW[3].put(ex, def.y + hop, ez, now * 1.4, s, col);
      else this.enemyW[e.type].put(ex, def.y + hop, ez, e.face, s, col, Math.sin(now * 5 + e.bob) * 0.2, 0);
    }
    for (const ew of this.enemyW) ew.end();

    // gemmes
    this.gemW.begin();
    for (let i = 0; i < w.gemCount; i++) {
      const g = w.gems[i];
      const big = g.v >= 10 ? 2.2 : g.v >= 4 ? 1.5 : 1;
      this.gemW.put(g.x, 0.4 + Math.sin(now * 3 + g.x) * 0.1, g.z, now * 2 + g.z, big, g.v >= 10 ? this.cGem[2] : g.v >= 4 ? this.cGem[1] : this.cGem[0]);
    }
    this.gemW.end();

    // projectiles + traînées
    this.projW.begin();
    this.trailW.begin();
    for (let i = 0; i < w.projCount; i++) {
      const p = w.projs[i];
      const x = lerp(p.px, p.x, alpha),
        z = lerp(p.pz, p.z, alpha);
      const grow = Math.min(1, p.age / 0.06);
      const sc = (1.7 + Math.sin(now * 40 + p.x) * 0.2) * grow;
      this.projW.put(x, p.y, z, now * 7, sc, this.cProj, now * 9, 0);
      for (let j = 1; j <= 4; j++) {
        const back = Math.min(j * 0.028, p.age);
        this.trailW.put(x - p.vx * back, p.y, z - p.vz * back, 0, sc * (1.15 - j * 0.2), this.cTrail[j - 1]);
      }
    }
    this.projW.end();
    this.trailW.end();

    // halo
    const lvA = w.weapons.aura ?? 0;
    if (lvA > 0) {
      const r = WEAPONS.aura.stats(lvA).r;
      const pulse = w.wstate.auraPulse;
      this.aura.visible = this.auraDisc.visible = true;
      this.aura.position.set(px, 0.06, pz);
      this.auraDisc.position.set(px, 0.05, pz);
      this.aura.scale.setScalar(r * (1 + pulse * 0.06));
      this.auraDisc.scale.setScalar(r);
      (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.25 + pulse * 0.35;
    } else this.aura.visible = this.auraDisc.visible = false;

    // lames
    const lvL = w.weapons.lames ?? 0;
    const sL = lvL > 0 ? WEAPONS.lames.stats(lvL) : null;
    for (let i = 0; i < 6; i++) {
      const b = this.blades[i];
      if (!sL || i >= sL.n) {
        b.visible = false;
        continue;
      }
      const a = w.wstate.bladeA + (i * TAU) / sL.n;
      b.visible = true;
      b.position.set(px + Math.sin(a) * sL.r, py + 0.8, pz + Math.cos(a) * sL.r);
      b.rotation.y = a + Math.PI / 2;
    }

    this.particles.update(dt);
    this.bolts.update(dt);

    // caméra
    const k = 1 - Math.pow(0.0005, dt);
    const look = 1.2; // avance dans la direction du mouvement
    const tx = px + P.dirX * look * (moving ? 1 : 0),
      tz = pz + P.dirZ * look * (moving ? 1 : 0);
    this.camPos.x += (tx - this.camPos.x) * k;
    this.camPos.y += (12.5 * this.camScale - this.camPos.y) * k;
    this.camPos.z += (tz + 10.5 * this.camScale - this.camPos.z) * k;
    this.camLook.x += (tx - this.camLook.x) * k;
    this.camLook.z += (tz - 0.8 - this.camLook.z) * k;
    this.camLook.y = 0.8;
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() * 2 - 1) * this.shake * 0.6;
      this.camera.position.y += (Math.random() * 2 - 1) * this.shake * 0.6;
      this.shake = Math.max(0, this.shake - dt * 2);
    }
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
  }

  /** Caméra d'attente (menu) : tourne autour de l'origine. */
  renderIdle(now: number, dt: number): void {
    this.player.visible = true;
    this.player.position.set(0, 0, 0);
    this.player.rotation.y = now * 0.4;
    this.blob.position.set(0, 0.03, 0);
    for (const ew of this.enemyW) {
      ew.begin();
      ew.end();
    }
    this.gemW.begin();
    this.gemW.end();
    this.projW.begin();
    this.projW.end();
    this.trailW.begin();
    this.trailW.end();
    this.aura.visible = this.auraDisc.visible = false;
    for (const b of this.blades) b.visible = false;
    this.particles.update(dt);
    this.bolts.update(dt);
    const a = now * 0.12;
    this.camPos.set(Math.sin(a) * 14, 8, Math.cos(a) * 14);
    this.camLook.set(0, 1, 0);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
  }

  snapCamera(w: World): void {
    this.camPos.set(w.player.x, 12.5 * this.camScale, w.player.z + 10.5 * this.camScale);
    this.camLook.set(w.player.x, 0.8, w.player.z);
  }

  info(): { calls: number; triangles: number } {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }
}

function groundTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const b = (x + y) % 2 ? PAL.grass1 : PAL.grass2;
      const n = ((x * 31 + y * 17) % 13) - 6;
      g.fillStyle = `rgb(${b[0] + n},${b[1] + n},${b[2] + n})`;
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set((WORLD_HALF * 2) / 3.6, (WORLD_HALF * 2) / 3.6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
