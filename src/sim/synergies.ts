// Synergies tome + arme (phase 17, PLAN §3.6) : une synergie s'active quand l'arme est équipée et que le tome a reçu
// au moins SYN.tome cartes. Les effets de stats sont appliqués par refreshStats (weapons/defs.ts), les autres par la
// boucle de jeu (Rempart dans step.ts) ou une fois à l'activation (Moisson).
import { SYN, SYNERGIES, Syn } from './balance';
import { Ev } from './types';
import type { Card } from './types';
import type { World } from './world';

/** Recalcule les synergies actives ; une synergie qui s'active est annoncée (Ev.Synergy) et applique son effet unique. */
export function updateSynergies(w: World): boolean {
  let changed = false;
  for (let i = 0; i < SYNERGIES.length; i++) {
    if (w.syn[i]) continue; // une synergie ne se perd pas (les armes et les tomes ne se perdent pas non plus)
    const s = SYNERGIES[i];
    if ((w.weapons[s.weapon] ?? 0) > 0 && (w.tomes[s.tome] ?? 0) >= SYN.tome) {
      w.syn[i] = 1;
      changed = true;
      if (i === Syn.Moisson) w.player.magnet *= 1 + SYN.moisson.magnet;
      w.emit(Ev.Synergy, w.player.x, w.player.y + 1.5, w.player.z, i);
    }
  }
  return changed;
}

/**
 * Index de la synergie que cette carte compléterait (-1 si aucune) : affiché sur la carte (« Synergie ») et préféré par
 * les bots. Une carte de tome qui amène le tome à SYN.tome avec l'arme équipée, ou une nouvelle arme dont le tome y est.
 */
export function cardSynergy(w: World, c: Card): number {
  if (c.kind !== 'w' && c.kind !== 't') return -1;
  for (let i = 0; i < SYNERGIES.length; i++) {
    if (w.syn[i]) continue;
    const s = SYNERGIES[i];
    if (c.kind === 't' && c.key === s.tome && c.lv >= SYN.tome && (w.weapons[s.weapon] ?? 0) > 0) return i;
    if (c.kind === 'w' && c.key === s.weapon && c.lv === 1 && (w.tomes[s.tome] ?? 0) >= SYN.tome) return i;
  }
  return -1;
}

/** Nombre de synergies actives. */
export function synergyCount(w: World): number {
  let n = 0;
  for (let i = 0; i < w.syn.length; i++) n += w.syn[i];
  return n;
}
