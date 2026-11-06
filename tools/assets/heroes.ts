// Phase 25 : construit un héros Quaternius « HD » dans le document de sa tenue (squelette maître, 65 os) :
// - tête, yeux et sourcils pris au personnage de base (triangles liés à Head / neck_01), coiffures, objets tenus ;
// - toutes les parties ramenées sur le squelette de la tenue (liaison recalculée sommet par sommet, par nom d'os) ;
// - textures réduites et teintées dans UN atlas JPEG 1024² (tenue, peau, tête, cheveux, yeux, pastilles des objets) ;
// - une seule primitive skinnée simplifiée au budget : un appel de rendu (plus la coque de contour) ;
// - clips des Universal Animation Library copiés par nom d'os (même squelette : aucun reciblage), bassin à l'échelle.
import type { Document, Node, Primitive, Skin, Texture } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';
import { HERO_CLIPS } from './config';
import type { HeroSpec, Tint } from './config';

const ATLAS = 1024;
type Rect = [x: number, y: number, w: number, h: number];
/** Zones de l'atlas (pixels, origine en haut à gauche comme les UV glTF). */
const SLOT: Record<'outfit' | 'skin' | 'head' | 'hair1' | 'hair2' | 'eyes', Rect> = {
  outfit: [0, 0, 512, 512],
  skin: [512, 0, 512, 512],
  head: [0, 512, 512, 512],
  hair1: [512, 512, 256, 256],
  hair2: [512, 768, 256, 256],
  eyes: [768, 512, 128, 128],
};
/** Pastilles de couleur unie (matériaux sans texture des objets tenus) : 16 px, dans [768, 1024) × [656, 1024). */
const SWATCH = { x: 768, y: 656, size: 16, cols: 16 };

// ---------- couleurs ----------

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2,
    d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
    p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
/** Teinte d'une image RGBA (sRGB, en place) : décalage de teinte, saturation et luminosité multipliées. */
function tint(px: Buffer, t: Tint | undefined): void {
  if (!t) return;
  const dh = (t.hue ?? 0) / 360,
    ks = t.sat ?? 1,
    kl = t.light ?? 1;
  for (let i = 0; i < px.length; i += 4) {
    const [h, s, l] = rgbToHsl(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    const [r, g, b] = hslToRgb(h + dh, Math.min(1, s * ks), Math.min(1, l * kl));
    px[i] = r * 255;
    px[i + 1] = g * 255;
    px[i + 2] = b * 255;
  }
}
/** Recoloration d'une texture de cheveux : luminance gardée, couleur imposée (blanc et roux compris). */
function colorize(px: Buffer, hex: string | undefined): void {
  if (!hex) return;
  const v = parseInt(hex.slice(1), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  let mean = 0;
  for (let i = 0; i < px.length; i += 4) mean += (px[i] + px[i + 1] + px[i + 2]) / 3;
  mean = Math.max(1, mean / (px.length / 4));
  for (let i = 0; i < px.length; i += 4) {
    const k = (px[i] + px[i + 1] + px[i + 2]) / 3 / mean;
    for (let j = 0; j < 3; j++) px[i + j] = Math.min(255, c[j] * k);
  }
}

/** Atlas : zones en unités de la mise en page 1024 (les UV n'en dépendent pas), image à `size` pixels de côté. */
class Atlas {
  private layers: { input: Buffer; left: number; top: number; raw: { width: number; height: number; channels: 4 } }[] =
    [];
  private swatches = new Map<string, Rect>();
  constructor(readonly size = ATLAS) {}
  private px = (v: number) => Math.round((v * this.size) / ATLAS);
  async put(slot: keyof typeof SLOT, image: Uint8Array, recolor: (px: Buffer) => void): Promise<void> {
    const [x, y, w, h] = SLOT[slot].map(this.px);
    const { data } = await sharp(image)
      .resize(w, h, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    recolor(data);
    this.layers.push({ input: data, left: x, top: y, raw: { width: w, height: h, channels: 4 } });
  }
  /** Pastille d'une couleur unie (linéaire) ; même couleur, même pastille. */
  swatch(rgb: number[]): Rect {
    const srgb = rgb
      .slice(0, 3)
      .map((c) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)));
    const key = srgb.join(',');
    const hit = this.swatches.get(key);
    if (hit) return hit;
    // pastilles de 16 px réels quelle que soit la taille de l'atlas (les mipmaps ne mélangent pas les voisines)
    const unit = (SWATCH.size * ATLAS) / this.size,
      cols = Math.floor((ATLAS - SWATCH.x) / unit);
    const i = this.swatches.size;
    const r: Rect = [SWATCH.x + (i % cols) * unit, SWATCH.y + Math.floor(i / cols) * unit, unit, unit];
    if (r[1] + r[3] > ATLAS) throw new Error('atlas : trop de pastilles');
    const sz = this.px(SWATCH.size);
    const buf = Buffer.alloc(sz * sz * 4);
    for (let p = 0; p < buf.length; p += 4) [buf[p], buf[p + 1], buf[p + 2], buf[p + 3]] = [...srgb, 255];
    this.layers.push({
      input: buf,
      left: this.px(r[0]),
      top: this.px(r[1]),
      raw: { width: sz, height: sz, channels: 4 },
    });
    this.swatches.set(key, r);
    return r;
  }
  async jpeg(): Promise<Uint8Array> {
    const img = sharp({
      create: { width: this.size, height: this.size, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 1 } },
    })
      .composite(this.layers.map((l) => ({ input: l.input, left: l.left, top: l.top, raw: l.raw })))
      .flatten({ background: '#808080' })
      .jpeg({ quality: 85, mozjpeg: true });
    return new Uint8Array(await img.toBuffer());
  }
}

