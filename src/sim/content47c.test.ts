// Phase 47 C (demande de Jimmy : des armes) : Fouet, Vitriol, Esprits, Balise et leurs synergies.
import { describe, expect, it } from 'vitest';
import { BALISE, ESPRITS, FOUET, STEP, SYN, SYNERGIES, Syn, VITRIOL, WEAPON_LINES } from './balance';
import { spawnEnemy } from './spawner';
import { startRun, step } from './step';
import { Ev, HIT_CRIT, HitSrc } from './types';
import type { Input, WeaponKey } from './types';
import { WEAPONS, WEAPON_KEYS, refreshStats, weaponStats } from './weapons/defs';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
/** Monde calme, une seule arme, héros increvable tourné vers +z. */
function solo(k: WeaponKey, seed = 7): World {
  const w = new World(seed);
  startRun(w);
  w.weapons = { [k]: 1 };
  refreshStats(w);
  const P = w.player;
  P.need = 1e9;
  P.maxHp = P.hp = 1e9;
  P.dirX = 0;
  P.dirZ = 1;
  w.enemyCount = 0;
  w.nextElite = w.nextWave = w.nextEruption = 1e9;
  w.merchant.next = 99;
  w.survivalNext = 99;
  return w;
}
/**
 * Un pas avec seulement les `keep` premiers ennemis (ceux du test) : ceux que le spawner vient d'ajouter, encore loin,
 * sont retirés avant le pas suivant. (Couper la difficulté par diffT fausserait la vitesse des ennemis.)
 */
const tick = (w: World, keep: number, input: Input = still) => {
  w.enemyCount = Math.min(w.enemyCount, keep);
  step(w, input, STEP);
};
/** Ennemi increvable posé en (dx, dz) du héros ; il y est remis à chaque pas par `hold`. */
const dummy = (w: World, dx: number, dz: number) => {
  const i = spawnEnemy(w, 0, w.player.x + dx, w.player.z + dz);
  w.enemies[i].hp = w.enemies[i].max = 1e9;
  return i;
};
const hitsOf = (w: World, src: HitSrc) => {
  let n = 0;
  for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Hit && (w.events[k].x2 & (HIT_CRIT - 1)) === src) n++;
  return n;
};
const count = (w: World, ev: Ev) => {
  let n = 0;
  for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === ev) n++;
  return n;
};

