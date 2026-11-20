// Le Cœur de la Nuit (docs/specs/boss-final.md, 1.68.0) : le boss final, dans l'Arène, après le monde 3.
// L'Arène est un quatrième « monde » (w.stage === ARENA) : carte vide et ronde, bordée d'un cercle de flammes
// (w.arenaR), sans chrono, ni horde, ni lieux. Le boss (le modèle du Colosse, agrandi) a quatre phases :
//   1. le souvenir : charge du Gardien, salve de l'Essaim-mère, cercles du Colosse, une par une et en boucle ;
//   2. les sceaux (70 %) : invulnérable tant qu'une des quatre stèles tient, chacune brisée lui retire 7,5 % ;
//   3. l'éclipse (40 %) : l'Arène s'assombrit, le cercle se resserre, deux doubles que les coups ne blessent pas ;
//   4. la fureur (15 %) : attaques ×1,5 et le Jugement, toute l'Arène rouge sauf une zone sûre.
// Chaque changement de phase : bannière, son, pause du boss (invulnérable). Un coup ne franchit jamais un seuil.
// Sim pure : ni three ni DOM ; aucune allocation par pas ; hasard par w.rng seulement.
import { BOSS, COLOSSUS_TYPE, ENEMIES, FINAL, GOLD, PLAYER, SPAWN, STAGE } from './balance';
import { fireVolley, zoneAt } from './bosses';
import { corrupt } from './corrupt';
import { shieldAbsorb } from './items';
import { difficultyHp, spawnEnemy } from './spawner';
import { Ev, HitSrc, HurtSrc, Mode, Role } from './types';
import type { Enemy } from './types';
import type { World } from './world';

const TAU = Math.PI * 2;
/** w.finalPhase du boss final vaincu (0 : pas encore sorti ; 1 à 4 : ses phases). */
export const FINAL_DONE = 5;
/** Les trois attaques de la boucle (e.combo du boss et de ses doubles). */
const enum Attack {
  Charge = 0,
  Volley,
  Zones,
}

/** Le boss final est-il invulnérable maintenant ? Pause d'un changement de phase, ou sceaux encore debout. */
export function heartShielded(w: World): boolean {
  return w.finalPause > 0 || (w.finalPhase === 2 && w.seals > 0);
}

/** Un coup sur `e` ne le blesse pas (un double, ou le boss invulnérable) : le rendu le montre gris, pas blanc. */
export function hitsBlocked(w: World, e: Enemy): boolean {
  return e.role === Role.Decoy || (e.role === Role.Heart && heartShielded(w));
}

/** PV sous lesquels le boss ne descend pas dans sa phase : le seuil de la suivante (0 en phase 4). */
function floorHp(w: World, e: Enemy): number {
  const p = w.finalPhase;
  return p >= 1 && p <= FINAL.phases.length ? FINAL.phases[p - 1] * e.max : 0;
}

/**
 * Un coup d'arme sur `e` (boss final ou double) qui ne passe pas : flash gris, son mat, pas de chiffre (Ev.Blocked). Un
 * double touché FINAL.decoy.hits fois part en fumée. Vrai si le coup s'arrête là (combat.ts : hitEnemy).
 */
export function hitBlocked(w: World, e: Enemy): boolean {
  if (e.role === Role.Decoy) {
    e.flash = 0.1;
    w.emit(Ev.Blocked, e.x, e.y, e.z);
    if (++e.struck >= FINAL.decoy.hits) decoyGone(w, e);
    return true;
  }
  if (e.role !== Role.Heart || (!heartShielded(w) && e.hp > floorHp(w, e))) return false;
  e.flash = 0.1;
  w.emit(Ev.Blocked, e.x, e.y, e.z);
  return true;
}

/** Dégâts que le boss final prend vraiment d'un coup de `dmg` : rien s'il est invulnérable, jamais sous le seuil. */
export function heartDamage(w: World, e: Enemy, dmg: number): number {
  if (e.role === Role.Decoy || (e.role === Role.Heart && heartShielded(w))) return 0;
  return e.role === Role.Heart ? Math.max(0, Math.min(dmg, e.hp - floorHp(w, e))) : dmg;
}

