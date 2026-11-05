// Points d'intérêt (phase 18, PLAN §3.6) : coffres de carte (payés avec l'or de la partie, prix croissant) et sanctuaires
// (rester dedans SHRINE.charge s pour choisir un bonus permanent). Placés avec la carte (graine de la carte), sur les
// hauteurs et dans les lieux construits ; lus par le rendu (colonnes de lumière, prix) et par les bots.
import { BOON, BOON_KEYS, ITEM, It, MAPCHEST, SHRINE, TERRAIN, TOME_CAPS, WORLD_HALF } from './balance';
import { canGainItem } from './items';
import { Ev } from './types';
import type { BoonKey, Card } from './types';
import { refreshStats } from './weapons/defs';
import type { Rng } from './rng';
import type { World } from './world';

export interface MapChest {
  x: number;
  z: number;
  open: boolean;
  hold: number; // s passées dessus (ouverture à MAPCHEST.hold)
}
export interface Shrine {
  x: number;
  z: number;
  used: boolean;
  charge: number; // s (pleine à SHRINE.charge)
}

/** Une case est libre pour un point d'intérêt : pas d'obstacle dans `pad` u, pas dans un lac, dans la carte. */
function free(w: World, x: number, z: number, pad: number): boolean {
  const lim = WORLD_HALF - 14;
  if (x < -lim || x > lim || z < -lim || z > lim) return false;
  for (const l of w.lakes) if ((x - l.x) ** 2 + (z - l.z) ** 2 < (l.r + 3) ** 2) return false;
  const N = w.solidN;
  for (let dz = -pad; dz <= pad; dz += 1)
    for (let dx = -pad; dx <= pad; dx += 1) {
      const i = Math.floor(x + dx + WORLD_HALF),
        j = Math.floor(z + dz + WORLD_HALF);
      if (i < 0 || j < 0 || i >= N || j >= N || w.solid[j * N + i]) return false;
    }
  return true;
}
const spaced = (list: { x: number; z: number }[], x: number, z: number, d: number): boolean => {
  for (const p of list) if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d) return false;
  return true;
};

/** Place coffres de carte et sanctuaires (après le relief : on préfère les sommets). */
export function buildPOI(w: World, r: Rng): void {
  const all: { x: number; z: number }[] = [];
  // coffres dans les lieux construits : au centre (cour d'une ruine, milieu d'un cercle de pierres)
  const wantPlaces = Math.round(MAPCHEST.count * MAPCHEST.placeShare);
  const order = w.places.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const k = Math.floor(r.next() * (i + 1));
    [order[i], order[k]] = [order[k], order[i]];
  }
  for (const i of order) {
    if (w.mapChests.length >= wantPlaces) break;
    const p = w.places[i];
    for (let t = 0; t < 12; t++) {
      const a = r.range(0, 6.283),
        d = r.range(0, p.r * 0.5),
        x = p.x + Math.sin(a) * d,
        z = p.z + Math.cos(a) * d;
      if (x * x + z * z < MAPCHEST.fromStart ** 2 || !free(w, x, z, 2) || !spaced(all, x, z, MAPCHEST.spacing)) continue;
      w.mapChests.push({ x, z, open: false, hold: 0 });
      all.push({ x, z });
      break;
    }
  }
  // le reste sur les hauteurs : tirages acceptés d'autant plus volontiers que le point est haut
  const high = (n: number, spacing: number, fromStart: number, push: (x: number, z: number) => void) => {
    let placed = 0;
    for (let t = 0; t < 6000 && placed < n; t++) {
      const x = r.range(-WORLD_HALF, WORLD_HALF),
        z = r.range(-WORLD_HALF, WORLD_HALF);
      if (x * x + z * z < fromStart * fromStart) continue;
      const h = w.heightAt(x, z) / TERRAIN.peak;
      if (r.next() > 0.15 + 0.85 * h * h) continue;
      if (!free(w, x, z, 3) || !spaced(all, x, z, spacing)) continue;
      push(x, z);
      all.push({ x, z });
      placed++;
    }
  };
  high(MAPCHEST.count - w.mapChests.length, MAPCHEST.spacing, MAPCHEST.fromStart, (x, z) =>
    w.mapChests.push({ x, z, open: false, hold: 0 }),
  );
  high(SHRINE.count, SHRINE.spacing, SHRINE.fromStart, (x, z) => w.shrines.push({ x, z, used: false, charge: 0 }));
}

