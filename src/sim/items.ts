// Objets passifs (phase 17, PLAN §3.6) : obtenus dans les coffres et chez le marchand. Chaque objet est une règle :
// soit un effet appliqué une fois au joueur à l'obtention, soit un drapeau (w.items[It.X]) lu par la boucle de jeu.
import { ENEMIES, ITEM, ITEM_KEYS, ITEM_RARITY, It, MERCHANT, SPELL, TOME_CAPS, TRAIT } from './balance';
import { hitEnemy } from './combat';
import { Ev, HitSrc, Trait } from './types';
import type { Card, ItemKey } from './types';
import type { World } from './world';

/** Nombre d'objets possédés. */
export function itemCount(w: World): number {
  let n = 0;
  for (let i = 0; i < w.items.length; i++) n += w.items[i];
  return n;
}

/** Peut-on encore obtenir un objet ? (place libre et au moins un objet non possédé) */
export function canGainItem(w: World): boolean {
  const n = itemCount(w);
  if (n >= ITEM.max) return false;
  for (let i = 0; i < ITEM_KEYS.length; i++) if (!w.items[i] && !w.itemBan[i]) return true;
  return false;
}

/** Obtient l'objet d'index `i` (ITEM_KEYS) : effets immédiats, drapeau, événement. `bought` : acheté au marchand. */
export function gainItem(w: World, i: number, bought = false): void {
  if (w.items[i]) return;
  w.items[i] = 1;
  w.itemOrder.push(i);
  const P = w.player;
  switch (i as It) {
    case It.Phenix:
      P.revives += 1;
      break;
    case It.Cape:
      P.spellCdMul = Math.max(TOME_CAPS.spellCdMin, P.spellCdMul * ITEM.cape.cdMul); // phase 19 : l'invulnérabilité est dans castSpell
      break;
    case It.Rune:
      P.spellCdMul = Math.max(TOME_CAPS.spellCdMin, P.spellCdMul * ITEM.rune.cdMul); // phase 22
      break;
    case It.Lanterne:
      P.magnet *= ITEM.lanterne.magnetMul;
      break;
    case It.Coeur:
      P.maxHp += ITEM.coeur.hp;
      P.hp += ITEM.coeur.hp;
      P.speed *= ITEM.coeur.speedMul;
      break;
    case It.Bottes:
      P.jumpMul *= ITEM.bottes.jumpMul;
      break;
    case It.Oeil:
      P.eliteDmgMul += ITEM.oeil.eliteDmg;
      break;
    case It.Fer:
      P.luck += ITEM.fer.luck;
      break;
    case It.Bourse:
      P.goldMul += ITEM.bourse.goldMul;
      break;
    // phase 31 : pourcentages simples (les soins et la Couronne sont lus dans la boucle)
    case It.Pierre:
      P.dmgMul += ITEM.pierre.dmg;
      break;
    case It.De:
      P.crit += ITEM.de.crit;
      break;
    case It.Brume:
      P.dmgTaken *= ITEM.brume.dmgTaken;
      break;
    case It.Sandales:
      P.speed *= ITEM.sandales.speedMul;
      break;
    case It.Amulette:
      P.xpMul += ITEM.amulette.xp;
      break;
    case It.Ecorce:
      P.armor = Math.min(TOME_CAPS.armorMax, P.armor + ITEM.ecorce.armor);
      break;
    default:
      break; // Talisman, Sablier, Épines, Aimant : drapeaux lus par la boucle
  }
  w.emit(Ev.Item, P.x, P.y + 1, P.z, i, bought ? 1 : 0);
}

/**
 * Tire `count` objets non possédés, pondérés par rareté (ITEM.weight, décalés par la Chance), dans `out` (kind 'i') :
 * w.cards pour un coffre, w.offers pour le marchand.
 * `priced` : prix du marchand (rareté × hausse par visite, rabais de la Bourse). Allocation de cartes : hors boucle chaude
 * (un coffre ou une visite, quelques fois par run).
 */
