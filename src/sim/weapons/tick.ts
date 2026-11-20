import { BALISE, BOOMERANG, BURST, CAPS, ENEMIES, ESPRITS, FAUX, FOUET, ITEM, It, LAMES, LANCE, METEOR, MINES, SYN, Syn, TRAIT, VITRIOL } from '../balance';
import { hitEnemy } from '../combat';
import { Ev, HitSrc, ProjKind, Trait } from '../types';
import type { Enemy, Projectile } from '../types';
import type { World } from '../world';
import { weaponStats } from './defs';

/**
 * Phase 47 B, Miroir : une arme qui vient de tirer a une chance de retirer aussitôt (sa recharge est ramenée à
 * ITEM.miroir.delay s). Sans l'objet, aucun tirage du rng : les parties d'avant restent identiques.
 */
function echo(w: World, cd: number): number {
  const n = w.itemEff[It.Miroir];
  return n > 0 && w.rng.next() < ITEM.miroir.chance * n ? Math.min(cd, ITEM.miroir.delay) : cd;
}

const MAX_ENEMY_R = 2.6; // Colosse
// tampons réutilisés (zéro allocation)
const near = new Int32Array(9); // Lames et Esprits : 1 + 4 lignes + 3 (tome Projectiles) cibles au plus
const nearD = new Float64Array(9);
const seen = new Int32Array(16);
const seenX = new Float64Array(9); // phase 32 : positions des cibles des Lames (taille de `near`)
const seenZ = new Float64Array(9);
const hits = new Int32Array(CAPS.enemies); // phase 47 C (relecture perf) : 256 tronquait en silence les requêtes larges (Balise, Fouet) dans une grande horde

/** Les n ennemis les plus proches dans `range`. Retourne le nombre trouvé. Résultat dans `near`. */
function nearest(w: World, n: number, range: number): number {
  let count = 0;
  const r2 = range * range;
  const px = w.player.x,
    pz = w.player.z;
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    if (!e.alive) continue;
    const dx = e.x - px,
      dz = e.z - pz,
      d = dx * dx + dz * dz;
    if (d >= r2) continue;
    // insertion triée dans un tableau de taille n
    if (count < n) {
      let k = count++;
      while (k > 0 && nearD[k - 1] > d) {
        nearD[k] = nearD[k - 1];
        near[k] = near[k - 1];
        k--;
      }
      nearD[k] = d;
      near[k] = i;
    } else if (d < nearD[n - 1]) {
      let k = n - 1;
      while (k > 0 && nearD[k - 1] > d) {
        nearD[k] = nearD[k - 1];
        near[k] = near[k - 1];
        k--;
      }
      nearD[k] = d;
      near[k] = i;
    }
  }
  return count;
}

/** Tire un orbe depuis le joueur à l'angle a. Exporté pour la salve du Bond (phase 19). */
export function fireAngle(w: World, a: number, dmg: number, pierce: number, speed: number): Projectile | null {
  const p = w.allocProj();
  if (!p) return null;
  p.kind = ProjKind.Orbe;
  p.x = p.px = w.player.x;
  p.z = p.pz = w.player.z;
  p.y = w.player.y + 1;
  p.vx = Math.sin(a) * speed;
  p.vz = Math.cos(a) * speed;
  p.life = 1.3 * w.player.projLifeMul;
  p.age = 0;
  p.dmg = dmg;
  p.pierce = pierce;
  p.hit0 = p.hit1 = p.hit2 = -1;
  p.ret = false;
  p.armed = false;
  return p;
}

/**
 * 1.69.0 (docs/specs/rafales-faux-guidage.md, décisions 6 et 7, précisions de Jimmy) : cible d'un tir de rafale. La plus
 * proche (`far` faux : Orbe, Boomerang, Fouet) ou la plus loin (`far` vrai : Lance) à moins de `range` u qui n'est pas
 * « couverte » : les dégâts déjà en route vers elle suffisent à la tuer, ou elle a déjà reçu BURST.maxSame tirs de cette
 * rafale (`burst`). Si toutes le sont, le tir repart vers la première. Un ennemi seul reçoit toute la rafale, une élite
 * dans la horde deux tirs (le reste va à la horde), une horde fragile un tir chacun. -1 s'il n'y a aucun ennemi à
 * portée. Un seul balayage, sans tri ni allocation.
 */
function burstTarget(w: World, range: number, far: boolean, burst: number): number {
  const P = w.player,
    r2 = range * range;
  let first = -1,
    fd = far ? -1 : r2,
    pick = -1,
    pd = fd;
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    if (!e.alive) continue;
    const dx = e.x - P.x,
      dz = e.z - P.z,
      d = dx * dx + dz * dz;
    if (d >= r2) continue;
    if (far ? d > fd : d < fd) {
      fd = d;
      first = i;
    }
    if (e.inboundT > w.t && e.inbound >= e.hp) continue; // déjà condamné par les tirs en vol
    if (e.burstId === burst && e.burstHits >= BURST.maxSame) continue; // sa part de la rafale est prise
    if (far ? d > pd : d < pd) {
      pd = d;
      pick = i;
    }
  }
  return pick >= 0 ? pick : first;
}

/** Un tir de la rafale `burst` part vers `e` (BURST.maxSame). */
function countShot(e: Enemy, burst: number): void {
  if (e.burstId !== burst) {
    e.burstId = burst;
    e.burstHits = 0;
  }
  e.burstHits++;
}

