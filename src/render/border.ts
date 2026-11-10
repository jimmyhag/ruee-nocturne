// Bordure de la carte (phase 29) : une lisière de forêt ferme la zone jouable. Une rangée de rochers juste derrière la
// limite (là où bute le joueur), trois rangées de sapins sombres, puis un sous-bois qui file sous le brouillard : plus
// jamais de vide au bord. Rendu seulement (la sim garde sa limite PLAY_LIMIT). Construit une fois par carte, découpé
// en segments de BORDER.seg u (un appel de rendu par segment visible, aucun loin du bord).
import * as THREE from 'three';
import { PLAY_LIMIT, WORLD_HALF } from '../sim/balance';
import { PAL } from './palette';
import { merge, paintHex, primGeometry, withOutline } from './parts';
import type { Prim } from './parts';
import { OUTLINE, OUTLINE_RGB } from './toon';

export const BORDER = {
  seg: 40, // u : longueur d'un segment le long d'un côté (un mesh, une sphère englobante)
  rockAt: 1.4, // u derrière la limite : axe de la rangée de rochers
  rockGap: 1.75, // u entre deux rochers
  rows: [5.5, 9.5, 13.8], // u derrière la limite : rangées de sapins
  treeGap: 3.3, // u entre deux sapins d'une rangée (rangées décalées en quinconce)
  skirtIn: WORLD_HALF - 2, // le sous-bois commence sous le bord du sol (recouvrement de 2 u)
  skirtOut: 90, // u de sous-bois au-delà du bord
  skirtY: -0.06, // sous le sol dessiné : jamais de scintillement là où ils se recouvrent
};
const STONE = 0x575470;
const MOSS = 0x3b5a4c;
const FLOOR_NEAR = [0.03, 0.05, 0.045]; // sous-bois au pied de la lisière (linéaire)…
const FLOOR_FAR = [0.012, 0.016, 0.03]; // …qui se fond dans la nuit au loin

/** Hachage déterministe dans [0, 1) : variété des arbres et rochers sans toucher au générateur de la sim. */
function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface Template {
  pos: Float32Array;
  nor: Float32Array;
  col: Float32Array;
}
function template(g: THREE.BufferGeometry): Template {
  const o = withOutline(g, OUTLINE.decor, OUTLINE_RGB);
  const t = {
    pos: (o.getAttribute('position').array as Float32Array).slice(),
    nor: (o.getAttribute('normal').array as Float32Array).slice(),
    col: (o.getAttribute('color').array as Float32Array).slice(),
  };
  o.dispose();
  return t;
}
const build = (parts: (Prim & { color: number })[]) => merge(parts.map((p) => paintHex(primGeometry(p), p.color)));

