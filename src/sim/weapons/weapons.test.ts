// Armes : bases, lignes de stats (phase 12), tomes, et comportement sur un monde minimal (sim-testing §1).
import { describe, expect, it } from 'vitest';
import { STEP, TOMES, TOME_KEYS, WEAPON_LINES } from '../balance';
import { spawnEnemy } from '../spawner';
import { startRun, step } from '../step';
import { Ev, HitSrc } from '../types';
import type { Input, TomeKey, WeaponKey } from '../types';
import { World } from '../world';
import { WEAPONS, WEAPON_KEYS, applyTomeLine, refreshStats, weaponStats } from './defs';

const still: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: 0 };

describe('fiches d’armes et lignes', () => {
  it('six armes, une base finie et des lignes qui touchent une stat de la base', () => {
    expect(WEAPON_KEYS).toEqual(['orbe', 'aura', 'lames', 'foudre', 'boomerang', 'mines']);
    for (const k of WEAPON_KEYS) {
      const d = WEAPONS[k];
      expect(d.glyph.length).toBeGreaterThan(0);
      for (const v of Object.values(d.base)) expect(Number.isFinite(v), k).toBe(true);
      expect(WEAPON_LINES[k].length).toBeGreaterThanOrEqual(3);
      for (const l of WEAPON_LINES[k]) {
        expect(d.base, `${k} ${l.stat}`).toHaveProperty(l.stat);
        expect(l.weight).toBeGreaterThan(0);
        if (l.kind === 'pct' && l.step < 0) expect(l.max, `${k} ${l.stat} : une baisse en % doit être plafonnée`).toBeDefined();
      }
      expect(WEAPON_LINES[k].some((l) => l.stat === 'dmg')).toBe(true);
    }
  });
  it('les lignes se cumulent sur la base : Orbe +10 % ×3 = 13,3 dégâts, +1 projectile ×2 = 3 tirs', () => {
    const w = new World(1);
    expect(weaponStats(w, 'orbe').dmg).toBeCloseTo(10);
    w.wmods.orbe[0] = 3; // dmg
    w.wmods.orbe[2] = 2; // n
    refreshStats(w);
    expect(weaponStats(w, 'orbe').dmg).toBeCloseTo(10 * 1.1 ** 3);
    expect(weaponStats(w, 'orbe').n).toBe(3);
    // les objets de stats sont réutilisés (zéro allocation côté appelant)
    const ref = weaponStats(w, 'orbe');
    refreshStats(w);
    expect(weaponStats(w, 'orbe')).toBe(ref);
  });
  it('une ligne de recharge plafonnée s’arrête à (1 − 5 %)^max de la base', () => {
    const w = new World(2);
    const l = WEAPON_LINES.orbe[1];
    w.wmods.orbe[1] = l.max!;
    refreshStats(w);
    expect(weaponStats(w, 'orbe').cd).toBeCloseTo(0.95 * 0.95 ** l.max!);
  });
  it('tome Projectiles : +1 projectile pour toutes les armes (cibles de la Foudre comprises), taille et vitesse', () => {
    const w = new World(3);
    w.player.projAdd = 2;
    w.player.sizeMul = 1.5;
    w.player.projSpeedMul = 2;
    refreshStats(w);
    expect(weaponStats(w, 'orbe').n).toBe(3);
    expect(weaponStats(w, 'boomerang').n).toBe(3);
    expect(weaponStats(w, 'lames').n).toBe(4);
    expect(weaponStats(w, 'mines').n).toBe(7);
    expect(weaponStats(w, 'foudre').chain).toBe(5);
    expect(weaponStats(w, 'aura').r).toBeCloseTo(2.2 * 1.5);
    expect(weaponStats(w, 'orbe').speed).toBeCloseTo(34);
  });
});

