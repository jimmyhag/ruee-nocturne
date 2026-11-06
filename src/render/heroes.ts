// Phase 20 : héros en vrais modèles animés ; phase 25 : personnages Quaternius « HD » (CC0), un modèle par personnage.
// Chaque fichier contient UNE SkinnedMesh (tête, tenue, coiffure et objets tenus fusionnés au build, une texture atlas)
// + ses clips (Universal Animation Library, tools/assets/heroes.ts). Au chargement : un appel de rendu pour le corps,
// un pour la coque de contour. La seconde tenue décale la teinte de la zone « tenue » de l'atlas. Le modèle procédural
// (characters.ts) reste le repli.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterKey, Spell } from '../sim/types';
import { PAL } from './palette';
import type { CharacterModel } from './characters';
import { MANIFEST, loadGLTF } from './models';
import type { HeroModelKey } from './models';
import { OUTLINE, toonGradient } from './toon';

interface HeroLook {
  /** clé du fichier dans le manifeste (= clé du personnage) */
  model: HeroModelKey;
  /** seconde tenue : décalage de teinte (degrés) de la zone tenue de l'atlas */
  hue2: number;
  scale?: number;
  float?: boolean;
  /** lueur propre (Feu follet, Revenante) */
  emissive?: number;
  /** halo au sol (Veilleuse, Feu follet) : rayon, opacité, couleur */
  groundGlow?: { r: number; opacity: number; color: number };
}

export const HERO_LOOKS: Record<CharacterKey, HeroLook> = {
  eclaireuse: { model: 'eclaireuse', hue2: 160 },
  bucheron: { model: 'bucheron', hue2: 200, scale: 1.04 },
  sorciere: { model: 'sorciere', hue2: 120 },
  veilleuse: { model: 'veilleuse', hue2: 140, groundGlow: { r: 1.1, opacity: 0.28, color: PAL.lantern } },
  braconnier: { model: 'braconnier', hue2: 100 },
  sapeur: { model: 'sapeur', hue2: 160, scale: 0.98 },
  feufollet: {
    model: 'feufollet',
    hue2: 190,
    scale: 0.95,
    float: true,
    emissive: 0x3a1600,
    groundGlow: { r: 0.9, opacity: 0.35, color: PAL.accent },
  },
  revenante: { model: 'revenante', hue2: 90, emissive: 0x141c2a },
  colporteur: { model: 'colporteur', hue2: 150 },
};

/** Taille visée (u) : celle des modèles procéduraux, pour que la caméra et les effets restent calés. */
const HEIGHT = 1.95;

/** Animation à jouer, choisie par la scène depuis l'état de la sim. */
export const enum HeroAnim {
  Idle = 0,
  Run,
  Jump,
  Fall,
  Land,
  Hit,
  Death,
  Cheer,
  SpellDash,
  SpellSpin,
  SpellCast,
  SpellThrow,
  SpellLong,
  SpellRaise,
}
/** Clips produits par tools/assets/config.ts (HERO_CLIPS), dans l'ordre de HeroAnim. */
export const CLIP_NAMES = [
  'Idle',
  'Run',
  'Jump_Start',
  'Jump_Idle',
  'Jump_Land',
  'Hit',
  'Death',
  'Cheer',
  'Dash',
  'Spin',
  'Cast',
  'Throw',
  'Long',
  'Raise',
];
/** Clips joués une fois (puis retour à l'état de fond) ; la mort reste figée sur sa dernière image. */
const ONCE = new Set<HeroAnim>([
  HeroAnim.Jump,
  HeroAnim.Land,
  HeroAnim.Hit,
  HeroAnim.Death,
  HeroAnim.SpellDash,
  HeroAnim.SpellSpin,
  HeroAnim.SpellCast,
  HeroAnim.SpellThrow,
  HeroAnim.SpellLong,
  HeroAnim.SpellRaise,
]);
/** Animation de chaque sort (index Spell). */
export const SPELL_ANIM: HeroAnim[] = [
  HeroAnim.SpellDash, // Bond
  HeroAnim.SpellSpin, // Tourbillon
  HeroAnim.SpellCast, // Clignement
  HeroAnim.SpellCast, // Éclat
  HeroAnim.SpellThrow, // Collet
  HeroAnim.SpellRaise, // Pétard
  HeroAnim.SpellDash, // Comète
  HeroAnim.SpellLong, // Voile
  HeroAnim.SpellThrow, // Bourse
];
export function spellAnim(s: Spell): HeroAnim {
  return SPELL_ANIM[s];
}

