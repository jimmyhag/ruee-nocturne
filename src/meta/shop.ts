// Boutique permanente (survivor-design §8) : coûts, achat, et traduction en options de monde pour la sim.
import { CHARACTERS, SHOP } from '../sim/balance';
import type { CharacterKey } from '../sim/types';
import type { WorldOptions } from '../sim/types';
import type { Meta } from './save';

/** Coût du prochain palier d'une ligne (palier courant `tier`), ou Infinity si la ligne est au max. */
export function shopCost(line: number, tier: number): number {
  const l = SHOP.lines[line];
  if (!l || tier >= l.tiers) return Infinity;
  return Math.round(SHOP.base * Math.pow(SHOP.growth, tier));
}

/** Achète le prochain palier si l'or suffit. Retourne true si l'achat a eu lieu. */
export function buy(m: Meta, line: number): boolean {
  const cost = shopCost(line, m.shop[line] ?? 0);
  if (!Number.isFinite(cost) || m.gold < cost) return false;
  m.gold -= cost;
  m.shop[line] = (m.shop[line] ?? 0) + 1;
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

/**
 * Options de monde issues de la méta (personnage choisi, paliers, armes débloquées).
 * `daily` : égalité entre joueurs — Éclaireuse, boutique ignorée, toutes les armes (même pool de cartes pour tous).
 */
export function worldOptions(m: Meta, unlocked: WorldOptions['unlocked'], daily = false): WorldOptions {
  return {
    character: daily ? 'eclaireuse' : m.character,
    upgrades: daily ? SHOP.lines.map(() => 0) : [...m.shop],
    unlocked: daily ? undefined : unlocked,
  };
}
