// Défi du jour : seed = hash(date UTC), même tirage pour tout le monde, classement local des 10 meilleures parties.
// Lot L3 (docs/specs/l3-defi-serie-missions.md) : défi court (DAILY), classé au temps tenu puis aux ennemis tués, et
// série de jours (`Meta.streak`) avec un joker par semaine ISO. Module pur, sans DOM.
import { CHARACTERS, DAILY_ARMORY, DAILY_RULE_KEYS, OUTFIT, STREAK } from '../sim/balance';
import { hashString } from '../sim/rng';
import type { CharacterKey, WeaponKey } from '../sim/types';
import { unlockedCharacters } from './achievements';
import { isoWeek } from './board';
import type { Meta } from './save';

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10); // AAAA-MM-JJ en UTC
}
export function dailySeed(date = todayKey()): number {
  return hashString('ruee-' + date) % 1000; // startGame(variant) : décalage du rng, décor identique
}
/** Graine de la carte du défi : même carte pour tous ce jour-là (lot L4 : aussi pour un défi d'ami d'un jour passé). */
export function dailyMapSeed(date: string): number {
  return (hashString('carte-' + date) % 1_000_000) + 1;
}

// ---------- défi v2 (docs/specs/defi-v2.md, décision 2) : règle du jour ----------
const DAY_KEY_MS = 86400000;
/** Premier jour des règles : la règle d'un jour se déduit de la veille, en remontant jusqu'ici (≈ 365 pas par an). */
const RULE_EPOCH = '2026-01-01';
/**
 * Règle du jour `date` (index dans DAILY_RULE_KEYS), la même pour tous, tirée par la date (`hash('regle-' + date)`) et
 * jamais celle de la veille : chaque jour avance de 1 à 5 crans depuis la règle d'hier. Avant RULE_EPOCH (aucun défi
 * jouable : les liens de défi commencent en 2026), le tirage seul.
 */
export function dailyRule(date: string): number {
  const n = DAILY_RULE_KEYS.length;
  const start = Date.parse(RULE_EPOCH + 'T00:00:00Z'),
    end = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(end) || end <= start) return hashString('regle-' + date) % n;
  let r = hashString('regle-' + RULE_EPOCH) % n;
  for (let ms = start + DAY_KEY_MS; ms <= end; ms += DAY_KEY_MS)
    r = (r + 1 + (hashString('regle-' + new Date(ms).toISOString().slice(0, 10)) % (n - 1))) % n;
  return r;
}
/** Règle « Arme imposée » : l'arme de départ du jour, tirée par la date parmi DAILY_ARMORY (jamais l'Orbe de l'Éclaireuse). */
export function dailyWeapon(date: string): WeaponKey {
  return DAILY_ARMORY[hashString('arme-' + date) % DAILY_ARMORY.length];
}

/**
 * Enregistre une partie du jour (temps tenu, ennemis tués) ; remet le classement à zéro si la date a changé. Classement :
 * le temps, puis les kills à égalité (lot L3). Retourne le rang (1 = meilleure) ou 0 si hors des 10 premières.
 * Défi v2 (décision 7) : la médaille de la partie (0 à 3) est gardée avec elle, sur l'appareil seulement (sync.ts).
 */
export function recordDaily(m: Meta, seconds: number, kills: number, date = todayKey(), medal = 0): number {
  if (m.daily.date !== date) m.daily = { date, times: [], kills: [], medals: [] };
  const runs = m.daily.times.map((t, i) => ({ t, k: m.daily.kills[i] ?? 0, md: m.daily.medals[i] ?? 0, me: false }));
  const mine = { t: seconds, k: kills, md: medal, me: true };
  runs.push(mine);
  runs.sort((a, b) => b.t - a.t || b.k - a.k);
  const top = runs.slice(0, 10);
  m.daily.times = top.map((r) => r.t);
  m.daily.kills = top.map((r) => r.k);
  m.daily.medals = top.map((r) => r.md);
  return top.indexOf(mine) + 1;
}
/** Parties du jour, de la meilleure à la moins bonne (10 au plus) ; vide si le dernier défi joué date d'un autre jour. */
export function dailyRuns(m: Meta, date = todayKey()): { t: number; k: number; medal: number }[] {
  return m.daily.date === date
    ? m.daily.times.map((t, i) => ({ t, k: m.daily.kills[i] ?? 0, medal: m.daily.medals[i] ?? 0 }))
    : [];
}
/** Défi v2 : la meilleure médaille du jour (0 : aucune partie réussie, ou des parties d'avant les médailles). */
export function bestMedal(m: Meta, date = todayKey()): number {
  return m.daily.date === date ? m.daily.medals.reduce((a, b) => Math.max(a, b), 0) : 0;
}
/**
 * Défi v2 (décision 8) : les médailles restent sur l'appareil. La progression reçue du nuage n'en a pas ; chaque partie
 * reprend la médaille de la même partie locale (même jour, même temps, mêmes vaincus), 0 sinon.
 */
