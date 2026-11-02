import { PLAYER } from '../sim/balance';
import type { Card } from '../sim/types';
import { cardText, cardTitle } from '../sim/progression';
import { PASSIVES, WEAPONS } from '../sim/weapons/defs';
import type { World } from '../sim/world';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const fmtTime = (s: number) => {
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/** HUD en DOM : toute écriture passe par un cache pour ne toucher le DOM que si la valeur change. */
export class Hud {
  private cache: Record<string, string | number | boolean> = {};
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

  reset(): void {
    this.cache = {};
    this.lastKillTens = 0;
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

  update(w: World, hurtT: number, now: number): void {
    const P = w.player;
    this.width('xpfill', P.xp / P.need);
    this.width('hpfill', P.hp / P.maxHp);
    // fantôme de PV : rattrape lentement (lisibilité de la perte)
    this.width('hpghost', P.hp / P.maxHp);
    this.text('hptxt', Math.ceil(Math.max(0, P.hp)) + ' / ' + P.maxHp);
    this.text('lvl', String(P.level));
    this.text('time', fmtTime(w.t));
    this.text('kills', String(w.kills));
    const tens = Math.floor(w.kills / 10);
    if (tens !== this.lastKillTens) {
      this.lastKillTens = tens;
      this.els.killsBox.classList.add('pop');
      setTimeout(() => this.els.killsBox.classList.remove('pop'), 150);
    }
    const bossOn = w.bossIndex >= 0 && w.enemies[w.bossIndex].alive;
    if (this.cache.boss !== bossOn) {
      this.cache.boss = bossOn;
      this.els.bossbar.hidden = !bossOn;
    }
    if (bossOn) {
      const b = w.enemies[w.bossIndex];
      this.width('bossfill', b.hp / b.max);
    }
    const cd = P.dashCd > 0 ? 1 - P.dashCd / PLAYER.dashCd : 1;
    const cdv = cd.toFixed(2);
    if (this.cache.cd !== cdv) {
      this.cache.cd = cdv;
      this.els.btnDash.style.setProperty('--cd', cdv);
      this.els.dashbar.style.width = cd * 100 + '%';
    }
    const fl = hurtT > 0 ? 1 : 0;
    if (this.cache.fl !== fl) {
      this.cache.fl = fl;
      this.els.flash.style.opacity = fl ? '0.55' : '0';
    }
    void now;
  }

  xpSweep(): void {
    const s = this.els.xpsweep;
    s.classList.remove('go');
    void s.offsetWidth;
    s.classList.add('go');
  }

  kit(w: World): void {
    const parts: string[] = [];
    for (const k in w.weapons) parts.push(`<span>${WEAPONS[k as keyof typeof WEAPONS].name} ${w.weapons[k as keyof typeof WEAPONS]}</span>`);
    for (const k in w.passives) parts.push(`<span style="color:var(--muted)">${PASSIVES[k as keyof typeof PASSIVES].name} ${w.passives[k as keyof typeof PASSIVES]}</span>`);
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
        badge = '<span class="badge">Bonus</span>';
      if (c.kind === 'w') {
        const d = WEAPONS[c.key as keyof typeof WEAPONS];
        glyph = d.glyph;
        color = d.color;
        badge = c.lv === 1 ? '<span class="badge new">Nouvelle arme</span>' : `<span class="badge">Niv ${c.lv}</span>`;
      } else if (c.kind === 's') {
        const d = PASSIVES[c.key as keyof typeof PASSIVES];
        glyph = d.glyph;
        color = d.color;
        badge = `<span class="badge">Niv ${c.lv}</span>`;
      }
      return `<button class="card" data-i="${i}"><div class="top"><span class="glyph" style="background:${color}">${glyph}</span><h3>${cardTitle(c)}</h3><kbd>${i + 1}</kbd></div>${badge}<p>${cardText(c)}</p></button>`;
    })
    .join('');
}
