// Succès à barre de progression (PLAN §2.4) : liste déclarative sur les compteurs cumulés de Meta.stats.
// Chaque succès peut débloquer un personnage, une arme ou le défi du jour.
import type { CharacterKey, ItemKey, WeaponKey } from '../sim/types';
import type { Meta, MetaStats } from './save';
import { WEAPON_KEYS } from '../sim/weapons/defs';

// Noms, textes et « débloque … » : src/i18n (clés ach.<id>.name / .text / .unlock), via src/ui/cards.ts.
export interface Achievement {
  id: string;
  goal: number;
  get: (s: MetaStats) => number;
  time?: true; // valeur affichée en m:ss
  survival?: true; // succès « survis N minutes » : candidat à « il te manquait … » sur l'écran de mort
  // phase 40 : une arme ou un objet n'est plus donné, il devient **achetable** dans la Bibliothèque (src/meta/library.ts)
  unlocks?: { character?: CharacterKey; weapon?: WeaponKey; item?: ItemKey; daily?: boolean };
}

export const ACHIEVEMENTS: Achievement[] = [
  // le premier déblocage arrive au 1er ou 2e run (porte de phase 4 : < 3 runs) : « Première nuit » → défi du jour
  { id: 'survie3', goal: 180, get: (s) => s.bestTime, time: true, survival: true, unlocks: { daily: true } },
  { id: 'kills500', goal: 500, get: (s) => s.kills, unlocks: { character: 'sorciere' } },
  { id: 'dards100', goal: 100, get: (s) => s.dards, unlocks: { weapon: 'boomerang' } },
  { id: 'elites10', goal: 10, get: (s) => s.elites, unlocks: { weapon: 'mines' } },
  { id: 'boss1', goal: 1, get: (s) => s.bosses, unlocks: { character: 'sapeur' } },
  { id: 'survie10', goal: 600, get: (s) => s.bestTime, time: true, survival: true, unlocks: { character: 'bucheron' } },
  { id: 'triple1', goal: 1, get: (s) => s.triples, unlocks: { item: 'gant' } }, // phase 12 : une carte à 3 lignes
  { id: 'kills2000', goal: 2000, get: (s) => s.kills, unlocks: { item: 'croc' } },
  { id: 'survie15', goal: 900, get: (s) => s.bestTime, time: true, survival: true, unlocks: { item: 'calice' } },
  { id: 'survie20', goal: 1200, get: (s) => s.bestTime, time: true, survival: true, unlocks: { item: 'couronne' } },
  { id: 'win', goal: 1, get: (s) => s.wins, unlocks: { character: 'revenante' } },
  // défis (phase 6) : des objectifs de maîtrise dans un seul run, pas du cumul
  { id: 'intouchable', goal: 240, get: (s) => s.noHitBest, time: true, unlocks: { character: 'feufollet' } },
  { id: 'marathon', goal: 4000, get: (s) => s.distanceBest, unlocks: { item: 'boussole' } },
  { id: 'erudit', goal: 25, get: (s) => s.weaponLvBest, unlocks: { item: 'rune' } }, // phase 12 : une arme à 25 améliorations dans un run
  // phase 28 : glisse, figures et exploration débloquent les armes nouvelles
  { id: 'glisse1000', goal: 1000, get: (s) => s.slideDist, unlocks: { weapon: 'faux' } },
  { id: 'vrilles5', goal: 5, get: (s) => s.tricksBest, unlocks: { weapon: 'lance' } },
  { id: 'coffres50', goal: 50, get: (s) => s.mapChests, unlocks: { weapon: 'meteores' } },
  // phase 40 : objets à débloquer (puis à acheter dans la Bibliothèque), sur des compteurs déjà tenus
  { id: 'runs10', goal: 10, get: (s) => s.runs, unlocks: { item: 'sablier' } },
  { id: 'monde2', goal: 2, get: (s) => s.bestStage, unlocks: { item: 'bouclier' } },
  { id: 'coffres10', goal: 10, get: (s) => s.mapChests, unlocks: { item: 'corne' } },
  { id: 'elites50', goal: 50, get: (s) => s.elites, unlocks: { item: 'collier' } },
  { id: 'boss5', goal: 5, get: (s) => s.bosses, unlocks: { item: 'phenix' } },
  { id: 'infini1', goal: 150, get: (s) => s.endlessBest, time: true, unlocks: { item: 'souffle' } },
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
    if (!a.survival || m.achievements.includes(a.id)) continue;
    if (runTime < a.goal) return { seconds: Math.ceil(a.goal - runTime), a };
  }
  return null;
}

/** Personnages jouables : l'Éclaireuse, ceux dont le succès est obtenu, ceux achetés en or (phase 6). */
export function unlockedCharacters(m: Meta): CharacterKey[] {
  const out: CharacterKey[] = ['eclaireuse'];
  for (const a of ACHIEVEMENTS)
    if (a.unlocks?.character && m.achievements.includes(a.id)) out.push(a.unlocks.character);
  for (const k of m.bought) if (!out.includes(k)) out.push(k);
  return out;
}
/** Armes et objets qu'un succès rend achetables (phase 40) : clés de la Bibliothèque, `'w:faux'`, `'i:phenix'`. */
export const UNLOCKABLE: ReadonlyMap<string, Achievement> = new Map(
  ACHIEVEMENTS.flatMap((a): [string, Achievement][] =>
    a.unlocks?.weapon ? [[`w:${a.unlocks.weapon}`, a]] : a.unlocks?.item ? [[`i:${a.unlocks.item}`, a]] : [],
  ),
);
/** Armes proposables : celles qui ne dépendent d'aucun succès, plus celles achetées (phase 40 ; succès seul avant). */
export function unlockedWeapons(m: Meta): WeaponKey[] {
  return WEAPON_KEYS.filter((k) => !UNLOCKABLE.has(`w:${k}`) || m.unlocks.includes(`w:${k}`));
}
export function dailyUnlocked(m: Meta): boolean {
  return ACHIEVEMENTS.some((a) => a.unlocks?.daily && m.achievements.includes(a.id));
}
