// Phase 47 B (demande de Jimmy : beaucoup plus d'objets) : seize objets, une règle chacun.
import { describe, expect, it } from 'vitest';
import { ITEM, ITEM_KEYS, ITEM_RARITY, It, MAPCHEST, PLAYER, RARITY, SHRINE, STAGE, STEP } from './balance';
import { hitEnemy } from './combat';
import { gainItem, healCap } from './items';
import { mapChestPrice, rollBoonChoices } from './poi';
import { rollLineCount } from './progression';
import { spawnEnemy } from './spawner';
import { startRun, step } from './step';
import { Ev, HitSrc } from './types';
import type { Card, Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
/** Monde calme : pas de vague ni d'élite imprévue, pas de montée de niveau, aucune arme qui tire. */
function calm(seed = 5, weapons = false): World {
  const w = new World(seed);
  startRun(w);
  w.player.need = 1e9;
  if (!weapons) w.weapons = {};
  w.enemyCount = 0;
  w.nextElite = w.nextWave = w.nextEruption = 1e9;
  w.merchant.next = 99;
  w.survivalNext = 99;
  w.diffT = -1e9; // aucun spawn continu
  return w;
}
const run = (w: World, s: number, input: Input = still) => {
  for (let f = 0; f < Math.round(s / STEP); f++) step(w, input, STEP);
};
const dummy = (w: World, d = 3) => {
  const i = spawnEnemy(w, 0, w.player.x, w.player.z + d);
  w.enemies[i].hp = w.enemies[i].max = 1e9;
  return i;
};
const dealt = (w: World, i: number): number => {
  w.eventCount = 0;
  hitEnemy(w, i, 100, 0, w.player.x, w.player.z, HitSrc.Orbe);
  for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Hit) return w.events[k].v;
  return 0;
};
const place = (w: World, x: number, z: number) => {
  const P = w.player;
  P.x = P.px = x;
  P.z = P.pz = z;
  P.gPrev = w.heightAt(x, z);
};

