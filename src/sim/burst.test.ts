// Rafales de projectiles et vraie faux (docs/specs/rafales-faux-guidage.md, 1.69.0) : un test par scénario de simulation
// (titres en anglais), plus la reprise d'une partie gardée (décision 11).
import { describe, expect, it } from 'vitest';
import { BURST, FAUX, STEP, WEAPON_LINES } from './balance';
import { killEnemy } from './combat';
import { restoreWorld, snapshotWorld, type RunSnap } from './snapshot';
import { spawnEnemy } from './spawner';
import { step } from './step';
import { Ev } from './types';
import type { Input, WeaponKey } from './types';
import { lineIndex, refreshStats, weaponStats } from './weapons/defs';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };

/** Monde vide, une seule arme avec `extra` lignes « +1 » ; héros increvable, tourné vers +z, sans niveau ni vague. */
function arena(k: WeaponKey, extra = 0, seed = 77): World {
  const w = new World(seed);
  w.weapons = { [k]: 1 };
  if (extra > 0) w.wmods[k][lineIndex(WEAPON_LINES[k], 'n')] = extra;
  refreshStats(w);
  w.enemyCount = 0;
  w.nextWave = w.nextElite = w.nextEruption = w.powerNext = 1e9;
  w.merchant.next = 99;
  w.survivalNext = 99;
  const P = w.player;
  P.maxHp = P.hp = 1e9;
  P.need = 1e9;
  P.dirX = 0;
  P.dirZ = 1;
  return w;
}
/** Ennemi immobile posé en (dx, dz) du héros, `hp` PV ; renvoie son identifiant (les index bougent au compactage). */
function put(w: World, dx: number, dz: number, hp: number): number {
  const i = spawnEnemy(w, 0, 0, 10);
  const e = w.enemies[i];
  e.x = e.px = w.player.x + dx;
  e.z = e.pz = w.player.z + dz;
  e.hp = e.max = hp;
  e.spd = 0;
  return e.id;
}
const indexOf = (w: World, id: number): number => {
  for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].id === id && w.enemies[i].alive) return i;
  return -1;
};
/** Un tir : le pas où il part et sa direction (Ev.Shoot est posé à 0,6 u du héros, dans l'axe du tir). */
interface Shot {
  f: number;
  a: number;
}
/** Joue `frames` pas et relève chaque tir de l'arme (Ev.Shoot, ou Ev.Throw / Ev.Whip : direction au pas). */
function shots(w: World, frames: number, onShot?: (n: number) => void): Shot[] {
  const out: Shot[] = [];
  for (let f = 0; f < frames; f++) {
    const n0 = w.projCount;
    step(w, still, STEP);
    for (let k = 0; k < w.eventCount; k++) {
      const e = w.events[k];
      if (e.type === Ev.Shoot) out.push({ f, a: Math.atan2(e.x - w.player.x, e.z - w.player.z) });
      else if (e.type === Ev.Whip) out.push({ f, a: Math.atan2(e.x2, e.z2) });
      else if (e.type === Ev.Throw && w.projCount > n0) {
        const p = w.projs[w.projCount - 1];
        out.push({ f, a: Math.atan2(p.vx, p.vz) });
      }
      if (onShot && (e.type === Ev.Shoot || e.type === Ev.Whip || e.type === Ev.Throw)) onShot(out.length);
    }
  }
  return out;
}
/** Angle du héros vers (dx, dz). */
const ang = (dx: number, dz: number): number => Math.atan2(dx, dz);

