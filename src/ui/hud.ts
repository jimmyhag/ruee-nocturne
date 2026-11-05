import { ENEMIES, ITEM_KEYS, ITEM_RARITY, PLAYER } from '../sim/balance';
import type { Card, ItemKey, TomeKey, WeaponKey } from '../sim/types';
import { cardSynergy } from '../sim/synergies';
import { TOME_LOOK, WEAPONS } from '../sim/weapons/defs';
import type { World } from '../sim/world';
import { fmtTime, onLangChange, t } from '../i18n';
import {
  ITEM_GLYPH,
  RARITY_COLOR,
  cardLines,
  cardText,
  cardTitle,
  enemyName,
  itemName,
  rarityName,
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
    bossbar: $('bossbar'),
    bossname: $('bossname'),
    bossfill: $('bossfill'),
    kit: $('kit'),
    merchantChip: $('merchantChip'),
    merchantArrow: $('merchantArrow'),
    merchantDist: $('merchantDist'),
    dashbar: $('dashbar'),
    btnDash: $('btnDash'),
    flash: $('flash'),
    banner: $('banner'),
    perf: $('perf'),
  };
  private bannerT = 0;
  private lastKillTens = 0;
  private killPopT = 0;
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
    this.lastXp = 0;
    this.lastSweep = 0;
    this.flashT = 0;
    this.els.killsBox.classList.remove('pop');
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
    // fantôme de PV : rattrape en 400 ms (transition CSS) → lisibilité de la quantité perdue
    this.width('hpghost', P.hp / P.maxHp);
    this.text('hptxt', Math.ceil(Math.max(0, P.hp)) + ' / ' + P.maxHp);
    this.text('lvl', String(P.level));
    this.text('time', fmtTime(w.t));
    this.text('kills', String(w.kills));
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
    const cd = P.dashCd > 0 ? 1 - P.dashCd / PLAYER.dashCd : 1;
    const cdv = cd.toFixed(2);
    if (this.cache.cd !== cdv) {
      this.cache.cd = cdv;
      this.els.btnDash.style.setProperty('--cd', cdv);
      this.els.dashbar.style.width = cd * 100 + '%';
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
        c.lv === 1 && c.kind !== 'i'
          ? `<p>${c.kind === 'w' ? t(`weapon.${c.key}.text`) : t(`tome.${c.key}.text`)}</p>`
          : '';
      const body =
        c.kind === 'heal' || c.kind === 'i'
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
