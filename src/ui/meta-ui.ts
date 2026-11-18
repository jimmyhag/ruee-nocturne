// Écrans de méta en DOM natif, interface « Nocturne » (docs/specs/ui-nocturne.md) : héros, emplacements, succès,
// progression de l'écran de fin. Rendus à l'ouverture d'un écran ou après une action (jamais par frame) : innerHTML est
// acceptable ici. Textes : src/i18n via cards.ts.
import { CHARACTERS, OUTFIT, REROLL_SHOP, RUN_REROLL, SLOTS, SPELL_KEYS } from '../sim/balance';
import { ACHIEVEMENTS, closest, progress, unlockedCharacters, value } from '../meta/achievements';
import type { Achievement } from '../meta/achievements';
import type { Meta } from '../meta/save';
import type { CharacterKey } from '../sim/types';
import { masterOutfit, outfitOf, rerollState, runRerolls, slotState } from '../meta/shop';
import { OUTFITS, hex } from '../render/outfits';
import { fmtNum, fmtTime, t } from '../i18n';
import { SPELL_ICON, WEAPON_ICON } from './icons';
import {
  achName,
  achText,
  achValue,
  characterName,
  characterText,
  characterTrait,
  itemName,
  spellName,
  spellText,
  weaponName,
} from './cards';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Icônes au trait du kit (1,7 px, sans fond). */
const ARROW = '<svg class="ln" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14 M13 6l6 6-6 6"/></svg>';
const CHECK = '<svg class="ln" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const LOCK = '<i class="lockico" aria-hidden="true"></i>';
/** Montant d'or au trait (pièce + nombre) ; `sr` : « or » lu par les lecteurs d'écran et gardé dans le texte. */
export const goldHtml = (n: number): string =>
  `<i class="coin" aria-hidden="true"></i>${esc(fmtNum(Math.round(n)))}<span class="sr"> ${esc(t('goldWord'))}</span>`;
/** Portrait et avatar d'un héros (public/ui, `npm run ui-images`). */
export const portraitSrc = (k: CharacterKey): string => `/ui/portrait-${k}.webp`;
export const avatarSrc = (k: CharacterKey): string => `/ui/avatar-${k}.webp`;
/** Numéro à deux chiffres (« 01 / 09 »). */
export const two = (n: number): string => String(n).padStart(2, '0');

/** Condition d'un héros verrouillé : son succès, ou son prix en or. */
export function heroCondition(k: CharacterKey): string {
  const c = CHARACTERS.find((x) => x.key === k)!;
  const a = c.unlock ? ACH_BY_ID.get(c.unlock) : undefined;
  if (a) return achText(a);
  return t('char.tooPoor', { gold: t('gold', { n: c.price }) });
}
/** « Orbe filante · Bond » : arme de départ et sort du héros. */
export function heroKit(k: CharacterKey): { weapon: string; spell: string } {
  const c = CHARACTERS.find((x) => x.key === k)!;
  return { weapon: weaponName(c.weapon), spell: spellName(SPELL_KEYS[c.spell]) };
}

/** Ce qu'un succès rapporte, en court (« Vieille sorcière », « Boomerang », « +500 »). */
export function achReward(a: Achievement): string {
  const u = a.unlocks;
  if (!u) return '';
  if (u.item) return itemName(u.item);
  if (u.weapon) return weaponName(u.weapon);
  if (u.gold) return '+' + fmtNum(u.gold);
  if (u.outfit) return t('chal.outfit');
  return t(`ach.${a.id}.unlock`);
}
/** Valeur d'avancement « 372 / 500 » (ou « 6:09 / 10:00 »). */
export function achProgressText(a: Achievement, m: Meta): string {
  return `${achValue(a, Math.min(value(a, m), a.goal))} / ${achValue(a, a.goal)}`;
}

/**
 * Écran Héros : fiche du héros regardé (portrait, atout, arme, sort, état), les neuf avatars (`container`), la tenue et
 * les défis. `view` : le héros regardé (le choisi par défaut) ; un héros verrouillé se regarde sans se choisir.
 */
