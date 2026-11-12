// Phase 37 (Jimmy) : trois mondes de STAGE.dur s. Chaque monde a sa carte, son totem et son boss :
//   - rester STAGE.totemCharge s dans le cercle du totem (tant que le chrono tourne) appelle le boss du monde ;
//   - boss tué avant la fin du chrono → portail à la place du totem ; y rester STAGE.portalHold s mène au monde suivant
//     (nouvelle carte, build gardée). Au monde 3, c'est la victoire (le boss final viendra dans une phase suivante) ;
//   - chrono à 0 : plus de passage si le boss n'est pas tombé, et la prolongation renforce les monstres de minute en
//     minute (STAGE.over) : on peut rester farmer, mais pas longtemps.
// Sim pure : ni three ni DOM ; aucune allocation par pas (nextStage, une fois par monde, peut allouer : nouvelle carte).
import { BOSS, BOSSTOTEM, CAPS, ENDLESS, ENEMIES, GOLD, HAZARDS, ITEM, It, POWER, SPAWN, STAGE } from './balance';
import { difficultyHp, spawnEnemy } from './spawner';
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
  const T = w.totem,
    P = w.player;
  if (w.endless) {
    tickEndless(w, dt); // phase 39 : ni prolongation, ni totem, ni portail
    w.diffT = w.endlessDiff0 + w.endlessT * ENDLESS.diffRate; // phase 43 : la difficulté avance moins vite qu'en monde
    return;
  }
  w.diffT = w.stageT + STAGE.offset[w.stage];
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
      // 1.45.2 (Jimmy) : le totem ne se ferme plus à la fin du chrono. On peut l'activer quand on veut, et le boss
      // ouvre le portail à sa mort ; la prolongation renforce seulement les monstres (boss compris : w.overHp)
      // x2 : 0 totem pas encore activé, 1 portail déjà ouvert, 2 combat du totem en cours
      w.emit(Ev.TimeUp, P.x, 0, P.z, w.stage + 1, T.state === 2 ? 1 : T.state === 1 ? 2 : 0);
    }
  }
  if (T.state !== 2) tickSurvival(w); // phase 42 : boss de survie tant que le portail n'est pas ouvert
  if (over <= 0 && !w.stageWarned && T.state === 0 && STAGE.dur - w.stageT <= STAGE.warnLeft) {
    // rappel : plus qu'une minute pour appeler le boss
    w.stageWarned = true;
    w.emit(Ev.BossWarn, T.x, 0, T.z, w.stage + 1, STAGE.bosses[w.stage]);
  }
  // totem : rester dans le cercle le charge, en sortir le vide (comme un sanctuaire)
  w.inTotem = false;
  if (T.state === 0) {
    const inside = (T.x - P.x) ** 2 + (T.z - P.z) ** 2 < STAGE.totemR * STAGE.totemR;
    w.inTotem = inside; // phase 47 B : Coquille
    if (inside) T.charge += dt * (1 + ITEM.encens.charge * w.itemEff[It.Encens]); // Encens
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
  if (w.enemyCount >= CAPS.enemies) freeNonBoss(w); // un boss a toujours sa place, jamais à la place d'un autre boss (phase 42)
  const i = spawnEnemy(w, type, 0, 0);
  w.emit(Ev.TotemOn, T.x, 0, T.z, w.stage + 1);
  if (i < 0) return;
  const a = Math.atan2(T.x - P.x, T.z - P.z);
  const e = w.enemies[i];
  // PV fixés par monde (STAGE.bossHpAt), pas à l'heure de l'appel ; renfort de prolongation compris
  e.hp = e.max =
    ENEMIES[type].hp *
    BOSS.hpMul[w.stage] *
    SPAWN.hpScale(STAGE.bossHpAt[w.stage]) *
    w.overHp *
    (1 + w.bossCount * STAGE.bossHpPerBoss) *
    Math.max(ITEM.idole.min, 1 - ITEM.idole.hp * w.itemEff[It.Idole]) * // phase 47 B : Idole
    difficultyHp(w); // phase 48
  e.x = e.px = T.x + Math.sin(a) * STAGE.bossDist;
  e.z = e.pz = T.z + Math.cos(a) * STAGE.bossDist;
  w.bossIndex = i;
  w.totemBossId = e.id; // phase 42 : seul ce boss ouvre le portail ; phase 48 : avec ceux en plus (totemAlive)
  w.totemAlive = 1;
  w.emit(Ev.BossSpawn, e.x, 2, e.z, w.bossCount + 1, type);
  // phase 48 : un boss de plus par totem de boss activé, autour du totem, d'un autre type, PV réduits
  for (let j = 1; j <= w.bossExtra; j++) {
    const xt = type; // phase 50 : un double exact du boss du totem
    if (w.enemyCount >= CAPS.enemies) freeNonBoss(w);
    const k = spawnEnemy(w, xt, 0, 0);
    if (k < 0) break;
    const x = w.enemies[k];
    x.hp = x.max = (e.max / ENEMIES[type].hp) * ENEMIES[xt].hp * BOSSTOTEM.extraHp;
    const b = a + j * BOSSTOTEM.spread;
    x.x = x.px = T.x + Math.sin(b) * STAGE.bossDist;
    x.z = x.pz = T.z + Math.cos(b) * STAGE.bossDist;
    x.totemExtra = true;
    x.cadence = BOSSTOTEM.extraCadence;
    w.totemAlive++;
    w.emit(Ev.BossSpawn, x.x, 2, x.z, w.bossCount + 1, xt, 2); // y2 = 2 : boss en plus
  }
  w.bossCount++; // une fois par totem du monde : les boss en plus ne renforcent pas ceux des mondes suivants
}

