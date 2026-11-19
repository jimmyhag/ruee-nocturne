// Monstres corrompus (docs/specs/corrompus.md) : un test par scénario de la spec (titre anglais), pour la simulation.
// « Un corrompu se reconnaît » est un test Playwright (e2e/corrompus.spec.ts) ; « Un corrompu rapporte plus sans faire
// boule de neige » se mesure avec la CLI (tools/corrupt.test.ts recopie la mesure de docs/GATES.md) ; ici, sa règle.
import { describe, expect, it } from 'vitest';
import {
  ARCHER,
  ARCHER_TYPE,
  CORRUPT,
  CRACHEUR,
  CRACHEUR_TYPE,
  DAILY,
  DARD_TYPE,
  ELITE_TYPE,
  ENEMIES,
  GOLD,
  SORCIER,
  SORCIER_TYPE,
  STAGE,
  STEP,
  VOLANT_TYPE,
} from './balance';
import { corrupt, corruptOn, flameLit, maybeCorrupt } from './corrupt';
import { killEnemy } from './combat';
import { MERCHANT_LEAVE } from './merchant';
import { snapshotWorld } from './snapshot';
import { spawnEnemy, tickSpawner } from './spawner';
import { startEndless } from './stages';
import { startRun, step } from './step';
import { Corrupt, Ev, HurtSrc, Mode, ShotKind, Skill } from './types';
import type { Input } from './types';
import { World } from './world';
import { worldOptions } from '../meta/shop';
import { DEFAULT_META } from '../meta/save';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };

/** Monde sans obstacles, sans spawner ni armes, joueur immobile et solide au centre. */
function quiet(): World {
  const w = new World(3);
  w.weapons = {};
  w.obstacles = [];
  w.walls = [];
  w.obstacleGrid.clear();
  w.wallGrid.clear();
  w.solid.fill(0);
  w.near.fill(0);
  w.lakes = [];
  w.nextWave = w.nextElite = w.nextEruption = 1e9;
  w.spawnAcc = -1e9;
  w.powerNext = 1e9;
  w.player.hp = w.player.maxHp = 1e6;
  w.player.regen = 0;
  return w;
}
/** Un corrompu de `type` à `dist` u au nord du joueur. */
function corrupted(w: World, type: number, dist: number) {
  const e = w.enemies[spawnEnemy(w, type, 0, dist)];
  corrupt(w, e);
  return e;
}
const events = (w: World, type: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === type) n++;
  return n;
};
const shots = (w: World, kind: ShotKind) => {
  const out = [];
  for (let i = 0; i < w.shotCount; i++) if (w.shots[i].kind === kind) out.push(w.shots[i]);
  return out;
};

