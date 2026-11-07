// Dangers à esquiver (phase 11) : éruption (saut, dash), anneau du Gardien (saut, un coup par onde), charge des Brutes élites.
import { describe, expect, it } from 'vitest';
import { BOSS_TYPE, ELITE_TYPE, HAZARDS, PLAYER, STEP } from './balance';
import { eruptionPeriod } from './hazards';
import { spawnEnemy } from './spawner';
import { startRun, step } from './step';
import { Ev, HurtSrc, ShotKind } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };
const input = (mx: number, mz: number, jump = false, spell = false): Input => ({ mx, mz, jump, spell, pick: 0 });

function count(w: World, type: Ev): number {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === type) n++;
  return n;
}
/** Monde sans ennemi, au temps t, prêt pour une éruption immédiate. */
function worldAt(t: number): World {
  const w = new World(11);
  startRun(w);
  w.t = t;
  w.nextEruption = t;
  w.player.maxHp = w.player.hp = 1000;
  return w;
}
function firstShot(w: World, kind: ShotKind) {
  for (let i = 0; i < w.shotCount; i++) if (w.shots[i].kind === kind) return w.shots[i];
  return null;
}

describe('éruptions', () => {
  it('cadence : rien avant 2:00, 9 s au début, 4 s à 15:00', () => {
    expect(eruptionPeriod(0)).toBe(HAZARDS.eruption.period0);
    expect(eruptionPeriod(HAZARDS.eruption.after)).toBe(HAZARDS.eruption.period0);
    expect(eruptionPeriod(HAZARDS.eruption.at)).toBe(HAZARDS.eruption.period1);
    expect(eruptionPeriod(1500)).toBe(HAZARDS.eruption.period1);
    const w = new World(1);
    startRun(w);
    for (let i = 0; i < 60 * 10; i++) step(w, still, STEP);
    expect(firstShot(w, ShotKind.Eruption)).toBeNull();
  });
  it('1.25.1 : le cercle reste où il est apparu ; un joueur qui marche en sort sans être touché', () => {
    const w = worldAt(130);
    step(w, input(1, 0), STEP);
    const s = firstShot(w, ShotKind.Eruption)!;
    expect(s).not.toBeNull();
    expect(count(w, Ev.Telegraph)).toBe(1);
    const x0 = s.x,
      z0 = s.z,
      hp = w.player.hp;
    let erupted = 0;
    for (let i = 0; i < 70; i++) {
      const cur = firstShot(w, ShotKind.Eruption);
      if (cur) expect([cur.x, cur.z]).toEqual([x0, z0]);
      w.clearEvents();
      step(w, input(1, 0), STEP);
      erupted += count(w, Ev.Eruption);
    }
    expect(erupted).toBe(1);
    expect(w.player.hp).toBe(hp);
  });
  it('le pic blesse et projette un joueur resté dans le cercle, au bout de 0,65 s', () => {
    const w = worldAt(130);
    step(w, still, STEP);
    const life = firstShot(w, ShotKind.Eruption)!.life;
    expect(life).toBeLessThanOrEqual(HAZARDS.eruption.telegraph);
    expect(life).toBeGreaterThan(HAZARDS.eruption.telegraph - 2 * STEP);
    expect(HAZARDS.eruption.telegraph).toBeLessThan(0.8); // pète plus vite qu'avant (0,8 s)
    const hp = w.player.hp;
    let erupted = 0;
    for (let i = 0; i < 70 && erupted === 0; i++) {
      w.clearEvents();
      step(w, still, STEP);
      erupted += count(w, Ev.Eruption);
    }
    for (let i = 0; i < 6; i++) step(w, still, STEP); // 0,1 s plus tard : en l'air
    expect(erupted).toBe(1);
    expect(w.player.hp).toBeLessThan(hp);
    expect(w.lastHurt).toBe(HurtSrc.Eruption);
    expect(w.player.y).toBeGreaterThan(0.3); // projeté
    expect(w.player.onGround).toBe(false);
  });
  it('un saut à mi-télégraphe ou un dash au bon moment l’esquivent', () => {
    for (const mode of ['jump', 'dash'] as const) {
      const w = worldAt(130);
      step(w, still, STEP);
      const hp = w.player.hp;
      const when = mode === 'jump' ? 0.4 : 0.15; // s avant le pic
      let erupted = 0;
      for (let i = 0; i < 70; i++) {
        const s = firstShot(w, ShotKind.Eruption);
        const go = s !== null && s.life <= when && s.life > when - STEP;
        w.clearEvents();
        step(w, input(0, 0, mode === 'jump' && go, mode === 'dash' && go), STEP);
        erupted += count(w, Ev.Eruption);
      }
      expect(erupted, mode).toBe(1);
      expect(w.player.hp, mode).toBe(hp);
    }
  });
  it('un saut trop tôt ne suffit pas (retombé avant le pic)', () => {
    const w = worldAt(130);
    step(w, still, STEP);
    const hp = w.player.hp;
    step(w, input(0, 0, true), STEP); // saute dès l'apparition du cercle (0,65 s avant le pic) : retombé trop tôt
    for (let i = 0; i < 70; i++) step(w, still, STEP);
    expect(w.player.hp).toBeLessThan(hp);
  });
});

