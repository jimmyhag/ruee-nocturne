// Phase 48, livraison 2 (demande de Jimmy) : totems de boss. Un totem activé ajoute un boss à chaque vague de boss du
// monde : boss de survie, combat du totem (le portail attend qu'ils soient tous morts), vagues du monde infini.
import { describe, expect, it } from 'vitest';
import { BOSSTOTEM, DIFFICULTY, ENEMIES, MAPCHEST, SHRINE, STAGE, STEP } from './balance';
import { killEnemy } from './combat';
import { nextStage, startEndless, summonEndlessWave, summonStageBoss, summonSurvivalBoss } from './stages';
import { step } from './step';
import { Ev, Mode } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
/** Construit un monde avec exactement `n` totems de boss (phase 50 : leur nombre est tiré avec la carte). */
function withTotems(seed: number, n: number): World {
  const [min, max] = [BOSSTOTEM.min, BOSSTOTEM.max];
  BOSSTOTEM.min = BOSSTOTEM.max = n;
  try {
    return new World(seed);
  } finally {
    BOSSTOTEM.min = min;
    BOSSTOTEM.max = max;
  }
}
function calm(seed = 5): World {
  const w = withTotems(seed, 3);
  w.player.need = 1e9;
  w.player.maxHp = w.player.hp = 1e9;
  w.weapons = {};
  w.enemyCount = 0;
  w.nextElite = w.nextWave = w.nextEruption = 1e9;
  w.merchant.next = 99;
  w.survivalNext = 99;
  return w;
}
const place = (w: World, x: number, z: number): void => {
  w.player.x = w.player.px = x;
  w.player.z = w.player.pz = z;
};
function run(w: World, seconds: number, ev: Ev): number {
  let n = 0;
  for (let f = 0; f < Math.round(seconds / STEP); f++) {
    step(w, still, STEP);
    for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === ev) n++;
  }
  return n;
}
/** Index des boss en vie. */
const bosses = (w: World): number[] => {
  const out: number[] = [];
  for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].alive && ENEMIES[w.enemies[i].type].boss) out.push(i);
  return out;
};
/** Active `n` totems de boss en y posant le joueur. */
function activate(w: World, n: number): void {
  for (let k = 0; k < n; k++) {
    place(w, w.bossTotems[k].x, w.bossTotems[k].z);
    expect(run(w, BOSSTOTEM.charge + 0.2, Ev.BossTotemOn)).toBe(1);
  }
  place(w, 0, 0);
}
/** Tue un boss par son index (et laisse la sim finir le pas). */
const slay = (w: World, i: number): void => {
  w.enemies[i].hp = 0;
  killEnemy(w, i);
  w.freeEnemy(i);
};

describe('totems de boss : placement et activation', () => {
  it('entre BOSSTOTEM.min et max par monde, tous posés ; stables par graine', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const w = new World(seed);
      expect(w.bossTotems.length).toBeGreaterThanOrEqual(BOSSTOTEM.min);
      expect(w.bossTotems.length).toBeLessThanOrEqual(BOSSTOTEM.max);
      seen.add(w.bossTotems.length);
      if (seed <= 3) expect(new World(seed).bossTotems).toEqual(w.bossTotems);
    }
    expect(seen.size).toBe(BOSSTOTEM.max - BOSSTOTEM.min + 1); // chaque nombre sort
    for (const seed of [1, 7, 42]) expect(withTotems(seed, BOSSTOTEM.max).bossTotems.length).toBe(BOSSTOTEM.max); // le maximum tient
  });
  it('loin du départ, du totem et des autres lieux ; les autres lieux ne bougent pas', () => {
    {
      for (const seed of [1, 7, 42]) {
        const count = 2;
        const w = withTotems(seed, count);
        expect(w.bossTotems.length, `graine ${seed}`).toBe(count);
        for (const b of w.bossTotems) {
          expect(Math.hypot(b.x, b.z)).toBeGreaterThanOrEqual(BOSSTOTEM.fromStart);
          expect(Math.hypot(b.x - w.totem.x, b.z - w.totem.z)).toBeGreaterThanOrEqual(STAGE.totemSpacing);
          for (const p of [...w.mapChests, ...w.shrines, ...w.skulls])
            expect(Math.hypot(b.x - p.x, b.z - p.z)).toBeGreaterThanOrEqual(BOSSTOTEM.fromPoi - 1e-6);
        }
        const bare = withTotems(seed, 0);
        expect(bare.bossTotems.length).toBe(0);
        expect(bare.skulls).toEqual(w.skulls);
        expect(bare.shrines).toEqual(w.shrines);
        expect(bare.mapChests).toEqual(w.mapChests);
        expect(bare.totem).toEqual(w.totem);
        expect(w.skulls.length).toBeGreaterThanOrEqual(DIFFICULTY.skullMin);
        expect(w.mapChests.length).toBe(MAPCHEST.count);
        expect(w.shrines.length).toBe(SHRINE.count);
      }
    }
  });
  it('rester BOSSTOTEM.charge s dedans : un boss de plus par vague, une fois par totem ; la jauge redescend dehors', () => {
    const w = calm(7);
    const b = w.bossTotems[0];
    place(w, b.x, b.z);
    expect(run(w, BOSSTOTEM.charge * 0.5, Ev.BossTotemOn)).toBe(0);
    place(w, b.x + BOSSTOTEM.r + 2, b.z);
    run(w, BOSSTOTEM.charge, Ev.BossTotemOn);
    expect(b.charge).toBe(0);
    expect(w.bossExtra).toBe(0);
    place(w, b.x, b.z);
    expect(run(w, BOSSTOTEM.charge + 0.2, Ev.BossTotemOn)).toBe(1);
    expect([w.bossExtra, w.bossTotemsOn, b.on]).toEqual([1, 1, true]);
    expect(run(w, BOSSTOTEM.charge * 2, Ev.BossTotemOn)).toBe(0);
    expect(bosses(w).length).toBe(0); // rien n'apparaît tout de suite : il vaut pour les vagues à venir
  });
});