/** Le boss final, ou null (pas encore sorti, ou vaincu). La barre de boss le suit : son index est essayé d'abord. */
export function heartOf(w: World): Enemy | null {
  if (w.finalId < 0) return null;
  const b = w.bossIndex;
  if (b >= 0 && b < w.enemyCount && w.enemies[b].id === w.finalId) return w.enemies[b];
  for (let i = 0; i < w.enemyCount; i++)
    if (w.enemies[i].id === w.finalId && w.enemies[i].alive) {
      w.bossIndex = i;
      return w.enemies[i];
    }
  return null;
}

/** Un Colosse de l'Arène : le boss final ou un de ses doubles, agrandi, en (x, z). */
function colossus(w: World, role: Role, x: number, z: number): Enemy | null {
  const i = spawnEnemy(w, COLOSSUS_TYPE, 0, 0);
  if (i < 0) return null;
  const e = w.enemies[i];
  e.x = e.px = x;
  e.z = e.pz = z;
  e.r = ENEMIES[COLOSSUS_TYPE].r * FINAL.scale;
  e.role = role;
  e.state = 0;
  e.timer = FINAL.gap;
  e.combo = Attack.Charge;
  return e;
}

/**
 * Le boss final sort au centre de l'Arène (FINAL.appear s après l'entrée). PV : ceux d'un boss du totem du monde 3
 * appelé maintenant (même calcul, sans prolongation ni Idole), × FINAL.hp. Pas de rage au temps : sa fureur est la phase 4.
 */
export function summonHeart(w: World): void {
  const e = colossus(w, Role.Heart, 0, 0);
  w.finalPhase = 1;
  if (!e) return;
  const last = STAGE.count - 1;
  e.hp = e.max =
    ENEMIES[COLOSSUS_TYPE].hp *
    BOSS.hpMul[last] *
    SPAWN.hpScale(STAGE.bossHpAt[last]) *
    (1 + w.bossCount * STAGE.bossHpPerBoss) *
    difficultyHp(w) *
    FINAL.hp;
  w.finalId = e.id;
  w.bossIndex = w.enemyCount - 1;
  w.emit(Ev.BossSpawn, e.x, 2, e.z, w.bossCount + 1, COLOSSUS_TYPE, 4); // y2 = 4 : le Cœur de la Nuit
}

/** Horloges de l'Arène, appelées par tickStage à chaque pas de jeu (à la place du chrono, du totem et du portail). */
export function tickArena(w: World, dt: number): void {
  w.arenaT += dt;
  if (w.finalPhase === 0) {
    if (w.arenaT >= FINAL.appear) summonHeart(w);
    return;
  }
  const h = heartOf(w);
  if (!h || w.finalPhase >= FINAL_DONE) return;
  if (w.finalPause > 0) w.finalPause -= dt;
  // seuil franchi (un coup s'y arrête : PV égaux au seuil) : phase suivante
  const p = w.finalPhase;
  if (p <= FINAL.phases.length && h.hp <= FINAL.phases[p - 1] * h.max * (1 + 1e-9)) nextPhase(w, h);
  if (w.finalPhase === 2 && w.seals > 0) tickAdds(w, dt);
  if (w.finalPhase >= 3) {
    tickRing(w, dt);
    flamesTouch(w, dt, h);
  }
  if (w.finalPhase === 3) tickDecoys(w, dt, h);
  if (w.finalPhase === 4) tickJudgement(w, dt);
}

