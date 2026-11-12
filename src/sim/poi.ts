// Points d'intérêt (phase 18, PLAN §3.6) : coffres de carte (payés avec l'or de la partie, prix croissant) et sanctuaires
// (rester dedans SHRINE.charge s pour choisir un bonus permanent). Placés avec la carte (graine de la carte), sur les
// hauteurs et dans les lieux construits ; lus par le rendu (colonnes de lumière, prix) et par les bots.
import { BLOOD, BOON, BOON_KEYS, DIFFICULTY, ITEM, It, MAPCHEST, RACE, SHRINE, STAGE, TERRAIN, TOME_CAPS, WORLD_HALF } from './balance';
import { bellRing, bourseDiscount, canGainItem } from './items';
import { Ev } from './types';
import type { BoonKey, Card, Player } from './types';
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
/** Crâne de difficulté (phase 48) : rester dedans DIFFICULTY.skullCharge s monte la difficulté de la partie. */
export interface Skull {
  x: number;
  z: number;
  on: boolean; // activé (une fois)
  charge: number; // s (plein à DIFFICULTY.skullCharge)
}

/** Piste chronométrée (phase 28) : arche de départ (en haut d'une grande piste) et d'arrivée (au pied). */
export interface Race {
  sx: number;
  sz: number;
  fx: number;
  fz: number;
  time: number; // s allouées
  state: number; // 0 prête, 1 en cours, 2 gagnée, 3 à réarmer (après un échec, s'éloigner du départ)
  t: number; // s restantes (en cours)
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
  // phase 28 : une piste chronométrée par grande piste (départ un peu en aval du sommet, arrivée au pied)
  for (const p of w.pistes) {
    const L = Math.hypot(p.x1 - p.x0, p.z1 - p.z0),
      ux = (p.x1 - p.x0) / L,
      uz = (p.z1 - p.z0) / L;
    w.races.push({ sx: p.x0 + ux * RACE.startDown, sz: p.z0 + uz * RACE.startDown, fx: p.x1, fz: p.z1, time: L / RACE.refSpeed, state: 0, t: 0 });
  }
  const chestAt = (x: number, z: number, pad: number): boolean => {
    if (w.mapChests.length >= MAPCHEST.count) return false;
    if (x * x + z * z < MAPCHEST.fromStart ** 2 || !free(w, x, z, pad) || !spaced(all, x, z, MAPCHEST.spacing)) return false;
    w.mapChests.push({ x, z, open: false, hold: 0 });
    all.push({ x, z });
    return true;
  };
  // phase 27 : un coffre au milieu de chaque campement, puis au pied des rampes et au fond des combes (la glisse y mène)
  for (const c of w.camps) chestAt(c.x, c.z, 1);
  const glide: [number, number][] = [];
  for (const m of w.ramps) if (m.h1 === 0) glide.push([m.x1, m.z1]);
  for (const c of w.combes) glide.push([c.pts[2], c.pts[3]]);
  for (let i = glide.length - 1; i > 0; i--) {
    const k = Math.floor(r.next() * (i + 1));
    [glide[i], glide[k]] = [glide[k], glide[i]];
  }
  const wantGlide = w.mapChests.length + Math.round(MAPCHEST.count * MAPCHEST.glideShare);
  for (const [x, z] of glide) if (w.mapChests.length < wantGlide) chestAt(x, z, 2);
  // coffres dans les lieux construits : au centre (cour d'une ruine, milieu d'un cercle de pierres)
  const wantPlaces = w.mapChests.length + Math.round(MAPCHEST.count * MAPCHEST.placeShare);
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
  placeTotem(w, r, all);
  placeSkulls(w, r, all);
}

/**
 * Phase 48 : les crânes de difficulté, tirés après tout le reste (coffres, sanctuaires et totem d'une graine ne bougent
 * pas). N'importe où sur la carte, hors de la clairière, à l'écart des autres points d'intérêt et les uns des autres.
 */
function placeSkulls(w: World, r: Rng, all: { x: number; z: number }[]): void {
  const D = DIFFICULTY,
    T = w.totem;
  for (let t = 0; t < D.skullTries && w.skulls.length < D.skullCount; t++) {
    const x = r.range(-WORLD_HALF, WORLD_HALF),
      z = r.range(-WORLD_HALF, WORLD_HALF);
    if (x * x + z * z < D.skullFromStart * D.skullFromStart) continue;
    if ((x - T.x) ** 2 + (z - T.z) ** 2 < STAGE.totemSpacing * STAGE.totemSpacing) continue;
    if (!free(w, x, z, 2) || !spaced(all, x, z, D.skullFromPoi) || !spaced(w.skulls, x, z, D.skullSpacing)) continue;
    w.skulls.push({ x, z, on: false, charge: 0 });
  }
}

