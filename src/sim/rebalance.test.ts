// Phase 43 (grand rééquilibrage, demande de Jimmy) : plafonds de niveau, XP tardive, récompenses du monde infini,
// marchand qui s'en va, nouvelles attaques des boss, rage.
import { describe, expect, it } from 'vitest';
import {
  BOSS,
  BOSS_TYPE,
  CHEST,
  CHOICE,
  COLOSSUS_TYPE,
  ENDLESS,
  ENEMIES,
  HAZARDS,
  LEVEL_MAX,
  SPAWN,
  STAGE,
  STEP,
  SWARM_TYPE,
  TOME_KEYS,
  VOLANT_TYPE,
  XP,
} from './balance';
import { hitEnemy } from './combat';
import { applyCard, rollChoices } from './progression';
import { spawnEnemy } from './spawner';
import { nextStage, startEndless } from './stages';
import { startRun, step } from './step';
import { Ev, Mode, ShotKind } from './types';
import type { Enemy, Input } from './types';
import { WEAPON_KEYS } from './weapons/defs';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
const count = (w: World, t: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === t) n++;
  return n;
};
const shots = (w: World, kind: ShotKind) => {
  const out = [];
  for (let i = 0; i < w.shotCount; i++) if (w.shots[i].alive && w.shots[i].kind === kind) out.push(w.shots[i]);
  return out;
};
/** Avance `s` secondes ; renvoie le nombre d'événements `ev`. */
function run(w: World, s: number, ev?: Ev, input: Input = still): number {
  let n = 0;
  for (let f = 0; f < Math.round(s / STEP); f++) {
    step(w, input, STEP);
    if (ev !== undefined) n += count(w, ev);
  }
  return n;
}
/** Arène : joueur invincible, ni horde, ni éruption, ni marchand, ni boss de survie ; un boss posé à `dist` u. */
function arena(seed: number, type: number, dist: number): { w: World; e: Enemy } {
  const w = new World(seed);
  startRun(w);
  w.player.maxHp = w.player.hp = 1e9;
  w.player.need = 1e9;
  w.nextWave = w.nextElite = w.nextEruption = 1e9;
  w.merchant.next = 99;
  w.survivalNext = 99;
  for (let i = 0; i < w.enemyCount; i++) w.enemies[i].alive = false; // la horde de départ
  step(w, still, STEP);
  const i = spawnEnemy(w, type, 0, dist);
  const e = w.enemies[i];
  e.hp = e.max = 1e12;
  e.huntT = 1e9; // pas de Traque (phase 45) : chaque test observe une attaque à la fois
  return { w, e };
}

describe('montée plus longue (phase 43)', () => {
  it('XP : rien ne change avant le niveau 30, puis chaque niveau coûte de plus en plus', () => {
    const before = (lv: number) => Math.floor((5 + lv * 2 + lv * lv * 0.15) * 0.45);
    for (let lv = 1; lv <= XP.lateFrom; lv++) expect(XP.needFor(lv)).toBe(before(lv));
    for (let lv = XP.lateFrom + 1; lv <= 120; lv++) {
      expect(XP.needFor(lv)).toBeGreaterThanOrEqual(before(lv)); // le surcoût des tout premiers niveaux disparaît à l'arrondi
      if (lv >= XP.lateFrom + 4) expect(XP.needFor(lv)).toBeGreaterThan(before(lv));
      expect(XP.needFor(lv)).toBeGreaterThan(XP.needFor(lv - 1));
    }
    expect(XP.needFor(60) / before(60)).toBeGreaterThan(1.3);
  });
  it(`une arme ou un tome au niveau ${LEVEL_MAX.weapon} n'est plus proposé ; tout au plafond : un soin partiel`, () => {
    const w = new World(3);
    w.weapons = { orbe: LEVEL_MAX.weapon };
    for (let n = 0; n < 50; n++) {
      rollChoices(w);
      expect(w.cards.some((c) => c.kind === 'w' && c.key === 'orbe')).toBe(false);
    }
    w.maxWeapons = 1;
    w.maxTomes = TOME_KEYS.length;
    for (const k of TOME_KEYS) w.tomes[k] = LEVEL_MAX.tome;
    rollChoices(w);
    expect(w.cards.map((c) => c.kind)).toEqual(['heal']);
    w.player.maxHp = 200;
    w.player.hp = 10;
    w.pending = 1;
    w.mode = Mode.LevelUp;
    applyCard(w, 0);
    expect(w.player.hp).toBeCloseTo(10 + 200 * CHOICE.healFrac, 9);
    expect(WEAPON_KEYS.length).toBeGreaterThan(0);
  });
});

