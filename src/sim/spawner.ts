import { ARCHER, ARCHER_TYPE, BOSS, BOSS_TYPE, CAPS, CRACHEUR_TYPE, DIFFICULTY, ELITE, FIRST_RUNS, ELITE_TYPE, SORCIER_TYPE, ENEMIES, HAZARDS, SPAWN, STAGE, TUTORIAL, VOLANT, VOLANT_TYPE } from './balance';
import { Corrupt, Ev } from './types';
import { maybeCorrupt } from './corrupt';
import type { World } from './world';

const TAU = Math.PI * 2;

/** Difficulté ajoutée de la partie (phase 48), bornée : 0 au départ. */
export const difficultyOf = (w: World): number => w.player.difficulty; // phase 50 : sans plafond
/** Vie des monstres selon la difficulté : ×1 au départ (les boss la prennent aussi, stages.ts). */
export const difficultyHp = (w: World): number => 1 + DIFFICULTY.hpShare * difficultyOf(w);

/**
 * Lot L2 : adoucissement des deux premières parties (`k` : w.softHp, w.softDmg ou w.softRate, 1 pour les autres),
 * pendant les FIRST_RUNS.until premières secondes de jeu seulement : il vise les morts du début sans allonger la partie.
 */
export const soft = (w: World, k: number): number => (w.t < FIRST_RUNS.until ? k : 1);

/** Partie guidée (docs/specs/tutoriel.md, décision 11) : PV et dégâts des monstres du monde 1 (1 hors partie guidée). */
const tutorialHp = (w: World): number => (w.tutorial && w.stage === 0 ? TUTORIAL.hp : 1);
const tutorialDmg = (w: World): number => (w.tutorial && w.stage === 0 ? TUTORIAL.dmg : 1);
/**
 * Dégâts d'un monstre qui apparaît maintenant (difficulté du monde, prolongation, premières parties adoucies, partie
 * guidée). `boss` : le boss du totem et ses doubles, qui restent des boss normaux dans la partie guidée (décision 16).
 */
export const dmgMulNow = (w: World, boss = false): number =>
  SPAWN.dmgScale(w.diffT) * w.overDmg * soft(w, w.softDmg) * (boss ? 1 : tutorialDmg(w));
/**
 * Partie guidée (docs/specs/tutoriel.md, décisions 3 et 6) : apparitions × TUTORIAL.spawn pendant les cinq minutes des
 * gestes et des lieux, × TUTORIAL.wait quand le guide mène au totem du monde et jusqu'à son activation ; 1 sinon.
 */
export function tutorialRate(w: World): number {
  if (!w.tutorial || w.stage > 0) return 1;
  if (w.t < TUTORIAL.learnUntil) return TUTORIAL.spawn;
  return w.totem.state === 0 && w.stageT >= TUTORIAL.forceAt ? TUTORIAL.wait : 1;
}

/** Multiplicateurs des monstres (phase 53) : voir enemyIntensity. */
export interface Intensity {
  hp: number;
  dmg: number;
  spd: number;
  rate: number;
}
/**
 * Phase 53 (demande de Jimmy : « voir l'intensité des ennemis ») : ce que valent les monstres ordinaires qui
 * apparaissent maintenant, par rapport au tout début d'une partie. PV, dégâts et vitesse reprennent les termes de
 * spawnEnemy ; `rate` ceux de tickSpawner, sans ses à-coups (accalmie d'un boss, compensation d'ennui). Range le
 * résultat dans `out` : lue par le HUD à chaque image, aucune allocation.
 */
export function enemyIntensity(w: World, out: Intensity): Intensity {
  const t = w.diffT,
    R = w.rule(); // défi v2 : la règle du jour
  out.hp = SPAWN.hpScale(t) * w.overHp * difficultyHp(w) * R.hp;
  out.dmg = SPAWN.dmgScale(t) * w.overDmg;
  out.spd = SPAWN.spdScale(t) * w.overSpd * R.spd;
  out.rate = (SPAWN.rate(t) / SPAWN.rate(0)) * w.overRate * (1 + difficultyOf(w)) * R.rate;
  return out;
}

