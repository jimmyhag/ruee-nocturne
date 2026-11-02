// Sauvegarde méta : IndexedDB via idb-keyval, repli localStorage, jamais bloquante.
import { get, set } from 'idb-keyval';

export interface Meta {
  version: 1;
  bestTime: number;
  bestKills: number;
  runs: number;
  totalKills: number;
  muted: boolean;
  reducedFx: boolean;
}
const KEY = 'ruee-meta';
export const DEFAULT_META: Meta = { version: 1, bestTime: 0, bestKills: 0, runs: 0, totalKills: 0, muted: false, reducedFx: false };

export async function loadMeta(): Promise<Meta> {
  try {
    const v = await get<Meta>(KEY);
    if (v && v.version === 1) return { ...DEFAULT_META, ...v };
  } catch {
    /* IndexedDB indisponible */
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_META, ...(JSON.parse(raw) as Meta) };
  } catch {
    /* stockage bloqué */
  }
  return { ...DEFAULT_META };
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignoré */
  }
  set(KEY, m).catch(() => {});
}