/**
 * Un tir de rafale part vers l'ennemi `i` : compté pour sa rafale, et ses dégâts attendus (multiplicateurs du héros,
 * sans critique) comptent comme « en route » jusqu'à l'arrivée prévue (distance / vitesse + BURST.margin) ; au-delà,
 * le compteur repart de zéro.
 */
function aimAt(w: World, i: number, dmg: number, speed: number, burst: number): void {
  const e = w.enemies[i],
    P = w.player;
  countShot(e, burst);
  const dx = e.x - P.x,
    dz = e.z - P.z,
    arrive = w.t + Math.sqrt(dx * dx + dz * dz) / Math.max(1e-6, speed) + BURST.margin;
  if (e.inboundT <= w.t) e.inbound = 0;
  e.inbound += dmg * P.dmgMul * (e.elite || ENEMIES[e.type].boss ? P.eliteDmgMul : 1) * w.rule().heroDmg;
  e.inboundT = Math.max(e.inboundT, arrive);
}

/**
 * 1.69.0 (docs/specs/rafales-faux-guidage.md, décision 6) : écart entre deux tirs d'une rafale (BURST.gap), toujours plus
 * court que la recharge `cd`. Une rafale de n tirs peut durer plus que la recharge : la suivante attend qu'elle finisse.
 */
function burstGap(gap: number, cd: number): number {
  return Math.min(gap, cd);
}

/** Orbe : un tir vers l'ennemi le plus proche à moins de 15 u au moment du tir (burstTarget). Faux s'il n'y en a pas. */
function orbeShot(w: World, s: Record<string, number>): boolean {
  const ti = burstTarget(w, 15, false, w.wstate.orbeB);
  if (ti < 0) return false;
  const P = w.player,
    t = w.enemies[ti];
  const a = Math.atan2(t.x - P.x, t.z - P.z);
  fireAngle(w, a, s.dmg, s.pierce, s.speed);
  aimAt(w, ti, s.dmg, s.speed, w.wstate.orbeB);
  P.recoil = 0.14;
  w.emit(Ev.Shoot, P.x + Math.sin(a) * 0.6, P.y + 1, P.z + Math.cos(a) * 0.6, 1);
  return true;
}

/** Lance : une lance (bit `i` de la salve en cours) vers l'ennemi le plus loin à portée (burstTarget). Faux s'il n'y en a pas. */
function lanceShot(w: World, s: Record<string, number>, i: number): boolean {
  const P = w.player;
  const best = burstTarget(w, LANCE.range, true, w.wstate.lanceSalvo);
  if (best < 0) return false;
  const t = w.enemies[best];
  const a = Math.atan2(t.x - P.x, t.z - P.z);
  const p = fireAngle(w, a, s.dmg, 999, s.speed);
  aimAt(w, best, s.dmg, s.speed, w.wstate.lanceSalvo);
  if (p) {
    p.kind = ProjKind.Lance;
    p.life = (LANCE.range / s.speed) * LANCE.lifeMargin * P.projLifeMul;
    p.hit0 = w.wstate.lanceSalvo; // une lance n'a pas de liste d'ennemis touchés : hit0 = salve, hit1 = bit de la lance
    p.hit1 = 1 << i;
  }
  w.emit(Ev.Shoot, P.x + Math.sin(a) * 0.6, P.y + 1, P.z + Math.cos(a) * 0.6, 1, 1); // x2 = 1 : Lance (son)
  return true;
}

/** Boomerang : un lancer vers l'ennemi le plus proche, où qu'il soit (burstTarget). Faux s'il n'y en a aucun. */
function boomShot(w: World, s: Record<string, number>): boolean {
  const ti = burstTarget(w, Infinity, false, w.wstate.boomB);
  if (ti < 0) return false;
  const P = w.player,
    t = w.enemies[ti];
  const p = fireAngle(w, Math.atan2(t.x - P.x, t.z - P.z), s.dmg, 999, s.speed);
  aimAt(w, ti, s.dmg, s.speed, w.wstate.boomB);
  if (p) {
    p.kind = ProjKind.Boomerang;
    p.r = s.range;
    p.life = BOOMERANG.safetyLife;
    p.y = P.y + 0.9;
  }
  w.emit(Ev.Throw, P.x, P.y + 0.9, P.z, 1);
  return true;
}

/**
 * Fouet : une claque en ligne vers l'ennemi le plus proche à portée ; sans lui, dans la direction du regard, sauf pour
 * le premier coup d'une rafale (`first`), qui ne part que sur une cible. Faux si rien n'a claqué.
 */