/** Le boss franchit un seuil : bannière et son (Ev.FinalPhase), pause invulnérable, et ce que la phase apporte. */
function nextPhase(w: World, h: Enemy): void {
  const p = ++w.finalPhase;
  w.finalPause = FINAL.pause;
  h.state = 0; // une charge ou une salve en cours s'arrête
  h.timer = FINAL.gap;
  w.emit(Ev.FinalPhase, h.x, h.y, h.z, p);
  if (p === 2) {
    // les sceaux : quatre stèles en croix, à FINAL.seal.dist u du centre
    const S = FINAL.seal;
    for (let k = 0; k < S.n; k++) {
      const a = Math.PI / 4 + (k * TAU) / S.n,
        i = spawnEnemy(w, 2, 0, 0); // une Brute immobile (sa vie, ses coups), dessinée en stèle
      if (i < 0) break;
      const s = w.enemies[i];
      s.role = Role.Seal;
      s.x = s.px = Math.sin(a) * S.dist;
      s.z = s.pz = Math.cos(a) * S.dist;
      s.r = S.r;
      s.hp = s.max = S.hp * h.max;
      w.seals++;
      w.emit(Ev.Seal, s.x, 0, s.z, w.seals, 0);
    }
    w.addT = FINAL.adds.first;
  } else if (p === 3) {
    // l'éclipse : le boss et deux doubles sur trois points autour du centre, le vrai tiré au hasard (fumée sur chacun)
    const D = FINAL.decoy,
      a0 = w.rng.range(0, TAU),
      real = w.rng.int(D.n + 1);
    for (let k = 0; k <= D.n; k++) {
      const a = a0 + (k * TAU) / (D.n + 1),
        x = Math.sin(a) * D.dist,
        z = Math.cos(a) * D.dist;
      if (k === real) {
        h.x = h.px = x;
        h.z = h.pz = z;
      } else decoyAt(w, x, z);
      w.emit(Ev.Decoy, x, 1, z, 0, 1);
    }
    w.ringT = FINAL.ring.every;
  } else if (p === 4) {
    // la fureur : les doubles disparaissent, le Jugement commence
    for (let i = 0; i < w.enemyCount; i++) {
      const e = w.enemies[i];
      if (e.alive && e.role === Role.Decoy) decoyGone(w, e);
    }
    w.decoyBack.fill(0);
    w.judgeNext = FINAL.judge.first + FINAL.pause;
  }
}

/** Un double du boss en (x, z) : mêmes attaques, moins souvent ; les coups ne le blessent pas. */
function decoyAt(w: World, x: number, z: number): void {
  const e = colossus(w, Role.Decoy, x, z);
  if (!e) return;
  e.cadence = FINAL.decoy.cadence;
  e.combo = w.rng.int(3); // pas la même attaque que le vrai au même moment
  e.struck = 0;
}

/** Un double touché FINAL.decoy.hits fois (ou la fureur) : il part en fumée ; en phase 3, il revient plus tard. */
function decoyGone(w: World, e: Enemy): void {
  e.alive = false; // retiré du pool en fin de pas (compactEnemies)
  w.emit(Ev.Decoy, e.x, e.y, e.z, 0, 0);
  if (w.finalPhase !== 3) return;
  for (let k = 0; k < w.decoyBack.length; k++)
    if (w.decoyBack[k] <= 0) {
      w.decoyBack[k] = FINAL.decoy.back;
      return;
    }
}

/** Phase 3 : les doubles partis en fumée reviennent FINAL.decoy.back s plus tard, autour du vrai. */
function tickDecoys(w: World, dt: number, h: Enemy): void {
  for (let k = 0; k < w.decoyBack.length; k++) {
    if (w.decoyBack[k] <= 0) continue;
    w.decoyBack[k] -= dt;
    if (w.decoyBack[k] > 0) continue;
    w.decoyBack[k] = 0;
    const a = w.rng.range(0, TAU),
      lim = Math.max(0, w.arenaR - h.r);
    let x = h.x + Math.sin(a) * FINAL.decoy.dist,
      z = h.z + Math.cos(a) * FINAL.decoy.dist;
    const dd = Math.sqrt(x * x + z * z);
    if (dd > lim) {
      x *= lim / dd;
      z *= lim / dd;
    }
    decoyAt(w, x, z);
    w.emit(Ev.Decoy, x, 1, z, 0, 1);
  }
}

