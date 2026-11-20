// Porte de la phase 6 : un nouveau personnage s'achète en moins de 5 parties d'un nouveau joueur (la Veilleuse, 800 or).
// Décision de Jimmy (20 nov. 2026, lot 1.69.0) : la règle est gardée, mais jugée sur 8 tirages au lieu d'un seul tirage
// figé dans e2e/newplayer.spec.ts (une partie qui diverge au hasard, un coffre d'élite tombé ou non sous le héros,
// faisait passer ou échouer la porte). Le parcours de l'interface (verrou, or crédité, achat) reste dans l'e2e.
//
// Rejoue en simulation la partie du test e2e : la méta d'un nouveau joueur qui a fini la partie guidée (celle que
// `openGame` pose : tout dévoilé, `tutorial: 1`), le monde que main.ts lance pour une variante de débogage (carte
// MAP.seed, générateur avancé de `variante` tirages), le héros immobile et increvable 240 s, la carte 1 à chaque niveau,
// puis la mort ; l'or de la partie (bonus de fin compris) est crédité comme à l'écran de fin. Chiffres par graine dans
// docs/GATES.md (lot 1.69.0). Le test sait échouer : avec l'or de chaque partie divisé par deux (essai non gardé), la
// médiane passe à 6 parties et seuls 2 tirages sur 8 débloquent en moins de 5.
import { describe, expect, it } from 'vitest';
import { CHARACTERS, MAP, STEP } from '../src/sim/balance';
import { startRun, step } from '../src/sim/step';
import { Mode } from '../src/sim/types';
import type { Input } from '../src/sim/types';
import { World } from '../src/sim/world';
import { unlockedWeapons } from '../src/meta/achievements';
import { normalizeMeta } from '../src/meta/save';
import { worldOptions } from '../src/meta/shop';

const PRICE = CHARACTERS.find((c) => c.key === 'veilleuse')!.price;
const SEEDS = [10, 20, 30, 40, 50, 60, 70, 80]; // 10 : les variantes de l'e2e (10, 11, 12…)
const MAX_RUNS = 8;

/** Une partie de l'e2e : variante `variant`, 240 s immobile et increvable, carte 1 aux niveaux, puis la mort. */
function runGold(meta: ReturnType<typeof normalizeMeta>, variant: number): number {
  const w = new World(MAP.seed, worldOptions(meta, unlockedWeapons(meta)));
  for (let i = 0; i < variant; i++) w.rng.next();
  startRun(w);
  const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };
  w.player.maxHp = w.player.hp = 1e9; // debug.god() puis debug.warp(240)
  while (w.t < 240 && w.mode !== Mode.Dead) step(w, still, STEP);
  w.player.hp = -1e9; // debug.kill()
  for (let i = 0; i < 20 && w.mode !== Mode.Dead; i++) step(w, still, STEP);
  expect(w.mode).toBe(Mode.Dead);
  return Math.round(w.gold); // écran de fin : meta.gold += Math.round(world.gold)
}

describe('porte de la phase 6 : un personnage en or (décision de Jimmy, 20 nov. 2026)', () => {
  it('The Veilleuse unlocks in fewer than 5 runs for a new player', () => {
    const lines: string[] = [];
    const runsBySeed: number[] = [];
    for (const seed of SEEDS) {
      const meta = normalizeMeta({ version: 5 });
      Object.assign(meta, { reveal: 4, seenReveal: 4, tutorial: 1, hints: 511 }); // e2e/helpers.ts, openGame
      const golds: number[] = [];
      let runs = 0;
      while (meta.gold < PRICE && runs < MAX_RUNS) {
        const g = runGold(meta, seed + runs);
        meta.gold += g;
        meta.runs++;
        golds.push(g);
        runs++;
      }
      runsBySeed.push(meta.gold >= PRICE ? runs : MAX_RUNS + 1);
      lines.push(`graine ${seed} : ${golds.join(' + ')} = ${meta.gold} or en ${runs} partie(s)`);
    }
    console.log(lines.join('\n'));
    const sorted = [...runsBySeed].sort((a, b) => a - b);
    const median = (sorted[3] + sorted[4]) / 2;
    expect(median, 'médiane des parties pour 800 or').toBeLessThan(5);
    expect(
      runsBySeed.filter((r) => r < 5).length,
      'tirages qui débloquent en moins de 5 parties',
    ).toBeGreaterThanOrEqual(6);
  }, 600_000);
});
