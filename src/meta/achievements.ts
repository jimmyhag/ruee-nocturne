// Succès à barre de progression (PLAN §2.4) : liste déclarative sur les compteurs cumulés de Meta.stats.
// Chaque succès peut débloquer un personnage, une arme ou le défi du jour.
import type { CharacterKey, ItemKey, WeaponKey } from '../sim/types';
import type { Meta, MetaStats } from './save';
import type { CharStats } from './chars';
import { charStatsOf } from './chars';
import { CHAR_CHALLENGE } from '../sim/balance';
import { WEAPON_KEYS } from '../sim/weapons/defs';

// Noms, textes et « débloque … » : src/i18n (clés ach.<id>.name / .text / .unlock), via src/ui/cards.ts.
export interface Achievement {
  id: string;
  goal: number;
  get: (s: MetaStats, c: CharStats) => number; // phase 41 : `c` = stats du personnage du défi (vides sinon)
  char?: CharacterKey; // phase 41 : défi propre à ce personnage (fiche du personnage, pas l'écran Succès)
  kind?: ChallengeKind; // phase 41 : gabarit du texte du défi (src/i18n chal.<kind>)
  tier?: number; // phase 41 : I, II ou III
  time?: true; // valeur affichée en m:ss
  survival?: true; // succès « survis N minutes » : candidat à « il te manquait … » sur l'écran de mort
  // phase 40 : une arme ou un objet n'est plus donné, il devient **achetable** dans la Bibliothèque (src/meta/library.ts)
  // phase 41 : or versé une fois (défis I et II), tenue de maître du personnage (défi III)
  unlocks?: {
    character?: CharacterKey;
    weapon?: WeaponKey;
    item?: ItemKey;
    daily?: boolean;
    gold?: number;
    outfit?: CharacterKey;
  };
}
export type ChallengeKind =
  'sig' | 'air' | 'spell' | 'casts' | 'fire' | 'spent' | 'chests' | 'elites' | 'bosses' | 'noHit' | 'stage' | 'win';

/** Défi n° `tier` (1..3) du personnage : lu dans ses meilleures valeurs en une partie (src/meta/chars.ts). */
function challenge(char: CharacterKey, tier: number, kind: ChallengeKind, goal: number): Achievement {
  const field: keyof CharStats = kind === 'win' ? 'wins' : kind;
  return {
    id: `c_${char}_${tier}`,
    char,
    kind,
    tier,
    goal,
    get: (_s, c) => c[field],
    time: kind === 'noHit' ? true : undefined,
    unlocks: tier === 3 ? { outfit: char } : { gold: CHAR_CHALLENGE.gold[tier - 1] },
  };
}
/**
 * Phase 41 : 3 défis par personnage (signature, plus dur, victoire), en une partie avec lui. Objectifs calés sur le bot
 * nu (100 runs par personnage) : défi I tenu dans 25 à 60 % des parties, défi II dans 5 à 25 %.
 */
