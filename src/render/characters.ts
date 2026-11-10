// Modèles des personnages (phase 7) : chaque personnage est décrit en primitives low-poly (boîtes, cônes, cylindres…)
// avec une palette ; les pièces fixes sont fusionnées en UNE géométrie à couleurs par sommet (un seul appel de
// rendu), les jambes restent des meshes séparés pour la course. Aucun asset : tout est généré ici.
// Tenues = palettes alternatives (src/render/outfits.ts), mêmes formes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharacterKey } from '../sim/types';
import { PAL } from './palette';
import { OUTFITS } from './outfits';
import type { Palette } from './outfits';
import { paintHex, primGeometry, withOutline } from './parts';
import type { Prim } from './parts';
import { OUTLINE, OUTLINE_RGB, toonMaterial } from './toon';

type Tone = 'p1' | 'p2' | 'p3' | 'skin' | number;
interface Part extends Prim {
  color: Tone;
  /** `leg` : mesh séparé animé ; `glow` : non éclairé (lumineux) ; sinon fusionné dans le torse */
  role?: 'legL' | 'legR' | 'glow';
}
interface Look {
  parts: Part[];
  /** flotte (pas de jambes, ondulation verticale) */
  float?: boolean;
  /** halo au sol (rayon) : lanterne de la Veilleuse, flamme du Feu follet ; couleur = p3 de la tenue */
  groundGlow?: { r: number; opacity: number };
}

const INK = PAL.ink;
const DARK = 0x3d2b52;
const WOOD = 0x6b4a2a;
const STEEL = 0xbcc4cc;
const leg = (x: number, color: Tone = DARK, w = 0.24): Part => ({
  shape: 'box',
  size: [w, 0.42, 0.26],
  pos: [x, 0.22, 0],
  color,
  role: x < 0 ? 'legL' : 'legR',
});
const head = (skin: Tone = 'skin', s = 0.7): Part => ({
  shape: 'box',
  size: [s, s * 0.86, s],
  pos: [0, 1.45, 0],
  color: skin,
});
const visor: Part = { shape: 'plate', size: [0.52, 0.13, 0.06], pos: [0, 1.45, 0.37], color: INK };

