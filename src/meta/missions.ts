// Lot L3 (docs/specs/l3-defi-serie-missions.md, décisions 8 à 10) : missions du jour. Trois objectifs par jour UTC,
// tirés par la graine hash('missions-' + date) parmi le contenu que le joueur possède, gardés dans `Meta.missions`
// (clé de progression synchronisée) ; ils comptent dans toutes les parties et paient leur or une seule fois, à la fin
// de la partie qui les remplit. Chaque modèle lit une statistique que la partie mesure déjà. Module pur, sans DOM.
import { CHARACTERS, MISSIONS } from '../sim/balance';
import { Rng, hashString } from '../sim/rng';
import type { CharacterKey, WeaponKey } from '../sim/types';
import { WEAPON_KEYS } from '../sim/weapons/defs';
import { unlockedCharacters, unlockedWeapons } from './achievements';
import type { Meta } from './save';

/** Modèles : personnage, arme, puis les objectifs chiffrés (MISSIONS.goals). */
export const MISSION_KINDS = ['char', 'weapon', 'kills', 'elites', 'survive', 'chests', 'level'] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];
type CountKind = keyof typeof MISSIONS.goals;
const COUNT_KINDS = Object.keys(MISSIONS.goals) as CountKind[];

/** Une mission : modèle `k`, paramètre `p` (personnage ou arme, '' sinon), objectif, progression, remplie. */
export interface Mission {
  k: MissionKind;
  p: string;
  goal: number;
  prog: number;
  done: boolean;
}
export interface Missions {
  date: string; // AAAA-MM-JJ (UTC) du tirage
  list: Mission[];
}
/** Ce qu'une partie finie apporte aux missions : des statistiques que le jeu mesure déjà. */
export interface RunFacts {
  char: CharacterKey;
  weapons: readonly string[]; // armes portées en fin de partie
  kills: number;
  elites: number;
  t: number; // s tenues
  chests: number; // coffres de carte ouverts
  weaponLv: number; // meilleur niveau d'arme
}

/** Or d'une mission : selon le modèle et la difficulté de l'objectif (index dans MISSIONS.goals). */
export function missionGold(m: Mission): number {
  const gold = MISSIONS.gold[m.k];
  if (m.k === 'char' || m.k === 'weapon') return gold[0];
  const at = MISSIONS.goals[m.k].indexOf(m.goal);
  return gold[Math.max(0, at)];
}

/**
 * Tirage du jour. Les nombres sont tirés dans un ordre fixe (personnage, arme, puis l'ordre des objectifs chiffrés) :
 * deux joueurs qui ne possèdent pas le même contenu ont les mêmes objectifs chiffrés. Au moins une mission de
 * personnage (un autre que celui choisi) et une d'arme (une autre que celle de départ du personnage choisi) quand c'est
 * possible ; sinon le modèle est remplacé par un objectif chiffré.
 */
