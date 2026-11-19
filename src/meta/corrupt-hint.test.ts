// Monstres corrompus (docs/specs/corrompus.md, décision 7) : la consigne de première apparition, une fois par joueur.
// L'affichage (texte FR et EN, PC et mobile) est vérifié par e2e/corrompus.spec.ts.
import { describe, expect, it } from 'vitest';
import { STAGE, STEP } from '../sim/balance';
import { tickSpawner } from '../sim/spawner';
import { Ev } from '../sim/types';
import { World } from '../sim/world';
import { ALL_HINTS, HINTS, Hint, newGuide, updateGuide } from './guide';
import { DEFAULT_META, normalizeMeta } from './save';
import { worldOptions } from './shop';
import fr from '../i18n/fr.json';
import en from '../i18n/en.json';

/** Un monde en prolongation (+1 min) dont le spawner tourne seul, jusqu'à la première apparition d'un corrompu. */
function overtime(seed: number, hints: number) {
  const w = new World(seed, worldOptions({ ...DEFAULT_META, hints }, undefined));
  w.stageT = w.diffT = STAGE.dur + 60;
  w.overT = 60;
  w.nextWave = w.nextElite = 1e9;
  const g = newGuide(w, false, hints);
  let shown = 0;
  for (let k = 0; k < 60 * 30; k++) {
    w.clearEvents();
    tickSpawner(w, STEP);
    updateGuide(g, w, STEP);
    if (g.hint === Hint.Corrupt) shown++;
    g.hint = -1; // affichée (src/ui/tutorial.ts)
  }
  return { w, g, shown };
}

describe('monstres corrompus : la consigne (décision 7)', () => {
  it('Corrupted monsters are explained the first time', () => {
    expect(HINTS[Hint.Corrupt]).toBe('corrupt');
    expect((fr as Record<string, string>)['tuto.hint.corrupt']).toBe(
      "Monstres corrompus : l'infini les réveille. Plus dangereux, ils rapportent plus.",
    );
    expect((en as Record<string, string>)['tuto.hint.corrupt']).toBeTruthy();
    // un joueur qui n'a jamais vu de corrompu (toutes les autres consignes vues) : une seule fois, au premier
    const seen = ALL_HINTS & ~(1 << Hint.Corrupt);
    const first = overtime(7, seen);
    expect(first.w.corrupted).toBeGreaterThan(1);
    expect(first.shown).toBe(1);
    // retenue dans la méta (main.ts : hintShown), et gardée par une sauvegarde normalisée
    const m = { ...DEFAULT_META, hints: first.g.hints };
    expect(m.hints & (1 << Hint.Corrupt)).not.toBe(0);
    expect(normalizeMeta(JSON.parse(JSON.stringify(m))).hints).toBe(m.hints);
    // les parties suivantes : plus jamais
    const next = overtime(8, m.hints);
    expect(next.w.corrupted).toBeGreaterThan(0);
    expect(next.shown).toBe(0);
    // une compétence lancée n'est pas une apparition
    const w = new World(1);
    const g = newGuide(w, false, seen);
    w.clearEvents();
    w.emit(Ev.Corrupt, 0, 0, 0, 1, 1);
    updateGuide(g, w, 0);
    expect(g.hint).toBe(-1);
  });
});
