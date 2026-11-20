// Explications au bon moment (docs/specs/rafales-faux-guidage.md, décisions 2 à 5) : le portail, le temps écoulé et le
// monde infini s'expliquent dans une fenêtre, une fois par joueur. Ici l'automate du guide et la méta ; la fenêtre
// elle-même (pause, « Compris », clavier et toucher, FR et EN) est vérifiée par e2e/rafales-faux.spec.ts.
import { describe, expect, it } from 'vitest';
import { ENEMIES, STAGE, STEP } from '../sim/balance';
import { killEnemy } from '../sim/combat';
import { summonStageBoss } from '../sim/stages';
import { startRun, step } from '../sim/step';
import { Ev, Mode, Pw } from '../sim/types';
import type { Input } from '../sim/types';
import { World } from '../sim/world';
import { ALL_HINTS, HINTS, Hint, WINDOW_HINTS, newGuide, takeWindow, updateGuide } from './guide';
import type { GuideState } from './guide';
import { DEFAULT_META, normalizeMeta } from './save';
import { worldOptions } from './shop';

const idle: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
/** Un joueur qui a tout vu, sauf les fenêtres `unseen`. */
const seenBut = (...unseen: Hint[]): number => unseen.reduce((m, h) => m & ~(1 << h), ALL_HINTS);
/** Partie normale au repos : héros increvable, horde retirée (seuls comptent les horloges, le totem et le guide). */
function quietWorld(seed: number, hints: number): { w: World; g: GuideState } {
  const w = new World(seed, worldOptions({ ...DEFAULT_META, hints }, undefined));
  startRun(w);
  for (let i = w.enemyCount - 1; i >= 0; i--) if (!ENEMIES[w.enemies[i].type].boss) w.freeEnemy(i);
  w.powerT[Pw.Gel] = 1e9;
  w.player.maxHp = w.player.hp = 1e9;
  w.player.need = 1e9;
  w.nextWave = w.nextElite = w.nextEruption = w.powerNext = 1e9;
  w.merchant.next = 99;
  return { w, g: newGuide(w, false, hints) };
}
/** Un pas de jeu, suivi par le guide ; renvoie la fenêtre à ouvrir (comme main.ts quand le jeu tourne), -1 sinon. */
function tick(w: World, g: GuideState): number {
  const t0 = w.t;
  step(w, idle, STEP);
  updateGuide(g, w, w.t - t0);
  return w.mode === Mode.Play ? takeWindow(g) : -1;
}
/** Le boss du totem du monde tombe (au pas suivant : portail ouvert, chrono à 0). */
function beatTotemBoss(w: World): void {
  summonStageBoss(w);
  w.clearEvents();
  killEnemy(w, w.bossIndex);
}

describe('fenêtres de première fois', () => {
  it('the three windows have their bits and their texts in both languages', () => {
    expect(WINDOW_HINTS.map((h) => HINTS[h])).toEqual(['portal', 'overtime', 'endless']);
    // bits ajoutés en dernier : ceux d'avant gardent leur place dans les sauvegardes
    expect(HINTS.indexOf('corrupt')).toBe(6);
    const m = normalizeMeta(JSON.parse(JSON.stringify({ ...DEFAULT_META, hints: ALL_HINTS })));
    expect(m.hints).toBe(ALL_HINTS);
  });

  it('The portal explains itself only once', () => {
    // un joueur qui n'a jamais vu de portail : le boss du monde meurt, la fenêtre s'ouvre (le jeu tourne : main.ts la
    // met en pause) ; au portail suivant, plus rien
    const first = quietWorld(5, seenBut(Hint.Portal));
    beatTotemBoss(first.w);
    updateGuide(first.g, first.w, 0);
    expect(first.w.portal.open).toBe(true);
    expect(takeWindow(first.g)).toBe(Hint.Portal);
    expect(first.g.portal).toBe(true); // puis la flèche vers le portail
    // le chrono est tombé à 0 en même temps : pas de seconde fenêtre « Temps écoulé ! » pour la même chute
    let other = -1;
    for (let k = 0; k < 120 && other < 0; k++) other = tick(first.w, first.g);
    expect(other).toBe(-1);
    // retenue dans la méta (main.ts : hintShown), gardée par une sauvegarde normalisée
    const hints = normalizeMeta(JSON.parse(JSON.stringify({ ...DEFAULT_META, hints: first.g.hints }))).hints;
    expect(hints & (1 << Hint.Portal)).not.toBe(0);
    const next = quietWorld(6, hints);
    beatTotemBoss(next.w);
    updateGuide(next.g, next.w, 0);
    expect(next.w.portal.open).toBe(true);
    expect(takeWindow(next.g)).toBe(-1);
  });

  it('Time running out is announced only once', () => {
    // le chrono atteint 0 sans que le boss du monde soit tué : « Temps écoulé ! », une fois
    const first = quietWorld(7, seenBut(Hint.Overtime));
    first.w.stageT = STAGE.dur - 0.5;
    let shown = -1;
    for (let k = 0; k < 60 && shown < 0; k++) shown = tick(first.w, first.g);
    expect(first.w.overT).toBeGreaterThan(0);
    expect(shown).toBe(Hint.Overtime);
    for (let k = 0; k < 120; k++) expect(tick(first.w, first.g)).toBe(-1); // pas deux fois dans la prolongation
    // le joueur suivant (méta retenue) : le chrono d'un autre monde atteint 0, rien
    const next = quietWorld(8, first.g.hints);
    next.w.stageT = STAGE.dur - 0.5;
    for (let k = 0; k < 120; k++) expect(tick(next.w, next.g)).toBe(-1);
    // le combat du boss en cours au chrono à 0 l'annonce aussi (le boss n'est pas tué)
    const fight = quietWorld(9, seenBut(Hint.Overtime));
    summonStageBoss(fight.w);
    fight.w.stageT = STAGE.dur - 0.5;
    shown = -1;
    for (let k = 0; k < 60 && shown < 0; k++) shown = tick(fight.w, fight.g);
    expect(shown).toBe(Hint.Overtime);
  });

  it('The endless world is announced only once', () => {
    // la première entrée dans un monde infini (ici, le défi du jour continué) : « Monde infini ! », une fois
    const first = quietWorld(10, seenBut(Hint.Endless));
    first.w.endless = true;
    expect(tick(first.w, first.g)).toBe(Hint.Endless);
    for (let k = 0; k < 60; k++) expect(tick(first.w, first.g)).toBe(-1);
    const next = quietWorld(11, first.g.hints);
    next.w.endless = true;
    for (let k = 0; k < 60; k++) expect(tick(next.w, next.g)).toBe(-1);
  });

  it('a window waits for the sheet already open, and a hint of the same step waits for its next appearance', () => {
    // décision 5 : une carte de niveau ouverte passe d'abord (main.ts n'ouvre la fenêtre que le jeu en marche)
    const { w, g } = quietWorld(12, seenBut(Hint.Endless, Hint.Power));
    w.endless = true;
    w.mode = Mode.LevelUp;
    w.clearEvents();
    w.emit(Ev.PowerDrop, 0, 0, 0); // un bonus tombe au même pas : sa bulle s'userait derrière la pause
    updateGuide(g, w, 0);
    expect(g.win).toBe(1 << Hint.Endless); // en attente tant que la feuille est ouverte
    expect(g.hint).toBe(-1);
    expect(g.hints & (1 << Hint.Power)).toBe(0); // elle reviendra au bonus suivant
    w.mode = Mode.Play;
    expect(takeWindow(g)).toBe(Hint.Endless);
    expect(takeWindow(g)).toBe(-1);
  });
});