export const CHAR_CHALLENGES: Achievement[] = [
  challenge('eclaireuse', 1, 'sig', 500),
  challenge('eclaireuse', 2, 'casts', 12),
  challenge('eclaireuse', 3, 'win', 1),
  challenge('bucheron', 1, 'sig', 800),
  challenge('bucheron', 2, 'noHit', 180),
  challenge('bucheron', 3, 'win', 1),
  challenge('sorciere', 1, 'sig', 1000),
  challenge('sorciere', 2, 'spell', 40),
  challenge('sorciere', 3, 'win', 1),
  challenge('veilleuse', 1, 'sig', 400),
  challenge('veilleuse', 2, 'stage', 3),
  challenge('veilleuse', 3, 'win', 1),
  challenge('braconnier', 1, 'sig', 900),
  challenge('braconnier', 2, 'elites', 30),
  challenge('braconnier', 3, 'win', 1),
  challenge('sapeur', 1, 'sig', 450),
  challenge('sapeur', 2, 'stage', 2),
  challenge('sapeur', 3, 'win', 1),
  challenge('feufollet', 1, 'fire', 25),
  challenge('feufollet', 2, 'noHit', 240),
  challenge('feufollet', 3, 'win', 1),
  challenge('revenante', 1, 'air', 80),
  challenge('revenante', 2, 'air', 400),
  challenge('revenante', 3, 'win', 1),
  challenge('colporteur', 1, 'spent', 1000),
  challenge('colporteur', 2, 'chests', 7),
  challenge('colporteur', 3, 'win', 1),
];

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
  // phase 47 C : quatre armes, sur des compteurs déjà tenus
  { id: 'elites100', goal: 100, get: (s) => s.elites, unlocks: { weapon: 'fouet' } },
  { id: 'kills5000', goal: 5000, get: (s) => s.kills, unlocks: { weapon: 'vitriol' } },
  { id: 'runs20', goal: 20, get: (s) => s.runs, unlocks: { weapon: 'esprits' } },
  { id: 'coffres25', goal: 25, get: (s) => s.mapChests, unlocks: { weapon: 'balise' } },
  // phase 40 : objets à débloquer (puis à acheter dans la Bibliothèque), sur des compteurs déjà tenus
  { id: 'runs10', goal: 10, get: (s) => s.runs, unlocks: { item: 'sablier' } },
  { id: 'monde2', goal: 2, get: (s) => s.bestStage, unlocks: { item: 'bouclier' } },
  { id: 'coffres10', goal: 10, get: (s) => s.mapChests, unlocks: { item: 'corne' } },
  { id: 'elites50', goal: 50, get: (s) => s.elites, unlocks: { item: 'collier' } },
  { id: 'boss5', goal: 5, get: (s) => s.bosses, unlocks: { item: 'phenix' } },
  { id: 'infini1', goal: 150, get: (s) => s.endlessBest, time: true, unlocks: { item: 'souffle' } },
  // phase 47 B : les dix objets rares et épiques nouveaux, sur des compteurs déjà tenus (aucun champ de sauvegarde en plus)
  { id: 'kills10000', goal: 10000, get: (s) => s.kills, unlocks: { item: 'fiole' } },
  { id: 'triple10', goal: 10, get: (s) => s.triples, unlocks: { item: 'miroir' } },
  { id: 'elites200', goal: 200, get: (s) => s.elites, unlocks: { item: 'glace' } },
  { id: 'glisse5000', goal: 5000, get: (s) => s.slideDist, unlocks: { item: 'ailes' } },
  { id: 'prudent', goal: 120, get: (s) => s.noHitBest, time: true, unlocks: { item: 'coquille' } },
  { id: 'runs30', goal: 30, get: (s) => s.runs, unlocks: { item: 'cloche' } },
  { id: 'boss20', goal: 20, get: (s) => s.bosses, unlocks: { item: 'trophee' } },
  { id: 'monde3', goal: 3, get: (s) => s.bestStage, unlocks: { item: 'idole' } },
  { id: 'wins3', goal: 3, get: (s) => s.wins, unlocks: { item: 'dent' } },
  { id: 'erudit2', goal: 35, get: (s) => s.weaponLvBest, unlocks: { item: 'grimoire' } },
  ...CHAR_CHALLENGES,
];

export const ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((a) => a.id));

/** Valeur courante d'un succès (stats du personnage pour un défi par personnage). */
export const value = (a: Achievement, m: Meta): number => a.get(m.stats, charStatsOf(m.chars, a.char));
/** Progression [0,1] d'un succès. */
export function progress(a: Achievement, m: Meta): number {
  return Math.max(0, Math.min(1, value(a, m) / a.goal));
}

/** Succès nouvellement atteints (ajoutés à m.achievements). Retourne la liste des nouveaux. */
export function checkAchievements(m: Meta): Achievement[] {
  const fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (m.achievements.includes(a.id)) continue;
    if (value(a, m) >= a.goal) {
      m.achievements.push(a.id);
      if (a.unlocks?.gold) m.gold += a.unlocks.gold; // phase 41 : récompense des défis I et II, versée une fois
      fresh.push(a);
    }
  }
  return fresh;
}

/** Les n succès non atteints les plus proches (écran de mort) : communs, et défis du personnage `char` s'il est donné. */
export function closest(m: Meta, n: number, char?: CharacterKey): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !m.achievements.includes(a.id) && (!a.char || a.char === char))
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
