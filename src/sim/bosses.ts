// Scripts des boss (survivor-design §7) : 2 attaques télégraphiées + phase à 50 % PV, 45–90 s.
// Chaque script écrit le déplacement voulu dans `mv` (u/s) ; les dégâts de contact restent gérés par step.ts.
import { ARCHER, BOSS, BOSS_TYPE, COLOSSUS_TYPE, CRACHEUR, DARD_TYPE, ENEMIES, HAZARDS, REAPER_TYPE, SORCIER, SWARM_TYPE, VOLANT, VOLANT_TYPE } from './balance';
import { emitRing } from './hazards';
import { spawnEnemy } from './spawner';
import { Ev, ShotKind } from './types';
import type { Enemy } from './types';
import type { World } from './world';

const TAU = Math.PI * 2;

/** Déplacement (u/s) décidé par le script du boss `e`, écrit dans mv[0], mv[1]. dx/dz/d : vecteur vers le joueur. */
export function tickBoss(w: World, e: Enemy, dt: number, dx: number, dz: number, d: number, mv: Float64Array): void {
  const def = ENEMIES[e.type];
  const sp = def.speed * e.spd;
  const ux = dx / d,
    uz = dz / d;
  if (!e.phase2 && e.hp <= e.max * BOSS.phase2At) e.phase2 = true;
  mv[0] = ux * sp;
  mv[1] = uz * sp;
  e.timer -= dt;
  switch (e.type) {
    case BOSS_TYPE: {
      // Gardien : approche, puis recul + rugissement 0,8 s, puis charge en ligne 1 s. Phase 2 : charges 2× plus fréquentes.
      if (e.state === 0 && e.timer <= 0 && d < BOSS.chargeRange) {
        e.state = 1;
        e.timer = BOSS.chargeTelegraph;
        e.tx = ux;
        e.tz = uz;
        w.emit(Ev.BossRoar, e.x, e.y, e.z, BOSS.chargeTelegraph, e.tx, 0, e.tz);
      } else if (e.state === 1) {
        mv[0] = -e.tx * BOSS.chargeBack; // recul
        mv[1] = -e.tz * BOSS.chargeBack;
        if (e.timer <= 0) {
          e.state = 2;
          e.timer = BOSS.chargeTime;
        }
      } else if (e.state === 2) {
        mv[0] = e.tx * BOSS.chargeSpeed;
        mv[1] = e.tz * BOSS.chargeSpeed;
        if (e.timer <= 0) {
          e.state = 0;
          e.timer = e.phase2 ? BOSS.chargePeriod / 2 : BOSS.chargePeriod;
        }
      }
      // phase 11 : onde de choc périodique (hors charge), à sauter ; phase 2 : deux fois plus souvent
      e.aim -= dt;
      if (e.aim <= 0 && e.state !== 2) {
        e.aim = e.phase2 ? HAZARDS.ring.period / 2 : HAZARDS.ring.period;
        emitRing(w, e);
      }
      break;
    }
    case SWARM_TYPE: {
      // Essaim-mère : avance lentement et pond des Dards en anneau ; phase 2 : pontes plus grosses
      if (e.timer <= 0) {
        e.timer = BOSS.swarmPeriod;
        const n = e.phase2 ? BOSS.swarmN2 : BOSS.swarmN;
        const px = w.player.x,
          pz = w.player.z;
        w.player.x = e.x;
        w.player.z = e.z; // spawnEnemy place autour du joueur : on vise la mère le temps de l'appel
        for (let i = 0; i < n; i++) spawnEnemy(w, DARD_TYPE, (i / n) * TAU, BOSS.swarmDist);
        w.player.x = px;
        w.player.z = pz;
        e.state = 1; // pulsation côté rendu
        e.aim = BOSS.swarmPulse;
      }
      if (e.aim > 0) {
        e.aim -= dt;
        if (e.aim <= 0) e.state = 0;
      }
      break;
    }
    case COLOSSUS_TYPE: {
      // Colosse : cercles rouges au sol autour du joueur (télégraphe 1 s) puis explosion ; phase 2 : 5 cercles
      if (e.timer <= 0) {
        e.timer = BOSS.zonePeriod;
        const n = e.phase2 ? BOSS.zoneN2 : BOSS.zoneN;
        for (let i = 0; i < n; i++) {
          const s = w.allocShot();
          if (!s) break;
          const a = w.rng.range(0, TAU),
            r = i === 0 ? 0 : w.rng.range(1.5, BOSS.zoneSpread); // le premier cercle est sous le joueur
          s.kind = ShotKind.Zone;
          s.r = BOSS.zoneR;
          s.x = s.px = w.player.x + Math.sin(a) * r;
          s.z = s.pz = w.player.z + Math.cos(a) * r;
          s.vx = s.vz = 0;
          s.life = BOSS.zoneTelegraph;
          s.dmg = BOSS.zoneDmg * e.dmgMul;
          w.emit(Ev.Telegraph, s.x, 0, s.z, BOSS.zoneR, BOSS.zoneTelegraph);
        }
      }
      break;
    }
    case REAPER_TYPE:
      // Faucheur : droit sur le joueur, plus vite que lui, rien ne l'arrête (ni lac, ni recul : kbMul 0)
      break;
  }
}