describe('rafales (décisions 6 et 7)', () => {
  it('Extra projectiles fire in a burst', () => {
    // une Orbe à 3 projectiles, un seul ennemi immobile : les 3 partent l'un après l'autre, tous vers lui
    const w = arena('orbe', 2);
    expect(weaponStats(w, 'orbe').n).toBe(3);
    put(w, 0, 6, 1e6);
    const s = shots(w, 90).slice(0, 3);
    expect(s.length).toBe(3);
    for (const x of s) expect(x.a).toBeCloseTo(ang(0, 6), 6);
    // un par un, à l'écart BURST.gap (au pas près), bien avant la recharge
    const gapSteps = Math.ceil(BURST.gap.orbe / STEP - 1e-9);
    expect(s[1].f - s[0].f).toBe(gapSteps);
    expect(s[2].f - s[1].f).toBe(gapSteps);
    expect((s[2].f - s[0].f) * STEP).toBeLessThan(weaponStats(w, 'orbe').cd * w.player.cdMul);
  });

  it('each burst weapon fires its extra shots one by one', () => {
    // Lance, Boomerang, Fouet : leurs « +1 » partent aussi en rafale, jamais deux au même pas
    for (const k of ['lance', 'boomerang', 'fouet'] as WeaponKey[]) {
      const w = arena(k, 1);
      const n = Math.min(weaponStats(w, k).n, 4);
      put(w, 0, 4, 1e6);
      const s = shots(w, 90).slice(0, n);
      expect(s.length, k).toBe(n);
      for (let j = 1; j < n; j++) expect(s[j].f, k).toBeGreaterThan(s[j - 1].f);
      for (const x of s) expect(x.a, k).toBeCloseTo(ang(0, 4), 6);
    }
  });

  it('The burst follows the current target', () => {
    // une rafale en cours dont la cible meurt : le tir suivant part vers le nouvel ennemi le plus proche
    const w = arena('orbe', 2);
    const a = put(w, 0, 4, 1e6),
      b = put(w, 7, 0, 1e6);
    let killed = false;
    const s = shots(w, 90, (n) => {
      if (n === 1 && !killed) {
        killed = true;
        killEnemy(w, indexOf(w, a));
      }
    }).slice(0, 3);
    expect(s[0].a).toBeCloseTo(ang(0, 4), 6);
    expect(s[1].a).toBeCloseTo(ang(7, 0), 6);
    expect(s[2].a).toBeCloseTo(ang(7, 0), 6);
    expect(indexOf(w, b)).toBeGreaterThanOrEqual(0);
  });

  it('A lone tough enemy takes the whole burst', () => {
    // seul à portée, il est « couvert » (BURST.maxSame) mais personne d'autre ne l'est pas : toute la rafale va sur lui
    const w = arena('orbe', 4);
    expect(weaponStats(w, 'orbe').n).toBe(5);
    expect(BURST.maxSame).toBeLessThan(5);
    put(w, 3, 3, 1e6);
    const s = shots(w, 90).slice(0, 5);
    expect(s.length).toBe(5);
    for (const x of s) expect(x.a).toBeCloseTo(ang(3, 3), 6);
  });

  it('A tough enemy in a crowd takes two shots and the rest go to the crowd', () => {
    // une élite proche et trois monstres fragiles plus loin : BURST.maxSame tirs sur elle, puis un par monstre
    const w = arena('orbe', 4);
    const crowd: [number, number][] = [
      [-6, 2],
      [6, 3],
      [1, -7],
    ];
    put(w, 0, 3, 1e6);
    for (const [x, z] of crowd) put(w, x, z, 5);
    const s = shots(w, 90).slice(0, 5);
    expect(s.length).toBe(5);
    expect(BURST.maxSame).toBe(2);
    expect(s[0].a).toBeCloseTo(ang(0, 3), 6);
    expect(s[1].a).toBeCloseTo(ang(0, 3), 6);
    const rest = s.slice(2).map((x) => x.a);
    for (const [x, z] of crowd) expect(rest.filter((r) => Math.abs(r - ang(x, z)) < 1e-6).length).toBe(1);
  });

  it('A burst spreads over weak enemies', () => {
    // trois monstres fragiles (un tir les tue) : un projectile chacun, du plus proche au plus loin
    const w = arena('orbe', 2);
    const weak: [number, number][] = [
      [0, 4],
      [5, 1],
      [-3, -6],
    ];
    for (const [x, z] of weak) put(w, x, z, 5);
    const s = shots(w, 90).slice(0, 3);
    expect(s.map((x) => x.a)).toEqual(weak.map(([x, z]) => expect.closeTo(ang(x, z), 6)));
  });

  it('a burst in progress resumes identically from a saved run', () => {
    // décision 11 : l'état de la rafale est dans l'instantané ; sauvegardée entre deux tirs, la partie reprend pareil
    const w = arena('orbe', 3);
    put(w, 0, 6, 1e6);
    put(w, 4, 4, 5);
    for (let f = 0; f < 200 && w.wstate.orbeLeft === 0; f++) step(w, still, STEP);
    expect(w.wstate.orbeLeft).toBeGreaterThan(0);
    const b = restoreWorld(JSON.parse(JSON.stringify(snapshotWorld(w))) as RunSnap);
    expect(b.wstate.orbeLeft).toBe(w.wstate.orbeLeft);
    for (let f = 0; f < 120; f++) {
      step(w, still, STEP);
      step(b, still, STEP);
    }
    expect(JSON.stringify(snapshotWorld(b))).toBe(JSON.stringify(snapshotWorld(w)));
  });
});