export function renderCharacters(container: HTMLElement, m: Meta, info: HTMLElement, view: CharacterKey): void {
  const unlocked = unlockedCharacters(m);
  container.innerHTML = CHARACTERS.map((c) => {
    const open = unlocked.includes(c.key);
    const cls = `char${open ? '' : ' locked'}${m.character === c.key ? ' selected' : ''}${view === c.key ? ' viewed' : ''}`;
    const label = open ? characterName(c.key) : t('char.lockedName', { name: characterName(c.key) });
    return `<button class="${cls}" data-char="${c.key}" aria-label="${esc(label)}" aria-pressed="${m.character === c.key}"><span class="avatar"><img src="${avatarSrc(c.key)}" alt="" /></span><span class="sr">${esc(characterName(c.key))}</span><i></i></button>`;
  }).join('');
  const i = CHARACTERS.findIndex((c) => c.key === view);
  const c = CHARACTERS[i];
  const open = unlocked.includes(view);
  const sk = SPELL_KEYS[c.spell];
  let state: string;
  if (m.character === view) state = `<div class="lbl state">${CHECK}<span>${esc(t('char.selected'))}</span></div>`;
  else if (open) state = `<div class="lbl state off"><span>${esc(t('char.available'))}</span></div>`;
  else state = `<div class="lbl state off">${LOCK}<span>${esc(t('char.locked'))}</span></div>`;
  // verrouillé : la condition (succès, avec sa progression) ou l'achat en or (inactif tant que l'or manque)
  let lock = '';
  const ach = c.unlock ? ACH_BY_ID.get(c.unlock) : undefined;
  if (!open && ach)
    lock = `<div class="row"><span class="lbl">${esc(t('char.cond'))}</span><span>${esc(achText(ach))}</span></div><div class="goalrow"><div class="gb"><div class="gt"><span>${esc(achName(ach))}</span><span>${esc(achProgressText(ach, m))}</span></div><span class="prog"><i style="width:${(progress(ach, m) * 100).toFixed(0)}%"></i></span></div></div>`;
  else if (!open && c.price > 0) {
    const can = m.gold >= c.price;
    lock = `<button class="btn-act buychar${can ? '' : ' poor'}" data-buy="${c.key}" ${can ? '' : 'disabled'} aria-label="${esc(t('char.buyAria', { name: characterName(c.key), gold: t('gold', { n: c.price }) }))}">${esc(t('char.unlock'))} <span class="gold">${goldHtml(c.price)}</span></button>`;
  }
  const trait = characterTrait(view);
  const head = `<section class="herohead"><div class="bignum" aria-hidden="true">${two(i + 1)}</div><img class="hp breathe${open ? '' : ' locked'}" src="${portraitSrc(view)}" alt="${esc(characterName(view))}" /><div class="hd">${state}<h3>${esc(characterName(view))}</h3>
    <div class="row"><span class="lbl">${esc(t('char.perk'))}</span><span>${esc(characterText(view))}</span></div>
    <div class="row"><span class="lbl">${esc(t('char.weapon'))}</span><span>${WEAPON_ICON[c.weapon]}${esc(weaponName(c.weapon))}</span></div>
    <div class="row"><span class="lbl">${esc(t('char.spell'))}</span><span>${SPELL_ICON[sk]}${esc(spellName(sk))}</span></div>
    <p>${esc(spellText(sk))}</p>${trait ? `<p class="trait">${esc(trait)}</p>` : ''}${lock}</div></section>`;
  // tenue (phase 7) et défis (phase 41) du héros regardé, s'il est débloqué
  const outfits = open
    ? `<div class="row outfitrow"><span class="lbl">${esc(t('char.outfit'))}</span><span class="outfits">${renderOutfits(m, view)}</span></div>`
    : '';
  const chal = ACHIEVEMENTS.filter((a) => a.char === view)
    .map((a, n) => goalRow(a, m, n + 1))
    .join('');
  info.innerHTML = `${head}${outfits}<div class="chalwrap"><div class="lbl">${esc(t('chal.title'))}</div><div class="chal">${chal}</div></div>`;
}

/** Boutons de tenue : classique (toujours possédée), alternative (achat en or, puis bascule), maître (défi III). */
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
    : `${esc(t(`outfit.${k}`))} <span class="price${can ? '' : ' poor'}">${goldHtml(OUTFIT.price)}</span>`;
  return (
    `<button class="outfit${sel === 0 ? ' sel' : ''}" data-outfit="0" aria-pressed="${sel === 0}">${swatch(0)}${esc(t('outfit.classic'))}</button>` +
    `<button class="outfit${sel === 1 ? ' sel' : ''}${owned ? '' : ' locked'}" data-outfit="1" aria-pressed="${sel === 1}">${swatch(1)}${alt}</button>` +
    // phase 41 : tenue de maître, gagnée au défi III (jamais en vente)
    `<button class="outfit master${sel === 2 ? ' sel' : ''}${master ? '' : ' locked'}" data-outfit="2" aria-pressed="${sel === 2}" ${master ? '' : `aria-disabled="true" aria-label="${esc(`${t('outfit.master')} · ${t('chal.outfitLocked')}`)}"`}>${swatch(2)}${esc(t('outfit.master'))}${master ? '' : LOCK}</button>`
  );
}