/** Phase 42 : préavis puis apparition des boss de survie aux heures STAGE.survival.at du monde. */
function tickSurvival(w: World): void {
  const S = STAGE.survival;
  const k = w.survivalNext;
  if (k >= S.at.length) return;
  if (!w.survivalWarned && w.stageT >= S.at[k] - S.warn) {
    w.survivalWarned = true;
    w.emit(Ev.SurvivalWarn, w.player.x, 0, w.player.z, survivalType(w, k));
  }
  if (w.stageT >= S.at[k]) {
    w.survivalNext++;
    w.survivalWarned = false;
    summonSurvivalBoss(w, k);
  }
}
/** Type du k-ième boss de survie du monde : les deux boss qui ne sont pas celui du totem, dans l'ordre. */
export const survivalType = (w: World, k: number): number => STAGE.bosses[(w.stage + 1 + k) % STAGE.bosses.length];

/** Boss de survie : autour du joueur, PV = fraction de ceux du boss du totem du monde ; n'ouvre rien. */
export function summonSurvivalBoss(w: World, k: number): void {
  const type = survivalType(w, k);
  if (w.enemyCount >= CAPS.enemies) freeNonBoss(w);
  const i = spawnEnemy(w, type, w.rng.range(0, Math.PI * 2), STAGE.survival.dist);
  if (i < 0) return;
  const e = w.enemies[i];
  e.hp = e.max =
    ENEMIES[type].hp *
    SPAWN.hpScale(STAGE.bossHpAt[w.stage]) *
    w.overHp *
    (1 + w.bossCount * STAGE.bossHpPerBoss) *
    STAGE.survival.hp[k] *
    difficultyHp(w); // phase 48
  w.survivalAlive++;
  if (w.bossIndex < 0) w.bossIndex = i; // la barre suit le boss du totem s'il est déjà là
  w.emit(Ev.BossSpawn, e.x, 2, e.z, w.bossCount, type, 1); // y2 = 1 : boss de survie
  // phase 48 : un boss de plus par totem de boss activé, autour du joueur, d'un autre type, PV réduits
  const a0 = Math.atan2(e.x - w.player.x, e.z - w.player.z);
  for (let j = 1; j <= w.bossExtra; j++) {
    const xt = type; // phase 50 : un double exact du boss de la vague
    if (w.enemyCount >= CAPS.enemies) freeNonBoss(w);
    const n = spawnEnemy(w, xt, a0 + j * BOSSTOTEM.spread, STAGE.survival.dist);
    if (n < 0) break;
    const x = w.enemies[n];
    x.hp = x.max = (e.max / ENEMIES[type].hp) * ENEMIES[xt].hp * BOSSTOTEM.extraHp;
    x.cadence = BOSSTOTEM.extraCadence;
    w.survivalAlive++;
    w.emit(Ev.BossSpawn, x.x, 2, x.z, w.bossCount, xt, 2); // y2 = 2 : boss en plus, la bannière reste au boss de la vague
  }
}

/**
 * Le boss du totem est tombé (appelé par killEnemy) : portail vers le monde suivant, ou victoire au dernier monde.
 * Peu importe l'heure (1.45.1 puis 1.45.2) : appelé ou tué en prolongation, il ouvre quand même.
 */
