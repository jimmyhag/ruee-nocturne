import * as THREE from 'three';
import {
  BOSS,
  CAPS,
  DECOR,
  ELITE_TYPE,
  ENEMIES,
  ARCHER,
  ARCHER_TYPE,
  HAZARDS,
  MAPCHEST,
  MERCHANT,
  REAPER_TYPE,
  SHRINE,
  SPELL,
  STEP,
  SWARM_TYPE,
  TRAIT,
  VOLANT,
  VOLANT_TYPE,
  WORLD_HALF,
} from '../sim/balance';
import { canOpenMapChest } from '../sim/poi';
import { spellSize } from '../sim/spells';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadProps } from './models';
import type { PropGeometry, PropKey } from './models';
import { Mode, ProjKind, ShotKind, Spell } from '../sim/types';
import type { CharacterKey } from '../sim/types';
import type { World } from '../sim/world';
import { weaponStats } from '../sim/weapons/defs';
import { buildCharacter } from './characters';
import { HeroAnim, buildHero, spellAnim } from './heroes';
import type { HeroModel } from './heroes';
import {
  Fireflies,
  GRASS,
  firGeometry,
  grassGeometry,
  lampHeadGeometry,
  lampPostGeometry,
  mapChestGeometry,
  netGeometry,
  shrineGeometry,
  MERCHANT_LANTERN,
  stallGeometry,
  worksGeometry,
  roundTreeGeometry,
} from './decor';
import { buildEnemyGeometries } from './enemies';
import { setDetail } from './parts';
import { TerrainView } from './terrain';
import { toonGradient, toonMaterial } from './toon';
import { softDiscTexture } from './textures';
import type { CharacterModel } from './characters';
import { FEEL } from './feel';
import { AimLines, Bolts, DamageNumbers, Particles } from './fx';
import { InstanceWriter, makeInstanced } from './instancing';
import { PAL } from './palette';

