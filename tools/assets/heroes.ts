// Phase 24 : construit un héros Quaternius. Le modèle modulaire (quatre parties skinnées, une couleur plate par
// matériau, aucune texture) reçoit les clips reciblés, des doigts repliés (les sources n'animent pas les doigts), des
// couleurs par sommet (COLOR_0 : tenue de base, COLOR_1 : seconde tenue) et ses objets tenus, liés rigidement à un os.
// Tout finit dans UNE primitive skinnée, simplifiée au budget : un appel de rendu (plus la coque de contour).
import { getBounds } from '@gltf-transform/core';
import type { Accessor, Document, Node, Primitive, Skin } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import { HERO_CLIPS } from './config';
import type { HEROES } from './config';
import { retargetClips } from './retarget';

type HeroSpec = (typeof HEROES)[string];

/** Matériaux jamais décalés en teinte pour la seconde tenue. */
const KEEP_HUE = /skin|eye|hair|brow|moustache|beard|metal|steel|gold|black|white|grey|teeth/i;

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexLinear(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [srgbToLinear(((v >> 16) & 255) / 255), srgbToLinear(((v >> 8) & 255) / 255), srgbToLinear((v & 255) / 255)];
}
/** Décalage de teinte d'une couleur linéaire (calcul en sRGB, comme un œil le voit). */
function hueShift(rgb: [number, number, number], deg: number): [number, number, number] {
  const c = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL((hsl.h + deg / 360) % 1, hsl.s, hsl.l, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
}

function colorAccessor(doc: Document, n: number, rgb: [number, number, number]): Accessor {
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set(rgb, i * 3);
  return doc.createAccessor().setType('VEC3').setArray(a).setBuffer(doc.getRoot().listBuffers()[0]);
}

/** Couleurs des deux tenues pour une primitive, depuis son matériau. */
function paint(doc: Document, prim: Primitive, spec: HeroSpec, prop: boolean): void {
  const mat = prim.getMaterial();
  const name = mat?.getName() ?? '';
  const base = (mat?.getBaseColorFactor() ?? [1, 1, 1, 1]).slice(0, 3) as [number, number, number];
  const c0 = !prop && spec.colors?.[name] ? hexLinear(spec.colors[name]) : base;
  const c1 =
    !prop && spec.colors2?.[name]
      ? hexLinear(spec.colors2[name])
      : prop || KEEP_HUE.test(name)
        ? c0
        : hueShift(c0, spec.hue);
  const n = prim.getAttribute('POSITION')!.getCount();
  prim.setAttribute('COLOR_0', colorAccessor(doc, n, c0));
  prim.setAttribute('COLOR_1', colorAccessor(doc, n, c1));
}

/**
 * Doigts repliés : rotation de repos de chaque phalange tournée vers la paume (les modèles sont en T, paumes vers le
 * bas). Les clips ne touchent pas les doigts : la main reste fermée, autour de l'objet tenu.
 */
function curlFingers(doc: Document): void {
  const nodes = doc.getRoot().listNodes();
  const world = (n: Node) => new THREE.Matrix4().fromArray(n.getWorldMatrix());
  for (const n of nodes) {
    const m = /^(Index|Middle|Ring|Pinky|Thumb)\d\.[LR]$/.exec(n.getName());
    if (!m) continue;
    const child = n.listChildren()[0];
    const w = world(n);
    const p = new THREE.Vector3().setFromMatrixPosition(w);
    const dir = child
      ? new THREE.Vector3().setFromMatrixPosition(world(child)).sub(p).normalize()
      : new THREE.Vector3(n.getName().endsWith('.L') ? 1 : -1, 0, 0);
    const axis = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, -1, 0));
    if (axis.lengthSq() < 1e-6) continue;
    axis.normalize();
    const angle = m[1] === 'Thumb' ? 0.5 : 1.25;
    // rotation monde → locale : q_local = W⁻¹ · R · W (rotation pure de l'os)
    const wq = new THREE.Quaternion();
    w.decompose(new THREE.Vector3(), wq, new THREE.Vector3());
    const r = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    const ql = wq.clone().invert().multiply(r).multiply(wq);
    const local = new THREE.Quaternion().fromArray(n.getRotation()).multiply(ql);
    n.setRotation(local.toArray() as [number, number, number, number]);
  }
}

