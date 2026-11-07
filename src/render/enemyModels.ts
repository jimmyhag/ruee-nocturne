// Phase 21 : ennemis animés sans squelette par instance ; phase 26 : morts-vivants Quaternius HD (même kit que les
// héros, tools/assets/config.ts : ENEMY_MODELS).
// Au chargement, chaque type est « cuit » une fois : le squelette est posé image par image (AnimationMixer), les
// sommets sont skinnés sur le CPU, et chaque pose devient une cible de morph absolue. Le rendu (scene.ts) mélange
// deux poses voisines par instance (InstancedMesh.morphTexture, src/render/pose.ts) : un appel par type, zéro mixer.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MANIFEST, loadGLTF } from './models';

export type EnemyLod = 'hi' | 'mid' | 'lo';
type Model = 'zombie' | 'zombief' | 'runner' | 'brute' | 'knight' | 'archer' | 'caster' | 'reaper';

interface EnemyLook {
  model: Model;
  /** marche ou course en boucle, puis geste éventuel (tir, frappe) : [clip, nombre de poses] */
  clips: [string, number][];
  /** hauteur du modèle (u), pieds au sol */
  height: number;
  boss?: boolean;
}

/** Index = type d'ennemi (ENEMIES de src/sim/balance.ts). Le Volant (4) est le crâne de props.glb. */
export const ENEMY_LOOKS: (EnemyLook | null)[] = [
  { model: 'zombie', clips: [['Zombie_Walk_Fwd_Loop', 8]], height: 1.75 }, // 0 Spectre
  { model: 'runner', clips: [['Sprint_Loop', 8]], height: 1.55 }, // 1 Dard
  { model: 'brute', clips: [['Walk_Loop', 8]], height: 2.4 }, // 2 Brute
  {
    model: 'knight',
    clips: [
      ['Walk_Loop', 8],
      ['Sword_Attack', 6],
    ],
    height: 3.6,
    boss: true,
  }, // 3 Gardien
  null, // 4 Volant
  {
    model: 'zombief',
    clips: [
      ['Zombie_Walk_Fwd_Loop', 6],
      ['Spell_Simple_Shoot', 4],
    ],
    height: 1.7,
  }, // 5 Cracheur
  {
    model: 'caster',
    clips: [
      ['Walk_Loop', 8],
      ['Spell_Simple_Shoot', 6],
    ],
    height: 3.9,
    boss: true,
  }, // 6 Essaim-mère
  {
    model: 'brute',
    clips: [
      ['Walk_Loop', 8],
      ['Sword_Attack', 6],
    ],
    height: 4.3,
    boss: true,
  }, // 7 Colosse
  { model: 'reaper', clips: [['Sprint_Loop', 8]], height: 3.4, boss: true }, // 8 Faucheur
  {
    model: 'archer',
    clips: [
      ['Walk_Loop', 6],
      ['Pistol_Shoot', 4],
    ],
    height: 1.8,
  }, // 9 Archer
  {
    model: 'caster',
    clips: [
      ['Walk_Loop', 6],
      ['Spell_Simple_Shoot', 4],
    ],
    height: 1.8,
  }, // 10 Sorcier
];

/** Géométries cuites d'un type : niveaux de détail (mêmes poses), texture, découpage des poses. */
export interface BakedEnemy {
  /** masse : mid (rendu net) et lo (pixel) ; boss : hi pour les deux */
  geo: { net: THREE.BufferGeometry; pixel: THREE.BufferGeometry };
  map: THREE.Texture | null;
  /** nombre de poses de la boucle, du geste (0 si aucun) ; le geste commence après la boucle */
  loop: number;
  action: number;
  boss: boolean;
}

const EYE_GLOW = 2.6; // couleur de sommet des yeux (multiplie la texture et la couleur d'instance : ils luisent)
/** Zone « yeux » de l'atlas (tools/assets/heroes.ts : SLOT.eyes, mise en page 1024) : ces sommets luisent. */
const EYES_UV = { u0: 768 / 1024, u1: 896 / 1024, v0: 512 / 1024, v1: 640 / 1024 };

/** Maillages (directs ou enfants d'un groupe multi-primitives) du nœud nommé `name` sous `root`. */
function meshesOf(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const o = root.getObjectByName(name);
  if (!o) return [];
  if ((o as THREE.Mesh).isMesh) return [o as THREE.Mesh];
  return o.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
}

