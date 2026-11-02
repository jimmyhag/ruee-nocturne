import { CHOICE, MAX_PASSIVES, MAX_WEAPONS, WEAPON_MAX, XP } from './balance';
import { Ev, Mode } from './types';
import type { Card, PassiveKey, WeaponKey } from './types';
import { PASSIVES, PASSIVE_KEYS, WEAPONS, WEAPON_KEYS } from './weapons/defs';
import type { World } from './world';

// pool de cartes réutilisé
const pool: Card[] = [];
const weights: number[] = [];
for (let i = 0; i < 16; i++) pool.push({ kind: 'w', key: '', lv: 0 });

/** Tire 3 cartes selon les règles de survivor-design §3. Écrit dans w.cards. */
export function rollChoices(w: World): void {
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
    weights.push(lv > 0 ? CHOICE.ownedWeight : CHOICE.newWeight);
  }
  for (const k of PASSIVE_KEYS) {
    const lv = w.passives[k] ?? 0;
    if (lv >= PASSIVES[k].max) continue;
    if (lv === 0 && nP >= MAX_PASSIVES) continue;
    const c = pool[n++];
    c.kind = 's';
    c.key = k;
    c.lv = lv + 1;
    weights.push(lv > 0 ? CHOICE.ownedWeight : CHOICE.newWeight);
  }
  w.cards.length = 0;
  if (n === 0) {
    w.cards.push({ kind: 'heal', key: '', lv: 0 });
    return;
  }
  // tirage pondéré sans remise, avec garantie : au moins une arme si < 2 armes possédées
  const picked: number[] = [];
  const want = Math.min(CHOICE.cards, n);
  let needWeapon = nW < 2;
  while (picked.length < want) {
    let total = 0;
    for (let i = 0; i < n; i++) if (!picked.includes(i) && (!needWeapon || pool[i].kind === 'w')) total += weights[i];
    if (total === 0) {
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
  } else {
    w.player.hp = w.player.maxHp;
  }
  w.pending--;
  if (w.pending > 0) rollChoices(w);
  else w.mode = Mode.Play;
}

export function tickGems(w: World, dt: number): void {
  const P = w.player;
  for (let i = w.gemCount - 1; i >= 0; i--) {
    const g = w.gems[i];
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

export function cardTitle(c: Card): string {
  if (c.kind === 'w') return WEAPONS[c.key as WeaponKey].name;
  if (c.kind === 's') return PASSIVES[c.key as PassiveKey].name;
  return 'Soin complet';
}
export function cardText(c: Card): string {
  if (c.kind === 'w') {
    const d = WEAPONS[c.key as WeaponKey];
    return d.text(d.stats(c.lv));
  }
  if (c.kind === 's') return PASSIVES[c.key as PassiveKey].text;
  return 'Rend tous tes PV';
}
