// Phase 37 (Jimmy) : trois mondes de STAGE.dur s. Chaque monde a sa carte, son totem et son boss :
//   - rester STAGE.totemCharge s dans le cercle du totem (tant que le chrono tourne) appelle le boss du monde ;
//   - boss tué avant la fin du chrono → portail à la place du totem ; y rester STAGE.portalHold s mène au monde suivant
//     (nouvelle carte, build gardée). Au monde 3, c'est la victoire (le boss final viendra dans une phase suivante) ;
//   - chrono à 0 : plus de passage si le boss n'est pas tombé, et la prolongation renforce les monstres de minute en
//     minute (STAGE.over) : on peut rester farmer, mais pas longtemps.
// Sim pure : ni three ni DOM ; aucune allocation par pas (nextStage, une fois par monde, peut allouer : nouvelle carte).
import { CAPS, ENDLESS, ENEMIES, GOLD, HAZARDS, POWER, SPAWN, STAGE } from './balance';
import { spawnEnemy } from './spawner';
import { Ev, Mode } from './types';
import { makeMerchant } from './merchant';
import { startRun } from './step';
import type { World } from './world';

/** Graine de la carte du monde `k` (déterministe : le défi du jour donne les mêmes trois cartes à tout le monde). */
export function stageSeed(start: number, k: number): number {
  return k === 0 ? start : (start + k * STAGE.seedMul) >>> 0;
}

/** Chrono restant du monde (s, ≥ 0). */
export function stageLeft(w: World): number {
  return Math.max(0, STAGE.dur - w.stageT);
}

const poly = (c: readonly number[], m: number): number => 1 + c[0] * m + c[1] * m * m;

/** Horloges du monde, prolongation, totem et portail. Appelé à chaque pas de jeu (Mode.Play), avant le spawner. */
export function tickStage(w: World, dt: number): void {
  w.stageT += dt;
  w.diffT = w.stageT + STAGE.offset[w.stage];
  const T = w.totem,
    P = w.player;
  if (w.endless) {
    tickEndless(w, dt); // phase 39 : ni prolongation, ni totem, ni portail
    return;
  }
  const over = w.stageT - STAGE.dur;
  if (over > 0) {
    w.overT = over;
    const m = over / 60,
      O = STAGE.over;
    w.overRate = poly(O.rate, m);
    w.overHp = poly(O.hp, m);
    w.overDmg = poly(O.dmg, m);
    w.overSpd = Math.min(O.spdMax, poly(O.spd, m));
    if (!w.timeUp) {
      w.timeUp = true;
      // boss pas appelé ou encore vivant : plus de passage vers le monde suivant
      if (T.state === 0 || T.state === 1) T.state = 3;
      w.emit(Ev.TimeUp, P.x, 0, P.z, w.stage + 1, T.state === 2 ? 1 : 0);
    }
  } else if (!w.stageWarned && T.state === 0 && STAGE.dur - w.stageT <= STAGE.warnLeft) {
    // rappel : plus qu'une minute pour appeler le boss
    w.stageWarned = true;
    w.emit(Ev.BossWarn, T.x, 0, T.z, w.stage + 1, STAGE.bosses[w.stage]);
  }
  // totem : rester dans le cercle le charge, en sortir le vide (comme un sanctuaire)
  if (T.state === 0) {
    const inside = (T.x - P.x) ** 2 + (T.z - P.z) ** 2 < STAGE.totemR * STAGE.totemR;
    if (inside) T.charge += dt;
    else if (T.charge > 0) T.charge = Math.max(0, T.charge - dt * STAGE.totemDecay);
    if (T.charge >= STAGE.totemCharge) summonStageBoss(w);
  }
  // portail : y rester STAGE.portalHold s
  const G = w.portal;
  if (G.open) {
    const inside = (T.x - P.x) ** 2 + (T.z - P.z) ** 2 < STAGE.portalR * STAGE.portalR;
    G.charge = inside ? G.charge + dt : 0;
    if (G.charge >= STAGE.portalHold) nextStage(w);
  }
}