const TAU = Math.PI * 2;
const WHITE = new THREE.Color(0xffffff);
const MINE_IDLE = new THREE.Color(0xc4c8d6); // bombe KayKit non armée : texture assombrie
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
const ARCHER_RANGE = ARCHER.shotSpeed * ARCHER.shotLife;
/** Distance² sous laquelle coffres de carte et sanctuaires sont dessinés (phase 18 : au-delà, seule la colonne). */
const POI_DRAW2 = 50 * 50;
const PROP_DRAW = 48; // phase 20 : rayon du décor KayKit autour du joueur (le brouillard masque au-delà)
const GRAVES = 40; // phase 20 : petits cimetières semés sur la carte…
const GRAVE_NEAR = 8; // …dont au plus 8 dessinés autour du joueur (≈ 1 k triangles chacun)
const LAMP_NEAR = 12; // lanternes KayKit (≈ 570 triangles) dessinées au plus
const SMALL_DRAW = 30; // rayon des lanternes et cimetières (petits, perdus dans le brouillard au-delà)
const CHEST_ELITE = new THREE.Color(0xffd98a); // coffre d'élite : même modèle que celui de carte, teinté d'or
const ENEMY_CAPS = [450, 450, 120, 2, 120, 60, 2, 2, 1, 40, 24]; // phase 16 : Archer, Sorcier (SPAWN.maxShooters = 24)

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
  /** phase 20 : modèle affiché, procédural (repli) ou glTF animé ; lu par les tests e2e */
  heroKind: 'proc' | 'gltf' = 'proc';
  private heroAnim: HeroModel['anim'] | null = null;
  private heroPending = false;
  private heroReq = 0; // numéro de la dernière demande de héros (une réponse périmée est ignorée)
  private hurtAnimT = 0; // délai avant de rejouer l'animation de coup reçu
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
  private mineW: InstanceWriter; // plaques de feu du Feu follet
  private bombW: InstanceWriter; // mines (bombe KayKit une fois chargée)
  private spitW: InstanceWriter;
  private arrowW: InstanceWriter; // phase 16 : flèches des Archers
  private fireW: InstanceWriter; // phase 16 : boules de feu en vol
  private zoneW: InstanceWriter; // cercles rouges du Colosse (anneau)
  private zoneFillW: InstanceWriter; // disque qui se remplit pendant le télégraphe
  private ringW: InstanceWriter; // ondes de choc du Gardien (phase 11) : anneau fin, rayon = portée du coup
  private chestW: InstanceWriter;
  private netW: InstanceWriter; // phase 19 : filet du Collet (Braconnier)
  // phase 18 : relief (sol déplacé, tout est posé au sol local)
  readonly terrain = new TerrainView();
  private gy = this.terrain.gy;
  private groundMesh: THREE.Mesh | null = null;
  private tRx = 0; // inclinaison du sol au dernier point demandé (tilt) : ombres et cercles collés à la pente
  private tRz = 0;
  private camGy = 0; // hauteur du sol suivie par la caméra (amortie)
  // phase 18 : points d'intérêt (coffres de carte, sanctuaires) et colonnes de lumière qui les signalent de loin
  private mapChestW: InstanceWriter;
  private holdW: InstanceWriter; // anneau qui se remplit pendant l'ouverture
  private shrineW: InstanceWriter;
  private shrineGlowW: InstanceWriter; // runes du sanctuaire : s'allument avec la jauge
  private beamW: InstanceWriter;
  // phase 20 : objets KayKit (CC0) ; arbres et lanternes dessinés autour du joueur seulement (≈ 300 triangles chacun)
  propsReady = false; // lu par les tests e2e
  private propTreeW: InstanceWriter[] = []; // sapin orange, sapin jaune, arbre mort, arbre mort moyen
  private propLampW: InstanceWriter;
  private decorProc: THREE.Object3D[] = []; // décor procédural remplacé quand les objets sont chargés
  private treeData = new Float32Array(0); // x, y, z, ry, s, sorte (0 sapin, 1 rond) par arbre
  private lampData = new Float32Array(0); // x, y, z par lanterne
  private graveData = new Float32Array(0); // x, y, z, ry par petit cimetière (tombes et citrouille, phase 20)
  private propGraveW: InstanceWriter;
  private propX = 1e9; // position du joueur au dernier tri du décor proche
  private propZ = 1e9;
  private cChest = new THREE.Color(PAL.gold); // couleur d'instance des coffres (blanche une fois le modèle texturé chargé)
  private cBladeCol = new THREE.Color(PAL.paper);
  private cBoomCol = new THREE.Color(PAL.boomerang);
  private cBeamGold = new THREE.Color(PAL.gold);
  private cBeamGrey = new THREE.Color(0x8a8fa8);
  private cBeamBlue = new THREE.Color(PAL.xp);
  private cPoi = new THREE.Color();
  // phase 17 : échoppe du marchand (une seule, visible pendant sa visite) : 3 appels de rendu quand elle est là
  private stall = new THREE.Group();
  private stallLamp: THREE.Mesh;
  private stallRing: THREE.Mesh;
  private stallVisit = -1;
  private gemW: InstanceWriter;
  private bladeW: InstanceWriter;
  private bladeGhostW: InstanceWriter;
  private dashGhostW: InstanceWriter;
  private cProj = new THREE.Color(PAL.proj);
  private cTrail = PAL.trail.map((c) => new THREE.Color(c));
  private cGem = [new THREE.Color(PAL.gem), new THREE.Color(PAL.gem2), new THREE.Color(PAL.gem3)];
  private cGold = new THREE.Color(PAL.gold);
  private cMine = new THREE.Color(PAL.mine);
  private cFire = new THREE.Color(PAL.accent); // traînée de feu du Feu follet (même mesh que les mines, plus large et plate)
  private cMineArmed = new THREE.Color(0xffffff);
  private cSpit = new THREE.Color(PAL.spit);
  private cArrow = new THREE.Color(PAL.arrow);
  private cFireball = new THREE.Color(PAL.fire); // phase 16 : boule de feu du Sorcier
  private cTele = new THREE.Color(PAL.telegraph);
  private cShadow = new THREE.Color(PAL.ink);
  private cBladeGhost = [0.6, 0.35, 0.15].map((f) => new THREE.Color(PAL.paper).multiplyScalar(f));
  private cGhost = new THREE.Color();
  // phase 19 : ennemis étourdis (Éclat, Collet) ou ralentis (Voile), silhouettes du Voile
  private cStun = new THREE.Color(0xfff1a8);
  private cSlow = new THREE.Color(0x9fd8ff);
  private cVoile = new THREE.Color(PAL.xp);
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
  private lastWhirl = 0; // phase 19 : cadence des particules du Tourbillon

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
    // phase 18 : le sol est un maillage en relief construit avec le décor (buildDecor), couleurs par sommet
    this.groundMat = new THREE.MeshLambertMaterial({ map: this.groundTex(true), vertexColors: true });

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
    this.bombW = new InstanceWriter(
      makeInstanced(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 64),
    );
    this.spitW = new InstanceWriter(
      makeInstanced(new THREE.SphereGeometry(0.32, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 96),
    );
    this.arrowW = new InstanceWriter(
      makeInstanced(new THREE.BoxGeometry(0.13, 0.13, 0.95), new THREE.MeshBasicMaterial({ color: 0xffffff }), 96),
    );
    this.fireW = new InstanceWriter(
      makeInstanced(new THREE.IcosahedronGeometry(0.42, 1), additive(0xffffff, 0.95), 32),
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
    this.netW = new InstanceWriter(makeInstanced(netGeometry(), flat(PAL.gold, 0.85), 2));
    // phase 20 : écrivains du décor KayKit, géométries posées au chargement des objets (applyProps)
    for (let k = 0; k < 4; k++)
      this.propTreeW.push(new InstanceWriter(makeInstanced(new THREE.BufferGeometry(), lam(0xffffff), 64)));
    this.propLampW = new InstanceWriter(makeInstanced(new THREE.BufferGeometry(), lam(0xffffff), LAMP_NEAR));
    this.propGraveW = new InstanceWriter(makeInstanced(new THREE.BufferGeometry(), lam(0xffffff), GRAVE_NEAR));
    for (const pw of [...this.propTreeW, this.propLampW, this.propGraveW]) this.scene.add(pw.mesh);
    loadProps()
      .then((p) => this.applyProps(p))
      .catch((e: unknown) => console.warn('modèles du décor indisponibles, repli procédural', e)); // hors ligne aussi
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
      this.bombW.mesh,
      this.spitW.mesh,
      this.arrowW.mesh,
      this.fireW.mesh,
      this.zoneW.mesh,
      this.zoneFillW.mesh,
      this.ringW.mesh,
      this.chestW.mesh,
      this.netW.mesh,
      this.gemW.mesh,
      this.dashGhostW.mesh,
    );

    // armes
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), flat(PAL.xp, 0.35)); // à plat : inclinable (phase 18)
    this.aura.visible = false;
    this.auraDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), flat(PAL.xp, 0.08));
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
      this.bombW,
      this.spitW,
      this.arrowW,
      this.fireW,
      this.zoneW,
      this.zoneFillW,
      this.ringW,
      this.chestW,
      this.netW,
      this.gemW,
      this.dashGhostW,
      this.bladeW,
      this.bladeGhostW,
    );

    // points d'intérêt (phase 18) : 5 appels de plus au plus (coffres, anneau, sanctuaires, runes, colonnes)
    this.mapChestW = new InstanceWriter(makeInstanced(mapChestGeometry(), toonMaterial({ vertexColors: true }), 24));
    this.holdW = new InstanceWriter(
      makeInstanced(new THREE.RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2), additive(0xffffff, 0.85), 4),
    );
    this.shrineW = new InstanceWriter(makeInstanced(shrineGeometry(), toonMaterial({ vertexColors: true }), 12));
    this.shrineGlowW = new InstanceWriter(
      makeInstanced(new THREE.RingGeometry(0.7, 1, 40).rotateX(-Math.PI / 2), additive(0xffffff, 0.7), 12),
    );
    // colonne de lumière : cylindre ouvert, additif, 16 u de haut, visible au-dessus des arbres
    this.beamW = new InstanceWriter(
      makeInstanced(
        new THREE.CylinderGeometry(0.28, 0.5, 16, 8, 1, true).translate(0, 8, 0),
        additive(0xffffff, 0.22),
        36,
      ),
    );
    this.scene.add(this.mapChestW.mesh, this.holdW.mesh, this.shrineW.mesh, this.shrineGlowW.mesh, this.beamW.mesh);
    this.writers.push(this.mapChestW, this.holdW, this.shrineW, this.shrineGlowW, this.beamW);

    // échoppe : corps toon à contour cuit, lanterne lumineuse, anneau au sol = zone d'entrée (MERCHANT.r)
    const stallBody = new THREE.Mesh(stallGeometry(), toonMaterial({ vertexColors: true }));
    this.stallLamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.28, 0.22),
      new THREE.MeshBasicMaterial({ color: PAL.lantern }),
    );
    this.stallLamp.position.set(MERCHANT_LANTERN.x, MERCHANT_LANTERN.y, MERCHANT_LANTERN.z);
    this.stallRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2),
      additive(PAL.lantern, 0.55),
    );
    this.stallRing.position.y = 0.04;
    this.stall.add(stallBody, this.stallLamp);
    this.stall.visible = this.stallRing.visible = false;
    this.scene.add(this.stall, this.stallRing);

    this.particles = new Particles(this.scene);
    this.fireflies = new Fireflies(this.scene);
    this.bolts = new Bolts(this.scene);
    this.aims = new AimLines(this.scene);
    this.dmg = new DamageNumbers(dmgLayer);
    // phase 18 : les effets reçoivent des y au-dessus du sol local (comme la sim) ; le sol est ajouté ici
    this.particles.ground = this.bolts.ground = this.aims.ground = this.dmg.ground = this.fireflies.ground = this.gy;
  }

  /** Décor statique généré depuis les obstacles et zones de la sim (même seed ⇒ même décor). */
  buildDecor(w: World): void {
    const d = new THREE.Object3D();
    // sol en relief (phase 18) : un appel, ≈ 8 k triangles ; sa grille sert aussi à poser tout le reste
    if (this.groundMesh) this.scene.remove(this.groundMesh);
    this.groundMesh = this.terrain.build(w, this.groundMat);
    this.scene.add(this.groundMesh);
    const gy = this.gy;
    const nTrees = w.treeCount;
    const treeCap = DECOR.trees + DECOR.woodTrees;
    const vc = () => toonMaterial({ vertexColors: true });
    // deux essences (sapin, feuillu) à couleurs par sommet : la couleur d'instance ne porte que la variation de teinte
    const firs = makeInstanced(firGeometry(), vc(), treeCap);
    this.treeData = new Float32Array(nTrees * 6);
    this.lampData = new Float32Array(DECOR.lamps * 3);
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
      d.position.set(o.x, gy(o.x, o.z) - 0.1, o.z);
      d.rotation.set(0, (i * 2.399) % TAU, 0);
      d.scale.set(s, s * (0.9 + ((i * 11) % 7) * 0.04), s);
      d.updateMatrix();
      m.setMatrixAt(k, d.matrix);
      const T = this.treeData;
      T[i * 6] = o.x;
      T[i * 6 + 1] = gy(o.x, o.z) - 0.1;
      T[i * 6 + 2] = o.z;
      T[i * 6 + 3] = (i * 2.399) % TAU;
      T[i * 6 + 4] = s * (0.9 + ((i * 11) % 7) * 0.04);
      T[i * 6 + 5] = round ? 1 : 0;
      m.setColorAt(k, tint.setScalar(0.86 + ((i * 7) % 10) * 0.03));
      d.position.set(o.x + 0.4, gy(o.x + 0.4, o.z + 0.3) + 0.04, o.z + 0.3); // ombre décalée côté opposé au soleil
      this.tilt(o.x + 0.4, o.z + 0.3);
      d.rotation.set(this.tRx, 0, this.tRz);
      d.scale.setScalar(o.r * 1.7);
      d.updateMatrix();
      treeShadows.setMatrixAt(i, d.matrix);
    }
    // menhirs : ombre portée au pied côté opposé au soleil
    for (let i = 0; i < nStones; i++) {
      const o = w.obstacles[w.rockEnd + i];
      d.position.set(o.x + 0.6, gy(o.x + 0.6, o.z + 0.45) + 0.04, o.z + 0.45);
      this.tilt(o.x + 0.6, o.z + 0.45);
      d.rotation.set(this.tRx, 0, this.tRz);
      d.scale.setScalar(o.r * 1.9);
      d.updateMatrix();
      treeShadows.setMatrixAt(nTrees + i, d.matrix);
    }
    treeShadows.count = nTrees + nStones;
    const nRocks = w.rockEnd - nTrees;
    for (let i = 0; i < nRocks; i++) {
      const o = w.obstacles[nTrees + i];
      const s = o.r / 0.75;
      d.position.set(o.x, gy(o.x, o.z) + 0.3 * s, o.z);
      d.rotation.set(0, (i * 1.7) % TAU, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      rocks.setMatrixAt(i, d.matrix);
    }
    // lanternes : au centre des cercles de pierres (phase 16), puis près des arbres (pas de collision) ; pied, tête, halo
    for (let i = 0; i < DECOR.lamps; i++) {
      const c = w.stoneCenters[i];
      const o = c ?? w.obstacles[(i * 37) % nTrees];
      if (c) d.position.set(c.x, gy(c.x, c.z), c.z);
      else d.position.set(o.x + 2.2, gy(o.x + 2.2, o.z + 1.3), o.z + 1.3);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(0.9);
      d.updateMatrix();
      posts.setMatrixAt(i, d.matrix);
      this.lampData[i * 3] = d.position.x;
      this.lampData[i * 3 + 1] = d.position.y;
      this.lampData[i * 3 + 2] = d.position.z;
      lamps.setMatrixAt(i, d.matrix);
      d.position.y += 0.08;
      this.tilt(d.position.x, d.position.z);
      d.rotation.set(this.tRx, 0, this.tRz);
      d.updateMatrix();
      halos.setMatrixAt(i, d.matrix);
    }
    // phase 20 : petits cimetières (tombes, citrouille) au pied des arbres, hors lacs ; dessinés seulement en KayKit
    const G: number[] = [];
    for (let i = 0; i < GRAVES && nTrees > 0; i++) {
      const o = w.obstacles[(i * 61 + 7) % nTrees];
      const ang = (i * 2.399 + 1.1) % TAU;
      const x = o.x + Math.sin(ang) * (o.r + 1.8),
        z = o.z + Math.cos(ang) * (o.r + 1.8);
      let wet = false;
      for (const l of w.lakes) if ((x - l.x) * (x - l.x) + (z - l.z) * (z - l.z) < (l.r + 1) * (l.r + 1)) wet = true;
      if (wet || Math.abs(x) > WORLD_HALF - 2 || Math.abs(z) > WORLD_HALF - 2) continue;
      G.push(x, gy(x, z) - 0.05, z, ang + Math.PI);
    }
    this.graveData = new Float32Array(G);
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
      d.position.set(x, gy(x, z) - 0.05, z);
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
    this.decorProc = [firs, rounds, posts, lamps];
    for (const m of this.decorProc) m.visible = !this.propsReady;
    this.propX = this.propZ = 1e9;
    for (const m of [treeShadows, firs, rounds, rocks, posts, lamps, halos, grass]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
      this.scene.add(m);
    }
    // ouvrages (phase 16) : murets, troncs et menhirs en une seule géométrie statique, un appel de rendu
    const works = worksGeometry(w, gy);
    if (works) this.scene.add(new THREE.Mesh(works, vc()));
    // lacs : disque bleu + anneau de rive qui scintille (animé dans render)
    for (const m of this.lakeMeshes) this.scene.remove(m);
    this.lakeMeshes.length = 0;
    for (const l of w.lakes) {
      const water = new THREE.Mesh(new THREE.CircleGeometry(l.r, 40), flat(PAL.lake, 0.6));
      water.rotation.x = -Math.PI / 2;
      water.position.set(l.x, gy(l.x, l.z) + 0.25, l.z); // fond de cuvette plat (phase 18) : l'eau au-dessus
      const shore = new THREE.Mesh(new THREE.RingGeometry(l.r * 0.93, l.r, 40), additive(PAL.paper, 0.35));
      shore.rotation.x = -Math.PI / 2;
      shore.position.set(l.x, gy(l.x, l.z) + 0.27, l.z);
      this.scene.add(water, shore);
      this.lakeMeshes.push(water, shore);
    }
  }

  /** Inclinaison du sol en (x, z) dans tRx / tRz : un disque plat posé là épouse la pente. Aucune allocation. */
  private tilt(x: number, z: number): void {
    // pente ≤ 0,35 : atan(g) ≈ g à 4 % près, invisible ; une seule lecture bilinéaire (relecture perf-reviewer)
    this.terrain.gyGrad(x, z);
    this.tRx = -this.terrain.gradZ;
    this.tRz = this.terrain.gradX;
  }

  /** Change le personnage affiché (menu : aperçu ; partie : personnage choisi) et sa tenue. Idempotent. */
  setCharacter(key: CharacterKey, skin = 0, force = false): void {
    // même personnage : rien à faire, sauf si le héros glTF n'a encore jamais été demandé (modèle de départ procédural)
    if (!force && key === this.modelKey && skin === this.modelSkin && (this.heroKind === 'gltf' || this.heroPending))
      return;
    this.modelKey = key;
    this.modelSkin = skin;
    // repli procédural tout de suite, puis le héros glTF (phase 20) dès qu'il est chargé ; hors ligne, le repli reste
    this.swapModel(buildCharacter(key, skin), null, true);
    const req = ++this.heroReq;
    this.heroPending = true;
    buildHero(key, skin).then(
      (hero) => {
        if (req !== this.heroReq) return hero.dispose(); // personnage changé entre-temps
        this.heroPending = false;
        this.swapModel(hero, hero.anim, false); // fantôme de dash : silhouette procédurale gardée (≈ 4 k tris de moins)
      },
      () => {
        if (req === this.heroReq) this.heroPending = false; // hors ligne : le repli reste, nouvel essai au prochain choix
      },
    );
  }
  private swapModel(next: CharacterModel, anim: HeroModel['anim'] | null, ghost: boolean): void {
    const old = this.model;
    this.player.remove(old.group);
    if (old.glowDisc) this.scene.remove(old.glowDisc);
    this.player.add(next.group);
    if (next.glowDisc) this.scene.add(next.glowDisc);
    if (ghost) {
      const g = this.dashGhostW.mesh;
      g.geometry.dispose();
      g.geometry = next.silhouette.clone();
    }
    old.dispose();
    this.model = next;
    this.heroAnim = anim;
    this.heroKind = anim ? 'gltf' : 'proc';
  }
  /** Sort lancé (Ev.Spell) : animation propre au sort sur le héros glTF. */
  onSpell(s: Spell): void {
    this.heroAnim?.trigger(spellAnim(s), s === 1 ? 1.4 : 1.3);
  }
  /** Coup encaissé (Ev.PlayerHurt) : sursaut, au plus toutes les 0,6 s (le contact blesse à chaque pas). */
  onHurt(): void {
    if (this.hurtAnimT > 0 || !this.heroAnim) return;
    this.hurtAnimT = 0.6;
    this.heroAnim.trigger(HeroAnim.Hit, 1.6);
  }
  /** Nouvelle partie : le héros repart de l'animation de repos (la mort reste figée sinon). */
  resetHero(): void {
    this.heroAnim?.reset();
  }

  /** Objets KayKit chargés : géométries et matériaux toon texturés à la place des formes procédurales. */
  private applyProps(p: Record<PropKey, PropGeometry>): void {
    const mats = new Map<THREE.Texture | null, THREE.MeshToonMaterial>();
    const mat = (g: PropGeometry) => {
      let m = mats.get(g.map);
      if (!m) {
        m = new THREE.MeshToonMaterial({ map: g.map, gradientMap: toonGradient() });
        mats.set(g.map, m);
      }
      return m;
    };
    /** Géométrie normalisée : `size` = hauteur (axis 'y') ou plus grande largeur au sol (axis 'xz'). */
    const norm = (g: PropGeometry, size: number, axis: 'y' | 'xz', center = true) => {
      const geo = g.geometry.clone();
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      const ext = axis === 'y' ? b.max.y - b.min.y : Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      const k = size / Math.max(1e-3, ext);
      if (center) geo.translate(-(b.min.x + b.max.x) / 2, 0, -(b.min.z + b.max.z) / 2);
      geo.scale(k, k, k);
      return geo;
    };
    // tout est construit d'abord, puis échangé d'un coup : une exception en route laisse le décor procédural intact
    const todo: [InstanceWriter, THREE.BufferGeometry, THREE.Material][] = [];
    const swap = (wr: InstanceWriter, geo: THREE.BufferGeometry, m: THREE.Material) => todo.push([wr, geo, m]);
    const merge = (list: THREE.BufferGeometry[]) => (list.length > 1 ? mergeGeometries(list) : null) ?? list[0];
    // coffres d'élite et de carte : le même coffre (728 triangles ; le doré en pèse 1 568, jusqu'à 16 à l'écran),
    // l'élite teinté d'or par la couleur d'instance ; le coffre flottant était centré, le modèle a l'origine au sol
    swap(this.chestW, norm(p.chest, 1.0, 'xz').translate(0, -0.3, 0), mat(p.chest));
    swap(this.mapChestW, norm(p.chest, 1.1, 'xz'), mat(p.chest));
    swap(this.shrineW, norm(p.shrine, 1.0, 'xz'), mat(p.shrine));
    // lame : épée couchée le long de x (comme l'ancienne boîte de 1 u) ; boomerang : hache à plat, tournant autour de y
    const sword = norm(p.sword, 1.15, 'y').rotateZ(-Math.PI / 2);
    swap(this.bladeW, sword, mat(p.sword));
    // hache : manche le long de y, fer le long de x → couchée à plat (rotateX) et centrée, elle tourne sur elle-même
    swap(
      this.boomW,
      norm(p.axe, 1.3, 'y')
        .translate(0, -0.65, 0)
        .rotateX(-Math.PI / 2),
      mat(p.axe),
    );
    // mine : bombe posée au sol ; non armée, teinte sombre ; armée, texture pleine qui pulse
    swap(this.bombW, norm(p.bomb, 0.8, 'y'), mat(p.bomb));
    this.cMine = MINE_IDLE;
    const trees: PropKey[] = ['tree_pine', 'tree_pine_y', 'tree_dead', 'tree_dead_m'];
    for (let k = 0; k < 4; k++) swap(this.propTreeW[k], norm(p[trees[k]], k < 2 ? 4.6 : 4.0, 'y'), mat(p[trees[k]]));
    swap(this.propLampW, norm(p.lantern, 2.4, 'y'), mat(p.lantern));
    // petit cimetière : stèle, tombe et citrouille fusionnées (même texture Halloween ⇒ un appel)
    const at = (g: THREE.BufferGeometry, x: number, z: number, ry: number) => g.rotateY(ry).translate(x, 0, z);
    const graveParts = [
      at(norm(p.gravestone, 1.2, 'y'), 0, 0, 0),
      at(norm(p.grave, 0.95, 'y'), 1.25, 0.45, -0.35),
      at(norm(p.pumpkin, 0.62, 'y'), -1.0, 0.7, 0.6),
    ];
    const sameMap = p.grave.map === p.gravestone.map && p.pumpkin.map === p.gravestone.map;
    swap(this.propGraveW, sameMap ? merge(graveParts) : graveParts[0], mat(p.gravestone));
    // échoppe : caisses, tonneau et pièces KayKit autour de l'étal procédural (auvent et colporteur gardés)
    const dress: [PropKey, number, number, number, number, number][] = [
      ['crates', 1.25, -1.65, 0, -0.05, 0.25],
      ['barrel', 0.9, 1.6, 0, 0.1, 0],
      ['coins', 0.3, 0.5, 0.86, 0.35, 0.5],
    ];
    const byMap = new Map<THREE.Texture | null, THREE.BufferGeometry[]>();
    for (const [key, h, x, y, z, ry] of dress) {
      const g = norm(p[key], h, 'y').rotateY(ry).translate(x, y, z);
      const list = byMap.get(p[key].map) ?? [];
      list.push(g);
      byMap.set(p[key].map, list);
    }
    const stallParts: THREE.Mesh[] = [];
    for (const [map, list] of byMap) {
      const g = merge(list);
      stallParts.push(new THREE.Mesh(g, mat({ geometry: g, map })));
    }
    for (const [wr, geo, m] of todo) {
      wr.mesh.geometry.dispose();
      wr.mesh.geometry = geo;
      wr.mesh.material = m;
    }
    this.bladeGhostW.mesh.geometry = sword;
    this.stall.add(...stallParts);
    this.cChest = CHEST_ELITE;
    this.cBladeCol = this.cBoomCol = WHITE;
    this.propsReady = true;
    for (const m of this.decorProc) m.visible = false;
    this.propX = this.propZ = 1e9;
  }
  /** Arbres et lanternes à moins de PROP_DRAW u du joueur dans les écrivains KayKit (au plus 64 arbres de chaque sorte). */
  private sortNearDecor(px: number, pz: number): void {
    this.propX = px;
    this.propZ = pz;
    for (const wr of this.propTreeW) wr.begin();
    const T = this.treeData,
      R2 = PROP_DRAW * PROP_DRAW,
      r2 = SMALL_DRAW * SMALL_DRAW;
    for (let i = 0; i < T.length; i += 6) {
      const dx = T[i] - px,
        dz = T[i + 2] - pz;
      if (dx * dx + dz * dz > R2) continue;
      const idx = i / 6;
      const kind = (T[i + 5] === 1 ? 2 : 0) + (idx % 2); // ronds → arbres morts, sapins → sapins, deux variantes
      this.propTreeW[kind].put(T[i], T[i + 1], T[i + 2], T[i + 3], T[i + 4] * 0.75, WHITE);
    }
    for (const wr of this.propTreeW) wr.end();
    this.propLampW.begin();
    const L = this.lampData;
    for (let i = 0; i < L.length; i += 3) {
      const dx = L[i] - px,
        dz = L[i + 2] - pz;
      if (dx * dx + dz * dz < r2) this.propLampW.put(L[i], L[i + 1], L[i + 2], i * 0.7, 1, WHITE);
    }
    this.propLampW.end();
    this.propGraveW.begin();
    const G = this.graveData;
    for (let i = 0; i < G.length; i += 4) {
      const dx = G[i] - px,
        dz = G[i + 2] - pz;
      if (dx * dx + dz * dz < r2) this.propGraveW.put(G[i], G[i + 1], G[i + 2], G[i + 3], 1, WHITE);
    }
    this.propGraveW.end();
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
    // formes procédurales plus lisses (ou non) : modèle reconstruit ; le héros glTF ne dépend pas du détail
    if (this.heroKind !== 'gltf') this.setCharacter(this.modelKey, this.modelSkin, true);
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

  /** Saut du joueur (Ev.Jump) : élan du héros glTF, puis la pose en l'air (Fall) prend le relais. */
  onJump(): void {
    this.heroAnim?.trigger(HeroAnim.Jump, 1.6);
  }

  /** Atterrissage du joueur : lance le ressort d'écrasement (valeurs neutres depuis la PR #6). */
  onLand(): void {
    this.landT = 0;
    this.heroAnim?.trigger(HeroAnim.Land, 2);
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
    const gp = this.gy(px, pz); // phase 18 : sol local sous le joueur (la sim donne y au-dessus du sol)
    this.lightCycle(w.t);
    this.fireflies.update(px, pz, now, this.night);
    this.particles.billboardRx = -Math.atan2(this.camPos.y - this.camLook.y, this.camPos.z - this.camLook.z);

    // joueur
    this.player.position.set(px, py + gp, pz);
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
    // flottants : ondulation et léger balancement ; marcheurs : bob de course (procédural seulement : le héros glTF a
    // sa propre course)
    const A = this.heroAnim;
    M.torso.position.y = M.float
      ? 0.18 + Math.sin(now * 3.2) * 0.08
      : moving && P.onGround && !A
        ? Math.abs(Math.cos(P.walk)) * 0.06
        : 0;
    if (A) {
      // phase 20 : animation de fond depuis l'état de la sim (lecture seule) ; la mort se joue une fois
      if (this.hurtAnimT > 0) this.hurtAnimT -= dt;
      if (w.mode === Mode.Dead) A.trigger(HeroAnim.Death);
      const sp = Math.sqrt(P.vx * P.vx + P.vz * P.vz);
      const base = !P.onGround ? HeroAnim.Fall : moving && !M.float ? HeroAnim.Run : HeroAnim.Idle;
      A.update(dt, base, Math.max(0.6, Math.min(1.8, sp / 6.2)));
    }
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
    // clignote pendant l'invulnérabilité qui suit un coup encaissé, pas pendant celle d'un sort (phase 19 : Clignement, Voile)
    this.player.visible =
      !(P.invul > 0 && P.dashT <= 0 && w.t - w.hurtAt < FEEL.trail.hurtBlink && Math.floor(now * 20) % 2 === 1) ||
      hurtFlash;
    if (M.glowDisc) {
      M.glowDisc.visible = this.player.visible;
      M.glowDisc.position.set(px, gp + 0.1, pz);
      this.tilt(px, pz);
      M.glowDisc.rotation.set(this.tRx, 0, this.tRz); // géométrie déjà à plat
      M.glowDisc.scale.setScalar(1 + Math.sin(now * 11) * 0.05); // vacillement
    }
    this.blob.position.set(px, gp + 0.06, pz);
    this.blob.rotation.set(this.tRx, 0, this.tRz); // géométrie déjà à plat
    this.blob.scale.setScalar(Math.max(0.4, 1 - py * 0.25));

    // dash (Bond, Comète) et Voile (phase 19) : 1 particule par frame + silhouettes en fondu
    const voile = w.spell === Spell.Voile && P.spellT > 0;
    if (P.dashT > 0 || voile) {
      this.particles.burst(px, py + 0.8, pz, voile ? PAL.xp : PAL.cream, 1, 0, 0, false);
      if (now - this.lastGhost >= FEEL.trail.dashGhostEvery) {
        this.lastGhost = now;
        const g = this.ghosts[this.ghostNext];
        this.ghostNext = (this.ghostNext + 1) % FEEL.trail.dashGhosts;
        g.x = px;
        g.y = py + gp;
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
      this.cGhost.copy(voile ? this.cVoile : this.cFire).multiplyScalar(Math.max(0, g.life / FEEL.trail.dashGhostLife));
      this.dashGhostW.put(g.x, g.y, g.z, g.ry, 1, this.cGhost);
    }
    this.dashGhostW.end();
    // phase 19 : Tourbillon (trois haches de lumière qui tournent autour du Bûcheron) et filet du Collet
    if (P.spellT > 0 && w.spell === Spell.Tourbillon && now - this.lastWhirl >= FEEL.trail.whirlEvery) {
      this.lastWhirl = now;
      const r = SPELL.tourbillon.r * spellSize(P);
      // trois bras de lumière dorée, deux points par bras (du milieu au bord du rayon de frappe)
      for (let k = 0; k < 3; k++) {
        const a = now * 14 + k * 2.094;
        for (let j = 1; j <= 2; j++) {
          const d = r * (0.45 + j * 0.25);
          this.particles.burst(px + Math.sin(a) * d, py + 0.6, pz + Math.cos(a) * d, PAL.lantern, 1, 0.8, 0.6, false);
        }
      }
    }
    this.netW.begin();
    if (P.spellT > 0 && w.spell === Spell.Collet) {
      const S2 = w.sstate,
        r = SPELL.collet.r * spellSize(P);
      this.tilt(S2.x, S2.z);
      this.netW.put(S2.x, this.gy(S2.x, S2.z) + 0.08, S2.z, now * 0.3, r, WHITE, this.tRx, this.tRz);
    }
    this.netW.end();

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
      // phase 19 : un ennemi étourdi pâlit (jaune), un ennemi ralenti bleuit ; le flash blanc du coup passe avant
      const col =
        e.flash > 0
          ? WHITE
          : e.stun > 0
            ? this.cStun
            : e.slowT > 0
              ? this.cSlow
              : e.elite
                ? this.eliteColor[e.type]
                : this.enemyColor[e.type];
      let s = (e.flash > 0 ? S.hitScale : 1) * (e.elite ? 1.25 : 1);
      const eg = this.gy(ex, ez);
      const ey = e.y + hop + eg;
      if (e.type === VOLANT_TYPE) {
        // ombre au sol : grossit pendant le télégraphe (0,6 s avant la plongée)
        const tele = e.state === 1 ? 1 + (1 - Math.max(0, e.timer / VOLANT.telegraph)) * 1.6 : 1;
        this.shadowW.put(ex, eg + 0.06, ez, 0, 0.6 * tele * (e.state === 2 ? 0.6 : 1), this.cShadow);
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
        // phase 16 : ligne de visée de l'Archer, figée dans la direction du tir (16 u : la portée de la flèche)
        if (e.type === ARCHER_TYPE && e.state === 1)
          this.aims.add(ex, 1.0, ez, ex + e.tx * ARCHER_RANGE, 1.0, ez + e.tz * ARCHER_RANGE, e.aim);
        if (e.elite && e.type === ELITE_TYPE && e.state === 1) {
          // Brute élite qui arme sa charge : couloir rouge au sol jusqu'au point d'arrivée, qui s'élargit (0 → largeur réelle)
          const C = HAZARDS.charge;
          const f = 1 - e.timer / C.telegraph;
          const half = C.dist * 0.5 + e.r;
          this.zoneFillW.put(
            ex + e.tx * half,
            eg + 0.08,
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
      if (e.type !== VOLANT_TYPE || e.elite) this.tilt(ex, ez);
      if (e.type !== VOLANT_TYPE)
        this.shadowW.put(ex, eg + 0.05, ez, 0, e.r * 1.15 * (1 - hop * 0.6), this.cShadow, this.tRx, this.tRz);
      if (e.elite) this.eliteW.put(ex, eg + 0.08, ez, now * 1.5, e.r * 1.3, this.cGold, this.tRx, this.tRz);
    }
    for (let t = 0; t < this.enemyW.length; t++) this.enemyW[t].end();
    this.shadowW.end();
    this.eliteW.end();
    this.aims.end();

    // crachats et cercles rouges (projectiles ennemis)
    this.spitW.begin();
    this.arrowW.begin();
    this.fireW.begin();
    this.zoneW.begin();
    this.ringW.begin();
    for (let i = 0; i < w.shotCount; i++) {
      const sh = w.shots[i];
      if (sh.kind === ShotKind.Spit) {
        const sx = lerp(sh.px, sh.x, alpha),
          sz = lerp(sh.pz, sh.z, alpha);
        this.spitW.put(sx, this.gy(sx, sz) + 0.45 + Math.sin(now * 9 + i) * 0.1, sz, now * 5, 1, this.cSpit);
      } else if (sh.kind === ShotKind.Arrow) {
        const sx = lerp(sh.px, sh.x, alpha),
          sz = lerp(sh.pz, sh.z, alpha);
        this.arrowW.put(sx, this.gy(sx, sz) + 1.0, sz, Math.atan2(sh.vx, sh.vz), 1, this.cArrow);
      } else if (sh.kind === ShotKind.Fireball) {
        // boule de feu : arc en cloche du Sorcier vers le cercle, qui se remplit au sol pendant le vol
        const f = Math.min(1, 1 - (sh.life - alpha * STEP) / sh.t0);
        const g0 = this.gy(sh.ox, sh.oz),
          g1 = this.gy(sh.x, sh.z);
        this.fireW.put(
          sh.ox + (sh.x - sh.ox) * f,
          g0 + (g1 - g0) * f + 0.9 + Math.sin(f * Math.PI) * 4.5 + (1 - f) * 0.6,
          sh.oz + (sh.z - sh.oz) * f,
          now * 6,
          1 + Math.sin(now * 20) * 0.08,
          this.cFireball,
        );
        this.tilt(sh.x, sh.z);
        this.zoneW.put(sh.x, g1 + 0.1, sh.z, 0, sh.r, this.cTele, this.tRx, this.tRz);
        this.zoneFillW.put(sh.x, g1 + 0.09, sh.z, 0, sh.r * f, this.cTele, this.tRx, this.tRz);
      } else if (sh.kind === ShotKind.Ring) {
        // onde de choc du Gardien : anneau qui grandit, posé au sol (le joueur la saute)
        const r = sh.r + HAZARDS.ring.speed * alpha * STEP;
        this.tilt(sh.x, sh.z);
        this.ringW.put(sh.x, this.gy(sh.x, sh.z) + 0.15, sh.z, 0, r, this.cTele, this.tRx, this.tRz);
      } else {
        // cercle du Colosse (immobile) ou fissure d'éruption (suit le joueur, posée sur le sol local) : le disque se remplit
        const eruption = sh.kind === ShotKind.Eruption;
        const f = 1 - Math.max(0, sh.life / (eruption ? HAZARDS.eruption.telegraph : BOSS.zoneTelegraph));
        const sx = eruption ? lerp(sh.px, sh.x, alpha) : sh.x,
          sz = eruption ? lerp(sh.pz, sh.z, alpha) : sh.z;
        const gy = this.gy(sx, sz);
        this.tilt(sx, sz);
        this.zoneW.put(sx, gy + 0.1, sz, 0, sh.r, this.cTele, this.tRx, this.tRz);
        this.zoneFillW.put(sx, gy + 0.09, sz, 0, sh.r * f, this.cTele, this.tRx, this.tRz);
      }
    }
    this.spitW.end();
    this.arrowW.end();
    this.fireW.end();
    this.zoneW.end();
    this.zoneFillW.end();
    this.ringW.end();

    // phase 20 : arbres et lanternes KayKit autour du joueur (tri refait tous les 4 u de déplacement)
    if (this.propsReady && (px - this.propX) ** 2 + (pz - this.propZ) ** 2 > 16) this.sortNearDecor(px, pz);

    // coffres : flottent et tournent ; coffre de boss plus gros
    this.chestW.begin();
    for (let i = 0; i < w.chestCount; i++) {
      const c = w.chests[i];
      const pop = Math.min(1, c.age / 0.25);
      this.chestW.put(
        c.x,
        this.gy(c.x, c.z) + 0.45 + Math.sin(now * 2.5 + i) * 0.12,
        c.z,
        now * 1.2,
        (c.boss ? 1.4 : 1) * pop,
        this.cChest,
      );
    }
    this.chestW.end();

    // coffres de carte et sanctuaires (phase 18) : colonne de lumière dorée (abordable), grise (pas assez d'or ou 6 objets),
    // bleue (sanctuaire) ; anneau qui se remplit pendant l'ouverture ; runes qui s'allument avec la jauge du sanctuaire
    this.mapChestW.begin();
    this.holdW.begin();
    this.shrineW.begin();
    this.shrineGlowW.begin();
    this.beamW.begin();
    const affordable = canOpenMapChest(w);
    for (let i = 0; i < w.mapChests.length; i++) {
      const c = w.mapChests[i];
      if (c.open) continue;
      const g = this.gy(c.x, c.z);
      // le coffre ne se dessine qu'à moins de 50 u (au-delà, brouillard) ; la colonne de lumière, elle, se voit de loin
      const nearC = (c.x - px) ** 2 + (c.z - pz) ** 2 < POI_DRAW2;
      if (nearC) {
        this.tilt(c.x, c.z);
        this.mapChestW.put(c.x, g - 0.02, c.z, i * 1.7, 1.05, WHITE, this.tRx, this.tRz);
      }
      const bw = 1 + Math.sin(now * 2 + i) * 0.06;
      this.beamW.put(c.x, g, c.z, 0, bw, affordable ? this.cBeamGold : this.cBeamGrey, 0, 0, 1, bw);
      if (c.hold > 0 && nearC) {
        const f = Math.min(1, c.hold / MAPCHEST.hold);
        this.holdW.put(
          c.x,
          g + 0.1,
          c.z,
          0,
          MAPCHEST.r * (0.4 + f * 0.6),
          this.cPoi.copy(this.cBeamGold).multiplyScalar(0.5 + f),
          this.tRx,
          this.tRz,
        );
      }
    }
    for (let i = 0; i < w.shrines.length; i++) {
      const sr = w.shrines[i];
      const g = this.gy(sr.x, sr.z);
      const f = sr.used ? 0 : sr.charge / SHRINE.charge;
      if ((sr.x - px) ** 2 + (sr.z - pz) ** 2 < POI_DRAW2) {
        this.tilt(sr.x, sr.z);
        this.shrineW.put(sr.x, g - 0.05, sr.z, i * 0.9, SHRINE.r * 0.9, WHITE, this.tRx, this.tRz);
        this.cPoi.copy(this.cBeamBlue).multiplyScalar(sr.used ? 0.12 : 0.35 + f * 1.2 + Math.sin(now * 3 + i) * 0.08);
        this.shrineGlowW.put(sr.x, g + 0.12, sr.z, now * 0.4, SHRINE.r * (1 + f * 0.08), this.cPoi, this.tRx, this.tRz);
      }
      if (!sr.used) this.beamW.put(sr.x, g, sr.z, 0, 1 + f * 0.6, this.cBeamBlue, 0, 0, 1, 1 + f * 0.6);
    }
    this.mapChestW.end();
    this.holdW.end();
    this.shrineW.end();
    this.shrineGlowW.end();
    this.beamW.end();

    // échoppe du marchand : apparition en 0,4 s, anneau qui respire, lanterne qui vacille
    const MR = w.merchant;
    this.stall.visible = this.stallRing.visible = MR.active;
    if (MR.active) {
      const left = MR.until - w.t;
      const pop = Math.min(1, (MERCHANT.stay - left) / 0.4, left / 0.4);
      const sg = this.gy(MR.x, MR.z);
      this.stall.position.set(MR.x, sg, MR.z);
      if (this.stallVisit !== MR.visit) {
        this.stallVisit = MR.visit; // orientée vers le joueur à son arrivée, puis fixe
        this.stall.rotation.y = Math.atan2(P.x - MR.x, P.z - MR.z);
      }
      this.stall.scale.setScalar(Math.max(0.01, pop));
      this.stallLamp.scale.setScalar(0.9 + Math.sin(now * 9) * 0.08 + Math.sin(now * 23) * 0.04);
      this.stallRing.position.set(MR.x, sg + 0.08, MR.z);
      this.tilt(MR.x, MR.z);
      this.stallRing.rotation.set(this.tRx, 0, this.tRz);
      this.stallRing.scale.setScalar(MERCHANT.r * (1 + Math.sin(now * 3) * 0.04) * pop);
    }

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
        this.gy(g.x, g.z) + 0.4 + Math.sin(now * 3 + g.x) * 0.1,
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
    this.bombW.begin();
    for (let i = 0; i < w.projCount; i++) {
      const p = w.projs[i];
      const x = lerp(p.px, p.x, alpha),
        z = lerp(p.pz, p.z, alpha),
        y = p.y + this.gy(x, z); // phase 18 : y de la sim au-dessus du sol local
      if (p.kind === ProjKind.Boomerang) {
        this.boomW.put(x, y, z, p.age * 22, 1, this.cBoomCol);
        continue;
      }
      if (p.kind === ProjKind.Mine) {
        const blink = p.age < 0.3 ? 0.5 + p.age : 1 + Math.sin(now * 6 + p.x) * 0.1;
        this.bombW.put(x, y, z, now * 2, blink, p.armed ? this.cMineArmed : this.cMine);
        continue;
      }
      if (p.kind === ProjKind.Fire) {
        // plaque de feu : s'éteint en rétrécissant, vacille
        const fade = Math.max(0.2, p.life / TRAIT.trainee.life);
        const s = (2.4 + Math.sin(now * 30 + p.z) * 0.3) * fade;
        this.mineW.put(x, y + 0.05, z, now * 9 + p.x, s, this.cFire, 0, 0, s * 0.25); // plate : un quart de hauteur
        continue;
      }
      const grow = Math.min(1, p.age / 0.06);
      const sc = (1.7 + Math.sin(now * 40 + p.x) * 0.2) * grow * orbeScale;
      this.projW.put(x, y, z, now * 7, sc, this.cProj, now * 9, 0);
      for (let j = 1; j <= FEEL.trail.projGhosts; j++) {
        const back = Math.min(j * FEEL.trail.projGhostDt, p.age);
        this.trailW.put(x - p.vx * back, y, z - p.vz * back, 0, sc * (1.15 - j * 0.2), this.cTrail[j - 1]);
      }
    }
    this.projW.end();
    this.trailW.end();
    this.boomW.end();
    this.mineW.end();
    this.bombW.end();

    // halo (rayon = stats courantes : lignes « rayon » et tome Projectiles)
    const lvA = w.weapons.aura ?? 0;
    if (lvA > 0) {
      const r = weaponStats(w, 'aura').r;
      const pulse = w.wstate.auraPulse;
      this.aura.visible = this.auraDisc.visible = true;
      this.tilt(px, pz);
      this.aura.position.set(px, gp + 0.12, pz);
      this.auraDisc.position.set(px, gp + 0.1, pz);
      this.aura.rotation.set(this.tRx, 0, this.tRz);
      this.auraDisc.rotation.set(this.tRx, 0, this.tRz);
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
      const by = py + gp + 0.8;
      for (let i = 0; i < sL.n; i++) {
        const a = w.wstate.bladeA + (i * TAU) / sL.n;
        this.bladeW.put(px + Math.sin(a) * r, by, pz + Math.cos(a) * r, a + Math.PI / 2, bs, this.cBladeCol);
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
    this.camGy += (gp - this.camGy) * k; // phase 18 : la caméra suit le relief, amortie
    this.camPos.x += (tx - this.camPos.x) * k;
    this.camPos.y += (this.camGy + 12.5 * cs - this.camPos.y) * k;
    this.camPos.z += (tz + 10.5 * cs - this.camPos.z) * k;
    this.camLook.x += (tx - this.camLook.x) * k;
    this.camLook.z += (tz - 0.8 - this.camLook.z) * k;
    this.camLook.y = this.camGy + 0.8;
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
    if (this.propsReady && this.propX * this.propX + this.propZ * this.propZ > 16) this.sortNearDecor(0, 0); // menu : clairière
    this.player.visible = true;
    this.player.position.set(0, 0, 0);
    this.player.scale.set(1, 1, 1);
    const a = Math.sin(now * 0.18) * 0.45; // ±26° autour de la face
    this.player.rotation.y = a; // le modèle regarde vers +z : face à la caméra
    this.model.torso.position.y =
      (this.model.float ? 0.18 + Math.sin(now * 3.2) * 0.08 : 0) + (this.heroAnim ? 0 : Math.sin(now * 2.2) * 0.015);
    this.heroAnim?.update(dt, HeroAnim.Idle, 1);
    if (this.model.glowDisc) {
      this.model.glowDisc.position.set(0, 0.07, 0);
      this.model.glowDisc.rotation.set(0, 0, 0);
    }
    this.blob.position.set(0, 0.03, 0); // menu : clairière de départ, plate
    this.blob.rotation.set(0, 0, 0);
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
    this.stallVisit = -1; // nouveau run : l'échoppe se tourne de nouveau vers le joueur à sa première visite
    this.landT = -1;
    for (const g of this.ghosts) g.life = 0;
    this.camGy = this.gy(w.player.x, w.player.z);
    this.camPos.set(w.player.x, this.camGy + 12.5 * this.camScale, w.player.z + 10.5 * this.camScale);
    this.camLook.set(w.player.x, this.camGy + 0.8, w.player.z);
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
