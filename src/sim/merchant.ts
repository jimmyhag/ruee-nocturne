// Marchand (phase 17, PLAN §3.6) : une échoppe s'installe près du joueur aux heures MERCHANT.times et reste
// MERCHANT.stay s. Y entrer met la partie en pause (Mode.Merchant) : objets en vente (w.offers, kind 'i'), relance, départ.
// On paie avec l'or de la partie ; ce qui n'est pas dépensé reste acquis à la fin du run.
import { ENDLESS, MERCHANT, PLAY_LIMIT } from './balance';
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
  endlessNext: number; // 1.34.1 : endlessT de la prochaine visite en monde infini
  endlessVisits: number; // phase 43 : passages faits en monde infini (ENDLESS.merchantVisits au plus)
}
export function makeMerchant(): MerchantState {
  return { active: false, x: 0, z: 0, until: 0, visit: -1, next: 0, rolled: false, inside: false, rerolls: 0, endlessNext: ENDLESS.merchantAt, endlessVisits: 0 };
}

const TAU = Math.PI * 2;
const clamp = (v: number, lim: number): number => (v < -lim ? -lim : v > lim ? lim : v);
const out2 = new Float64Array(2);

/** Apparition, départ, entrée du joueur. Appelé à chaque pas de jeu (Mode.Play). */
export function tickMerchant(w: World): void {
  const M = w.merchant;
  // phase 37 : aux heures MERCHANT.times de chaque monde (chrono du monde) ; 1.34.1 : en monde infini, entre deux vagues
  // de boss (ENDLESS.merchantAt après chaque vague, sur le chrono du monde infini)
  if (w.endless) {
    // phase 43 (demande de Jimmy) : ENDLESS.merchantVisits passages, puis plus de marchand
    if (M.endlessVisits < ENDLESS.merchantVisits && w.endlessT >= M.endlessNext) {
      M.endlessNext += ENDLESS.period;
      M.endlessVisits++;
      if (!M.active) {
        arrive(w); // encore là (rare) : on saute cette visite
        if (M.endlessVisits >= ENDLESS.merchantVisits) w.emit(Ev.MerchantLast, M.x, 0, M.z);
      }
    }
  } else if (!M.active && M.next < MERCHANT.times.length && w.stageT >= MERCHANT.times[M.next]) {
    M.next++;
    arrive(w);
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

/** L'échoppe s'installe à une place libre près du joueur. */
function arrive(w: World): void {
  const M = w.merchant;
  // place libre près du joueur : quelques essais autour de lui, repoussée hors des obstacles ; 1.37.1 (retour de Jimmy) :
  // toujours dans la zone jouable (près du bord, un essai pouvait tomber dans la lisière, hors d'atteinte)
  const P = w.player;
  const lim = PLAY_LIMIT - MERCHANT.r - MERCHANT.placeMargin;
  for (let k = 0; k < MERCHANT.placeTries; k++) {
    const a = w.rng.range(0, TAU),
      d = w.rng.range(MERCHANT.distMin, MERCHANT.distMax);
    const x = clamp(P.x + Math.sin(a) * d, lim),
      z = clamp(P.z + Math.cos(a) * d, lim);
    w.resolveObstacles(x, z, MERCHANT.r + MERCHANT.placeMargin, out2, 0);
    M.x = clamp(out2[0], lim);
    M.z = clamp(out2[1], lim);
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
  // phase 43 : ×rerollMul à chaque relance de la visite, +rerollVisit par visite passée
  const M = w.merchant;
  return Math.round(MERCHANT.reroll * MERCHANT.rerollMul ** M.rerolls * (1 + MERCHANT.rerollVisit * Math.max(0, M.visit)));
}

/** L'or suffit-il pour au moins une offre encore en vente ? (bots, HUD) */
export function canAffordAny(w: World): boolean {
  if (!canGainItem(w)) return false;
  for (const c of w.offers) if (c.kind === 'i' && c.s1 !== 1 && w.gold >= c.s0) return true;
  return false;
}
