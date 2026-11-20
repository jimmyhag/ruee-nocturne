// Le Cœur de la Nuit (docs/specs/boss-final.md, décisions 1, 9 et 10) : ce que la progression retient d'une partie qui
// finit dans l'Arène ou après elle. La simulation des mêmes scénarios : src/sim/final.test.ts.
import { describe, expect, it } from 'vitest';
import { STEP } from '../sim/balance';
import { hitEnemy } from '../sim/combat';
import { heartOf, summonHeart } from '../sim/final';
import { enterArena, nextStage, startEndless, summonStageBoss } from '../sim/stages';
import { step } from '../sim/step';
import { Mode } from '../sim/types';
import { World } from '../sim/world';
import { checkAchievements } from './achievements';
import { creditAbandoned, creditOutcome, runOutcome } from './outcome';
import { normalizeMeta } from './save';
import { restoreWorld, snapshotWorld } from '../sim/snapshot';
import type { RunSnap } from '../sim/snapshot';

/** Le monde 3 vaincu (son boss abattu), puis l'Arène, le boss final sorti. */
function inArena(seed: number): World {
  const w = new World(seed);
  w.player.maxHp = w.player.hp = 1e9;
  nextStage(w);
  nextStage(w);
  summonStageBoss(w);
  hitEnemy(w, w.bossIndex, 1e12, 0, 0, 0);
  enterArena(w);
  w.chestCount = 0;
  summonHeart(w);
  return w;
}
/** Ce que main.ts (gameOver) écrit dans la méta pour cette partie. */
function record(w: World) {
  const m = normalizeMeta({ version: 5 });
  const o = runOutcome(w);
  creditOutcome(m.stats, o);
  m.stats.bestStage = Math.max(m.stats.bestStage, w.stage + 1);
  return { m, o, fresh: checkAchievements(m).map((a) => a.id) };
}

describe('la progression après l’Arène (décisions 1, 9 et 10)', () => {
  it('Dying in the Arena keeps the world 3 victory, for the progression too', () => {
    const w = inArena(3);
    w.player.hp = -1e12;
    w.player.revives = 0;
    step(w, { mx: 0, mz: 0, jump: false, spell: false, pick: -1 }, STEP);
    expect(w.mode).toBe(Mode.Dead);
    const { m, o, fresh } = record(w);
    expect(o).toEqual({ won: true, heart: false, arena: true });
    expect(m.stats.wins).toBe(1); // statistique « victoires »
    expect(fresh).toContain('win'); // et son succès (la Revenante)
    expect(fresh).not.toContain('aube');
    expect(m.stats.bestStage).toBe(4);
  });

  it('Beating the Heart of the Night grants the total victory and the Dawn achievement', () => {
    const w = inArena(4);
    w.finalPhase = 4;
    const h = heartOf(w)!;
    h.hp = 1;
    hitEnemy(w, w.enemies.indexOf(h), 1e12, 0, 0, 0);
    expect(w.mode).toBe(Mode.Won);
    const { m, o, fresh } = record(w);
    // vaincu, le boss final n'a pas gagné : l'écran de fin dit « Victoire ! », pas « Vaincu par le Cœur de la Nuit »
    expect(o).toEqual({ won: true, heart: true, arena: false });
    expect([m.stats.wins, m.stats.hearts]).toEqual([1, 1]);
    expect(fresh).toEqual(expect.arrayContaining(['win', 'aube']));
    // mort ensuite en monde infini : la victoire et le boss final restent comptés
    startEndless(w);
    w.player.hp = -1e12;
    w.player.revives = 0;
    step(w, { mx: 0, mz: 0, jump: false, spell: false, pick: -1 }, STEP);
    expect(runOutcome(w)).toEqual({ won: true, heart: true, arena: false });
    // le défi du jour ne gagne ni l'un ni l'autre
    const d = new World(5, { daily: true });
    d.mode = Mode.Won;
    expect(runOutcome(d)).toEqual({ won: false, heart: false, arena: false });
  });

  it('a run saved after world 3 and abandoned for a new one keeps its victory', () => {
    // la partie gardée (instantané, comme sur l'appareil), puis « Nouvelle partie » : main.ts (countAbandon) la relit
    const keep = (w: World): World => restoreWorld(JSON.parse(JSON.stringify(snapshotWorld(w))) as RunSnap);
    const m = normalizeMeta({ version: 5 });
    const o = creditAbandoned(m, keep(inArena(6)), 'eclaireuse');
    expect(o).toEqual({ won: true, heart: false, arena: true });
    expect([m.stats.wins, m.stats.hearts, m.stats.bestStage]).toEqual([1, 0, 4]);
    expect(m.chars.eclaireuse?.wins).toBe(1); // défi « victoire » du personnage
    expect(m.chars.eclaireuse?.runs).toBe(0); // le reste de la partie abandonnée ne compte pas, comme avant
    expect(checkAchievements(m).map((a) => a.id)).toContain('win');
    // le boss final abattu (feuille de victoire gardée) : sa victoire aussi
    const won = inArena(7);
    won.finalPhase = 4;
    const h = heartOf(won)!;
    h.hp = 1;
    hitEnemy(won, won.enemies.indexOf(h), 1e12, 0, 0, 0);
    const m2 = normalizeMeta({ version: 5 });
    expect(creditAbandoned(m2, keep(won), 'eclaireuse')).toEqual({ won: true, heart: true, arena: false });
    expect([m2.stats.wins, m2.stats.hearts]).toEqual([1, 1]);
    // une partie qui n'a pas vaincu le monde 3, ou un défi du jour : rien
    const m3 = normalizeMeta({ version: 5 });
    expect(creditAbandoned(m3, keep(new World(8)), 'eclaireuse')).toBeNull();
    expect(creditAbandoned(m3, keep(new World(9, { daily: true })), 'eclaireuse')).toBeNull();
    expect(m3.stats.wins).toBe(0);
  });
});
