// Bibliothèque (phase 40) : déblocage par succès puis achat à l'or, retrait du tirage, migration des anciennes
// sauvegardes, compteurs, et objets bannis réellement absents des tirages de la sim.
import { describe, expect, it } from 'vitest';
import { ITEM_KEYS, ITEM_RARITY, UNLOCK } from '../sim/balance';
import { rollItemChoices } from '../sim/items';
import type { Card, ItemKey } from '../sim/types';
import { World } from '../sim/world';
import { ACHIEVEMENTS, UNLOCKABLE, checkAchievements, unlockedWeapons } from './achievements';
import {
  activeItems,
  bannedItems,
  buyUnlock,
  entryState,
  mandatory,
  recordCodex,
  toggleItem,
  unlockPrice,
} from './library';
import { DEFAULT_META, normalizeMeta } from './save';
import { worldOptions } from './shop';
import { withProgress } from './sync';

const fresh = () => normalizeMeta(DEFAULT_META);
const LOCKED_ITEMS = ACHIEVEMENTS.filter((a) => a.unlocks?.item).map((a) => a.unlocks!.item!);

describe('Bibliothèque (phase 40)', () => {
  it('22 objets verrouillés pour un nouveau joueur (phase 47 B : dix de plus), chacun derrière un succès distinct ; 26 au départ', () => {
    expect(LOCKED_ITEMS.length).toBe(22);
    expect(new Set(LOCKED_ITEMS).size).toBe(22);
    const m = fresh();
    expect(bannedItems(m).sort()).toEqual([...LOCKED_ITEMS].sort());
    expect(activeItems(m)).toBe(ITEM_KEYS.length - 22);
    expect(activeItems(m)).toBe(26);
    for (const k of LOCKED_ITEMS) expect(entryState(m, 'i', k)).toBe('locked');
    expect(entryState(m, 'i', 'lanterne')).toBe('owned');
    expect(unlockedWeapons(m)).toEqual(['orbe', 'aura', 'lames', 'foudre']);
  });

  it('succès puis achat : verrouillé → trop cher → achetable → possédé, une seule fois', () => {
    const m = fresh();
    expect(buyUnlock(m, 'i', 'phenix')).toBe(false); // succès manquant
    m.stats.bosses = 5;
    expect(checkAchievements(m).map((a) => a.id)).toContain('boss5');
    expect(entryState(m, 'i', 'phenix')).toBe('poor');
    expect(unlockPrice('i', 'phenix')).toBe(UNLOCK.item[2]); // épique
    m.gold = UNLOCK.item[2] + 7;
    expect(entryState(m, 'i', 'phenix')).toBe('buyable');
    expect(buyUnlock(m, 'i', 'phenix')).toBe(true);
    expect(m.gold).toBe(7);
    expect(entryState(m, 'i', 'phenix')).toBe('owned');
    expect(bannedItems(m)).not.toContain('phenix');
    m.gold = 1e6;
    expect(buyUnlock(m, 'i', 'phenix')).toBe(false); // déjà possédé
    expect(m.gold).toBe(1e6);
    expect(buyUnlock(m, 'i', 'lanterne')).toBe(false); // disponible d'office : rien à acheter
    expect(unlockPrice('w', 'faux')).toBe(UNLOCK.weapon);
  });

  it('retirer du tirage : seulement un rare ou un épique possédé ; les communs restent toujours (retour de Jimmy)', () => {
    const m = fresh();
    expect(toggleItem(m, 'phenix')).toBe(false); // verrouillé
    expect(toggleItem(m, 'lanterne')).toBe(false); // commun : obligatoire
    expect(mandatory('lanterne')).toBe(true);
    const owned = ITEM_KEYS.filter((k) => entryState(m, 'i', k) === 'owned');
    let off = 0;
    for (const k of owned) if (toggleItem(m, k)) off++;
    const commons = owned.filter((k) => ITEM_RARITY[ITEM_KEYS.indexOf(k)] === 0).length;
    expect(commons).toBe(20); // phase 47 B : six communs de plus
    expect(off).toBe(owned.length - commons);
    expect(activeItems(m)).toBe(commons);
    const back = m.itemsOff[0];
    expect(toggleItem(m, back)).toBe(true);
    expect(m.itemsOff).not.toContain(back);
  });

  it('options de monde : objets bannis transmis ; le défi du jour garde tout', () => {
    const m = fresh();
    m.itemsOff.push('cape');
    expect(worldOptions(m, unlockedWeapons(m)).bannedItems).toContain('cape');
    expect(worldOptions(m, unlockedWeapons(m)).bannedItems).toContain('phenix');
    expect(worldOptions(m, unlockedWeapons(m), true).bannedItems).toBeUndefined();
  });

  it('un monde ne propose jamais un objet banni, ni en coffre ni chez le marchand', () => {
    const banned = ITEM_KEYS.slice(0, 20) as ItemKey[];
    const w = new World(77, { bannedItems: banned });
    const out: Card[] = [];
    for (let k = 0; k < 300; k++) {
      rollItemChoices(w, 3, k % 2 === 0, out);
      for (const c of out) expect(banned).not.toContain(c.key);
    }
  });

  it('migration : une sauvegarde d’avant la phase 40 qui a joué garde tout ; une vierge part verrouillée', () => {
    const old = { ...JSON.parse(JSON.stringify(DEFAULT_META)), version: 4, runs: 3, achievements: ['glisse1000'] };
    delete old.unlocks;
    const m = normalizeMeta(old);
    expect(m.version).toBe(5);
    expect(bannedItems(m)).toEqual([]);
    expect(unlockedWeapons(m)).toContain('faux'); // succès déjà obtenu : l'arme reste acquise
    expect(unlockedWeapons(m)).not.toContain('lance'); // succès pas encore obtenu : il faudra l'acheter
    expect(normalizeMeta(m).unlocks).toEqual(m.unlocks); // une seule fois : la v5 ne re-migre pas
    const blank = normalizeMeta({ version: 4, runs: 0 });
    expect(bannedItems(blank).length).toBe(22);
  });

  it('migration aussi pour une progression venue d’un ancien client par le compte', () => {
    const local = fresh();
    const cloud = { ...JSON.parse(JSON.stringify(DEFAULT_META)), version: 4, runs: 8 };
    delete cloud.unlocks;
    expect(bannedItems(withProgress(local, cloud))).toEqual([]);
    const cloudV5 = { ...JSON.parse(JSON.stringify(DEFAULT_META)), runs: 8 };
    expect(bannedItems(withProgress(local, cloudV5)).length).toBe(22); // déjà v5 : rien d'accordé
  });

  it('normalisation : clés inconnues filtrées, doublons retirés, compteurs bornés', () => {
    const m = normalizeMeta({
      version: 5,
      unlocks: ['i:phenix', 'i:dragon', 'w:orbe', 'w:faux', 12, 'i:phenix'],
      itemsOff: ['cape', 'cape', 'lanterne', 'dragon', 3],
      codex: { 'w:orbe': 4.7, 'i:croc': -2, 'x:y': 9, 'i:BAD': 1, 't:degats': 1e12 },
    });
    expect(m.unlocks).toEqual(['i:phenix', 'w:faux']);
    expect(m.itemsOff).toEqual(['cape']); // un commun ne peut pas être retiré
    expect(m.codex).toEqual({ 'w:orbe': 4, 't:degats': UNLOCK.codexMax });
    expect([...UNLOCKABLE.keys()].length).toBe(27); // 22 objets + 5 armes (limite Firestore : 64)
  });

  it('compteurs : une partie de plus pour chaque arme, objet, tome et synergie du monde final', () => {
    const m = fresh();
    const w = new World(3);
    w.weapons = { orbe: 3, foudre: 1 };
    w.tomes = { cadence: 2 };
    w.items[ITEM_KEYS.indexOf('croc')] = 2;
    w.syn[0] = 1; // Orage
    recordCodex(m, w);
    recordCodex(m, w);
    expect(m.codex).toEqual({ 'w:orbe': 2, 'w:foudre': 2, 't:cadence': 2, 'i:croc': 2, 's:orage': 2 });
  });
});
