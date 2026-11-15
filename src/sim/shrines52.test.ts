// Phase 52 (demande de Jimmy) : toutes les stats du jeu se trouvent dans les sanctuaires, celles des tomes comprises.
import { describe, expect, it } from 'vitest';
import {
  BASTION,
  BOON,
  BOON_KEYS,
  BOON_MAX,
  BOON_OWN_TEXT,
  BOON_STAT,
  CRIT,
  DIFFICULTY,
  It,
  SHRINE,
  TOMES,
  TOME_KEYS,
} from './balance';
import { applyBoon, boonApply, boonCapped, chills, rollBoonChoices } from './poi';
import { restoreWorld, snapshotWorld, type RunSnap } from './snapshot';
import { startRun } from './step';
import { Spell, Trait } from './types';
import type { BoonKey, Card, Player, TomeKey } from './types';
import { applyTomeLine } from './weapons/defs';
import { World } from './world';

const NEW = BOON_KEYS.slice(BOON_OWN_TEXT);
/** Tome et ligne qui portent une stat. */
function lineOf(stat: string): { tome: TomeKey; i: number } {
  for (const tome of TOME_KEYS) {
    const i = TOMES[tome].findIndex((l) => l.stat === stat);
    if (i >= 0) return { tome, i };
  }
  throw new Error(`aucune ligne de tome pour « ${stat} »`);
}
const fresh = (seed = 3): World => {
  const w = new World(seed);
  startRun(w);
  return w;
};
/** Les champs numériques du joueur qui diffèrent entre deux mondes. */
const diff = (a: Player, b: Player): string[] =>
  (Object.keys(a) as (keyof Player)[]).filter((k) => typeof a[k] === 'number' && a[k] !== b[k]) as string[];