/** Primitive d'objet tenu, en espace de liaison du maillage, liée à 100 % à l'os `joint` de la peau. */
function propPrimitives(
  doc: Document,
  src: Document,
  skin: Skin,
  bone: string,
  offset: THREE.Matrix4,
  unit: number,
  size: number,
  grip: number,
): Primitive[] {
  const joints = skin.listJoints();
  const j = joints.findIndex((n) => n.getName() === bone);
  if (j < 0) throw new Error(`objet tenu : os ${bone} absent`);
  const ibmArr = skin.getInverseBindMatrices()!.getArray()!;
  const bind = new THREE.Matrix4().fromArray(Array.from(ibmArr.slice(j * 16, j * 16 + 16))).invert();
  // espace de liaison du maillage : unités du nœud skinné (Quaternius : échelle 100, donc des centimètres) ; l'objet
  // et son décalage sont en mètres
  bind.multiply(new THREE.Matrix4().makeScale(unit, unit, unit)).multiply(offset);
  // objet ramené à sa taille, son point de prise à l'origine de l'os
  const b = getBounds(src.getRoot().listScenes()[0]);
  const k = size / Math.max(1e-6, b.max[1] - b.min[1]);
  bind
    .multiply(new THREE.Matrix4().makeScale(k, k, k))
    .multiply(
      new THREE.Matrix4().makeTranslation(
        -(b.min[0] + b.max[0]) / 2,
        -(b.min[1] + (b.max[1] - b.min[1]) * grip),
        -(b.min[2] + b.max[2]) / 2,
      ),
    );
  const out: Primitive[] = [];
  const buffer = doc.getRoot().listBuffers()[0];
  for (const node of src.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = bind.clone().multiply(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION')!,
        nor = p.getAttribute('NORMAL');
      const n = pos.getCount();
      const P = new Float32Array(n * 3),
        N = new Float32Array(n * 3);
      const v = new THREE.Vector3();
      const e: number[] = [];
      for (let i = 0; i < n; i++) {
        v.fromArray(pos.getElement(i, e))
          .applyMatrix4(m)
          .toArray(P, i * 3);
        if (nor)
          v.fromArray(nor.getElement(i, e))
            .applyMatrix3(nm)
            .normalize()
            .toArray(N, i * 3);
      }
      const J = new Uint16Array(n * 4),
        W = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        J[i * 4] = j;
        W[i * 4] = 1;
      }
      const idx = p.getIndices();
      const I = idx ? new Uint32Array(idx.getArray()!) : Uint32Array.from({ length: n }, (_, i) => i);
      const q = doc
        .createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(P).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(buffer))
        .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buffer))
        .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(W).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(I).setBuffer(buffer));
      const col = (p.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1]).slice(0, 3) as [number, number, number];
      q.setAttribute('COLOR_0', colorAccessor(doc, n, col));
      q.setAttribute('COLOR_1', colorAccessor(doc, n, col));
      out.push(q);
    }
  }
  return out;
}