describe('la vraie faux (décisions 8, 9 et 11)', () => {
  it('Scythes cover the front, then the whole front, then all around', () => {
    // huit ennemis tout autour, à 45° d'écart ; une faux fauche ±60°, deux ±120°, trois le tour complet
    const expected = [
      [0, 1, 7], // devant, ±45°
      [0, 1, 2, 6, 7], // et ±90°
      [0, 1, 2, 3, 4, 5, 6, 7],
    ];
    for (let nF = 1; nF <= 3; nF++) {
      const w = arena('faux', nF - 1);
      expect(weaponStats(w, 'faux').n).toBe(nF);
      const ids: number[] = [];
      for (let k = 0; k < 8; k++) ids.push(put(w, 2 * Math.sin((k * Math.PI) / 4), 2 * Math.cos((k * Math.PI) / 4), 1e6));
      let scythes = 0;
      const dirs: number[] = [];
      for (let f = 0; f < 45; f++) {
        w.player.dirX = 0;
        w.player.dirZ = 1;
        step(w, still, STEP);
        for (let k = 0; k < w.eventCount; k++) {
          const e = w.events[k];
          if (e.type !== Ev.Scythe) continue;
          scythes++;
          dirs.push(Math.round((Math.atan2(e.x2, e.z2) * 180) / Math.PI));
          expect(e.y2).toBe(120); // chaque faux couvre son arc fixe
        }
        if (scythes > 0) break;
      }
      expect(scythes, `${nF} faux`).toBe(nF); // elles fauchent ensemble, une par événement
      // côte à côte, centrées sur le regard : 0 ; −60, 60 ; −120, 0, 120
      expect(dirs.sort((x, y) => x - y)).toEqual(nF === 1 ? [0] : nF === 2 ? [-60, 60] : [-120, 0, 120]);
      const hit = ids.map((id) => w.enemies[indexOf(w, id)].hp < 1e6);
      expect(
        hit.flatMap((h, k) => (h ? [k] : [])),
        `${nF} faux`,
      ).toEqual(expected[nF - 1]);
    }
  });

  it('the scythe line gives one more scythe, up to all around', () => {
    // « +1 faux » remplace « +15° d'arc » ; le tome Projectiles en donne aussi, sans dépasser le tour complet
    const j = lineIndex(WEAPON_LINES.faux, 'n');
    expect(WEAPON_LINES.faux.some((l) => l.stat === 'arc')).toBe(false);
    expect(WEAPON_LINES.faux[j].max).toBe(FAUX.maxN - 1);
    const w = arena('faux', 2);
    w.player.projAdd = 3;
    refreshStats(w);
    expect(weaponStats(w, 'faux').n).toBe(6);
    let scythes = 0;
    put(w, 0, 2, 1e6);
    for (let f = 0; f < 45 && scythes === 0; f++) {
      step(w, still, STEP);
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Scythe) scythes++;
    }
    expect(scythes).toBe(FAUX.maxN);
  });

  it('a run saved in 1.68 turns its arc lines into scythes', () => {
    // décision 11 : une faux de plus par tranche de 120° gagnée, arrondi au plus proche, au plus le tour complet
    const j = lineIndex(WEAPON_LINES.faux, 'n');
    for (const [arcLines, scythes] of [
      [0, 0],
      [3, 0], // 45°
      [4, 1], // 60° : arrondi au plus proche
      [8, 1], // 120°
      [12, 2], // 180°
      [16, 2], // 240° : le tour complet
    ]) {
      const w = arena('faux');
      w.wmods.faux[j] = arcLines;
      const snap = JSON.parse(JSON.stringify(snapshotWorld(w))) as RunSnap;
      delete snap.rev; // écrite par la 1.68 : sans révision
      expect(restoreWorld(snap).wmods.faux[j], `${arcLines} lignes d'arc`).toBe(scythes);
      // une partie de la 1.69 garde ses lignes telles quelles
      w.wmods.faux[j] = Math.min(2, arcLines);
      expect(restoreWorld(JSON.parse(JSON.stringify(snapshotWorld(w))) as RunSnap).wmods.faux[j]).toBe(Math.min(2, arcLines));
    }
  });
});