function lash(w: World, s: Record<string, number>, first: boolean): boolean {
  const P = w.player,
    L = s.r;
  let dx = P.dirX,
    dz = P.dirZ;
  const ti = burstTarget(w, L, false, w.wstate.fouetB); // la claque frappe aussitôt : rien à mettre « en route »
  if (ti >= 0) {
    const t = w.enemies[ti];
    countShot(t, w.wstate.fouetB);
    const ex = t.x - P.x,
      ez = t.z - P.z,
      d = Math.sqrt(ex * ex + ez * ez);
    if (d > 1e-6) {
      dx = ex / d;
      dz = ez / d;
    }
  } else if (first) return false;
  const n = w.grid.query(w.enemies, P.x, P.z, L, MAX_ENEMY_R, hits);
  let touched = 0;
  for (let k = 0; k < n; k++) {
    const e = w.enemies[hits[k]];
    if (!e.alive) continue;
    const ex = e.x - P.x,
      ez = e.z - P.z,
      along = ex * dx + ez * dz;
    if (along < -e.r || along > L + e.r) continue;
    if (Math.abs(ex * dz - ez * dx) > FOUET.halfW + e.r) continue;
    hitEnemy(w, hits[k], s.dmg, FOUET.kb, P.x, P.z, HitSrc.Fouet);
    touched++;
  }
  if (w.syn[Syn.Saignee] && touched > 0) P.hp = Math.min(P.maxHp, P.hp + SYN.saignee.heal * Math.min(touched, SYN.saignee.max));
  w.emit(Ev.Whip, P.x, P.y + FOUET.h, P.z, L, dx, 0, dz);
  return true;
}