describe('totems de boss : un boss de plus à chaque vague', () => {
  it('boss de survie : 1 + n boss, des doubles exacts (même type, mêmes PV, même rythme)', () => {
    const w = calm(7);
    activate(w, 2);
    summonSurvivalBoss(w, 0);
    const b = bosses(w);
    expect(b.length).toBe(3);
    expect(w.survivalAlive).toBe(3);
    const main = w.enemies[b[0]];
    for (const i of b.slice(1)) {
      const x = w.enemies[i];
      expect(x.type).toBe(main.type); // phase 50 : un double, pas un autre boss
      expect(x.max).toBeCloseTo(main.max, 6);
      expect(w.isTotemBoss(x)).toBe(false);
      expect(x.cadence).toBe(1);
    }
    // aucun n'ouvre le portail
    for (const i of bosses(w).reverse()) slay(w, i);
    expect(w.portal.open).toBe(false);
    expect(w.survivalAlive).toBe(0);
  });
  it('combat du totem : le portail ne s’ouvre qu’au dernier boss ; seul le dernier soigne et laisse le coffre de boss', () => {
    const w = calm(7);
    activate(w, 1);
    const count0 = w.bossCount;
    summonStageBoss(w);
    expect(bosses(w).length).toBe(2);
    expect(w.totemAlive).toBe(2);
    expect(w.bossCount).toBe(count0 + 1); // le boss en plus ne renforce pas les boss des mondes suivants
    for (const i of bosses(w)) expect(w.isTotemBoss(w.enemies[i])).toBe(true);
    const [b0, b1] = bosses(w).map((i) => w.enemies[i]);
    expect([b1.type, b1.max]).toEqual([b0.type, b0.max]); // phase 50 : double exact du boss du totem
    w.player.maxHp = 100;
    w.player.hp = 40;
    // le boss principal tombe d'abord : pas de portail, pas de soin, un coffre d'élite
    slay(w, w.bossIndex);
    expect(w.portal.open).toBe(false);
    expect(w.totem.state).toBe(1);
    expect(w.player.hp).toBe(40);
    expect(w.chestCount).toBe(1);
    expect(w.chests[0].boss).toBe(false);
    expect(w.totemAlive).toBe(1);
    // la barre de boss passe au suivant
    step(w, still, STEP);
    expect(w.bossIndex).toBeGreaterThanOrEqual(0);
    expect(w.enemies[w.bossIndex].totemExtra).toBe(true);
    // le dernier : portail, soin complet, coffre de boss
    slay(w, w.bossIndex);
    expect(w.portal.open).toBe(true);
    expect(w.player.hp).toBe(100);
    expect(w.chests[w.chestCount - 1].boss).toBe(true);
    expect(w.totemAlive).toBe(0);
  });
  it('au monde 3, la victoire attend aussi le dernier boss', () => {
    const w = calm(7);
    w.stage = STAGE.count - 1;
    activate(w, 1);
    summonStageBoss(w);
    slay(w, bosses(w)[1]);
    expect(w.mode).toBe(Mode.Play);
    slay(w, bosses(w)[0]);
    expect(w.mode).toBe(Mode.Won);
  });
  it('sans totem de boss, rien ne change : un boss par vague', () => {
    const w = calm(7);
    summonSurvivalBoss(w, 0);
    expect(bosses(w).length).toBe(1);
    summonStageBoss(w);
    expect(bosses(w).length).toBe(2);
    expect(w.totemAlive).toBe(1);
  });
  it('remis à zéro au monde suivant ; fermés une fois le portail ouvert', () => {
    const w = calm(7);
    activate(w, 1);
    summonStageBoss(w);
    for (const i of bosses(w).reverse()) slay(w, i);
    expect(w.portal.open).toBe(true);
    // portail ouvert : le second totem de boss ne se charge plus
    const b = w.bossTotems[1];
    place(w, b.x, b.z);
    expect(run(w, BOSSTOTEM.charge + 0.5, Ev.BossTotemOn)).toBe(0);
    expect(b.charge).toBe(0);
    nextStage(w);
    expect([w.bossExtra, w.totemAlive]).toEqual([0, 0]);
    expect(w.bossTotemsOn).toBe(1); // le compte de la partie, lui, reste
    expect(w.bossTotems.length).toBeGreaterThanOrEqual(BOSSTOTEM.min); // la carte du monde suivant tire son nombre
    expect(w.bossTotems.every((t) => !t.on)).toBe(true);
    summonSurvivalBoss(w, 0);
    expect(bosses(w).length).toBe(1);
  });
  it('monde infini : les totems activés au monde 3 ajoutent leur boss aux vagues', () => {
    const w = calm(7);
    w.stage = STAGE.count - 1;
    activate(w, 1);
    summonStageBoss(w);
    for (const i of bosses(w).reverse()) slay(w, i);
    expect(w.mode).toBe(Mode.Won);
    startEndless(w);
    summonEndlessWave(w);
    expect(bosses(w).length).toBe(2); // 1 de la première vague + 1 du totem de boss
  });
});
