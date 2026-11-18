// Défi v2 (docs/specs/defi-v2.md) : règle du jour, boss final, médailles, suite en monde infini. Un test par scénario de la
// spec (titre en anglais) pour la simulation et la méta ; l'interface est dans e2e/defi-v2.spec.ts, l'équilibrage
// (« The challenge stays fair whatever the rule ») dans tools/daily.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOSS,
  CHARACTERS,
  DAILY,
  DAILY_ARMORY,
  DAILY_RULE_KEYS,
  DAILY_RULES,
  ENEMIES,
  SPAWN,
  STAGE,
  STEP,
} from '../sim/balance';
import type { DailyRuleKey } from '../sim/balance';
import { hitEnemy } from '../sim/combat';
import { restoreWorld, snapshotWorld } from '../sim/snapshot';
import type { RunSnap } from '../sim/snapshot';
import { spawnEnemy } from '../sim/spawner';
import { adoptDaily, startEndless } from '../sim/stages';
import { startRun, step } from '../sim/step';
import { Ev, HitSrc, Mode, Pw } from '../sim/types';
import type { Input, WorldOptions } from '../sim/types';
import { WEAPON_KEYS } from '../sim/weapons/defs';
import { World } from '../sim/world';
import { unlockedWeapons } from './achievements';
import { BOARD, mergeDay } from './board';
import { dailyRule, dailyRuns, dailyWeapon, recordDaily } from './daily';
import { DEFAULT_META, normalizeMeta } from './save';
import type { Meta } from './save';
import { CHALLENGE, cardText, challengeUrl, parseChallenge } from './share-card';
import { worldOptions } from './shop';
import { progressOf, withProgress } from './sync';

const fresh = (): Meta => normalizeMeta(DEFAULT_META);
const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };
const DAY = '2026-11-18';
const dayAfter = (d: string, n: number): string =>
  new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const ruleIndex = (k: DailyRuleKey): number => DAILY_RULE_KEYS.indexOf(k);
/** Monde du défi avec la règle `rule` (-1 : sans règle), comme worldOptions(…, true, jour) le donne au jeu. */
function daily(seed: number, rule = -1, weapon?: WorldOptions['weapon']): World {
  const o = worldOptions(fresh(), undefined, true);
  if (rule >= 0) o.rule = rule;
  if (weapon) o.weapon = weapon;
  const w = new World(seed, o);
  startRun(w);
  return w;
}
/** Joue jusqu'à `t` s de partie (joueur invincible, cartes prises), en rangeant les événements vus. */
function playTo(w: World, t: number, seen: { type: Ev; t: number; v: number; x2: number; y2: number }[] = []): void {
  w.player.maxHp = w.player.hp = 1e9;
  for (let f = 0; w.t < t && f < 1e6 && w.mode !== Mode.Won && w.mode !== Mode.Dead; f++) {
    step(w, still, STEP);
    for (let i = 0; i < w.eventCount; i++) {
      const e = w.events[i];
      seen.push({ type: e.type, t: w.t, v: e.v, x2: e.x2, y2: e.y2 });
    }
  }
}
const finalBoss = (w: World): number => {
  for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].id === w.dailyBossId && w.enemies[i].alive) return i;
  return -1;
};
/**
 * Horde au repos pour les tests des horloges du défi (boss final, médailles) : plus de monstres ordinaires, ni
 * d'apparitions (« Temps figé ») ; les boss viennent du chrono du défi (stages.ts), pas du spawner. Sans elle, le héros
 * immobile et invincible traîne des centaines de monstres et un test dépasse 30 s sous couverture.
 */
