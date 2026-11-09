// Phase 18 : coffres de carte (payés avec l'or de la partie, prix croissant), sanctuaires (bonus permanent), annonce et
// respiration avant un boss.
import { describe, expect, it } from 'vitest';
import { BOON, BOON_KEYS, MAPCHEST, MAP, SHRINE, STEP } from './balance';
import { gainItem } from './items';
import { applyBoon, mapChestPrice, rollBoonChoices } from './poi';
import { step } from './step';
import { Ev, Mode } from './types';
import type { Card, Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
const count = (w: World, type: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === type) n++;
  return n;
};
const calm = (w: World) => {
  w.player.maxHp = w.player.hp = 1e9;
  w.player.need = 1e9;
  w.weapons = {};
  w.enemyCount = 0;
  w.nextElite = w.nextWave = 1e9;
};
const go = (w: World, x: number, z: number) => {
  w.player.x = w.player.px = x;
  w.player.z = w.player.pz = z;
};

describe('points d’intérêt : placement', () => {
  it('MAPCHEST.count coffres et SHRINE.count sanctuaires, espacés, hors de la clairière, sur sol libre, déterministes', () => {
    for (const seed of [MAP.seed, 3, 11]) {
      const w = new World(seed);
      expect(w.mapChests.length).toBe(MAPCHEST.count);
      expect(w.shrines.length).toBe(SHRINE.count);
      const all = [...w.mapChests, ...w.shrines];
      for (let i = 0; i < all.length; i++) {
        const p = all[i];
        expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(MAPCHEST.fromStart);
        expect(w.nearObstacle(p.x, p.z) && w.blocksShot(p.x, p.z, 0.3)).toBe(false);
        for (const l of w.lakes) expect(Math.hypot(p.x - l.x, p.z - l.z)).toBeGreaterThan(l.r);
      }
      for (let i = 0; i < w.mapChests.length; i++)
        for (let j = i + 1; j < w.mapChests.length; j++) {
          const a = w.mapChests[i],
            b = w.mapChests[j];
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(MAPCHEST.spacing - 1e-6);
        }
      const again = new World(seed);
      expect(again.mapChests.map((c) => [c.x, c.z])).toEqual(w.mapChests.map((c) => [c.x, c.z]));
    }
  });
});

describe('coffres de carte', () => {
  it('rester MAPCHEST.hold s dessus ouvre le coffre contre de l’or ; le prix monte de MAPCHEST.growth', () => {
    const w = new World(1);
    calm(w);
    const c = w.mapChests[0];
    go(w, c.x, c.z);
    w.gold = 1000;
    const p0 = mapChestPrice(w);
    expect(p0).toBe(MAPCHEST.price);
    let frames = 0;
    while (!c.open && frames < 120) {
      step(w, still, STEP);
      frames++;
    }
    expect(c.open).toBe(true);
    expect(frames * STEP).toBeGreaterThanOrEqual(MAPCHEST.hold - STEP);
    expect(w.gold).toBe(1000 - p0);
    expect(w.goldSpent).toBe(p0);
    expect(w.mode).toBe(Mode.LevelUp); // choix d'objet
    expect(w.cards.every((k) => k.kind === 'i')).toBe(true);
    expect(mapChestPrice(w)).toBe(Math.round(MAPCHEST.price * (1 + MAPCHEST.growth)));
  });
  it('1.33.1 : sans achat, le prix reste fixe (temps, objets, monde) ; chaque achat le monte de MAPCHEST.growth', () => {
    const w = new World(3);
    calm(w);
    expect(mapChestPrice(w)).toBe(MAPCHEST.price);
    w.t = w.stageT = 1500;
    for (const i of [0, 5, 9, 12]) gainItem(w, i);
    expect(mapChestPrice(w)).toBe(MAPCHEST.price);
    w.mapChestsOpened = 3;
    expect(mapChestPrice(w)).toBe(Math.round(MAPCHEST.price * (1 + MAPCHEST.growth) ** 3));
  });
  it('sans assez d’or, le coffre ne s’ouvre pas ; sortir remet l’attente à zéro', () => {
    const w = new World(2);
    calm(w);
    const c = w.mapChests[0];
    go(w, c.x, c.z);
    w.gold = MAPCHEST.price - 1;
    for (let f = 0; f < 90; f++) step(w, still, STEP);
    expect(c.open).toBe(false);
    const w2 = new World(2);
    calm(w2);
    const c2 = w2.mapChests[0];
    w2.gold = 1e4;
    go(w2, c2.x, c2.z);
    for (let f = 0; f < 20; f++) step(w2, still, STEP);
    expect(c2.hold).toBeGreaterThan(0);
    go(w2, c2.x + 10, c2.z);
    step(w2, still, STEP);
    expect(c2.hold).toBe(0);
  });
  it('aucun objet possible (tous bannis) : le coffre de carte donne un choix de bonus (l’or garde un usage)', () => {
    const w = new World(6);
    calm(w);
    w.itemBan.fill(1);
    const c = w.mapChests[0];
    go(w, c.x, c.z);
    w.gold = 1000;
    for (let f = 0; f < 90 && w.mode === Mode.Play; f++) step(w, still, STEP);
    expect(c.open).toBe(true);
    expect(w.mode).toBe(Mode.LevelUp);
    expect(w.cards.every((k) => k.kind === 'b')).toBe(true);
  });
});

