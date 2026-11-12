// Défis par personnage (phase 41) : compteurs de la sim, stats par personnage, défis qui tombent pour le bon
// personnage, or versé une fois, tenue de maître réservée au défi III.
import { describe, expect, it } from 'vitest';
import { CHAR_CHALLENGE, CHARACTERS, ENEMIES } from '../sim/balance';
import { hitEnemy } from '../sim/combat';
import { spawnEnemy } from '../sim/spawner';
import { HitSrc, HIT_CRIT } from '../sim/types';
import { World } from '../sim/world';
import { ACHIEVEMENTS, CHAR_CHALLENGES, checkAchievements, closest, progress } from './achievements';
import { addCharRun, emptyCharStats, normalizeChars, runCharStats } from './chars';
import { DEFAULT_META, normalizeMeta } from './save';
import { outfitOf } from './shop';

const fresh = () => normalizeMeta(DEFAULT_META);

describe('défis par personnage (phase 41)', () => {
  it('3 défis par personnage : I et II rapportent de l’or, III la tenue de maître ; le III est la victoire', () => {
    for (const c of CHARACTERS) {
      const mine = CHAR_CHALLENGES.filter((a) => a.char === c.key);
      expect(mine.map((a) => a.tier)).toEqual([1, 2, 3]);
      expect(mine[0].unlocks?.gold).toBe(CHAR_CHALLENGE.gold[0]);
      expect(mine[1].unlocks?.gold).toBe(CHAR_CHALLENGE.gold[1]);
      expect(mine[2].unlocks?.outfit).toBe(c.key);
      expect(mine[2].kind).toBe('win');
    }
  });

  it('au plus 32 sources de coup (phase 47 C : 20) : le drapeau critique HIT_CRIT du rendu en dépend', () => {
    expect(HitSrc.Count).toBe(21); // phase 50 : Toxine
    expect(HitSrc.Count).toBeLessThanOrEqual(HIT_CRIT);
    expect(HIT_CRIT & (HIT_CRIT - 1)).toBe(0); // puissance de deux : le masque des sources est HIT_CRIT − 1
  });
  it('la sim compte les ennemis tués par source, en l’air, les élites et les boss', () => {
    const w = new World(5);
    const kill = (type: number, src: HitSrc, elite = false) => {
      const i = spawnEnemy(w, type, 0, 5);
      w.enemies[i].elite = elite;
      expect(hitEnemy(w, i, 1e9, 0, 0, 0, src)).toBe(true);
    };
    kill(0, HitSrc.Lames);
    kill(0, HitSrc.Lames, true);
    kill(0, HitSrc.Fire);
    w.player.onGround = false;
    kill(0, HitSrc.Spell);
    w.player.onGround = true;
    const boss = ENEMIES.findIndex((e) => e.boss);
    kill(boss, HitSrc.Orbe);
    expect(w.srcKills[HitSrc.Lames]).toBe(2);
    expect(w.srcKills[HitSrc.Fire]).toBe(1);
    expect(w.srcKills[HitSrc.Spell]).toBe(1);
    expect(w.airKills).toBe(1);
    expect(w.eliteKills).toBe(1);
    expect(w.bossKills).toBe(1);
    const run = runCharStats('bucheron', w, false);
    expect(run.sig).toBe(2); // le Bûcheron part avec les Lames
    expect(run.fire).toBe(1);
    expect(run.air).toBe(1);
    expect(run.stage).toBe(1);
    expect(runCharStats('bucheron', w, true).stage).toBe(4);
  });

  it('meilleures valeurs par partie, cumul des parties et victoires ; un défi ne tombe que pour son personnage', () => {
    const m = fresh();
    const run = { ...emptyCharStats(), runs: 1, sig: 650, noHit: 100 };
    addCharRun(m.chars, 'eclaireuse', run); // l'Éclaireuse fait 650 à l'Orbe : son défi I (500) tombe, pas celui du Bûcheron
    const gold = m.gold;
    const got = checkAchievements(m).map((a) => a.id);
    expect(got).toContain('c_eclaireuse_1');
    expect(got).not.toContain('c_bucheron_1');
    expect(m.gold).toBe(gold + CHAR_CHALLENGE.gold[0]);
    expect(checkAchievements(m)).toEqual([]); // or versé une seule fois
    expect(m.gold).toBe(gold + CHAR_CHALLENGE.gold[0]);
    addCharRun(m.chars, 'eclaireuse', { ...emptyCharStats(), runs: 1, sig: 200, wins: 1 });
    expect(m.chars.eclaireuse).toMatchObject({ runs: 2, wins: 1, sig: 650, noHit: 100 });
    const third = ACHIEVEMENTS.find((a) => a.id === 'c_eclaireuse_3')!;
    expect(progress(third, m)).toBe(1);
  });

  it('écran de fin : les défis proposés sont ceux du personnage joué, jamais ceux des autres', () => {
    const m = fresh();
    for (const a of closest(m, 50, 'sapeur')) expect(!a.char || a.char === 'sapeur').toBe(true);
    expect(closest(m, 50).every((a) => !a.char)).toBe(true);
  });

  it('tenue de maître : refusée sans le défi III, choisie avec', () => {
    const m = fresh();
    m.outfit.bucheron = 2;
    expect(outfitOf(m, 'bucheron')).toBe(0);
    m.achievements.push('c_bucheron_3');
    expect(outfitOf(m, 'bucheron')).toBe(2);
    expect(normalizeMeta(m).outfit.bucheron).toBe(2);
    expect(normalizeMeta({ ...m, outfit: { bucheron: 3 } }).outfit.bucheron).toBeUndefined();
  });

  it('normalisation : personnages connus, entiers positifs bornés, monde ≤ 4 ; absent = vide', () => {
    expect(fresh().chars).toEqual({});
    const c = normalizeChars({ dragon: { runs: 3 }, sapeur: { runs: 2.7, sig: -4, stage: 9, bosses: 'x' } });
    expect(Object.keys(c)).toEqual(['sapeur']);
    expect(c.sapeur).toMatchObject({ runs: 2, sig: 0, stage: 4, bosses: 0 });
  });
});
