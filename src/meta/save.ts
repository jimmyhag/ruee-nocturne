// Sauvegarde méta : IndexedDB via idb-keyval, repli localStorage, jamais bloquante.
// v2 (phase 4) : or, boutique, compteurs cumulés, succès, personnage, défi du jour, réglages. Migration depuis v1.
import { cleanPseudo } from './board';
import { normalizeBinds } from '../platform/keymap';
import type { KeyBinds } from '../platform/keymap';
import { get, set } from 'idb-keyval';
import {
  CHARACTERS,
  ITEM_KEYS,
  ITEM_RARITY,
  MAX_PASSIVES,
  MAX_WEAPONS,
  REROLL_SHOP,
  SLOTS_START,
  UNLOCK,
} from '../sim/balance';
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, UNLOCKABLE } from './achievements';
import { normalizeChars } from './chars';
import type { CharStats } from './chars';
import type { CharacterKey, ItemKey } from '../sim/types';
import { LANG_SETTINGS } from '../i18n';
import type { LangSetting } from '../i18n';

/** Compteurs cumulés sur tous les runs : la matière des succès (src/meta/achievements.ts). */
export interface MetaStats {
  kills: number;
  dards: number;
  elites: number;
  bosses: number;
  triples: number; // cartes à 3 lignes prises (phase 12)
  wins: number;
  bestTime: number; // s
  runs: number;
  // défis (phase 6) : meilleurs scores en un seul run
  noHitBest: number; // s sans dégât
  distanceBest: number; // u parcourus
  weaponLvBest: number; // meilleur niveau d'arme (améliorations) en un run (phase 12)
  // phase 28 : glisse, figures, exploration (succès qui débloquent la Faux, la Lance, les Météores)
  slideDist: number; // u glissés, cumulés
  tricksBest: number; // vrilles réussies en un run (meilleur)
  mapChests: number; // coffres de carte ouverts, cumulés
  bestStage: number; // phase 37 : meilleur monde atteint (1..3 ; 4 = les trois mondes terminés)
  endlessBest: number; // phase 39 : meilleur temps tenu en monde infini (s)
}
export interface MetaSettings {
  vibrate: boolean;
  hudScale: number; // 0.85 | 1 | 1.2
  lefty: boolean;
  lang: LangSetting; // 'auto' : langue du navigateur (phase 5)
  quality: QualitySetting; // phase 9 : 'auto' = net avec repli automatique si l'appareil ne suit pas, 'net', 'pixel'
  sfxVol: number; // phase 36 : volume des effets (0–1)
  musicVol: number; // phase 36 : volume de la musique (0–1)
  keys: KeyBinds; // 1.40.0 : touches du clavier choisies par le joueur (actions modifiées seulement)
}
export interface Meta {
  version: 5; // 3 (phase 10) : progression remise à zéro, emplacements ; 4 (phase 17) : boutique par personnage retirée, or rendu ; 5 (phase 40) : Bibliothèque
  bestTime: number;
  bestKills: number;
  runs: number;
  totalKills: number;
  muted: boolean;
  reducedFx: boolean;
  fxChosen: boolean; // true dès que le joueur a touché au réglage : sinon `prefers-reduced-motion` décide
  gold: number; // or disponible (boutique)
  goldEarned: number; // or gagné en tout (écran de mort)
  stats: MetaStats;
  achievements: string[]; // identifiants des succès obtenus
  bought: CharacterKey[]; // personnages achetés en or (phase 6)
  character: CharacterKey;
  outfits: CharacterKey[]; // personnages dont la tenue alternative est achetée (phase 7)
  outfit: Partial<Record<CharacterKey, number>>; // tenue choisie par personnage (0 = classique, absent = 0)
  daily: { date: string; times: number[] }; // défi du jour : date UTC et 10 meilleurs temps
  slots: { weapons: number; passives: number; rerolls: number }; // phase 31 : `rerolls` = relances achetées (rangées ici : les règles Firestore bornent les clés de progress) ; emplacements débloqués (phase 10), communs à tous les personnages ; `passives` = tomes depuis la phase 12 (nom gardé : sauvegarde)
  unlocks: string[]; // phase 40 : armes et objets achetés dans la Bibliothèque ('w:faux', 'i:phenix')
  itemsOff: ItemKey[]; // phase 40 : objets retirés du tirage par le joueur
  chars: Partial<Record<CharacterKey, CharStats>>; // phase 41 : stats par personnage (défis par personnage)
  codex: Record<string, number>; // phase 40 : parties jouées avec chaque entrée ('w:orbe', 'i:croc', 't:degats', 's:orage')
  pseudo: string; // phase 38 : nom affiché dans le classement en ligne ('' = aucun, rien n'est publié) ; synchronisé
  seenReset: boolean; // bannière « nouvelle progression » déjà vue (false seulement après migration d'une sauvegarde < 3)
  seenHelp: boolean; // aide « Comment jouer » déjà vue au premier lancement (phase 14 ; propre à l'appareil)
  settings: MetaSettings;
}
/** Rendu (phase 9) : auto (net, repli automatique), net, pixel (résolution réduite, look d'origine). */
export type QualitySetting = 'auto' | 'net' | 'pixel';
export const QUALITY_SETTINGS: readonly QualitySetting[] = ['auto', 'net', 'pixel'];
const KEY = 'ruee-meta';
export const DEFAULT_META: Meta = {
  version: 5,
  bestTime: 0,
  bestKills: 0,
  runs: 0,
  totalKills: 0,
  muted: false,
  reducedFx: false,
  fxChosen: false,
  gold: 0,
  goldEarned: 0,
  stats: {
    kills: 0,
    dards: 0,
    elites: 0,
    bosses: 0,
    triples: 0,
    wins: 0,
    bestTime: 0,
    runs: 0,
    noHitBest: 0,
    distanceBest: 0,
    weaponLvBest: 0,
    slideDist: 0,
    tricksBest: 0,
    mapChests: 0,
    bestStage: 0,
    endlessBest: 0,
  },
  achievements: [],
  bought: [],
  character: 'eclaireuse',
  outfits: [],
  outfit: {},
  daily: { date: '', times: [] },
  slots: { ...SLOTS_START, rerolls: 0 },
  unlocks: [],
  itemsOff: [],
  codex: {},
  chars: {},
  pseudo: '',
  seenReset: true,
  seenHelp: false,
  settings: {
    vibrate: true,
    hudScale: 1,
    lefty: false,
    lang: 'auto',
    quality: 'auto',
    sfxVol: 1,
    musicVol: 0.7,
    keys: {},
  },
};

