// Bibliothèque (phase 40) : armes, objets, tomes et synergies, ce qu'on possède et ce qu'on peut débloquer.
// Règle de Jimmy : un succès rend une arme ou un objet achetable, l'or le débloque. On peut aussi retirer un objet
// débloqué du tirage. Module pur : aucun DOM.
import { ITEM_KEYS, ITEM_RARITY, SYNERGIES, TOME_KEYS, UNLOCK } from '../sim/balance';
import type { ItemKey, WeaponKey } from '../sim/types';
import type { World } from '../sim/world';
import { WEAPON_KEYS } from '../sim/weapons/defs';
import { UNLOCKABLE } from './achievements';
import type { Achievement } from './achievements';
import type { Meta } from './save';

export type LibKind = 'w' | 'i';
/** owned : disponible en partie ; buyable / poor : succès obtenu, or suffisant ou non ; locked : succès à obtenir. */
export type EntryState = 'owned' | 'buyable' | 'poor' | 'locked';

/** Succès qui débloque l'entrée, ou undefined si elle est disponible d'office. */
export function unlockAch(kind: LibKind, key: string): Achievement | undefined {
  return UNLOCKABLE.get(`${kind}:${key}`);
}

export function unlockPrice(kind: LibKind, key: string): number {
  if (kind === 'w') return UNLOCK.weapon;
  const i = ITEM_KEYS.indexOf(key as ItemKey);
  return UNLOCK.item[ITEM_RARITY[i] ?? 0];
}

export function entryState(m: Meta, kind: LibKind, key: string): EntryState {
  const a = unlockAch(kind, key);
  if (!a || m.unlocks.includes(`${kind}:${key}`)) return 'owned';
  if (!m.achievements.includes(a.id)) return 'locked';
  return m.gold >= unlockPrice(kind, key) ? 'buyable' : 'poor';
}

/** Achète une arme ou un objet dont le succès est obtenu. Retourne true si l'achat a eu lieu. */
export function buyUnlock(m: Meta, kind: LibKind, key: string): boolean {
  if (entryState(m, kind, key) !== 'buyable') return false;
  m.gold -= unlockPrice(kind, key);
  m.unlocks.push(`${kind}:${key}`);
  return true;
}

/** Objets possédés et laissés dans le tirage. */
export function activeItems(m: Meta): number {
  let n = 0;
  for (const k of ITEM_KEYS) if (entryState(m, 'i', k) === 'owned' && !m.itemsOff.includes(k)) n++;
  return n;
}

/** Objet commun : toujours dans le tirage, on ne peut pas le retirer (retour de Jimmy). */
export function mandatory(key: ItemKey): boolean {
  return ITEM_RARITY[ITEM_KEYS.indexOf(key)] === 0;
}

/** Retire un objet rare ou épique possédé du tirage, ou l'y remet. Refusé (false) s'il n'est pas possédé ou s'il est commun. */
export function toggleItem(m: Meta, key: ItemKey): boolean {
  if (entryState(m, 'i', key) !== 'owned' || mandatory(key)) return false;
  const at = m.itemsOff.indexOf(key);
  if (at >= 0) {
    m.itemsOff.splice(at, 1);
    return true;
  }
  m.itemsOff.push(key);
  return true;
}

/** Objets que la partie ne propose pas : verrouillés ou retirés (WorldOptions.bannedItems). */
export function bannedItems(m: Meta): ItemKey[] {
  return ITEM_KEYS.filter((k) => entryState(m, 'i', k) !== 'owned' || m.itemsOff.includes(k));
}

/** Fin de partie : +1 partie pour chaque arme, objet, tome et synergie présents dans le monde final. */
export function recordCodex(m: Meta, w: World): void {
  const add = (k: string) => (m.codex[k] = Math.min(UNLOCK.codexMax, (m.codex[k] ?? 0) + 1));
  for (const k of WEAPON_KEYS) if ((w.weapons[k] ?? 0) > 0) add(`w:${k}`);
  for (let i = 0; i < ITEM_KEYS.length; i++) if (w.items[i] > 0) add(`i:${ITEM_KEYS[i]}`);
  for (const k of TOME_KEYS) if ((w.tomes[k] ?? 0) > 0) add(`t:${k}`);
  for (let i = 0; i < SYNERGIES.length; i++) if (w.syn[i]) add(`s:${SYNERGIES[i].key}`);
}

/** Entrées de la Bibliothèque par onglet (ordre d'affichage). */
export const LIB_WEAPONS: readonly WeaponKey[] = WEAPON_KEYS;
