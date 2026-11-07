import { ENEMIES, ITEM_KEYS, ITEM_RARITY, MAPCHEST, SHRINE, SPELL_KEYS } from '../sim/balance';
import { canGainItem } from '../sim/items';
import { mapChestPrice } from '../sim/poi';
import { spellCooldown } from '../sim/spells';
import type { BoonKey, Card, ItemKey, TomeKey, WeaponKey } from '../sim/types';
import { cardSynergy } from '../sim/synergies';
import { TOME_LOOK, WEAPONS } from '../sim/weapons/defs';
import type { World } from '../sim/world';
import { fmtTime, onLangChange, t, fmtNum } from '../i18n';
import {
  BOON_GLYPH,
  ITEM_GLYPH,
  RARITY_COLOR,
  SPELL_GLYPH,
  cardLines,
  cardText,
  cardTitle,
  enemyName,
  itemName,
  rarityName,
  spellName,
  synergyName,
  synergyText,
  tomeName,
  weaponName,
} from './cards';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type FlashKind = 'hurt' | 'gold';

/** HUD en DOM : toute écriture passe par un cache pour ne toucher le DOM que si la valeur change. */
export class Hud {
  private cache: Record<string, string | number | boolean> = {};
  /** Noms de boss précalculés dans la langue courante : aucune chaîne construite par frame. */
  private bossNames: string[] = [];
  private els = {
    xpfill: $('xpfill'),
    xpsweep: $('xpsweep'),
    hpfill: $('hpfill'),
    hpghost: $('hpghost'),
    hptxt: $('hptxt'),
    lvl: $('lvl'),
    time: $('time'),
    kills: $('kills'),
    killsBox: $('killsBox'),
    goldN: $('goldN'),
    goldBox: $('goldBox'),
    bossbar: $('bossbar'),
    bossname: $('bossname'),
    bossfill: $('bossfill'),
    kit: $('kit'),
    merchantChip: $('merchantChip'),
    merchantArrow: $('merchantArrow'),
    merchantDist: $('merchantDist'),
    poiChip: $('poiChip'),
    poiText: $('poiText'),
    poiFill: $('poiFill'),
    spellbar: $('spellbar'),
    spellSec: $('spellSec'),
    spellKey: $('spellKey'),
    spellGlyph: $('spellGlyph'),
    spellName: $('spellName'),
    btnSpell: $('btnSpell'),
    flash: $('flash'),
    banner: $('banner'),
    perf: $('perf'),
  };
  private spellGlyphChar = '✦'; // symbole du sort de la classe (remplacé par les secondes pendant la recharge)
  private bannerT = 0;
  private lastKillTens = 0;
  private killPopT = 0;
  private goldPopT = 0;
  private lastXp = 0;
  private lastSweep = 0;
  private flashT = 0; // flash d'écran ponctuel (doré) en cours
  private flashKind: FlashKind = 'hurt';
  /** Atténuation des flashs (mode « réduction des effets ») : 1 = plein, 0,4 = atténué. */
  flashMul = 1;

  constructor() {
    this.relabel();
    onLangChange(() => this.relabel());
  }
  /** Recalcule les libellés qui dépendent de la langue (changement à chaud depuis les réglages). */
  relabel(): void {
    this.bossNames = ENEMIES.map((_, i) => enemyName(i).toUpperCase());
    delete this.cache.bossname;
  }

  reset(): void {
    this.cache = {};
    this.lastKillTens = 0;
    this.killPopT = 0;
    this.goldPopT = 0;
    this.lastXp = 0;
    this.lastSweep = 0;
    this.flashT = 0;
    this.els.killsBox.classList.remove('pop');
    this.els.goldBox.classList.remove('pop');
  }
  private text(k: keyof typeof this.els, v: string): void {
    if (this.cache[k] !== v) {
      this.cache[k] = v;
      this.els[k].textContent = v;
    }
  }
  private width(k: keyof typeof this.els, f: number): void {
    const v = Math.round(Math.max(0, Math.min(1, f)) * 200) / 2 + '%';
    if (this.cache[k] !== v) {
      this.cache[k] = v;
      this.els[k].style.width = v;
    }
  }