// ---------- géométrie ----------

const IBM = (skin: Skin, j: number) =>
  new THREE.Matrix4().fromArray(
    Array.from(
      skin
        .getInverseBindMatrices()!
        .getArray()!
        .slice(j * 16, j * 16 + 16),
    ),
  );

/** Partie prête à fusionner : attributs flottants, os dans l'ordre du squelette maître, UV dans l'atlas. */
interface Part {
  P: Float32Array;
  N: Float32Array;
  UV: Float32Array;
  J: Uint16Array;
  W: Float32Array;
  I: Uint32Array;
}

/**
 * Convertit une primitive skinnée vers le squelette maître : os remappés par nom, sommets re-liés
 * (v' = Σ wⱼ · IBMₘ[j]⁻¹ · IBMₚ[j] · v : chaque partie suit les os du maître, même si ses longueurs d'os diffèrent),
 * UV ramenées dans la zone `rect` de l'atlas. `keepTri` filtre les triangles (tête seule).
 */
function toPart(
  prim: Primitive,
  skin: Skin,
  master: Skin,
  rect: Rect | null,
  swatch: Rect | null,
  keepTri?: (a: number, b: number, c: number) => boolean,
): Part {
  const mj = master.listJoints().map((n) => n.getName());
  const pj = skin.listJoints().map((n) => n.getName());
  const remap = pj.map((n) => {
    const i = mj.indexOf(n);
    if (i < 0) throw new Error(`héros : os ${n} absent du squelette maître`);
    return i;
  });
  const fix = pj.map((_, j) => IBM(master, remap[j]).invert().multiply(IBM(skin, j)));
  const pos = prim.getAttribute('POSITION')!,
    nor = prim.getAttribute('NORMAL')!,
    uv = prim.getAttribute('TEXCOORD_0'),
    jo = prim.getAttribute('JOINTS_0')!,
    we = prim.getAttribute('WEIGHTS_0')!;
  const n = pos.getCount();
  const P = new Float32Array(n * 3),
    N = new Float32Array(n * 3),
    UV = new Float32Array(n * 2),
    J = new Uint16Array(n * 4),
    W = new Float32Array(n * 4);
  const e: number[] = [],
    jw: number[] = [],
    ww: number[] = [];
  const v = new THREE.Vector3(),
    nv = new THREE.Vector3(),
    acc = new THREE.Vector3(),
    accN = new THREE.Vector3(),
    tmp = new THREE.Vector3(),
    m3 = new THREE.Matrix3();
  for (let i = 0; i < n; i++) {
    v.fromArray(pos.getElement(i, e));
    nv.fromArray(nor.getElement(i, e));
    jo.getElement(i, jw);
    we.getElement(i, ww);
    acc.set(0, 0, 0);
    accN.set(0, 0, 0);
    let sw = 0;
    for (let k = 0; k < 4; k++) {
      const w = ww[k];
      J[i * 4 + k] = remap[jw[k]];
      W[i * 4 + k] = w;
      if (w <= 0) continue;
      sw += w;
      acc.addScaledVector(tmp.copy(v).applyMatrix4(fix[jw[k]]), w);
      accN.addScaledVector(tmp.copy(nv).applyMatrix3(m3.setFromMatrix4(fix[jw[k]])), w);
    }
    (sw > 0 ? acc.divideScalar(sw) : acc.copy(v)).toArray(P, i * 3);
    (accN.lengthSq() > 0 ? accN.normalize() : accN.copy(nv)).toArray(N, i * 3);
    if (swatch) {
      UV[i * 2] = (swatch[0] + swatch[2] / 2) / ATLAS;
      UV[i * 2 + 1] = (swatch[1] + swatch[3] / 2) / ATLAS;
    } else if (rect && uv) {
      uv.getElement(i, e);
      const u = e[0] - Math.floor(e[0]),
        t = e[1] - Math.floor(e[1]);
      UV[i * 2] = (rect[0] + u * rect[2]) / ATLAS;
      UV[i * 2 + 1] = (rect[1] + t * rect[3]) / ATLAS;
    }
  }
  const src = prim.getIndices() ? Array.from(prim.getIndices()!.getArray()!) : Array.from({ length: n }, (_, i) => i);
  const I: number[] = [];
  for (let t = 0; t < src.length; t += 3)
    if (!keepTri || keepTri(src[t], src[t + 1], src[t + 2])) I.push(src[t], src[t + 1], src[t + 2]);
  return { P, N, UV, J, W, I: Uint32Array.from(I) };
}