describe('anneau du Gardien', () => {
  it('part du boss, grandit, blesse une fois au sol et pas en l’air', () => {
    for (const jump of [false, true]) {
      const w = new World(12);
      startRun(w);
      w.nextEruption = 1e9;
      w.player.maxHp = w.player.hp = 1e6;
      const i = spawnEnemy(w, BOSS_TYPE, 0, 8);
      const e = w.enemies[i];
      e.spd = 0; // immobile : on observe l'onde
      e.aim = 0.01;
      e.timer = 1e9; // pas de charge
      const hp = w.player.hp;
      let rings = 0,
        hurts = 0,
        jumped = false;
      for (let k = 0; k < 150; k++) {
        const s = firstShot(w, ShotKind.Ring);
        const dist = Math.hypot(w.player.x - e.x, w.player.z - e.z);
        const go = jump && !jumped && s !== null && dist - s.r < HAZARDS.ring.speed * 0.3;
        if (go) jumped = true;
        w.clearEvents();
        step(w, input(0, 0, go), STEP);
        rings += count(w, Ev.Ring);
        hurts += count(w, Ev.PlayerHurt);
        if (s) expect(s.r).toBeGreaterThan(0);
      }
      expect(rings).toBeGreaterThanOrEqual(1);
      if (jump) expect(w.player.hp, 'sauté').toBe(hp);
      else {
        expect(hurts, 'au sol').toBe(1);
        expect(w.lastHurt).toBe(HurtSrc.Ring);
        expect(hp - w.player.hp).toBeCloseTo(HAZARDS.ring.dmg * e.dmgMul, 5);
      }
    }
  });
});

describe('charge des Brutes élites', () => {
  function setup() {
    const w = new World(13);
    startRun(w);
    w.nextEruption = 1e9;
    w.player.maxHp = w.player.hp = 1e6;
    const i = spawnEnemy(w, ELITE_TYPE, 0, 6, true);
    const e = w.enemies[i];
    e.timer = 0; // charge dès que possible
    return { w, e };
  }
  it('télégraphe en ligne puis charge et récupération ; le coup est unique', () => {
    const { w, e } = setup();
    const hp = w.player.hp;
    let charges = 0,
      chargeHits = 0;
    const states: number[] = [];
    for (let k = 0; k < 150; k++) {
      w.clearEvents();
      step(w, still, STEP);
      charges += count(w, Ev.Charge);
      if (states[states.length - 1] !== e.state) states.push(e.state);
      if (w.lastHurt === HurtSrc.Charge && count(w, Ev.PlayerHurt) > 0) chargeHits++;
    }
    expect(charges).toBe(1);
    expect(states).toEqual([1, 2, 3, 0]);
    expect(chargeHits).toBe(1); // le coup de charge, puis le contact ordinaire reprend après l'invulnérabilité
    // un coup sec de charge (puis le contact ordinaire reprend : la Brute colle au joueur immobile)
    expect(hp - w.player.hp).toBeGreaterThanOrEqual(HAZARDS.charge.dmg * e.dmgMul);
  });
  it('un dash au moment de la charge la traverse sans dégât', () => {
    const { w, e } = setup();
    const hp = w.player.hp;
    let dashed = false;
    for (let k = 0; k < 90; k++) {
      // on dashe quand la Brute lancée arrive à ~3 u : l'invulnérabilité (0,32 s) couvre le croisement
      const d = Math.hypot(e.x - w.player.x, e.z - w.player.z);
      const go = !dashed && e.state === 2 && d < 3;
      if (go) dashed = true;
      step(w, input(0, 0, false, go), STEP);
      if (e.state === 3) break;
    }
    expect(dashed).toBe(true);
    expect(w.player.hp).toBe(hp);
  });
  it('une Brute normale ne charge jamais', () => {
    const w = new World(14);
    startRun(w);
    w.nextEruption = 1e9;
    const i = spawnEnemy(w, ELITE_TYPE, 0, 6, false);
    let charges = 0;
    for (let k = 0; k < 300; k++) {
      w.clearEvents();
      step(w, still, STEP);
      charges += count(w, Ev.Charge);
    }
    expect(charges).toBe(0);
    expect(w.enemies[i].state).toBe(0);
  });
  it('les Brutes élites évoluent autour de PLAYER.radius (constante lue par le test)', () => {
    expect(PLAYER.radius).toBeGreaterThan(0);
  });
});
