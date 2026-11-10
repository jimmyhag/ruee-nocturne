// Phase 20 : chargement des modèles glTF CC0 (KayKit, Kay Lousberg) produits par tools/assets/build.ts.
// Les fichiers sont compressés en meshopt (décodeur fourni par three/examples, aucune dépendance) et ne sont pas
// précachés : chaque joueur ne charge que son héros et les objets (cache à l'usage, vite.config.ts).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import MANIFEST from './models.json';

export { MANIFEST };
export type HeroModelKey = keyof typeof MANIFEST.heroes;
export type PropKey = keyof typeof MANIFEST.props.nodes;
export type NatureKey = keyof typeof MANIFEST.nature.nodes;

let loader: GLTFLoader | null = null;
const cache = new Map<string, Promise<GLTF>>();

/**
 * Taille annoncée par le manifeste : sert de version dans l'URL (le cache CacheFirst suit un fichier réexporté).
 * Tout fichier du manifeste doit y figurer : une version manquante figerait l'ancien fichier dans le cache (1.21.3).
 */
function bytesOf(file: string): number {
  if (MANIFEST.props.file === file) return MANIFEST.props.bytes;
  if (MANIFEST.enemies.file === file) return MANIFEST.enemies.bytes;
  if (MANIFEST.nature.file === file) return MANIFEST.nature.bytes;
  if (file in MANIFEST.ground) return (MANIFEST.ground as Record<string, number>)[file];
  for (const h of Object.values(MANIFEST.heroes)) if (h.file === file) return h.bytes;
  throw new Error(`models.json : ${file} sans taille`);
}

/** URL versionnée d'un fichier de public/models. */
export function modelUrl(file: string): string {
  return `${import.meta.env.BASE_URL}models/${file}?v=${bytesOf(file)}`;
}

/**
 * Charge (une fois) un fichier de public/models. Rejeté si le réseau manque : l'appelant garde son repli procédural.
 * `fresh` : contenu incohérent avec le manifeste (vieux fichier en cache) → nouvelle URL, donc nouveau téléchargement.
 */
export function loadGLTF(file: string, fresh = false): Promise<GLTF> {
  let p = fresh ? undefined : cache.get(file);
  if (!p) {
    loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    p = loader.loadAsync(fresh ? `${modelUrl(file)}&r=${Date.now()}` : modelUrl(file));
    p.catch(() => cache.delete(file)); // nouvel essai à la prochaine demande
    cache.set(file, p);
  }
  return p;
}

/**
 * Attributs quantifiés (entiers normalisés, meshopt) → flottants : sinon applyMatrix4 réécrit dans un Int16 borné à
 * [-1, 1] et écrase le modèle. Ne garde que position, normale et UV (attributs communs aux maillages fusionnés).
 */
function toFloat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') {
      g.deleteAttribute(name);
      continue;
    }
    const a = g.attributes[name] as THREE.BufferAttribute;
    if (a.array instanceof Float32Array && !a.normalized) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
  }
  return g;
}

export interface PropGeometry {
  geometry: THREE.BufferGeometry;
  map: THREE.Texture | null;
}

let propsPromise: Promise<Record<PropKey, PropGeometry>> | null = null;

/**
 * Objets statiques : une géométrie par objet (transformations cuites, maillages fusionnés), posée au sol (y min = 0),
 * avec sa texture palette. Pour les InstancedMesh du décor (un appel de rendu par objet).
 */
export function loadProps(): Promise<Record<PropKey, PropGeometry>> {
  if (propsPromise) return propsPromise;
  propsPromise = loadGLTF(MANIFEST.props.file).then((gltf) => {
    const out = {} as Record<PropKey, PropGeometry>;
    gltf.scene.updateMatrixWorld(true);
    for (const holder of gltf.scene.children) {
      const key = holder.name as PropKey;
      if (!(key in MANIFEST.props.nodes)) continue;
      const parts: THREE.BufferGeometry[] = [];
      let map: THREE.Texture | null = null;
      holder.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const g = toFloat(m.geometry.clone());
        g.applyMatrix4(m.matrixWorld);
        parts.push(g.index ? g.toNonIndexed() : g);
        const mat = m.material as THREE.MeshStandardMaterial;
        map ??= mat.map ?? null;
      });
      if (!parts.length) continue;
      const geometry = (parts.length > 1 ? mergeGeometries(parts) : parts[0]) ?? parts[0];
      geometry.computeBoundingBox();
      geometry.translate(0, -geometry.boundingBox!.min.y, 0);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      out[key] = { geometry, map };
    }
    return out;
  });
  propsPromise.catch(() => (propsPromise = null)); // nouvel essai au prochain appel, comme loadGLTF
  return propsPromise;
}