/** Objet tenu (non skinné) lié à 100 % à l'os `bone` du maître ; ses matériaux deviennent des pastilles de l'atlas. */
function propPart(
  src: Document,
  master: Skin,
  bone: string,
  offset: THREE.Matrix4,
  size: number,
  grip: number,
  atlas: Atlas,
): Part[] {
  const joints = master.listJoints();
  const j = joints.findIndex((n) => n.getName() === bone);
  if (j < 0) throw new Error(`objet tenu : os ${bone} absent`);
  const bind = IBM(master, j).invert().multiply(offset);
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
  const out: Part[] = [];
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
        N = new Float32Array(n * 3),
        UV = new Float32Array(n * 2),
        J = new Uint16Array(n * 4),
        W = new Float32Array(n * 4);
      const sw = atlas.swatch(p.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1]);
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
        UV[i * 2] = (sw[0] + sw[2] / 2) / ATLAS;
        UV[i * 2 + 1] = (sw[1] + sw[3] / 2) / ATLAS;
        J[i * 4] = j;
        W[i * 4] = 1;
      }
      const idx = p.getIndices();
      const I = idx ? new Uint32Array(idx.getArray()!) : Uint32Array.from({ length: n }, (_, i) => i);
      out.push({ P, N, UV, J, W, I });
    }
  }
  return out;
}

/** Concatène les parties en une primitive, simplifiée à ≈ `target` triangles (UV pondérées : coutures nettes). */
function merge(doc: Document, parts: Part[], target: number): { prim: Primitive; tris: number } {
  const buffer = doc.getRoot().listBuffers()[0];
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
  if (I.length / 3 > target) {
    const count = Math.round(target) * 3;
    let out = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, UV, 2, [1, 1], null, count, 0.05, [])[0];
    if (out.length > count * 1.15)
      out = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, UV, 2, [1, 1], null, count, 0.05, ['Permissive'])[0];
    I = new Uint32Array(out);
  }
  const acc = (
    type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR',
    arr: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
  ) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', P))
    .setAttribute('NORMAL', acc('VEC3', N))
    .setAttribute('TEXCOORD_0', acc('VEC2', UV))
    .setAttribute('JOINTS_0', acc('VEC4', J))
    .setAttribute('WEIGHTS_0', acc('VEC4', W))
    .setIndices(acc('SCALAR', I));
  return { prim, tris: I.length / 3 };
}

// ---------- animations ----------

const FINGER = /^(index|middle|ring|pinky|thumb)_/;

/**
 * Copie un clip d'une bibliothèque UAL sur le squelette maître, par nom d'os : rotations de tous les os, translation du
 * bassin seulement (mise à l'échelle des hanches du maître ; les longueurs d'os du maître sont gardées). `inPlace` :
 * bassin figé à l'horizontale et jamais plus haut qu'au repos (le jeu déplace le héros).
 */