export function stageBossDown(w: World, x: number, z: number): void {
  const T = w.totem;
  if (T.state !== 1) return;
  if (w.totemAlive > 0) return; // phase 48 : un totem de boss a été activé, il reste des boss du combat en vie
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
  w.wstate.vitN = w.wstate.balN = w.wstate.spN = 0; // phase 47 C : flaques, balises, esprits (ils repartent du héros)
  P.spellT = 0;
  w.sstate.pending = w.sstate.bondPending = false;
  w.stage++;
  w.stageT = 0;
  w.diffT = STAGE.offset[w.stage];
  w.overT = 0;
  w.overRate = w.overHp = w.overDmg = w.overSpd = 1;
  w.timeUp = false;
  w.stageWarned = false;
  w.survivalNext = 0; // phase 42
  w.survivalWarned = false;
  w.survivalAlive = 0;
  w.totemBossId = -1;
  w.totemAlive = 0; // phase 48
  w.bossExtra = 0; // les totems de boss valent pour leur monde
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
  P.airJumps = 0; // phase 47 B : un portail franchi en l'air ne coûte pas le saut des Ailes de cire
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
  w.clearEvents(); // les événements du pas de la victoire ont déjà été traités (relecture perf : double comptage)
  w.endless = true;
  w.endlessT = 0;
  w.endlessDiff0 = w.diffT; // phase 43 : difficulté au moment de la victoire, point de départ du monde infini
  w.endlessWave = 0;
  w.nextEndlessBoss = ENDLESS.period;
  // phase 42 : un boss de survie encore en vie à la victoire devient un boss du monde infini (compté, barre, plafond)
  w.endlessAlive = w.survivalAlive;
  w.survivalAlive = 0;
  w.overT = 0;
  w.overRate = w.overHp = w.overDmg = w.overSpd = 1;
  w.portal.open = false;
  w.mode = Mode.Play;
  w.emit(Ev.EndlessStart, w.player.x, 0, w.player.z);
}

/**
 * La barre de boss suit un boss vivant : à la mort du sien, elle passe au suivant. Appelé juste après la compaction des
 * ennemis (step.ts), pour qu'aucune image ne montre la barre cachée entre deux boss. Balayage rare : un boss vient de tomber.
 */
export function retargetBoss(w: World): void {
  // phase 42 : aussi en monde, quand un boss de survie (ou celui du totem) reste en vie
  if (w.bossIndex >= 0 || (w.endless ? w.endlessAlive : w.survivalAlive + w.totemAlive) <= 0) return; // phase 48 : boss du totem en plus
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    if (e.alive && ENEMIES[e.type].boss) {
      w.bossIndex = i;
      return;
    }
  }
  if (w.endless) w.endlessAlive = 0; // plus aucun en vie (compte resynchronisé)
  else w.survivalAlive = 0;
}

function tickEndless(w: World, dt: number): void {
  w.endlessT += dt;
  // montée lente des monstres normaux (multiplicateurs de la prolongation, avec la rampe douce du monde infini)
  const m = w.endlessT / 60,
    R = ENDLESS.ramp;
  w.overRate = poly(R.rate, m);
  w.overHp = poly(R.hp, m);
  w.overDmg = poly(R.dmg, m);
  w.overSpd = Math.min(R.spdMax, poly(R.spd, m));
  retargetBoss(w);
  if (w.endlessT >= w.nextEndlessBoss) {
    w.nextEndlessBoss += ENDLESS.period;
    summonEndlessWave(w);
  }
}

/** Vague de boss du monde infini : autour du joueur, PV de la règle du totem × (1 + hpPerWave · vague). */
export function summonEndlessWave(w: World): void {
  const k = w.endlessWave++;
  // phase 48 : totems de boss activés au monde 3, dans la limite de maxAlive. Ici la vague grossit de boss entiers (pas
  // de seconds couteaux) : le monde infini compte en boss par vague
  const n = endlessBosses(k) + w.bossExtra,
    P = w.player;
  for (let j = 0; j < n; j++) {
    if (w.endlessAlive >= ENDLESS.maxAlive) break; // trop de boss en vie : le reste de la vague attend
    // phase 50 : au-delà des boss de la vague, les totems de boss ajoutent des doubles de son premier boss
    const type = STAGE.bosses[(k + (j < n - w.bossExtra ? j : 0)) % STAGE.bosses.length];
    if (w.enemyCount >= CAPS.enemies) freeNonBoss(w); // un boss a toujours sa place, jamais à la place d'un autre boss
    const a = (j / n) * Math.PI * 2 + k;
    const i = spawnEnemy(w, type, a, ENDLESS.dist);
    if (i < 0) continue;
    const e = w.enemies[i];
    e.hp = e.max =
      ENEMIES[type].hp * BOSS.hpMul[w.stage] *
      SPAWN.hpScale(w.diffT) *
      (1 + w.bossCount * STAGE.bossHpPerBoss) *
      (1 + ENDLESS.hpPerWave * k) *
      difficultyHp(w); // phase 48
    w.bossIndex = i;
    w.bossCount++;
    w.endlessAlive++;
    w.emit(Ev.BossSpawn, e.x, 2, e.z, w.bossCount, type);
  }
  w.emit(Ev.EndlessWave, P.x, 0, P.z, k + 1, n);
}

/** Pool plein : retire le premier ennemi qui n'est pas un boss (un boss d'une vague précédente reste en jeu). */
function freeNonBoss(w: World): void {
  for (let i = 0; i < w.enemyCount; i++)
    if (!ENEMIES[w.enemies[i].type].boss) {
      w.freeEnemy(i);
      return;
    }
}