/** Pilote du mixer : un clip de fond (idle, course, chute) et des clips ponctuels prioritaires. Zéro allocation. */
export class HeroAnimator {
  private actions: THREE.AnimationAction[] = [];
  private current = -1;
  private oneShot = -1; // clip ponctuel en cours (-1 : aucun)
  private oneShotLeft = 0;
  constructor(
    readonly mixer: THREE.AnimationMixer,
    clips: THREE.AnimationClip[],
  ) {
    for (let i = 0; i < CLIP_NAMES.length; i++) {
      const clip = clips.find((c) => c.name === CLIP_NAMES[i]) ?? clips[0];
      const a = mixer.clipAction(clip);
      if (ONCE.has(i as HeroAnim)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.push(a);
    }
    this.fadeTo(HeroAnim.Idle, 0);
  }
  private fadeTo(i: number, dur: number): void {
    if (i === this.current) return;
    const next = this.actions[i];
    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    if (this.current >= 0 && dur > 0) next.crossFadeFrom(this.actions[this.current], dur, false);
    else if (this.current >= 0) this.actions[this.current].stop();
    next.play();
    this.current = i;
  }
  /** Joue un clip ponctuel (sort, coup reçu, saut) ; il passe devant l'état de fond pendant sa durée. */
  trigger(i: HeroAnim, speed = 1): void {
    if (this.oneShot === HeroAnim.Death) return;
    this.oneShot = i;
    const a = this.actions[i];
    this.oneShotLeft = i === HeroAnim.Death ? Infinity : a.getClip().duration / speed;
    if (i === this.current)
      a.reset().play(); // même clip relancé (deux sorts de suite) : il repart du début
    else this.fadeTo(i, 0.08);
    a.setEffectiveTimeScale(speed);
  }
  /** Clip de fond voulu (course, idle, chute), vitesse de course ; avance le mixer. */
  update(dt: number, base: HeroAnim, runSpeed: number): void {
    if (this.oneShot >= 0) {
      this.oneShotLeft -= dt;
      if (this.oneShotLeft <= 0) this.oneShot = -1;
    }
    if (this.oneShot < 0) {
      this.fadeTo(base, 0.15);
      if (base === HeroAnim.Run) this.actions[HeroAnim.Run].setEffectiveTimeScale(runSpeed);
    }
    this.mixer.update(dt);
  }
  /** Remise à l'état de fond (nouvelle partie, menu). */
  reset(): void {
    this.oneShot = -1;
    this.oneShotLeft = 0;
    this.current = -1;
    this.mixer.stopAllAction();
    this.fadeTo(HeroAnim.Idle, 0);
  }
}

/** Modèle de héros : même forme que le modèle procédural (la scène les traite pareil) + son animateur. */
export interface HeroModel extends CharacterModel {
  anim: HeroAnimator;
}

/**
 * Coque de contour : même peau, faces arrière, poussée le long de la normale dans le vertex shader. La poussée suit
 * l'attribut `normal` (espace des sommets) : `objectNormal` est déjà skinnée à ce stade, et la position le sera
 * ensuite. Épaisseur en uniform : un seul programme pour les neuf héros (pas de compilation à chaque changement).
 */
function outlineMaterial(thickness: number): THREE.MeshBasicMaterial {
  // décalage de profondeur : là où la coque frôle le visage (orbites, mèches), les faces avant gagnent toujours
  const m = new THREE.MeshBasicMaterial({
    color: 0x0c0f1a,
    side: THREE.BackSide,
    polygonOffset: true,
    polygonOffsetFactor: 4,
    polygonOffsetUnits: 16,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.outlineT = { value: thickness };
    s.vertexShader = s.vertexShader
      .replace('void main() {', 'uniform float outlineT;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * outlineT;');
  };
  m.customProgramCacheKey = () => 'hero-outline-2';
  return m;
}

/** Géométrie du corps : copie propre au héros, réduite aux attributs lus par le rendu. */
function heroGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  for (const n of Object.keys(g.attributes))
    if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(n)) g.deleteAttribute(n);
  return g;
}

