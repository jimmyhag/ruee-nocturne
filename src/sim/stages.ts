// Phase 37 (Jimmy) : trois mondes de STAGE.dur s. Chaque monde a sa carte, son totem et son boss :
//   - rester STAGE.totemCharge s dans le cercle du totem (tant que le chrono tourne) appelle le boss du monde ;
//   - boss tué avant la fin du chrono → portail à la place du totem ; y rester STAGE.portalHold s mène au monde suivant
//     (nouvelle carte, build gardée). Au monde 3, c'est la victoire (le boss final viendra dans une phase suivante) ;
//   - chrono à 0 : plus de passage si le boss n'est pas tombé, et la prolongation renforce les monstres de minute en
//     minute (STAGE.over) : on peut rester farmer, mais pas longtemps.
// Sim pure : ni three ni DOM ; aucune allocation par pas (nextStage, une fois par monde, peut allouer : nouvelle carte).
import { BOSS, BOSSTOTEM, CAPS, DAILY, ENDLESS, ENEMIES, GOLD, HAZARDS, ITEM, It, MERCHANT, POWER, SPAWN, STAGE, TUTORIAL } from './balance';
import { difficultyHp, dmgMulNow, soft, spawnEnemy } from './spawner';
import { TOTEM_HIDDEN } from './poi';
import { clearCorrupt } from './corrupt';
import { Ev, Mode } from './types';
import { makeMerchant } from './merchant';
import { startRun } from './step';
import type { World } from './world';

/** Graine de la carte du monde `k` (déterministe : le défi du jour donne les mêmes trois cartes à tout le monde). */
export function stageSeed(start: number, k: number): number {
  return k === 0 ? start : (start + k * STAGE.seedMul) >>> 0;
}

/** Chrono restant du monde (s, ≥ 0) ; lot L3 : celui du défi du jour (DAILY.duration, sur le temps de partie). */
export function stageLeft(w: World): number {
  return Math.max(0, w.dailyEnd > 0 ? w.dailyEnd - w.t : STAGE.dur - w.stageT);
}

/**
 * Relecture du lot L3 : une partie de défi du jour gardée avant la mise à jour (instantané sans `dailyEnd`) devient le
 * défi court à la reprise : fin à DAILY.duration s de partie, et le totem du passage disparaît s'il n'a pas servi.
 */
export function adoptDaily(w: World): void {
  if (w.dailyEnd <= 0) {
    w.dailyEnd = DAILY.duration;
    if (w.totem.state === 0) w.totem.state = TOTEM_HIDDEN;
  }
  // défi v2 (décision 11) : une partie gardée avant la mise à jour reprend sans règle (dailyRule reste à -1) et avec le
  // boss final s'il n'est pas encore passé. Un défi gardé par cette version a déjà son boss en vie ou abattu après 4:00
  if (w.dailyBoss === 0 && w.t > DAILY.bossAt) w.dailyBoss = 3;
}

const poly = (c: readonly number[], m: number): number => 1 + c[0] * m + c[1] * m * m;

/**
 * Partie guidée (décision 15) : au monde 1, le totem du monde ne s'active pas avant TUTORIAL.forceAt s ; rester dessus
 * ne fait rien (l'interface dit « Pas encore »). Faux hors de la partie guidée.
 */
export function totemLocked(w: World): boolean {
  return w.tutorial && w.stage === 0 && !w.endless && w.stageT < TUTORIAL.forceAt;
}

