// Lot L2 (docs/specs/l2-premieres-parties.md) : dévoilement progressif dans la sim. `WorldOptions.reveal` (absent = tout)
// retire sanctuaires, marchand, totem, crânes et totems de boss, refuse la glisse ; les deux premières parties sont
// adoucies (FIRST_RUNS). La carte (coffres, bonus, lieux) ne change pas.
import { describe, expect, it } from 'vitest';
import { FIRST_RUNS, MERCHANT, REVEAL, SPAWN, STAGE, STEP } from './balance';
import { restoreWorld, snapshotWorld } from './snapshot';
import { spawnEnemy } from './spawner';
import { startRun, step } from './step';
import { TOTEM_HIDDEN } from './poi';
import { Ev } from './types';
import type { Input } from './types';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };
const count = (w: World, t: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === t) n++;
  return n;
};
/** Héros intouchable et sans montée de niveau : on observe la carte et le chrono, pas le combat. */
function calm(w: World): World {
  w.player.maxHp = w.player.hp = 1e9;
  w.player.need = 1e9;
  return w;
}
/** Joue `s` secondes ; renvoie le nombre d'événements `ev` vus. */
function run(w: World, input: Input, s: number, ev: Ev): number {
  let n = 0;
  for (let f = 0; f < Math.round(s / STEP); f++) {
    step(w, input, STEP);
    n += count(w, ev);
  }
  return n;
}
/** Avance le chrono du monde jusqu'à juste avant `t` puis joue `s` secondes : le marchand passe-t-il ? */
function merchantVisits(w: World, t: number, s: number): number {
  w.t = w.stageT = t - 0.05;
  return run(w, still, s, Ev.MerchantArrive);
}

