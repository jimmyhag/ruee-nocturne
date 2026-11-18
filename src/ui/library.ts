// Bibliothèque (phase 40), interface « Nocturne » : onglets soulignés, fiche de l'entrée choisie (ce qu'on possède, ce
// qu'on peut débloquer : succès, puis achat à l'or ; retrait d'un objet du tirage), puis la grille d'icônes. Rendu à
// l'ouverture et après chaque action (jamais par frame) : innerHTML.
import { ITEM, ITEM_KEYS, ITEM_RARITY, SYNERGIES, TOME_POOL } from '../sim/balance';
import type { ItemKey } from '../sim/types';
import { WEAPON_KEYS } from '../sim/weapons/defs';
import { progress, value } from '../meta/achievements';
import { activeItems, entryState, mandatory, unlockAch, unlockPrice } from '../meta/library';
import type { EntryState, LibKind } from '../meta/library';
import type { Meta } from '../meta/save';
import { t } from '../i18n';
import { ITEM_ICON, TOME_ICON, WEAPON_ICON } from './icons';
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
import { esc, goldHtml, two } from './meta-ui';

export type LibTab = 'w' | 'i' | 't' | 's';
export const LIB_TABS: readonly LibTab[] = ['w', 'i', 't', 's'];

/** Une entrée de la Bibliothèque : clé, icône, nom, texte, rareté (objets), sorte achetable ou non. */
interface Entry {
  key: string;
  code: string; // clé du codex (`w:orbe`, `i:cape`, `t:degats`, `s:orage`)
  kind: LibKind | null; // null : tome ou synergie, toujours disponibles
  ico: string;
  name: string;
  text: string;
  rar: number; // 0 commune, 1 rare, 2 épique (objets) ; -1 sans rareté
}

function entries(m: Meta, tab: LibTab): Entry[] {
  if (tab === 'w')
    return WEAPON_KEYS.map((k) => ({
      key: k,
      code: `w:${k}`,
      kind: 'w',
      ico: WEAPON_ICON[k],
      name: weaponName(k),
      text: t(`weapon.${k}.text`),
      rar: -1,
    }));
  if (tab === 'i') {
    // possédés d'abord, puis à acheter, puis à débloquer ; ordre du jeu à l'intérieur
    const order: Record<EntryState, number> = { owned: 0, buyable: 1, poor: 1, locked: 2 };
    const keys = [...ITEM_KEYS].sort((a, b) => order[entryState(m, 'i', a)] - order[entryState(m, 'i', b)]);
    return keys.map((k) => {
      const r = ITEM_RARITY[ITEM_KEYS.indexOf(k)];
      // phase 43 : exemplaires au plus par partie, selon la rareté
      return {
        key: k,
        code: `i:${k}`,
        kind: 'i',
        ico: ITEM_ICON[k],
        name: itemName(k),
        text: `${itemText(k)} ${t('lib.copies', { n: ITEM.maxCopies[r] })}`,
        rar: r,
      };
    });
  }
  if (tab === 't')
    return TOME_POOL.map((k) => ({
      key: k,
      code: `t:${k}`,
      kind: null,
      ico: TOME_ICON[k],
      name: tomeName(k),
      text: tomeText(k),
      rar: -1,
    }));
  return SYNERGIES.map((s, i) => ({
    key: s.key,
    code: `s:${s.key}`,
    kind: null,
    ico: WEAPON_ICON[s.weapon],
    name: synergyName(i),
    text: `${synergyText(i)} · ${t('lib.recipe', { tome: tomeName(s.tome), weapon: weaponName(s.weapon) })}`,
    rar: -1,
  }));
}

/** État d'une entrée : possédée, achetable (or suffisant ou non), à débloquer ; un objet retiré du tirage est « off ». */
function stateOf(m: Meta, e: Entry): EntryState | 'off' {
  if (!e.kind) return 'owned';
  const st = entryState(m, e.kind, e.key);
  if (e.kind === 'i' && st === 'owned' && m.itemsOff.includes(e.key as never)) return 'off';
  return st;
}

/** Compte par onglet (« 20/32 ») : possédés sur le total. */
export function tabCount(m: Meta, tab: LibTab): string {
  if (tab === 'w')
    return `${WEAPON_KEYS.filter((k) => entryState(m, 'w', k) === 'owned').length}/${WEAPON_KEYS.length}`;
  if (tab === 'i') return `${ITEM_KEYS.filter((k) => entryState(m, 'i', k) === 'owned').length}/${ITEM_KEYS.length}`;
  return `${tab === 't' ? TOME_POOL.length : SYNERGIES.length}`;
}