export function drawMissions(m: Meta, date: string): Mission[] {
  const r = new Rng(hashString('missions-' + date));
  const charRoll = r.next(),
    weaponRoll = r.next();
  const order = [...COUNT_KINDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const goalRolls = order.map(() => r.next());
  const list: Mission[] = [];
  const chars = unlockedCharacters(m).filter((k) => k !== m.character);
  if (chars.length > 0) list.push(make('char', chars[Math.floor(charRoll * chars.length)], 1));
  const kit = CHARACTERS.find((c) => c.key === m.character);
  // relecture du lot L3 : avec un seul emplacement d'arme, aucune nouvelle arme n'est proposée en partie
  const weapons = m.slots.weapons > 1 ? unlockedWeapons(m).filter((k) => k !== kit?.weapon && k !== kit?.weapon2) : [];
  if (weapons.length > 0) list.push(make('weapon', weapons[Math.floor(weaponRoll * weapons.length)], 1));
  for (let i = 0; i < order.length && list.length < MISSIONS.count; i++) {
    const goals = MISSIONS.goals[order[i]];
    list.push(make(order[i], '', goals[Math.floor(goalRolls[i] * goals.length)]));
  }
  return list;
}
function make(k: MissionKind, p: string, goal: number): Mission {
  return { k, p, goal, prog: 0, done: false };
}

/**
 * Missions du jour : tirées à la première ouverture d'un nouveau jour UTC, inchangées ensuite. True si nouvelles. Une
 * horloge qui recule (date antérieure au tirage) ne refait pas le tirage.
 */
export function ensureMissions(m: Meta, date: string): boolean {
  if (date <= m.missions.date) return false;
  m.missions = { date, list: drawMissions(m, date) };
  return true;
}

function value(ms: Mission, run: RunFacts): number {
  switch (ms.k) {
    case 'char':
      return run.char === ms.p ? 1 : 0;
    case 'weapon':
      return run.weapons.includes(ms.p) ? 1 : 0;
    case 'kills':
      return run.kills;
    case 'elites':
      return run.elites;
    case 'survive':
      return Math.floor(run.t / 60);
    case 'chests':
      return run.chests;
    case 'level':
      return run.weaponLv;
  }
}

/**
 * Fin d'une partie (toutes : complètes, défi du jour) : la progression de chaque mission devient le meilleur de la
 * journée (objectifs en une partie), une mission remplie est cochée et son or crédité, une seule fois. Retourne les
 * missions remplies par cette partie.
 */
export function missionsAfterRun(m: Meta, run: RunFacts, date: string): Mission[] {
  ensureMissions(m, date);
  const done: Mission[] = [];
  if (date !== m.missions.date) return done; // horloge reculée : la partie ne compte pas pour le tirage d'un autre jour
  for (const ms of m.missions.list) {
    if (ms.done) continue;
    ms.prog = Math.min(ms.goal, Math.max(ms.prog, value(ms, run)));
    if (ms.prog < ms.goal) continue;
    ms.done = true;
    const gold = missionGold(ms);
    m.gold += gold;
    m.goldEarned += gold;
    done.push(ms);
  }
  return done;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isKind = (k: unknown): k is MissionKind => MISSION_KINDS.includes(k as MissionKind);
/**
 * Missions lues dans une sauvegarde ou une progression du nuage : date valide, trois missions au plus, modèles et
 * paramètres connus, nombres bornés. Sans champ lisible (joueur d'avant le lot) : aucune, elles seront tirées à
 * l'ouverture.
 */
export function normalizeMissions(raw: unknown): Missions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const date = typeof o.date === 'string' && DATE.test(o.date) ? o.date : '';
  const list: Mission[] = [];
  if (date && Array.isArray(o.list))
    for (const it of o.list.slice(0, 16)) {
      if (list.length >= MISSIONS.count) break;
      const e = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
      if (!isKind(e.k)) continue;
      const p = typeof e.p === 'string' ? e.p : '';
      if (e.k === 'char' && !CHARACTERS.some((c) => c.key === p)) continue;
      if (e.k === 'weapon' && !(WEAPON_KEYS as readonly string[]).includes(p as WeaponKey)) continue;
      const goal =
        typeof e.goal === 'number' && Number.isFinite(e.goal) ? Math.max(1, Math.min(1e4, Math.floor(e.goal))) : 1;
      const prog =
        typeof e.prog === 'number' && Number.isFinite(e.prog) ? Math.max(0, Math.min(goal, Math.floor(e.prog))) : 0;
      list.push({ k: e.k, p: e.k === 'char' || e.k === 'weapon' ? p : '', goal, prog, done: e.done === true });
    }
  return { date, list };
}

/**
 * Fusion avec une progression venue d'un autre appareil : le tirage le plus récent ; le même jour, chaque mission garde
 * la meilleure progression et reste cochée si elle l'est d'un côté (son or n'a été crédité que là où elle a été remplie).
 */
export function mergeMissions(a: Missions, b: Missions): Missions {
  if (a.date !== b.date) return a.date > b.date ? a : b;
  if (a.list.length !== b.list.length) return a;
  return {
    date: a.date,
    list: a.list.map((x, i) => {
      const y = b.list[i];
      if (x.k !== y.k || x.p !== y.p || x.goal !== y.goal) return x;
      return { ...x, prog: Math.max(x.prog, y.prog), done: x.done || y.done };
    }),
  };
}
