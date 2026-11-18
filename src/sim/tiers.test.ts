// Lot L5 : paliers visuels d'arme (docs/specs/l5-paliers-arme.md). Aux niveaux 25, 50 et 100, une arme change
// d'apparence et l'écran le célèbre ; la sim ne fait qu'émettre Ev.WeaponTier, une fois par palier et par partie, et
// aucune statistique ne bouge. Un test par scénario de la spec (titre anglais).
import { describe, expect, it } from 'vitest';
import { STEP, WEAPON_TIERS } from './balance';
import { restoreWorld, snapshotWorld, type RunSnap } from './snapshot';
import { startRun, step } from './step';
import { Ev, Mode } from './types';
import type { Input, WeaponKey } from './types';
import { WEAPON_KEYS, refreshStats } from './weapons/defs';
import { World } from './world';

const still: Input = { mx: 0, mz: 0, jump: false, spell: false, pick: -1 };
const pick0: Input = { ...still, pick: 0 };

/** Prend une carte d'arme qui mène `k` au niveau `lv` (ligne 0 : dégâts, sans plafond), comme un choix du joueur. */
function takeCard(w: World, k: WeaponKey, lv: number): void {
  w.cards.length = 0;
  w.cards.push({ kind: 'w', key: k, lv, n: 1, s0: 0, s1: -1, s2: -1 });
  w.pending = 1;
  w.mode = Mode.LevelUp;
  step(w, pick0, STEP);
}
/** Événements de palier du dernier pas : [palier, index de l'arme]. */
function tierEvents(w: World): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < w.eventCount; i++) {
    const e = w.events[i];
    if (e.type === Ev.WeaponTier) out.push([e.v, e.x2]);
  }
  return out;
}
/** Monde neuf dont l'arme `k` arrive au niveau `lv` par une carte (paliers franchis en chemin compris). */
function weaponAt(k: WeaponKey, lv: number, seed = 1): World {
  const w = new World(seed);
  w.weapons[k] = lv - 1;
  takeCard(w, k, lv);
  return w;
}

describe('lot L5 : paliers visuels d’arme', () => {
  it('A weapon crosses a visual tier', () => {
    expect(WEAPON_TIERS).toEqual([25, 50, 100]);
    const w = weaponAt('orbe', 24);
    expect(w.wtier.orbe).toBe(0);
    takeCard(w, 'orbe', 25);
    expect(w.weapons.orbe).toBe(25);
    expect(w.wtier.orbe).toBe(1); // son apparence change : le rendu lit w.wtier
    expect(tierEvents(w)).toEqual([[1, WEAPON_KEYS.indexOf('orbe')]]); // l'écran célèbre : main.ts écoute l'événement
    expect(w.mode).toBe(Mode.Play);
  });

  it('A tier changes no statistic', () => {
    // deux mondes identiques, l'arme au niveau 24 avec les mêmes lignes ; a franchit le palier par une carte, b reçoit
    // exactement la même ligne et le même niveau sans passer par le palier
    const a = weaponAt('orbe', 24, 7),
      b = weaponAt('orbe', 24, 7);
    takeCard(a, 'orbe', 25);
    b.cards.length = 0;
    b.wmods.orbe[0]++;
    b.weapons.orbe = 25;
    refreshStats(b);
    expect(a.wtier.orbe).toBe(1);
    expect(b.wtier.orbe).toBe(0);
    expect(a.wstats.orbe).toEqual(b.wstats.orbe); // dégâts, portée, cadence : ceux du niveau, palier ou non
    // et la partie qui suit est la même : mêmes coups, mêmes kills, même héros
    startRun(a);
    startRun(b);
    for (let f = 0; f < 1200; f++) {
      step(a, still, STEP);
      step(b, still, STEP);
    }
    expect(a.kills).toBe(b.kills);
    expect(a.player.hp).toBe(b.player.hp);
    expect(a.enemyCount).toBe(b.enemyCount);
    for (let i = 0; i < a.enemyCount; i++) expect(a.enemies[i].hp).toBe(b.enemies[i].hp);
  });

  it('Each tier is celebrated only once per run', () => {
    const w = weaponAt('lames', 24);
    takeCard(w, 'lames', 25);
    expect(tierEvents(w)).toHaveLength(1);
    takeCard(w, 'lames', 26);
    expect(tierEvents(w)).toHaveLength(0);
    // le palier suivant est célébré à son tour, une fois
    w.weapons.lames = 48;
    takeCard(w, 'lames', 49);
    expect(tierEvents(w)).toHaveLength(0);
    takeCard(w, 'lames', 50);
    expect(tierEvents(w)).toEqual([[2, WEAPON_KEYS.indexOf('lames')]]);
    takeCard(w, 'lames', 51);
    expect(tierEvents(w)).toHaveLength(0);
    expect(w.wtier.lames).toBe(2);
  });

  it('The three tiers have distinct appearances', () => {
    // côté sim : quatre niveaux, quatre paliers (les couleurs sont vérifiées dans src/render/tiers.test.ts)
    const seen = [24, 25, 50, 100].map((lv) => weaponAt('orbe', lv).wtier.orbe);
    expect(seen).toEqual([0, 1, 2, 3]);
  });

  it('A resumed run keeps its tiers', () => {
    const w = weaponAt('orbe', 49);
    takeCard(w, 'orbe', 50);
    expect(w.wtier.orbe).toBe(2);
    const text = JSON.stringify(snapshotWorld(w));
    const back = restoreWorld(JSON.parse(text) as RunSnap);
    expect(back.wtier.orbe).toBe(2); // apparence du palier II dès la reprise
    expect(back.eventCount).toBe(0); // sans nouvelle célébration
    takeCard(back, 'orbe', 51);
    expect(tierEvents(back)).toHaveLength(0);
    // une partie gardée par une version d'avant les paliers : les paliers atteints sont retrouvés en silence
    const old = JSON.parse(text) as RunSnap;
    delete old.fields.wtier;
    const before = restoreWorld(old);
    expect(before.wtier.orbe).toBe(2);
    expect(before.eventCount).toBe(0);
    takeCard(before, 'orbe', 51);
    expect(tierEvents(before)).toHaveLength(0);
  });
});
