// Phase 24 : reciblage d'animations entre squelettes Quaternius (mêmes noms d'os, poses de repos et proportions
// différentes). Les personnages modulaires (CC0) n'ont aucune animation ; on leur cuit celles du personnage cyberpunk
// et du chevalier du même auteur, en espace monde :
//   rotation monde cible(t) = Δsource(t) · Q · repos cible, avec Δsource(t) = monde source(t) · repos source⁻¹
// où Q aligne la direction de repos de l'os cible (vers son enfant) sur celle de l'os source. Les conventions d'axes
// locales (roulis des os) n'interviennent pas. Le bassin suit en translation, à l'échelle des hauteurs de hanches.
// Utilisé par tools/assets/build.ts au moment du build ; rien de ceci n'entre dans le jeu.
import type { AnimationChannel, Document, Node } from '@gltf-transform/core';
import * as THREE from 'three';

export interface ClipSource {
  /** document source (déjà lu) */
  doc: Document;
  /** nom du clip dans la source (préfixe « Armature| » ignoré) */
  from: string;
  /** nom du clip produit */
  to: string;
  /** renommage d'os source → cible ; sinon même nom */
  names?: Record<string, string>;
  /** fenêtre du clip en secondes (début, fin) ; tout le clip par défaut */
  window?: [number, number];
  /** vitesse de lecture (2 = deux fois plus court) */
  speed?: number;
  /** sur place : bassin figé à l'horizontale et jamais plus haut qu'au repos (roulade, saut : le jeu déplace le héros) */
  lockHips?: boolean;
}

const FPS = 30;
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function localMatrix(t: number[], r: number[], s: number[], out: THREE.Matrix4): THREE.Matrix4 {
  return out.compose(_p.fromArray(t), new THREE.Quaternion().fromArray(r), _s.fromArray(s));
}

/** Échantillonne un canal (LINEAR ou STEP) à l'instant `t`. */
function sample(ch: AnimationChannel, t: number, n: number): number[] {
  const s = ch.getSampler()!;
  const inp = s.getInput()!.getArray()!,
    out = s.getOutput()!.getArray()!;
  const interp = s.getInterpolation();
  if (interp === 'CUBICSPLINE') throw new Error('reciblage : interpolation CUBICSPLINE non gérée');
  const last = inp.length - 1;
  if (t <= inp[0]) return Array.from(out.slice(0, n));
  if (t >= inp[last]) return Array.from(out.slice(last * n, last * n + n));
  let i = 0;
  while (inp[i + 1] < t) i++;
  const a = Array.from(out.slice(i * n, i * n + n));
  if (interp === 'STEP') return a;
  const b = Array.from(out.slice((i + 1) * n, (i + 1) * n + n));
  const k = (t - inp[i]) / (inp[i + 1] - inp[i]);
  if (n === 4) {
    const q = new THREE.Quaternion().fromArray(a).slerp(new THREE.Quaternion().fromArray(b), k);
    return q.toArray();
  }
  return a.map((v, j) => v + (b[j] - v) * k);
}

/** Pose d'un squelette : TRS locales par nœud (repos, ou clip échantillonné), mondes calculés à la demande. */
class Pose {
  readonly local = new Map<Node, THREE.Matrix4>();
  private readonly world = new Map<Node, THREE.Matrix4>();
  constructor(nodes: Node[], channels: AnimationChannel[] | null, t: number) {
    const anim = new Map<Node, Map<string, AnimationChannel>>();
    for (const ch of channels ?? []) {
      const n = ch.getTargetNode();
      if (!n) continue;
      if (!anim.has(n)) anim.set(n, new Map());
      anim.get(n)!.set(ch.getTargetPath()!, ch);
    }
    for (const n of nodes) {
      const a = anim.get(n);
      const tr = a?.get('translation') ? sample(a.get('translation')!, t, 3) : n.getTranslation();
      const ro = a?.get('rotation') ? sample(a.get('rotation')!, t, 4) : n.getRotation();
      const sc = a?.get('scale') ? sample(a.get('scale')!, t, 3) : n.getScale();
      this.local.set(n, localMatrix(tr, ro, sc, new THREE.Matrix4()));
    }
  }
  worldOf(n: Node): THREE.Matrix4 {
    const hit = this.world.get(n);
    if (hit) return hit;
    const p = n.getParentNode();
    const m = p ? this.worldOf(p).clone().multiply(this.local.get(n)!) : this.local.get(n)!.clone();
    this.world.set(n, m);
    return m;
  }
  rot(n: Node): THREE.Quaternion {
    const q = new THREE.Quaternion();
    this.worldOf(n).decompose(_p, q, _s);
    return q;
  }
  pos(n: Node): THREE.Vector3 {
    return new THREE.Vector3().setFromMatrixPosition(this.worldOf(n));
  }
}