/** Ligne de défi : numéro en grand chiffre, texte et progression, filet, récompense. */
function goalRow(a: Achievement, m: Meta, n: number): string {
  const done = m.achievements.includes(a.id);
  const rew = achReward(a);
  const reward = a.unlocks?.gold ? `<i class="coin" aria-hidden="true"></i>${esc(rew)}` : esc(rew);
  return `<div class="goalrow${done ? ' done' : ''}" aria-label="${esc(achName(a))}"><span class="n">${two(n)}</span><div class="gb"><div class="gt"><span>${esc(achText(a))}</span><span>${done ? esc(t('ach.done')) : esc(achProgressText(a, m))}</span></div><span class="prog"><i style="width:${(progress(a, m) * 100).toFixed(0)}%"></i></span>${rew ? `<div class="rw">${ARROW}${reward}</div>` : ''}</div></div>`;
}

/** Nom d'un emplacement (« Arme n°2 », « Tome n°3 »). */
export const slotName = (i: number): string => t(`slot.${SLOTS[i].kind}`, { n: SLOTS[i].n });
/** Condition d'un emplacement en une phrase : succès puis prix. */
export function slotCondition(i: number): string {
  const u = SLOTS[i];
  const a = ACH_BY_ID.get(u.ach);
  return t('slot.need', { name: a ? achName(a) : u.ach, gold: t('gold', { n: u.price }) });
}
/** Segments de progression : possédés en lune, le prochain achetable en lanterne qui respire, le reste en filet. */
function segs(have: number, total: number, next: boolean): string {
  let s = '';
  for (let k = 0; k < total; k++)
    s += k < have ? '<i class="on"></i>' : k === have && next ? '<i class="next soft"></i>' : '<i></i>';
  return s;
}
/** Bouton « DÉBLOQUER ◦ 300 → » (action secondaire), inactif tant que l'or manque. */
function unlockBtn(attr: string, price: number, can: boolean, label: string): string {
  return `<button class="btn-act buy" ${attr} ${can ? '' : 'disabled'} aria-label="${esc(t('slot.buyAria', { name: label, gold: t('gold', { n: price }) }))}">${esc(t('char.unlock'))} <span class="gold">${goldHtml(price)}</span></button>`;
}

/**
 * Emplacements (phase 10) : une section par sorte (armes, tomes) avec le compte en grand chiffre, les segments et la
 * ligne du prochain déblocage (achat en or, ou succès à obtenir avec sa progression).
 */
export function renderSlots(container: HTMLElement, m: Meta): void {
  let html = '';
  for (const kind of ['weapon', 'passive'] as const) {
    const idx: number[] = [];
    SLOTS.forEach((u, i) => {
      if (u.kind === kind) idx.push(i);
    });
    const have = kind === 'weapon' ? m.slots.weapons : m.slots.passives;
    const total = SLOTS[idx[idx.length - 1]].n;
    const next = idx.find((i) => slotState(m, i) !== 'owned');
    let row = `<div class="slotrow owned"><div><span class="nm">${esc(t('slots.all'))}</span></div></div>`;
    let buyable = false;
    if (next !== undefined) {
      const st = slotState(m, next);
      const u = SLOTS[next];
      const a = ACH_BY_ID.get(u.ach);
      if (st === 'buyable' || st === 'poor') {
        buyable = st === 'buyable';
        row = `<div class="slotrow ${st}"><div><span class="nm">${esc(slotName(next))}</span><span class="note">${esc(t(`slot.${kind}.desc`))}</span></div>${unlockBtn(`data-slot="${next}"`, u.price, buyable, slotName(next))}</div>`;
      } else if (a) {
        row = `<div class="slotrow ${st}"><div><div class="gt"><span class="nm">${esc(slotName(next))}</span><span>${esc(achProgressText(a, m))}</span></div><span class="prog"><i style="width:${(progress(a, m) * 100).toFixed(0)}%"></i></span><span class="cond">${LOCK}${esc(slotCondition(next))}</span></div></div>`;
      }
    }
    html += `<section class="slotsec" data-kind="${kind}"><div class="sh"><h3>${esc(t(`slots.title.${kind}`))}</h3><span class="cnt" id="${kind === 'weapon' ? 'slotsWeapons' : 'slotsTomes'}">${have}<span> / ${total}</span></span></div><div class="segs" aria-hidden="true">${segs(have, total, buyable)}</div>${row}</section>`;
  }
  container.innerHTML = html;
}

