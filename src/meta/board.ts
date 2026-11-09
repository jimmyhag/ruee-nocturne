// Classement en ligne (phase 38, décision de Jimmy) : module pur, ni DOM ni Firebase. src/platform/account.ts écrit ce
// que calcule ce module dans Firestore `scores/{uid}` (tous les temps) et `weeks/{semaine}/scores/{uid}` (semaine ISO),
// lisibles par les seuls joueurs connectés (firestore.rules). Un document par joueur : ses meilleurs scores, chacun
// indépendant (la meilleure partie, la plus longue survie, le plus de kills ne viennent pas forcément du même run).

/** Bornes communes au client et aux règles Firestore (un test vérifie qu'elles y figurent). */
export const BOARD = {
  nameMin: 2,
  nameMax: 16,
  stageMax: 4, // 4 = les trois mondes terminés
  timeMax: 7200, // s
  killsMax: 200000,
  stageMul: 10000, // best = monde × 10 000 + temps (s) : d'abord le monde, puis le temps
  top: 50, // lignes affichées
  pendingKey: 'ruee-score', // score en attente d'envoi (hors ligne)
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