/** Zone « tenue » de l'atlas (tools/assets/heroes.ts : SLOT.outfit), en fractions de l'image. */
const OUTFIT_ZONE = { x: 0, y: 0, w: 0.5, h: 0.5 };
/** Dernier atlas teinté (un seul gardé : 4 Mo de canvas, libéré de la carte graphique quand le héros l'est). */
let tinted: { key: string; tex: THREE.Texture } | null = null;
/**
 * Atlas de la seconde tenue : teinte de la zone tenue décalée de `hue` degrés, une fois par personnage. Les couleurs
 * peu saturées (métal, lin, noirs) bougent peu : le décalage suit la chroma, avec une transition douce (pas de franges
 * sur le JPEG). Le reste de l'atlas (peau, tête, cheveux) ne change pas. Calcul HSL direct sur les octets sRGB.
 */
function outfitTexture(src: THREE.Texture, key: string, hue: number): THREE.Texture {
  if (tinted?.key === key) return tinted.tex;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const x = Math.round(OUTFIT_ZONE.x * c.width),
    y = Math.round(OUTFIT_ZONE.y * c.height),
    w = Math.round(OUTFIT_ZONE.w * c.width),
    h = Math.round(OUTFIT_ZONE.h * c.height);
  const d = ctx.getImageData(x, y, w, h);
  const px = d.data;
  const dh = hue / 360;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255,
      g = px[i + 1] / 255,
      b = px[i + 2] / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      chroma = max - min;
    const k = Math.min(1, Math.max(0, (chroma - 0.04) / 0.06)); // 0 sous 0,04 de chroma, 1 au-delà de 0,10
    if (k <= 0) continue;
    const l = (max + min) / 2;
    const s = chroma / (1 - Math.abs(2 * l - 1));
    let h = max === r ? (g - b) / chroma + (g < b ? 6 : 0) : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
    h = h / 6 + dh * k;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
      p2 = 2 * l - q;
    for (let c = 0; c < 3; c++) {
      let t = h + (1 - c) / 3;
      t -= Math.floor(t);
      const v = t < 1 / 6 ? p2 + (q - p2) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p2 + (q - p2) * (2 / 3 - t) * 6 : p2;
      px[i + c] = v * 255;
    }
  }
  ctx.putImageData(d, x, y);
  const t = new THREE.CanvasTexture(c);
  t.flipY = src.flipY;
  t.colorSpace = src.colorSpace;
  t.magFilter = src.magFilter;
  t.minFilter = src.minFilter;
  t.anisotropy = src.anisotropy;
  t.wrapS = src.wrapS;
  t.wrapT = src.wrapT;
  tinted?.tex.dispose();
  tinted = { key, tex: t };
  return t;
}

