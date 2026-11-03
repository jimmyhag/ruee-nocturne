// Méta (phase 4) : migration v1 → v2, export/import, succès, boutique, défi du jour. Aucun DOM : tout est pur.
import { describe, expect, it } from 'vitest';
import { SHOP } from '../sim/balance';
import {
  ACHIEVEMENTS,
  checkAchievements,
  closest,
  dailyUnlocked,
  missingTime,
  unlockedCharacters,
  unlockedWeapons,
} from './achievements';
import { dailyBest, dailySeed, recordDaily, todayKey } from './daily';
import { DEFAULT_META, exportMeta, importMeta, normalizeMeta } from './save';
import { buy, shopCost, worldOptions } from './shop';

const fresh = () => normalizeMeta(DEFAULT_META);

describe('sauvegarde', () => {
  it('migre une méta v1 : record, runs, kills et réglages conservés, compteurs initialisés', () => {
    const v1 = {
      version: 1,
      bestTime: 421,
      bestKills: 900,
      runs: 7,
      totalKills: 3100,
      muted: true,
      reducedFx: true,
      fxChosen: true,
    };
    const m = normalizeMeta(v1);
    expect(m.version).toBe(2);
    expect(m.bestTime).toBe(421);
    expect(m.runs).toBe(7);
    expect(m.muted).toBe(true);
    expect(m.stats.kills).toBe(3100);
    expect(m.stats.bestTime).toBe(421);
    expect(m.gold).toBe(0);
    expect(m.shop).toEqual(SHOP.lines.map(() => 0));
    expect(m.character).toBe('eclaireuse');
  });
  it('borne et nettoie un import douteux (paliers trop hauts, personnage inconnu, valeurs non numériques)', () => {
    const m = normalizeMeta({
      version: 2,
      gold: '12',
      shop: [99, -3, 'x'],
      character: 'dragon',
      achievements: ['survie3', 42],
      settings: { hudScale: 7, lang: 'xx' },
    });
    expect(m.gold).toBe(0);
    expect(m.shop[0]).toBe(SHOP.lines[0].tiers);
    expect(m.shop[1]).toBe(0);
    expect(m.shop[2]).toBe(0);
    expect(m.character).toBe('eclaireuse');
    expect(m.achievements).toEqual(['survie3']);
    expect(m.settings.hudScale).toBe(1);
    expect(m.settings.lang).toBe('auto');
  });
  it('réglage de langue : auto par défaut, fr et en conservés à l’export/import', () => {
    expect(fresh().settings.lang).toBe('auto');
    const m = fresh();
    m.settings.lang = 'en';
    expect(importMeta(exportMeta(m))!.settings.lang).toBe('en');
    expect(normalizeMeta({ version: 2, settings: { lang: 'fr' } }).settings.lang).toBe('fr');
  });
  it('export puis import : aller-retour sans perte, et refus d’un JSON étranger', () => {
    const m = fresh();
    m.gold = 333;
    m.bestTime = 777;
    m.shop[1] = 2;
    m.achievements.push('survie3');
    const back = importMeta(exportMeta(m));
    expect(back).not.toBeNull();
    expect(back!.gold).toBe(333);
    expect(back!.bestTime).toBe(777);
    expect(back!.shop[1]).toBe(2);
    expect(back!.achievements).toEqual(['survie3']);
    expect(importMeta('pas du json')).toBeNull();
    expect(importMeta('{"hello":"world"}')).toBeNull();
    expect(importMeta('[1,2,3]')).toBeNull();
  });
});