describe('monde infini resserré (phase 43)', () => {
  function endless(seed: number): World {
    const w = new World(seed);
    w.player.maxHp = w.player.hp = 1e9;
    w.player.need = 1e9;
    w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.merchant.next = 99;
    w.survivalNext = 99;
    nextStage(w);
    nextStage(w);
    w.player.hp = w.player.maxHp = 1e9;
    w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.player.x = w.player.px = w.totem.x;
    w.player.z = w.player.pz = w.totem.z;
    w.player.gPrev = w.heightAt(w.totem.x, w.totem.z);
    run(w, STAGE.totemCharge + 0.2);
    hitEnemy(w, w.bossIndex, 1e12, 0, 0, 0);
    expect(w.mode).toBe(Mode.Won);
    startEndless(w);
    return w;
  }
  const bosses = (w: World) => {
    const out: number[] = [];
    for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].alive && ENEMIES[w.enemies[i].type].boss) out.push(i);
    return out;
  };
  it('un boss tué rend une part des PV, pas tout ; un seul coffre par vague, laissé par le dernier boss', () => {
    const w = endless(41);
    for (let k = 0; k < 3; k++) {
      w.endlessT = w.nextEndlessBoss - 0.05;
      run(w, 0.1);
    }
    expect(bosses(w).length).toBe(1 + 1 + 2);
    step(w, still, STEP);
    const chests0 = w.chestCount;
    w.player.maxHp = 1000;
    w.player.hp = 100;
    let alive = bosses(w);
    while (alive.length > 1) {
      const hp = w.player.hp;
      hitEnemy(w, alive[0], 1e12, 0, 0, 0);
      expect(w.player.hp).toBeCloseTo(Math.min(1000, hp + 1000 * ENDLESS.healFrac), 6);
      expect(w.chestCount, 'pas de coffre tant qu’un boss reste').toBe(chests0);
      w.player.hp = 100;
      step(w, still, STEP);
      w.player.hp = 100;
      alive = bosses(w);
    }
    hitEnemy(w, alive[0], 1e12, 0, 0, 0);
    expect(w.chestCount).toBe(chests0 + 1);
    const c = w.chests[w.chestCount - 1];
    expect(c.boss).toBe(true);
    expect(c.picks).toBe(ENDLESS.chestPicks);
    expect(ENDLESS.chestPicks).toBeLessThan(CHEST.bossPicks);
  });
  it(`le marchand passe ${ENDLESS.merchantVisits} fois, annonce son dernier passage, puis ne revient plus`, () => {
    const w = endless(42);
    w.merchant.active = false;
    let arrivals = 0,
      last = 0;
    for (let k = 0; k < 8; k++) {
      w.endlessT = ENDLESS.merchantAt + k * ENDLESS.period - 0.05;
      for (let f = 0; f < 12; f++) {
        step(w, still, STEP);
        arrivals += count(w, Ev.MerchantArrive);
        last += count(w, Ev.MerchantLast);
      }
      w.merchant.active = false; // reparti
    }
    expect(arrivals).toBe(ENDLESS.merchantVisits);
    expect(last).toBe(1);
  });
  it('les PV de tous les boss sont relevés (BOSS.hpMul)', () => {
    const w = new World(43);
    w.player.maxHp = w.player.hp = 1e9;
    w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.survivalNext = 99;
    w.player.x = w.player.px = w.totem.x;
    w.player.z = w.player.pz = w.totem.z;
    w.player.gPrev = w.heightAt(w.totem.x, w.totem.z);
    run(w, STAGE.totemCharge + 0.2);
    const e = w.enemies[w.bossIndex];
    expect(e.max).toBeCloseTo(ENEMIES[STAGE.bosses[0]].hp * BOSS.hpMul[0] * SPAWN.hpScale(STAGE.bossHpAt[0]), 6);
  });
});

