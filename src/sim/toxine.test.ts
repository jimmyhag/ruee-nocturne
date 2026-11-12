// Phase 50 (demande de Jimmy) : Toxine, des doses qui rongent les boss et s'empilent avec les exemplaires.
import { describe, expect, it } from 'vitest';
import { ENEMIES, ITEM, It, STEP } from './balance';
import { hitEnemy } from './combat';
import { gainItem } from './items';
import { spawnEnemy } from './spawner';
import { step } from './step';
import { HitSrc } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
const BOSS = ENEMIES.findIndex((d) => d.boss);
const GRUNT = ENEMIES.findIndex((d) => !d.boss);

function lab(copies: number): { w: World; boss: number; grunt: number } {
  const w = new World(12);
  w.player.need = 1e9;
  w.player.maxHp = w.player.hp = 1e9;
  w.weapons = {};
  w.enemyCount = 0;
  w.nextElite = w.nextWave = w.nextEruption = 1e9;
  w.merchant.next = 99;
  w.survivalNext = 99;
  for (let k = 0; k < copies; k++) gainItem(w, It.Toxine);
  const boss = spawnEnemy(w, BOSS, 0, 8);
  const grunt = spawnEnemy(w, GRUNT, 2, 8);
  w.enemies[boss].hp = w.enemies[boss].max = 1e6;
  w.enemies[grunt].hp = w.enemies[grunt].max = 1e6;
  return { w, boss, grunt };
}
/** Frappe `n` fois l'ennemi d'index i (coups d'arme minuscules). */
function hit(w: World, i: number, n: number): void {
  for (let k = 0; k < n; k++) hitEnemy(w, i, 1e-3, w.player.x, w.player.z, HitSrc.Orbe);
}

describe('Toxine', () => {
  it('sans l’objet : jamais de dose (et aucun tirage en plus : les parties ne changent pas)', () => {
    const { w, boss } = lab(0);
    const s0 = w.rng.state();
    hit(w, boss, 200);
    expect(w.enemies[boss].tox).toBe(0);
    const ref = lab(0);
    hit(ref.w, ref.boss, 200);
    expect(ref.w.rng.state()).toBe(w.rng.state());
    expect(s0).not.toBeUndefined();
  });
  it('les boss seulement ; doses bornées par exemplaires (stacks × copies)', () => {
    for (const copies of [1, 2, 3]) {
      const { w, boss, grunt } = lab(copies);
      hit(w, grunt, 500);
      expect(w.enemies[grunt].tox).toBe(0);
      hit(w, boss, 2000);
      expect(w.enemies[boss].tox).toBe(ITEM.toxine.stacks * copies);
      expect(w.enemies[boss].toxT).toBeCloseTo(ITEM.toxine.t, 9);
    }
  });
  it('dégâts par seconde : doses × frac × PV max, puis plus rien quand la durée s’écoule', () => {
    const { w, boss } = lab(1);
    hit(w, boss, 2000);
    const e = w.enemies[boss];
    const doses = e.tox;
    e.stun = 1e9; // il ne bouge ni ne frappe : on mesure la toxine seule
    const hp0 = e.hp;
    for (let f = 0; f < Math.round(2 / STEP) + 3; f++) step(w, still, STEP); // 2 s : quatre coups (cadence ITEM.toxine.tick)
    const expected = doses * ITEM.toxine.frac * e.max * 2;
    expect(hp0 - e.hp).toBeGreaterThan(expected * 0.9);
    expect(hp0 - e.hp).toBeLessThan(expected * 1.1);
    for (let f = 0; f < Math.round((ITEM.toxine.t + 1) / STEP); f++) step(w, still, STEP);
    expect(e.tox).toBe(0);
    const hp1 = e.hp;
    for (let f = 0; f < 60; f++) step(w, still, STEP);
    expect(e.hp).toBe(hp1);
  });
  it('un boss tué par la toxine compte pour elle', () => {
    const { w, boss } = lab(3);
    hit(w, boss, 2000);
    w.enemies[boss].hp = 10;
    for (let f = 0; f < 60; f++) step(w, still, STEP);
    expect(w.srcKills[HitSrc.Toxin]).toBe(1);
  });
});
