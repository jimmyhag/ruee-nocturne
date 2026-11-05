// Sorts de classe (phase 19, PLAN §3.5) : un par personnage, sur le bouton de l'ancien dash.
// castSpell est appelé par stepPlayer (déplacements : Bond, Comète, Clignement, Pétard, Voile) ; les coups sont portés par
// tickSpells, après la reconstruction de la grille (ses indices d'ennemis ne sont valides qu'entre build et compactage).
// Zéro allocation : tampons de module, état dans w.sstate et dans le joueur.
import { CAPS, ENEMIES, ITEM, It, PLAYER, PLAY_LIMIT, SPELL } from './balance';
import { hitEnemy } from './combat';
import { Ev, HitSrc, Spell } from './types';
import type { Player } from './types';
import { fireAngle } from './weapons/tick';
import type { World } from './world';

const MAX_ENEMY_R = SPELL.maxEnemyR;
const TAU = Math.PI * 2;
const hits = new Int32Array(CAPS.enemies); // une zone peut couvrir toute la foule (Éclat dans 400 ennemis)
const bolts = new Int32Array(16);

/** Recharge de base par sort, dans l'ordre de l'énumération Spell. */
const CD = [
  SPELL.bond.cd,
  SPELL.tourbillon.cd,
  SPELL.clignement.cd,
  SPELL.eclat.cd,
  SPELL.collet.cd,
  SPELL.petard.cd,
  SPELL.comete.cd,
  SPELL.voile.cd,
  SPELL.bourse.cd,
];

/** Recharge effective du sort du personnage (tome Mouvement, Cape). */
export function spellCooldown(w: World): number {
  return CD[w.spell] * w.player.spellCdMul;
}
/** Rayons et durées : une part du bonus de puissance (tome Mouvement). Exporté pour le rendu (filet, Tourbillon). */
export function spellSize(P: Player): number {
  return 1 + (P.spellPow - 1) * SPELL.sizeShare;
}
/** Coup de sort : compté pour la CLI (part des kills faits par le sort). */
function zap(w: World, i: number, dmg: number, kb: number, fx: number, fz: number): void {
  if (hitEnemy(w, i, dmg, kb, fx, fz, HitSrc.Spell)) w.sstate.kills++;
}
function clampLimit(v: number): number {
  return v < -PLAY_LIMIT ? -PLAY_LIMIT : v > PLAY_LIMIT ? PLAY_LIMIT : v;
}

/** Lance le sort dans la direction (dirX, dirZ) (unitaire). Ne touche aucun ennemi : les coups partent de tickSpells. */
export function castSpell(w: World, dirX: number, dirZ: number): void {
  const P = w.player,
    S = w.sstate;
  P.spellCd = spellCooldown(w);
  S.casts++;
  S.pending = true;
  S.tick = 0;
  S.x = P.x;
  S.z = P.z;
  if (w.items[It.Cape]) P.invul = Math.max(P.invul, ITEM.cape.invul); // phase 19 : Cape, invulnérable après chaque sort
  const k = spellSize(P);
  switch (w.spell) {
    case Spell.Bond:
      P.dashT = P.dashTime;
      P.invul = Math.max(P.invul, PLAYER.dashInvul);
      S.bondPending = true;
      break;
    case Spell.Comete:
      P.dashT = P.dashTime;
      P.invul = Math.max(P.invul, PLAYER.dashInvul);
      break;
    case Spell.Tourbillon:
      P.spellT = SPELL.tourbillon.dur * k;
      P.dmgTaken = SPELL.tourbillon.dmgTaken;
      break;
    case Spell.Clignement: {
      // pas de 0,5 u jusqu'au premier obstacle : on s'arrête au dernier point libre (jamais dans un muret ni un arbre)
      const C = SPELL.clignement;
      let x = P.x,
        z = P.z;
      const steps = Math.ceil((C.dist * k) / SPELL.blinkStep);
      for (let s = 1; s <= steps; s++) {
        const nx = clampLimit(P.x + dirX * SPELL.blinkStep * s),
          nz = clampLimit(P.z + dirZ * SPELL.blinkStep * s);
        if (w.blocksShot(nx, nz, PLAYER.radius)) break;
        x = nx;
        z = nz;
      }
      P.x = P.px = x;
      P.z = P.pz = z;
      P.invul = Math.max(P.invul, C.invul);
      break;
    }
    case Spell.Collet:
      S.x = clampLimit(P.x + dirX * SPELL.collet.range);
      S.z = clampLimit(P.z + dirZ * SPELL.collet.range);
      P.spellT = SPELL.collet.dur * k;
      break;
    case Spell.Petard:
      P.vy = PLAYER.jumpVel * P.jumpMul * SPELL.petard.jumpMul;
      P.onGround = false;
      break;
    case Spell.Voile:
      P.spellT = SPELL.voile.dur * k;
      P.invul = Math.max(P.invul, P.spellT);
      break;
    case Spell.Bourse:
      S.x = clampLimit(P.x + dirX * SPELL.bourse.range);
      S.z = clampLimit(P.z + dirZ * SPELL.bourse.range);
      break;
  }
  // lancement : (x, z) = point de départ, (x2, z2) = point visé (Collet, Bourse) ou d'arrivée (Clignement), y2 = 0
  const ox = w.spell === Spell.Clignement ? S.x : P.x,
    oz = w.spell === Spell.Clignement ? S.z : P.z;
  const tx = w.spell === Spell.Collet || w.spell === Spell.Bourse ? S.x : P.x + (w.spell === Spell.Clignement ? 0 : dirX),
    tz = w.spell === Spell.Collet || w.spell === Spell.Bourse ? S.z : P.z + (w.spell === Spell.Clignement ? 0 : dirZ);
  w.emit(Ev.Spell, ox, P.y, oz, w.spell, tx, 0, tz);
}

