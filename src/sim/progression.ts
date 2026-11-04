import { CHEST, CHOICE, GOLD, LUCK, RARITY, TOMES, TOME_KEYS, TOME_MAX, TRAIT, WEAPON_LINES, WEAPON_MAX, XP } from './balance';
import type { StatLine } from './balance';
import { Ev, Mode, Trait } from './types';
import type { Card, TomeKey, WeaponKey } from './types';
import { WEAPON_KEYS, applyTomeLine, refreshStats } from './weapons/defs';
import type { World } from './world';

// pool de cartes réutilisé
const pool: Card[] = [];
const weights: number[] = [];
const picked: number[] = [];
for (let i = 0; i < 20; i++) pool.push({ kind: 'w', key: '', lv: 0, n: 1, s0: 0, s1: -1, s2: -1 });

/** Nombre de lignes d'une carte : 1 / 2 / 3, décalé par la chance (RARITY). */
export function rollLineCount(w: World): number {
  const luck = w.player.luck;
  const p3 = RARITY.three + luck * RARITY.luckThree;
  const p2 = RARITY.two + luck * RARITY.luckTwo;
  const r = w.rng.next();
  return r < p3 ? 3 : r < p3 + p2 ? 2 : 1;
}

/** Tire une ligne parmi celles non plafonnées (poids `weight`) ; `taken` = compte déjà pris par ligne. -1 si tout est plafonné. */
function rollLine(w: World, lines: StatLine[], taken: ArrayLike<number>, extra0: number, extra1: number): number {
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const n = taken[i] + (extra0 === i ? 1 : 0) + (extra1 === i ? 1 : 0);
    if (l.max !== undefined && n >= l.max) continue;
    total += l.weight;
  }
  if (total === 0) return -1;
  let r = w.rng.next() * total;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const n = taken[i] + (extra0 === i ? 1 : 0) + (extra1 === i ? 1 : 0);
    if (l.max !== undefined && n >= l.max) continue;
    r -= l.weight;
    if (r <= 0) return i;
  }
  return -1;
}

/** Remplit les lignes s0..s2 d'une carte (n lignes voulues ; moins si tout est plafonné, n reflète le résultat). */
function fillLines(w: World, c: Card, lines: StatLine[], taken: ArrayLike<number>, want: number): void {
  c.s0 = rollLine(w, lines, taken, -1, -1);
  c.s1 = want >= 2 && c.s0 >= 0 ? rollLine(w, lines, taken, c.s0, -1) : -1;
  c.s2 = want >= 3 && c.s1 >= 0 ? rollLine(w, lines, taken, c.s0, c.s1) : -1;
  c.n = c.s2 >= 0 ? 3 : c.s1 >= 0 ? 2 : c.s0 >= 0 ? 1 : 0;
}

/**
 * Tire 3 cartes (4 avec la chance) selon survivor-design §3 : armes et tomes non maxés, pondérés (possédé ×1,6, nouveau ×1,3),
 * chaque carte avec 1 à 3 lignes. Écrit dans w.cards.
 */
export function rollChoices(w: World): void {
  let n = 0;
  const nW = Object.keys(w.weapons).length;
  const nT = Object.keys(w.tomes).length;
  weights.length = 0;
  for (const k of WEAPON_KEYS) {
    const lv = w.weapons[k] ?? 0;
    if (lv >= WEAPON_MAX) continue;
    if (lv === 0 && nW >= w.maxWeapons) continue; // emplacements (phase 10)
    if (lv === 0 && w.unlocked && !w.unlocked.has(k)) continue; // arme pas encore débloquée (succès)
    const c = pool[n];
    c.kind = 'w';
    c.key = k;
    c.lv = lv + 1;
    // une nouvelle arme arrive avec sa base : une seule ligne en prime, tirée comme les autres
    fillLines(w, c, WEAPON_LINES[k], w.wmods[k], rollLineCount(w));
    if (c.n === 0) continue; // toutes les lignes plafonnées : rien à proposer
    n++;
    weights.push(lv > 0 ? CHOICE.ownedWeight : CHOICE.newWeight);
  }
  for (const k of TOME_KEYS) {
    const lv = w.tomes[k] ?? 0;
    if (lv >= TOME_MAX) continue;
    if (lv === 0 && nT >= w.maxTomes) continue;
    const c = pool[n];
    c.kind = 't';
    c.key = k;
    c.lv = lv + 1;
    fillLines(w, c, TOMES[k], w.tmods[k]!, rollLineCount(w));
    if (c.n === 0) continue;
    n++;
    weights.push(lv > 0 ? CHOICE.ownedWeight : CHOICE.newWeight);
  }
  w.cards.length = 0;
  if (n === 0) {
    w.cards.push({ kind: 'heal', key: '', lv: 0, n: 0, s0: -1, s1: -1, s2: -1 });
    return;
  }
  // chance : +6 % par point de proposer une 4e carte
  const want = Math.min(CHOICE.cards + (w.rng.next() < w.player.luck * LUCK.extraCardPerPt ? 1 : 0), n);
  // tirage pondéré sans remise, avec garantie : au moins une arme si < 2 armes possédées et un emplacement libre
  picked.length = 0;
  let needWeapon = nW < 2 && nW < w.maxWeapons;
  while (picked.length < want) {
    let total = 0;
    for (let i = 0; i < n; i++) if (!picked.includes(i) && (!needWeapon || pool[i].kind === 'w')) total += weights[i];
    if (total === 0) {
      if (!needWeapon) break;
      needWeapon = false;
      continue;
    }
    let r = w.rng.next() * total;
    for (let i = 0; i < n; i++) {
      if (picked.includes(i) || (needWeapon && pool[i].kind !== 'w')) continue;
      r -= weights[i];
      if (r <= 0) {
        picked.push(i);
        break;
      }
    }
    needWeapon = false;
  }
  // jamais 3 tomes : si tout est tome et qu'une arme existe dans le pool, elle remplace la dernière
  if (picked.length >= 3 && picked.every((i) => pool[i].kind === 't')) {
    for (let i = 0; i < n; i++) {
      if (pool[i].kind === 'w' && !picked.includes(i)) {
        picked[picked.length - 1] = i;
        break;
      }
    }
  }
  for (const i of picked) {
    const p = pool[i];
    w.cards.push({ kind: p.kind, key: p.key, lv: p.lv, n: p.n, s0: p.s0, s1: p.s1, s2: p.s2 });
  }
}

