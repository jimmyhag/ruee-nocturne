// Libellés du contenu dans les deux langues : titres et textes de cartes, gabarits d'armes (pluriels, nombres).
import { describe, expect, it } from 'vitest';
import { setLang } from '../i18n';
import { ACHIEVEMENTS } from '../meta/achievements';
import { CHARACTERS, ENEMIES, SHOP, WEAPON_MAX } from '../sim/balance';
import { EVOLUTIONS, PASSIVE_KEYS, WEAPON_KEYS } from '../sim/weapons/defs';
import type { WeaponKey } from '../sim/types';
import {
  achName,
  achText,
  achUnlock,
  cardText,
  cardTitle,
  characterName,
  characterText,
  enemyName,
  evolutionName,
  evolutionText,
  passiveName,
  shopName,
  shopText,
  weaponName,
  weaponText,
} from './cards';

describe('cartes', () => {
  it('titres et textes pour chaque sorte de carte (FR)', () => {
    setLang('fr');
    expect(cardTitle({ kind: 'w', key: 'orbe', lv: 1 })).toBe('Orbe filante');
    expect(cardText({ kind: 'w', key: 'foudre', lv: 2 })).toContain('ennemis');
    expect(cardTitle({ kind: 's', key: 'force', lv: 1 })).toBe('Gants lourds');
    expect(cardText({ kind: 's', key: 'force', lv: 1 })).toContain('%');
    expect(cardTitle({ kind: 'e', key: 'orbe', lv: 0 })).toBe('Nova');
    expect(cardText({ kind: 'e', key: 'orbe', lv: 0 })).toContain('8 orbes');
    expect(cardTitle({ kind: 'heal', key: '', lv: 0 })).toBe('Soin complet');
    expect(cardText({ kind: 'heal', key: '', lv: 0 })).toContain('PV');
  });
  it('gabarits d’armes : pluriels et nombres à la française', () => {
    setLang('fr');
    expect(weaponText('orbe', 4)).toContain('transperce');
    expect(weaponText('orbe', 3)).toContain('2 tirs');
    expect(weaponText('orbe', 1)).toContain('1 tir vers');
    expect(weaponText('aura', 1)).toContain('2,2');
    expect(weaponText('boomerang', 1)).toContain('Un boomerang part');
    expect(weaponText('boomerang', 5)).toContain('Deux boomerangs partent');
    expect(weaponText('mines', 5)).toContain('explosent en chaîne');
    expect(weaponText('mines', 1)).not.toContain('chaîne');
  });
  it('les mêmes en anglais', () => {
    setLang('en');
    expect(weaponText('orbe', 4)).toContain('pierces');
    expect(weaponText('orbe', 3)).toContain('2 shots');
    expect(weaponText('orbe', 1)).toContain('1 shot at');
    expect(weaponText('aura', 1)).toContain('2.2');
    expect(weaponText('boomerang', 5)).toContain('Two boomerangs');
    expect(cardTitle({ kind: 'heal', key: '', lv: 0 })).toBe('Full heal');
    expect(cardTitle({ kind: 'e', key: 'aura', lv: 0 })).toBe('Black Sun');
    expect(achText(ACHIEVEMENTS.find((a) => a.id === 'kills2000')!)).toContain('2,000');
    setLang('fr');
    expect(achText(ACHIEVEMENTS.find((a) => a.id === 'kills2000')!)).toContain('2 000');
  });
  it('tout le contenu a un libellé non vide dans les deux langues, à tous les niveaux', () => {
    for (const lang of ['fr', 'en'] as const) {
      setLang(lang);
      for (const k of WEAPON_KEYS) {
        expect(weaponName(k).length, k).toBeGreaterThan(2);
        for (let lv = 1; lv <= WEAPON_MAX; lv++) expect(weaponText(k, lv).length, `${k} lv${lv}`).toBeGreaterThan(10);
      }
      for (const k of Object.keys(EVOLUTIONS) as WeaponKey[]) {
        expect(evolutionName(k)).not.toBe('Évolution');
        expect(evolutionText(k).length, k).toBeGreaterThan(5);
      }
      expect(evolutionName('mines')).toBe(lang === 'fr' ? 'Évolution' : 'Evolution');
      for (const k of PASSIVE_KEYS) expect(passiveName(k).length, k).toBeGreaterThan(2);
      for (let i = 0; i < ENEMIES.length; i++) expect(enemyName(i).length).toBeGreaterThan(2);
      for (const c of CHARACTERS) {
        expect(characterName(c.key).length).toBeGreaterThan(2);
        expect(characterText(c.key).length).toBeGreaterThan(5);
      }
      for (let i = 0; i < SHOP.lines.length; i++) {
        expect(shopName(i).length).toBeGreaterThan(2);
        expect(shopText(i).length).toBeGreaterThan(5);
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
