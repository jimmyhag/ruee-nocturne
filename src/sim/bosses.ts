// Scripts des boss (survivor-design §7) : 2 attaques télégraphiées + phase à 50 % PV, 45–90 s.
// Chaque script écrit le déplacement voulu dans `mv` (u/s) ; les dégâts de contact restent gérés par step.ts.
import { ARCHER, BOSS, BOSS_TYPE, COLOSSUS_TYPE, CRACHEUR, DARD_TYPE, ENEMIES, HAZARDS, REAPER_TYPE, SLIDE, SORCIER, SWARM_TYPE, VOLANT, VOLANT_TYPE } from './balance';
import { emitRing } from './hazards';
import { spawnEnemy } from './spawner';
import { Ev, ShotKind } from './types';
import type { Enemy } from './types';
import type { World } from './world';

const TAU = Math.PI * 2;

/** Cercle au sol qui explose après `telegraph` s (zones du Colosse, Traque des boss). Pris dans le pool de tirs. */
function zoneAt(w: World, x: number, z: number, r: number, telegraph: number, dmg: number): void {
  const s = w.allocShot();
  if (!s) return;
  s.kind = ShotKind.Zone;
  s.r = r;
  s.x = s.px = x;
  s.z = s.pz = z;
  s.vx = s.vz = 0;
  s.life = s.t0 = telegraph; // t0 : durée totale, pour le remplissage du disque au rendu
  s.dmg = dmg;
  w.emit(Ev.Telegraph, x, 0, z, r, telegraph);
}