describe('succès', () => {
  it('11 succès, identifiants uniques, « survie3 » débloque le défi du jour au premier run de 3 min', () => {
    expect(ACHIEVEMENTS.length).toBe(11);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const m = fresh();
    expect(dailyUnlocked(m)).toBe(false);
    m.stats.bestTime = 185;
    const got = checkAchievements(m);
    expect(got.map((a) => a.id)).toEqual(['survie3']);
    expect(dailyUnlocked(m)).toBe(true);
    expect(checkAchievements(m)).toEqual([]); // pas deux fois
  });
  it('déblocages : Bûcheron à 10 min, Sorcière à 500 kills, Boomerang à 100 Dards, Mines à 10 élites', () => {
    const m = fresh();
    expect(unlockedCharacters(m)).toEqual(['eclaireuse']);
    expect(unlockedWeapons(m)).toEqual(['orbe', 'aura', 'lames', 'foudre']);
    m.stats.bestTime = 600;
    m.stats.kills = 500;
    m.stats.dards = 100;
    checkAchievements(m);
    expect(unlockedCharacters(m)).toEqual(['eclaireuse', 'sorciere', 'bucheron']);
    expect(unlockedWeapons(m)).toEqual(['orbe', 'aura', 'lames', 'foudre', 'boomerang']);
    m.stats.elites = 10;
    checkAchievements(m);
    expect(unlockedWeapons(m)).toContain('mines');
  });
  it('les plus proches et « il te manquait … »', () => {
    const m = fresh();
    m.stats.kills = 450;
    m.stats.dards = 10;
    const c = closest(m, 3);
    expect(c[0].id).toBe('kills500'); // 90 %
    const miss = missingTime(m, 150);
    expect(miss?.a.id).toBe('survie3');
    expect(miss?.seconds).toBe(30);
    m.achievements.push('survie3');
    expect(missingTime(m, 500)?.a.id).toBe('survie10');
  });
});

describe('boutique', () => {
  it('coûts géométriques, achat bloqué sans or, palier max respecté', () => {
    expect(shopCost(0, 0)).toBe(40);
    expect(shopCost(0, 1)).toBe(64);
    expect(shopCost(0, SHOP.lines[0].tiers)).toBe(Infinity);
    const m = fresh();
    expect(buy(m, 0)).toBe(false);
    m.gold = 100;
    expect(buy(m, 0)).toBe(true);
    expect(m.gold).toBe(60);
    expect(m.shop[0]).toBe(1);
    expect(buy(m, 0)).toBe(false); // 64 > 60
    const revive = SHOP.lines.findIndex((l) => l.key === 'revive');
    m.gold = 10000;
    expect(buy(m, revive)).toBe(true);
    expect(buy(m, revive)).toBe(true);
    expect(buy(m, revive)).toBe(false); // 2 paliers max
  });
  it('les options de monde reflètent la méta, sauf en défi du jour (égalité)', () => {
    const m = fresh();
    m.character = 'bucheron';
    m.shop[0] = 3;
    const o = worldOptions(m, ['orbe', 'lames']);
    expect(o.character).toBe('bucheron');
    expect(o.upgrades![0]).toBe(3);
    expect(o.unlocked).toEqual(['orbe', 'lames']);
    const d = worldOptions(m, ['orbe'], true);
    expect(d.character).toBe('eclaireuse');
    expect(d.unlocked).toBeUndefined(); // toutes les armes : même run pour tous
    expect(d.upgrades!.every((t) => t === 0)).toBe(true);
  });
});

describe('défi du jour', () => {
  it('même date ⇒ même seed, dates différentes ⇒ seeds différentes (presque toujours)', () => {
    expect(dailySeed('2026-11-03')).toBe(dailySeed('2026-11-03'));
    expect(dailySeed('2026-11-03')).not.toBe(dailySeed('2026-11-04'));
    expect(todayKey(new Date('2026-11-03T23:59:00Z'))).toBe('2026-11-03');
  });
  it('classement local : 10 meilleurs temps, remis à zéro quand la date change', () => {
    const m = fresh();
    for (let i = 1; i <= 12; i++) recordDaily(m, i * 10, '2026-11-03');
    expect(m.daily.times.length).toBe(10);
    expect(dailyBest(m, '2026-11-03')).toBe(120);
    expect(recordDaily(m, 500, '2026-11-03')).toBe(1);
    expect(recordDaily(m, 5, '2026-11-04')).toBe(1);
    expect(m.daily.times).toEqual([5]);
    expect(dailyBest(m, '2026-11-05')).toBe(0);
  });
});
