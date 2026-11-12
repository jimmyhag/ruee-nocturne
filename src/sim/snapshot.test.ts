// Phase 49 : une partie sauvegardée puis reprise doit continuer exactement comme si on ne l'avait jamais quittée.
// L'instantané complet sert aussi d'empreinte : deux mondes identiques donnent le même JSON.
import { describe, expect, it } from 'vitest';
import { CHARACTERS, STEP } from './balance';
import { MAP_FIELDS, restoreWorld, snapshotWorld, SNAP_FORMAT, type RunSnap } from './snapshot';
import { nextStage, startEndless } from './stages';
import { startRun, step } from './step';
import { Mode } from './types';
import type { CharacterKey, Input, WorldOptions } from './types';
import { World } from './world';

/** Tourne en cercle, saute toutes les 3 s, lance son sort toutes les 5 s, prend la carte 1 (comme sim.test.ts). */
const scripted = (f: number): Input => {
  const a = f / 90;
  return { mx: Math.cos(a), mz: Math.sin(a), jump: f % 180 === 0, spell: f % 300 === 0, pick: 1 };
};
/** Même déplacement, sans choisir : le monde s'arrête sur le premier choix de cartes. */
const noPick = (f: number): Input => ({ ...scripted(f), pick: -1 });

const fingerprint = (w: World): string => JSON.stringify(snapshotWorld(w));
/** Aller-retour complet, comme sur l'appareil : instantané → texte → instantané → monde. */
const roundTrip = (w: World): World => restoreWorld(JSON.parse(JSON.stringify(snapshotWorld(w))) as RunSnap);

function play(w: World, frames: number, from = 0, input = scripted): number {
  for (let f = from; f < from + frames; f++) step(w, input(f), STEP);
  return from + frames;
}
/** Joue `frames` pas sur l'original et sa copie restaurée, et vérifie qu'ils restent identiques. */
function expectSameFuture(a: World, f0: number, frames: number): void {
  const b = roundTrip(a);
  expect(fingerprint(b)).toBe(fingerprint(a)); // identiques dès la reprise…
  play(a, frames, f0);
  play(b, frames, f0);
  expect(fingerprint(b)).toBe(fingerprint(a)); // …et après
  expect(b.rng.state()).toBe(a.rng.state());
  expect(b.t).toBeCloseTo(a.t, 12);
}
function invincible(w: World): World {
  w.player.maxHp = w.player.hp = 1e9;
  return w;
}

