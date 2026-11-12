// Phase 49 (demande de Jimmy : « une partie en cours, même si on rafraîchit la page ou qu'on ferme l'app, on garde en
// mémoire qu'on est en partie ») : instantané d'un World, et World reconstruit à partir de lui. Module pur, sans DOM.
//
// La carte n'est pas sauvegardée : buildMapFor(seed) la refait à l'identique à partir de sa seule graine (test
// stages.test.ts « carte identique »). On garde tout le reste, champ par champ, de façon générique : un champ ajouté
// plus tard au World est sauvegardé sans y penser, et snapshot.test.ts échoue si un champ ne sait pas se copier.
//
// Après une mise à jour du jeu, la restauration tolère les écarts : un champ absent de la sauvegarde garde sa valeur
// neuve, un champ inconnu est ignoré. SNAP_FORMAT ne monte que si un changement rend les anciennes sauvegardes fausses.
import { refreshStats } from './weapons/defs';
import { World } from './world';

export const SNAP_FORMAT = 1;

/** Champs refaits par buildMapFor (carte du monde courant), refaits à chaque pas, ou recalculés : jamais sauvegardés. */
export const MAP_FIELDS: ReadonlySet<string> = new Set([
  'seed',
  'obstacles',
  'treeCount',
  'rockEnd',
  'stoneEnd',
  'propKinds',
  'decor',
  'yards',
  'camps',
  'walls',
  'places',
  'stoneCenters',
  'lakes',
  'woods',
  'plateaus',
  'ramps',
  'combes',
  'pistes',
  'kickers',
  'obstacleGrid',
  'wallGrid',
  'height',
  'solidN',
  'solid',
  'near',
  'grid', // grille spatiale des ennemis : refaite au début de chaque pas
  'events', // vidés au début de chaque pas
  'eventCount',
  'wstats', // recalculées par refreshStats
]);
/** Champs à part : leur état est privé (Rng, FlowField). */
const SPECIAL_FIELDS: ReadonlySet<string> = new Set(['rng', 'flow']);
/** Réserves préremplies jusqu'aux plafonds : seuls les `count` premiers éléments sont vivants, et leur ordre compte. */
const POOLS: Record<string, string> = {
  enemies: 'enemyCount',
  projs: 'projCount',
  shots: 'shotCount',
  gems: 'gemCount',
  chests: 'chestCount',
  powers: 'powerCount',
};
/** Dictionnaires dont les clés varient (armes et tomes possédés) : remplacés, pas fusionnés. */
const REPLACED: ReadonlySet<string> = new Set(['weapons', 'tomes']);

export interface RunSnap {
  format: number;
  startSeed: number;
  seed: number; // graine de la carte du monde courant
  rng: number;
  flow: ReturnType<World['flow']['save']>;
  fields: Record<string, unknown>;
}

type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;
const TYPED: Record<string, new (n: number) => TypedArray> = {
  Int8Array,
  Uint8Array,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
};
const isTyped = (v: unknown): v is TypedArray => ArrayBuffer.isView(v) && !(v instanceof DataView);
const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;

/** Valeur du World → valeur JSON (tableaux typés, Set, -0 et infinis marqués). Lève sur un type inconnu. */
function encode(v: unknown, path: string): unknown {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { $n: 'NaN' };
    if (!Number.isFinite(v)) return { $n: v > 0 ? 'Inf' : '-Inf' };
    return Object.is(v, -0) ? { $n: '-0' } : v;
  }
  if (typeof v === 'string' || typeof v === 'boolean' || v === null || v === undefined) return v ?? null;
  if (isTyped(v)) {
    const out = new Array<unknown>(v.length);
    for (let i = 0; i < v.length; i++) out[i] = encode(v[i], path);
    return { $ta: v.constructor.name, d: out };
  }
  if (v instanceof Set) return { $set: Array.from(v, (x) => encode(x, path)) };
  if (Array.isArray(v)) return v.map((x, i) => encode(x, `${path}[${i}]`));
  if (isPlain(v)) {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v)) o[k] = encode(v[k], `${path}.${k}`);
    return o;
  }
  throw new Error(`instantané : « ${path} » n'est pas une donnée simple (${Object.prototype.toString.call(v)})`);
}

