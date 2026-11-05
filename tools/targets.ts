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
  // phase 17 : ≤ 3 → ≤ 8 % ; un kit de départ concentre toutes ses lignes sur une arme et, s'il passe le Gardien, peut aller loin
  { name: 'fin atteinte ≤ 8 %', min: 0, max: 8, get: (s) => s.reachedEndPct, fmt: (v) => v.toFixed(0) + ' %' },
  { name: 'morts <3 min ≤ 20 %', min: 0, max: 20, get: (s) => s.deadBefore3minPct, fmt: (v) => v.toFixed(0) + ' %' },
  { name: 'passent 3 min ≥ 40 %', min: 40, max: 100, get: (s) => s.aliveCurve[2], fmt: (v) => v + ' %' }, // l'arme n°2 (succès « Première nuit ») reste atteignable
  economy,
  // phase 18 : difficulté lisse, pas de falaise (au plus 22 points perdus en une minute) ; on ouvre des coffres de carte
  { name: 'chute max ≤ 22 pts/min', min: 0, max: 22, get: (s) => s.maxDrop, fmt: (v) => v + ' pts' },
  { name: 'coffres de carte ≥ 1 / run', min: 1, max: 1e9, get: (s) => s.mapChestsPerRun, fmt: (v) => v.toFixed(1) },
];
export const MAXED: Target[] = [
  // phase 17 : 13–16 → 10–13 min et fin 3–12 → 1–12 % : la boutique (≈ +24 PV, dégâts ×1,17, recharge ×0,92, réanimation)
  // n'existe plus ; un kit complet ne gagne plus que par ses synergies. Mesuré sans rien changer d'autre : 5:45.
  { name: 'survie p50 10–13 min', min: 600, max: 780, get: (s) => s.survival.p50, fmt: mmss },
  { name: 'fin atteinte 1–12 %', min: 1, max: 12, get: (s) => s.reachedEndPct, fmt: (v) => v.toFixed(0) + ' %' },
  { name: 'morts <3 min < 10 %', min: 0, max: 10, get: (s) => s.deadBefore3minPct, fmt: (v) => v.toFixed(0) + ' %' },
  { name: 'kills@10 900–1600', min: 900, max: 1600, get: (s) => s.killsAt10p50 }, // phase 8 : spawn plus dense après 7:00
  // phase 17 : 24–32 → 32–42, les coffres ne donnent plus de cartes, les niveaux les portent toutes (XP ×0,45)
  { name: 'niveau@10 32–42', min: 32, max: 42, get: (s) => s.levelAt10p50 },
  // phase 17 : 15–30 → 8–30, quatre armes se partagent les cartes (le kit de départ, lui, en met ≈ 22 sur la sienne)
  { name: 'arme principale@10 niv 8–30', min: 8, max: 30, get: (s) => s.weaponLvAt10p50 },
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
  { name: 'chute max ≤ 22 pts/min', min: 0, max: 22, get: (s) => s.maxDrop, fmt: (v) => v + ' pts' }, // phase 18
  { name: 'coffres de carte ≥ 3 / run', min: 3, max: 1e9, get: (s) => s.mapChestsPerRun, fmt: (v) => v.toFixed(1) },
  { name: 'or dépensé ≥ 35 %', min: 35, max: 100, get: (s) => s.goldSpentPct, fmt: (v) => v + ' %' }, // phase 18 : l'or sert en partie
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
