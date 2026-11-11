// Icônes dessinées (phase 28) : chaque arme, tome, objet, bonus et sort a son image SVG, valide et sans ressource externe.
import { describe, expect, it } from 'vitest';
import { BOON_KEYS, ITEM_KEYS, POWER_KEYS, SPELL_KEYS, TOME_KEYS } from '../sim/balance';
import { WEAPON_KEYS } from '../sim/weapons/defs';
import { BOON_ICON, ITEM_ICON, MISC_ICON, POWER_ICON, SPELL_ICON, TOME_ICON, WEAPON_ICON, iconFor } from './icons';

const valid = (s: string) => {
  expect(s.startsWith('<svg class="ico" viewBox="0 0 64 64"')).toBe(true);
  expect(s.endsWith('</svg>')).toBe(true);
  expect(s).not.toMatch(/href|url\(|<script|NaN|undefined/);
  expect(s.length).toBeLessThan(1500);
};

describe('icônes', () => {
  it('une icône par arme, tome, objet, bonus et sort', () => {
    for (const k of WEAPON_KEYS) valid(WEAPON_ICON[k]);
    for (const k of TOME_KEYS) valid(TOME_ICON[k]);
    for (const k of ITEM_KEYS) valid(ITEM_ICON[k]);
    for (const k of BOON_KEYS) valid(BOON_ICON[k]);
    for (const k of SPELL_KEYS) valid(SPELL_ICON[k]);
    for (const k of POWER_KEYS) valid(POWER_ICON[k]); // phase 35 : bonus au sol
    expect(new Set(POWER_KEYS.map((k) => POWER_ICON[k])).size).toBe(POWER_KEYS.length);
    for (const k of Object.keys(MISC_ICON) as (keyof typeof MISC_ICON)[]) valid(MISC_ICON[k]);
    expect(WEAPON_KEYS.length + TOME_KEYS.length + ITEM_KEYS.length + BOON_KEYS.length + SPELL_KEYS.length).toBe(80); // phase 47 A : 12 tomes, 18 bonus de sanctuaire
  });
  it('les objets ont chacun une image distincte (hors bourse, partagée avec le sort du même nom)', () => {
    const seen = new Set(ITEM_KEYS.map((k) => ITEM_ICON[k]));
    expect(seen.size).toBe(ITEM_KEYS.length);
    const w = new Set(WEAPON_KEYS.map((k) => WEAPON_ICON[k]));
    expect(w.size).toBe(WEAPON_KEYS.length);
  });
  it('iconFor lit la bonne table, chaîne vide si inconnue', () => {
    expect(iconFor('w', 'faux')).toBe(WEAPON_ICON.faux);
    expect(iconFor('i', 'corne')).toBe(ITEM_ICON.corne);
    expect(iconFor('s', 'bond')).toBe(SPELL_ICON.bond);
    expect(iconFor('w', 'nope')).toBe('');
  });
});