export const LOOKS: Record<CharacterKey, Look> = {
  eclaireuse: {
    parts: [
      { shape: 'box', size: [0.8, 0.75, 0.6], pos: [0, 0.75, 0], color: 'p1' }, // tunique
      { shape: 'box', size: [0.84, 0.1, 0.64], pos: [0, 0.48, 0], color: 'p2' }, // ceinture
      { shape: 'box', size: [0.5, 0.16, 0.6], pos: [0, 1.08, -0.4], color: 'p2' }, // écharpe qui flotte
      head(),
      visor,
      { shape: 'box', size: [0.14, 0.34, 0.5], pos: [0, 1.9, -0.05], color: 'p3' }, // plume
      leg(-0.2),
      leg(0.2),
    ],
  },
  bucheron: {
    parts: [
      { shape: 'box', size: [1.0, 0.8, 0.7], pos: [0, 0.78, 0], color: 'p1' }, // chemise
      { shape: 'box', size: [0.12, 0.8, 0.74], pos: [-0.3, 0.78, 0], color: 'p2' }, // bretelles
      { shape: 'box', size: [0.12, 0.8, 0.74], pos: [0.3, 0.78, 0], color: 'p2' },
      head('skin', 0.72),
      { shape: 'box', size: [0.62, 0.3, 0.3], pos: [0, 1.2, 0.32], color: 'p3' }, // barbe
      { ...visor, pos: [0, 1.54, 0.38] },
      { shape: 'cyl', size: [0.4, 0.42, 0.3], pos: [0, 1.88, 0], color: 'p2' }, // bonnet
      { shape: 'cyl', size: [0.06, 0.06, 1.4], pos: [0.5, 1.0, -0.42], rot: [0, 0, 0.3], color: WOOD }, // manche
      { shape: 'box', size: [0.5, 0.34, 0.1], pos: [0.68, 1.62, -0.42], rot: [0, 0, 0.3], color: STEEL }, // fer de hache
      leg(-0.24, 'p2', 0.28),
      leg(0.24, 'p2', 0.28),
    ],
  },
  sorciere: {
    parts: [
      { shape: 'cone', size: [0.6, 1.3], pos: [0, 0.65, 0], color: 'p1' }, // robe
      head(0xe8dcc0, 0.66),
      { ...visor, size: [0.48, 0.12, 0.06], pos: [0, 1.46, 0.34] },
      { shape: 'box', size: [0.76, 0.3, 0.76], pos: [0, 1.74, 0], color: 'p3' }, // cheveux
      { shape: 'cyl', size: [0.8, 0.8, 0.08], pos: [0, 1.9, 0], color: INK }, // bord du chapeau
      { shape: 'cone', size: [0.42, 0.9], pos: [0, 2.35, 0], rot: [0, 0, 0.12], color: 'p2' }, // chapeau
      { shape: 'cyl', size: [0.05, 0.05, 1.6], pos: [-0.55, 0.9, 0.1], color: WOOD }, // bâton
      { shape: 'ico', size: [0.15], pos: [-0.55, 1.78, 0.1], color: PAL.xp, role: 'glow' }, // gemme
    ],
  },
  veilleuse: {
    parts: [
      { shape: 'box', size: [0.78, 0.78, 0.6], pos: [0, 0.75, 0], color: 'p1' },
      { shape: 'box', size: [0.92, 0.95, 0.3], pos: [0, 0.85, -0.32], color: 'p2' }, // cape
      head(),
      { shape: 'box', size: [0.8, 0.26, 0.8], pos: [0, 1.84, 0], color: 'p2' }, // capuche
      visor,
      { shape: 'cyl', size: [0.04, 0.04, 0.34], pos: [0.62, 1.12, 0.2], color: INK }, // anse
      { shape: 'box', size: [0.26, 0.34, 0.26], pos: [0.62, 0.84, 0.2], color: 'p3', role: 'glow' }, // lanterne
      leg(-0.2),
      leg(0.2),
    ],
    groundGlow: { r: 2.2, opacity: 0.16 },
  },
  braconnier: {
    parts: [
      { shape: 'box', size: [0.8, 0.75, 0.6], pos: [0, 0.75, 0], color: 'p1' }, // veste de cuir
      { shape: 'box', size: [0.3, 0.75, 0.62], pos: [0, 0.75, 0], color: 'p2' }, // plastron
      head(),
      visor,
      { shape: 'cone', size: [0.56, 0.8], pos: [0, 1.82, -0.04], color: 'p2' }, // capuche
      { shape: 'box', size: [0.95, 0.1, 0.26], pos: [0, 1.0, -0.42], rot: [0, 0, 0.6], color: 'p3' }, // boomerang dans le dos
      leg(-0.2),
      leg(0.2),
    ],
  },
  sapeur: {
    parts: [
      { shape: 'box', size: [0.9, 0.75, 0.65], pos: [0, 0.75, 0], color: 'p1' },
      { shape: 'box', size: [0.7, 0.7, 0.36], pos: [0, 0.92, -0.5], color: 'p2' }, // sac à dos
      { shape: 'ico', size: [0.15], pos: [0.2, 1.32, -0.52], color: PAL.mine }, // une mine qui dépasse
      { shape: 'ico', size: [0.12], pos: [-0.22, 1.28, -0.5], color: PAL.mine },
      head(),
      { shape: 'box', size: [0.58, 0.14, 0.08], pos: [0, 1.52, 0.37], color: 0x2a2a2a }, // lunettes
      { shape: 'cyl', size: [0.46, 0.46, 0.22], pos: [0, 1.84, 0], color: 'p3' }, // casque
      { shape: 'cone', size: [0.47, 0.32], pos: [0, 2.1, 0], color: 'p3' },
      leg(-0.22, 'p2', 0.26),
      leg(0.22, 'p2', 0.26),
    ],
  },
  feufollet: {
    float: true,
    parts: [
      { shape: 'cone', size: [0.42, 0.9], pos: [0, 0.55, 0], rot: [Math.PI, 0, 0], color: 'p1' }, // traîne effilée
      { shape: 'box', size: [0.6, 0.55, 0.5], pos: [0, 1.0, 0], color: 'p1' },
      { shape: 'sphere', size: [0.37], pos: [0, 1.5, 0], color: 'p2' },
      { shape: 'box', size: [0.08, 0.1, 0.06], pos: [-0.13, 1.55, 0.34], color: INK },
      { shape: 'box', size: [0.08, 0.1, 0.06], pos: [0.13, 1.55, 0.34], color: INK },
      { shape: 'cone', size: [0.3, 0.75], pos: [0, 2.05, 0], color: 'p3', role: 'glow' }, // flamme
      { shape: 'cone', size: [0.16, 0.4], pos: [0.06, 2.35, 0], color: PAL.gold, role: 'glow' },
    ],
    groundGlow: { r: 1.6, opacity: 0.14 },
  },
  revenante: {
    float: true,
    parts: [
      { shape: 'cone', size: [0.58, 1.4], pos: [0, 0.7, 0], color: 'p1' }, // robe
      { shape: 'box', size: [0.66, 0.58, 0.66], pos: [0, 1.5, 0], color: 'p2' }, // visage sombre
      { shape: 'box', size: [0.9, 0.14, 0.9], pos: [0, 1.74, 0], color: 'p1' }, // bord du voile
      { shape: 'cone', size: [0.52, 0.8], pos: [0, 2.1, 0], color: 'p1' }, // capuche
      { shape: 'box', size: [0.1, 0.1, 0.05], pos: [-0.15, 1.55, 0.35], color: 'p3', role: 'glow' }, // yeux
      { shape: 'box', size: [0.1, 0.1, 0.05], pos: [0.15, 1.55, 0.35], color: 'p3', role: 'glow' },
    ],
  },
  colporteur: {
    parts: [
      { shape: 'box', size: [0.8, 0.75, 0.6], pos: [0, 0.75, 0], color: 'p1' },
      { shape: 'box', size: [0.72, 0.9, 0.5], pos: [0, 1.0, -0.56], color: 'p2' }, // hotte
      { shape: 'box', size: [0.22, 0.22, 0.22], pos: [-0.18, 1.56, -0.56], color: PAL.gold }, // marchandises
      { shape: 'box', size: [0.2, 0.28, 0.2], pos: [0.16, 1.58, -0.6], color: PAL.hp },
      { shape: 'cyl', size: [0.1, 0.1, 0.4], pos: [0.02, 1.66, -0.5], color: PAL.xp },
      head(),
      visor,
      { shape: 'cyl', size: [0.52, 0.52, 0.1], pos: [0, 1.8, 0], color: 'p3' }, // chapeau rond
      { shape: 'cyl', size: [0.3, 0.3, 0.24], pos: [0, 1.96, 0], color: 'p3' },
      { shape: 'sphere', size: [0.15], pos: [0.46, 0.58, 0.22], color: PAL.gold }, // bourse
      leg(-0.2),
      leg(0.2),
    ],
  },
};

