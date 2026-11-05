// Phase 20 : héros en vrais modèles animés (KayKit, CC0, Kay Lousberg). Neuf personnages sur six modèles,
// distingués par leurs accessoires, leur teinte et leur échelle ; les tenues décalent la teinte de la texture palette.
// Le corps (plusieurs SkinnedMesh sur un même squelette) est fusionné en UNE SkinnedMesh + une coque de contour :
// 2 appels de rendu, plus un par accessoire. Le modèle procédural (characters.ts) reste le repli tant que rien n'est chargé.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterKey, Spell } from '../sim/types';
import { PAL } from './palette';
import type { CharacterModel } from './characters';
import { MANIFEST, loadGLTF } from './models';
import type { HeroModelKey } from './models';
import { OUTLINE, toonGradient } from './toon';

interface HeroLook {
  model: HeroModelKey;
  /** accessoires visibles (noms de maillages du glTF) */
  show: string[];
  /** décalage de teinte (degrés) par tenue ; la peau est épargnée */
  hues: [number, number];
  scale?: number;
  float?: boolean;
  /** lueur propre (Feu follet) */
  emissive?: number;
  /** halo au sol (Veilleuse, Feu follet) : rayon, opacité, couleur */
  groundGlow?: { r: number; opacity: number; color: number };
}

