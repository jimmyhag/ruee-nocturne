// Phase 48 (demande de Jimmy) : la difficulté de la partie. Crânes sur la carte, tome de difficulté ; plus de monstres
// (× (1 + d)) et plus de vie (× (1 + hpShare · d)), rien d'autre.
import { describe, expect, it } from 'vitest';
import { DIFFICULTY, ENEMIES, ITEM, It, MAPCHEST, SHRINE, SPAWN, STAGE, STEP, TOMES, TOME_HELD, TOME_POOL } from './balance';
import { gainItem } from './items';
import { rollChoices } from './progression';
import { difficultyHp, difficultyOf, spawnEnemy, tickSpawner } from './spawner';
import { nextStage, summonStageBoss, summonSurvivalBoss } from './stages';
import { step } from './step';
import { Ev } from './types';
import type { Input } from './types';
import { applyTomeLine, lineIndex } from './weapons/defs';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
/** Monde calme : ni vague, ni élite, ni boss imprévu, aucune arme qui tire, pas de montée de niveau. */
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
const place = (w: World, x: number, z: number): void => {
  w.player.x = w.player.px = x;
  w.player.z = w.player.pz = z;
};
/** Pas de jeu sans ennemis (le joueur ne meurt pas) ; retourne le nombre d'événements `ev`. */
function run(w: World, seconds: number, ev: Ev): number {
  let n = 0;
  for (let f = 0; f < Math.round(seconds / STEP); f++) {
    w.enemyCount = 0;
    step(w, still, STEP);
    for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === ev) n++;
  }
  return n;
}

describe('crânes : placement', () => {
  it('entre skullMin et skullMax par monde (phase 50), tous posés même au maximum, stables par graine', () => {
    const seen: number[] = [];
    for (let seed = 1; seed <= 80; seed++) {
      const n = new World(seed).skulls.length;
      expect(n).toBeGreaterThanOrEqual(DIFFICULTY.skullMin);
      expect(n).toBeLessThanOrEqual(DIFFICULTY.skullMax);
      seen.push(n);
    }
    expect(Math.min(...seen)).toBeLessThanOrEqual(DIFFICULTY.skullMin + 2);
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(DIFFICULTY.skullMax - 2);
    const min = DIFFICULTY.skullMin;
    DIFFICULTY.skullMin = DIFFICULTY.skullMax; // le maximum tient sur toutes les cartes
    try {
      for (let seed = 1; seed <= 40; seed++) expect(new World(seed).skulls.length, `graine ${seed}`).toBe(DIFFICULTY.skullMax);
    } finally {
      DIFFICULTY.skullMin = min;
    }
  });
  it('hors de la clairière, à l’écart des autres lieux et les uns des autres', () => {
    for (const seed of [1, 3, 11, 42]) {
      const w = new World(seed);
      for (const s of w.skulls) {
        expect(Math.hypot(s.x, s.z)).toBeGreaterThanOrEqual(DIFFICULTY.skullFromStart);
        expect(Math.hypot(s.x - w.totem.x, s.z - w.totem.z)).toBeGreaterThanOrEqual(STAGE.totemSpacing);
        for (const p of [...w.mapChests, ...w.shrines])
          expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThanOrEqual(DIFFICULTY.skullFromPoi - 1e-6);
        expect(s.on).toBe(false);
      }
      for (let i = 0; i < w.skulls.length; i++)
        for (let j = i + 1; j < w.skulls.length; j++)
          expect(Math.hypot(w.skulls[i].x - w.skulls[j].x, w.skulls[i].z - w.skulls[j].z)).toBeGreaterThanOrEqual(
            DIFFICULTY.skullSpacing - 1e-6,
          );
      const again = new World(seed);
      expect(again.skulls).toEqual(w.skulls);
    }
  });
  it('tirés en dernier : coffres, sanctuaires et totem d’une graine sont ceux d’avant la phase', () => {
    const [min, max] = [DIFFICULTY.skullMin, DIFFICULTY.skullMax];
    try {
      for (const seed of [1, 42]) {
        [DIFFICULTY.skullMin, DIFFICULTY.skullMax] = [min, max];
        const withSkulls = new World(seed);
        DIFFICULTY.skullMin = DIFFICULTY.skullMax = 0;
        const without = new World(seed);
        expect(without.skulls.length).toBe(0);
        expect(withSkulls.mapChests).toEqual(without.mapChests);
        expect(withSkulls.shrines).toEqual(without.shrines);
        expect(withSkulls.totem).toEqual(without.totem);
        expect(withSkulls.mapChests.length).toBe(MAPCHEST.count);
        expect(withSkulls.shrines.length).toBe(SHRINE.count);
      }
    } finally {
      [DIFFICULTY.skullMin, DIFFICULTY.skullMax] = [min, max];
    }
  });
});