/** Phase 2 : des corrompus arrivent par petits groupes au bord du cercle, tant qu'un sceau tient. */
function tickAdds(w: World, dt: number): void {
  w.addT -= dt;
  if (w.addT > 0) return;
  const A = FINAL.adds;
  w.addT = A.every;
  for (let k = 0; k < A.n; k++) {
    const type = A.types[w.rng.int(A.types.length)],
      a = w.rng.range(0, TAU),
      i = spawnEnemy(w, type, 0, 0);
    if (i < 0) return;
    const e = w.enemies[i],
      r = w.arenaR - e.r - 0.5;
    e.x = e.px = Math.sin(a) * r;
    e.z = e.pz = Math.cos(a) * r;
    corrupt(w, e);
  }
}

/** Phase 3 et plus : le cercle de flammes se resserre d'un pas toutes les FINAL.ring.every s, annoncé warn s avant. */
function tickRing(w: World, dt: number): void {
  const R = FINAL.ring;
  if (w.arenaR <= R.min) return;
  const before = w.ringT;
  w.ringT -= dt;
  if (before > R.warn && w.ringT <= R.warn) w.emit(Ev.RingWarn, 0, 0, 0, R.warn, Math.max(R.min, w.arenaR - R.step));
  if (w.ringT <= 0) {
    w.arenaR = Math.max(R.min, w.arenaR - R.step);
    w.ringT = R.every;
  }
}

/** Le cercle de flammes rougit-il (un pas est annoncé) ? Lu par le rendu. */
export function ringWarned(w: World): boolean {
  return w.finalPhase >= 3 && w.finalPhase < FINAL_DONE && w.arenaR > FINAL.ring.min && w.ringT <= FINAL.ring.warn;
}

/** Phase 3 et plus : toucher le cercle de flammes brûle (le héros est tenu à l'intérieur par clampArena). */
function flamesTouch(w: World, dt: number, h: Enemy): void {
  const P = w.player;
  const lim = w.arenaR - PLAYER.radius - 0.05;
  if (P.x * P.x + P.z * P.z < lim * lim || P.invul > 0) return;
  const dmg = FINAL.ring.dps * h.dmgMul * dt * P.taken;
  P.hp -= dmg;
  w.lastHurt = HurtSrc.Flames;
  if (!shieldAbsorb(w, dmg)) {
    w.hurtAt = w.t;
    w.lastAction = w.t;
    w.emit(Ev.PlayerHurt, P.x, P.y + 1, P.z, dmg);
  }
}

/**
 * Phase 4 : le Jugement, toutes les FINAL.judge.every s. Toute l'Arène rougit sauf une zone sûre, à
 * r + min(far, vitesse × telegraph × reach) u du héros : loin, mais atteignable à la course. À l'impact, hors de la
 * zone : FINAL.judge.frac × les PV max (armure comprise).
 */
function tickJudgement(w: World, dt: number): void {
  const J = FINAL.judge,
    P = w.player;
  if (w.judgeT > 0) {
    w.judgeT -= dt;
    if (w.judgeT > 0) return;
    w.judgeT = 0;
    w.judgeNext = J.every;
    const dx = P.x - w.judgeX,
      dz = P.z - w.judgeZ;
    w.emit(Ev.Judgement, w.judgeX, 0, w.judgeZ, J.r, 1);
    if (dx * dx + dz * dz < J.r * J.r || P.invul > 0) return;
    const dmg = J.frac * P.maxHp * P.taken;
    P.hp -= dmg;
    w.lastHurt = HurtSrc.Judgement;
    if (!shieldAbsorb(w, dmg)) {
      w.hurtAt = w.t;
      w.lastAction = w.t;
      w.emit(Ev.PlayerHurt, P.x, P.y + 1, P.z, dmg);
    }
    return;
  }
  if (w.finalPause > 0) return;
  w.judgeNext -= dt;
  if (w.judgeNext > 0) return;
  judgeSpot(w);
  w.judgeT = J.telegraph;
  w.emit(Ev.Judgement, w.judgeX, 0, w.judgeZ, J.r, 0, J.telegraph);
}

/** Distance du héros au centre de la zone sûre du prochain Jugement (u). */
export function judgeDist(w: World): number {
  const J = FINAL.judge;
  return J.r + Math.min(J.far, w.player.speed * J.telegraph * J.reach);
}