describe('seize objets de la phase 47 B', () => {
  it('six communs, sept rares, trois épiques, ajoutés en fin de liste', () => {
    const fresh = ITEM_KEYS.slice(32);
    expect(fresh).toEqual(['bandage', 'savon', 'enclume', 'cle', 'encens', 'tirelire', 'fiole', 'miroir', 'glace', 'ailes', 'coquille', 'cloche', 'trophee', 'idole', 'dent', 'grimoire']);
    expect(ITEM_RARITY.slice(32)).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2]);
    for (const k of fresh) expect(k).toMatch(/^[a-z]{1,16}$/); // clés du codex
  });
  it('Bandage : soigne seulement après un moment sans coup reçu', () => {
    const w = calm();
    const P = w.player;
    gainItem(w, It.Bandage);
    P.hp = 40;
    w.hurtAt = w.t;
    run(w, ITEM.bandage.after - 0.5);
    expect(P.hp).toBeCloseTo(40 + P.regen * (ITEM.bandage.after - 0.5), 1);
    const h = P.hp;
    run(w, 4.5);
    expect(P.hp - h).toBeCloseTo((P.regen + ITEM.bandage.regen) * 4, 0);
  });
  it('Savon : la glissade part plus vite', () => {
    const v0 = (soap: boolean) => {
      const w = calm(8);
      if (soap) gainItem(w, It.Savon);
      run(w, 0.3, { ...still, mx: 1 });
      step(w, { ...still, mx: 1, slide: true }, STEP);
      expect(w.player.sliding).toBe(true);
      return Math.hypot(w.player.mvx, w.player.mvz);
    };
    expect(v0(true) / v0(false)).toBeCloseTo(1 + ITEM.savon.speed, 1);
  });
  it('Enclume : recul en plus ; Clé : coffres de carte moins chers, avec un plancher', () => {
    const w = calm();
    const kb = w.player.kbMul;
    gainItem(w, It.Enclume);
    expect(w.player.kbMul).toBeCloseTo(kb + ITEM.enclume.kb, 9);
    expect(mapChestPrice(w)).toBe(MAPCHEST.price);
    gainItem(w, It.Cle);
    expect(mapChestPrice(w)).toBe(Math.round(MAPCHEST.price * (1 - ITEM.cle.discount)));
    for (let k = 0; k < 4; k++) gainItem(w, It.Cle);
    expect(mapChestPrice(w)).toBe(Math.round(MAPCHEST.price * ITEM.cle.min));
  });
  it('Encens : sanctuaire et totem se chargent plus vite', () => {
    const shrineTime = (incense: boolean) => {
      const w = calm(6);
      w.player.maxHp = w.player.hp = 1e9;
      if (incense) gainItem(w, It.Encens);
      place(w, w.shrines[0].x, w.shrines[0].z);
      let t = 0;
      while (!w.shrines[0].used && t < 20) {
        step(w, still, STEP);
        t += STEP;
      }
      return t;
    };
    expect(shrineTime(false)).toBeCloseTo(SHRINE.charge, 1);
    expect(shrineTime(true)).toBeCloseTo(SHRINE.charge / (1 + ITEM.encens.charge), 1);
    const w = calm(6);
    gainItem(w, It.Encens);
    place(w, w.totem.x, w.totem.z);
    run(w, STAGE.totemCharge / (1 + ITEM.encens.charge) + 0.1);
    expect(w.totem.state).toBe(1); // boss appelé avant STAGE.totemCharge s
  });
  it('Tirelire : de l’or sans rien faire', () => {
    const w = calm();
    gainItem(w, It.Tirelire);
    const g = w.gold;
    run(w, 10); // court : plus tard, un événement de carte met la partie en pause
    expect(w.gold - g).toBeCloseTo(ITEM.tirelire.perMin / 6, 2);
  });
  it('Fiole de sang : un vol de vie et une réserve de soin à elle seule', () => {
    const w = calm();
    const P = w.player;
    expect(healCap(w)).toBe(0);
    gainItem(w, It.Fiole);
    expect(healCap(w)).toBeCloseTo(ITEM.fiole.cap, 9);
    P.maxHp = 1000;
    P.hp = 10;
    const i = dummy(w, 30);
    for (let f = 0; f < 120; f++) {
      hitEnemy(w, i, 5000, 0, P.x, P.z, HitSrc.Orbe);
      step(w, still, STEP);
    }
    expect(P.hp - 10).toBeGreaterThan(ITEM.fiole.cap);
    expect(P.hp - 10).toBeLessThanOrEqual(ITEM.fiole.cap * 2 + P.regen * 2 + 0.01);
  });
  it('Miroir : l’arme retire aussitôt, de temps en temps', () => {
    const shots = (mirror: boolean) => {
      const w = calm(12, true);
      w.player.maxHp = w.player.hp = 1e9;
      if (mirror) for (let k = 0; k < 3; k++) gainItem(w, It.Miroir);
      const i = dummy(w, 6);
      let n = 0;
      for (let f = 0; f < 60 * 90; f++) {
        w.enemies[i].x = w.player.x;
        w.enemies[i].z = w.player.z + 6;
        w.enemies[i].hp = 1e9;
        step(w, still, STEP);
        for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Hit && (w.events[k].x2 & 15) === HitSrc.Orbe) n++;
      }
      return n;
    };
    const a = shots(false),
      b = shots(true);
    expect(a).toBeGreaterThan(40);
    expect(b / a).toBeGreaterThan(1.12); // trois exemplaires : 30 % de chance
    expect(b / a).toBeLessThan(1.5);
  });
  it('Cœur de glace : plus de dégâts aux ennemis ralentis ou étourdis ; Trophée : par élite vaincue, plafonné', () => {
    const w = calm();
    const i = dummy(w);
    const base = dealt(w, i);
    gainItem(w, It.Glace);
    expect(dealt(w, i)).toBeCloseTo(base, 6);
    w.enemies[i].slowT = 1;
    expect(dealt(w, i)).toBeCloseTo(base * (1 + ITEM.glace.dmg), 6);
    w.enemies[i].slowT = 0;
    w.enemies[i].stun = 1;
    expect(dealt(w, i)).toBeCloseTo(base * (1 + ITEM.glace.dmg), 6);
    w.enemies[i].stun = 0;
    gainItem(w, It.Trophee);
    expect(dealt(w, i)).toBeCloseTo(base, 6);
    w.eliteKills = 10;
    expect(dealt(w, i)).toBeCloseTo(base * 1.1, 6);
    w.eliteKills = 500;
    expect(dealt(w, i)).toBeCloseTo(base * (1 + ITEM.trophee.max), 6);
  });
  it('Ailes de cire : un saut en l’air par exemplaire, rendu à l’atterrissage', () => {
    const w = calm();
    const P = w.player;
    const jump: Input = { ...still, jump: true };
    step(w, jump, STEP);
    expect(P.onGround).toBe(false);
    run(w, 0.25);
    const vy = P.vy;
    step(w, jump, STEP); // sans l'objet : l'appui est seulement gardé pour la réception
    expect(P.vy).toBeLessThanOrEqual(vy);
    expect(P.airJumps).toBe(0);
    run(w, 1.5);
    expect(P.onGround).toBe(true);
    gainItem(w, It.Ailes);
    step(w, jump, STEP);
    run(w, 0.25);
    let jumps = 0;
    step(w, jump, STEP);
    for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Jump) jumps++;
    expect(jumps).toBe(1);
    expect(P.airJumps).toBe(1);
    expect(P.vy).toBeGreaterThan(PLAYER.jumpVel * P.jumpMul * ITEM.ailes.velMul - 1);
    run(w, 0.1);
    const v2 = P.vy;
    step(w, jump, STEP); // un seul exemplaire : pas de troisième saut
    expect(P.vy).toBeLessThanOrEqual(v2);
    expect(P.airJumps).toBe(1);
    P.jumpBuf = 0;
    run(w, 2);
    expect(P.onGround).toBe(true);
    expect(P.airJumps).toBe(0);
  });
  it('Coquille : moins de dégâts dans un cercle en charge seulement', () => {
    const w = calm(6);
    const P = w.player;
    P.maxHp = P.hp = 1e9;
    gainItem(w, It.Coquille);
    run(w, 0.1);
    expect(P.taken).toBeCloseTo((1 - P.armor) * P.dmgTaken, 9);
    const s = w.shrines[1];
    place(w, s.x, s.z);
    run(w, 0.1);
    expect(w.inShrine).toBe(true);
    expect(P.taken).toBeCloseTo((1 - P.armor) * P.dmgTaken * ITEM.coquille.dmgTaken, 9);
    place(w, w.totem.x, w.totem.z);
    run(w, 0.1);
    expect(w.inShrine).toBe(false);
    expect(w.inTotem).toBe(true);
    expect(P.taken).toBeCloseTo((1 - P.armor) * P.dmgTaken * ITEM.coquille.dmgTaken, 9);
  });
  it('Cloche de bronze : le sanctuaire activé soigne et repousse', () => {
    const w = calm(6);
    const P = w.player;
    gainItem(w, It.Cloche);
    const s = w.shrines[0];
    place(w, s.x, s.z);
    run(w, SHRINE.charge - 0.3);
    P.hp = P.maxHp * 0.5;
    const i = spawnEnemy(w, 0, P.x + 3, P.z);
    w.enemies[i].hp = w.enemies[i].max = 1e9;
    let horn = 0,
      heal = 0;
    for (let f = 0; f < 40 && !s.used; f++) {
      w.enemies[i].x = P.x + 3; // il reste à portée, sans toucher le héros
      w.enemies[i].z = P.z;
      w.enemies[i].kx = w.enemies[i].kz = 0;
      step(w, still, STEP);
      for (let k = 0; k < w.eventCount; k++) {
        if (w.events[k].type === Ev.Horn) horn++;
        if (w.events[k].type === Ev.Heal) heal += w.events[k].v;
      }
    }
    expect(s.used).toBe(true);
    expect(horn).toBe(1);
    expect(heal).toBeCloseTo(P.maxHp * ITEM.cloche.heal, 0);
    expect(w.enemies[i].stun).toBeGreaterThan(0);
  });
  it('Idole : le boss du totem arrive avec moins de PV', () => {
    const bossHp = (idol: number) => {
      const w = calm(6);
      w.player.maxHp = w.player.hp = 1e9;
      for (let k = 0; k < idol; k++) gainItem(w, It.Idole);
      place(w, w.totem.x, w.totem.z);
      run(w, STAGE.totemCharge + 0.2);
      for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].id === w.totemBossId) return w.enemies[i].max;
      return 0;
    };
    const full = bossHp(0);
    expect(full).toBeGreaterThan(0);
    expect(bossHp(1) / full).toBeCloseTo(1 - ITEM.idole.hp, 6);
    expect(bossHp(2) / full).toBeCloseTo(1 - ITEM.idole.hp * 2, 6); // deux exemplaires au plus (épique)
  });
  it('Dent de dragon : un critique embrase, la brûlure frappe par à-coups et compte ses kills', () => {
    const w = calm(5, true);
    const P = w.player;
    P.maxHp = P.hp = 1e9;
    w.weapons = {};
    gainItem(w, It.Dent);
    const i = dummy(w, 30);
    expect(dealt(w, i)).toBeGreaterThan(0);
    expect(w.enemies[i].burnT).toBe(0); // pas de critique : pas de feu
    P.crit = 1;
    const hit = dealt(w, i);
    expect(w.enemies[i].burnT).toBe(ITEM.dent.t);
    expect(w.enemies[i].burn).toBeCloseTo((hit * ITEM.dent.frac) / ITEM.dent.t, 6);
    let burns = 0,
      total = 0;
    for (let f = 0; f < 60 * 4; f++) {
      w.enemies[i].x = P.x;
      w.enemies[i].z = P.z + 30;
      step(w, still, STEP);
      for (let k = 0; k < w.eventCount; k++)
        if (w.events[k].type === Ev.Hit && (w.events[k].x2 & 15) === HitSrc.Burn) {
          burns++;
          total += w.events[k].v;
        }
    }
    expect(burns).toBe(Math.round(ITEM.dent.t / ITEM.dent.tick));
    expect(total).toBeCloseTo(hit * ITEM.dent.frac, 3);
    expect(w.enemies[i].burn).toBe(0);
    // une brûlure qui tue est comptée à sa source
    const j = spawnEnemy(w, 0, P.x, P.z + 30);
    w.enemies[j].hp = w.enemies[j].max = 1e6;
    hitEnemy(w, j, 100, 0, P.x, P.z, HitSrc.Orbe);
    w.enemies[j].hp = 0.01;
    const kills = w.srcKills[HitSrc.Burn];
    run(w, ITEM.dent.tick + 0.1);
    expect(w.srcKills[HitSrc.Burn]).toBe(kills + 1);
  });
  it('Grimoire : un bonus de sanctuaire de plus, des cartes plus souvent rares', () => {
    const w = calm();
    const out: Card[] = [];
    rollBoonChoices(w, out);
    expect(out.length).toBe(SHRINE.offers);
    const multi = (v: World) => {
      let n = 0;
      for (let k = 0; k < 4000; k++) if (rollLineCount(v) > 1) n++;
      return n / 4000;
    };
    const before = multi(w);
    gainItem(w, It.Grimoire);
    rollBoonChoices(w, out);
    expect(out.length).toBe(SHRINE.offers + 1);
    expect(new Set(out.map((c) => c.key)).size).toBe(SHRINE.offers + 1);
    expect(before).toBeCloseTo(RARITY.two + RARITY.three, 1);
    expect(multi(w) - before).toBeGreaterThan(0.07);
  });
});
