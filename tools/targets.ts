// Cibles d'équilibrage (survivor-design §9) pour le bot « average », en deux profils (phase 8) :
// « naked » = aucun palier de boutique (le joueur doit sentir qu'il lui manque la boutique), « maxed » = tous les paliers.
import { SHOP } from '../src/sim/balance';

/** Or nécessaire pour tous les paliers de toutes les lignes (un personnage). */
export function shopTotalCost(): number {
  let total = 0;
  for (const l of SHOP.lines)
    for (let t = 0; t < l.tiers; t++) total += Math.round(SHOP.base * Math.pow(SHOP.growth, t));
  return total;
}
export interface Target {
  name: string;
  min: number;
  max: number;
  get: (s: any) => number;
  fmt?: (v: number) => string;
}
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const economy: Target = {
  name: 'or p50 ≥ 0,75 premier palier', // un run nu de 4 min ≈ 170 or : un palier (200) tous les 1–2 runs, l'arme n°2 (300) en 2 runs
  min: 0.75,
  max: 1e9,
  get: (s) => s.goldP50 / s.firstTierCost,
  fmt: (v) => '×' + v.toFixed(1),
};
export const NAKED: Target[] = [
  { name: 'survie p50 4–6 min', min: 240, max: 360, get: (s) => s.survival.p50, fmt: mmss }, // phase 10 : 1 arme, 2 améliorations, 0 palier
  { name: 'fin atteinte ≤ 3 %', min: 0, max: 3, get: (s) => s.reachedEndPct, fmt: (v) => v.toFixed(0) + ' %' },
  { name: 'morts <3 min ≤ 20 %', min: 0, max: 20, get: (s) => s.deadBefore3minPct, fmt: (v) => v.toFixed(0) + ' %' },
  { name: 'passent 3 min ≥ 40 %', min: 40, max: 100, get: (s) => s.aliveCurve[2], fmt: (v) => v + ' %' }, // l'arme n°2 (succès « Première nuit ») reste atteignable
  economy,
];
export const MAXED: Target[] = [
  { name: 'survie p50 13–16 min', min: 780, max: 960, get: (s) => s.survival.p50, fmt: mmss },
  { name: 'fin atteinte 3–12 %', min: 3, max: 12, get: (s) => s.reachedEndPct, fmt: (v) => v.toFixed(0) + ' %' },
  { name: 'morts <3 min < 10 %', min: 0, max: 10, get: (s) => s.deadBefore3minPct, fmt: (v) => v.toFixed(0) + ' %' },
  { name: 'kills@10 900–1600', min: 900, max: 1600, get: (s) => s.killsAt10p50 }, // phase 8 : spawn plus dense après 7:00
  { name: 'niveau@10 24–32', min: 24, max: 32, get: (s) => s.levelAt10p50 }, // phase 12 : courbe d'XP aplatie (16–20 avant)
  { name: 'arme principale@10 niv 15–30', min: 15, max: 30, get: (s) => s.weaponLvAt10p50 }, // phase 12 : la montée est longue, 100 jamais atteint
  {
    name: 'pick min ≥ 8 %',
    min: 8,
    max: 100,
    get: (s) => (Object.keys(s.pickPct).length ? Math.min(...Object.values<number>(s.pickPct)) : 100), // --weapons à une arme : rien à mesurer
    fmt: (v) => v + ' %',
  },
  {
    name: 'pick max ≤ 35 % (hors arme de départ)',
    min: 0,
    max: 35,
    get: (s) => (Object.keys(s.pickPct).length ? Math.max(...Object.values<number>(s.pickPct)) : 0),
    fmt: (v) => v + ' %',
  },
  {
    name: 'variance kills inter-builds < 3×',
    min: 0,
    max: 3,
    get: (s) => s.killsVarianceRatio ?? 1,
    fmt: (v) => '×' + v.toFixed(1),
  },
];
export const PROFILES = { naked: NAKED, maxed: MAXED };
export function checkTargets(summary: any, targets: Target[]) {
  return targets.map((t) => {
    const v = t.get(summary);
    return { name: t.name, value: t.fmt ? t.fmt(v) : String(v), ok: v >= t.min && v <= t.max };
  });
}
