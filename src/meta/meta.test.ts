// Méta (phase 4) : migration v1 → v2, export/import, succès, boutique, défi du jour. Aucun DOM : tout est pur.
import { describe, expect, it } from 'vitest';
import { MAX_PASSIVES, MAX_WEAPONS, OUTFIT, SHOP, SLOTS } from '../sim/balance';
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
import {
  buy,
  buyCharacter,
  buyOutfit,
  buySlot,
  characterPrice,
  nextSlot,
  outfitOf,
  shopCost,
  shopTiers,
  slotState,
  worldOptions,
} from './shop';

const fresh = () => normalizeMeta(DEFAULT_META);

describe('sauvegarde', () => {
  it('migre une méta v1 ou v2 (phase 10) : progression remise à zéro, son et réglages conservés, bannière à montrer', () => {
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
    expect(m.version).toBe(3);
    expect(m.bestTime).toBe(0);
    expect(m.runs).toBe(0);
    expect(m.muted).toBe(true);
    expect(m.reducedFx).toBe(true);
    expect(m.stats.kills).toBe(0);
    expect(m.gold).toBe(0);
    expect(m.shops).toEqual({});
    expect(m.slots).toEqual({ weapons: 1, passives: 2 });
    expect(m.seenReset).toBe(false); // elle avait du vécu : on prévient
    const v2 = normalizeMeta({
      version: 3,
      gold: 1234,
      achievements: ['survie3'],
      bought: ['veilleuse'],
      settings: { lang: 'en', quality: 'pixel', hudScale: 1.2 },
    });
    expect(v2.gold).toBe(1234); // une v3 n'est pas touchée
    const old = normalizeMeta({ ...v2, version: 2 });
    expect(old.gold).toBe(0);
    expect(old.achievements).toEqual([]);
    expect(old.bought).toEqual([]);
    expect(old.settings.lang).toBe('en');
    expect(old.settings.quality).toBe('pixel');
    expect(old.settings.hudScale).toBe(1.2);
    expect(old.seenReset).toBe(false);
    expect(normalizeMeta({ version: 2 }).seenReset).toBe(true); // sauvegarde vierge : rien à annoncer
    expect(importMeta(exportMeta(old))!.version).toBe(3);
  });
  it('borne et nettoie un import douteux (paliers trop hauts, personnage inconnu, valeurs non numériques)', () => {
    const m = normalizeMeta({
      version: 3,
      gold: '12',
      shop: [99, -3, 'x'],
      character: 'dragon',
      achievements: ['survie3', 42],
      settings: { hudScale: 7, lang: 'xx' },
    });
    expect(m.gold).toBe(0);
    // ancienne boutique globale (≤ 1.2.0) : migrée sur l'Éclaireuse, bornée
    expect(shopTiers(m, 'eclaireuse')[0]).toBe(SHOP.lines[0].tiers);
    expect(shopTiers(m, 'eclaireuse')[1]).toBe(0);
    expect(shopTiers(m, 'eclaireuse')[2]).toBe(0);
    expect(m.shops.bucheron).toBeUndefined();
    expect(m.character).toBe('eclaireuse');
    expect(m.achievements).toEqual(['survie3']);
    expect(m.settings.hudScale).toBe(1);
    expect(m.settings.lang).toBe('auto');
  });
  it('réglage de rendu (phase 9) : auto par défaut, net et pixel conservés, valeur inconnue → auto', () => {
    const m = fresh();
    expect(m.settings.quality).toBe('auto');
    m.settings.quality = 'pixel';
    expect(importMeta(exportMeta(m))!.settings.quality).toBe('pixel');
    expect(normalizeMeta({ version: 3, settings: { quality: 'ultra' } }).settings.quality).toBe('auto');
    expect(normalizeMeta({ version: 3, settings: { quality: 'net' } }).settings.quality).toBe('net');
  });
  it('réglage de langue : auto par défaut, fr et en conservés à l’export/import', () => {
    expect(fresh().settings.lang).toBe('auto');
    const m = fresh();
    m.settings.lang = 'en';
    expect(importMeta(exportMeta(m))!.settings.lang).toBe('en');
    expect(normalizeMeta({ version: 3, settings: { lang: 'fr' } }).settings.lang).toBe('fr');
  });
  it('export puis import : aller-retour sans perte, et refus d’un JSON étranger', () => {
    const m = fresh();
    m.gold = 333;
    m.bestTime = 777;
    m.shops.eclaireuse = SHOP.lines.map((_, i) => (i === 1 ? 2 : 0));
    m.achievements.push('survie3');
    const back = importMeta(exportMeta(m));
    expect(back).not.toBeNull();
    expect(back!.gold).toBe(333);
    expect(back!.bestTime).toBe(777);
    expect(shopTiers(back!, 'eclaireuse')[1]).toBe(2);
    expect(back!.achievements).toEqual(['survie3']);
    expect(importMeta('pas du json')).toBeNull();
    expect(importMeta('{"hello":"world"}')).toBeNull();
    expect(importMeta('[1,2,3]')).toBeNull();
  });
});