describe('monstres corrompus : où et combien (décisions 1 et 2)', () => {
  it('Corrupted monsters only appear in overtime', () => {
    // un vrai monde, joué : rien avant la fin du chrono
    const w = new World(42);
    startRun(w);
    w.player.hp = w.player.maxHp = 1e9;
    w.stageT = w.diffT = STAGE.dur - 10;
    w.nextWave = w.nextElite = w.stageT + 1e9;
    for (let k = 0; k < 9 * 60; k++) step(w, still, STEP);
    expect(w.overT).toBe(0);
    expect(w.corrupted).toBe(0);
    for (let i = 0; i < w.enemyCount; i++) expect(w.enemies[i].corrupt).toBe(Corrupt.None);
    // le chrono tombe à 0 : la prolongation en fait apparaître
    let seen = 0;
    for (let k = 0; k < 20 * 60; k++) {
      step(w, still, STEP);
      seen += events(w, Ev.Corrupt);
    }
    expect(w.overT).toBeGreaterThan(0);
    expect(w.corrupted).toBeGreaterThan(0);
    expect(seen).toBeGreaterThanOrEqual(w.corrupted);
    // la part : 10 % à l'entrée, 40 % à +3 min, plafonnée
    expect(CORRUPT.share(0)).toBeCloseTo(0.1);
    expect(CORRUPT.share(90)).toBeCloseTo(0.25);
    expect(CORRUPT.share(180)).toBeCloseTo(0.4);
    expect(CORRUPT.share(600)).toBeCloseTo(0.4);
    for (const [over, share] of [
      [0.01, 0.1],
      [180, 0.4],
    ]) {
      const q = quiet();
      q.overT = over;
      let n = 0;
      const N = 4000;
      for (let k = 0; k < N; k++) {
        q.enemyCount = 0;
        const i = spawnEnemy(q, 0, 0, 20);
        maybeCorrupt(q, i);
        if (q.enemies[i].corrupt === Corrupt.On) n++;
      }
      expect(n / N).toBeGreaterThan(share - 0.03);
      expect(n / N).toBeLessThan(share + 0.03);
    }
  }, 60_000);
  it('the spawner corrupts in overtime only, never an elite or a boss, and draws nothing more before it', () => {
    // avant la prolongation : exactement les mêmes tirages qu'une partie sans corrompus
    const a = quiet(),
      b = quiet();
    b.noCorrupt = true;
    for (const w of [a, b]) {
      w.spawnAcc = 0;
      w.stageT = w.diffT = 400;
      for (let k = 0; k < 600; k++) tickSpawner(w, STEP);
    }
    expect(a.rng.next()).toBe(b.rng.next());
    expect(a.corrupted).toBe(0);
    // en prolongation : des corrompus, jamais une élite (qui reste une élite) ni un boss
    const w = quiet();
    w.spawnAcc = 0;
    w.stageT = STAGE.dur + 200;
    w.diffT = w.stageT;
    w.overT = 200;
    w.nextElite = w.stageT;
    for (let k = 0; k < 60 * 30; k++) {
      tickSpawner(w, STEP);
      w.nextElite = Math.min(w.nextElite, w.stageT); // une élite à chaque pas
      w.enemyCount = Math.min(w.enemyCount, 400);
    }
    let elites = 0;
    for (let i = 0; i < w.enemyCount; i++) {
      const e = w.enemies[i];
      if (e.elite) elites++;
      if (e.elite || ENEMIES[e.type].boss) expect(e.corrupt).toBe(Corrupt.None);
    }
    expect(elites).toBeGreaterThan(0);
    expect(w.corrupted).toBeGreaterThan(0);
    const boss = w.enemies[spawnEnemy(w, STAGE.bosses[0], 0, 10)];
    corrupt(w, boss);
    expect(boss.corrupt).toBe(Corrupt.None);
    // ni défi du jour, ni monde infini, ni partie de la CLI sans corrompus, même en prolongation
    const d = new World(1, worldOptions(DEFAULT_META, undefined, true));
    d.overT = 100;
    expect(corruptOn(d)).toBe(false);
    const e = new World(1);
    e.overT = 100;
    expect(corruptOn(e)).toBe(true);
    e.endless = true;
    expect(corruptOn(e)).toBe(false);
    const n = new World(1, { noCorrupt: true });
    n.overT = 100;
    expect(corruptOn(n)).toBe(false);
  });
  it('the guided run has none before its overtime', () => {
    // partie guidée : le chrono s'arrête avant 0 tant que le boss du totem n'est pas tombé (décision 18 du tutoriel)
    const w = new World(5, { tutorial: true });
    startRun(w);
    w.player.hp = w.player.maxHp = 1e9;
    w.stageT = STAGE.dur - 5;
    for (let k = 0; k < 20 * 60; k++) step(w, still, STEP);
    expect(w.overT).toBe(0);
    expect(w.corrupted).toBe(0);
  });
});