const strip = (s: string) => s.replace(/^.*\|/, '');

/** Os du squelette (joints de la première peau), parents avant enfants. */
function joints(doc: Document): Node[] {
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) throw new Error('reciblage : pas de peau');
  const set = new Set(skin.listJoints());
  const out: Node[] = [];
  const visit = (n: Node) => {
    if (set.has(n)) out.push(n);
    for (const c of n.listChildren()) visit(c);
  };
  for (const s of doc.getRoot().listScenes()) for (const c of s.listChildren()) visit(c);
  return out;
}

/** Enfant de référence d'un os pour sa direction : premier enfant qui est aussi un os de la liste `among`. */
function mainChild(n: Node, among: Set<string>): Node | null {
  const kids = n.listChildren().filter((c) => among.has(c.getName()));
  if (!kids.length) return null;
  // colonne : on préfère la suite du tronc (Neck, Torso…) aux épaules
  return kids.find((c) => !/Shoulder|Leg|Arm/.test(c.getName())) ?? kids[0];
}

/**
 * Ajoute à `tgt` les clips décrits, reciblés sur son squelette. Les os cibles absents de la source (doigts) gardent
 * leur repos. Retourne le nombre de clips ajoutés.
 */
export function retargetClips(tgt: Document, clips: ClipSource[]): number {
  const tJoints = joints(tgt);
  const tByName = new Map(tJoints.map((n) => [n.getName(), n]));
  const tAll = tgt.getRoot().listNodes();
  const tRest = new Pose(tAll, null, 0);
  const buffer = tgt.getRoot().listBuffers()[0] ?? tgt.createBuffer();
  const hipsT = tByName.get('Hips');
  if (!hipsT) throw new Error('reciblage : cible sans Hips');
  let added = 0;
  for (const c of clips) {
    const sRoot = c.doc.getRoot();
    const anim = sRoot.listAnimations().find((a) => strip(a.getName()) === c.from);
    if (!anim) throw new Error(`reciblage : clip ${c.from} absent de la source`);
    const sAll = sRoot.listNodes();
    const sJoints = joints(c.doc);
    const name = (s: Node) => c.names?.[s.getName()] ?? s.getName();
    const sByTarget = new Map<string, Node>();
    // Root reste au repos : sa rotation éventuelle passe déjà dans le monde des os en dessous
    for (const s of sJoints) if (tByName.has(name(s)) && name(s) !== 'Root') sByTarget.set(name(s), s);
    const hipsS = sByTarget.get('Hips');
    if (!hipsS) throw new Error('reciblage : source sans Hips');
    const sRest = new Pose(sAll, null, 0);
    // corrections Q par os : direction de repos cible → direction de repos source (vers l'enfant de référence)
    const mapped = new Set(sByTarget.keys());
    const Q = new Map<string, THREE.Quaternion>();
    for (const [k, s] of sByTarget) {
      const t = tByName.get(k)!;
      const tc = mainChild(t, mapped);
      const sc = tc ? sByTarget.get(tc.getName()) : null;
      if (!tc || !sc) continue; // os terminal (main, tête, pied) : correction de son parent, plus bas
      const dt = tRest.pos(tc).sub(tRest.pos(t)).normalize();
      const ds = sRest.pos(sc).sub(sRest.pos(s)).normalize();
      Q.set(k, new THREE.Quaternion().setFromUnitVectors(dt, ds));
    }
    // os terminaux : ils suivent la correction de leur parent (la main garde son angle avec l'avant-bras)
    for (const t of tJoints) {
      if (!sByTarget.has(t.getName()) || Q.has(t.getName())) continue;
      const p = t.getParentNode();
      Q.set(t.getName(), (p && Q.get(p.getName())?.clone()) || new THREE.Quaternion());
    }
    // échelle du bassin : hauteurs de hanches au repos (y monde, sol à 0)
    const kHips = tRest.pos(hipsT).y / Math.max(1e-6, sRest.pos(hipsS).y);
    const channels = anim.listChannels();
    const inputs = anim.listSamplers().map((s) => s.getInput()!.getArray()!);
    const srcDur = Math.max(...inputs.map((a) => a[a.length - 1]));
    const [t0, t1] = c.window ?? [0, srcDur];
    const speed = c.speed ?? 1;
    const dur = (t1 - t0) / speed;
    const frames = Math.max(2, Math.round(dur * FPS) + 1);
    const times = new Float32Array(frames);
    const rot = new Map<Node, Float32Array<ArrayBuffer>>();
    for (const t of tJoints) if (sByTarget.has(t.getName())) rot.set(t, new Float32Array(frames * 4));
    const hipsPos = new Float32Array(frames * 3);
    // os frères du bassin (cuisses des modèles modulaires, rattachées à Root) : épinglés au bassin en translation
    const hipsParent = hipsT.getParentNode()!;
    const pinned = tJoints.filter((t) => t !== hipsT && t.getParentNode() === hipsParent);
    const hipsRestInv = tRest.rot(hipsT).invert();
    const pinOffset = pinned.map((t) => tRest.pos(t).sub(tRest.pos(hipsT)).applyQuaternion(hipsRestInv));
    const pinPos = pinned.map(() => new Float32Array(frames * 3));
    const parentInv = tRest.worldOf(hipsParent).clone().invert();
    const sHips0 = sRest.pos(hipsS);
    for (let f = 0; f < frames; f++) {
      const tt = (f / (frames - 1)) * dur;
      times[f] = tt;
      const sp = new Pose(sAll, channels, t0 + tt * speed);
      // pose cible construite parents d'abord : monde de chaque os = Δ · Q · repos
      const tWorldRot = new Map<Node, THREE.Quaternion>();
      const parentRot = (n: Node): THREE.Quaternion => {
        const p = n.getParentNode();
        if (!p) return new THREE.Quaternion();
        return tWorldRot.get(p) ?? tRest.rot(p);
      };
      for (const t of tJoints) {
        const s = sByTarget.get(t.getName());
        let wr: THREE.Quaternion;
        if (!s) {
          wr = parentRot(t)
            .clone()
            .multiply(new THREE.Quaternion().setFromRotationMatrix(_m.extractRotation(tRest.local.get(t)!)));
          tWorldRot.set(t, wr);
          continue;
        }
        const delta = sp.rot(s).multiply(sRest.rot(s).invert());
        wr = delta.multiply(Q.get(t.getName())!).multiply(tRest.rot(t));
        tWorldRot.set(t, wr);
        const local = parentRot(t).clone().invert().multiply(wr);
        local.toArray(rot.get(t)!, f * 4);
      }
      // bassin : déplacement monde de la source, mis à l'échelle, ramené dans le repère du parent cible
      const d = sp.pos(hipsS).sub(sHips0).multiplyScalar(kHips);
      if (c.lockHips) d.set(0, Math.min(0, d.y), 0); // sur place : le jeu déplace le héros ; il peut s'accroupir
      const wpos = tRest.pos(hipsT).add(d);
      // parent du bassin (Root) : pas animé côté cible, son monde est celui du repos
      const lp = wpos.clone().applyMatrix4(parentInv);
      lp.toArray(hipsPos, f * 3);
      const hr = tWorldRot.get(hipsT)!;
      pinned.forEach((t, i) =>
        pinOffset[i]
          .clone()
          .applyQuaternion(hr)
          .add(wpos)
          .applyMatrix4(parentInv)
          .toArray(pinPos[i], f * 3),
      );
    }
    // continuité des quaternions (pas de saut de signe entre deux images : l'interpolation prendrait le long chemin)
    for (const arr of rot.values())
      for (let f = 1; f < frames; f++) {
        let dot = 0;
        for (let k = 0; k < 4; k++) dot += arr[f * 4 + k] * arr[(f - 1) * 4 + k];
        if (dot < 0) for (let k = 0; k < 4; k++) arr[f * 4 + k] = -arr[f * 4 + k];
      }
    const out = tgt.createAnimation(c.to);
    const input = tgt.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
    const add = (node: Node, pathName: 'rotation' | 'translation', arr: Float32Array<ArrayBuffer>) => {
      const output = tgt
        .createAccessor()
        .setType(pathName === 'rotation' ? 'VEC4' : 'VEC3')
        .setArray(arr)
        .setBuffer(buffer);
      const smp = tgt.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      out
        .addSampler(smp)
        .addChannel(tgt.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(smp));
    };
    for (const [node, arr] of rot) add(node, 'rotation', arr);
    add(hipsT, 'translation', hipsPos);
    pinned.forEach((t, i) => add(t, 'translation', pinPos[i]));
    added++;
  }
  void tAll;
  return added;
}