export interface CharacterModel {
  group: THREE.Group;
  /** torse fusionné (bob, écrasement au tir) ; contient aussi les pièces lumineuses */
  torso: THREE.Group;
  legL: THREE.Mesh | null;
  legR: THREE.Mesh | null;
  glowDisc: THREE.Mesh | null;
  float: boolean;
  /** silhouette fusionnée (traînée de dash) */
  silhouette: THREE.BufferGeometry;
  dispose(): void;
}

const tone = (t: Tone, pal: Palette): number => (typeof t === 'number' ? t : pal[t]);

// matériaux partagés par tous les personnages (aucun paramètre par personnage) : jamais disposés, sinon Three
// détruirait et recompilerait leur programme à chaque changement de personnage dans le menu
const LIT_MAT = toonMaterial({ vertexColors: true }); // phase 15 : toon à trois tons, contour cuit dans la géométrie
const GLOW_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });

/** Construit le modèle d'un personnage dans sa tenue. ≤ 5 appels de rendu : torse, lumineux, 2 jambes, halo. */
export function buildCharacter(key: CharacterKey, skin = 0): CharacterModel {
  const look = LOOKS[key];
  const pals = OUTFITS[key];
  const pal = pals[Math.min(skin, pals.length - 1)];
  const group = new THREE.Group();
  const torso = new THREE.Group();
  const lit: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const all: THREE.BufferGeometry[] = [];
  let legL: THREE.Mesh | null = null,
    legR: THREE.Mesh | null = null;
  const disposables: { dispose(): void }[] = [];
  for (const p of look.parts) {
    const g = primGeometry(p, true); // un seul modèle à l'écran : boîtes arrondies (phase 15)
    all.push(g.clone());
    if (p.role === 'legL' || p.role === 'legR') {
      // couleur par sommet (le contour cuit est sombre) : le matériau toon partagé suffit
      const m = new THREE.Mesh(withOutline(paintHex(g, tone(p.color, pal)), OUTLINE.player, OUTLINE_RGB), LIT_MAT);
      // pivot à la hanche : la géométrie est déjà translatée, on tourne autour de (x, 0.43, 0)
      m.geometry.translate(-p.pos[0], -0.43, 0);
      m.position.set(p.pos[0], 0.43, 0);
      disposables.push(g, m.geometry);
      if (p.role === 'legL') legL = m;
      else legR = m;
      group.add(m);
    } else (p.role === 'glow' ? glow : lit).push(paintHex(g, tone(p.color, pal)));
  }
  const litMerged = mergeGeometries(lit) ?? lit[0];
  const litGeo = withOutline(litMerged, OUTLINE.player, OUTLINE_RGB);
  torso.add(new THREE.Mesh(litGeo, LIT_MAT));
  disposables.push(litGeo, litMerged, ...lit);
  if (glow.length) {
    const glowGeo = mergeGeometries(glow) ?? glow[0];
    torso.add(new THREE.Mesh(glowGeo, GLOW_MAT));
    disposables.push(glowGeo, ...glow);
  }
  group.add(torso);
  let glowDisc: THREE.Mesh | null = null;
  if (look.groundGlow) {
    const gg = look.groundGlow;
    const geo = new THREE.CircleGeometry(gg.r, 20).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: pal.p3,
      transparent: true,
      opacity: gg.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    glowDisc = new THREE.Mesh(geo, mat);
    glowDisc.position.y = 0.07;
    disposables.push(geo, mat);
  }
  const silhouette = mergeGeometries(all) ?? all[0];
  disposables.push(silhouette, ...all); // le fantôme de dash en reçoit un clone (scene.ts), disposé au swap
  return {
    group,
    torso,
    legL,
    legR,
    glowDisc,
    float: !!look.float,
    silhouette,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
