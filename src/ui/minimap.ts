// Carte de la partie (phase 27) : minicarte du HUD (autour du joueur, redessinée 4 fois par seconde) et grande carte
// (toute la carte, à l'ouverture). Fond construit une fois par carte (relief, lacs, ouvrages), brouillard sur ce qui
// n'est pas encore découvert (w.seen, tenu par la sim). Lecture seule du monde. Hors de la boucle de rendu 3D.
import { DISCOVER, ENEMIES, It, PLAY_LIMIT, WORLD_HALF } from '../sim/balance';
import { SEEN_N } from '../sim/world';
import { TOTEM_HIDDEN } from '../sim/poi';
import type { World } from '../sim/world';
import { PAL } from '../render/palette';

const POWER_CSS = PAL.power.map((c) => '#' + c.toString(16).padStart(6, '0')); // phase 35

/** Lot L2 : systèmes qui ont un repère sur la carte (la glisse n'en a pas). */
type NewKind = 'shrines' | 'merchant' | 'totem';

const SIZE = 2 * WORLD_HALF; // u, un pixel du fond par unité
const VIEW = 110; // u de côté visibles dans la minicarte
const C = {
  // phase 44 : verts de la clairière (le fond de la carte suit le sol clair du jeu)
  flat: [66, 112, 60],
  high: [118, 150, 80],
  bank: [146, 110, 76],
  low: [52, 84, 78],
  lake: [56, 104, 170],
};

export class MapView {
  private base: HTMLCanvasElement;
  private fog: HTMLCanvasElement;
  private fogData: ImageData;
  private fogCount = -1;
  private seed = NaN;
  private t = 0;
  /** Lot L2 : système dévoilé dans cette partie, étiqueté « Nouveau » jusqu'à la première interaction (null : rien). */
  private newKind: NewKind | null = null;
  private newLabel = '';
  private labelFs = 0;
  private labelFont = '';

  constructor(
    private readonly mini: HTMLCanvasElement,
    private readonly big: HTMLCanvasElement,
  ) {
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = SIZE;
    this.fog = document.createElement('canvas');
    this.fog.width = this.fog.height = SEEN_N;
    this.fogData = new ImageData(SEEN_N, SEEN_N);
  }

