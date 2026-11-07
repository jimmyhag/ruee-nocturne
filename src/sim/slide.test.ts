// Phase 27 : glissade (élan gagné en descente, perdu en montée et sur le plat), saut glissé, envol sur une crête,
// vrille en l'air (élan à la réception), Faucheur qui suit la vitesse du joueur. Terrains de test posés à la main.
import { describe, expect, it } from 'vitest';
import { REAPER_TYPE, SLIDE, STEP, TERRAIN, WORLD_HALF } from './balance';
import { spawnEnemy } from './spawner';
import { step } from './step';
import { TERRAIN_N } from './terrain';
import { Ev } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
const count = (w: World, t: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === t) n++;
  return n;
};

/** Monde vide (ni obstacle, ni lac, ni ennemi, ni arme), sol donné par h(x, z), joueur posé en (x, z). */
function lab(h: (x: number, z: number) => number, x = 0, z = 0): World {
  const w = new World(5);
  w.obstacles = [];
  w.walls = [];
  w.obstacleGrid.clear();
  w.wallGrid.clear();
  w.lakes = [];
  w.weapons = {};
  w.enemyCount = 0;
  w.nextWave = 1e9;
  w.player.maxHp = w.player.hp = 1e9;
  w.player.need = 1e9;
  const N = TERRAIN_N;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) w.height[j * N + i] = h(-WORLD_HALF + i * TERRAIN.cell, -WORLD_HALF + j * TERRAIN.cell);
  const P = w.player;
  P.x = P.px = x;
  P.z = P.pz = z;
  P.gPrev = w.heightAt(x, z);
  return w;
}
/** Avance `s` secondes avec l'entrée donnée ; renvoie le nombre d'événements `ev` vus. */
function run(w: World, input: Input, s: number, ev?: Ev): number {
  let n = 0;
  for (let f = 0; f < Math.round(s / STEP); f++) {
    step(w, input, STEP);
    if (ev !== undefined) n += count(w, ev);
  }
  return n;
}
const speed = (w: World) => Math.hypot(w.player.vx, w.player.vz);