/** Réglages normalisés seuls (conservés par la remise à zéro et la migration). */
function normalizeSettings(se: Record<string, unknown>): MetaSettings {
  return {
    vibrate: bool(se.vibrate, true),
    hudScale: [0.85, 1, 1.2].includes(num(se.hudScale, 1)) ? num(se.hudScale, 1) : 1,
    lefty: bool(se.lefty, false),
    lang: LANG_SETTINGS.includes(se.lang as LangSetting) ? (se.lang as LangSetting) : 'auto',
    quality: QUALITY_SETTINGS.includes(se.quality as QualitySetting) ? (se.quality as QualitySetting) : 'auto',
    sfxVol: Math.max(0, Math.min(1, num(se.sfxVol, 1))),
    musicVol: Math.max(0, Math.min(1, num(se.musicVol, 0.7))),
    keys: normalizeBinds(se.keys),
  };
}

/** Remise à zéro de la progression : tout repart de DEFAULT_META sauf ce qui relève de l'appareil (son, effets, réglages). */
export function resetProgress(m: Meta): Meta {
  return normalizeMeta({
    ...DEFAULT_META,
    muted: m.muted,
    reducedFx: m.reducedFx,
    fxChosen: m.fxChosen,
    settings: m.settings,
    seenHelp: m.seenHelp,
  });
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * Boutique par personnage d'avant la phase 17 : 8 lignes, paliers à 200 × 1,3^t (la dernière, la réanimation, un seul
 * palier). Sert seulement à rendre l'or dépensé. Exporté pour les tests.
 */