describe('monstres corrompus : le défi du jour et le monde infini (décision 1)', () => {
  /** Joue `w` `s` secondes, joueur immobile et solide, cartes prises au fil de l'eau. */
  function play(w: World, s: number): void {
    w.player.hp = w.player.maxHp = 1e9;
    for (let k = 0; k < s * 60; k++) {
      if (w.mode === Mode.LevelUp) step(w, still, STEP);
      else if (w.mode === Mode.Merchant) step(w, { ...still, pick: MERCHANT_LEAVE }, STEP);
      else step(w, { ...still, pick: -1, mx: Math.sin(k / 90), mz: Math.cos(k / 70) }, STEP);
    }
  }
  /** Champs du monde, sans le réglage de la CLI qui les distingue. */
  function fields(w: World): string {
    const f = snapshotWorld(w).fields;
    delete f.noCorrupt;
    return JSON.stringify(f);
  }
  it('The daily challenge and the endless world do not change', () => {
    // défi du jour : le même avec et sans corrompus (sans eux, c'est la partie d'avant le lot : docs/GATES.md compare
    // aussi 40 défis avant / après, champ par champ)
    const opts = worldOptions(DEFAULT_META, undefined, true);
    const a = new World(77, opts),
      b = new World(77, { ...opts, noCorrupt: true });
    for (const w of [a, b]) {
      startRun(w);
      play(w, 45);
    }
    expect(a.dailyEnd).toBe(DAILY.duration);
    expect(a.corrupted).toBe(0);
    expect(fields(a)).toBe(fields(b));
    // monde infini d'après la victoire : même suite, avec ou sans corrompus, même partie d'une prolongation
    const c = new World(9),
      d = new World(9, { noCorrupt: true });
    for (const w of [c, d]) {
      startRun(w);
      w.stage = STAGE.count - 1;
      w.stageT = w.diffT = STAGE.dur + 30; // vaincu en prolongation
      w.overT = 30;
      w.mode = Mode.Won;
      startEndless(w);
      play(w, 45);
    }
    expect(c.endless).toBe(true);
    expect(c.corrupted).toBe(0);
    expect(fields(c)).toBe(fields(d));
  }, 90_000);
});

