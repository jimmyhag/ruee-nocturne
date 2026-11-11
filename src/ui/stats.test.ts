// Phase 47 A : fiche de stats (pause) et ligne « actuel → nouveau » des cartes de sanctuaire.
import { describe, expect, it } from 'vitest';
import { BOON, BOON_KEYS } from '../sim/balance';
import { applyBoon } from '../sim/poi';
import { World } from '../sim/world';
import { STAT_ROWS, boonNow, statValue, statsHTML } from './stats';

describe('fiche de stats', () => {
  it('chaque bonus de sanctuaire a sa ligne dans la fiche', () => {
    const keys = new Set(STAT_ROWS.map((r) => r.key));
    for (const k of BOON_KEYS) expect(keys.has(k), k).toBe(true);
  });
  it('« actuel → nouveau » : la carte annonce exactement ce que le bonus fera', () => {
    const w = new World(3);
    for (const k of BOON_KEYS) {
      const text = boonNow(w, k);
      const [, a, b] = /: (.+) → (.+)$/.exec(text) ?? [];
      expect(a, `${k} : ${text}`).toBe(statValue(k, w));
      expect(b, k).not.toBe(a); // le bonus se voit à l'arrondi affiché
      const v = new World(3);
      applyBoon(v, k);
      expect(statValue(k, v), k).toBe(b);
    }
    expect(w.boons.every((n) => n === 0)).toBe(true); // rien n'a été appliqué au vrai héros
  });
  it('vol de vie et réserve de soin suivent les sanctuaires', () => {
    const w = new World(3);
    expect(statValue('steal', w)).toBe('0 %');
    applyBoon(w, 'steal');
    applyBoon(w, 'steal');
    expect(statValue('steal', w)).toBe(`${Math.round(BOON.steal * 200)} %`);
    expect(statValue('healcap', w)).not.toBe('0');
  });
  it('HTML : cinq familles, toutes les lignes, aucun texte manquant', () => {
    const html = statsHTML(new World(3));
    expect(html.match(/class="statgroup g-/g)?.length).toBe(5);
    expect(html.match(/<li>/g)?.length).toBe(STAT_ROWS.length);
    expect(html).not.toMatch(/stats\.[a-z.]+/); // une clé i18n absente ressortirait telle quelle
  });
});
