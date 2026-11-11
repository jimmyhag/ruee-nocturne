// Phase 47 A (demande de Jimmy) : toutes les stats dans les sanctuaires, quatre tomes (Sang, Givre, Bastion, Défi).
import { describe, expect, it } from 'vitest';
import { BASTION, BLOOD, BOON, BOON_KEYS, ELITE, FROST, ITEM, SHRINE, SPAWN, STEP, TOMES, TOME_CAPS, TOME_KEYS } from './balance';
import { hitEnemy } from './combat';
import { healCap } from './items';
import { applyBoon, boonApply, boonCapped, rollBoonChoices } from './poi';
import { spawnEnemy, tickSpawner } from './spawner';
import { step } from './step';
import { Ev, HitSrc } from './types';
import type { BoonKey, Card, Input, TomeKey } from './types';
import { applyTomeLine, lineIndex } from './weapons/defs';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
/** Monde calme : pas de vague ni d'élite imprévue, pas de montée de niveau, aucune arme qui tire. */
function calm(seed = 5): World {
  const w = new World(seed);
  w.player.need = 1e9;
  w.weapons = {};
  w.enemyCount = 0;
  w.nextElite = w.nextWave = w.nextEruption = 1e9;
  w.merchant.next = 99;
  w.survivalNext = 99;
  return w;
}
const line = (w: World, tome: TomeKey, stat: string, n = 1) => {
  const i = lineIndex(TOMES[tome], stat);
  expect(i, `${tome}.${stat}`).toBeGreaterThanOrEqual(0);
  for (let k = 0; k < n; k++) applyTomeLine(w, tome, i);
};
/** Un ennemi increvable à `d` u du héros ; retourne son index. */
const dummy = (w: World, d = 3) => {
  const i = spawnEnemy(w, 0, 0, d);
  w.enemies[i].hp = w.enemies[i].max = 1e9;
  return i;
};
/** Dégâts d'un coup de 100 (valeur de l'événement Hit). */
const dealt = (w: World, i: number): number => {
  w.eventCount = 0;
  hitEnemy(w, i, 100, 0, w.player.x, w.player.z, HitSrc.Orbe);
  for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Hit) return w.events[k].v;
  return 0;
};

describe('sanctuaires : toutes les stats', () => {
  it('18 bonus, quatre choix distincts, chacun avec sa valeur', () => {
    expect(BOON_KEYS.length).toBe(18);
    expect(new Set(BOON_KEYS).size).toBe(18);
    expect(SHRINE.offers).toBe(4);
    for (const k of BOON_KEYS) expect(BOON[k], k).toBeGreaterThan(0);
    const w = calm();
    const out: Card[] = [];
    const seen = new Set<string>();
    for (let k = 0; k < 200; k++) {
      rollBoonChoices(w, out);
      expect(new Set(out.map((c) => c.key)).size).toBe(4);
      for (const c of out) seen.add(c.key);
    }
    expect(seen.size).toBe(18); // tous finissent par sortir
  });
  it('chaque bonus nouveau monte la bonne stat', () => {
    const w = calm();
    const P = w.player;
    const b = { ...P };
    const all: BoonKey[] = ['regen', 'armor', 'steal', 'crit', 'critdmg', 'elite', 'size', 'jump', 'spellpow', 'luck', 'xp'];
    for (const k of all) applyBoon(w, k);
    expect(P.regen).toBeCloseTo(b.regen + BOON.regen, 9);
    expect(P.armor).toBeCloseTo(b.armor + BOON.armor, 9);
    expect(P.steal).toBeCloseTo(BOON.steal, 9);
    expect(P.crit).toBeCloseTo(b.crit + BOON.crit, 9);
    expect(P.critMul).toBeCloseTo(b.critMul + BOON.critdmg, 9);
    expect(P.eliteDmgMul).toBeCloseTo(b.eliteDmgMul + BOON.elite, 9);
    expect(P.sizeMul).toBeCloseTo(b.sizeMul + BOON.size, 9);
    expect(P.jumpMul).toBeCloseTo(b.jumpMul * (1 + BOON.jump), 9);
    expect(P.spellPow).toBeCloseTo(b.spellPow + BOON.spellpow, 9);
    expect(P.luck).toBeCloseTo(b.luck + BOON.luck, 9);
    expect(P.xpMul).toBeCloseTo(b.xpMul + BOON.xp, 9);
    for (const k of all) expect(w.boons[BOON_KEYS.indexOf(k)], k).toBe(1);
  });
  it('boonApply ne touche que le joueur donné (copie pour « actuel → nouveau »)', () => {
    const w = calm();
    const q = { ...w.player };
    boonApply(q, 'steal');
    boonApply(q, 'hp');
    expect(q.steal).toBeCloseTo(BOON.steal, 9);
    expect(q.maxHp).toBe(w.player.maxHp + BOON.hp);
    expect(w.player.steal).toBe(0);
    expect(w.boons.every((n) => n === 0)).toBe(true);
  });
  it('un bonus au plafond de sa stat n’est plus proposé', () => {
    const w = calm();
    const P = w.player;
    expect(BOON_KEYS.some((k) => boonCapped(w, k))).toBe(false);
    P.armor = TOME_CAPS.armorMax;
    P.cdMul = TOME_CAPS.cdMin;
    P.spellCdMul = TOME_CAPS.spellCdMin;
    const out: Card[] = [];
    for (let k = 0; k < 100; k++) {
      rollBoonChoices(w, out);
      expect(out.length).toBe(4);
      for (const c of out) expect(['armor', 'cd', 'spell']).not.toContain(c.key);
    }
    applyBoon(w, 'armor'); // et il ne dépasse pas le plafond
    expect(P.armor).toBe(TOME_CAPS.armorMax);
  });
});