export function spawnEnemy(w: World, type: number, ang: number, dist: number, elite = false): number {
  const e = w.allocEnemy();
  if (!e) return -1;
  const def = ENEMIES[type],
    R = w.rule(); // défi v2 : vie et vitesse de la règle du jour (NO_RULE hors défi)
  // phase 37 : difficulté au temps du monde (diffT) et renfort de prolongation (over*, 1 tant que le chrono tourne)
  // lot L2 : PV et dégâts (et cadence dans tickSpawner) adoucis au début des deux premières parties (soft)
  let scale =
    SPAWN.hpScale(w.diffT) * w.overHp * (def.boss ? 1 + w.bossCount * STAGE.bossHpPerBoss : 1) * difficultyHp(w) * soft(w, w.softHp) * R.hp * tutorialHp(w);
  if (elite) scale *= ELITE.hpMul;
  e.type = type;
  e.elite = elite;
  e.r = def.r * (elite ? ELITE.rMul : 1);
  e.x = e.px = w.player.x + Math.sin(ang) * dist;
  e.z = e.pz = w.player.z + Math.cos(ang) * dist;
  e.y = type === VOLANT_TYPE ? VOLANT.hover : def.y; // Volant : hauteur de vol, les autres : hauteur de rendu
  e.hp = e.max = def.hp * scale;
  e.kx = e.kz = 0;
  e.flash = 0;
  e.lastBlade = -9;
  e.lastBoom = -9;
  e.lastLance = -9;
  e.lanceBits = 0;
  e.lastPatins = -9;
  e.face = 0;
  e.spd = w.rng.range(0.9, 1.1) * SPAWN.spdScale(w.diffT) * w.overSpd * R.spd;
  e.dmgMul = dmgMulNow(w); // partie guidée : monde 1 plus doux
  e.bob = w.rng.range(0, TAU);
  e.state = 0;
  // plongées et premiers tirs désynchronisés (phase 16 : un tireur qui arrive ne tire pas tout de suite)
  e.timer = type === VOLANT_TYPE ? w.rng.range(0.5, VOLANT.divePeriod) : type === ARCHER_TYPE || type === SORCIER_TYPE ? w.rng.range(ARCHER.firstShot[0], ARCHER.firstShot[1]) : 0;
  e.aim = type === BOSS_TYPE ? HAZARDS.ring.first : 0; // Gardien : minuteur de l'anneau de choc (phase 11)
  if (elite && type === ELITE_TYPE) e.timer = HAZARDS.charge.first; // Brute élite : première charge différée
  e.tx = e.tz = 0;
  e.phase2 = false;
  e.t2 = def.boss && type !== BOSS_TYPE ? BOSS.second.first : 0; // phase 43 : seconde attaque (Essaim-mère, Colosse), différée ; Gardien : seconde onde en attente
  e.age = 0;
  e.enraged = false;
  e.totemExtra = false;
  e.cadence = 1;
  e.combo = 0;
  e.hunt = 0;
  e.huntT = BOSS.huntFirst; // phase 45 : première Traque d'un boss peu après son arrivée
  e.detour = 0;
  e.stun = 0;
  e.slowT = 0;
  e.burn = e.burnT = e.burnAcc = 0;
  e.tox = e.toxT = e.toxAcc = 0; // phase 50
  e.corrupt = Corrupt.None; // corrompus : maybeCorrupt (tickSpawner) ou splitCorrupt le décident après coup
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
  // phase 37 : la difficulté suit le temps du monde (diffT) ; élites et vagues suivent le chrono du monde (stageT) ;
  // plus de boss à heure fixe (le totem appelle le boss du monde, stages.ts)
  const t = w.diffT,
    st = w.stageT,
    now = w.t;
  // boss du monde en vie : la horde se calme (pas en prolongation : elle ne doit pas amortir le renfort)
  // phase 42 : seule la présence du boss du totem (ou d'une vague du monde infini) calme la horde, pas un boss de survie
  // phase 48 : tant qu'un boss du totem vit ; défi v2 : le boss final est celui du totem du monde 1, la horde se calme aussi
  const calm = w.endless ? w.bossIndex >= 0 : w.totemAlive > 0 || w.totemBossId >= 0 || w.dailyBoss === 1;
  const R = w.rule(); // défi v2 : règle du jour (Nuée, Colosses, Chasse aux élites)
  // phase 48 : la difficulté multiplie les apparitions (crânes, tome de difficulté) ; partie guidée : horde légère
  const more = (1 + difficultyOf(w)) * R.rate * tutorialRate(w);
  let rate = SPAWN.rate(t) * w.overRate * (calm && w.overT === 0 ? STAGE.bossRate : 1) * more * soft(w, w.softRate);
  // compensation d'ennui : rien ne s'est passé depuis 4 s → densité ×2 pendant 6 s
  if (now - w.lastAction > SPAWN.boredomAfter && w.boredomUntil < now) w.boredomUntil = now + SPAWN.boredomFor;
  if (w.boredomUntil > now) rate *= SPAWN.boredomMul;

  w.spawnAcc += dt * rate;
  while (w.spawnAcc >= 1) {
    w.spawnAcc -= 1;
    if (w.enemyCount < CAPS.enemies) {
      let type = SPAWN.pick(t, w.rng.next());
      // phase 16 : plafond de tireurs à l'écran (lisibilité) ; au-delà, un Spectre
      if ((type === ARCHER_TYPE || type === CRACHEUR_TYPE || type === SORCIER_TYPE) && w.shooters >= SPAWN.maxShooters) type = 0;
      else if (type === ARCHER_TYPE || type === CRACHEUR_TYPE || type === SORCIER_TYPE) w.shooters++;
      // corrompus (docs/specs/corrompus.md) : en prolongation, un monstre tiré normalement peut devenir corrompu
      maybeCorrupt(w, spawnEnemy(w, type, w.rng.range(0, TAU), w.rng.range(SPAWN.ringMin, SPAWN.ringMax)));
    }
  }
  // élite : variante dorée d'un type de masse, lâche un coffre
  if (st >= w.nextElite) {
    w.nextElite += (R.elitePeriod > 0 ? R.elitePeriod : SPAWN.elitePeriod) / w.player.eliteRate; // phase 47 : tome Défi, élites plus fréquentes
    const type = SPAWN.pick(t, w.rng.next());
    // jamais un Cracheur ni un Sorcier élite (ils fuient et le coffre serait hors d'atteinte) ; l'Archer élite tire en éventail
    spawnEnemy(w, type === CRACHEUR_TYPE || type === SORCIER_TYPE ? ELITE_TYPE : type, w.rng.range(0, TAU), SPAWN.ringMin, true);
  }
  if (st >= w.nextWave) {
    w.nextWave += SPAWN.wavePeriod;
    const n = Math.round(SPAWN.waveCount(t) * Math.min(STAGE.overWaveCap, w.overRate) * more * soft(w, w.softRate));
    for (let i = 0; i < n && w.enemyCount < CAPS.enemies; i++)
      maybeCorrupt(w, spawnEnemy(w, t > SPAWN.waveDardAfter ? 1 : 0, (i / n) * TAU, SPAWN.waveDist)); // vague : aussi
    w.emit(Ev.Wave, w.player.x, 0, w.player.z, n);
  }
}
