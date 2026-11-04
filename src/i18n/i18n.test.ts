// Cohérence des deux dictionnaires et des clés dérivées du contenu (armes, passifs, ennemis, personnages,
// boutique, succès) : une clé oubliée casse ici, pas chez le joueur.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import fr from './fr.json';
import en from './en.json';
import { fmtNum, fmtTime, getLang, has, ordinal, resolveLang, setLang, t } from './index';
import { ACHIEVEMENTS } from '../meta/achievements';
import { CHARACTERS, ENEMIES, SHOP, TOMES, TOME_KEYS, WEAPON_LINES } from '../sim/balance';
import { WEAPON_KEYS } from '../sim/weapons/defs';

const FR = fr as Record<string, string>;
const EN = en as Record<string, string>;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionnaires', () => {
  it('fr et en ont exactement les mêmes clés', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(FR).sort());
  });
  it('chaque clé a les mêmes paramètres {x} dans les deux langues', () => {
    for (const k of Object.keys(FR)) expect(placeholders(EN[k]), k).toEqual(placeholders(FR[k]));
  });
  it('chaque forme _one a sa forme _other', () => {
    for (const k of Object.keys(FR)) {
      if (k.endsWith('_one')) expect(FR, k).toHaveProperty(k.replace(/_one$/, '_other'));
      if (k.endsWith('_other')) expect(FR, k).toHaveProperty(k.replace(/_other$/, '_one'));
    }
  });
  it('aucune valeur vide', () => {
    for (const k of Object.keys(FR)) {
      expect(FR[k].length, k).toBeGreaterThan(0);
      expect(EN[k].length, k).toBeGreaterThan(0);
    }
  });
});

describe('clés dérivées du contenu', () => {
  const need: string[] = [];
  for (const k of WEAPON_KEYS) {
    need.push(`weapon.${k}.name`, `weapon.${k}.text`);
    for (const l of WEAPON_LINES[k]) need.push(`line.w.${l.stat}`);
  }
  for (const k of TOME_KEYS) {
    need.push(`tome.${k}.name`, `tome.${k}.text`);
    for (const l of TOMES[k]) need.push(`line.t.${l.stat}`);
  }
  for (const c of CHARACTERS) {
    need.push(`char.${c.key}.name`, `char.${c.key}.text`);
    if (c.key !== 'eclaireuse') need.push(`char.${c.key}.trait`);
  }
  for (const l of SHOP.lines) need.push(`shop.${l.key}.name`, `shop.${l.key}.text`);
  for (const a of ACHIEVEMENTS) {
    need.push(`ach.${a.id}.name`, `ach.${a.id}.text`);
    if (a.unlocks) need.push(`ach.${a.id}.unlock`);
  }
  for (const e of ENEMIES) need.push(`enemy.${e.key}`);
  need.push('banner.boss.default');
  it.each(need)('%s existe', (k) => {
    expect(FR).toHaveProperty(k);
  });
  it('chaque arme a un gabarit de description (simple ou au pluriel)', () => {
    for (const k of WEAPON_KEYS) expect(has(`weapon.${k}.text`) || has(`weapon.${k}.text_one`), k).toBe(true);
  });
  it('toutes les clés data-i18n de index.html existent', () => {
    const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
    const keys = new Set<string>();
    for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g))
      for (const pair of m[1].split(';')) keys.add(pair.split(':')[1]);
    for (const k of keys) expect(FR, k).toHaveProperty(k);
  });
});

describe('t, pluriel, formats', () => {
  it('résout la langue', () => {
    expect(resolveLang('auto', 'fr-CA')).toBe('fr');
    expect(resolveLang('auto', 'en-US')).toBe('en');
    expect(resolveLang('auto', 'de')).toBe('en');
    expect(resolveLang('auto', undefined)).toBe('en');
    expect(resolveLang('fr', 'en-US')).toBe('fr');
    expect(resolveLang('en', 'fr-FR')).toBe('en');
  });
  it('français : 0 et 1 au singulier, nombres à la française', () => {
    setLang('fr');
    expect(getLang()).toBe('fr');
    expect(t('runs', { n: 0 })).toBe('0 run');
    expect(t('runs', { n: 1 })).toBe('1 run');
    expect(t('runs', { n: 2 })).toBe('2 runs');
    expect(fmtNum(2.2)).toBe('2,2');
    expect(fmtNum(2000)).toBe('2 000');
    expect(ordinal(1)).toBe('1er');
    expect(ordinal(2)).toBe('2e');
    expect(t('weapon.orbe.stats', { n: 2, dmg: 15, pierce: 1 })).toBe('2 tirs, 15 dégâts, transperce 1');
    expect(t('weapon.orbe.stats', { n: 1, dmg: 10, pierce: 1 })).toBe('1 tir, 10 dégâts, transperce 1');
  });
  it('anglais : 1 seul au singulier, nombres à l’anglaise', () => {
    setLang('en');
    expect(t('runs', { n: 0 })).toBe('0 runs');
    expect(t('runs', { n: 1 })).toBe('1 run');
    expect(fmtNum(2.2)).toBe('2.2');
    expect(fmtNum(2000)).toBe('2,000');
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(22)).toBe('22nd');
    setLang('fr');
  });
  it('clé inconnue : retourne la clé ; paramètre manquant : laissé tel quel', () => {
    expect(t('nope.nope')).toBe('nope.nope');
    expect(t('levelup.title')).toBe('Niveau {n}');
  });
  it('fmtTime', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(185.7)).toBe('3:05');
    expect(fmtTime(1200)).toBe('20:00');
  });
});
