// Lot L5 : apparence des paliers visuels d'arme. Le rendu teinte les couleurs d'instance d'une arme selon w.wtier (sim) ;
// ici, la couleur et la taille des projectiles de l'Orbe aux niveaux 24, 25, 50 et 100.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { STEP } from '../sim/balance';
import { step } from '../sim/step';
import { Mode } from '../sim/types';
import { World } from '../sim/world';
import { PAL } from './palette';
import { TIER_LOOK, TierTint, tierColor, tierHex, tierScale } from './tiers';

/** Monde dont l'Orbe arrive au niveau `lv` par une carte (le palier est noté par la sim). */
function orbeAt(lv: number): World {
  const w = new World(1);
  w.weapons.orbe = lv - 1;
  w.cards.length = 0;
  w.cards.push({ kind: 'w', key: 'orbe', lv, n: 1, s0: 0, s1: -1, s2: -1 });
  w.pending = 1;
  w.mode = Mode.LevelUp;
  step(w, { mx: 0, mz: 0, jump: false, spell: false, pick: 0 }, STEP);
  return w;
}

describe('lot L5 : apparence des paliers', () => {
  it('The three tiers have distinct appearances', () => {
    const halo = new THREE.Color(PAL.proj).multiplyScalar(0.7); // halo de l'Orbe (scene.ts)
    const out = new THREE.Color();
    const tiers = [24, 25, 50, 100].map((lv) => orbeAt(lv).wtier.orbe);
    expect(tiers).toEqual([0, 1, 2, 3]);
    // à tout instant du cycle du prisme, quatre couleurs différentes pour les quatre niveaux
    for (let now = 0; now < 12; now += 0.25) {
      const hex = tiers.map((t) => tierColor(out, halo, t, now).getHex());
      expect(new Set(hex).size, `t = ${now} s : ${hex.map((h) => h.toString(16))}`).toBe(4);
    }
    expect(tierColor(out, halo, 0, 3).getHex()).toBe(halo.getHex()); // sans palier, la couleur de l'arme
    // et les projectiles grandissent de 8 % par palier
    expect(tiers.map(tierScale)).toEqual([1, 1.08, 1.16, 1.24]);
  });

  it('the tier III prism turns slowly and spreads along a trail', () => {
    const base = new THREE.Color(PAL.proj);
    const a = tierHex(PAL.proj, 3, 0),
      b = tierHex(PAL.proj, 3, 0.5 / TIER_LOOK.prismSpeed); // une demi-roue plus tard
    expect(a).not.toBe(b);
    expect(tierHex(PAL.proj, 3, 1 / TIER_LOOK.prismSpeed)).toBe(a); // un tour complet
    const g0 = new TierTint(base, TIER_LOOK.mix, 0),
      g1 = new TierTint(base, TIER_LOOK.mix, TIER_LOOK.prismSpread);
    g0.update(3, 2);
    g1.update(3, 2);
    expect(g0.c.getHex()).not.toBe(g1.c.getHex()); // deux fantômes de la traînée, deux teintes
    // une couleur rendue par un modèle chargé (base remplacée) est relue à la mise à jour suivante
    g0.base = new THREE.Color(0xffffff);
    g0.update(0, 2);
    expect(g0.c.getHex()).toBe(0xffffff);
  });
});
