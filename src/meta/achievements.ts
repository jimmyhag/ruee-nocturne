// Succès à barre de progression (PLAN §2.4) : liste déclarative sur les compteurs cumulés de Meta.stats.
// Chaque succès peut débloquer un personnage, une arme ou le défi du jour.
import type { CharacterKey, WeaponKey } from '../sim/types';
import type { Meta, MetaStats } from './save';

export interface Achievement {
  id: string;
  name: string;
  text: string; // ce qu'il faut faire
  goal: number;
  get: (s: MetaStats) => number;
  fmt?: (v: number) => string; // affichage de la valeur (temps…)
  unlocks?: { character?: CharacterKey; weapon?: WeaponKey; daily?: boolean };
  unlockText?: string; // « Débloque : … »
}
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export const ACHIEVEMENTS: Achievement[] = [
  // le premier déblocage arrive au 1er ou 2e run (porte de phase 4 : < 3 runs)
  {
    id: 'survie3',
    name: 'Première nuit',
    text: 'Survis 3 minutes',
    goal: 180,
    get: (s) => s.bestTime,
    fmt: mmss,
    unlocks: { daily: true },
    unlockText: 'Défi du jour',
  },
  {
    id: 'kills500',
    name: 'Faucheuse en herbe',
    text: 'Vaincs 500 ennemis en tout',
    goal: 500,
    get: (s) => s.kills,
    unlocks: { character: 'sorciere' },
    unlockText: 'Vieille sorcière',
  },
  {
    id: 'dards100',
    name: 'Chasse aux Dards',
    text: 'Vaincs 100 Dards en tout',
    goal: 100,
    get: (s) => s.dards,
    unlocks: { weapon: 'boomerang' },
    unlockText: 'Boomerang',
  },
  {
    id: 'elites10',
    name: 'Chercheuse d’or',
    text: 'Vaincs 10 élites en tout',
    goal: 10,
    get: (s) => s.elites,
    unlocks: { weapon: 'mines' },
    unlockText: 'Mines',
  },
  { id: 'boss1', name: 'Gardienne tombée', text: 'Vaincs un boss', goal: 1, get: (s) => s.bosses },
  {
    id: 'survie10',
    name: 'Dix minutes',
    text: 'Survis 10 minutes',
    goal: 600,
    get: (s) => s.bestTime,
    fmt: mmss,
    unlocks: { character: 'bucheron' },
    unlockText: 'Bûcheron',
  },
  { id: 'evo1', name: 'Métamorphose', text: 'Obtiens une évolution d’arme', goal: 1, get: (s) => s.evolutions },
  { id: 'kills2000', name: 'Marée', text: 'Vaincs 2 000 ennemis en tout', goal: 2000, get: (s) => s.kills },
  { id: 'survie15', name: 'Quart d’heure', text: 'Survis 15 minutes', goal: 900, get: (s) => s.bestTime, fmt: mmss },
  {
    id: 'survie20',
    name: 'Face au Faucheur',
    text: 'Survis 20 minutes',
    goal: 1200,
    get: (s) => s.bestTime,
    fmt: mmss,
  },
  { id: 'win', name: 'Aube', text: 'Vaincs le Faucheur', goal: 1, get: (s) => s.wins },
];

/** Progression [0,1] d'un succès. */
export function progress(a: Achievement, m: Meta): number {
  return Math.max(0, Math.min(1, a.get(m.stats) / a.goal));
}

/** Succès nouvellement atteints (ajoutés à m.achievements). Retourne la liste des nouveaux. */
export function checkAchievements(m: Meta): Achievement[] {
  const fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (m.achievements.includes(a.id)) continue;
    if (a.get(m.stats) >= a.goal) {
      m.achievements.push(a.id);
      fresh.push(a);
    }
  }
  return fresh;
}

/** Les n succès non atteints les plus proches (écran de mort). */
export function closest(m: Meta, n: number): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !m.achievements.includes(a.id))
    .sort((a, b) => progress(b, m) - progress(a, m))
    .slice(0, n);
}

/** « Il te manquait 42 s pour… » : prochain succès de temps non atteint par rapport au temps du run. */
export function missingTime(m: Meta, runTime: number): { seconds: number; a: Achievement } | null {
  for (const a of ACHIEVEMENTS) {
    if (a.fmt !== mmss || m.achievements.includes(a.id)) continue;
    if (runTime < a.goal) return { seconds: Math.ceil(a.goal - runTime), a };
  }
  return null;
}

export function unlockedCharacters(m: Meta): CharacterKey[] {
  const out: CharacterKey[] = ['eclaireuse'];
  for (const a of ACHIEVEMENTS)
    if (a.unlocks?.character && m.achievements.includes(a.id)) out.push(a.unlocks.character);
  return out;
}
/** Armes proposables : celles qui ne dépendent d'aucun succès, plus celles débloquées. */
export function unlockedWeapons(m: Meta): WeaponKey[] {
  const locked = new Set<WeaponKey>();
  for (const a of ACHIEVEMENTS) if (a.unlocks?.weapon && !m.achievements.includes(a.id)) locked.add(a.unlocks.weapon);
  return (['orbe', 'aura', 'lames', 'foudre', 'boomerang', 'mines'] as WeaponKey[]).filter((k) => !locked.has(k));
}
export function dailyUnlocked(m: Meta): boolean {
  return ACHIEVEMENTS.some((a) => a.unlocks?.daily && m.achievements.includes(a.id));
}
