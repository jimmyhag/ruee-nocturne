import * as THREE from 'three';
import {
  BOSS,
  CAPS,
  DECOR,
  ELITE_TYPE,
  ENEMIES,
  HAZARDS,
  REAPER_TYPE,
  STEP,
  SWARM_TYPE,
  TRAIT,
  VOLANT,
  VOLANT_TYPE,
  WORLD_HALF,
} from '../sim/balance';
import { ProjKind, ShotKind } from '../sim/types';
import type { CharacterKey } from '../sim/types';
import type { World } from '../sim/world';
import { weaponStats } from '../sim/weapons/defs';
import { buildCharacter } from './characters';
import {
  Fireflies,
  GRASS,
  firGeometry,
  grassGeometry,
  lampHeadGeometry,
  lampPostGeometry,
  worksGeometry,
  roundTreeGeometry,
} from './decor';
import { buildEnemyGeometries } from './enemies';
import { setDetail } from './parts';
import { toonMaterial } from './toon';
import { softDiscTexture } from './textures';
import type { CharacterModel } from './characters';
import { FEEL } from './feel';
import { AimLines, Bolts, DamageNumbers, Particles } from './fx';
import { InstanceWriter, makeInstanced } from './instancing';
import { PAL } from './palette';

const TAU = Math.PI * 2;
const WHITE = new THREE.Color(0xffffff);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lam = (c: number) => toonMaterial({ color: c }); // phase 15 : toon partout (sauf lumineux et sol)
const additive = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
/** Ombre douce au sol (phase 9) : plan 2×2 (scale = rayon) à texture radiale, teinté encre. */
const shadowGeometry = (r: number) => new THREE.PlaneGeometry(2 * r, 2 * r).rotateX(-Math.PI / 2);
const shadowMaterial = (opacity: number) =>
  new THREE.MeshBasicMaterial({
    color: PAL.ink,
    map: softDiscTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
  });
const flat = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

// rendu net (phase 9) : DPR plafonné à 2, hauteur interne ≤ 1600 px, niveau intermédiaire ×0,75
const QUALITY = { maxDpr: 2, maxHeight: 1600, midScale: 0.75 };

// capacités d'instances par type d'ennemi (CAPS.enemies = 520 au total)
const ENEMY_CAPS = [450, 450, 120, 2, 120, 60, 2, 2, 1];

interface Ghost {
  x: number;
  y: number;
  z: number;
  ry: number;
  life: number;
}
interface LightKey {
  fog: number;
  sky: number;
  ground: number;
  hemi: number;
  sun: number;
  sunI: number;
}

