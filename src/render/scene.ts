import * as THREE from 'three';
import {
  ARENA,
  BOSS,
  CAPS,
  FINAL,
  DECOR,
  ENEMIES,
  ARCHER,
  ARCHER_TYPE,
  CRACHEUR_TYPE,
  ENDLESS,
  SORCIER_TYPE,
  HAZARDS,
  MAPCHEST,
  MERCHANT,
  METEOR,
  REAPER_TYPE,
  SHRINE,
  STAGE,
  SPELL,
  STEP,
  SWARM_TYPE,
  TRAIT,
  VOLANT,
  VOLANT_TYPE,
  WORLD_HALF,
  POWER,
  VITRIOL,
  BALISE,
  DIFFICULTY,
  BOSSTOTEM,
  CORRUPT,
} from '../sim/balance';
import { chargeOf, isCharger } from '../sim/hazards';
import { flameLit } from '../sim/corrupt';
import { FINAL_DONE, hitsBlocked, ringWarned } from '../sim/final';
import { TOTEM_HIDDEN, canOpenMapChest } from '../sim/poi';
import { spellSize } from '../sim/spells';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadGroundTexture, loadNature, loadProps, tintedNature } from './models';
import { ENEMY_LOOKS, enemyOutlineMaterial, loadEnemyModels } from './enemyModels';
import type { BakedEnemy } from './enemyModels';
import { writeLoopPose, writeOncePose } from './pose';
import type { NatureKey, NatureSet, PropGeometry, PropKey } from './models';
import { Corrupt, Mode, ProjKind, Pw, Role, ShotKind, Spell } from '../sim/types';
import type { CharacterKey, Enemy, WeaponKey } from '../sim/types';
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
  MERCHANT_LANTERN,
  stallGeometry,
  worksGeometry,
  roundTreeGeometry,
} from './decor';
import { buildEnemyGeometries } from './enemies';
import { setDetail } from './parts';
import { TerrainView } from './terrain';
import { borderGeometry } from './border';
import { Base, MotionState } from './motion';
import { OUTLINE, stylize, toonGradient, toonMaterial } from './toon';
import { glowTexture, runeRingTexture, slashTexture, softDiscTexture, softGlow, SLASH_ARC } from './textures';
import { scytheGeometry } from './scythe';
import { buildShrine } from './shrine';
import { buildSkull } from './skull';
import { buildTotem, stoneMaterial, TOTEM_HEIGHT } from './totem';
import type { CharacterModel } from './characters';
import { FEEL } from './feel';
import { AimLines, Bolts, DamageNumbers, Particles, PowerMarks } from './fx';
import { InstanceWriter, makeInstanced } from './instancing';
import { PAL } from './palette';
import { TIER_LOOK, TierTint, tierHex, tierScale } from './tiers';
import { QUALITY_STEPS, nearestCut, pickFarTypes } from './quality';

const TAU = Math.PI * 2;
const WHITE = new THREE.Color(0xffffff);
const MINE_IDLE = new THREE.Color(0xc4c8d6); // bombe KayKit non armée : texture assombrie
const AURA_DISC = 0.08; // opacité du disque du Halo (lot L5 : plus lumineux à chaque palier)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Vie la plus longue d'une particule de gerbe (fx.ts : 0,3 à 0,6 s) : borne le débit des flammèches du cercle. */
const FLAME_LIFE = 0.6;
const lam = (c: number) => toonMaterial({ color: c }); // phase 15 : toon partout (sauf lumineux et sol)
// 1.42.1 : plus d'additif pur (délavé sur le sol clair), voir softGlow
const additive = (color: number, opacity: number) =>
  softGlow(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), 0.5);
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
// 1.53.1 : `forceSinglePass`. Sans lui, three dessine tout matériau transparent à double face en deux appels (faces
// arrière, puis avant). Pour une forme plate (anneau, disque, plan), les deux faces sont les mêmes triangles : la
// seconde passe ne change pas un pixel et coûtait un appel par famille (cercles d'attaque, disques, arcs de lame)
const flat = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });

// rendu net (phase 9) : DPR plafonné à 2, hauteur interne ≤ 1600 px ; 1.69.2 : en « auto », facteur du palier
// (QUALITY_STEPS de quality.ts, ×1 → ×0,6, toujours lisse)
const QUALITY = { maxDpr: 2, maxHeight: 1600 };
/**
 * 1.69.2 (docs/specs/rendu-allege.md, décision 3) : rendu allégé des paliers « auto » au-delà du net. Ne retire que ce
 * qui ne porte pas d'information de jeu ; valeurs choisies au stress test (400 ennemis, 4 armes), chiffres dans la PR.
 * `projCap` : projectiles du héros en vol dessinés (les plus proches de lui ; dégâts, sons et chiffres restent) ;
 * `ghosts` : fantômes de traînée par projectile ; `particles` : plafond des particules (les plus anciennes sont
 * remplacées) ; `enemyNear` : u au-delà desquels un ennemi de masse prend la version simple (≈ 150 triangles), dans un
 * InstancedMesh jumeau (un appel de plus par type, payé seulement à partir de `farMin` ennemis lointains, pour les
 * `farTypes` types qui en ont le plus) ;
 * `propDraw`, `smallDraw`, `scatter` : rayons du décor (arbres ; lanternes et cimetières ; herbe, fleurs, buissons).
 */
const LITE = {
  projCap: 20,
  ghosts: 1,
  particles: 250,
  enemyNear: 12,
  farMin: 16, // ennemis lointains d'un type, à l'image d'avant, sous lesquels son jumeau simple ne vaut pas son appel
  // (un type déjà simplifié le reste jusqu'à farMin / 2 : pickFarTypes de quality.ts)
  farTypes: 3, // types simplifiés au plus (ceux qui ont le plus d'ennemis lointains) : au plus 3 appels de plus
  propDraw: 38,
  smallDraw: 24,
  scatter: 26,
};

