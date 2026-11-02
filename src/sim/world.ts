import { CAPS, PLAYER, SPAWN, XP, WEAPON_MAX, TREE_CELL, WORLD_HALF } from './balance';
import { SpatialGrid } from './grid';
import { Rng } from './rng';
import { Ev, Mode } from './types';
import type { Card, Enemy, GameEvent, Gem, Input, PassiveKey, Player, Projectile, WeaponKey } from './types';

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
  pending = 0; // montées de niveau en attente
  player: Player;

  enemies: Enemy[] = [];
  enemyCount = 0;
  projs: Projectile[] = [];
  projCount = 0;
  gems: Gem[] = [];
  gemCount = 0;

  events: GameEvent[] = [];
  eventCount = 0;

  grid = new SpatialGrid(CAPS.enemies);

  // spawner
  spawnAcc = 0;
  nextWave = SPAWN.wavePeriod;
  nextBoss = SPAWN.bossPeriod;
  bossCount = 0;
  bossIndex = -1; // index de l'ennemi boss vivant, -1 sinon
  nextId = 1;
  lastAction = 0; // dernier coup donné ou reçu
  boredomUntil = 0;

  // armes et passifs
  weapons: Partial<Record<WeaponKey, number>> = { orbe: 1 };
  passives: Partial<Record<PassiveKey, number>> = {};
  wstate = { orbeT: 0.4, auraT: 0, auraPulse: 0, foudreT: 1.5, bladeA: 0 };
  cards: Card[] = [];

  // décor (généré par seed, collisions)
  obstacles: Obstacle[] = [];
  private obstacleGrid = new Map<number, number[]>();

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.player = makePlayer();
    for (let i = 0; i < CAPS.enemies; i++) this.enemies.push(makeEnemy());
    for (let i = 0; i < CAPS.projectiles; i++) this.projs.push(makeProj());
    for (let i = 0; i < CAPS.gems; i++) this.gems.push(makeGem());
    for (let i = 0; i < CAPS.events; i++) this.events.push({ type: Ev.Hit, x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0, v: 0 });
    this.generateObstacles();
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

  // ---------- décor ----------
  private generateObstacles(): void {
    const r = new Rng(this.seed ^ 0x9e3779b9);
    const add = (n: number, sMin: number, sMax: number, baseR: number) => {
      for (let i = 0; i < n; i++) {
        let x: number, z: number;
        do {
          x = r.range(-WORLD_HALF, WORLD_HALF);
          z = r.range(-WORLD_HALF, WORLD_HALF);
        } while (x * x + z * z < 64);
        const s = r.range(sMin, sMax);
        this.obstacles.push({ x, z, r: baseR * s });
        const k = Math.floor(x / TREE_CELL) * 65536 + Math.floor(z / TREE_CELL);
        let arr = this.obstacleGrid.get(k);
        if (!arr) this.obstacleGrid.set(k, (arr = []));
        arr.push(this.obstacles.length - 1);
      }
    };
    add(380, 0.8, 1.7, 0.7); // arbres (indices 0..379)
    add(240, 0.5, 1.4, 0.75); // rochers
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

export function makePlayer(): Player {
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
    hp: PLAYER.hp,
    maxHp: PLAYER.hp,
    regen: 0,
    speed: PLAYER.speed,
    magnet: PLAYER.magnet,
    dmgMul: 1,
    cdMul: 1,
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
  return { alive: false, id: 0, type: 0, r: 0.5, x: 0, z: 0, px: 0, pz: 0, hp: 1, max: 1, kx: 0, kz: 0, face: 0, flash: 0, lastBlade: -9, spd: 1, dmgMul: 1, bob: 0 };
}
function makeProj(): Projectile {
  return { alive: false, x: 0, y: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, life: 0, age: 0, dmg: 0, pierce: 1, hit0: -1, hit1: -1, hit2: -1 };
}
function makeGem(): Gem {
  return { alive: false, x: 0, z: 0, v: 1, mag: false, s: 0 };
}

export const NO_INPUT: Input = { mx: 0, mz: 0, jump: false, dash: false, pick: -1 };