/** Place la zone sûre : à judgeDist du héros, dans une direction tirée, à l'intérieur du cercle ; sinon vers le centre. */
function judgeSpot(w: World): void {
  const P = w.player,
    D = judgeDist(w),
    lim = Math.max(0, w.arenaR - FINAL.judge.r - 0.5),
    a0 = w.rng.range(0, TAU);
  for (let k = 0; k < 8; k++) {
    const a = a0 + (k * TAU) / 8,
      x = P.x + Math.sin(a) * D,
      z = P.z + Math.cos(a) * D;
    if (x * x + z * z <= lim * lim) {
      w.judgeX = x;
      w.judgeZ = z;
      return;
    }
  }
  // cercle resserré : de l'autre côté du centre, aussi loin que le cercle le permet (au plus D)
  const d = Math.sqrt(P.x * P.x + P.z * P.z),
    ux = d > 1e-6 ? -P.x / d : Math.sin(a0),
    uz = d > 1e-6 ? -P.z / d : Math.cos(a0),
    s = Math.min(D, d + lim);
  w.judgeX = P.x + ux * s;
  w.judgeZ = P.z + uz * s;
}

/** Garde (x, z) d'un ennemi de rayon `r` dans le cercle de flammes (u). */
export function clampArena(w: World, e: Enemy): void {
  const lim = Math.max(0, w.arenaR - e.r * 0.5),
    d2 = e.x * e.x + e.z * e.z;
  if (d2 <= lim * lim) return;
  const f = lim / Math.sqrt(d2);
  e.x *= f;
  e.z *= f;
}

/**
 * Script du boss final et de ses doubles (step.ts, à la place de tickBoss) : la boucle charge → salve → cercles, plus
 * lente pendant les sceaux, ×FINAL.furyHaste dans la fureur ; immobile pendant la pause d'un changement de phase et
 * pendant l'annonce d'un Jugement (il n'attaque pas pendant qu'on court à la lumière). Déplacement écrit dans mv.
 */
export function tickFinal(w: World, e: Enemy, dt: number, dx: number, dz: number, d: number, mv: Float64Array): void {
  const ux = dx / d,
    uz = dz / d,
    sp = ENEMIES[e.type].speed * e.spd;
  mv[0] = ux * sp;
  mv[1] = uz * sp;
  e.age += dt;
  if (w.finalPause > 0) {
    mv[0] = mv[1] = 0;
    e.state = 0;
    return;
  }
  let cad = e.cadence;
  if (w.finalPhase === 2 && w.seals > 0) cad *= FINAL.sealCadence;
  if (w.finalPhase >= 4) cad *= FINAL.furyHaste;
  const C = FINAL.charge;
  if (e.state === 0) {
    if (w.judgeT > 0) return; // l'annonce du Jugement : il attend
    e.timer -= dt * cad;
    if (e.timer > 0) return;
    if (e.combo === Attack.Charge) {
      if (d < C.range) {
        // la charge du Gardien : recul et rugissement, couloir rouge au sol (rendu), puis la ruée
        e.state = 1;
        e.timer = C.telegraph;
        e.tx = ux;
        e.tz = uz;
        w.emit(Ev.BossRoar, e.x, e.y, e.z, C.telegraph, ux, 0, uz);
      } else e.combo = Attack.Volley; // trop loin pour charger : la salve tout de suite
    } else if (e.combo === Attack.Volley) {
      // la salve de l'Essaim-mère : elle gonfle, puis l'éventail part vers le héros
      e.state = 1;
      e.timer = BOSS.volley.windup;
      e.tx = ux;
      e.tz = uz;
      w.emit(Ev.BossRoar, e.x, e.y, e.z, BOSS.volley.windup, ux, 0, uz);
    } else {
      // les cercles du Colosse : le premier sous le héros, les autres autour (annonce BOSS.zoneTelegraph s)
      const P = w.player,
        dmg = BOSS.zoneDmg * e.dmgMul;
      for (let i = 0; i < FINAL.zoneN; i++) {
        const a = w.rng.range(0, TAU),
          r = i === 0 ? 0 : w.rng.range(1.5, BOSS.zoneSpread);
        zoneAt(w, P.x + Math.sin(a) * r, P.z + Math.cos(a) * r, BOSS.zoneR, BOSS.zoneTelegraph, dmg);
      }
      e.combo = Attack.Charge;
      e.timer = FINAL.gap;
    }
  } else if (e.state === 1) {
    e.timer -= dt;
    if (e.combo === Attack.Charge) {
      mv[0] = -e.tx * BOSS.chargeBack;
      mv[1] = -e.tz * BOSS.chargeBack;
      if (e.timer <= 0) {
        e.state = 2;
        e.timer = C.dist / C.speed;
      }
    } else {
      mv[0] = mv[1] = 0;
      if (e.timer <= 0) {
        fireVolley(w, e, FINAL.volleyN);
        e.state = 0;
        e.combo = Attack.Zones;
        e.timer = FINAL.gap;
      }
    }
  } else if (e.state === 2) {
    // la ruée (le coup est porté par step.ts, comme celui d'une Brute élite : il passe alors à l'état 3)
    mv[0] = e.tx * C.speed;
    mv[1] = e.tz * C.speed;
    e.timer -= dt;
    if (e.timer <= 0) {
      e.state = 3;
      e.timer = C.recover;
    }
  } else {
    mv[0] = mv[1] = 0; // essoufflé : la fenêtre pour frapper
    e.timer -= dt;
    if (e.timer <= 0) {
      e.state = 0;
      e.combo = Attack.Volley;
      e.timer = FINAL.gap;
    }
  }
}

