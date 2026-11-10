// Libellés du contenu dans les deux langues : titres, lignes de stats et résumés d'armes (pluriels, nombres).
import { describe, expect, it } from 'vitest';
import { setLang } from '../i18n';
import { ACHIEVEMENTS } from '../meta/achievements';
import { CHARACTERS, ENEMIES, ITEM_KEYS, SYNERGIES, TOMES, TOME_KEYS, WEAPON_LINES } from '../sim/balance';
import { WEAPON_KEYS, refreshStats } from '../sim/weapons/defs';
import type { Card } from '../sim/types';
import { World } from '../sim/world';
import {
  achName,
  achText,
  achUnlock,
  cardLines,
  cardText,
  cardTitle,
  characterName,
  characterText,
  characterTrait,
  enemyName,
  lineText,
  rarityName,
  itemName,
  itemText,
  synergyName,
  synergyText,
  tomeName,
  tomeText,
  weaponName,
  weaponSummary,
} from './cards';

const card = (c: Partial<Card>): Card => ({ kind: 'w', key: 'orbe', lv: 1, n: 1, s0: 0, s1: -1, s2: -1, ...c });

describe('cartes', () => {
  it('titres, lignes et textes pour chaque sorte de carte (FR)', () => {
    setLang('fr');
    expect(cardTitle(card({ kind: 'w', key: 'orbe' }))).toBe('Orbe filante');
    expect(cardText(card({ kind: 'w', key: 'orbe', lv: 1, s0: 0 }))).toContain('+10 % dégâts');
    expect(cardText(card({ kind: 'w', key: 'orbe', lv: 1 }))).toContain('Tire sur'); // nouvelle arme : sa règle d'abord
    expect(cardLines(card({ kind: 'w', key: 'orbe', lv: 4, n: 3, s0: 0, s1: 2, s2: 4 }))).toEqual([
      '+10 % dégâts',
      '+1 projectile',
      '+1 perforation',
    ]);
    expect(cardLines(card({ kind: 'w', key: 'orbe', lv: 2, n: 1, s0: 1 }))).toEqual(['−5 % de recharge']);
    expect(cardTitle(card({ kind: 't', key: 'degats' }))).toBe('Tome des dégâts');
    expect(cardLines(card({ kind: 't', key: 'vitalite', n: 2, s0: 0, s1: 1 }))).toEqual([
      '+12 PV max',
      '+0,4 PV par seconde',
    ]);
    expect(cardLines(card({ kind: 't', key: 'chance', s0: 0 }))).toEqual(['+0,5 chance']);
    expect(cardLines(card({ kind: 't', key: 'projectiles', s0: 0 }))).toEqual(['+1 projectile pour toutes les armes']);
    expect(cardTitle(card({ kind: 'heal', key: '', lv: 0, n: 0, s0: -1 }))).toBe('Soin');
    expect(cardText(card({ kind: 'heal', key: '', lv: 0, n: 0, s0: -1 }))).toContain('PV');
    expect(rarityName(1)).toBe('Commune');
    expect(rarityName(3)).toBe('Épique');
  });
  it('résumés d’armes : pluriels et nombres à la française, suivent les stats courantes', () => {
    setLang('fr');
    const w = new World(1);
    expect(weaponSummary(w, 'orbe')).toContain('1 tir');
    expect(weaponSummary(w, 'aura')).toContain('2,2');
    expect(weaponSummary(w, 'boomerang')).toContain('1 boomerang');
    w.wmods.orbe[2] = 2;
    w.wmods.boomerang[3] = 1;
    refreshStats(w);
    expect(weaponSummary(w, 'orbe')).toContain('3 tirs');
    expect(weaponSummary(w, 'boomerang')).toContain('2 boomerangs');
  });
  it('les mêmes en anglais', () => {
    setLang('en');
    const w = new World(1);
    expect(weaponSummary(w, 'orbe')).toContain('1 shot');
    expect(weaponSummary(w, 'aura')).toContain('2.2');
    expect(cardLines(card({ kind: 'w', key: 'orbe', s0: 0 }))).toEqual(['+10 % damage']);
    expect(cardTitle(card({ kind: 'heal', key: '', lv: 0, n: 0, s0: -1 }))).toBe('Heal');
    expect(cardTitle(card({ kind: 't', key: 'savoir' }))).toBe('Tome of Lore');
    expect(achText(ACHIEVEMENTS.find((a) => a.id === 'kills2000')!)).toContain('2,000');
    setLang('fr');
    expect(achText(ACHIEVEMENTS.find((a) => a.id === 'kills2000')!)).toContain('2\u202f000');
  });
  it('tout le contenu a un libellé non vide dans les deux langues, chaque ligne de stat comprise', () => {
    for (const lang of ['fr', 'en'] as const) {
      setLang(lang);
      const w = new World(1);
      for (const k of WEAPON_KEYS) {
        expect(weaponName(k).length, k).toBeGreaterThan(2);
        expect(weaponSummary(w, k).length, k).toBeGreaterThan(8);
        for (const l of WEAPON_LINES[k]) {
          const txt = lineText('w', l);
          expect(txt.length, `${k} ${l.stat}`).toBeGreaterThan(4);
          expect(txt, `${k} ${l.stat}`).not.toContain('line.');
        }
      }
      for (const k of TOME_KEYS) {
        expect(tomeName(k).length, k).toBeGreaterThan(2);
        expect(tomeText(k).length, k).toBeGreaterThan(5);
        for (const l of TOMES[k]) {
          const txt = lineText('t', l);
          expect(txt, `${k} ${l.stat}`).not.toContain('line.');
          expect(txt.length).toBeGreaterThan(4);
        }
      }
      for (let i = 0; i < ENEMIES.length; i++) expect(enemyName(i).length).toBeGreaterThan(2);
      for (const c of CHARACTERS) {
        expect(characterName(c.key).length).toBeGreaterThan(2);
        expect(characterText(c.key).length).toBeGreaterThan(5);
        expect(characterTrait(c.key).length > 8 || c.key === 'eclaireuse', c.key).toBe(true);
      }
      for (const k of ITEM_KEYS) {
        expect(itemName(k).length, k).toBeGreaterThan(2);
        expect(itemText(k).length, k).toBeGreaterThan(5);
      }
      for (let i = 0; i < SYNERGIES.length; i++) {
        expect(synergyName(i).length).toBeGreaterThan(2);
        expect(synergyText(i)).toContain('+');
      }
      for (const a of ACHIEVEMENTS) {
        expect(achName(a).length, a.id).toBeGreaterThan(2);
        expect(achText(a).length, a.id).toBeGreaterThan(5);
        if (a.unlocks) expect(achUnlock(a).length, a.id).toBeGreaterThan(2);
      }
    }
    setLang('fr');
  });
});
