import { BOSS_TYPE, ENEMIES, XP } from './balance';
import { Ev, HitSrc } from './types';
import type { Enemy } from './types';
import type { World } from './world';

/**
 * Inflige des dégâts à l'ennemi i depuis la source (fx, fz). Retourne true s'il meurt.
 * L'événement Hit porte la source `src` (x2) et la direction du recul (y2, z2) pour le rendu.
 */
export function hitEnemy(w: World, i: number, dmg: number, kb: number, fx: number, fz: number, src: HitSrc = HitSrc.Orbe): boolean {
  const e = w.enemies[i];
  if (!e.alive) return false;
  const def = ENEMIES[e.type];
  const dealt = dmg * w.player.dmgMul;
  e.hp -= dealt;
  e.flash = 0.1;
  w.lastAction = w.t;
  const dx = e.x - fx,
    dz = e.z - fz,
    d2 = dx * dx + dz * dz;
  const d = d2 > 1e-8 ? Math.sqrt(d2) : 1;
  const ux = d2 > 1e-8 ? dx / d : 0,
    uz = d2 > 1e-8 ? dz / d : 1;
  if (kb > 0 && def.kbMul > 0) {
    const k = kb * def.kbMul;
    e.kx += ux * k;
    e.kz += uz * k;
  }
  w.emit(Ev.Hit, e.x, def.y, e.z, dealt, src, ux, uz);
  if (e.hp <= 0) {
    killEnemy(w, i);
    return true;
  }
  return false;
}

export function killEnemy(w: World, i: number): void {
  const e = w.enemies[i];
  const def = ENEMIES[e.type];
  w.kills++;
  dropGem(w, e.x, e.z, def.xp);
  if (e.type === BOSS_TYPE) {
    w.player.hp = w.player.maxHp;
    for (let g = 0; g < w.gemCount; g++) w.gems[g].mag = true;
    w.emit(Ev.BossKill, e.x, def.y, e.z, e.type);
  } else {
    w.emit(Ev.Kill, e.x, def.y, e.z, e.type);
  }
  // marque mort ; le retrait du pool se fait en fin de step (indices stables pendant le step)
  e.alive = false;
}

export function dropGem(w: World, x: number, z: number, v: number): void {
  if (w.gemCount >= XP.gemMergeAbove) {
    // fusionne avec une gemme existante choisie par le rng (déterministe)
    const g = w.gems[w.rng.int(w.gemCount)];
    g.v += v;
    return;
  }
  const g = w.allocGem();
  if (!g) return;
  g.x = x;
  g.z = z;
  g.v = v;
  g.mag = false;
  g.s = 0;
  g.age = 0;
}

/** Retire du pool tous les ennemis marqués morts (swap-remove, ordre non préservé). */
export function compactEnemies(w: World): void {
  for (let i = w.enemyCount - 1; i >= 0; i--) {
    if (!w.enemies[i].alive) {
      w.enemies[i].alive = true; // freeEnemy remet à false ; évite un double état
      w.freeEnemy(i);
    }
  }
}

export function enemyY(e: Enemy): number {
  return ENEMIES[e.type].y;
}