  update(w: World, hurtT: number, now: number, dt: number): void {
    const P = w.player;
    this.width('xpfill', P.xp / P.need);
    // éclat blanc qui balaie la barre à un gain notable (≥ 5 % du niveau), au plus toutes les 300 ms
    const xpRatio = P.xp / P.need;
    if (xpRatio - this.lastXp >= 0.05 && now - this.lastSweep > 0.3) {
      this.lastSweep = now;
      this.xpSweep();
    }
    if (xpRatio < this.lastXp || now - this.lastSweep > 0.3) this.lastXp = xpRatio;
    this.width('hpfill', P.hp / P.maxHp);
    // phase 17 : le marchand est là, flèche vers l'échoppe (l'écran regarde vers −z : « haut » = −z) et distance
    const M = w.merchant;
    const showM = M.active && !M.inside;
    if (this.cache.mOn !== showM) {
      this.cache.mOn = showM;
      this.els.merchantChip.hidden = !showM;
    }
    if (showM) {
      const dx = M.x - P.x,
        dz = M.z - P.z,
        deg = Math.round((Math.atan2(dx, -dz) * 180) / Math.PI / 5) * 5;
      if (this.cache.mDeg !== deg) {
        this.cache.mDeg = deg;
        this.els.merchantArrow.style.transform = `rotate(${deg}deg)`;
      }
      // la chaîne n'est construite que si la distance ou les secondes changent (zéro allocation par frame)
      const md = Math.round(Math.sqrt(dx * dx + dz * dz)),
        ms = Math.ceil(M.until - w.t);
      if (this.cache.mDist !== md || this.cache.mSecs !== ms) {
        this.cache.mDist = md;
        this.cache.mSecs = ms;
        this.text('merchantDist', `${md} m · ${ms} s`);
      }
    }
    // phase 18 : coffre de carte ou sanctuaire tout proche : prix (ou pourquoi on ne peut pas) et jauge d'ouverture
    let kind = 0, // 0 rien, 1 coffre, 2 sanctuaire
      fill = 0,
      best = 36; // 6 u²
    for (let i = 0; i < w.mapChests.length; i++) {
      const c = w.mapChests[i];
      if (c.open) continue;
      const d2 = (c.x - P.x) ** 2 + (c.z - P.z) ** 2;
      if (d2 < best) {
        best = d2;
        kind = 1;
        fill = c.hold / MAPCHEST.hold;
      }
    }
    const sr2 = (SHRINE.r + 2) ** 2;
    for (let i = 0; i < w.shrines.length; i++) {
      const s = w.shrines[i];
      if (s.used) continue;
      const d2 = (s.x - P.x) ** 2 + (s.z - P.z) ** 2;
      if (d2 < sr2 && (kind === 0 || d2 < best)) {
        best = d2;
        kind = 2;
        fill = s.charge / SHRINE.charge;
      }
    }
    // phase 28 : piste chronométrée en cours (prioritaire) : secondes restantes et jauge du temps
    let raceT = -1;
    for (let i = 0; i < w.races.length; i++)
      if (w.races[i].state === 1) {
        raceT = w.races[i].t;
        fill = Math.max(0, w.races[i].t / w.races[i].time);
        kind = 3;
      }
    if (this.cache.poiOn !== kind) {
      this.els.poiChip.hidden = kind === 0;
      this.els.poiChip.classList.toggle('shrine', kind === 2);
      this.els.poiChip.classList.toggle('race', kind === 3);
    }
    if (kind === 3) {
      const tenths = Math.max(0, Math.ceil(raceT * 10));
      if (this.cache.poiKey !== -100 - tenths) {
        this.cache.poiKey = -100 - tenths;
        this.els.poiText.textContent = t('race.left', { s: fmtNum(tenths / 10) });
      }
    }
    if (kind === 1) {
      // l'état (prix, pas assez d'or, 6 objets) ne change que rarement : la chaîne n'est reconstruite qu'à ce moment
      const price = mapChestPrice(w),
        full = !canGainItem(w), // 6 objets : le coffre donne un bonus (phase 18)
        poor = w.gold < price,
        key = price * 4 + (full ? 1 : 0) + (poor ? 2 : 0);
      if (this.cache.poiKey !== key || this.cache.poiOn !== kind) {
        this.cache.poiKey = key;
        const g = t('gold', { n: price });
        this.els.poiText.textContent = poor
          ? t('mapchest.poor', { gold: g })
          : full
            ? t('mapchest.boon', { gold: g })
            : t('mapchest.price', { gold: g });
        this.els.poiChip.classList.toggle('poor', poor);
      }
    } else if (kind === 2 && this.cache.poiOn !== kind) {
      this.cache.poiKey = -1;
      this.els.poiText.textContent = t('shrine.title');
      this.els.poiChip.classList.remove('poor');
    }
    this.cache.poiOn = kind;
    if (kind !== 0) this.width('poiFill', fill);
    // fantôme de PV : rattrape en 400 ms (transition CSS) → lisibilité de la quantité perdue
    this.width('hpghost', P.hp / P.maxHp);
    this.text('hptxt', Math.ceil(Math.max(0, P.hp)) + ' / ' + P.maxHp);
    this.text('lvl', String(P.level));
    this.text('time', fmtTime(w.t));
    this.text('kills', String(w.kills));
    // or de la partie : la chaîne n'est construite que quand le montant affiché change ; petit « pop » à chaque gain
    const gold = Math.floor(w.gold);
    if (this.cache.gold !== gold) {
      const gained = typeof this.cache.gold === 'number' && gold > this.cache.gold;
      this.cache.gold = gold;
      this.els.goldN.textContent = String(gold);
      if (gained) {
        this.goldPopT = 0.12;
        this.els.goldBox.classList.add('pop');
      }
    } else if (this.goldPopT > 0) {
      this.goldPopT -= dt;
      if (this.goldPopT <= 0) this.els.goldBox.classList.remove('pop');
    }
    const tens = Math.floor(w.kills / 10);
    if (tens !== this.lastKillTens) {
      this.lastKillTens = tens;
      this.killPopT = 0.15;
      this.els.killsBox.classList.add('pop');
    } else if (this.killPopT > 0) {
      this.killPopT -= dt;
      if (this.killPopT <= 0) this.els.killsBox.classList.remove('pop');
    }
    const bossOn = w.bossIndex >= 0 && w.enemies[w.bossIndex].alive;
    if (this.cache.boss !== bossOn) {
      this.cache.boss = bossOn;
      this.els.bossbar.hidden = !bossOn;
    }
    if (bossOn) {
      const b = w.enemies[w.bossIndex];
      this.width('bossfill', b.hp / b.max);
      this.text('bossname', this.bossNames[b.type]);
    }
    const cd = P.spellCd > 0 ? 1 - P.spellCd / spellCooldown(w) : 1; // phase 19 : sort de classe
    const cdv = cd.toFixed(2);
    if (this.cache.cd !== cdv) {
      this.cache.cd = cdv;
      this.els.btnSpell.style.setProperty('--cd', cdv);
      this.els.spellbar.style.width = cd * 100 + '%';
    }
    // phase 22 : secondes restantes (texte changé au plus une fois par seconde)
    const sec = P.spellCd > 0 ? Math.ceil(P.spellCd) : 0;
    if (this.cache.sec !== sec) {
      this.cache.sec = sec;
      this.els.spellGlyph.textContent = sec > 0 ? String(sec) : this.spellGlyphChar;
      this.els.spellSec.textContent = sec > 0 ? `${sec} s` : '';
      this.els.btnSpell.classList.toggle('cooling', sec > 0);
    }
    // flash d'écran : rouge tant que le joueur est touché, sinon flash ponctuel (doré) en fondu
    let op = 0;
    if (hurtT > 0) {
      op = 0.55 * this.flashMul;
      this.setFlashKind('hurt');
    } else if (this.flashT > 0) {
      this.flashT -= dt;
      op = Math.max(0, this.flashT / 0.35) * 0.5 * this.flashMul;
      this.setFlashKind(this.flashKind);
    }
    const opv = Math.round(op * 20) / 20;
    if (this.cache.fl !== opv) {
      this.cache.fl = opv;
      this.els.flash.style.opacity = String(opv);
    }
  }
  private setFlashKind(k: FlashKind): void {
    if (this.cache.flk !== k) {
      this.cache.flk = k;
      this.els.flash.classList.toggle('gold', k === 'gold');
    }
  }
  /** Flash d'écran ponctuel (boss vaincu : doré). */
  flash(kind: FlashKind): void {
    this.flashKind = kind;
    this.flashT = 0.35;
  }

