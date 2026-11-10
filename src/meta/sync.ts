// Synchronisation de la progression sur le compte du joueur (phase 13). Module pur : aucun DOM, aucun Firebase.
// La frontière progression / appareil est la même que celle de resetProgress() : le son, les effets et les réglages
// restent sur l'appareil ; tout le reste est la progression, écrite dans Firestore `saves/{uid}` par src/platform/account.ts.
import { DEFAULT_META, normalizeMeta } from './save';
import type { Meta } from './save';
import { SLOTS_START } from '../sim/balance';

/** Clés de Meta qui ne quittent jamais l'appareil. */
export const DEVICE_KEYS = ['muted', 'reducedFx', 'fxChosen', 'settings', 'seenReset', 'seenHelp'] as const;
export type DeviceKey = (typeof DEVICE_KEYS)[number];
export type Progress = Omit<Meta, DeviceKey>;
/** Clés synchronisées : tout Meta sauf DEVICE_KEYS. firestore.rules les liste une à une (test de non-dérive). */
export const PROGRESS_KEYS = (Object.keys(DEFAULT_META) as (keyof Meta)[]).filter(
  (k) => !(DEVICE_KEYS as readonly string[]).includes(k),
) as (keyof Progress)[];

/** Document stocké dans le nuage : `progress` est validé par normalizeMeta à la lecture, jamais cru. */
export interface CloudDoc {
  v: 1;
  updatedAt: number; // ms, horloge de l'appareil qui a écrit
  progress: unknown;
}
export const CLOUD_DOC_VERSION = 1;

/** Ce que l'appareil sait de sa dernière synchronisation (localStorage `ruee-sync`). */
export interface SyncRecord {
  uid: string;
  base: number | null; // updatedAt du document nuage sur lequel l'appareil s'est aligné ; null = jamais
  dirty: boolean; // la progression locale a changé depuis `base`
  changedAt: number; // ms, dernier changement local
}
export const SYNC = {
  debounceMs: 2000,
  // 1.36.1 : envoi raté alors que l'appareil se croit en ligne (wifi sans internet, serveur injoignable) : on
  // réessaie seul, de plus en plus espacé, tant que la progression locale n'est pas partie
  retryMs: [5000, 15000, 30000, 60000, 120000, 300000],
  key: 'ruee-sync',
  accountKey: 'ruee-account',
  redirectKey: 'ruee-auth-redirect',
};

export type Decision = 'none' | 'push' | 'pull' | 'adopt' | 'ask';

export function progressOf(m: Meta): Progress {
  const p: Record<string, unknown> = {};
  for (const k of PROGRESS_KEYS) p[k] = m[k];
  return p as Progress;
}

/** Progression reçue (nuage, autre appareil) appliquée sur la méta locale : normalisée et bornée, réglages locaux gardés. */
export function withProgress(local: Meta, raw: unknown): Meta {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return normalizeMeta({
    ...r,
    // sans version, la progression est v3 au moins par construction (pas de remise à zéro) ; une v4 venue d'un ancien
    // client passe par la migration de la phase 40
    version: typeof r.version === 'number' && r.version >= 3 ? r.version : 4,
    muted: local.muted,
    reducedFx: local.reducedFx,
    fxChosen: local.fxChosen,
    settings: local.settings,
    seenReset: local.seenReset,
    seenHelp: local.seenHelp,
  });
}

export function sameProgress(a: Meta, b: Meta): boolean {
  return JSON.stringify(progressOf(a)) === JSON.stringify(progressOf(b));
}

/** Le joueur a-t-il quelque chose à perdre ? (choisir un personnage n'est pas une progression) */
export function hasProgress(m: Meta): boolean {
  return (
    m.runs > 0 ||
    m.goldEarned > 0 ||
    m.gold > 0 ||
    m.stats.kills > 0 ||
    m.achievements.length > 0 ||
    m.bought.length > 0 ||
    m.outfits.length > 0 ||
    m.slots.weapons > SLOTS_START.weapons ||
    m.slots.passives > SLOTS_START.passives
  );
}

/** Résumé pour l'écran de choix « cet appareil / mon compte ». */
export function summary(m: Meta): { time: number; gold: number; runs: number } {
  return { time: m.bestTime, gold: Math.round(m.gold), runs: m.runs };
}

export function toCloudDoc(m: Meta, now: number): CloudDoc {
  return { v: CLOUD_DOC_VERSION, updatedAt: Math.floor(now), progress: progressOf(m) };
}

/** Document lu dans le nuage : forme vérifiée, contenu de `progress` laissé à withProgress. */
export function fromCloudDoc(raw: unknown): CloudDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== CLOUD_DOC_VERSION) return null;
  if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;
  if (!o.progress || typeof o.progress !== 'object') return null;
  return { v: CLOUD_DOC_VERSION, updatedAt: o.updatedAt, progress: o.progress };
}

/**
 * Décision à trois versions (base / local / nuage), voir PLAN.md §4.7 :
 * - pas de document : push (le compte reçoit la sauvegarde, même vierge) ;
 * - premier login sur cet appareil : pull si rien en local, adopt si identique, sinon on demande au joueur ;
 * - nuage inchangé depuis la base : push si le local a bougé, sinon rien ;
 * - nuage changé : pull si le local est propre, sinon la plus récente gagne.
 */
export function decide(local: Meta, cloud: CloudDoc | null, rec: SyncRecord | null, uid: string): Decision {
  if (!cloud) return 'push';
  const first = !rec || rec.uid !== uid || rec.base === null;
  if (first) {
    if (!hasProgress(local)) return 'pull';
    if (sameProgress(local, withProgress(local, cloud.progress))) return 'adopt';
    return 'ask';
  }
  if (cloud.updatedAt === rec.base) return rec.dirty ? 'push' : 'none';
  if (!rec.dirty) return 'pull';
  return cloud.updatedAt > rec.changedAt ? 'pull' : 'push';
}

export function loadSyncRecord(): SyncRecord | null {
  try {
    const raw = localStorage.getItem(SYNC.key);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o.uid !== 'string') return null;
    return {
      uid: o.uid,
      base: typeof o.base === 'number' && Number.isFinite(o.base) ? o.base : null,
      dirty: o.dirty === true,
      changedAt: typeof o.changedAt === 'number' && Number.isFinite(o.changedAt) ? o.changedAt : 0,
    };
  } catch {
    return null;
  }
}

export function saveSyncRecord(rec: SyncRecord | null): void {
  try {
    if (rec) localStorage.setItem(SYNC.key, JSON.stringify(rec));
    else localStorage.removeItem(SYNC.key);
  } catch {
    /* stockage bloqué */
  }
}