/** Normales moyennées par position (coque de contour sans fentes sur un modèle à faces plates). */
function smoothNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position,
    nor = g.attributes.normal;
  const acc = new Map<string, [number, number, number]>();
  g.computeBoundingBox();
  const size = g.boundingBox!.getSize(new THREE.Vector3());
  const q = 1e4 / Math.max(1e-9, size.x, size.y, size.z); // pas de soudure : 1/10 000 de la taille du modèle
  const key = (i: number) =>
    `${Math.round(pos.getX(i) * q)},${Math.round(pos.getY(i) * q)},${Math.round(pos.getZ(i) * q)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const a = acc.get(k) ?? [0, 0, 0];
    a[0] += nor.getX(i);
    a[1] += nor.getY(i);
    a[2] += nor.getZ(i);
    acc.set(k, a);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(key(i))!;
    const l = Math.hypot(a[0], a[1], a[2]);
    if (l < 1e-6) {
      // normales opposées qui s'annulent : on garde celle du sommet (jamais de normale nulle, NaN sur certains GPU)
      out[i * 3] = nor.getX(i);
      out[i * 3 + 1] = nor.getY(i);
      out[i * 3 + 2] = nor.getZ(i);
      continue;
    }
    out[i * 3] = a[0] / l;
    out[i * 3 + 1] = a[1] / l;
    out[i * 3 + 2] = a[2] / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

/**
 * Construit un héros glTF (asynchrone : le fichier est chargé au besoin). Rejeté si le chargement échoue : la scène
 * garde alors le modèle procédural.
 */
export async function buildHero(key: CharacterKey, skin = 0): Promise<HeroModel> {
  const look = HERO_LOOKS[key];
  const entry = MANIFEST.heroes[look.model];
  const gltf = await loadGLTF(entry.file);
  const root = cloneSkinned(gltf.scene) as THREE.Group;
  const disposables: { dispose(): void }[] = [];
  let src: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) src ??= o as THREE.SkinnedMesh;
  });
  if (!src) throw new Error(`héros ${key} : pas de corps skinné`);
  const first: THREE.SkinnedMesh = src;
  const atlas = (first.material as THREE.MeshStandardMaterial).map;
  const map = atlas && skin > 0 ? outfitTexture(atlas, look.model, look.hue2) : atlas;
  const toon = new THREE.MeshToonMaterial({ map, gradientMap: toonGradient() });
  if (look.emissive) toon.emissive.setHex(look.emissive);
  disposables.push(toon);
  const geo = heroGeometry(first.geometry);
  disposables.push(geo);
  const body = new THREE.SkinnedMesh(geo, toon);
  body.name = 'hero-body';
  body.bind(first.skeleton, first.bindMatrix);
  body.frustumCulled = false;
  first.parent!.add(body);
  first.removeFromParent();
  disposables.push(first.skeleton); // squelette cloné : sa texture d'os (boneTexture) est propre à ce héros
  // taille et pose : pieds au sol, hauteur HEIGHT, regard vers +z (comme les modèles procéduraux)
  const box = new THREE.Box3().setFromObject(root, true);
  const h = Math.max(0.01, box.max.y - box.min.y);
  const s = (HEIGHT / h) * (look.scale ?? 1);
  root.scale.setScalar(s);
  root.position.y = -box.min.y * s + (look.float ? 0.25 : 0);
  // contour : normales lissées par position (les faces plates fendraient la coque). La poussée se fait dans l'espace
  // des sommets (avant le skinning) : épaisseur voulue ramenée à cette échelle (diagonales de repos monde / sommets).
  geo.computeBoundingBox();
  const k =
    (box.getSize(new THREE.Vector3()).length() * s) /
    Math.max(1e-9, geo.boundingBox!.getSize(new THREE.Vector3()).length());
  const hull = smoothNormals(geo.clone());
  hull.deleteAttribute('uv'); // la coque est unie
  disposables.push(hull);
  const outline = new THREE.SkinnedMesh(hull, outlineMaterial(OUTLINE.player / k));
  outline.bind(first.skeleton, first.bindMatrix);
  outline.frustumCulled = false;
  disposables.push(outline.material as THREE.Material);
  body.parent!.add(outline);
  const torso = new THREE.Group();
  torso.add(root);
  const group = new THREE.Group();
  group.add(torso);
  // silhouette de dash : la scène garde celle du modèle procédural (quelques centaines de triangles, contre ≈ 9 k pour
  // le corps glTF ; 6 fantômes à la fois pendant le Voile)
  const silhouette = new THREE.BufferGeometry();
  disposables.push(silhouette);
  let glowDisc: THREE.Mesh | null = null;
  if (look.groundGlow) {
    const gg = look.groundGlow;
    const geo = new THREE.CircleGeometry(gg.r, 20).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: gg.color,
      transparent: true,
      opacity: gg.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    glowDisc = new THREE.Mesh(geo, mat);
    glowDisc.position.y = 0.07;
    disposables.push(geo, mat);
  }
  const mixer = new THREE.AnimationMixer(root);
  const anim = new HeroAnimator(mixer, gltf.animations);
  return {
    group,
    torso,
    legL: null,
    legR: null,
    glowDisc,
    float: !!look.float,
    silhouette,
    anim,
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      for (const d of disposables) d.dispose();
      // atlas : copie GPU libérée (l'image reste dans le cache glTF, renvoyée au prochain usage)
      map?.dispose();
    },
  };
}
