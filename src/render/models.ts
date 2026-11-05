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

let loader: GLTFLoader | null = null;
const cache = new Map<string, Promise<GLTF>>();

/** Charge (une fois) un fichier de public/models. Rejeté si le réseau manque : l'appelant garde son repli procédural. */
export function loadGLTF(file: string): Promise<GLTF> {
  let p = cache.get(file);
  if (!p) {
    loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const url = `${import.meta.env.BASE_URL}models/${file}`;
    p = loader.loadAsync(url);
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
  return (propsPromise ??= loadGLTF(MANIFEST.props.file).then((gltf) => {
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
  }));
}