export class GameScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  particles: Particles;
  bolts: Bolts;
  aims: AimLines;
  dmg: DamageNumbers;

  private player = new THREE.Group(); // contient le modèle du personnage courant (src/render/characters.ts)
  private model: CharacterModel;
  modelKey: CharacterKey = 'eclaireuse'; // lus par les tests e2e via __game.scene
  modelSkin = 0;
  private blob: THREE.Mesh;
  private face = 0;
  private landT = -1; // s depuis l'atterrissage (−1 : pas de ressort en cours)

  private enemyW: InstanceWriter[] = [];
  private enemyColor: THREE.Color[] = [];
  private eliteColor: THREE.Color[] = [];
  private shadowW: InstanceWriter; // ombres douces de tous les ennemis (phase 9)
  private eliteW: InstanceWriter; // anneaux dorés des élites
  private projW: InstanceWriter;
  private trailW: InstanceWriter;
  private boomW: InstanceWriter;
  private mineW: InstanceWriter;
  private spitW: InstanceWriter;
  private zoneW: InstanceWriter; // cercles rouges du Colosse (anneau)
  private zoneFillW: InstanceWriter; // disque qui se remplit pendant le télégraphe
  private ringW: InstanceWriter; // ondes de choc du Gardien (phase 11) : anneau fin, rayon = portée du coup
  private chestW: InstanceWriter;
  private gemW: InstanceWriter;
  private bladeW: InstanceWriter;
  private bladeGhostW: InstanceWriter;
  private dashGhostW: InstanceWriter;
  private cProj = new THREE.Color(PAL.proj);
  private cTrail = PAL.trail.map((c) => new THREE.Color(c));
  private cGem = [new THREE.Color(PAL.gem), new THREE.Color(PAL.gem2), new THREE.Color(PAL.gem3)];
  private cPaper = new THREE.Color(PAL.paper);
  private cGold = new THREE.Color(PAL.gold);
  private cBoom = new THREE.Color(PAL.boomerang);
  private cMine = new THREE.Color(PAL.mine);
  private cFire = new THREE.Color(PAL.accent); // traînée de feu du Feu follet (même mesh que les mines, plus large et plate)
  private cMineArmed = new THREE.Color(0xffffff);
  private cSpit = new THREE.Color(PAL.spit);
  private cTele = new THREE.Color(PAL.telegraph);
  private cShadow = new THREE.Color(PAL.ink);
  private cBladeGhost = [0.6, 0.35, 0.15].map((f) => new THREE.Color(PAL.paper).multiplyScalar(f));
  private cGhost = new THREE.Color();
  private writers: InstanceWriter[] = []; // tous les InstanceWriter dynamiques (remise à zéro au menu)

  private aura: THREE.Mesh;
  private fireflies: Fireflies;
  private night = 0; // 0 crépuscule/aube → 1 pleine nuit (lucioles)
  private auraDisc: THREE.Mesh;
  private lakeMeshes: THREE.Mesh[] = [];

  // lumière (cycle crépuscule → nuit → aube)
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fog: THREE.FogExp2;
  private cFog = new THREE.Color();
  private cSky = new THREE.Color();
  private cGround = new THREE.Color();
  private cSun = new THREE.Color();
  private lightA = new THREE.Color();
  private lightB = new THREE.Color();

  // traînée de dash : 6 silhouettes du joueur en fondu additif
  private ghosts: Ghost[] = [];
  private ghostNext = 0;
  private lastGhost = 0;

  private camPos = new THREE.Vector3(0, 14, 12);
  private camLook = new THREE.Vector3();
  camScale = 1;
  // qualité (phase 9) : 0 pixel (≈ 380 px de haut, nearest), 1 net ×0,75, 2 net ×1 (CSS × DPR ≤ 2, ≤ 1600 px de haut)
  qualityLevel = 2;
  private sizeW = 1;
  private sizeH = 1;
  private groundMat: THREE.MeshLambertMaterial;
  private groundTextures: (THREE.Texture | null)[] = [null, null]; // [pixel, net], construites à la demande
  private zoom = 1; // zoom-out progressif + recul au boss (FEEL.camera)
  shake = 0;

  constructor(canvas: HTMLCanvasElement, dmgLayer: HTMLElement) {
    // MSAA toujours actif (quasi gratuit sur les GPU mobiles à tuiles) ; la résolution interne dépend du niveau (setQuality)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.scene.background = new THREE.Color(PAL.fog);
    this.fog = new THREE.FogExp2(PAL.fog, 0.034); // phase 9 : brume exponentielle (≈ 26 % à 16 u, 89 % à 44 u), plus douce
    this.scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(0xffd9c2, 0x3a2f55, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe2b8, 1.0); // phase 15 : un peu plus fort, les trois tons du toon se lisent
    this.sun.position.set(-8, 14, 6);
    this.scene.add(this.sun);
    // phase 9 : lumière de contre bleutée, à l'opposé du soleil : détache les silhouettes du sol (aucun appel en plus)
    const rim = new THREE.DirectionalLight(0x9db4ff, 0.3);
    rim.position.set(8, 6, -10);
    this.scene.add(rim);

    // sol
    this.groundMat = new THREE.MeshLambertMaterial({ map: this.groundTex(true) });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // joueur : modèle du personnage (torse fusionné, jambes animées, pièces lumineuses, halo au sol)
    this.model = buildCharacter(this.modelKey, this.modelSkin);
    this.player.add(this.model.group);
    if (this.model.glowDisc) this.scene.add(this.model.glowDisc);
    this.scene.add(this.player);
    this.blob = new THREE.Mesh(shadowGeometry(0.75), shadowMaterial(0.45));
    this.scene.add(this.blob);

    // silhouette fusionnée du joueur (une géométrie, un InstancedMesh additif : 1 draw call pendant le dash)
    this.dashGhostW = new InstanceWriter(
      makeInstanced(this.model.silhouette.clone(), additive(0xffffff, 0.55), FEEL.trail.dashGhosts),
    );
    for (let i = 0; i < FEEL.trail.dashGhosts; i++) this.ghosts.push({ x: 0, y: 0, z: 0, ry: 0, life: 0 });

    // ennemis : une silhouette par type (survivor-design §6), une couleur franche, une variante dorée (élite)
    const geos = buildEnemyGeometries(); // src/render/enemies.ts : une silhouette fusionnée par type
    for (let t = 0; t < geos.length; t++) {
      const m = makeInstanced(geos[t], toonMaterial({ vertexColors: true }), ENEMY_CAPS[t]);
      this.scene.add(m);
      this.enemyW.push(new InstanceWriter(m));
      this.enemyColor.push(new THREE.Color(PAL.enemy[t]));
      this.eliteColor.push(new THREE.Color(PAL.enemy[t]).lerp(this.cGold, 0.55));
    }
    // phase 9 : une ombre douce sous chaque ennemi (un seul appel pour tous) ; celle des Volants grossit au télégraphe
    this.shadowW = new InstanceWriter(makeInstanced(shadowGeometry(1), shadowMaterial(0.4), CAPS.enemies));
    this.eliteW = new InstanceWriter(
      makeInstanced(new THREE.RingGeometry(0.8, 1.05, 24).rotateX(-Math.PI / 2), additive(PAL.gold, 0.8), 48),
    );
    // projectiles, traînées, boomerangs, mines, crachats, cercles, coffres, gemmes
    this.projW = new InstanceWriter(
      makeInstanced(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 250),
    );
    this.trailW = new InstanceWriter(
      makeInstanced(new THREE.IcosahedronGeometry(0.22, 0), additive(0xffffff, 0.6), 250 * FEEL.trail.projGhosts),
    );
    this.boomW = new InstanceWriter(
      makeInstanced(new THREE.BoxGeometry(1.1, 0.12, 0.32), new THREE.MeshBasicMaterial({ color: 0xffffff }), 64), // 7 boomerangs par lancer à recharge courte (phase 12)
    );
    this.mineW = new InstanceWriter(
      makeInstanced(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 64),
    );
    this.spitW = new InstanceWriter(
      makeInstanced(new THREE.SphereGeometry(0.32, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 96),
    );
    this.zoneW = new InstanceWriter(
      makeInstanced(new THREE.RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2), flat(PAL.telegraph, 0.9), 96),
    );
    this.ringW = new InstanceWriter(
      makeInstanced(new THREE.RingGeometry(0.955, 1, 48).rotateX(-Math.PI / 2), flat(PAL.telegraph, 0.9), 8),
    );
    this.zoneFillW = new InstanceWriter(
      makeInstanced(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), flat(PAL.telegraph, 0.35), 96),
    );
    this.chestW = new InstanceWriter(makeInstanced(new THREE.BoxGeometry(0.9, 0.62, 0.62), lam(PAL.gold), 16));
    this.gemW = new InstanceWriter(
      makeInstanced(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 900),
    );
    this.scene.add(
      this.shadowW.mesh,
      this.eliteW.mesh,
      this.projW.mesh,
      this.trailW.mesh,
      this.boomW.mesh,
      this.mineW.mesh,
      this.spitW.mesh,
      this.zoneW.mesh,
      this.zoneFillW.mesh,
      this.ringW.mesh,
      this.chestW.mesh,
      this.gemW.mesh,
      this.dashGhostW.mesh,
    );

    // armes
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), flat(PAL.xp, 0.35));
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.visible = false;
    this.auraDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), flat(PAL.xp, 0.08));
    this.auraDisc.rotation.x = -Math.PI / 2;
    this.auraDisc.visible = false;
    this.scene.add(this.aura, this.auraDisc);
    // lames : un InstancedMesh (6 draw calls → 1) + fantômes additifs (3 par lame)
    const bladeGeo = new THREE.BoxGeometry(1.0, 0.1, 0.26);
    // 13 lames au plus : 2 de base + 8 lignes + 3 du tome Projectiles (phase 12)
    this.bladeW = new InstanceWriter(makeInstanced(bladeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 13));
    this.bladeGhostW = new InstanceWriter(
      makeInstanced(bladeGeo, additive(0xffffff, 0.5), 13 * FEEL.trail.bladeGhosts),
    );
    this.scene.add(this.bladeW.mesh, this.bladeGhostW.mesh);
    this.writers.push(
      ...this.enemyW,
      this.shadowW,
      this.eliteW,
      this.projW,
      this.trailW,
      this.boomW,
      this.mineW,
      this.spitW,
      this.zoneW,
      this.zoneFillW,
      this.ringW,
      this.chestW,
      this.gemW,
      this.dashGhostW,
      this.bladeW,
      this.bladeGhostW,
    );

    this.particles = new Particles(this.scene);
    this.fireflies = new Fireflies(this.scene);
    this.bolts = new Bolts(this.scene);
    this.aims = new AimLines(this.scene);
    this.dmg = new DamageNumbers(dmgLayer);
  }

  /** Décor statique généré depuis les obstacles et zones de la sim (même seed ⇒ même décor). */
  buildDecor(w: World): void {
    const d = new THREE.Object3D();
    const nTrees = w.treeCount;
    const treeCap = DECOR.trees + DECOR.woodTrees;
    const vc = () => toonMaterial({ vertexColors: true });
    // deux essences (sapin, feuillu) à couleurs par sommet : la couleur d'instance ne porte que la variation de teinte
    const firs = makeInstanced(firGeometry(), vc(), treeCap);
    const rounds = makeInstanced(roundTreeGeometry(), vc(), treeCap);
    const rocks = makeInstanced(new THREE.DodecahedronGeometry(0.8, 0), lam(PAL.rock), DECOR.rocks);
    const posts = makeInstanced(lampPostGeometry(), vc(), DECOR.lamps);
    const lamps = makeInstanced(lampHeadGeometry(), new THREE.MeshBasicMaterial({ color: PAL.lantern }), DECOR.lamps); // phase 15 : lumière chaude des lanternes
    const halos = makeInstanced(
      new THREE.CircleGeometry(2.4, 18).rotateX(-Math.PI / 2),
      additive(PAL.lantern, 0.12),
      DECOR.lamps,
    );
    const grass = makeInstanced(grassGeometry(), vc(), GRASS);
    // ombres des arbres et des menhirs (phase 9 : +1 appel ; phase 16 : les menhirs partagent le mesh)
    const nStones = w.obstacles.length - w.rockEnd;
    const treeShadows = makeInstanced(shadowGeometry(1), shadowMaterial(0.3), treeCap + nStones);
    const tint = new THREE.Color();
    let nf = 0,
      nr = 0;
    for (let i = 0; i < nTrees; i++) {
      const o = w.obstacles[i];
      const s = o.r / 0.7;
      const round = i % 3 === 2;
      const m = round ? rounds : firs;
      const k = round ? nr++ : nf++;
      d.position.set(o.x, 0, o.z);
      d.rotation.set(0, (i * 2.399) % TAU, 0);
      d.scale.set(s, s * (0.9 + ((i * 11) % 7) * 0.04), s);
      d.updateMatrix();
      m.setMatrixAt(k, d.matrix);
      m.setColorAt(k, tint.setScalar(0.86 + ((i * 7) % 10) * 0.03));
      d.position.set(o.x + 0.4, 0.02, o.z + 0.3); // ombre légèrement décalée côté opposé au soleil
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(o.r * 1.7);
      d.updateMatrix();
      treeShadows.setMatrixAt(i, d.matrix);
    }
    // menhirs : ombre portée au pied côté opposé au soleil
    for (let i = 0; i < nStones; i++) {
      const o = w.obstacles[w.rockEnd + i];
      d.position.set(o.x + 0.6, 0.02, o.z + 0.45);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(o.r * 1.9);
      d.updateMatrix();
      treeShadows.setMatrixAt(nTrees + i, d.matrix);
    }
    treeShadows.count = nTrees + nStones;
    const nRocks = w.rockEnd - nTrees;
    for (let i = 0; i < nRocks; i++) {
      const o = w.obstacles[nTrees + i];
      const s = o.r / 0.75;
      d.position.set(o.x, 0.3 * s, o.z);
      d.rotation.set(0, (i * 1.7) % TAU, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      rocks.setMatrixAt(i, d.matrix);
    }
    // lanternes : au centre des cercles de pierres (phase 16), puis près des arbres (pas de collision) ; pied, tête, halo
    for (let i = 0; i < DECOR.lamps; i++) {
      const c = w.stoneCenters[i];
      const o = c ?? w.obstacles[(i * 37) % nTrees];
      if (c) d.position.set(c.x, 0, c.z);
      else d.position.set(o.x + 2.2, 0, o.z + 1.3);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(0.9);
      d.updateMatrix();
      posts.setMatrixAt(i, d.matrix);
      lamps.setMatrixAt(i, d.matrix);
      d.position.y = 0.06;
      d.updateMatrix();
      halos.setMatrixAt(i, d.matrix);
    }
    // herbe : touffes autour des arbres, jamais dans un lac
    let ng = 0;
    for (let i = 0; i < GRASS; i++) {
      const o = w.obstacles[(i * 53) % nTrees];
      const ang = (i * 2.399) % TAU;
      const dist = o.r + 0.8 + ((i * 13) % 9) * 0.35;
      const x = o.x + Math.sin(ang) * dist,
        z = o.z + Math.cos(ang) * dist;
      let wet = false;
      for (const l of w.lakes) if ((x - l.x) * (x - l.x) + (z - l.z) * (z - l.z) < l.r * l.r) wet = true;
      if (wet || Math.abs(x) > WORLD_HALF - 1 || Math.abs(z) > WORLD_HALF - 1) continue;
      d.position.set(x, 0, z);
      d.rotation.set(0, (i * 1.3) % TAU, 0);
      d.scale.setScalar(1.2 + ((i * 5) % 6) * 0.16);
      d.updateMatrix();
      grass.setMatrixAt(ng, d.matrix);
      grass.setColorAt(ng, tint.setScalar(0.85 + ((i * 3) % 7) * 0.04));
      ng++;
    }
    firs.count = nf;
    rounds.count = nr;
    rocks.count = nRocks;
    posts.count = lamps.count = halos.count = DECOR.lamps;
    grass.count = ng;
    for (const m of [treeShadows, firs, rounds, rocks, posts, lamps, halos, grass]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
      this.scene.add(m);
    }
    // ouvrages (phase 16) : murets, troncs et menhirs en une seule géométrie statique, un appel de rendu
    const works = worksGeometry(w);
    if (works) this.scene.add(new THREE.Mesh(works, vc()));
    // lacs : disque bleu + anneau de rive qui scintille (animé dans render)
    for (const m of this.lakeMeshes) this.scene.remove(m);
    this.lakeMeshes.length = 0;
    for (const l of w.lakes) {
      const water = new THREE.Mesh(new THREE.CircleGeometry(l.r, 40), flat(PAL.lake, 0.6));
      water.rotation.x = -Math.PI / 2;
      water.position.set(l.x, 0.04, l.z);
      const shore = new THREE.Mesh(new THREE.RingGeometry(l.r * 0.93, l.r, 40), additive(PAL.paper, 0.35));
      shore.rotation.x = -Math.PI / 2;
      shore.position.set(l.x, 0.05, l.z);
      this.scene.add(water, shore);
      this.lakeMeshes.push(water, shore);
    }
  }

  /** Change le personnage affiché (menu : aperçu ; partie : personnage choisi) et sa tenue. Idempotent. */
  setCharacter(key: CharacterKey, skin = 0, force = false): void {
    if (!force && key === this.modelKey && skin === this.modelSkin) return;
    const old = this.model;
    const next = buildCharacter(key, skin);
    this.modelKey = key;
    this.modelSkin = skin;
    this.player.remove(old.group);
    if (old.glowDisc) this.scene.remove(old.glowDisc);
    this.player.add(next.group);
    if (next.glowDisc) this.scene.add(next.glowDisc);
    const ghost = this.dashGhostW.mesh;
    ghost.geometry.dispose();
    ghost.geometry = next.silhouette.clone();
    old.dispose();
    this.model = next;
  }

  resize(wpx: number, hpx: number): void {
    this.sizeW = wpx;
    this.sizeH = hpx;
    this.applySize();
    this.camera.aspect = wpx / hpx;
    this.camera.updateProjectionMatrix();
    this.camScale = wpx < hpx ? 1.35 : 1;
  }
  private applySize(): void {
    const w = this.sizeW,
      h = this.sizeH;
    let rw: number, rh: number;
    if (this.qualityLevel === 0) {
      // pixel : résolution interne ≈ 380 px de haut (look d'origine, 3–5× moins de fragments)
      const s = Math.max(1, Math.min(h, w * 1.2) / 380);
      rw = w / s;
      rh = h / s;
    } else {
      const dpr = Math.min(QUALITY.maxDpr, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
      const k = Math.min(dpr, QUALITY.maxHeight / h) * (this.qualityLevel === 1 ? QUALITY.midScale : 1);
      rw = w * k;
      rh = h * k;
    }
    this.renderer.setSize(Math.max(1, Math.round(rw)), Math.max(1, Math.round(rh)), false);
  }

  /** Change le niveau de rendu (0 pixel, 1 net ×0,75, 2 net) : taille interne, filtrage du sol, classe CSS. Idempotent. */
  setQuality(level: number): void {
    level = Math.max(0, Math.min(2, level | 0));
    if (level === this.qualityLevel) return;
    this.qualityLevel = level;
    this.applySize();
    setDetail(level > 0 ? 12 : 7);
    this.setCharacter(this.modelKey, this.modelSkin, true); // formes plus lisses (ou non) : modèle reconstruit
    this.groundMat.map = this.groundTex(level > 0);
    this.groundMat.needsUpdate = true;
    this.renderer.domElement.classList.toggle('pixel', level === 0);
  }
  private groundTex(net: boolean): THREE.Texture {
    const i = net ? 1 : 0;
    if (!this.groundTextures[i]) {
      const t = groundTexture(net);
      if (net) t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      this.groundTextures[i] = t;
    }
    return this.groundTextures[i]!;
  }

  /** Compile les shaders à l'avance : hors du fil principal quand KHR_parallel_shader_compile existe (chargement). */
  warmup(): Promise<void> {
    return this.renderer.compileAsync(this.scene, this.camera).then(() => undefined);
  }

  /** Atterrissage du joueur : lance le ressort d'écrasement (valeurs neutres depuis la PR #6). */
  onLand(): void {
    this.landT = 0;
  }

  /** Cycle de lumière lié au temps de run : crépuscule 0:00 → nuit 8:00 → aube 20:00 (le temps se lit sans chrono). */
  private lightCycle(t: number): void {
    const L = PAL.light;
    let a: LightKey, b: LightKey, f: number;
    if (t < 480) {
      a = L.dusk;
      b = L.night;
      f = t / 480;
    } else {
      a = L.night;
      b = L.dawn;
      f = Math.min(1, (t - 480) / 720);
    }
    this.cFog.copy(this.lightA.setHex(a.fog)).lerp(this.lightB.setHex(b.fog), f);
    this.cSky.copy(this.lightA.setHex(a.sky)).lerp(this.lightB.setHex(b.sky), f);
    this.cGround.copy(this.lightA.setHex(a.ground)).lerp(this.lightB.setHex(b.ground), f);
    this.cSun.copy(this.lightA.setHex(a.sun)).lerp(this.lightB.setHex(b.sun), f);
    this.fog.color.copy(this.cFog);
    (this.scene.background as THREE.Color).copy(this.cFog);
    this.hemi.color.copy(this.cSky);
    this.hemi.groundColor.copy(this.cGround);
    this.hemi.intensity = lerp(a.hemi, b.hemi, f);
    this.sun.color.copy(this.cSun);
    this.sun.intensity = lerp(a.sunI, b.sunI, f);
    this.night = Math.min(1, t < 480 ? t / 300 : Math.max(0, 1 - (t - 480) / 720) * 1.2);
  }

  /** Dessine le monde interpolé entre le step précédent et le courant (alpha ∈ [0,1]). */
  render(w: World, alpha: number, dt: number, now: number, hurtFlash: boolean): void {
    const P = w.player;
    const S = FEEL.squash;
    const px = lerp(P.px, P.x, alpha),
      pz = lerp(P.pz, P.z, alpha),
      py = lerp(P.py, P.y, alpha);
    this.lightCycle(w.t);
    this.fireflies.update(px, pz, now, this.night);
    this.particles.billboardRx = -Math.atan2(this.camPos.y - this.camLook.y, this.camPos.z - this.camLook.z);

    // joueur
    this.player.position.set(px, py, pz);
    const target = Math.atan2(P.dirX, P.dirZ);
    let diff = target - this.face;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.face += diff * Math.min(1, dt * 18);
    this.player.rotation.y = this.face;
    const moving = P.vx * P.vx + P.vz * P.vz > 0.1;
    const M = this.model;
    const sw = moving && P.onGround ? Math.sin(P.walk) * 0.6 : 0;
    if (M.legL && M.legR) {
      M.legL.rotation.x = sw;
      M.legR.rotation.x = -sw;
    }
    // flottants : ondulation et léger balancement ; marcheurs : bob de course
    M.torso.position.y = M.float
      ? 0.18 + Math.sin(now * 3.2) * 0.08
      : moving && P.onGround
        ? Math.abs(Math.cos(P.walk)) * 0.06
        : 0;
    M.torso.rotation.z = M.float ? Math.sin(now * 2.1) * 0.06 : 0;
    // tir : le corps s'écrase (1+r, 1−0,8r, 1+r), r porté par la sim (Player.recoil)
    const rc = P.recoil;
    M.torso.scale.set(1 + rc, 1 - rc * 0.8, 1 + rc);
    let sy = P.onGround ? 1 : S.jumpStretch;
    if (this.landT >= 0) {
      this.landT += dt;
      const k = this.landT / S.landSpring;
      if (k > 3) this.landT = -1;
      else sy = 1 - (1 - S.landSquash) * Math.exp(-k * 2.2) * Math.cos(k * Math.PI);
    }
    const sxz = 1 + (1 - sy) * 0.5; // volume à peu près conservé
    this.player.scale.set(sxz, sy, sxz);
    this.player.visible = !(P.invul > 0 && P.dashT <= 0 && Math.floor(now * 20) % 2 === 1) || hurtFlash;
    if (M.glowDisc) {
      M.glowDisc.visible = this.player.visible;
      M.glowDisc.position.set(px, 0.07, pz);
      M.glowDisc.scale.setScalar(1 + Math.sin(now * 11) * 0.05); // vacillement
    }
    this.blob.position.set(px, 0.03, pz);
    this.blob.scale.setScalar(Math.max(0.4, 1 - py * 0.25));

    // dash : 1 particule crème par frame + silhouettes en fondu
    if (P.dashT > 0) {
      this.particles.burst(px, py + 0.8, pz, PAL.cream, 1, 0, 0, false);
      if (now - this.lastGhost >= FEEL.trail.dashGhostEvery) {
        this.lastGhost = now;
        const g = this.ghosts[this.ghostNext];
        this.ghostNext = (this.ghostNext + 1) % FEEL.trail.dashGhosts;
        g.x = px;
        g.y = py;
        g.z = pz;
        g.ry = this.face;
        g.life = FEEL.trail.dashGhostLife;
      }
    }
    this.dashGhostW.begin();
    for (let i = 0; i < FEEL.trail.dashGhosts; i++) {
      const g = this.ghosts[i];
      if (g.life <= 0) continue;
      g.life -= dt;
      this.cGhost.setHex(PAL.accent).multiplyScalar(Math.max(0, g.life / FEEL.trail.dashGhostLife));
      this.dashGhostW.put(g.x, g.y, g.z, g.ry, 1, this.cGhost);
    }
    this.dashGhostW.end();

    // ennemis : hop constant, flash blanc au coup, élites dorées avec anneau, Volants avec ombre
    for (let t = 0; t < this.enemyW.length; t++) this.enemyW[t].begin();
    this.shadowW.begin();
    this.eliteW.begin();
    this.aims.begin();
    this.zoneFillW.begin(); // ovales de charge (ici) puis disques des télégraphes (bloc des tirs)
    for (let i = 0; i < w.enemyCount; i++) {
      const e = w.enemies[i];
      if (!e.alive) continue;
      const def = ENEMIES[e.type];
      const ex = lerp(e.px, e.x, alpha),
        ez = lerp(e.pz, e.z, alpha);
      const boss = def.boss;
      const hop = boss ? 0 : Math.abs(Math.sin(now * 8 + e.bob)) * (e.type === 1 ? 0.12 : 0.1);
      const col = e.flash > 0 ? WHITE : e.elite ? this.eliteColor[e.type] : this.enemyColor[e.type];
      let s = (e.flash > 0 ? S.hitScale : 1) * (e.elite ? 1.25 : 1);
      const ey = e.y + hop;
      if (e.type === VOLANT_TYPE) {
        // ombre au sol : grossit pendant le télégraphe (0,6 s avant la plongée)
        const tele = e.state === 1 ? 1 + (1 - Math.max(0, e.timer / VOLANT.telegraph)) * 1.6 : 1;
        this.shadowW.put(ex, 0.04, ez, 0, 0.6 * tele * (e.state === 2 ? 0.6 : 1), this.cShadow);
        this.enemyW[e.type].put(
          ex,
          ey,
          ez,
          e.face,
          s,
          col,
          Math.sin(now * 6 + e.bob) * 0.25,
          Math.sin(now * 4 + e.bob) * 0.2,
        );
      } else if (e.type === SWARM_TYPE) {
        s *= e.state === 1 ? 1.25 : 1 + Math.sin(now * 3) * 0.04; // pulsation à la ponte
        this.enemyW[e.type].put(ex, ey, ez, now * 0.6, s, col);
      } else if (e.type === REAPER_TYPE) {
        this.enemyW[e.type].put(ex, ey, ez, now * 0.8, s, col);
      } else if (boss) {
        this.enemyW[e.type].put(ex, ey, ez, e.type === 3 ? now * 1.4 : e.face, s, col);
      } else if (e.type === 1) {
        this.enemyW[1].put(ex, ey, ez, e.face, s, col, 0, 0, s, s * S.enemyStretch);
      } else {
        this.enemyW[e.type].put(ex, ey, ez, e.face, s, col, Math.sin(now * 5 + e.bob) * 0.2, 0, s, s * S.enemyStretch);
        if (e.type === 5 && e.aim > 0) this.aims.add(ex, 0.9, ez, px, 0.9, pz, e.aim); // ligne de visée du Cracheur
        if (e.elite && e.type === ELITE_TYPE && e.state === 1) {
          // Brute élite qui arme sa charge : couloir rouge au sol jusqu'au point d'arrivée, qui s'élargit (0 → largeur réelle)
          const C = HAZARDS.charge;
          const f = 1 - e.timer / C.telegraph;
          const half = C.dist * 0.5 + e.r;
          this.zoneFillW.put(
            ex + e.tx * half,
            0.045,
            ez + e.tz * half,
            Math.atan2(-e.tz, e.tx),
            half,
            this.cTele,
            0,
            0,
            1,
            0.25 + f * e.r * 0.9,
          );
        }
      }
      if (e.type !== VOLANT_TYPE) this.shadowW.put(ex, 0.03, ez, 0, e.r * 1.15 * (1 - hop * 0.6), this.cShadow);
      if (e.elite) this.eliteW.put(ex, 0.06, ez, now * 1.5, e.r * 1.3, this.cGold);
    }
    for (let t = 0; t < this.enemyW.length; t++) this.enemyW[t].end();
    this.shadowW.end();
    this.eliteW.end();
    this.aims.end();

    // crachats et cercles rouges (projectiles ennemis)
    this.spitW.begin();
    this.zoneW.begin();
    this.ringW.begin();
    for (let i = 0; i < w.shotCount; i++) {
      const sh = w.shots[i];
      if (sh.kind === ShotKind.Spit) {
        this.spitW.put(
          lerp(sh.px, sh.x, alpha),
          0.45 + Math.sin(now * 9 + i) * 0.1,
          lerp(sh.pz, sh.z, alpha),
          now * 5,
          1,
          this.cSpit,
        );
      } else if (sh.kind === ShotKind.Ring) {
        // onde de choc du Gardien : anneau qui grandit, posé au sol (le joueur la saute)
        const r = sh.r + HAZARDS.ring.speed * alpha * STEP;
        this.ringW.put(sh.x, 0.06, sh.z, 0, r, this.cTele);
      } else {
        // cercle du Colosse (immobile) ou fissure d'éruption (suit le joueur, posée sur le sol local) : le disque se remplit
        const eruption = sh.kind === ShotKind.Eruption;
        const f = 1 - Math.max(0, sh.life / (eruption ? HAZARDS.eruption.telegraph : BOSS.zoneTelegraph));
        const sx = eruption ? lerp(sh.px, sh.x, alpha) : sh.x,
          sz = eruption ? lerp(sh.pz, sh.z, alpha) : sh.z;
        const gy = 0;
        this.zoneW.put(sx, gy + 0.05, sz, 0, sh.r, this.cTele);
        this.zoneFillW.put(sx, gy + 0.045, sz, 0, sh.r * f, this.cTele);
      }
    }
    this.spitW.end();
    this.zoneW.end();
    this.zoneFillW.end();
    this.ringW.end();

    // coffres : flottent et tournent ; coffre de boss plus gros
    this.chestW.begin();
    for (let i = 0; i < w.chestCount; i++) {
      const c = w.chests[i];
      const pop = Math.min(1, c.age / 0.25);
      this.chestW.put(c.x, 0.45 + Math.sin(now * 2.5 + i) * 0.12, c.z, now * 1.2, (c.boss ? 1.4 : 1) * pop, this.cGold);
    }
    this.chestW.end();

    // gemmes : apparition 0 → 1,3 → 1 en 120 ms, rotation continue
    this.gemW.begin();
    for (let i = 0; i < w.gemCount; i++) {
      const g = w.gems[i];
      const big = g.v >= 10 ? 2.2 : g.v >= 4 ? 1.5 : 1;
      let pop = 1;
      if (g.age < S.gemPop) {
        const t = g.age / S.gemPop;
        pop = t < 0.6 ? (1.3 * t) / 0.6 : 1.3 - (0.3 * (t - 0.6)) / 0.4;
      }
      this.gemW.put(
        g.x,
        0.4 + Math.sin(now * 3 + g.x) * 0.1,
        g.z,
        now * 2 + g.z,
        big * pop,
        g.v >= 10 ? this.cGem[2] : g.v >= 4 ? this.cGem[1] : this.cGem[0],
      );
    }
    this.gemW.end();

    // projectiles : orbes (+ traînées), boomerangs, mines ; Nova : orbes ×1,6
    const orbeScale = w.player.sizeMul; // tome Projectiles : projectiles plus gros
    this.projW.begin();
    this.trailW.begin();
    this.boomW.begin();
    this.mineW.begin();
    for (let i = 0; i < w.projCount; i++) {
      const p = w.projs[i];
      const x = lerp(p.px, p.x, alpha),
        z = lerp(p.pz, p.z, alpha);
      if (p.kind === ProjKind.Boomerang) {
        this.boomW.put(x, p.y, z, p.age * 22, 1, this.cBoom);
        continue;
      }
      if (p.kind === ProjKind.Mine) {
        const blink = p.age < 0.3 ? 0.5 + p.age : 1 + Math.sin(now * 6 + p.x) * 0.1;
        this.mineW.put(x, p.y, z, now * 2, blink, p.armed ? this.cMineArmed : this.cMine);
        continue;
      }
      if (p.kind === ProjKind.Fire) {
        // plaque de feu : s'éteint en rétrécissant, vacille
        const fade = Math.max(0.2, p.life / TRAIT.trainee.life);
        const s = (2.4 + Math.sin(now * 30 + p.z) * 0.3) * fade;
        this.mineW.put(x, p.y, z, now * 9 + p.x, s, this.cFire, 0, 0, s * 0.25); // plate : un quart de hauteur
        continue;
      }
      const grow = Math.min(1, p.age / 0.06);
      const sc = (1.7 + Math.sin(now * 40 + p.x) * 0.2) * grow * orbeScale;
      this.projW.put(x, p.y, z, now * 7, sc, this.cProj, now * 9, 0);
      for (let j = 1; j <= FEEL.trail.projGhosts; j++) {
        const back = Math.min(j * FEEL.trail.projGhostDt, p.age);
        this.trailW.put(x - p.vx * back, p.y, z - p.vz * back, 0, sc * (1.15 - j * 0.2), this.cTrail[j - 1]);
      }
    }
    this.projW.end();
    this.trailW.end();
    this.boomW.end();
    this.mineW.end();

    // halo (rayon = stats courantes : lignes « rayon » et tome Projectiles)
    const lvA = w.weapons.aura ?? 0;
    if (lvA > 0) {
      const r = weaponStats(w, 'aura').r;
      const pulse = w.wstate.auraPulse;
      this.aura.visible = this.auraDisc.visible = true;
      this.aura.position.set(px, 0.06, pz);
      this.auraDisc.position.set(px, 0.05, pz);
      this.aura.scale.setScalar(r * (1 + pulse * 0.06));
      this.auraDisc.scale.setScalar(r);
      const m = this.aura.material as THREE.MeshBasicMaterial;
      m.opacity = 0.25 + pulse * 0.35;
      m.color.setHex(PAL.xp);
      (this.auraDisc.material as THREE.MeshBasicMaterial).color.setHex(PAL.xp);
    } else this.aura.visible = this.auraDisc.visible = false;

    // lames + 3 fantômes chacune (angles précédents, fondu) ; taille = tome Projectiles
    const lvL = w.weapons.lames ?? 0;
    this.bladeW.begin();
    this.bladeGhostW.begin();
    if (lvL > 0) {
      const sL = weaponStats(w, 'lames');
      const r = sL.r * w.bladeRangeMul;
      const bs = w.player.sizeMul;
      const by = py + 0.8;
      for (let i = 0; i < sL.n; i++) {
        const a = w.wstate.bladeA + (i * TAU) / sL.n;
        this.bladeW.put(px + Math.sin(a) * r, by, pz + Math.cos(a) * r, a + Math.PI / 2, bs, this.cPaper);
        for (let k = 1; k <= FEEL.trail.bladeGhosts; k++) {
          const ag = a - k * sL.spd * 0.03;
          this.bladeGhostW.put(
            px + Math.sin(ag) * r,
            by,
            pz + Math.cos(ag) * r,
            ag + Math.PI / 2,
            bs * (1 - k * 0.15),
            this.cBladeGhost[k - 1],
          );
        }
      }
    }
    this.bladeW.end();
    this.bladeGhostW.end();

    // lacs : la rive scintille
    for (let i = 1; i < this.lakeMeshes.length; i += 2)
      (this.lakeMeshes[i].material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(now * 1.5 + i) * 0.12;

    this.particles.update(dt);
    this.bolts.update(dt);

    // caméra : suivi amorti, avance, zoom-out progressif (8 % sur 15 min), recul 10 % pendant un boss, shake borné
    const zoomTarget =
      1 + FEEL.camera.zoomOutAt15min * Math.min(1, w.t / 900) + (w.bossIndex >= 0 ? FEEL.camera.bossPullback : 0);
    this.zoom += (zoomTarget - this.zoom) * Math.min(1, dt * 2);
    const cs = this.camScale * this.zoom;
    const k = 1 - Math.pow(0.0005, dt);
    const look = 1.2; // avance dans la direction du mouvement
    const tx = px + P.dirX * look * (moving ? 1 : 0),
      tz = pz + P.dirZ * look * (moving ? 1 : 0);
    this.camPos.x += (tx - this.camPos.x) * k;
    this.camPos.y += (12.5 * cs - this.camPos.y) * k;
    this.camPos.z += (tz + 10.5 * cs - this.camPos.z) * k;
    this.camLook.x += (tx - this.camLook.x) * k;
    this.camLook.z += (tz - 0.8 - this.camLook.z) * k;
    this.camLook.y = 0.8;
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      const a = Math.min(FEEL.shake.max, this.shake) * 0.6;
      // bruit 2D continu (pas de saut d'une frame à l'autre)
      this.camera.position.x += Math.sin(now * 53.1) * Math.cos(now * 37.7) * a;
      this.camera.position.y += Math.sin(now * 41.3 + 1.7) * Math.cos(now * 29.9) * a;
      this.shake = Math.max(0, this.shake - dt * FEEL.shake.decay);
    }
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
  }

  /** Écran large (PC paysage) : le personnage se place dans le tiers droit, le logo et les boutons à gauche (phase 14). */
  menuWide = false;

  /** Caméra d'attente (menu, phase 14) : plan rapproché, le personnage fait face à la caméra qui oscille lentement. */
  renderIdle(now: number, dt: number): void {
    this.lightCycle(0);
    this.fireflies.update(0, 0, now, 0.6);
    this.player.visible = true;
    this.player.position.set(0, 0, 0);
    this.player.scale.set(1, 1, 1);
    const a = Math.sin(now * 0.18) * 0.45; // ±26° autour de la face
    this.player.rotation.y = a; // le modèle regarde vers +z : face à la caméra
    this.model.torso.position.y =
      (this.model.float ? 0.18 + Math.sin(now * 3.2) * 0.08 : 0) + Math.sin(now * 2.2) * 0.015;
    if (this.model.glowDisc) this.model.glowDisc.position.set(0, 0.07, 0);
    this.blob.position.set(0, 0.03, 0);
    for (let i = 0; i < this.writers.length; i++) {
      this.writers[i].begin();
      this.writers[i].end();
    }
    this.aims.begin();
    this.aims.end();
    this.aura.visible = this.auraDisc.visible = false;
    this.particles.update(dt);
    this.bolts.update(dt);
    // large : caméra à 6,5 u, regard décalé vers la gauche de l'écran pour laisser la place au logo ; étroit (portrait) :
    // un peu plus loin et plus haut, le personnage occupe le centre-bas sous le logo
    const wide = this.menuWide;
    const r = wide ? 6.2 : 11;
    const off = wide ? 1.7 : 0;
    this.camPos.set(Math.sin(a) * r - Math.cos(a) * off, wide ? 2.4 : 3.2, Math.cos(a) * r + Math.sin(a) * off);
    this.camLook.set(-Math.cos(a) * off, wide ? 1.0 : 0.5, Math.sin(a) * off); // portrait : regard bas, le personnage monte entre le logo et Jouer
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
  }

  snapCamera(w: World): void {
    this.zoom = 1;
    this.landT = -1;
    for (const g of this.ghosts) g.life = 0;
    this.camPos.set(w.player.x, 12.5 * this.camScale, w.player.z + 10.5 * this.camScale);
    this.camLook.set(w.player.x, 0.8, w.player.z);
  }

  info(): { calls: number; triangles: number; width: number; height: number; level: number } {
    const c = this.renderer.domElement;
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      width: c.width,
      height: c.height,
      level: this.qualityLevel,
    };
  }
}