/**
 * Phase 37 : le totem du monde, tiré en dernier (les autres points d'intérêt d'une graine ne bougent pas). Sur du plat
 * dégagé (le combat de boss s'y joue), à STAGE.totemFrom u du départ, loin des autres points d'intérêt.
 */
function placeTotem(w: World, r: Rng, all: { x: number; z: number }[]): void {
  const T = w.totem;
  T.charge = 0;
  T.state = 0;
  let fx = 0,
    fz = STAGE.totemFrom[0];
  for (let t = 0; t < STAGE.totemTries; t++) {
    const a = r.range(0, Math.PI * 2),
      d = r.range(STAGE.totemFrom[0], STAGE.totemFrom[1]);
    const x = Math.sin(a) * d,
      z = Math.cos(a) * d;
    if (!free(w, x, z, STAGE.totemPad)) continue;
    fx = x;
    fz = z;
    // plat : peu d'écart de hauteur sur le cercle du combat
    const h = w.heightAt(x, z);
    let flat = true;
    for (let k = 0; k < 8 && flat; k++) {
      const b = (k / 8) * Math.PI * 2;
      if (Math.abs(w.heightAt(x + Math.sin(b) * STAGE.totemPad, z + Math.cos(b) * STAGE.totemPad) - h) > STAGE.totemFlat) flat = false;
    }
    if (!flat || !spaced(all, x, z, STAGE.totemSpacing)) continue;
    break;
  }
  T.x = fx;
  T.z = fz;
}

/** Prix du prochain coffre de carte : +MAPCHEST.growth par coffre acheté (la Bourse du colporteur le baisse aussi). */
export function mapChestPrice(w: World): number {
  // 1.33.1 (demande de Jimmy) : le prix ne monte qu'à chaque coffre acheté, ni avec le temps ni avec les objets portés
  const base = MAPCHEST.price * Math.pow(1 + MAPCHEST.growth, w.mapChestsOpened);
  // phase 47 B : Clé rouillée
  const key = Math.max(ITEM.cle.min, 1 - ITEM.cle.discount * w.itemEff[It.Cle]);
  return Math.round(base * bourseDiscount(w) * key);
}
/**
 * Le coffre de carte peut-il être ouvert maintenant ? Il faut l'or. Il donne un objet (phase 38 : sans limite, ils se
 * cumulent) ; un bonus de sanctuaire seulement si aucun objet n'est possible (tous bannis, CLI d'ablation).
 */
export function canOpenMapChest(w: World): boolean {
  return w.gold >= mapChestPrice(w);
}

/** Coffres de carte et sanctuaires, à chaque pas de jeu (Mode.Play). ≈ 30 tests de distance, aucune allocation. */
export function tickPOI(w: World, dt: number): void {
  const P = w.player;
  tickRaces(w, dt);
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
      if (canGainItem(w)) w.itemPicks++;
      else w.boonPicks++; // aucun objet possible : un bonus pour la partie
      w.emit(Ev.MapChestOpen, c.x, 0.5, c.z, price);
    }
  }
  const sr2 = SHRINE.r * SHRINE.r;
  const fast = 1 + ITEM.encens.charge * w.itemEff[It.Encens]; // phase 47 B : Encens
  w.inShrine = false;
  for (let i = 0; i < w.shrines.length; i++) {
    const s = w.shrines[i];
    if (s.used) continue;
    const inside = (s.x - P.x) ** 2 + (s.z - P.z) ** 2 < sr2;
    if (inside) {
      s.charge += dt * fast;
      w.inShrine = true; // Coquille
    } else if (s.charge > 0) s.charge = Math.max(0, s.charge - dt * SHRINE.decay);
    if (s.charge >= SHRINE.charge) {
      s.used = true;
      w.shrinesUsed++;
      w.boonPicks++;
      w.emit(Ev.ShrineDone, s.x, 0.2, s.z);
      bellRing(w); // phase 47 B : Cloche de bronze
    }
  }
  // phase 48 : crânes de difficulté (même jauge qu'un sanctuaire, Encens compris)
  const kr2 = DIFFICULTY.skullR * DIFFICULTY.skullR;
  for (let i = 0; i < w.skulls.length; i++) {
    const s = w.skulls[i];
    if (s.on) continue;
    if ((s.x - P.x) ** 2 + (s.z - P.z) ** 2 < kr2) s.charge += dt * fast;
    else if (s.charge > 0) s.charge = Math.max(0, s.charge - dt * DIFFICULTY.skullDecay);
    if (s.charge >= DIFFICULTY.skullCharge) {
      s.on = true;
      w.skullsOn++;
      P.difficulty += DIFFICULTY.skullStep;
      w.emit(Ev.SkullOn, s.x, 0.2, s.z, P.difficulty);
    }
  }
}