describe('nouvelles attaques des boss (phase 43)', () => {
  it('Gardien, Éclats : sa charge finit sur une étoile de projectiles au sol (plus de cercles derrière lui)', () => {
    for (const phase2 of [false, true]) {
      const { w, e } = arena(51, BOSS_TYPE, 9);
      e.aim = 1e9; // pas d'onde : on observe la charge
      if (phase2) e.hp = e.max * 0.4;
      e.timer = 0;
      const tele = run(w, BOSS.chargeTelegraph + BOSS.chargeTime + 0.05, Ev.Telegraph);
      expect(tele).toBe(0); // le Sillage de la phase 43 est retiré
      const spits = shots(w, ShotKind.Spit);
      expect(spits.length).toBe(phase2 ? BOSS.burst.n2 : BOSS.burst.n);
      // en étoile : tous à la même vitesse, dans des directions distinctes
      const dirs = new Set(spits.map((s) => Math.round(Math.atan2(s.vx, s.vz) * 100)));
      expect(dirs.size).toBe(spits.length);
      for (const s of spits) expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(BOSS.burst.speed, 6);
    }
  });
  it('Gardien, phase 2 : double onde (la seconde suit de BOSS.ring2 s) ; une seule en phase 1', () => {
    for (const phase2 of [false, true]) {
      const { w, e } = arena(52, BOSS_TYPE, 9);
      e.spd = 0;
      e.timer = 1e9; // pas de charge
      if (phase2) e.hp = e.max * 0.4;
      e.aim = 0.01;
      const rings = run(w, BOSS.ring2 + 0.3, Ev.Ring);
      expect(rings).toBe(phase2 ? 2 : 1);
    }
  });
  it('Gardien : la seconde onde ne part jamais pendant la charge (elle attend la fin)', () => {
    const { w, e } = arena(60, BOSS_TYPE, 9);
    e.hp = e.max * 0.4; // phase 2
    e.aim = 1e9;
    e.state = 2; // en pleine charge
    e.timer = BOSS.chargeTime;
    e.tx = 0;
    e.tz = 1;
    e.t2 = 0.05; // seconde onde en attente
    let during = 0;
    for (let f = 0; f < Math.round((BOSS.chargeTime - 0.1) / STEP); f++) {
      step(w, still, STEP);
      if (e.state === 2) during += count(w, Ev.Ring);
    }
    expect(during).toBe(0);
    expect(run(w, 0.5, Ev.Ring)).toBe(1); // charge finie : elle part
  });
  it('Essaim-mère, Salve : elle gonfle puis crache un éventail vers le joueur ; plus large en phase 2, avec des Volants', () => {
    for (const phase2 of [false, true]) {
      const { w, e } = arena(53, SWARM_TYPE, 10);
      e.spd = 0;
      e.timer = 1e9; // pas de ponte
      if (phase2) e.hp = e.max * 0.4;
      e.t2 = 0.01;
      expect(run(w, 0.1, Ev.BossRoar), 'annonce').toBe(1);
      expect(e.state).toBe(1);
      expect(shots(w, ShotKind.Spit).length).toBe(0);
      run(w, BOSS.volley.windup);
      const fan = shots(w, ShotKind.Spit);
      expect(fan.length).toBe(phase2 ? BOSS.volley.n2 : BOSS.volley.n);
      // l'éventail est centré sur la direction du joueur
      const P = w.player;
      const ux = (P.x - e.x) / Math.hypot(P.x - e.x, P.z - e.z),
        uz = (P.z - e.z) / Math.hypot(P.x - e.x, P.z - e.z);
      const mid = fan[(fan.length - 1) / 2];
      expect((mid.vx * ux + mid.vz * uz) / BOSS.volley.speed).toBeCloseTo(1, 2);
      for (const s of fan) expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(BOSS.volley.speed, 6);
      // ponte : des Volants seulement en phase 2
      e.timer = 0.01;
      run(w, 0.1);
      let flyers = 0;
      for (let i = 0; i < w.enemyCount; i++) if (w.enemies[i].alive && w.enemies[i].type === VOLANT_TYPE) flyers++;
      expect(flyers).toBe(phase2 ? BOSS.swarmFlyers2 : 0);
    }
  });
  it('Essaim-mère : pas de salve si le joueur est hors de portée', () => {
    const { w, e } = arena(54, SWARM_TYPE, BOSS.volley.range + 6);
    e.spd = 0;
    e.timer = 1e9;
    e.t2 = 0.01;
    run(w, 2);
    expect(shots(w, ShotKind.Spit).length).toBe(0);
  });
  it('Colosse, onde de choc : seulement si le joueur est collé à lui, après un cercle d’annonce', () => {
    const far = arena(55, COLOSSUS_TYPE, BOSS.quake.range + 5);
    far.e.spd = 0;
    far.e.timer = 1e9;
    far.e.t2 = 0.01;
    expect(run(far.w, 3, Ev.Ring)).toBe(0);
    const { w, e } = arena(55, COLOSSUS_TYPE, BOSS.quake.range - 2);
    e.spd = 0;
    e.timer = 1e9; // pas de cercles
    e.t2 = 0.01;
    expect(run(w, 0.1, Ev.Telegraph)).toBe(1);
    expect(count(w, Ev.Ring)).toBe(0);
    // le cercle d'annonce est un tir Zone sans dégâts, de la durée du gonflement (dessiné par le rendu)
    const warn = shots(w, ShotKind.Zone);
    expect(warn.length).toBe(1);
    expect(warn[0].dmg).toBe(0);
    expect(warn[0].r).toBe(BOSS.quake.r);
    expect(warn[0].t0).toBe(BOSS.quake.windup);
    expect(run(w, BOSS.quake.windup, Ev.Ring)).toBe(1);
    expect(shots(w, ShotKind.Ring).length).toBe(1);
    // la suivante attend BOSS.quake.period
    expect(run(w, BOSS.quake.period - BOSS.quake.windup - 0.5, Ev.Ring)).toBe(0);
  });
  it('Colosse, phase 2 : une attaque sur deux dessine une croix centrée sur le joueur', () => {
    const { w, e } = arena(56, COLOSSUS_TYPE, 14);
    e.spd = 0;
    e.t2 = 1e9; // pas d'onde
    e.hp = e.max * 0.4;
    e.timer = 0.01;
    const first = run(w, 0.1, Ev.Telegraph);
    e.timer = 0.01;
    const second = run(w, 0.1, Ev.Telegraph);
    const cross = 1 + 4 * BOSS.cross.arm;
    expect([first, second].sort((a, b) => a - b)).toEqual([BOSS.zoneN2, cross].sort((a, b) => a - b));
    // la croix : un cercle sous le joueur, les autres à des multiples de `step`
    const P = w.player;
    const d = shots(w, ShotKind.Zone).map((z) => Math.hypot(z.x - P.x, z.z - P.z) / BOSS.cross.step);
    expect(d.filter((v) => Math.abs(v - Math.round(v)) < 1e-6).length).toBeGreaterThanOrEqual(cross);
  });
  it(`rage : après ${BOSS.enrage.after} s en vie, une seule annonce, puis le boss avance et attaque plus vite`, () => {
    const { w, e } = arena(57, COLOSSUS_TYPE, 40);
    w.totemBossId = e.id; // la rage est réservée aux boss du totem et du monde infini
    e.t2 = 1e9;
    e.timer = 1e9;
    e.age = BOSS.enrage.after - 0.05;
    expect(e.enraged).toBe(false);
    expect(run(w, 0.2, Ev.BossEnrage)).toBe(1);
    expect(e.enraged).toBe(true);
    expect(run(w, 1, Ev.BossEnrage)).toBe(0);
    // recharge d'attaque ×haste
    e.timer = 1;
    run(w, 1 / BOSS.enrage.haste + 0.05, Ev.Telegraph);
    expect(e.timer).toBeGreaterThan(1); // l'attaque est partie, minuteur rechargé
    // vitesse ×speed, comparée à un Colosse calme parti du même point
    const calm = arena(57, COLOSSUS_TYPE, 40);
    calm.e.t2 = calm.e.timer = 1e9;
    const hot = arena(57, COLOSSUS_TYPE, 40);
    hot.e.t2 = hot.e.timer = 1e9;
    hot.w.totemBossId = hot.e.id;
    hot.e.age = BOSS.enrage.after;
    const d0 = Math.hypot(calm.e.x - calm.w.player.x, calm.e.z - calm.w.player.z);
    run(calm.w, 2);
    run(hot.w, 2);
    const walked = (a: { w: World; e: Enemy }) => d0 - Math.hypot(a.e.x - a.w.player.x, a.e.z - a.w.player.z);
    expect(walked(hot) / walked(calm)).toBeCloseTo(BOSS.enrage.speed, 1);
    expect(HAZARDS.ring.maxR).toBeGreaterThan(BOSS.quake.range); // l'onde atteint bien le joueur qui l'a déclenchée
  });
  it('un boss de survie n’enrage jamais (il est fait pour durer)', () => {
    const { w, e } = arena(59, SWARM_TYPE, 30);
    e.t2 = e.timer = 1e9;
    e.age = BOSS.enrage.after * 3;
    expect(w.totemBossId).not.toBe(e.id);
    expect(run(w, 1, Ev.BossEnrage)).toBe(0);
    expect(e.enraged).toBe(false);
  });
  it('déterministe : deux combats identiques contre chaque boss', () => {
    for (const type of [BOSS_TYPE, SWARM_TYPE, COLOSSUS_TYPE]) {
      const play = () => {
        const { w, e } = arena(58, type, 8);
        e.hp = e.max * 0.4; // phase 2 : toutes les attaques
        run(w, 12, undefined, { ...still, mx: 0.7, mz: -0.3 });
        return [w.t, w.shotCount, w.enemyCount, e.x, e.z, e.timer, e.t2, w.rng.next()];
      };
      expect(play()).toEqual(play());
    }
  });
});

