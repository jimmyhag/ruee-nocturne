// Classement en ligne (phase 38, décision de Jimmy) : module pur, ni DOM ni Firebase. src/platform/account.ts écrit ce
// que calcule ce module dans Firestore `scores/{uid}` (tous les temps) et `weeks/{semaine}/scores/{uid}` (semaine ISO),
// lisibles par les seuls joueurs connectés (firestore.rules). Un document par joueur : ses meilleurs scores, chacun
// indépendant (la meilleure partie, la plus longue survie, le plus de kills ne viennent pas forcément du même run).
// Lot L4 : le défi du jour entre amis, `days/{AAAA-MM-JJ}/scores/{uid}` (meilleure partie du jour d'un joueur connecté
// avec un pseudo), lu par identifiants (soi et ses amis, src/meta/friends.ts).
import { DAILY } from '../sim/balance';
import type { Friend } from './friends';

/** Bornes communes au client et aux règles Firestore (un test vérifie qu'elles y figurent). */
export const BOARD = {
  nameMin: 2,
  nameMax: 16,
  stageMax: 4, // 4 = les trois mondes terminés
  timeMax: 7200, // s
  killsMax: 200000,
  stageMul: 10000, // best = monde × 10 000 + temps (s) : d'abord le monde, puis le temps
  top: 50, // lignes affichées
  pendingKey: 'ruee-score', // scores en attente d'envoi (hors ligne, sans pseudo), liés au compte qui a joué
  pendingMax: 5,
  // lot L4 : classement du jour entre amis
  dayTimeMax: DAILY.duration, // s : le défi s'arrête là
  dayKillsMax: 20000,
  dayQuery: 30, // identifiants par requête (limite de l'opérateur `in` de Firestore)
  dayTtlDays: 7, // `x` = début du jour + 7 jours : la règle TTL de Firestore efface ensuite le document
  dayWindow: [-2, 1] as const, // jours d'écart permis avec aujourd'hui (UTC) pour écrire un document du jour (règles)
};

export type BoardView = 'best' | 'time' | 'kills';
export const BOARD_VIEWS: readonly BoardView[] = ['best', 'time', 'kills'];

/** Document d'un joueur (les deux collections ont la même forme). */
export interface ScoreDoc {
  name: string;
  char: string; // personnage de la dernière partie qui a amélioré un score
  best: number; // monde × 10 000 + temps de cette partie
  time: number; // plus longue survie (s)
  kills: number; // plus de kills en une partie
  at: number; // ms, dernière mise à jour
}
/** Une partie terminée. `stage` : 1 à 3 (monde atteint), 4 si les trois mondes sont terminés. */
export interface RunScore {
  stage: number;
  time: number;
  kills: number;
  char: string;
  day?: string; // lot L4 : défi du jour qui compte (AAAA-MM-JJ) : publié aussi dans `days/{day}/scores/{uid}`
}
/** Une ligne du classement telle que l'affiche l'écran. */
export interface BoardRow {
  uid: string;
  name: string;
  char: string;
  value: number; // champ trié de la vue
}

const clampInt = (v: number, max: number) => Math.max(0, Math.min(max, Math.floor(Number.isFinite(v) ? v : 0)));

/** Score composé « meilleure partie » : le monde d'abord, le temps ensuite. */
export function bestOf(stage: number, time: number): number {
  return clampInt(stage, BOARD.stageMax) * BOARD.stageMul + clampInt(time, BOARD.timeMax);
}
export const stageOfBest = (best: number): number => Math.floor(best / BOARD.stageMul);
export const timeOfBest = (best: number): number => best % BOARD.stageMul;

/**
 * Pseudo nettoyé : lettres (tous alphabets), chiffres, espace, « - » et « _ » ; espaces resserrés ; 16 caractères au
 * plus. '' si moins de 2 caractères restent (pas de pseudo : rien n'est publié).
 */
export function cleanPseudo(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = Array.from(s).slice(0, BOARD.nameMax).join('').trim();
  return Array.from(cut).length >= BOARD.nameMin ? cut : '';
}

/** Pseudo proposé à partir du nom du compte (Google) : le prénom, nettoyé ; sinon le début de l'e-mail. */
export function suggestPseudo(displayName: string | null, email: string | null): string {
  const first = cleanPseudo((displayName ?? '').split(' ')[0]);
  if (first) return first;
  return cleanPseudo((email ?? '').split('@')[0].replace(/[._]+/g, ' '));
}

/**
 * Fusionne une partie avec le document existant : chaque champ garde son meilleur (les règles Firestore refusent qu'un
 * score baisse). Le pseudo est toujours le courant (renommer est permis). Renvoie null si rien ne change.
 */
export function mergeScore(prev: ScoreDoc | null, run: RunScore, name: string, now: number): ScoreDoc | null {
  const best = bestOf(run.stage, run.time),
    time = clampInt(run.time, BOARD.timeMax),
    kills = clampInt(run.kills, BOARD.killsMax);
  if (!prev) return { name, char: run.char, best, time, kills, at: now };
  const better = best > prev.best || time > prev.time || kills > prev.kills;
  if (!better && name === prev.name) return null;
  return {
    name,
    char: better ? run.char : prev.char,
    best: Math.max(prev.best, best),
    time: Math.max(prev.time, time),
    kills: Math.max(prev.kills, kills),
    at: now,
  };
}