describe('tomes de la phase 47', () => {
  it('douze tomes, trois lignes chacun pour les nouveaux', () => {
    expect(TOME_KEYS.length).toBe(12);
    for (const k of ['sang', 'givre', 'bastion', 'defi'] as TomeKey[]) expect(TOMES[k].length, k).toBe(3);
  });
  it('Sang : le vol de vie soigne dans la limite de la réserve, sans aucun objet', () => {
    const w = calm();
    const P = w.player;
    expect(healCap(w)).toBe(0);
    line(w, 'sang', 'steal', 2);
    expect(P.steal).toBeCloseTo(0.02, 9);
    expect(healCap(w)).toBeCloseTo(0.02 * BLOOD.capPerSteal, 9);
    line(w, 'sang', 'stealcap');
    const cap = healCap(w);
    expect(cap).toBeCloseTo(0.02 * BLOOD.capPerSteal + 0.4, 9);
    P.hp = 10;
    const i = dummy(w);
    for (let f = 0; f < 60 * 3; f++) {
      hitEnemy(w, i, 5000, 0, P.x, P.z, HitSrc.Orbe); // 100 PV de vol par coup sans la réserve
      w.enemies[i].x = P.x + 3; // il ne s'approche pas : aucun dégât de contact
      step(w, still, STEP);
    }
    expect(P.hp - 10).toBeGreaterThan(cap * 1.5);
    expect(P.hp - 10).toBeLessThanOrEqual(cap * 3 + P.regen * 3 + 0.01);
  });
  it('Sang : dégâts en plus sous la moitié des PV seulement', () => {
    const w = calm();
    const P = w.player;
    const i = dummy(w);
    const base = dealt(w, i);
    line(w, 'sang', 'lowdmg', 3);
    expect(dealt(w, i)).toBeCloseTo(base, 6);
    P.hp = P.maxHp * (BLOOD.below - 0.01);
    expect(dealt(w, i)).toBeCloseTo(base * 1.12, 6);
  });
  it('Givre : un coup d’arme ralentit (pas un boss), et la cible ralentie prend plus', () => {
    const w = calm();
    const P = w.player;
    const i = dummy(w);
    const base = dealt(w, i);
    expect(w.enemies[i].slowT).toBe(0);
    P.slowChance = 1; // certitude, pour le test
    line(w, 'givre', 'slowdur', 2);
    dealt(w, i);
    expect(w.enemies[i].slowT).toBeCloseTo(FROST.slowT * 1.2, 6);
    line(w, 'givre', 'chilldmg', 2);
    expect(dealt(w, i)).toBeCloseTo(base * 1.16, 6);
    w.enemies[i].slowT = 0;
    P.slowChance = 0;
    expect(dealt(w, i)).toBeCloseTo(base, 6);
    const boss = spawnEnemy(w, 3, 0, 6);
    w.enemies[boss].hp = w.enemies[boss].max = 1e9;
    P.slowChance = 1;
    dealt(w, boss);
    expect(w.enemies[boss].slowT).toBe(0);
  });
  it('Bastion : riposte au contact, revanche après un coup, armure à l’arrêt', () => {
    const w = calm();
    const P = w.player;
    P.maxHp = P.hp = 1e6;
    line(w, 'bastion', 'thorns', 2);
    line(w, 'bastion', 'revenge', 2);
    const i = dummy(w, 0.3); // au contact
    let thornHits = 0;
    for (let f = 0; f < 60; f++) {
      w.enemies[i].x = P.x + 0.3;
      w.enemies[i].z = P.z;
      step(w, still, STEP);
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Hit && (w.events[k].x2 & 15) === HitSrc.Thorns) thornHits++;
    }
    expect(thornHits).toBeGreaterThanOrEqual(2); // toutes les ITEM.epines.period s
    expect(thornHits).toBeLessThanOrEqual(Math.ceil(1 / ITEM.epines.period) + 1);
    // revanche : le héros vient d'être touché
    w.enemies[i].x = P.x + 5;
    const far = dummy(w, 6);
    const hot = dealt(w, far);
    w.t += BASTION.revengeT + 0.1;
    const cold = dealt(w, far);
    expect(hot).toBeCloseTo(cold * 1.12, 6);
    // armure à l'arrêt : le multiplicateur de dégâts subis baisse, plafonné
    line(w, 'bastion', 'stillarmor', 9);
    expect(P.stillArmor).toBeCloseTo(BASTION.stillMax, 9);
    P.spd = 0;
    step(w, still, STEP);
    expect(P.taken).toBeCloseTo((1 - P.armor) * P.dmgTaken * (1 - BASTION.stillMax), 6);
    P.spd = 5;
    w.player.taken = 0;
    step(w, { ...still, mx: 1 }, STEP);
    expect(P.taken).toBeCloseTo((1 - P.armor) * P.dmgTaken, 6);
  });
  it('Défi : plus d’apparitions, élites plus fréquentes et plus généreuses', () => {
    const rate = (n: number) => {
      const w = calm(9);
      if (n) line(w, 'defi', 'spawn', n);
      w.diffT = 120;
      w.lastAction = w.t = 100; // pas de compensation d'ennui
      let spawned = 0;
      for (let f = 0; f < 600; f++) {
        const before = w.enemyCount;
        w.lastAction = w.t;
        tickSpawner(w, STEP);
        spawned += w.enemyCount - before;
      }
      return spawned;
    };
    const a = rate(0),
      b = rate(4);
    expect(b / a).toBeGreaterThan(1.12);
    expect(b / a).toBeLessThan(1.28); // +20 %
    // élites : la suivante arrive plus tôt
    const w = calm(9);
    line(w, 'defi', 'eliterate', 5);
    w.stageT = 50;
    w.nextElite = 50;
    tickSpawner(w, STEP);
    expect(w.nextElite).toBeCloseTo(50 + SPAWN.elitePeriod / 1.4, 6);
    // butin : l'or d'une élite suit la ligne
    const gold = (n: number) => {
      const v = calm(9);
      if (n) line(v, 'defi', 'eliteloot', n);
      const i = spawnEnemy(v, 0, 0, 3, true);
      const g0 = v.gold;
      hitEnemy(v, i, 1e12, 0, 0, 0, HitSrc.Orbe);
      return v.gold - g0;
    };
    expect(gold(5) / gold(0)).toBeCloseTo(1.4, 6);
    expect(ELITE.xpMul).toBeGreaterThan(1);
  });
});