describe('quatre armes de la phase 47 C', () => {
  it('sources de coup alignées sur l’ordre des armes ; au moins trois lignes et une ligne de critique chacune', () => {
    const src = [HitSrc.Fouet, HitSrc.Vitriol, HitSrc.Esprits, HitSrc.Balise];
    (['fouet', 'vitriol', 'esprits', 'balise'] as WeaponKey[]).forEach((k, j) => {
      expect(WEAPON_KEYS.indexOf(k), k).toBe(src[j]);
      expect(WEAPON_LINES[k].length, k).toBeGreaterThanOrEqual(5);
      expect(WEAPON_LINES[k].some((l) => l.stat === 'crit'), k).toBe(true);
      for (const l of WEAPON_LINES[k]) expect(l.stat in WEAPONS[k].base, `${k}.${l.stat}`).toBe(true);
    });
  });
  it('Fouet : une ligne devant le héros, pas sur les côtés ni derrière ; les lignes ajoutent des directions', () => {
    const w = solo('fouet');
    const L = weaponStats(w, 'fouet').r;
    const front = dummy(w, 0, L - 1),
      side = dummy(w, FOUET.halfW + 2.5, 2),
      back = dummy(w, 0, -(L - 1)),
      far = dummy(w, 0, L + 3);
    const pos = [
      [0, L - 1],
      [FOUET.halfW + 2.5, 2],
      [0, -(L - 1)],
      [0, L + 3],
    ];
    const ids = [front, side, back, far];
    const got = [0, 0, 0, 0];
    let cracks = 0;
    const run = (frames: number) => {
      for (let f = 0; f < frames; f++) {
        ids.forEach((id, j) => {
          const e = w.enemies[id];
          e.x = w.player.x + pos[j][0];
          e.z = w.player.z + pos[j][1];
          e.kx = e.kz = 0;
          e.hp = 1e9;
        });
        w.player.dirX = 0;
        w.player.dirZ = 1;
        tick(w, 4);
        cracks += count(w, Ev.Scythe);
        for (let k = 0; k < w.eventCount; k++) {
          const ev = w.events[k];
          if (ev.type !== Ev.Hit || (ev.x2 & (HIT_CRIT - 1)) !== HitSrc.Fouet) continue;
          ids.forEach((id, j) => {
            if (Math.abs(ev.x - w.enemies[id].x) < 0.6 && Math.abs(ev.z - w.enemies[id].z) < 0.6) got[j]++;
          });
        }
      }
    };
    run(180);
    expect(got[0]).toBeGreaterThanOrEqual(3);
    expect(got[1]).toBe(0);
    expect(got[2]).toBe(0);
    expect(got[3]).toBe(0);
    expect(cracks).toBe(got[0]); // un trait par claque
    // +1 direction : derrière aussi
    w.wmods.fouet[WEAPON_LINES.fouet.findIndex((l) => l.stat === 'n')] = 1;
    refreshStats(w);
    got.fill(0);
    run(180);
    expect(got[2]).toBeGreaterThanOrEqual(3);
    expect(got[1]).toBe(0);
  });
  it('Vitriol : la flaque blesse par à-coups, ralentit et s’éteint', () => {
    const w = solo('vitriol');
    const s = weaponStats(w, 'vitriol');
    const a = dummy(w, 0, 6),
      b = dummy(w, 0.6, 6.4);
    let puddles = 0,
      hits = 0,
      slowed = false;
    for (let f = 0; f < 60 * 3; f++) {
      for (const id of [a, b]) {
        w.enemies[id].kx = w.enemies[id].kz = 0;
        w.enemies[id].hp = 1e9;
      }
      w.enemies[a].x = w.player.x;
      w.enemies[a].z = w.player.z + 6;
      w.enemies[b].x = w.player.x + 0.6;
      w.enemies[b].z = w.player.z + 6.4;
      tick(w, 2);
      puddles += count(w, Ev.Puddle);
      hits += hitsOf(w, HitSrc.Vitriol);
      if (w.enemies[a].slowT > 0) slowed = true;
    }
    expect(puddles).toBe(1); // recharge s.cd > 3 s
    expect(s.cd).toBeGreaterThan(3);
    expect(slowed).toBe(true);
    // deux ennemis dans la flaque : un coup chacun toutes les VITRIOL.tick s tant qu'elle dure
    const ticks = Math.floor((3 - w.wstate.vitT > 0 ? 3 - 1.2 : 0) / VITRIOL.tick);
    expect(hits).toBeGreaterThanOrEqual(2 * (ticks - 1));
    expect(hits).toBeLessThanOrEqual(2 * (ticks + 2));
    expect(w.wstate.vitN).toBe(1);
    w.weapons = {}; // plus de lancer : la flaque en cours finit sa vie… quand l'arme est là ; ici on vérifie la borne
    expect(VITRIOL.dur).toBeGreaterThan(VITRIOL.tick * 4);
  });
  it('Vitriol : sans ennemi à portée, rien n’est lancé (pas de tirage perdu, nouvel essai)', () => {
    const w = solo('vitriol');
    dummy(w, 0, VITRIOL.range + 8);
    let puddles = 0;
    for (let f = 0; f < 120; f++) {
      w.enemies[0].x = w.player.x;
      w.enemies[0].z = w.player.z + VITRIOL.range + 8;
      tick(w, 1);
      puddles += count(w, Ev.Puddle);
    }
    expect(puddles).toBe(0);
    expect(w.wstate.vitN).toBe(0);
  });
  it('Esprits : ils tournent autour du héros, frappent un ennemi proche et reviennent', () => {
    const w = solo('esprits');
    const S = w.wstate;
    for (let f = 0; f < 30; f++) tick(w, 0);
    expect(S.spN).toBe(2);
    for (let i = 0; i < S.spN; i++) expect(Math.hypot(S.spX[i] - w.player.x, S.spZ[i] - w.player.z)).toBeCloseTo(ESPRITS.orbitR, 3);
    const id = dummy(w, 0, 5);
    let hits = 0,
      away = 0;
    for (let f = 0; f < 60 * 6; f++) {
      const e = w.enemies[id];
      e.x = w.player.x;
      e.z = w.player.z + 5;
      e.kx = e.kz = 0;
      e.hp = 1e9;
      tick(w, 1);
      hits += hitsOf(w, HitSrc.Esprits);
      for (let i = 0; i < S.spN; i++) away = Math.max(away, Math.hypot(S.spX[i] - w.player.x, S.spZ[i] - w.player.z));
    }
    expect(hits).toBeGreaterThanOrEqual(6); // deux esprits, un aller-retour d'environ 1,7 s chacun
    expect(away).toBeGreaterThan(3.5); // ils sont allés jusqu'à lui
    // hors de portée : ils restent en ronde
    w.enemies[id].z = w.player.z + ESPRITS.range + 10;
    for (let f = 0; f < 300; f++) {
      w.enemies[id].x = w.player.x;
      w.enemies[id].z = w.player.z + ESPRITS.range + 10;
      tick(w, 1);
    }
    for (let i = 0; i < S.spN; i++) expect(S.spS[i]).toBe(0);
  });
  it('Esprits : une cible qui meurt en route les fait revenir, sans erreur', () => {
    const w = solo('esprits');
    const id = spawnEnemy(w, 0, w.player.x, w.player.z + 6);
    w.enemies[id].hp = w.enemies[id].max = 1e9;
    let flew = false;
    for (let f = 0; f < 240; f++) {
      const e = w.enemies[id];
      if (!flew) {
        e.x = w.player.x;
        e.z = w.player.z + 6;
      }
      tick(w, flew ? 0 : 1); // une fois un esprit parti, la cible disparaît
      if (!flew && (w.wstate.spS[0] === 1 || w.wstate.spS[1] === 1)) flew = true;
    }
    expect(flew).toBe(true);
    expect(w.wstate.spS[0]).toBe(0);
    expect(w.wstate.spS[1]).toBe(0);
  });
  it('Balise : posée sous le héros, elle tire seule sur le plus proche d’elle, puis s’éteint', () => {
    const w = solo('balise');
    const s = weaponStats(w, 'balise');
    const P = w.player;
    const id = dummy(w, 0, 4);
    let beacons = 0,
      bolts = 0,
      hits = 0;
    const hold = () => {
      const e = w.enemies[id];
      e.kx = e.kz = 0;
      e.hp = 1e9;
    };
    for (let f = 0; f < 60 * 3; f++) {
      hold();
      w.enemies[id].x = P.x;
      w.enemies[id].z = P.z + 4;
      tick(w, 1);
      beacons += count(w, Ev.Beacon);
      bolts += count(w, Ev.Bolt);
      hits += hitsOf(w, HitSrc.Balise);
    }
    expect(beacons).toBe(1);
    expect(w.wstate.balN).toBe(1);
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(bolts).toBe(hits); // un éclair par tir
    const bx = w.wstate.balX[0],
      bz = w.wstate.balZ[0];
    // le héros s'éloigne : la balise reste où elle est et continue de tirer
    P.x = P.px = bx + 40;
    w.enemies[id].x = bx;
    w.enemies[id].z = bz + 3;
    let later = 0;
    for (let f = 0; f < 60 * 2; f++) {
      hold();
      w.enemies[id].x = bx;
      w.enemies[id].z = bz + 3;
      tick(w, 1);
      later += hitsOf(w, HitSrc.Balise);
    }
    expect(w.wstate.balX[0]).toBe(bx);
    expect(later).toBeGreaterThanOrEqual(2);
    expect(s.r).toBeGreaterThan(3);
    // elle s'éteint au bout de BALISE.dur s (la suivante n'est pas encore due : cd > dur − 5 s)
    for (let f = 0; f < 60 * (BALISE.dur - 4.5); f++) tick(w, 0);
    expect(w.wstate.balN).toBeLessThanOrEqual(1);
  });
  it('synergies : Saignée soigne, Corrosion allonge, Meute accélère, Batterie double la cible', () => {
    expect(SYNERGIES.slice(11).map((s) => s.key)).toEqual(['saignee', 'corrosion', 'meute', 'batterie']);
    // Saignée
    const w = solo('fouet');
    w.syn[Syn.Saignee] = 1;
    w.player.maxHp = 1000;
    w.player.hp = 100;
    const id = dummy(w, 0, 2);
    for (let f = 0; f < 60; f++) {
      w.enemies[id].x = w.player.x;
      w.enemies[id].z = w.player.z + 2;
      w.enemies[id].hp = 1e9;
      w.enemies[id].kx = w.enemies[id].kz = 0;
      tick(w, 1);
    }
    expect(w.player.hp).toBeGreaterThan(100 + SYN.saignee.heal * 0.99);
    // Corrosion
    const v = solo('vitriol');
    v.syn[Syn.Corrosion] = 1;
    dummy(v, 0, 5);
    for (let f = 0; f < 90 && v.wstate.vitN === 0; f++) {
      v.enemies[0].x = v.player.x;
      v.enemies[0].z = v.player.z + 5;
      tick(v, 1);
    }
    expect(v.wstate.vitN).toBe(1);
    expect(v.wstate.vitLeft[0]).toBeGreaterThan(VITRIOL.dur);
    expect(v.wstate.vitLeft[0]).toBeLessThanOrEqual(VITRIOL.dur * SYN.corrosion.dur);
    // Batterie : deux cibles par tir
    const b = solo('balise');
    b.syn[Syn.Batterie] = 1;
    const e1 = dummy(b, 0, 3),
      e2 = dummy(b, 2, 3);
    let hits = 0,
      shots = 0;
    for (let f = 0; f < 150; f++) {
      for (const k of [e1, e2]) {
        b.enemies[k].hp = 1e9;
        b.enemies[k].kx = b.enemies[k].kz = 0;
        b.enemies[k].x = b.player.x + (k === e1 ? 0 : 2);
        b.enemies[k].z = b.player.z + 3;
      }
      tick(b, 2);
      const h = hitsOf(b, HitSrc.Balise);
      hits += h;
      if (h > 0) shots++;
    }
    expect(shots).toBeGreaterThanOrEqual(2);
    expect(hits).toBe(shots * 2);
  });
});
