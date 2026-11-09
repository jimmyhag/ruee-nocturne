// Achats permanents à l'or : personnages, tenues, emplacements (phase 17 : plus de boutique par personnage), et
// traduction de la méta en options de monde pour la sim.
import { CHARACTERS, MAX_PASSIVES, MAX_WEAPONS, OUTFIT, REROLL_SHOP, RUN_REROLL, SLOTS } from '../sim/balance';
import type { CharacterKey } from '../sim/types';
import type { WorldOptions } from '../sim/types';
import type { Meta } from './save';
import { bannedItems } from './library';

/** Prix d'un personnage en or (0 : pas en vente, il se débloque par un succès). */
export function characterPrice(key: CharacterKey): number {
  return CHARACTERS.find((c) => c.key === key)?.price ?? 0;
}

/** Achète un personnage en vente si l'or suffit et qu'il n'est pas déjà possédé. Retourne true si l'achat a eu lieu. */
export function buyCharacter(m: Meta, key: CharacterKey): boolean {
  const price = characterPrice(key);
  if (price <= 0 || m.bought.includes(key) || m.gold < price) return false;
  m.gold -= price;
  m.bought.push(key);
  return true;
}

/** Tenue choisie pour un personnage : 0 (classique) tant que l'alternative n'est pas achetée. */
export function outfitOf(m: Meta, key: CharacterKey): number {
  const o = m.outfit[key] ?? 0;
  if (o === 2) return masterOutfit(m, key) ? 2 : 0; // phase 41 : tenue de maître (défi III)
  return o === 1 && m.outfits.includes(key) ? 1 : 0;
}
/** Phase 41 : la tenue de maître est à toi quand le défi III du personnage est obtenu. */
export const masterOutfit = (m: Meta, key: CharacterKey): boolean => m.achievements.includes(`c_${key}_3`);

/** Achète la tenue alternative d'un personnage si l'or suffit, et la choisit. Retourne true si l'achat a eu lieu. */
export function buyOutfit(m: Meta, key: CharacterKey): boolean {
  if (m.outfits.includes(key) || m.gold < OUTFIT.price) return false;
  m.gold -= OUTFIT.price;
  m.outfits.push(key);
  m.outfit[key] = 1;
  return true;
}

/** État d'un déblocage d'emplacement (index dans SLOTS). */
export type SlotState = 'owned' | 'buyable' | 'poor' | 'locked' | 'later';
export function slotState(m: Meta, i: number): SlotState {
  const u = SLOTS[i];
  const have = u.kind === 'weapon' ? m.slots.weapons : m.slots.passives;
  if (have >= u.n) return 'owned';
  if (have !== u.n - 1) return 'later'; // le précédent du même type n'est pas encore pris
  if (u.ach && !m.achievements.includes(u.ach)) return 'locked';
  return m.gold >= u.price ? 'buyable' : 'poor';
}
/** Achète un emplacement (succès obtenu, précédent pris, or suffisant). Retourne true si l'achat a eu lieu. */
export function buySlot(m: Meta, i: number): boolean {
  if (slotState(m, i) !== 'buyable') return false;
  const u = SLOTS[i];
  m.gold -= u.price;
  if (u.kind === 'weapon') m.slots.weapons = u.n;
  else m.slots.passives = u.n;
  return true;
}
/** Prochain emplacement non possédé (écran de mort, résumé du menu), ou -1. */
export function nextSlot(m: Meta): number {
  for (let i = 0; i < SLOTS.length; i++) if (slotState(m, i) !== 'owned') return i;
  return -1;
}

/** Relances (phase 31) : état de la k-ième relance achetable (0 = la première au-delà de celle du départ). */
export type RerollState = 'owned' | 'buyable' | 'poor' | 'later';
export function rerollState(m: Meta, k: number): RerollState {
  const have = m.slots.rerolls;
  if (k < have) return 'owned';
  if (k > have) return 'later';
  return m.gold >= REROLL_SHOP[k] ? 'buyable' : 'poor';
}
/** Achète la relance suivante si l'or suffit. Retourne true si l'achat a eu lieu. */
export function buyReroll(m: Meta): boolean {
  const k = m.slots.rerolls;
  if (k >= REROLL_SHOP.length || m.gold < REROLL_SHOP[k]) return false;
  m.gold -= REROLL_SHOP[k];
  m.slots.rerolls = k + 1;
  return true;
}
/** Relances par partie : celle du départ plus celles achetées. */
export const runRerolls = (m: Meta): number => RUN_REROLL.base + m.slots.rerolls;

/**
 * Options de monde issues de la méta (personnage choisi, armes débloquées, emplacements).
 * `daily` : égalité entre joueurs — Éclaireuse, toutes les armes, tous les objets, tous les emplacements (même pool de
 * cartes pour tous).
 */
export function worldOptions(m: Meta, unlocked: WorldOptions['unlocked'], daily = false): WorldOptions {
  return {
    character: daily ? 'eclaireuse' : m.character,
    unlocked: daily ? undefined : unlocked,
    slots: daily
      ? { weapons: MAX_WEAPONS, passives: MAX_PASSIVES }
      : { weapons: m.slots.weapons, passives: m.slots.passives }, // défi du jour : égalité
    rerolls: daily ? RUN_REROLL.base : runRerolls(m), // phase 31 : relances de cartes
    bannedItems: daily ? undefined : bannedItems(m), // phase 40 : objets verrouillés ou retirés du tirage
  };
}