describe('tomes', () => {
  it('chaque ligne de chaque tome modifie le joueur dans le bon sens', () => {
    for (const k of TOME_KEYS as TomeKey[]) {
      for (let i = 0; i < TOMES[k].length; i++) {
        const w = new World(1);
        const before = { ...w.player };
        w.player.hp = 50;
        applyTomeLine(w, k, i);
        const P = w.player;
        const stat = TOMES[k][i].stat;
        switch (stat) {
          case 'dmg':
            expect(P.dmgMul).toBeCloseTo(before.dmgMul + 0.08);
            break;
          case 'cd':
            expect(P.cdMul).toBeCloseTo(before.cdMul - 0.04);
            break;
          case 'proj':
            expect(P.projAdd).toBe(1);
            break;
          case 'hp':
            expect(P.maxHp).toBe(before.maxHp + 12);
            expect(P.hp).toBe(62);
            break;
          case 'armor':
            expect(P.armor).toBeCloseTo(0.03);
            break;
          case 'speed':
            expect(P.speed).toBeCloseTo(before.speed * 1.05);
            break;
          case 'xp':
            expect(P.xpMul).toBeCloseTo(1.06);
            break;
          case 'luck':
            expect(P.luck).toBeCloseTo(before.luck + 0.5);
            break;
          case 'gold':
            expect(P.goldMul).toBeCloseTo(before.goldMul + 0.08);
            break;
          default:
            expect(JSON.stringify(P)).not.toBe(JSON.stringify(before)); // la ligne change quelque chose
        }
      }
    }
  });
  it('l’armure est bornée à 36 % et la recharge à 25 %', () => {
    const w = new World(2);
    for (let i = 0; i < 40; i++) applyTomeLine(w, 'vitalite', 2);
    expect(w.player.armor).toBeCloseTo(0.36);
    for (let i = 0; i < 60; i++) applyTomeLine(w, 'cadence', 0);
    expect(w.player.cdMul).toBeCloseTo(0.25);
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
    const walk: Input = { ...still, mz: 1 }; // les Mines se posent sur le passage : le joueur marche vers l'ennemi
    for (let f = 0; f < steps; f++) {
      step(w, weapon === 'mines' ? walk : still, STEP);
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
  it('un Spectre (10 PV) meurt d’un Orbe de base (10 dégâts) au premier impact', () => {
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
    expect(bolts).toBeGreaterThanOrEqual(2); // chain = 3 : au moins la cible et un voisin
  });
  it('les lames reculent les ennemis et ne frappent pas deux fois en 0,4 s', () => {
    const w = new World(5);
    w.weapons = { lames: 2 };
    w.wmods.lames[1] = 1; // 3 lames
    refreshStats(w);
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
    w.weapons = { aura: 1 };
    let pulses = 0;
    for (let f = 0; f < 120; f++) {
      step(w, still, STEP);
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.AuraPulse) pulses++;
    }
    expect(pulses).toBeGreaterThanOrEqual(4); // période 0,45 s → 4 ou 5 pulsations en 2 s
    expect(pulses).toBeLessThanOrEqual(5);
  });
});

// Règle 3 de CLAUDE.md : chaque coup porté produit un feedback. Côté sim, l'événement Hit porte tout ce qu'il
// faut au rendu (dégâts, source, direction du recul) et l'ennemi touché flashe. Chaque arme seule, 30 s simulées.
describe('feedback de chaque coup', () => {
  const SRC: Record<WeaponKey, HitSrc> = {
    orbe: HitSrc.Orbe,
    aura: HitSrc.Aura,
    lames: HitSrc.Lames,
    foudre: HitSrc.Foudre,
    boomerang: HitSrc.Boomerang,
    mines: HitSrc.Mines,
  };
  it.each(WEAPON_KEYS)('%s seule, 30 s : chaque Hit porte sa source, des dégâts et un recul unitaire', (k) => {
    const w = new World(21);
    startRun(w);
    w.weapons = { [k]: 2 };
    w.player.maxHp = w.player.hp = 1e9;
    w.player.need = 1e9; // jamais de montée de niveau : l'arme reste seule
    let hits = 0;
    const circle: Input = { ...still };
    for (let f = 0; f < 1800; f++) {
      circle.mx = Math.cos(f / 90); // en mouvement : les Mines se posent sur le passage
      circle.mz = Math.sin(f / 90);
      step(w, circle, STEP);
      for (let e = 0; e < w.eventCount; e++) {
        const ev = w.events[e];
        if (ev.type !== Ev.Hit) continue;
        hits++;
        expect(ev.x2).toBe(SRC[k]);
        expect(ev.v).toBeGreaterThan(0);
        expect(ev.y2 * ev.y2 + ev.z2 * ev.z2).toBeCloseTo(1, 6);
      }
    }
    expect(hits).toBeGreaterThan(5); // le seuil mesure le feedback, pas le DPS (boomerang et mines dépendent du mouvement)
  });
  it('un ennemi touché flashe (0,1 s) et recule, sauf le boss', () => {
    const w = new World(22);
    w.weapons = { lames: 1 };
    const i = spawnEnemy(w, 2, 0, 2.5); // Brute sur l'orbite des lames
    for (let f = 0; f < 30 && w.enemies[i].flash <= 0; f++) step(w, still, STEP);
    expect(w.enemies[i].flash).toBeGreaterThan(0);
    expect(w.enemies[i].kx * w.enemies[i].kx + w.enemies[i].kz * w.enemies[i].kz).toBeGreaterThan(0);
  });
});
