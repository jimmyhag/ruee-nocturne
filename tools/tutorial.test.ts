// Partie guidée (docs/specs/tutoriel.md, décision 17 de la révision 1.66.0) : la partie guidée se règle par la simulation
// (règle 13). La mesure elle-même (800 parties guidées, 4 graines × 200, ≈ 10 min de calcul sur quatre cœurs) est dans
// docs/GATES.md : elle ne tient pas dans les tests unitaires. Ici : les cibles sont celles de la spec, les chiffres
// recopiés sont ceux des réglages actuels (empreinte), et la CLI joue bien la partie guidée du jeu (même monde que
// main.ts, même guide).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TUTORIAL } from '../src/sim/balance';
import { GUIDE } from '../src/meta/guide';
import { tutorialOptions } from '../src/meta/shop';
import { World } from '../src/sim/world';
import { PROFILES, checkTargets } from './targets';

/**
 * Mesure regroupée, `npm run sim -- --tutorial --runs 200 --seed 42…45 --out sim/<préfixe>-tutorial-<graine>.json`
 * (bot moyen), puis `node tools/sim-pool.mjs sim <préfixe>` : boss du monde atteint (%), morts avant 5:00 (%), boss
 * abattu (% de ceux qui l'atteignent), parties entrées dans le portail (%). Changer un réglage de TUTORIAL ou du guide
 * sans refaire la mesure fait échouer le test ; après une nouvelle mesure, recopier les chiffres et la nouvelle empreinte.
 */
// 1.69.0 (docs/specs/rafales-faux-guidage.md, décision 12 amendée) : TUTORIAL.bossHp ×3,5, mesure 4 graines × 200
const MEASURED_FOR = 'bce04b07c0b89c21';
const MEASURED = { reachPct: 97.3, deadBefore5Pct: 1.3, killPct: 65.9, portalPct: 64.1 };

describe('partie guidée : réglage par la simulation (décision 17)', () => {
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
      ['morts avant 5:00 ≤ 3 %', 0, 3],
      ['boss abattu 25–75 %', 25, 75],
    ]);
    const tuto = (o: Partial<typeof MEASURED>) => ({ tuto: { ...MEASURED, ...o } });
    // la mesure recopiée est dans les cibles…
    expect(checkTargets(tuto({}), targets).filter((c) => !c.ok)).toEqual([]);
    // …et les cibles jugent bien ce qu'elles disent
    expect(checkTargets(tuto({ reachPct: 89 }), targets)[0].ok).toBe(false);
    expect(checkTargets(tuto({ deadBefore5Pct: 3.1 }), targets)[1].ok).toBe(false);
    expect(checkTargets(tuto({ killPct: 24 }), targets)[2].ok).toBe(false);
    expect(checkTargets(tuto({ killPct: 76 }), targets)[2].ok).toBe(false);
    // le boss abattu ouvre le portail : on n'y entre pas plus souvent qu'on ne l'abat
    expect(MEASURED.portalPct).toBeLessThanOrEqual((MEASURED.killPct * MEASURED.reachPct) / 100 + 0.1); // chiffres arrondis
    // la CLI (`--tutorial`) joue la partie du jeu : carte TUTORIAL.map, options de main.ts
    const w = new World(TUTORIAL.map, tutorialOptions());
    expect(w.tutorial).toBe(true);
    expect(w.seed).toBe(TUTORIAL.map);
  });
});
