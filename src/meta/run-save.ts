// Phase 49 : la partie en cours, gardée sur l'appareil (jamais dans le compte en ligne, CLAUDE.md règle 8). Écrite de
// façon synchrone dans localStorage, le seul stockage sûr pendant qu'une page se ferme ; si le quota déborde, IndexedDB
// en secours (écriture asynchrone, au mieux). Lue au démarrage pour proposer « Reprendre » au menu.
import { del, get, set } from 'idb-keyval';
import { SNAP_FORMAT, type RunSnap } from '../sim/snapshot';

export const RUN_KEY = 'ruee-run';

/** Ce que main.ts tient hors du monde, et un résumé pour le bouton du menu (sans reconstruire le monde). */
export interface SavedRun {
  v: 1;
  version: string; // version du jeu qui a écrit la sauvegarde
  at: number; // ms
  snap: RunSnap;
  character: string;
  outfit: number;
  daily: boolean;
  day?: string; // défi du jour : jour de la partie (todayKey)
  runStats: { dards: number; elites: number; bosses: number };
  summary: { stage: number; stageT: number; t: number; endless: boolean; kills: number };
}
/** Lecture : une partie à reprendre, une partie d'un format périmé (mise à jour du jeu), ou rien. */
export type RunRead = { run: SavedRun } | { stale: true } | null;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/** IndexedDB au mieux : absent ou bloqué, idb-keyval lève tout de suite (pas seulement par sa promesse). */
function idb<T>(op: () => Promise<T>): Promise<T | undefined> {
  try {
    return op().catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}
const local = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null; // stockage bloqué (navigation privée stricte)
  }
};

/** Valide une sauvegarde lue (texte ou objet). */
export function parseRun(raw: unknown): RunRead {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<SavedRun>;
  if (r.v !== 1 || !r.snap || typeof r.snap !== 'object' || !r.summary || typeof r.character !== 'string') return null;
  if (r.snap.format !== SNAP_FORMAT) return { stale: true };
  return { run: r as SavedRun };
}

/** Écrit la partie. Renvoie faux si aucun stockage n'a pu la prendre tout de suite. */
export function writeRun(run: SavedRun, store: Store | null = local()): boolean {
  const text = JSON.stringify(run);
  try {
    if (store) {
      store.setItem(RUN_KEY, text);
      return true;
    }
  } catch {
    /* quota dépassé : IndexedDB en secours */
  }
  try {
    store?.removeItem(RUN_KEY); // pas d'ancienne partie qui passerait devant la nouvelle à la lecture
  } catch {
    /* ignoré */
  }
  void idb(() => set(RUN_KEY, text));
  return false;
}

/** Lecture synchrone (localStorage seulement) : le menu est juste dès son premier affichage. */
export function peekRun(store: Store | null = local()): RunRead {
  try {
    return parseRun(store?.getItem(RUN_KEY) ?? null);
  } catch {
    return null;
  }
}

/** Lecture complète : localStorage, sinon IndexedDB (partie trop grosse pour le premier). */
export async function readRun(store: Store | null = local()): Promise<RunRead> {
  const quick = peekRun(store);
  if (quick) return quick;
  return parseRun((await idb(() => get<unknown>(RUN_KEY))) ?? null);
}

/** Oublie la partie (finie, abandonnée, ou remplacée par une nouvelle). */
export function clearRun(store: Store | null = local()): void {
  try {
    store?.removeItem(RUN_KEY);
  } catch {
    /* ignoré */
  }
  void idb(() => del(RUN_KEY));
}
