// Succès à barre de progression (PLAN §2.4) : liste déclarative sur les compteurs cumulés de Meta.stats.
// Chaque succès peut débloquer un personnage, une arme ou le défi du jour.
import type { CharacterKey, WeaponKey } from '../sim/types';
import type { Meta, MetaStats } from './save';

// Noms, textes et « débloque … » : src/i18n (clés ach.<id>.name / .text / .unlock), via src/ui/cards.ts.
export interface Achievement {
  id: string;
  goal: number;
  get: (s: MetaStats) => number;
  time?: true; // succès de durée : valeur affichée en m:ss
  unlocks?: { character?: CharacterKey; weapon?: WeaponKey; daily?: boolean };
}

export const ACHIEVEMENTS: Achievement[] = [
  // le premier déblocage arrive au 1er ou 2e run (porte de phase 4 : < 3 runs) : « Première nuit » → défi du jour
  { id: 'survie3', goal: 180, get: (s) => s.bestTime, time: true, unlocks: { daily: true } },
  { id: 'kills500', goal: 500, get: (s) => s.kills, unlocks: { character: 'sorciere' } },
  { id: 'dards100', goal: 100, get: (s) => s.dards, unlocks: { weapon: 'boomerang' } },
  { id: 'elites10', goal: 10, get: (s) => s.elites, unlocks: { weapon: 'mines' } },
  { id: 'boss1', goal: 1, get: (s) => s.bosses },
  { id: 'survie10', goal: 600, get: (s) => s.bestTime, time: true, unlocks: { character: 'bucheron' } },
  { id: 'evo1', goal: 1, get: (s) => s.evolutions },
  { id: 'kills2000', goal: 2000, get: (s) => s.kills },
  { id: 'survie15', goal: 900, get: (s) => s.bestTime, time: true },
  { id: 'survie20', goal: 1200, get: (s) => s.bestTime, time: true },
  { id: 'win', goal: 1, get: (s) => s.wins },
];

export const ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((a) => a.id));

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
    if (!a.time || m.achievements.includes(a.id)) continue;
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
