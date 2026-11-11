import { BASTION, BLOOD, CHEST, CRIT, ELITE, ENDLESS, ENEMIES, FROST, GOLD, ITEM, It, POWER, TRAIT, XP } from './balance';
import { stageBossDown } from './stages';
import { WEAPON_KEYS } from './weapons/defs';
import { Ev, HitSrc, Mode, Pw, Trait } from './types';
import { powerOnKill } from './powers';
import type { Enemy } from './types';
import type { World } from './world';
import { itemHeal, lifesteal, talismanKill } from './items';

/**
 * Inflige des dégâts à l'ennemi i depuis la source (fx, fz). Retourne true s'il meurt.
 * L'événement Hit porte la source `src` (x2) et la direction du recul (y2, z2) pour le rendu.
 */
export function hitEnemy(w: World, i: number, dmg: number, kb: number, fx: number, fz: number, src: HitSrc = HitSrc.Orbe): boolean {
  const e = w.enemies[i];
  if (!e.alive) return false;
  const def = ENEMIES[e.type];
  const P = w.player;
  let dealt = dmg * P.dmgMul * (e.elite || def.boss ? P.eliteDmgMul : 1); // tome Dégâts : élites et boss
  // phase 31 : Gant du bourreau (ennemi affaibli), Couronne du berserker (selon les PV manquants du héros)
  if (w.items[It.Gant] && e.hp < e.max * ITEM.gant.below) dealt *= 1 + ITEM.gant.dmg * w.itemEff[It.Gant]; // phase 38 : × exemplaires
  if (w.items[It.Couronne]) dealt *= 1 + ITEM.couronne.dmg * w.itemEff[It.Couronne] * Math.max(0, 1 - P.hp / P.maxHp);
  if (w.powerT[Pw.Rage] > 0) dealt *= POWER.dmgMul; // phase 35 : bonus Rage
  // phase 47 : tomes Sang (PV bas), Givre (cible ralentie ou étourdie), Bastion (revanche après un coup reçu)
  if (P.lowDmg > 0 && P.hp < P.maxHp * BLOOD.below) dealt *= 1 + P.lowDmg;
  if (P.chillDmg > 0 && (e.slowT > 0 || e.stun > 0)) dealt *= 1 + P.chillDmg;
  if (P.revenge > 0 && w.t - w.hurtAt < BASTION.revengeT) dealt *= 1 + P.revenge;
  let crit = 0;
  if (src <= HitSrc.Meteores) {
    // phase 23 : coup critique (ligne de l'arme + tome Chance), ralentissement du Halo, étourdissement de la Foudre
    const s = w.wstats[WEAPON_KEYS[src]];
    const c = s.crit + P.crit;
    if (c > 0 && w.rng.next() < c) {
      dealt *= P.critMul;
      crit = 16;
    }
    if (src === HitSrc.Aura && s.slow > 0 && w.rng.next() < s.slow) e.slowT = Math.max(e.slowT, CRIT.slowT * P.slowMul);
    // phase 47 : tome Givre, tout coup d'arme peut ralentir (pas les boss : ils ont déjà le Sablier et les sorts)
    if (P.slowChance > 0 && !def.boss && w.rng.next() < P.slowChance) e.slowT = Math.max(e.slowT, FROST.slowT * P.slowMul);
    if (src === HitSrc.Foudre && s.stun > 0 && !def.boss && w.rng.next() < s.stun) e.stun = Math.max(e.stun, CRIT.stunT);
  }
  e.hp -= dealt;
  e.flash = 0.1;
  if (w.healBank > 0) lifesteal(w, Math.min(dealt, e.hp + dealt)); // phase 31 : réserve vide ou pas d'objet de soin : rien
  w.lastAction = w.t;
  const dx = e.x - fx,
    dz = e.z - fz,
    d2 = dx * dx + dz * dz;
  const d = d2 > 1e-8 ? Math.sqrt(d2) : 1;
  const ux = d2 > 1e-8 ? dx / d : 0,
    uz = d2 > 1e-8 ? dz / d : 1;
  if (kb > 0 && def.kbMul > 0) {
    const k = kb * def.kbMul * w.player.kbMul;
    e.kx += ux * k;
    e.kz += uz * k;
  }
  w.emit(Ev.Hit, e.x, e.y, e.z, dealt, src + crit, ux, uz); // x2 : source, +16 si critique (phase 23)
  if (e.hp <= 0) {
    w.srcKills[src]++; // phase 41 : défis par personnage
    killEnemy(w, i);
    return true;
  }
  return false;
}

