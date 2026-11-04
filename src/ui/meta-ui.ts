// Écrans de méta en DOM natif : personnages, boutique, succès, réglages, progression de l'écran de mort.
// Rendus à l'ouverture d'un écran (jamais par frame) : innerHTML est acceptable ici. Textes : src/i18n via cards.ts.
import { CHARACTERS, OUTFIT, SHOP, SLOTS } from '../sim/balance';
import { ACHIEVEMENTS, closest, progress, unlockedCharacters } from '../meta/achievements';
import type { Achievement } from '../meta/achievements';
import type { Meta } from '../meta/save';
import type { CharacterKey } from '../sim/types';
import { outfitOf, shopCost, shopTiers, slotState } from '../meta/shop';
import { OUTFITS, hex } from '../render/outfits';
import { fmtTime, t } from '../i18n';
import {
  achName,
  achText,
  achUnlock,
  achValue,
  characterName,
  characterText,
  characterTrait,
  shopName,
  shopText,
} from './cards';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Cartes de personnages du menu : le choisi est marqué, les verrouillés affichent leur condition. */
export function renderCharacters(container: HTMLElement, m: Meta, info?: HTMLElement): void {
  const unlocked = unlockedCharacters(m);
  container.innerHTML = CHARACTERS.map((c) => {
    const open = unlocked.includes(c.key);
    const ach = c.unlock ? ACH_BY_ID.get(c.unlock) : undefined;
    // verrouillé : la condition (succès) ou le bouton d'achat (or) ; le bouton est inactif tant que l'or manque
    let cond = '';
    if (!open && ach) cond = `<span class="badge">${esc(achText(ach))}</span>`;
    else if (!open && c.price > 0) {
      const can = m.gold >= c.price;
      const label = t(can ? 'char.buy' : 'char.tooPoor', { gold: t('gold', { n: c.price }) });
      cond = `<span class="buychar${can ? '' : ' poor'}" data-buy="${c.key}" role="button">${esc(label)}</span>`;
    }
    const sel = m.character === c.key ? ' selected' : '';
    const buyable = !open && c.price > 0; // une carte achetable reste un bouton actif (le faux bouton d'achat est dedans)
    return `<button class="card char${open ? '' : ' locked'}${sel}" data-char="${c.key}" ${open || buyable ? '' : 'aria-disabled="true"'}>
      <div class="top"><span class="glyph" style="background:${open ? 'var(--accent)' : 'var(--ink-3)'}">${open ? '✦' : '🔒'}</span><h3>${esc(characterName(c.key))}</h3></div>
      ${cond}<p>${esc(characterText(c.key))}</p></button>`;
  }).join('');
  // ligne d'information sous la grille (lisible sur téléphone, où le texte des cartes est masqué) : stats, passif, tenues
  if (info) {
    const k = m.character;
    const trait = characterTrait(k);
    info.innerHTML = `<b>${esc(characterName(k))}</b> · ${esc(characterText(k))}${trait ? `<br /><em>${esc(trait)}</em>` : ''}<div class="outfits">${renderOutfits(m, k)}</div>`;
  }
  // la carte choisie reste visible dans le défilement horizontal (téléphone)
  const sel = container.querySelector<HTMLElement>('.card.char.selected');
  if (sel && container.scrollWidth > container.clientWidth + 4)
    container.scrollLeft = Math.max(0, sel.offsetLeft - (container.clientWidth - sel.offsetWidth) / 2);
}

/** Boutons de tenue du personnage choisi : classique (toujours possédée) et alternative (achat en or, puis bascule). */
export function renderOutfits(m: Meta, k: CharacterKey): string {
  const sel = outfitOf(m, k);
  const owned = m.outfits.includes(k);
  const can = m.gold >= OUTFIT.price;
  const swatch = (i: number) => {
    const p = OUTFITS[k][i];
    return `<i style="background:linear-gradient(135deg,${hex(p.p1)} 50%,${hex(p.p2)} 50%)"></i>`;
  };
  const alt = owned
    ? esc(t(`outfit.${k}`))
    : `${esc(t(`outfit.${k}`))} · <span class="${can ? 'price' : 'price poor'}">${esc(t('gold', { n: OUTFIT.price }))}</span>`;
  return (
    `<button class="outfit${sel === 0 ? ' sel' : ''}" data-outfit="0" aria-pressed="${sel === 0}">${swatch(0)}${esc(t('outfit.classic'))}</button>` +
    `<button class="outfit${sel === 1 ? ' sel' : ''}${owned ? '' : ' locked'}" data-outfit="1" aria-pressed="${sel === 1}">${swatch(1)}${alt}</button>`
  );
}

/** Rangée des personnages de la boutique (phase 8 : paliers par personnage) : pastille de tenue + nom, le choisi marqué. */
export function renderShopChars(container: HTMLElement, m: Meta): string[] {
  const unlocked = unlockedCharacters(m);
  container.innerHTML = CHARACTERS.map((c) => {
    const open = unlocked.includes(c.key);
    const p = OUTFITS[c.key][outfitOf(m, c.key)];
    const sel = m.character === c.key;
    const bought = shopTiers(m, c.key).reduce((a, b) => a + b, 0);
    return `<button class="shopchar${sel ? ' sel' : ''}${open ? '' : ' locked'}" data-char="${c.key}" ${open ? '' : 'disabled'} aria-pressed="${sel}">
      <i style="background:linear-gradient(135deg,${hex(p.p1)} 50%,${hex(p.p2)} 50%)"></i>${esc(characterName(c.key))}${bought ? `<b>${bought}</b>` : ''}</button>`;
  }).join('');
  const sel = container.querySelector<HTMLElement>('.shopchar.sel');
  if (sel && container.scrollWidth > container.clientWidth + 4)
    container.scrollLeft = Math.max(0, sel.offsetLeft - (container.clientWidth - sel.offsetWidth) / 2);
  return unlocked;
}

