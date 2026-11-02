import { CAPS, CHARACTERS, DECOR, PLAYER, SHOP, SPAWN, XP, WEAPON_MAX, TREE_CELL, WORLD_HALF, ZONES } from './balance';
import { SpatialGrid } from './grid';
import { Rng } from './rng';
import { Ev, Mode, ProjKind, ShotKind } from './types';
import type {
  Card,
  Chest,
  Enemy,
  GameEvent,
  Gem,
  Input,
  PassiveKey,
  Player,
  Projectile,
  Shot,
  WeaponKey,
  WorldOptions,
} from './types';

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export class World {
  seed: number;
  rng: Rng;
  t = 0;
  mode: Mode = Mode.Play;
  kills = 0;
  gold = 0;
  pending = 0; // montées de niveau (ou cartes de coffre) en attente
  chestCards = 0; // > 0 : les `pending` en cours viennent d'un coffre (bannière « Coffre ×n »)
  player: Player;

  enemies: Enemy[] = [];
  enemyCount = 0;
  projs: Projectile[] = [];
  projCount = 0;
  shots: Shot[] = [];
  shotCount = 0;
  gems: Gem[] = [];
  gemCount = 0;
  chests: Chest[] = [];
  chestCount = 0;

  events: GameEvent[] = [];
  eventCount = 0;

  grid = new SpatialGrid(CAPS.enemies);

  // spawner
  spawnAcc = 0;
  nextWave = SPAWN.wavePeriod;
  nextBoss = SPAWN.bossPeriod;
  nextElite = SPAWN.eliteAfter;
  bossCount = 0;
  bossIndex = -1; // index de l'ennemi boss vivant, -1 sinon
  reaperSpawned = false;
  nextId = 1;
  lastAction = 0; // dernier coup donné ou reçu
  boredomUntil = 0;

  // armes et passifs
  weapons: Partial<Record<WeaponKey, number>> = { orbe: 1 };
  unlocked: Set<WeaponKey> | null = null; // null = toutes les armes proposables
  bladeRangeMul = 1; // Bûcheron : lames à portée +20 %
  passives: Partial<Record<PassiveKey, number>> = {};
  evolved: Partial<Record<WeaponKey, boolean>> = {};
  wstate = { orbeT: 0.4, auraT: 0, auraPulse: 0, foudreT: 1.5, bladeA: 0, boomT: 0.8, mineT: 0, mineDist: 0 };
  cards: Card[] = [];

  // décor (généré par seed, collisions) et zones
  obstacles: Obstacle[] = [];
  treeCount = 0; // obstacles[0..treeCount) = arbres, puis rochers
  lakes: Obstacle[] = [];
  woods: Obstacle[] = [];
  private obstacleGrid = new Map<number, number[]>();

  constructor(seed: number, opts?: WorldOptions) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.player = makePlayer(opts);
    const ch = CHARACTERS.find((c) => c.key === (opts?.character ?? 'eclaireuse')) ?? CHARACTERS[0];
    this.weapons = { [ch.weapon]: 1 };
    this.bladeRangeMul = ch.bladeRangeMul;
    if (opts?.unlocked) this.unlocked = new Set(opts.unlocked);
    for (let i = 0; i < CAPS.enemies; i++) this.enemies.push(makeEnemy());
    for (let i = 0; i < CAPS.projectiles; i++) this.projs.push(makeProj());
    for (let i = 0; i < CAPS.shots; i++) this.shots.push(makeShot());
    for (let i = 0; i < CAPS.gems; i++) this.gems.push(makeGem());
    for (let i = 0; i < CAPS.chests; i++) this.chests.push({ alive: false, x: 0, z: 0, age: 0, boss: false });
    for (let i = 0; i < CAPS.events; i++) this.events.push({ type: Ev.Hit, x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0, v: 0 });
    const r = new Rng(this.seed ^ 0x9e3779b9);
    this.generateZones(r);
    this.generateObstacles(r);
  }

  // ---------- événements ----------
  emit(type: Ev, x = 0, y = 0, z = 0, v = 0, x2 = 0, y2 = 0, z2 = 0): void {
    if (this.eventCount >= CAPS.events) return;
    const e = this.events[this.eventCount++];
    e.type = type;
    e.x = x;
    e.y = y;
    e.z = z;
    e.v = v;
    e.x2 = x2;
    e.y2 = y2;
    e.z2 = z2;
  }
  clearEvents(): void {
    this.eventCount = 0;
  }

  // ---------- pools ----------
  allocEnemy(): Enemy | null {
    if (this.enemyCount >= CAPS.enemies) return null;
    const e = this.enemies[this.enemyCount++];
    e.alive = true;
    e.id = this.nextId++;
    return e;
  }
  /** swap-remove : l'ennemi en fin de pool prend la place i. */
  freeEnemy(i: number): void {
    const last = --this.enemyCount;
    if (this.bossIndex === i) this.bossIndex = -1;
    else if (this.bossIndex === last) this.bossIndex = i;
    if (i !== last) {
      const a = this.enemies[i];
      this.enemies[i] = this.enemies[last];
      this.enemies[last] = a;
    }
    this.enemies[last].alive = false;
  }
  allocProj(): Projectile | null {
    if (this.projCount >= CAPS.projectiles) return null;
    const p = this.projs[this.projCount++];
    p.alive = true;
    return p;
  }
  freeProj(i: number): void {
    const last = --this.projCount;
    if (i !== last) {
      const a = this.projs[i];
      this.projs[i] = this.projs[last];
      this.projs[last] = a;
    }
    this.projs[last].alive = false;
  }
  allocShot(): Shot | null {
    if (this.shotCount >= CAPS.shots) return null;
    const s = this.shots[this.shotCount++];
    s.alive = true;
    return s;
  }
  freeShot(i: number): void {
    const last = --this.shotCount;
    if (i !== last) {
      const a = this.shots[i];
      this.shots[i] = this.shots[last];
      this.shots[last] = a;
    }
    this.shots[last].alive = false;
  }
  allocGem(): Gem | null {
    if (this.gemCount >= CAPS.gems) return null;
    const g = this.gems[this.gemCount++];
    g.alive = true;
    return g;
  }
  freeGem(i: number): void {
    const last = --this.gemCount;
    if (i !== last) {
      const a = this.gems[i];
      this.gems[i] = this.gems[last];
      this.gems[last] = a;
    }
    this.gems[last].alive = false;
  }
  allocChest(): Chest | null {
    if (this.chestCount >= CAPS.chests) return null;
    const c = this.chests[this.chestCount++];
    c.alive = true;
    return c;
  }
  freeChest(i: number): void {
    const last = --this.chestCount;
    if (i !== last) {
      const a = this.chests[i];
      this.chests[i] = this.chests[last];
      this.chests[last] = a;
    }
    this.chests[last].alive = false;
  }

  // ---------- zones et décor ----------
  /** Lacs (ralentissent) et bois denses (couloirs), loin du départ. */
  private generateZones(r: Rng): void {
    const place = (n: number, rMin: number, rMax: number, out: Obstacle[]) => {
      for (let i = 0; i < n; i++) {
        let x: number, z: number;
        do {
          x = r.range(-WORLD_HALF * 0.8, WORLD_HALF * 0.8);
          z = r.range(-WORLD_HALF * 0.8, WORLD_HALF * 0.8);
        } while (x * x + z * z < ZONES.minFromCenter * ZONES.minFromCenter);
        out.push({ x, z, r: r.range(rMin, rMax) });
      }
    };
    place(ZONES.lakes, ZONES.lakeRMin, ZONES.lakeRMax, this.lakes);
    place(ZONES.woods, ZONES.woodR, ZONES.woodR, this.woods);
  }
  /** Multiplicateur de vitesse au sol en (x, z) : 0,55 dans un lac, 1 ailleurs. O(nombre de lacs). */
  speedAt(x: number, z: number): number {
    for (let i = 0; i < this.lakes.length; i++) {
      const l = this.lakes[i];
      const dx = x - l.x,
        dz = z - l.z;
      if (dx * dx + dz * dz < l.r * l.r) return ZONES.lakeSpeed;
    }
    return 1;
  }
  private inLake(x: number, z: number): boolean {
    return this.speedAt(x, z) < 1;
  }
  private generateObstacles(r: Rng): void {
    const addOne = (x: number, z: number, radius: number) => {
      this.obstacles.push({ x, z, r: radius });
      const k = Math.floor(x / TREE_CELL) * 65536 + Math.floor(z / TREE_CELL);
      let arr = this.obstacleGrid.get(k);
      if (!arr) this.obstacleGrid.set(k, (arr = []));
      arr.push(this.obstacles.length - 1);
    };
    const add = (n: number, sMin: number, sMax: number, baseR: number) => {
      for (let i = 0; i < n; i++) {
        let x: number, z: number;
        do {
          x = r.range(-WORLD_HALF, WORLD_HALF);
          z = r.range(-WORLD_HALF, WORLD_HALF);
        } while (x * x + z * z < 64 || this.inLake(x, z));
        addOne(x, z, baseR * r.range(sMin, sMax));
      }
    };
    add(DECOR.trees, 0.8, 1.7, 0.7); // arbres (indices 0..379)
    // bois denses : arbres supplémentaires dans les disques de bois, en laissant des couloirs (anneaux)
    for (let i = 0; i < DECOR.woodTrees; i++) {
      const wd = this.woods[i % this.woods.length];
      const a = r.range(0, Math.PI * 2);
      const d = Math.sqrt(r.next()) * wd.r;
      const x = wd.x + Math.sin(a) * d,
        z = wd.z + Math.cos(a) * d;
      // couloir : on évite une bande radiale de 3 u autour de 0,5·r, et le lac
      if (Math.abs(d - wd.r * 0.5) < 1.5 || this.inLake(x, z) || Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF)
        continue;
      addOne(x, z, 0.7 * r.range(0.9, 1.6));
    }
    this.treeCount = this.obstacles.length;
    add(DECOR.rocks, 0.5, 1.4, 0.75); // rochers
  }
  /** Repousse (x,z) hors des obstacles proches. Écrit dans out[0], out[1]. */
  resolveObstacles(x: number, z: number, pad: number, out: Float64Array): void {
    const tx = Math.floor(x / TREE_CELL),
      tz = Math.floor(z / TREE_CELL);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const arr = this.obstacleGrid.get((tx + a) * 65536 + (tz + b));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const o = this.obstacles[arr[k]];
          const dx = x - o.x,
            dz = z - o.z,
            d2 = dx * dx + dz * dz,
            m = o.r + pad;
          if (d2 < m * m && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x = o.x + (dx / d) * m;
            z = o.z + (dz / d) * m;
          }
        }
      }
    }
    out[0] = x;
    out[1] = z;
  }

  weaponLevel(k: WeaponKey): number {
    return this.weapons[k] ?? 0;
  }
  weaponMaxed(k: WeaponKey): boolean {
    return (this.weapons[k] ?? 0) >= WEAPON_MAX;
  }
}

