// Le Cœur de la Nuit (docs/specs/boss-final.md) : un test par scénario de la spec (titre anglais), pour la simulation.
// « Le défi du jour et la partie guidée ne changent pas » : src/sim/final-golden.test.ts. « Le boss final est dur sans
// être un mur » se mesure avec la CLI (tools/final.test.ts recopie la mesure de docs/GATES.md). Bannières, gris des
// coups bloqués et zone sûre à l'écran : e2e/boss-final.spec.ts.
import { describe, expect, it } from 'vitest';
import { ARENA, CHARACTERS, CORRUPT, FINAL, GOLD, PLAYER, STAGE, STEP } from './balance';
import { corruptOn, maybeCorrupt } from './corrupt';
import { hitEnemy } from './combat';
import { FINAL_DONE, adoptCleared, heartOf, judgeDist, summonHeart } from './final';
import { restoreWorld, snapshotWorld } from './snapshot';
import type { RunSnap } from './snapshot';
import { spawnEnemy } from './spawner';
import { enterArena, nextStage, stageLeft, stageSeed, startEndless, summonStageBoss } from './stages';
import { startRun, step } from './step';
import { Ev, HurtSrc, Mode, Pw, Role, ShotKind } from './types';
import type { CharacterKey, Enemy, Input } from './types';
import { ARENA_SEED, World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
const count = (w: World, t: Ev): number => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === t) n++;
  return n;
};
/** Avance `s` secondes (cartes : la première) ; renvoie les événements `ev` vus. */
function run(w: World, s: number, ev?: Ev, input: Input = still): number {
  let n = 0;
  for (let f = 0; f < Math.round(s / STEP); f++) {
    input.pick = w.mode === Mode.LevelUp ? 0 : -1;
    step(w, input, STEP);
    if (ev !== undefined) n += count(w, ev);
    if (w.mode === Mode.Dead || w.mode === Mode.Won) break;
  }
  return n;
}
/** Héros increvable, sans armes (les coups sont donnés par le test), au monde 3. */
function world3(seed: number, character?: CharacterKey): World {
  const w = new World(seed, character ? { character } : undefined);
  w.weapons = {};
  w.player.maxHp = w.player.hp = 1e9;
  w.player.need = 1e9;
  nextStage(w);
  nextStage(w);
  w.nextWave = w.nextElite = w.nextEruption = 1e9;
  w.survivalNext = 99;
  return w;
}
/** Dans l'Arène (le monde 3 vaincu), le boss sorti (phase 1). */
function arena(seed: number, character?: CharacterKey): { w: World; h: Enemy } {
  const w = world3(seed, character);
  summonStageBoss(w);
  hitEnemy(w, w.bossIndex, 1e12, 0, 0, 0);
  enterArena(w);
  w.chestCount = 0; // le coffre du boss du monde 3 (posé devant le héros) ouvrirait une feuille d'objets
  run(w, FINAL.appear + 0.1);
  const h = heartOf(w)!;
  return { w, h };
}
/** Un coup d'arme sur le boss final, par sa place dans le pool. */
const strike = (w: World, e: Enemy, dmg: number): boolean => hitEnemy(w, w.enemies.indexOf(e), dmg, 0, w.player.x, w.player.z);
const ofRole = (w: World, r: Role): Enemy[] => {
  const out: Enemy[] = [];
  for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].alive && w.enemies[i].role === r) out.push(w.enemies[i]);
  return out;
};
/** Amène le boss à la phase `p` (pause comprise) ; en phase 3 et plus, les sceaux sont brisés. */
function toPhase(w: World, h: Enemy, p: number): void {
  while (w.finalPhase < p) {
    if (w.finalPhase === 2) for (const s of ofRole(w, Role.Seal)) strike(w, s, 1e12);
    else strike(w, h, 1e12);
    run(w, STEP * 2);
    run(w, FINAL.pause + 0.1);
  }
}