describe('Traque : des cercles sous les pieds du joueur (phase 45)', () => {
  /** Boss immobile, toutes ses autres attaques coupées, première salve tout de suite. */
  const hunter = (seed: number, type: number) => {
    const a = arena(seed, type, 12);
    a.e.spd = 0;
    a.e.timer = a.e.aim = a.e.t2 = 1e9;
    a.e.huntT = STEP / 2;
    a.w.totemBossId = a.e.id; // boss du totem : salve entière
    return a;
  };
  it('chaque boss lance une salve de `n` cercles (`n2` en phase 2), un tous les `every` s, puis attend `period`', () => {
    for (const type of [BOSS_TYPE, SWARM_TYPE, COLOSSUS_TYPE])
      for (const phase2 of [false, true]) {
        const H = BOSS.hunt[type];
        const { w, e } = hunter(61, type);
        e.timer = e.aim = e.t2 = 1e9;
        if (phase2) e.hp = e.max * 0.4;
        const n = phase2 ? H.n2 : H.n;
        expect(run(w, STEP, Ev.Telegraph)).toBe(1);
        expect(run(w, (n - 1) * H.every + 0.1, Ev.Telegraph)).toBe(n - 1);
        // la salve est finie : plus rien avant `period`
        expect(run(w, H.period - 0.3, Ev.Telegraph)).toBe(0);
        expect(run(w, 0.4, Ev.Telegraph)).toBe(1);
      }
  });
  it('boss de survie : salve réduite (BOSS.huntSurvival) ; en monde infini, salve entière', () => {
    const H = BOSS.hunt[SWARM_TYPE];
    for (const kind of ['survie', 'infini'] as const) {
      const { w } = hunter(65, SWARM_TYPE);
      w.totemBossId = -1;
      if (kind === 'infini') w.endless = true;
      const n = run(w, H.n * H.every + 0.2, Ev.Telegraph);
      expect(n).toBe(kind === 'infini' ? H.n : Math.round(H.n * BOSS.huntSurvival));
    }
  });
  it('les cercles tombent sous les pieds du joueur et explosent après leur annonce', () => {
    const H = BOSS.hunt[BOSS_TYPE];
    const { w } = hunter(62, BOSS_TYPE);
    run(w, STEP);
    const [z] = shots(w, ShotKind.Zone);
    expect(z.r).toBe(H.r);
    expect(Math.hypot(z.x - w.player.x, z.z - w.player.z)).toBeLessThan(0.01);
    expect(H.telegraph).toBeGreaterThanOrEqual(0.7); // game-feel §9 : une fenêtre de saut lisible
    w.player.maxHp = w.player.hp = 100;
    const hurt = run(w, H.telegraph + 0.05, Ev.PlayerHurt);
    expect(hurt).toBe(1);
    expect(w.player.hp).toBeLessThan(100);
  });
  it('un cercle sur deux vise en avance : courir tout droit ne suffit pas', () => {
    const H = BOSS.hunt[BOSS_TYPE];
    const { w, e } = hunter(63, BOSS_TYPE);
    e.huntT = 1e9;
    const east: Input = { ...still, mx: 1 };
    run(w, 0.5, undefined, east); // le joueur court déjà
    e.huntT = STEP / 2;
    const ahead: number[] = [];
    for (let f = 0; f < Math.round((H.n * H.every) / STEP); f++) {
      step(w, east, STEP);
      for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === Ev.Telegraph) ahead.push(w.events[i].x - w.player.x);
    }
    expect(ahead.length).toBe(H.n);
    // posés en alternance : sous les pieds (0), puis en avant du joueur (> 1 u)
    expect(ahead.filter((d) => d > 1).length).toBe(Math.floor(H.n / 2));
    expect(ahead.filter((d) => Math.abs(d) < 0.01).length).toBe(Math.ceil(H.n / 2));
  });
  it('le joueur qui change de direction pendant la salve en sort indemne ; celui qui reste immobile est touché', () => {
    const H = BOSS.hunt[COLOSSUS_TYPE];
    for (const dodge of [false, true]) {
      const { w, e } = hunter(64, COLOSSUS_TYPE);
      e.timer = e.aim = e.t2 = 1e9;
      w.player.maxHp = w.player.hp = 1000;
      let hurt = 0;
      const frames = Math.round((H.n * H.every + H.telegraph + 0.2) / STEP);
      for (let f = 0; f < frames; f++) {
        // esquive : un zigzag, demi-tour toutes les 0,6 s
        const input: Input = dodge ? { ...still, mx: Math.floor((f * STEP) / 0.6) % 2 ? -1 : 1, mz: 0.6 } : still;
        step(w, input, STEP);
        hurt += count(w, Ev.PlayerHurt);
      }
      if (dodge) expect(hurt).toBeLessThanOrEqual(1);
      else expect(hurt).toBe(H.n);
    }
  });
});