export function copyClip(
  doc: Document,
  lib: Document,
  from: string,
  to: string,
  inPlace: boolean,
  speed: number,
  fingers = true,
): void {
  const anim = lib
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === from);
  if (!anim) throw new Error(`clip ${from} absent de la bibliothèque`);
  const nodes = new Map(
    doc
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n]),
  );
  const buffer = doc.getRoot().listBuffers()[0];
  const out = doc.createAnimation(to);
  const pelvisLib = lib
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === 'pelvis')!;
  const pelvis = nodes.get('pelvis')!;
  const restL = pelvisLib.getTranslation(),
    rest = pelvis.getTranslation();
  const up = [0, 1, 2].reduce((a, i) => (Math.abs(restL[i]) > Math.abs(restL[a]) ? i : a), 0);
  const k = rest[up] / restL[up];
  for (const ch of anim.listChannels()) {
    const name = ch.getTargetNode()?.getName() ?? '';
    const path = ch.getTargetPath();
    const target = nodes.get(name);
    if (!target || name === 'root') continue;
    if (!fingers && FINGER.test(name)) continue; // ennemis : doigts au repos (invisibles à cette distance)
    if (path === 'scale' || (path === 'translation' && name !== 'pelvis')) continue;
    const s = ch.getSampler()!;
    const times = Float32Array.from(s.getInput()!.getArray()!, (t) => t / speed);
    const vals = new Float32Array(s.getOutput()!.getArray()!);
    if (path === 'translation') {
      for (let i = 0; i < vals.length; i += 3) {
        for (let c = 0; c < 3; c++) vals[i + c] *= k;
        if (inPlace) {
          for (let c = 0; c < 3; c++) if (c !== up) vals[i + c] = rest[c];
          vals[i + up] = Math.min(vals[i + up], rest[up]);
        }
      }
    }
    const smp = doc
      .createAnimationSampler()
      .setInput(doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer))
      .setOutput(
        doc
          .createAccessor()
          .setType(path === 'rotation' ? 'VEC4' : 'VEC3')
          .setArray(vals)
          .setBuffer(buffer),
      )
      .setInterpolation(s.getInterpolation());
    out
      .addSampler(smp)
      .addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(path!).setSampler(smp));
  }
}

// ---------- assemblage ----------

const headBones = new Set(['Head', 'neck_01']);
/** Triangles de la tête : les trois sommets surtout liés à Head / neck_01. */
function headFilter(prim: Primitive, skin: Skin): (a: number, b: number, c: number) => boolean {
  const names = skin.listJoints().map((n) => n.getName());
  const jo = prim.getAttribute('JOINTS_0')!,
    we = prim.getAttribute('WEIGHTS_0')!;
  const jw: number[] = [],
    ww: number[] = [];
  const isHead = (i: number) => {
    jo.getElement(i, jw);
    we.getElement(i, ww);
    let w = 0;
    for (let k = 0; k < 4; k++) if (headBones.has(names[jw[k]])) w += ww[k];
    return w > 0.5;
  };
  return (a, b, c) => isHead(a) && isHead(b) && isHead(c);
}

const imageOf = (prim: Primitive) => prim.getMaterial()?.getBaseColorTexture()?.getImage() ?? null;

/** Apparence d'un personnage (héros ou ennemi) : tout ce que l'assemblage lit dans la spécification. */
export type Look = Pick<HeroSpec, 'hood' | 'hide' | 'hairColor' | 'outfitTint' | 'skinTint' | 'props'>;

/** Personnage assemblé : squelette maître, parties prêtes à fusionner, texture atlas, nœuds d'origine de la tenue. */
export interface Assembled {
  master: Skin;
  parts: Part[];
  texture: Texture;
  outfitNodes: Node[];
}

/**
 * Assemble un personnage dans `doc` (le document de sa tenue, lu) : tenue, tête du personnage de base `base`, coiffures
 * `hairs`, objets tenus `props`, atlas de `atlasSize` pixels. Le document garde ses nœuds d'origine (`finish` les retire).
 */
