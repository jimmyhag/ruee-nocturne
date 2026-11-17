// Lot L2 (docs/specs/l2-premieres-parties.md) : dévoilement progressif. `Meta.reveal` compte les étapes dévoilées
// (0 à REVEAL.max, une par partie finie), la sim en reçoit le nombre (worldOptions) ; `Meta.seenReveal`, propre à
// l'appareil, retient la dernière étape annoncée par la bannière « Nouveau ! ». Module pur, sans DOM.
import { REVEAL } from '../sim/balance';
import type { Meta } from './save';

/** Système dévoilé par chaque étape (index = étape − 1) : clés des textes `reveal.<clé>`. */
export const REVEAL_KEYS = ['slide', 'shrines', 'merchant', 'totem'] as const;
export type RevealKey = (typeof REVEAL_KEYS)[number];

/**
 * Dévoilement lu dans une sauvegarde ou une progression du nuage. Sans champ lisible (sauvegarde ou client d'avant le
 * lot), un joueur qui a déjà fini une partie reçoit tout (exigence de Jimmy : il ne perd rien), un nouveau joueur rien.
 */
export function readReveal(raw: unknown, played: boolean): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.min(REVEAL.max, Math.floor(raw)));
  return played ? REVEAL.max : 0;
}

/**
 * Fin d'une partie (mort, victoire, ou abandon après REVEAL.abandonAfter s de jeu) : une étape de plus, jamais au-delà
 * de REVEAL.max. Le défi du jour, joué avec tout dévoilé, ne fait pas avancer.
 */
export function revealAfterRun(m: Meta, run: { daily: boolean; t: number; abandoned: boolean }): void {
  if (run.daily || (run.abandoned && run.t < REVEAL.abandonAfter)) return;
  m.reveal = Math.min(REVEAL.max, m.reveal + 1);
}

/**
 * Au lancement d'une partie : le système à annoncer (« Nouveau ! »), une seule fois par étape, puis l'étape est
 * marquée vue (à sauvegarder par l'appelant). Rien pour le défi du jour ni pour une étape déjà annoncée.
 */
export function revealNews(m: Meta, daily: boolean): RevealKey | null {
  if (daily || m.reveal <= m.seenReveal || m.reveal < 1) return null;
  m.seenReveal = m.reveal;
  return REVEAL_KEYS[m.reveal - 1];
}