export function tickWeapons(w: World, dt: number): void {
  const P = w.player,
    S = w.wstate;

  // ---- Orbe filante / Nova ----
  // 1.69.0 (décision 6) : ses n projectiles partent en rafale, chacun vers l'ennemi le plus proche au moment du tir
  const lvO = w.weapons.orbe ?? 0;
  if (lvO > 0) {
    const s = weaponStats(w, 'orbe');
    S.orbeT -= dt;
    if (S.orbeLeft > 0 && (S.orbeGap -= dt) <= 0) {
      if (orbeShot(w, s)) {
        S.orbeLeft--;
        S.orbeGap += burstGap(BURST.gap.orbe, s.cd * P.cdMul);
      } else S.orbeLeft = 0; // plus aucune cible : la rafale s'arrête
    }
    if (S.orbeT <= 0 && S.orbeLeft === 0) {
      S.orbeB = ++S.burstSeq; // une rafale nouvelle : ses tirs se comptent à part (BURST.maxSame)
      if (orbeShot(w, s)) {
        const cd = s.cd * P.cdMul;
        S.orbeT = echo(w, cd); // la recharge part du premier tir
        S.orbeLeft = Math.max(0, s.n - 1);
        S.orbeGap = burstGap(BURST.gap.orbe, cd);
      } else S.orbeT = 0.15;
    }
  }

  // ---- Halo brûlant / Soleil noir ----
  const lvA = w.weapons.aura ?? 0;
  if (lvA > 0) {
    const s = weaponStats(w, 'aura');
    const braise = w.trait === Trait.Braise ? 1 + Math.min(TRAIT.braise.max, (TRAIT.braise.perMin * w.t) / 60) : 1;
    const r = s.r * braise;
    const dmg = s.dmg;
    S.auraT -= dt;
    S.auraPulse = Math.max(0, S.auraPulse - dt * 3);
    if (S.auraT <= 0) {
      S.auraT = s.period * P.cdMul;
      S.auraPulse = 1;
      const n = w.grid.query(w.enemies, P.x, P.z, r, MAX_ENEMY_R, hits);
      for (let k = 0; k < n; k++) hitEnemy(w, hits[k], dmg, 1.5, P.x, P.z, HitSrc.Aura);
      w.emit(Ev.AuraPulse, P.x, 0, P.z, r);
    }
  }

  // ---- Lames (phase 32) : frappent les n ennemis les plus proches, zone de coupe r autour de chaque cible ----
  const lvL = w.weapons.lames ?? 0;
  if (lvL > 0) {
    S.bladeT -= dt;
    if (S.bladeT <= 0) {
      const s = weaponStats(w, 'lames');
      const found = nearest(w, Math.min(s.n, near.length), LAMES.range * w.bladeRangeMul);
      if (found > 0) {
        S.bladeT = echo(w, s.cd * P.cdMul);
        const kb = LAMES.kb * (w.trait === Trait.Fendeur ? TRAIT.fendeur.kbMul : 1); // Bûcheron : Fendeur
        // positions des cibles copiées d'abord : une cible peut mourir sous le coup d'une autre (zones qui se recouvrent),
        // son coup tombe quand même à l'endroit visé
        for (let c = 0; c < found; c++) {
          const t = w.enemies[near[c]];
          seenX[c] = t.x;
          seenZ[c] = t.z;
        }
        for (let c = 0; c < found; c++) {
          const tx = seenX[c],
            tz = seenZ[c];
          const n = w.grid.query(w.enemies, tx, tz, s.r, MAX_ENEMY_R, hits);
          for (let k = 0; k < n; k++) {
            // un ennemi pris dans plusieurs zones du même coup n'est frappé qu'une fois (relecture perf phase 32)
            const e = w.enemies[hits[k]];
            if (e.lastBlade === w.t) continue;
            e.lastBlade = w.t;
            hitEnemy(w, hits[k], s.dmg, kb, P.x, P.z, HitSrc.Lames);
          }
          const dx = tx - P.x,
            dz = tz - P.z,
            d = Math.sqrt(dx * dx + dz * dz) || 1;
          w.emit(Ev.Blade, tx, P.y + 0.9, tz, s.r, dx / d, 0, dz / d);
        }
      } else S.bladeT = LAMES.wait;
    }
  }

  // ---- Foudre en chaîne / Orage ----
  const lvF = w.weapons.foudre ?? 0;
  if (lvF > 0) {
    const s = weaponStats(w, 'foudre');
    S.foudreT -= dt;
    if (S.foudreT <= 0) {
      // cible initiale : un ennemi aléatoire à < 13 u (tirage par rejet borné, déterministe) ; Sorcière : le plus proche
      let cur = -1;
      if (w.trait === Trait.Paratonnerre && nearest(w, 1, 13) > 0) cur = near[0];
      for (let tries = 0; cur < 0 && tries < 12 && w.enemyCount > 0; tries++) {
        const i = w.rng.int(w.enemyCount);
        const e = w.enemies[i];
        const dx = e.x - P.x,
          dz = e.z - P.z;
        if (e.alive && dx * dx + dz * dz < 169) {
          cur = i;
          break;
        }
      }
      if (cur >= 0) {
        S.foudreT = echo(w, s.cd * P.cdMul);
        const chain = s.chain;
        let seenN = 0;
        let px = w.enemies[cur].x,
          py = 10,
          pz = w.enemies[cur].z;
        for (let c = 0; c <= chain && cur >= 0 && seenN < seen.length; c++) {
          seen[seenN++] = cur;
          const e = w.enemies[cur];
          const cy = e.y;
          w.emit(Ev.Bolt, px, py, pz, 1 + HitSrc.Foudre, e.x, cy, e.z); // v : 1 + index de l'arme (HitSrc = WEAPON_KEYS ; palier du rendu)
          hitEnemy(w, cur, s.dmg, 2, e.x + 0.01, e.z, HitSrc.Foudre);
          px = e.x;
          py = cy;
          pz = e.z;
          // prochain : plus proche non vu dans 7 u
          let best = -1,
            bd = 49;
          for (let i = 0; i < w.enemyCount; i++) {
            const o = w.enemies[i];
            if (!o.alive) continue;
            let already = false;
            for (let k = 0; k < seenN; k++) if (seen[k] === i) already = true;
            if (already) continue;
            const dx = o.x - px,
              dz = o.z - pz,
              d = dx * dx + dz * dz;
            if (d < bd) {
              bd = d;
              best = i;
            }
          }
          cur = best;
        }
      } else S.foudreT = 0.3;
    }
  }

  // ---- Boomerang : part vers l'ennemi le plus proche (1.69.0, en rafale ; le regard avant), revient, traverse ----
  const lvB = w.weapons.boomerang ?? 0;
  if (lvB > 0) {
    const s = weaponStats(w, 'boomerang');
    S.boomT -= dt;
    if (S.boomLeft > 0 && (S.boomGap -= dt) <= 0) {
      if (boomShot(w, s)) {
        S.boomLeft--;
        S.boomGap += burstGap(BURST.gap.boomerang, s.cd * P.cdMul);
      } else S.boomLeft = 0;
    }
    if (S.boomT <= 0 && S.boomLeft === 0) {
      S.boomB = ++S.burstSeq;
      if (boomShot(w, s)) {
        const cd = s.cd * P.cdMul;
        S.boomT = echo(w, cd);
        S.boomLeft = Math.max(0, s.n - 1);
        S.boomGap = burstGap(BURST.gap.boomerang, cd);
      } else S.boomT = BOOMERANG.wait;
    }
  }

  // ---- Faux (phase 28) : des faux autour du regard, qui fauchent ensemble et repoussent ----
  // 1.69.0 (décision 9) : n faux de `arc` degrés chacune, côte à côte et centrées sur le regard (1 devant, 2 tout
  // l'avant, 3 le tour complet) ; un ennemi dans l'ouverture totale est fauché une fois par coup
  const lvX = w.weapons.faux ?? 0;
  if (lvX > 0) {
    const s = weaponStats(w, 'faux');
    S.fauxT -= dt;
    if (S.fauxT <= 0) {
      const nF = Math.max(1, Math.min(FAUX.maxN, s.n)),
        open = Math.min(360, nF * s.arc), // ouverture totale, en degrés
        r = s.r,
        cosHalf = Math.cos((open * Math.PI) / 360),
        dx0 = P.dirX,
        dz0 = P.dirZ;
      const n = w.grid.query(w.enemies, P.x, P.z, r, MAX_ENEMY_R, hits);
      let fauched = 0;
      for (let k = 0; k < n; k++) {
        const e = w.enemies[hits[k]];
        const dx = e.x - P.x,
          dz = e.z - P.z,
          d = Math.sqrt(dx * dx + dz * dz);
        if (open < 360 && d > 1e-6 && (dx * dx0 + dz * dz0) / d < cosHalf && d > e.r) continue; // hors des faux (sauf collé au joueur)
        if (hitEnemy(w, hits[k], s.dmg, FAUX.kb, P.x, P.z, HitSrc.Faux)) fauched++;
      }
      if (n > 0) {
        S.fauxT = echo(w, s.cd * P.cdMul);
        if (w.syn[Syn.Moissonneuse] && fauched > 0) P.hp = Math.min(P.maxHp, P.hp + SYN.moissonneuse.heal * Math.min(fauched, SYN.moissonneuse.max));
        // une faux par événement : direction de son milieu (x2, z2), son arc en degrés (y2) ; l'écart entre deux faux
        // est ramené à 360 / n quand elles font le tour
        const a0 = Math.atan2(dx0, dz0),
          stepDeg = Math.min(s.arc, 360 / nF);
        for (let j = 0; j < nF; j++) {
          const a = a0 + ((j - (nF - 1) / 2) * stepDeg * Math.PI) / 180;
          w.emit(Ev.Scythe, P.x, P.y + 0.9, P.z, r, Math.sin(a), s.arc, Math.cos(a));
        }
      } else S.fauxT = FAUX.wait;
    }
  }

  // ---- Lance (phase 28) : vers l'ennemi le plus loin à portée, perce tout ; 1.69.0 : en rafale ----
  const lvN = w.weapons.lance ?? 0;
  if (lvN > 0) {
    const s = weaponStats(w, 'lance');
    const nL = Math.min(s.n, LANCE.maxPerSalvo);
    S.lanceT -= dt;
    if (S.lanceLeft > 0 && (S.lanceGap -= dt) <= 0) {
      if (S.lanceI < LANCE.maxPerSalvo && lanceShot(w, s, S.lanceI)) {
        S.lanceI++;
        S.lanceLeft--;
        S.lanceGap += burstGap(BURST.gap.lance, s.cd * P.cdMul);
      } else S.lanceLeft = 0;
    }
    if (S.lanceT <= 0 && S.lanceLeft === 0) {
      // une salve de plus : chaque lance touche chaque ennemi une fois (un bit par lance) ; son numéro sert aussi
      // d'identifiant de rafale (BURST.maxSame), pris dans la même suite que les autres armes
      S.lanceSalvo = S.burstSeq = Math.max(S.burstSeq, S.lanceSalvo) + 1; // (une partie gardée en 1.68 a déjà des salves)
      if (lanceShot(w, s, 0)) {
        const cd = s.cd * P.cdMul;
        S.lanceT = echo(w, cd);
        S.lanceI = 1;
        S.lanceLeft = Math.max(0, nL - 1);
        S.lanceGap = burstGap(BURST.gap.lance, cd);
      } else S.lanceT = LANCE.retry;
    }
  }

  // ---- Météores (phase 28) : cercles annoncés autour, puis impact de zone ----
  const lvT = w.weapons.meteores ?? 0;
  if (lvT > 0) {
    const s = weaponStats(w, 'meteores');
    S.metT -= dt;
    if (S.metT <= 0 && w.enemyCount > 0) {
      S.metT = echo(w, s.cd * P.cdMul);
      for (let i = 0; i < s.n && S.metN < METEOR.max; i++) {
        // sur un ennemi au hasard à portée (tirage par rejet borné), sinon autour du joueur
        let x = P.x + w.rng.range(-METEOR.around, METEOR.around),
          z = P.z + w.rng.range(-METEOR.around, METEOR.around);
        for (let tries = 0; tries < METEOR.tries; tries++) {
          const e = w.enemies[w.rng.int(w.enemyCount)];
          const dx = e.x - P.x,
            dz = e.z - P.z;
          if (e.alive && dx * dx + dz * dz < METEOR.range * METEOR.range) {
            x = e.x;
            z = e.z;
            break;
          }
        }
        const k = S.metN++;
        S.metX[k] = x;
        S.metZ[k] = z;
        S.metLeft[k] = METEOR.delay;
        w.emit(Ev.MeteorWarn, x, 0, z, s.r, METEOR.delay);
      }
    }
    for (let k = S.metN - 1; k >= 0; k--) {
      S.metLeft[k] -= dt;
      if (S.metLeft[k] > 0) continue;
      const x = S.metX[k],
        z = S.metZ[k];
      const n = w.grid.query(w.enemies, x, z, s.r, MAX_ENEMY_R, hits);
      for (let j = 0; j < n; j++) hitEnemy(w, hits[j], s.dmg, METEOR.kb, x, z, HitSrc.Meteores);
      w.emit(Ev.MeteorHit, x, 0, z, s.r);
      // retrait sans allocation : le dernier prend la place
      const last = --S.metN;
      S.metX[k] = S.metX[last];
      S.metZ[k] = S.metZ[last];
      S.metLeft[k] = S.metLeft[last];
    }
  }

  // ---- Fouet (phase 47 C) : claque en ligne ; 1.69.0 (décisions 6 et 7) : n claques en rafale, chacune vers l'ennemi
  // le plus proche à portée, sinon dans la direction du regard ; une rafale ne part que sur une cible ----
  const lvW = w.weapons.fouet ?? 0;
  if (lvW > 0) {
    const s = weaponStats(w, 'fouet');
    const nW = Math.min(FOUET.maxLashes, s.n);
    S.fouetT -= dt;
    if (S.fouetLeft > 0 && (S.fouetGap -= dt) <= 0) {
      lash(w, s, false);
      S.fouetLeft--;
      S.fouetGap += burstGap(BURST.gap.fouet, s.cd * P.cdMul);
    }
    if (S.fouetT <= 0 && S.fouetLeft === 0) {
      S.fouetB = ++S.burstSeq;
      if (lash(w, s, true)) {
        const cd = s.cd * P.cdMul;
        S.fouetT = echo(w, cd);
        S.fouetLeft = Math.max(0, nW - 1);
        S.fouetGap = burstGap(BURST.gap.fouet, cd);
      } else S.fouetT = FOUET.wait;
    }
  }

  // ---- Vitriol (phase 47 C) : fiole lancée sur le plus gros groupe, flaque qui blesse et ralentit ----
  const lvV = w.weapons.vitriol ?? 0;
  if (lvV > 0) {
    const s = weaponStats(w, 'vitriol');
    S.vitT -= dt;
    if (S.vitT <= 0 && w.enemyCount > 0) {
      let thrown = 0;
      const R2 = VITRIOL.range * VITRIOL.range;
      for (let i = 0; i < s.n && S.vitN < VITRIOL.max; i++) {
        // le groupe le plus dense parmi quelques ennemis tirés au hasard à portée
        let bx = 0,
          bz = 0,
          best = -1;
        for (let tries = 0; tries < VITRIOL.tries; tries++) {
          const e = w.enemies[w.rng.int(w.enemyCount)];
          const dx = e.x - P.x,
            dz = e.z - P.z;
          if (!e.alive || dx * dx + dz * dz > R2) continue;
          const c = w.grid.query(w.enemies, e.x, e.z, s.r, MAX_ENEMY_R, hits);
          if (c > best) {
            best = c;
            bx = e.x;
            bz = e.z;
          }
        }
        if (best < 0) break;
        const k = S.vitN++;
        S.vitX[k] = bx;
        S.vitZ[k] = bz;
        S.vitLeft[k] = VITRIOL.dur * (w.syn[Syn.Corrosion] ? SYN.corrosion.dur : 1);
        S.vitTick[k] = (i / s.n) * VITRIOL.tick; // premier coup à l'impact ; les fioles d'un même lancer frappent en décalé (pas de rafale d'événements au même pas)
        w.emit(Ev.Puddle, bx, 0, bz, s.r);
        thrown++;
      }
      if (thrown > 0) {
        S.vitT = echo(w, s.cd * P.cdMul);
        w.emit(Ev.Throw, P.x, P.y + 1, P.z);
      } else S.vitT = VITRIOL.retry;
    }
    for (let k = S.vitN - 1; k >= 0; k--) {
      S.vitLeft[k] -= dt;
      S.vitTick[k] -= dt;
      if (S.vitTick[k] <= 0) {
        S.vitTick[k] += VITRIOL.tick;
        const x = S.vitX[k],
          z = S.vitZ[k];
        const n = w.grid.query(w.enemies, x, z, s.r, MAX_ENEMY_R, hits);
        for (let j = 0; j < n; j++) {
          const e = w.enemies[hits[j]];
          if (!ENEMIES[e.type].boss) e.slowT = Math.max(e.slowT, VITRIOL.slowT);
          hitEnemy(w, hits[j], s.dmg, 0, x, z, HitSrc.Vitriol);
        }
      }
      if (S.vitLeft[k] <= 0) {
        const last = --S.vitN;
        S.vitX[k] = S.vitX[last];
        S.vitZ[k] = S.vitZ[last];
        S.vitLeft[k] = S.vitLeft[last];
        S.vitTick[k] = S.vitTick[last];
      }
    }
  }

  // ---- Esprits (phase 47 C) : ils tournent autour du héros, foncent sur un ennemi proche, reviennent ----
  const lvE = w.weapons.esprits ?? 0;
  if (lvE > 0) {
    const s = weaponStats(w, 'esprits');
    const n = Math.min(ESPRITS.max, s.n | 0);
    const pack = w.syn[Syn.Meute] !== 0;
    const speed = s.speed * (pack ? SYN.meute.speed : 1);
    S.spA += dt * ESPRITS.orbitSpd;
    for (let i = 0; i < n; i++) {
      const a = S.spA + (i / n) * Math.PI * 2;
      const ox = P.x + Math.sin(a) * ESPRITS.orbitR,
        oz = P.z + Math.cos(a) * ESPRITS.orbitR;
      if (i >= S.spN) {
        // nouvel esprit (ligne « +1 esprit », changement de monde) : il naît dans la ronde, départs décalés
        S.spX[i] = ox;
        S.spZ[i] = oz;
        S.spS[i] = 0;
        S.spT[i] = ESPRITS.stagger * (i + 1);
      }
      if (S.spS[i] === 0) {
        S.spX[i] = ox;
        S.spZ[i] = oz;
        S.spT[i] -= dt;
        if (S.spT[i] <= 0) {
          const c = nearest(w, n, ESPRITS.range);
          if (c > 0) {
            const ti = near[i % c]; // chacun sa cible quand il y en a assez
            S.spTi[i] = ti;
            S.spTid[i] = w.enemies[ti].id;
            S.spS[i] = 1;
          } else S.spT[i] = ESPRITS.retry;
        }
        continue;
      }
      let tx = ox,
        tz = oz,
        reach = 0;
      if (S.spS[i] === 1) {
        const ti = S.spTi[i];
        const e = ti < w.enemyCount ? w.enemies[ti] : null;
        const lx = S.spX[i] - P.x,
          lz = S.spZ[i] - P.z;
        if (e && e.alive && e.id === S.spTid[i] && lx * lx + lz * lz < ESPRITS.leash * ESPRITS.leash) {
          tx = e.x;
          tz = e.z;
          reach = ESPRITS.hitR + e.r;
        } else S.spS[i] = 2; // cible morte, déplacée dans le pool, ou trop loin du héros : retour
      }
      const dx = tx - S.spX[i],
        dz = tz - S.spZ[i],
        d = Math.sqrt(dx * dx + dz * dz),
        stepLen = speed * dt;
      if (S.spS[i] === 1 && d <= reach + stepLen) {
        hitEnemy(w, S.spTi[i], s.dmg, ESPRITS.kb, S.spX[i], S.spZ[i], HitSrc.Esprits);
        S.spS[i] = 2;
      } else if (S.spS[i] === 2 && d <= stepLen) {
        S.spS[i] = 0;
        S.spT[i] = echo(w, s.cd * P.cdMul * (pack ? SYN.meute.cd : 1));
      } else if (d > 1e-6) {
        const m = Math.min(stepLen, d) / d;
        S.spX[i] += dx * m;
        S.spZ[i] += dz * m;
      }
    }
    S.spN = n;
  }

  // ---- Balise (phase 47 C) : posée où se tient le héros, elle tire seule sur l'ennemi le plus proche d'elle ----
  const lvB2 = w.weapons.balise ?? 0;
  if (lvB2 > 0) {
    const s = weaponStats(w, 'balise');
    S.balT -= dt;
    if (S.balT <= 0) {
      const cap = Math.min(BALISE.max, s.n | 0);
      let k = S.balN;
      if (k < cap) S.balN++;
      else {
        // au plafond : la plus ancienne (celle à qui il reste le moins de temps) est relevée et replantée ici
        k = 0;
        for (let j = 1; j < S.balN; j++) if (S.balLeft[j] < S.balLeft[k]) k = j;
      }
      {
        S.balX[k] = P.x;
        S.balZ[k] = P.z;
        S.balLeft[k] = BALISE.dur;
        S.balShot[k] = BALISE.first;
        S.balT = echo(w, s.cd * P.cdMul);
        w.emit(Ev.Beacon, P.x, 0, P.z, s.r);
      }
    }
    const targets = 1 + (w.syn[Syn.Batterie] ? SYN.batterie.targets : 0);
    for (let k = S.balN - 1; k >= 0; k--) {
      S.balLeft[k] -= dt;
      S.balShot[k] -= dt;
      if (S.balShot[k] <= 0) {
        const x = S.balX[k],
          z = S.balZ[k];
        const n = w.grid.query(w.enemies, x, z, s.r, MAX_ENEMY_R, hits);
        let shot = 0,
          lastD = -1;
        for (let t = 0; t < targets; t++) {
          // la t-ième plus proche de la balise : sélection sans tri ni allocation
          let bi = -1,
            bd = 1e18;
          for (let j = 0; j < n; j++) {
            const e = w.enemies[hits[j]];
            if (!e.alive) continue;
            const d = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
            if (d > lastD && d < bd) {
              bd = d;
              bi = hits[j];
            }
          }
          if (bi < 0) break;
          lastD = bd;
          const e = w.enemies[bi];
          w.emit(Ev.Bolt, x, BALISE.h, z, 1 + HitSrc.Balise, e.x, e.y + BALISE.aim, e.z);
          hitEnemy(w, bi, s.dmg, BALISE.kb, x, z, HitSrc.Balise);
          shot++;
        }
        S.balShot[k] = shot > 0 ? s.period * P.cdMul : BALISE.retry;
      }
      if (S.balLeft[k] <= 0) {
        const last = --S.balN;
        S.balX[k] = S.balX[last];
        S.balZ[k] = S.balZ[last];
        S.balLeft[k] = S.balLeft[last];
        S.balShot[k] = S.balShot[last];
      }
    }
  }

  // ---- Mines : posées sur le passage, explosent au contact ----
  const lvM = w.weapons.mines ?? 0;
  if (lvM > 0) {
    const s = weaponStats(w, 'mines');
    S.mineT -= dt;
    S.mineDist += Math.sqrt(P.vx * P.vx + P.vz * P.vz) * dt;
    if (S.mineT <= 0 && S.mineDist >= MINES.spacing && placeMine(w, P.x, P.z)) {
      S.mineT = echo(w, s.cd * P.cdMul);
      S.mineDist = 0;
    }
  }
}

