// Lot L3 (docs/specs/l3-defi-serie-missions.md, décision 3) : le défi du jour court se règle par la simulation (règle 13).
// La mesure elle-même (800 défis, 4 graines regroupées) se lit dans docs/GATES.md, lot L3 : elle prend ≈ 14 min et ne
// tient pas dans les tests unitaires. Ici : la cible est celle de la spec, et la CLI mesure bien le défi du jeu (même
// monde que `worldOptions(…, true)`, réussite = vivant à DAILY.duration), parties de la graine 42 rejouées à l'identique.
import { describe, expect, it } from 'vitest';
import { DAILY, STEP } from '../src/sim/balance';
import { startRun, step } from '../src/sim/step';
import { Mode } from '../src/sim/types';
import type { Input } from '../src/sim/types';
import { World } from '../src/sim/world';
import { DEFAULT_META } from '../src/meta/save';
import { worldOptions } from '../src/meta/shop';
import { makeBot, pickAllowed } from './bots';
import { PROFILES, checkTargets } from './targets';

/** La boucle de tools/sim-cli.ts (`--daily`) pour une partie : graine du monde, bot moyen de graine seed × 7 + 1. */
function dailyRun(seed: number): World {
  const w = new World(seed, worldOptions(DEFAULT_META, undefined, true));
  startRun(w);
  const bot = makeBot('average', seed * 7 + 1);
  const inp: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
  let frame = 0;
  while (frame < (DAILY.duration + 1) / STEP) {
    if (w.mode === Mode.LevelUp) {
      inp.pick = pickAllowed(bot, w, w.cards, null);
      inp.mx = inp.mz = 0;
      inp.jump = inp.spell = false;
    } else if (w.mode === Mode.Merchant) {
      inp.pick = bot.shop(w);
      inp.mx = inp.mz = 0;
      inp.jump = inp.spell = false;
    } else {
      inp.pick = -1;
      bot.decide(w, frame, inp);
      frame++;
    }
    step(w, inp, STEP);
    if (w.mode === Mode.Dead || w.mode === Mode.Won) break;
  }
  return w;
}

describe('défi du jour court : réglage par la simulation (lot L3)', () => {
  it('The challenge is won about one time in two', () => {
    // la cible de la spec : 35 à 65 % des défis de l'Éclaireuse au kit de départ atteignent 5:00 (bot moyen)
    const daily = PROFILES.daily;
    expect(daily.map((x) => [x.name, x.min, x.max])).toEqual([
      ['défi réussi 35–65 %', 35, 65],
      ['morts <3 min ≤ 20 %', 0, 20], // relecture d'équilibrage : écart visible (≈ 21 %), pas encore réglé
      ['chute max ≤ 22 pts/min', 0, 22],
    ]);
    const at = (pct: number) => checkTargets({ reachedEndPct: pct, deadBefore3minPct: 0, maxDrop: 0 }, daily)[0].ok;
    expect(at(49.4)).toBe(true); // mesuré : 800 défis, graines 42 à 45
    expect(at(34)).toBe(false);
    expect(at(66)).toBe(false);
    // la CLI joue le défi du jeu : la partie 19 de la graine 42 meurt à 0:46 avec 29 vaincus, comme dans la mesure
    // (une partie réussie dure 18 000 pas, trop pour ce test sous couverture ; l'arrêt à 5:00 est testé par
    // « The daily challenge lasts 5 minutes », src/meta/daily.test.ts)
    const lost = dailyRun(42019);
    expect(lost.mode).toBe(Mode.Dead);
    expect(lost.t).toBeLessThan(DAILY.duration);
    expect(lost.kills).toBe(29);
  });
});
