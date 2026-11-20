// Monstres corrompus (docs/specs/corrompus.md) : la prolongation de chaque monde devient une autre façon de jouer.
// Un monstre tiré normalement par le spawner devient corrompu (part CORRUPT.share de la prolongation, tirage par w.rng
// seulement en prolongation : une partie qui n'y entre pas tire exactement les mêmes nombres qu'avant). Chaque type a sa
// compétence, qui réutilise un danger existant : la Scission et la Traînée ardente sont ici ; la Ruée passe par la charge
// des Brutes élites (hazards.ts) ; le Bombardier, l'Éventail, la Volée et la Pluie de feu par les scripts des tireurs
// (bosses.ts). Sim pure, aucune allocation par pas.
import { ARCHER_TYPE, CORRUPT, CRACHEUR_TYPE, DARD_TYPE, ELITE_TYPE, ENEMIES, SORCIER_TYPE, VOLANT_TYPE } from './balance';
import { spawnEnemy } from './spawner';
import { Corrupt, Ev, ShotKind, Skill } from './types';
import type { Enemy } from './types';
import type { World } from './world';

/**
 * Des corrompus peuvent-ils apparaître maintenant ? En prolongation d'un monde, et (docs/specs/boss-final.md, décision
 * 11) dans le monde infini d'après le boss final ; jamais au défi du jour (ni dans sa suite en monde infini).
 */
export function corruptOn(w: World): boolean {
  if (w.dailyEnd > 0 || w.noCorrupt) return false;
  return w.endless ? w.endlessCorrupt : w.overT > 0;
}

/** Compétence d'un type de monstre (Skill.None : aucun, les boss). */
function skillOf(type: number): Skill {
  switch (type) {
    case 0:
      return Skill.Split;
    case DARD_TYPE:
      return Skill.Rush;
    case ELITE_TYPE: // la Brute (son type porte aussi les élites)
      return Skill.Trail;
    case VOLANT_TYPE:
      return Skill.Bomb;
    case CRACHEUR_TYPE:
      return Skill.Fan;
    case ARCHER_TYPE:
      return Skill.Volley;
    case SORCIER_TYPE:
      return Skill.Rain;
    default:
      return Skill.None;
  }
}

/**
 * L'ennemi `i` vient d'être tiré par le spawner : en prolongation, il devient corrompu avec la part du moment. Le tirage
 * n'a lieu qu'en prolongation ; une élite (son propre tirage) ou un boss ne passent jamais par ici.
 */
export function maybeCorrupt(w: World, i: number): void {
  if (i < 0 || !corruptOn(w)) return;
  // la même montée qu'en prolongation : depuis la fin du chrono, ou depuis l'entrée en monde infini
  if (w.rng.next() < CORRUPT.share(w.endless ? w.endlessT : w.overT)) corrupt(w, w.enemies[i]);
}

/** Corrompt `e` (un monstre ordinaire, ni élite ni boss) : sa compétence est prête, l'apparition s'annonce. */
export function corrupt(w: World, e: Enemy): void {
  const def = ENEMIES[e.type];
  if (e.elite || def.boss || skillOf(e.type) === Skill.None) return;
  e.corrupt = Corrupt.On;
  w.corrupted++;
  if (e.type === DARD_TYPE) {
    e.state = 0;
    e.timer = CORRUPT.rush.first; // la première Ruée attend qu'il soit arrivé
  } else if (e.type === ELITE_TYPE) e.timer = CORRUPT.trail.every; // la Brute : minuteur de la prochaine flaque
  w.emit(Ev.Corrupt, e.x, e.y, e.z, e.type, 0);
}

/** Spectre corrompu tué : Scission en CORRUPT.split.n éclats, figés CORRUPT.split.wake s, sans XP ni or. */
export function splitCorrupt(w: World, e: Enemy): void {
  const S = CORRUPT.split,
    def = ENEMIES[0];
  let n = 0;
  for (let k = 0; k < S.n; k++) {
    const i = spawnEnemy(w, 0, 0, 0);
    if (i < 0) break;
    const s = w.enemies[i];
    // de part et d'autre du parent, perpendiculairement à la direction du joueur
    const a = e.face + Math.PI / 2 + k * Math.PI;
    s.x = s.px = e.x + Math.sin(a) * S.gap;
    s.z = s.pz = e.z + Math.cos(a) * S.gap;
    s.hp = s.max = e.max * S.hp;
    s.r = def.r * S.r;
    s.spd *= S.spd;
    s.dmgMul = e.dmgMul;
    s.face = e.face;
    s.corrupt = Corrupt.Shard;
    s.timer = S.wake;
    n++;
  }
  if (n > 0) w.emit(Ev.Corrupt, e.x, e.y, e.z, 0, 1, Skill.Split);
}

/**
 * Brute corrompue, Traînée ardente : une flaque de feu derrière elle toutes les CORRUPT.trail.every s, si elle avance et
 * reste à portée de vue du joueur (`d` : sa distance), dans la limite de CORRUPT.trail.max flaques au sol.
 */
export function tickTrail(w: World, e: Enemy, dt: number, d: number): void {
  const T = CORRUPT.trail;
  e.timer -= dt;
  if (e.timer > 0) return;
  e.timer = T.every;
  if (d > T.near || w.flames >= T.max) return;
  const mx = e.x - e.px,
    mz = e.z - e.pz;
  if (mx * mx + mz * mz < 1e-6) return; // à l'arrêt : rien derrière elle
  const s = w.allocShot();
  if (!s) return;
  w.flames++;
  s.kind = ShotKind.Flame;
  s.skill = Skill.Trail;
  s.r = T.r;
  s.x = s.px = e.px;
  s.z = s.pz = e.pz;
  s.vx = s.vz = 0;
  s.life = s.t0 = T.arm + T.dur; // t0 : durée totale (le rendu remplit le disque pendant les `arm` premières s)
  s.dmg = T.dps * e.dmgMul;
  w.emit(Ev.Telegraph, s.x, 0, s.z, T.r, T.arm);
  w.emit(Ev.Corrupt, e.x, e.y, e.z, e.type, 1, Skill.Trail);
}

/** La flaque `s` brûle-t-elle (passé son télégraphe) ? */
export function flameLit(life: number, t0: number): boolean {
  return t0 - life >= CORRUPT.trail.arm;
}

/**
 * Victoire au monde 3 pendant la prolongation : le monde infini n'a pas de corrompus (décision 1). Ceux qui vivent
 * redeviennent des monstres ordinaires (la Ruée armée ou lancée s'arrête, la Brute ne pose plus rien), et les dangers
 * de leurs compétences encore au sol ou en vol (flaques, bombes, crachats, flèches, boules de feu) disparaissent.
 * Appelé une fois, par startEndless : hors de la boucle de jeu.
 */
export function clearCorrupt(w: World): void {
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    if (e.corrupt === Corrupt.None) continue;
    if (e.corrupt === Corrupt.On && (e.type === DARD_TYPE || e.type === ELITE_TYPE)) {
      e.state = 0; // ni couloir, ni sprint, ni flaque en attente : un Dard ou une Brute ordinaires
      e.timer = 0;
    }
    e.corrupt = Corrupt.None;
  }
  for (let i = w.shotCount - 1; i >= 0; i--) if (w.shots[i].skill !== Skill.None || w.shots[i].kind === ShotKind.Flame) w.freeShot(i);
  w.flames = 0;
}
