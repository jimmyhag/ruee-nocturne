// Lot L1 (décision de Jimmy, 17 nov. 2026) : mesure anonyme de la rétention, seulement avec l'accord du joueur.
// Module pur, ni DOM ni Firebase : l'état local (`ruee-retention`, hors de Meta), le document Firestore `retention/{id}`
// et le tableau D1/D7/D30 que lit `npm run retention`. src/platform/retention.ts écrit ce document par l'API REST.
// Forme et raisons : docs/specs/l1-mesure-retention.md.
import { isoWeek } from './board';

/** Bornes communes au client, aux règles Firestore (un test vérifie qu'elles y figurent) et au script de lecture. */
export const RETENTION = {
  key: 'ruee-retention', // localStorage : réglage propre à l'appareil, jamais dans la sauvegarde ni la synchronisation
  lastDay: 30, // plus aucune écriture après J30
  keepDays: 90, // expiration x = cohorte + 90 jours (règle TTL de Firestore)
  days: [1, 7, 30] as const, // colonnes du tableau
  idLength: 36, // crypto.randomUUID()
};
const DAY_MS = 86_400_000;

/** Jour UTC, en jours depuis le 1er janvier 1970. */
export const dayOf = (ms: number): number => Math.floor(ms / DAY_MS);

export type Consent = 'yes' | 'no' | null;
/** État local. `o` : jours d'ouverture en décalage depuis `c` ; `sent` : combien d'entrées de `o` le serveur a reçues. */
export interface RetentionState {
  consent: Consent;
  id: string | null;
  c: number;
  f: boolean;
  o: number[];
  sent: number;
}
/** Ce qui part, et rien d'autre (l'identifiant n'est que dans l'URL). `x` : expiration, en ms. */
export interface RetentionDoc {
  c: number;
  f: boolean;
  o: number[];
  x: number;
}

const blank = (consent: Consent): RetentionState => ({ consent, id: null, c: 0, f: false, o: [], sent: 0 });
/** Refus ou retrait : plus d'identifiant, plus rien à envoyer. */
export const refusedState = (): RetentionState => blank('no');

const isDay = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= RETENTION.lastDay;

/** Relit l'état stocké ; tout ce qui est illisible vaut « pas encore de réponse ». */
export function readState(raw: string | null): RetentionState {
  let o: Record<string, unknown>;
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return blank(null);
    o = v as Record<string, unknown>;
  } catch {
    return blank(null);
  }
  if (o.consent === 'no') return blank('no');
  if (o.consent !== 'yes' || typeof o.id !== 'string' || o.id.length !== RETENTION.idLength || !Number.isInteger(o.c))
    return blank(null);
  const days = Array.isArray(o.o) ? [...new Set(o.o.filter(isDay))].sort((a, b) => a - b) : [];
  const sent = Number.isInteger(o.sent) ? Math.min(Math.max(o.sent as number, 0), days.length) : 0;
  return { consent: 'yes', id: o.id, c: o.c as number, f: o.f === true, o: days, sent };
}

/** Accord : nouvel identifiant, cohorte du jour, nouveau joueur s'il avait fini au plus une partie ; le jour compte. */
export function acceptState(id: string, today: number, runs: number): RetentionState {
  return { consent: 'yes', id, c: today, f: runs <= 1, o: [0], sent: 0 };
}

/** Ouverture de l'app : note le jour (J0 à J30). Vrai si l'état a changé. */
export function markOpen(s: RetentionState, today: number): boolean {
  if (s.consent !== 'yes' || !s.id) return false;
  const d = today - s.c;
  if (!isDay(d) || s.o.includes(d)) return false;
  s.o.push(d);
  s.o.sort((a, b) => a - b);
  return true;
}

/** Un envoi est dû : accord, au plus J30, et des jours que le serveur n'a pas encore. */
export function shouldSend(s: RetentionState, today: number): boolean {
  return s.consent === 'yes' && s.id !== null && isDay(today - s.c) && s.sent < s.o.length;
}

export function docOf(s: RetentionState): RetentionDoc {
  return { c: s.c, f: s.f, o: s.o.slice(), x: (s.c + RETENTION.keepDays) * DAY_MS };
}

