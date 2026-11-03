// Boutique permanente (survivor-design §8) : coûts, achat, et traduction en options de monde pour la sim.
import { CHARACTERS, OUTFIT, SHOP } from '../sim/balance';
import type { CharacterKey } from '../sim/types';
import type { WorldOptions } from '../sim/types';
import type { Meta } from './save';

/** Coût du prochain palier d'une ligne (palier courant `tier`), ou Infinity si la ligne est au max. */
export function shopCost(line: number, tier: number): number {
  const l = SHOP.lines[line];
  if (!l || tier >= l.tiers) return Infinity;
  return Math.round(SHOP.base * Math.pow(SHOP.growth, tier));
}

/** Paliers d'un personnage (zéros s'il n'a rien acheté) ; le tableau retourné n'est pas partagé avec la méta. */
export function shopTiers(m: Meta, key: CharacterKey): number[] {
  const t = m.shops[key];
  return SHOP.lines.map((_, i) => t?.[i] ?? 0);
}

/** Achète le prochain palier d'une ligne pour un personnage si l'or suffit. Retourne true si l'achat a eu lieu. */
export function buy(m: Meta, key: CharacterKey, line: number): boolean {
  const tiers = shopTiers(m, key);
  const cost = shopCost(line, tiers[line]);
  if (!Number.isFinite(cost) || m.gold < cost) return false;
  m.gold -= cost;
  tiers[line] += 1;
  m.shops[key] = tiers;
  return true;
}

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
  return m.outfits.includes(key) ? (m.outfit[key] ?? 0) : 0;
}

/** Achète la tenue alternative d'un personnage si l'or suffit, et la choisit. Retourne true si l'achat a eu lieu. */
export function buyOutfit(m: Meta, key: CharacterKey): boolean {
  if (m.outfits.includes(key) || m.gold < OUTFIT.price) return false;
  m.gold -= OUTFIT.price;
  m.outfits.push(key);
  m.outfit[key] = 1;
  return true;
}

/**
 * Options de monde issues de la méta (personnage choisi, paliers, armes débloquées).
 * `daily` : égalité entre joueurs — Éclaireuse, boutique ignorée, toutes les armes (même pool de cartes pour tous).
 */
export function worldOptions(m: Meta, unlocked: WorldOptions['unlocked'], daily = false): WorldOptions {
  return {
    character: daily ? 'eclaireuse' : m.character,
    upgrades: daily ? SHOP.lines.map(() => 0) : shopTiers(m, m.character),
    unlocked: daily ? undefined : unlocked,
  };
}