/** Déplacement (u/s) décidé par le script du boss `e`, écrit dans mv[0], mv[1]. dx/dz/d : vecteur vers le joueur. */
export function tickBoss(w: World, e: Enemy, dt: number, dx: number, dz: number, d: number, mv: Float64Array): void {
  const def = ENEMIES[e.type];
  const ux = dx / d,
    uz = dz / d;
  if (!e.phase2 && e.hp <= e.max * BOSS.phase2At) e.phase2 = true;
  // phase 43 : rage. Les recharges d'attaque défilent `haste` fois plus vite (dtA), les télégraphes gardent leur durée (dt)
  e.age += dt;
  if (!e.enraged && e.age >= BOSS.enrage.after && e.type !== REAPER_TYPE && (w.endless || w.isTotemBoss(e))) {
    e.enraged = true;
    w.emit(Ev.BossEnrage, e.x, e.y, e.z, e.type);
  }
  const dtA = (e.enraged ? dt * BOSS.enrage.haste : dt) * e.cadence;
  const sp = def.speed * e.spd * (e.enraged ? BOSS.enrage.speed : 1);
  mv[0] = ux * sp;
  mv[1] = uz * sp;
  // phase 45, Traque : salve de cercles sous les pieds du joueur, un tous les `every` s ; un sur deux vise en avance
  const H = BOSS.hunt[e.type];
  if (H) {
    e.huntT -= e.hunt > 0 ? dt : dtA; // la rage rapproche les salves, pas les cercles d'une salve
    if (e.huntT <= 0) {
      if (e.hunt === 0) {
        // boss du totem et du monde infini : salve entière ; boss de survie (3:00 et 7:00, kit encore faible) : réduite
        const n = e.phase2 ? H.n2 : H.n;
        e.hunt = w.endless || w.isTotemBoss(e) ? n : Math.round(n * BOSS.huntSurvival);
      }
      if (e.hunt === 0) e.huntT = H.period;
      else {
        e.hunt--;
        e.huntT = e.hunt > 0 ? H.every : H.period;
        const P = w.player;
        let tx = P.x,
          tz = P.z;
        if (e.hunt % 2 === 1) {
          // vitesse du joueur sur le dernier pas, bornée (téléportation de debug, envol)
          let vx = (P.x - P.px) / dt,
            vz = (P.z - P.pz) / dt;
          const v = Math.sqrt(vx * vx + vz * vz);
          if (v > BOSS.huntVmax) {
            vx *= BOSS.huntVmax / v;
            vz *= BOSS.huntVmax / v;
          }
          tx += vx * H.lead;
          tz += vz * H.lead;
        }
        zoneAt(w, tx, tz, H.r, H.telegraph, H.dmg * e.dmgMul);
      }
    }
  }
  switch (e.type) {
    case BOSS_TYPE: {
      // Gardien : approche, puis recul + rugissement 0,8 s, puis charge en ligne 1 s. Phase 2 : charges 2× plus fréquentes.
      e.timer -= e.state === 0 ? dtA : dt;
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
          e.combo = 0;
        }
      } else if (e.state === 2) {
        mv[0] = e.tx * BOSS.chargeSpeed;
        mv[1] = e.tz * BOSS.chargeSpeed;
        if (e.timer <= 0) {
          e.state = 0;
          e.timer = e.phase2 ? BOSS.chargePeriod / 2 : BOSS.chargePeriod;
          // phase 45, Éclats : la charge finit sur une étoile de projectiles au sol (le Sillage, posé derrière lui,
          // ne menaçait personne)
          const B = BOSS.burst,
            n = e.phase2 ? B.n2 : B.n,
            a0 = w.rng.range(0, TAU);
          let fired = 0;
          for (let k = 0; k < n; k++) {
            const s = w.allocShot();
            if (!s) break;
            fired++;
            const a = a0 + (k / n) * TAU,
              vx = Math.sin(a),
              vz = Math.cos(a);
            s.kind = ShotKind.Spit;
            s.boss = true;
            s.r = B.r;
            s.x = s.px = e.x + vx * e.r;
            s.z = s.pz = e.z + vz * e.r;
            s.vx = vx * B.speed;
            s.vz = vz * B.speed;
            s.life = B.life;
            s.dmg = B.dmg * e.dmgMul;
          }
          if (fired > 0) w.emit(Ev.Spit, e.x, e.y, e.z, 0, e.tx, 0, e.tz);
        }
      }
      // phase 11 : onde de choc périodique (hors charge), à sauter ; phase 2 : deux fois plus souvent
      e.aim -= dtA;
      if (e.aim <= 0 && e.state !== 2) {
        e.aim = e.phase2 ? HAZARDS.ring.period / 2 : HAZARDS.ring.period;
        emitRing(w, e);
        if (e.phase2) e.t2 = BOSS.ring2; // phase 43, double onde : la seconde suit
      }
      if (e.t2 > 0 && e.state !== 2) {
        // jamais pendant la charge (relecture perf) : deux dangers à sauter coup sur coup
        e.t2 -= dt;
        if (e.t2 <= 0) emitRing(w, e);
      }
      break;
    }
    case SWARM_TYPE: {
      // Essaim-mère : avance lentement et pond des Dards en anneau ; phase 2 : pontes plus grosses
      e.timer -= dtA;
      if (e.timer <= 0) {
        e.timer = BOSS.swarmPeriod;
        const n = e.phase2 ? BOSS.swarmN2 : BOSS.swarmN;
        const px = w.player.x,
          pz = w.player.z;
        w.player.x = e.x;
        w.player.z = e.z; // spawnEnemy place autour du joueur : on vise la mère le temps de l'appel
        for (let i = 0; i < n; i++) spawnEnemy(w, DARD_TYPE, (i / n) * TAU, BOSS.swarmDist);
        // phase 43 : en phase 2, deux Volants sortent avec la ponte
        if (e.phase2) for (let i = 0; i < BOSS.swarmFlyers2; i++) spawnEnemy(w, VOLANT_TYPE, ((i + 0.5) / BOSS.swarmFlyers2) * TAU, BOSS.swarmDist);
        w.player.x = px;
        w.player.z = pz;
        if (e.combo === 0) {
          e.state = 1; // pulsation côté rendu
          e.aim = BOSS.swarmPulse;
        }
      }
      // phase 43, Salve : elle gonfle (state 1, `windup` s) puis crache un éventail vers le joueur
      const V = BOSS.volley;
      e.t2 -= dtA;
      if (e.t2 <= 0 && e.combo === 0 && d < V.range) {
        e.t2 = V.period;
        e.combo = 1; // salve armée
        e.state = 1;
        e.aim = V.windup;
        e.tx = ux;
        e.tz = uz;
        w.emit(Ev.BossRoar, e.x, e.y, e.z, V.windup, ux, 0, uz);
      }
      if (e.aim > 0) {
        e.aim -= dt;
        if (e.aim <= 0) {
          e.state = 0;
          if (e.combo === 1) {
            e.combo = 0;
            const n = e.phase2 ? V.n2 : V.n;
            let fired = 0;
            for (let k = 0; k < n; k++) {
              const s = w.allocShot();
              if (!s) break;
              fired++;
              const a = (k - (n - 1) / 2) * V.spread,
                c = Math.cos(a),
                sn = Math.sin(a),
                vx = e.tx * c - e.tz * sn,
                vz = e.tx * sn + e.tz * c;
              s.kind = ShotKind.Spit;
              s.boss = true;
              s.r = V.r;
              s.x = s.px = e.x + vx * e.r;
              s.z = s.pz = e.z + vz * e.r;
              s.vx = vx * V.speed;
              s.vz = vz * V.speed;
              s.life = V.life;
              s.dmg = V.dmg * e.dmgMul;
            }
            if (fired > 0) w.emit(Ev.Spit, e.x, e.y, e.z, 0, e.tx, 0, e.tz); // pas de son sans projectile (pool plein)
          }
        }
      }
      break;
    }
    case COLOSSUS_TYPE: {
      // Colosse : cercles rouges au sol autour du joueur (télégraphe 1 s) puis explosion ; phase 2 : 5 cercles
      e.timer -= dtA;
      if (e.timer <= 0) {
        e.timer = BOSS.zonePeriod;
        const dmg = BOSS.zoneDmg * e.dmgMul;
        e.combo++;
        if (e.phase2 && e.combo % 2 === 0) {
          // phase 43, croix (phase 2, une attaque sur deux) : le centre sous le joueur, `arm` cercles sur chaque bras
          const X = BOSS.cross,
            a0 = w.rng.range(0, TAU);
          zoneAt(w, w.player.x, w.player.z, BOSS.zoneR, BOSS.zoneTelegraph, dmg);
          for (let b = 0; b < 4; b++) {
            const a = a0 + (b * TAU) / 4,
              sx = Math.sin(a),
              cz = Math.cos(a);
            for (let k = 1; k <= X.arm; k++)
              zoneAt(w, w.player.x + sx * X.step * k, w.player.z + cz * X.step * k, BOSS.zoneR, BOSS.zoneTelegraph, dmg);
          }
        } else {
          const n = e.phase2 ? BOSS.zoneN2 : BOSS.zoneN;
          for (let i = 0; i < n; i++) {
            const a = w.rng.range(0, TAU),
              r = i === 0 ? 0 : w.rng.range(1.5, BOSS.zoneSpread); // le premier cercle est sous le joueur
            zoneAt(w, w.player.x + Math.sin(a) * r, w.player.z + Math.cos(a) * r, BOSS.zoneR, BOSS.zoneTelegraph, dmg);
          }
        }
      }
      // phase 43, onde de choc : le joueur est collé à lui → un cercle se remplit sous le Colosse, puis l'onde part
      const Q = BOSS.quake;
      if (e.aim > 0) {
        e.aim -= dt;
        if (e.aim <= 0) {
          e.state = 0;
          emitRing(w, e);
        }
      } else {
        e.t2 -= dtA;
        if (e.t2 <= 0 && d < Q.range) {
          e.t2 = Q.period;
          e.aim = Q.windup;
          e.state = 1; // geste côté rendu
          // cercle d'annonce sous le Colosse : un tir Zone sans dégâts (le rendu ne dessine que les tirs) ; l'onde
          // part de lui quand il est plein
          zoneAt(w, e.x, e.z, Q.r, Q.windup, 0);
          w.emit(Ev.BossRoar, e.x, e.y, e.z, Q.windup, ux, 0, uz);
        }
      }
      break;
    }
    case REAPER_TYPE: {
      // Faucheur : droit sur le joueur, plus vite que lui, rien ne l'arrête (ni lac, ni recul : kbMul 0) ; phase 27 : ni
      // la glisse ni les descentes ne le distancent (au moins 1,1 × la vitesse lissée du joueur)
      const v = Math.max(sp, w.player.spd * SLIDE.reaperMul);
      mv[0] = ux * v;
      mv[1] = uz * v;
      break;
    }
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
        s.x = s.px = e.x + vx * (e.r + A.muzzle);
        s.z = s.pz = e.z + vz * (e.r + A.muzzle);
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