/** Sapin de lisière : deux cônes à 6 pans (le tronc ne se voit pas dans une forêt dense), 1 u de rayon à la base. */
function firTemplate(): Template {
  return template(
    build([
      { shape: 'cone', size: [1.15, 2.2], pos: [0, 1.5, 0], color: PAL.tree, seg: 6 },
      { shape: 'cone', size: [0.8, 1.8], pos: [0, 2.75, 0], color: PAL.tree, seg: 6 },
    ]),
  );
}
/** Rocher : dodécaèdre écrasé, mousse sur les faces du haut. */
function rockTemplate(sx: number, sy: number, sz: number): Template {
  const d = new THREE.DodecahedronGeometry(1, 0);
  const g = d.index ? d.toNonIndexed() : d; // déjà non indexé en three 0.187 (toNonIndexed avertirait)
  g.scale(sx, sy, sz);
  g.translate(0, sy * 0.55, 0);
  g.computeVertexNormals();
  const pos = g.getAttribute('position'),
    nor = g.getAttribute('normal');
  const col = new Float32Array(pos.count * 3),
    s = new THREE.Color(STONE),
    m = new THREE.Color(MOSS);
  for (let i = 0; i < pos.count; i++) {
    const c = nor.getY(i) > 0.75 ? m : s;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return template(g);
}

/** Accumulateur d'un segment : sommets non indexés (position, normale, couleur). */
class Acc {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  /** Recopie le gabarit tourné de `ry`, mis à l'échelle (s, sy), posé en (x, y, z), teinte multipliée par `k`. */
  put(t: Template, x: number, y: number, z: number, ry: number, s: number, sy: number, k: number): void {
    const c = Math.cos(ry),
      sn = Math.sin(ry);
    const P = t.pos,
      N = t.nor,
      C = t.col;
    for (let i = 0; i < P.length; i += 3) {
      const px = P[i] * s,
        pz = P[i + 2] * s;
      this.pos.push(x + px * c + pz * sn, y + P[i + 1] * sy, z - px * sn + pz * c);
      this.nor.push(N[i] * c + N[i + 2] * sn, N[i + 1], -N[i] * sn + N[i + 2] * c);
      // le contour garde sa teinte sombre ; le reste prend la variation
      const dark = C[i] < 0.12 && C[i + 1] < 0.12;
      this.col.push(dark ? C[i] : C[i] * k, dark ? C[i + 1] : C[i + 1] * k, dark ? C[i + 2] : C[i + 2] * k);
    }
  }
  /** Quadrilatère de sol (a, b, c, d dans l'ordre, vu du dessus), couleurs par coin. */
  quad(v: number[], cols: number[][]): void {
    // orientation : la face regarde toujours vers le haut (normale du premier triangle, y > 0)
    const ux = v[3] - v[0],
      uz = v[5] - v[2],
      wx = v[6] - v[0],
      wz = v[8] - v[2];
    const up = uz * wx - ux * wz > 0;
    const tri = up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const j of tri) {
      this.pos.push(v[j * 3], v[j * 3 + 1], v[j * 3 + 2]);
      this.nor.push(0, 1, 0);
      this.col.push(cols[j][0], cols[j][1], cols[j][2]);
    }
  }
  geometry(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Géométries de la bordure, une par segment. Côtés nord et sud sur toute la largeur (coins compris), est et ouest
 * entre les deux : aucun recouvrement aux coins. `gy` : hauteur du sol dessiné (bornée au bord de la carte).
 */
export function borderGeometry(seed: number, gy: (x: number, z: number) => number): THREE.BufferGeometry[] {
  const fir = firTemplate();
  const rocks = [rockTemplate(1.25, 0.95, 1.0), rockTemplate(1.0, 1.25, 0.9), rockTemplate(1.4, 0.8, 1.2)];
  const L = PLAY_LIMIT,
    far = L + BORDER.rows[BORDER.rows.length - 1] + 3,
    S = BORDER.seg;
  const nNS = Math.ceil((2 * far) / S),
    nEW = Math.ceil((2 * L) / S);
  const out: THREE.BufferGeometry[] = [];
  const near = FLOOR_NEAR,
    farC = FLOOR_FAR;
  // côté : 0 nord (z −), 1 sud (z +), 2 ouest (x −), 3 est (x +) ; t le long du côté, d vers l'extérieur
  for (let side = 0; side < 4; side++) {
    const ns = side < 2,
      sg = side === 0 || side === 2 ? -1 : 1;
    const tMin = ns ? -far : -L,
      tMax = ns ? far : L,
      n = ns ? nNS : nEW;
    const XZ = (t: number, d: number): [number, number] => (ns ? [t, sg * (L + d)] : [sg * (L + d), t]);
    for (let k = 0; k < n; k++) {
      const a = tMin + ((tMax - tMin) * k) / n,
        b = tMin + ((tMax - tMin) * (k + 1)) / n;
      const acc = new Acc();
      // rochers : la rangée qui arrête le joueur, en quinconce léger
      for (let t = Math.ceil(a / BORDER.rockGap) * BORDER.rockGap; t < b; t += BORDER.rockGap) {
        const h = hash(seed, side * 7919 + Math.round(t * 10), 1);
        const [x, z] = XZ(t, BORDER.rockAt + (h - 0.5) * 0.9);
        const s = 0.6 + hash(seed, side, Math.round(t * 10)) * 0.35;
        acc.put(rocks[(h * 3) | 0], x, gy(x, z) - 0.15, z, h * 6.28, s, s * (0.8 + h * 0.4), 0.85 + h * 0.3);
      }
      // sapins : trois rangées décalées, plus grands et plus sombres en profondeur
      for (let r = 0; r < BORDER.rows.length; r++) {
        const off = (r % 2) * BORDER.treeGap * 0.5;
        for (let t = Math.ceil((a - off) / BORDER.treeGap) * BORDER.treeGap + off; t < b; t += BORDER.treeGap) {
          const h = hash(seed + r, side * 104729 + Math.round(t * 10), 2);
          const [x, z] = XZ(t + (h - 0.5) * 1.2, BORDER.rows[r] + (h - 0.5) * 1.4);
          const s = 1.15 + r * 0.25 + h * 0.5;
          acc.put(fir, x, gy(x, z) - 0.1, z, h * 6.28, s, s * (1 + h * 0.35), (0.95 - r * 0.14) * (0.9 + h * 0.2));
        }
      }
      // sous-bois : bande de sol du bord du terrain jusqu'au loin, en 3 bandes (clair au pied, nuit au loin)
      const d0 = BORDER.skirtIn - L,
        steps = [d0, 18, 40, BORDER.skirtOut];
      const t0 = ns ? a : Math.max(a, -BORDER.skirtIn),
        t1 = ns ? b : Math.min(b, BORDER.skirtIn);
      for (let i = 0; i + 1 < steps.length; i++) {
        const dA = steps[i],
          dB = steps[i + 1];
        const fa = i / (steps.length - 1),
          fb = (i + 1) / (steps.length - 1);
        const ca = [0, 1, 2].map((j) => near[j] + (farC[j] - near[j]) * fa),
          cb = [0, 1, 2].map((j) => near[j] + (farC[j] - near[j]) * fb);
        // côtés nord-sud : le sous-bois couvre aussi les coins (t jusqu'à ±(L + skirtOut))
        const ta = ns && k === 0 ? -(L + BORDER.skirtOut) : t0,
          tb = ns && k === n - 1 ? L + BORDER.skirtOut : t1;
        const p = (t: number, d: number) => {
          const [x, z] = XZ(t, d);
          return [x, (i === 0 ? gy(x, z) : 0) + BORDER.skirtY, z];
        };
        acc.quad([...p(ta, dA), ...p(tb, dA), ...p(tb, dB), ...p(ta, dB)], [ca, ca, cb, cb]);
      }
      const g = acc.geometry();
      if (g) out.push(g);
    }
  }
  return out;
}
