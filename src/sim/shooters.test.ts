// Tireurs (phase 16) : l'Archer garde ses distances et tire des flèches arrêtées par les obstacles, l'élite tire en
// éventail ; le Sorcier lance une boule de feu télégraphiée qui explose là où était le joueur ; plafond de tireurs.
import { describe, expect, it } from 'vitest';
import { ARCHER, ARCHER_TYPE, MAP, SORCIER, SORCIER_TYPE, SPAWN, STEP } from './balance';
import { spawnEnemy, tickSpawner } from './spawner';
import { step } from './step';
import { Ev, HurtSrc, ShotKind } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };

/** Monde sans obstacles ni spawner, joueur immobile au centre, sans armes. */
function quiet(): World {
  const w = new World(3);
  w.weapons = {};
  w.obstacles = [];
  w.walls = [];
  w.obstacleGrid.clear();
  w.wallGrid.clear();
  w.solid.fill(0);
  w.near.fill(0);
  w.lakes = [];
  w.nextWave = w.nextElite = w.nextEruption = 1e9;
  w.spawnAcc = -1e9;
  w.player.hp = w.player.maxHp = 1e6;
  return w;
}
const count = (w: World, kind: ShotKind) => {
  let n = 0;
  for (let i = 0; i < w.shotCount; i++) if (w.shots[i].kind === kind) n++;
  return n;
};

describe('Archer', () => {
  it('garde 10–13 u et tire des flèches qui blessent', () => {
    const w = quiet();
    const i = spawnEnemy(w, ARCHER_TYPE, 0, 20);
    const e = w.enemies[i];
    let minD = Infinity,
      arrows = 0,
      hurtByArrow = false;
    for (let k = 0; k < 60 * 12; k++) {
      step(w, still, STEP);
      for (let j = 0; j < w.eventCount; j++) if (w.events[j].type === Ev.Arrow) arrows++;
      if (w.lastHurt === HurtSrc.Arrow) hurtByArrow = true;
      if (k > 60 * 4) minD = Math.min(minD, Math.hypot(e.x - w.player.x, e.z - w.player.z));
    }
    expect(minD).toBeGreaterThan(ARCHER.keepMin - 1.5);
    expect(arrows).toBeGreaterThanOrEqual(3);
    expect(hurtByArrow).toBe(true);
  });
  it('la flèche part dans la direction figée au début de la visée : un pas de côté l’esquive', () => {
    const w = quiet();
    const i = spawnEnemy(w, ARCHER_TYPE, 0, 11); // au nord, à bonne distance
    const e = w.enemies[i];
    e.timer = 0;
    step(w, still, STEP); // commence la visée
    expect(e.state).toBe(1);
    const hp = w.player.hp;
    // le joueur s'écarte vers l'est pendant la visée et le vol
    for (let k = 0; k < 90; k++) step(w, { ...still, mx: 1 }, STEP);
    expect(w.player.hp).toBe(hp);
  });
  it('une flèche s’arrête sur un muret placé entre l’Archer et le joueur', () => {
    const w = quiet();
    w.walls.push({ x1: -3, z1: 4, x2: 3, z2: 4, r: MAP.wallR, h: MAP.wallH, kind: 0 });
    for (const k of [0 * 65536 + 0, -1 * 65536 + 0]) w.wallGrid.set(k, [0]);
    w.near.fill(1); // le muret posé à la main : toute la zone compte comme proche d'un obstacle
    const i = spawnEnemy(w, ARCHER_TYPE, 0, 11);
    const e = w.enemies[i];
    e.timer = 0;
    e.spd = 0; // immobile : il tire à travers le muret
    const hp = w.player.hp;
    let blocked = 0;
    for (let k = 0; k < 60 * 3; k++) {
      step(w, still, STEP);
      for (let j = 0; j < w.eventCount; j++) if (w.events[j].type === Ev.ShotBlocked) blocked++;
    }
    expect(blocked).toBeGreaterThanOrEqual(1);
    expect(w.player.hp).toBe(hp);
  });
  it('l’Archer élite tire une volée de trois flèches', () => {
    const w = quiet();
    const i = spawnEnemy(w, ARCHER_TYPE, 0, 11, true);
    w.enemies[i].timer = 0;
    let n = 0;
    for (let k = 0; k < 60 && n === 0; k++) {
      step(w, still, STEP);
      n = count(w, ShotKind.Arrow);
    }
    expect(n).toBe(ARCHER.volley);
  });
});

describe('Sorcier', () => {
  it('lance une boule de feu télégraphiée sur la position du joueur, qui explose après le vol', () => {
    const w = quiet();
    const i = spawnEnemy(w, SORCIER_TYPE, 0, 13);
    w.enemies[i].timer = 0;
    let cast = false,
      tele = false;
    for (let k = 0; k < 60 && !cast; k++) {
      step(w, still, STEP);
      for (let j = 0; j < w.eventCount; j++) {
        if (w.events[j].type === Ev.Cast) cast = true;
        if (w.events[j].type === Ev.Telegraph) tele = true;
      }
    }
    expect(cast && tele).toBe(true);
    expect(count(w, ShotKind.Fireball)).toBe(1);
    const hp = w.player.hp;
    for (let k = 0; k < Math.ceil((SORCIER.cast / STEP) * 1.05); k++) step(w, still, STEP);
    expect(w.player.hp).toBeLessThan(hp); // resté dans le cercle
    expect(w.lastHurt).toBe(HurtSrc.Fire);
  });
  it('sortir du cercle pendant le vol suffit', () => {
    const w = quiet();
    const i = spawnEnemy(w, SORCIER_TYPE, 0, 13);
    w.enemies[i].timer = 0;
    for (let k = 0; k < 60 && count(w, ShotKind.Fireball) === 0; k++) step(w, still, STEP);
    const hp = w.player.hp;
    w.enemies[i].timer = 99; // pas de second lancer pendant le test
    w.enemies[i].state = 0;
    for (let k = 0; k < Math.ceil((SORCIER.cast / STEP) * 1.05); k++) step(w, { ...still, mx: 1 }, STEP);
    expect(w.player.hp).toBe(hp);
  });
});

describe('plafond de tireurs', () => {
  it('au-delà de SPAWN.maxShooters, le tirage retombe sur un Spectre', () => {
    const w = quiet();
    w.t = 600;
    w.spawnAcc = 0;
    w.shooters = SPAWN.maxShooters;
    const before = w.enemyCount;
    // force des tirages qui tomberaient tous dans la bande des tireurs
    const orig = w.rng.next.bind(w.rng);
    w.rng.next = () => 0.001;
    tickSpawner(w, 10 / SPAWN.rate(600));
    w.rng.next = orig;
    for (let k = before; k < w.enemyCount; k++) expect(w.enemies[k].type).toBe(0);
    expect(w.enemyCount).toBeGreaterThan(before);
  });
});