export const LEGACY_SHOP = { base: 200, growth: 1.3, tiers: [8, 8, 8, 8, 8, 8, 8, 1] };
export function legacyShopSpent(raw: unknown): number {
  const arr = Array.isArray(raw) ? raw : [];
  let spent = 0;
  for (let l = 0; l < LEGACY_SHOP.tiers.length; l++) {
    const n = Math.max(0, Math.min(LEGACY_SHOP.tiers[l], num(arr[l]) | 0));
    for (let t = 0; t < n; t++) spent += Math.round(LEGACY_SHOP.base * Math.pow(LEGACY_SHOP.growth, t));
  }
  return spent;
}
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/**
 * Normalise n'importe quel objet (v1, v2, import externe) en Meta v2 valide. Chaque champ est typé et borné :
 * un JSON collé par le joueur ne peut rien injecter d'autre que des nombres, booléens et identifiants connus.
 */
export function normalizeMeta(raw: unknown): Meta {
  const r0 = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  // phase 10 : une sauvegarde d'avant la version 3 (nouvelle progression) est remise à zéro, réglages conservés ;
  // la bannière « nouvelle progression » s'affiche une fois si elle avait du vécu
  const r: Record<string, unknown> =
    num(r0.version) < 3
      ? {
          ...DEFAULT_META,
          muted: r0.muted,
          reducedFx: r0.reducedFx,
          fxChosen: r0.fxChosen,
          settings: r0.settings,
          seenReset: !(num(r0.runs) > 0 || num(r0.gold) > 0),
          seenHelp: r0.seenHelp,
        }
      : r0;
  const st = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Record<string, unknown>;
  const se = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>;
  const da = (r.daily && typeof r.daily === 'object' ? r.daily : {}) as Record<string, unknown>;
  const sl = (r.slots && typeof r.slots === 'object' ? r.slots : {}) as Record<string, unknown>;
  const isKey = (k: unknown): k is CharacterKey => CHARACTERS.some((c) => c.key === k);
  // phase 17 : la boutique par personnage (phase 8) est retirée ; tout l'or dépensé en paliers est rendu (une fois :
  // la sauvegarde normalisée n'a plus de `shops`). L'ancienne boutique globale `shop` (avant la phase 8) aussi.
  let refund = 0;
  if (r.shops && typeof r.shops === 'object') {
    for (const [k, v] of Object.entries(r.shops as Record<string, unknown>)) if (isKey(k)) refund += legacyShopSpent(v);
  } else if (Array.isArray(r.shop)) refund += legacyShopSpent(r.shop);
  const character = isKey(r.character) ? r.character : 'eclaireuse';
  const outfitSel: Partial<Record<CharacterKey, number>> = {};
  if (r.outfit && typeof r.outfit === 'object')
    for (const [k, v] of Object.entries(r.outfit as Record<string, unknown>))
      if (isKey(k) && (v === 1 || v === 2)) outfitSel[k] = v; // phase 41 : 2 = tenue de maître
  const totalKills = Math.max(0, num(r.totalKills));
  const bestTime = Math.max(0, num(r.bestTime));
  const runs = Math.max(0, num(r.runs));
  const achievements = Array.isArray(r.achievements)
    ? r.achievements.filter((a): a is string => typeof a === 'string' && ACHIEVEMENT_IDS.has(a))
    : [];
  return {
    version: 5,
    bestTime,
    bestKills: Math.max(0, num(r.bestKills)),
    runs,
    totalKills,
    muted: bool(r.muted, false),
    reducedFx: bool(r.reducedFx, false),
    fxChosen: bool(r.fxChosen, false),
    gold: Math.max(0, num(r.gold)) + refund,
    goldEarned: Math.max(0, num(r.goldEarned)),
    stats: {
      // migration v1 → v2 : les compteurs cumulés repartent des champs v1 connus
      kills: Math.max(0, num(st.kills, totalKills)),
      dards: Math.max(0, num(st.dards)),
      elites: Math.max(0, num(st.elites)),
      bosses: Math.max(0, num(st.bosses)),
      triples: Math.max(0, num(st.triples)),
      wins: Math.max(0, num(st.wins)),
      bestTime: Math.max(0, num(st.bestTime, bestTime)),
      runs: Math.max(0, num(st.runs, runs)),
      noHitBest: Math.max(0, num(st.noHitBest)),
      distanceBest: Math.max(0, num(st.distanceBest)),
      weaponLvBest: Math.max(0, num(st.weaponLvBest) | 0),
      slideDist: Math.max(0, num(st.slideDist)),
      tricksBest: Math.max(0, num(st.tricksBest) | 0),
      mapChests: Math.max(0, num(st.mapChests) | 0),
      bestStage: Math.max(0, Math.min(4, num(st.bestStage) | 0)),
      endlessBest: Math.max(0, num(st.endlessBest) | 0),
    },
    achievements,
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
    unlocks: normalizeUnlocks(r, runs, achievements),
    itemsOff: Array.isArray(r.itemsOff)
      ? [
          ...new Set(
            r.itemsOff.filter(
              (k): k is ItemKey => ITEM_KEYS.includes(k as ItemKey) && ITEM_RARITY[ITEM_KEYS.indexOf(k as ItemKey)] > 0,
            ),
          ),
        ]
      : [],
    codex: normalizeCodex(r.codex),
    chars: normalizeChars(r.chars),
    pseudo: cleanPseudo(r.pseudo),
    settings: normalizeSettings(se),
    slots: {
      weapons: Math.max(SLOTS_START.weapons, Math.min(MAX_WEAPONS, num(sl.weapons, SLOTS_START.weapons) | 0)),
      passives: Math.max(SLOTS_START.passives, Math.min(MAX_PASSIVES, num(sl.passives, SLOTS_START.passives) | 0)),
      rerolls: Math.max(0, Math.min(REROLL_SHOP.length, num(sl.rerolls, 0) | 0)),
    },
    seenReset: bool(r.seenReset, true),
    seenHelp: bool(r.seenHelp, false),
  };
}