/** Impact d'un sort de zone : (x, z) = centre, x2 = rayon, y2 = 1. */
function impact(w: World, x: number, z: number, r: number): void {
  w.emit(Ev.Spell, x, 0, z, w.spell, r, 1, 0);
}

/** Coups des sorts, effets qui durent, salve du Bond. Après tickWeapons (grille à jour). */
export function tickSpells(w: World, dt: number): void {
  const P = w.player,
    S = w.sstate;
  const k = spellSize(P),
    pow = P.spellPow;
  if (S.pending) {
    S.pending = false;
    switch (w.spell) {
      case Spell.Clignement: {
        // éclairs en chaîne depuis le point de départ : les plus proches d'abord
        const C = SPELL.clignement;
        const n = w.grid.query(w.enemies, S.x, S.z, C.chainR * k, MAX_ENEMY_R, hits);
        const m = Math.min(C.targets, n, bolts.length);
        for (let t = 0; t < m; t++) {
          let best = -1,
            bd = 1e18;
          for (let q = 0; q < n; q++) {
            const i = hits[q];
            if (i < 0) continue;
            const e = w.enemies[i];
            const d = (e.x - S.x) * (e.x - S.x) + (e.z - S.z) * (e.z - S.z);
            if (d < bd) {
              bd = d;
              best = q;
            }
          }
          if (best < 0) break;
          bolts[t] = hits[best];
          hits[best] = -1;
        }
        for (let t = 0; t < m; t++) {
          const e = w.enemies[bolts[t]];
          w.emit(Ev.Bolt, S.x, 1.2, S.z, 0, e.x, e.y + 0.8, e.z);
          zap(w, bolts[t], C.dmg * pow, SPELL.kbBlink, S.x, S.z);
        }
        impact(w, S.x, S.z, 1.2);
        break;
      }
      case Spell.Eclat: {
        const E = SPELL.eclat,
          r = E.r * k;
        const n = w.grid.query(w.enemies, P.x, P.z, r, MAX_ENEMY_R, hits);
        for (let q = 0; q < n; q++) {
          const e = w.enemies[hits[q]];
          if (ENEMIES[e.type].boss) e.slowT = Math.max(e.slowT, E.bossSlow * k);
          else e.stun = Math.max(e.stun, E.stun * k);
          zap(w, hits[q], E.dmg * pow, E.kb, P.x, P.z);
        }
        impact(w, P.x, P.z, r);
        break;
      }
      case Spell.Petard: {
        const D = SPELL.petard,
          r = D.r * k;
        const n = w.grid.query(w.enemies, S.x, S.z, r, MAX_ENEMY_R, hits);
        for (let q = 0; q < n; q++) zap(w, hits[q], D.dmg * pow, D.kb, S.x, S.z);
        impact(w, S.x, S.z, r);
        break;
      }
      case Spell.Bourse: {
        const B = SPELL.bourse,
          r = B.r * k;
        const dmg = (B.dmg + Math.min(B.maxBonus, w.gold * B.perGold)) * pow;
        const n = w.grid.query(w.enemies, S.x, S.z, r, MAX_ENEMY_R, hits);
        for (let q = 0; q < n; q++) zap(w, hits[q], dmg, SPELL.kbBourse, S.x, S.z);
        impact(w, S.x, S.z, r);
        break;
      }
      case Spell.Collet:
        impact(w, S.x, S.z, SPELL.collet.r * k);
        break;
    }
  }
  // Bond : la salve part à l'arrivée du dash
  if (S.bondPending && P.dashT <= 0) {
    S.bondPending = false;
    const B = SPELL.bond;
    for (let o = 0; o < B.orbs; o++) {
      const p = fireAngle(w, (o / B.orbs) * TAU, B.dmg * pow, B.pierce, B.speed * P.projSpeedMul);
      if (p) p.armed = true; // orbe de sort : HitSrc.Spell (tickProjectiles)
    }
    impact(w, P.x, P.z, 1);
  }
  if (P.spellT <= 0) return;
  P.spellT -= dt;
  S.tick -= dt;
  switch (w.spell) {
    case Spell.Tourbillon:
      if (S.tick <= 0) {
        const T = SPELL.tourbillon;
        S.tick = T.period;
        const n = w.grid.query(w.enemies, P.x, P.z, T.r * k, MAX_ENEMY_R, hits);
        for (let q = 0; q < n; q++) zap(w, hits[q], T.dmg * pow, T.kb, P.x, P.z);
      }
      break;
    case Spell.Collet:
      if (S.tick <= 0) {
        const C = SPELL.collet;
        S.tick = C.period;
        const n = w.grid.query(w.enemies, S.x, S.z, C.r * k, MAX_ENEMY_R, hits);
        for (let q = 0; q < n; q++) {
          const e = w.enemies[hits[q]];
          if (ENEMIES[e.type].boss) e.slowT = Math.max(e.slowT, C.period + SPELL.holdPad);
          else e.stun = Math.max(e.stun, C.period + SPELL.holdPad);
          zap(w, hits[q], C.dps * C.period * pow, 0, S.x, S.z);
        }
      }
      break;
    case Spell.Voile: {
      const n = w.grid.query(w.enemies, P.x, P.z, SPELL.voile.r * k, MAX_ENEMY_R, hits);
      for (let q = 0; q < n; q++) {
        const e = w.enemies[hits[q]];
        e.slowT = Math.max(e.slowT, SPELL.voile.slow);
      }
      break;
    }
  }
  if (P.spellT <= 0) {
    P.spellT = 0;
    P.dmgTaken = 1;
  }
}
