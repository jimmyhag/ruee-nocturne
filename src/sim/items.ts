// Objets passifs (phase 17, PLAN §3.6) : obtenus dans les coffres et chez le marchand. Chaque objet est une règle :
// soit un effet appliqué au joueur à l'obtention, soit une valeur (w.itemEff[It.X]) lue par la boucle de jeu.
// Phase 38 : plus de limite, les objets se cumulent (w.items = nombre d'exemplaires, règle stackEff).
import { ENEMIES, ITEM, ITEM_KEYS, ITEM_RARITY, It, MERCHANT, SPELL, TOME_CAPS, TRAIT } from './balance';
import { hitEnemy } from './combat';
import { Ev, HitSrc, Trait } from './types';
import type { Card, ItemKey } from './types';
import type { World } from './world';

/** Nombre d'objets possédés (exemplaires compris). */
export function itemCount(w: World): number {
  let n = 0;
  for (let i = 0; i < w.items.length; i++) n += w.items[i];
  return n;
}

/**
 * Règle de cumul (phase 38) : valeur de `n` exemplaires d'un objet, en « premiers exemplaires ». Les ITEM.stackFull
 * premiers valent 1 chacun, les suivants ITEM.stackFalloff : 1, 2, 3, 3,5, 4…
 */
export function stackEff(n: number): number {
  return n <= ITEM.stackFull ? n : ITEM.stackFull + (n - ITEM.stackFull) * ITEM.stackFalloff;
}

/** Peut-on encore obtenir un objet ? Plus de limite (phase 38) : non seulement si tout est banni ou au maximum. */
export function canGainItem(w: World): boolean {
  for (let i = 0; i < ITEM_KEYS.length; i++) if (offerable(w, i)) return true;
  return false;
}
const offerable = (w: World, i: number): boolean => !w.itemBan[i] && w.items[i] < ITEM.maxStack;

/**
 * Obtient un exemplaire de l'objet d'index `i` (ITEM_KEYS) : effets immédiats, compte, événement. `bought` : acheté au
 * marchand. Les effets ponctuels s'appliquent à chaque exemplaire, pondérés par sa valeur dans la règle de cumul (`f`).
 */
export function gainItem(w: World, i: number, bought = false): void {
  if (w.items[i] >= ITEM.maxStack) return;
  const n = ++w.items[i];
  if (n === 1) w.itemOrder.push(i);
  const f = stackEff(n) - stackEff(n - 1);
  w.itemEff[i] = stackEff(n);
  const P = w.player;
  switch (i as It) {
    case It.Phenix:
      // une réanimation par « premier exemplaire » entier : 1, 2, 3, puis une tous les deux exemplaires
      P.revives += Math.floor(stackEff(n)) - Math.floor(stackEff(n - 1));
      break;
    case It.Cape:
      P.spellCdMul = Math.max(TOME_CAPS.spellCdMin, P.spellCdMul * ITEM.cape.cdMul ** f); // phase 19 : l'invulnérabilité est dans castSpell
      break;
    case It.Rune:
      P.spellCdMul = Math.max(TOME_CAPS.spellCdMin, P.spellCdMul * ITEM.rune.cdMul ** f); // phase 22
      break;
    case It.Lanterne:
      P.magnet *= ITEM.lanterne.magnetMul ** f;
      break;
    case It.Coeur:
      P.maxHp += ITEM.coeur.hp * f;
      P.hp += ITEM.coeur.hp * f;
      P.speed *= ITEM.coeur.speedMul ** f;
      break;
    case It.Bottes:
      if (n === 1) P.jumpMul *= ITEM.bottes.jumpMul; // le saut une fois ; l'onde d'atterrissage se cumule (step.ts)
      break;
    case It.Oeil:
      P.eliteDmgMul += ITEM.oeil.eliteDmg * f;
      break;
    case It.Fer:
      P.luck += ITEM.fer.luck * f;
      break;
    case It.Bourse:
      P.goldMul += ITEM.bourse.goldMul * f;
      break;
    // phase 31 : pourcentages simples (les soins et la Couronne sont lus dans la boucle)
    case It.Pierre:
      P.dmgMul += ITEM.pierre.dmg * f;
      break;
    case It.De:
      P.crit += ITEM.de.crit * f;
      break;
    case It.Brume:
      P.dmgTaken *= ITEM.brume.dmgTaken ** f;
      break;
    case It.Sandales:
      P.speed *= ITEM.sandales.speedMul ** f;
      break;
    case It.Amulette:
      P.xpMul += ITEM.amulette.xp * f;
      break;
    case It.Ecorce:
      P.armor = Math.min(TOME_CAPS.armorMax, P.armor + ITEM.ecorce.armor * f);
      break;
    default:
      break; // les autres sont lus par la boucle, × w.itemEff[i]
  }
  w.emit(Ev.Item, P.x, P.y + 1, P.z, i, bought ? 1 : 0);
}

