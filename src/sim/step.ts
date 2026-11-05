import { ARCHER_TYPE, CRACHEUR_TYPE, SORCIER_TYPE, ENEMIES, FLOW, ITEM, It, SYN, Syn, HAZARDS, REVIVE, ENEMY_SEPARATION, GOLD, KNOCKBACK_DECAY, PLAYER, PLAY_LIMIT, SPAWN, VOLANT_TYPE, TRAIT } from './balance';
import { isCharger, tickCharger, tickEruptions } from './hazards';
import { ignoresGround, tickArcher, tickBoss, tickFlyer, tickSorcier, tickSpitter } from './bosses';
import { compactEnemies } from './combat';
import { applyCard, nextChoice, tickChests, tickGems } from './progression';
import { merchantInput, tickMerchant } from './merchant';
import { tickPOI } from './poi';
import { hitEnemy } from './combat';
import { respawnNear, spawnEnemy, tickSpawner } from './spawner';
import { Ev, HitSrc, HurtSrc, Mode, ShotKind, Trait } from './types';
import type { Input } from './types';
import { placeFire, placeMine, tickProjectiles, tickWeapons } from './weapons/tick';
import type { World } from './world';

const out2 = new Float64Array(2);
const mv = new Float64Array(2);
const fl = new Float64Array(2);
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
  if (w.mode === Mode.Merchant) {
    if (input.pick >= 0) merchantInput(w, input.pick); // phase 17 : achat, relance ou départ
    return;
  }
  w.t += dt;
  stepPlayer(w, input, dt);
  tickSpawner(w, dt);
  w.grid.build(w.enemies, w.enemyCount, w.player.x, w.player.z);
  w.flow.tick(w, dt);
  stepEnemies(w, dt);
  tickEruptions(w);
  tickShots(w, dt);
  tickWeapons(w, dt);
  tickProjectiles(w, dt);
  compactEnemies(w);
  tickGems(w, dt);
  tickChests(w, dt);
  tickMerchant(w); // phase 17 : peut ouvrir l'échoppe (Mode.Merchant)
  tickPOI(w, dt); // phase 18 : coffres de carte et sanctuaires
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
  } else if ((w.mode as Mode) === Mode.Play && (w.itemPicks > 0 || w.boonPicks > 0 || w.pending > 0)) {
    nextChoice(w); // objets des coffres d'abord, puis bonus de sanctuaire, puis montées de niveau
  }
}

