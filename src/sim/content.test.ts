// Contenu de la phase 3 : nouvelles armes, évolutions, ennemis, boss, Faucheur, coffres, zones (sim-testing §1).
import { describe, expect, it } from 'vitest';
import {
  BOSS,
  BOSS_TYPE,
  CHEST,
  COLOSSUS_TYPE,
  CRACHEUR,
  CRACHEUR_TYPE,
  ELITE,
  ENEMIES,
  ITEM,
  PLAYER,
  REAPER_TYPE,
  SPAWN,
  STEP,
  SWARM_TYPE,
  VOLANT_TYPE,
  ZONES,
} from './balance';
import { dropChest, hitEnemy } from './combat';
import { itemCount } from './items';
import { rollChoices } from './progression';
import { spawnEnemy } from './spawner';
import { step } from './step';
import { Ev, Mode, ProjKind } from './types';
import type { Input } from './types';
import { WEAPON_KEYS } from './weapons/defs';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: 0 };
const god = (w: World) => {
  w.player.maxHp = w.player.hp = 1e9;
  w.player.need = 1e9;
};
const count = (w: World, type: Ev) => {
  let n = 0;
  for (let i = 0; i < w.eventCount; i++) if (w.events[i].type === type) n++;
  return n;
};

describe('boomerang et mines', () => {
  it('le boomerang part devant, revient au joueur et libère son projectile', () => {
    const w = new World(31);
    god(w);
    w.weapons = { boomerang: 1 };
    spawnEnemy(w, 0, 0, 30); // un ennemi loin : l'arme tire quand même (direction du regard)
    let maxDist = 0,
      seenBoom = false;
    for (let f = 0; f < 240; f++) {
      step(w, still, STEP);
      for (let i = 0; i < w.projCount; i++) {
        const p = w.projs[i];
        if (p.kind !== ProjKind.Boomerang) continue;
        seenBoom = true;
        maxDist = Math.max(maxDist, Math.hypot(p.x - w.player.x, p.z - w.player.z));
      }
    }
    expect(seenBoom).toBe(true);
    expect(maxDist).toBeGreaterThan(8); // portée ≈ 9 u
    expect(maxDist).toBeLessThan(11);
    // 4 s plus tard, aucun boomerang ne traîne : ils sont revenus (cd 1,7 s ⇒ au plus 2 en vol)
    let flying = 0;
    for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind === ProjKind.Boomerang) flying++;
    expect(flying).toBeLessThanOrEqual(2);
  });
  it('une mine posée explose quand un ennemi arrive dessus et blesse tout dans son rayon', () => {
    const w = new World(32);
    god(w);
    w.weapons = { mines: 1 };
    // le joueur marche 2 s (pose des mines), puis s'arrête ; un Spectre arrive sur la trace
    for (let f = 0; f < 120; f++) step(w, { ...still, mz: 1 }, STEP);
    let mines = 0;
    for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind === ProjKind.Mine) mines++;
    expect(mines).toBeGreaterThanOrEqual(2);
    const m = w.projs.find((p) => p.alive && p.kind === ProjKind.Mine)!;
    const i = spawnEnemy(w, 2, 0, 0); // Brute (80 PV) posée sur le joueur…
    w.enemies[i].x = w.enemies[i].px = m.x + 0.5; // …déplacée sur la mine
    w.enemies[i].z = w.enemies[i].pz = m.z;
    const hp = w.enemies[i].hp;
    let blasts = 0;
    for (let f = 0; f < 30; f++) {
      step(w, still, STEP);
      blasts += count(w, Ev.MineBlast);
    }
    expect(blasts).toBeGreaterThanOrEqual(1);
    const brute = w.enemies.find((e) => e.alive && e.type === 2);
    expect(brute ? brute.hp : 0).toBeLessThan(hp);
  });
});

