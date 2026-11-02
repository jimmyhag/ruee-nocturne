// Armes : tables de stats, textes, et comportement sur un monde minimal (sim-testing §1).
import { describe, expect, it } from 'vitest';
import { STEP, WEAPON_MAX } from '../balance';
import { spawnEnemy } from '../spawner';
import { startRun, step } from '../step';
import { Ev } from '../types';
import type { Input, PassiveKey, WeaponKey } from '../types';
import { World } from '../world';
import { PASSIVES, PASSIVE_KEYS, WEAPONS, WEAPON_KEYS } from './defs';

const still: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: 0 };

describe('fiches d’armes', () => {
  it('quatre armes, stats définies et textes non vides à chaque niveau', () => {
    expect(WEAPON_KEYS).toEqual(['orbe', 'aura', 'lames', 'foudre']);
    for (const k of WEAPON_KEYS) {
      const d = WEAPONS[k];
      expect(d.name.length).toBeGreaterThan(2);
      expect(d.glyph.length).toBeGreaterThan(0);
      for (let lv = 1; lv <= WEAPON_MAX; lv++) {
        const s = d.stats(lv);
        for (const v of Object.values(s)) expect(Number.isFinite(v), `${k} lv${lv}`).toBe(true);
        expect(d.text(s).length).toBeGreaterThan(10);
      }
    }
  });
  it('les dégâts montent avec le niveau, les recharges descendent', () => {
    for (const k of WEAPON_KEYS) {
      for (let lv = 2; lv <= WEAPON_MAX; lv++) {
        const a = WEAPONS[k].stats(lv - 1),
          b = WEAPONS[k].stats(lv);
        expect(b.dmg, `${k} dmg lv${lv}`).toBeGreaterThan(a.dmg);
        if ('cd' in a) expect(b.cd, `${k} cd lv${lv}`).toBeLessThan(a.cd);
      }
    }
    expect(WEAPONS.orbe.stats(4).pierce).toBe(2);
    expect(WEAPONS.orbe.text(WEAPONS.orbe.stats(4))).toContain('transperce');
    expect(WEAPONS.orbe.text(WEAPONS.orbe.stats(3))).toContain('2 tirs');
    expect(WEAPONS.aura.text(WEAPONS.aura.stats(1))).toContain('2,2');
  });
});

describe('passifs', () => {
  it('chaque passif modifie le joueur comme son texte l’annonce', () => {
    for (const k of PASSIVE_KEYS as PassiveKey[]) {
      const w = new World(1);
      const before = { ...w.player };
      w.player.hp = 50;
      PASSIVES[k].apply(w);
      const P = w.player;
      switch (k) {
        case 'vitesse':
          expect(P.speed).toBeCloseTo(before.speed * 1.1);
          break;
        case 'coeur':
          expect(P.maxHp).toBe(before.maxHp + 25);
          expect(P.hp).toBe(75);
          break;
        case 'regen':
          expect(P.regen).toBeCloseTo(before.regen + 0.6);
          break;
        case 'aimant':
          expect(P.magnet).toBeCloseTo(before.magnet * 1.35);
          break;
        case 'force':
          expect(P.dmgMul).toBeCloseTo(before.dmgMul + 0.15);
          break;
        case 'cadence':
          expect(P.cdMul).toBeCloseTo(before.cdMul * 0.92);
          break;
      }
      expect(PASSIVES[k].max).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('comportement sur un monde minimal', () => {
  // Un ennemi posé à 5 u, sans ennemis de départ : chaque arme seule doit le toucher en < 3 s.
  function hitsWithin(weapon: WeaponKey, steps: number): { hit: number; dead: boolean } {
    const w = new World(11);
    w.weapons = { [weapon]: 1 };
    const i = spawnEnemy(w, 0, 0, 5);
    const id = w.enemies[i].id;
    let hit = 0;
    for (let f = 0; f < steps; f++) {
      step(w, still, STEP);
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Hit) hit++;
    }
    let dead = true;
    for (let k = 0; k < w.enemyCount; k++) if (w.enemies[k].id === id) dead = false;
    return { hit, dead };
  }
  it.each(WEAPON_KEYS)('%s touche l’ennemi à 5 u en moins de 3 s', (k) => {
    const r = hitsWithin(k, 180);
    expect(r.hit).toBeGreaterThan(0);
  });
  it('un Spectre (10 PV) meurt d’un Orbe niveau 1 (10 dégâts) au premier impact', () => {
    const r = hitsWithin('orbe', 120);
    expect(r.dead).toBe(true);
  });
  it('la Foudre enchaîne plusieurs ennemis groupés', () => {
    const w = new World(3);
    w.weapons = { foudre: 1 };
    for (let i = 0; i < 4; i++) spawnEnemy(w, 2, i * 0.3, 6); // 4 Brutes (80 PV) : survivent au premier éclair
    let bolts = 0;
    for (let f = 0; f < 240 && bolts === 0; f++) {
      step(w, still, STEP);
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Bolt) bolts++;
    }
    expect(bolts).toBeGreaterThanOrEqual(2); // chain = 3 au niveau 1 : au moins la cible et un voisin
  });
  it('les lames reculent les ennemis et ne frappent pas deux fois en 0,4 s', () => {
    const w = new World(5);
    w.weapons = { lames: 2 };
    const i = spawnEnemy(w, 2, 0, 2.6); // Brute sur l’orbite des lames
    const hpBefore = w.enemies[i].hp;
    let hits = 0;
    for (let f = 0; f < 12; f++) {
      step(w, still, STEP);
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Hit) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(1);
    expect(hits).toBeLessThanOrEqual(3); // 3 lames, chacune au plus une fois en 0,2 s
    expect(w.enemies[i].hp).toBeLessThan(hpBefore);
  });
  it('l’aura pulse à période fixe et émet AuraPulse', () => {
    const w = new World(8);
    startRun(w);
    w.weapons = { aura: 3 };
    let pulses = 0;
    for (let f = 0; f < 120; f++) {
      step(w, still, STEP);
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.AuraPulse) pulses++;
    }
    expect(pulses).toBeGreaterThanOrEqual(4); // période 0,45 s → 4 ou 5 pulsations en 2 s
    expect(pulses).toBeLessThanOrEqual(5);
  });
});
