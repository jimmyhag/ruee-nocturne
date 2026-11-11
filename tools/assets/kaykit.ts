// Phase 46 : personnages KayKit (Kay Lousberg, CC0) en proportions humanoïdes, avec les animations actuelles du jeu.
// Demande de Jimmy : le dessin de KayKit, pas son format « chibi », et les animations qu'il connaît déjà.
//  - Proportions : pas d'échelle d'os à l'exécution (elle cisaille un membre plié). Les articulations sont déplacées et
//    le maillage redéformé une fois, au repos : chaque sommet suit l'étirement local de ses os, puis les matrices de
//    liaison sont refaites. À l'exécution, c'est un squelette ordinaire.
//  - Animations : les clips du héros actuel (squelette UE à 65 os) sont repris image par image sur le squelette KayKit
//    (23 os). Le tronc et la tête reprennent la rotation de la pose par rapport au repos ; chaque segment de membre est
//    orienté comme le sien. Pas de doigts : le squelette KayKit n'en a pas.
//  - Un personnage = une primitive skinnée, un atlas 1024² (personnage en 768², objets tenus en tuiles de 256²).
import fs from 'node:fs';
import path from 'node:path';
import type { Accessor, Document, Node, NodeIO, Primitive, Skin } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';
import { KAYKIT2 } from './config';
import type { KayProp, Proportions } from './config';

// ---------- sources ----------