describe('sanctuaires : toutes les stats du jeu', () => {
  it('garde-fou : toute stat d’une ligne de tome a son bonus de sanctuaire', () => {
    const covered = new Set<string>(BOON_KEYS.map((k) => BOON_STAT[k] ?? k));
    const missing = new Set<string>();
    for (const tome of TOME_KEYS) for (const l of TOMES[tome]) if (!covered.has(l.stat)) missing.add(l.stat);
    expect([...missing], 'stats de tome sans sanctuaire : ajouter la clé à BoonKey, BOON_KEYS et BOON').toEqual([]);
    expect(NEW).toHaveLength(20);
    expect(BOON_KEYS).toHaveLength(38);
    expect(new Set(BOON_KEYS).size).toBe(38);
  });

  it('chaque nouveau bonus fait exactement ce que fait une ligne de tome de la même stat', () => {
    for (const key of NEW) {
      const { tome, i } = lineOf(BOON_STAT[key] ?? key);
      expect(BOON[key], key).toBe(TOMES[tome][i].step);
      const a = fresh(),
        b = fresh();
      applyTomeLine(a, tome, i);
      boonApply(b.player, key);
      expect(diff(a.player, b.player), key).toEqual([]);
      expect(diff(a.player, fresh().player).length, `${key} change une stat`).toBeGreaterThan(0);
    }
  });

  it('« +1 projectile » : il agit sur toutes les armes, deux prises au plus, puis il n’est plus proposé', () => {
    const w = fresh();
    expect(w.player.projAdd).toBe(0);
    applyBoon(w, 'proj');
    expect(w.player.projAdd).toBe(1);
    expect(boonCapped(w, 'proj')).toBe(false);
    applyBoon(w, 'proj');
    expect(w.player.projAdd).toBe(BOON_MAX.proj);
    expect(boonCapped(w, 'proj')).toBe(true);
    const out: Card[] = [];
    for (let k = 0; k < 300; k++) {
      rollBoonChoices(w, out);
      expect(out.map((c) => c.key)).not.toContain('proj');
    }
  });

  it('« +1 projectile » est rare : tiré environ trois fois moins qu’un bonus courant', () => {
    const w = fresh(9);
    const seen = new Map<string, number>();
    const out: Card[] = [];
    for (let k = 0; k < 6000; k++) {
      rollBoonChoices(w, out);
      expect(out).toHaveLength(SHRINE.offers);
      expect(new Set(out.map((c) => c.key)).size).toBe(SHRINE.offers); // toujours des choix distincts
      for (const c of out) seen.set(c.key, (seen.get(c.key) ?? 0) + 1);
    }
    const ratio = seen.get('proj')! / seen.get('kb')!;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.45);
    // tous les bonus proposables sortent (les quatre à condition restent dehors au départ)
    const GATED = ['difficulty', 'stealcap', 'chilldmg', 'slowdur'];
    for (const k of BOON_KEYS) {
      if (GATED.includes(k)) expect(seen.has(k), k).toBe(false);
      else expect(seen.get(k) ?? 0, k).toBeGreaterThan(0);
    }
  });

  it('plafonds de stat : la garde et le prix du marchand ne dépassent pas ceux du tome', () => {
    const w = fresh();
    for (let k = 0; k < 20; k++) if (!boonCapped(w, 'guard')) applyBoon(w, 'guard');
    expect(w.player.guard).toBeCloseTo(BASTION.guardMax, 9);
    expect(boonCapped(w, 'guard')).toBe(true);
    for (let k = 0; k < 40; k++) if (!boonCapped(w, 'shop')) applyBoon(w, 'shop');
    expect(w.player.shopMul).toBeCloseTo(CRIT.shopMin, 9);
    expect(boonCapped(w, 'shop')).toBe(true);
  });

  it('bornes de prises : un bonus borné n’est plus proposé une fois pris BOON_MAX fois', () => {
    for (const key of Object.keys(BOON_MAX) as BoonKey[]) {
      const w = fresh();
      w.player.steal = 0.02; // la réserve de soin demande un soin
      w.player.slowChance = 0.06; // les bonus du givre demandent de quoi ralentir
      for (let k = 0; k < BOON_MAX[key]!; k++) {
        expect(boonCapped(w, key), `${key} avant la borne`).toBe(false);
        applyBoon(w, key);
      }
      expect(boonCapped(w, key), key).toBe(true);
    }
  });

  it('difficulté : proposée seulement après un crâne activé, comme le tome de difficulté', () => {
    const w = fresh();
    expect(boonCapped(w, 'difficulty')).toBe(true);
    w.skullsOn = DIFFICULTY.tomeAfterSkulls;
    expect(boonCapped(w, 'difficulty')).toBe(false);
    const d = w.player.difficulty;
    applyBoon(w, 'difficulty');
    expect(w.player.difficulty).toBeCloseTo(d + BOON.difficulty, 9);
    expect(boonCapped(w, 'difficulty')).toBe(false); // sans plafond, comme le reste de la difficulté (phase 50)
  });

  it('réserve de soin : proposée seulement si un soin y puise déjà', () => {
    const w = fresh();
    expect(boonCapped(w, 'stealcap')).toBe(true);
    applyBoon(w, 'steal');
    expect(boonCapped(w, 'stealcap')).toBe(false);
  });

  it('givre : dégâts aux ennemis ralentis et durée des ralentissements seulement si le héros ralentit quelque chose', () => {
    const w = fresh();
    expect(chills(w)).toBe(false); // Éclaireuse, Orbe, Bond : rien ne ralentit ni n'étourdit
    expect(boonCapped(w, 'chilldmg')).toBe(true);
    expect(boonCapped(w, 'slowdur')).toBe(true);
    expect(boonCapped(w, 'slowchance')).toBe(false); // la source, elle, est toujours proposée
    applyBoon(w, 'slowchance');
    expect(boonCapped(w, 'chilldmg')).toBe(false);
    expect(boonCapped(w, 'slowdur')).toBe(false);
    // une autre source suffit pour les dégâts (sort, arme, objet, passif), pas pour la durée : elle ne règle que
    // les ralentissements du Givre et du Halo
    for (const set of [
      (v: World) => void (v.spell = Spell.Voile),
      (v: World) => void (v.trait = Trait.DejaMorte),
      (v: World) => void (v.weapons.vitriol = 1),
      (v: World) => void (v.items[It.Corne] = 1),
      (v: World) => void (v.items[It.Cloche] = 1),
    ]) {
      const v = fresh();
      set(v);
      expect(chills(v)).toBe(true);
      expect(boonCapped(v, 'chilldmg')).toBe(false);
      expect(boonCapped(v, 'slowdur')).toBe(true);
    }
  });

  it('boonApply ne touche que le joueur donné : la carte « actuel → nouveau » travaille sur une copie', () => {
    const w = fresh();
    const q = { ...w.player };
    for (const key of NEW) boonApply(q, key);
    expect(diff(w.player, fresh().player)).toEqual([]);
    expect(q.projAdd).toBe(1);
    expect(w.boons.every((n) => n === 0)).toBe(true);
  });

  it('partie gardée d’avant la 1.55 (18 bonus) : reprise sans perte, les nouveaux à zéro', () => {
    const w = fresh();
    applyBoon(w, 'hp');
    applyBoon(w, 'xp');
    const s = JSON.parse(JSON.stringify(snapshotWorld(w))) as RunSnap;
    const saved = s.fields.boons as { $ta: string; d: number[] };
    expect(saved.d).toHaveLength(38);
    saved.d.length = BOON_OWN_TEXT; // la sauvegarde d'une version à 18 bonus
    const b = restoreWorld(s);
    expect(b.boons).toHaveLength(38);
    expect(b.boons[BOON_KEYS.indexOf('hp')]).toBe(1);
    expect(b.boons[BOON_KEYS.indexOf('xp')]).toBe(1);
    expect(Array.from(b.boons.slice(BOON_OWN_TEXT)).every((n) => n === 0)).toBe(true);
    applyBoon(b, 'proj');
    expect(b.boons[BOON_KEYS.indexOf('proj')]).toBe(1);
  });
});