/** Horloges du monde, prolongation, totem et portail. Appelé à chaque pas de jeu (Mode.Play), avant le spawner. */
export function tickStage(w: World, dt: number): void {
  w.stageT += dt;
  const T = w.totem,
    P = w.player;
  // partie guidée (décision 6), au monde 1 : le chrono s'arrête à TUTORIAL.hold s de la fin tant que le totem n'est pas activé, et
  // ne passe pas en prolongation pendant le combat du boss (la difficulté, qui suit le chrono, s'arrête avec lui) ; le
  // boss tombé, il tombe à 0 et la prolongation commence, comme dans toute partie (décision 18)
  if (w.tutorial && w.stage === 0 && !w.endless && T.state !== 2) {
    const cap = T.state === 0 ? STAGE.dur - TUTORIAL.hold : STAGE.dur;
    if (w.stageT > cap) w.stageT = cap;
  }
  if (w.dailyEnd > 0) tickMedals(w); // défi v2 : argent et or se gagnent aussi pendant la suite en monde infini
  if (w.endless) {
    tickEndless(w, dt); // phase 39 : ni prolongation, ni totem, ni portail
    // phase 43 : la difficulté avance moins vite qu'en monde ; défi v2 : à son rythme pour la suite du défi du jour
    w.diffT = w.endlessDiff0 + w.endlessT * (w.dailyEnd > 0 ? DAILY.endlessDiffRate : ENDLESS.diffRate);
    return;
  }
  if (w.dailyEnd > 0) {
    // sur le temps de partie (égal au temps du monde : le défi reste au monde 1), pour une partie reprise d'avant le lot
    if (w.t >= w.dailyEnd) {
      dailyDone(w);
      return;
    }
    w.diffT = w.stageT * DAILY.diffRate; // lot L3 : le défi du jour reste au monde 1 (offset 0)
  } else w.diffT = w.stageT + STAGE.offset[w.stage];
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
  // phase 42 : boss de survie tant que le portail n'est pas ouvert ; défi v2 : au défi du jour, le boss final à leur place
  if (w.dailyEnd > 0) tickFinalBoss(w);
  else if (T.state !== 2) tickSurvival(w);
  // partie guidée : pas de rappel « plus qu'une minute » (le guide mène au totem dès TUTORIAL.forceAt, le chrono attend)
  if (over <= 0 && !w.stageWarned && !(w.tutorial && w.stage === 0) && T.state === 0 && STAGE.dur - w.stageT <= STAGE.warnLeft) {
    // rappel : plus qu'une minute pour appeler le boss
    w.stageWarned = true;
    w.emit(Ev.BossWarn, T.x, 0, T.z, w.stage + 1, STAGE.bosses[w.stage]);
  }
  // totem : rester dans le cercle le charge, en sortir le vide (comme un sanctuaire)
  w.inTotem = false;
  if (T.state === 0 && !totemLocked(w)) {
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

/**
 * Lot L3 : le chrono du défi du jour est arrivé au bout, le joueur est en vie : « Défi réussi ! ». Comme une victoire,
 * la partie s'arrête (Mode.Won) avec le bonus d'or de fin (secondes survécues / 10) ; Ev.Victory, v = temps tenu.
 * Défi v2 : la médaille de bronze, ou d'argent si le boss final est déjà tombé (x2 = médaille : l'écran « Défi
 * réussi ! » la montre) ; le joueur choisit ensuite de continuer en monde infini (startEndless) ou de terminer.
 */
function dailyDone(w: World): void {
  w.mode = Mode.Won;
  w.gold += (w.t - w.goldBonusT) * GOLD.perSecond * w.player.goldMul;
  w.goldBonusT = w.t;
  w.medal = w.dailyBoss === 2 ? 2 : 1;
  w.emit(Ev.Victory, w.player.x, 1, w.player.z, w.t, w.medal);
}

/** Défi v2 (décision 4) : argent quand le boss final tombe après 5:00, or vivant à DAILY.goldAt avec l'argent. */
function tickMedals(w: World): void {
  if (w.medal === 1 && w.dailyBoss === 2) {
    w.medal = 2;
    w.emit(Ev.Medal, w.player.x, w.player.y + 1, w.player.z, 2);
  }
  if (w.medal === 2 && w.t >= DAILY.goldAt) {
    w.medal = 3;
    w.emit(Ev.Medal, w.player.x, w.player.y + 1, w.player.z, 3);
  }
}

/** Défi v2 (décision 3) : préavis, puis le boss final à DAILY.bossAt s de partie. */
function tickFinalBoss(w: World): void {
  if (w.dailyBoss !== 0) return;
  if (!w.dailyBossWarned && w.t >= DAILY.bossAt - DAILY.bossWarn) {
    w.dailyBossWarned = true;
    w.emit(Ev.SurvivalWarn, w.player.x, 0, w.player.z, STAGE.bosses[0], 1);
  }
  if (w.t >= DAILY.bossAt) summonFinalBoss(w);
}

/**
 * Le boss final du défi : le boss du totem du monde 1, autour du joueur, PV du boss du totem × DAILY.bossHp. Compté
 * comme un boss de survie (barre, et boss du monde infini si le joueur continue) ; pas de rage (bosses.ts).
 */
function summonFinalBoss(w: World): void {
  const type = STAGE.bosses[0];
  w.dailyBoss = 1;
  if (w.enemyCount >= CAPS.enemies) freeNonBoss(w);
  const i = spawnEnemy(w, type, w.rng.range(0, Math.PI * 2), DAILY.bossDist);
  if (i < 0) {
    w.dailyBoss = 3; // pool plein de boss (jamais en pratique) : pas de boss, pas d'argent
    return;
  }
  const e = w.enemies[i];
  e.hp = e.max =
    ENEMIES[type].hp * BOSS.hpMul[0] * SPAWN.hpScale(STAGE.bossHpAt[0]) * DAILY.bossHp * difficultyHp(w); // phase 48
  e.cadence = DAILY.bossCadence;
  w.dailyBossId = e.id;
  w.survivalAlive++;
  w.bossIndex = i;
  w.emit(Ev.BossSpawn, e.x, 2, e.z, w.bossCount + 1, type, 3); // y2 = 3 : boss final
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
  // partie guidée (décision 16) : un boss normal, sans l'adoucissement des monstres du monde 1 (TUTORIAL.dmg)
  if (w.tutorial) e.dmgMul = dmgMulNow(w, true);
  e.x = e.px = T.x + Math.sin(a) * STAGE.bossDist;
  e.z = e.pz = T.z + Math.cos(a) * STAGE.bossDist;
  w.bossIndex = i;
  w.totemBossId = e.id; // phase 42 : seul ce boss ouvre le portail ; phase 48 : avec ceux en plus (totemAlive)
  w.totemAlive = 1;
  w.emit(Ev.BossSpawn, e.x, 2, e.z, w.bossCount + 1, type);
  // phase 48 : un boss de plus par totem de boss activé, autour du totem ; phase 50 : un double du boss du totem
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
    if (w.tutorial) x.dmgMul = dmgMulNow(w, true); // partie guidée : un double exact, boss normal lui aussi
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
    difficultyHp(w) * // phase 48
    soft(w, w.softHp) * // lot L2 : premières parties adoucies (avant FIRST_RUNS.until seulement)
    (w.tutorial && w.stage === 0 ? TUTORIAL.survivalHp : 1); // partie guidée
  w.survivalAlive++;
  if (w.bossIndex < 0) w.bossIndex = i; // la barre suit le boss du totem s'il est déjà là
  w.emit(Ev.BossSpawn, e.x, 2, e.z, w.bossCount, type, 1); // y2 = 1 : boss de survie
  // phase 48 : un boss de plus par totem de boss activé, autour du joueur ; phase 50 : un double du boss de la vague
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
 * Décision 18 : le chrono du monde saute de `skip` s. Le temps sauté est perdu, rien n'y rattrape son retard : les
 * minuteries au chrono du monde (vagues, élites, éruptions, bonus de carte, départ du marchand) sont décalées d'autant,
 * et les passages du marchand qui tombaient dans l'intervalle sont perdus. Les boss de survie (et leur préavis) ne
 * viennent plus une fois le portail ouvert. Il reste la cadence normale de la prolongation.
 */
function skipStageTime(w: World, skip: number): void {
  w.stageT += skip;
  w.nextWave += skip;
  w.nextElite += skip;
  w.nextEruption += skip;
  w.powerNext += skip;
  const M = w.merchant;
  if (M.active) M.until += skip;
  while (M.next < MERCHANT.times.length && MERCHANT.times[M.next] <= w.stageT) M.next++;
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
  // 1.66.0 (décision 18 de docs/specs/tutoriel.md, Jimmy) : le chrono tombe à 0, le monde passe tout de suite en
  // prolongation jusqu'au portail (Ev.TimeUp au pas suivant) ; le temps qui restait est perdu : on attend la fin
  if (w.stageT < STAGE.dur) skipStageTime(w, STAGE.dur - w.stageT);
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
  clearCorrupt(w); // corrompus : aucun en monde infini, même vainqueur en prolongation (docs/specs/corrompus.md)
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