/** Un bonus au plafond de sa stat (armure, recharges) n'apporterait rien : il n'est plus proposé. */
export function boonCapped(w: World, key: BoonKey): boolean {
  const P = w.player;
  return key === 'armor'
    ? P.armor >= TOME_CAPS.armorMax - 1e-9
    : key === 'cd'
      ? P.cdMul <= TOME_CAPS.cdMin + 1e-9
      : key === 'spell'
        ? P.spellCdMul <= TOME_CAPS.spellCdMin + 1e-9
        : key === 'steal'
          ? P.steal * BLOOD.capPerSteal + P.stealCap >= BLOOD.heroMax - 1e-9 // réserve du héros pleine : plus rien à gagner
          : false;
}

/** Tire SHRINE.offers bonus distincts dans `out` (kind 'b'). Allocation de cartes : hors boucle chaude (un sanctuaire). */
export function rollBoonChoices(w: World, out: Card[]): void {
  out.length = 0;
  const pool = BOON_KEYS.filter((k) => !boonCapped(w, k));
  const offers = SHRINE.offers + Math.round(ITEM.grimoire.offers * w.items[It.Grimoire]); // phase 47 B : Grimoire
  for (let k = 0; k < offers && pool.length > 0; k++) {
    const i = Math.floor(w.rng.next() * pool.length);
    out.push({ kind: 'b', key: pool[i], lv: 0, n: 1, s0: -1, s1: -1, s2: -1 });
    pool.splice(i, 1);
  }
}

/**
 * Effet d'un bonus de sanctuaire sur un joueur. Sans autre effet de bord : l'interface l'applique à une copie pour
 * afficher « valeur actuelle → nouvelle valeur ».
 */
export function boonApply(P: Player, key: BoonKey): void {
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
    case 'spell': // phase 22 : sanctuaire de l'arcane
      P.spellCdMul = Math.max(TOME_CAPS.spellCdMin, P.spellCdMul * (1 - BOON.spell));
      break;
    case 'magnet':
      P.magnet *= 1 + BOON.magnet;
      break;
    case 'gold':
      P.goldMul += BOON.gold;
      break;
    // phase 47 : toutes les stats
    case 'regen':
      P.regen += BOON.regen;
      break;
    case 'armor':
      P.armor = Math.min(TOME_CAPS.armorMax, P.armor + BOON.armor);
      break;
    case 'steal':
      P.steal += BOON.steal;
      break;
    case 'crit':
      P.crit += BOON.crit;
      break;
    case 'critdmg':
      P.critMul += BOON.critdmg;
      break;
    case 'elite':
      P.eliteDmgMul += BOON.elite;
      break;
    case 'size':
      P.sizeMul += BOON.size;
      break;
    case 'jump':
      P.jumpMul *= 1 + BOON.jump;
      break;
    case 'spellpow':
      P.spellPow += BOON.spellpow;
      break;
    case 'luck':
      P.luck += BOON.luck;
      break;
    case 'xp':
      P.xpMul += BOON.xp;
      break;
  }
}

/** Applique un bonus de sanctuaire (permanent pour la partie). */
export function applyBoon(w: World, key: BoonKey): void {
  boonApply(w.player, key);
  w.boons[BOON_KEYS.indexOf(key)]++;
  refreshStats(w);
}

/** Pistes chronométrées (phase 28) : une seule en cours à la fois ; gagnée une fois, ratée on peut réessayer. */
function tickRaces(w: World, dt: number): void {
  const P = w.player,
    r2 = RACE.r * RACE.r;
  let running = false;
  for (let i = 0; i < w.races.length; i++) if (w.races[i].state === 1) running = true;
  for (let i = 0; i < w.races.length; i++) {
    const c = w.races[i];
    const ds = (c.sx - P.x) ** 2 + (c.sz - P.z) ** 2;
    if (c.state === 3 && ds > RACE.rearm * RACE.rearm) c.state = 0;
    if (c.state === 0 && !running && ds < r2) {
      c.state = 1;
      c.t = c.time;
      running = true;
      w.emit(Ev.RaceStart, c.sx, 0, c.sz, c.time, c.fx, 0, c.fz);
    } else if (c.state === 1) {
      c.t -= dt;
      if ((c.fx - P.x) ** 2 + (c.fz - P.z) ** 2 < r2) {
        c.state = 2;
        running = false;
        if (canGainItem(w)) w.itemPicks++;
        else w.boonPicks++;
        w.racesWon++;
        w.emit(Ev.RaceWin, c.fx, 0.5, c.fz, c.time - c.t);
      } else if (c.t <= 0) {
        c.state = 3;
        running = false;
        w.emit(Ev.RaceFail, P.x, 0, P.z);
      }
    }
  }
}