/** Pose une mine du niveau courant en (x, z) si le plafond de mines n'est pas atteint. Retourne true si posée. */
export function placeMine(w: World, x: number, z: number): boolean {
  const lv = w.weapons.mines ?? 0;
  if (lv <= 0) return false;
  const s = weaponStats(w, 'mines');
  let count = 0;
  for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind === ProjKind.Mine) count++;
  if (count >= s.n) return false;
  const p = w.allocProj();
  if (!p) return false;
  p.kind = ProjKind.Mine;
  p.x = p.px = x;
  p.z = p.pz = z;
  p.y = 0.2;
  p.vx = p.vz = 0;
  p.life = MINES.life;
  p.age = 0;
  p.dmg = s.dmg;
  p.pierce = s.chain; // 1 : explosion en chaîne (ligne « chaîne »)
  p.r = s.r;
  p.armed = false;
  p.hit0 = p.hit1 = p.hit2 = -1;
  return true;
}

/** Feu follet : une plaque de feu au sol (TRAIT.trainee) qui brûle par impulsions pendant `life` s. */
export function placeFire(w: World, x: number, z: number): void {
  const p = w.allocProj();
  if (!p) return;
  const T = TRAIT.trainee;
  p.kind = ProjKind.Fire;
  p.x = p.px = x;
  p.z = p.pz = z;
  p.y = 0.05;
  p.vx = p.vz = 0;
  p.life = T.life;
  p.age = 0;
  p.dmg = T.dps * T.period; // dégâts par impulsion
  p.pierce = 0;
  p.r = T.r;
  p.armed = false;
  p.hit0 = -1; // numéro de la dernière impulsion appliquée
  p.hit1 = p.hit2 = -1;
}