describe('succès', () => {
  it('14 succès, identifiants uniques, « survie3 » débloque le défi du jour au premier run de 3 min', () => {
    expect(ACHIEVEMENTS.length).toBe(14);
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
  it('coûts géométriques, achat bloqué sans or, palier max respecté, boutique par personnage', () => {
    expect(shopCost(0, 0)).toBe(200);
    expect(shopCost(0, 1)).toBe(260);
    expect(shopCost(0, SHOP.lines[0].tiers)).toBe(Infinity);
    const m = fresh();
    expect(buy(m, 'eclaireuse', 0)).toBe(false);
    m.gold = 300;
    expect(buy(m, 'eclaireuse', 0)).toBe(true);
    expect(m.gold).toBe(100);
    expect(shopTiers(m, 'eclaireuse')[0]).toBe(1);
    expect(shopTiers(m, 'bucheron')[0]).toBe(0); // chaque personnage a sa boutique
    expect(buy(m, 'eclaireuse', 0)).toBe(false); // 260 > 100
    m.gold = 300;
    expect(buy(m, 'bucheron', 0)).toBe(true); // le Bûcheron paie le premier palier plein tarif
    expect(m.gold).toBe(100);
    expect(shopTiers(m, 'eclaireuse')[0]).toBe(1);
    expect(shopTiers(m, 'bucheron')[0]).toBe(1);
    const revive = SHOP.lines.findIndex((l) => l.key === 'revive');
    m.gold = 10000;
    expect(buy(m, 'eclaireuse', revive)).toBe(true);
    expect(buy(m, 'eclaireuse', revive)).toBe(false); // 1 palier max
    const back = importMeta(exportMeta(m))!;
    expect(shopTiers(back, 'bucheron')[0]).toBe(1);
    expect(shopTiers(back, 'sorciere')).toEqual(SHOP.lines.map(() => 0));
  });
  it('les options de monde reflètent la méta, sauf en défi du jour (égalité)', () => {
    const m = fresh();
    m.character = 'bucheron';
    m.gold = 1e6;
    buy(m, 'bucheron', 0);
    buy(m, 'bucheron', 0);
    buy(m, 'bucheron', 0);
    buy(m, 'eclaireuse', 1);
    const o = worldOptions(m, ['orbe', 'lames']);
    expect(o.character).toBe('bucheron');
    expect(o.upgrades![0]).toBe(3); // les paliers du Bûcheron, pas ceux de l'Éclaireuse
    expect(o.upgrades![1]).toBe(0);
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

describe('personnages (phase 6)', () => {
  it('achat en or : débité une fois, refusé sans or ou déjà possédé, visible dans les personnages jouables', () => {
    const m = fresh();
    expect(unlockedCharacters(m)).toEqual(['eclaireuse']);
    expect(characterPrice('veilleuse')).toBeGreaterThan(0);
    expect(characterPrice('bucheron')).toBe(0); // par succès seulement
    expect(buyCharacter(m, 'veilleuse')).toBe(false);
    m.gold = characterPrice('veilleuse') + 5;
    expect(buyCharacter(m, 'veilleuse')).toBe(true);
    expect(m.gold).toBe(5);
    expect(buyCharacter(m, 'veilleuse')).toBe(false);
    expect(buyCharacter(m, 'bucheron')).toBe(false);
    expect(unlockedCharacters(m)).toEqual(['eclaireuse', 'veilleuse']);
    const back = importMeta(exportMeta(m))!;
    expect(back.bought).toEqual(['veilleuse']);
    expect(normalizeMeta({ version: 3, bought: ['dragon', 'eclaireuse', 'sapeur'] }).bought).toEqual(['sapeur']);
  });
  it('les défis sont des succès sur un seul run : Intouchable débloque le Feu follet, « il te manquait » ignore les défis', () => {
    const m = fresh();
    m.stats.noHitBest = 240;
    m.stats.bestTime = 100;
    const fresh2 = checkAchievements(m);
    expect(fresh2.map((a) => a.id)).toContain('intouchable');
    expect(unlockedCharacters(m)).toContain('feufollet');
    expect(missingTime(m, 100)!.a.id).toBe('survie3');
    m.achievements.push('survie3', 'survie10', 'survie15', 'survie20');
    expect(missingTime(m, 100)).toBeNull();
  });
});

describe('tenues (phase 7)', () => {
  it('achat en or : débité une fois, refusé sans or, choisie aussitôt, bascule libre ensuite, survit à l’export', () => {
    const m = fresh();
    expect(outfitOf(m, 'eclaireuse')).toBe(0);
    expect(buyOutfit(m, 'eclaireuse')).toBe(false);
    m.gold = OUTFIT.price + 1;
    expect(buyOutfit(m, 'eclaireuse')).toBe(true);
    expect(m.gold).toBe(1);
    expect(outfitOf(m, 'eclaireuse')).toBe(1);
    expect(buyOutfit(m, 'eclaireuse')).toBe(false);
    m.outfit.eclaireuse = 0;
    expect(outfitOf(m, 'eclaireuse')).toBe(0);
    m.outfit.sorciere = 1; // choisie sans être achetée : ignorée
    expect(outfitOf(m, 'sorciere')).toBe(0);
    const back = importMeta(exportMeta(m))!;
    expect(back.outfits).toEqual(['eclaireuse']);
    expect(back.outfit).toEqual({ sorciere: 1 }); // 0 n'est pas stocké
  });
  it('normalisation : clés inconnues et valeurs autres que 1 écartées', () => {
    const n = normalizeMeta({
      version: 3,
      outfits: ['dragon', 'sapeur'],
      outfit: { sapeur: 1, dragon: 1, veilleuse: 7 },
    });
    expect(n.outfits).toEqual(['sapeur']);
    expect(n.outfit).toEqual({ sapeur: 1 });
    expect(outfitOf(n, 'sapeur')).toBe(1);
  });
});

describe('emplacements (phase 10)', () => {
  it('départ 1 arme / 2 améliorations ; déblocage dans l’ordre, par succès puis or ; défi du jour au maximum', () => {
    const m = fresh();
    expect(m.slots).toEqual({ weapons: 1, passives: 2 });
    expect(worldOptions(m, ['orbe']).slots).toEqual({ weapons: 1, passives: 2 });
    expect(worldOptions(m, ['orbe'], true).slots).toEqual({ weapons: MAX_WEAPONS, passives: MAX_PASSIVES });
    expect(nextSlot(m)).toBe(0);
    expect(slotState(m, 0)).toBe('locked'); // arme 2 : succès « Première nuit » manquant
    expect(buySlot(m, 0)).toBe(false);
    m.achievements.push(SLOTS[0].ach);
    expect(slotState(m, 0)).toBe('poor');
    m.gold = SLOTS[0].price;
    expect(slotState(m, 0)).toBe('buyable');
    expect(slotState(m, 2)).toBe('later'); // arme 3 : il faut d'abord l'arme 2
    expect(buySlot(m, 0)).toBe(true);
    expect(m.gold).toBe(0);
    expect(m.slots.weapons).toBe(2);
    expect(slotState(m, 0)).toBe('owned');
    expect(buySlot(m, 0)).toBe(false);
    expect(nextSlot(m)).toBe(1);
    // import borné : jamais sous le départ ni au-dessus du maximum
    expect(normalizeMeta({ version: 3, slots: { weapons: 9, passives: 0 } }).slots).toEqual({
      weapons: 4,
      passives: 2,
    });
    const back = importMeta(exportMeta(m))!;
    expect(back.slots.weapons).toBe(2);
  });
});
