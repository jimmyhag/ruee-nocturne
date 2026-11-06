// Objets passifs (phase 17, PLAN §3.6) : obtenus dans les coffres et chez le marchand. Chaque objet est une règle :
// soit un effet appliqué une fois au joueur à l'obtention, soit un drapeau (w.items[It.X]) lu par la boucle de jeu.
import { ENEMIES, ITEM, ITEM_KEYS, ITEM_RARITY, It, MERCHANT, TOME_CAPS, TRAIT } from './balance';
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