/** Un sceau brisé (combat.ts, à la place d'un kill : ni kill compté, ni or, ni XP, ni effet « au kill »). */
export function sealDown(w: World, e: Enemy): void {
  w.seals = Math.max(0, w.seals - 1);
  w.emit(Ev.Seal, e.x, 0, e.z, w.seals, 1);
  const h = heartOf(w);
  if (!h) return;
  // il emporte sa part des 30 points de la phase ; le dernier laisse le boss au seuil de l'éclipse
  const drain = Math.min(h.hp - FINAL.phases[1] * h.max, FINAL.seal.drain * h.max);
  if (drain > 0) {
    h.hp -= drain;
    h.flash = 0.1;
    w.emit(Ev.Hit, h.x, h.y, h.z, drain, HitSrc.Burn, 0, 0);
  }
  if (w.seals === 0) h.hp = Math.min(h.hp, FINAL.phases[1] * h.max);
}

/**
 * Le boss final est vaincu (combat.ts) : victoire totale. La partie s'arrête (Mode.Won, feuille de victoire : monde
 * infini ou fin), bonus d'or de fin (secondes depuis le dernier bonus) et FINAL.gold ; les doubles s'évanouissent.
 */
export function heartDown(w: World, e: Enemy): void {
  w.finalPhase = FINAL_DONE;
  w.finalId = -1;
  w.judgeT = 0;
  for (let i = 0; i < w.enemyCount; i++) {
    const o = w.enemies[i];
    if (o.alive && o.role === Role.Decoy) decoyGone(w, o);
  }
  w.mode = Mode.Won;
  w.gold += ((w.t - w.goldBonusT) * GOLD.perSecond + FINAL.gold) * w.player.goldMul;
  w.goldBonusT = w.t;
  w.emit(Ev.FinalPhase, e.x, e.y, e.z, FINAL_DONE);
  w.emit(Ev.Victory, e.x, 1, e.z, w.t);
}

/**
 * Relecture de la décision 15 : une partie gardée par la 1.67 (sans `cleared`) déjà gagnée (feuille de victoire, ou
 * monde infini) a vaincu le monde 3 : elle le reste. Hors défi du jour.
 */
export function adoptCleared(w: World): void {
  if (!w.cleared && w.dailyEnd <= 0 && (w.endless || w.mode === Mode.Won)) w.cleared = true;
}