// capacités d'instances par type d'ennemi (CAPS.enemies = 520 au total)
const ARCHER_RANGE = ARCHER.shotSpeed * ARCHER.shotLife;
/** Distance² sous laquelle coffres de carte et sanctuaires sont dessinés (phase 18 : au-delà, seule la colonne). */
const POI_DRAW2 = 50 * 50;
const TOTEM_VIEW2 = 38 * 38; // 1.42.1 : distance² sous laquelle la stèle du totem est dessinée
// 1.53.1 : marge (u) du test « dans le champ de la caméra » des lieux de la carte. Le champ est celui de la frame
// précédente (la caméra est posée en fin de render) : la marge couvre son déplacement, le tremblement et le relief
const POI_SEEN_PAD = 6;
const PROP_DRAW = 48; // phase 20 : rayon des arbres autour du joueur (la vue s'arrête à ≈ 36 u au zoom le plus large)
const GRAVES = 40; // phase 20 : petits cimetières semés sur la carte…
const GRAVE_NEAR = 8; // …dont au plus 8 dessinés autour du joueur (≈ 1 k triangles chacun)
const LAMP_NEAR = 12; // lanternes KayKit (≈ 570 triangles) dessinées au plus
const SMALL_DRAW = 30; // rayon des lanternes et cimetières (petits, perdus dans le brouillard au-delà)
// phase 44 : semis d'herbe, de fleurs et de buissons autour du joueur (décor stylisé), tiré d'une grille de cases
// rayon : les coins hauts de l'écran sont à ≈ 30 u du joueur (16:9), 31 u en portrait. En rendu « pixel » (réglage
// manuel) : rayon réduit, herbe seule et deux fois moins dense (relecture perf : +0 appel, ≈ +5 k triangles).
const SCATTER = { cell: 2, draw: 32, drawPixel: 26, grass: 480, flowers: 72, bushes: 44 };
const TREE_H = 4.7; // hauteur des arbres stylisés avant l'échelle de chaque arbre (≈ ×0,75)
const GROUND_TILE = 7; // unités monde par répétition des textures de sol (phase 44)
const FOG = { near: 30, far: 115 }; // phase 44 : brume au loin seulement (la caméra est à ≈ 16 u du joueur)
const ELITE_MARKS = 48; // élites marquées à l'écran, au plus (anneaux, aura, couronne)
const ELITE_RINGS = 2 * ELITE_MARKS; // phase 51 : deux anneaux dorés par élite
const GLOW_CAP = 1536; // phase 30 : sprites lumineux (orbes et traînées, feu, météores, lances, mines, boomerangs)
const SLASH_CAP = FEEL.blade.max + FEEL.scythe.max; // croissants : coups des Lames + traînées des faux (une par faux)
const BORDER_VIEW = 46; // phase 29 : u au-delà desquels un segment de lisière n'est plus dessiné (hors de la vue)
const ENEMY_TINT_KEEP = 0.88; // part de blanc dans la teinte d'un ennemi (phase 46 B : les textures KayKit portent déjà la couleur)
const ENEMY_RIM_WHITE = 0.6; // part de blanc dans la couleur du liseré
const ENEMY_RIM = 0.22; // force du liseré de lumière des ennemis (couleur du type, éclaircie : les textures portent déjà la couleur)
const ENEMY_FLASH = new THREE.Color(2.4, 2.4, 2.4); // flash du coup sur un modèle texturé : surexposé
const ENEMY_STRIDE = 0.42; // tours de marche par unité de vitesse (Spectre 2,7 u/s : ≈ 1,1 pas par seconde)
const CHEST_ELITE = new THREE.Color(0xffd98a); // coffre d'élite : même modèle que celui de carte, teinté d'or
// phase 16 : Archer, Sorcier (SPAWN.maxShooters = 24) ; phase 39 : boss (types 3, 6, 7) jusqu'à ENDLESS.maxAlive en monde infini
const ENEMY_CAPS = [450, 450, 120, ENDLESS.maxAlive, 120, 60, ENDLESS.maxAlive, ENDLESS.maxAlive, 1, 40, 24];

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
  marks: PowerMarks; // phase 35 : icônes des bonus au sol

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
  /** phase 21 : squelettes KayKit chargés (lu par les tests e2e) ; le procédural reste le repli */
  enemyKind: 'proc' | 'gltf' = 'proc';
  private enemyBaked: (BakedEnemy | null)[] = [];
  private enemyMorph: (Float32Array | null)[] = []; // morphTexture.image.data de chaque type (ligne = 1 + poses)
  private bossOutline: (THREE.InstancedMesh | null)[] = [];
  // 1.69.2 : jumeaux des ennemis de masse en version simple, pour les ennemis loin du héros au rendu allégé (leurs
  // propres matrices et poses ; vides, ils ne coûtent aucun appel) ; null : pas de modèle cuit, ou un boss
  private enemyFarW: (InstanceWriter | null)[] = [];
  private enemyFarMorph: (Float32Array | null)[] = [];
  private farSeen = new Int32Array(ENEMY_CAPS.length); // ennemis lointains par type à cette image…
  private farPrev = new Int32Array(ENEMY_CAPS.length); // …et à la précédente (le jumeau ne sert qu'au-delà de LITE.farMin)
  private farUse = new Uint8Array(ENEMY_CAPS.length); // 1 : le type passe ses ennemis lointains dans son jumeau
  private enemyHop = 1; // hop et roulis des silhouettes procédurales, adoucis pour des squelettes qui marchent
  private enemyRoll = 1;
  private cFlash = WHITE; // flash du coup : blanc sur les couleurs de sommet, surexposé sur une texture
  private eliteColor: THREE.Color[] = [];
  // phase 51 : élites vues pendant la boucle des ennemis (x, y de la tête, z, rayon, phase), marquées plus bas quand
  // les écrivains des lueurs et des cristaux sont ouverts ; tableau fixe, aucune allocation par frame
  private eliteBuf = new Float32Array(ELITE_MARKS * 5);
  private eliteN = 0;
  private cEliteNow = new THREE.Color();
  // corrompus (docs/specs/corrompus.md, décision 3) : teinte violette par type, yeux relevés dans la boucle des ennemis
  // (x, y des yeux, z) et dessinés avec les lueurs ; traînée de particules au compte-gouttes
  private corruptColor: THREE.Color[] = [];
  // x, y des yeux, z, y du centre du corps, rayon de l'aura, phase, taille des yeux (plus grands pour le boss final)
  private corruptBuf = new Float32Array(FEEL.corrupt.marks * 7);
  /**
   * « Réduction des effets » (réglage, ou prefers-reduced-motion tant que le joueur n'a rien choisi : main.ts) : la
   * traînée des corrompus est divisée par deux et leur violet ne bat plus.
   */
  reducedFx = false;
  /** Corrompus dont les yeux luisent à cette image (lu par les tests e2e). */
  corruptN = 0;
  private cCorrupt = new THREE.Color(PAL.corrupt);
  private cCorruptNow = new THREE.Color();
  private cCorruptEye = new THREE.Color(PAL.corruptEye).multiplyScalar(1.2);
  private cCorruptAura = new THREE.Color(PAL.corrupt).multiplyScalar(FEEL.corrupt.auraA);
  private cFlame = new THREE.Color(PAL.flame);
  private cFlameNow = new THREE.Color();
  // le Cœur de la Nuit (docs/specs/boss-final.md) : coup bloqué (gris), cercle de flammes (un appel, seulement dans
  // l'Arène), portail rouge, Jugement ; l'éclipse (0 → 1) assombrit lumières et brume
  private cBlocked = new THREE.Color(PAL.blocked).multiplyScalar(1.15);
  private cPortalRed = new THREE.Color(PAL.portalRed);
  private cSafe = new THREE.Color(PAL.safe).multiplyScalar(1.4);
  private cRing = new THREE.Color();
  private cRingFire = new THREE.Color(PAL.ringFire);
  private cRingWarn = new THREE.Color(PAL.ringWarn);
  private cHeroGlow = new THREE.Color(PAL.lantern).multiplyScalar(0.55);
  private arenaRing!: THREE.Mesh;
  private ringMat!: THREE.MeshBasicMaterial;
  private ringR: number = FINAL.arenaR;
  private flameAcc = 0; // flammèches du cercle dues (débit par seconde)
  /** Éclipse du boss final, 0 → 1 (phases 3 et 4), adoucie ; lue aussi par les tests e2e. */
  eclipse = 0;
  private cEliteAura = new THREE.Color(PAL.gold).multiplyScalar(FEEL.elite.auraA);
  private cCrown = new THREE.Color(0xffb020).multiplyScalar(1.3); // or soutenu : se détache du corps, jaune clair
  private cChestHalo = new THREE.Color(PAL.gold).multiplyScalar(FEEL.chestDrop.haloA);
  private shadowW: InstanceWriter; // ombres douces de tous les ennemis (phase 9)
  /** Phase 30 : sprites lumineux additifs (Orbe, boule de feu, météore, Lance, mines, boomerang) : un appel. */
  private glowW: InstanceWriter;
  /** Phase 30 : arcs de lame (Faux, sillage des Lames) : un appel. */
  private slashW: InstanceWriter;
  // 1.69.0 (docs/specs/rafales-faux-guidage.md, décision 8) : faux en train de faucher (une par Ev.Scythe), suivant le
  // héros ; une seule famille instanciée pour toutes (scytheW), leur traînée dans les croissants (slashW)
  private scytheW: InstanceWriter;
  private scythes: { r: number; a: number; arc: number; life: number }[] = [];
  private scytheN = 0;
  /** Phase 32 : coups des Lames en cours (posés par blade()). */
  private blades: { x: number; z: number; r: number; a: number; life: number }[] = [];
  private bladeN = 0;
  private boomW: InstanceWriter;
  private mineW: InstanceWriter; // plaques de feu du Feu follet
  private bombW: InstanceWriter; // mines (bombe KayKit une fois chargée)
  private spitW: InstanceWriter;
  private arrowW: InstanceWriter; // phase 16 : flèches des Archers
  private zoneW: InstanceWriter; // cercles rouges du Colosse (anneau)
  private zoneFillW: InstanceWriter; // disque qui se remplit pendant le télégraphe
  private chestW: InstanceWriter;
  private netW: InstanceWriter; // phase 19 : filet du Collet (Braconnier)
  // phase 18 : relief (sol déplacé, tout est posé au sol local)
  readonly terrain = new TerrainView();
  private gy = this.terrain.gy;
  private groundMesh: THREE.Group | null = null;
  /** Phase 29 : animation de fond, fondus, inclinaison du corps (lus depuis la sim, sans allocation). */
  readonly motion = new MotionState();
  /** Phase 29 : segments de la lisière ; n'est dessiné que ce qui est à portée de vue (le brouillard cache le reste). */
  private borderMeshes: THREE.Mesh[] = [];
  private borderX = 1e9;
  private borderZ = 1e9;
  private motionIn = {
    onGround: true,
    sliding: false,
    airMom: false,
    slideJump: false,
    height: 0,
    speed: 0,
    face: 0,
    slopeAlong: 0,
    slopeLat: 0,
  };
  private slideDust = 0; // distance glissée depuis la dernière bouffée de poussière
  /** Phase 27 : objets du décor de la carte courante (retirés et libérés quand une nouvelle carte est construite). */
  private decorObjs: THREE.Object3D[] = [];
  private tRx = 0; // inclinaison du sol au dernier point demandé (tilt) : ombres et cercles collés à la pente
  private tRz = 0;
  private camGy = 0; // hauteur du sol suivie par la caméra (amortie)
  // phase 18 : points d'intérêt (coffres de carte, sanctuaires) et colonnes de lumière qui les signalent de loin
  private mapChestW: InstanceWriter;
  private holdW: InstanceWriter; // anneau qui se remplit pendant l'ouverture
  private shrineW: InstanceWriter;
  private skullW: InstanceWriter; // phase 48 : crânes de difficulté
  private bossTotemW: InstanceWriter; // phase 48 : totems de boss
  // 1.53.1 : champ de la caméra (frame précédente), pour ne payer l'appel de dessin d'un lieu que s'il est à l'écran
  private readonly viewProj = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  private readonly seenBall = new THREE.Sphere();
  private frustumReady = false;
  private shrineGlowW: InstanceWriter; // runes du sanctuaire : s'allument avec la jauge
  private beamW: InstanceWriter;
  // phase 20 : objets KayKit (CC0) ; arbres et lanternes dessinés autour du joueur seulement (≈ 300 triangles chacun)
  propsReady = false; // lu par les tests e2e
  // phase 44 : décor stylisé (nature.glb) : arbres teintés par monde, rochers, semis d'herbe, de fleurs et de buissons
  natureReady = false; // lu par les tests e2e
  private nature: NatureSet | null = null;
  private natureMat: THREE.MeshToonMaterial | null = null;
  private flowerMat: THREE.MeshToonMaterial | null = null;
  private grassMat: THREE.MeshToonMaterial | null = null;
  private natureStage = -1; // monde dont les arbres et le semis sont posés
  private grassW: InstanceWriter;
  private flowerW: InstanceWriter;
  private bushW: InstanceWriter;
  private rocksMesh: THREE.InstancedMesh | null = null; // rochers de la carte (géométrie échangée au chargement)
  private treeProc: THREE.Object3D[] = []; // arbres procéduraux (repli)
  private grassProc: THREE.Object3D | null = null; // herbe procédurale (repli)
  private cLeaf = new THREE.Color();
  private haloMat: THREE.MeshBasicMaterial | null = null;
  private totem = buildTotem(); // 1.42.1 : stèle du totem (un maillage, à la place d'une instance de sanctuaire)
  private scatterSeed = 0;
  // textures de sol par monde (phase 44) : [tapis, terre], null tant qu'elles chargent (repli : texture dessinée)
  private groundSet: ([THREE.Texture, THREE.Texture] | null)[] = [null, null, null];
  private groundAsked = [false, false, false];
  /** Textures de sol du monde courant (1.68.0 : l'Arène reprend celles du monde 3). */
  private groundIdx(): number {
    return Math.min(this.stageIdx, STAGE.count - 1);
  }
  private groundMap2 = { value: null as THREE.Texture | null };
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
  // lot L5 : chaque couleur d'arme est une TierTint (teinte de son palier, `.c` à dessiner), mise à jour par tintWeapons
  private tBlade = new TierTint(new THREE.Color(PAL.paper));
  private tBoom = new TierTint(new THREE.Color(PAL.boomerang));
  private cBeamGold = new THREE.Color(PAL.gold);
  private cBeamGrey = new THREE.Color(0x8a8fa8);
  private cBeamBlue = new THREE.Color(PAL.xp);
  // phase 45 : runes des sanctuaires (libre, chargé à fond, déjà utilisé) ; au-delà de 1 : lisibles en plein jour
  private cShrineOn = new THREE.Color(0x4fb8ff).multiplyScalar(1.25);
  private cShrineFull = new THREE.Color(0xd8f4ff).multiplyScalar(1.7);
  private cShrineOff = new THREE.Color(0x4a4860);
  // phase 48 : crânes de difficulté en violet (ni le bleu des sanctuaires, ni l'or des coffres, ni le rouge du totem)
  private cSkullOn = new THREE.Color(PAL.skull).multiplyScalar(1.25);
  private cSkullFull = new THREE.Color(0xf3e0ff).multiplyScalar(1.7);
  private cBeamSkull = new THREE.Color(PAL.skull);
  private cBossTotem = new THREE.Color(PAL.bossTotem);
  private cBossTotemFull = new THREE.Color(0xffe0b0).multiplyScalar(1.7);
  private cPoi = new THREE.Color();
  // phase 17 : échoppe du marchand (une seule, visible pendant sa visite) : 3 appels de rendu quand elle est là
  private stall = new THREE.Group();
  private stallLamp: THREE.Mesh;
  private stallRing: THREE.Mesh;
  private stallVisit = -1;
  private gemW: InstanceWriter;
  private bladeW: InstanceWriter;
  private metW: InstanceWriter;
  private tLance = new TierTint(new THREE.Color(0x7fe3ff));
  private tLanceGhost = [0.55, 0.35, 0.2].map(
    (k, j) => new TierTint(new THREE.Color(0x7fe3ff).multiplyScalar(k), TIER_LOOK.mix, (j + 1) * TIER_LOOK.prismSpread),
  );
  // phase 30 : couleurs des lueurs (additives : une couleur sombre = une lueur discrète)
  private tOrbCore = new TierTint(new THREE.Color(0xfff6d8), TIER_LOOK.core);
  private tOrbHalo = new TierTint(new THREE.Color(PAL.proj).multiplyScalar(0.7));
  private tOrbTrail = PAL.trail.map(
    (c, j) =>
      new TierTint(new THREE.Color(c).multiplyScalar(0.75 - j * 0.15), TIER_LOOK.mix, (j + 1) * TIER_LOOK.prismSpread),
  );
  private cFireCore = new THREE.Color(0xffe9a8);
  private cFireHalo = new THREE.Color(PAL.fire).multiplyScalar(0.85);
  private cFireTrail = [0.6, 0.4, 0.25].map((k) => new THREE.Color(0xff5a2a).multiplyScalar(k));
  private tMeteorTrail = [0.6, 0.4, 0.25].map(
    (k, j) => new TierTint(new THREE.Color(0xff5a2a).multiplyScalar(k), TIER_LOOK.mix, (j + 1) * TIER_LOOK.prismSpread),
  );
  private tMeteorCore = new TierTint(new THREE.Color(0xfff0c0), TIER_LOOK.core);
  private tMeteorHalo = new TierTint(new THREE.Color(0xff9a5a).multiplyScalar(0.8));
  private tLanceTip = new TierTint(new THREE.Color(0xbff4ff), TIER_LOOK.core);
  private tBoomTrail = [0.45, 0.28, 0.15].map(
    (k, j) =>
      new TierTint(new THREE.Color(PAL.boomerang).multiplyScalar(k), TIER_LOOK.mix, (j + 1) * TIER_LOOK.prismSpread),
  );
  private cMineHalo = new THREE.Color();
  private tMineHalo = new TierTint(new THREE.Color(PAL.mine));
  private tSlashFaux = new TierTint(new THREE.Color(0xa66bff)); // 1.42.1 : violet franc (0xc9b3ff se lisait blanc sur l'herbe)
  private tSlashBlade = new TierTint(new THREE.Color(0x4fc8ff)); // 1.42.1 : bleu acier franc
  private cSlashTmp = new THREE.Color();
  private tMeteor = new TierTint(new THREE.Color(PAL.gold));
  // phase 47 C : flaque de Vitriol, esprits, balises (mêmes écrivains que les météores et les orbes)
  private tVitriol = new TierTint(new THREE.Color(0x8fe05a));
  private tVitriolIn = new TierTint(new THREE.Color(0x4f9a38));
  private tSpiritHalo = new TierTint(new THREE.Color(0x8fdcff).multiplyScalar(0.7));
  private tSpiritCore = new TierTint(new THREE.Color(0xeafcff), TIER_LOOK.core);
  private tBeaconHalo = new TierTint(new THREE.Color(0xffd95a).multiplyScalar(0.75));
  private tBeaconCore = new TierTint(new THREE.Color(0xfff6c9), TIER_LOOK.core);
  private cTierTmp = new THREE.Color(); // lot L5 : lueur ajoutée par un palier (teinte atténuée)
  private cEliteRing = new THREE.Color(PAL.gold).multiplyScalar(0.8 / 0.9); // ancien matériau doré à 0,8, ici à 0,9
  private dashGhostW: InstanceWriter;
  private cGem = [new THREE.Color(PAL.gem), new THREE.Color(PAL.gem2), new THREE.Color(PAL.gem3)];
  private cGold = new THREE.Color(PAL.gold);
  private tMine = new TierTint(new THREE.Color(PAL.mine));
  private cFire = new THREE.Color(PAL.accent); // traînée de feu du Feu follet (même mesh que les mines, plus large et plate)
  private tMineArmed = new TierTint(new THREE.Color(0xffffff), TIER_LOOK.core);
  private tAura = new TierTint(new THREE.Color(PAL.xp));
  /** Lot L5 : les couleurs de chaque arme, teintées à son palier une fois par image (Foudre et Fouet : Bolts). */
  private tierTints: { k: WeaponKey; tints: TierTint[] }[] = [
    { k: 'orbe', tints: [this.tOrbCore, this.tOrbHalo, ...this.tOrbTrail] },
    { k: 'aura', tints: [this.tAura] },
    { k: 'lames', tints: [this.tBlade, this.tSlashBlade] },
    { k: 'boomerang', tints: [this.tBoom, ...this.tBoomTrail] },
    { k: 'mines', tints: [this.tMine, this.tMineArmed, this.tMineHalo] },
    { k: 'faux', tints: [this.tSlashFaux] },
    { k: 'lance', tints: [this.tLance, this.tLanceTip, ...this.tLanceGhost] },
    { k: 'meteores', tints: [this.tMeteor, this.tMeteorHalo, this.tMeteorCore, ...this.tMeteorTrail] },
    { k: 'vitriol', tints: [this.tVitriol, this.tVitriolIn] },
    { k: 'esprits', tints: [this.tSpiritHalo, this.tSpiritCore] },
    { k: 'balise', tints: [this.tBeaconHalo, this.tBeaconCore] },
  ];
  private cSpit = new THREE.Color(PAL.spit);
  private cBossShot = new THREE.Color(PAL.telegraph).multiplyScalar(1.1);
  private cBossShotCore = new THREE.Color(0xffd2c4);
  private cArrow = new THREE.Color(PAL.arrow);
  private cTele = new THREE.Color(PAL.telegraph);
  private cShadow = new THREE.Color(PAL.ink);
  private cGhost = new THREE.Color();
  // phase 19 : ennemis étourdis (Éclat, Collet) ou ralentis (Voile), silhouettes du Voile
  private cStun = new THREE.Color(0xfff1a8);
  private cSlow = new THREE.Color(0x9fd8ff);
  private cBurn = new THREE.Color(0xffa25e); // phase 47 B : ennemi en feu (Dent de dragon)
  private cTox = new THREE.Color(0x8fe05a); // phase 50 : boss empoisonné (Toxine)
  private cFreeze = new THREE.Color(PAL.freeze); // phase 35 : Temps figé
  private cRage = new THREE.Color(PAL.telegraph); // phase 43 : boss enragé
  private frozenPose = false; // phase 35 : poses des ennemis 3D arrêtées pendant le Temps figé
  private cPower = PAL.power.map((c) => new THREE.Color(c)); // phase 35 : bonus au sol (index Pw)
  private cPowerHalo = PAL.power.map((c) => new THREE.Color(c).multiplyScalar(0.9));
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
  private fog: THREE.Fog;
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
  // qualité (phase 9) : 0 pixel (≈ 380 px de haut, nearest), 2 net (CSS × DPR ≤ 2, ≤ 1600 px de haut) ; 1.69.2 : plus
  // de niveau 1, le réglage auto choisit un palier de QUALITY_STEPS (`step`, 0 = net) : allégé, puis résolution ×0,85…
  qualityLevel = 2;
  step = 0;
  private lite = false;
  // 1.69.2 : distance² au héros de chaque projectile du héros en vol, et copie de travail du plafond (aucune allocation)
  private projD2 = new Float32Array(CAPS.projectiles);
  private projSel = new Float32Array(CAPS.projectiles);
  private sizeW = 1;
  private sizeH = 1;
  private groundMat: THREE.MeshLambertMaterial;
  private groundTextures: (THREE.Texture | null)[] = [null, null]; // [pixel, net], construites à la demande
  private zoom = 1; // zoom-out progressif + recul au boss (FEEL.camera)
  shake = 0;

  constructor(canvas: HTMLCanvasElement, dmgLayer: HTMLElement, powerIcons: readonly string[] = []) {
    // MSAA toujours actif (quasi gratuit sur les GPU mobiles à tuiles) ; la résolution interne dépend du niveau (setQuality)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.scene.background = new THREE.Color(PAL.fog);
    // phase 44 : brume linéaire, au loin seulement. L'ancienne brume exponentielle voilait déjà 26 % de l'image à la
    // distance du joueur (16 u) : tout l'écran tirait vers le bleu nuit.
    this.fog = new THREE.Fog(PAL.fog, FOG.near, FOG.far);
    this.scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(0xffd9c2, 0x3a2f55, 2.0); // couleurs et intensités : lightCycle (PAL.stages)
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
    this.sun.position.set(-8, 14, 6);
    this.scene.add(this.sun);
    // phase 9 : lumière de contre bleutée, à l'opposé du soleil : détache les silhouettes du sol (aucun appel en plus)
    const rim = new THREE.DirectionalLight(0x9db4ff, 0.8);
    rim.position.set(8, 6, -10);
    this.scene.add(rim);

    // sol
    // phase 18 : le sol est un maillage en relief construit avec le décor (buildDecor), couleurs par sommet
    this.groundMat = new THREE.MeshLambertMaterial({ map: this.groundTex(true), vertexColors: true });
    // phase 44 : deux textures (tapis du monde, terre) mélangées par le poids `blend.x` du sommet ; la frontière est
    // découpée par le grain du tapis (pas un fondu mou) ; `blend.y` efface la texture (pistes : couleur de sommet)
    this.groundMap2.value = this.groundMat.map;
    this.groundMat.onBeforeCompile = (sh) => {
      sh.uniforms.map2 = this.groundMap2;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 blend;\nvarying vec2 vBlend;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blend;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D map2;\nvarying vec2 vBlend;')
        .replace(
          '#include <map_fragment>',
          `vec4 ta = texture2D( map, vMapUv );
          vec4 tb = texture2D( map2, vMapUv * 0.83 );
          float tn = texture2D( map, vMapUv * 0.61 + 0.37 ).g;
          float gw = smoothstep( 0.4, 0.6, vBlend.x + ( ta.g - tn ) / max( ta.g + tn, 0.04 ) * 0.9 );
          diffuseColor.rgb *= mix( mix( ta.rgb, tb.rgb, gw ), vec3( 1.0 ), vBlend.y );`,
        );
    };

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
      this.enemyFarW.push(null);
      this.enemyFarMorph.push(null);
      this.enemyColor.push(new THREE.Color(PAL.enemy[t]));
      this.eliteColor.push(new THREE.Color(PAL.enemy[t]).lerp(this.cGold, 0.75).multiplyScalar(FEEL.elite.bright));
      this.corruptColor.push(
        new THREE.Color(PAL.enemy[t]).lerp(this.cCorrupt, FEEL.corrupt.tint).multiplyScalar(FEEL.corrupt.bright),
      );
    }
    // phase 21 : modèles des ennemis dès qu'enemies.glb est là ; nouvel essai
    // après un échec (réseau mobile), état lisible dans l'onglet perf
    this.loadEnemies(0);
    // phase 9 : une ombre douce sous chaque ennemi (un seul appel pour tous) ; celle des Volants grossit au télégraphe
    this.shadowW = new InstanceWriter(makeInstanced(shadowGeometry(1), shadowMaterial(0.4), CAPS.enemies));
    // projectiles, traînées, boomerangs, mines, crachats, cercles, coffres, gemmes
    // phase 30 : orbes, boules de feu, météores, lances, mines et boomerangs en sprites lumineux orientés caméra
    // (texture radiale douce, additif) : des boules nettes et rondes au lieu d'icosaèdres à facettes ; remplace les
    // anciens écrivains des orbes, de leurs traînées et des boules de feu (3 appels → 1)
    this.glowW = new InstanceWriter(
      makeInstanced(
        new THREE.PlaneGeometry(1, 1),
        // 1.42.1 : orbes, feu, météores, lances : couleur pleine de jour, cœur blanc
        softGlow(new THREE.MeshBasicMaterial({ color: 0xffffff, map: glowTexture() }), 0.75, 0.8),
        GLOW_CAP,
      ),
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
      makeInstanced(
        new THREE.SphereGeometry(0.32, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
        CAPS.shots, // phase 45 (relecture perf) : autant que le pool de tirs, un tir qui blesse est toujours dessiné
      ),
    );
    this.arrowW = new InstanceWriter(
      makeInstanced(new THREE.BoxGeometry(0.13, 0.13, 0.95), new THREE.MeshBasicMaterial({ color: 0xffffff }), 96),
    );
    // cercles rouges (Colosse, éruptions, boules de feu) et, depuis la phase 31, ondes de choc du Gardien : même
    // matériau, un seul appel (l'anneau à 10 % du rayon suit l'épaisseur réelle de l'onde, 0,8 u, mieux que l'ancien)
    this.zoneW = new InstanceWriter(
      makeInstanced(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), flat(PAL.telegraph, 0.9), CAPS.shots + 8),
    );
    this.zoneFillW = new InstanceWriter(
      // + 8 : les ovales des charges et le disque du Jugement (1.68.0), en plus d'un disque par tir
      makeInstanced(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), flat(PAL.telegraph, 0.42), CAPS.shots + 8),
    );
    this.chestW = new InstanceWriter(makeInstanced(new THREE.BoxGeometry(0.9, 0.62, 0.62), lam(PAL.gold), 16));
    this.netW = new InstanceWriter(makeInstanced(netGeometry(), flat(PAL.gold, 0.85), 2));
    // phase 20 : écrivains du décor KayKit, géométries posées au chargement des objets (applyProps)
    for (let k = 0; k < 4; k++)
      this.propTreeW.push(new InstanceWriter(makeInstanced(new THREE.BufferGeometry(), lam(0xffffff), 64)));
    this.propLampW = new InstanceWriter(makeInstanced(new THREE.BufferGeometry(), lam(0xffffff), LAMP_NEAR));
    this.propGraveW = new InstanceWriter(makeInstanced(new THREE.BufferGeometry(), lam(0xffffff), GRAVE_NEAR));
    this.grassW = new InstanceWriter(makeInstanced(new THREE.BufferGeometry(), lam(0xffffff), SCATTER.grass));
    this.flowerW = new InstanceWriter(makeInstanced(new THREE.BufferGeometry(), lam(0xffffff), SCATTER.flowers));
    this.bushW = new InstanceWriter(makeInstanced(new THREE.BufferGeometry(), lam(0xffffff), SCATTER.bushes));
    for (const pw of [...this.propTreeW, this.propLampW, this.propGraveW, this.grassW, this.flowerW, this.bushW])
      this.scene.add(pw.mesh);
    loadNature()
      .then((n) => this.applyNature(n))
      .catch((e: unknown) => console.warn('décor stylisé indisponible, repli', e));
    loadProps()
      .then((p) => this.applyProps(p))
      .catch((e: unknown) => console.warn('modèles du décor indisponibles, repli procédural', e)); // hors ligne aussi
    // phase 44 : cristaux à facettes (nuances cuites par face : sommet clair, base sombre, un éclat) au lieu d'un
    // octaèdre uni qui se lisait comme un carré plat ; toujours sans éclairage (lisibles la nuit), un seul appel
    this.gemW = new InstanceWriter(
      // gemmes, bonus au sol (phase 35) et couronnes des élites (phase 51)
      makeInstanced(
        crystalGeometry(0.2, 0.36),
        new THREE.MeshBasicMaterial({ vertexColors: true }),
        CAPS.gems + CAPS.powers + ELITE_MARKS,
      ),
    );
    this.scene.add(
      this.shadowW.mesh,
      this.glowW.mesh,
      this.boomW.mesh,
      this.mineW.mesh,
      this.bombW.mesh,
      this.spitW.mesh,
      this.arrowW.mesh,
      this.zoneW.mesh,
      this.zoneFillW.mesh,
      this.chestW.mesh,
      this.netW.mesh,
      this.gemW.mesh,
      this.dashGhostW.mesh,
    );

    // armes
    // à plat : inclinable (phase 18) ; phase 30 : anneau runique additif qui tourne (texture plane sur l'anneau)
    this.aura = new THREE.Mesh(
      new THREE.RingGeometry(0.76, 1, 48).rotateX(-Math.PI / 2),
      softGlow(new THREE.MeshBasicMaterial({ color: PAL.xp, map: runeRingTexture(), opacity: 0.8 }), 0.55, 0.35),
    );
    this.aura.visible = false;
    this.auraDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), flat(PAL.xp, AURA_DISC));
    this.auraDisc.visible = false;
    this.scene.add(this.aura, this.auraDisc);
    // épées : coups des Lames en cours (phase 32 : FEEL.blade.max) + 64 lances en vol (phase 28 : 54 mesurées au pire,
    // 9 par salve à recharge plancher), un seul InstancedMesh
    const bladeGeo = new THREE.BoxGeometry(1.0, 0.1, 0.26);
    const BLADE_CAP = FEEL.blade.max + 64;
    this.bladeW = new InstanceWriter(
      makeInstanced(bladeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), BLADE_CAP),
    );
    // phase 30 : arcs de lame à plat (Faux : l'arc réel de l'arme ; Lames : sillage derrière chaque lame), additifs ;
    // remplace les fantômes des lames (même nombre d'appels)
    this.slashW = new InstanceWriter(
      makeInstanced(
        new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
        // 1.42.1 : arcs de lame et de faux lisibles sur l'herbe (cœur blanc, bord dans la couleur de l'arme)
        softGlow(
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            map: slashTexture(),
            side: THREE.DoubleSide,
            forceSinglePass: true, // plan : une passe suffit (voir `flat`)
          }),
          0.8,
          0.3,
        ),
        SLASH_CAP,
      ),
    );
    // phase 28 : cercles d'alerte des météores (bord fixe + disque qui se resserre) ; phase 31 (budget d'appels avec
    // 4 armes) : les anneaux dorés des élites y sont écrits aussi, un seul appel pour tous les anneaux additifs au sol
    this.metW = new InstanceWriter(
      makeInstanced(
        new THREE.RingGeometry(0.84, 1, 40).rotateX(-Math.PI / 2),
        additive(0xffffff, 0.9),
        ELITE_RINGS + 2 * METEOR.max + 3 * VITRIOL.max + BALISE.max, // phase 47 C ; lot L5 : 3e anneau des flaques au palier
      ),
    );
    this.scene.add(this.metW.mesh);
    this.scytheW = new InstanceWriter(
      makeInstanced(scytheGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), FEEL.scythe.max),
    );
    this.scene.add(this.bladeW.mesh, this.slashW.mesh, this.scytheW.mesh);
    this.writers.push(
      ...this.enemyW,
      this.shadowW,
      this.glowW,
      this.slashW,
      this.scytheW,
      this.boomW,
      this.mineW,
      this.bombW,
      this.spitW,
      this.arrowW,
      this.zoneW,
      this.zoneFillW,
      this.chestW,
      this.netW,
      this.gemW,
      this.dashGhostW,
      this.bladeW,
      this.metW,
    );

    // points d'intérêt (phase 18) : 5 appels de plus au plus (coffres, anneau, sanctuaires, runes, colonnes)
    this.mapChestW = new InstanceWriter(makeInstanced(mapChestGeometry(), toonMaterial({ vertexColors: true }), 24));
    this.holdW = new InstanceWriter(
      makeInstanced(new THREE.RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2), additive(0xffffff, 0.85), 4),
    );
    // phase 45 : sanctuaire en stèles runiques (`shrine.ts`), les runes prennent la couleur d'instance ; phase 37 :
    // + 4 anneaux (totem, portail)
    const shrine = buildShrine();
    this.shrineW = new InstanceWriter(makeInstanced(shrine.geometry, shrine.material, SHRINE.count));
    // phase 48 : crânes de difficulté (`skull.ts`), un appel de plus ; leurs anneaux et colonnes sur les écrivains voisins
    const skull = buildSkull();
    this.skullW = new InstanceWriter(makeInstanced(skull.geometry, skull.material, DIFFICULTY.skullMax));
    this.shrineGlowW = new InstanceWriter(
      makeInstanced(
        new THREE.RingGeometry(0.7, 1, 40).rotateX(-Math.PI / 2),
        additive(0xffffff, 0.7),
        SHRINE.count + 4 + DIFFICULTY.skullMax + BOSSTOTEM.max + FINAL.seal.n + 2, // 1.68.0 : sceaux, zone sûre
      ),
    );
    // colonne de lumière : cylindre ouvert, additif, 16 u de haut, visible au-dessus des arbres
    this.beamW = new InstanceWriter(
      makeInstanced(
        new THREE.CylinderGeometry(0.28, 0.5, 16, 8, 1, true).translate(0, 8, 0),
        additive(0xffffff, 0.22),
        // phase 27 : 30 coffres et 14 sanctuaires ; phase 37 : le totem ; phase 48 : les crânes ; phase 51 : coffres lâchés
        MAPCHEST.count + SHRINE.count + 1 + DIFFICULTY.skullMax + BOSSTOTEM.max + CAPS.chests + FINAL.seal.n + 1,
      ),
    );
    this.scene.add(this.mapChestW.mesh, this.holdW.mesh, this.shrineW.mesh, this.shrineGlowW.mesh, this.beamW.mesh);
    // phase 48 : totems de boss, la géométrie du totem du monde en instances (runes à la couleur d'instance), un appel
    // 1.68.0 : les sceaux du boss final sont ces stèles (jamais en même temps que les totems de boss : l'Arène n'en a pas)
    this.bossTotemW = new InstanceWriter(
      makeInstanced(this.totem.mesh.geometry, stoneMaterial(), Math.max(BOSSTOTEM.max, FINAL.seal.n)),
    );
    this.scene.add(this.skullW.mesh, this.bossTotemW.mesh);
    // 1.68.0 : le cercle de flammes de l'Arène, un mur bas additif qui s'efface vers le haut (un appel, dans l'Arène seule)
    const wall = new THREE.CylinderGeometry(1, 1, FEEL.final.wall, 72, 1, true).translate(0, FEEL.final.wall / 2, 0);
    const pos = wall.getAttribute('position'),
      fade = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const k = 1 - pos.getY(i) / FEEL.final.wall; // 1 au pied, 0 en haut
      fade[i * 3] = fade[i * 3 + 1] = fade[i * 3 + 2] = k * k;
    }
    wall.setAttribute('color', new THREE.BufferAttribute(fade, 3));
    this.ringMat = new THREE.MeshBasicMaterial({
      color: PAL.ringFire,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    this.arenaRing = new THREE.Mesh(wall, this.ringMat);
    this.arenaRing.visible = false;
    this.arenaRing.frustumCulled = false;
    this.scene.add(this.arenaRing);
    this.writers.push(
      this.mapChestW,
      this.holdW,
      this.shrineW,
      this.shrineGlowW,
      this.beamW,
      this.skullW,
      this.bossTotemW,
    );

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

    this.totem.mesh.scale.setScalar((STAGE.totemR * 1.8) / TOTEM_HEIGHT); // ≈ 5,4 u de haut : domine les arbres voisins
    this.scene.add(this.totem.mesh);
    this.setStage(0); // phase 44 : sol et décor du premier monde dès l'accueil (le menu rend la scène)
    this.particles = new Particles(this.scene);
    this.fireflies = new Fireflies(this.scene);
    this.bolts = new Bolts(this.scene);
    this.aims = new AimLines(this.scene);
    this.dmg = new DamageNumbers(dmgLayer);
    this.marks = new PowerMarks(dmgLayer, powerIcons, CAPS.powers);
    // phase 18 : les effets reçoivent des y au-dessus du sol local (comme la sim) ; le sol est ajouté ici
    this.particles.ground =
      this.bolts.ground =
      this.aims.ground =
      this.dmg.ground =
      this.marks.ground =
      this.fireflies.ground =
        this.gy;
  }

  /** Décor statique généré depuis les obstacles et zones de la sim (même seed ⇒ même décor). */
  buildDecor(w: World): void {
    const d = new THREE.Object3D();
    // phase 27 : une carte par partie ; le décor de la précédente est retiré et libéré (le matériau du sol est partagé)
    if (this.groundMesh) this.scene.remove(this.groundMesh); // la géométrie de la fenêtre de sol est réutilisée
    for (const o of this.decorObjs) {
      this.scene.remove(o);
      const m = o as THREE.Mesh;
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); // tampons d'instances (GPU)
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) for (const x of mat) x.dispose();
      else mat?.dispose();
    }
    this.decorObjs.length = 0;
    // sol en relief : fenêtre à la résolution de la sim (phase 27), sa grille sert aussi à poser tout le reste
    this.groundMesh = this.terrain.build(w, this.groundMat);
    this.scene.add(this.groundMesh);
    const gy = this.gy;
    const nTrees = w.treeCount;
    const treeCap = DECOR.trees + DECOR.woodTrees;
    const vc = () => toonMaterial({ vertexColors: true });
    // deux essences (sapin, feuillu) à couleurs par sommet : la couleur d'instance ne porte que la variation de teinte
    const firs = makeInstanced(firGeometry(), vc(), treeCap);
    this.treeData = new Float32Array(nTrees * 6);
    // 1.68.0 : l'Arène du boss final n'a ni arbre ni cercle de pierres, donc ni lanterne ni herbe autour des arbres
    const nLamps = nTrees > 0 ? DECOR.lamps : Math.min(DECOR.lamps, w.stoneCenters.length);
    this.lampData = new Float32Array(nLamps * 3);
    const rounds = makeInstanced(roundTreeGeometry(), vc(), treeCap);
    // rocher posé au sol (origine au pied, comme le modèle stylisé qui le remplace : mêmes matrices)
    const rocks = makeInstanced(
      new THREE.DodecahedronGeometry(0.8, 0).translate(0, 0.3, 0),
      lam(PAL.rock),
      DECOR.rocks,
    );
    const posts = makeInstanced(lampPostGeometry(), vc(), DECOR.lamps);
    const lamps = makeInstanced(lampHeadGeometry(), new THREE.MeshBasicMaterial({ color: PAL.lantern }), DECOR.lamps); // phase 15 : lumière chaude des lanternes
    // phase 44 : le halo des lanternes ne se voit que la nuit (opacité réglée par lightCycle) ; de jour, un disque
    // clair sur l'herbe se lisait comme une tache
    this.haloMat = additive(PAL.lantern, 0.02);
    const halos = makeInstanced(new THREE.CircleGeometry(2.4, 18).rotateX(-Math.PI / 2), this.haloMat, DECOR.lamps);
    const grass = makeInstanced(grassGeometry(), vc(), GRASS);
    // ombres des arbres et des menhirs (phase 9 : +1 appel ; phase 16 : les menhirs partagent le mesh)
    const nStones = w.stoneEnd - w.rockEnd;
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
      d.position.set(o.x, gy(o.x, o.z) - 0.05, o.z);
      d.rotation.set(0, (i * 1.7) % TAU, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      rocks.setMatrixAt(i, d.matrix);
    }
    // lanternes : au centre des cercles de pierres (phase 16), puis près des arbres (pas de collision) ; pied, tête, halo
    for (let i = 0; i < nLamps; i++) {
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
    for (let i = 0; i < GRASS && nTrees > 0; i++) {
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
    posts.count = lamps.count = halos.count = nLamps;
    grass.count = ng;
    this.decorProc = [posts, lamps];
    this.treeProc = [firs, rounds];
    this.grassProc = grass;
    this.rocksMesh = rocks;
    this.scatterSeed = w.seed | 0;
    this.propX = this.propZ = 1e9;
    for (const m of [treeShadows, firs, rounds, rocks, posts, lamps, halos, grass]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
      this.scene.add(m);
      this.decorObjs.push(m);
    }
    this.dressRocks();
    this.syncProc();
    // ouvrages (phase 16) : murets, troncs, menhirs ; phase 27 : clôtures, tombes, tonneaux, caisses, citrouilles ; une
    // géométrie statique par tuile de sol (écartée hors champ), un appel de rendu par tuile visible
    const worksMat = vc();
    for (const g of worksGeometry(w, gy)) {
      const m = new THREE.Mesh(g, worksMat);
      this.scene.add(m);
      this.decorObjs.push(m);
    }
    // phase 29 : lisière de forêt au bord de la carte (rochers, sapins, sous-bois), un mesh par segment de 40 u ;
    // même matériau que les ouvrages (libéré avec eux ; un second dispose() est sans effet)
    this.borderMeshes.length = 0;
    for (const g of borderGeometry(w.seed, gy)) {
      const m = new THREE.Mesh(g, worksMat);
      this.scene.add(m);
      this.decorObjs.push(m);
      this.borderMeshes.push(m);
    }
    this.borderX = this.borderZ = 1e9;
    // lacs : disque bleu + anneau de rive qui scintille (animé dans render)
    for (const m of this.lakeMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
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

  /** Change le personnage de la partie et sa tenue (préparé dès le choix au menu, qui ne le rend pas). Idempotent. */
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
      async (hero) => {
        if (req !== this.heroReq) return hero.dispose(); // personnage changé entre-temps
        // interface Nocturne : le menu ne rend plus la scène, donc plus rien ne compilait le héros avant la première
        // image de partie (saccade). Shaders compilés et textures envoyées ici, avant l'échange, comme pour les ennemis
        await Promise.race([
          this.renderer.compileAsync(hero.group, this.camera, this.scene).catch(() => undefined),
          new Promise<void>((r) => setTimeout(r, 4000)),
        ]);
        if (req !== this.heroReq) return hero.dispose();
        hero.group.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
            const map = (m as THREE.MeshBasicMaterial).map;
            if (map) this.renderer.initTexture(map);
          }
        });
        this.heroPending = false;
        this.swapModel(hero, hero.anim, false); // fantôme de dash : silhouette procédurale gardée (≈ 9 k tris de moins)
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
    this.motion.reset();
  }

  /** Objets KayKit chargés : géométries et matériaux toon texturés à la place des formes procédurales. */
  private applyProps(p: Record<PropKey, PropGeometry>): void {
    const mats = new Map<THREE.Texture | null, THREE.MeshToonMaterial>();
    const mat = (g: PropGeometry) => {
      let m = mats.get(g.map);
      if (!m) {
        m = stylize(new THREE.MeshToonMaterial({ map: g.map, gradientMap: toonGradient() }));
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
    this.tMine.base = MINE_IDLE;
    const trees: PropKey[] = ['tree_pine', 'tree_pine_y', 'tree_dead', 'tree_dead_m'];
    // phase 44 : les arbres stylisés (nature.glb) passent devant ; ceux-ci restent le repli s'il ne charge pas
    if (!this.natureReady)
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
    this.stall.add(...stallParts);
    this.cChest = CHEST_ELITE;
    this.tBlade.base = this.tBoom.base = WHITE;
    this.propsReady = true;
    this.syncProc();
    this.propX = this.propZ = 1e9;
  }
  /** Décor procédural de repli : caché dès que les modèles qui le remplacent sont là. */
  private syncProc(): void {
    for (const m of this.treeProc) m.visible = !this.propsReady && !this.natureReady;
    for (const m of this.decorProc) m.visible = !this.propsReady;
    if (this.grassProc) this.grassProc.visible = !this.natureReady;
  }
  /** Phase 44 : décor stylisé chargé. Un seul matériau (atlas, feuilles découpées, deux faces) pour tous les modèles. */
  private applyNature(n: NatureSet): void {
    this.nature = n;
    if (n.map) n.map.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    // Trois matériaux, aucun appel de rendu en plus (chaque famille d'instances est déjà un appel) :
    // - arbres et buissons : feuilles découpées, UNE face (cartes tournées vers l'extérieur du houppier, caméra en
    //   haut) : les cartes du côté opposé ne sont plus rastérisées. Mesuré en rendu logiciel : le feuillage à deux
    //   faces coûtait à lui seul près d'un tiers du temps d'image ;
    // - fleurs : découpées, deux faces (peu d'instances, petites) ;
    // - herbe : brins pleins, deux faces, ni texture ni découpe (pas de `discard` : rejet précoce en profondeur).
    this.natureMat = stylize(
      new THREE.MeshToonMaterial({
        map: n.map,
        vertexColors: true,
        gradientMap: toonGradient(),
        alphaTest: 0.5,
      }),
    );
    this.flowerMat = stylize(
      new THREE.MeshToonMaterial({
        map: n.map,
        vertexColors: true,
        gradientMap: toonGradient(),
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      }),
    );
    this.grassMat = stylize(
      new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: toonGradient(),
        side: THREE.DoubleSide,
      }),
    );
    this.natureReady = true;
    this.natureStage = -1;
    this.dressStage();
    this.dressRocks();
    this.syncProc();
  }
  /** Arbres et semis du monde courant : géométries teintées aux couleurs du monde (une fois par changement de monde). */
  private dressStage(): void {
    const n = this.nature;
    if (!n || !this.natureMat || this.natureStage === this.stageIdx) return;
    this.natureStage = this.stageIdx;
    const D = PAL.stages[this.stageIdx].decor;
    const put = (wr: InstanceWriter, key: string, h: number, tint: number, mat = this.natureMat!) => {
      wr.mesh.geometry.dispose();
      wr.mesh.geometry = tintedNature(n.models[key as NatureKey], h, this.cLeaf.setHex(tint));
      wr.mesh.material = mat;
    };
    for (let k = 0; k < 4; k++) put(this.propTreeW[k], D.trees[k][0], TREE_H, D.trees[k][1]);
    put(this.grassW, 'grass', 0.8, D.grass, this.grassMat!);
    put(this.flowerW, D.flowers[0], 0.6, 0xffffff, this.flowerMat!);
    put(this.bushW, D.bush[0], 0.95, D.bush[1]);
    this.propX = this.propZ = 1e9;
  }
  /** Rochers de la carte : modèle stylisé à la place du dodécaèdre (mêmes matrices, pied au sol). */
  private dressRocks(): void {
    const n = this.nature,
      m = this.rocksMesh;
    if (!n || !m || m.userData.stylized) return;
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
    m.geometry = tintedNature(n.models.rock_b, 1.7, WHITE);
    // matériau à lui (libéré avec le décor de la carte, pas le matériau partagé du décor stylisé), opaque et à une
    // face : un rocher n'a ni feuille à découper ni dos à dessiner (relecture perf) ; même programme que les ouvrages
    m.material = toonMaterial({ vertexColors: true });
    m.userData.stylized = true;
  }
  /** État des modèles d'ennemis, affiché dans l'onglet perf : chargement, prêt (durée), ou erreur. */
  enemyStatus = 'chargement';
  /** Vrai tant que le premier essai de chargement des modèles d'ennemis n'est pas terminé. */
  enemiesPending = true;
  // déclaré AVANT la promesse : un champ déclaré après (initialisé à undefined) écraserait la fonction posée ici
  private enemiesSettled: () => void = () => undefined;
  /** Résolue à la fin du premier essai de chargement des modèles d'ennemis (réussi ou non). */
  readonly enemiesReady = new Promise<void>(
    (r) =>
      (this.enemiesSettled = () => {
        this.enemiesPending = false;
        r();
      }),
  );
  private loadEnemies(attempt: number): void {
    const t0 = performance.now();
    const stage = (st: string) => (this.enemyStatus = `${st} (essai ${attempt + 1})`);
    loadEnemyModels(stage)
      .then((en) => this.applyEnemyModels(en))
      .then(() => {
        this.enemyStatus = `3D prêts en ${((performance.now() - t0) / 1000).toFixed(1)} s`;
        this.enemiesSettled();
      })
      .catch((e: unknown) => {
        console.warn('modèles des ennemis indisponibles, repli procédural', e);
        const msg = e instanceof Error ? e.message : String(e);
        this.enemyStatus = `silhouettes (essai ${attempt + 1} : ${msg.slice(0, 80)})`;
        this.enemiesSettled();
        if (attempt < 3) setTimeout(() => this.loadEnemies(attempt + 1), 4000 * (attempt + 1));
      });
  }
  /**
   * Phase 21 : géométries cuites (poses en cibles de morph) et texture des créatures (phase 46 B) à la place des
   * silhouettes ; une morphTexture par type, allouée à pleine capacité (même piège que les couleurs d'instance) ; contour des boss par
   * un InstancedMesh jumeau qui partage matrices et poses. Tout est construit avant d'échanger.
   */
  private async applyEnemyModels(en: (BakedEnemy | null)[]): Promise<void> {
    const todo: (() => void)[] = [];
    // programmes compilés en tâche de fond avant l'échange (relecture perf : 5 à 7 shaders d'un coup sinon, en jeu)
    const probes = new THREE.Group();
    for (let t = 0; t < this.enemyW.length; t++) {
      const b = en[t] ?? null;
      const mesh = this.enemyW[t].mesh;
      if (!b) continue;
      const geo = this.qualityLevel > 0 ? b.geo.net : b.geo.pixel;
      // phase 44 B : liseré de la couleur du type (plus fort sur les boss) : la silhouette se lit sur l'herbe claire
      const mat = stylize(
        new THREE.MeshToonMaterial({ map: b.map, gradientMap: toonGradient() }),
        new THREE.Color(PAL.enemy[t]).lerp(WHITE, ENEMY_RIM_WHITE).getHex(), // au chargement seulement
        b.boss ? ENEMY_RIM * 1.5 : ENEMY_RIM,
      );
      const len = 1 + b.loop + b.action,
        cap = mesh.instanceMatrix.count;
      const data = new Float32Array(len * cap);
      const tex = new THREE.DataTexture(data, len, cap, THREE.RedFormat, THREE.FloatType);
      tex.needsUpdate = true;
      const probe = new THREE.InstancedMesh(geo, mat, 1);
      probe.morphTexture = tex;
      probes.add(probe);
      let outline: THREE.InstancedMesh | null = null;
      if (b.boss) {
        outline = new THREE.InstancedMesh(geo, enemyOutlineMaterial(OUTLINE.boss), cap);
        outline.instanceMatrix = mesh.instanceMatrix; // mêmes matrices et mêmes poses : aucune écriture en plus
        outline.morphTexture = tex;
        outline.count = 0;
        outline.frustumCulled = false;
        const op = new THREE.InstancedMesh(geo, outline.material, 1);
        op.morphTexture = tex;
        probes.add(op);
      }
      // 1.69.2 : jumeau en version simple (même matériau) pour les ennemis lointains du rendu allégé
      let far: InstanceWriter | null = null,
        farData: Float32Array | null = null;
      if (!b.boss && b.geo.pixel !== b.geo.net) {
        far = new InstanceWriter(makeInstanced(b.geo.pixel, mat, cap));
        farData = new Float32Array(len * cap);
        const ft = new THREE.DataTexture(farData, len, cap, THREE.RedFormat, THREE.FloatType);
        ft.needsUpdate = true;
        far.mesh.morphTexture = ft;
        const fp = new THREE.InstancedMesh(b.geo.pixel, mat, 1);
        fp.morphTexture = ft;
        probes.add(fp);
      }
      todo.push(() => {
        mesh.geometry.dispose();
        // niveau choisi à l'échange : la qualité a pu changer pendant la compilation asynchrone
        mesh.geometry = this.qualityLevel > 0 ? b.geo.net : b.geo.pixel;
        mesh.material = mat;
        mesh.morphTexture = tex;
        mesh.updateMorphTargets();
        if (outline) {
          outline.updateMorphTargets();
          this.scene.add(outline);
        }
        this.enemyMorph[t] = data;
        this.bossOutline[t] = outline;
        if (far) {
          far.mesh.updateMorphTargets();
          this.scene.add(far.mesh);
          this.writers.push(far);
        }
        this.enemyFarW[t] = far;
        this.enemyFarMorph[t] = farData;
      });
    }
    this.enemyStatus = 'compilation des shaders';
    // compilation en tâche de fond, plafonnée à 4 s : un pilote qui ne répond pas ne doit pas bloquer l'échange
    await Promise.race([
      this.renderer.compileAsync(probes, this.camera, this.scene).catch(() => undefined),
      new Promise<void>((r) => setTimeout(r, 4000)),
    ]);
    // phase 26 : une texture par modèle, envoyée à la carte graphique au chargement (pas à la première apparition)
    for (const b of en) if (b?.map) this.renderer.initTexture(b.map);
    this.enemyBaked = en; // avant l'échange : poseEnemy lit enemyBaked dès que enemyMorph[t] existe
    for (const f of todo) f();
    // la couleur d'instance multiplie la texture, déjà colorée : presque blanche (un soupçon du type), élites dorées
    for (let t = 0; t < this.enemyW.length; t++) {
      if (!en[t]) continue;
      this.enemyColor[t].set(PAL.enemy[t]).lerp(WHITE, ENEMY_TINT_KEEP);
      // phase 51 : or franc et surexposé (la couleur d'instance multiplie une texture déjà colorée : à 1, il se lisait mal)
      this.eliteColor[t].set(PAL.enemy[t]).lerp(this.cGold, 0.85).multiplyScalar(FEEL.elite.bright);
      // corrompus : violet franc et surexposé, comme l'or des élites (la texture porte déjà la couleur du type)
      this.corruptColor[t]
        .set(PAL.enemy[t])
        .lerp(this.cCorrupt, FEEL.corrupt.tintModel)
        .multiplyScalar(FEEL.corrupt.brightModel);
    }
    this.cFlash = ENEMY_FLASH;
    this.enemyHop = 0.25;
    this.enemyRoll = 0.25;
    this.enemyKind = 'gltf';
  }
  /**
   * Couloir rouge au sol d'un chargeur qui arme sa charge (Brute élite, Ruée d'un Dard corrompu), jusqu'au point
   * d'arrivée ; il s'élargit pendant le télégraphe (0 → largeur réelle).
   */
  private chargeLane(e: Enemy, ex: number, ez: number, eg: number): void {
    const C = chargeOf(e);
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
  /**
   * Poses de l'ennemi qui vient d'être écrit (dernière instance de `wr`, l'écrivain de son type, ou son jumeau lointain
   * en version simple) : marche en boucle, ou geste.
   */
  private poseEnemy(t: number, e: Enemy, now: number, wr: InstanceWriter): void {
    const data = wr === this.enemyW[t] ? this.enemyMorph[t] : this.enemyFarMorph[t];
    if (!data) return;
    const b = this.enemyBaked[t]!;
    const len = 1 + b.loop + b.action;
    const row = wr.last; // -1 : instance refusée (capacité pleine), rien à poser
    if (row < 0) return;
    if (this.frozenPose) {
      // phase 35 : Temps figé, pose de marche arrêtée (un instant différent par ennemi), pas de geste
      writeLoopPose(data, row, len, 0, b.loop, 0.1 + e.bob * 0.16);
      return;
    }
    if (b.action) {
      // Archer et Cracheur : visée 0 → 1 ; Sorcier et boss : geste en boucle pendant le télégraphe (state 1)
      if ((t === ARCHER_TYPE && e.state === 1) || (t === CRACHEUR_TYPE && e.aim > 0)) {
        writeOncePose(data, row, len, b.loop, b.action, e.aim);
        return;
      }
      if (e.state === 1 && (b.boss || t === SORCIER_TYPE)) {
        writeLoopPose(data, row, len, b.loop, b.action, now * 0.9 + e.bob);
        return;
      }
    }
    const cyc = e.stun > 0 ? 0.1 : now * ENEMIES[t].speed * ENEMY_STRIDE + e.bob * 0.16;
    writeLoopPose(data, row, len, 0, b.loop, cyc);
  }
  /** Arbres et lanternes à moins de PROP_DRAW u du joueur dans les écrivains KayKit (au plus 64 arbres de chaque sorte). */
  private sortNearDecor(px: number, pz: number): void {
    this.propX = px;
    this.propZ = pz;
    for (const wr of this.propTreeW) wr.begin();
    const pr = this.lite ? LITE.propDraw : PROP_DRAW,
      sr = this.lite ? LITE.smallDraw : SMALL_DRAW; // 1.69.2 : décor dessiné moins loin au rendu allégé
    const T = this.treeData,
      R2 = pr * pr,
      r2 = sr * sr;
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
    this.propGraveW.begin();
    if (this.propsReady) {
      const L = this.lampData;
      for (let i = 0; i < L.length; i += 3) {
        const dx = L[i] - px,
          dz = L[i + 2] - pz;
        if (dx * dx + dz * dz < r2) this.propLampW.put(L[i], L[i + 1], L[i + 2], i * 0.7, 1, WHITE);
      }
      const G = this.graveData;
      for (let i = 0; i < G.length; i += 4) {
        const dx = G[i] - px,
          dz = G[i + 2] - pz;
        if (dx * dx + dz * dz < r2) this.propGraveW.put(G[i], G[i + 1], G[i + 2], G[i + 3], 1, WHITE);
      }
    }
    this.propLampW.end();
    this.propGraveW.end();
    if (this.natureReady) this.scatter(px, pz);
  }
  /**
   * Phase 44 : semis autour du joueur. Une grille de cases de SCATTER.cell u ; chaque case tire (hachage de ses
   * coordonnées et de la graine de la carte : toujours le même semis au même endroit) une touffe d'herbe, parfois des
   * fleurs, un buisson en lisière de terre. Rien sur la terre nue, les pistes, les lacs. Aucune allocation.
   */
  private scatter(px: number, pz: number): void {
    const pixel = this.qualityLevel === 0,
      grassOnly = pixel || this.lite; // 1.69.2 : allégé, l'herbe seule (fleurs et buissons : 2 appels rendus aux jumeaux)
    const C = SCATTER.cell,
      R = pixel ? SCATTER.drawPixel : this.lite ? LITE.scatter : SCATTER.draw,
      grassP = pixel ? 0.3 : 0.6,
      R2 = R * R,
      lim = WORLD_HALF - 1.5;
    this.grassW.begin();
    this.flowerW.begin();
    this.bushW.begin();
    const i0 = Math.floor((px - R) / C),
      i1 = Math.ceil((px + R) / C),
      j0 = Math.floor((pz - R) / C),
      j1 = Math.ceil((pz + R) / C);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(this.scatterSeed, 1442695041)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        const x = (i + (h & 1023) / 1023) * C,
          z = (j + ((h >>> 10) & 1023) / 1023) * C;
        const dx = x - px,
          dz = z - pz;
        if (dx * dx + dz * dz > R2 || x > lim || x < -lim || z > lim || z < -lim) continue;
        const pick = (h >>> 20) / 4095,
          bare = this.terrain.bareAt(x, z);
        const ry = pick * 61,
          sc = 0.8 + ((h >>> 5) & 31) / 62;
        if (bare > 0.2 && bare < 0.6 && pick > 0.86) {
          if (!grassOnly) this.bushW.put(x, this.gy(x, z) - 0.06, z, ry, sc, WHITE);
        } else if (bare > 0.3) continue;
        else if (pick < grassP) this.grassW.put(x, this.gy(x, z) - 0.03, z, ry, sc, WHITE);
        else if (!grassOnly && pick >= 0.6 && pick < 0.68) this.flowerW.put(x, this.gy(x, z) - 0.02, z, ry, sc, WHITE);
      }
    this.grassW.end();
    this.flowerW.end();
    this.bushW.end();
  }

  resize(wpx: number, hpx: number): void {
    this.sizeW = wpx;
    this.sizeH = hpx;
    this.applySize();
    this.camera.aspect = wpx / hpx;
    this.camera.updateProjectionMatrix();
    this.camScale = wpx < hpx ? 1.35 : 1;
    this.frustumReady = false; // le champ change : tout est dessiné une frame, puis le test reprend
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
      const k = Math.min(dpr, QUALITY.maxHeight / h) * QUALITY_STEPS[this.step].scale; // 1.69.2 : palier auto
      rw = w * k;
      rh = h * k;
    }
    this.renderer.setSize(Math.max(1, Math.round(rw)), Math.max(1, Math.round(rh)), false);
  }

  /**
   * 1.69.2 : seuil de distance² au héros des projectiles du héros dessinés au rendu allégé (+∞ : tous). Les mines et
   * les plaques de feu, posées au sol, ne comptent pas (toujours dessinées). `projTies` : places laissées aux projectiles
   * exactement au seuil (une salve part du même point). Aucune allocation.
   */
  private projTies = 0;
  /** Projectiles du héros en vol dessinés à la dernière image (orbes, boomerangs, lances) : tests du plafond. */
  projDrawn = 0;
  /** ms passées dans `renderer.render` (envoi au GPU) au dernier rendu : retirées du temps JS de l'image (`main.ts`). */
  submitMs = 0;
  private projCut(w: World, px: number, pz: number): number {
    let n = 0;
    for (let i = 0; i < w.projCount; i++) {
      const p = w.projs[i];
      if (p.kind === ProjKind.Mine || p.kind === ProjKind.Fire) {
        this.projD2[i] = -1;
        continue;
      }
      const dx = p.x - px,
        dz = p.z - pz;
      this.projSel[n++] = this.projD2[i] = dx * dx + dz * dz;
    }
    const cut = nearestCut(this.projSel, n, LITE.projCap);
    if (cut === Infinity) return cut;
    let below = 0;
    for (let i = 0; i < w.projCount; i++) {
      const d = this.projD2[i];
      if (d >= 0 && d < cut) below++;
    }
    this.projTies = LITE.projCap - below;
    return cut;
  }

  /**
   * Change le rendu : `pixel` (réglage manuel, ≈ 380 px de haut, plus proche voisin) ou net au palier `step` du réglage
   * auto (QUALITY_STEPS : 0 net, 1 allégé, puis résolution ×0,85, ×0,7, ×0,6, toujours lisse). Taille interne, filtrage
   * du sol, classe CSS, rendu allégé. Idempotent.
   */
  setQuality(pixel: boolean, step = 0): void {
    const level = pixel ? 0 : 2;
    step = pixel ? 0 : Math.max(0, Math.min(QUALITY_STEPS.length - 1, step | 0));
    // facteur de la taille interne avant et après (-1 : pixel) : setSize seulement s'il change, une fois
    const sizeWas = this.qualityLevel === 0 ? -1 : QUALITY_STEPS[this.step].scale,
      sizeNow = level === 0 ? -1 : QUALITY_STEPS[step].scale;
    if (step !== this.step) {
      this.step = step;
      this.lite = QUALITY_STEPS[step].lite;
      this.particles.cap = this.lite ? LITE.particles : FEEL.particles.cap;
      this.propX = this.propZ = 1e9; // le décor dessiné dépend du palier : refait au prochain rendu
    }
    if (level !== this.qualityLevel) this.setLevel(level);
    if (sizeNow !== sizeWas) this.applySize(); // à la fin : applySize lit le niveau et le palier posés ci-dessus
  }
  /** Niveau pixel (0) ou net (2) : détail des formes, géométrie des ennemis, sol, semis, classe CSS. */
  private setLevel(level: number): void {
    this.qualityLevel = level;
    setDetail(level > 0 ? 12 : 7);
    // formes procédurales plus lisses (ou non) : modèle reconstruit ; le héros glTF ne dépend pas du détail
    if (this.heroKind !== 'gltf') this.setCharacter(this.modelKey, this.modelSkin, true);
    // phase 21 : ennemis de masse en version simplifiée en pixel (≈ 150 triangles), détaillée sinon (≈ 330)
    for (let t = 0; t < this.enemyW.length; t++) {
      const b = this.enemyBaked[t];
      if (b && this.enemyMorph[t]) this.enemyW[t].mesh.geometry = level > 0 ? b.geo.net : b.geo.pixel;
    }
    this.applyGround();
    this.propX = this.propZ = 1e9; // le semis dépend du niveau : refait au prochain rendu
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

  /** Phase 32 : coup des Lames centré sur une cible (zone de rayon r), dans la direction héros → cible. */
  blade(x: number, z: number, r: number, dx: number, dz: number): void {
    if (this.bladeN >= FEEL.blade.max) return;
    const b = this.blades[this.bladeN] ?? { x: 0, z: 0, r: 0, a: 0, life: 0 };
    this.blades[this.bladeN++] = b;
    b.x = x;
    b.z = z;
    b.r = r;
    b.a = Math.atan2(dx, dz);
    b.life = FEEL.blade.life;
  }

  /**
   * 1.69.0 (docs/specs/rafales-faux-guidage.md, décision 8) : une faux apparaît et fauche son arc autour du héros
   * (milieu de l'arc dans la direction dx, dz ; portée r ; `arcDeg` : son arc en degrés), avec sa traînée.
   */
  scythe(r: number, dx: number, dz: number, arcDeg: number): void {
    if (this.scytheN >= FEEL.scythe.max) return;
    const sc = this.scythes[this.scytheN] ?? { r: 0, a: 0, arc: 0, life: 0 }; // réserve qui grandit une fois
    this.scythes[this.scytheN++] = sc;
    sc.r = r;
    sc.a = Math.atan2(dx, dz);
    sc.arc = (Math.min(360, arcDeg) * Math.PI) / 180;
    sc.life = FEEL.scythe.life;
  }

  /** Saut du joueur (Ev.Jump) : élan du héros glTF, puis la pose en l'air (Fall) prend le relais. */
  onJump(): void {
    // phase 29 : élan plus vif (il traînait au-dessus du sol) ; 1.24.1 : un saut depuis la glisse aussi (le saut
    // annule la glissade, animation normale)
    this.heroAnim?.trigger(HeroAnim.Jump, 2.2);
  }

  /** Phase 27 : glissade lancée ou finie (l'animation de fond suit P.sliding ; ici, l'appui visuel). */
  onSlide(on: boolean): void {
    if (on) this.slideDust = 1.4; // première bouffée tout de suite
  }

  /** Atterrissage du joueur : lance le ressort d'écrasement (valeurs neutres depuis la PR #6). */
  onLand(sliding = false, speed = 0): void {
    this.landT = 0;
    // phase 29 : le clip de réception (accroupi) seulement après un vrai vol, presque à l'arrêt et sans glisse qui
    // continue ; en courant ou en glissant, on enchaîne sans freiner à l'écran
    if (this.motion.shouldLand(sliding, speed)) this.heroAnim?.trigger(HeroAnim.Land, 2);
  }

  /**
   * Vrai si une boule de rayon `r` posée en (x, y, z) touche le champ de la caméra. Un lieu à 35 u derrière la caméra
   * coûtait un appel de dessin pour rien : avec 7 à 20 crânes et 1 à 3 totems de boss par carte (phase 50), le budget
   * mobile (40 appels) était dépassé une partie sur deux au point de départ (41 à 43 mesurés en CI).
   */
  private seen(x: number, y: number, z: number, r: number): boolean {
    if (!this.frustumReady) return true;
    this.seenBall.center.set(x, y, z);
    this.seenBall.radius = r + POI_SEEN_PAD;
    return this.frustum.intersectsSphere(this.seenBall);
  }
  /** À appeler après un rendu : la caméra et ses matrices sont à jour. */
  private keepFrustum(): void {
    this.viewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj);
    this.frustumReady = true;
  }

  /**
   * Phase 37 : totem du monde (pierre de sanctuaire rouge, plus haute, anneau qui se remplit, colonne rouge visible de
   * loin) puis, boss tué à temps, portail (trois anneaux debout qui respirent, colonne cyan). Dans les écrivains des
   * sanctuaires et des colonnes : aucun appel de dessin en plus.
   */
  private drawTotem(w: World, px: number, pz: number, now: number): void {
    this.totem.mesh.visible = false;
    const T = w.totem;
    if (T.state === TOTEM_HIDDEN) return; // lot L2 : pas encore dévoilé
    const g = this.gy(T.x, T.z);
    const d2 = (T.x - px) ** 2 + (T.z - pz) ** 2;
    // 1.53.1 : anneaux et stèle seulement dans le champ de la caméra (≈ 5,4 u de haut)
    const near = d2 < POI_DRAW2 && this.seen(T.x, g + STAGE.totemR, T.z, STAGE.totemR * 1.8);
    // la stèle elle-même n'est dessinée que dans le champ de la caméra (≈ 36 u au zoom le plus large) : au-delà, la
    // colonne de lumière suffit, et l'appel de rendu est rendu au budget (40 sur mobile, mesuré à 40 sans cela)
    const inView = near && d2 < TOTEM_VIEW2;
    if (w.portal.open) {
      // 1.68.0 : le portail du monde 3 est rouge (il mène à l'Arène du boss final)
      const pc = w.stage === STAGE.count - 1 ? this.cPortalRed : this.cBeamBlue;
      if (near)
        for (let k = 0; k < 3; k++) {
          const r = STAGE.portalR * (0.55 + k * 0.25) * (1 + Math.sin(now * 3 + k * 2) * 0.06);
          this.cPoi.copy(pc).multiplyScalar(0.7 + Math.sin(now * 4 + k) * 0.3);
          this.shrineGlowW.put(T.x, g + STAGE.portalR * 1.15, T.z, now * (0.6 + k * 0.3), r, this.cPoi, Math.PI / 2, 0);
        }
      this.beamW.put(T.x, g, T.z, 0, 2.2, pc, 0, 0, 1.1, 2.2);
      return;
    }
    const fought = T.state === 1;
    const f = T.state === 0 ? T.charge / STAGE.totemCharge : 1;
    if (near) {
      this.tilt(T.x, T.z);
      // 1.42.1 : la stèle ; runes et cristal dans la couleur de l'état, qui battent avec la jauge
      const tm = this.totem.mesh;
      tm.visible = inView;
      tm.position.set(T.x, g - 0.05, T.z);
      tm.rotation.set(this.tRx, 0.3, this.tRz);
      this.totem.glow.setHex(fought ? 0xff7a4a : 0xff3b5c).multiplyScalar(1.05 + f * 0.5 + Math.sin(now * 3) * 0.15);
      this.cPoi.setHex(PAL.hp).multiplyScalar(0.4 + f * 1.2 + Math.sin(now * 3) * 0.1);
      this.shrineGlowW.put(T.x, g + 0.12, T.z, now * 0.6, STAGE.totemR * (1 + f * 0.1), this.cPoi, this.tRx, this.tRz);
    }
    if (!fought) {
      this.cPoi.setHex(PAL.hp);
      this.beamW.put(T.x, g, T.z, 0, 1.6 + f, this.cPoi, 0, 0, 1.3, 1.6 + f);
    }
  }

  /**
   * 1.68.0 (docs/specs/boss-final.md) : l'Arène du boss final, dans les écrivains des lieux (aucun appel de plus, sauf le
   * mur de flammes) : sceaux (stèles violettes, anneau, colonne), Jugement (toute l'Arène rouge, zone sûre dorée), mur
   * de flammes qui rougit avant de se resserrer, flammèches le long du cercle.
   */
  private drawArena(w: World, now: number): void {
    for (let i = 0; i < w.enemyCount; i++) {
      const e = w.enemies[i];
      if (!e.alive || e.role !== Role.Seal) continue;
      const f = e.flash > 0 ? 1.6 : 1;
      this.cPoi.copy(this.cCorruptEye).multiplyScalar((1.1 + Math.sin(now * 4 + i) * 0.2) * f);
      this.bossTotemW.put(e.x, -0.02, e.z, i * 1.3, FEEL.bossTotem.height / TOTEM_HEIGHT, this.cPoi, 0, 0);
      this.cPoi.copy(this.cCorrupt).multiplyScalar(0.6 + 0.4 * (e.hp / e.max));
      this.shrineGlowW.put(e.x, 0.12, e.z, now * 0.6, e.r * 1.6, this.cPoi, 0, 0);
      this.beamW.put(e.x, 0, e.z, 0, FEEL.bossTotem.beam, this.cCorrupt, 0, 0, 1, FEEL.bossTotem.beam);
    }
    if (w.judgeT > 0) {
      // la zone sûre du Jugement : un cercle de lumière et sa colonne (le rouge de l'Arène : drawJudgement)
      const J = FINAL.judge;
      const pulse = 1 + Math.sin(now * 10) * 0.05;
      this.shrineGlowW.put(w.judgeX, 0.14, w.judgeZ, now, J.r * pulse, this.cSafe, 0, 0);
      this.shrineGlowW.put(w.judgeX, 0.15, w.judgeZ, -now * 1.3, J.r * 0.6 * pulse, this.cSafe, 0, 0);
      this.beamW.put(w.judgeX, 0, w.judgeZ, 0, FEEL.final.safeBeam, this.cSafe, 0, 0, 1, FEEL.final.safeBeam);
    }
  }
  /**
   * Le Jugement : l'Arène se remplit de rouge pendant l'annonce. Écrit dès l'ouverture des écrivains des télégraphes
   * (bord : zoneW, disque : zoneFillW), avant les tirs : un tampon plein refuserait un cercle de Colosse, jamais lui.
   */
  private drawJudgementFill(w: World): void {
    if (w.stage !== ARENA || w.judgeT <= 0) return;
    const f = 1 - w.judgeT / FINAL.judge.telegraph;
    this.zoneFillW.put(0, 0.06, 0, 0, w.arenaR * (0.35 + 0.65 * f), this.cTele, 0, 0);
  }
  private drawJudgementRing(w: World): void {
    if (w.stage === ARENA && w.judgeT > 0) this.zoneW.put(0, 0.08, 0, 0, w.arenaR, this.cTele, 0, 0);
  }
  /** Le mur de flammes de l'Arène : rayon adouci, rouge qui bat avant un pas, flammèches (moins en effets réduits). */
  private drawRing(w: World, dt: number, now: number): void {
    const on = w.stage === ARENA;
    this.arenaRing.visible = on;
    if (!on) {
      this.ringR = FINAL.arenaR;
      return;
    }
    this.ringR += (w.arenaR - this.ringR) * Math.min(1, dt * 5);
    this.arenaRing.scale.set(this.ringR, 1 + Math.sin(now * 7) * 0.06, this.ringR);
    const warn = ringWarned(w);
    this.cRing.copy(warn ? this.cRingWarn : this.cRingFire);
    if (!this.reducedFx)
      this.cRing.multiplyScalar(warn ? 1.2 + Math.sin(now * 22) * 0.5 : 0.9 + Math.sin(now * 5) * 0.1);
    this.ringMat.color.copy(this.cRing);
    // débit par seconde (le même à 60 ou 120 Hz) ; une flammèche vit au plus 0,6 s : le débit est borné pour qu'il n'y
    // en ait jamais plus de flamesMax en vol
    const rate = Math.min(
      FEEL.final.flames * (this.reducedFx ? 0.5 : 1) * (warn ? 2 : 1),
      FEEL.final.flamesMax / FLAME_LIFE,
    );
    this.flameAcc = Math.min(this.flameAcc + rate * dt, FEEL.final.flamesMax);
    const n = Math.floor(this.flameAcc);
    this.flameAcc -= n;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.burst(
        Math.sin(a) * this.ringR,
        0.2,
        Math.cos(a) * this.ringR,
        warn ? PAL.ringWarn : PAL.ringFire,
        1,
        0.6,
        3,
        false,
      );
    }
  }

  /** Phase 37 : ambiance du monde `i` (lumières du cycle et teinte du sol) ; phase 44 : textures du sol et décor. */
  private stageIdx = 0;
  setStage(i: number): void {
    const st = (this.stageIdx = Math.max(0, Math.min(PAL.stages.length - 1, i)));
    this.groundMat.color.setHex(PAL.stages[st].tint);
    this.applyGround();
    this.askGround(this.groundIdx());
    if (st > 0 && st + 1 < STAGE.count) this.askGround(st + 1); // monde suivant prêt avant le portail
    this.dressStage();
  }
  /** Demande (une fois) les deux textures de sol d'un monde ; appliquées si c'est le monde courant. */
  private askGround(st: number): void {
    if (this.groundAsked[st]) return;
    this.groundAsked[st] = true;
    Promise.all([loadGroundTexture(st, 'a'), loadGroundTexture(st, 'b')]).then(
      ([a, b]) => {
        a.repeat.set((WORLD_HALF * 2) / GROUND_TILE, (WORLD_HALF * 2) / GROUND_TILE);
        this.groundSet[st] = [a, b];
        if (this.groundIdx() === st) this.applyGround();
      },
      (e: unknown) => {
        this.groundAsked[st] = false; // nouvel essai au prochain passage dans ce monde
        console.warn('textures de sol indisponibles, repli', e);
      },
    );
  }
  /** Textures du sol du monde courant (ou la texture dessinée tant qu'elles chargent). */
  private applyGround(): void {
    const set = this.groundSet[this.groundIdx()],
      proc = this.groundTex(this.qualityLevel > 0);
    this.groundMat.map = set ? set[0] : proc;
    this.groundMap2.value = set ? set[1] : proc;
    this.groundMat.needsUpdate = true;
  }

  /**
   * Cycle de lumière lié au chrono du monde : crépuscule 0:00 → nuit à 8:00 (l'heure du totem se lit sans chrono),
   * dans les couleurs du monde (phase 37 ; avant : crépuscule → nuit 8:00 → aube 20:00 sur toute la partie).
   */
  private lightCycle(t: number): void {
    const L = PAL.stages[this.stageIdx];
    const a: LightKey = L.dusk,
      b: LightKey = L.night,
      f = Math.min(1, t / 480);
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
    if (this.eclipse > 0) {
      // 1.68.0 : l'éclipse du boss final retire une part de la lumière et noircit la brume (moins en « effets réduits »)
      const k = this.eclipse * (this.reducedFx ? FEEL.final.eclipseReduced : FEEL.final.eclipse);
      this.hemi.intensity *= 1 - k;
      this.sun.intensity *= 1 - k * 0.8;
      this.fog.color.multiplyScalar(1 - k);
      (this.scene.background as THREE.Color).copy(this.fog.color);
    }
    this.night = Math.min(1, t / 300);
    if (this.haloMat) this.haloMat.opacity = 0.015 + 0.11 * f;
  }

  /**
   * Lot L5 : couleur `hex` d'un effet d'arme au palier `tier` (étincelles, gerbe du palier). Passe par la scène : main.ts
   * n'importe rien qui tire three dans son chunk.
   */
  tint(hex: number, tier: number, now: number, phase = 0): number {
    return tierHex(hex, tier, now, phase);
  }

  /** Lot L5 : couleurs des armes à la teinte de leur palier (le prisme du palier III tourne : refaites à chaque image). */
  private tintWeapons(w: World, now: number): void {
    for (let i = 0; i < this.tierTints.length; i++) {
      const g = this.tierTints[i],
        tier = w.wtier[g.k];
      for (let j = 0; j < g.tints.length; j++) g.tints[j].update(tier, now);
    }
  }

  /** Dessine le monde interpolé entre le step précédent et le courant (alpha ∈ [0,1]). */
  render(w: World, alpha: number, dt: number, now: number, hurtFlash: boolean): void {
    const P = w.player;
    const S = FEEL.squash;
    const px = lerp(P.px, P.x, alpha),
      pz = lerp(P.pz, P.z, alpha),
      py = lerp(P.py, P.y, alpha);
    const gp = this.gy(px, pz); // phase 18 : sol local sous le joueur (la sim donne y au-dessus du sol)
    const arena = w.stage === ARENA;
    const eclTarget = arena && w.finalPhase >= 3 && w.finalPhase < FINAL_DONE ? 1 : 0;
    this.eclipse += (eclTarget - this.eclipse) * Math.min(1, dt * FEEL.final.eclipseEase);
    if (this.eclipse < 0.002) this.eclipse = eclTarget;
    this.lightCycle(w.stageT);
    this.fireflies.update(px, pz, now, this.night);
    this.particles.billboardRx = this.bolts.billboardRx = -Math.atan2(
      this.camPos.y - this.camLook.y,
      this.camPos.z - this.camLook.z,
    );

    this.terrain.follow(px, pz); // phase 27 : la fenêtre de sol suit le joueur (recalée par pas de 16 u)
    this.drawRing(w, dt, now); // 1.68.0 : le cercle de flammes de l'Arène
    // phase 29 : segments de lisière au-delà de la vue écartés (le frustum seul en gardait 3 à 5 dans le brouillard)
    if ((px - this.borderX) ** 2 + (pz - this.borderZ) ** 2 > 16) {
      this.borderX = px;
      this.borderZ = pz;
      for (let i = 0; i < this.borderMeshes.length; i++) {
        const m = this.borderMeshes[i],
          bs = m.geometry.boundingSphere!;
        const dx = bs.center.x - px,
          dz = bs.center.z - pz,
          r = bs.radius + BORDER_VIEW;
        m.visible = dx * dx + dz * dz < r * r;
      }
    }
    // joueur
    this.player.position.set(px, py + gp, pz);
    const target = Math.atan2(P.dirX, P.dirZ);
    let diff = target - this.face;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.face += diff * Math.min(1, dt * 18);
    // poussière derrière la glissade, champ élargi en vitesse (1.30.1 : plus de vrille)
    // phase 29 : état de mouvement (fond, fondus, inclinaison) ; lacet puis tangage et roulis dans le repère du héros
    const mi = this.motionIn;
    mi.onGround = P.onGround;
    mi.sliding = P.sliding;
    mi.airMom = P.airMom;
    mi.slideJump = P.slideJump;
    mi.height = py;
    mi.speed = Math.sqrt(P.vx * P.vx + P.vz * P.vz);
    mi.face = this.face;
    if (P.sliding || (P.airMom && !P.slideJump)) {
      this.terrain.gyGrad(px, pz);
      const sf = Math.sin(this.face),
        cf = Math.cos(this.face);
      mi.slopeAlong = this.terrain.gradX * sf + this.terrain.gradZ * cf;
      mi.slopeLat = this.terrain.gradX * cf - this.terrain.gradZ * sf;
    } else mi.slopeAlong = mi.slopeLat = 0;
    this.motion.update(dt, mi);
    this.player.rotation.set(this.motion.pitch, this.face, this.motion.roll, 'YXZ');
    const v2 = P.vx * P.vx + P.vz * P.vz;
    if (P.sliding) {
      this.slideDust += dt * Math.sqrt(v2);
      if (this.slideDust > 1.4) {
        this.slideDust = 0;
        this.particles.burst(px - P.dirX * 0.4, 0.12, pz - P.dirZ * 0.4, PAL.dust, 2, 1.6, 1.2);
      }
    }
    const fov = 50 + Math.min(6, Math.max(0, Math.sqrt(v2) - P.speed * 1.2) * 0.9);
    if (Math.abs(fov - this.camera.fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
    const moving = v2 > 0.1;
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
      const mb = this.motion.base;
      const base =
        mb === Base.Slide
          ? HeroAnim.Slide
          : mb === Base.Fall
            ? HeroAnim.Fall
            : mb === Base.Run && !M.float
              ? HeroAnim.Run
              : HeroAnim.Idle;
      A.update(dt, base, this.motion.runScale, this.motion.fade);
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
    // phase 35 : Élan, silhouettes vertes tant que le héros court
    const elan = w.powerT[Pw.Vitesse] > 0 && P.dashT <= 0 && !voile && (P.x !== P.px || P.z !== P.pz);
    if (P.dashT > 0 || voile || elan) {
      if (!elan) this.particles.burst(px, py + 0.8, pz, voile ? PAL.xp : PAL.cream, 1, 0, 0, false);
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
      this.cGhost
        .copy(voile ? this.cVoile : elan ? this.cPower[Pw.Vitesse] : this.cFire)
        .multiplyScalar(Math.max(0, g.life / FEEL.trail.dashGhostLife));
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
    for (let t = 0; t < this.enemyW.length; t++) {
      this.enemyW[t].begin();
      this.enemyFarW[t]?.begin();
    }
    this.shadowW.begin();
    const near2 = this.lite ? LITE.enemyNear * LITE.enemyNear : Infinity; // 1.69.2 : au-delà, version simple
    this.farPrev.set(this.farSeen);
    this.farSeen.fill(0);
    pickFarTypes(this.farPrev, this.farUse, LITE.farMin, LITE.farTypes); // hystérésis : pas de bascule
    this.metW.begin(); // anneaux des élites (ici) puis cercles des météores (plus bas)
    this.eliteN = 0;
    this.corruptN = 0;
    // particules de traînée encore permises à cette image, et chance par corrompu et par image ; « réduction des effets »
    // (game-feel §9) : ÷2
    const fxK = this.reducedFx ? 0.5 : 1;
    let trail = Math.round(FEEL.corrupt.trailMax * fxK);
    const trailP = (dt / FEEL.corrupt.trailEvery) * fxK;
    this.aims.begin();
    this.zoneFillW.begin(); // ovales de charge (ici) puis disques des télégraphes (bloc des tirs)
    this.drawJudgementFill(w); // 1.68.0 : en premier, il n'est jamais refusé
    const frozen = w.powerT[Pw.Gel] > 0; // phase 35 : Temps figé, ennemis givrés et sans sautillement
    this.frozenPose = frozen;
    for (let i = 0; i < w.enemyCount; i++) {
      const e = w.enemies[i];
      if (!e.alive || e.role === Role.Seal) continue; // les sceaux sont des stèles (dessinées avec les lieux)
      const def = ENEMIES[e.type];
      const ex = lerp(e.px, e.x, alpha),
        ez = lerp(e.pz, e.z, alpha);
      const boss = def.boss;
      const heart = e.role === Role.Heart || e.role === Role.Decoy; // le boss final ou un double : violet, agrandi
      // 1.69.2 : rendu allégé, un ennemi de masse loin du héros passe en version simple (jamais un boss ni une élite)
      const farW = this.enemyFarW[e.type];
      const isFar =
        farW !== null && !boss && !heart && !e.elite && (ex - px) * (ex - px) + (ez - pz) * (ez - pz) > near2;
      if (isFar) this.farSeen[e.type]++;
      const ew = isFar && this.farUse[e.type] === 1 ? farW : this.enemyW[e.type];
      // modèles 3D (pieds à y = 0) : posés au sol, la marche animée remplace le hop ; e.y (hauteur de rendu des
      // silhouettes procédurales, centrées) ne sert plus qu'au Volant, qui vole (1.21.4)
      const grounded = !!this.enemyMorph[e.type] && e.type !== VOLANT_TYPE;
      const hop =
        boss || grounded || frozen
          ? 0
          : Math.abs(Math.sin(now * 8 + e.bob)) *
            (e.type === 1 ? 0.12 : 0.1) *
            (e.type === VOLANT_TYPE ? 1 : this.enemyHop);
      // phase 19 : un ennemi étourdi pâlit (jaune), un ennemi ralenti bleuit ; le flash blanc du coup passe avant
      let col =
        e.flash > 0
          ? hitsBlocked(w, e)
            ? this.cBlocked // 1.68.0 : un coup qui ne le blesse pas (invulnérable, ou un double) : gris, pas blanc
            : this.cFlash
          : frozen
            ? this.cFreeze
            : e.stun > 0
              ? this.cStun
              : e.slowT > 0
                ? this.cSlow
                : e.enraged
                  ? this.cRage // phase 43 : boss enragé, rouge ; phase 50 : avant le poison, la rage doit se lire
                  : e.toxT > 0
                    ? this.cTox // phase 50 : boss empoisonné (Toxine), vert
                    : e.burnT > 0
                      ? this.cBurn // phase 47 B : en feu (Dent de dragon), orangé
                      : e.corrupt !== Corrupt.None || heart
                        ? this.corruptColor[e.type] // corrompus : violet maladif (décision 3) ; le boss final aussi
                        : e.elite
                          ? this.eliteColor[e.type]
                          : this.enemyColor[e.type];
      let s = (e.flash > 0 ? S.hitScale : 1) * (e.elite ? FEEL.elite.scale : 1);
      if (e.corrupt === Corrupt.Shard) s *= CORRUPT.split.r; // éclat de la Scission : un petit spectre
      if (heart) s *= FINAL.scale; // le Cœur de la Nuit : le Colosse agrandi
      const eg = this.gy(ex, ez);
      const ey = (grounded ? 0 : e.y + hop) + eg;
      let marked = false;
      if (e.elite) {
        // l'or bat (sauf pendant un flash, un gel, une brûlure : ces teintes passent avant)
        if (col === this.eliteColor[e.type])
          col = this.cEliteNow.copy(col).multiplyScalar(1 + FEEL.elite.pulse * Math.sin(now * 5 + e.bob));
        marked = this.eliteN < ELITE_MARKS; // au-delà (jamais en jeu : une élite toutes les 40 s), plus de marques
        if (marked) {
          const o = this.eliteN++ * 5,
            look = this.enemyMorph[e.type] ? ENEMY_LOOKS[e.type] : null;
          this.eliteBuf[o] = ex;
          this.eliteBuf[o + 1] = ey + (look ? look.height * FEEL.elite.scale : e.r * FEEL.elite.top);
          this.eliteBuf[o + 2] = ez;
          this.eliteBuf[o + 3] = e.r;
          this.eliteBuf[o + 4] = e.bob;
        }
      }
      if (e.corrupt !== Corrupt.None || heart) {
        // le violet bat (sauf pendant un flash, un gel, une brûlure, et en « réduction des effets ») ; yeux qui luisent ;
        // fine traînée. 1.68.0 : le boss final et ses doubles aussi (aura plus serrée) ; seul le vrai a des yeux
        if (col === this.corruptColor[e.type] && !this.reducedFx)
          col = this.cCorruptNow.copy(col).multiplyScalar(1 + FEEL.corrupt.pulse * Math.sin(now * 6 + e.bob));
        // yeux : à hauteur de tête, un peu devant le visage (le Volant, centré sur sa hauteur de vol : à son centre)
        const look = this.enemyMorph[e.type] ? ENEMY_LOOKS[e.type] : null,
          tall = look ? look.height * s : e.r * FEEL.elite.top,
          head = e.type === VOLANT_TYPE ? ey + 0.15 : ey + tall * FEEL.corrupt.eyeAt;
        // un double du boss final n'a ni aura ni yeux : seul le vrai brille (décision 6)
        if (e.role !== Role.Decoy && this.corruptN < FEEL.corrupt.marks) {
          const o = this.corruptN++ * 7;
          this.corruptBuf[o] = ex + Math.sin(e.face) * e.r * 0.5;
          this.corruptBuf[o + 1] = head;
          this.corruptBuf[o + 2] = ez + Math.cos(e.face) * e.r * 0.5;
          this.corruptBuf[o + 3] = e.type === VOLANT_TYPE ? ey : ey + tall * 0.45; // centre du corps (aura)
          this.corruptBuf[o + 4] = heart ? e.r * FEEL.final.aura : e.r * s * FEEL.corrupt.aura;
          this.corruptBuf[o + 5] = e.bob;
          this.corruptBuf[o + 6] = heart ? FEEL.final.eye : FEEL.corrupt.eye;
        }
        if (trail > 0 && Math.random() < trailP) {
          trail--;
          this.particles.burst(ex, ey - eg + e.r * 0.6, ez, PAL.corruptEye, 1, 0.4, 0.8, false);
        }
      }
      if (e.type === VOLANT_TYPE) {
        // ombre au sol : grossit pendant le télégraphe (0,6 s avant la plongée)
        const tele = e.state === 1 ? 1 + (1 - Math.max(0, e.timer / VOLANT.telegraph)) * 1.6 : 1;
        this.shadowW.put(ex, eg + 0.06, ez, 0, 0.6 * tele * (e.state === 2 ? 0.6 : 1), this.cShadow);
        // dragonnet (modèle cuit) : ses ailes battent, le balancement du crâne d'avant est réduit ; en plongée, son
        // point le plus bas ne traverse pas le sol
        const vb = this.enemyMorph[e.type] ? this.enemyBaked[e.type] : null;
        const sway = vb ? 0.4 : 1;
        ew.put(
          ex,
          vb ? Math.max(ey, eg + vb.low * s) : ey,
          ez,
          e.face,
          s,
          col,
          Math.sin(now * 6 + e.bob) * 0.25 * sway,
          Math.sin(now * 4 + e.bob) * 0.2 * sway,
        );
        this.poseEnemy(e.type, e, now, ew); // battement d'ailes
      } else if (e.type === SWARM_TYPE) {
        s *= e.state === 1 ? 1.25 : 1 + Math.sin(now * 3) * 0.04; // pulsation à la ponte
        // procédural : la masse tourne sur elle-même ; squelette : il regarde où il va
        ew.put(ex, ey, ez, this.enemyMorph[e.type] ? e.face : now * 0.6, s, col);
        this.poseEnemy(e.type, e, now, ew);
      } else if (e.type === REAPER_TYPE) {
        ew.put(ex, ey, ez, this.enemyMorph[e.type] ? e.face : now * 0.8, s, col);
        this.poseEnemy(e.type, e, now, ew);
      } else if (boss) {
        ew.put(ex, ey, ez, e.type === 3 && !this.enemyMorph[3] ? now * 1.4 : e.face, s, col);
        this.poseEnemy(e.type, e, now, ew);
        if (heart && e.state === 1 && isCharger(e)) this.chargeLane(e, ex, ez, eg); // 1.68.0 : la charge du Gardien
      } else if (e.type === 1) {
        ew.put(ex, ey, ez, e.face, s, col, 0, 0, s, s * S.enemyStretch);
        this.poseEnemy(e.type, e, now, ew);
        if (e.state === 1 && isCharger(e)) this.chargeLane(e, ex, ez, eg); // corrompus : Ruée du Dard
      } else {
        const roll = Math.sin(now * 5 + e.bob) * 0.2 * this.enemyRoll;
        ew.put(ex, ey, ez, e.face, s, col, roll, 0, s, s * S.enemyStretch);
        this.poseEnemy(e.type, e, now, ew);
        if (e.type === 5 && e.aim > 0) this.aims.add(ex, 0.9, ez, px, 0.9, pz, e.aim); // ligne de visée du Cracheur
        // phase 16 : ligne de visée de l'Archer, figée dans la direction du tir (16 u : la portée de la flèche)
        if (e.type === ARCHER_TYPE && e.state === 1)
          this.aims.add(ex, 1.0, ez, ex + e.tx * ARCHER_RANGE, 1.0, ez + e.tz * ARCHER_RANGE, e.aim);
        if (e.state === 1 && isCharger(e)) this.chargeLane(e, ex, ez, eg); // Brute élite qui arme sa charge
      }
      if (e.type !== VOLANT_TYPE || e.elite) this.tilt(ex, ez);
      if (e.type !== VOLANT_TYPE)
        this.shadowW.put(ex, eg + 0.05, ez, 0, e.r * 1.15 * (1 - hop * 0.6), this.cShadow, this.tRx, this.tRz);
      if (marked) {
        // phase 51 : deux anneaux qui tournent en sens inverse, plus larges que l'ancien (× 1,37)
        const EL = FEEL.elite;
        this.metW.put(ex, eg + 0.08, ez, now * 1.5, e.r * EL.ring, this.cEliteRing, this.tRx, this.tRz);
        this.metW.put(ex, eg + 0.09, ez, -now * 2.2, e.r * EL.ring2, this.cEliteRing, this.tRx, this.tRz);
      }
    }
    for (let t = 0; t < this.enemyW.length; t++) {
      const wr = this.enemyW[t];
      wr.end();
      const mt = wr.mesh.morphTexture;
      if (mt && this.enemyMorph[t] && wr.n > 0) mt.needsUpdate = true;
      const o = this.bossOutline[t];
      if (o) o.count = wr.n;
      const fw = this.enemyFarW[t];
      if (fw) {
        fw.end();
        if (fw.n > 0) fw.mesh.morphTexture!.needsUpdate = true;
      }
    }
    this.shadowW.end();
    this.aims.end();

    // crachats et cercles rouges (projectiles ennemis)
    this.spitW.begin();
    this.arrowW.begin();
    this.glowW.begin(); // phase 30 : rempli par les boules de feu, les projectiles, les lances et les météores
    this.zoneW.begin();
    this.drawJudgementRing(w); // 1.68.0 : en premier, il n'est jamais refusé
    for (let i = 0; i < w.shotCount; i++) {
      const sh = w.shots[i];
      if (sh.kind === ShotKind.Spit) {
        const sx = lerp(sh.px, sh.x, alpha),
          sz = lerp(sh.pz, sh.z, alpha);
        const sy = this.gy(sx, sz) + 0.45 + Math.sin(now * 9 + i) * 0.1;
        if (sh.boss) {
          // phase 45 : projectile de boss, orbe rouge à cœur clair et halo (même écrivain de lueurs que les boules de feu) ;
          // le crachat vert reste celui des Cracheurs
          const fl = 1 + Math.sin(now * 19 + i) * 0.1;
          this.glowW.put(
            sx,
            sy,
            sz,
            0,
            FEEL.glow.bossShot * fl,
            this.cBossShot,
            this.particles.billboardRx,
            now * 3 + i,
          );
          this.spitW.put(sx, sy, sz, now * 5, 1.15, this.cBossShotCore);
        } else this.spitW.put(sx, sy, sz, now * 5, 1, this.cSpit);
      } else if (sh.kind === ShotKind.Arrow) {
        const sx = lerp(sh.px, sh.x, alpha),
          sz = lerp(sh.pz, sh.z, alpha);
        this.arrowW.put(sx, this.gy(sx, sz) + 1.0, sz, Math.atan2(sh.vx, sh.vz), 1, this.cArrow);
      } else if (sh.kind === ShotKind.Fireball) {
        // boule de feu : arc en cloche du Sorcier vers le cercle, qui se remplit au sol pendant le vol
        const f = Math.min(1, 1 - (sh.life - alpha * STEP) / sh.t0);
        const g0 = this.gy(sh.ox, sh.oz),
          g1 = this.gy(sh.x, sh.z);
        // phase 30 : boule de feu en lueurs (cœur, halo qui vacille, trois flammèches en arrière sur l'arc)
        const G = FEEL.glow,
          brx = this.particles.billboardRx;
        for (let k = 3; k >= 0; k--) {
          const fk = Math.max(0, f - k * 0.045);
          const fx = sh.ox + (sh.x - sh.ox) * fk,
            fy = g0 + (g1 - g0) * fk + 0.9 + Math.sin(fk * Math.PI) * 4.5 + (1 - fk) * 0.6,
            fz = sh.oz + (sh.z - sh.oz) * fk;
          if (k > 0)
            this.glowW.put(fx, fy, fz, 0, G.fireHalo * (0.75 - k * 0.15), this.cFireTrail[k - 1], brx, now * 4 + k);
          else {
            const fl = 1 + Math.sin(now * 23 + i) * 0.12;
            this.glowW.put(fx, fy, fz, 0, G.fireHalo * fl, this.cFireHalo, brx, now * 3);
            this.glowW.put(fx, fy, fz, 0, G.fireCore, this.cFireCore, brx, -now * 5);
          }
        }
        this.tilt(sh.x, sh.z);
        this.zoneW.put(sh.x, g1 + 0.1, sh.z, 0, sh.r, this.cTele, this.tRx, this.tRz);
        this.zoneFillW.put(sh.x, g1 + 0.09, sh.z, 0, sh.r * f, this.cTele, this.tRx, this.tRz);
      } else if (sh.kind === ShotKind.Flame) {
        // corrompus, Traînée ardente : disque rouge qui se remplit (télégraphe), puis flaque de feu qui vacille et
        // s'éteint en rétrécissant ses 0,4 dernières secondes
        const T = CORRUPT.trail,
          gy = this.gy(sh.x, sh.z);
        this.tilt(sh.x, sh.z);
        if (!flameLit(sh.life, sh.t0)) {
          const f = Math.min(1, (sh.t0 - sh.life) / T.arm);
          this.zoneW.put(sh.x, gy + 0.1, sh.z, 0, sh.r, this.cTele, this.tRx, this.tRz);
          this.zoneFillW.put(sh.x, gy + 0.09, sh.z, 0, sh.r * f, this.cTele, this.tRx, this.tRz);
        } else {
          const end = Math.min(1, sh.life / 0.4),
            fl = 1 + Math.sin(now * 17 + i * 1.7) * 0.07;
          this.cFlameNow.copy(this.cFlame).multiplyScalar(0.9 + 0.25 * Math.sin(now * 11 + i));
          this.zoneW.put(sh.x, gy + 0.1, sh.z, now * 0.7, sh.r * end, this.cFlame, this.tRx, this.tRz);
          this.zoneFillW.put(sh.x, gy + 0.09, sh.z, 0, sh.r * end * fl, this.cFlameNow, this.tRx, this.tRz);
          // le feu qui danse : une lueur de boule de feu posée sur la flaque (écrivain des lueurs, déjà actif)
          this.glowW.put(
            sh.x,
            gy + 0.5,
            sh.z,
            0,
            FEEL.glow.fireHalo * sh.r * end * (0.8 + 0.2 * Math.sin(now * 13 + i * 2.3)),
            this.cFireHalo,
            this.particles.billboardRx,
            now * 2 + i,
          );
        }
      } else if (sh.kind === ShotKind.Ring) {
        // onde de choc du Gardien : anneau qui grandit, posé au sol (le joueur la saute)
        const r = sh.r + HAZARDS.ring.speed * alpha * STEP;
        this.tilt(sh.x, sh.z);
        this.zoneW.put(sh.x, this.gy(sh.x, sh.z) + 0.15, sh.z, 0, r, this.cTele, this.tRx, this.tRz);
      } else {
        // cercle du Colosse ou d'éruption (fixes, posés sur le sol local) : le disque se remplit
        const eruption = sh.kind === ShotKind.Eruption;
        // phase 43 : durée propre du cercle (t0 : sillage du Gardien 0,7 s, annonce de l'onde du Colosse) s'il en a une
        const f =
          1 - Math.max(0, sh.life / (eruption ? HAZARDS.eruption.telegraph : sh.t0 > 0 ? sh.t0 : BOSS.zoneTelegraph));
        const sx = sh.x,
          sz = sh.z;
        const gy = this.gy(sx, sz);
        this.tilt(sx, sz);
        this.zoneW.put(sx, gy + 0.1, sz, 0, sh.r, this.cTele, this.tRx, this.tRz);
        this.zoneFillW.put(sx, gy + 0.09, sz, 0, sh.r * f, this.cTele, this.tRx, this.tRz);
      }
    }
    this.spitW.end();
    this.arrowW.end();
    this.zoneW.end();
    this.zoneFillW.end();

    // phase 20 : arbres et lanternes KayKit autour du joueur (tri refait tous les 4 u de déplacement)
    if ((this.propsReady || this.natureReady) && (px - this.propX) ** 2 + (pz - this.propZ) ** 2 > 16)
      this.sortNearDecor(px, pz);

    // coffres : flottent et tournent ; coffre de boss plus gros. Phase 51 (retour de Jimmy : ils passaient inaperçus) :
    // apparition avec rebond, halo doré au sol ; la colonne de lumière est écrite plus bas, avec les autres
    this.chestW.begin();
    const CD = FEEL.chestDrop;
    for (let i = 0; i < w.chestCount; i++) {
      const c = w.chests[i];
      const t = Math.min(1, c.age / CD.pop);
      const pop = t < 0.6 ? (CD.over * t) / 0.6 : CD.over - ((CD.over - 1) * (t - 0.6)) / 0.4;
      const g = this.gy(c.x, c.z);
      this.chestW.put(
        c.x,
        g + 0.45 + Math.sin(now * 2.5 + i) * 0.12,
        c.z,
        now * 1.2,
        CD.scale * (c.boss ? CD.boss : 1) * pop,
        this.cChest,
      );
      this.glowW.put(
        c.x,
        g + 0.5,
        c.z,
        0,
        CD.halo * (c.boss ? CD.boss : 1) * pop * (0.9 + 0.1 * Math.sin(now * 4 + i)),
        this.cChestHalo,
        this.particles.billboardRx,
        now * 0.8,
      );
    }
    this.chestW.end();

    // coffres de carte et sanctuaires (phase 18) : colonne de lumière dorée (abordable), grise (pas assez d'or),
    // bleue (sanctuaire) ; anneau qui se remplit pendant l'ouverture ; runes qui s'allument avec la jauge du sanctuaire
    this.mapChestW.begin();
    this.holdW.begin();
    this.shrineW.begin();
    this.skullW.begin();
    this.bossTotemW.begin();
    this.shrineGlowW.begin();
    this.beamW.begin();
    for (let i = 0; i < w.chestCount; i++) {
      // phase 51 : colonne dorée, fine et courte (celles des coffres de carte : largeur 1, hauteur 1)
      const c = w.chests[i],
        bw = (c.boss ? CD.beamBoss : CD.beam) * (1 + Math.sin(now * 3 + i) * 0.08) * Math.min(1, c.age / CD.pop);
      this.beamW.put(c.x, this.gy(c.x, c.z), c.z, 0, bw, this.cBeamGold, 0, 0, CD.beamH, bw);
    }
    const affordable = canOpenMapChest(w);
    for (let i = 0; i < w.mapChests.length; i++) {
      const c = w.mapChests[i];
      if (c.open) continue;
      const g = this.gy(c.x, c.z);
      // le coffre ne se dessine qu'à moins de 50 u (au-delà, brouillard) ; la colonne de lumière, elle, se voit de loin
      const nearC = (c.x - px) ** 2 + (c.z - pz) ** 2 < POI_DRAW2 && this.seen(c.x, g, c.z, MAPCHEST.r);
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
      if ((sr.x - px) ** 2 + (sr.z - pz) ** 2 < POI_DRAW2 && this.seen(sr.x, g, sr.z, SHRINE.r)) {
        this.tilt(sr.x, sr.z);
        // runes : éteintes (gris) une fois le sanctuaire utilisé ; bleues, puis de plus en plus claires pendant la charge
        if (sr.used) this.cPoi.copy(this.cShrineOff);
        else
          this.cPoi
            .copy(this.cShrineOn)
            .lerp(this.cShrineFull, f)
            .multiplyScalar(1 + Math.sin(now * 3 + i) * 0.12);
        this.shrineW.put(sr.x, g - 0.03, sr.z, 0, SHRINE.r * 0.92, this.cPoi, this.tRx, this.tRz);
        this.cPoi.copy(this.cBeamBlue).multiplyScalar(sr.used ? 0.12 : 0.35 + f * 1.2 + Math.sin(now * 3 + i) * 0.08);
        this.shrineGlowW.put(sr.x, g + 0.12, sr.z, now * 0.4, SHRINE.r * (1 + f * 0.08), this.cPoi, this.tRx, this.tRz);
      }
      if (!sr.used) this.beamW.put(sr.x, g, sr.z, 0, 1 + f * 0.6, this.cBeamBlue, 0, 0, 1, 1 + f * 0.6);
    }
    // phase 48 : crânes de difficulté ; orbites et cornes violettes, de plus en plus claires pendant la charge, éteintes après
    for (let i = 0; i < w.skulls.length; i++) {
      const sk = w.skulls[i];
      const g = this.gy(sk.x, sk.z);
      const f = sk.on ? 0 : sk.charge / DIFFICULTY.skullCharge;
      // modèle et anneau seulement à portée de caméra (comme la stèle du totem) : un appel de dessin hors champ serait
      // payé pour rien, le budget mobile est au plafond (relecture perf) ; la colonne, elle, se voit de loin
      if ((sk.x - px) ** 2 + (sk.z - pz) ** 2 < TOTEM_VIEW2 && this.seen(sk.x, g, sk.z, DIFFICULTY.skullR)) {
        this.tilt(sk.x, sk.z);
        if (sk.on) this.cPoi.copy(this.cShrineOff);
        else
          this.cPoi
            .copy(this.cSkullOn)
            .lerp(this.cSkullFull, f)
            .multiplyScalar(1 + Math.sin(now * 4 + i) * 0.15);
        this.skullW.put(sk.x, g - 0.02, sk.z, 0, FEEL.skull.scale * (1 + f * 0.12), this.cPoi, this.tRx, this.tRz);
        this.cPoi.copy(this.cBeamSkull).multiplyScalar(sk.on ? 0.1 : 0.4 + f * 1.3 + Math.sin(now * 4 + i) * 0.1);
        this.shrineGlowW.put(
          sk.x,
          g + 0.12,
          sk.z,
          -now * 0.5,
          DIFFICULTY.skullR * (1 + f * 0.08),
          this.cPoi,
          this.tRx,
          this.tRz,
        );
      }
      if (!sk.on)
        this.beamW.put(
          sk.x,
          g,
          sk.z,
          0,
          FEEL.skull.beam + f * 0.5,
          this.cBeamSkull,
          0,
          0,
          1,
          FEEL.skull.beam + f * 0.5,
        );
    }
    // phase 48 : totems de boss ; éteints une fois activés, ou quand le portail est ouvert (plus de vague à venir)
    const closed = w.totem.state === 2 || w.endless;
    for (let i = 0; i < w.bossTotems.length; i++) {
      const bt = w.bossTotems[i];
      const g = this.gy(bt.x, bt.z);
      const off = bt.on || closed;
      const f = off ? 0 : bt.charge / BOSSTOTEM.charge;
      if (
        (bt.x - px) ** 2 + (bt.z - pz) ** 2 < TOTEM_VIEW2 &&
        this.seen(bt.x, g + FEEL.bossTotem.height / 2, bt.z, Math.max(BOSSTOTEM.r, FEEL.bossTotem.height))
      ) {
        // à portée de caméra seulement, comme les crânes et la stèle du totem (budget d'appels de dessin)
        this.tilt(bt.x, bt.z);
        if (off) this.cPoi.copy(this.cShrineOff);
        else
          this.cPoi
            .copy(this.cBossTotem)
            .lerp(this.cBossTotemFull, f)
            .multiplyScalar(1.15 + Math.sin(now * 3 + i * 2) * 0.15);
        this.bossTotemW.put(
          bt.x,
          g - 0.02,
          bt.z,
          i * 1.3,
          FEEL.bossTotem.height / TOTEM_HEIGHT,
          this.cPoi,
          this.tRx,
          this.tRz,
        );
        this.cPoi.copy(this.cBossTotem).multiplyScalar(off ? 0.1 : 0.4 + f * 1.3 + Math.sin(now * 3 + i * 2) * 0.1);
        this.shrineGlowW.put(
          bt.x,
          g + 0.12,
          bt.z,
          now * 0.5,
          BOSSTOTEM.r * (1 + f * 0.08),
          this.cPoi,
          this.tRx,
          this.tRz,
        );
      }
      if (!off) {
        const bw = FEEL.bossTotem.beam + f * 0.6;
        this.beamW.put(bt.x, g, bt.z, 0, bw, this.cBossTotem, 0, 0, 1, bw);
      }
    }
    this.drawTotem(w, px, pz, now);
    if (arena) this.drawArena(w, now);
    this.mapChestW.end();
    this.skullW.end();
    this.bossTotemW.end();
    this.holdW.end();
    this.shrineW.end();
    this.shrineGlowW.end();
    this.beamW.end();

    // échoppe du marchand : apparition en 0,4 s, anneau qui respire, lanterne qui vacille
    const MR = w.merchant;
    this.stall.visible = this.stallRing.visible = MR.active;
    if (MR.active) {
      const left = MR.until - w.stageT; // phase 37 : le marchand suit le chrono du monde
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
    // phase 35 : bonus au sol, gros cristal coloré + halo (l'icône est en DOM, PowerMarks) ; clignote avant de partir
    const PF = FEEL.power,
      G = FEEL.glow,
      brx = this.particles.billboardRx;
    for (let i = 0; i < w.powerCount; i++) {
      const pw = w.powers[i];
      if (pw.age > POWER.life - POWER.blink && Math.sin(now * PF.blinkHz * TAU) < 0) continue;
      const pop = pw.age < PF.pop ? pw.age / PF.pop : 1;
      const y = this.gy(pw.x, pw.z) + PF.lift + Math.sin(now * 2.4 + pw.x) * PF.bob;
      this.gemW.put(pw.x, y, pw.z, now * 1.6 + pw.z, PF.scale * pop, this.cPower[pw.kind]);
      this.glowW.put(
        pw.x,
        y,
        pw.z,
        0,
        G.powerHalo * pop * (0.9 + 0.1 * Math.sin(now * 5)),
        this.cPowerHalo[pw.kind],
        brx,
        now,
      );
    }
    // phase 51 : élites relevées dans la boucle des ennemis ; aura dorée autour du corps, couronne au-dessus de la tête
    const EL = FEEL.elite;
    for (let i = 0; i < this.eliteN; i++) {
      const o = i * 5,
        ex = this.eliteBuf[o],
        top = this.eliteBuf[o + 1],
        ez = this.eliteBuf[o + 2],
        er = this.eliteBuf[o + 3],
        ph = this.eliteBuf[o + 4];
      this.gemW.put(
        ex,
        top + EL.crownLift + Math.sin(now * 3 + ph) * EL.crownBob,
        ez,
        now * 2.6 + ph,
        EL.crown,
        this.cCrown,
      );
      this.glowW.put(
        ex,
        top * 0.5 + this.gy(ex, ez) * 0.5,
        ez,
        0,
        er * EL.aura * (0.92 + 0.08 * Math.sin(now * 4 + ph)),
        this.cEliteAura,
        brx,
        now * 0.7 + ph,
      );
    }
    // corrompus (décision 3) : les yeux luisent, une lueur violette à hauteur des yeux (écrivain des lueurs, déjà actif)
    // et une aura violette autour du corps (une forme en plus : une teinte seule se lit mal sur un modèle texturé)
    for (let i = 0; i < this.corruptN; i++) {
      const o = i * 7,
        ph = this.corruptBuf[o + 5];
      this.glowW.put(
        this.corruptBuf[o],
        this.corruptBuf[o + 3],
        this.corruptBuf[o + 2],
        0,
        this.corruptBuf[o + 4] * (0.9 + 0.1 * Math.sin(now * 5 + ph)),
        this.cCorruptAura,
        brx,
        now * 0.6 + ph,
      );
      this.glowW.put(
        this.corruptBuf[o],
        this.corruptBuf[o + 1],
        this.corruptBuf[o + 2],
        0,
        this.corruptBuf[o + 6] * (0.85 + 0.15 * Math.sin(now * 9 + ph)),
        this.cCorruptEye,
        brx,
        now + ph,
      );
    }
    // 1.68.0 : dans l'éclipse, un halo chaud autour du héros (la zone autour de lui reste lisible)
    if (this.eclipse > 0.05)
      this.glowW.put(px, gp + 0.4, pz, 0, FEEL.final.heroGlow * this.eclipse, this.cHeroGlow, brx, now * 0.3);
    this.gemW.end();
    if (w.powerT[Pw.Rage] > 0) {
      const hx = lerp(w.player.px, w.player.x, alpha),
        hz = lerp(w.player.pz, w.player.z, alpha);
      this.glowW.put(
        hx,
        this.gy(hx, hz) + w.player.y + 1,
        hz,
        0,
        G.rageHalo * (0.85 + 0.15 * Math.sin(now * 9)),
        this.cPowerHalo[Pw.Rage],
        brx,
        now * 2,
      );
    }

    // projectiles : orbes (+ traînées), boomerangs, mines ; Nova : orbes ×1,6
    const orbeScale = w.player.sizeMul; // tome Projectiles : projectiles plus gros
    // lot L5 : teintes et tailles des paliers visuels (w.wtier), une fois par image
    this.tintWeapons(w, now);
    const T = w.wtier,
      sO = tierScale(T.orbe),
      sB = tierScale(T.boomerang),
      sM = tierScale(T.mines);
    this.boomW.begin();
    this.mineW.begin();
    this.bombW.begin();
    // 1.69.2 : rendu allégé, au plus LITE.projCap projectiles du héros en vol dessinés (les plus proches de lui) et un
    // seul fantôme de traînée ; leurs coups (flash, son, chiffre) passent par les événements de la sim, intacts
    const cut = this.lite ? this.projCut(w, px, pz) : Infinity,
      ghostsB = this.lite ? LITE.ghosts : 3,
      ghostsO = this.lite ? LITE.ghosts : FEEL.trail.projGhosts;
    let ties = this.projTies;
    this.projDrawn = 0;
    for (let i = 0; i < w.projCount; i++) {
      const p = w.projs[i];
      if (p.kind === ProjKind.Lance) continue; // dessinée avec les lames (même modèle d'épée)
      if (cut !== Infinity && this.projD2[i] >= cut && !(this.projD2[i] === cut && ties-- > 0)) continue;
      if (p.kind === ProjKind.Orbe || p.kind === ProjKind.Boomerang) this.projDrawn++;
      const x = lerp(p.px, p.x, alpha),
        z = lerp(p.pz, p.z, alpha),
        y = p.y + this.gy(x, z); // phase 18 : y de la sim au-dessus du sol local
      const G = FEEL.glow,
        brx = this.particles.billboardRx;
      if (p.kind === ProjKind.Boomerang) {
        this.boomW.put(x, y, z, p.age * 22, sB, this.tBoom.c);
        for (let j = 1; j <= ghostsB; j++) {
          const back = Math.min(j * 0.035, p.age);
          this.glowW.put(
            x - p.vx * back,
            y,
            z - p.vz * back,
            0,
            G.boomTrail * (1 - j * 0.2) * sB,
            this.tBoomTrail[j - 1].c,
            brx,
            0,
          );
        }
        continue;
      }
      if (p.kind === ProjKind.Mine) {
        const blink = p.age < 0.3 ? 0.5 + p.age : 1 + Math.sin(now * 6 + p.x) * 0.1;
        this.bombW.put(x, y, z, now * 2, blink * 1.3 * sM, p.armed ? this.tMineArmed.c : this.tMine.c); // phase 30 : plus grosses
        if (p.armed) {
          // armée : un halo rouge qui bat sous la bombe
          const beat = 0.5 + 0.5 * Math.sin(now * 9 + p.x * 3);
          this.cMineHalo.copy(this.tMineHalo.c).multiplyScalar(0.35 + beat * 0.45);
          this.glowW.put(x, y + 0.25, z, 0, G.mineHalo * (0.85 + beat * 0.3) * sM, this.cMineHalo, brx, 0);
        } else if (T.mines > 0) {
          // lot L5 : au palier, la bombe désarmée luit aussi, à la teinte du palier
          this.cMineHalo.copy(this.tMineHalo.c).multiplyScalar(TIER_LOOK.halo);
          this.glowW.put(x, y + 0.25, z, 0, G.mineHalo * sM, this.cMineHalo, brx, 0);
        }
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
      // phase 30 : orbe = traînée dégradée (or → rouge), halo doré, cœur blanc chaud
      const k = (sc / 1.7) * sO;
      for (let j = ghostsO; j >= 1; j--) {
        const back = Math.min(j * FEEL.trail.projGhostDt, p.age);
        this.glowW.put(
          x - p.vx * back,
          y,
          z - p.vz * back,
          0,
          G.orbTrail * k * (1.1 - j * 0.18),
          this.tOrbTrail[j - 1].c,
          brx,
          0,
        );
      }
      this.glowW.put(x, y, z, 0, G.orbHalo * k, this.tOrbHalo.c, brx, 0);
      this.glowW.put(x, y, z, 0, G.orbCore * k, this.tOrbCore.c, brx, 0);
    }
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
      this.aura.rotation.set(this.tRx, now * 0.6, this.tRz); // phase 30 : les runes tournent
      this.auraDisc.rotation.set(this.tRx, 0, this.tRz);
      this.aura.scale.setScalar(r * (1 + pulse * 0.06));
      this.auraDisc.scale.setScalar(r);
      const m = this.aura.material as THREE.MeshBasicMaterial;
      m.opacity = 0.55 + pulse * 0.45; // phase 30 : runes bien visibles, éclat à chaque tick
      m.color.copy(this.tAura.c);
      // lot L5 : le disque luit davantage à chaque palier (la taille reste celle de la zone de dégâts)
      const disc = this.auraDisc.material as THREE.MeshBasicMaterial;
      disc.color.copy(this.tAura.c);
      disc.opacity = AURA_DISC * (1 + TIER_LOOK.disc * T.aura);
    } else this.aura.visible = this.auraDisc.visible = false;

    // phase 32 : coups des Lames (posés par blade()) : l'épée tourne autour de la cible en traçant un croissant de rayon
    // r (la zone de coupe), du côté opposé au héros ; le croissant s'efface derrière elle
    this.bladeW.begin();
    this.slashW.begin();
    const BL = FEEL.blade,
      sL = tierScale(T.lames); // l'épée grandit au palier, pas le croissant (la zone de coupe réelle)
    for (let i = this.bladeN - 1; i >= 0; i--) {
      const b = this.blades[i];
      b.life -= dt;
      if (b.life <= 0) {
        const last = this.blades[--this.bladeN];
        this.blades[this.bladeN] = b;
        this.blades[i] = last;
        continue;
      }
      const f = 1 - b.life / BL.life, // 0 → 1
        e = 1 - (1 - f) * (1 - f) * (1 - f), // départ vif, fin amortie
        ang = b.a - BL.sweep / 2 + BL.sweep * e,
        by = this.gy(b.x, b.z) + 0.8,
        rs = b.r * BL.swordAt;
      this.bladeW.put(
        b.x + Math.sin(ang) * rs,
        by,
        b.z + Math.cos(ang) * rs,
        ang + Math.PI / 2,
        b.r * BL.swordScale * sL,
        this.tBlade.c,
      );
      this.cSlashTmp.copy(this.tSlashBlade.c).multiplyScalar(Math.min(1, (1 - f) * BL.fade));
      this.slashW.put(b.x, by - 0.05, b.z, ang - Math.PI / 2 - SLASH_ARC, b.r * 1.04, this.cSlashTmp);
    }
    // lances (phase 28) : l'épée part dans le sens du vol, teintée cyan, 3 fantômes en arrière
    if ((w.weapons.lance ?? 0) > 0) {
      const sN = tierScale(T.lance),
        ls = 1.5 * w.player.sizeMul * sN;
      for (let i = 0; i < w.projCount; i++) {
        const p = w.projs[i];
        if (p.kind !== ProjKind.Lance) continue;
        if (cut !== Infinity && this.projD2[i] >= cut && !(this.projD2[i] === cut && ties-- > 0)) continue;
        this.projDrawn++;
        const x = lerp(p.px, p.x, alpha),
          z = lerp(p.pz, p.z, alpha),
          y = p.y + this.gy(x, z);
        const ry = Math.atan2(-p.vz, p.vx);
        this.bladeW.put(x, y, z, ry, ls, this.tLance.c);
        // phase 30 : pointe lumineuse et traînée en lueurs
        const sp = Math.sqrt(p.vx * p.vx + p.vz * p.vz) || 1,
          tx = (p.vx / sp) * 0.75 * ls,
          tz = (p.vz / sp) * 0.75 * ls,
          brx = this.particles.billboardRx;
        this.glowW.put(x + tx, y, z + tz, 0, FEEL.glow.lanceTip * sN, this.tLanceTip.c, brx, 0);
        for (let k = 1; k <= (this.lite ? LITE.ghosts : FEEL.trail.bladeGhosts); k++) {
          const back = Math.min(k * 0.03, p.age);
          this.glowW.put(
            x - p.vx * back,
            y,
            z - p.vz * back,
            0,
            FEEL.glow.lanceTip * (1 - k * 0.2) * sN,
            this.tLanceGhost[k - 1].c,
            brx,
            0,
          );
        }
      }
    }
    // 1.69.0 : faux en cours (posées par scythe()) : chacune balaie son arc autour du héros (sens croissant de l'angle,
    // celui du bord d'attaque du croissant), sa traînée en croissant la suit ; elle rétrécit et disparaît à la fin
    this.scytheW.begin();
    const SC = FEEL.scythe,
      sY = gp + py + SC.h;
    for (let i = this.scytheN - 1; i >= 0; i--) {
      const sc = this.scythes[i];
      sc.life -= dt;
      if (sc.life <= 0) {
        const last = this.scythes[--this.scytheN];
        this.scythes[this.scytheN] = sc;
        this.scythes[i] = last;
        continue;
      }
      const f = Math.min(1, (SC.life - sc.life) / SC.sweep), // 0 → 1 pendant le balayage
        e = 1 - (1 - f) * (1 - f), // départ vif, fin amortie
        ang = sc.a - sc.arc / 2 + sc.arc * e,
        out = Math.min(1, sc.life / SC.fade); // rétrécit sur ses dernières SC.fade s
      this.scytheW.put(px, sY, pz, ang, sc.r * SC.scale * out, this.tSlashFaux.c);
      // traînée : le bord d'attaque du croissant sur la lame, plus vive au cœur du balayage
      this.cSlashTmp.copy(this.tSlashFaux.c).multiplyScalar(Math.min(1, (1 - f * 0.6) * out * 1.4));
      this.slashW.put(px, sY - 0.05, pz, ang - SLASH_ARC - Math.PI / 2, sc.r * 1.02, this.cSlashTmp);
    }
    this.scytheW.end();
    this.bladeW.end();
    this.slashW.end();

    // météores annoncés (phase 28) : cercle doré au sol, le disque intérieur se resserre jusqu'à l'impact (même
    // écrivain que les anneaux des élites, commencé dans la boucle des ennemis)
    const ws = w.wstate;
    if (ws.metN > 0) {
      const mr = weaponStats(w, 'meteores').r;
      for (let i = 0; i < ws.metN; i++) {
        const mx = ws.metX[i],
          mz = ws.metZ[i];
        const f = Math.max(0, Math.min(1, ws.metLeft[i] / METEOR.delay));
        const gy = this.gy(mx, mz);
        this.tilt(mx, mz);
        this.metW.put(mx, gy + 0.14, mz, 0, mr, this.tMeteor.c, this.tRx, this.tRz);
        this.metW.put(mx, gy + 0.13, mz, 0, mr * (0.15 + 0.85 * f), this.tMeteor.c, this.tRx, this.tRz);
        // phase 30 : le météore tombe du ciel pendant l'annonce (léger biais), avec sa traînée
        const G = FEEL.glow,
          brx = this.particles.billboardRx,
          h = G.meteorFall * f,
          sT = tierScale(T.meteores); // le météore grandit au palier, pas son cercle (la zone d'impact)
        for (let k = 3; k >= 1; k--)
          this.glowW.put(
            mx - h * 0.25 - k * 0.5,
            gy + h + k * 1.4,
            mz - k * 0.25,
            0,
            G.meteorHalo * (0.7 - k * 0.14) * sT,
            this.tMeteorTrail[k - 1].c,
            brx,
            0,
          );
        this.glowW.put(mx - h * 0.25, gy + h + 0.4, mz, 0, G.meteorHalo * sT, this.tMeteorHalo.c, brx, now * 3);
        this.glowW.put(mx - h * 0.25, gy + h + 0.4, mz, 0, G.meteorCore * sT, this.tMeteorCore.c, brx, 0);
      }
    }
    // phase 47 C : flaques de Vitriol (deux anneaux verts, le second respire et s'éteint en fin de vie), esprits et
    // balises (orbes lumineux). Lus dans w.wstate, écrits par les écrivains déjà ouverts : aucun appel de dessin en plus.
    if (ws.vitN > 0 || ws.spN > 0 || ws.balN > 0) {
      const G = FEEL.glow,
        brx = this.particles.billboardRx;
      if (ws.vitN > 0) {
        const vr = weaponStats(w, 'vitriol').r;
        for (let i = 0; i < ws.vitN; i++) {
          const x = ws.vitX[i],
            z = ws.vitZ[i],
            gy = this.gy(x, z),
            fade = Math.min(1, ws.vitLeft[i]); // la dernière seconde, la flaque se referme
          this.tilt(x, z);
          this.metW.put(x, gy + 0.12, z, now * 0.4, vr * fade, this.tVitriol.c, this.tRx, this.tRz);
          this.metW.put(
            x,
            gy + 0.11,
            z,
            -now * 0.7,
            vr * fade * (0.55 + 0.1 * Math.sin(now * 5 + i)),
            this.tVitriolIn.c,
            this.tRx,
            this.tRz,
          );
          // lot L5 : au palier, un anneau intérieur qui bouillonne (lueur au cœur de la flaque, même écrivain)
          if (T.vitriol > 0)
            this.metW.put(
              x,
              gy + 0.13,
              z,
              now * 1.3,
              vr * fade * TIER_LOOK.innerRing * (1 + 0.15 * Math.sin(now * 7 + i)),
              this.tVitriol.c,
              this.tRx,
              this.tRz,
            );
        }
      }
      if ((w.weapons.esprits ?? 0) > 0) {
        const sE = tierScale(T.esprits);
        this.cTierTmp.copy(this.tSpiritHalo.c).multiplyScalar(TIER_LOOK.halo);
        for (let i = 0; i < ws.spN; i++) {
          const x = ws.spX[i],
            z = ws.spZ[i],
            y = this.gy(x, z) + G.spiritLift + Math.sin(now * 6 + i * 2) * 0.12;
          // lot L5 : au palier, un halo extérieur plus large et pâle autour de chaque esprit
          if (T.esprits > 0)
            this.glowW.put(x, y, z, 0, G.spiritHalo * TIER_LOOK.outer * sE, this.cTierTmp, brx, -now * 2 - i);
          this.glowW.put(x, y, z, 0, G.spiritHalo * sE, this.tSpiritHalo.c, brx, now * 3 + i);
          this.glowW.put(x, y, z, 0, G.spiritCore * sE, this.tSpiritCore.c, brx, 0);
        }
      }
      const sBa = tierScale(T.balise);
      for (let i = 0; i < ws.balN; i++) {
        const x = ws.balX[i],
          z = ws.balZ[i],
          gy = this.gy(x, z),
          fade = Math.min(1, ws.balLeft[i]),
          beat = 0.85 + 0.15 * Math.sin(now * 8 + i);
        this.tilt(x, z);
        this.metW.put(x, gy + 0.1, z, now, G.beaconFoot, this.tBeaconHalo.c, this.tRx, this.tRz);
        this.glowW.put(x, gy + G.beaconLift, z, 0, G.beaconHalo * beat * fade * sBa, this.tBeaconHalo.c, brx, now * 2);
        this.glowW.put(x, gy + G.beaconLift, z, 0, G.beaconCore * fade * sBa, this.tBeaconCore.c, brx, 0);
      }
    }
    this.metW.end();
    this.glowW.end();

    // lacs : la rive scintille
    for (let i = 1; i < this.lakeMeshes.length; i += 2)
      (this.lakeMeshes[i].material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(now * 1.5 + i) * 0.12;

    this.particles.update(dt);
    this.bolts.update(dt, now);

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
    // 1.69.2 (spec, décision 5 précisée le 21 nov.) : l'envoi au GPU peut attendre une file de commandes pleine ; son
    // temps est mesuré à part pour que `main.ts` ne le compte pas comme du JS
    const s0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.submitMs = performance.now() - s0;
    this.keepFrustum();
  }

  snapCamera(w: World): void {
    this.zoom = 1;
    this.stallVisit = -1; // nouveau run : l'échoppe se tourne de nouveau vers le joueur à sa première visite
    this.landT = -1;
    this.motion.reset();
    for (const g of this.ghosts) g.life = 0;
    this.marks.clear();
    this.camGy = this.gy(w.player.x, w.player.z);
    this.camPos.set(w.player.x, this.camGy + 12.5 * this.camScale, w.player.z + 10.5 * this.camScale);
    this.camLook.set(w.player.x, this.camGy + 0.8, w.player.z);
    this.frustumReady = false; // la caméra saute : le champ de la frame précédente ne vaut plus rien
  }

  private readonly scr = new THREE.Vector3();
  /**
   * Partie guidée (src/ui/tutorial.ts) : un point du monde projeté par la caméra de la dernière image, en coordonnées
   * normalisées dans `out` (x, y ∈ [-1, 1] à l'écran ; z > 1 derrière la caméra). Sans allocation.
   */
  project(x: number, y: number, z: number, out: { x: number; y: number; z: number }): void {
    this.scr.set(x, y, z).project(this.camera);
    out.x = this.scr.x;
    out.y = this.scr.y;
    out.z = this.scr.z;
  }

  info(): { calls: number; triangles: number; width: number; height: number; level: number; step: number } {
    const c = this.renderer.domElement;
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      width: c.width,
      height: c.height,
      level: this.qualityLevel,
      step: this.step,
    };
  }
}

/** Cristal à 6 pans, deux pointes : nuance cuite par face (haut clair, bas sombre, un pan en éclat). */
function crystalGeometry(r: number, h: number): THREE.BufferGeometry {
  const P: number[] = [],
    C: number[] = [];
  const N = 6;
  const tri = (a: number[], b: number[], c: number[], k: number) => {
    P.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) C.push(k, k, k);
  };
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU,
      a1 = ((i + 1) / N) * TAU;
    const p0 = [Math.cos(a0) * r, 0, Math.sin(a0) * r],
      p1 = [Math.cos(a1) * r, 0, Math.sin(a1) * r];
    // pans du haut : dégradé autour du cristal, un pan presque blanc ; pans du bas plus sombres
    const up = i === 1 ? 1.6 : 0.78 + 0.32 * Math.abs(Math.sin(a0 * 0.5 + 0.6));
    tri(p1, p0, [0, h, 0], up);
    tri(p0, p1, [0, -h * 0.6, 0], up * 0.55);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 3));
  g.computeVertexNormals();
  return g;
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
