// Cibles d'équilibrage (survivor-design §9) pour le bot « average », en deux profils (phase 17) :
// « naked » = emplacements de départ (1 arme, 2 tomes), « maxed » = tous les emplacements débloqués.
// La boutique par personnage n'existe plus : la puissance d'un run vient des objets (coffres, marchand) et des synergies.
import { SLOTS } from '../src/sim/balance';

/** Prix de référence de l'économie : le 2e emplacement d'arme, premier achat d'un nouveau joueur. */
export const REF_PRICE = SLOTS.find((s) => s.kind === 'weapon' && s.n === 2)?.price ?? 300;
export interface Target {
  name: string;
  min: number;
  max: number;
  get: (s: any) => number;
  fmt?: (v: number) => string;
}
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const economy: Target = {
  name: 'or gardé p50 ≥ 0,5 emplacement n°2', // après les achats au marchand : l'emplacement n°2 (300) en ≤ 2 runs
  min: 0.5,
  max: 1e9,
  get: (s) => s.goldP50 / REF_PRICE,
  fmt: (v) => '×' + v.toFixed(1),
};
export const NAKED: Target[] = [
  { name: 'survie p50 4–6 min', min: 240, max: 360, get: (s) => s.survival.p50, fmt: mmss }, // 1 arme, 2 tomes
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
    name: 'synergie ≥ 50 % des runs', // phase 17 : la synergie est un objectif de build atteignable
    min: 50,
    max: 100,
    get: (s) => s.synergyRunPct,
    fmt: (v) => v.toFixed(0) + ' %',
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
