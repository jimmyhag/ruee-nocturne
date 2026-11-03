import { ENEMIES, PLAYER } from '../sim/balance';
import type { Card, PassiveKey, WeaponKey } from '../sim/types';
import { EVOLUTIONS, PASSIVES, WEAPONS } from '../sim/weapons/defs';
import type { World } from '../sim/world';
import { fmtTime, onLangChange, t } from '../i18n';
import { cardText, cardTitle, enemyName, passiveName, weaponName } from './cards';

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
    for (const k in w.passives)
      parts.push(
        `<span style="color:var(--muted)">${passiveName(k as PassiveKey)} ${w.passives[k as PassiveKey]}</span>`,
      );
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

export function renderCards(container: HTMLElement, cards: Card[]): void {
  container.innerHTML = cards
    .map((c, i) => {
      let glyph = '+',
        color = '#7ee0a1',
        badge = `<span class="badge">${t('card.bonus')}</span>`;
      if (c.kind === 'w') {
        const d = WEAPONS[c.key as WeaponKey];
        glyph = d.glyph;
        color = d.color;
        badge =
          c.lv === 1
            ? `<span class="badge new">${t('card.newWeapon')}</span>`
            : `<span class="badge">${t('card.level', { n: c.lv })}</span>`;
      } else if (c.kind === 's') {
        const d = PASSIVES[c.key as PassiveKey];
        glyph = d.glyph;
        color = d.color;
        badge = `<span class="badge">${t('card.level', { n: c.lv })}</span>`;
      } else if (c.kind === 'e') {
        const d = EVOLUTIONS[c.key as WeaponKey];
        if (d) {
          glyph = d.glyph;
          color = d.color;
        }
        badge = `<span class="badge evo">${t('card.evolution')}</span>`;
      }
      return `<button class="card" data-i="${i}"><div class="top"><span class="glyph" style="background:${color}">${glyph}</span><h3>${cardTitle(c)}</h3><kbd>${i + 1}</kbd></div>${badge}<p>${cardText(c)}</p></button>`;
    })
    .join('');
}

/** Flash de sélection d'une carte (classe CSS `picked`), avant la fermeture de l'écran. */
export function flashCard(container: HTMLElement, i: number): void {
  const el = container.children[i] as HTMLElement | undefined;
  el?.classList.add('picked');
}
