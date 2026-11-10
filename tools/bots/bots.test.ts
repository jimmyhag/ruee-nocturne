// Tests des bots de playtest (skill sim-testing §2) : déterminisme, ordre naive ≤ average,
// filtre d'armes de la CLI, entrées bornées. Chaque test tient en < 2 s sans coverage ; avec `--coverage`
// la sim instrumentée est ~6× plus lente, d'où le délai global de 30 s (vite.config.ts).
import { describe, expect, it } from 'vitest';
import { STEP, VOLANT_TYPE } from '../../src/sim/balance';
import { dropChest } from '../../src/sim/combat';
import { spawnEnemy } from '../../src/sim/spawner';
import { startRun, step } from '../../src/sim/step';
import { Mode } from '../../src/sim/types';
import type { Input, WeaponKey } from '../../src/sim/types';
import { World } from '../../src/sim/world';
import { enforceAllowed, makeAverage, makeBot, naive, pickAllowed } from './index';
import type { Bot } from './index';

/** Reproduit la boucle de tools/sim-cli.ts : `maxSteps` pas de jeu (les level-up ne comptent pas). */
function runBot(bot: Bot, seed: number, maxSteps: number, allowed: ReadonlySet<string> | null = null): World {
  const w = new World(seed);
  if (allowed) w.weapons = { [[...allowed][0] as WeaponKey]: 1 };
  startRun(w);
  const inp: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
  let frame = 0;
  while (frame < maxSteps) {
    if (w.mode === Mode.LevelUp) {
      inp.pick = pickAllowed(bot, w, w.cards, allowed);
      inp.mx = inp.mz = 0;
      inp.jump = inp.spell = false;
    } else {
      inp.pick = -1;
      bot.decide(w, frame, inp);
      frame++;
    }
    step(w, inp, STEP);
    if (inp.pick >= 0) enforceAllowed(w, allowed);
    if (w.mode === Mode.Dead) break;
  }
  return w;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('bots de playtest', () => {
  it('average est déterministe : deux runs même seed, 1800 steps, même état', () => {
    const a = runBot(makeAverage(7), 1234, 1800);
    const b = runBot(makeAverage(7), 1234, 1800);
    expect(a.t).toBe(b.t);
    expect(a.kills).toBe(b.kills);
    expect(a.player.level).toBe(b.player.level);
  });

  it('naive ne survit pas plus longtemps qu’average (médiane sur 5 seeds, 2400 steps max)', () => {
    const seeds = [1, 2, 3, 4, 5];
    const tNaive = seeds.map((s) => runBot(naive, s, 2400).t);
    const tAverage = seeds.map((s) => runBot(makeAverage(s * 7 + 1), s, 2400).t);
    expect(median(tNaive)).toBeLessThanOrEqual(median(tAverage));
  });

  it('pickAllowed : avec --weapons foudre, w.weapons ne contient jamais une autre arme', () => {
    const allowed = new Set(['foudre']);
    for (const seed of [11, 12]) {
      const w = runBot(makeAverage(seed), seed, 7200, allowed); // 2 min : plusieurs tirages « armes seulement »
      expect(Object.keys(w.weapons)).toEqual(['foudre']);
    }
  });

  it('pickAllowed remplace une arme hors liste par la meilleure carte autorisée', () => {
    const w = new World(1);
    const firstPicker: Bot = { name: 'test', decide: () => {}, pick: () => 0, shop: () => 11 };
    const cards = [
      { kind: 'w', key: 'orbe', lv: 2, n: 1, s0: 0, s1: -1, s2: -1 },
      { kind: 't', key: 'degats', lv: 1, n: 1, s0: 0, s1: -1, s2: -1 },
      { kind: 'w', key: 'foudre', lv: 1, n: 1, s0: 0, s1: -1, s2: -1 },
    ] as const;
    expect(pickAllowed(firstPicker, w, [...cards], new Set(['foudre']))).toBe(2);
    expect(pickAllowed(firstPicker, w, [...cards], new Set(['lames']))).toBe(1);
    expect(pickAllowed(firstPicker, w, [cards[0]], new Set(['lames']))).toBe(0);
    expect(pickAllowed(firstPicker, w, [...cards], null)).toBe(0);
  });

  it('chaque bot produit un Input borné sur 300 steps', () => {
    for (const name of ['naive', 'average', 'greedy']) {
      const bot = makeBot(name, 99);
      const w = new World(42);
      startRun(w);
      const inp: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
      for (let f = 0; f < 300; f++) {
        bot.decide(w, f, inp);
        expect(Math.abs(inp.mx), `${name} mx`).toBeLessThanOrEqual(2);
        expect(Math.abs(inp.mz), `${name} mz`).toBeLessThanOrEqual(2);
        expect(typeof inp.jump).toBe('boolean');
        expect(typeof inp.spell).toBe('boolean');
        if (w.mode === Mode.Play) step(w, inp, STEP);
      }
    }
  });

  it('phase 3 : greedy va chercher un coffre à 15 u, average saute quand un Volant pique', () => {
    const w = new World(7);
    dropChest(w, w.player.x + 15, w.player.z, false);
    const greedy = makeBot('greedy', 1);
    const inp: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
    greedy.decide(w, 0, inp);
    expect(inp.mx).toBeGreaterThan(0.5); // vers le coffre (+x)

    const w2 = new World(8);
    const i = spawnEnemy(w2, VOLANT_TYPE, 0, 2);
    w2.enemies[i].state = 1; // télégraphe de plongée presque fini
    w2.enemies[i].timer = 0.1;
    const avg = makeBot('average', 1);
    avg.decide(w2, 0, inp);
    expect(inp.jump).toBe(true);
  });
});
