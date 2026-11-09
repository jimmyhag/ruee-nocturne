// Bibliothèque (phase 40) : toutes les armes, objets, tomes et synergies, avec ce qu'on possède et ce qu'on peut
// débloquer (succès, puis achat à l'or). Rendu à l'ouverture et après chaque action (jamais par frame) : innerHTML.
import { ITEM_KEYS, ITEM_RARITY, SYNERGIES, TOME_KEYS, UNLOCK } from '../sim/balance';
import { WEAPON_KEYS } from '../sim/weapons/defs';
import { progress } from '../meta/achievements';
import { activeItems, entryState, unlockAch, unlockPrice } from '../meta/library';
import type { EntryState, LibKind } from '../meta/library';
import type { Meta } from '../meta/save';
import { t } from '../i18n';
import { ITEM_ICON, MISC_ICON, TOME_ICON, WEAPON_ICON } from './icons';
import {
  achName,
  achText,
  achValue,
  itemName,
  itemText,
  rarityName,
  synergyName,
  synergyText,
  tomeName,
  tomeText,
  weaponName,
} from './cards';
import { esc } from './meta-ui';

export type LibTab = 'w' | 'i' | 't' | 's';
export const LIB_TABS: readonly LibTab[] = ['w', 'i', 't', 's'];

/** Nombre de parties avec l'entrée, ou « Jamais obtenu ». */
function seen(m: Meta, code: string): string {
  const n = m.codex[code] ?? 0;
  return `<p class="seen">${esc(n > 0 ? t('lib.runs', { n }) : t('lib.never'))}</p>`;
}

/** Fiche d'une arme ou d'un objet : état, prix ou défi, interrupteur de tirage pour un objet possédé. */
function lockable(m: Meta, kind: LibKind, key: string, ico: string, name: string, text: string, rar: number): string {
  const st: EntryState = entryState(m, kind, key);
  const off = kind === 'i' && st === 'owned' && m.itemsOff.includes(key as never);
  const badge = rar > 0 ? ` <span class="badge ${rar === 2 ? 'epic' : 'rare'}">${esc(rarityName(rar + 1))}</span>` : '';
  const label = off ? t('lib.off') : t(`lib.state.${st === 'poor' ? 'buyable' : st}`);
  let body: string;
  if (st === 'locked') {
    const a = unlockAch(kind, key)!;
    const v = Math.min(a.get(m.stats), a.goal);
    body = `<p class="cond">${MISC_ICON.lock}<b>${esc(achName(a))}</b> · ${esc(achText(a))} <span>${esc(`${achValue(a, v)} / ${achValue(a, a.goal)}`)}</span></p>
      <div class="bar"><i style="width:${(progress(a, m) * 100).toFixed(0)}%"></i></div>`;
  } else if (st === 'buyable' || st === 'poor') {
    body = `<button class="ghost buy" data-unlock="${kind}:${key}" ${st === 'buyable' ? '' : 'disabled'}>${esc(t('lib.buy', { n: unlockPrice(kind, key) }))}</button>`;
  } else {
    body = seen(m, `${kind}:${key}`);
    if (kind === 'i')
      body += `<button class="ghost toggle" data-toggle="${key}" aria-pressed="${off ? 'false' : 'true'}">${esc(off ? t('lib.putBack') : t('lib.remove'))}</button>`;
  }
  return `<div class="ach lib ${off ? 'off' : st}"><div class="achtop"><b>${ico}${esc(name)}${badge}</b><span>${esc(label)}</span></div>
    <p>${esc(text)}</p>${body}</div>`;
}

/** Tome ou synergie : toujours disponibles, seulement le compteur. */
function plain(m: Meta, code: string, ico: string, name: string, text: string): string {
  return `<div class="ach lib owned"><div class="achtop"><b>${ico}${esc(name)}</b><span></span></div><p>${esc(text)}</p>${seen(m, code)}</div>`;
}

/** Compte par onglet (« Objets 20/32 ») : possédés sur le total. */
export function tabCount(m: Meta, tab: LibTab): string {
  if (tab === 'w')
    return `${WEAPON_KEYS.filter((k) => entryState(m, 'w', k) === 'owned').length}/${WEAPON_KEYS.length}`;
  if (tab === 'i') return `${ITEM_KEYS.filter((k) => entryState(m, 'i', k) === 'owned').length}/${ITEM_KEYS.length}`;
  return `${tab === 't' ? TOME_KEYS.length : SYNERGIES.length}`;
}

export function renderLibrary(tabs: HTMLElement, list: HTMLElement, m: Meta, tab: LibTab): void {
  tabs.innerHTML = LIB_TABS.map(
    (k, i) =>
      `<button class="ghost${k === tab ? ' selected' : ''}" data-tab="${k}" aria-pressed="${k === tab}" title="${i + 1}">${esc(t(`lib.tab.${k}`))} <span class="cnt">${tabCount(m, k)}</span></button>`,
  ).join('');
  let html = '';
  if (tab === 'w')
    for (const k of WEAPON_KEYS) html += lockable(m, 'w', k, WEAPON_ICON[k], weaponName(k), t(`weapon.${k}.text`), 0);
  else if (tab === 'i') {
    html += `<p class="note">${esc(t('lib.pool', { n: activeItems(m), min: UNLOCK.minActive }))}</p>`;
    // possédés d'abord, puis à acheter, puis à débloquer ; ordre du jeu à l'intérieur
    const order: Record<EntryState, number> = { owned: 0, buyable: 1, poor: 1, locked: 2 };
    const keys = [...ITEM_KEYS].sort((a, b) => order[entryState(m, 'i', a)] - order[entryState(m, 'i', b)]);
    for (const k of keys)
      html += lockable(m, 'i', k, ITEM_ICON[k], itemName(k), itemText(k), ITEM_RARITY[ITEM_KEYS.indexOf(k)]);
  } else if (tab === 't') for (const k of TOME_KEYS) html += plain(m, `t:${k}`, TOME_ICON[k], tomeName(k), tomeText(k));
  else
    SYNERGIES.forEach((s, i) => {
      const recipe = t('lib.recipe', { tome: tomeName(s.tome), weapon: weaponName(s.weapon) });
      html += plain(m, `s:${s.key}`, WEAPON_ICON[s.weapon], synergyName(i), `${synergyText(i)} · ${recipe}`);
    });
  list.innerHTML = html;
}