function quiet(w: World): World {
  for (let i = w.enemyCount - 1; i >= 0; i--) if (!ENEMIES[w.enemies[i].type].boss) w.freeEnemy(i);
  w.powerT[Pw.Gel] = 1e9;
  return w;
}
/** Avance l'horloge de la partie sans jouer (comme les tests du lot L3) : seul compte ce qui suit. */
function jump(w: World, t: number): void {
  w.t = w.stageT = t;
}
/** Va jusqu'au boss final, puis le rend increvable (le héros immobile l'abat parfois tout seul avant 5:00). */
function toSturdyBoss(w: World): void {
  jump(w, DAILY.bossAt - 1);
  playTo(w, DAILY.bossAt + 1);
  const i = finalBoss(w);
  expect(i).toBeGreaterThanOrEqual(0);
  w.enemies[i].hp = w.enemies[i].max = 1e15;
}
/** Abat le boss final d'un coup (le pas suivant fait la compaction et les médailles). */
function slayFinalBoss(w: World): void {
  const i = finalBoss(w);
  expect(i).toBeGreaterThanOrEqual(0);
  w.enemies[i].hp = 1;
  hitEnemy(w, i, 1e12, 0, w.player.x, w.player.z, HitSrc.Orbe);
  w.player.maxHp = w.player.hp = 1e9;
}

describe('défi v2 : règle du jour', () => {
  it('The rule of the day is the same for everyone and changes every day', () => {
    // la même pour tous : ne dépend que de la date ; tout joueur, ancien ou nouveau, reçoit les mêmes options
    expect(dailyRule(DAY)).toBe(dailyRule(DAY));
    const veteran = normalizeMeta({ version: 5, runs: 40, character: 'sorciere', unlocks: ['w:boomerang'] });
    expect(worldOptions(veteran, unlockedWeapons(veteran), true, DAY)).toEqual(
      worldOptions(fresh(), unlockedWeapons(fresh()), true, DAY),
    );
    expect(worldOptions(fresh(), undefined, true, DAY).rule).toBe(dailyRule(DAY));
    // jamais celle de la veille, sur deux ans ; chacune des six revient
    const seen = new Set<number>();
    let prev = dailyRule('2026-01-01');
    for (let n = 1; n < 730; n++) {
      const r = dailyRule(dayAfter('2026-01-01', n));
      expect(r, dayAfter('2026-01-01', n)).not.toBe(prev);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(DAILY_RULE_KEYS.length);
      seen.add(r);
      prev = r;
    }
    expect(seen.size).toBe(DAILY_RULE_KEYS.length);
    // une partie complète n'a pas de règle
    expect(worldOptions(fresh(), undefined).rule).toBeUndefined();
    expect(new World(1, worldOptions(fresh(), undefined)).dailyRule).toBe(-1);
  });

  it('Each rule of the day changes the run', () => {
    const seed = 424_242;
    const base = daily(seed);
    // vitesse et vie : un monstre apparu au même tirage, avec et sans la règle
    const probe = (rule: number) => {
      const w = daily(seed, rule);
      const i = spawnEnemy(w, 0, 0, 20);
      return w.enemies[i];
    };
    const ref = probe(-1);
    const swift = probe(ruleIndex('swift'));
    expect(swift.spd / ref.spd).toBeCloseTo(DAILY_RULES.swift.spd, 9);
    expect(DAILY_RULES.swift.spd).toBeGreaterThan(1);
    const swarm = probe(ruleIndex('swarm'));
    expect(swarm.max / ref.max).toBeCloseTo(DAILY_RULES.swarm.hp, 9);
    const giants = probe(ruleIndex('giants'));
    expect(giants.max / ref.max).toBeCloseTo(DAILY_RULES.giants.hp, 9);
    expect(DAILY_RULES.giants.hp).toBeGreaterThan(1);
    // apparitions : sur 60 s, plus de monstres avec la Nuée, moins avec les Colosses
    const spawned = (rule: number) => {
      const w = daily(seed, rule);
      const before = w.nextId;
      playTo(w, 60);
      return w.nextId - before;
    };
    const n0 = spawned(-1);
    expect(spawned(ruleIndex('swarm'))).toBeGreaterThan(n0 * 1.2);
    expect(spawned(ruleIndex('giants'))).toBeLessThan(n0 * 0.9);
    // élites : la première plus tôt, puis plus souvent
    const elites = daily(seed, ruleIndex('elites'));
    expect(elites.nextElite).toBe(DAILY_RULES.elites.eliteFirst);
    expect(base.nextElite).toBe(SPAWN.eliteAfter);
    const ev: { type: Ev; t: number; v: number; x2: number; y2: number }[] = [];
    playTo(elites, DAILY_RULES.elites.eliteFirst + DAILY_RULES.elites.elitePeriod + 1, ev);
    let eliteCount = 0;
    for (let i = 0; i < elites.enemyCount; i++) if (elites.enemies[i].elite) eliteCount++;
    expect(eliteCount + elites.eliteKills).toBe(2);
    // Verre : PV max réduits, dégâts du héros augmentés (même coup, même cible)
    const glass = daily(seed, ruleIndex('glass'));
    expect(glass.player.maxHp).toBe(Math.round(base.player.maxHp * DAILY_RULES.glass.heroHp));
    const hit = (w: World) => {
      const i = spawnEnemy(w, 2, 0, 5);
      const e = w.enemies[i];
      e.hp = e.max = 1e6;
      hitEnemy(w, i, 10, 0, w.player.x, w.player.z, HitSrc.Thorns); // hors arme : pas de critique tiré
      return 1e6 - e.hp;
    };
    expect(hit(glass) / hit(daily(seed))).toBeCloseTo(DAILY_RULES.glass.heroDmg, 9);
    // Arme imposée : une autre arme que l'Orbe, la même pour tous ce jour-là
    const day = DAY;
    const o = worldOptions(fresh(), undefined, true, day);
    const armoryDay = Array.from({ length: 30 }, (_, n) => dayAfter(day, n)).find(
      (d) => DAILY_RULE_KEYS[dailyRule(d)] === 'armory',
    )!;
    const a = worldOptions(fresh(), undefined, true, armoryDay);
    expect(a.weapon).toBe(dailyWeapon(armoryDay));
    expect(a.weapon).not.toBe(CHARACTERS[0].weapon);
    expect(Object.keys(new World(seed, a).weapons)).toEqual([dailyWeapon(armoryDay)]);
    if (DAILY_RULE_KEYS[o.rule!] !== 'armory') expect(o.weapon).toBeUndefined();
    // chaque arme de DAILY_ARMORY peut tomber (celles qui tiennent seules le défi), jamais l'Orbe
    const drawn = new Set(Array.from({ length: 400 }, (_, n) => dailyWeapon(dayAfter('2026-01-01', n))));
    expect([...drawn].sort()).toEqual([...DAILY_ARMORY].sort());
    expect(drawn.has('orbe')).toBe(false);
    for (const k of DAILY_ARMORY) expect(WEAPON_KEYS).toContain(k);
  });
});