/** Cuit un type à un niveau de détail : une BufferGeometry, poses en cibles de morph (positions et normales). */
function bake(gltf: GLTF, look: EnemyLook, lod: EnemyLod): { geo: THREE.BufferGeometry; map: THREE.Texture | null } {
  const holder = gltf.scene.getObjectByName(look.model);
  if (!holder) throw new Error(`enemies.glb : ${look.model} absent`);
  const parts: { mesh: THREE.Mesh; eye: boolean }[] = [];
  for (const m of meshesOf(holder, `${look.model}__body__${lod}`)) parts.push({ mesh: m, eye: false });

  if (!parts.length) throw new Error(`enemies.glb : ${look.model} ${lod} sans maillage`);
  const map = ((parts[0].mesh.material as THREE.MeshStandardMaterial).map ?? null) as THREE.Texture | null;

  let nv = 0,
    ni = 0;
  for (const p of parts) {
    nv += p.mesh.geometry.attributes.position.count;
    ni += p.mesh.geometry.index ? p.mesh.geometry.index.count : p.mesh.geometry.attributes.position.count;
  }
  const uv = new Float32Array(nv * 2);
  const col = new Float32Array(nv * 3);
  const index = new Uint32Array(ni);
  {
    let v0 = 0,
      i0 = 0;
    for (const p of parts) {
      const g = p.mesh.geometry;
      const n = g.attributes.position.count;
      const uvA = g.attributes.uv as THREE.BufferAttribute | undefined;
      for (let i = 0; i < n; i++) {
        let eye = p.eye;
        if (uvA) {
          const u = uvA.getX(i),
            t = uvA.getY(i);
          uv[(v0 + i) * 2] = u;
          uv[(v0 + i) * 2 + 1] = t;
          eye ||= u >= EYES_UV.u0 && u < EYES_UV.u1 && t >= EYES_UV.v0 && t < EYES_UV.v1;
        }
        col.fill(eye ? EYE_GLOW : 1, (v0 + i) * 3, (v0 + i) * 3 + 3);
      }
      if (g.index) for (let k = 0; k < g.index.count; k++) index[i0 + k] = v0 + g.index.getX(k);
      else for (let k = 0; k < n; k++) index[i0 + k] = v0 + k;
      v0 += n;
      i0 += g.index ? g.index.count : n;
    }
  }

  // poses : chaque clip échantillonné (boucle : n poses sur la durée ; geste : de la première à la dernière image)
  const mixer = new THREE.AnimationMixer(holder);
  const frames: { pos: Float32Array; nrm: Float32Array }[] = [];
  const v = new THREE.Vector3(),
    n4 = new THREE.Vector4(),
    n3 = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  look.clips.forEach(([name, count], ci) => {
    const clip = gltf.animations.find((a) => a.name === `${look.model}__${name}`);
    if (!clip) throw new Error(`enemies.glb : clip ${look.model}__${name} absent`);
    const action = mixer.clipAction(clip);
    for (let k = 0; k < count; k++) {
      mixer.stopAllAction();
      action.reset().play();
      const t = ci === 0 ? (clip.duration * k) / count : (clip.duration * k) / Math.max(1, count - 1);
      mixer.setTime(Math.min(t, clip.duration - 1e-4));
      holder.updateMatrixWorld(true);
      inv.copy(holder.matrixWorld).invert();
      const pos = new Float32Array(nv * 3),
        nrm = new Float32Array(nv * 3);
      let o = 0;
      for (const p of parts) {
        const m = p.mesh;
        const g = m.geometry;
        const sk = (m as THREE.SkinnedMesh).isSkinnedMesh ? (m as THREE.SkinnedMesh) : null;
        if (sk) sk.skeleton.update();
        const nA = g.attributes.normal as THREE.BufferAttribute | undefined;
        for (let i = 0; i < g.attributes.position.count; i++, o++) {
          if (sk) sk.getVertexPosition(i, v);
          else v.fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, i);
          v.applyMatrix4(m.matrixWorld).applyMatrix4(inv);
          pos[o * 3] = v.x;
          pos[o * 3 + 1] = v.y;
          pos[o * 3 + 2] = v.z;
          if (nA) {
            if (sk) {
              n4.set(nA.getX(i), nA.getY(i), nA.getZ(i), 0);
              sk.applyBoneTransform(i, n4);
              n3.set(n4.x, n4.y, n4.z);
            } else n3.fromBufferAttribute(nA, i);
            n3.transformDirection(m.matrixWorld).transformDirection(inv);
            nrm[o * 3] = n3.x;
            nrm[o * 3 + 1] = n3.y;
            nrm[o * 3 + 2] = n3.z;
          } else nrm[o * 3 + 1] = 1;
        }
      }
      frames.push({ pos, nrm });
    }
  });
  mixer.stopAllAction();
  mixer.uncacheRoot(holder);

  // pieds au sol, centré en x/z sur la première pose, hauteur visée ; regard vers +z comme les modèles procéduraux.
  // Sol = point le plus bas de toute la boucle de marche : aucune pose ne s'enfonce (1.21.4)
  const f0 = frames[0].pos;
  let floor = Infinity;
  for (let f = 0; f < look.clips[0][1]; f++)
    for (let i = 0; i < nv; i++) floor = Math.min(floor, frames[f].pos[i * 3 + 1]);
  let minY = Infinity,
    maxY = -Infinity,
    minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < nv; i++) {
    minX = Math.min(minX, f0[i * 3]);
    maxX = Math.max(maxX, f0[i * 3]);
    minY = Math.min(minY, f0[i * 3 + 1]);
    maxY = Math.max(maxY, f0[i * 3 + 1]);
    minZ = Math.min(minZ, f0[i * 3 + 2]);
    maxZ = Math.max(maxZ, f0[i * 3 + 2]);
  }
  const k = look.height / Math.max(1e-3, maxY - minY);
  const cx = (minX + maxX) / 2,
    cz = (minZ + maxZ) / 2;
  for (const f of frames)
    for (let i = 0; i < nv; i++) {
      f.pos[i * 3] = (f.pos[i * 3] - cx) * k;
      f.pos[i * 3 + 1] = (f.pos[i * 3 + 1] - floor) * k;
      f.pos[i * 3 + 2] = (f.pos[i * 3 + 2] - cz) * k;
    }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(frames[0].pos.slice(), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(frames[0].nrm.slice(), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.morphAttributes.position = frames.map((f) => new THREE.BufferAttribute(f.pos, 3));
  geo.morphAttributes.normal = frames.map((f) => new THREE.BufferAttribute(f.nrm, 3));
  geo.morphTargetsRelative = false;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geo, map };
}