export function tickProjectiles(w: World, dt: number): void {
  const P = w.player;
  for (let i = w.projCount - 1; i >= 0; i--) {
    const p = w.projs[i];
    p.px = p.x;
    p.pz = p.z;
    p.life -= dt;
    p.age += dt;
    if (p.kind === ProjKind.Fire) {
      // brûle par impulsions (période TRAIT.trainee.period) : pas un coup par step
      const pulse = (p.age / TRAIT.trainee.period) | 0;
      if (pulse !== p.hit0) {
        p.hit0 = pulse;
        const n = w.grid.query(w.enemies, p.x, p.z, p.r, MAX_ENEMY_R, hits);
        for (let k = 0; k < n; k++) hitEnemy(w, hits[k], p.dmg, TRAIT.trainee.kb, p.x, p.z, HitSrc.Fire);
      }
      if (p.life <= 0) w.freeProj(i);
      continue;
    }
    if (p.kind === ProjKind.Mine) {
      if (p.armed) {
        // explosion : zone, recul, puis chaîne (les mines à 3 u s'amorcent)
        const n = w.grid.query(w.enemies, p.x, p.z, p.r, MAX_ENEMY_R, hits);
        for (let k = 0; k < n; k++) hitEnemy(w, hits[k], p.dmg, 4, p.x, p.z, HitSrc.Mines);
        w.emit(Ev.MineBlast, p.x, 0.2, p.z, p.r);
        if (p.pierce > 0)
          for (let j = 0; j < w.projCount; j++) {
            const o = w.projs[j];
            if (o !== p && o.kind === ProjKind.Mine && !o.armed) {
              const dx = o.x - p.x,
                dz = o.z - p.z;
              if (dx * dx + dz * dz < MINES.chainR * MINES.chainR) o.armed = true;
            }
          }
        w.freeProj(i);
        continue;
      }
      if (p.life <= 0) {
        w.freeProj(i);
        continue;
      }
      if (p.age > MINES.armDelay && w.grid.query(w.enemies, p.x, p.z, MINES.triggerR, MAX_ENEMY_R, hits) > 0)
        p.armed = true; // explose au prochain step
      continue;
    }
    if (p.kind === ProjKind.Boomerang) {
      if (!p.ret) {
        const dx = p.x - P.x,
          dz = p.z - P.z;
        if (dx * dx + dz * dz >= p.r * p.r) p.ret = true;
      } else {
        const dx = P.x - p.x,
          dz = P.z - p.z,
          d = Math.sqrt(dx * dx + dz * dz) || 1;
        const sp = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
        p.vx = (dx / d) * sp;
        p.vz = (dz / d) * sp;
        if (d < 0.9 || p.life <= 0) {
          if (d < 0.9 && w.trait === Trait.Rapporteur) {
            // Braconnier : attraper le boomerang rend une partie de la recharge
            if ((w.weapons.boomerang ?? 0) > 0) w.wstate.boomT -= weaponStats(w, 'boomerang').cd * P.cdMul * TRAIT.rapporteur.refund;
          }
          w.freeProj(i);
          continue;
        }
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const n = w.grid.query(w.enemies, p.x, p.z, 0.6 * P.sizeMul, MAX_ENEMY_R, hits);
      for (let k = 0; k < n; k++) {
        const e = w.enemies[hits[k]];
        if (w.t - e.lastBoom > BOOMERANG.rehit) {
          e.lastBoom = w.t;
          hitEnemy(w, hits[k], p.dmg, 3, p.x - p.vx, p.z - p.vz, HitSrc.Boomerang);
        }
      }
      continue;
    }
    if (p.kind === ProjKind.Lance) {
      // phase 28 : traverse tout ; chaque ennemi n'est touché qu'une fois par lance
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const n = w.grid.query(w.enemies, p.x, p.z, LANCE.hitR * P.sizeMul, MAX_ENEMY_R, hits);
      for (let k = 0; k < n; k++) {
        const e = w.enemies[hits[k]];
        // chaque lance d'une salve touche chaque ennemi une fois (un bit par lance)
        if (e.lastLance !== p.hit0) {
          e.lastLance = p.hit0;
          e.lanceBits = 0;
        }
        if (e.lanceBits & p.hit1) continue;
        e.lanceBits |= p.hit1;
        hitEnemy(w, hits[k], p.dmg, LANCE.kb, p.x - p.vx, p.z - p.vz, HitSrc.Lance);
      }
      if (p.life <= 0) w.freeProj(i);
      continue;
    }
    // orbe
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const n = w.grid.query(w.enemies, p.x, p.z, 0.3 * P.sizeMul, MAX_ENEMY_R, hits);
    for (let k = 0; k < n; k++) {
      const j = hits[k];
      const id = w.enemies[j].id;
      if (p.pierce <= 0 || p.hit0 === id || p.hit1 === id || p.hit2 === id) continue;
      if (p.hit0 < 0) p.hit0 = id;
      else if (p.hit1 < 0) p.hit1 = id;
      else p.hit2 = id;
      p.pierce--;
      // phase 19 : `armed` marque un orbe de la salve du Bond (le drapeau ne sert qu'aux mines)
      if (hitEnemy(w, j, p.dmg, 2.5, p.x - p.vx, p.z - p.vz, p.armed ? HitSrc.Spell : HitSrc.Orbe) && p.armed) w.sstate.kills++;
    }
    if (p.life <= 0 || p.pierce <= 0) w.freeProj(i);
  }
}