describe('glissade (phase 27)', () => {
  it('sur le plat : départ au-dessus de la marche, puis l’élan retombe et la glissade s’arrête ; recharge courte', () => {
    const w = lab(() => 0);
    const walk = w.player.speed;
    run(w, { ...still, mx: 1 }, 0.3); // en marche
    let starts = 0;
    step(w, { ...still, mx: 1, slide: true }, STEP);
    starts += count(w, Ev.SlideStart);
    expect(starts).toBe(1);
    expect(w.player.sliding).toBe(true);
    expect(speed(w)).toBeGreaterThan(walk * 1.3);
    const ends = run(w, { ...still, mx: 1, slide: true }, 1.4, Ev.SlideEnd);
    expect(ends).toBe(1);
    expect(w.player.sliding).toBe(false);
    // relâcher puis retenir pendant la recharge ne relance pas tout de suite… puis relance après
    expect(run(w, { ...still, mx: 1, slide: true }, 0.2, Ev.SlideStart)).toBe(0);
    expect(run(w, { ...still, mx: 1 }, 0.3, Ev.SlideStart)).toBe(0);
    expect(run(w, { ...still, mx: 1, slide: true }, 0.1, Ev.SlideStart)).toBe(1);
  });
  it('relâcher la glisse l’arrête ; immobile, on ne glisse pas', () => {
    const w = lab(() => 0);
    expect(run(w, { ...still, slide: true }, 0.3, Ev.SlideStart)).toBe(0);
    run(w, { ...still, mx: 1 }, 0.2);
    run(w, { ...still, mx: 1, slide: true }, 0.2);
    expect(w.player.sliding).toBe(true);
    expect(run(w, { ...still, mx: 1 }, STEP, Ev.SlideEnd)).toBe(1);
  });
  it('en descente la glissade gagne de la vitesse (jusqu’au plafond), en montée elle cale vite', () => {
    const down = lab((x) => -0.25 * x, -60, 0);
    const walk = down.player.speed;
    run(down, { ...still, mx: 1 }, 0.2);
    run(down, { ...still, mx: 1, slide: true }, 2.5);
    expect(down.player.sliding).toBe(true);
    expect(speed(down)).toBeGreaterThan(walk * 2);
    expect(speed(down)).toBeLessThanOrEqual(walk * SLIDE.maxMul + 1e-6);
    const up = lab((x) => 0.25 * x, -60, 0);
    run(up, { ...still, mx: 1 }, 0.2);
    const ends = run(up, { ...still, mx: 1, slide: true }, 0.6, Ev.SlideEnd);
    expect(ends).toBe(1);
  });
  it('la pente fait tourner la glissade vers le bas ; l’entrée la tourne à vitesse bornée', () => {
    const w = lab((x, z) => -0.3 * z, 0, 0); // descente vers +z
    run(w, { ...still, mx: 1 }, 0.2);
    run(w, { ...still, mx: 1, slide: true }, 1);
    expect(w.player.vz).toBeGreaterThan(0); // déviée vers la descente
  });
  it('saut glissé : l’élan porte en l’air, plus loin qu’un saut en marchant', () => {
    const jumpDist = (slide: boolean) => {
      const w = lab(() => 0);
      run(w, { ...still, mx: 1 }, 0.3);
      if (slide) run(w, { ...still, mx: 1, slide: true }, 0.05);
      const x0 = w.player.x;
      step(w, { ...still, mx: 1, slide, jump: true }, STEP);
      let f = 0;
      while (!w.player.onGround && f++ < 200) step(w, { ...still, mx: 1, slide }, STEP);
      return w.player.x - x0;
    };
    expect(jumpDist(true)).toBeGreaterThan(jumpDist(false) * 1.2);
  });
  it('envol : une glissade qui passe le bord d’un plateau décolle', () => {
    // plateau à 6 u pour x < 0, flanc de pente 0,5 jusqu'au sol (x = 12)
    const w = lab((x) => (x < 0 ? 6 : Math.max(0, 6 - 0.5 * x)), -3, 0);
    run(w, { ...still, mx: 1 }, 0.1);
    let launches = 0,
      air = 0;
    for (let f = 0; f < 240; f++) {
      step(w, { ...still, mx: 1, slide: true }, STEP);
      launches += count(w, Ev.Launch);
      if (!w.player.onGround) air += STEP;
    }
    expect(launches).toBeGreaterThanOrEqual(1);
    expect(air).toBeGreaterThan(0.25); // un vrai décollage (un saut sur place : 0,73 s)
  });
  it('en marchant, passer le même bord ne fait pas décoller', () => {
    const w = lab((x) => (x < 0 ? 6 : Math.max(0, 6 - 0.5 * x)), -6, 0);
    expect(run(w, { ...still, mx: 1 }, 3, Ev.Launch)).toBe(0);
    expect(w.player.onGround).toBe(true);
  });
  it('vrille : lancée en l’air après un saut glissé ; finie avant la réception → figure et élan, sinon ratée', () => {
    const trick = (late: number) => {
      // saut glissé au bord d'un plateau : long vol au-dessus du flanc
      const w = lab((x) => (x < 0 ? 6 : Math.max(0, 6 - 0.5 * x)), -2, 0);
      run(w, { ...still, mx: 1 }, 0.1);
      run(w, { ...still, mx: 1, slide: true }, 0.1);
      step(w, { ...still, mx: 1, slide: true, jump: true }, STEP);
      run(w, { ...still, mx: 1 }, late); // lâche la glisse, puis appuie à nouveau : vrille
      const out = { spin: 0, trick: 0, fail: 0 };
      for (let k = 0; k < 400 && !w.player.onGround; k++) {
        step(w, { ...still, mx: 1, slide: true }, STEP);
        out.spin += count(w, Ev.Spin);
        out.trick += count(w, Ev.Trick);
        out.fail += count(w, Ev.TrickFail);
      }
      return { ...out, elan: w.player.elanT };
    };
    const ok = trick(0.05);
    expect(ok.spin).toBe(1);
    expect(ok.trick).toBe(1);
    expect(ok.elan).toBeGreaterThan(0);
    // vol de l'envol : on cherche un départ de vrille trop tardif (moins de 0,45 s avant la réception)
    let failed = false;
    for (let late = 0.3; late < 1.6 && !failed; late += 0.1) if (trick(late).fail === 1) failed = true;
    expect(failed).toBe(true);
  });
  it('vrille réussie : l’élan accélère la marche pendant SLIDE.elanTime', () => {
    const w = lab(() => 0);
    w.player.elanT = SLIDE.elanTime;
    run(w, { ...still, mx: 1 }, 0.1);
    expect(speed(w)).toBeCloseTo(w.player.speed * SLIDE.elanMul, 3);
  });
  it('le Faucheur suit la vitesse du joueur : la glisse ne le distance pas', () => {
    const w = lab(() => 0);
    w.player.spd = 15; // joueur lancé à pleine glissade
    const i = spawnEnemy(w, REAPER_TYPE, 0, 20);
    const e = w.enemies[i];
    const x0 = e.x,
      z0 = e.z;
    step(w, still, STEP);
    const v = Math.hypot(e.x - x0, e.z - z0) / STEP;
    expect(v).toBeGreaterThanOrEqual(15 * SLIDE.reaperMul * 0.9);
  });
});

describe('découverte de la carte (phase 27)', () => {
  it('les cases autour du joueur se découvrent en marchant, jamais deux fois', () => {
    const w = lab(() => 0);
    step(w, still, STEP);
    const first = w.seenCount;
    expect(first).toBeGreaterThan(100); // disque de 26 u en cases de 4 u ≈ 130
    run(w, still, 1);
    expect(w.seenCount).toBe(first);
    run(w, { ...still, mx: 1 }, 4);
    expect(w.seenCount).toBeGreaterThan(first + 50);
    let n = 0;
    for (const v of w.seen) n += v;
    expect(n).toBe(w.seenCount);
  });
});
