// Phase 38 : classement en ligne (module pur) et règles Firestore qui le protègent.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOARD,
  bestOf,
  cleanPseudo,
  isoWeek,
  mergeScore,
  readScore,
  stageOfBest,
  suggestPseudo,
  timeOfBest,
} from './board';
import { DEFAULT_META, normalizeMeta } from './save';
import { PROGRESS_KEYS } from './sync';

describe('pseudo', () => {
  it('garde lettres (tous alphabets), chiffres, espace, - et _ ; 2 à 16 caractères', () => {
    expect(cleanPseudo('  Jimmy  ')).toBe('Jimmy');
    expect(cleanPseudo('Élodie_92')).toBe('Élodie_92');
    expect(cleanPseudo('<b>hack</b>')).toBe('bhackb');
    expect(cleanPseudo('a    b')).toBe('a b');
    expect(cleanPseudo('x')).toBe('');
    expect(cleanPseudo('😀😀')).toBe('');
    expect(cleanPseudo('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnop');
    expect(cleanPseudo(42)).toBe('');
  });
  it('proposé à partir du prénom du compte, sinon de l’e-mail', () => {
    expect(suggestPseudo('Jimmy Haggege', 'x@y.z')).toBe('Jimmy');
    expect(suggestPseudo(null, 'jimmy.h@gmail.com')).toBe('jimmy h');
    expect(suggestPseudo(null, null)).toBe('');
  });
  it('fait partie de la progression synchronisée, nettoyé à la lecture', () => {
    expect(PROGRESS_KEYS).toContain('pseudo');
    expect(DEFAULT_META.pseudo).toBe('');
    expect(normalizeMeta({ version: 4, pseudo: ' <Zoé> ' }).pseudo).toBe('Zoé');
    expect(normalizeMeta({ version: 4, pseudo: 12 }).pseudo).toBe('');
  });
});

describe('scores', () => {
  it('meilleure partie : le monde d’abord, puis le temps', () => {
    expect(bestOf(3, 1450)).toBeGreaterThan(bestOf(2, 7000));
    expect(bestOf(2, 900)).toBeGreaterThan(bestOf(2, 600));
    expect(stageOfBest(bestOf(3, 1450))).toBe(3);
    expect(timeOfBest(bestOf(3, 1450))).toBe(1450);
    expect(bestOf(9, 99999)).toBe(BOARD.stageMax * BOARD.stageMul + BOARD.timeMax); // borné comme les règles
  });
  it('fusion : chaque champ garde son meilleur, le pseudo suit, rien à écrire si rien ne change', () => {
    const a = mergeScore(null, { stage: 2, time: 900, kills: 1200, char: 'eclaireuse' }, 'Jim', 1)!;
    expect(a).toEqual({ name: 'Jim', char: 'eclaireuse', best: bestOf(2, 900), time: 900, kills: 1200, at: 1 });
    // moins bon partout : rien
    expect(mergeScore(a, { stage: 1, time: 300, kills: 100, char: 'brute' }, 'Jim', 2)).toBeNull();
    // plus de kills seulement : les autres champs restent
    const b = mergeScore(a, { stage: 1, time: 300, kills: 2000, char: 'brute' }, 'Jim', 3)!;
    expect(b).toEqual({ name: 'Jim', char: 'brute', best: a.best, time: 900, kills: 2000, at: 3 });
    // renommer seulement : écrit, scores inchangés
    const c = mergeScore(b, { stage: 1, time: 1, kills: 1, char: 'x' }, 'Jimmy', 4)!;
    expect(c.name).toBe('Jimmy');
    expect([c.best, c.time, c.kills, c.char]).toEqual([b.best, b.time, b.kills, 'brute']);
  });
  it('lecture d’un document du nuage : bornée, jamais crue', () => {
    expect(readScore({ name: 'Zoé', char: 'brute', best: 1e9, time: -5, kills: 3.7, at: 5 })).toEqual({
      name: 'Zoé',
      char: 'brute',
      best: 47200,
      time: 0,
      kills: 3,
      at: 5,
    });
    expect(readScore({ name: '' })).toBeNull();
    expect(readScore(null)).toBeNull();
  });
  it('semaine ISO (lundi → dimanche, UTC), y compris aux bords de l’année', () => {
    expect(isoWeek(Date.UTC(2026, 10, 9))).toBe('2026-W46'); // lundi 9 novembre 2026
    expect(isoWeek(Date.UTC(2026, 10, 15, 23, 59))).toBe('2026-W46'); // dimanche
    expect(isoWeek(Date.UTC(2026, 10, 16))).toBe('2026-W47');
    expect(isoWeek(Date.UTC(2021, 0, 1))).toBe('2020-W53');
    expect(isoWeek(Date.UTC(2024, 11, 30))).toBe('2025-W01');
    expect(isoWeek(Date.UTC(2026, 0, 1))).toBe('2026-W01');
  });
});

describe('firestore.rules (classement)', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  it('lecture réservée aux connectés, 100 lignes au plus, écriture du seul propriétaire', () => {
    for (const col of ['match /scores/{uid}', 'match /weeks/{week}/scores/{uid}']) {
      const block = rules.slice(rules.indexOf(col), rules.indexOf('\n    }', rules.indexOf(col)));
      expect(block, col).toContain('allow get: if request.auth != null');
      expect(block, col).toContain('request.query.limit <= 100');
      expect(block, col).toContain('scoreOk(uid)');
    }
    expect(rules).toContain('request.auth.uid == uid');
  });
  it('clés fermées et bornes identiques à BOARD ; un score ne peut que monter', () => {
    expect(rules).toContain("hasOnly(['name', 'char', 'best', 'time', 'kills', 'at'])");
    expect(rules).toContain(`d.name.size() >= ${BOARD.nameMin} && d.name.size() <= ${BOARD.nameMax}`);
    expect(rules).toContain(`d.best <= ${BOARD.stageMax * BOARD.stageMul + BOARD.timeMax}`);
    expect(rules).toContain(`d.time <= ${BOARD.timeMax}`);
    expect(rules).toContain(`d.kills <= ${BOARD.killsMax}`);
    expect(rules).toContain(
      'd.best >= resource.data.best && d.time >= resource.data.time && d.kills >= resource.data.kills',
    );
    expect(rules).toContain(`p().pseudo.size() <= ${BOARD.nameMax}`);
  });
});
