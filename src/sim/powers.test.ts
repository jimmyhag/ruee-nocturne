// Phase 35 : bonus au sol (Aimant, Pluie d'or, Élan, Temps figé, Rage).
import { describe, expect, it } from 'vitest';
import { CAPS, PLAY_LIMIT, POWER, POWER_KEYS, STEP } from './balance';
import { dropGem, hitEnemy, killEnemy } from './combat';
import { dropPower, powerOnKill, rollPowerKind } from './powers';
import { spawnEnemy } from './spawner';
import { startRun, step } from './step';
import { Ev, HitSrc, Mode, Pw, ShotKind } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
const count = (w: World, type: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === type) n++;
  return n;
};
/** Monde calme : héros invulnérable, sans arme, sans montée de niveau ni bonus de carte. */
const calm = (seed = 1) => {
  const w = new World(seed);
  w.player.maxHp = w.player.hp = 1e9;
  w.player.need = 1e9;
  w.weapons = {};
  w.powerNext = 1e9;
  return w;
};
const steps = (w: World, n: number, inp: Input = still) => {
  for (let i = 0; i < n; i++) step(w, inp, STEP);
};
/** Pose un bonus sous les pieds du héros et le fait ramasser. */
const take = (w: World, kind: Pw) => {
  dropPower(w, w.player.x, w.player.z, kind);
  step(w, still, STEP);
};

describe('bonus au sol : contenu et apparition', () => {
  it('cinq bonus, poids et durées alignés sur POWER_KEYS', () => {
    expect(POWER_KEYS).toEqual(['aimant', 'or', 'vitesse', 'gel', 'rage']);
    expect(POWER.weights.length).toBe(5);
    expect(POWER.dur.length).toBe(5);
    expect(POWER.dur[Pw.Aimant]).toBe(0); // instantané
  });
  it('le tirage couvre les cinq bonus, à peu près selon leurs poids', () => {
    const w = new World(3);
    const n = [0, 0, 0, 0, 0];
    for (let i = 0; i < 5000; i++) n[rollPowerKind(w)]++;
    const sum = POWER.weights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < 5; k++) expect(n[k] / 5000).toBeCloseTo(POWER.weights[k] / sum, 1);
  });
  it('un boss lâche deux bonus, une élite souvent, un ennemi normal rarement', () => {
    const w = calm();
    powerOnKill(w, 0, 0, false, true);
    expect(w.powerCount).toBe(POWER.bossDrops);
    let elite = 0,
      normal = 0;
    for (let i = 0; i < 2000; i++) {
      const a = w.powersDropped;
      powerOnKill(w, 5, 5, true, false);
      elite += w.powersDropped - a;
      const b = w.powersDropped;
      powerOnKill(w, 5, 5, false, false);
      normal += w.powersDropped - b;
    }
    expect(elite / 2000).toBeCloseTo(POWER.eliteChance, 1);
    expect(normal / 2000).toBeLessThan(0.02);
    expect(w.powerCount).toBe(CAPS.powers); // pool plafonné : le plus ancien est remplacé
  });
  it('un bonus de carte apparaît devant le héros, dans les limites, toutes les 35 à 55 s', () => {
    const w = calm(7);
    w.powerNext = POWER.mapFirst;
    startRun(w);
    w.enemyCount = 0;
    const times: number[] = [];
    for (let f = 0; f < 60 * 160 && w.mode === Mode.Play; f++) {
      step(w, { ...still, mx: 0.001, mz: 1 }, STEP); // le héros regarde vers +z (quasi immobile)
      w.player.x = 0;
      w.player.z = 0;
      for (let k = 0; k < w.eventCount; k++) {
        const e = w.events[k];
        if (e.type !== Ev.PowerDrop) continue;
        times.push(w.t);
        expect(Math.abs(e.x)).toBeLessThanOrEqual(PLAY_LIMIT);
        expect(Math.abs(e.z)).toBeLessThanOrEqual(PLAY_LIMIT);
        const d = Math.hypot(e.x, e.z);
        expect(d).toBeGreaterThan(POWER.mapDist[0] - 3);
        expect(d).toBeLessThan(POWER.mapDist[1] + 3);
        expect(e.z).toBeGreaterThan(0); // devant
      }
    }
    expect(times[0]).toBeCloseTo(POWER.mapFirst, 0);
    expect(times.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(POWER.mapEvery[0] - 0.05);
      expect(times[i] - times[i - 1]).toBeLessThanOrEqual(POWER.mapEvery[1] + 0.05);
    }
  });
  it('un bonus disparaît après POWER.life s', () => {
    const w = calm();
    dropPower(w, 20, 20, Pw.Or);
    steps(w, Math.round((POWER.life - 0.5) * 60));
    expect(w.powerCount).toBe(1);
    steps(w, 60);
    expect(w.powerCount).toBe(0);
  });
});