function groundTexture(net: boolean): THREE.Texture {
  // damier discret (repère de mouvement) + bruit : brins clairs, mottes sombres, quelques cailloux et fleurs
  // net : 512 px lissés avec mipmaps (phase 9) ; pixel : 128 px au plus proche voisin (look d'origine)
  const N = net ? 512 : 128;
  const K = N / 128; // facteur d'échelle du motif (même dessin aux deux tailles)
  const TILE = 12; // unités monde par répétition
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const px = (x: number, y: number, r: number, gr: number, b: number) => {
    g.fillStyle = `rgb(${r | 0},${gr | 0},${b | 0})`;
    g.fillRect(x, y, 1, 1);
  };
  const cell = 32 * K;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const base = (((x / cell) | 0) + ((y / cell) | 0)) % 2 ? PAL.grass1 : PAL.grass2;
      const n = (rnd() - 0.5) * 10;
      px(x, y, base[0] + n, base[1] + n, base[2] + n);
    }
  const dot = (x: number, y: number, r: number, gr: number, b: number, w = 1, h = 1) => {
    g.fillStyle = `rgb(${r | 0},${gr | 0},${b | 0})`;
    g.fillRect(x, y, w * K, h * K);
  };
  // en net (K = 4), moins de mouchetis mais plus gros et moins contrastés : à la résolution de l'écran, le motif
  // 128 px agrandi K² fois devenait un bruit fin et dense
  const D = net ? K * 1.5 : 1;
  for (let i = 0; i < 420 * D; i++) {
    // brins clairs (2 px verticaux)
    const x = (rnd() * N) | 0,
      y = (rnd() * N) | 0;
    dot(x, y, net ? 88 : 96, net ? 136 : 146, net ? 106 : 112, 0.6, 1.4);
  }
  for (let i = 0; i < 90 * D; i++) {
    // mottes sombres
    const x = (rnd() * N) | 0,
      y = (rnd() * N) | 0;
    dot(x, y, 52, 86, 72, 1.2, 0.8);
  }
  for (let i = 0; i < 14 * D; i++) dot((rnd() * N) | 0, (rnd() * N) | 0, 138, 128, 150, 0.7, 0.7); // cailloux
  for (let i = 0; i < 10 * D; i++) dot((rnd() * N) | 0, (rnd() * N) | 0, 255, 200, 120, 0.6, 0.6); // fleurs
  const t = new THREE.CanvasTexture(c);
  if (net) {
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
  } else t.magFilter = t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set((WORLD_HALF * 2) / TILE, (WORLD_HALF * 2) / TILE);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
