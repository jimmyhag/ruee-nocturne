import { BOOMERANG, FAUX, ITEM, It, LAMES, LANCE, METEOR, MINES, SYN, Syn, TRAIT } from '../balance';
import { hitEnemy } from '../combat';
import { Ev, HitSrc, ProjKind, Trait } from '../types';
import type { Projectile } from '../types';
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
const near = new Int32Array(9); // Orbe : 1 + 5 lignes + 3 (tome Projectiles) tirs au plus
const nearD = new Float64Array(9);
const seen = new Int32Array(16);
const seenX = new Float64Array(9); // phase 32 : positions des cibles des Lames (taille de `near`)
const seenZ = new Float64Array(9);
const hits = new Int32Array(256);

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

function fire(w: World, targetIdx: number, dmg: number, pierce: number, speed: number, spread: number): void {
  const e = w.enemies[targetIdx];
  fireAngle(w, Math.atan2(e.x - w.player.x, e.z - w.player.z) + spread, dmg, pierce, speed);
}

export function tickWeapons(w: World, dt: number): void {
  const P = w.player,
    S = w.wstate;

  // ---- Orbe filante / Nova ----
  const lvO = w.weapons.orbe ?? 0;
  if (lvO > 0) {
    const s = weaponStats(w, 'orbe');
    S.orbeT -= dt;
    if (S.orbeT <= 0) {
      const nShots = Math.min(s.n, near.length);
      const found = nearest(w, nShots, 15);
      if (found > 0) {
        S.orbeT = echo(w, s.cd * P.cdMul);
        for (let i = 0; i < nShots; i++) {
          const spread = i >= found ? (i - found + 1) * 0.35 : 0;
          fire(w, near[i % found], s.dmg, s.pierce, s.speed, spread);
        }
        const t = w.enemies[near[0]];
        const a = Math.atan2(t.x - P.x, t.z - P.z);
        P.recoil = 0.14;
        w.emit(Ev.Shoot, P.x + Math.sin(a) * 0.6, P.y + 1, P.z + Math.cos(a) * 0.6, nShots);
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
          w.emit(Ev.Bolt, px, py, pz, 0, e.x, cy, e.z);
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

  // ---- Boomerang : part dans la direction du regard, revient, traverse ----
  const lvB = w.weapons.boomerang ?? 0;
  if (lvB > 0) {
    const s = weaponStats(w, 'boomerang');
    S.boomT -= dt;
    if (S.boomT <= 0 && w.enemyCount > 0) {
      S.boomT = echo(w, s.cd * P.cdMul);
      const base = Math.atan2(P.dirX, P.dirZ);
      for (let i = 0; i < s.n; i++) {
        // le 2e part dans le dos, les suivants sur les côtés
        const p = fireAngle(w, base + (i === 0 ? 0 : i === 1 ? Math.PI : i === 2 ? Math.PI / 2 : -Math.PI / 2), s.dmg, 999, s.speed);
        if (!p) break;
        p.kind = ProjKind.Boomerang;
        p.r = s.range;
        p.life = BOOMERANG.safetyLife;
        p.y = P.y + 0.9;
      }
      w.emit(Ev.Throw, P.x, P.y + 0.9, P.z, s.n);
    }
  }

  // ---- Faux (phase 28) : arc devant le joueur, fauche et repousse ----
  const lvX = w.weapons.faux ?? 0;
  if (lvX > 0) {
    const s = weaponStats(w, 'faux');
    S.fauxT -= dt;
    if (S.fauxT <= 0) {
      const r = s.r,
        cosHalf = Math.cos(Math.min(Math.PI, (s.arc * Math.PI) / 360)), // arc en degrés
        dx0 = P.dirX,
        dz0 = P.dirZ;
      const n = w.grid.query(w.enemies, P.x, P.z, r, MAX_ENEMY_R, hits);
      let fauched = 0;
      for (let k = 0; k < n; k++) {
        const e = w.enemies[hits[k]];
        const dx = e.x - P.x,
          dz = e.z - P.z,
          d = Math.sqrt(dx * dx + dz * dz);
        if (d > 1e-6 && (dx * dx0 + dz * dz0) / d < cosHalf && d > e.r) continue; // hors de l'arc (sauf collé au joueur)
        if (hitEnemy(w, hits[k], s.dmg, FAUX.kb, P.x, P.z, HitSrc.Faux)) fauched++;
      }
      if (n > 0) {
        S.fauxT = echo(w, s.cd * P.cdMul);
        if (w.syn[Syn.Moissonneuse] && fauched > 0) P.hp = Math.min(P.maxHp, P.hp + SYN.moissonneuse.heal * Math.min(fauched, SYN.moissonneuse.max));
        w.emit(Ev.Scythe, P.x, P.y + 0.9, P.z, r, dx0, s.arc, dz0);
      } else S.fauxT = FAUX.wait;
    }
  }

  // ---- Lance (phase 28) : vers l'ennemi le plus loin à portée, perce tout ----
  const lvN = w.weapons.lance ?? 0;
  if (lvN > 0) {
    const s = weaponStats(w, 'lance');
    S.lanceT -= dt;
    if (S.lanceT <= 0) {
      let best = -1,
        bd = 0;
      const R2 = LANCE.range * LANCE.range;
      for (let i = 0; i < w.enemyCount; i++) {
        const e = w.enemies[i];
        if (!e.alive) continue;
        const dx = e.x - P.x,
          dz = e.z - P.z,
          d = dx * dx + dz * dz;
        if (d < R2 && d > bd) {
          bd = d;
          best = i;
        }
      }
      if (best >= 0) {
        S.lanceT = echo(w, s.cd * P.cdMul);
        const t = w.enemies[best];
        const a0 = Math.atan2(t.x - P.x, t.z - P.z);
        const salvo = ++S.lanceSalvo;
        const nL = Math.min(s.n, LANCE.maxPerSalvo);
        for (let i = 0; i < nL; i++) {
          const a = a0 + (i === 0 ? 0 : (((i + 1) >> 1) * (i % 2 === 1 ? 1 : -1)) * LANCE.spread);
          const p = fireAngle(w, a, s.dmg, 999, s.speed);
          if (!p) break;
          p.kind = ProjKind.Lance;
          p.life = (LANCE.range / s.speed) * LANCE.lifeMargin * P.projLifeMul;
          p.hit0 = salvo; // une lance n'a pas de liste d'ennemis touchés : hit0 = salve, hit1 = bit de la lance
          p.hit1 = 1 << i;
        }
        w.emit(Ev.Shoot, P.x + Math.sin(a0) * 0.6, P.y + 1, P.z + Math.cos(a0) * 0.6, s.n, 1); // x2 = 1 : Lance (son)
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
