// Partie guidée (docs/specs/tutoriel.md) : ce qu'elle change à la méta. Module pur, sans DOM.
import { FIRST_RUNS, REVEAL, TUTORIAL } from '../sim/balance';
import type { Meta } from './save';

/** Décision 1 : un nouveau joueur (aucune partie finie, partie guidée ni finie ni passée) commence par elle. */
export function tutorialDue(m: Meta): boolean {
  return m.tutorial === 0 && m.runs === 0;
}

/** Décision 9 : tout est dévoilé (sans bannière « Nouveau ! »), les deux parties suivantes sont adoucies. */
function revealAll(m: Meta): void {
  m.reveal = REVEAL.max;
  m.seenReveal = REVEAL.max;
  m.softLeft = FIRST_RUNS.afterTutorial;
}

/**
 * Fin de la partie guidée (décision 7) : l'or de la partie est gardé, avec la prime de fin de guide la première fois
 * (une partie guidée rejouée depuis l'Aide ne la redonne pas). Elle compte comme une partie jouée (`runs` : un autre
 * appareil ne la repropose pas) mais ni pour la série, ni pour les records, ni pour les succès. Renvoie la prime.
 */
export function tutorialEnd(m: Meta, gold: number): number {
  const first = m.tutorial === 0;
  const bonus = first ? TUTORIAL.gold : 0;
  m.gold += gold + bonus;
  m.goldEarned += gold + bonus;
  if (first) {
    m.runs++;
    m.tutorial = 1;
    revealAll(m);
  }
  return bonus;
}

/** Décision 10 : « Passer la partie guidée » ; la partie ne compte pas, tout est dévoilé. */
export function tutorialSkip(m: Meta): void {
  if (m.tutorial !== 0) return;
  m.tutorial = 2;
  revealAll(m);
}

/**
 * Une partie finie (pas le défi du jour ; un abandon après REVEAL.abandonAfter s de jeu compte, comme pour le
 * dévoilement) consomme une des parties adoucies qui suivent la partie guidée.
 */
export function softAfterRun(m: Meta, run: { daily: boolean; t: number; abandoned: boolean }): void {
  if (m.softLeft <= 0 || run.daily || (run.abandoned && run.t < REVEAL.abandonAfter)) return;
  m.softLeft--;
}