export function rollItemChoices(w: World, count: number, priced: boolean, out: Card[]): void {
  out.length = 0;
  const luck = w.player.luck;
  for (let k = 0; k < count; k++) {
    let total = 0;
    for (let i = 0; i < ITEM_KEYS.length; i++) {
      if (w.items[i] || w.itemBan[i] || taken(out, i)) continue;
      const r = ITEM_RARITY[i];
      total += ITEM.weight[r] + luck * ITEM.luckWeight[r];
    }
    if (total <= 0) break;
    let x = w.rng.next() * total;
    let pick = -1;
    for (let i = 0; i < ITEM_KEYS.length; i++) {
      if (w.items[i] || w.itemBan[i] || taken(out, i)) continue;
      const r = ITEM_RARITY[i];
      x -= ITEM.weight[r] + luck * ITEM.luckWeight[r];
      if (x <= 0) {
        pick = i;
        break;
      }
    }
    if (pick < 0) break;
    const r = ITEM_RARITY[pick];
    out.push({ kind: 'i', key: ITEM_KEYS[pick], lv: r, n: r + 1, s0: priced ? itemPrice(w, pick) : 0, s1: 0, s2: -1 });
  }
}
function taken(out: Card[], i: number): boolean {
  const key = ITEM_KEYS[i];
  for (let c = 0; c < out.length; c++) if (out[c].key === key) return true;
  return false;
}

/** Prix d'un objet chez le marchand à la visite courante. */
export function itemPrice(w: World, i: number): number {
  const base = MERCHANT.price[ITEM_RARITY[i]] * (1 + MERCHANT.growth * w.merchant.visit);
  return Math.round(base * (w.items[It.Bourse] ? 1 - ITEM.bourse.discount : 1) * w.player.shopMul); // phase 23 : tome Or
}

/** Nombre d'objets proposés par un coffre. */
export function chestOffers(w: World): number {
  return w.trait === Trait.Marchand ? TRAIT.marchand.offers : ITEM.offers;
}
/** Nombre d'objets proposés par le marchand (Fer à cheval : un de plus). */
export function merchantOffers(w: World): number {
  return ITEM.offers + (w.items[It.Fer] ? 1 : 0);
}

export const itemIndex = (key: ItemKey): number => ITEM_KEYS.indexOf(key);

let talismanBusy = false;
/** Talisman orageux : appelé à chaque kill ; tous les ITEM.talisman.every kills, la foudre frappe les plus proches. */
export function talismanKill(w: World): void {
  if (!w.items[It.Talisman] || talismanBusy) return;
  if (++w.talismanKills < ITEM.talisman.every) return;
  w.talismanKills = 0;
  const T = ITEM.talisman;
  const P = w.player;
  // les T.targets ennemis vivants les plus proches dans la portée (sélection par passes : T.targets × n, sans allocation)
  const marks = w.talismanMarks;
  marks.fill(-1);
  for (let k = 0; k < T.targets; k++) {
    let best = -1,
      bd = T.range * T.range;
    for (let i = 0; i < w.enemyCount; i++) {
      const e = w.enemies[i];
      if (!e.alive) continue;
      let used = false;
      for (let m = 0; m < k; m++) if (marks[m] === i) used = true;
      if (used) continue;
      const d2 = (e.x - P.x) ** 2 + (e.z - P.z) ** 2;
      if (d2 < bd) {
        bd = d2;
        best = i;
      }
    }
    if (best < 0) break;
    marks[k] = best;
  }
  talismanBusy = true; // une frappe qui tue rappelle talismanKill : pas de réécriture de talismanMarks en cours de lecture
  for (let k = 0; k < T.targets; k++) {
    const i = marks[k];
    if (i < 0) break;
    const e = w.enemies[i];
    const def = ENEMIES[e.type];
    w.emit(Ev.Bolt, P.x, P.y + 1.2, P.z, 0, e.x, e.y, e.z);
    // une part des PV max (les boss : beaucoup moins), sans le bonus de dégâts du joueur (c'est déjà une part)
    const dmg = (e.max * (def.boss ? T.bossFrac : T.frac)) / Math.max(0.01, P.dmgMul);
    hitEnemy(w, i, dmg, 0, P.x, P.z, HitSrc.Talisman);
  }
  talismanBusy = false;
}

// ---- phase 28 : objets de la glisse et de l'exploration ----
const rideHits = new Int32Array(64);