describe('dévoilement progressif (lot L2)', () => {
  it('The first run has only the essentials', () => {
    const full = new World(7);
    const w = calm(new World(7, { reveal: 0 }));
    expect(w.reveal).toBe(0);
    // ni sanctuaire, ni crâne, ni totem de boss, ni totem du monde
    expect(full.shrines.length).toBeGreaterThan(0);
    expect(full.skulls.length).toBeGreaterThan(0);
    expect(full.bossTotems.length).toBeGreaterThan(0);
    expect(w.shrines).toHaveLength(0);
    expect(w.skulls).toHaveLength(0);
    expect(w.bossTotems).toHaveLength(0);
    expect(w.totem.state).toBe(TOTEM_HIDDEN);
    // la carte ne bouge pas : mêmes coffres, mêmes pistes
    expect(w.mapChests).toEqual(full.mapChests);
    expect(w.races).toEqual(full.races);
    // armes automatiques et cartes de niveau : l'Orbe de départ, les montées de niveau ouvertes
    expect(w.weapons).toEqual(full.weapons);
    // le marchand ne passe pas, même à son heure
    expect(merchantVisits(w, MERCHANT.times[0], 1)).toBe(0);
    expect(w.merchant.active).toBe(false);
    // le totem ne se charge pas : debout à sa place, rien ne se passe
    w.player.x = w.player.px = w.totem.x;
    w.player.z = w.player.pz = w.totem.z;
    expect(run(w, still, STAGE.totemCharge + 1, Ev.TotemOn)).toBe(0);
    expect(w.totem.state).toBe(TOTEM_HIDDEN);
  });

  it('The sim refuses the slide before it is revealed', () => {
    for (const reveal of [0, 1]) {
      const w = calm(new World(11, { reveal }));
      run(w, { ...still, mx: 1 }, 0.4, Ev.SlideStart); // en marche
      const starts = run(w, { ...still, mx: 1, slide: true }, STEP, Ev.SlideStart);
      expect(w.player.sliding, `dévoilement ${reveal}`).toBe(reveal >= REVEAL.slide);
      expect(starts).toBe(reveal >= REVEAL.slide ? 1 : 0);
    }
  });

  it('Everything is revealed by the fifth run', () => {
    const w = calm(new World(7, { reveal: REVEAL.max }));
    const d = calm(new World(7)); // sans option : tout, comme avant le lot
    for (const x of [w, d]) {
      expect(x.shrines.length).toBeGreaterThan(0);
      expect(x.skulls.length).toBeGreaterThan(0);
      expect(x.bossTotems.length).toBeGreaterThan(0);
      expect(x.totem.state).toBe(0);
      expect(merchantVisits(x, MERCHANT.times[0], 1)).toBe(1);
    }
    expect(snapshotWorld(w)).toEqual(snapshotWorld(d));
  });

  it('each step adds its system: shrines at 2, merchant at 3, totem and skulls at 4', () => {
    for (let reveal = 0; reveal <= REVEAL.max; reveal++) {
      const w = calm(new World(9, { reveal }));
      expect(w.shrines.length > 0, `sanctuaires à ${reveal}`).toBe(reveal >= REVEAL.shrines);
      expect(w.skulls.length > 0, `crânes à ${reveal}`).toBe(reveal >= REVEAL.totem);
      expect(w.bossTotems.length > 0, `totems de boss à ${reveal}`).toBe(reveal >= REVEAL.totem);
      expect(w.totem.state === TOTEM_HIDDEN, `totem à ${reveal}`).toBe(reveal < REVEAL.totem);
      expect(merchantVisits(w, MERCHANT.times[0], 1), `marchand à ${reveal}`).toBe(reveal >= REVEAL.merchant ? 1 : 0);
    }
  });

  // Scénario « Les deux premières parties meurent moins tôt » : le mécanisme ici ; la mesure (≤ 20 % de morts avant
  // 3 min sur 800 parties, --reveal 0 puis 1) est celle de la CLI, `npm run sim` (cible du profil nu), docs/GATES.md
  it('The first two runs die less early', () => {
    const at = (reveal: number | undefined, t: number) => {
      const w = new World(3, reveal === undefined ? undefined : { reveal });
      w.t = t;
      w.diffT = 90;
      const i = spawnEnemy(w, 0, 0, 10);
      return { hp: w.enemies[i].max, dmg: w.enemies[i].dmgMul, w };
    };
    const ref = at(undefined, 0);
    for (const reveal of [0, 1]) {
      const s = at(reveal, 0);
      expect(s.hp).toBeCloseTo(ref.hp * FIRST_RUNS.hp, 9);
      expect(s.dmg).toBeCloseTo(ref.dmg * FIRST_RUNS.dmg, 9);
      expect(s.w.softRate).toBe(FIRST_RUNS.rate);
      // passé la fenêtre (FIRST_RUNS.until), les monstres ont leur force : le boss de 3:00 et la suite
      const late = at(reveal, FIRST_RUNS.until);
      expect(late.hp).toBe(ref.hp);
      expect(late.dmg).toBe(ref.dmg);
    }
    for (const reveal of [2, 3, 4]) {
      const s = at(reveal, 0);
      expect(s.hp).toBe(ref.hp);
      expect(s.dmg).toBe(ref.dmg);
      expect(s.w.softRate).toBe(1);
    }
    expect(FIRST_RUNS.hp).toBeLessThan(1);
    expect(FIRST_RUNS.dmg).toBeLessThan(1);
    expect(FIRST_RUNS.until).toBeLessThanOrEqual(STAGE.survival.at[0]); // le premier boss de survie n'est pas adouci
    // cadence : 10 s de flux continu dans la fenêtre, apparitions à proportion de FIRST_RUNS.rate
    const spawned = (reveal: number) => {
      const w = calm(new World(4, { reveal }));
      w.nextWave = w.nextElite = 1e9;
      w.lastAction = 1e9; // pas de compensation d'ennui
      w.stageT = 60;
      w.t = 60;
      w.spawnAcc = 0;
      let n = 0;
      for (let f = 0; f < 600; f++) {
        const before = w.nextId;
        step(w, still, STEP);
        n += w.nextId - before;
      }
      return n;
    };
    const full = spawned(2);
    expect(full).toBeGreaterThan(10 * SPAWN.rate(60) * 0.9);
    expect(Math.abs(spawned(0) - full * FIRST_RUNS.rate)).toBeLessThanOrEqual(2);
  });

  it('A resumed run keeps its reveal', () => {
    const a = calm(new World(21, { reveal: 1 }));
    startRun(a);
    run(a, { ...still, mx: 1 }, 2, Ev.Hit);
    const b = restoreWorld(JSON.parse(JSON.stringify(snapshotWorld(a))));
    expect(b.reveal).toBe(1);
    expect(b.shrines).toHaveLength(0);
    expect(b.skulls).toHaveLength(0);
    expect(b.bossTotems).toHaveLength(0);
    expect(b.totem.state).toBe(TOTEM_HIDDEN);
    expect(b.softHp).toBe(FIRST_RUNS.hp);
    expect(b.softDmg).toBe(FIRST_RUNS.dmg);
    expect(b.softRate).toBe(FIRST_RUNS.rate);
    // la reprise est identique au bit près, et le marchand ne vient toujours pas
    for (let f = 0; f < 240; f++) {
      step(a, { ...still, mz: 1 }, STEP);
      step(b, { ...still, mz: 1 }, STEP);
    }
    expect(JSON.stringify(snapshotWorld(b))).toBe(JSON.stringify(snapshotWorld(a)));
    expect(merchantVisits(b, MERCHANT.times[0], 1)).toBe(0);
  });

  it('a save made before the update resumes with everything revealed', () => {
    const a = calm(new World(21));
    startRun(a);
    run(a, still, 1, Ev.Hit);
    const s = snapshotWorld(a);
    for (const k of ['reveal', 'softHp', 'softDmg', 'softRate']) delete s.fields[k]; // instantané d'une version d'avant
    const b = restoreWorld(JSON.parse(JSON.stringify(s)));
    expect(b.reveal).toBe(REVEAL.max);
    expect(b.shrines.length).toBe(a.shrines.length);
    expect(b.softHp).toBe(1);
  });
});