export function killEnemy(w: World, i: number): void {
  const e = w.enemies[i];
  const def = ENEMIES[e.type];
  w.kills++;
  if (!w.player.onGround) w.airKills++; // phase 41
  if (def.boss) w.bossKills++;
  else if (e.elite) w.eliteKills++;
  if (w.player.killHeal > 0) w.player.hp = Math.min(w.player.maxHp, w.player.hp + w.player.killHeal); // phase 23 : tome Vitalité
  if (w.items[It.Calice]) itemHeal(w, ITEM.calice.perKill * w.itemEff[It.Calice]); // phase 31 : Calice sanglant
  if (w.items[It.Collier]) {
    // phase 22 : Collier d'os, le kill rend de la recharge (réserve plafonnée, rechargée dans step) ; un boss beaucoup
    const P = w.player;
    const C = ITEM.collier;
    const give = def.boss ? C.perBoss : Math.min(P.spellRefund, C.perKill * w.itemEff[It.Collier]); // phase 38 : × exemplaires
    if (!def.boss) P.spellRefund -= give;
    P.spellCd = Math.max(0, P.spellCd - give);
  }
  const goldMul = def.boss ? GOLD.bossMul : e.elite ? GOLD.eliteMul : 1;
  w.gold +=
    (GOLD.perKill * goldMul * (e.elite ? w.player.eliteLoot : 1) + (e.elite ? w.player.eliteGold : 0)) *
    w.player.goldMul *
    (w.powerT[Pw.Or] > 0 ? POWER.goldMul : 1); // phase 35 : Pluie d'or
  // Revenante : les ennemis tués pendant un saut valent ×2 XP
  const air = w.trait === Trait.DejaMorte && !w.player.onGround ? TRAIT.dejamorte.airXpMul : 1;
  dropGem(w, e.x, e.z, def.xp * (e.elite ? ELITE.xpMul * w.player.eliteLoot : 1) * air); // phase 47 : tome Défi
  if (def.boss) {
    // phase 42 : un boss de survie ne soigne pas et ne laisse qu'un coffre d'élite (mesuré : avec la récompense d'un
    // vrai boss, il rendait la partie plus facile, profil maxé 41 → 53 % de victoires)
    const survival = !w.endless && e.id !== w.totemBossId;
    if (!survival) {
      // phase 43 : en monde infini, un boss tué ne rend plus tous les PV (ENDLESS.healFrac)
      const P = w.player;
      P.hp = w.endless ? Math.min(P.maxHp, P.hp + P.maxHp * ENDLESS.healFrac) : P.maxHp;
      for (let g = 0; g < w.gemCount; g++) w.gems[g].mag = true;
    }
    if (w.endless) {
      w.endlessAlive = Math.max(0, w.endlessAlive - 1); // phase 39 : la barre passe au boss suivant
      // phase 43 : un seul coffre par vague, laissé par le dernier boss en vie (ENDLESS.chestPicks objet)
      if (w.endlessAlive === 0) dropChest(w, e.x, e.z, true, ENDLESS.chestPicks);
    } else dropChest(w, e.x, e.z, !survival);
    w.emit(Ev.BossKill, e.x, e.y, e.z, e.type);
    if (w.endless) {
      // compte des boss en vie déjà mis à jour ci-dessus
    } else if (e.id === w.totemBossId) {
      w.totemBossId = -1;
      stageBossDown(w, e.x, e.z); // phase 37 : boss du totem → portail, ou victoire au monde 3
    } else w.survivalAlive = Math.max(0, w.survivalAlive - 1); // phase 42 : boss de survie (n'ouvre rien)
  } else {
    if (e.elite) dropChest(w, e.x, e.z, false);
    w.emit(Ev.Kill, e.x, e.y, e.z, e.type, e.elite ? 1 : 0);
  }
  if (w.mode === Mode.Play) powerOnKill(w, e.x, e.z, e.elite, def.boss); // phase 35 : bonus au sol
  // marque mort ; le retrait du pool se fait en fin de step (indices stables pendant le step)
  e.alive = false;
  talismanKill(w); // phase 17 : Talisman orageux
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

/** Coffre au sol (élite : 1/3/5 cartes, boss : 3–5). Pool plein : le plus ancien est remplacé. */
export function dropChest(w: World, x: number, z: number, boss: boolean, picks = boss ? CHEST.bossPicks : 0): void {
  let c = w.allocChest();
  if (!c) {
    let oldest = 0;
    for (let i = 1; i < w.chestCount; i++) if (w.chests[i].age > w.chests[oldest].age) oldest = i;
    c = w.chests[oldest];
  }
  c.x = x;
  c.z = z;
  c.age = 0;
  c.boss = boss;
  c.picks = picks;
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
  return e.y;
}