describe('défi v2 : boss final et médailles', () => {
  it('The final boss arrives at 4:00', () => {
    // joué depuis 2:45 : l'heure du premier boss de survie d'une partie complète (3:00, préavis à 2:50) est traversée
    const from = STAGE.survival.at[0] - STAGE.survival.warn - 5;
    const w = quiet(daily(515_151));
    jump(w, from);
    const ev: { type: Ev; t: number; v: number; x2: number; y2: number }[] = [];
    playTo(w, DAILY.bossAt + 1, ev);
    const warn = ev.filter((e) => e.type === Ev.SurvivalWarn);
    expect(warn).toHaveLength(1);
    expect(warn[0].x2).toBe(1); // préavis du boss final
    expect(warn[0].t).toBeCloseTo(DAILY.bossAt - DAILY.bossWarn, 1);
    const spawns = ev.filter((e) => e.type === Ev.BossSpawn);
    expect(spawns).toHaveLength(1); // aucun autre boss avant (pas de boss de survie à 3:00)
    expect(spawns[0].y2).toBe(3);
    expect(spawns[0].x2).toBe(STAGE.bosses[0]); // le boss du totem du monde 1
    expect(spawns[0].t).toBeGreaterThanOrEqual(DAILY.bossAt);
    expect(spawns[0].t).toBeLessThan(DAILY.bossAt + 2 * STEP);
    const i = finalBoss(w);
    const e = w.enemies[i];
    expect(e.max).toBeCloseTo(
      ENEMIES[STAGE.bosses[0]].hp * BOSS.hpMul[0] * SPAWN.hpScale(STAGE.bossHpAt[0]) * DAILY.bossHp,
      6,
    );
    expect(e.cadence).toBe(DAILY.bossCadence);
    expect(w.bossIndex).toBe(i); // la barre de boss le suit
    // pas de rage, même en vie depuis plus de BOSS.enrage.after s, suite en monde infini comprise
    e.hp = e.max = 1e15;
    e.age = BOSS.enrage.after + 1;
    playTo(w, w.t + 1, ev);
    expect(e.enraged).toBe(false);
    jump(w, DAILY.duration - 1);
    playTo(w, DAILY.duration + 1, ev);
    startEndless(w);
    playTo(w, w.t + 1, ev);
    expect(e.alive).toBe(true);
    expect(e.age).toBeGreaterThan(BOSS.enrage.after);
    expect(e.enraged).toBe(false);
    expect(ev.some((x) => x.type === Ev.BossEnrage && x.v === STAGE.bosses[0])).toBe(false);
    // une partie complète garde ses boss de survie (le boss final n'existe qu'au défi)
    const full = new World(515_151, worldOptions(fresh(), undefined));
    startRun(full);
    quiet(full);
    jump(full, from);
    const fev: { type: Ev; t: number; v: number; x2: number; y2: number }[] = [];
    playTo(full, DAILY.bossAt + 1, fev);
    expect(fev.some((x) => x.type === Ev.BossSpawn && x.y2 === 1)).toBe(true);
    expect(fev.some((x) => x.y2 === 3 && x.type === Ev.BossSpawn)).toBe(false);
    expect(full.dailyBoss).toBe(0);
  });

  it('Holding 5:00 gives bronze and offers to continue', () => {
    const w = quiet(daily(616_161));
    jump(w, DAILY.bossAt - 1);
    const ev: { type: Ev; t: number; v: number; x2: number; y2: number }[] = [];
    playTo(w, DAILY.duration + 1, ev);
    expect(w.mode).toBe(Mode.Won); // la partie s'arrête sur l'écran « Défi réussi ! » (le choix est à l'interface)
    expect(w.medal).toBe(1);
    const victory = ev.filter((e) => e.type === Ev.Victory);
    expect(victory).toHaveLength(1);
    expect(victory[0].x2).toBe(1); // bronze
    expect(w.dailyBoss).toBe(1); // le boss final est toujours là
  });

  it('Continuing extends the challenge in the endless world', () => {
    const w = quiet(daily(717_171, ruleIndex('swift')));
    toSturdyBoss(w);
    playTo(w, DAILY.duration + 1);
    const boss = w.dailyBossId;
    startEndless(w);
    expect(w.mode).toBe(Mode.Play);
    expect(w.endless).toBe(true);
    expect(w.stage).toBe(0); // la carte du monde 1
    expect(w.dailyRule).toBe(ruleIndex('swift')); // la règle vaut aussi pour la suite
    expect(w.endlessAlive).toBe(1); // le boss final compte comme un boss du monde infini
    expect(w.dailyBossId).toBe(boss);
    const t0 = w.t;
    playTo(w, t0 + 30);
    expect(w.t).toBeGreaterThan(DAILY.duration + 30); // le temps de partie continue : c'est le score et le chrono du HUD
    const i = spawnEnemy(w, 0, 0, 20);
    expect(w.enemies[i].spd / SPAWN.spdScale(w.diffT) / w.overSpd).toBeGreaterThanOrEqual(0.9 * DAILY_RULES.swift.spd);
    expect(w.diffT).toBeCloseTo(w.endlessDiff0 + w.endlessT * DAILY.endlessDiffRate, 9);
  });

  it('Slaying the final boss gives silver', () => {
    // après 5:00, pendant la suite : la médaille d'argent tombe avec lui
    const w = quiet(daily(818_181));
    toSturdyBoss(w);
    playTo(w, DAILY.duration + 1);
    startEndless(w);
    slayFinalBoss(w);
    expect(w.dailyBoss).toBe(2);
    const ev: { type: Ev; t: number; v: number; x2: number; y2: number }[] = [];
    playTo(w, w.t + 2 * STEP, ev);
    expect(w.medal).toBe(2);
    expect(ev.filter((e) => e.type === Ev.Medal).map((e) => e.v)).toEqual([2]);
    // avant 5:00 : bronze et argent ensemble à 5:00 (l'écran « Défi réussi ! » montre l'argent)
    const v = quiet(daily(818_182));
    toSturdyBoss(v);
    slayFinalBoss(v);
    const vev: { type: Ev; t: number; v: number; x2: number; y2: number }[] = [];
    playTo(v, DAILY.duration + 1, vev);
    expect(v.medal).toBe(2);
    expect(vev.find((e) => e.type === Ev.Victory)?.x2).toBe(2);
  });

  it('Holding until 10:00 gives gold', () => {
    const w = quiet(daily(919_191));
    toSturdyBoss(w);
    playTo(w, DAILY.duration + 1);
    startEndless(w);
    slayFinalBoss(w);
    const ev: { type: Ev; t: number; v: number; x2: number; y2: number }[] = [];
    playTo(w, w.t + 1, ev);
    expect(w.medal).toBe(2);
    jump(w, DAILY.goldAt - 1);
    playTo(w, DAILY.goldAt + 1, ev);
    expect(w.medal).toBe(3);
    expect(ev.filter((e) => e.type === Ev.Medal).map((e) => e.v)).toEqual([2, 3]);
    // sans l'argent (boss final toujours debout), 10:00 ne donne rien de plus
    const b = quiet(daily(919_192));
    toSturdyBoss(b);
    playTo(b, DAILY.duration + 1);
    startEndless(b);
    jump(b, DAILY.goldAt - 1);
    playTo(b, DAILY.goldAt + 1);
    expect(b.dailyBoss).toBe(1);
    expect(b.medal).toBe(1);
  });

  it('Dying before 5:00 gives no medal', () => {
    const w = quiet(daily(121_212));
    playTo(w, DAILY.bossAt + 5);
    w.player.hp = -1e9;
    w.player.revives = 0;
    step(w, still, STEP);
    expect(w.mode).toBe(Mode.Dead);
    expect(w.medal).toBe(0);
    // la partie est gardée au classement du jour sans médaille
    const m = fresh();
    recordDaily(m, Math.floor(w.t), w.kills, DAY, w.medal);
    expect(dailyRuns(m, DAY)[0].medal).toBe(0);
  });
});