/** Patins de braise (glissade : les ennemis traversés brûlent) et Corne de guerre (onde périodique). Grille à jour. */
export function tickRideItems(w: World, dt: number): void {
  const P = w.player;
  if (w.items[It.Patins] && P.sliding) {
    const v = Math.sqrt(P.vx * P.vx + P.vz * P.vz);
    if (v > P.speed * ITEM.patins.minMul) {
      const n = w.grid.query(w.enemies, P.x, P.z, ITEM.patins.r, SPELL.maxEnemyR, rideHits);
      for (let k = 0; k < n; k++) {
        const e = w.enemies[rideHits[k]];
        if (w.t - e.lastPatins < ITEM.patins.rehit) continue;
        e.lastPatins = w.t;
        hitEnemy(w, rideHits[k], ITEM.patins.perSpeed * v, ITEM.patins.kb, P.x, P.z, HitSrc.Patins);
      }
    }
  }
  if (w.items[It.Corne]) {
    w.hornT -= dt;
    if (w.hornT <= 0) {
      w.hornT = ITEM.corne.period;
      const C = ITEM.corne,
        r2 = C.r * C.r;
      for (let i = 0; i < w.enemyCount; i++) {
        const e = w.enemies[i];
        if (!e.alive || ENEMIES[e.type].boss) continue;
        const dx = e.x - P.x,
          dz = e.z - P.z,
          d2 = dx * dx + dz * dz;
        if (d2 > r2 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2),
          k = C.kb * ENEMIES[e.type].kbMul * (1 - d / C.r);
        e.kx += (dx / d) * k;
        e.kz += (dz / d) * k;
        e.stun = Math.max(e.stun, C.stun);
      }
      w.emit(Ev.Horn, P.x, 0, P.z, C.r);
    }
  }
}

/**
 * Bouclier (phase 28) : la recharge court ; prêt, il annule les dégâts reçus pendant ce pas. Appelé là où une blessure
 * serait signalée : un coup annulé ne pose ni hurtAt (défi « Intouchable ») ni PlayerHurt. Vrai si le coup est annulé.
 */
export function shieldAbsorb(w: World, hurt: number): boolean {
  if (!w.items[It.Bouclier] || w.shieldT > 0 || hurt <= 0) return false;
  const P = w.player;
  P.hp += hurt;
  P.invul = Math.max(P.invul, ITEM.bouclier.invul);
  w.shieldT = ITEM.bouclier.period;
  w.emit(Ev.ShieldBlock, P.x, 1, P.z);
  return true;
}

/** Recharge du Bouclier (phase 28) : un anneau annonce qu'il est de nouveau prêt. */
export function shieldTick(w: World, dt: number): void {
  if (!w.items[It.Bouclier] || w.shieldT <= 0) return;
  w.shieldT -= dt;
  if (w.shieldT <= 0) w.emit(Ev.ShieldReady, w.player.x, 1, w.player.z);
}

// ---- phase 31 : soins des objets (vol de vie, Calice) ----

/** Plafond de soin par seconde des objets possédés (vol de vie et Calice cumulés). */
function healCap(w: World): number {
  let c = 0;
  if (w.items[It.Croc]) c += ITEM.croc.cap;
  if (w.items[It.Calice]) c += ITEM.calice.cap;
  if (w.items[It.Couronne]) c += ITEM.couronne.cap;
  return c;
}

/** Soigne de `hp` PV en puisant dans la réserve de la seconde ; compte le soin pour l'annonce. */
export function itemHeal(w: World, hp: number): void {
  const P = w.player;
  const h = Math.min(hp, w.healBank, P.maxHp - P.hp);
  if (h <= 0) return;
  w.healBank -= h;
  P.hp += h;
  w.healed += h;
}

/** Vol de vie (Croc de vampire, Couronne du berserker) : appelé par hitEnemy avec les dégâts infligés. */
export function lifesteal(w: World, dealt: number): void {
  let k = 0;
  if (w.items[It.Croc]) k += ITEM.croc.steal;
  if (w.items[It.Couronne]) k += ITEM.couronne.steal;
  if (k > 0) itemHeal(w, dealt * k);
}

/** Toutes les ITEM.healReport s : recharge la réserve de soin et annonce les PV rendus (un seul chiffre vert). */
export function healTick(w: World, dt: number): void {
  w.healT -= dt;
  if (w.healT > 0) return;
  w.healT = ITEM.healReport;
  w.healBank = healCap(w) * ITEM.healReport;
  if (w.healed >= 1) {
    const P = w.player;
    w.emit(Ev.Heal, P.x, P.y, P.z, w.healed); // la hauteur d'affichage est choisie par le rendu
  }
  w.healed = 0;
}