export function keepMedals(local: Meta['daily'], theirs: Meta['daily']): number[] {
  const used = new Array<boolean>(local.times.length).fill(false);
  return theirs.times.map((t, i) => {
    if (local.date !== theirs.date) return 0;
    for (let j = 0; j < local.times.length; j++)
      if (!used[j] && local.times[j] === t && (local.kills[j] ?? 0) === (theirs.kills[i] ?? 0)) {
        used[j] = true;
        return local.medals[j] ?? 0;
      }
    return 0;
  });
}
/** Millisecondes avant le prochain défi (minuit UTC, là où todayKey change). */
export function msToNextDaily(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
}

// ---------- série de jours (lot L3, décisions 5 à 7) ----------
/**
 * `last` : dernier jour compté (AAAA-MM-JJ, UTC) ; `jokerWeek` : semaine ISO du dernier jour pardonné par le joker ;
 * `jokerDay` : ce jour pardonné (un joker ne se chaîne pas à un autre, même d'une semaine à la suivante).
 */
export interface Streak {
  last: string;
  count: number;
  best: number;
  jokerWeek: string;
  jokerDay: string;
}
const DAY_MS = 86400000;
const dayMs = (date: string): number => Date.parse(date + 'T00:00:00Z');
/** Jours entre deux dates AAAA-MM-JJ (b − a). */
const daysBetween = (a: string, b: string): number => Math.round((dayMs(b) - dayMs(a)) / DAY_MS);

/**
 * À l'ouverture (et avant de compter un jour) : si exactement un jour manque depuis le dernier compté et que le joker de
 * la semaine ISO de ce jour n'a pas servi, il est consommé et la série continue (le jour manqué compte comme joué, sans
 * or) ; s'il manque plus d'un jour, si le joker a déjà servi cette semaine-là, ou si le dernier jour « compté » est
 * lui-même un jour pardonné (deux jours manqués de suite), la série retombe à 0.
 * `held` : jour d'un défi gardé sur l'appareil, pas encore fini ; s'il suit le dernier jour compté, rien n'est réglé
 * (la partie, reprise après minuit, comptera pour son jour).
 */
export function settleStreak(m: Meta, today: string, held = ''): 'joker' | 'lost' | null {
  const s = m.streak;
  if (!s.last || s.count <= 0) return null;
  if (held && daysBetween(s.last, held) === 1) return null;
  const gap = daysBetween(s.last, today);
  if (gap <= 1) return null; // compté aujourd'hui ou hier (ou horloge en arrière : rien ne bouge)
  if (gap === 2 && s.last !== s.jokerDay) {
    const missed = new Date(dayMs(s.last) + DAY_MS).toISOString().slice(0, 10);
    const week = isoWeek(dayMs(missed));
    if (s.jokerWeek !== week) {
      s.jokerWeek = week;
      s.jokerDay = missed;
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

/**
 * Interface Nocturne (feuille du défi du jour) : ce que le défi d'aujourd'hui rapporterait, sans rien écrire. `count` :
 * série atteinte s'il est fini aujourd'hui (celle du jour si déjà compté) ; `gold` : or de ce jour (0 si déjà compté) ;
 * `outfitIn` : jours avant la prochaine tenue offerte ; `joker` : joker de la semaine ISO encore disponible.
 */
export function streakPreview(
  m: Meta,
  today: string,
): { count: number; done: boolean; gold: number; outfitIn: number; joker: boolean } {
  const s = m.streak;
  const done = s.last === today && s.count > 0;
  const live = streakNow(m, today);
  const count = done ? s.count : live > 0 && daysBetween(s.last, today) === 1 ? live + 1 : 1;
  const gold = done ? 0 : STREAK.gold + STREAK.perDay * Math.min(count, STREAK.cap);
  const outfitIn = (STREAK.outfitEvery - (count % STREAK.outfitEvery)) % STREAK.outfitEvery;
  return { count, done, gold, outfitIn, joker: s.jokerWeek !== isoWeek(dayMs(today)) };
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
    jokerDay: typeof o.jokerDay === 'string' && DATE.test(o.jokerDay) ? o.jokerDay : '',
  };
}
/** Fusion (décision 11) : la série la plus récente (`last`), puis la plus longue ; le meilleur record des deux. */
export function mergeStreak(a: Streak, b: Streak): Streak {
  const win = a.last !== b.last ? (a.last > b.last ? a : b) : a.count >= b.count ? a : b;
  return {
    ...win,
    best: Math.max(a.best, b.best),
    jokerWeek: a.jokerWeek > b.jokerWeek ? a.jokerWeek : b.jokerWeek,
    jokerDay: a.jokerDay > b.jokerDay ? a.jokerDay : b.jokerDay,
  };
}
