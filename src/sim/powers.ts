// Phase 35 : bonus au sol. Posés sur la carte devant le joueur et lâchés par les ennemis ; ramassés en marchant
// dessus (jamais attirés par l'aimant) : Aimant (toutes les gemmes), Pluie d'or, Élan, Temps figé, Rage.
import { CAPS, PLAY_LIMIT, POWER } from './balance';
import { Ev, Pw } from './types';
import type { World } from './world';

const out2 = new Float64Array(2);
let weightSum = 0;
for (let i = 0; i < POWER.weights.length; i++) weightSum += POWER.weights[i];

/** Effet temporaire en cours ? */
export function powerActive(w: World, k: Pw): boolean {
  return w.powerT[k] > 0;
}

/** Tirage pondéré d'un bonus (POWER.weights). */
export function rollPowerKind(w: World): Pw {
  let r = w.rng.next() * weightSum;
  for (let i = 0; i < POWER.weights.length; i++) {
    r -= POWER.weights[i];
    if (r < 0) return i as Pw;
  }
  return Pw.Aimant;
}

/** Pose un bonus en (x, z). Pool plein : le plus ancien est remplacé. */
export function dropPower(w: World, x: number, z: number, kind: Pw): void {
  let p = w.allocPower();
  if (!p) {
    let oldest = 0;
    for (let i = 1; i < w.powerCount; i++) if (w.powers[i].age > w.powers[oldest].age) oldest = i;
    p = w.powers[oldest];
  }
  p.x = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, x));
  p.z = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, z));
  p.kind = kind;
  p.age = 0;
  w.powersDropped++;
  w.emit(Ev.PowerDrop, p.x, 0, p.z, kind);
}

/** Tirage au kill (appelé par killEnemy) : rare sur un ennemi normal, fréquent sur une élite, garanti sur un boss. */
export function powerOnKill(w: World, x: number, z: number, elite: boolean, boss: boolean): void {
  if (boss) {
    for (let k = 0; k < POWER.bossDrops; k++) {
      const a = w.rng.range(0, Math.PI * 2);
      dropPower(w, x + Math.sin(a) * POWER.bossScatter, z + Math.cos(a) * POWER.bossScatter, rollPowerKind(w));
    }
    return;
  }
  if (w.rng.next() < (elite ? POWER.eliteChance : POWER.killChance)) dropPower(w, x, z, rollPowerKind(w));
}

/** Bonus de carte : devant le joueur (cône autour de sa direction), sur une place libre hors du lac. */
function dropOnMap(w: World): void {
  const P = w.player;
  const base = Math.atan2(P.dirX, P.dirZ);
  let x = P.x,
    z = P.z;
  for (let k = 0; k < POWER.placeTries; k++) {
    const a = base + w.rng.range(-POWER.mapCone, POWER.mapCone),
      d = w.rng.range(POWER.mapDist[0], POWER.mapDist[1]);
    w.resolveObstacles(P.x + Math.sin(a) * d, P.z + Math.cos(a) * d, POWER.pickupR, out2, 0);
    x = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, out2[0]));
    z = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, out2[1]));
    if (!w.nearObstacle(x, z) && w.speedAt(x, z) >= POWER.mapMinGround) break;
  }
  dropPower(w, x, z, rollPowerKind(w));
}

/** Applique un bonus ramassé. */
export function applyPower(w: World, kind: Pw): void {
  if (kind === Pw.Aimant) for (let g = 0; g < w.gemCount; g++) w.gems[g].mag = true;
  else w.powerT[kind] = POWER.dur[kind];
  w.powersTaken++;
}

export function tickPowers(w: World, dt: number): void {
  // durées des effets
  for (let k = 0; k < w.powerT.length; k++) {
    if (w.powerT[k] <= 0) continue;
    w.powerT[k] -= dt;
    if (w.powerT[k] <= 0) {
      w.powerT[k] = 0;
      w.emit(Ev.PowerEnd, w.player.x, 0, w.player.z, k);
    }
  }
  // bonus de carte
  if (w.t >= w.powerNext) {
    w.powerNext = w.t + w.rng.range(POWER.mapEvery[0], POWER.mapEvery[1]);
    if (w.powerCount < CAPS.powers) dropOnMap(w);
  }
  // durée de vie et ramassage
  const P = w.player;
  const r2 = POWER.pickupR * POWER.pickupR;
  for (let i = w.powerCount - 1; i >= 0; i--) {
    const p = w.powers[i];
    p.age += dt;
    const dx = P.x - p.x,
      dz = P.z - p.z;
    if (dx * dx + dz * dz < r2) {
      applyPower(w, p.kind);
      w.emit(Ev.PowerUp, p.x, 0.6, p.z, p.kind, POWER.dur[p.kind]);
      w.freePower(i);
    } else if (p.age >= POWER.life) w.freePower(i);
  }
}