/** Nom d'un emplacement (« Arme n°2 », « Amélioration n°3 »). */
export const slotName = (i: number): string => t(`slot.${SLOTS[i].kind}`, { n: SLOTS[i].n });
/** Condition d'un emplacement en une phrase : succès puis prix. */
export function slotCondition(i: number): string {
  const u = SLOTS[i];
  const a = ACH_BY_ID.get(u.ach);
  return t('slot.need', { name: a ? achName(a) : u.ach, gold: t('gold', { n: u.price }) });
}
/** Résumé des emplacements possédés (menu) : « Emplacements : 1 arme · 2 améliorations ». */
export function slotsLine(m: Meta): string {
  return t('slots.summary', {
    w: t('slots.weapons', { n: m.slots.weapons }),
    p: t('slots.passives', { n: m.slots.passives }),
  });
}

/** Lignes des emplacements (phase 10) : nom, succès requis avec barre, prix et bouton ; dans l'ordre de déblocage. */
export function renderSlots(container: HTMLElement, m: Meta): void {
  container.innerHTML = SLOTS.map((u, i) => {
    const st = slotState(m, i);
    const a = ACH_BY_ID.get(u.ach);
    const p = a ? progress(a, m) : 1;
    const achDone = !a || m.achievements.includes(a.id);
    const cond = a
      ? `<span class="cond">${esc(achName(a))}${achDone ? ' ✓' : ` · ${esc(achValue(a, Math.min(a.get(m.stats), a.goal)))} / ${esc(achValue(a, a.goal))}`}</span>${achDone ? '' : `<div class="bar"><i style="width:${(p * 100).toFixed(0)}%"></i></div>`}`
      : '';
    const right =
      st === 'owned'
        ? `<span class="badge">${esc(t('slot.owned'))}</span>`
        : st === 'later'
          ? `<span class="badge">${esc(t('slot.later'))}</span>`
          : `<button class="ghost buy" data-slot="${i}" ${st === 'buyable' ? '' : 'disabled'}>${esc(t('gold', { n: u.price }))}</button>`;
    return `<div class="shoprow slotrow ${st}"><div><h3>${u.kind === 'weapon' ? '⚔' : '✦'} ${esc(slotName(i))}</h3>${cond}</div>${right}</div>`;
  }).join('');
}

/** Lignes de la boutique d'un personnage : palier courant, coût du suivant, bouton d'achat (désactivé si l'or manque). */
export function renderShop(container: HTMLElement, m: Meta, key: CharacterKey = m.character): void {
  const tiers = shopTiers(m, key);
  container.innerHTML = SHOP.lines
    .map((l, i) => {
      const tier = tiers[i];
      const cost = shopCost(i, tier);
      const max = !Number.isFinite(cost);
      const pips = Array.from({ length: l.tiers }, (_, k) => `<i class="${k < tier ? 'on' : ''}"></i>`).join('');
      const btn = max
        ? `<span class="badge">${esc(t('shop.max'))}</span>`
        : `<button class="ghost buy" data-line="${i}" ${m.gold < cost ? 'disabled' : ''}>${esc(t('gold', { n: cost }))}</button>`;
      return `<div class="shoprow"><div><h3>${esc(shopName(i))}</h3><p>${esc(shopText(i))}</p><div class="pips">${pips}</div></div>${btn}</div>`;
    })
    .join('');
}

function bar(a: Achievement, m: Meta): string {
  const p = progress(a, m);
  const v = a.get(m.stats);
  const txt = `${achValue(a, Math.min(v, a.goal))} / ${achValue(a, a.goal)}`;
  const done = m.achievements.includes(a.id);
  const unlock = a.unlocks ? ` · <em>${esc(t('ach.unlocks', { what: achUnlock(a) }))}</em>` : '';
  return `<div class="ach${done ? ' done' : ''}"><div class="achtop"><b>${esc(achName(a))}</b><span>${done ? esc(t('ach.done')) : txt}</span></div>
    <p>${esc(achText(a))}${unlock}</p>
    <div class="bar"><i style="width:${(p * 100).toFixed(0)}%"></i></div></div>`;
}

/** Tous les succès, obtenus en bas. */
export function renderAchievements(container: HTMLElement, m: Meta): void {
  const sorted = [...ACHIEVEMENTS].sort(
    (a, b) => Number(m.achievements.includes(a.id)) - Number(m.achievements.includes(b.id)),
  );
  container.innerHTML = sorted.map((a) => bar(a, m)).join('');
}

/** Écran de mort : les n succès les plus proches. */
export function renderProgress(container: HTMLElement, m: Meta, n = 3): void {
  container.innerHTML = closest(m, n)
    .map((a) => bar(a, m))
    .join('');
}

/** Ligne de record du menu. */
export function bestLine(m: Meta): string {
  return m.bestTime > 0
    ? t('menu.best', {
        time: fmtTime(m.bestTime),
        kills: m.bestKills,
        runs: t('runs', { n: m.runs }),
        gold: t('gold', { n: Math.round(m.gold) }),
      })
    : t('menu.noRecord');
}