/** Copie d'une primitive du corps aux attributs communs (positions, normales, os en Uint16, poids et couleurs flottants). */
function normalized(doc: Document, p: Primitive, remap: Int32Array | null, bindFix: THREE.Matrix4 | null): Primitive {
  const buffer = doc.getRoot().listBuffers()[0];
  const n = p.getAttribute('POSITION')!.getCount();
  const f = (sem: string, k: number) => {
    const a = p.getAttribute(sem)!;
    const out = new Float32Array(n * k);
    const e: number[] = [];
    for (let i = 0; i < n; i++) out.set(a.getElement(i, e).slice(0, k), i * k);
    return out;
  };
  const P = f('POSITION', 3),
    Nn = f('NORMAL', 3);
  if (bindFix) {
    const nm = new THREE.Matrix3().getNormalMatrix(bindFix);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromArray(P, i * 3)
        .applyMatrix4(bindFix)
        .toArray(P, i * 3);
      v.fromArray(Nn, i * 3)
        .applyMatrix3(nm)
        .normalize()
        .toArray(Nn, i * 3);
    }
  }
  const ja = p.getAttribute('JOINTS_0')!;
  const J = new Uint16Array(n * 4);
  const e: number[] = [];
  for (let i = 0; i < n; i++) {
    ja.getElement(i, e);
    for (let k = 0; k < 4; k++) J[i * 4 + k] = remap ? remap[e[k]] : e[k];
  }
  const idx = p.getIndices();
  const I = idx ? new Uint32Array(idx.getArray()!) : Uint32Array.from({ length: n }, (_, i) => i);
  const acc = (type: 'VEC3' | 'VEC4', arr: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>) =>
    doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
  return doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', P))
    .setAttribute('NORMAL', acc('VEC3', Nn))
    .setAttribute('JOINTS_0', acc('VEC4', J))
    .setAttribute('WEIGHTS_0', acc('VEC4', f('WEIGHTS_0', 4)))
    .setAttribute('COLOR_0', acc('VEC3', f('COLOR_0', 3)))
    .setAttribute('COLOR_1', acc('VEC3', f('COLOR_1', 3)))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(I).setBuffer(buffer));
}

/**
 * Une partie liée avec d'autres matrices de liaison (le sac à dos de l'aventurier : autre échelle, autre repère) :
 * v' = IBM₀⁻¹ · IBM · v la ramène dans l'espace de la peau principale. Null si les liaisons coïncident.
 */
function bindFix(main: Skin, part: Skin): THREE.Matrix4 | null {
  if (main === part) return null;
  const j = part.listJoints()[0];
  const i0 = main.listJoints().indexOf(j);
  const a0 = main.getInverseBindMatrices()!.getArray()!,
    a1 = part.getInverseBindMatrices()!.getArray()!;
  const m0 = new THREE.Matrix4().fromArray(Array.from(a0.slice(i0 * 16, i0 * 16 + 16)));
  const m1 = new THREE.Matrix4().fromArray(Array.from(a1.slice(0, 16)));
  const fix = m0.invert().multiply(m1);
  return fix.equals(new THREE.Matrix4()) ? null : fix;
}

/** Concatène des primitives aux mêmes attributs (sommets et indices mis bout à bout). */
function concat(doc: Document, prims: Primitive[]): Primitive {
  const buffer = doc.getRoot().listBuffers()[0];
  const sems = ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0', 'COLOR_0', 'COLOR_1'];
  const out = doc.createPrimitive();
  let verts = 0,
    tris = 0;
  for (const p of prims) {
    verts += p.getAttribute('POSITION')!.getCount();
    tris += p.getIndices()!.getCount();
  }
  for (const sem of sems) {
    const first = prims[0].getAttribute(sem)!;
    const k = first.getElementSize();
    const arr = sem === 'JOINTS_0' ? new Uint16Array(verts * k) : new Float32Array(verts * k);
    let o = 0;
    for (const p of prims) {
      const a = p.getAttribute(sem)!.getArray()!;
      arr.set(a as ArrayLike<number>, o);
      o += a.length;
    }
    out.setAttribute(sem, doc.createAccessor().setType(first.getType()).setArray(arr).setBuffer(buffer));
  }
  const I = new Uint32Array(tris);
  let o = 0,
    base = 0;
  for (const p of prims) {
    const a = p.getIndices()!.getArray()!;
    for (let i = 0; i < a.length; i++) I[o + i] = a[i] + base;
    o += a.length;
    base += p.getAttribute('POSITION')!.getCount();
  }
  out.setIndices(doc.createAccessor().setType('SCALAR').setArray(I).setBuffer(buffer));
  return out;
}

/**
 * Simplification à ≈ `target` triangles : soudure des sommets identiques (positions, normales, couleurs), puis
 * simplificateur meshopt pondéré par la couleur (les frontières de matériaux restent nettes).
 */