/**
 * Phase 44 : un modèle du décor stylisé (nature.glb). Hauteur 1, pied au sol, origine au pied du tronc. `base` : couleur
 * linéaire par sommet ; `tint` : 1 pour ce que le monde teinte (feuilles, herbe), 0 pour le reste (écorce, pierre).
 */
export interface NatureGeometry {
  geometry: THREE.BufferGeometry;
  base: Float32Array;
  tint: Uint8Array;
}
export interface NatureSet {
  models: Record<NatureKey, NatureGeometry>;
  /** atlas commun (masques de feuilles, branche de sapin, fleurs) */
  map: THREE.Texture | null;
}

let naturePromise: Promise<NatureSet> | null = null;

/** Décor stylisé : une géométrie par modèle (position, normale, UV), couleurs séparées pour être teintées par monde. */
export function loadNature(): Promise<NatureSet> {
  if (naturePromise) return naturePromise;
  naturePromise = loadGLTF(MANIFEST.nature.file).then((gltf) => {
    const models = {} as Record<NatureKey, NatureGeometry>;
    let map: THREE.Texture | null = null;
    const c = new THREE.Color();
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const key = (m.name in MANIFEST.nature.nodes ? m.name : (m.parent?.name ?? '')) as NatureKey;
      if (!(key in MANIFEST.nature.nodes)) return;
      const col = m.geometry.attributes.color as THREE.BufferAttribute;
      const n = col.count;
      const base = new Float32Array(n * 3),
        tint = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        // couleurs écrites en sRGB par le pipeline : linéarisées ici, comme une texture
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i), THREE.SRGBColorSpace);
        base[i * 3] = c.r;
        base[i * 3 + 1] = c.g;
        base[i * 3 + 2] = c.b;
        tint[i] = col.getW(i) > 0.5 ? 1 : 0;
      }
      const geometry = toFloat(m.geometry.clone()); // retire aussi la couleur à 4 composantes (alpha = masque)
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      models[key] = { geometry, base, tint };
      map ??= (m.material as THREE.MeshStandardMaterial).map ?? null;
    });
    for (const k of Object.keys(MANIFEST.nature.nodes))
      if (!models[k as NatureKey]) throw new Error(`nature.glb : ${k} absent`);
    return { models, map };
  });
  naturePromise.catch(() => (naturePromise = null));
  return naturePromise;
}

/**
 * Géométrie d'un modèle du décor mise à l'échelle (hauteur `height`), teintée : les sommets marqués prennent `leaf`
 * (couleur du monde), les autres gardent leur couleur. Tampons neufs : à libérer par l'appelant (dispose).
 */
export function tintedNature(g: NatureGeometry, height: number, leaf: THREE.Color): THREE.BufferGeometry {
  const geo = g.geometry.clone().scale(height, height, height);
  const n = g.tint.length,
    col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = g.tint[i];
    col[i * 3] = g.base[i * 3] * (t ? leaf.r : 1);
    col[i * 3 + 1] = g.base[i * 3 + 1] * (t ? leaf.g : 1);
    col[i * 3 + 2] = g.base[i * 3 + 2] * (t ? leaf.b : 1);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const groundCache = new Map<string, Promise<THREE.Texture>>();
/** Texture de sol du monde `stage` (0..2), `slot` a (tapis) ou b (terre) : répétée, filtrée, en sRGB. */
export function loadGroundTexture(stage: number, slot: 'a' | 'b'): Promise<THREE.Texture> {
  const file = `ground-${stage + 1}-${slot}.jpg`;
  let p = groundCache.get(file);
  if (!p) {
    p = new THREE.TextureLoader().loadAsync(modelUrl(file)).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 2; // le sol couvre tout l'écran : filtrage léger (relecture perf)
      return t;
    });
    p.catch(() => groundCache.delete(file));
    groundCache.set(file, p);
  }
  return p;
}
