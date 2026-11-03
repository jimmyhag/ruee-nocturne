// Défi du jour : seed = hash(date UTC), même tirage pour tout le monde, classement local des 10 meilleurs temps.
import { hashString } from '../sim/rng';
import type { Meta } from './save';

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10); // AAAA-MM-JJ en UTC
}
export function dailySeed(date = todayKey()): number {
  return hashString('ruee-' + date) % 1000; // startGame(variant) : décalage du rng, décor identique
}

/** Enregistre un temps du jour ; remet le classement à zéro si la date a changé. Retourne le rang (1 = meilleur) ou 0 si hors top 10. */
export function recordDaily(m: Meta, seconds: number, date = todayKey()): number {
  if (m.daily.date !== date) m.daily = { date, times: [] };
  const times = [...m.daily.times, seconds].sort((a, b) => b - a).slice(0, 10);
  m.daily.times = times;
  const rank = times.indexOf(seconds) + 1;
  return rank;
}
export function dailyBest(m: Meta, date = todayKey()): number {
  return m.daily.date === date && m.daily.times.length ? m.daily.times[0] : 0;
}
