// Lot L5 : paliers visuels d'arme (docs/specs/l5-paliers-arme.md). Un palier ne change aucune statistique : il est noté
// dans w.wtier (gardé par la partie sauvegardée) et annoncé une fois par Ev.WeaponTier ; le rendu et le HUD lisent w.wtier.
import { WEAPON_TIERS } from './balance';
import { Ev } from './types';
import type { WeaponKey } from './types';
import { WEAPON_KEYS } from './weapons/defs';
import type { World } from './world';

/** Palier visuel d'une arme au niveau `lv` : 0 (aucun) à WEAPON_TIERS.length. */
function tierOf(lv: number): number {
  let t = 0;
  while (t < WEAPON_TIERS.length && lv >= WEAPON_TIERS[t]) t++;
  return t;
}

/**
 * Note les paliers que l'arme `k` atteint à son niveau courant. `announce` : un Ev.WeaponTier par palier franchi (carte
 * prise) ; sinon rattrapage silencieux. Un palier déjà noté ne se rejoue jamais : une célébration par palier et par partie.
 */
export function reachTiers(w: World, k: WeaponKey, announce: boolean): void {
  const to = tierOf(w.weapons[k] ?? 0);
  while (w.wtier[k] < to) {
    w.wtier[k]++;
    if (announce) w.emit(Ev.WeaponTier, w.player.x, w.player.y + 1, w.player.z, w.wtier[k], WEAPON_KEYS.indexOf(k));
  }
}

/** Rattrapage silencieux de toutes les armes : partie reprise d'une version d'avant les paliers, hooks de debug. */
export function syncTiers(w: World): void {
  for (const k of WEAPON_KEYS) reachTiers(w, k, false);
}