/** Poids de tirage de l'objet `i` (rareté décalée par la Chance ; × ITEM.dupWeight s'il est déjà possédé). */
function itemWeight(w: World, i: number): number {
  const r = ITEM_RARITY[i];
  const base = ITEM.weight[r] + w.player.luck * ITEM.luckWeight[r];
  return w.items[i] ? base * ITEM.dupWeight : base;
}

/**
 * Tire `count` objets différents, pondérés par rareté (ITEM.weight, décalés par la Chance), dans `out` (kind 'i') :
 * w.cards pour un coffre, w.offers pour le marchand. Phase 38 : un objet possédé peut revenir (il se cumulera) ; la
 * carte porte alors son prochain compte (`s2`, « ×2 »).
 * `priced` : prix du marchand (rareté × hausse par visite, rabais de la Bourse). Allocation de cartes : hors boucle chaude
 * (un coffre ou une visite, quelques fois par run).
 */
export function rollItemChoices(w: World, count: number, priced: boolean, out: Card[]): void {
  out.length = 0;
  for (let k = 0; k < count; k++) {
    let total = 0;
    for (let i = 0; i < ITEM_KEYS.length; i++) if (offerable(w, i) && !taken(out, i)) total += itemWeight(w, i);
    if (total <= 0) break;
    let x = w.rng.next() * total;
    let pick = -1;
    for (let i = 0; i < ITEM_KEYS.length; i++) {
      if (!offerable(w, i) || taken(out, i)) continue;
      pick = i; // repli : le dernier candidat si l'arrondi laisse x > 0
      x -= itemWeight(w, i);
      if (x <= 0) break;
    }
    if (pick < 0) break;
    const r = ITEM_RARITY[pick];
    out.push({ kind: 'i', key: ITEM_KEYS[pick], lv: r, n: r + 1, s0: priced ? itemPrice(w, pick) : 0, s1: 0, s2: w.items[pick] + 1 });
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
  return Math.round(base * bourseDiscount(w) * w.player.shopMul); // phase 23 : tome Or
}
/** Rabais de la Bourse (phase 38 : se multiplie à chaque exemplaire). */
export function bourseDiscount(w: World): number {
  return (1 - ITEM.bourse.discount) ** w.itemEff[It.Bourse];
}

/** Nombre d'objets proposés par un coffre. */
export function chestOffers(w: World): number {
  return w.trait === Trait.Marchand ? TRAIT.marchand.offers : ITEM.offers;
}
/** Nombre d'objets proposés par le marchand (Fer à cheval : un de plus par exemplaire, au plus deux). */
export function merchantOffers(w: World): number {
  return ITEM.offers + Math.min(2, w.items[It.Fer]); // phase 38 : une offre par exemplaire, deux de plus au plus
}

export const itemIndex = (key: ItemKey): number => ITEM_KEYS.indexOf(key);

let talismanBusy = false;
/** Talisman orageux : appelé à chaque kill ; tous les ITEM.talisman.every kills, la foudre frappe les plus proches. */
export function talismanKill(w: World): void {
  if (!w.items[It.Talisman] || talismanBusy) return;
  if (++w.talismanKills < ITEM.talisman.every / w.itemEff[It.Talisman]) return; // phase 38 : plus souvent par exemplaire
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
        hitEnemy(w, rideHits[k], ITEM.patins.perSpeed * v * w.itemEff[It.Patins], ITEM.patins.kb, P.x, P.z, HitSrc.Patins);
      }
    }
  }
  if (w.items[It.Corne]) {
    w.hornT -= dt;
    if (w.hornT <= 0) {
      w.hornT = ITEM.corne.period / w.itemEff[It.Corne]; // phase 38 : plus souvent par exemplaire
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
  w.shieldT = ITEM.bouclier.period / w.itemEff[It.Bouclier]; // phase 38 : recharge ÷ exemplaires
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
  const E = w.itemEff;
  return ITEM.croc.cap * E[It.Croc] + ITEM.calice.cap * E[It.Calice] + ITEM.couronne.cap * E[It.Couronne];
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
  const k = ITEM.croc.steal * w.itemEff[It.Croc] + ITEM.couronne.steal * w.itemEff[It.Couronne];
  if (k > 0) itemHeal(w, dealt * k);
}

/** Toutes les ITEM.healReport s : recharge la réserve de soin et annonce les PV rendus (un seul chiffre vert). */
export function healTick(w: World, dt: number): void {
  w.healT -= dt;
  if (w.healT > 0) return;
  w.healT = ITEM.healReport;
  w.healBank = healCap(w) * ITEM.healReport;
  if (w.healed >= 0.5) { // affiché arrondi : « +1 » dès un demi-PV (plafond de 1 PV/s : la somme peut tomber à 0,999…)
    const P = w.player;
    w.emit(Ev.Heal, P.x, P.y, P.z, w.healed); // la hauteur d'affichage est choisie par le rendu
  }
  w.healed = 0;
}
