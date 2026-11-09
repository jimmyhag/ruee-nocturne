// Défis par personnage (phase 41) : meilleures valeurs en une partie avec chaque personnage. Les défis eux-mêmes sont
// dans ACHIEVEMENTS (champ `char`), qui lisent ces stats. Module pur : aucun DOM.
import { CHARACTERS } from '../sim/balance';
import { HitSrc } from '../sim/types';
import type { CharacterKey } from '../sim/types';
import type { World } from '../sim/world';
import { WEAPON_KEYS } from '../sim/weapons/defs';

/** Par personnage : cumul des parties et victoires, meilleures valeurs en une partie pour le reste. */
export interface CharStats {
  runs: number;
  wins: number;
  sig: number; // ennemis tués par l'arme de départ du personnage
  air: number; // ennemis tués en l'air
  spell: number; // ennemis tués par le sort
  casts: number; // sorts lancés
  fire: number; // ennemis brûlés par la traînée (Feu follet)
  spent: number; // or dépensé (marchand, coffres de carte)
  chests: number; // coffres de carte ouverts
  elites: number;
  bosses: number;
  noHit: number; // s sans dégât d'affilée
  stage: number; // monde atteint (1..3 ; 4 = les trois mondes)
}
export const CHAR_STAT_KEYS = [
  'runs',
  'wins',
  'sig',
  'air',
  'spell',
  'casts',
  'fire',
  'spent',
  'chests',
  'elites',
  'bosses',
  'noHit',
  'stage',
] as const satisfies readonly (keyof CharStats)[];
const CUMUL: ReadonlySet<string> = new Set(['runs', 'wins']);

export const emptyCharStats = (): CharStats => ({
  runs: 0,
  wins: 0,
  sig: 0,
  air: 0,
  spell: 0,
  casts: 0,
  fire: 0,
  spent: 0,
  chests: 0,
  elites: 0,
  bosses: 0,
  noHit: 0,
  stage: 0,
});
const EMPTY: CharStats = emptyCharStats();

/** Stats d'un personnage dans la méta (jamais undefined). */
export function charStatsOf(chars: Partial<Record<CharacterKey, CharStats>>, key: CharacterKey | undefined): CharStats {
  return (key && chars[key]) || EMPTY;
}

/** Ce que la partie vaut pour les défis du personnage `key` (monde final). */
export function runCharStats(key: CharacterKey, w: World, won: boolean): CharStats {
  const weapon = CHARACTERS.find((c) => c.key === key)?.weapon ?? 'orbe';
  return {
    runs: 1,
    wins: won ? 1 : 0,
    sig: w.srcKills[WEAPON_KEYS.indexOf(weapon)], // les armes sont les premières sources (HitSrc), dans l'ordre de WEAPON_KEYS
    air: w.airKills,
    spell: w.sstate.kills,
    casts: w.sstate.casts,
    fire: w.srcKills[HitSrc.Fire],
    spent: Math.round(w.goldSpent),
    chests: w.mapChestsOpened,
    elites: w.eliteKills,
    bosses: w.bossKills,
    noHit: Math.floor(w.noHitBest),
    stage: won ? 4 : w.stage + 1,
  };
}

/** Ajoute une partie aux stats du personnage : cumul pour runs et wins, meilleure valeur pour le reste. */
export function addCharRun(chars: Partial<Record<CharacterKey, CharStats>>, key: CharacterKey, run: CharStats): void {
  const c = (chars[key] ??= emptyCharStats());
  for (const k of CHAR_STAT_KEYS) c[k] = CUMUL.has(k) ? c[k] + run[k] : Math.max(c[k], run[k]);
}

/** Normalisation (sauvegarde, nuage) : personnages connus, entiers positifs bornés. */
export function normalizeChars(raw: unknown): Partial<Record<CharacterKey, CharStats>> {
  const out: Partial<Record<CharacterKey, CharStats>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const ch of CHARACTERS) {
    const r = (raw as Record<string, unknown>)[ch.key];
    if (!r || typeof r !== 'object') continue;
    const c = emptyCharStats();
    for (const k of CHAR_STAT_KEYS) {
      const v = (r as Record<string, unknown>)[k];
      c[k] = typeof v === 'number' && Number.isFinite(v) ? Math.min(1e7, Math.max(0, Math.floor(v))) : 0;
    }
    c.stage = Math.min(4, c.stage);
    out[ch.key] = c;
  }
  return out;
}