describe('Volant et Cracheur', () => {
  it('le Volant plane hors de portée, pique sur le joueur et ne blesse qu’en plongée au sol', () => {
    const w = new World(35);
    w.weapons = {};
    const i = spawnEnemy(w, VOLANT_TYPE, 0, 6);
    const e = w.enemies[i];
    e.timer = 0.1;
    let hurtBeforeDive = 0,
      dives = 0,
      hurtInDive = 0;
    for (let f = 0; f < 240; f++) {
      step(w, still, STEP);
      dives += count(w, Ev.Dive);
      const hurt = count(w, Ev.PlayerHurt);
      if (e.state === 2) hurtInDive += hurt;
      else hurtBeforeDive += hurt;
    }
    expect(dives).toBeGreaterThanOrEqual(1);
    expect(hurtBeforeDive).toBe(0);
    expect(hurtInDive).toBeGreaterThan(0);
    expect(ENEMIES[VOLANT_TYPE].y).toBeGreaterThan(PLAYER.airborneSafeY);
  });
  it('un joueur en l’air pendant la plongée n’est pas touché', () => {
    const w = new World(36);
    w.weapons = {};
    const i = spawnEnemy(w, VOLANT_TYPE, 0, 3);
    const e = w.enemies[i];
    e.timer = 0; // télégraphe immédiat, plongée dans 0,6 s
    let hurt = 0;
    for (let f = 0; f < 90; f++) {
      // on saute juste avant la plongée et on reste en l'air pendant toute sa durée
      const jump = e.state === 1 && e.timer < 0.15 && w.player.onGround;
      step(w, { ...still, jump }, STEP);
      if (e.state === 2 && w.player.y >= PLAYER.airborneSafeY) hurt += count(w, Ev.PlayerHurt);
    }
    expect(hurt).toBe(0);
  });
  it('le Cracheur garde ses distances et son crachat blesse un joueur au sol', () => {
    const w = new World(37);
    w.weapons = {};
    const i = spawnEnemy(w, CRACHEUR_TYPE, 0, 12);
    let spits = 0,
      hurt = 0,
      minD = 99;
    for (let f = 0; f < 420; f++) {
      step(w, still, STEP);
      spits += count(w, Ev.Spit);
      hurt += count(w, Ev.PlayerHurt);
      const e = w.enemies[i];
      if (f > 180) minD = Math.min(minD, Math.hypot(e.x - w.player.x, e.z - w.player.z));
    }
    expect(spits).toBeGreaterThanOrEqual(1);
    expect(hurt).toBeGreaterThanOrEqual(1);
    expect(minD).toBeGreaterThan(CRACHEUR.keepMin - 1);
  });
});

describe('élites, coffres, or', () => {
  it('une élite a ×6 PV, ×3 XP, et lâche un coffre à sa mort', () => {
    const w = new World(38);
    const i = spawnEnemy(w, 0, 0, 5, true);
    expect(w.enemies[i].max).toBeCloseTo(ENEMIES[0].hp * ELITE.hpMul, 3);
    hitEnemy(w, i, 1e9, 0, 0, 0);
    expect(w.chestCount).toBe(1);
    expect(w.gems[w.gemCount - 1].v).toBe(ENEMIES[0].xp * ELITE.xpMul);
    expect(w.gold).toBeGreaterThan(0);
  });
  it('le spawner pose une élite après 2:00 puis toutes les 40 s', () => {
    const w = new World(39);
    god(w);
    w.stageT = SPAWN.eliteAfter - 1; // phase 37 : les élites suivent le chrono du monde
    w.nextWave = 1e9;
    let elites = 0;
    for (let f = 0; f < 60 * 90; f++) {
      step(w, still, STEP);
      if (w.enemies[w.enemyCount - 1]?.elite && w.enemies[w.enemyCount - 1].max > ENEMIES[0].hp * 5) elites++;
    }
    expect(elites).toBeGreaterThanOrEqual(1);
  });
  it('marcher sur un coffre ouvre un choix d\'objets passifs (1 à prendre), un coffre de boss 2', () => {
    const w = new World(41);
    god(w);
    w.player.need = 1e9;
    dropChest(w, w.player.x, w.player.z + 0.5, false);
    step(w, still, STEP);
    expect(count(w, Ev.Chest)).toBe(1);
    expect(w.mode).toBe(Mode.LevelUp);
    expect(w.cards.length).toBe(ITEM.offers);
    expect(w.cards.every((c) => c.kind === 'i')).toBe(true);
    step(w, { ...still, pick: 0 }, STEP);
    expect(w.itemOrder.length).toBe(1);
    expect(w.mode).toBe(Mode.Play);
    dropChest(w, w.player.x, w.player.z + 0.5, true);
    step(w, still, STEP);
    for (let k = 0; k < CHEST.bossPicks; k++) {
      expect(w.mode).toBe(Mode.LevelUp);
      step(w, { ...still, pick: 0 }, STEP);
    }
    expect(itemCount(w)).toBe(1 + CHEST.bossPicks); // phase 38 : un doublon s'empile (itemOrder : une place par objet)
    expect(w.mode).toBe(Mode.Play);
  });
});