describe('le passage vers l’Arène (décisions 1 et 2)', () => {
  it("Beating the world 3 boss opens the way to the Arena", () => {
    const w = world3(31);
    w.stageT = 200; // il reste 6:40 au chrono
    const gold0 = w.gold;
    w.player.x = w.player.px = w.totem.x;
    w.player.z = w.player.pz = w.totem.z;
    run(w, STAGE.totemCharge + 0.2);
    expect(w.totem.state).toBe(1);
    hitEnemy(w, w.bossIndex, 1e12, 0, 0, 0);
    // le monde 3 compte comme vaincu (la victoire d'avant), sans feuille de victoire ; bonus d'or de fin payé
    expect(w.cleared).toBe(true);
    expect(w.mode).toBe(Mode.Play);
    expect(count(w, Ev.Victory)).toBe(0);
    expect(w.gold - gold0).toBeGreaterThanOrEqual(w.t * GOLD.perSecond * w.player.goldMul - 1e-6);
    expect(w.goldBonusT).toBeCloseTo(w.t, 9);
    // le chrono tombe à 0 (prolongation), un portail mène à l'Arène (v = 4 : le rendu le fait rouge)
    expect(stageLeft(w)).toBe(0);
    expect(w.portal.open).toBe(true);
    let portal = -1;
    for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.PortalOpen) portal = w.events[i].v;
    expect(portal).toBe(ARENA + 1);
    expect(run(w, STEP * 2, Ev.TimeUp)).toBe(1);
    // y rester STAGE.portalHold s : l'Arène, carte vide et ronde ; aucun ennemi ni tir de l'ancien monde
    expect(run(w, STAGE.portalHold + 0.1, Ev.StageStart)).toBe(1);
    expect(w.stage).toBe(ARENA);
    expect(w.seed).toBe(ARENA_SEED);
    expect([w.obstacles.length, w.walls.length, w.mapChests.length, w.shrines.length, w.skulls.length]).toEqual([0, 0, 0, 0, 0]);
    expect([w.enemyCount, w.shotCount, w.overT]).toEqual([0, 0, 0]);
    expect(w.arenaR).toBe(FINAL.arenaR);
    expect(w.player.z).toBeCloseTo(FINAL.entry, 6);
    // ni horde, ni marchand, ni éruption, ni bonus : le boss sort au centre FINAL.appear s après l'entrée
    expect(run(w, FINAL.appear - 0.2, Ev.BossSpawn)).toBe(0);
    expect(w.enemyCount).toBe(0);
    let finalSpawn = 0,
      at = [1, 1];
    for (let f = 0; f < 30; f++) {
      step(w, still, STEP);
      for (let i = 0; i < w.eventCount; i++) {
        const e = w.events[i];
        if (e.type !== Ev.BossSpawn || e.y2 !== 4) continue;
        finalSpawn++;
        at = [e.x, e.z];
      }
    }
    expect(finalSpawn).toBe(1);
    expect(at).toEqual([0, 0]); // au centre
    const h = heartOf(w)!;
    expect(h.type).toBe(STAGE.bosses[2]);
    expect(h.r).toBe(FINAL.r);
    expect(w.bossIndex).toBe(w.enemies.indexOf(h));
    // le cercle de flammes est infranchissable
    w.player.x = w.player.px = 0;
    w.player.z = w.player.pz = 0.5;
    run(w, 6, undefined, { ...still, mz: 1 });
    expect(Math.hypot(w.player.x, w.player.z)).toBeLessThanOrEqual(w.arenaR - PLAYER.radius + 1e-9);
    expect(w.enemyCount).toBe(1); // toujours aucune horde, rien que lui
    expect(w.merchant.active).toBe(false);
  });

  it('a 1.67 save still on its victory sheet resumes as before, and keeps its victory', () => {
    // décision 15 : une partie gardée par la 1.67 sur la feuille de victoire (monde 3, Mode.Won, pas de `cleared`)
    const w = world3(32);
    w.mode = Mode.Won;
    const snap = JSON.parse(JSON.stringify(snapshotWorld(w))) as RunSnap;
    delete snap.fields.cleared; // champ inconnu de la 1.67
    const back = restoreWorld(snap);
    expect(back.cleared).toBe(false);
    adoptCleared(back);
    expect(back.cleared).toBe(true);
    startEndless(back); // comme avant : le monde infini sur la carte du monde 3, sans corrompus
    expect([back.stage, back.endless, back.endlessCorrupt]).toEqual([2, true, false]);
    expect(back.seed).toBe(stageSeed(back.startSeed, 2));
    // le défi du jour, lui, ne gagne jamais le monde 3
    const d = new World(5, { daily: true });
    d.mode = Mode.Won;
    adoptCleared(d);
    expect(d.cleared).toBe(false);
  });
});

