// Ce que vaut une partie finie pour la progression (docs/specs/boss-final.md, décisions 1, 9 et 10). Module pur.
// Depuis la 1.68.0, la « victoire » (statistique, succès, classement, défis par personnage) est le monde 3 vaincu, au
// moment où son boss tombe : elle reste acquise si le héros meurt ensuite dans l'Arène ou en monde infini, et si la
// partie gardée est abandonnée pour une nouvelle (règle de Jimmy : un joueur ne perd jamais sa progression). Le Cœur de
// la Nuit vaincu est compté à part (statistique `hearts`, succès « Aube »). Le défi du jour ne compte ni l'un ni l'autre.
import { ARENA } from '../sim/balance';
import { FINAL_DONE, adoptCleared } from '../sim/final';
import type { CharacterKey } from '../sim/types';
import type { World } from '../sim/world';
import { addCharRun, emptyCharStats } from './chars';
import type { Meta, MetaStats } from './save';

export interface RunOutcome {
  won: boolean; // le monde 3 vaincu
  heart: boolean; // le Cœur de la Nuit vaincu
  arena: boolean; // la partie a fini dans l'Arène, vaincue par le boss final (pas après l'avoir abattu)
}

export function runOutcome(w: World): RunOutcome {
  const daily = w.dailyEnd > 0,
    heart = !daily && w.finalPhase === FINAL_DONE;
  return {
    won: !daily && w.cleared,
    heart,
    arena: !daily && !heart && w.stage === ARENA && !w.endless,
  };
}

/**
 * Ce que l'issue ajoute aux statistiques : une victoire et le meilleur monde (4) si le monde 3 est vaincu, le Cœur de la
 * Nuit vaincu. Commun à la fin d'une partie (main.ts, gameOver) et à l'abandon d'une partie gardée (creditAbandoned).
 */
export function creditOutcome(st: MetaStats, o: RunOutcome): void {
  if (o.won) {
    st.wins++;
    st.bestStage = Math.max(st.bestStage, 4);
  }
  if (o.heart) st.hearts++;
}

/**
 * Une partie gardée, abandonnée pour une nouvelle (« Nouvelle partie »), qui avait vaincu le monde 3 : sa victoire
 * reste (statistiques par creditOutcome, défi « victoire » du personnage). Le reste de la partie abandonnée ne compte
 * pas, comme avant. Renvoie l'issue (main.ts vérifie ensuite les succès et envoie le score), ou null sans victoire.
 */
export function creditAbandoned(m: Meta, w: World, char: CharacterKey): RunOutcome | null {
  adoptCleared(w); // une partie gardée par la 1.67 sur sa feuille de victoire
  const o = runOutcome(w);
  if (!o.won) return null;
  creditOutcome(m.stats, o);
  addCharRun(m.chars, char, { ...emptyCharStats(), wins: 1, stage: 4 });
  return o;
}