/** Bottes de saut (phase 17) : l'atterrissage repousse les ennemis au sol dans ITEM.bottes.r. */
function landingShockwave(w: World): void {
  const P = w.player,
    B = ITEM.bottes;
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    if (!e.alive || ENEMIES[e.type].boss) continue;
    const dx = e.x - P.x,
      dz = e.z - P.z,
      d2 = dx * dx + dz * dz;
    if (d2 > B.r * B.r || d2 < 1e-6) continue;
    const d = Math.sqrt(d2),
      k = B.kb * ENEMIES[e.type].kbMul * (1 - d / B.r);
    e.kx += (dx / d) * k;
    e.kz += (dz / d) * k;
  }
  w.emit(Ev.Shockwave, P.x, 0, P.z, B.r);
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
    P.vy = PLAYER.jumpVel * P.jumpMul; // phase 17 : Bottes de saut
    P.onGround = false;
    w.emit(Ev.Jump, P.x, P.y, P.z);
  }
  if (input.dash && P.dashCd <= 0) {
    P.dashT = P.dashTime;
    P.dashCd = PLAYER.dashCd * P.dashCdMul; // tome Mouvement
    P.invul = Math.max(P.invul, PLAYER.dashInvul + P.dashInvulAdd);
    w.emit(Ev.Dash, P.x, P.y, P.z);
  }
  // lac : ralentit au sol seulement ; phase 18 : la pente aussi (montée plus lente, descente plus rapide)
  let sp = P.speed * (P.onGround ? w.speedAt(P.x, P.z) * w.slopeMul(P.x, P.z, ix, iz) : 1);
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
  // phase 16 : murets et troncs se franchissent en plein saut (P.y), arbres, rochers et menhirs jamais
  w.resolveObstacles(P.x, P.z, 0.4, out2, P.y);
  P.x = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, out2[0]));
  P.z = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, out2[1]));
  const ground = 0; // y = hauteur au-dessus du sol local (phase 18 : le relief est ajouté par le rendu)
  if (!P.onGround) {
    P.vy -= PLAYER.gravity * dt;
    P.y += P.vy * dt;
    if (P.y <= ground) {
      P.y = ground;
      P.vy = 0;
      P.onGround = true;
      w.emit(Ev.Land, P.x, ground, P.z);
      if (w.trait === Trait.Demolisseur) placeMine(w, P.x, P.z); // Sapeur : une mine par atterrissage
      if (w.items[It.Bottes]) landingShockwave(w); // phase 17 : l'atterrissage repousse les ennemis proches
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
  // en l'air : hors de portée du contact (phase 16 : sol plat, plus de plateaux)
  const airborne = P.y >= PLAYER.airborneSafeY;
  let shooters = 0;
  // Épines (phase 17) : le renvoi de dégâts tombe toutes les ITEM.epines.period s, pas à chaque pas (moins de chiffres)
  const sablier = w.items[It.Sablier] === 1; // Sablier fêlé : élites et boss ralentis
  let thorns = false;
  if (w.items[It.Epines]) {
    w.thornT -= dt;
    if (w.thornT <= 0) {
      w.thornT = ITEM.epines.period;
      thorns = true;
    }
  }
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    if (!e.alive) continue;
    const def = ENEMIES[e.type];
    if (e.type === ARCHER_TYPE || e.type === CRACHEUR_TYPE || e.type === SORCIER_TYPE) shooters++;
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
    else if (isCharger(e)) tickCharger(w, e, dt, dx, dz, d, mv);
    else if (e.type === VOLANT_TYPE) tickFlyer(w, e, dt, dx, dz, d, mv);
    else if (e.type === CRACHEUR_TYPE) tickSpitter(w, e, dt, dx, dz, d, mv);
    else if (e.type === ARCHER_TYPE) tickArcher(w, e, dt, dx, dz, d, mv);
    else if (e.type === SORCIER_TYPE) tickSorcier(w, e, dt, dx, dz, d, mv);
    else {
      const sp = def.speed * e.spd;
      mv[0] = (dx / d) * sp;
      mv[1] = (dz / d) * sp;
    }
    const flies = ignoresGround(e.type);
    // phase 16 : un marcheur qui avance vers le joueur suit le champ de flux (il trouve la brèche d'un muret) ;
    // les boss, eux, passent à travers les ouvrages et n'en ont pas besoin
    if (!flies && !def.boss && !(isCharger(e) && e.state === 2)) {
      const mvx = mv[0],
        mvz = mv[1],
        sp2 = mvx * mvx + mvz * mvz;
      if (sp2 > 1e-8 && mvx * dx + mvz * dz > 0) {
        w.flow.steer(e.x, e.z, dx / d, dz / d, fl, e.detour > 0);
        const sp = Math.sqrt(sp2);
        mv[0] = fl[0] * sp;
        mv[1] = fl[1] * sp;
      }
    }
    // phase 17 : Sablier fêlé, élites et boss ralentis
    if (sablier && (e.elite || def.boss)) {
      mv[0] *= ITEM.sablier.slow;
      mv[1] *= ITEM.sablier.slow;
    }
    let mx = mv[0],
      mz = mv[1];
    if (!flies) {
      const slow = w.speedAt(e.x, e.z) * w.slopeMul(e.x, e.z, mx, mz); // lac et pente (phase 18)
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
    if (e.detour > 0) e.detour -= dt;
    if (!flies && !def.boss && w.nearObstacle(e.x, e.z)) {
      // phase 16 : les marcheurs butent sur tous les obstacles (le champ de flux les a déjà orientés vers un passage) ;
      // s'ils n'avancent presque plus, ils suivent le flux case par case un moment (ils glissent autour)
      w.resolveObstacles(e.x, e.z, e.r, out2, 0);
      const want = (mx * mx + mz * mz) * dt * dt,
        gx = out2[0] - e.px,
        gz = out2[1] - e.pz;
      if (want > 1e-6 && gx * gx + gz * gz < want * FLOW.blocked * FLOW.blocked) e.detour = FLOW.detour;
      e.x = out2[0];
      e.z = out2[1];
    }
    e.face = Math.atan2(dx, dz);
    if (e.flash > 0) e.flash -= dt;
    // contact : jamais sur un joueur en l'air ; le Volant ne blesse qu'en plongée (state 2)
    const canHurt = e.type === VOLANT_TYPE ? e.state === 2 : true;
    if (canHurt && d < e.r + PLAYER.radius && !airborne && P.invul <= 0) {
      if (e.state === 2 && isCharger(e)) {
        // charge encaissée : un coup sec, puis la Brute s'essouffle ; brève invulnérabilité (pas de double peine)
        const dmg = HAZARDS.charge.dmg * e.dmgMul * (1 - P.armor);
        P.hp -= dmg;
        hurt += dmg;
        P.invul = Math.max(P.invul, HAZARDS.charge.invul);
        e.state = 3;
        e.timer = HAZARDS.charge.recover;
        w.lastHurt = HurtSrc.Charge;
      } else {
        // phase 17 : Rempart (Vitalité + Halo), le contact d'un ennemi dans le Halo est réduit
        const inHalo = w.syn[Syn.Rempart] && d < w.wstats.aura.r;
        const dmg = def.dmg * e.dmgMul * dt * (1 - P.armor) * (inHalo ? SYN.rempart.dmgTaken : 1);
        P.hp -= dmg;
        hurt += dmg;
        w.lastHurt = HurtSrc.Contact;
        // phase 17 : Épines, le contact est renvoyé (par paquets, toutes les ITEM.epines.period s)
        if (thorns) hitEnemy(w, i, def.dmg * e.dmgMul * ITEM.epines.period * ITEM.epines.mul, 0, P.x, P.z, HitSrc.Thorns);
      }
    }
  }
  w.shooters = shooters;
  if (hurt > 0) {
    w.lastAction = w.t;
    w.hurtAt = w.t;
    w.emit(Ev.PlayerHurt, P.x, P.y + 1, P.z, hurt);
  }
}

/** Projectiles ennemis : crachats (mobiles) et cercles du Colosse (immobiles, explosent à la fin). */
function tickShots(w: World, dt: number): void {
  const P = w.player;
  const airborne = P.y >= PLAYER.airborneSafeY;
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
    if (s.kind === ShotKind.Spit || s.kind === ShotKind.Arrow) {
      // tirs droits : le crachat (au sol) se saute, la flèche non ; les deux s'arrêtent sur un obstacle (phase 16)
      const arrow = s.kind === ShotKind.Arrow;
      if (inside && (arrow || !airborne) && P.invul <= 0) {
        P.hp -= s.dmg * (1 - P.armor);
        hurt += s.dmg * (1 - P.armor);
        w.lastHurt = arrow ? HurtSrc.Arrow : HurtSrc.Spit;
        w.freeShot(i);
        continue;
      }
      if (w.nearObstacle(s.x, s.z) && w.blocksShot(s.x, s.z, s.r)) {
        w.emit(Ev.ShotBlocked, s.x, arrow ? 1 : 0.3, s.z, s.kind);
        w.freeShot(i);
        continue;
      }
      if (s.life <= 0) w.freeShot(i);
    } else if (s.kind === ShotKind.Ring) {
      // onde de choc : le rayon grandit, blesse une fois au passage de l'anneau (au sol)
      s.r += HAZARDS.ring.speed * dt;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (!s.hit && Math.abs(dist - s.r) < HAZARDS.ring.width * 0.5 + PLAYER.radius && !airborne && P.invul <= 0) {
        P.hp -= s.dmg * (1 - P.armor);
        hurt += s.dmg * (1 - P.armor);
        s.hit = true;
        w.lastHurt = HurtSrc.Ring;
      }
      if (s.life <= 0) w.freeShot(i);
    } else if (s.kind === ShotKind.Eruption) {
      if (s.life > 0) {
        // la fissure suit le joueur (plus vite qu'il ne marche) : seuls le saut et le dash l'esquivent
        const dd = Math.sqrt(dx * dx + dz * dz);
        const k = dd > 1e-6 ? Math.min(HAZARDS.eruption.track, dd / dt) / dd : 0;
        s.vx = dx * k;
        s.vz = dz * k;
      } else {
        // pic : blesse et projette le joueur au sol
        w.emit(Ev.Eruption, s.x, 0, s.z, s.r);
        if (inside && !airborne && P.invul <= 0) {
          P.hp -= s.dmg * (1 - P.armor);
          hurt += s.dmg * (1 - P.armor);
          P.vy = HAZARDS.eruption.launch;
          P.onGround = false;
          w.lastHurt = HurtSrc.Eruption;
        }
        w.freeShot(i);
      }
    } else if (s.life <= 0) {
      // zone du Colosse ou boule de feu du Sorcier (phase 16) : explose ; un joueur en l'air y échappe
      w.emit(Ev.ZoneBlast, s.x, 0, s.z, s.r);
      if (inside && !airborne && P.invul <= 0) {
        P.hp -= s.dmg * (1 - P.armor);
        hurt += s.dmg * (1 - P.armor);
        w.lastHurt = s.kind === ShotKind.Fireball ? HurtSrc.Fire : HurtSrc.Zone;
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