let enemiesPromise: Promise<(BakedEnemy | null)[]> | null = null;

let staleFile = false;

/**
 * Charge enemies.glb et cuit tous les types (une fois ; nouvel essai après un échec, comme loadGLTF). Si le fichier
 * reçu ne contient pas les types attendus (ancien fichier servi par un cache), l'essai suivant le retélécharge.
 */
export function loadEnemyModels(onStage?: (stage: string) => void): Promise<(BakedEnemy | null)[]> {
  if (enemiesPromise) return enemiesPromise;
  onStage?.(staleFile ? 'téléchargement hors cache' : 'téléchargement');
  enemiesPromise = loadGLTF(MANIFEST.enemies.file, staleFile).then((gltf) => {
    staleFile = true; // remis à false si la cuisson aboutit
    onStage?.('cuisson des poses');
    const baked = ENEMY_LOOKS.map((look) => {
      if (!look) return null;
      const loop = look.clips[0][1],
        action = look.clips[1]?.[1] ?? 0;
      if (look.boss) {
        const hi = bake(gltf, look, 'hi');
        return { geo: { net: hi.geo, pixel: hi.geo }, map: hi.map, loop, action, boss: true };
      }
      const mid = bake(gltf, look, 'mid'),
        lo = bake(gltf, look, 'lo');
      return { geo: { net: mid.geo, pixel: lo.geo }, map: mid.map, loop, action, boss: false };
    });
    staleFile = false;
    return baked;
  });
  enemiesPromise.catch(() => (enemiesPromise = null));
  return enemiesPromise;
}

/**
 * Contour des boss : coque inversée gonflée APRÈS les morphs (le chunk de morph écraserait une poussée faite dans
 * begin_vertex), le long de la normale morphée de la pose courante.
 */
export function enemyOutlineMaterial(thickness: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color: 0x0c0f1a,
    side: THREE.BackSide,
    polygonOffset: true,
    polygonOffsetFactor: 4,
    polygonOffsetUnits: 16,
  });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace(
      '#include <morphtarget_vertex>',
      `#include <morphtarget_vertex>
      vec3 oN = vec3(normal);
      #if defined( USE_MORPHTARGETS ) && defined( USE_MORPHNORMALS )
        oN *= morphTargetBaseInfluence;
        for (int i = 0; i < MORPHTARGETS_COUNT; i++)
          if (morphTargetInfluences[i] != 0.0) oN += getMorph(gl_VertexID, i, 1).xyz * morphTargetInfluences[i];
      #endif
      transformed += normalize(oN) * ${thickness.toFixed(4)};`,
    );
  };
  m.customProgramCacheKey = () => `enemy-outline-${thickness}`;
  return m;
}