/** Le totem est activé : le boss du monde sort de terre de l'autre côté du totem (le joueur le voit arriver). */
export function summonStageBoss(w: World): void {
  const T = w.totem,
    P = w.player;
  T.state = 1;
  T.charge = STAGE.totemCharge;
  const type = STAGE.bosses[w.stage];
  if (w.enemyCount >= CAPS.enemies) w.freeEnemy(0); // un boss a toujours sa place
  const i = spawnEnemy(w, type, 0, 0);
  w.emit(Ev.TotemOn, T.x, 0, T.z, w.stage + 1);
  if (i < 0) return;
  const a = Math.atan2(T.x - P.x, T.z - P.z);
  const e = w.enemies[i];
  // PV fixés par monde (STAGE.bossHpAt), pas à l'heure de l'appel ; renfort de prolongation compris
  e.hp = e.max =
    ENEMIES[type].hp * SPAWN.hpScale(STAGE.bossHpAt[w.stage]) * w.overHp * (1 + w.bossCount * STAGE.bossHpPerBoss);
  e.x = e.px = T.x + Math.sin(a) * STAGE.bossDist;
  e.z = e.pz = T.z + Math.cos(a) * STAGE.bossDist;
  w.bossIndex = i;
  w.bossCount++;
  w.emit(Ev.BossSpawn, e.x, 2, e.z, w.bossCount, type);
}

/**
 * Le boss du totem est tombé (appelé par killEnemy). À temps : portail vers le monde suivant, ou victoire au dernier
 * monde. Après la fin du chrono (totem fermé) : rien de plus que la récompense d'un boss.
 */
export function stageBossDown(w: World, x: number, z: number): void {
  const T = w.totem;
  if (T.state !== 1) return;
  if (w.stage >= STAGE.count - 1) {
    T.state = 2;
    w.mode = Mode.Won;
    // bonus de fin (secondes survécues / 10) ; phase 39 : la mort en monde infini ne repaie que le temps d'après
    w.gold += (w.t - w.goldBonusT) * GOLD.perSecond * w.player.goldMul;
    w.goldBonusT = w.t;
    w.emit(Ev.Victory, x, 1, z, w.t);
    return;
  }
  T.state = 2;
  w.portal.open = true;
  w.portal.charge = 0;
  w.emit(Ev.PortalOpen, T.x, 0, T.z, w.stage + 2);
}

/**
 * Passage au monde suivant : nouvelle carte, horloges du monde remises à zéro, plus aucun ennemi ni tir ; la build,
 * le niveau, les objets, l'or et les relances restent. L'XP au sol est ramassée, les coffres suivent le joueur.
 */
export function nextStage(w: World): void {
  const P = w.player;
  // XP au sol : ramassée (elle était à lui)
  for (let i = 0; i < w.gemCount; i++) P.xp += w.gems[i].v * P.xpMul;
  w.gemCount = 0;
  w.enemyCount = 0;
  w.bossIndex = -1;
  w.shooters = 0;
  w.projCount = 0;
  w.shotCount = 0;
  w.powerCount = 0;
  // ce qui vise des coordonnées de l'ancienne carte : météores annoncés, sorts qui durent (Collet, Bourse)
  w.wstate.metN = 0;
  P.spellT = 0;
  w.sstate.pending = w.sstate.bondPending = false;
  w.stage++;
  w.stageT = 0;
  w.diffT = STAGE.offset[w.stage];
  w.overT = 0;
  w.overRate = w.overHp = w.overDmg = w.overSpd = 1;
  w.timeUp = false;
  w.stageWarned = false;
  w.portal.open = false;
  w.portal.charge = 0;
  w.merchant = makeMerchant();
  w.spawnAcc = 0;
  w.boredomUntil = 0;
  w.lastAction = w.t;
  w.nextWave = SPAWN.wavePeriod;
  w.nextElite = STAGE.eliteFirst[w.stage];
  // éruptions : à leur heure de difficulté, mais jamais dans les 20 premières secondes d'un monde
  w.nextEruption = Math.max(STAGE.eruptionGrace, HAZARDS.eruption.after - STAGE.offset[w.stage]);
  w.powerNext = POWER.mapFirst;
  w.buildMapFor(stageSeed(w.startSeed, w.stage)); // remet aussi le totem à zéro (placeTotem)
  // le joueur repart du centre de la nouvelle carte, debout
  P.x = P.px = 0;
  P.z = P.pz = 0;
  P.y = P.py = 0;
  P.vx = P.vz = P.vy = 0;
  P.mvx = P.mvz = 0;
  P.onGround = true;
  P.sliding = false;
  P.airMom = false;
  P.slideJump = false;
  P.gv = 0;
  P.gPrev = w.heightAt(0, 0);
  // coffres pas encore ouverts (le coffre du boss, souvent) : posés devant le joueur
  for (let i = 0; i < w.chestCount; i++) {
    const c = w.chests[i];
    c.x = Math.sin(i * 1.3) * 3;
    c.z = 3 + Math.cos(i * 1.3) * 1.5;
  }
  startRun(w); // ennemis de départ, comme au premier monde
  w.emit(Ev.StageStart, 0, 0, 0, w.stage + 1);
}

