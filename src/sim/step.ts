import { CRACHEUR_TYPE, ENEMIES, REVIVE, ENEMY_SEPARATION, GOLD, KNOCKBACK_DECAY, PLAYER, PLAY_LIMIT, SPAWN, VOLANT_TYPE, TRAIT } from './balance';
import { ignoresGround, tickBoss, tickFlyer, tickSpitter } from './bosses';
import { compactEnemies } from './combat';
import { applyCard, rollChoices, tickChests, tickGems } from './progression';
import { respawnNear, spawnEnemy, tickSpawner } from './spawner';
import { Ev, Mode, ShotKind, Trait } from './types';
import type { Input } from './types';
import { placeFire, placeMine, tickProjectiles, tickWeapons } from './weapons/tick';
import type { World } from './world';

const out2 = new Float64Array(2);
const mv = new Float64Array(2);
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
  if (w.mode === Mode.Dead || w.mode === Mode.Won) return;
  if (w.mode === Mode.LevelUp) {
    if (input.pick >= 0) applyCard(w, input.pick);
    return;
  }
  w.t += dt;
  stepPlayer(w, input, dt);
  tickSpawner(w, dt);
  w.grid.build(w.enemies, w.enemyCount, w.player.x, w.player.z);
  stepEnemies(w, dt);
  tickShots(w, dt);
  tickWeapons(w, dt);
  tickProjectiles(w, dt);
  compactEnemies(w);
  tickGems(w, dt);
  tickChests(w, dt);
  // défi « Intouchable » : plus longue période sans dégât (hurtAt est posé là où PlayerHurt est émis)
  if (w.t - w.hurtAt > w.noHitBest) w.noHitBest = w.t - w.hurtAt;
  if ((w.mode as Mode) === Mode.Won) {
    w.gold += w.t * GOLD.perSecond * w.player.goldMul;
  } else if (w.player.hp <= 0 && w.player.revives > 0) {
    // réanimation (boutique) : une seconde chance, puis on sort de la masse
    const P = w.player;
    P.revives--;
    P.hp = P.maxHp * REVIVE.hpFrac;
    P.invul = Math.max(P.invul, REVIVE.invul);
    w.emit(Ev.Revive, P.x, P.y + 1, P.z, P.revives);
  } else if (w.player.hp <= 0) {
    w.player.hp = 0;
    w.mode = Mode.Dead;
    w.gold += w.t * GOLD.perSecond * w.player.goldMul; // bonus de fin : secondes survécues / 10
    w.emit(Ev.Death, w.player.x, 1, w.player.z, w.t);
  } else if (w.pending > 0) {
    w.mode = Mode.LevelUp;
    rollChoices(w, w.chestCards > 0);
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
    P.dashT = P.dashTime;
    P.dashCd = PLAYER.dashCd;
    P.invul = Math.max(P.invul, PLAYER.dashInvul);
    w.emit(Ev.Dash, P.x, P.y, P.z);
  }
  let sp = P.speed * (P.onGround ? w.speedAt(P.x, P.z) : 1); // lac : ralentit au sol seulement
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
  P.dashCd -= dt;
  P.invul -= dt;
  if (P.recoil > 0) P.recoil = Math.max(0, P.recoil - dt);
  w.resolveObstacles(P.x, P.z, 0.4, out2);
  // plateaux (phase 11) : le bord est un mur vu d'en bas, on le passe en l'air (y ≥ h − edgeTol) et on atterrit dessus
  w.resolvePlateaux(out2[0], out2[1], P.y, 0.4, out2);
  P.x = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, out2[0]));
  P.z = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, out2[1]));
  const ground = w.groundAt(P.x, P.z);
  if (P.onGround && P.y > ground) {
    // on sort du bord : chute
    P.onGround = false;
    P.vy = 0;
  }
  if (!P.onGround) {
    P.vy -= PLAYER.gravity * dt;
    P.y += P.vy * dt;
    if (P.y <= ground) {
      P.y = ground;
      P.vy = 0;
      P.onGround = true;
      w.emit(Ev.Land, P.x, ground, P.z);
      if (w.trait === Trait.Demolisseur) placeMine(w, P.x, P.z); // Sapeur : une mine par atterrissage
    }
  }
  P.hp = Math.min(P.maxHp, P.hp + P.regen * dt);
  P.walk += l * dt * 12;
  // défi « Marathon » : distance réellement parcourue ; Feu follet : traînée de feu posée tous les TRAIT.trainee.spacing u de dash
  const mx = P.x - P.px,
    mz = P.z - P.pz;
  const moved = Math.sqrt(mx * mx + mz * mz);
  w.distance += moved;
  if (P.dashT > 0 && w.trait === Trait.Trainee) {
    const S = w.wstate;
    S.fireDist += moved;
    if (S.fireDist >= TRAIT.trainee.spacing) {
      S.fireDist = 0;
      placeFire(w, P.x, P.z);
    }
  }
}