/** Valeur JSON → valeur neuve (sans cible existante). */
function decode(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (isPlain(v)) {
    if (typeof v.$n === 'string') return v.$n === 'NaN' ? NaN : v.$n === 'Inf' ? Infinity : v.$n === '-Inf' ? -Infinity : -0;
    if (typeof v.$ta === 'string' && Array.isArray(v.d)) {
      const C = TYPED[v.$ta] ?? Float64Array;
      const a = new C(v.d.length);
      for (let i = 0; i < v.d.length; i++) a[i] = decode(v.d[i]) as number;
      return a;
    }
    if (Array.isArray(v.$set)) return new Set(v.$set.map(decode));
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v)) o[k] = decode(v[k]);
    return o;
  }
  return v;
}

/**
 * Écrit la valeur sauvegardée `src` dans la valeur existante `cur` quand c'est possible (tableau typé, objet, élément de
 * liste) : les objets gardent leur forme (V8) et les références tenues ailleurs. Renvoie la valeur à affecter.
 */
function merge(cur: unknown, src: unknown): unknown {
  if (isTyped(cur) && isPlain(src) && typeof src.$ta === 'string' && Array.isArray(src.d)) {
    const n = Math.min(cur.length, src.d.length); // une autre version a pu changer la taille : on garde le commun
    for (let i = 0; i < n; i++) cur[i] = decode(src.d[i]) as number;
    return cur;
  }
  if (isPlain(cur) && isPlain(src) && src.$ta === undefined && src.$set === undefined && src.$n === undefined) {
    for (const k of Object.keys(src)) if (k in cur) cur[k] = merge(cur[k], src[k]); // champ inconnu : ignoré
    return cur;
  }
  if (Array.isArray(cur) && Array.isArray(src) && cur.length === src.length && cur.every(isPlain)) {
    for (let i = 0; i < cur.length; i++) merge(cur[i], src[i]); // lieux de la carte : même nombre, même place
    return cur;
  }
  return decode(src);
}

/** Instantané JSON du monde (à passer à JSON.stringify). */
export function snapshotWorld(w: World): RunSnap {
  const fields: Record<string, unknown> = {};
  const rec = w as unknown as Record<string, unknown>;
  for (const k of Object.keys(w)) {
    if (MAP_FIELDS.has(k) || SPECIAL_FIELDS.has(k)) continue;
    const v = rec[k];
    if (k in POOLS) {
      const n = rec[POOLS[k]] as number;
      fields[k] = (v as unknown[]).slice(0, n).map((x, i) => encode(x, `${k}[${i}]`));
    } else fields[k] = encode(v, k);
  }
  return { format: SNAP_FORMAT, startSeed: w.startSeed, seed: w.seed, rng: w.rng.state(), flow: w.flow.save(), fields };
}

/** World reconstruit : carte du monde courant refaite, puis état de la partie réécrit par-dessus. */
export function restoreWorld(s: RunSnap): World {
  if (s.format !== SNAP_FORMAT) throw new Error(`instantané au format ${s.format}, attendu ${SNAP_FORMAT}`);
  const w = new World(s.startSeed);
  if (s.seed !== w.seed) w.buildMapFor(s.seed);
  const rec = w as unknown as Record<string, unknown>;
  for (const k of Object.keys(s.fields)) {
    if (!(k in rec) || MAP_FIELDS.has(k) || SPECIAL_FIELDS.has(k)) continue; // champ d'une autre version
    const src = s.fields[k];
    if (k in POOLS) {
      const pool = rec[k] as unknown[];
      const items = src as unknown[];
      const n = Math.min(items.length, pool.length);
      for (let i = 0; i < n; i++) merge(pool[i], items[i]);
      rec[POOLS[k]] = n;
    } else if (REPLACED.has(k)) rec[k] = decode(src);
    else rec[k] = merge(rec[k], src);
  }
  w.rng.setState(s.rng);
  w.flow.load(s.flow);
  w.eventCount = 0;
  refreshStats(w);
  return w;
}