// ---- phase 39 : monde infini ----

/** Nombre de boss de la vague k (0, 1, 2…) : 1, 1, 2, 2, 3, 3… au plus ENDLESS.maxBosses. */
export function endlessBosses(k: number): number {
  return Math.min(ENDLESS.maxBosses, 1 + Math.floor(k / 2));
}

/**
 * Après la victoire, le joueur continue (écran de victoire) : la partie reprend sur la carte du monde 3, sans chrono
 * (pas de prolongation) ; une vague de boss toutes les ENDLESS.period s.
 */
export function startEndless(w: World): void {
  if (w.mode !== Mode.Won || w.endless) return;
  w.endless = true;
  w.endlessT = 0;
  w.endlessWave = 0;
  w.nextEndlessBoss = ENDLESS.period;
  w.endlessAlive = 0;
  w.overT = 0;
  w.overRate = w.overHp = w.overDmg = w.overSpd = 1;
  w.portal.open = false;
  w.mode = Mode.Play;
  w.emit(Ev.EndlessStart, w.player.x, 0, w.player.z);
}

function tickEndless(w: World, dt: number): void {
  w.endlessT += dt;
  // la barre de boss suit un boss vivant : à la mort du sien, elle passe au suivant (balayage rare : un boss vient de tomber)
  if (w.bossIndex < 0 && w.endlessAlive > 0) {
    for (let i = 0; i < w.enemyCount; i++) {
      const e = w.enemies[i];
      if (e.alive && ENEMIES[e.type].boss) {
        w.bossIndex = i;
        break;
      }
    }
    if (w.bossIndex < 0) w.endlessAlive = 0; // plus aucun en vie (compte resynchronisé)
  }
  if (w.endlessT >= w.nextEndlessBoss) {
    w.nextEndlessBoss += ENDLESS.period;
    summonEndlessWave(w);
  }
}

/** Vague de boss du monde infini : autour du joueur, PV de la règle du totem × (1 + hpPerWave · vague). */
export function summonEndlessWave(w: World): void {
  const k = w.endlessWave++;
  const n = endlessBosses(k),
    P = w.player;
  for (let j = 0; j < n; j++) {
    const type = STAGE.bosses[(k + j) % STAGE.bosses.length];
    if (w.enemyCount >= CAPS.enemies) w.freeEnemy(0); // un boss a toujours sa place
    const a = (j / n) * Math.PI * 2 + k;
    const i = spawnEnemy(w, type, a, ENDLESS.dist);
    if (i < 0) continue;
    const e = w.enemies[i];
    e.hp = e.max =
      ENEMIES[type].hp *
      SPAWN.hpScale(w.diffT) *
      (1 + w.bossCount * STAGE.bossHpPerBoss) *
      (1 + ENDLESS.hpPerWave * k);
    w.bossIndex = i;
    w.bossCount++;
    w.endlessAlive++;
    w.emit(Ev.BossSpawn, e.x, 2, e.z, w.bossCount, type);
  }
  w.emit(Ev.EndlessWave, P.x, 0, P.z, k + 1, n);
}