describe('crânes : activation', () => {
  it('rester skullCharge s dedans monte la difficulté d’un pas, une seule fois ; la jauge redescend dehors', () => {
    const w = calm(7);
    const s = w.skulls[0];
    place(w, s.x, s.z);
    expect(run(w, DIFFICULTY.skullCharge * 0.6, Ev.SkullOn)).toBe(0);
    expect(s.charge).toBeGreaterThan(0);
    expect(w.player.difficulty).toBe(0);
    // sortir : la jauge se vide
    place(w, s.x + DIFFICULTY.skullR + 2, s.z);
    run(w, DIFFICULTY.skullCharge, Ev.SkullOn);
    expect(s.charge).toBe(0);
    // revenir et rester
    place(w, s.x, s.z);
    expect(run(w, DIFFICULTY.skullCharge + 0.2, Ev.SkullOn)).toBe(1);
    expect(s.on).toBe(true);
    expect(w.player.difficulty).toBeCloseTo(DIFFICULTY.skullStep, 9);
    expect(w.skullsOn).toBe(1);
    // rester encore : rien de plus
    expect(run(w, DIFFICULTY.skullCharge * 2, Ev.SkullOn)).toBe(0);
    expect(w.player.difficulty).toBeCloseTo(DIFFICULTY.skullStep, 9);
  });
  it('rien d’autre ne change : ni bonus, ni choix, ni soin', () => {
    const w = calm(7);
    const P = w.player;
    P.hp = P.maxHp - 20;
    const before = { hp: P.hp, dmg: P.dmgMul, gold: w.gold, boon: w.boonPicks, item: w.itemPicks };
    place(w, w.skulls[0].x, w.skulls[0].z);
    run(w, DIFFICULTY.skullCharge + 0.2, Ev.SkullOn);
    expect(w.boonPicks).toBe(before.boon);
    expect(w.itemPicks).toBe(before.item);
    expect(P.dmgMul).toBe(before.dmg);
    expect(w.gold).toBe(before.gold);
    expect(P.hp - before.hp).toBeLessThan(P.regen * (DIFFICULTY.skullCharge + 0.3) + 1e-6);
  });
  it('l’Encens charge un crâne plus vite, comme un sanctuaire', () => {
    const w = calm(7);
    gainItem(w, It.Encens);
    place(w, w.skulls[0].x, w.skulls[0].z);
    const t = DIFFICULTY.skullCharge / (1 + ITEM.encens.charge) + 0.1;
    expect(run(w, t, Ev.SkullOn)).toBe(1);
  });
  it('la difficulté suit le joueur au monde suivant, où six nouveaux crânes attendent', () => {
    const w = calm(7);
    place(w, w.skulls[0].x, w.skulls[0].z);
    run(w, DIFFICULTY.skullCharge + 0.2, Ev.SkullOn);
    nextStage(w);
    expect(w.player.difficulty).toBeCloseTo(DIFFICULTY.skullStep, 9);
    expect(w.skullsOn).toBe(1);
    expect(w.skulls.length).toBeGreaterThanOrEqual(DIFFICULTY.skullMin); // la carte du monde suivant tire son nombre
    expect(w.skulls.every((s) => !s.on && s.charge === 0)).toBe(true);
  });
});