/** Valeurs de l'API REST de Firestore (seules celles qu'utilise ce document). */
interface Value {
  integerValue?: string;
  booleanValue?: boolean;
  timestampValue?: string;
  arrayValue?: { values?: Value[] };
}
export type Fields = Record<string, Value | undefined>;

/** Corps de la requête PATCH (document entier : c, f, o, x). */
export function toFirestore(d: RetentionDoc): { fields: Fields } {
  return {
    fields: {
      c: { integerValue: String(d.c) },
      f: { booleanValue: d.f },
      o: { arrayValue: { values: d.o.map((n) => ({ integerValue: String(n) })) } },
      x: { timestampValue: new Date(d.x).toISOString() },
    },
  };
}

/** Lecture (script de Jimmy) : null si le document n'a pas la forme attendue. */
export function fromFirestore(f: Fields): RetentionDoc | null {
  const c = Number(f.c?.integerValue);
  const x = Date.parse(f.x?.timestampValue ?? '');
  const vals = f.o?.arrayValue ? (f.o.arrayValue.values ?? []) : null;
  if (!Number.isInteger(c) || !Number.isFinite(x) || typeof f.f?.booleanValue !== 'boolean' || !vals) return null;
  return { c, f: f.f.booleanValue, o: vals.map((v) => Number(v.integerValue)).filter(isDay), x };
}

/** URL REST du document (clé d'API web dans l'URL, sans SDK : décision 6). */
export function docUrl(projectId: string, apiKey: string, id: string): string {
  return (
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/` +
    `retention/${encodeURIComponent(id)}?key=${encodeURIComponent(apiKey)}`
  );
}

/** Une case du tableau : nombre de joueurs, puis D1, D7, D30 en % (null : cohorte trop jeune). */
export interface Cell {
  n: number;
  d: (number | null)[];
}
export interface CohortRow {
  week: string; // semaine ISO de la cohorte
  all: Cell;
  fresh: Cell; // f = vrai : les nouveaux joueurs
}

function cell(docs: RetentionDoc[], today: number): Cell {
  return {
    n: docs.length,
    d: RETENTION.days.map((n) => {
      // Dn : parmi les joueurs d'au moins n jours, ceux qui ont ouvert le jeu le jour n exactement (décision 11)
      let old = 0;
      let open = 0;
      for (const doc of docs)
        if (today - doc.c >= n) {
          old++;
          if (doc.o.includes(n)) open++;
        }
      return old ? Math.round((open / old) * 100) : null;
    }),
  };
}

/** Tableau par semaine de cohorte, de la plus ancienne à la plus récente ; les documents expirés sont ignorés. */
export function retentionTable(docs: RetentionDoc[], now: number): CohortRow[] {
  const today = dayOf(now);
  const weeks = new Map<string, RetentionDoc[]>();
  for (const d of docs) {
    if (d.x <= now) continue;
    const w = isoWeek(d.c * DAY_MS);
    const list = weeks.get(w);
    if (list) list.push(d);
    else weeks.set(w, [d]);
  }
  return [...weeks.keys()].sort().map((week) => {
    const list = weeks.get(week)!;
    return {
      week,
      all: cell(list, today),
      fresh: cell(
        list.filter((d) => d.f),
        today,
      ),
    };
  });
}

/** Texte imprimé par `npm run retention` (pour Jimmy, en français). */
export function formatTable(rows: CohortRow[]): string {
  const pct = (v: number | null): string => (v === null ? '—' : `${v} %`).padStart(6);
  const part = (c: Cell): string => String(c.n).padStart(9) + c.d.map(pct).join('');
  const days = RETENTION.days.map((n) => `D${n}`.padStart(6)).join('');
  const lines = [
    `${'Semaine'.padEnd(10)}${'Nouveaux'.padStart(9)}${days}   │${'Tous'.padStart(9)}${days}`,
    ...rows.map((r) => `${r.week.padEnd(10)}${part(r.fresh)}   │${part(r.all)}`),
  ];
  if (!rows.length) lines.push('Aucun document.');
  return lines.join('\n');
}
