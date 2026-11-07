// Armes : bases, lignes de stats (phase 12), tomes, et comportement sur un monde minimal (sim-testing §1).
import { describe, expect, it } from 'vitest';
import { STEP, SYN, TOMES, TOME_KEYS, WEAPON_LINES } from '../balance';
import { spawnEnemy } from '../spawner';
import { startRun, step } from '../step';
import { Ev, HitSrc } from '../types';
import type { Input, TomeKey, WeaponKey } from '../types';
import { World } from '../world';
import { WEAPONS, WEAPON_KEYS, applyTomeLine, refreshStats, weaponStats } from './defs';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };

describe('fiches d’armes et lignes', () => {
  it('neuf armes (phase 28), une base finie et des lignes qui touchent une stat de la base', () => {
    expect(WEAPON_KEYS).toEqual(['orbe', 'aura', 'lames', 'foudre', 'boomerang', 'mines', 'faux', 'lance', 'meteores']);
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
    expect(weaponStats(w, 'foudre').chain).toBe(2); // phase 30 : aucun ricochet au départ, +2 par le tome
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
    w.weapons = { foudre: 2 };
    w.wmods.foudre[WEAPON_LINES.foudre.findIndex((l) => l.stat === 'chain')] = 1; // phase 30 : un ricochet par carte
    refreshStats(w);
    for (let i = 0; i < 4; i++) spawnEnemy(w, 2, i * 0.3, 6); // 4 Brutes (80 PV) : survivent au premier éclair
    let bolts = 0;
    for (let f = 0; f < 240 && bolts === 0; f++) {
      step(w, still, STEP);
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Bolt) bolts++;
    }
    expect(bolts).toBeGreaterThanOrEqual(2); // un ricochet : la cible et un voisin
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
    faux: HitSrc.Faux,
    lance: HitSrc.Lance,
    meteores: HitSrc.Meteores,
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

describe('armes de la phase 28', () => {
  /** Monde vide d'ennemis, l'arme seule ; ennemis posés à la main (immobiles : vitesse 0). */
  const arena = (k: WeaponKey) => {
    const w = new World(77);
    w.weapons = { [k]: 1 };
    refreshStats(w);
    w.enemyCount = 0;
    w.nextWave = 1e9;
    w.player.maxHp = w.player.hp = 1e9;
    w.player.need = 1e9;
    return w;
  };
  const put = (w: World, x: number, z: number): number => {
    const i = spawnEnemy(w, 0, 0, 10);
    const e = w.enemies[i];
    e.x = e.px = x;
    e.z = e.pz = z;
    e.hp = e.max = 1e6;
    e.spd = 0;
    return i;
  };
  const hitsBy = (w: World, src: HitSrc, seconds: number) => {
    const ids = new Set<number>();
    for (let f = 0; f < Math.round(seconds / STEP); f++) {
      step(w, still, STEP);
      for (let i = 0; i < w.eventCount; i++) {
        const e = w.events[i];
        if (e.type === Ev.Hit && ((e.x2 | 0) & 15) === src) ids.add(Math.round(e.x * 10) * 1000 + Math.round(e.z * 10));
      }
    }
    return ids.size;
  };
  it('Faux : fauche devant (dans l’arc), pas derrière ; un coup de Faux est annoncé (Ev.Scythe)', () => {
    const w = arena('faux');
    w.player.dirX = 0;
    w.player.dirZ = 1;
    const front = put(w, 0, 2),
      back = put(w, 0, -2);
    let scythes = 0;
    for (let f = 0; f < 90; f++) {
      step(w, still, STEP);
      for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.Scythe) scythes++;
    }
    expect(scythes).toBeGreaterThanOrEqual(1);
    expect(w.enemies[front].hp).toBeLessThan(1e6);
    expect(w.enemies[back].hp).toBe(1e6);
  });
  it('Foudre (phase 30) : une seule cible au départ, un ricochet de plus par ligne « chain », Orage +3', () => {
    // coups portés par la première frappe (toutes les cibles d'une chaîne tombent dans le même pas)
    const firstStrike = (w: World) => {
      for (let f = 0; f < 240; f++) {
        step(w, still, STEP);
        let n = 0;
        for (let i = 0; i < w.eventCount; i++) {
          const e = w.events[i];
          if (e.type === Ev.Hit && ((e.x2 | 0) & 15) === HitSrc.Foudre) n++;
        }
        if (n > 0) return n;
      }
      return 0;
    };
    const w = arena('foudre');
    for (let z = 3; z <= 9; z += 1.5) put(w, 0, z); // cinq ennemis en file, à portée de ricochet
    expect(weaponStats(w, 'foudre').chain).toBe(0); // chain = ricochets : 0 → une seule cible
    expect(firstStrike(w)).toBe(1);
    const w2 = arena('foudre');
    for (let z = 3; z <= 9; z += 1.5) put(w2, 0, z);
    const chainLine = WEAPON_LINES.foudre.findIndex((l) => l.stat === 'chain');
    w2.wmods.foudre[chainLine] += 2; // deux cartes « +1 ricochet »
    refreshStats(w2);
    expect(weaponStats(w2, 'foudre').chain).toBe(2);
    expect(firstStrike(w2)).toBe(3); // la cible et deux ricochets
    expect(SYN.orage.chain).toBe(3);
  });
  it('Lance : vise l’ennemi le plus loin et traverse tous ceux sur la ligne', () => {
    const w = arena('lance');
    for (let z = 3; z <= 13; z += 2.5) put(w, 0, z); // cinq ennemis alignés, le plus loin à 13 u
    expect(hitsBy(w, HitSrc.Lance, 2.2)).toBe(5);
  });
  it('Lance en éventail : chaque lance de la salve touche l’ennemi visé, une seule fois chacune', () => {
    const w = arena('lance');
    w.player.projAdd = 2; // trois lances par salve
    refreshStats(w);
    put(w, 0, 2.2); // près du joueur, les trois lances de l'éventail passent sur lui
    expect(weaponStats(w, 'lance').n).toBe(3);
    let n = 0;
    for (let f = 0; f < Math.round(2.2 / STEP); f++) {
      step(w, still, STEP);
      for (let i = 0; i < w.eventCount; i++) {
        const e = w.events[i];
        if (e.type === Ev.Hit && ((e.x2 | 0) & 15) === HitSrc.Lance) n++;
      }
    }
    expect(n).toBe(3); // une salve (recharge 2 s) : trois coups, pas un seul ni davantage
  });
  it('Météores : cercle annoncé, impact après le délai, dégâts de zone', () => {
    const w = arena('meteores');
    const a = put(w, 5, 0),
      b = put(w, 5.8, 0.4);
    let warn = -1,
      hit = -1;
    for (let f = 0; f < 60 * 4 && hit < 0; f++) {
      step(w, still, STEP);
      for (let i = 0; i < w.eventCount; i++) {
        if (w.events[i].type === Ev.MeteorWarn && warn < 0) warn = w.t;
        if (w.events[i].type === Ev.MeteorHit && hit < 0) hit = w.t;
      }
    }
    expect(warn).toBeGreaterThan(0);
    expect(hit - warn).toBeGreaterThan(0.5);
    expect(w.enemies[a].hp + w.enemies[b].hp).toBeLessThan(2e6);
  });
});
