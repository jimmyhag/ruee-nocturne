// Phase 37 : trois mondes (chrono, totem, boss, portail, prolongation, victoire), carte reconstruite à l'identique.
import { describe, expect, it } from 'vitest';
import { STAGE, STEP } from './balance';
import { hitEnemy } from './combat';
import { nextStage, stageSeed } from './stages';
import { startRun, step } from './step';
import { Ev, Mode } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
const count = (w: World, t: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === t) n++;
  return n;
};
/** Monde de test : joueur invincible, pas de montée de niveau ni de vague (on teste le déroulé des mondes). */
function lab(seed: number): World {
  const w = new World(seed);
  w.player.maxHp = w.player.hp = 1e9;
  w.player.need = 1e9;
  w.nextWave = w.nextElite = w.nextEruption = 1e9;
  w.merchant.next = 99;
  return w;
}
/** Avance `s` secondes ; renvoie le nombre d'événements `ev`. */
function run(w: World, s: number, input: Input = still, ev?: Ev): number {
  let n = 0;
  for (let f = 0; f < Math.round(s / STEP); f++) {
    step(w, input, STEP);
    if (ev !== undefined) n += count(w, ev);
  }
  return n;
}
/** Pose le joueur sur le totem et attend l'appel du boss. */
function summon(w: World): number {
  w.player.x = w.player.px = w.totem.x;
  w.player.z = w.player.pz = w.totem.z;
  w.player.gPrev = w.heightAt(w.totem.x, w.totem.z);
  return run(w, STAGE.totemCharge + 0.2, still, Ev.BossSpawn);
}
/** Ce qui définit une carte (comparé entre un monde neuf et un monde reconstruit). */
function mapOf(w: World) {
  return {
    seed: w.seed,
    obstacles: w.obstacles.map((o) => [o.x, o.z, o.r]),
    counts: [w.treeCount, w.rockEnd, w.stoneEnd, w.propKinds.length, w.decor.length, w.yards.length, w.camps.length],
    walls: w.walls.map((s) => [s.x1, s.z1, s.x2, s.z2]),
    places: w.places.length,
    lakes: w.lakes.map((l) => [l.x, l.z, l.r]),
    woods: w.woods.length,
    relief: [w.plateaus.length, w.ramps.length, w.combes.length, w.pistes.length, w.kickers.length],
    races: w.races.map((r) => [r.sx, r.sz, r.fx, r.fz]),
    chests: w.mapChests.map((c) => [c.x, c.z]),
    shrines: w.shrines.map((s) => [s.x, s.z]),
    totem: [w.totem.x, w.totem.z, w.totem.state],
    height: Array.from(w.height.subarray(0, 4000)),
    solid: Array.from(w.solid),
    grids: [w.obstacleGrid.size, w.wallGrid.size],
    seen: w.seenCount,
  };
}