export async function assemble(
  doc: Document,
  look: Look,
  base: Document,
  hairs: Document[],
  props: Document[],
  atlasSize = ATLAS,
  name = 'hero',
): Promise<Assembled> {
  const root = doc.getRoot();
  for (const a of root.listAnimations()) a.dispose();
  const outfitNodes = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
  const master = outfitNodes[0].getSkin()!;
  const atlas = new Atlas(atlasSize);
  const filled = new Set<string>();
  const fill = async (slot: keyof typeof SLOT, prim: Primitive, recolor: (px: Buffer) => void) => {
    if (filled.has(slot)) return;
    const img = imageOf(prim);
    if (!img) throw new Error(`personnage : matériau ${prim.getMaterial()?.getName()} sans texture`);
    await atlas.put(slot, img, recolor);
    filled.add(slot);
  };
  const skinTint = (px: Buffer) => tint(px, look.skinTint);
  const parts: Part[] = [];
  // tenue (capuche et parties retirées selon le personnage)
  for (const node of outfitNodes) {
    const name = node.getName();
    if (look.hood === false && /Hood/.test(name)) continue;
    if (look.hide?.some((h) => name.includes(h))) continue;
    for (const p of node.getMesh()!.listPrimitives()) {
      const mat = p.getMaterial()?.getName() ?? '';
      const slot = /Regular/.test(mat) ? 'skin' : 'outfit';
      await fill(slot, p, slot === 'skin' ? skinTint : (px) => tint(px, look.outfitTint));
      parts.push(toPart(p, node.getSkin()!, master, SLOT[slot], null));
    }
  }
  // tête du personnage de base, yeux, sourcils
  for (const node of base.getRoot().listNodes()) {
    const mesh = node.getMesh(),
      skin = node.getSkin();
    if (!mesh || !skin) continue;
    for (const p of mesh.listPrimitives()) {
      const mat = p.getMaterial()?.getName() ?? '';
      if (/Eyes/.test(mat)) {
        await fill('eyes', p, () => undefined);
        parts.push(toPart(p, skin, master, SLOT.eyes, null));
      } else if (/Hair_/.test(mat)) {
        // sourcils : matériau de cheveux 1 ou 2 selon le personnage
        const slot = /Hair_2/.test(mat) ? 'hair2' : 'hair1';
        await fill(slot, p, (px) => colorize(px, look.hairColor));
        parts.push(toPart(p, skin, master, SLOT[slot], null));
      } else {
        await fill('head', p, skinTint);
        parts.push(toPart(p, skin, master, SLOT.head, null, headFilter(p, skin)));
      }
    }
  }
  // coiffures
  for (const h of hairs)
    for (const node of h.getRoot().listNodes()) {
      const mesh = node.getMesh(),
        skin = node.getSkin();
      if (!mesh || !skin) continue;
      for (const p of mesh.listPrimitives()) {
        const slot = /Hair_2/.test(p.getMaterial()?.getName() ?? '') ? 'hair2' : 'hair1';
        await fill(slot, p, (px) => colorize(px, look.hairColor));
        parts.push(toPart(p, skin, master, SLOT[slot], null));
      }
    }
  // objets tenus
  look.props.forEach((pr, i) => {
    const off = new THREE.Matrix4().compose(
      new THREE.Vector3(...(pr.pos ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...(pr.rot.map((d) => (d * Math.PI) / 180) as [number, number, number])),
      ),
      new THREE.Vector3(1, 1, 1),
    );
    parts.push(...propPart(props[i], master, pr.bone, off, pr.size, pr.grip, atlas));
  });
  const texture = doc
    .createTexture(name)
    .setImage(await atlas.jpeg())
    .setMimeType('image/jpeg');
  return { master, parts, texture, outfitNodes };
}

/**
 * Ajoute à `doc` une version fusionnée et simplifiée (≈ `target` triangles) du personnage, nœud skinné `name` placé
 * comme la tenue d'origine. Retourne les triangles.
 */
export function addBody(doc: Document, a: Assembled, name: string, target: number, material = 'Hero'): number {
  const { prim, tris } = merge(doc, a.parts, target);
  const mat =
    doc
      .getRoot()
      .listMaterials()
      .find((m) => m.getName() === material) ??
    doc.createMaterial(material).setBaseColorTexture(a.texture).setRoughnessFactor(1).setMetallicFactor(0);
  prim.setMaterial(mat);
  const holder = a.outfitNodes[0];
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)).setSkin(a.master);
  node.setTranslation(holder.getTranslation()).setRotation(holder.getRotation()).setScale(holder.getScale());
  const parent = holder.getParentNode();
  if (parent) parent.addChild(node);
  else for (const s of doc.getRoot().listScenes()) if (s.listChildren().includes(holder)) s.addChild(node);
  return Math.round(tris);
}

/** Retire les maillages d'origine de la tenue (une fois les corps fusionnés ajoutés). */
export function finish(a: Assembled): void {
  for (const n of a.outfitNodes) {
    const m = n.getMesh()!;
    n.dispose();
    m.dispose();
  }
}

/**
 * Construit le héros dans `doc` (le document de sa tenue, lu) : un corps fusionné au budget, les clips des
 * bibliothèques `libs`. Retourne les triangles finaux.
 */
export async function buildHero(
  doc: Document,
  spec: HeroSpec,
  base: Document,
  hairs: Document[],
  libs: Record<string, Document>,
  props: Document[],
): Promise<number> {
  const a = await assemble(doc, spec, base, hairs, props);
  const tris = addBody(doc, a, 'Body', spec.tris);
  finish(a);
  for (const c of HERO_CLIPS) {
    const src = c.to === 'Idle' && spec.idle ? spec.idle : c;
    copyClip(doc, libs[src.src], src.from, c.to, !!c.inPlace, c.speed ?? 1);
  }
  return tris;
}
