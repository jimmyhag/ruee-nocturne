// Sauvegarde méta : IndexedDB via idb-keyval, repli localStorage, jamais bloquante.
// v2 (phase 4) : or, boutique, compteurs cumulés, succès, personnage, défi du jour, réglages. Migration depuis v1.
import { get, set } from 'idb-keyval';
import { CHARACTERS, SHOP } from '../sim/balance';
import { ACHIEVEMENT_IDS } from './achievements';
import type { CharacterKey } from '../sim/types';
import { LANG_SETTINGS } from '../i18n';
import type { LangSetting } from '../i18n';

/** Compteurs cumulés sur tous les runs : la matière des succès (src/meta/achievements.ts). */
export interface MetaStats {
  kills: number;
  dards: number;
  elites: number;
  bosses: number;
  evolutions: number;
  wins: number;
  bestTime: number; // s
  runs: number;
  // défis (phase 6) : meilleurs scores en un seul run
  noHitBest: number; // s sans dégât
  distanceBest: number; // u parcourus
  evoRunBest: number; // évolutions obtenues
}
export interface MetaSettings {
  vibrate: boolean;
  hudScale: number; // 0.85 | 1 | 1.2
  lefty: boolean;
  lang: LangSetting; // 'auto' : langue du navigateur (phase 5)
}
export interface Meta {
  version: 2;
  bestTime: number;
  bestKills: number;
  runs: number;
  totalKills: number;
  muted: boolean;
  reducedFx: boolean;
  fxChosen: boolean; // true dès que le joueur a touché au réglage : sinon `prefers-reduced-motion` décide
  gold: number; // or disponible (boutique)
  goldEarned: number; // or gagné en tout (écran de mort)
  shops: Partial<Record<CharacterKey, number[]>>; // paliers achetés par personnage et par ligne (ordre de SHOP.lines) ; absent = zéros (phase 8)
  stats: MetaStats;
  achievements: string[]; // identifiants des succès obtenus
  bought: CharacterKey[]; // personnages achetés en or (phase 6)
  character: CharacterKey;
  outfits: CharacterKey[]; // personnages dont la tenue alternative est achetée (phase 7)
  outfit: Partial<Record<CharacterKey, number>>; // tenue choisie par personnage (0 = classique, absent = 0)
  daily: { date: string; times: number[] }; // défi du jour : date UTC et 10 meilleurs temps
  settings: MetaSettings;
}
const KEY = 'ruee-meta';
export const DEFAULT_META: Meta = {
  version: 2,
  bestTime: 0,
  bestKills: 0,
  runs: 0,
  totalKills: 0,
  muted: false,
  reducedFx: false,
  fxChosen: false,
  gold: 0,
  goldEarned: 0,
  shops: {},
  stats: {
    kills: 0,
    dards: 0,
    elites: 0,
    bosses: 0,
    evolutions: 0,
    wins: 0,
    bestTime: 0,
    runs: 0,
    noHitBest: 0,
    distanceBest: 0,
    evoRunBest: 0,
  },
  achievements: [],
  bought: [],
  character: 'eclaireuse',
  outfits: [],
  outfit: {},
  daily: { date: '', times: [] },
  settings: { vibrate: true, hudScale: 1, lefty: false, lang: 'auto' },
};

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/**
 * Normalise n'importe quel objet (v1, v2, import externe) en Meta v2 valide. Chaque champ est typé et borné :
 * un JSON collé par le joueur ne peut rien injecter d'autre que des nombres, booléens et identifiants connus.
 */