describe('monstres corrompus : compétences (décision 4)', () => {
  it('Each corrupted monster has its skill', () => {
    // Spectre, Scission : deux éclats figés le temps qu'on les voie, sans XP ni or
    {
      const w = quiet();
      const e = corrupted(w, 0, 6);
      step(w, still, STEP);
      const gold = w.gold,
        gems = w.gemCount,
        n = w.enemyCount;
      killEnemy(w, w.enemies.indexOf(e));
      expect(w.enemyCount).toBe(n + CORRUPT.split.n);
      const shard = w.enemies[n];
      expect(shard.corrupt).toBe(Corrupt.Shard);
      expect(shard.max).toBeCloseTo(e.max * CORRUPT.split.hp);
      expect(shard.r).toBeLessThan(ENEMIES[0].r);
      const g = w.gold,
        gm = w.gemCount;
      expect(g).toBeGreaterThan(gold); // le parent paie
      expect(gm).toBe(gems + 1);
      killEnemy(w, n); // un éclat : rien
      expect(w.gold).toBe(g);
      expect(w.gemCount).toBe(gm);
      expect(w.enemyCount).toBe(n + CORRUPT.split.n); // pas de Scission en chaîne
    }
    // Dard, Ruée : couloir (état 1) puis sprint en ligne droite
    {
      const w = quiet();
      const e = corrupted(w, DARD_TYPE, 6);
      e.timer = 0;
      let launch = 0,
        maxSpeed = 0,
        rushHit = false;
      for (let k = 0; k < 90; k++) {
        const x = e.x,
          z = e.z;
        step(w, still, STEP);
        launch += events(w, Ev.Corrupt);
        if (e.state === 2) maxSpeed = Math.max(maxSpeed, Math.hypot(e.x - x, e.z - z) / STEP);
        if (w.lastHurt === HurtSrc.Corrupt && w.hurtSkill === Skill.Rush) rushHit = true;
      }
      expect(launch).toBeGreaterThanOrEqual(1);
      expect(maxSpeed).toBeGreaterThan(CORRUPT.rush.speed * 0.8);
      expect(rushHit).toBe(true);
    }
    // Brute, Traînée ardente : des flaques de feu derrière elle
    {
      const w = quiet();
      const e = corrupted(w, ELITE_TYPE, 12);
      for (let k = 0; k < 120; k++) step(w, still, STEP);
      expect(shots(w, ShotKind.Flame).length).toBeGreaterThanOrEqual(2);
      expect(w.flames).toBe(shots(w, ShotKind.Flame).length);
      expect(e.corrupt).toBe(Corrupt.On);
    }
    // Volant, Bombardier : une bombe annoncée sous le joueur, jamais de plongée
    {
      const w = quiet();
      const e = corrupted(w, VOLANT_TYPE, 6);
      e.timer = 0;
      let dives = 0;
      for (let k = 0; k < 60 * 4; k++) {
        step(w, still, STEP);
        dives += events(w, Ev.Dive);
        expect(e.state).toBe(0);
      }
      expect(dives).toBe(0);
      expect(w.lastHurt).toBe(HurtSrc.Corrupt);
      expect(w.hurtSkill).toBe(Skill.Bomb);
    }
    // Cracheur, Éventail : trois crachats en éventail
    {
      const w = quiet();
      const e = corrupted(w, CRACHEUR_TYPE, 8);
      e.timer = 0;
      for (let k = 0; k < 60 && shots(w, ShotKind.Spit).length === 0; k++) step(w, still, STEP);
      const s = shots(w, ShotKind.Spit);
      expect(s.length).toBe(CORRUPT.fan.n);
      expect(new Set(s.map((x) => Math.atan2(x.vx, x.vz).toFixed(3))).size).toBe(CORRUPT.fan.n);
      expect(s.every((x) => x.skill === Skill.Fan)).toBe(true);
    }
    // Archer, Volée perçante : trois flèches en éventail, plus rapides
    {
      const w = quiet();
      const e = corrupted(w, ARCHER_TYPE, 11);
      e.timer = 0;
      for (let k = 0; k < 60 && shots(w, ShotKind.Arrow).length === 0; k++) step(w, still, STEP);
      const s = shots(w, ShotKind.Arrow);
      expect(s.length).toBe(ARCHER.volley);
      expect(Math.hypot(s[0].vx, s[0].vz)).toBeCloseTo(ARCHER.shotSpeed * CORRUPT.volley.speed);
      expect(s.every((x) => x.skill === Skill.Volley)).toBe(true);
    }
    // Sorcier, Pluie de feu : trois boules de feu en triangle autour du joueur
    {
      const w = quiet();
      const e = corrupted(w, SORCIER_TYPE, 13);
      e.timer = 0;
      for (let k = 0; k < 60 && shots(w, ShotKind.Fireball).length === 0; k++) step(w, still, STEP);
      const s = shots(w, ShotKind.Fireball);
      expect(s.length).toBe(CORRUPT.rain.n);
      for (const f of s) expect(Math.hypot(f.x - w.player.x, f.z - w.player.z)).toBeCloseTo(CORRUPT.rain.dist);
      expect(s.every((x) => x.skill === Skill.Rain)).toBe(true);
    }
  });
  it('every corrupted danger is announced at least 0.6 s before it hits', () => {
    expect(CORRUPT.split.wake).toBeGreaterThanOrEqual(0.6);
    expect(CORRUPT.rush.telegraph).toBeGreaterThanOrEqual(0.6);
    expect(CORRUPT.trail.arm).toBeGreaterThanOrEqual(0.6);
    expect(CORRUPT.bomb.telegraph).toBeGreaterThanOrEqual(0.7); // se saute (game-feel §9)
    expect(CRACHEUR.aim).toBeGreaterThanOrEqual(0.6);
    expect(CORRUPT.volley.aim).toBeGreaterThanOrEqual(0.6);
    expect(SORCIER.windup + SORCIER.cast).toBeGreaterThanOrEqual(0.7);
    // mesuré : un joueur immobile au contact ou dans la ligne n'est touché qu'au moins 0,6 s après le début du danger
    // le danger commence au pas où il apparaît (son télégraphe est dessiné à l'image qui suit) ; s'il est déjà là, à t = 0
    const firstHurt = (w: World, start: (w: World) => boolean): number => {
      let t0 = start(w) ? w.t : -1;
      for (let k = 0; k < 60 * 6; k++) {
        step(w, still, STEP);
        if (t0 < 0 && start(w)) t0 = w.t - STEP;
        if (events(w, Ev.PlayerHurt) > 0) return t0 < 0 ? 0 : w.t - t0;
      }
      return Infinity;
    };
    const cases: [number, number, (w: World, e: ReturnType<typeof corrupted>) => (w: World) => boolean][] = [
      // éclats nés au contact du joueur
      [0, 0.3, () => (w) => w.enemyCount > 1],
      // Ruée : à partir du couloir
      [DARD_TYPE, 6, (_, e) => () => e.state === 1],
      // Brute posée à côté du joueur : à partir de la flaque (sa flaque se pose là où elle était)
      [ELITE_TYPE, 1, () => (w) => w.flames > 0],
      // Bombardier : à partir du cercle
      [VOLANT_TYPE, 5, () => (w) => w.shotCount > 0],
      // Éventail : à partir de la visée
      [CRACHEUR_TYPE, 8, (_, e) => () => e.state === 1],
      // Volée : à partir de la visée
      [ARCHER_TYPE, 11, (_, e) => () => e.state === 1],
      // Pluie : à partir des mains levées (le joueur au centre du triangle est à l'abri : il est poussé dans un cercle)
      [SORCIER_TYPE, 13, (_, e) => () => e.state === 1],
    ];
    for (const [type, dist, start] of cases) {
      const w = quiet();
      const e = corrupted(w, type, dist);
      e.timer = 0;
      if (type === 0) {
        killEnemy(w, w.enemies.indexOf(e));
        w.player.invul = 0;
      }
      if (type === ELITE_TYPE) {
        e.spd = 0.4; // lente : sa première flaque tombe sous le joueur
        e.r = 0.1; // et son contact ne compte pas
        ENEMIES[ELITE_TYPE].dmg = 0;
      }
      if (type === SORCIER_TYPE) CORRUPT.rain.dist = 0.5;
      try {
        const t = firstHurt(w, start(w, e));
        expect(t, ENEMIES[type].key).toBeGreaterThanOrEqual(0.6 - 1e-6);
        expect(t, ENEMIES[type].key).toBeLessThan(6); // le danger touche bien
      } finally {
        ENEMIES[ELITE_TYPE].dmg = 24;
        CORRUPT.rain.dist = 2.4;
      }
    }
    expect(flameLit(CORRUPT.trail.dur - 0.01, CORRUPT.trail.arm + CORRUPT.trail.dur)).toBe(true);
    expect(flameLit(CORRUPT.trail.dur + 0.1, CORRUPT.trail.arm + CORRUPT.trail.dur)).toBe(false);
  });
});

describe('monstres corrompus : récompense (décision 6)', () => {
  it('a corrupted monster pays CORRUPT.gold and CORRUPT.xp times a normal one', () => {
    const w = quiet();
    const a = w.enemies[spawnEnemy(w, DARD_TYPE, 0, 10)];
    const b = corrupted(w, DARD_TYPE, 12);
    const g0 = w.gold;
    killEnemy(w, w.enemies.indexOf(a));
    const g1 = w.gold;
    killEnemy(w, w.enemies.indexOf(b));
    expect(g1 - g0).toBeCloseTo(GOLD.perKill);
    expect(w.gold - g1).toBeCloseTo(GOLD.perKill * CORRUPT.gold);
    expect(w.gems[w.gemCount - 1].v).toBeCloseTo(ENEMIES[DARD_TYPE].xp * CORRUPT.xp);
    expect(w.gems[w.gemCount - 2].v).toBeCloseTo(ENEMIES[DARD_TYPE].xp);
    expect(CORRUPT.gold).toBeLessThan(2); // décision 6 : pas ×2
    expect(CORRUPT.xp).toBeLessThan(2);
  });
});