describe('mondes (phase 37)', () => {
  it('une carte reconstruite dans un monde usé est exactement celle d’un monde neuf de même graine', () => {
    const used = lab(3);
    startRun(used);
    run(used, 5, { ...still, mx: 1 });
    const seed = stageSeed(3, 1);
    used.buildMapFor(seed);
    expect(mapOf(used)).toEqual(mapOf(new World(seed)));
  });
  it('un totem par monde, loin du départ, sur un sol dégagé', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = new World(seed);
      const d = Math.hypot(w.totem.x, w.totem.z);
      expect(d).toBeGreaterThanOrEqual(STAGE.totemFrom[0] - 0.01);
      expect(d).toBeLessThanOrEqual(STAGE.totemFrom[1] + 0.01);
      expect(w.nearObstacle(w.totem.x, w.totem.z)).toBe(false);
    }
  });
  it('rester dans le cercle du totem appelle le boss du monde près du totem ; en sortir vide la jauge', () => {
    const w = lab(7);
    w.player.x = w.totem.x;
    w.player.z = w.totem.z;
    w.player.gPrev = w.heightAt(w.totem.x, w.totem.z);
    run(w, STAGE.totemCharge / 2);
    expect(w.totem.charge).toBeGreaterThan(0);
    w.player.x = w.totem.x + 20; // sortie
    run(w, STAGE.totemCharge * 2);
    expect(w.totem.charge).toBe(0);
    expect(w.totem.state).toBe(0);
    expect(summon(w)).toBe(1);
    expect(w.totem.state).toBe(1);
    const b = w.enemies[w.bossIndex];
    expect(b.type).toBe(STAGE.bosses[0]);
    expect(Math.hypot(b.x - w.totem.x, b.z - w.totem.z)).toBeLessThan(STAGE.bossDist + 1);
  });
  it('boss tué à temps : portail ; y rester mène au monde 2 (nouvelle carte, build gardée, horloges du monde à zéro)', () => {
    const w = lab(8);
    startRun(w);
    w.weapons = { orbe: 4, lames: 2 };
    w.player.level = 9;
    summon(w);
    hitEnemy(w, w.bossIndex, 1e12, 0, 0, 0);
    expect(w.portal.open).toBe(true);
    expect(w.totem.state).toBe(2);
    expect(count(w, Ev.PortalOpen)).toBe(1);
    const t0 = w.t;
    // traverser le portail sans s'y arrêter ne compte pas
    w.player.x = w.totem.x;
    w.player.z = w.totem.z;
    step(w, still, STEP);
    w.player.x = w.totem.x + 10;
    run(w, 1);
    expect(w.stage).toBe(0);
    w.player.x = w.totem.x;
    w.player.z = w.totem.z;
    const starts = run(w, STAGE.portalHold + 0.2, still, Ev.StageStart);
    expect(starts).toBe(1);
    expect(w.stage).toBe(1);
    expect(w.seed).toBe(stageSeed(8, 1));
    expect(w.stageT).toBeLessThan(0.5);
    expect(w.diffT).toBeGreaterThanOrEqual(STAGE.offset[1]);
    expect(w.t).toBeGreaterThan(t0); // le temps total continue
    expect(w.weapons).toEqual({ orbe: 4, lames: 2 });
    expect(w.player.level).toBe(9);
    expect(w.totem.state).toBe(0);
    expect(w.portal.open).toBe(false);
    expect(w.bossIndex).toBe(-1);
    expect(Math.hypot(w.player.x, w.player.z)).toBeLessThan(1);
    // plus aucun boss vivant, seulement les ennemis de départ
    expect(w.enemyCount).toBeLessThanOrEqual(12);
  });
  it('boss tué après la fin du chrono : pas de portail (totem fermé)', () => {
    const w = lab(9);
    summon(w);
    w.stageT = STAGE.dur - 0.05;
    const up = run(w, 0.2, still, Ev.TimeUp);
    expect(up).toBe(1);
    expect(w.totem.state).toBe(3);
    hitEnemy(w, w.bossIndex, 1e12, 0, 0, 0);
    expect(w.portal.open).toBe(false);
    expect(w.mode).toBe(Mode.Play);
  });
  it('chrono écoulé sans avoir appelé le boss : le totem ne s’active plus', () => {
    const w = lab(10);
    w.stageT = STAGE.dur + 1;
    expect(summon(w)).toBe(0);
    expect(w.totem.state).toBe(3);
  });
  it('rappel à une minute de la fin si le totem n’est pas activé, une seule fois', () => {
    const w = lab(11);
    w.stageT = STAGE.dur - STAGE.warnLeft - 0.5;
    expect(run(w, 2, still, Ev.BossWarn)).toBe(1);
    expect(run(w, 2, still, Ev.BossWarn)).toBe(0);
  });
  it('prolongation : les monstres se renforcent de minute en minute (PV, vitesse, dégâts, densité)', () => {
    const w = lab(12);
    const mults: number[][] = [];
    for (const over of [0, 30, 60, 120, 180]) {
      w.stageT = STAGE.dur + over - STEP;
      step(w, still, STEP);
      mults.push([w.overRate, w.overHp, w.overDmg, w.overSpd]);
    }
    for (let k = 1; k < mults.length; k++) for (let j = 0; j < 4; j++) expect(mults[k][j]).toBeGreaterThanOrEqual(mults[k - 1][j]);
    expect(mults[0]).toEqual([1, 1, 1, 1]); // à 0:00 pile, pas encore de renfort
    expect(mults[1][1]).toBeLessThan(2); // +30 s : encore jouable
    expect(mults[4][1]).toBeGreaterThan(4); // +3 min : mortel (PV ×4,75)
    expect(mults[4][3]).toBeLessThanOrEqual(STAGE.over.spdMax);
  });
  it('monde 3 : son boss tué à temps donne la victoire', () => {
    const w = lab(13);
    nextStage(w);
    nextStage(w);
    expect(w.stage).toBe(2);
    w.player.hp = w.player.maxHp = 1e9;
    summon(w);
    expect(w.enemies[w.bossIndex].type).toBe(STAGE.bosses[2]);
    hitEnemy(w, w.bossIndex, 1e12, 0, 0, 0);
    expect(w.mode).toBe(Mode.Won);
    expect(count(w, Ev.Victory)).toBe(1);
    expect(w.portal.open).toBe(false);
  });
  it('déterministe à travers les mondes : même graine, mêmes entrées, même partie', () => {
    const play = () => {
      const w = new World(21);
      w.player.maxHp = w.player.hp = 1e9;
      startRun(w);
      for (let s = 0; s < 3; s++) {
        run(w, 20, { ...still, mx: 0.7, mz: 0.3 });
        if (s < 2) nextStage(w);
      }
      return [w.stage, w.seed, w.t, w.kills, w.enemyCount, w.player.x, w.player.z, w.player.level, w.rng.next()];
    };
    expect(play()).toEqual(play());
  });
});