export function normalizeMeta(raw: unknown): Meta {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const st = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Record<string, unknown>;
  const se = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>;
  const da = (r.daily && typeof r.daily === 'object' ? r.daily : {}) as Record<string, unknown>;
  const isKey = (k: unknown): k is CharacterKey => CHARACTERS.some((c) => c.key === k);
  const tiers = (raw: unknown) => {
    const arr = Array.isArray(raw) ? raw : [];
    return SHOP.lines.map((l, i) => Math.max(0, Math.min(l.tiers, num(arr[i]) | 0)));
  };
  // boutique par personnage (phase 8) ; migration : l'ancienne boutique globale `shop` va à l'Éclaireuse
  const shops: Partial<Record<CharacterKey, number[]>> = {};
  if (r.shops && typeof r.shops === 'object') {
    for (const [k, v] of Object.entries(r.shops as Record<string, unknown>))
      if (isKey(k) && Array.isArray(v)) shops[k] = tiers(v);
  } else if (Array.isArray(r.shop)) shops.eclaireuse = tiers(r.shop);
  for (const k of Object.keys(shops) as CharacterKey[]) if (shops[k]!.every((t) => t === 0)) delete shops[k];
  const character = isKey(r.character) ? r.character : 'eclaireuse';
  const outfitSel: Partial<Record<CharacterKey, number>> = {};
  if (r.outfit && typeof r.outfit === 'object')
    for (const [k, v] of Object.entries(r.outfit as Record<string, unknown>)) if (isKey(k) && v === 1) outfitSel[k] = 1;
  const totalKills = Math.max(0, num(r.totalKills));
  const bestTime = Math.max(0, num(r.bestTime));
  const runs = Math.max(0, num(r.runs));
  return {
    version: 2,
    bestTime,
    bestKills: Math.max(0, num(r.bestKills)),
    runs,
    totalKills,
    muted: bool(r.muted, false),
    reducedFx: bool(r.reducedFx, false),
    fxChosen: bool(r.fxChosen, false),
    gold: Math.max(0, num(r.gold)),
    goldEarned: Math.max(0, num(r.goldEarned)),
    shops,
    stats: {
      // migration v1 → v2 : les compteurs cumulés repartent des champs v1 connus
      kills: Math.max(0, num(st.kills, totalKills)),
      dards: Math.max(0, num(st.dards)),
      elites: Math.max(0, num(st.elites)),
      bosses: Math.max(0, num(st.bosses)),
      evolutions: Math.max(0, num(st.evolutions)),
      wins: Math.max(0, num(st.wins)),
      bestTime: Math.max(0, num(st.bestTime, bestTime)),
      runs: Math.max(0, num(st.runs, runs)),
      noHitBest: Math.max(0, num(st.noHitBest)),
      distanceBest: Math.max(0, num(st.distanceBest)),
      evoRunBest: Math.max(0, num(st.evoRunBest) | 0),
    },
    achievements: Array.isArray(r.achievements)
      ? r.achievements.filter((a): a is string => typeof a === 'string' && ACHIEVEMENT_IDS.has(a))
      : [],
    bought: Array.isArray(r.bought) ? r.bought.filter((k): k is CharacterKey => isKey(k) && k !== 'eclaireuse') : [],
    character,
    outfits: Array.isArray(r.outfits) ? r.outfits.filter(isKey) : [],
    outfit: outfitSel,
    daily: {
      date: typeof da.date === 'string' ? da.date.slice(0, 10) : '',
      times: Array.isArray(da.times)
        ? da.times
            .map((t) => num(t))
            .filter((t) => t > 0)
            .slice(0, 10)
        : [],
    },
    settings: {
      vibrate: bool(se.vibrate, true),
      hudScale: [0.85, 1, 1.2].includes(num(se.hudScale, 1)) ? num(se.hudScale, 1) : 1,
      lefty: bool(se.lefty, false),
      lang: LANG_SETTINGS.includes(se.lang as LangSetting) ? (se.lang as LangSetting) : 'auto',
    },
  };
}

/**
 * Lecture synchrone du repli localStorage (saveMeta écrit les deux stockages) : le menu est juste dès le premier
 * affichage, sans attendre IndexedDB. loadMeta() confirme ensuite depuis la source durable.
 */
export function peekMeta(): Meta {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeMeta(JSON.parse(raw));
  } catch {
    /* stockage bloqué */
  }
  return normalizeMeta(DEFAULT_META);
}

export async function loadMeta(): Promise<Meta> {
  try {
    const v = await get<unknown>(KEY);
    if (v) return normalizeMeta(v);
  } catch {
    /* IndexedDB indisponible */
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeMeta(JSON.parse(raw));
  } catch {
    /* stockage bloqué */
  }
  return normalizeMeta(DEFAULT_META);
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignoré */
  }
  set(KEY, m).catch(() => {});
}

/** Export JSON (réglages → « Exporter ») : lisible, versionné. */
export function exportMeta(m: Meta): string {
  return JSON.stringify({ app: 'ruee-nocturne', exported: new Date().toISOString(), meta: m }, null, 1);
}

/** Import depuis un JSON exporté (ou une méta brute). Retourne null si ce n'est pas une sauvegarde. */
export function importMeta(json: string): Meta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const raw = o.app === 'ruee-nocturne' && o.meta && typeof o.meta === 'object' ? o.meta : o.version ? o : null;
  if (!raw) return null;
  return normalizeMeta(raw);
}