  xpSweep(): void {
    const s = this.els.xpsweep;
    s.classList.remove('go');
    void s.offsetWidth;
    s.classList.add('go');
  }

  kit(w: World): void {
    // phase 19 : bouton et touche du sort au nom du sort de la classe
    const sk = SPELL_KEYS[w.spell];
    this.spellGlyphChar = SPELL_GLYPH[sk];
    this.els.spellGlyph.textContent = SPELL_GLYPH[sk];
    this.cache.sec = -1; // affichage des secondes à refaire avec le nouveau symbole
    this.els.spellName.textContent = spellName(sk).toUpperCase();
    this.els.spellKey.textContent = spellName(sk);
    this.els.btnSpell.setAttribute('aria-label', spellName(sk));
    const parts: string[] = [];
    for (const k in w.weapons) parts.push(`<span>${weaponName(k as WeaponKey)} ${w.weapons[k as WeaponKey]}</span>`);
    for (const k in w.tomes)
      parts.push(`<span style="color:var(--muted)">${tomeName(k as TomeKey)} ${w.tomes[k as TomeKey]}</span>`);
    // phase 17 : objets passifs (glyphes à la couleur de leur rareté) et synergies actives
    for (const i of w.itemOrder)
      parts.push(
        `<span class="item" title="${itemName(ITEM_KEYS[i])}" style="color:${RARITY_COLOR[ITEM_RARITY[i]]}">${ITEM_GLYPH[ITEM_KEYS[i]]}</span>`,
      );
    for (let i = 0; i < w.syn.length; i++)
      if (w.syn[i]) parts.push(`<span class="syn" title="${synergyText(i)}">✦ ${synergyName(i)}</span>`);
    this.els.kit.innerHTML = parts.join('');
  }

