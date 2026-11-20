// Monstres corrompus (docs/specs/corrompus.md, décision 7) : la consigne de première apparition, une fois par joueur.
// L'affichage (texte FR et EN, PC et mobile) est vérifié par e2e/corrompus.spec.ts.
import { describe, expect, it } from 'vitest';
import { STAGE, STEP } from '../sim/balance';
import { tickSpawner } from '../sim/spawner';
import { Ev } from '../sim/types';
import { World } from '../sim/world';
import { ALL_HINTS, HINTS, Hint, hintRank, newGuide, updateGuide } from './guide';
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
      'Après le chrono, la nuit corrompt les monstres : violets, ils ont une compétence et rapportent plus.',
    );
    expect((en as Record<string, string>)['tuto.hint.corrupt']).toBe(
      'After the clock runs out, the night corrupts the monsters: purple, each has a skill and pays more.',
    );
    // ni l'un ni l'autre ne parle du monde infini (celui d'après la victoire, sans corrompus) : la prolongation
    for (const k of ['tuto.hint.corrupt', 'menu.ctrl.corrupt']) {
      expect((fr as Record<string, string>)[k]).not.toMatch(/infini/i);
      expect((en as Record<string, string>)[k]).not.toMatch(/endless/i);
      expect((fr as Record<string, string>)[k]).toMatch(/chrono/);
      expect((en as Record<string, string>)[k]).toMatch(/clock/);
    }
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
  it('the portal hint comes first, the corrupted one waits for the next corrupted monster', () => {
    // un joueur qui n'a vu ni le portail ni les corrompus : le boss du totem tombe, le portail s'ouvre ; le premier
    // corrompu arrive une seconde plus tard, pendant que la consigne du portail est en attente ou affichée
    const fresh = ALL_HINTS & ~(1 << Hint.Portal) & ~(1 << Hint.Corrupt);
    const w = new World(3);
    const g = newGuide(w, false, fresh);
    w.clearEvents();
    w.portal.open = true;
    w.emit(Ev.PortalOpen, w.totem.x, 0, w.totem.z, 2);
    w.emit(Ev.Corrupt, 0, 0, 0, 1, 0); // au même pas : la consigne du portail est en attente
    updateGuide(g, w, 0);
    expect(g.hint).toBe(Hint.Portal);
    expect(g.hints & (1 << Hint.Corrupt)).toBe(0); // pas retenue : elle reviendra
    // affichée (src/ui/tutorial.ts) ; un corrompu apparaît pendant qu'elle est à l'écran
    let shown = g.hint;
    g.hint = -1;
    w.clearEvents();
    w.emit(Ev.Corrupt, 0, 0, 0, 1, 0);
    updateGuide(g, w, 0);
    expect(g.hint).toBe(Hint.Corrupt);
    // l'interface garde la plus importante à l'écran et rend sa chance à l'autre (même règle que src/ui/tutorial.ts)
    expect(hintRank(shown)).toBeGreaterThan(hintRank(g.hint));
    g.hints &= ~(1 << g.hint);
    g.hint = -1;
    expect(g.hints & (1 << Hint.Portal)).not.toBe(0); // le portail est vu
    // la consigne du portail partie, le corrompu suivant a la sienne, une fois
    w.clearEvents();
    w.emit(Ev.Corrupt, 0, 0, 0, 0, 0);
    updateGuide(g, w, 0);
    expect(g.hint).toBe(Hint.Corrupt);
    shown = g.hint;
    g.hint = -1;
    w.clearEvents();
    w.emit(Ev.Corrupt, 0, 0, 0, 0, 0);
    updateGuide(g, w, 0);
    expect(g.hint).toBe(-1);
    expect(shown).toBe(Hint.Corrupt);
    // la consigne des corrompus ne passe devant aucune autre
    for (let h = 0; h < HINTS.length; h++)
      if (h !== Hint.Corrupt) expect(hintRank(h)).toBeGreaterThan(hintRank(Hint.Corrupt));
  });
});