describe('partie gardée en mémoire : reprise identique', () => {
  it('début de partie : 30 s jouées, puis 60 s identiques', () => {
    const w = new World(1234);
    startRun(w);
    const f = play(w, 1800);
    expect(w.t).toBeGreaterThan(20);
    expectSameFuture(w, f, 3600);
  });

  it('chaque personnage (armes, sorts et passifs différents)', () => {
    for (const c of CHARACTERS) {
      const opts: WorldOptions = { character: c.key as CharacterKey };
      const w = invincible(new World(77, opts));
      startRun(w);
      const f = play(w, 2400);
      expectSameFuture(w, f, 1200);
    }
  });

  it('longue partie : instantané chaque minute pendant 8 min (marchand, coffres, boss de survie, totem)', () => {
    const w = invincible(new World(4242));
    startRun(w);
    let f = 0;
    for (let m = 0; m < 8; m++) {
      f = play(w, 3600, f);
      if (w.mode !== Mode.Play && w.mode !== Mode.LevelUp && w.mode !== Mode.Merchant) break;
      expectSameFuture(w, f, 900);
      f += 900;
    }
    expect(w.t).toBeGreaterThan(300);
  }, 120_000);

  it('choix de cartes en attente : mêmes cartes, pas de nouveau tirage', () => {
    const w = new World(99);
    startRun(w);
    let f = 0;
    while (w.mode !== Mode.LevelUp && f < 6000) step(w, noPick(f++), STEP);
    expect(w.mode).toBe(Mode.LevelUp);
    const b = roundTrip(w);
    expect(b.mode).toBe(Mode.LevelUp);
    expect(JSON.stringify(b.cards)).toBe(JSON.stringify(w.cards));
    expectSameFuture(w, f, 1800);
  });

  it('chez le marchand : mêmes offres, même visite', () => {
    const w = invincible(new World(2024));
    startRun(w);
    let f = play(w, 600);
    const M = w.merchant; // comme le crochet de debug « merchant » : il arrive sous les pieds du joueur
    M.active = true;
    M.x = w.player.x;
    M.z = w.player.z;
    M.until = w.stageT + 30;
    M.visit++;
    M.rolled = M.inside = false;
    while (w.mode !== Mode.Merchant && f < 1200) {
      step(w, { mx: 0, mz: 0, jump: false, spell: false, pick: -1 }, STEP);
      f++;
    }
    expect(w.mode).toBe(Mode.Merchant);
    const b = roundTrip(w);
    expect(b.mode).toBe(Mode.Merchant);
    expect(JSON.stringify(b.offers)).toBe(JSON.stringify(w.offers));
    expectSameFuture(w, f, 1200);
  });

  it('mondes 2 et 3, puis monde infini', () => {
    const w = invincible(new World(31337));
    startRun(w);
    let f = play(w, 600);
    nextStage(w);
    f = play(w, 600, f);
    expectSameFuture(w, f, 900);
    f += 900;
    nextStage(w);
    f = play(w, 600, f);
    expect(w.stage).toBe(2);
    expectSameFuture(w, f, 900);
    f += 900;
    w.mode = Mode.Won;
    startEndless(w);
    f = play(w, 1200, f);
    expect(w.endless).toBe(true);
    expectSameFuture(w, f, 1200);
  });

  it('lieux de la carte utilisés : coffres, sanctuaires, crânes, totems de boss, totem', () => {
    const w = invincible(new World(555));
    startRun(w);
    const f = play(w, 600);
    w.mapChests[0].open = true;
    w.shrines[0].used = true;
    w.skulls[1].on = true;
    w.bossTotems[0].on = true;
    w.totem.charge = 1.5;
    w.seen.fill(1, 0, 500);
    const b = roundTrip(w);
    expect(b.mapChests[0].open).toBe(true);
    expect(b.shrines[0].used).toBe(true);
    expect(b.skulls[1].on).toBe(true);
    expect(b.bossTotems[0].on).toBe(true);
    expect(b.totem.charge).toBe(1.5);
    expect(b.seen[499]).toBe(1);
    // la carte refaite est bien la même (positions des lieux)
    expect(b.mapChests.map((c) => [c.x, c.z])).toEqual(w.mapChests.map((c) => [c.x, c.z]));
    expectSameFuture(w, f, 900);
  });
});

describe('partie gardée en mémoire : format', () => {
  it('chaque champ du monde est sauvegardé ou classé « carte » (aucun type qui ne sache se copier)', () => {
    const w = new World(1);
    startRun(w);
    const s = snapshotWorld(w);
    for (const k of Object.keys(w)) {
      if (MAP_FIELDS.has(k) || k === 'rng' || k === 'flow') continue;
      expect(s.fields, `champ « ${k} » oublié`).toHaveProperty(k);
    }
  });

  it("le texte sauvegardé reste raisonnable (localStorage : quelques Mo pour tout le site)", () => {
    const w = invincible(new World(8));
    startRun(w);
    play(w, 3600 * 4);
    expect(JSON.stringify(snapshotWorld(w)).length).toBeLessThan(1_500_000);
  }, 60_000);

  it("tolère une sauvegarde d'une autre version : champ manquant ou inconnu", () => {
    const w = new World(3);
    startRun(w);
    play(w, 600);
    const s = JSON.parse(JSON.stringify(snapshotWorld(w))) as RunSnap;
    delete s.fields.kills;
    s.fields.champInconnu = 42;
    const b = restoreWorld(s);
    expect(b.kills).toBe(0); // valeur neuve
    expect(b.t).toBe(w.t);
  });

  it('refuse un autre format', () => {
    const s = snapshotWorld(new World(3));
    expect(() => restoreWorld({ ...s, format: SNAP_FORMAT + 1 })).toThrow();
  });
});