export const HERO_LOOKS: Record<CharacterKey, HeroLook> = {
  eclaireuse: { model: 'rogue', show: ['Knife', 'Rogue_Cape'], hues: [0, 150] },
  bucheron: { model: 'barbarian', show: ['2H_Axe', 'Barbarian_Cape'], hues: [0, 200], scale: 1.06 },
  sorciere: { model: 'mage', show: ['2H_Staff', 'Mage_Hat', 'Mage_Cape'], hues: [0, 120] },
  veilleuse: {
    model: 'knight',
    show: ['1H_Sword', 'Knight_Cape'],
    hues: [200, 300],
    groundGlow: { r: 1.1, opacity: 0.28, color: PAL.lantern },
  },
  braconnier: { model: 'rogue_hooded', show: ['1H_Crossbow', 'Rogue_Cape'], hues: [0, 90] },
  sapeur: { model: 'knight', show: ['Knight_Helmet', 'Round_Shield'], hues: [40, 260], scale: 0.96 },
  feufollet: {
    model: 'mage',
    show: ['1H_Wand'],
    hues: [25, 320],
    scale: 0.9,
    float: true,
    emissive: 0x4a1d00,
    groundGlow: { r: 0.9, opacity: 0.35, color: PAL.accent },
  },
  revenante: { model: 'skeleton_rogue', show: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'], hues: [0, 200] },
  colporteur: { model: 'barbarian', show: ['Mug', 'Barbarian_Hat', 'Barbarian_Cape'], hues: [100, 280] },
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
export const CLIP_NAMES = [
  'Idle',
  'Running_A',
  'Jump_Start',
  'Jump_Idle',
  'Jump_Land',
  'Hit_A',
  'Death_A',
  'Cheer',
  'Dodge_Forward',
  '2H_Melee_Attack_Spin',
  'Spellcast_Shoot',
  'Throw',
  'Spellcast_Long',
  'Spellcast_Raise',
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
    this.fadeTo(i, 0.08);
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

// peau (et cuir) épargnés par le décalage de teinte : orangés pas trop saturés, assez clairs
const SKIN_HUE_MIN = 0,
  SKIN_HUE_MAX = 50;
const texCache = new Map<string, THREE.Texture>();
/** Texture palette décalée de `hue` degrés (peau épargnée) ; mise en cache par (modèle, teinte). */
function tintedTexture(src: THREE.Texture, key: string, hue: number): THREE.Texture {
  if (hue === 0) return src;
  const id = `${key}:${hue}`;
  const hit = texCache.get(id);
  if (hit) return hit;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255,
      g = px[i + 1] / 255,
      b = px[i + 2] / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      l = (max + min) / 2,
      dd = max - min;
    if (dd < 0.08) continue; // gris, noirs, blancs : métal, os, yeux inchangés
    const s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
    let h = max === r ? (g - b) / dd + (g < b ? 6 : 0) : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
    h *= 60;
    if (h >= SKIN_HUE_MIN && h <= SKIN_HUE_MAX && s < 0.9 && l > 0.3) continue; // peau, cuir
    h = (h + hue) % 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
      p = 2 * l - q;
    const f = (t: number) => {
      t = (t + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    };
    px[i] = f(h / 360 + 1 / 3) * 255;
    px[i + 1] = f(h / 360) * 255;
    px[i + 2] = f(h / 360 - 1 / 3) * 255;
  }
  ctx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = src.flipY;
  t.colorSpace = src.colorSpace;
  t.magFilter = src.magFilter;
  t.minFilter = src.minFilter;
  texCache.set(id, t);
  return t;
}

/** Coque de contour : même peau, faces arrière, poussée le long de la normale dans le vertex shader. */
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
    s.vertexShader = s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n transformed += normalize(objectNormal) * ${thickness.toFixed(4)};`,
    );
  };
  m.customProgramCacheKey = () => `hero-outline-${thickness}`;
  return m;
}

/** Fusionne des SkinnedMesh d'un même squelette : attributs communs (UV nulles si absentes), sans index. */
function mergeSkinned(parts: THREE.SkinnedMesh[]): THREE.BufferGeometry {
  const geos = parts.map((s) => {
    let g = s.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    for (const n of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(n)) g.deleteAttribute(n);
    const count = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    // types homogènes (la quantification peut différer d'une partie à l'autre) : tout en flottants
    for (const n of ['position', 'normal', 'uv', 'skinWeight']) {
      const a = g.attributes[n] as THREE.BufferAttribute | undefined;
      if (!a || a.array instanceof Float32Array) continue;
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++)
        for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
      g.setAttribute(n, new THREE.BufferAttribute(f, a.itemSize));
    }
    const si = g.attributes.skinIndex as THREE.BufferAttribute;
    if (!(si.array instanceof Uint16Array)) {
      const u = new Uint16Array(si.count * 4);
      for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) u[i * 4 + k] = si.getComponent(i, k);
      g.setAttribute('skinIndex', new THREE.BufferAttribute(u, 4));
    }
    return g;
  });
  const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0];
  if (!merged) throw new Error('fusion du corps impossible');
  for (const g of geos) if (g !== merged) g.dispose();
  return merged;
}

/** Normales moyennées par position (coque de contour sans fentes sur un modèle à faces plates). */
function smoothNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position,
    nor = g.attributes.normal;
  const acc = new Map<string, [number, number, number]>();
  const key = (i: number) =>
    `${Math.round(pos.getX(i) * 1e3)},${Math.round(pos.getY(i) * 1e3)},${Math.round(pos.getZ(i) * 1e3)}`;
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
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l;
    out[i * 3 + 1] = a[1] / l;
    out[i * 3 + 2] = a[2] / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

/**
 * Construit un héros glTF (asynchrone : le fichier est chargé au besoin). `onReady` n'est appelé que si le chargement
 * réussit ; sinon la scène garde le modèle procédural.
 */
export async function buildHero(key: CharacterKey, skin = 0): Promise<HeroModel> {
  const look = HERO_LOOKS[key];
  const entry = MANIFEST.heroes[look.model];
  const gltf = await loadGLTF(entry.file);
  const root = cloneSkinned(gltf.scene) as THREE.Group;
  const disposables: { dispose(): void }[] = [];
  const show = new Set(look.show);
  // corps : toutes les SkinnedMesh fusionnées en une (même squelette, même texture)
  const skinned: THREE.SkinnedMesh[] = [];
  let srcMap: THREE.Texture | null = null;
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) skinned.push(sm);
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.map && mat.name !== 'Glow') srcMap ??= mat.map;
    }
  });
  const map = srcMap ? tintedTexture(srcMap, look.model, look.hues[Math.min(skin, 1)]) : null;
  const toon = new THREE.MeshToonMaterial({ map, gradientMap: toonGradient() });
  if (look.emissive) toon.emissive.setHex(look.emissive);
  disposables.push(toon);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff });
  disposables.push(glowMat);
  let body: THREE.SkinnedMesh | null = null;
  if (skinned.length) {
    const first = skinned[0];
    // parties lumineuses (yeux du squelette, matériau « Glow ») à part ; le reste en une seule SkinnedMesh
    const isGlow = (m: THREE.SkinnedMesh) => (m.material as THREE.Material).name === 'Glow';
    const lit = skinned.filter((m) => !isGlow(m)),
      glow = skinned.filter(isGlow);
    const merged = mergeSkinned(lit);
    disposables.push(merged);
    body = new THREE.SkinnedMesh(merged, toon);
    body.name = 'hero-body';
    body.bind(first.skeleton, first.bindMatrix);
    body.frustumCulled = false;
    first.parent!.add(body);
    // contour : normales lissées par position (les faces plates fendraient la coque et laisseraient des traits)
    const hull = smoothNormals(merged.clone());
    disposables.push(hull);
    const outline = new THREE.SkinnedMesh(hull, outlineMaterial(OUTLINE.player));
    outline.bind(first.skeleton, first.bindMatrix);
    outline.frustumCulled = false;
    disposables.push(outline.material as THREE.Material);
    first.parent!.add(outline);
    if (glow.length) {
      const gm = new THREE.SkinnedMesh(mergeSkinned(glow), glowMat);
      gm.bind(first.skeleton, first.bindMatrix);
      gm.frustumCulled = false;
      disposables.push(gm.geometry);
      first.parent!.add(gm);
    }
    for (const s of skinned) s.removeFromParent();
  }
  // accessoires : les choisis restent (matériau toon de la tenue), les autres sont cachés
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || m === body) return;
    if (!show.has(m.name)) {
      m.visible = false;
      return;
    }
    const mat = m.material as THREE.MeshStandardMaterial;
    m.material = mat.name === 'Glow' ? glowMat : toon;
    m.frustumCulled = false;
  });
  // taille et pose : pieds au sol, hauteur HEIGHT, regard vers +z (comme les modèles procéduraux)
  const box = new THREE.Box3().setFromObject(root, true);
  const h = Math.max(0.01, box.max.y - box.min.y);
  const s = (HEIGHT / h) * (look.scale ?? 1);
  root.scale.setScalar(s);
  root.position.y = -box.min.y * s + (look.float ? 0.25 : 0);
  const torso = new THREE.Group();
  torso.add(root);
  const group = new THREE.Group();
  group.add(torso);
  // silhouette de dash : le corps en pose de repos, à la même échelle
  const silhouette = (body?.geometry ?? new THREE.BoxGeometry(0.6, 1.6, 0.4)).clone();
  silhouette.deleteAttribute('skinIndex');
  silhouette.deleteAttribute('skinWeight');
  silhouette.scale(s, s, s);
  silhouette.translate(0, root.position.y, 0);
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
    },
  };
}