/** Joueur de départ : constantes PLAYER, puis personnage, puis paliers de boutique (opts). */
export function makePlayer(opts?: WorldOptions): Player {
  const ch = CHARACTERS.find((c) => c.key === (opts?.character ?? 'eclaireuse')) ?? CHARACTERS[0];
  const tier = (key: string) => {
    const i = SHOP.lines.findIndex((l) => l.key === key);
    return i >= 0 ? Math.max(0, Math.min(SHOP.lines[i].tiers, opts?.upgrades?.[i] ?? 0)) : 0;
  };
  const per = (key: string) => SHOP.lines.find((l) => l.key === key)!.per;
  const maxHp = Math.round((PLAYER.hp + ch.hpAdd) * ch.hpMul + tier('hp') * per('hp'));
  return {
    x: 0,
    z: 0,
    y: 0,
    px: 0,
    pz: 0,
    py: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    onGround: true,
    hp: maxHp,
    maxHp,
    regen: 0,
    speed: PLAYER.speed * ch.speedMul * (1 + tier('speed') * per('speed')),
    magnet: PLAYER.magnet * (1 + tier('magnet') * per('magnet')),
    dmgMul: 1 + tier('dmg') * per('dmg'),
    cdMul: 1 - tier('cd') * per('cd'),
    luck: tier('luck') * per('luck'),
    goldMul: 1 + tier('gold') * per('gold'),
    revives: tier('revive'),
    dashTime: ch.dashTime,
    level: 1,
    xp: 0,
    need: XP.needFor(1),
    dirX: 0,
    dirZ: 1,
    dashT: 0,
    dashCd: 0,
    invul: 0,
    walk: 0,
    recoil: 0,
  };
}
function makeEnemy(): Enemy {
  return {
    alive: false,
    id: 0,
    type: 0,
    elite: false,
    r: 0.5,
    x: 0,
    z: 0,
    px: 0,
    pz: 0,
    y: 0,
    hp: 1,
    max: 1,
    kx: 0,
    kz: 0,
    face: 0,
    flash: 0,
    lastBlade: -9,
    lastBoom: -9,
    spd: 1,
    dmgMul: 1,
    bob: 0,
    state: 0,
    timer: 0,
    aim: 0,
    tx: 0,
    tz: 0,
    phase2: false,
  };
}
function makeProj(): Projectile {
  return {
    alive: false,
    kind: ProjKind.Orbe,
    x: 0,
    y: 0,
    z: 0,
    px: 0,
    pz: 0,
    vx: 0,
    vz: 0,
    life: 0,
    age: 0,
    dmg: 0,
    pierce: 1,
    hit0: -1,
    hit1: -1,
    hit2: -1,
    ret: false,
    r: 0,
    armed: false,
  };
}
function makeShot(): Shot {
  return { alive: false, kind: ShotKind.Spit, r: 0.4, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, life: 0, dmg: 0 };
}
function makeGem(): Gem {
  return { alive: false, x: 0, z: 0, v: 1, mag: false, s: 0, age: 0 };
}

export const NO_INPUT: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: -1 };
