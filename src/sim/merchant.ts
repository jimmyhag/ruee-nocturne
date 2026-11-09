// Marchand (phase 17, PLAN §3.6) : une échoppe s'installe près du joueur aux heures MERCHANT.times et reste
// MERCHANT.stay s. Y entrer met la partie en pause (Mode.Merchant) : objets en vente (w.offers, kind 'i'), relance, départ.
// On paie avec l'or de la partie ; ce qui n'est pas dépensé reste acquis à la fin du run.
import { MERCHANT } from './balance';
import { canGainItem, gainItem, itemIndex, merchantOffers, rollItemChoices } from './items';
import { Ev, Mode } from './types';
import type { ItemKey } from './types';
import type { World } from './world';

/** Code d'entrée (Input.pick) pendant l'échoppe : ≥ 0 achète l'offre i ; MERCHANT_REROLL relance ; MERCHANT_LEAVE part. */
export const MERCHANT_REROLL = 10;
export const MERCHANT_LEAVE = 11;

export interface MerchantState {
  active: boolean;
  x: number;
  z: number;
  until: number; // temps de jeu du départ
  visit: number; // visites passées (hausse des prix) ; -1 tant qu'aucune
  next: number; // index de la prochaine apparition dans MERCHANT.times
  rolled: boolean; // offres tirées pour cette visite
  inside: boolean; // le joueur est dans l'échoppe (il doit en sortir pour la rouvrir)
  rerolls: number;
}
export function makeMerchant(): MerchantState {
  return { active: false, x: 0, z: 0, until: 0, visit: -1, next: 0, rolled: false, inside: false, rerolls: 0 };
}

const TAU = Math.PI * 2;
const out2 = new Float64Array(2);

/** Apparition, départ, entrée du joueur. Appelé à chaque pas de jeu (Mode.Play). */
export function tickMerchant(w: World): void {
  const M = w.merchant;
  // phase 37 : aux heures MERCHANT.times de chaque monde (chrono du monde)
  if (!M.active && M.next < MERCHANT.times.length && w.stageT >= MERCHANT.times[M.next]) {
    M.next++;
    // place libre près du joueur : quelques essais autour de lui, repoussée hors des obstacles
    const P = w.player;
    for (let k = 0; k < MERCHANT.placeTries; k++) {
      const a = w.rng.range(0, TAU),
        d = w.rng.range(MERCHANT.distMin, MERCHANT.distMax);
      w.resolveObstacles(P.x + Math.sin(a) * d, P.z + Math.cos(a) * d, MERCHANT.r + MERCHANT.placeMargin, out2, 0);
      M.x = out2[0];
      M.z = out2[1];
      if (!w.nearObstacle(M.x, M.z) || k === MERCHANT.placeTries - 1) break;
    }
    M.active = true;
    M.until = w.stageT + MERCHANT.stay;
    M.visit++;
    M.rolled = false;
    M.inside = false;
    M.rerolls = 0;
    w.emit(Ev.MerchantArrive, M.x, 0, M.z, MERCHANT.stay);
  }
  if (!M.active) return;
  if (w.stageT >= M.until) {
    M.active = false;
    w.emit(Ev.MerchantLeave, M.x, 0, M.z);
    return;
  }
  const dx = w.player.x - M.x,
    dz = w.player.z - M.z,
    inside = dx * dx + dz * dz < MERCHANT.r * MERCHANT.r;
  if (inside && !M.inside) {
    M.inside = true;
    if (!M.rolled) {
      rollItemChoices(w, merchantOffers(w), true, w.offers);
      M.rolled = true;
    }
    w.mode = Mode.Merchant;
  } else if (!inside) M.inside = false;
}

/** Entrée pendant l'échoppe : achat, relance ou départ. */
export function merchantInput(w: World, pick: number): void {
  const M = w.merchant;
  if (pick === MERCHANT_LEAVE) {
    w.mode = Mode.Play;
    return;
  }
  if (pick === MERCHANT_REROLL) {
    const cost = rerollCost(w);
    if (w.gold < cost) return;
    w.gold -= cost;
    M.rerolls++;
    rollItemChoices(w, merchantOffers(w), true, w.offers);
    return;
  }
  const c = w.offers[pick];
  if (!c || c.kind !== 'i' || c.s1 === 1 || w.gold < c.s0 || !canGainItem(w)) return;
  w.gold -= c.s0;
  w.goldSpent += c.s0;
  c.s1 = 1; // vendu
  gainItem(w, itemIndex(c.key as ItemKey), true);
}

export function rerollCost(w: World): number {
  return MERCHANT.reroll * (1 + w.merchant.rerolls);
}

/** L'or suffit-il pour au moins une offre encore en vente ? (bots, HUD) */
export function canAffordAny(w: World): boolean {
  if (!canGainItem(w)) return false;
  for (const c of w.offers) if (c.kind === 'i' && c.s1 !== 1 && w.gold >= c.s0) return true;
  return false;
}