describe('bonus au sol : ramassage et effets', () => {
  it('ramassé au contact seulement : l’aimant du héros ne l’attire pas', () => {
    const w = calm();
    w.player.magnet = 50;
    dropPower(w, w.player.x + 3, w.player.z, Pw.Rage);
    steps(w, 60);
    expect(w.powerCount).toBe(1);
    expect(w.powers[0].x).toBeCloseTo(w.player.x + 3, 6);
    w.player.x += 3;
    step(w, still, STEP);
    expect(w.powerCount).toBe(0);
    expect(w.powerT[Pw.Rage]).toBeGreaterThan(POWER.dur[Pw.Rage] - 0.1);
  });
  it('Aimant : toutes les gemmes de la carte filent vers le héros', () => {
    const w = calm();
    dropGem(w, 40, 40, 1);
    dropGem(w, -60, 10, 1);
    take(w, Pw.Aimant);
    for (let i = 0; i < w.gemCount; i++) expect(w.gems[i].mag).toBe(true);
    expect(w.powerT[Pw.Aimant]).toBe(0);
  });
  it('Pluie d’or : or des ennemis ×2 pendant sa durée', () => {
    const gold = (on: boolean) => {
      const w = calm();
      if (on) take(w, Pw.Or);
      const i = spawnEnemy(w, 0, 0, 6);
      const g0 = w.gold;
      killEnemy(w, i);
      return w.gold - g0;
    };
    expect(gold(true)).toBeCloseTo(gold(false) * POWER.goldMul, 6);
  });
  it('Élan : distance parcourue ×1,4', () => {
    const run = (on: boolean) => {
      const w = calm();
      w.enemyCount = 0;
      if (on) take(w, Pw.Vitesse);
      const x0 = w.player.x;
      steps(w, 60, { ...still, mx: 1 });
      return w.player.x - x0;
    };
    const a = run(false),
      b = run(true);
    expect(b / a).toBeGreaterThan(POWER.speedMul * 0.9);
    expect(b / a).toBeLessThan(POWER.speedMul * 1.1);
  });
  it('Rage : dégâts ×1,5', () => {
    const dealt = (on: boolean) => {
      const w = calm();
      if (on) take(w, Pw.Rage);
      const i = spawnEnemy(w, 2, 0, 6);
      const e = w.enemies[i];
      e.hp = e.max = 1e6;
      hitEnemy(w, i, 10, 0, e.x, e.z, HitSrc.Spell);
      return 1e6 - e.hp;
    };
    expect(dealt(true)).toBeCloseTo(dealt(false) * POWER.dmgMul, 6);
  });
  it('Temps figé : ennemis et tirs immobiles, aucun contact, mais les ennemis meurent sous les coups ; reprise ensuite', () => {
    const w = calm();
    startRun(w);
    w.player.hp = w.player.maxHp = 100;
    const i = spawnEnemy(w, 0, 0, 0.3); // collé au héros
    const s = w.allocShot()!;
    s.kind = ShotKind.Arrow;
    s.r = 0.3;
    s.x = s.px = 10;
    s.z = s.pz = 0;
    s.vx = 5;
    s.vz = 0;
    s.life = 10;
    s.dmg = 1;
    s.hit = false;
    take(w, Pw.Gel);
    const hp = w.player.hp; // le pas du ramassage a pu laisser l'ennemi frapper avant le gel
    const e = w.enemies[i];
    const ex = e.x,
      ez = e.z,
      sx = s.x;
    const spawned = w.enemyCount;
    steps(w, Math.round((POWER.dur[Pw.Gel] - 0.2) * 60));
    expect(w.player.hp).toBe(hp); // aucun dégât au contact
    expect(Math.hypot(e.x - ex, e.z - ez)).toBeLessThan(0.05);
    expect(s.x).toBe(sx);
    expect(w.enemyCount).toBe(spawned); // pas d'apparition
    expect(hitEnemy(w, i, 1e6, 0, 0, 0, HitSrc.Spell)).toBe(true);
    // fin de l'effet : un événement, puis tout repart
    let ended = 0;
    for (let f = 0; f < 30; f++) {
      step(w, still, STEP);
      ended += count(w, Ev.PowerEnd);
    }
    expect(ended).toBe(1);
    expect(w.powerT[Pw.Gel]).toBe(0);
    steps(w, 30);
    expect(s.x === sx && s.alive).toBe(false);
  });
  it('reprendre un bonus actif remet sa durée au maximum, sans cumul', () => {
    const w = calm();
    take(w, Pw.Rage);
    steps(w, 300);
    expect(w.powerT[Pw.Rage]).toBeCloseTo(POWER.dur[Pw.Rage] - 5, 1);
    take(w, Pw.Rage); // l'effet est posé en fin de pas : durée pleine
    expect(w.powerT[Pw.Rage]).toBeCloseTo(POWER.dur[Pw.Rage], 6);
    take(w, Pw.Or); // un autre bonus se cumule
    expect(w.powerT[Pw.Rage]).toBeGreaterThan(0);
    expect(w.powerT[Pw.Or]).toBeGreaterThan(0);
  });
  it('un run complet avec les bonus reste déterministe', () => {
    const a = new World(91),
      b = new World(91);
    for (const w of [a, b]) {
      w.player.maxHp = w.player.hp = 1e9;
      w.player.need = 1e9;
    }
    startRun(a);
    startRun(b);
    let drops = 0;
    for (let f = 0; f < 60 * 120; f++) {
      const inp = { ...still, mx: Math.cos(f / 90), mz: Math.sin(f / 70) };
      step(a, inp, STEP);
      step(b, inp, STEP);
      drops += count(a, Ev.PowerDrop);
      if (a.mode !== Mode.Play) break;
    }
    expect(drops).toBeGreaterThan(0);
    expect(a.powersDropped).toBe(b.powersDropped);
    expect(a.powersTaken).toBe(b.powersTaken);
    expect(a.rng.state()).toBe(b.rng.state());
  });
});