describe('sanctuaires', () => {
  it('rester SHRINE.charge s dedans donne un choix de bonus ; la jauge redescend dehors ; un seul usage', () => {
    const w = new World(3);
    calm(w);
    const s = w.shrines[0];
    go(w, s.x, s.z);
    for (let f = 0; f < 60; f++) step(w, still, STEP);
    expect(s.charge).toBeGreaterThan(0.9);
    go(w, s.x + 20, s.z);
    for (let f = 0; f < 30; f++) step(w, still, STEP);
    expect(s.charge).toBeCloseTo(1 - 0.5 * SHRINE.decay, 1); // 1 s dedans, 0,5 s dehors
    go(w, s.x, s.z);
    let done = 0;
    for (let f = 0; f < 60 * (SHRINE.charge + 1) && w.mode === Mode.Play; f++) {
      step(w, still, STEP);
      done += count(w, Ev.ShrineDone);
    }
    expect(done).toBe(1);
    expect(s.used).toBe(true);
    expect(w.mode).toBe(Mode.LevelUp);
    expect(w.cards.length).toBe(SHRINE.offers);
    expect(w.cards.every((k) => k.kind === 'b')).toBe(true);
    const hp = w.player.maxHp;
    const hpCard = w.cards.findIndex((k) => k.key === 'hp');
    step(w, { ...still, pick: Math.max(0, hpCard) }, STEP);
    expect(w.mode).toBe(Mode.Play);
    if (hpCard >= 0) expect(w.player.maxHp).toBe(hp + BOON.hp);
    for (let f = 0; f < 60 * (SHRINE.charge + 1); f++) step(w, still, STEP);
    expect(w.shrinesUsed).toBe(1); // déjà pris : plus rien
  });
  it('les six bonus agissent sur la bonne stat ; trois choix distincts', () => {
    const w = new World(4);
    const P = w.player;
    const b = { hp: P.maxHp, dmg: P.dmgMul, speed: P.speed, cd: P.cdMul, magnet: P.magnet, gold: P.goldMul };
    for (const k of BOON_KEYS) applyBoon(w, k);
    expect(P.maxHp).toBe(b.hp + BOON.hp);
    expect(P.dmgMul).toBeCloseTo(b.dmg + BOON.dmg, 6);
    expect(P.speed).toBeCloseTo(b.speed * (1 + BOON.speed), 6);
    expect(P.cdMul).toBeCloseTo(b.cd - BOON.cd, 6);
    expect(P.magnet).toBeCloseTo(b.magnet * (1 + BOON.magnet), 6);
    expect(P.goldMul).toBeCloseTo(b.gold + BOON.gold, 6);
    const out: Card[] = [];
    for (let k = 0; k < 50; k++) {
      rollBoonChoices(w, out);
      expect(new Set(out.map((c) => c.key)).size).toBe(SHRINE.offers);
    }
  });
});

