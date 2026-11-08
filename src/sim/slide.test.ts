// Phase 27 : glissade (élan gagné en descente, perdu en montée et sur le plat), saut glissé, envol sur une crête,
// glisse parfaite à la réception (1.30.1, remplace la vrille), Faucheur qui suit la vitesse du joueur. Terrains de test posés à la main.
import { describe, expect, it } from 'vitest';
import { It, RACE, REAPER_TYPE, SLIDE, STEP, TERRAIN, WORLD_HALF } from './balance';
import { gainItem } from './items';
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
  it('un appui lance, relâcher ne coupe pas, un second appui relève ; immobile, on ne glisse pas', () => {
    const w = lab(() => 0);
    expect(run(w, { ...still, slide: true }, 0.3, Ev.SlideStart)).toBe(0);
    run(w, { ...still, mx: 1 }, 0.2);
    step(w, { ...still, mx: 1, slide: true }, STEP); // appui bref
    expect(w.player.sliding).toBe(true);
    run(w, { ...still, mx: 1 }, 0.2); // relâché : la glissade continue
    expect(w.player.sliding).toBe(true);
    let ends = 0;
    step(w, { ...still, mx: 1, slide: true }, STEP); // second appui : debout
    ends += count(w, Ev.SlideEnd);
    expect(ends).toBe(1);
    expect(w.player.sliding).toBe(false);
    expect(speed(w)).toBeLessThanOrEqual(w.player.speed + 1e-6); // retour à la marche
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
  it('la glissade va tout droit : ni la pente de côté ni l’entrée ne la font tourner', () => {
    const w = lab((x, z) => -0.3 * z, 0, 0); // descente vers +z, glissade vers +x
    run(w, { ...still, mx: 1 }, 0.2);
    step(w, { ...still, mx: 1, slide: true }, STEP);
    run(w, { ...still, mx: 0.3, mz: -1 }, 0.6); // on pousse vers −z : sans effet
    expect(w.player.sliding).toBe(true);
    expect(Math.abs(w.player.vz)).toBeLessThan(1e-9);
    expect(w.player.vx).toBeGreaterThan(0);
  });
  it('saut depuis la glisse (1.24.1) : le saut annule la glissade, réception debout ; un appui relance la glisse', () => {
    const w = lab(() => 0);
    run(w, { ...still, mx: 1 }, 0.3);
    step(w, { ...still, mx: 1, slide: true }, STEP);
    step(w, { ...still, mx: 1, jump: true }, STEP);
    expect(w.player.slideJump).toBe(true);
    let f = 0,
      starts = 0;
    while (!w.player.onGround && f++ < 200) {
      step(w, { ...still, mx: 1 }, STEP);
      starts += count(w, Ev.SlideStart);
    }
    expect(starts).toBe(0);
    expect(w.player.sliding).toBe(false);
    expect(w.player.slideJump).toBe(false);
    run(w, { ...still, mx: 1 }, 0.5); // la recharge de glisse est passée
    step(w, { ...still, mx: 1, slide: true }, STEP);
    expect(w.player.sliding).toBe(true);
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
  it('phase 28 : un tremplin fait décoller une glissade (vol nettement plus long qu’un simple bord)', () => {
    const K = TERRAIN.kickLen,
      KH = TERRAIN.kickH;
    // descente de 0,2 jusqu'au pied (x = 0), tremplin à x ∈ [0, K], puis chute à 0,54 : on arrive lancé
    const w = lab((x) => (x < 0 ? -0.2 * x : x < K ? (KH * x) / K : Math.max(0, KH - 0.54 * (x - K))), -30, 0);
    run(w, { ...still, mx: 1 }, 0.2);
    step(w, { ...still, mx: 1, slide: true }, STEP);
    let launches = 0,
      air = 0;
    for (let f = 0; f < 360; f++) {
      step(w, { ...still, mx: 1 }, STEP);
      launches += count(w, Ev.Launch);
      if (!w.player.onGround) air += STEP;
    }
    expect(launches).toBe(1);
    expect(air).toBeGreaterThan(0.6); // un vrai vol (de quoi viser la réception)
  });
  it('en marchant, passer le même bord ne fait pas décoller', () => {
    const w = lab((x) => (x < 0 ? 6 : Math.max(0, 6 - 0.5 * x)), -6, 0);
    expect(run(w, { ...still, mx: 1 }, 3, Ev.Launch)).toBe(0);
    expect(w.player.onGround).toBe(true);
  });
  /**
   * 1.30.1 : glisse sur le plat, saut, puis appui de glisse `before` s avant la réception (négatif : après). Renvoie ce
   * qui s'est passé à la réception.
   */
  const hop = (before: number) => {
    const start = (w: World) => {
      run(w, { ...still, mx: 1 }, 0.3);
      step(w, { ...still, mx: 1, slide: true }, STEP);
      run(w, { ...still, mx: 1 }, 0.1);
      step(w, { ...still, mx: 1, jump: true }, STEP);
    };
    // même saut sans appui : nombre de pas jusqu'à la réception
    const probe = lab(() => 0);
    start(probe);
    let land = 0;
    while (!probe.player.onGround) {
      step(probe, { ...still, mx: 1 }, STEP);
      land++;
    }
    const at = land - Math.round(before / STEP); // pas de l'appui, compté depuis le saut
    const w = lab(() => 0);
    start(w);
    let trick = 0,
      starts = 0;
    for (let f = 0; f < land + 60; f++) {
      step(w, { ...still, mx: 1, slide: f === at }, STEP);
      trick += count(w, Ev.Trick);
      starts += count(w, Ev.SlideStart);
    }
    return { trick, starts, elan: w.player.elanT, tricks: w.tricks };
  };
  it('glisse appuyée juste avant de toucher le sol : on repart en glissade avec l’élan (glisse parfaite)', () => {
    const r = hop(0.1);
    expect(r.trick).toBe(1);
    expect(r.starts).toBe(1);
    expect(r.elan).toBeGreaterThan(0);
    expect(r.tricks).toBe(1);
  });
  it('glisse appuyée juste après la réception (dans SLIDE.landPost) : glisse parfaite aussi', () => {
    const r = hop(-0.05);
    expect(r.trick).toBe(1);
    expect(r.starts).toBe(1);
  });
  it('trop tôt en l’air : l’appui se perd, réception debout ; trop tard : glissade normale, sans récompense', () => {
    const early = hop(SLIDE.landPre + 0.15);
    expect(early.trick).toBe(0);
    expect(early.starts).toBe(0);
    const late = hop(-(SLIDE.landPost + 0.1));
    expect(late.trick).toBe(0);
    expect(late.starts).toBe(1); // une glissade ordinaire (départ à la vitesse de marche)
  });
  it('enchaînement propre : glisse → saut → glisse parfaite → saut → glisse parfaite → relevé', () => {
    const w = lab(() => 0);
    run(w, { ...still, mx: 1 }, 0.3);
    step(w, { ...still, mx: 1, slide: true }, STEP);
    for (let k = 0; k < 2; k++) {
      run(w, { ...still, mx: 1 }, 0.1);
      expect(w.player.sliding).toBe(true);
      step(w, { ...still, mx: 1, jump: true }, STEP); // le saut annule la glissade
      expect(w.player.sliding).toBe(false);
      // on appuie sur glisse en redescendant, près du sol
      while (w.player.y > 0.25 || w.player.vy > 0) {
        step(w, { ...still, mx: 1 }, STEP);
      }
      step(w, { ...still, mx: 1, slide: true }, STEP);
      for (let f = 0; f < 20 && !w.player.onGround; f++) step(w, { ...still, mx: 1 }, STEP);
      step(w, { ...still, mx: 1 }, STEP);
      expect(w.player.sliding).toBe(true);
    }
    expect(w.tricks).toBe(2);
    // un appui de plus : relevé
    run(w, { ...still, mx: 1 }, 0.2);
    step(w, { ...still, mx: 1, slide: true }, STEP);
    expect(w.player.sliding).toBe(false);
  });
  it('glisse parfaite : l’élan accélère la marche pendant SLIDE.elanTime', () => {
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

describe('objets de glisse (phase 28)', () => {
  const ledgeJump = (item?: number) => {
    const w = lab((x) => (x < 0 ? 6 : Math.max(0, 6 - 0.5 * x)), -2, 0);
    if (item !== undefined) gainItem(w, item);
    w.player.hp = 50;
    run(w, { ...still, mx: 1 }, 0.1);
    step(w, { ...still, mx: 1, slide: true }, STEP);
    step(w, { ...still, mx: 1, jump: true }, STEP);
    let air = 0,
      tricks = 0;
    for (let f = 0; f < 400 && !w.player.onGround; f++) {
      // glisse appuyée en descendant, près du sol : glisse parfaite à la réception
      const near = w.player.vy < 0 && w.player.y < 0.6;
      step(w, { ...still, mx: 1, slide: near }, STEP);
      air += STEP;
      tricks += count(w, Ev.Trick);
    }
    return { air, tricks, hp: w.player.hp };
  };
  it('Plume : le vol après un saut glissé dure plus longtemps', () => {
    expect(ledgeJump(It.Plume).air).toBeGreaterThan(ledgeJump().air * 1.08);
  });
  it('Écharpe du vent : une glisse parfaite soigne', () => {
    const r = ledgeJump(It.Echarpe);
    expect(r.tricks).toBe(1);
    expect(r.hp).toBeGreaterThanOrEqual(50 + 8 - 1e-9);
  });
});

describe('pistes chronométrées (phase 28)', () => {
  const race = (sx: number, fx: number) => ({ sx, sz: 0, fx, fz: 0, time: Math.abs(fx - sx) / RACE.refSpeed, state: 0, t: 0 });
  it('passer le départ puis l’arrivée à temps donne un coffre d’objet, une seule fois', () => {
    const w = lab((x) => -0.2 * x, -40, 0); // descente vers +x
    w.races = [race(-38, 20)];
    run(w, { ...still, mx: 1 }, 0.3);
    step(w, { ...still, mx: 1, slide: true }, STEP);
    let win = 0;
    for (let f = 0; f < 60 * 8 && w.player.x < 25; f++) {
      step(w, { ...still, mx: 1 }, STEP);
      win += count(w, Ev.RaceWin);
    }
    expect(win).toBe(1);
    expect(w.racesWon).toBe(1);
    expect(w.itemPicks + w.boonPicks).toBeGreaterThanOrEqual(1);
    expect(w.races[0].state).toBe(2);
  });
  it('en marchant, le temps file : échec, puis réarmement en s’éloignant du départ', () => {
    const w = lab(() => 0, -40, 0);
    w.races = [race(-38, 20)];
    let fail = 0,
      starts = 0;
    for (let f = 0; f < 60 * 12; f++) {
      step(w, { ...still, mx: 1 }, STEP);
      fail += count(w, Ev.RaceFail);
      starts += count(w, Ev.RaceStart);
    }
    expect(starts).toBe(1);
    expect(fail).toBe(1);
    expect(w.races[0].state).toBe(0); // loin du départ : réarmée
  });
});