describe('les quatre phases (décisions 3 à 8)', () => {
  it('The final boss has four phases', () => {
    const { w, h } = arena(41);
    expect(w.finalPhase).toBe(1);
    expect(h.max).toBeGreaterThan(0);
    // un coup énorme s'arrête au seuil : 70 %, puis les sceaux (bannière, son, pause)
    strike(w, h, 1e12);
    expect(h.hp / h.max).toBeCloseTo(FINAL.phases[0], 9);
    expect(run(w, STEP * 2, Ev.FinalPhase)).toBe(1);
    expect(w.finalPhase).toBe(2);
    expect(w.finalPause).toBeGreaterThan(0);
    expect(ofRole(w, Role.Seal)).toHaveLength(FINAL.seal.n);
    run(w, FINAL.pause + 0.1);
    // les sceaux brisés : 40 %, l'éclipse
    let phase = 0;
    for (const s of ofRole(w, Role.Seal)) strike(w, s, 1e12);
    expect(h.hp / h.max).toBeCloseTo(FINAL.phases[1], 9);
    for (let f = 0; f < 3; f++) {
      step(w, still, STEP);
      for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.FinalPhase) phase = w.events[i].v;
    }
    expect(phase).toBe(3);
    run(w, FINAL.pause + 0.1);
    // sous 15 % : la fureur
    strike(w, h, 1e12);
    expect(h.hp / h.max).toBeCloseTo(FINAL.phases[2], 9);
    for (let f = 0; f < 3; f++) {
      step(w, still, STEP);
      for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.FinalPhase) phase = w.events[i].v;
    }
    expect(phase).toBe(4);
    expect(ofRole(w, Role.Decoy)).toHaveLength(0); // les doubles disparaissent
    run(w, FINAL.pause + 0.1);
    // puis il tombe : la victoire totale
    expect(strike(w, h, 1e12)).toBe(true);
    expect(w.finalPhase).toBe(FINAL_DONE);
    expect(w.mode).toBe(Mode.Won);
  });

  it('pauses between phases, attacks announced, the loop of the three bosses', () => {
    const { w, h } = arena(42);
    // phase 1 : la boucle charge → salve → cercles, chacune annoncée (couloir, gonflement, cercles au sol)
    const seen = new Set<string>();
    w.player.x = w.player.px = 0;
    w.player.z = w.player.pz = 8;
    for (let f = 0; f < 60 * 20; f++) {
      step(w, still, STEP);
      if (h.state === 1) seen.add(h.combo === 0 ? 'charge' : 'salve');
      for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.Telegraph) seen.add('cercles');
      for (let i = 0; i < w.shotCount; i++) if (w.shots[i].kind === ShotKind.Spit && w.shots[i].boss) seen.add('tirs');
    }
    expect([...seen].sort()).toEqual(['cercles', 'charge', 'salve', 'tirs']);
    expect(FINAL.charge.telegraph).toBeGreaterThanOrEqual(0.6);
    expect(FINAL.judge.telegraph).toBeGreaterThanOrEqual(1.5);
    expect(FINAL.ring.warn).toBeGreaterThanOrEqual(0.7);
    expect(FINAL.pause).toBeGreaterThanOrEqual(1.4);
    // pas de rage au temps : sa fureur est la phase 4
    expect(h.enraged).toBe(false);
    // la pause : immobile et invulnérable
    strike(w, h, 1e12);
    run(w, STEP * 2);
    const x = h.x,
      z = h.z,
      hp = h.hp;
    run(w, FINAL.pause * 0.8);
    expect([h.x, h.z]).toEqual([x, z]);
    strike(w, h, 1e6);
    expect(h.hp).toBe(hp);
  });

  it('The seals protect the final boss', () => {
    const { w, h } = arena(43);
    toPhase(w, h, 2);
    const seals = ofRole(w, Role.Seal);
    expect(seals).toHaveLength(FINAL.seal.n);
    expect(w.seals).toBe(FINAL.seal.n);
    // chaque sceau : une stèle immobile, au sol, loin du centre
    for (const s of seals) expect(Math.hypot(s.x, s.z)).toBeCloseTo(FINAL.seal.dist, 6);
    // tant qu'un sceau tient : aucun dégât, un retour « bloqué » (pas de chiffre : pas d'Ev.Hit)
    const hp = h.hp;
    w.clearEvents();
    strike(w, h, 1e6);
    expect(h.hp).toBe(hp);
    expect(count(w, Ev.Blocked)).toBe(1);
    expect(count(w, Ev.Hit)).toBe(0);
    // les renforts corrompus arrivent par petits groupes, au bord du cercle
    run(w, FINAL.adds.first + 0.2);
    const adds = [];
    for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].role === Role.None && w.enemies[i].alive) adds.push(w.enemies[i]);
    expect(adds.length).toBe(FINAL.adds.n);
    for (const a of adds) expect(a.corrupt).toBe(1);
    // trois sceaux brisés : chacun emporte sa part, toujours invulnérable ; un sceau brisé n'est pas un kill
    const kills = w.kills;
    for (let k = 0; k < 3; k++) {
      strike(w, seals[k], 1e12);
      expect(h.hp / h.max).toBeCloseTo(FINAL.phases[0] - (k + 1) * FINAL.seal.drain, 6);
      const before = h.hp;
      strike(w, h, 1e6);
      expect(h.hp).toBe(before);
    }
    expect(w.kills).toBe(kills);
    expect(w.seals).toBe(1);
    // le dernier : vulnérable (après la pause de l'éclipse)
    strike(w, seals[3], 1e12);
    expect(w.seals).toBe(0);
    run(w, STEP * 2);
    expect(w.finalPhase).toBe(3);
    run(w, FINAL.pause + 0.1);
    const before = h.hp;
    strike(w, h, 10);
    expect(h.hp).toBeLessThan(before);
  });

  it('Only the real boss takes damage during the eclipse', () => {
    const { w, h } = arena(44);
    toPhase(w, h, 3);
    const decoys = ofRole(w, Role.Decoy);
    expect(decoys).toHaveLength(FINAL.decoy.n);
    // le joueur touche un double : le boss ne perd aucun PV ; trois coups et le double part en fumée
    const hp = h.hp;
    const d = decoys[0];
    w.clearEvents();
    strike(w, d, 1e9);
    strike(w, d, 1e9);
    expect(d.alive).toBe(true);
    strike(w, d, 1e9);
    expect(h.hp).toBe(hp);
    expect(count(w, Ev.Blocked)).toBe(3);
    expect(count(w, Ev.Decoy)).toBe(1);
    expect(d.alive).toBe(false);
    run(w, STEP);
    expect(ofRole(w, Role.Decoy)).toHaveLength(FINAL.decoy.n - 1);
    // il revient FINAL.decoy.back s plus tard
    run(w, FINAL.decoy.back + 0.2);
    expect(ofRole(w, Role.Decoy)).toHaveLength(FINAL.decoy.n);
    // le cercle de flammes se resserre, annoncé, sans passer sous son rayon minimal
    const radii: number[] = [w.arenaR];
    let warned = 0;
    for (let f = 0; f < 60 * 60; f++) {
      const r0 = w.arenaR;
      step(w, still, STEP);
      warned += count(w, Ev.RingWarn);
      if (w.arenaR !== r0) {
        radii.push(w.arenaR);
        expect(warned).toBe(radii.length - 1); // chaque pas a eu son annonce
      }
    }
    for (let k = 1; k < radii.length; k++) expect(radii[k]).toBeLessThan(radii[k - 1]);
    expect(radii.at(-1)).toBe(FINAL.ring.min);
    expect(Math.min(...radii)).toBeGreaterThanOrEqual(FINAL.ring.min);
    // le héros tenu au bord : il brûle (le temps figé : rien d'autre ne le touche)
    w.powerT[Pw.Gel] = 10;
    w.player.x = w.player.px = 0;
    w.player.z = w.player.pz = 50;
    const hp0 = w.player.hp;
    run(w, 0.5);
    expect(Math.hypot(w.player.x, w.player.z)).toBeLessThanOrEqual(w.arenaR - PLAYER.radius + 1e-9);
    expect(w.player.hp).toBeLessThan(hp0);
    expect(w.lastHurt).toBe(HurtSrc.Flames);
  });

  it('The Judgement always leaves a reachable safe zone', () => {
    for (const ch of CHARACTERS) {
      const { w, h } = arena(51, ch.key as CharacterKey);
      toPhase(w, h, 4);
      h.max = h.hp = 1e15; // il ne tombe pas pendant la mesure
      let announced = 0;
      for (let f = 0; f < 60 * 40 && announced < 3; f++) {
        // le héros va n'importe où dans le cercle, au bord compris
        const a = f * 0.37;
        w.player.x = w.player.px = Math.sin(a) * (w.arenaR - 1) * ((f % 7) / 6);
        w.player.z = w.player.pz = Math.cos(a) * (w.arenaR - 1) * ((f % 7) / 6);
        w.player.hp = w.player.maxHp; // le Jugement le touche souvent : il ne doit pas tomber pendant la mesure
        step(w, still, STEP);
        for (let i = 0; i < w.eventCount; i++) {
          const e = w.events[i];
          if (e.type !== Ev.Judgement || e.x2 !== 0) continue;
          announced++;
          // annoncé 1,5 s avant l'impact, à une distance que le héros parcourt à temps, dans le cercle
          expect(e.y2).toBeCloseTo(FINAL.judge.telegraph, 9);
          const P = w.player,
            gap = Math.hypot(e.x - P.x, e.z - P.z) - FINAL.judge.r;
          expect(gap, ch.key).toBeLessThanOrEqual(P.speed * FINAL.judge.telegraph * 0.75);
          expect(Math.hypot(e.x, e.z) + FINAL.judge.r).toBeLessThanOrEqual(w.arenaR + 1e-9);
          expect(Math.hypot(e.x - P.x, e.z - P.z)).toBeGreaterThan(FINAL.judge.r); // loin de lui : il faut courir
        }
      }
      expect(announced, ch.key).toBe(3);
    }
    // à la course : le héros qui y court n'en prend rien ; celui qui reste hors de la zone, une grosse part
    for (const stay of [false, true]) {
      const { w, h } = arena(52);
      toPhase(w, h, 4);
      h.max = h.hp = 1e15;
      w.player.maxHp = w.player.hp = 400;
      w.player.regen = 0;
      w.powerT[Pw.Gel] = 60; // le temps figé : seul le Jugement touche le héros (le boss et ses tirs sont arrêtés)
      for (let f = 0; f < 60 * 20 && w.judgeT <= 0; f++) step(w, still, STEP);
      expect(w.judgeT).toBeGreaterThan(0);
      const zx = w.judgeX,
        zz = w.judgeZ;
      const hp = w.player.hp;
      let hurt = 0;
      for (let f = 0; f < 200 && w.judgeT > 0; f++) {
        const dx = zx - w.player.x,
          dz = zz - w.player.z,
          l = Math.hypot(dx, dz) || 1;
        step(w, stay ? still : { ...still, mx: dx / l, mz: dz / l }, STEP);
        for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.PlayerHurt && w.lastHurt === HurtSrc.Judgement) hurt++;
      }
      if (stay) {
        expect(hurt).toBe(1);
        expect(hp - w.player.hp).toBeGreaterThanOrEqual(FINAL.judge.frac * 400 * 0.99 * w.player.taken);
        expect(w.player.hp).toBeGreaterThan(0); // pas la mort à coup sûr
      } else expect(hurt).toBe(0);
    }
    expect(judgeDist(new World(1))).toBeGreaterThan(FINAL.judge.r);
  });
});