function stepEnemies(w: World, dt: number): void {
  const P = w.player;
  const decay = Math.pow(KNOCKBACK_DECAY, dt);
  let hurt = 0;
  const grid = w.grid;
  // en l'air : au-dessus du sol local (un joueur posé sur un plateau n'est pas « en l'air » pour les Volants et le Faucheur)
  const ground = w.groundAt(P.x, P.z);
  const airborne = P.y - ground >= PLAYER.airborneSafeY;
  // hors de portée des ennemis au sol : en l'air ou perché (ils butent au pied du plateau)
  const aboveGround = P.y >= PLAYER.airborneSafeY;
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
    if (d > SPAWN.despawnDist && !def.boss) {
      respawnNear(w, i);
      continue;
    }
    // déplacement voulu selon le rôle
    if (def.boss) tickBoss(w, e, dt, dx, dz, d, mv);
    else if (e.type === VOLANT_TYPE) tickFlyer(w, e, dt, dx, dz, d, mv);
    else if (e.type === CRACHEUR_TYPE) tickSpitter(w, e, dt, dx, dz, d, mv);
    else {
      const sp = def.speed * e.spd;
      mv[0] = (dx / d) * sp;
      mv[1] = (dz / d) * sp;
    }
    let mx = mv[0],
      mz = mv[1];
    if (!ignoresGround(e.type)) {
      const slow = w.speedAt(e.x, e.z);
      mx *= slow;
      mz *= slow;
      if (!def.boss) {
        // séparation avec les voisins (9 cellules)
        const nn = grid.neighbors(i, nb);
        for (let k = 0; k < nn; k++) {
          const o = w.enemies[nb[k]];
          if (!o.alive || ignoresGround(o.type)) continue;
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
    }
    e.x += (mx + e.kx) * dt;
    e.z += (mz + e.kz) * dt;
    e.kx *= decay;
    e.kz *= decay;
    const flies = ignoresGround(e.type);
    if (!flies) {
      // plateaux : les marcheurs (et les boss) butent au pied
      w.resolvePlateaux(e.x, e.z, 0, e.r, out2);
      e.x = out2[0];
      e.z = out2[1];
    }
    e.face = Math.atan2(dx, dz);
    if (e.flash > 0) e.flash -= dt;
    // contact : jamais sur un joueur en l'air ; le Volant ne blesse qu'en plongée (state 2)
    const canHurt = e.type === VOLANT_TYPE ? e.state === 2 : true;
    if (canHurt && d < e.r + PLAYER.radius && !(flies ? airborne : aboveGround) && P.invul <= 0) {
      const dmg = def.dmg * e.dmgMul * dt;
      P.hp -= dmg;
      hurt += dmg;
    }
  }
  if (hurt > 0) {
    w.lastAction = w.t;
    w.hurtAt = w.t;
    w.emit(Ev.PlayerHurt, P.x, P.y + 1, P.z, hurt);
  }
}

/** Projectiles ennemis : crachats (mobiles) et cercles du Colosse (immobiles, explosent à la fin). */
function tickShots(w: World, dt: number): void {
  const P = w.player;
  const airborne = P.y - w.groundAt(P.x, P.z) >= PLAYER.airborneSafeY; // les tirs atteignent un joueur perché
  let hurt = 0;
  for (let i = w.shotCount - 1; i >= 0; i--) {
    const s = w.shots[i];
    s.px = s.x;
    s.pz = s.z;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    const dx = P.x - s.x,
      dz = P.z - s.z,
      rr = s.r + PLAYER.radius;
    const inside = dx * dx + dz * dz < rr * rr;
    if (s.kind === ShotKind.Spit) {
      if (inside && !airborne && P.invul <= 0) {
        P.hp -= s.dmg;
        hurt += s.dmg;
        w.freeShot(i);
        continue;
      }
      if (s.life <= 0) w.freeShot(i);
    } else if (s.life <= 0) {
      // zone : explose
      w.emit(Ev.ZoneBlast, s.x, 0, s.z, s.r);
      if (inside && !airborne && P.invul <= 0) {
        P.hp -= s.dmg;
        hurt += s.dmg;
      }
      w.freeShot(i);
    }
  }
  if (hurt > 0) {
    w.lastAction = w.t;
    w.hurtAt = w.t;
    w.emit(Ev.PlayerHurt, P.x, P.y + 1, P.z, hurt);
  }
}
