// Phase 31 : relance des cartes de montée de niveau (une par partie au départ, plus celles de la boutique).
import { describe, expect, it } from 'vitest';
import { RUN_REROLL, STEP } from './balance';
import { LEVEL_REROLL, canReroll, nextChoice } from './progression';
import { startRun, step } from './step';
import { Ev, Mode } from './types';
import type { Input } from './types';
import { World } from './world';

const pick = (p: number): Input => ({ mx: 0, mz: 0, jump: false, spell: false, pick: p });
const keys = (w: World) => w.cards.map((c) => `${c.kind}:${c.key}`).join(',');

/** Monde en montée de niveau (cartes d'arme et de tome), sans ennemi. */
function levelUp(seed: number, rerolls?: number): World {
  const w = new World(seed, { rerolls });
  startRun(w);
  w.pending = 1;
  nextChoice(w);
  return w;
}

describe('relance des cartes (phase 31)', () => {
  it('une relance par défaut ; elle consomme, tire d’autres cartes et s’annonce', () => {
    const w = levelUp(3);
    expect(w.rerolls).toBe(RUN_REROLL.base);
    expect(w.mode).toBe(Mode.LevelUp);
    expect(canReroll(w)).toBe(true);
    const before = keys(w);
    step(w, pick(LEVEL_REROLL), STEP);
    expect(w.rerolls).toBe(RUN_REROLL.base - 1);
    expect(w.mode).toBe(Mode.LevelUp);
    expect(w.cards.length).toBeGreaterThan(0);
    let ev = 0;
    for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.Reroll) ev++;
    expect(ev).toBe(1);
    // le pool est grand au départ : aucune carte vue ne revient
    const seen = new Set(before.split(','));
    for (const k of keys(w).split(',')) expect(seen.has(k)).toBe(false);
  });
  it('refusée à zéro relance : les cartes ne bougent pas', () => {
    const w = levelUp(4, 0);
    expect(canReroll(w)).toBe(false);
    const before = keys(w);
    step(w, pick(LEVEL_REROLL), STEP);
    expect(keys(w)).toBe(before);
    expect(w.rerolls).toBe(0);
  });
  it('refusée pour un coffre d’objets (le marchand a sa propre relance)', () => {
    const w = new World(6, { rerolls: 3 });
    startRun(w);
    w.itemPicks = 1;
    nextChoice(w);
    expect(w.cards[0].kind).toBe('i');
    expect(canReroll(w)).toBe(false);
    step(w, pick(LEVEL_REROLL), STEP);
    expect(w.rerolls).toBe(3);
  });
  it('les relances achetées s’ajoutent ; même graine et mêmes entrées : mêmes cartes', () => {
    const a = levelUp(9, 4),
      b = levelUp(9, 4);
    for (let k = 0; k < 4; k++) {
      step(a, pick(LEVEL_REROLL), STEP);
      step(b, pick(LEVEL_REROLL), STEP);
      expect(keys(a)).toBe(keys(b));
    }
    expect(a.rerolls).toBe(0);
    step(a, pick(0), STEP); // la carte se prend normalement après une relance
    expect(a.pending).toBe(0);
  });
});
