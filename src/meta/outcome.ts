// Ce que vaut une partie finie pour la progression (docs/specs/boss-final.md, décisions 1, 9 et 10). Module pur.
// Depuis la 1.68.0, la « victoire » (statistique, succès, classement, défis par personnage) est le monde 3 vaincu, au
// moment où son boss tombe : elle reste acquise si le héros meurt ensuite dans l'Arène ou en monde infini. Le Cœur de
// la Nuit vaincu est compté à part (statistique `hearts`, succès « Aube »). Le défi du jour ne compte ni l'un ni l'autre.
import { ARENA } from '../sim/balance';
import { FINAL_DONE } from '../sim/final';
import type { World } from '../sim/world';

export interface RunOutcome {
  won: boolean; // le monde 3 vaincu
  heart: boolean; // le Cœur de la Nuit vaincu
  arena: boolean; // la partie a fini dans l'Arène (mort contre le boss final)
}

export function runOutcome(w: World): RunOutcome {
  const daily = w.dailyEnd > 0;
  return {
    won: !daily && w.cleared,
    heart: !daily && w.finalPhase === FINAL_DONE,
    arena: !daily && w.stage === ARENA && !w.endless,
  };
}