  /** Fond de la carte (une fois par graine) : relief ombré, flancs, lacs, ouvrages, arbres. */
  private build(w: World): void {
    this.seed = w.seed;
    this.fogCount = -1;
    const ctx = this.base.getContext('2d')!;
    const img = ctx.createImageData(SIZE, SIZE),
      d = img.data;
    for (let j = 0; j < SIZE; j++)
      for (let i = 0; i < SIZE; i++) {
        const x = i - WORLD_HALF + 0.5,
          z = j - WORLD_HALF + 0.5;
        const h = w.heightAt(x, z),
          gx = w.heightAt(x + 1, z) - w.heightAt(x - 1, z),
          gz = w.heightAt(x, z + 1) - w.heightAt(x, z - 1);
        const s = Math.hypot(gx, gz) / 2;
        let r: number, g: number, b: number;
        const t = Math.max(0, Math.min(1, h / 7.5));
        if (h < -0.4) [r, g, b] = C.low;
        else {
          r = C.flat[0] + (C.high[0] - C.flat[0]) * t;
          g = C.flat[1] + (C.high[1] - C.flat[1]) * t;
          b = C.flat[2] + (C.high[2] - C.flat[2]) * t;
        }
        const k = Math.min(1, s / 0.3);
        r += (C.bank[0] - r) * k;
        g += (C.bank[1] - g) * k;
        b += (C.bank[2] - b) * k;
        const light = 1 + (-gx * 0.7 - gz * 0.5) * 0.9; // lumière venue du nord-ouest
        const o = (j * SIZE + i) * 4;
        d[o] = r * light;
        d[o + 1] = g * light;
        d[o + 2] = b * light;
        d[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    const px = (v: number) => v + WORLD_HALF;
    ctx.fillStyle = `rgb(${C.lake.join(',')})`;
    for (const l of w.lakes) {
      ctx.beginPath();
      ctx.arc(px(l.x), px(l.z), l.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#2c5428';
    for (let i = 0; i < w.treeCount; i++) {
      const o = w.obstacles[i];
      ctx.fillRect(px(o.x) - 1, px(o.z) - 1, 2, 2);
    }
    ctx.fillStyle = '#b8b4c8';
    for (let i = w.rockEnd; i < w.obstacles.length; i++) {
      const o = w.obstacles[i];
      ctx.fillRect(px(o.x) - 1, px(o.z) - 1, 2, 2);
    }
    ctx.lineCap = 'round';
    for (const s of w.walls) {
      ctx.strokeStyle = s.kind === 0 ? '#c9c4d8' : s.kind === 1 ? '#8a6a52' : '#a07a5e';
      ctx.lineWidth = s.kind === 2 ? 1 : 1.6;
      ctx.beginPath();
      ctx.moveTo(px(s.x1), px(s.z1));
      ctx.lineTo(px(s.x2), px(s.z2));
      ctx.stroke();
    }
    ctx.fillStyle = '#d9782e';
    for (const p of w.decor) ctx.fillRect(px(p.x) - 1, px(p.z) - 1, 2, 2);
    // phase 28 : grandes pistes en bande claire, tremplins en trait doré
    ctx.strokeStyle = 'rgba(214,232,255,0.55)';
    for (const p of w.pistes) {
      ctx.lineWidth = p.half * 2;
      ctx.beginPath();
      ctx.moveTo(px(p.x0), px(p.z0));
      ctx.lineTo(px(p.x1), px(p.z1));
      ctx.stroke();
    }
    ctx.strokeStyle = '#ffc845';
    ctx.lineWidth = 3;
    for (const q of w.kickers) {
      ctx.beginPath();
      ctx.moveTo(px(q.x), px(q.z));
      ctx.lineTo(px(q.x + q.dx * 5), px(q.z + q.dz * 5));
      ctx.stroke();
    }
    // phase 29 : lisière de forêt hors de la zone jouable (comme en jeu), liseré clair sur la limite
    const e0 = px(-PLAY_LIMIT),
      e1 = px(PLAY_LIMIT),
      band = SIZE - e1;
    ctx.fillStyle = '#12221d';
    ctx.fillRect(0, 0, SIZE, e0);
    ctx.fillRect(0, e1, SIZE, band);
    ctx.fillRect(0, 0, e0, SIZE);
    ctx.fillRect(e1, 0, band, SIZE);
    ctx.fillStyle = '#0a1612';
    for (let t = 1; t < SIZE; t += 3) {
      const o = (t * 7) % 3;
      ctx.fillRect(t, o, 2, 2);
      ctx.fillRect(t, SIZE - 3 - o, 2, 2);
      ctx.fillRect(o, t, 2, 2);
      ctx.fillRect(SIZE - 3 - o, t, 2, 2);
    }
    ctx.strokeStyle = 'rgba(201,196,216,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(e0 + 0.5, e0 + 0.5, e1 - e0 - 1, e1 - e0 - 1);
  }

  /** Brouillard : opaque sur les cases jamais vues (seulement quand la découverte a progressé). */
  private updateFog(w: World): void {
    if (w.seenCount === this.fogCount) return;
    this.fogCount = w.seenCount;
    const d = this.fogData.data;
    for (let k = 0; k < SEEN_N * SEEN_N; k++) {
      const o = k * 4;
      d[o] = 10;
      d[o + 1] = 14;
      d[o + 2] = 26;
      d[o + 3] = w.seen[k] ? 0 : 215; // le non découvert reste deviné (formes sombres)
    }
    this.fog.getContext('2d')!.putImageData(this.fogData, 0, 0);
  }

  private seenAt(w: World, x: number, z: number): boolean {
    const i = Math.floor((x + WORLD_HALF) / DISCOVER.cell),
      j = Math.floor((z + WORLD_HALF) / DISCOVER.cell);
    return i >= 0 && j >= 0 && i < SEEN_N && j < SEEN_N && w.seen[j * SEEN_N + i] === 1;
  }

  // repère courant (pas de fermeture recréée à chaque dessin)
  private ox = 0;
  private oz = 0;
  private k = 1;
  private X(x: number): number {
    return (x - this.ox) * this.k;
  }
  private Z(z: number): number {
    return (z - this.oz) * this.k;
  }

  /** Trace une étoile à quatre branches (rayon `R`, creux `q`) ; à remplir ou cercler par l'appelant. */
  private star(ctx: CanvasRenderingContext2D, x: number, z: number, R: number, q: number): void {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        d = i % 2 ? q : R;
      if (i) ctx.lineTo(x + Math.sin(a) * d, z - Math.cos(a) * d);
      else ctx.moveTo(x, z - d);
    }
    ctx.closePath();
  }

  /** Repères (coffres non ouverts et sanctuaires découverts, marchand, boss) et joueur. `k` : pixels par unité. */
  private marks(
    ctx: CanvasRenderingContext2D,
    w: World,
    ox: number,
    oz: number,
    k: number,
    r: number,
    edge = 0, // minicarte : côté du cadre (px) ; un totem de boss hors cadre y laisse une flèche. 0 : grande carte
  ): void {
    this.ox = ox;
    this.oz = oz;
    this.k = k;
    const compass = w.items[It.Boussole] > 0; // phase 28 : la Boussole montre aussi ce qui n'est pas découvert
    ctx.fillStyle = '#ffd45a';
    for (const c of w.mapChests)
      if (!c.open && (compass || this.seenAt(w, c.x, c.z)))
        ctx.fillRect(this.X(c.x) - r, this.Z(c.z) - r, r * 2, r * 2);
    // phase 51 : coffres lâchés par les élites et les boss, petit carré doré cerclé, toujours visible (on vient de le
    // gagner ; il ne figurait pas sur la carte)
    ctx.strokeStyle = '#0c0f1a';
    ctx.lineWidth = 1;
    for (let i = 0; i < w.chestCount; i++) {
      const c = w.chests[i],
        h = r * (c.boss ? 1.1 : 0.9);
      ctx.fillStyle = '#ffe9a0';
      ctx.fillRect(this.X(c.x) - h, this.Z(c.z) - h, h * 2, h * 2);
      ctx.strokeRect(this.X(c.x) - h, this.Z(c.z) - h, h * 2, h * 2);
    }
    // départs des pistes chronométrées : losange cyan (gris une fois gagnée)
    for (const q of w.races)
      if (this.seenAt(w, q.sx, q.sz)) {
        const x = this.X(q.sx),
          z = this.Z(q.sz),
          a = r * 1.5;
        ctx.fillStyle = q.state === 2 ? '#6b7088' : '#5fd8ff';
        ctx.beginPath();
        ctx.moveTo(x, z - a);
        ctx.lineTo(x + a, z);
        ctx.lineTo(x, z + a);
        ctx.lineTo(x - a, z);
        ctx.closePath();
        ctx.fill();
      }
    ctx.fillStyle = '#7fd8ff';
    for (const s of w.shrines)
      if (!s.used && (compass || this.seenAt(w, s.x, s.z))) {
        ctx.beginPath();
        ctx.arc(this.X(s.x), this.Z(s.z), r * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    // phase 48 : crânes de difficulté, un petit crâne violet (disque et mâchoire) ; même règle que les sanctuaires
    ctx.fillStyle = '#b060ff';
    for (const s of w.skulls)
      if (!s.on && (compass || this.seenAt(w, s.x, s.z))) {
        const x = this.X(s.x),
          z = this.Z(s.z);
        ctx.beginPath();
        ctx.arc(x, z - r * 0.25, r * 1.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - r * 0.65, z + r * 0.4, r * 1.3, r * 0.9);
      }
    const M = w.merchant;
    if (M.active) {
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.arc(this.X(M.x), this.Z(M.z), r * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // phase 35 : bonus au sol, de la couleur du bonus (toujours visibles : ils durent 30 s). Phase 51 : une étoile à
    // quatre branches cerclée, plus un disque : l'Aimant se confondait avec un crâne, le Temps figé avec un sanctuaire
    ctx.strokeStyle = '#0c0f1a';
    ctx.lineWidth = 1;
    for (let i = 0; i < w.powerCount; i++) {
      const p = w.powers[i];
      ctx.fillStyle = POWER_CSS[p.kind];
      this.star(ctx, this.X(p.x), this.Z(p.z), r * 1.9, r * 0.7);
      ctx.fill();
      ctx.stroke();
    }
    // phase 48 : totems de boss, losange braise. Phase 51 (retour de Jimmy : « pas visible sur la minicarte ») : toujours
    // affichés, sans exploration, comme le totem du monde ; plus grands, cerclés, un « + » clair au centre ; dessinés
    // après le marchand et les bonus. Éteints (activés, portail ouvert, monde infini) : gris. Hors du cadre de la
    // minicarte : une flèche sur le bord
    const spent = w.totem.state === 2 || w.endless;
    for (const b of w.bossTotems) {
      const off = b.on || spent,
        a = r * 1.9;
      let x = this.X(b.x),
        z = this.Z(b.z);
      if (edge > 0 && (x < a || z < a || x > edge - a || z > edge - a)) {
        if (off) continue;
        // hors cadre : pointe posée sur le bord, tournée vers le totem
        const cx = edge / 2,
          dx = x - cx,
          dz = z - cx,
          m = (cx - a) / Math.max(Math.abs(dx), Math.abs(dz)),
          d = Math.hypot(dx, dz) || 1;
        x = cx + dx * m;
        z = cx + dz * m;
        const ux = dx / d,
          uz = dz / d;
        ctx.fillStyle = '#ff8a3d';
        ctx.beginPath();
        ctx.moveTo(x + ux * a, z + uz * a);
        ctx.lineTo(x - ux * a * 0.6 - uz * a * 0.8, z - uz * a * 0.6 + ux * a * 0.8);
        ctx.lineTo(x - ux * a * 0.6 + uz * a * 0.8, z - uz * a * 0.6 - ux * a * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = off ? '#6b7088' : '#ff8a3d';
      ctx.beginPath();
      ctx.moveTo(x, z - a);
      ctx.lineTo(x + a, z);
      ctx.lineTo(x, z + a);
      ctx.lineTo(x - a, z);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (!off) {
        ctx.fillStyle = '#fff3e0';
        const t = Math.max(1, r * 0.35),
          l = a * 0.5;
        ctx.fillRect(x - l, z - t / 2, l * 2, t);
        ctx.fillRect(x - t / 2, z - l, t, l * 2);
      }
    }
    // phase 37 : totem du monde (losange rouge, toujours visible : c'est l'objectif), portail ouvert en cyan
    const T = w.totem;
    if (T.state !== TOTEM_HIDDEN) {
      // lot L2 : pas de losange tant que le totem n'est pas dévoilé
      const x = this.X(T.x),
        z = this.Z(T.z),
        a = r * 2.2;
      ctx.fillStyle = w.portal.open ? '#5fd3ff' : T.state === 1 ? '#ff8a5e' : '#ff4d5e';
      ctx.strokeStyle = '#0c0f1a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, z - a);
      ctx.lineTo(x + a, z);
      ctx.lineTo(x, z + a);
      ctx.lineTo(x - a, z);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ff4d5e';
    for (let i = 0; i < w.enemyCount; i++) {
      const e = w.enemies[i];
      if (!e.alive || !ENEMIES[e.type].boss) continue;
      ctx.beginPath();
      ctx.arc(this.X(e.x), this.Z(e.z), r * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    this.newTag(ctx, w, r, edge);
    // joueur : flèche dans le sens de la marche
    const P = w.player,
      px = this.X(P.x),
      pz = this.Z(P.z),
      a = r * 2.2;
    ctx.fillStyle = '#f3ecdc';
    ctx.strokeStyle = '#0c0f1a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + P.dirX * a * 1.4, pz + P.dirZ * a * 1.4);
    ctx.lineTo(px - P.dirX * a * 0.8 - P.dirZ * a * 0.8, pz - P.dirZ * a * 0.8 + P.dirX * a * 0.8);
    ctx.lineTo(px - P.dirX * a * 0.8 + P.dirZ * a * 0.8, pz - P.dirZ * a * 0.8 - P.dirX * a * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Lot L2 : au début de la partie qui dévoile un système, son premier repère (sanctuaire le plus proche déjà vu,
   * marchand arrivé, totem) porte une étiquette « Nouveau » (`label`, traduit) jusqu'à la première interaction.
   */
  setNew(kind: NewKind | null, label: string): void {
    this.newKind = kind;
    this.newLabel = label.toLocaleUpperCase(); // libellé espacé en capitales (kit Nocturne)
  }
  private newTag(ctx: CanvasRenderingContext2D, w: World, r: number, edge: number): void {
    const kind = this.newKind;
    if (kind === null) return;
    let x = NaN,
      z = NaN;
    if (kind === 'shrines') {
      let best = Infinity;
      for (const s of w.shrines) {
        if (s.used || s.charge > 0) {
          this.newKind = null; // premier sanctuaire touché
          return;
        }
        const d = (s.x - w.player.x) ** 2 + (s.z - w.player.z) ** 2;
        if (d < best && (w.items[It.Boussole] > 0 || this.seenAt(w, s.x, s.z))) {
          best = d;
          x = s.x;
          z = s.z;
        }
      }
    } else if (kind === 'merchant') {
      const M = w.merchant;
      if (M.inside || M.rolled) {
        this.newKind = null; // échoppe ouverte
        return;
      }
      if (M.active) {
        x = M.x;
        z = M.z;
      }
    } else {
      const T = w.totem;
      if (T.charge > 0 || T.state !== 0) {
        this.newKind = null; // totem en charge
        return;
      }
      x = T.x;
      z = T.z;
    }
    if (Number.isNaN(x)) return;
    const px = this.X(x),
      pz = this.Z(z),
      fs = Math.max(9, Math.round(r * 3)),
      pad = 2,
      h = fs + pad * 2;
    if (edge > 0 && (px < 0 || pz < 0 || px > edge || pz > edge)) return; // repère hors du cadre de la minicarte
    if (fs !== this.labelFs) {
      // chaîne refaite seulement quand la taille change (minicarte 4 fois par seconde, grande carte à l'ouverture)
      this.labelFs = fs;
      this.labelFont = `700 ${fs}px 'Barlow Condensed', 'Arial Narrow', sans-serif`; // police du kit Nocturne
    }
    ctx.font = this.labelFont;
    const tw = ctx.measureText(this.newLabel).width + pad * 4,
      top = pz - r * 2.4 - h;
    let left = px - tw / 2;
    if (edge > 0) left = Math.max(0, Math.min(edge - tw, left));
    ctx.fillStyle = '#f5b94a'; // lanterne du kit : du nouveau
    ctx.strokeStyle = '#0a0f24';
    ctx.lineWidth = 1;
    ctx.fillRect(left, top, tw, h);
    ctx.strokeRect(left, top, tw, h);
    ctx.fillStyle = '#0a0f24';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.newLabel, left + tw / 2, top + h / 2 + 0.5);
  }

  /** Fond de la nouvelle carte, à préparer hors d'une image de jeu (lancement de la partie). */
  prepare(w: World): void {
    if (w.seed !== this.seed) this.build(w);
    this.t = 0;
  }

  /** Minicarte : appelée chaque frame, ne redessine que 4 fois par seconde. */
  update(w: World, dt: number): void {
    if (w.seed !== this.seed) this.build(w);
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    this.updateFog(w);
    const c = this.mini,
      ctx = c.getContext('2d')!,
      W = c.width,
      k = W / VIEW;
    const ox = w.player.x - VIEW / 2,
      oz = w.player.z - VIEW / 2;
    ctx.fillStyle = '#0a0f24'; // nuit du kit
    ctx.fillRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, ox + WORLD_HALF, oz + WORLD_HALF, VIEW, VIEW, 0, 0, W, W);
    const f = DISCOVER.cell;
    ctx.drawImage(this.fog, (ox + WORLD_HALF) / f, (oz + WORLD_HALF) / f, VIEW / f, VIEW / f, 0, 0, W, W);
    this.marks(ctx, w, ox, oz, k, Math.max(2.5, W / 48), W);
  }

  /** Grande carte : toute la carte, dessinée à l'ouverture. Renvoie la part découverte (0–1). */
  drawBig(w: World): number {
    if (w.seed !== this.seed) this.build(w);
    this.fogCount = -1;
    this.updateFog(w);
    const c = this.big,
      ctx = c.getContext('2d')!,
      W = c.width,
      k = W / SIZE;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, 0, 0, W, W);
    ctx.drawImage(this.fog, 0, 0, W, W);
    this.marks(ctx, w, -WORLD_HALF, -WORLD_HALF, k, Math.max(3, W / 120));
    return w.seenCount / (SEEN_N * SEEN_N);
  }
}
