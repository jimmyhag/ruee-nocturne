// Interface « Nocturne » (docs/specs/ui-nocturne.md) : la logique de l'accueil, sans DOM. Prochain objectif (décision 9),
// première ouverture et joueur existant (décision 10), carrousel de héros (décision 8). Les scénarios eux-mêmes, avec le
// rendu, sont dans e2e/nocturne.spec.ts.
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../sim/balance';
import { nextGoal } from '../meta/achievements';
import { DEFAULT_META, normalizeMeta } from '../meta/save';
import { LOCKED_TABS, stepHero, tabsLocked } from './home';

const fresh = () => normalizeMeta(DEFAULT_META);

describe('first open, three tabs dimmed', () => {
  it('a new player has Slots, Library and Leaderboard locked, and « Première nuit » as goal', () => {
    const m = fresh();
    expect(m.reveal).toBe(0);
    expect(tabsLocked(m)).toBe(true);
    expect([...LOCKED_TABS]).toEqual(['shopBtn', 'libBtn', 'boardBtn']);
    expect(nextGoal(m)?.id).toBe('survie3');
  });
  it('the tabs open after the first finished run', () => {
    const m = fresh();
    m.reveal = 1;
    expect(tabsLocked(m)).toBe(false);
  });
});

describe('an existing player sees no locked tab', () => {
  it('a save from before the update that counts runs keeps everything open and intact', () => {
    // forme écrite par la 1.57.0 (version 5, sans `reveal`) : la migration du lot L2 donne 4
    const m = normalizeMeta({ version: 5, runs: 9, gold: 1234, achievements: ['survie3', 'kills500'] });
    expect(m.reveal).toBe(4);
    expect(tabsLocked(m)).toBe(false);
    expect(m.gold).toBe(1234);
    expect(m.runs).toBe(9);
    expect(m.achievements).toEqual(['survie3', 'kills500']);
  });
});

describe('next goal on the home screen', () => {
  it('is the most advanced achievement that unlocks something, never a hero challenge nor one already won', () => {
    const m = normalizeMeta({
      version: 5,
      runs: 4,
      achievements: ['survie3'],
      stats: { kills: 372, bestTime: 200 },
    });
    const a = nextGoal(m)!;
    expect(a.unlocks).toBeDefined();
    expect(a.char).toBeUndefined();
    expect(m.achievements).not.toContain(a.id);
    expect(a.id).toBe('kills500'); // 372 / 500 : le plus avancé (la maquette montre « Faucheuse en herbe »)
  });
  it('after the first run, « Première nuit » is no longer forced', () => {
    const m = normalizeMeta({ version: 5, runs: 1, achievements: ['survie3'] });
    expect(nextGoal(m)?.id).not.toBe('survie3');
  });
});

describe('the hero carousel changes hero by touch and keyboard', () => {
  it('next then previous comes back to the first hero, and the carousel wraps around', () => {
    const first = CHARACTERS[0].key;
    const second = stepHero(first, 1);
    expect(second).toBe(CHARACTERS[1].key);
    expect(stepHero(second, -1)).toBe(first);
    expect(stepHero(first, -1)).toBe(CHARACTERS[CHARACTERS.length - 1].key);
  });
});