/** Les types qui ne subissent ni séparation ni lacs : volent ou sont inarrêtables. */
export function ignoresGround(type: number): boolean {
  return type === VOLANT_TYPE || type === REAPER_TYPE;
}

/**
 * Volant : plane à VOLANT.hover, puis télégraphe (ombre qui grossit) et plonge sur la position du joueur ;
 * ne blesse qu'au sol pendant la plongée (state 2). Écrit le déplacement dans mv.
 */
export function tickFlyer(w: World, e: Enemy, dt: number, dx: number, dz: number, d: number, mv: Float64Array): void {
  const def = ENEMIES[e.type];
  const sp = def.speed * e.spd;
  e.timer -= dt;
  if (e.state === 0) {
    // approche en planant
    mv[0] = (dx / d) * sp;
    mv[1] = (dz / d) * sp;
    e.y += (VOLANT.hover - e.y) * Math.min(1, dt * 6);
    if (e.timer <= 0 && d < VOLANT.diveRange) {
      e.state = 1;
      e.timer = VOLANT.telegraph;
      e.tx = w.player.x;
      e.tz = w.player.z;
      w.emit(Ev.Dive, e.x, e.y, e.z, VOLANT.telegraph);
    }
  } else if (e.state === 1) {
    // télégraphe : ralentit, vise la position mémorisée
    mv[0] = (dx / d) * sp * VOLANT.telegraphSlow;
    mv[1] = (dz / d) * sp * VOLANT.telegraphSlow;
    if (e.timer <= 0) {
      e.state = 2;
      e.timer = VOLANT.diveTime;
      const tx = e.tx - e.x,
        tz = e.tz - e.z,
        tl = Math.sqrt(tx * tx + tz * tz) || 1;
      e.tx = tx / tl;
      e.tz = tz / tl;
    }
  } else {
    // plongée au sol en ligne droite
    mv[0] = e.tx * VOLANT.diveSpeed;
    mv[1] = e.tz * VOLANT.diveSpeed;
    e.y += (0.3 - e.y) * Math.min(1, dt * 14);
    if (e.timer <= 0) {
      e.state = 0;
      e.timer = VOLANT.divePeriod;
    }
  }
}

/** Garder ses distances : approche au-delà de max, recule en deçà de min, tourne autour entre les deux. */
function keepDistance(ux: number, uz: number, sp: number, d: number, min: number, max: number, orbit: number, mv: Float64Array): void {
  if (d > max) {
    mv[0] = ux * sp;
    mv[1] = uz * sp;
  } else if (d < min) {
    mv[0] = -ux * sp;
    mv[1] = -uz * sp;
  } else {
    mv[0] = -uz * sp * orbit;
    mv[1] = ux * sp * orbit;
  }
}

/** Cracheur : garde ses distances (7–9 u), vise 0,6 s puis crache un projectile lent au sol. */
export function tickSpitter(w: World, e: Enemy, dt: number, dx: number, dz: number, d: number, mv: Float64Array): void {
  const C = CRACHEUR;
  const def = ENEMIES[e.type];
  const sp = def.speed * e.spd;
  const ux = dx / d,
    uz = dz / d;
  keepDistance(ux, uz, sp, d, C.keepMin, C.keepMax, C.orbit, mv);
  e.timer -= dt;
  if (e.state === 0) {
    e.aim = 0;
    if (e.timer <= 0 && d < C.keepMax + C.fireMargin) {
      e.state = 1;
      e.timer = C.aim;
    }
  } else {
    e.aim = 1 - Math.max(0, e.timer / C.aim);
    if (e.timer <= 0) {
      e.state = 0;
      e.timer = C.period;
      const s = w.allocShot();
      if (s) {
        s.kind = ShotKind.Spit;
        s.r = C.shotR;
        s.x = s.px = e.x;
        s.z = s.pz = e.z;
        s.vx = ux * C.shotSpeed;
        s.vz = uz * C.shotSpeed;
        s.life = C.shotLife;
        s.dmg = C.shotDmg * e.dmgMul;
        w.emit(Ev.Spit, e.x, e.y, e.z, 0, ux, 0, uz);
      }
    }
  }
}

