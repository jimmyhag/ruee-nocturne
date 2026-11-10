// Phase 23 : cartes de niveau variées. Une carte ne tire jamais deux fois la même ligne ; nouvelles stats (critique,
// ralentissement du Halo, étourdissement de la Foudre, soin aux kills et aux niveaux, prix du marchand).
import { describe, expect, it } from 'vitest';
import { BOSS_TYPE, CRIT, ITEM_KEYS, TOMES, TOME_KEYS, WEAPON_LINES } from './balance';
import { hitEnemy, killEnemy } from './combat';
import { itemPrice } from './items';
import { rollChoices } from './progression';
import { spawnEnemy } from './spawner';
import { Ev, HitSrc } from './types';
import type { TomeKey, WeaponKey } from './types';
import { WEAPON_KEYS, applyTomeLine, lineIndex, refreshStats } from './weapons/defs';
import { World } from './world';

const enemy = (w: World, type = 0) => {
  const i = spawnEnemy(w, type, 0, 4);
  w.enemies[i].hp = w.enemies[i].max = 1e6;
  return i;
};

describe('phase 23 : lignes des cartes', () => {
  it('chaque arme et chaque tome a au moins 3 lignes', () => {
    for (const k of WEAPON_KEYS) expect(WEAPON_LINES[k].length, k).toBeGreaterThanOrEqual(3);
    for (const k of TOME_KEYS) expect(TOMES[k].length, k).toBeGreaterThanOrEqual(3);
  });
  it('une carte ne porte jamais deux fois la même ligne (600 tirages, toutes armes et tomes)', () => {
    let three = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const w = new World(seed);
      w.player.luck = 20; // beaucoup de cartes à 2 et 3 lignes
      w.maxWeapons = 6;
      w.maxTomes = 8;
      for (let k = 0; k < 15; k++) {
        rollChoices(w);
        for (const c of w.cards) {
          if (c.kind !== 'w' && c.kind !== 't') continue;
          const s = [c.s0, c.s1, c.s2].filter((x) => x >= 0);
          expect(new Set(s).size, `${c.kind} ${c.key} ${s}`).toBe(s.length);
          if (s.length === 3) three++;
        }
      }
    }
    expect(three).toBeGreaterThan(100); // les cartes à 3 lignes existent toujours
  });
});

describe('phase 23 : nouvelles stats', () => {
  it('critique : avec 100 % de chance, ×critMul et drapeau +16 dans Ev.Hit ; à 0, jamais', () => {
    const w = new World(1);
    const i = enemy(w);
    hitEnemy(w, i, 10, 0, 0, 0, HitSrc.Orbe);
    const plain = w.events[w.eventCount - 1];
    expect(plain.type).toBe(Ev.Hit);
    expect(plain.x2).toBe(HitSrc.Orbe);
    const dealt = plain.v;
    w.wstats.orbe.crit = 1;
    hitEnemy(w, i, 10, 0, 0, 0, HitSrc.Orbe);
    const crit = w.events[w.eventCount - 1];
    expect(crit.x2).toBe(HitSrc.Orbe + 16);
    expect(crit.v).toBeCloseTo(dealt * CRIT.mul, 6);
    // tome Chance : critique global ; tome Dégâts : dégâts critiques
    w.wstats.orbe.crit = 0;
    applyTomeLine(w, 'chance', lineIndex(TOMES.chance, 'crit'));
    expect(w.player.crit).toBeCloseTo(0.03, 6);
    applyTomeLine(w, 'degats', lineIndex(TOMES.degats, 'critdmg'));
    expect(w.player.critMul).toBeCloseTo(CRIT.mul + 0.15, 6);
  });
  it('les sources hors armes (sort, épines, talisman) ne font pas de critique', () => {
    const w = new World(2);
    w.player.crit = 1;
    const i = enemy(w);
    hitEnemy(w, i, 10, 0, 0, 0, HitSrc.Spell);
    expect(w.events[w.eventCount - 1].x2).toBe(HitSrc.Spell);
  });
  it('Halo : ralentit à coup sûr avec 100 % ; Foudre : étourdit, mais jamais un boss', () => {
    const w = new World(3);
    const i = enemy(w);
    w.wstats.aura.slow = 1;
    hitEnemy(w, i, 1, 0, 0, 0, HitSrc.Aura);
    expect(w.enemies[i].slowT).toBeCloseTo(CRIT.slowT, 6);
    w.wstats.foudre.stun = 1;
    hitEnemy(w, i, 1, 0, 0, 0, HitSrc.Foudre);
    expect(w.enemies[i].stun).toBeCloseTo(CRIT.stunT, 6);
    const b = enemy(w, BOSS_TYPE);
    hitEnemy(w, b, 1, 0, 0, 0, HitSrc.Foudre);
    expect(w.enemies[b].stun).toBe(0);
  });
  it('tome Vitalité : PV rendus par kill ; tome Savoir : soin à chaque niveau', () => {
    const w = new World(4);
    const P = w.player;
    applyTomeLine(w, 'vitalite', lineIndex(TOMES.vitalite, 'killheal'));
    P.hp = 10;
    killEnemy(w, enemy(w));
    expect(P.hp).toBeCloseTo(10.1, 6);
    applyTomeLine(w, 'savoir', lineIndex(TOMES.savoir, 'lvlheal'));
    expect(P.lvlHeal).toBe(8);
  });
  it('tome Or : prix du marchand −6 % par ligne, plancher 60 %', () => {
    const w = new World(5);
    const i = ITEM_KEYS.indexOf('cape');
    const p0 = itemPrice(w, i);
    applyTomeLine(w, 'or', lineIndex(TOMES.or, 'shop'));
    expect(itemPrice(w, i)).toBe(Math.round(p0 * 0.94));
    for (let k = 0; k < 20; k++) applyTomeLine(w, 'or', lineIndex(TOMES.or, 'shop'));
    expect(w.player.shopMul).toBe(CRIT.shopMin);
  });
  it('les lignes de critique se cumulent sur la base 0 de chaque arme', () => {
    const w = new World(6);
    for (const k of WEAPON_KEYS as WeaponKey[]) {
      const j = WEAPON_LINES[k].findIndex((l) => l.stat === 'crit');
      expect(j, k).toBeGreaterThanOrEqual(0);
      w.wmods[k][j] = 3;
    }
    refreshStats(w);
    for (const k of WEAPON_KEYS) {
      const step = WEAPON_LINES[k].find((l) => l.stat === 'crit')!.step; // +5 %, +3 % pour le Boomerang
      expect(w.wstats[k].crit, k).toBeCloseTo(3 * step, 6);
    }
  });
  it('chaque nouvelle ligne de tome est connue de applyTomeLine', () => {
    const w = new World(7);
    for (const k of TOME_KEYS as TomeKey[]) for (let j = 0; j < TOMES[k].length; j++) applyTomeLine(w, k, j);
    expect(w.player.killHeal).toBeGreaterThan(0);
    expect(w.player.jumpMul).toBeGreaterThan(1);
  });
});