describe('défi v2 : score, partage, défi d’un ami, reprise', () => {
  it('The score counts all the time held', () => {
    const m = fresh();
    expect(recordDaily(m, 300, 500, DAY, 1)).toBe(1);
    expect(recordDaily(m, 432, 900, DAY, 2)).toBe(1); // 7:12, devant 5:00
    expect(dailyRuns(m, DAY)).toEqual([
      { t: 432, k: 900, medal: 2 },
      { t: 300, k: 500, medal: 1 },
    ]);
    // le résultat publié et le lien gardent leurs champs, avec le temps de 7:12 (borne 300 → 3 600 s)
    expect(mergeDay(null, 432, 900, 'Moi', 1)).toEqual({ name: 'Moi', time: 432, kills: 900, at: 1 });
    expect(BOARD.dayTimeMax).toBe(3600);
    const url = challengeUrl('https://ruee-nocturne.web.app', { date: DAY, t: 432, k: 900 }, 'Jimmy');
    expect(url).toBe(`https://ruee-nocturne.web.app/#defi=${DAY}&t=432&k=900&n=Jimmy`);
    expect(parseChallenge(new URL(url).hash, DAY)).toEqual({ date: DAY, t: 432, k: 900, name: 'Jimmy', uid: '' });
    expect(CHALLENGE.timeMax).toBe(3600);
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    const block = rules.slice(rules.indexOf('match /days/{day}/scores/{uid}'));
    expect(block).toContain("hasOnly(['name', 'time', 'kills', 'at', 'x'])"); // aucun champ de médaille
    expect(block).toContain('d.time <= 3600');
    // la médaille reste sur l'appareil (règle 8) : ni dans la progression du compte, ni dans le lien ; sur la carte
    // que le joueur partage lui-même, oui
    const p = progressOf(m) as unknown as { daily: Record<string, unknown> };
    expect(Object.keys(p.daily).sort()).toEqual(['date', 'kills', 'times']);
    expect(url).not.toMatch(/medal|m=/);
    const card = cardText({ date: DAY, t: 432, k: 900, ok: true, medal: 2, streak: 1 }, url);
    expect(card.split('\n')[1]).toBe('⏱ 7:12 ✅ 🥈  💀 900');
    // la progression reçue d'un autre appareil garde les médailles de celui-ci pour les mêmes parties
    const there = fresh();
    recordDaily(there, 432, 900, DAY);
    recordDaily(there, 120, 40, DAY);
    const merged = withProgress(m, progressOf(there));
    expect(dailyRuns(merged, DAY)).toEqual([
      { t: 432, k: 900, medal: 2 },
      { t: 120, k: 40, medal: 0 },
    ]);
  });

  it('A friend’s challenge is played with the rule of its day', () => {
    const yesterday = dayAfter(DAY, -1);
    const o = worldOptions(fresh(), undefined, true, yesterday);
    expect(o.rule).toBe(dailyRule(yesterday));
    expect(o.rule).not.toBe(dailyRule(DAY));
    expect(new World(dailyRule(yesterday), o).dailyRule).toBe(dailyRule(yesterday));
  });

  it('A resumed daily run keeps its rule and medal', () => {
    // un défi gardé à 6:00 avec la médaille de bronze (suite en monde infini, boss final encore en vie)
    const w = quiet(daily(232_323, ruleIndex('glass')));
    toSturdyBoss(w);
    playTo(w, DAILY.duration + 1);
    startEndless(w);
    playTo(w, w.t + 5);
    jump(w, 360);
    const back = restoreWorld(JSON.parse(JSON.stringify(snapshotWorld(w))) as RunSnap);
    adoptDaily(back); // main.ts l'appelle à chaque reprise d'un défi
    for (const k of [
      'dailyRule',
      'dailyBoss',
      'dailyBossId',
      'dailyBossWarned',
      'medal',
      'endless',
      'dailyEnd',
    ] as const)
      expect(back[k], k).toBe(w[k]);
    expect(back.medal).toBe(1);
    expect(back.player.maxHp).toBe(w.player.maxHp); // Verre
    expect(JSON.stringify(snapshotWorld(back))).toBe(JSON.stringify(snapshotWorld(w)));
    // une partie gardée avant la mise à jour : sans règle, et le boss final s'il n'est pas encore passé
    const old = (t: number): World => {
      const o = worldOptions(fresh(), undefined, true);
      const v = new World(232_324, o);
      startRun(v);
      v.t = v.stageT = t;
      const snap = snapshotWorld(v);
      for (const k of ['dailyRule', 'dailyBoss', 'dailyBossId', 'dailyBossWarned', 'medal']) delete snap.fields[k];
      const r = restoreWorld(JSON.parse(JSON.stringify(snap)) as RunSnap);
      adoptDaily(r);
      return quiet(r);
    };
    const early = old(200);
    expect(early.dailyRule).toBe(-1);
    expect(early.dailyBoss).toBe(0);
    playTo(early, DAILY.bossAt + 1);
    expect(early.dailyBoss).toBe(1); // il vient à 4:00
    const late = old(270);
    expect(late.dailyRule).toBe(-1);
    expect(late.dailyBoss).toBe(3); // 4:00 est passée : pas de boss, donc pas d'argent possible
    playTo(late, DAILY.duration + 1);
    expect(late.medal).toBe(1);
    expect(finalBoss(late)).toBe(-1);
  });
});
