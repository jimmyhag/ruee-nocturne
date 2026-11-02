import { CHEST, CHOICE, GOLD, LUCK, MAX_PASSIVES, MAX_WEAPONS, WEAPON_MAX, XP } from './balance';
import { Ev, Mode } from './types';
import type { Card, PassiveKey, WeaponKey } from './types';
import { EVOLUTIONS, PASSIVES, PASSIVE_KEYS, WEAPONS, WEAPON_KEYS } from './weapons/defs';
import type { World } from './world';

// pool de cartes réutilisé
const pool: Card[] = [];
const weights: number[] = [];
const picked: number[] = [];
for (let i = 0; i < 20; i++) pool.push({ kind: 'w', key: '', lv: 0 });

/** Évolution disponible (arme niveau max + passif associé, pas encore évoluée), ou null. */
export function availableEvolution(w: World): WeaponKey | null {
  for (const k of WEAPON_KEYS) {
    const ev = EVOLUTIONS[k];
    if (!ev || w.evolved[k]) continue;
    if ((w.weapons[k] ?? 0) >= WEAPON_MAX && (w.passives[ev.passive] ?? 0) >= 1) return k;
  }
  return null;
}

/** Le passif `p` complète une évolution en cours (arme possédée dont c'est le passif associé). */
function completesEvolution(w: World, p: PassiveKey): boolean {
  for (const k of WEAPON_KEYS) {
    const ev = EVOLUTIONS[k];
    if (ev && ev.passive === p && (w.weapons[k] ?? 0) >= CHOICE.evolveFrom && !w.evolved[k]) return true;
  }
  return false;
}

/**
 * Tire 3 cartes (4 avec le Trèfle) selon survivor-design §3. Écrit dans w.cards.
 * `fromChest` : la première carte est l'évolution disponible, garantie.
 */
export function rollChoices(w: World, fromChest = false): void {
  let n = 0;
  const nW = Object.keys(w.weapons).length;
  const nP = Object.keys(w.passives).length;
  weights.length = 0;
  for (const k of WEAPON_KEYS) {
    const lv = w.weapons[k] ?? 0;
    if (lv >= WEAPON_MAX) continue;
    if (lv === 0 && nW >= MAX_WEAPONS) continue;
    const c = pool[n++];
    c.kind = 'w';
    c.key = k;
    c.lv = lv + 1;
    const ev = EVOLUTIONS[k];
    const evolving = lv > 0 && ev && (w.passives[ev.passive] ?? 0) >= 1; // on tient le passif : monter l'arme mène à l'évolution
    weights.push(evolving ? CHOICE.evolveWeight : lv > 0 ? CHOICE.ownedWeight : CHOICE.newWeight);
  }
  for (const k of PASSIVE_KEYS) {
    const lv = w.passives[k] ?? 0;
    if (lv >= PASSIVES[k].max) continue;
    if (lv === 0 && nP >= MAX_PASSIVES) continue;
    const c = pool[n++];
    c.kind = 's';
    c.key = k;
    c.lv = lv + 1;
    weights.push(completesEvolution(w, k) ? CHOICE.evolveWeight : lv > 0 ? CHOICE.ownedWeight : CHOICE.newWeight);
  }
  w.cards.length = 0;
  const evo = fromChest ? availableEvolution(w) : null;
  if (evo) w.cards.push({ kind: 'e', key: evo, lv: WEAPON_MAX + 1 });
  if (n === 0) {
    if (w.cards.length === 0) w.cards.push({ kind: 'heal', key: '', lv: 0 });
    return;
  }
  // Trèfle : +6 % par niveau de proposer une 4e carte
  const want = Math.min(CHOICE.cards + (w.rng.next() < w.player.luck * LUCK.extraCardPerPt ? 1 : 0), n + w.cards.length) - w.cards.length;
  // tirage pondéré sans remise, avec garantie : au moins une arme si < 2 armes possédées
  picked.length = 0;
  let needWeapon = nW < 2;
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
  // jamais 3 passifs de stats pures : si tout est passif et qu'une arme existe dans le pool, elle remplace la dernière
  if (picked.length >= 3 && picked.every((i) => pool[i].kind === 's')) {
    for (let i = 0; i < n; i++) {
      if (pool[i].kind === 'w' && !picked.includes(i)) {
        picked[picked.length - 1] = i;
        break;
      }
    }
  }
  for (const i of picked) w.cards.push({ kind: pool[i].kind, key: pool[i].key, lv: pool[i].lv });
}

export function applyCard(w: World, idx: number): void {
  const c = w.cards[idx];
  if (!c) return;
  if (c.kind === 'w') {
    w.weapons[c.key as WeaponKey] = c.lv;
  } else if (c.kind === 's') {
    w.passives[c.key as PassiveKey] = c.lv;
    PASSIVES[c.key as PassiveKey].apply(w);
  } else if (c.kind === 'e') {
    w.evolved[c.key as WeaponKey] = true;
    w.emit(Ev.Evolve, w.player.x, w.player.y + 1, w.player.z, WEAPON_KEYS.indexOf(c.key as WeaponKey));
  } else {
    w.player.hp = w.player.maxHp;
  }
  w.pending--;
  if (w.chestCards > 0) w.chestCards--;
  if (w.pending > 0) rollChoices(w, w.chestCards > 0);
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
      P.xp += g.v;
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

/** Nombre de cartes d'un coffre : 1 / 3 / 5 (70 / 25 / 5 %, décalés par le Trèfle), boss : 3 à 5. */
export function chestCards(w: World, boss: boolean): number {
  const r = w.rng.next();
  if (boss) return CHEST.bossMin + w.rng.int(CHEST.bossMax - CHEST.bossMin + 1);
  const shift = w.player.luck * CHEST.luckShift;
  if (r < CHEST.p5 + shift) return 5;
  if (r < CHEST.p5 + CHEST.p3 + shift * 2) return 3;
  return 1;
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
      w.gold += CHEST.gold * w.player.goldMul * (c.boss ? GOLD.eliteMul : 1);
      w.emit(Ev.Chest, c.x, 0.5, c.z, n);
      w.freeChest(i);
    }
  }
}

export function cardTitle(c: Card): string {
  if (c.kind === 'w') return WEAPONS[c.key as WeaponKey].name;
  if (c.kind === 's') return PASSIVES[c.key as PassiveKey].name;
  if (c.kind === 'e') return EVOLUTIONS[c.key as WeaponKey]?.name ?? 'Évolution';
  return 'Soin complet';
}
export function cardText(c: Card): string {
  if (c.kind === 'w') {
    const d = WEAPONS[c.key as WeaponKey];
    return d.text(d.stats(c.lv));
  }
  if (c.kind === 's') return PASSIVES[c.key as PassiveKey].text;
  if (c.kind === 'e') return EVOLUTIONS[c.key as WeaponKey]?.text ?? '';
  return 'Rend tous tes PV';
}
