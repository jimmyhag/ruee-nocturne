import { BOSS_TYPE, CAPS, ENEMIES, SPAWN } from './balance';
import { Ev } from './types';
import type { World } from './world';

const TAU = Math.PI * 2;

export function spawnEnemy(w: World, type: number, ang: number, dist: number): number {
  const e = w.allocEnemy();
  if (!e) return -1;
  const def = ENEMIES[type];
  const scale = SPAWN.hpScale(w.t) * (type === BOSS_TYPE ? 1 + w.bossCount * 0.8 : 1);
  e.type = type;
  e.r = def.r;
  e.x = e.px = w.player.x + Math.sin(ang) * dist;
  e.z = e.pz = w.player.z + Math.cos(ang) * dist;
  e.hp = e.max = def.hp * scale;
  e.kx = e.kz = 0;
  e.flash = 0;
  e.lastBlade = -9;
  e.face = 0;
  e.spd = w.rng.range(0.9, 1.1) * SPAWN.spdScale(w.t);
  e.dmgMul = SPAWN.dmgScale(w.t);
  e.bob = w.rng.range(0, TAU);
  return w.enemyCount - 1;
}

/** Replace un ennemi trop loin devant le joueur (hors écran). */
export function respawnNear(w: World, i: number): void {
  const e = w.enemies[i];
  const P = w.player;
  const moving = P.vx * P.vx + P.vz * P.vz > 0.25;
  const a = moving ? Math.atan2(P.vx, P.vz) + w.rng.range(-1.1, 1.1) : w.rng.range(0, TAU);
  e.x = e.px = P.x + Math.sin(a) * SPAWN.ringMin;
  e.z = e.pz = P.z + Math.cos(a) * SPAWN.ringMin;
  e.kx = e.kz = 0;
}

export function tickSpawner(w: World, dt: number): void {
  const t = w.t;
  let rate = SPAWN.rate(t);
  // compensation d'ennui : rien ne s'est passé depuis 4 s → densité ×2 pendant 6 s
  if (t - w.lastAction > SPAWN.boredomAfter && w.boredomUntil < t) w.boredomUntil = t + SPAWN.boredomFor;
  if (w.boredomUntil > t) rate *= SPAWN.boredomMul;

  w.spawnAcc += dt * rate;
  while (w.spawnAcc >= 1) {
    w.spawnAcc -= 1;
    if (w.enemyCount < CAPS.enemies) {
      const type = SPAWN.pick(t, w.rng.next());
      spawnEnemy(w, type, w.rng.range(0, TAU), w.rng.range(SPAWN.ringMin, SPAWN.ringMax));
    }
  }
  if (t >= w.nextWave) {
    w.nextWave += SPAWN.wavePeriod;
    const n = SPAWN.waveCount(t);
    for (let i = 0; i < n && w.enemyCount < CAPS.enemies; i++) spawnEnemy(w, t > SPAWN.waveDardAfter ? 1 : 0, (i / n) * TAU, SPAWN.waveDist);
    w.emit(Ev.Wave, w.player.x, 0, w.player.z, n);
  }
  if (t >= w.nextBoss) {
    w.nextBoss += SPAWN.bossPeriod;
    const i = spawnEnemy(w, BOSS_TYPE, w.rng.range(0, TAU), SPAWN.bossDist);
    if (i >= 0) {
      w.bossIndex = i;
      w.bossCount++;
      w.emit(Ev.BossSpawn, w.enemies[i].x, 2, w.enemies[i].z, w.bossCount);
    }
  }
}
