// Dangers à esquiver par le mouvement (phase 11) : éruptions sous les pieds et charge des Brutes élites.
// L'anneau de choc du Gardien est émis dans bosses.ts ; les trois sont résolus dans step.ts (tickShots, stepEnemies).
import { ELITE_TYPE, ENEMIES, HAZARDS, SPAWN } from './balance';
import { Ev, ShotKind } from './types';
import type { Enemy } from './types';
import type { World } from './world';

/** Période entre deux éruptions à l'instant t : 9 s à 2:00 → 4 s à 15:00. */
export function eruptionPeriod(t: number): number {
  const E = HAZARDS.eruption;
  const k = Math.max(0, Math.min(1, (t - E.after) / (E.at - E.after)));
  return E.period0 + (E.period1 - E.period0) * k;
}

/** Déclenche une éruption sous le joueur quand le minuteur tombe : cercle fixe (télégraphe), pic au même endroit. */
export function tickEruptions(w: World): void {
  // phase 37 : minuteur au chrono du monde, cadence et dégâts au temps de difficulté (+ prolongation)
  if (w.stageT < w.nextEruption) return;
  w.nextEruption = w.stageT + eruptionPeriod(w.diffT);
  const s = w.allocShot();
  if (!s) return;
  const E = HAZARDS.eruption;
  const P = w.player;
  s.kind = ShotKind.Eruption;
  s.r = E.r;
  s.x = s.px = P.x;
  s.z = s.pz = P.z;
  s.vx = s.vz = 0;
  s.life = E.telegraph;
  s.dmg = E.dmg * SPAWN.dmgScale(w.diffT) * w.overDmg;
  s.hit = false;
  w.emit(Ev.Telegraph, s.x, 0, s.z, E.r, E.telegraph);
}

/** Le Gardien émet une onde de choc centrée sur lui : rayon qui grandit à `speed`, blesse une fois au passage. */
export function emitRing(w: World, e: Enemy): void {
  const R = HAZARDS.ring;
  const s = w.allocShot();
  if (!s) return;
  s.kind = ShotKind.Ring;
  s.r = e.r;
  s.x = s.px = e.x;
  s.z = s.pz = e.z;
  s.vx = s.vz = 0;
  s.life = (R.maxR - e.r) / R.speed;
  s.dmg = R.dmg * e.dmgMul;
  s.hit = false;
  w.emit(Ev.Ring, e.x, 0, e.z, R.maxR);
}

/** Vrai pour une Brute élite : elle charge en ligne droite après un télégraphe (états 0 poursuite, 1 armé, 2 charge, 3 récupération). */
export function isCharger(e: Enemy): boolean {
  return e.elite && e.type === ELITE_TYPE;
}

/** Déplacement voulu (u/s) d'une Brute élite, écrit dans mv[0], mv[1]. dx/dz/d : vecteur vers le joueur. */
export function tickCharger(w: World, e: Enemy, dt: number, dx: number, dz: number, d: number, mv: Float64Array): void {
  const C = HAZARDS.charge;
  e.timer -= dt;
  if (e.state === 0) {
    const sp = ENEMIES[e.type].speed * e.spd;
    mv[0] = (dx / d) * sp;
    mv[1] = (dz / d) * sp;
    if (e.timer <= 0 && d < C.range) {
      e.state = 1;
      e.timer = C.telegraph;
      e.tx = dx / d;
      e.tz = dz / d;
      w.emit(Ev.Charge, e.x, 0, e.z, C.telegraph, e.x + e.tx * C.dist, 0, e.z + e.tz * C.dist);
    }
  } else if (e.state === 1) {
    mv[0] = mv[1] = 0; // campe sur ses appuis : la ligne au sol est lisible
    if (e.timer <= 0) {
      e.state = 2;
      e.timer = C.dist / C.speed;
    }
  } else if (e.state === 2) {
    mv[0] = e.tx * C.speed;
    mv[1] = e.tz * C.speed;
    if (e.timer <= 0) {
      e.state = 3;
      e.timer = C.recover;
    }
  } else {
    mv[0] = mv[1] = 0; // essoufflée : fenêtre de punition
    if (e.timer <= 0) {
      e.state = 0;
      e.timer = C.period;
    }
  }
}
