// Défi du jour : seed = hash(date UTC), même tirage pour tout le monde, classement local des 10 meilleures parties.
// Lot L3 (docs/specs/l3-defi-serie-missions.md) : défi court (DAILY), classé au temps tenu puis aux ennemis tués, et
// série de jours (`Meta.streak`) avec un joker par semaine ISO. Module pur, sans DOM.
import { CHARACTERS, OUTFIT, STREAK } from '../sim/balance';
import { hashString } from '../sim/rng';
import type { CharacterKey } from '../sim/types';
import { unlockedCharacters } from './achievements';
import { isoWeek } from './board';
import type { Meta } from './save';

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10); // AAAA-MM-JJ en UTC
}
export function dailySeed(date = todayKey()): number {
  return hashString('ruee-' + date) % 1000; // startGame(variant) : décalage du rng, décor identique
}

/**
 * Enregistre une partie du jour (temps tenu, ennemis tués) ; remet le classement à zéro si la date a changé. Classement :
 * le temps, puis les kills à égalité (lot L3). Retourne le rang (1 = meilleure) ou 0 si hors des 10 premières.
 */
export function recordDaily(m: Meta, seconds: number, kills: number, date = todayKey()): number {
  if (m.daily.date !== date) m.daily = { date, times: [], kills: [] };
  const runs = m.daily.times.map((t, i) => ({ t, k: m.daily.kills[i] ?? 0, me: false }));
  const mine = { t: seconds, k: kills, me: true };
  runs.push(mine);
  runs.sort((a, b) => b.t - a.t || b.k - a.k);
  const top = runs.slice(0, 10);
  m.daily.times = top.map((r) => r.t);
  m.daily.kills = top.map((r) => r.k);
  return top.indexOf(mine) + 1;
}
/** Parties du jour, de la meilleure à la moins bonne (10 au plus) ; vide si le dernier défi joué date d'un autre jour. */
export function dailyRuns(m: Meta, date = todayKey()): { t: number; k: number }[] {
  return m.daily.date === date ? m.daily.times.map((t, i) => ({ t, k: m.daily.kills[i] ?? 0 })) : [];
}
/** Millisecondes avant le prochain défi (minuit UTC, là où todayKey change). */
export function msToNextDaily(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
}

// ---------- série de jours (lot L3, décisions 5 à 7) ----------
/** `last` : dernier jour compté (AAAA-MM-JJ, UTC) ; `jokerWeek` : semaine ISO du dernier jour pardonné par le joker. */
export interface Streak {
  last: string;
  count: number;
  best: number;
  jokerWeek: string;
}
const DAY_MS = 86400000;
const dayMs = (date: string): number => Date.parse(date + 'T00:00:00Z');
/** Jours entre deux dates AAAA-MM-JJ (b − a). */
const daysBetween = (a: string, b: string): number => Math.round((dayMs(b) - dayMs(a)) / DAY_MS);

/**
 * À l'ouverture (et avant de compter un jour) : si exactement un jour manque depuis le dernier compté et que le joker de
 * la semaine ISO de ce jour n'a pas servi, il est consommé et la série continue (le jour manqué compte comme joué, sans
 * or) ; s'il manque plus d'un jour, ou si le joker a déjà servi cette semaine-là, la série retombe à 0.
 */
export function settleStreak(m: Meta, today: string): 'joker' | 'lost' | null {
  const s = m.streak;
  if (!s.last || s.count <= 0) return null;
  const gap = daysBetween(s.last, today);
  if (gap <= 1) return null; // compté aujourd'hui ou hier (ou horloge en arrière : rien ne bouge)
  if (gap === 2) {
    const missed = new Date(dayMs(s.last) + DAY_MS).toISOString().slice(0, 10);
    const week = isoWeek(dayMs(missed));
    if (s.jokerWeek !== week) {
      s.jokerWeek = week;
      s.last = missed;
      return 'joker';
    }
  }
  s.count = 0;
  return 'lost';
}

/** Ce que le jour compté rapporte : la série atteinte, son or et, tous les STREAK.outfitEvery jours, une tenue. */
export interface StreakGain {
  count: number;
  gold: number;
  outfit: CharacterKey | null; // tenue offerte (null : aucune, ou toutes possédées et payées en or)
}

/**
 * Fin d'un défi du jour (réussi ou raté) le jour `day` : le jour compte une fois. Série +1 si le dernier jour compté
 * est la veille (joker compris), sinon elle repart à 1. Or : STREAK.gold + STREAK.perDay × min(série, STREAK.cap) ;
 * tous les STREAK.outfitEvery jours, la tenue alternative d'un personnage qui ne l'a pas, sinon OUTFIT.price en or.
 * Retourne null si le jour était déjà compté.
 */
export function recordStreak(m: Meta, day: string): StreakGain | null {
  settleStreak(m, day);
  const s = m.streak;
  const gap = s.last ? daysBetween(s.last, day) : Infinity;
  if (gap <= 0) return null;
  s.count = gap === 1 && s.count > 0 ? s.count + 1 : 1;
  s.last = day;
  s.best = Math.max(s.best, s.count);
  let gold = STREAK.gold + STREAK.perDay * Math.min(s.count, STREAK.cap);
  let outfit: CharacterKey | null = null;
  if (s.count % STREAK.outfitEvery === 0) {
    outfit = giftOutfit(m);
    if (!outfit) gold += OUTFIT.price;
  }
  m.gold += gold;
  m.goldEarned += gold;
  return { count: s.count, gold, outfit };
}

/** Tenue offerte : d'abord le personnage choisi, puis les autres personnages possédés, puis les autres. */
function giftOutfit(m: Meta): CharacterKey | null {
  const order = [m.character, ...unlockedCharacters(m), ...CHARACTERS.map((c) => c.key)];
  const key = order.find((k) => !m.outfits.includes(k));
  if (!key) return null;
  m.outfits.push(key);
  if (m.outfit[key] !== 2) m.outfit[key] = 1; // portée tout de suite, comme une tenue achetée (pas à la place de celle de maître)
  return key;
}

/** Série affichée au menu : celle d'aujourd'hui ou d'hier (encore vivante), 0 si elle est perdue. */
export function streakNow(m: Meta, today: string): number {
  const s = m.streak;
  return s.last && s.count > 0 && daysBetween(s.last, today) <= 1 ? s.count : 0;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = /^\d{4}-W\d{2}$/;
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
/** Série lue dans une sauvegarde ou une progression du nuage ; sans champ (joueur d'avant le lot) : 0. */
export function normalizeStreak(raw: unknown): Streak {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const last = typeof o.last === 'string' && DATE.test(o.last) ? o.last : '';
  const count = last ? Math.min(1e5, int(o.count)) : 0;
  return {
    last,
    count,
    best: Math.max(count, Math.min(1e5, int(o.best))),
    jokerWeek: typeof o.jokerWeek === 'string' && WEEK.test(o.jokerWeek) ? o.jokerWeek : '',
  };
}
/** Fusion (décision 11) : la série la plus récente (`last`), puis la plus longue ; le meilleur record des deux. */
export function mergeStreak(a: Streak, b: Streak): Streak {
  const win = a.last !== b.last ? (a.last > b.last ? a : b) : a.count >= b.count ? a : b;
  return {
    ...win,
    best: Math.max(a.best, b.best),
    jokerWeek: a.jokerWeek > b.jokerWeek ? a.jokerWeek : b.jokerWeek,
  };
}
