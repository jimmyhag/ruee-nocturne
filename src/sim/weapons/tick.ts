import { ENEMIES } from '../balance';
import { hitEnemy } from '../combat';
import { Ev, HitSrc } from '../types';
import type { World } from '../world';
import { WEAPONS } from './defs';

const MAX_ENEMY_R = 2.0; // Gardien
// tampons réutilisés (zéro allocation)
const near = new Int32Array(8);
const nearD = new Float64Array(8);
const seen = new Int32Array(16);
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

function fire(w: World, targetIdx: number, dmg: number, pierce: number, speed: number, spread: number): void {
  const e = w.enemies[targetIdx];
  const p = w.allocProj();
  if (!p) return;
  const a = Math.atan2(e.x - w.player.x, e.z - w.player.z) + spread;
  p.x = p.px = w.player.x;
  p.z = p.pz = w.player.z;
  p.y = w.player.y + 1;
  p.vx = Math.sin(a) * speed;
  p.vz = Math.cos(a) * speed;
  p.life = 1.3;
  p.age = 0;
  p.dmg = dmg;
  p.pierce = pierce;
  p.hit0 = p.hit1 = p.hit2 = -1;
}

export function tickWeapons(w: World, dt: number): void {
  const P = w.player,
    S = w.wstate;

  // ---- Orbe filante ----
  const lvO = w.weapons.orbe ?? 0;
  if (lvO > 0) {
    const s = WEAPONS.orbe.stats(lvO);
    S.orbeT -= dt;
    if (S.orbeT <= 0) {
      const found = nearest(w, s.n, 15);
      if (found > 0) {
        S.orbeT = s.cd * P.cdMul;
        for (let i = 0; i < s.n; i++) {
          const spread = i >= found ? (i - found + 1) * 0.35 : 0;
          fire(w, near[i % found], s.dmg, s.pierce, s.speed, spread);
        }
        const t = w.enemies[near[0]];
        const a = Math.atan2(t.x - P.x, t.z - P.z);
        P.recoil = 0.14;
        w.emit(Ev.Shoot, P.x + Math.sin(a) * 0.6, P.y + 1, P.z + Math.cos(a) * 0.6);
      } else S.orbeT = 0.15;
    }
  }

  // ---- Halo brûlant ----
  const lvA = w.weapons.aura ?? 0;
  if (lvA > 0) {
    const s = WEAPONS.aura.stats(lvA);
    S.auraT -= dt;
    S.auraPulse = Math.max(0, S.auraPulse - dt * 3);
    if (S.auraT <= 0) {
      S.auraT = s.period * P.cdMul;
      S.auraPulse = 1;
      const n = w.grid.query(w.enemies, P.x, P.z, s.r, MAX_ENEMY_R, hits);
      for (let k = 0; k < n; k++) hitEnemy(w, hits[k], s.dmg, 1.5, P.x, P.z, HitSrc.Aura);
      w.emit(Ev.AuraPulse, P.x, 0, P.z, s.r);
    }
  }

  // ---- Lames orbitales ----
  const lvL = w.weapons.lames ?? 0;
  if (lvL > 0) {
    const s = WEAPONS.lames.stats(lvL);
    S.bladeA += s.spd * dt;
    const TAU = Math.PI * 2;
    for (let i = 0; i < s.n; i++) {
      const a = S.bladeA + (i * TAU) / s.n;
      const bx = P.x + Math.sin(a) * s.r,
        bz = P.z + Math.cos(a) * s.r;
      const n = w.grid.query(w.enemies, bx, bz, 0.55, MAX_ENEMY_R, hits);
      for (let k = 0; k < n; k++) {
        const e = w.enemies[hits[k]];
        if (w.t - e.lastBlade > 0.4) {
          e.lastBlade = w.t;
          hitEnemy(w, hits[k], s.dmg, 5, P.x, P.z, HitSrc.Lames);
        }
      }
    }
  }

  // ---- Foudre en chaîne ----
  const lvF = w.weapons.foudre ?? 0;
  if (lvF > 0) {
    const s = WEAPONS.foudre.stats(lvF);
    S.foudreT -= dt;
    if (S.foudreT <= 0) {
      // cible initiale : un ennemi aléatoire à < 13 u (tirage par rejet borné, déterministe)
      let cur = -1;
      for (let tries = 0; tries < 12 && w.enemyCount > 0; tries++) {
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
        S.foudreT = s.cd * P.cdMul;
        let seenN = 0;
        let px = w.enemies[cur].x,
          py = 10,
          pz = w.enemies[cur].z;
        for (let c = 0; c <= s.chain && cur >= 0; c++) {
          seen[seenN++] = cur;
          const e = w.enemies[cur];
          const cy = ENEMIES[e.type].y;
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
}

export function tickProjectiles(w: World, dt: number): void {
  for (let i = w.projCount - 1; i >= 0; i--) {
    const p = w.projs[i];
    p.px = p.x;
    p.pz = p.z;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.life -= dt;
    p.age += dt;
    const n = w.grid.query(w.enemies, p.x, p.z, 0.3, MAX_ENEMY_R, hits);
    for (let k = 0; k < n; k++) {
      const j = hits[k];
      const id = w.enemies[j].id;
      if (p.pierce <= 0 || p.hit0 === id || p.hit1 === id || p.hit2 === id) continue;
      if (p.hit0 < 0) p.hit0 = id;
      else if (p.hit1 < 0) p.hit1 = id;
      else p.hit2 = id;
      p.pierce--;
      hitEnemy(w, j, p.dmg, 2.5, p.x - p.vx, p.z - p.vz, HitSrc.Orbe);
    }
    if (p.life <= 0 || p.pierce <= 0) w.freeProj(i);
  }
}