function simplify(doc: Document, p: Primitive, target: number): number {
  const idx = p.getIndices()!;
  const I = new Uint32Array(idx.getArray()!);
  if (I.length / 3 <= target) return I.length / 3;
  const pos = p.getAttribute('POSITION')!.getArray() as Float32Array;
  const col = p.getAttribute('COLOR_0')!.getArray() as Float32Array;
  const count = Math.round(target) * 3;
  let out = MeshoptSimplifier.simplifyWithAttributes(I, pos, 3, col, 3, [1, 1, 1], null, count, 0.05, [])[0];
  if (out.length > count * 1.15)
    out = MeshoptSimplifier.simplifyWithAttributes(I, pos, 3, col, 3, [1, 1, 1], null, count, 0.05, ['Permissive'])[0];
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(out)).setBuffer(idx.getBuffer()));
  return out.length / 3;
}

/**
 * Construit le héros dans `doc` (le modèle modulaire lu). `sources` : documents d'animation par clé d'ANIM_SOURCES,
 * `read` : lecture d'un fichier du miroir (objets tenus). Retourne les triangles finaux.
 */
export async function buildHero(
  doc: Document,
  spec: HeroSpec,
  sources: Record<string, Document>,
  read: (file: string) => Promise<Document>,
): Promise<number> {
  const root = doc.getRoot();
  for (const a of root.listAnimations()) a.dispose();
  retargetClips(
    doc,
    HERO_CLIPS.map((c) => ({
      doc: sources[c.src],
      from: c.from,
      to: c.to,
      names: c.names,
      speed: c.speed,
      lockHips: c.inPlace,
    })),
  );
  curlFingers(doc);
  const bodies = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
  if (!bodies.length) throw new Error('héros : aucune partie skinnée');
  const skin = bodies[0].getSkin()!;
  const joints = skin.listJoints();
  const parts: Primitive[] = [];
  for (const b of bodies) {
    const sj = b.getSkin()!.listJoints();
    const same = sj.length === joints.length && sj.every((n, i) => n === joints[i]);
    const remap = same ? null : Int32Array.from(sj.map((n) => joints.indexOf(n)));
    if (remap && remap.some((i) => i < 0)) throw new Error(`héros : os de ${b.getName()} hors de la peau principale`);
    const fix = bindFix(skin, b.getSkin()!);
    for (const p of b.getMesh()!.listPrimitives()) {
      paint(doc, p, spec, false);
      parts.push(normalized(doc, p, remap, fix));
    }
  }
  for (const pr of spec.props) {
    const src = await read(pr.file);
    const off = new THREE.Matrix4().compose(
      new THREE.Vector3(...(pr.pos ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...(pr.rot.map((d) => (d * Math.PI) / 180) as [number, number, number])),
      ),
      new THREE.Vector3(1, 1, 1),
    );
    const ws = new THREE.Vector3();
    new THREE.Matrix4()
      .fromArray(bodies[0].getWorldMatrix())
      .decompose(new THREE.Vector3(), new THREE.Quaternion(), ws);
    parts.push(...propPrimitives(doc, src, skin, pr.bone, off, 1 / ws.x, pr.size, pr.grip));
  }
  const merged = concat(doc, parts);
  const tris = simplify(doc, merged, spec.tris);
  const mat = doc.createMaterial('Hero').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  merged.setMaterial(mat);
  const mesh = doc.createMesh('Body').addPrimitive(merged);
  const holder = bodies[0];
  const node = doc.createNode('Body').setMesh(mesh).setSkin(skin);
  node.setTranslation(holder.getTranslation()).setRotation(holder.getRotation()).setScale(holder.getScale());
  const parent = holder.getParentNode();
  if (parent) parent.addChild(node);
  else for (const s of root.listScenes()) if (s.listChildren().includes(holder)) s.addChild(node);
  for (const b of bodies) {
    const m = b.getMesh()!;
    b.dispose();
    m.dispose();
  }
  return Math.round(tris);
}