/** Applique la ligne `s` (≥ 0) d'une carte d'arme ou de tome. */
function applyLine(w: World, c: Card, s: number): void {
  if (s < 0) return;
  if (c.kind === 'w') w.wmods[c.key as WeaponKey][s]++;
  else if (c.kind === 't') {
    const k = c.key as TomeKey;
    w.tmods[k]![s]++;
    applyTomeLine(w, k, s);
  }
}

export function applyCard(w: World, idx: number): void {
  const c = w.cards[idx];
  if (!c) return;
  if (c.kind === 'w') {
    w.weapons[c.key as WeaponKey] = c.lv;
    if (c.lv > w.weaponLvBest) w.weaponLvBest = c.lv;
  } else if (c.kind === 't') {
    w.tomes[c.key as TomeKey] = c.lv;
  } else {
    w.player.hp = w.player.maxHp;
  }
  if (c.kind !== 'heal') {
    applyLine(w, c, c.s0);
    applyLine(w, c, c.s1);
    applyLine(w, c, c.s2);
    if (c.n >= 3) w.triples++;
    refreshStats(w);
  }
  w.pending--;
  if (w.chestCards > 0) w.chestCards--;
  if (w.pending > 0) rollChoices(w);
  else {
    w.chestCards = 0;
    w.mode = Mode.Play;
  }
}

export function tickGems(w: World, dt: number): void {
  const P = w.player;
  for (let i = w.gemCount - 1; i >= 0; i--) {
    const g = w.gems[i];
    g.age += dt;
    const dx = P.x - g.x,
      dz = P.z - g.z;
    const d2 = dx * dx + dz * dz;
    const d = Math.sqrt(d2);
    if (g.mag || d < P.magnet) {
      g.mag = true;
      g.s = Math.min(g.s + XP.magnetAccel * dt, XP.magnetMax);
      const st = Math.min(d, g.s * dt);
      if (d > 1e-6) {
        g.x += (dx / d) * st;
        g.z += (dz / d) * st;
      }
    }
    if (d < XP.pickupRadius) {
      P.xp += g.v * P.xpMul; // tome Savoir
      w.emit(Ev.Pickup, g.x, 0.4, g.z, g.v);
      w.freeGem(i);
    }
  }
  while (P.xp >= P.need) {
    P.xp -= P.need;
    P.level++;
    P.need = XP.needFor(P.level);
    w.pending++;
    w.emit(Ev.LevelUp, P.x, P.y + 1, P.z, P.level);
  }
}

/** Nombre de cartes d'un coffre : 1 / 3 / 5 (70 / 25 / 5 %, décalés par la chance), boss : 3 à 5. */
export function chestCards(w: World, boss: boolean): number {
  const r = w.rng.next();
  if (boss) return CHEST.bossMin + w.rng.int(CHEST.bossMax - CHEST.bossMin + 1);
  const shift = w.player.luck * CHEST.luckShift;
  if (r < CHEST.p5 + shift) return 5;
  if (r < CHEST.p5 + CHEST.p3 + shift * 2) return 3;
  return w.trait === Trait.Marchand ? TRAIT.marchand.minCards : 1; // Colporteur : jamais de coffre à 1 carte
}

export function tickChests(w: World, dt: number): void {
  const P = w.player;
  for (let i = w.chestCount - 1; i >= 0; i--) {
    const c = w.chests[i];
    c.age += dt;
    const dx = P.x - c.x,
      dz = P.z - c.z;
    if (dx * dx + dz * dz < CHEST.pickupR * CHEST.pickupR) {
      const n = chestCards(w, c.boss);
      w.pending += n;
      w.chestCards += n;
      w.gold += CHEST.gold * w.player.goldMul * w.player.chestGoldMul * (c.boss ? GOLD.eliteMul : 1);
      w.emit(Ev.Chest, c.x, 0.5, c.z, n);
      w.freeChest(i);
    }
  }
}
