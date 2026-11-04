// Spawner : densité intégrée, vagues, boss, compensation d'ennui, replacement (sim-testing §1).
import { describe, expect, it } from 'vitest';
import { ARCHER_TYPE, BOSS_TYPE, CAPS, CRACHEUR_TYPE, SORCIER_TYPE, SPAWN, STEP } from './balance';
import { respawnNear, spawnEnemy, tickSpawner } from './spawner';
import { startRun, step } from './step';
import { Ev } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: 0 };

/** Fait tourner le spawner seul (sans combat ni mort) pendant `seconds`. */
function runSpawner(w: World, seconds: number, onStep?: (w: World) => void): void {
  const n = Math.round(seconds / STEP);
  for (let f = 0; f < n; f++) {
    w.t += STEP;
    w.lastAction = w.t; // pas d'ennui : on mesure la courbe nominale
    w.clearEvents();
    tickSpawner(w, STEP);
    onStep?.(w);
  }
}

describe('spawner', () => {
  it('crée sur 60 s le nombre d’ennemis de l’intégrale de rate ±10 % (hors vague)', () => {
    const w = new World(1);
    let waveN = 0;
    runSpawner(w, 59.9, (w) => {
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Wave) waveN += w.events[k].v;
    });
    expect(waveN).toBe(0); // la première vague est à 60 s
    // ∫0^60 (0.7 + t/240) dt = 42 + 7.5
    let expected = 0;
    for (let t = 0; t < 60; t += STEP) expected += SPAWN.rate(t) * STEP;
    expect(w.enemyCount).toBeGreaterThan(expected * 0.9);
    expect(w.enemyCount).toBeLessThan(expected * 1.1);
  });
  it('vague d’encerclement à 60 s : waveCount ennemis en anneau + événement Wave', () => {
    const w = new World(2);
    let wave = -1;
    runSpawner(w, 60.5, (w) => {
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Wave) wave = w.events[k].v;
    });
    expect(wave).toBe(SPAWN.waveCount(60));
    expect(w.nextWave).toBe(2 * SPAWN.wavePeriod);
  });
  it('boss à 5:00 : un Gardien, bossIndex renseigné, événement BossSpawn', () => {
    const w = new World(3);
    let bossEv = 0;
    runSpawner(w, 300.5, (w) => {
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.BossSpawn) bossEv++;
    });
    expect(bossEv).toBe(1);
    expect(w.bossCount).toBe(1);
    expect(w.bossIndex).toBeGreaterThanOrEqual(0);
    expect(w.enemies[w.bossIndex].type).toBe(BOSS_TYPE);
    expect(w.enemies[w.bossIndex].hp).toBeGreaterThan(900); // ×hpScale(300)
  });
  it('ne dépasse jamais la capacité du pool', () => {
    const w = new World(4);
    runSpawner(w, 900);
    expect(w.enemyCount).toBeLessThanOrEqual(CAPS.enemies);
    expect(w.enemyCount).toBe(CAPS.enemies); // à 15 min sans mort, le pool est plein
  });
  it('compensation d’ennui : 4 s sans action → densité doublée pendant 6 s', () => {
    const w = new World(5);
    w.lastAction = 0;
    for (let f = 0; f < Math.round(4.5 / STEP); f++) {
      w.t += STEP;
      tickSpawner(w, STEP);
    }
    expect(w.boredomUntil).toBeGreaterThan(w.t);
    expect(w.boredomUntil).toBeCloseTo(SPAWN.boredomAfter + SPAWN.boredomFor + STEP, 1);
  });
  it('types selon le temps : Spectres seuls au départ, Dards après 40 s, Brutes après 90 s, tireurs (phase 16)', () => {
    expect(SPAWN.pick(0, 0.01)).toBe(0);
    expect(SPAWN.pick(0, 0.99)).toBe(0);
    expect(SPAWN.pick(60, 0.1)).toBe(1);
    expect(SPAWN.pick(60, 0.9)).toBe(0);
    // après 1:30, une bande de tireurs est tirée d'abord ; le reste garde les proportions des marcheurs
    const s120 = SPAWN.shooterShare(120);
    expect(SPAWN.pick(120, s120 * 0.5)).toBe(ARCHER_TYPE); // seul tireur avant 3:00
    expect(SPAWN.pick(120, s120 + (1 - s120) * 0.01)).toBe(2);
    const s200 = SPAWN.shooterShare(200);
    expect(SPAWN.pick(200, s200 * 0.4)).toBe(CRACHEUR_TYPE); // Cracheur dès 3:00
    expect(SPAWN.pick(200, s200 * 0.2)).toBe(CRACHEUR_TYPE); // pas encore de Sorcier
    expect(SPAWN.pick(300, SPAWN.shooterShare(300) * 0.2)).toBe(SORCIER_TYPE); // Sorcier dès 4:00
    expect(SPAWN.pick(200, s200 + (1 - s200) * 0.02)).toBe(4); // Volant après 3:00
    expect(SPAWN.pick(170, SPAWN.shooterShare(170) + 0.02)).not.toBe(4);
    expect(SPAWN.shooterShare(60)).toBe(0);
    expect(SPAWN.shooterShare(600)).toBeCloseTo(0.18, 2);
  });
  it('respawnNear replace un ennemi trop loin devant le joueur', () => {
    const w = new World(6);
    startRun(w);
    const i = spawnEnemy(w, 0, 0, 100); // bien au-delà de despawnDist
    expect(w.enemies[i].z).toBeGreaterThan(50);
    step(w, { ...still, mz: 1 }, STEP); // le joueur avance : l’ennemi loin est replacé
    let far = 0;
    for (let k = 0; k < w.enemyCount; k++) {
      const e = w.enemies[k];
      const d = Math.hypot(e.x - w.player.x, e.z - w.player.z);
      if (d > SPAWN.despawnDist) far++;
    }
    expect(far).toBe(0);
    // appel direct, joueur immobile : angle aléatoire, distance ringMin
    const j = spawnEnemy(w, 0, 0, 100);
    w.player.vx = w.player.vz = 0;
    respawnNear(w, j);
    const e = w.enemies[j];
    expect(Math.hypot(e.x - w.player.x, e.z - w.player.z)).toBeCloseTo(SPAWN.ringMin, 5);
  });
  it('spawnEnemy rend -1 quand le pool est plein', () => {
    const w = new World(7);
    for (let i = 0; i < CAPS.enemies; i++) expect(spawnEnemy(w, 0, i, 20)).toBe(i);
    expect(spawnEnemy(w, 0, 0, 20)).toBe(-1);
  });
});