/** Fiche de l'entrée choisie : icône, nom, rareté, texte, puis l'action ou la condition. */
function detail(m: Meta, e: Entry): string {
  const st = stateOf(m, e);
  const rar =
    e.rar >= 0
      ? `<span class="rar${e.rar === 2 ? ' epic' : e.rar === 1 ? ' rare' : ''}">${esc(rarityName(e.rar + 1))}</span>`
      : '';
  const n = m.codex[e.code] ?? 0;
  const seen = `<span class="note seen">${esc(n > 0 ? t('lib.runs', { n }) : t('lib.never'))}</span>`;
  let act: string;
  if (st === 'locked') {
    const a = unlockAch(e.kind as LibKind, e.key)!;
    const v = Math.min(value(a, m), a.goal);
    act = `<div class="cond"><span><i class="lockico" aria-hidden="true"></i><b>${esc(achName(a))}</b> · ${esc(achText(a))}</span><span class="prog"><i style="width:${(progress(a, m) * 100).toFixed(0)}%"></i></span><span>${esc(`${achValue(a, v)} / ${achValue(a, a.goal)}`)}</span></div>`;
  } else if (st === 'buyable' || st === 'poor') {
    const price = unlockPrice(e.kind as LibKind, e.key);
    act = `${seen}<button class="btn-act buy" data-unlock="${e.kind}:${e.key}" ${st === 'buyable' ? '' : 'disabled'} aria-label="${esc(t('lib.buy', { n: price }))}">${esc(t('char.unlock'))} <span class="gold">${goldHtml(price)}</span></button>`;
  } else if (e.kind === 'i' && mandatory(e.key as ItemKey))
    act = `${seen}<span class="note">${esc(t('lib.always'))}</span>`;
  else if (e.kind === 'i')
    act = `${seen}<button class="btn-link toggle" data-toggle="${e.key}" aria-pressed="${st === 'off' ? 'false' : 'true'}">${esc(st === 'off' ? t('lib.putBack') : t('lib.remove'))}</button>`;
  else act = seen;
  return `<section class="libdetail"><span class="big">${e.ico}</span><div class="bd"><h3>${esc(e.name)}</h3>${rar}<p>${esc(e.text)}</p><div class="act">${act}</div></div></section>`;
}

/**
 * Onglets, compte de l'onglet (« 04 / 13 »), fiche de l'entrée `sel` (la première sinon), grille d'icônes. Retourne
 * la clé de l'entrée affichée en fiche.
 */
export function renderLibrary(
  tabs: HTMLElement,
  list: HTMLElement,
  count: HTMLElement,
  m: Meta,
  tab: LibTab,
  sel: string,
): string {
  tabs.innerHTML = LIB_TABS.map(
    (k, i) =>
      `<button class="${k === tab ? 'selected' : ''}" data-tab="${k}" aria-pressed="${k === tab}" title="${i + 1}">${esc(t(`lib.tab.${k}`))}</button>`,
  ).join('');
  const [have, total] = tabCount(m, tab).split('/');
  count.textContent = total ? `${two(+have)} / ${two(+total)}` : two(+have);
  const all = entries(m, tab);
  const cur = all.find((e) => e.key === sel) ?? all[0];
  let html = detail(m, cur);
  if (tab === 'i') html += `<p class="note pool">${esc(t('lib.pool', { n: activeItems(m) }))}</p>`;
  html += '<div class="libgrid">';
  for (const e of all) {
    const st = stateOf(m, e);
    let mark = '<i></i>';
    if (st === 'locked') {
      const a = unlockAch(e.kind as LibKind, e.key)!;
      mark = `<i><b style="width:${(progress(a, m) * 100).toFixed(0)}%"></b></i>`;
    }
    const label =
      st === 'owned'
        ? e.name
        : `${e.name}, ${st === 'off' ? t('lib.off') : t(`lib.state.${st === 'poor' ? 'buyable' : st}`)}`;
    // rareté d'un objet (rare, épique) : son nom en prend la couleur
    const rar = e.rar > 0 ? ` r${e.rar}` : '';
    html += `<button class="lib ${st}${rar}${e.key === cur.key ? ' cur' : ''}" data-pick="${e.key}" aria-label="${esc(label)}" aria-pressed="${e.key === cur.key}">${e.ico}<span>${esc(e.name)}</span>${mark}</button>`;
  }
  list.innerHTML = html + '</div>';
  return cur.key;
}
