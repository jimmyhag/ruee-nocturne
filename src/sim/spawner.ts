import { ARCHER, ARCHER_TYPE, BOSS, BOSS_TYPE, CAPS, CRACHEUR_TYPE, ELITE, ELITE_TYPE, SORCIER_TYPE, ENEMIES, HAZARDS, SPAWN, STAGE, VOLANT, VOLANT_TYPE } from './balance';
import { Ev } from './types';
import type { World } from './world';

const TAU = Math.PI * 2;

export function spawnEnemy(w: World, type: number, ang: number, dist: number, elite = false): number {
  const e = w.allocEnemy();
  if (!e) return -1;
  const def = ENEMIES[type];
  // phase 37 : difficulté au temps du monde (diffT) et renfort de prolongation (over*, 1 tant que le chrono tourne)
  let scale = SPAWN.hpScale(w.diffT) * w.overHp * (def.boss ? 1 + w.bossCount * STAGE.bossHpPerBoss : 1);
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
  e.spd = w.rng.range(0.9, 1.1) * SPAWN.spdScale(w.diffT) * w.overSpd;
  e.dmgMul = SPAWN.dmgScale(w.diffT) * w.overDmg;
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
  e.combo = 0;
  e.hunt = 0;
  e.huntT = BOSS.huntFirst; // phase 45 : première Traque d'un boss peu après son arrivée
  e.detour = 0;
  e.stun = 0;
  e.slowT = 0;
  e.burn = e.burnT = e.burnAcc = 0;
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
  const calm = w.endless ? w.bossIndex >= 0 : w.totemBossId >= 0;
  let rate = SPAWN.rate(t) * w.overRate * (calm && w.overT === 0 ? STAGE.bossRate : 1) * w.player.spawnMul; // phase 47 : tome Défi
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
      spawnEnemy(w, type, w.rng.range(0, TAU), w.rng.range(SPAWN.ringMin, SPAWN.ringMax));
    }
  }
  // élite : variante dorée d'un type de masse, lâche un coffre
  if (st >= w.nextElite) {
    w.nextElite += SPAWN.elitePeriod / w.player.eliteRate; // phase 47 : tome Défi, élites plus fréquentes
    const type = SPAWN.pick(t, w.rng.next());
    // jamais un Cracheur ni un Sorcier élite (ils fuient et le coffre serait hors d'atteinte) ; l'Archer élite tire en éventail
    spawnEnemy(w, type === CRACHEUR_TYPE || type === SORCIER_TYPE ? ELITE_TYPE : type, w.rng.range(0, TAU), SPAWN.ringMin, true);
  }
  if (st >= w.nextWave) {
    w.nextWave += SPAWN.wavePeriod;
    const n = Math.round(SPAWN.waveCount(t) * Math.min(STAGE.overWaveCap, w.overRate));
    for (let i = 0; i < n && w.enemyCount < CAPS.enemies; i++) spawnEnemy(w, t > SPAWN.waveDardAfter ? 1 : 0, (i / n) * TAU, SPAWN.waveDist);
    w.emit(Ev.Wave, w.player.x, 0, w.player.z, n);
  }
}