describe('fin de partie dans l’Arène (décisions 9 à 11)', () => {
  it('Dying in the Arena keeps the world 3 victory', () => {
    const { w, h } = arena(61);
    toPhase(w, h, 2);
    const t0 = w.goldBonusT;
    expect(w.cleared).toBe(true);
    w.player.hp = -1e12;
    w.player.revives = 0;
    const gold = w.gold;
    step(w, still, STEP);
    expect(w.mode).toBe(Mode.Dead);
    expect(w.cleared).toBe(true); // le monde 3 reste vaincu
    expect(w.finalPhase).toBe(2); // la phase atteinte (écran de fin)
    // le bonus d'or de fin ne repaie que le temps passé depuis le monde 3
    expect(w.gold - gold).toBeCloseTo((w.t - t0) * GOLD.perSecond * w.player.goldMul, 6);
  });

  it('Beating the Heart of the Night opens the corrupted endless world', () => {
    const { w, h } = arena(71);
    toPhase(w, h, 4);
    const gold = w.gold,
      t0 = w.goldBonusT;
    w.clearEvents();
    expect(strike(w, h, 1e12)).toBe(true);
    // la victoire totale : la feuille de victoire (Mode.Won), le bonus d'or de fin et FINAL.gold
    expect(w.mode).toBe(Mode.Won);
    expect(count(w, Ev.Victory)).toBe(1);
    expect(w.finalPhase).toBe(FINAL_DONE);
    expect(w.gold - gold).toBeGreaterThanOrEqual(((w.t - t0) * GOLD.perSecond + FINAL.gold) * w.player.goldMul - 1e-6);
    // des tirs de l'Arène en vol, un renfort vivant : rien ne passe dans le monde infini
    const s = w.allocShot()!;
    s.kind = ShotKind.Zone;
    s.life = s.t0 = 1;
    spawnEnemy(w, 0, 0, 3);
    startEndless(w);
    expect(w.endless).toBe(true);
    expect(w.stage).toBe(STAGE.count - 1);
    expect(w.seed).toBe(stageSeed(w.startSeed, STAGE.count - 1));
    expect([w.shotCount, w.enemyCount]).toEqual([0, 0]);
    expect(w.mode).toBe(Mode.Play);
    // des corrompus, avec la même montée que la prolongation : 10 % au départ, 40 % à +3 min
    expect(corruptOn(w)).toBe(true);
    const share = (t: number): number => {
      w.endlessT = t;
      let n = 0;
      for (let k = 0; k < 4000; k++) {
        const i = spawnEnemy(w, 0, k, 20);
        maybeCorrupt(w, i);
        if (w.enemies[i].corrupt === 1) n++;
        w.freeEnemy(i);
      }
      return n / 4000;
    };
    expect(share(0)).toBeCloseTo(CORRUPT.share0, 1);
    expect(share(180)).toBeCloseTo(CORRUPT.share1, 1);
    expect(share(600)).toBeCloseTo(CORRUPT.share1, 1);
    // le monde infini du défi du jour n'en a pas
    const d = new World(5, { daily: true });
    d.mode = Mode.Won;
    startEndless(d);
    expect(corruptOn(d)).toBe(false);
  });
});