describe('effet de la difficulté', () => {
  /** Monstres apparus en 10 s à 2:00 de difficulté, sans compensation d'ennui. */
  const spawned = (d: number): number => {
    const w = calm(9);
    w.player.difficulty = d;
    w.diffT = 120;
    let n = 0;
    for (let f = 0; f < 600; f++) {
      const before = w.enemyCount;
      w.lastAction = w.t = 100;
      tickSpawner(w, STEP);
      n += w.enemyCount - before;
    }
    return n;
  };
  it('apparitions × (1 + d)', () => {
    const base = spawned(0);
    expect(spawned(0.5) / base).toBeGreaterThan(1.4);
    expect(spawned(0.5) / base).toBeLessThan(1.6);
    expect(spawned(1) / base).toBeGreaterThan(1.9);
    expect(spawned(1) / base).toBeLessThan(2.1);
  });
  it('vie × (1 + hpShare · d) ; dégâts et vitesse inchangés', () => {
    const hp = (d: number) => {
      const w = calm(9);
      w.player.difficulty = d;
      w.diffT = 200;
      const e = w.enemies[spawnEnemy(w, 0, 0, 10)];
      return { hp: e.max, dmg: e.dmgMul };
    };
    const a = hp(0),
      b = hp(1);
    expect(a.hp).toBeCloseTo(ENEMIES[0].hp * SPAWN.hpScale(200), 9);
    expect(b.hp / a.hp).toBeCloseTo(1 + DIFFICULTY.hpShare, 9);
    expect(b.dmg).toBe(a.dmg);
    expect(difficultyHp(calm(9))).toBe(1); // au départ, exactement ×1 : apparitions et vie d'une partie sans crâne ne bougent pas
  });
  it('les vagues d’encerclement grossissent avec elle', () => {
    const wave = (d: number): number => {
      const w = calm(9);
      w.player.difficulty = d;
      w.diffT = w.stageT = 60;
      w.nextWave = 60;
      w.lastAction = w.t = 100;
      tickSpawner(w, STEP);
      for (let k = 0; k < w.eventCount; k++) if (w.events[k].type === Ev.Wave) return w.events[k].v;
      return 0;
    };
    expect(wave(1)).toBe(2 * wave(0));
  });
  it('les boss prennent le bonus de vie (survie et totem), pas le bonus de nombre', () => {
    const boss = (d: number, totem: boolean): number => {
      const w = calm(9);
      w.player.difficulty = d;
      if (totem) summonStageBoss(w);
      else summonSurvivalBoss(w, 0);
      expect(w.enemies.slice(0, w.enemyCount).filter((e) => ENEMIES[e.type].boss).length).toBe(1);
      return w.enemies[w.bossIndex].max;
    };
    expect(boss(1, true) / boss(0, true)).toBeCloseTo(1 + DIFFICULTY.hpShare, 9);
    expect(boss(1, false) / boss(0, false)).toBeCloseTo(1 + DIFFICULTY.hpShare, 9);
  });
  it('sans plafond (phase 50) : à 600 %, la vie des monstres est ×4', () => {
    const w = calm(9);
    w.player.difficulty = 6;
    expect(difficultyOf(w)).toBe(6);
    expect(difficultyHp(w)).toBeCloseTo(1 + 6 * DIFFICULTY.hpShare, 9);
  });
});

describe('tome de difficulté', () => {
  it('sorti de la réserve ; proposé seulement après un crâne activé ; sa première ligne monte la difficulté', () => {
    expect(TOME_HELD).not.toContain('defi');
    expect(TOME_POOL[TOME_POOL.length - 1]).toBe('defi'); // dernier du pool : l'écarter ne décale aucun tirage
    const offered = (skulls: number): boolean => {
      const w = new World(4);
      w.maxTomes = 12;
      w.skullsOn = skulls;
      for (let k = 0; k < 400; k++) {
        rollChoices(w);
        if (w.cards.some((c) => c.kind === 't' && c.key === 'defi')) return true;
      }
      return false;
    };
    expect(offered(0)).toBe(false);
    expect(offered(DIFFICULTY.tomeAfterSkulls)).toBe(true);
    // sans crâne, les cartes tirées sont exactement celles d'un jeu sans ce tome
    const cards = (drop: boolean): string => {
      const i = TOME_POOL.indexOf('defi');
      if (drop) TOME_POOL.splice(i, 1);
      try {
        const w = new World(4);
        let s = '';
        for (let k = 0; k < 60; k++) {
          rollChoices(w);
          s += w.cards.map((c) => `${c.kind}${c.key}${c.s0}${c.s1}${c.s2}`).join(',') + ';';
        }
        return s;
      } finally {
        if (drop) TOME_POOL.push('defi');
      }
    };
    expect(cards(false)).toBe(cards(true));
    // une fois pris, il continue de monter même si on ne touche plus aux crânes
    const owned = new World(4);
    owned.tomes = { defi: 1 };
    let again = false;
    for (let k = 0; k < 200 && !again; k++) {
      rollChoices(owned);
      again = owned.cards.some((c) => c.kind === 't' && c.key === 'defi');
    }
    expect(again).toBe(true);
    const i = lineIndex(TOMES.defi, 'difficulty');
    expect(i).toBe(0);
    const v = calm(9);
    for (let k = 0; k < 4; k++) applyTomeLine(v, 'defi', i);
    expect(v.player.difficulty).toBeCloseTo(4 * TOMES.defi[0].step, 9);
    // crânes et tome s'additionnent
    place(v, v.skulls[0].x, v.skulls[0].z);
    run(v, DIFFICULTY.skullCharge + 0.2, Ev.SkullOn);
    expect(v.player.difficulty).toBeCloseTo(4 * TOMES.defi[0].step + DIFFICULTY.skullStep, 9);
  });
});