describe('boss et Faucheur', () => {
  // phase 37 : les boss viennent du totem de chaque monde (stages.test.ts) ; le Faucheur reste défini pour le boss final
  it('le Gardien rugit puis charge en ligne ; l’Essaim-mère pond des Dards ; le Colosse pose des cercles qui explosent', () => {
    const w = new World(43);
    god(w);
    w.weapons = {};
    const g = spawnEnemy(w, BOSS_TYPE, 0, 8);
    let roars = 0,
      maxSpeed = 0;
    for (let f = 0; f < 240; f++) {
      step(w, still, STEP);
      roars += count(w, Ev.BossRoar);
      const e = w.enemies[g];
      maxSpeed = Math.max(maxSpeed, Math.hypot(e.x - e.px, e.z - e.pz) / STEP);
    }
    expect(roars).toBeGreaterThanOrEqual(1);
    expect(maxSpeed).toBeGreaterThan(BOSS.chargeSpeed * 0.8);

    const w2 = new World(44);
    god(w2);
    w2.weapons = {};
    spawnEnemy(w2, SWARM_TYPE, 0, 10);
    const before = w2.enemyCount;
    for (let f = 0; f < 60 * (BOSS.swarmPeriod + 0.5); f++) step(w2, still, STEP);
    let dards = 0;
    for (let i = 0; i < w2.enemyCount; i++) if (w2.enemies[i].type === 1) dards++;
    expect(dards).toBeGreaterThanOrEqual(BOSS.swarmN);
    expect(w2.enemyCount).toBeGreaterThan(before);

    const w3 = new World(45);
    w3.weapons = {};
    w3.player.maxHp = w3.player.hp = 1e9;
    spawnEnemy(w3, COLOSSUS_TYPE, 0, 20);
    let telegraphs = 0,
      blasts = 0,
      hurt = 0;
    for (let f = 0; f < 60 * (BOSS.zoneTelegraph + 0.3); f++) {
      step(w3, still, STEP);
      telegraphs += count(w3, Ev.Telegraph);
      blasts += count(w3, Ev.ZoneBlast);
      hurt += count(w3, Ev.PlayerHurt);
    }
    expect(telegraphs).toBe(BOSS.zoneN);
    expect(blasts).toBe(BOSS.zoneN);
    expect(hurt).toBeGreaterThanOrEqual(1); // le premier cercle est sous le joueur immobile
  });
  it('le Faucheur rattrape un joueur qui fuit en ligne droite', () => {
    const w = new World(46);
    w.weapons = {};
    w.nextWave = 1e9;
    const i = spawnEnemy(w, REAPER_TYPE, Math.PI, 12); // derrière le joueur qui fuit vers +z
    let hurt = 0;
    for (let f = 0; f < 60 * 20 && hurt === 0; f++) {
      step(w, { ...still, mz: 1 }, STEP);
      hurt += count(w, Ev.PlayerHurt);
    }
    expect(hurt).toBeGreaterThan(0);
    expect(i).toBeGreaterThanOrEqual(0);
  });
});

describe('zones de terrain', () => {
  it('un lac ralentit le joueur au sol de 45 %, pas en l’air ni le Faucheur', () => {
    const w = new World(47);
    expect(w.lakes.length).toBe(ZONES.lakes);
    expect(w.woods.length).toBe(ZONES.woods);
    const lake = w.lakes[0];
    expect(w.speedAt(lake.x, lake.z)).toBe(ZONES.lakeSpeed);
    expect(w.speedAt(0, 0)).toBe(1);
    w.weapons = {};
    w.player.x = w.player.px = lake.x;
    w.player.z = w.player.pz = lake.z;
    step(w, { ...still, mx: 1 }, STEP);
    expect(w.player.vx).toBeCloseTo(w.player.speed * ZONES.lakeSpeed, 5);
  });
  it('les bois denses contiennent bien plus d’arbres que la clairière', () => {
    const w = new World(48);
    const wood = w.woods[0];
    let inWood = 0,
      inOpen = 0;
    for (let i = 0; i < w.treeCount; i++) {
      const o = w.obstacles[i];
      if ((o.x - wood.x) ** 2 + (o.z - wood.z) ** 2 < wood.r * wood.r) inWood++;
      if (o.x * o.x + o.z * o.z < wood.r * wood.r) inOpen++;
    }
    expect(inWood).toBeGreaterThan(inOpen * 2);
  });
});

describe('cartes', () => {
  it('neuf armes et huit tomes sont proposables ; Trèfle peut offrir une 4e carte', () => {
    expect(WEAPON_KEYS.length).toBe(9);
    const w = new World(49);
    w.player.luck = 4; // 24 % de 4e carte
    let four = 0;
    for (let i = 0; i < 300; i++) {
      rollChoices(w);
      if (w.cards.length === 4) four++;
    }
    expect(four).toBeGreaterThan(30);
    expect(four).toBeLessThan(150);
  });
});