describe('reprise d’une partie dans l’Arène (décision 15)', () => {
  it('a run saved in the Arena resumes in the right phase, identical', () => {
    for (const p of [1, 2, 3, 4]) {
      const { w, h } = arena(80 + p);
      w.weapons = { orbe: 3 };
      toPhase(w, h, p);
      run(w, 1.3, undefined, { ...still, mx: 0.4, mz: -0.3 });
      const b = restoreWorld(JSON.parse(JSON.stringify(snapshotWorld(w))) as RunSnap);
      expect(b.stage).toBe(ARENA);
      expect(b.seed).toBe(ARENA_SEED);
      expect(b.finalPhase).toBe(p);
      expect(b.obstacles.length).toBe(0);
      for (let f = 0; f < 240; f++) {
        const inp = { ...still, mx: Math.sin(f / 30), mz: Math.cos(f / 40) };
        step(w, inp, STEP);
        step(b, { ...inp }, STEP);
      }
      expect(JSON.stringify(snapshotWorld(b))).toBe(JSON.stringify(snapshotWorld(w)));
    }
  });

  it('the Arena is deterministic and allocates no new pool slot per step', () => {
    const play = (): number[] => {
      const w = world3(90);
      w.weapons = { orbe: 1, aura: 1 };
      enterArena(w);
      summonHeart(w);
      run(w, 20, undefined, { ...still, mx: 0.5, mz: 0.2 });
      return [w.t, w.player.x, w.player.z, w.enemyCount, w.shotCount, w.finalPhase, w.rng.next()];
    };
    expect(play()).toEqual(play());
    // le premier boss du totem (monde 1) ne déclenche jamais l'Arène
    const w = new World(91);
    startRun(w);
    summonStageBoss(w);
    hitEnemy(w, w.bossIndex, 1e12, 0, 0, 0);
    expect([w.cleared, w.stage]).toEqual([false, 0]);
  });
});