/** Télécharge (une fois, dans le cache hors dépôt) un fichier du miroir épinglé ; retourne son chemin local. */
export async function fetchKay(cache: string, file: string): Promise<string> {
  const local = path.join(cache, file);
  if (fs.existsSync(local)) return local;
  fs.mkdirSync(path.dirname(local), { recursive: true });
  const url = `${KAYKIT2.raw}/${file.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`KayKit : ${file} → ${res.status}`);
  fs.writeFileSync(local, new Uint8Array(await res.arrayBuffer()));
  return local;
}

/** Lit un modèle du miroir. Pour un .gltf, ses tampons et ses images sont tirés avec lui. */
export async function readKay(io: NodeIO, cache: string, file: string): Promise<Document> {
  const local = await fetchKay(cache, file);
  if (file.endsWith('.gltf')) {
    const json = JSON.parse(fs.readFileSync(local, 'utf8')) as {
      buffers?: { uri: string }[];
      images?: { uri?: string }[];
    };
    const dir = path.posix.dirname(file);
    for (const u of [...(json.buffers ?? []), ...(json.images ?? [])])
      if (u.uri && !u.uri.startsWith('data:')) await fetchKay(cache, path.posix.join(dir, decodeURIComponent(u.uri)));
  }
  return io.read(local);
}

// ---------- squelettes en objets three (calcul seul, aucun rendu) ----------

interface Rig {
  root: THREE.Object3D;
  of: Map<Node, THREE.Object3D>;
  byName: Map<string, THREE.Object3D>;
  /** pose par défaut du fichier, pour y revenir entre deux images */
  rest: Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>;
}

function rigOf(doc: Document): Rig {
  const root = new THREE.Object3D();
  const rig: Rig = { root, of: new Map(), byName: new Map(), rest: new Map() };
  const walk = (n: Node, parent: THREE.Object3D): void => {
    const o = new THREE.Object3D();
    o.name = n.getName();
    o.position.fromArray(n.getTranslation());
    o.quaternion.fromArray(n.getRotation());
    o.scale.fromArray(n.getScale());
    parent.add(o);
    rig.of.set(n, o);
    if (!rig.byName.has(o.name)) rig.byName.set(o.name, o);
    rig.rest.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
    for (const c of n.listChildren()) walk(c, o);
  };
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  for (const n of scene.listChildren()) walk(n, root);
  root.updateMatrixWorld(true);
  return rig;
}

const wq = (o: THREE.Object3D): THREE.Quaternion => o.getWorldQuaternion(new THREE.Quaternion());
const wp = (o: THREE.Object3D): THREE.Vector3 => o.getWorldPosition(new THREE.Vector3());

// ---------- proportions ----------

/** Nom d'os sans son côté : `upperarm.l` → `upperarm`. */
const base = (name: string): string => name.replace(/[._](l|r)$/i, '').toLowerCase();
const stretchOf = (P: Proportions, n: Node | null): THREE.Vector3 => {
  const s = n ? P[base(n.getName())] : undefined;
  return s ? new THREE.Vector3(...s) : new THREE.Vector3(1, 1, 1);
};
const m4 = (a: ArrayLike<number>, o = 0): THREE.Matrix4 => new THREE.Matrix4().fromArray(a as number[], o);

export interface Reproportioned {
  /** rapport de hauteur du bassin (nouveau / ancien) : les translations animées du bassin le suivent */
  hip: number;
  P: Proportions;
}

/**
 * Change les proportions de tous les maillages skinnés de `doc` (un seul squelette). `P` : étirement par os, dans le
 * repère de l'os (y le long de l'os). Les pieds restent au sol.
 */
export function reproportion(doc: Document, P: Proportions): Reproportioned {
  const skin = doc.getRoot().listSkins()[0];
  const joints = skin.listJoints();
  const ibmAcc = skin.getInverseBindMatrices()!;
  const ibm0 = ibmAcc.getArray()!;
  const IBM = joints.map((_, i) => m4(ibm0, i * 16));
  const oldW = joints.map((j) => m4(j.getWorldMatrix()));
  // repère de liaison → monde, au repos (identique pour tous les os d'un squelette bien formé)
  const G = oldW[0].clone().multiply(IBM[0]);
  const hips = joints.find((j) => base(j.getName()) === 'hips');
  const toe = joints.find((j) => /^toes/i.test(j.getName())) ?? joints.find((j) => /^foot/i.test(j.getName()));
  if (!hips || !toe) throw new Error('squelette sans bassin ou sans pied');
  const y = (n: Node): number => n.getWorldTranslation()[1];
  const toe0 = y(toe),
    hip0 = hips.getTranslation()[1];
  for (const j of joints) {
    if (j === hips) continue;
    const s = stretchOf(P, j.getParentNode()),
      t = j.getTranslation();
    j.setTranslation([t[0] * s.x, t[1] * s.y, t[2] * s.z]);
  }
  // les jambes ont changé de longueur : le bassin suit, les orteils restent où ils étaient
  const parent = hips.getParentNode();
  const inv = parent ? m4(parent.getWorldMatrix()).invert() : new THREE.Matrix4();
  const d = new THREE.Vector3(0, toe0 - y(toe), 0).applyMatrix4(inv).sub(new THREE.Vector3().applyMatrix4(inv));
  const ht = hips.getTranslation();
  hips.setTranslation([ht[0] + d.x, ht[1] + d.y, ht[2] + d.z]);

  const newW = joints.map((j) => m4(j.getWorldMatrix()));
  const sm = new THREE.Matrix4();
  // par os : nouveau monde · étirement local · ancienne inverse de liaison
  const T = joints.map((j, i) => {
    const s = stretchOf(P, j);
    return newW[i]
      .clone()
      .multiply(sm.makeScale(s.x, s.y, s.z))
      .multiply(IBM[i]);
  });
  const TN = T.map((m) => new THREE.Matrix3().getNormalMatrix(m));
  const back = G.clone().invert(),
    backN = new THREE.Matrix3().getNormalMatrix(back);
  const v = new THREE.Vector3(),
    q = new THREE.Vector3(),
    acc = new THREE.Vector3(),
    nrm = new THREE.Vector3(),
    accN = new THREE.Vector3();
  const J: number[] = [],
    W: number[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || node.getSkin() !== skin) continue;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!,
        nor = prim.getAttribute('NORMAL'),
        ja = prim.getAttribute('JOINTS_0')!,
        wa = prim.getAttribute('WEIGHTS_0')!;
      const out = new Float32Array(pos.getCount() * 3),
        outN = nor ? new Float32Array(pos.getCount() * 3) : null;
      for (let i = 0; i < pos.getCount(); i++) {
        v.fromArray(pos.getElement(i, []));
        if (nor) nrm.fromArray(nor.getElement(i, []));
        ja.getElement(i, J);
        wa.getElement(i, W);
        acc.set(0, 0, 0);
        accN.set(0, 0, 0);
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          if (!W[k]) continue;
          sum += W[k];
          acc.addScaledVector(q.copy(v).applyMatrix4(T[J[k]]), W[k]);
          if (nor) accN.addScaledVector(q.copy(nrm).applyMatrix3(TN[J[k]]), W[k]);
        }
        if (sum > 0) acc.multiplyScalar(1 / sum);
        acc.applyMatrix4(back).toArray(out, i * 3);
        if (outN)
          accN
            .applyMatrix3(backN)
            .normalize()
            .toArray(outN, i * 3);
      }
      // nouveaux accesseurs flottants (les sources peuvent être partagées ou quantifiées)
      prim.setAttribute('POSITION', floatAccessor(doc, pos, 'VEC3', out));
      if (nor && outN) prim.setAttribute('NORMAL', floatAccessor(doc, nor, 'VEC3', outN));
    }
  }
  const ibm = new Float32Array(joints.length * 16);
  joints.forEach((_, i) =>
    newW[i]
      .clone()
      .invert()
      .multiply(G)
      .toArray(ibm, i * 16),
  );
  skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(ibmAcc.getBuffer()));
  return { hip: hips.getTranslation()[1] / hip0, P };
}

function floatAccessor(doc: Document, like: Accessor, type: 'VEC2' | 'VEC3', arr: Float32Array<ArrayBuffer>): Accessor {
  return doc.createAccessor().setType(type).setArray(arr).setBuffer(like.getBuffer());
}

/** Adapte les clips propres au modèle (ennemis) : translations d'os multipliées par l'étirement du parent. */
export function adaptClips(doc: Document, rp: Reproportioned): void {
  for (const a of doc.getRoot().listAnimations())
    for (const ch of a.listChannels()) {
      const node = ch.getTargetNode(),
        out = ch.getSampler()?.getOutput();
      if (!node || !out || ch.getTargetPath() !== 'translation') continue;
      const s =
        base(node.getName()) === 'hips'
          ? new THREE.Vector3(rp.hip, rp.hip, rp.hip)
          : stretchOf(rp.P, node.getParentNode());
      const src = out.getArray()!,
        arr = new Float32Array(src.length);
      for (let i = 0; i < src.length; i += 3) {
        arr[i] = src[i] * s.x;
        arr[i + 1] = src[i + 1] * s.y;
        arr[i + 2] = src[i + 2] * s.z;
      }
      ch.getSampler()!.setOutput(doc.createAccessor().setType('VEC3').setArray(arr).setBuffer(out.getBuffer()));
    }
}

// ---------- reprise des animations (squelette UE → squelette KayKit) ----------

/** [os KayKit, os UE] : rotation de la pose par rapport au repos. */
const TORSO: [string, string][] = [
  ['hips', 'pelvis'],
  ['spine', 'spine_01'],
  ['chest', 'spine_03'],
  ['head', 'Head'],
];
/** [os KayKit, son enfant, os UE, son enfant] : le segment prend la direction du segment source. */
const LIMBS: [string, string, string, string][] = [
  ['upperarm', 'lowerarm', 'upperarm', 'lowerarm'],
  ['lowerarm', 'wrist', 'lowerarm', 'hand'],
  ['upperleg', 'lowerleg', 'thigh', 'calf'],
  ['lowerleg', 'foot', 'calf', 'foot'],
  ['foot', 'toes', 'foot', 'ball'],
];
/** Os KayKit animés par la reprise (les autres gardent leur pose de repos). */
const RETARGETED = [...TORSO.map((t) => t[0]), ...['l', 'r'].flatMap((side) => LIMBS.map((l) => `${l[0]}.${side}`))];

interface Track {
  o: THREE.Object3D;
  path: 'translation' | 'rotation' | 'scale';
  times: ArrayLike<number>;
  values: ArrayLike<number>;
  step: boolean;
}

/** Pose `tracks` à l'instant `t` (interpolation linéaire, sphérique pour les rotations). */
function evaluate(tracks: Track[], t: number, qa: THREE.Quaternion, qb: THREE.Quaternion): void {
  for (const tr of tracks) {
    const n = tr.times.length,
      size = tr.path === 'rotation' ? 4 : 3;
    let i = 0;
    while (i < n - 1 && tr.times[i + 1] <= t) i++;
    const j = Math.min(n - 1, i + 1);
    const span = tr.times[j] - tr.times[i];
    const f = tr.step || span <= 0 ? 0 : Math.min(1, Math.max(0, (t - tr.times[i]) / span));
    const a = i * size,
      b = j * size,
      v = tr.values;
    if (tr.path === 'rotation') {
      qa.set(v[a], v[a + 1], v[a + 2], v[a + 3]);
      qb.set(v[b], v[b + 1], v[b + 2], v[b + 3]);
      tr.o.quaternion.copy(qa).slerp(qb, f).normalize();
    } else {
      const dst = tr.path === 'translation' ? tr.o.position : tr.o.scale;
      dst.set(v[a] + (v[b] - v[a]) * f, v[a + 1] + (v[b + 1] - v[a + 1]) * f, v[a + 2] + (v[b + 2] - v[a + 2]) * f);
    }
  }
}

/**
 * Reprend sur `tgt` (KayKit, déjà aux bonnes proportions) les clips `names` de `src` (squelette UE, clips déjà en
 * place et à la bonne vitesse). Échantillonnage à `fps` images par seconde.
 */
export function retargetClips(src: Document, tgt: Document, names: string[], fps = 30): void {
  const S = rigOf(src),
    T = rigOf(tgt);
  const sb = (n: string): THREE.Object3D => {
    const o = S.byName.get(n);
    if (!o) throw new Error(`os source absent : ${n}`);
    return o;
  };
  const tb = (n: string): THREE.Object3D => {
    const o = T.byName.get(n);
    if (!o) throw new Error(`os KayKit absent : ${n}`);
    return o;
  };
  // repos des deux squelettes
  const sRest = new Map(TORSO.map(([, s]) => [s, wq(sb(s))]));
  const tRest = new Map(TORSO.map(([t]) => [t, wq(tb(t))]));
  const k = wp(tb('hips')).y / wp(sb('pelvis')).y;
  const hips = tb('hips');
  const setWorldQuat = (b: THREE.Object3D, q: THREE.Quaternion): void => {
    b.quaternion.copy(wq(b.parent!).invert().multiply(q));
    b.updateMatrixWorld(true);
  };
  const qa = new THREE.Quaternion(),
    qb = new THREE.Quaternion();
  const nodeOf = new Map([...T.of].map(([n, o]) => [o, n]));
  const buffer = tgt.getRoot().listBuffers()[0];
  for (const a of tgt.getRoot().listAnimations()) {
    for (const ch of a.listChannels()) ch.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
  }
  for (const name of names) {
    const anim = src
      .getRoot()
      .listAnimations()
      .find((a) => a.getName() === name);
    if (!anim) throw new Error(`clip source absent : ${name}`);
    const tracks: Track[] = [];
    let dur = 0;
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode(),
        s = ch.getSampler(),
        p = ch.getTargetPath();
      if (!node || !s || p === 'weights' || !p) continue;
      const o = S.of.get(node);
      if (!o) continue;
      if (s.getInterpolation() === 'CUBICSPLINE') throw new Error(`${name} : interpolation cubique non gérée`);
      const times = s.getInput()!.getArray()!;
      dur = Math.max(dur, times[times.length - 1]);
      tracks.push({ o, path: p, times, values: s.getOutput()!.getArray()!, step: s.getInterpolation() === 'STEP' });
    }
    const frames = Math.max(2, Math.round(dur * fps) + 1);
    const times = new Float32Array(frames);
    const rot = new Map(RETARGETED.map((b) => [b, new Float32Array(frames * 4)]));
    const pos = new Float32Array(frames * 3);
    for (let f = 0; f < frames; f++) {
      const t = (f / (frames - 1)) * dur;
      times[f] = t;
      // source : repos, puis le clip
      for (const [o, r] of S.rest) {
        o.position.copy(r.p);
        o.quaternion.copy(r.q);
        o.scale.copy(r.s);
      }
      evaluate(tracks, t, qa, qb);
      S.root.updateMatrixWorld(true);
      // cible : repos, puis la pose reprise
      for (const [o, r] of T.rest) o.quaternion.copy(r.q);
      T.root.updateMatrixWorld(true);
      // bassin : même hauteur relative
      hips.position.copy(hips.parent!.worldToLocal(wp(sb('pelvis')).multiplyScalar(k)));
      for (const [t2, s2] of TORSO) {
        T.root.updateMatrixWorld(true);
        setWorldQuat(tb(t2), wq(sb(s2)).multiply(sRest.get(s2)!.clone().invert()).multiply(tRest.get(t2)!));
      }
      for (const side of ['l', 'r'])
        for (const [b, c, sB, sC] of LIMBS) {
          T.root.updateMatrixWorld(true);
          const B = tb(`${b}.${side}`),
            C = tb(`${c}.${side}`);
          const want = wp(sb(`${sC}_${side}`))
            .sub(wp(sb(`${sB}_${side}`)))
            .normalize();
          const have = wp(C).sub(wp(B)).normalize();
          setWorldQuat(B, new THREE.Quaternion().setFromUnitVectors(have, want).multiply(wq(B)));
        }
      for (const [b, arr] of rot) {
        const q = tb(b).quaternion;
        // même hémisphère que l'image d'avant : l'interpolation ne fait pas le grand tour
        if (f > 0 && q.x * arr[f * 4 - 4] + q.y * arr[f * 4 - 3] + q.z * arr[f * 4 - 2] + q.w * arr[f * 4 - 1] < 0)
          q.set(-q.x, -q.y, -q.z, -q.w);
        q.toArray(arr, f * 4);
      }
      hips.position.toArray(pos, f * 3);
    }
    const out = tgt.createAnimation(name);
    const input = tgt.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
    const add = (o: THREE.Object3D, p: 'rotation' | 'translation', arr: Float32Array<ArrayBuffer>): void => {
      const s = tgt
        .createAnimationSampler()
        .setInput(input)
        .setOutput(
          tgt
            .createAccessor()
            .setType(p === 'rotation' ? 'VEC4' : 'VEC3')
            .setArray(arr)
            .setBuffer(buffer),
        )
        .setInterpolation('LINEAR');
      out
        .addSampler(s)
        .addChannel(tgt.createAnimationChannel().setTargetNode(nodeOf.get(o)!).setTargetPath(p).setSampler(s));
    };
    for (const [b, arr] of rot) add(tb(b), 'rotation', arr);
    add(hips, 'translation', pos);
  }
}

// ---------- fusion en une primitive, atlas, objets tenus ----------

interface Part {
  P: Float32Array;
  N: Float32Array;
  UV: Float32Array;
  J: Uint16Array;
  W: Float32Array;
  I: Uint32Array;
}

/** Zone de l'atlas (fraction) : le personnage, puis une tuile par objet tenu. */
const CHAR_ZONE = 0.75,
  TILE = 0.25,
  ATLAS = 1024;

function partOf(prim: Primitive, uv: (u: number, v: number) => [number, number]): Part {
  const pos = prim.getAttribute('POSITION')!,
    nor = prim.getAttribute('NORMAL')!,
    tex = prim.getAttribute('TEXCOORD_0')!,
    ja = prim.getAttribute('JOINTS_0')!,
    wa = prim.getAttribute('WEIGHTS_0')!;
  const n = pos.getCount();
  const part: Part = {
    P: new Float32Array(n * 3),
    N: new Float32Array(n * 3),
    UV: new Float32Array(n * 2),
    J: new Uint16Array(n * 4),
    W: new Float32Array(n * 4),
    I: new Uint32Array(prim.getIndices() ? prim.getIndices()!.getCount() : n),
  };
  // un tableau par taille : `getElement` écrit dans celui qu'on lui donne sans le raccourcir
  const e2: number[] = [],
    e3: number[] = [],
    e4: number[] = [];
  for (let i = 0; i < n; i++) {
    part.P.set(pos.getElement(i, e3), i * 3);
    part.N.set(nor.getElement(i, e3), i * 3);
    tex.getElement(i, e2);
    part.UV.set(uv(e2[0], e2[1]), i * 2);
    part.J.set(ja.getElement(i, e4), i * 4);
    part.W.set(wa.getElement(i, e4), i * 4);
  }
  const idx = prim.getIndices();
  for (let i = 0; i < part.I.length; i++) part.I[i] = idx ? idx.getScalar(i) : i;
  return part;
}

/** Objet tenu : ses sommets sont liés à 100 % à l'os porteur (`handslot.r`, `handslot.l`…), dans le repère de liaison. */
function propPart(
  prop: Document,
  spec: KayProp,
  world: THREE.Matrix4,
  joint: number,
  back: THREE.Matrix4,
  tile: number,
): Part[] {
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(...(spec.pos ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(spec.rot ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180))),
    new THREE.Vector3().setScalar(spec.scale ?? 1),
  );
  const parts: Part[] = [];
  const uv = (u: number, v: number): [number, number] => [CHAR_ZONE + u * TILE, tile * TILE + v * TILE];
  for (const node of prop.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = back.clone().multiply(world).multiply(local).multiply(m4(node.getWorldMatrix()));
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!,
        nor = prim.getAttribute('NORMAL')!,
        tex = prim.getAttribute('TEXCOORD_0');
      const n = pos.getCount(),
        idx = prim.getIndices();
      const part: Part = {
        P: new Float32Array(n * 3),
        N: new Float32Array(n * 3),
        UV: new Float32Array(n * 2),
        J: new Uint16Array(n * 4),
        W: new Float32Array(n * 4),
        I: new Uint32Array(idx ? idx.getCount() : n),
      };
      const v = new THREE.Vector3(),
        e: number[] = [],
        e2: number[] = [];
      for (let i = 0; i < n; i++) {
        v.fromArray(pos.getElement(i, e))
          .applyMatrix4(m)
          .toArray(part.P, i * 3);
        v.fromArray(nor.getElement(i, e))
          .applyMatrix3(nm)
          .normalize()
          .toArray(part.N, i * 3);
        if (tex) tex.getElement(i, e2);
        part.UV.set(tex ? uv(e2[0], e2[1]) : uv(0.5, 0.5), i * 2);
        part.J[i * 4] = joint;
        part.W[i * 4] = 1;
      }
      for (let i = 0; i < part.I.length; i++) part.I[i] = idx ? idx.getScalar(i) : i;
      parts.push(part);
    }
  }
  return parts;
}

const imageOf = (doc: Document): Uint8Array | null => {
  for (const m of doc.getRoot().listMaterials()) {
    const img = m.getBaseColorTexture()?.getImage();
    if (img) return img;
  }
  return null;
};

export interface KayBuild {
  /** texture du personnage (PNG ou JPEG) quand le fichier ne l'embarque pas */
  texture?: Uint8Array;
  props: { doc: Document; spec: KayProp }[];
  tris: number;
  /** nom du nœud skinné produit */
  name: string;
  material: string;
  atlas?: number;
}

/**
 * Fusionne les maillages skinnés de `doc` (et les objets tenus) en un nœud `name`, texture en atlas, au plus `tris`
 * triangles. Les maillages d'origine sont retirés. Retourne le nombre de triangles.
 */
export async function mergeKay(doc: Document, b: KayBuild): Promise<number> {
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const G = m4(joints[0].getWorldMatrix()).multiply(m4(ibm, 0));
  const back = G.clone().invert();
  const size = b.atlas ?? ATLAS;
  const parts: Part[] = [];
  const nodes = root.listNodes().filter((n) => n.getMesh() && n.getSkin() === skin);
  if (!nodes.length) throw new Error('aucun maillage skinné');
  for (const node of nodes)
    for (const prim of node.getMesh()!.listPrimitives())
      parts.push(partOf(prim, (u, v) => [u * CHAR_ZONE, v * CHAR_ZONE]));
  // atlas : personnage en haut à gauche, objets en tuiles dans la colonne de droite
  const charImg = b.texture ?? imageOf(doc);
  if (!charImg) throw new Error('personnage sans texture');
  const zone = Math.round(size * CHAR_ZONE),
    tilePx = Math.round(size * TILE);
  const layers: { input: Buffer; left: number; top: number }[] = [
    { input: await sharp(charImg).resize(zone, zone, { fit: 'fill' }).removeAlpha().png().toBuffer(), left: 0, top: 0 },
  ];
  for (let i = 0; i < b.props.length; i++) {
    const { doc: prop, spec } = b.props[i];
    if (i >= 4) throw new Error('plus de quatre objets tenus');
    const j = joints.findIndex((n) => n.getName() === spec.bone);
    if (j < 0) throw new Error(`os porteur absent : ${spec.bone}`);
    parts.push(...propPart(prop, spec, m4(joints[j].getWorldMatrix()), j, back, i));
    const img = imageOf(prop);
    if (img)
      layers.push({
        input: await sharp(img).resize(tilePx, tilePx, { fit: 'fill' }).removeAlpha().png().toBuffer(),
        left: zone,
        top: i * tilePx,
      });
  }
  const atlas = await sharp({ create: { width: size, height: size, channels: 3, background: '#808080' } })
    .composite(layers)
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();

  let nv = 0,
    ni = 0;
  for (const p of parts) {
    nv += p.P.length / 3;
    ni += p.I.length;
  }
  const P = new Float32Array(nv * 3),
    N = new Float32Array(nv * 3),
    UV = new Float32Array(nv * 2),
    J = new Uint16Array(nv * 4),
    W = new Float32Array(nv * 4);
  let I: Uint32Array<ArrayBuffer> = new Uint32Array(ni);
  let ov = 0,
    oi = 0;
  for (const p of parts) {
    P.set(p.P, ov * 3);
    N.set(p.N, ov * 3);
    UV.set(p.UV, ov * 2);
    J.set(p.J, ov * 4);
    W.set(p.W, ov * 4);
    for (let i = 0; i < p.I.length; i++) I[oi + i] = p.I[i] + ov;
    ov += p.P.length / 3;
    oi += p.I.length;
  }
  if (I.length / 3 > b.tris) {
    const count = Math.round(b.tris) * 3;
    let out = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, UV, 2, [1, 1], null, count, 0.05, [])[0];
    if (out.length > count * 1.15)
      out = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, UV, 2, [1, 1], null, count, 0.05, ['Permissive'])[0];
    I = new Uint32Array(out);
  }
  const buffer = root.listBuffers()[0];
  const acc = (
    type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR',
    arr: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
  ): Accessor => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
  const material =
    root.listMaterials().find((m) => m.getName() === b.material) ??
    doc
      .createMaterial(b.material)
      .setBaseColorTexture(doc.createTexture(b.material).setImage(atlas).setMimeType('image/jpeg'))
      .setRoughnessFactor(1)
      .setMetallicFactor(0);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', P))
    .setAttribute('NORMAL', acc('VEC3', N))
    .setAttribute('TEXCOORD_0', acc('VEC2', UV))
    .setAttribute('JOINTS_0', acc('VEC4', J))
    .setAttribute('WEIGHTS_0', acc('VEC4', W))
    .setIndices(acc('SCALAR', I))
    .setMaterial(material);
  const holder = nodes[0];
  const body = doc
    .createNode(b.name)
    .setMesh(doc.createMesh(b.name).addPrimitive(prim))
    .setSkin(skin as Skin);
  const parent = holder.getParentNode();
  if (parent) parent.addChild(body);
  else for (const s of root.listScenes()) if (s.listChildren().includes(holder)) s.addChild(body);
  for (const n of nodes) {
    const m = n.getMesh()!;
    n.dispose();
    m.dispose();
  }
  return Math.round(I.length / 3);
}