/**
 * Achats de la Bibliothèque (phase 40), filtrés sur les clés connues. Une sauvegarde d'avant la phase 40 (version < 5)
 * qui a déjà joué ne perd rien : elle reçoit tous les objets désormais verrouillés et les armes dont le succès était
 * obtenu (elles étaient données par le succès seul).
 */
function normalizeUnlocks(r: Record<string, unknown>, runs: number, achievements: string[]): string[] {
  const out = new Set(
    Array.isArray(r.unlocks) ? r.unlocks.filter((k): k is string => typeof k === 'string' && UNLOCKABLE.has(k)) : [],
  );
  if (num(r.version) < 5 && runs > 0)
    for (const a of ACHIEVEMENTS) {
      if (a.unlocks?.item) out.add(`i:${a.unlocks.item}`);
      if (a.unlocks?.weapon && achievements.includes(a.id)) out.add(`w:${a.unlocks.weapon}`);
    }
  return [...out];
}
const CODEX_KEY = /^[wits]:[a-z]{1,16}$/;
/** Compteurs de la Bibliothèque : clés de forme connue, entiers bornés, 160 entrées au plus (règles Firestore). */
function normalizeCodex(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!CODEX_KEY.test(k) || n >= 160) continue;
    const c = Math.min(UNLOCK.codexMax, Math.max(0, Math.floor(num(v))));
    if (c > 0) {
      out[k] = c;
      n++;
    }
  }
  return out;
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

let onSaved: ((m: Meta) => void) | null = null;
/** Un seul écouteur, appelé après chaque saveMeta : la synchronisation du compte (phase 13) s'y branche. */
export function onMetaSaved(cb: ((m: Meta) => void) | null): void {
  onSaved = cb;
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignoré */
  }
  set(KEY, m).catch(() => {});
  onSaved?.(m);
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