/** Relances (phase 31) : le compte par partie, les segments et la prochaine relance à acheter. */
export function renderRerolls(container: HTMLElement, note: HTMLElement, m: Meta): void {
  note.textContent = t('rerolls.note', { n: runRerolls(m) });
  const have = m.slots.rerolls;
  const total = REROLL_SHOP.length;
  const k = have;
  let buyable = false;
  if (k >= total)
    container.innerHTML = `<div class="slotrow owned"><div><span class="nm">${esc(t('rerolls.max'))}</span></div></div>`;
  else {
    const st = rerollState(m, k);
    buyable = st === 'buyable';
    const name = t('rerolls.row', { n: k + RUN_REROLL.base + 1 });
    container.innerHTML = `<div class="slotrow ${st}"><div><span class="nm">${esc(name)}</span><span class="note">${esc(t('rerolls.desc'))}</span></div>${unlockBtn(`data-reroll="${k}"`, REROLL_SHOP[k], buyable, name)}</div>`;
  }
  const cnt = document.getElementById('rerollCnt');
  if (cnt) cnt.innerHTML = `${have + RUN_REROLL.base}<span> / ${total + RUN_REROLL.base}</span>`;
  const sg = document.getElementById('rerollSegs');
  if (sg) sg.innerHTML = segs(have + RUN_REROLL.base, total + RUN_REROLL.base, buyable);
}

/** Anneau de progression (2 px lanterne) ou coche pleine quand c'est obtenu. */
function ring(p: number, done: boolean): string {
  if (done)
    return '<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16.5" fill="var(--lantern)"/><path d="M11.5 18.5l4.5 4.5 8.5-9.5" fill="none" stroke="var(--night)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const c = 97.4; // 2π × 15,5
  return `<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--rule)" stroke-width="2"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--lantern)" stroke-width="2" stroke-linecap="round" stroke-dasharray="${(p * c).toFixed(1)} ${c}" transform="rotate(-90 18 18)"/></svg>`;
}
/** Ligne de succès : anneau, nom et texte, valeur (ou « Obtenu ») et récompense. */
function achRow(a: Achievement, m: Meta): string {
  const done = m.achievements.includes(a.id);
  const rew = achReward(a);
  return `<div class="ach${done ? ' done' : ''}">${ring(progress(a, m), done)}<div class="ab"><b>${esc(achName(a))}</b><span>${esc(achText(a))}</span></div><div class="av"><b>${done ? esc(t('ach.done')) : esc(achProgressText(a, m))}</b>${rew ? `<span>${ARROW}${esc(rew)}</span>` : ''}</div></div>`;
}

export type AchTab = 'all' | 'general' | 'heroes';
export const ACH_TABS: readonly AchTab[] = ['all', 'general', 'heroes'];
/** Succès : onglets (tous, généraux, défis des héros), puis la liste, ce qui reste à faire d'abord. */
export function renderAchievements(
  tabs: HTMLElement,
  container: HTMLElement,
  count: HTMLElement,
  m: Meta,
  tab: AchTab,
): void {
  const general = ACHIEVEMENTS.filter((a) => !a.char);
  const heroes = ACHIEVEMENTS.filter((a) => a.char);
  tabs.innerHTML = ACH_TABS.map((k) => {
    const n = k === 'general' ? ` ${general.length}` : k === 'heroes' ? ` ${heroes.length}` : '';
    return `<button data-ach="${k}" aria-pressed="${k === tab}">${esc(t(`ach.tab.${k}`))}${n}</button>`;
  }).join('');
  const list = tab === 'general' ? general : tab === 'heroes' ? heroes : ACHIEVEMENTS;
  const done = ACHIEVEMENTS.filter((a) => m.achievements.includes(a.id)).length;
  count.textContent = `${two(done)} / ${ACHIEVEMENTS.length}`;
  const sorted = [...list].sort(
    (a, b) => Number(m.achievements.includes(a.id)) - Number(m.achievements.includes(b.id)),
  );
  container.innerHTML = sorted.map((a) => achRow(a, m)).join('');
}

/** Écran de fin : les n succès les plus proches (défis du personnage joué compris). */
export function renderProgress(container: HTMLElement, m: Meta, n: number, char: CharacterKey): void {
  container.innerHTML = closest(m, n, char)
    .map((a) => achRow(a, m))
    .join('');
}

/** Record du profil (« RECORD 6:09 » ou « AUCUN RECORD »). */
export function bestLine(m: Meta): string {
  return m.bestTime > 0 ? t('menu.best', { time: fmtTime(m.bestTime) }) : t('menu.noRecord');
}