/** Prix du prochain coffre de carte (la Bourse du colporteur le baisse aussi). */
export function mapChestPrice(w: World): number {
  const base = MAPCHEST.price * Math.pow(1 + MAPCHEST.growth, w.mapChestsOpened);
  return Math.round(base * (w.items[It.Bourse] ? 1 - ITEM.bourse.discount : 1));
}
/** Le coffre de carte peut-il être ouvert maintenant (or et place) ? */
export function canOpenMapChest(w: World): boolean {
  return canGainItem(w) && w.gold >= mapChestPrice(w);
}

/** Coffres de carte et sanctuaires, à chaque pas de jeu (Mode.Play). ≈ 30 tests de distance, aucune allocation. */
export function tickPOI(w: World, dt: number): void {
  const P = w.player;
  const onGround = P.onGround;
  const cr2 = MAPCHEST.r * MAPCHEST.r;
  for (let i = 0; i < w.mapChests.length; i++) {
    const c = w.mapChests[i];
    if (c.open) continue;
    const inside = (c.x - P.x) ** 2 + (c.z - P.z) ** 2 < cr2;
    if (!inside || !onGround || !canOpenMapChest(w)) {
      c.hold = 0;
      continue;
    }
    c.hold += dt;
    if (c.hold >= MAPCHEST.hold) {
      const price = mapChestPrice(w);
      c.open = true;
      w.gold -= price;
      w.goldSpent += price;
      w.mapChestsOpened++;
      w.itemPicks++;
      w.emit(Ev.MapChestOpen, c.x, 0.5, c.z, price);
    }
  }
  const sr2 = SHRINE.r * SHRINE.r;
  for (let i = 0; i < w.shrines.length; i++) {
    const s = w.shrines[i];
    if (s.used) continue;
    const inside = (s.x - P.x) ** 2 + (s.z - P.z) ** 2 < sr2;
    if (inside) s.charge += dt;
    else if (s.charge > 0) s.charge = Math.max(0, s.charge - dt * SHRINE.decay);
    if (s.charge >= SHRINE.charge) {
      s.used = true;
      w.shrinesUsed++;
      w.boonPicks++;
      w.emit(Ev.ShrineDone, s.x, 0.2, s.z);
    }
  }
}

/** Tire SHRINE.offers bonus distincts dans `out` (kind 'b'). Allocation de cartes : hors boucle chaude (un sanctuaire). */
export function rollBoonChoices(w: World, out: Card[]): void {
  out.length = 0;
  const pool = BOON_KEYS.slice();
  for (let k = 0; k < SHRINE.offers && pool.length > 0; k++) {
    const i = Math.floor(w.rng.next() * pool.length);
    out.push({ kind: 'b', key: pool[i], lv: 0, n: 1, s0: -1, s1: -1, s2: -1 });
    pool.splice(i, 1);
  }
}

/** Applique un bonus de sanctuaire (permanent pour la partie). */
export function applyBoon(w: World, key: BoonKey): void {
  const P = w.player;
  switch (key) {
    case 'hp':
      P.maxHp += BOON.hp;
      P.hp += BOON.hp;
      break;
    case 'dmg':
      P.dmgMul += BOON.dmg;
      break;
    case 'speed':
      P.speed *= 1 + BOON.speed;
      break;
    case 'cd':
      P.cdMul = Math.max(TOME_CAPS.cdMin, P.cdMul - BOON.cd);
      break;
    case 'magnet':
      P.magnet *= 1 + BOON.magnet;
      break;
    case 'gold':
      P.goldMul += BOON.gold;
      break;
  }
  w.boons[BOON_KEYS.indexOf(key)]++;
  refreshStats(w);
}
