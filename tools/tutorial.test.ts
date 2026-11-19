// Partie guidée (docs/specs/tutoriel.md, décision 11) : la partie guidée se règle par la simulation (règle 13). La mesure
// elle-même (800 parties guidées, 4 graines × 200, ≈ 10 min de calcul sur quatre cœurs) est dans docs/GATES.md : elle ne
// tient pas dans les tests unitaires. Ici : les cibles sont celles de la spec, les chiffres recopiés sont ceux des
// réglages actuels (empreinte), et la CLI joue bien la partie guidée du jeu (même monde que main.ts, même guide).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TUTORIAL } from '../src/sim/balance';
import { GUIDE } from '../src/meta/guide';
import { tutorialOptions } from '../src/meta/shop';
import { World } from '../src/sim/world';
import { PROFILES, checkTargets } from './targets';

/**
 * Mesure regroupée, `npm run sim -- --tutorial --runs 200 --seed 42…45 --out …` (bot moyen) : boss atteint (%), mort
 * contre lui (% de ceux qui l'atteignent), temps du boss pour tuer (médiane, s), morts avant 5:00 (%). Changer un réglage
 * de TUTORIAL ou du guide sans refaire la mesure fait échouer le test ; après une nouvelle mesure, recopier les chiffres
 * et la nouvelle empreinte.
 */
const MEASURED_FOR = '24e50eb01bd04594';
const MEASURED = { reachPct: 96.4, bossDeathPct: 98.7, bossTimeP50: 39, deadBefore5Pct: 1.6 };

describe('partie guidée : réglage par la simulation (décision 11)', () => {
  it('Nobody loses the guided run before the boss', () => {
    const tuning = createHash('sha256').update(JSON.stringify({ TUTORIAL, GUIDE })).digest('hex').slice(0, 16);
    expect(
      tuning,
      'réglages de la partie guidée changés : refaire la mesure (docs/GATES.md) et recopier MEASURED',
    ).toBe(MEASURED_FOR);
    // les cibles de la spec, codées dans tools/targets.ts
    const targets = PROFILES.tutorial;
    expect(targets.map((x) => [x.name, x.min, x.max])).toEqual([
      ['boss atteint ≥ 90 %', 90, 100],
      ['mort contre le boss ≥ 95 %', 95, 100],
      ['boss tue en 20–60 s', 20, 60],
      ['morts avant 5:00 ≤ 3 %', 0, 3],
    ]);
    const tuto = (o: Partial<typeof MEASURED>) => ({ tuto: { ...MEASURED, ...o } });
    // la mesure recopiée est dans les cibles…
    expect(checkTargets(tuto({}), targets).filter((c) => !c.ok)).toEqual([]);
    // …et les cibles jugent bien ce qu'elles disent
    expect(checkTargets(tuto({ reachPct: 89 }), targets)[0].ok).toBe(false);
    expect(checkTargets(tuto({ bossDeathPct: 94 }), targets)[1].ok).toBe(false);
    expect(checkTargets(tuto({ bossTimeP50: 61 }), targets)[2].ok).toBe(false);
    expect(checkTargets(tuto({ bossTimeP50: 19 }), targets)[2].ok).toBe(false);
    expect(checkTargets(tuto({ deadBefore5Pct: 3.1 }), targets)[3].ok).toBe(false);
    // la CLI (`--tutorial`) joue la partie du jeu : carte TUTORIAL.map, options de main.ts
    const w = new World(TUTORIAL.map, tutorialOptions());
    expect(w.tutorial).toBe(true);
    expect(w.seed).toBe(TUTORIAL.map);
  });
});