  banner(txt: string): void {
    const b = this.els.banner;
    b.textContent = txt;
    b.classList.add('on');
    clearTimeout(this.bannerT);
    this.bannerT = window.setTimeout(() => b.classList.remove('on'), 1800);
  }

  perf(lines: string): void {
    this.els.perf.textContent = lines;
  }
  showPerf(on: boolean): void {
    this.els.perf.hidden = !on;
  }
}

/**
 * Cartes de choix (montée de niveau, coffre, marchand). `w` : marque « Synergie » sur une carte qui en complète une ;
 * `shop` : prix et état d'achat (or de la partie, place libre).
 */
export function renderCards(
  container: HTMLElement,
  cards: Card[],
  w?: World,
  shop?: { gold: number; full: boolean },
): void {
  container.innerHTML = cards
    .map((c, i) => {
      let glyph = '+',
        color = '#7ee0a1',
        badge = `<span class="badge">${t('card.bonus')}</span>`;
      const syn = w ? cardSynergy(w, c) : -1;
      const synBadge =
        syn >= 0 ? `<span class="badge syn">${t('card.synergy', { name: synergyName(syn) })}</span>` : '';
      let price = '',
        off = false;
      if (c.kind === 'i') {
        glyph = ITEM_GLYPH[c.key as ItemKey];
        color = RARITY_COLOR[c.lv];
        badge = `<span class="badge new item">${t('card.item')}</span>`;
        if (shop) {
          const sold = c.s1 === 1;
          off = sold || shop.full || shop.gold < c.s0;
          price = `<span class="badge price${off ? ' off' : ''}">${sold ? t('merchant.sold') : t('gold', { n: c.s0 })}</span>`;
        }
      } else if (c.kind === 'b') {
        glyph = BOON_GLYPH[c.key as BoonKey];
        color = '#5fd3ff';
        badge = `<span class="badge new boon">${t('card.boon')}</span>`;
      } else if (c.kind === 'w') {
        const d = WEAPONS[c.key as WeaponKey];
        glyph = d.glyph;
        color = d.color;
        badge =
          c.lv === 1
            ? `<span class="badge new weapon">${t('card.newWeapon')}</span>`
            : `<span class="badge">${t('card.level', { n: c.lv })}</span>`;
      } else if (c.kind === 't') {
        const d = TOME_LOOK[c.key as TomeKey];
        glyph = d.glyph;
        color = d.color;
        badge =
          c.lv === 1
            ? `<span class="badge new">${t('card.newTome')}</span>`
            : `<span class="badge">${t('card.level', { n: c.lv })}</span>`;
      }
      // rareté = nombre de lignes : 2 → rare (cadre bleu), 3 → épique (cadre or) ; le badge de rareté suit
      const rarity = c.kind === 'heal' ? '' : c.n >= 3 ? ' epic' : c.n === 2 ? ' rare' : '';
      const rb = rarity ? `<span class="badge${rarity}">${rarityName(c.n)}</span>` : '';
      const lines = cardLines(c);
      const intro =
        c.lv === 1 && c.kind !== 'i' && c.kind !== 'b'
          ? `<p>${c.kind === 'w' ? t(`weapon.${c.key}.text`) : t(`tome.${c.key}.text`)}</p>`
          : '';
      const body =
        c.kind === 'heal' || c.kind === 'i' || c.kind === 'b'
          ? `<p>${cardText(c)}</p>`
          : `${intro}<ul class="lines">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
      // phase 17 : la carte qui complète une synergie dit ce qu'elle débloque
      const synLine = syn >= 0 ? `<p class="synline">✦ ${synergyText(syn)}</p>` : '';
      return `<button class="card${rarity}${off ? ' off' : ''}" data-i="${i}" ${off ? 'aria-disabled="true"' : ''}><div class="top"><span class="glyph" style="background:${color}">${glyph}</span><h3>${cardTitle(c)}</h3><kbd>${i + 1}</kbd></div><div class="badges">${badge}${rb}${synBadge}${price}</div>${body}${synLine}</button>`;
    })
    .join('');
}

/** Flash de sélection d'une carte (classe CSS `picked`), avant la fermeture de l'écran. */
export function flashCard(container: HTMLElement, i: number): void {
  const el = container.children[i] as HTMLElement | undefined;
  el?.classList.add('picked');
}
