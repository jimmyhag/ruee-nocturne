// Écrans de méta en DOM natif : personnages, boutique, succès, réglages, progression de l'écran de mort.
// Rendus à l'ouverture d'un écran (jamais par frame) : innerHTML est acceptable ici. Textes : src/i18n via cards.ts.
import { CHARACTERS, OUTFIT, REROLL_SHOP, RUN_REROLL, SLOTS, SPELL_KEYS } from '../sim/balance';
import { ACHIEVEMENTS, closest, progress, unlockedCharacters, value } from '../meta/achievements';
import type { Achievement } from '../meta/achievements';
import type { Meta } from '../meta/save';
import type { CharacterKey } from '../sim/types';
import { masterOutfit, outfitOf, rerollState, runRerolls, slotState } from '../meta/shop';
import { OUTFITS, hex } from '../render/outfits';
import { fmtTime, t } from '../i18n';
import { ITEM_ICON, MISC_ICON, SPELL_ICON, WEAPON_ICON } from './icons';
import {
  achName,
  achText,
  achUnlock,
  achValue,
  characterName,
  characterText,
  characterTrait,
  spellName,
  spellText,
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
      <div class="top"><span class="glyph" style="background:${open ? 'var(--accent)' : 'var(--ink-3)'}">${open ? SPELL_ICON[SPELL_KEYS[c.spell]] : MISC_ICON.lock}</span><h3>${esc(characterName(c.key))}</h3></div>
      ${cond}<p>${esc(characterText(c.key))}</p></button>`;
  }).join('');
  // ligne d'information sous la grille (lisible sur téléphone, où le texte des cartes est masqué) : stats, passif, tenues
  if (info) {
    const k = m.character;
    const trait = characterTrait(k);
    // phase 19 : le sort de classe, juste sous le nom
    const sk = SPELL_KEYS[(CHARACTERS.find((c) => c.key === k) ?? CHARACTERS[0]).spell];
    const spell = `<span class="spell">${SPELL_ICON[sk]} <b>${esc(spellName(sk))}</b> : ${esc(spellText(sk))}</span>`;
    // phase 41 : les 3 défis du personnage, avec leur barre et leur récompense
    const chal = ACHIEVEMENTS.filter((a) => a.char === k)
      .map((a) => bar(a, m))
      .join('');
    info.innerHTML = `<b>${esc(characterName(k))}</b> · ${esc(characterText(k))}<br />${spell}${trait ? `<br /><em>${esc(trait)}</em>` : ''}<div class="outfits">${renderOutfits(m, k)}</div><h3 class="h3 chaltitle">${esc(t('chal.title'))}</h3><div class="achs chal">${chal}</div>`;
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
  const master = masterOutfit(m, k);
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
    `<button class="outfit${sel === 1 ? ' sel' : ''}${owned ? '' : ' locked'}" data-outfit="1" aria-pressed="${sel === 1}">${swatch(1)}${alt}</button>` +
    // phase 41 : tenue de maître, gagnée au défi III (jamais en vente)
    `<button class="outfit master${sel === 2 ? ' sel' : ''}${master ? '' : ' locked'}" data-outfit="2" aria-pressed="${sel === 2}" ${master ? '' : 'aria-disabled="true"'}>${swatch(2)}${esc(t('outfit.master'))}${master ? '' : ` · <span class="price poor">${esc(t('chal.outfitLocked'))}</span>`}</button>`
  );
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
      ? `<span class="cond">${esc(achName(a))}${achDone ? ' ✓' : ` · ${esc(achValue(a, Math.min(value(a, m), a.goal)))} / ${esc(achValue(a, a.goal))}`}</span>${achDone ? '' : `<div class="bar"><i style="width:${(p * 100).toFixed(0)}%"></i></div>`}`
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

/** Relances (phase 31) : une ligne par relance achetable, dans l'ordre, comme les emplacements. */
export function renderRerolls(container: HTMLElement, note: HTMLElement, m: Meta): void {
  note.textContent = t('rerolls.note', { n: runRerolls(m) });
  container.innerHTML = REROLL_SHOP.map((price, k) => {
    const st = rerollState(m, k);
    const right =
      st === 'owned'
        ? `<span class="badge">${esc(t('slot.owned'))}</span>`
        : st === 'later'
          ? `<span class="badge">${esc(t('slot.later'))}</span>`
          : `<button class="ghost buy" data-reroll="${k}" ${st === 'buyable' ? '' : 'disabled'}>${esc(t('gold', { n: price }))}</button>`;
    return `<div class="shoprow slotrow ${st}"><div><h3>↻ ${esc(t('rerolls.row', { n: k + RUN_REROLL.base + 1 }))}</h3></div>${right}</div>`;
  }).join('');
}

function bar(a: Achievement, m: Meta): string {
  const p = progress(a, m);
  const v = value(a, m);
  const txt = `${achValue(a, Math.min(v, a.goal))} / ${achValue(a, a.goal)}`;
  const done = m.achievements.includes(a.id);
  // phase 41 : un défi par personnage « rapporte » de l'or ; le reste « débloque »
  const verb = a.unlocks?.gold ? 'chal.pays' : 'ach.unlocks';
  const unlock = a.unlocks ? ` · <em>${esc(t(verb, { what: achUnlock(a) }))}</em>` : '';
  // phase 28 : icône de ce que le succès débloque (arme, sort du personnage) ou trophée
  const ch = a.unlocks?.character ? CHARACTERS.find((c) => c.key === a.unlocks!.character) : undefined;
  const ico = a.unlocks?.weapon
    ? WEAPON_ICON[a.unlocks.weapon]
    : a.unlocks?.item
      ? ITEM_ICON[a.unlocks.item] // phase 40
      : ch
        ? SPELL_ICON[SPELL_KEYS[ch.spell]]
        : MISC_ICON.trophy;
  return `<div class="ach${done ? ' done' : ''}"><div class="achtop"><b>${ico}${esc(achName(a))}</b><span>${done ? esc(t('ach.done')) : txt}</span></div>
    <p>${esc(achText(a))}${unlock}</p>
    <div class="bar"><i style="width:${(p * 100).toFixed(0)}%"></i></div></div>`;
}

/** Tous les succès, obtenus en bas. */
export function renderAchievements(container: HTMLElement, m: Meta): void {
  // phase 41 : les défis par personnage vivent sur la fiche du personnage
  const sorted = ACHIEVEMENTS.filter((a) => !a.char).sort(
    (a, b) => Number(m.achievements.includes(a.id)) - Number(m.achievements.includes(b.id)),
  );
  container.innerHTML = sorted.map((a) => bar(a, m)).join('');
}

/** Écran de mort : les n succès les plus proches. */
export function renderProgress(container: HTMLElement, m: Meta, n = 3, char?: CharacterKey): void {
  container.innerHTML = closest(m, n, char)
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