/** Lit un document reçu du nuage (jamais cru tel quel) ; null s'il n'a pas la bonne forme. */
export function readScore(raw: unknown): ScoreDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = cleanPseudo(r.name);
  if (!name) return null;
  const n = (v: unknown, max: number) => (typeof v === 'number' ? clampInt(v, max) : 0);
  return {
    name,
    char: typeof r.char === 'string' ? r.char.slice(0, 32) : '',
    best: n(r.best, BOARD.stageMax * BOARD.stageMul + BOARD.timeMax),
    time: n(r.time, BOARD.timeMax),
    kills: n(r.kills, BOARD.killsMax),
    at: typeof r.at === 'number' ? r.at : 0,
  };
}

/** Semaine ISO 8601 (lundi → dimanche, en UTC) : « 2026-W45 ». Le classement de la semaine repart à zéro le lundi. */
export function isoWeek(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3);
  const year = new Date(thursday).getUTCFullYear();
  // le jeudi de la semaine 1 tombe entre le 1er et le 7 janvier
  const week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / 604800000);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// ---------- lot L4 : classement du défi du jour entre amis ----------
/** Document `days/{jour}/scores/{uid}` : la meilleure partie du jour (temps tenu, puis kills), qui ne peut que monter. */
export interface DayDoc {
  name: string;
  time: number;
  kills: number;
  at: number; // ms, dernière mise à jour
}
/** Une ligne de l'onglet « Défi du jour · Amis » ; `played` faux : pas encore de partie du jour (temps et kills à 0). */
export interface FriendRow {
  uid: string;
  name: string;
  time: number;
  kills: number;
  played: boolean;
  me: boolean;
}

const DAY_MS = 86400000;
const dayStart = (day: string): number => Date.parse(day + 'T00:00:00Z');
/** Expiration (ms) du document `days/{day}/scores/{uid}` : début du jour + BOARD.dayTtlDays (exigée par les règles). */
export function dayExpiry(day: string): number {
  return dayStart(day) + BOARD.dayTtlDays * DAY_MS;
}
/**
 * Le document du jour `day` peut-il encore être écrit à `now` (ms) ? Les règles n'acceptent que J-2 à J+1 autour de
 * l'heure du serveur : une partie restée en attente plus longtemps (hors ligne) ne publie plus son jour.
 */
export function dayWritable(day: string, now: number): boolean {
  const start = dayStart(day);
  if (!Number.isFinite(start)) return false;
  const gap = Math.floor(start / DAY_MS) - Math.floor(now / DAY_MS);
  return gap >= BOARD.dayWindow[0] && gap <= BOARD.dayWindow[1];
}

/**
 * Fusionne une partie du défi avec le document du jour : la meilleure des deux, le temps d'abord puis les kills (les
 * règles Firestore refusent un document moins bon). Le pseudo est toujours le courant. Null si rien ne change.
 */
export function mergeDay(prev: DayDoc | null, time: number, kills: number, name: string, now: number): DayDoc | null {
  const t = clampInt(time, BOARD.dayTimeMax),
    k = clampInt(kills, BOARD.dayKillsMax);
  if (!prev) return { name, time: t, kills: k, at: now };
  const better = t > prev.time || (t === prev.time && k > prev.kills);
  if (!better && name === prev.name) return null;
  return better ? { name, time: t, kills: k, at: now } : { ...prev, name, at: now };
}

/** Lit un document du jour reçu du nuage (jamais cru tel quel) ; null s'il n'a pas la bonne forme. */
export function readDay(raw: unknown): DayDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = cleanPseudo(r.name);
  if (!name) return null;
  const n = (v: unknown, max: number) => (typeof v === 'number' ? clampInt(v, max) : 0);
  return {
    name,
    time: n(r.time, BOARD.dayTimeMax),
    kills: n(r.kills, BOARD.dayKillsMax),
    at: typeof r.at === 'number' ? r.at : 0,
  };
}

/**
 * Lignes de l'onglet amis : toi et tes amis. Ceux qui ont joué le défi du jour d'abord, triés par temps puis par kills ;
 * les autres ensuite (dans l'ordre de la liste), pour qu'on puisse les retirer. Le pseudo affiché est celui du document
 * du jour s'il existe (renommage), sinon celui du lien.
 */
export function friendRows(
  me: { uid: string; name: string },
  friends: readonly Friend[],
  docs: ReadonlyMap<string, DayDoc>,
): FriendRow[] {
  const rows: FriendRow[] = [];
  for (const p of [{ uid: me.uid, name: me.name }, ...friends]) {
    if (rows.some((r) => r.uid === p.uid)) continue;
    const d = docs.get(p.uid);
    rows.push({
      uid: p.uid,
      name: d?.name ?? p.name,
      time: d?.time ?? 0,
      kills: d?.kills ?? 0,
      played: !!d,
      me: p.uid === me.uid,
    });
  }
  const played = rows.filter((r) => r.played).sort((a, b) => b.time - a.time || b.kills - a.kills);
  return [...played, ...rows.filter((r) => !r.played)];
}
