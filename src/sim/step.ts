import { BOSS_TYPE, ENEMIES, ENEMY_SEPARATION, KNOCKBACK_DECAY, PLAYER, PLAY_LIMIT, SPAWN } from './balance';
import { compactEnemies } from './combat';
import { applyCard, rollChoices, tickGems } from './progression';
import { respawnNear, spawnEnemy, tickSpawner } from './spawner';
import { Ev, Mode } from './types';
import type { Input } from './types';
import { tickProjectiles, tickWeapons } from './weapons/tick';
import type { World } from './world';

const out2 = new Float64Array(2);
const nb = new Int32Array(64);
const TAU = Math.PI * 2;

/** Place les ennemis de départ. À appeler une fois après la construction. */
export function startRun(w: World): void {
  for (let i = 0; i < SPAWN.initial; i++) spawnEnemy(w, 0, w.rng.range(0, TAU), w.rng.range(14, 20));
}

/**
 * Avance la simulation d'un pas fixe. Pure : même monde + même input ⇒ même résultat.
 * Les événements de ce pas sont dans w.events[0..w.eventCount).
 */
export function step(w: World, input: Input, dt: number): void {
  w.clearEvents();
  if (w.mode === Mode.Dead) return;
  if (w.mode === Mode.LevelUp) {
    if (input.pick >= 0) applyCard(w, input.pick);
    return;
  }
  w.t += dt;
  stepPlayer(w, input, dt);
  tickSpawner(w, dt);
  w.grid.build(w.enemies, w.enemyCount, w.player.x, w.player.z);
  stepEnemies(w, dt);
  tickWeapons(w, dt);
  tickProjectiles(w, dt);
  compactEnemies(w);
  tickGems(w, dt);
  if (w.player.hp <= 0) {
    w.player.hp = 0;
    w.mode = Mode.Dead;
    w.emit(Ev.Death, w.player.x, 1, w.player.z, w.t);
  } else if (w.pending > 0) {
    w.mode = Mode.LevelUp;
    rollChoices(w);
  }
}

function stepPlayer(w: World, input: Input, dt: number): void {
  const P = w.player;
  P.px = P.x;
  P.pz = P.z;
  P.py = P.y;
  let ix = input.mx,
    iz = input.mz;
  let l = Math.sqrt(ix * ix + iz * iz);
  if (l > 1) {
    ix /= l;
    iz /= l;
    l = 1;
  }
  if (l > 0.05) {
    P.dirX = ix / l;
    P.dirZ = iz / l;
  }
  if (input.jump && P.onGround) {
    P.vy = PLAYER.jumpVel;
    P.onGround = false;
    w.emit(Ev.Jump, P.x, P.y, P.z);
  }
  if (input.dash && P.dashCd <= 0) {
    P.dashT = PLAYER.dashTime;
    P.dashCd = PLAYER.dashCd;
    P.invul = Math.max(P.invul, PLAYER.dashInvul);
    w.emit(Ev.Dash, P.x, P.y, P.z);
  }
  let sp = P.speed;
  if (P.dashT > 0) {
    P.dashT -= dt;
    sp *= PLAYER.dashMul;
    ix = P.dirX;
    iz = P.dirZ;
  }
  P.vx = ix * sp;
  P.vz = iz * sp;
  P.x += P.vx * dt;
  P.z += P.vz * dt;
  if (!P.onGround) {
    P.vy -= PLAYER.gravity * dt;
    P.y += P.vy * dt;
    if (P.y <= 0) {
      P.y = 0;
      P.vy = 0;
      P.onGround = true;
      w.emit(Ev.Land, P.x, 0, P.z);
    }
  }
  P.dashCd -= dt;
  P.invul -= dt;
  if (P.recoil > 0) P.recoil = Math.max(0, P.recoil - dt);
  w.resolveObstacles(P.x, P.z, 0.4, out2);
  P.x = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, out2[0]));
  P.z = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, out2[1]));
  P.hp = Math.min(P.maxHp, P.hp + P.regen * dt);
  P.walk += l * dt * 12;
}

function stepEnemies(w: World, dt: number): void {
  const P = w.player;
  const decay = Math.pow(KNOCKBACK_DECAY, dt);
  let hurt = 0;
  const grid = w.grid;
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    if (!e.alive) continue;
    const def = ENEMIES[e.type];
    e.px = e.x;
    e.pz = e.z;
    const dx = P.x - e.x,
      dz = P.z - e.z;
    const d2 = dx * dx + dz * dz;
    const d = d2 > 1e-8 ? Math.sqrt(d2) : 1;
    if (d > SPAWN.despawnDist && e.type !== BOSS_TYPE) {
      respawnNear(w, i);
      continue;
    }
    let mx = (dx / d) * def.speed * e.spd,
      mz = (dz / d) * def.speed * e.spd;
    if (e.type !== BOSS_TYPE) {
      // séparation avec les voisins (9 cellules)
      const nn = grid.neighbors(i, nb);
      for (let k = 0; k < nn; k++) {
        const o = w.enemies[nb[k]];
        if (!o.alive) continue;
        const sx = e.x - o.x,
          sz = e.z - o.z,
          rr = e.r + o.r,
          dd = sx * sx + sz * sz;
        if (dd < rr * rr && dd > 1e-6) {
          const dl = Math.sqrt(dd),
            push = ((rr - dl) / rr) * ENEMY_SEPARATION;
          mx += (sx / dl) * push;
          mz += (sz / dl) * push;
        }
      }
    }
    e.x += (mx + e.kx) * dt;
    e.z += (mz + e.kz) * dt;
    e.kx *= decay;
    e.kz *= decay;
    e.face = Math.atan2(dx, dz);
    if (e.flash > 0) e.flash -= dt;
    if (d < e.r + PLAYER.radius && P.y < PLAYER.airborneSafeY && P.invul <= 0) {
      const dmg = def.dmg * e.dmgMul * dt;
      P.hp -= dmg;
      hurt += dmg;
    }
  }
  if (hurt > 0) {
    w.lastAction = w.t;
    w.emit(Ev.PlayerHurt, P.x, P.y + 1, P.z, hurt);
  }
}