/**
 * Archer (phase 16) : garde 10–13 u, vise 0,5 s (ligne fine, e.aim) puis tire une flèche rapide en ligne droite ;
 * l'élite tire une volée en éventail. La flèche part dans la direction visée au début du tir : on l'esquive en bougeant.
 */
export function tickArcher(w: World, e: Enemy, dt: number, dx: number, dz: number, d: number, mv: Float64Array): void {
  const A = ARCHER;
  const def = ENEMIES[e.type];
  const sp = def.speed * e.spd;
  const ux = dx / d,
    uz = dz / d;
  if (e.state === 1) {
    mv[0] = mv[1] = 0; // immobile pendant la visée : lisible
  } else keepDistance(ux, uz, sp, d, A.keepMin, A.keepMax, A.orbit, mv);
  e.timer -= dt;
  if (e.state === 0) {
    e.aim = 0;
    if (e.timer <= 0 && d < A.keepMax + A.fireMargin) {
      e.state = 1;
      e.timer = A.aim;
      e.tx = ux; // direction visée, figée : la ligne de visée ne suit pas le joueur
      e.tz = uz;
    }
  } else {
    e.aim = 1 - Math.max(0, e.timer / A.aim);
    if (e.timer <= 0) {
      e.state = 0;
      e.timer = A.period * w.rng.range(0.85, 1.15); // désynchronisés
      const n = e.elite ? A.volley : 1;
      for (let k = 0; k < n; k++) {
        const s = w.allocShot();
        if (!s) break;
        const a = (k - (n - 1) / 2) * A.spread,
          c = Math.cos(a),
          sn = Math.sin(a),
          vx = e.tx * c - e.tz * sn,
          vz = e.tx * sn + e.tz * c;
        s.kind = ShotKind.Arrow;
        s.r = A.shotR;
        s.x = s.px = e.x + vx * (e.r + 0.2);
        s.z = s.pz = e.z + vz * (e.r + 0.2);
        s.vx = vx * A.shotSpeed;
        s.vz = vz * A.shotSpeed;
        s.life = A.shotLife;
        s.dmg = A.shotDmg * e.dmgMul;
        s.hit = false;
      }
      w.emit(Ev.Arrow, e.x, e.y, e.z, n, e.tx, 0, e.tz);
    }
  }
}

/**
 * Sorcier (phase 16) : garde 12–15 u, lève les mains 0,35 s (e.aim) puis lance une boule de feu en cloche qui retombe
 * là où était le joueur après SORCIER.cast s ; un cercle rouge se remplit au sol pendant le vol.
 */
export function tickSorcier(w: World, e: Enemy, dt: number, dx: number, dz: number, d: number, mv: Float64Array): void {
  const S = SORCIER;
  const def = ENEMIES[e.type];
  const sp = def.speed * e.spd;
  const ux = dx / d,
    uz = dz / d;
  keepDistance(ux, uz, sp, d, S.keepMin, S.keepMax, S.orbit, mv);
  e.timer -= dt;
  if (e.state === 0) {
    e.aim = 0;
    if (e.timer <= 0 && d < S.keepMax + S.fireMargin) {
      e.state = 1;
      e.timer = S.windup;
    }
  } else {
    e.aim = 1 - Math.max(0, e.timer / S.windup);
    if (e.timer <= 0) {
      e.state = 0;
      e.timer = S.period * w.rng.range(0.85, 1.15);
      const s = w.allocShot();
      if (s) {
        s.kind = ShotKind.Fireball;
        s.r = S.r;
        s.x = s.px = w.player.x;
        s.z = s.pz = w.player.z;
        s.vx = s.vz = 0;
        s.ox = e.x;
        s.oz = e.z;
        s.life = s.t0 = S.cast;
        s.dmg = S.dmg * e.dmgMul;
        s.hit = false;
        w.emit(Ev.Cast, e.x, e.y + 0.8, e.z, S.r, s.x, S.cast, s.z);
        w.emit(Ev.Telegraph, s.x, 0, s.z, S.r, S.cast);
      }
    }
  }
}
