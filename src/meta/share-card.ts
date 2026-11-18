// Lot L4 (docs/specs/l4-partage-defi-amis.md, décisions 1 à 5) : la carte de résultat d'un défi du jour et le lien de
// défi lancé à un ami. Module pur, sans DOM : main.ts lit `location.hash`, src/platform/share.ts partage le texte.
// Le lien porte ses paramètres dans le fragment (`/#defi=…`) : un navigateur ne l'envoie jamais au serveur, donc ni le
// pseudo ni l'identifiant ne partent vers l'hébergeur (règle 8, décision 3 revue après relecture).
// Un lien de défi vient de n'importe qui : chaque paramètre est validé et borné, le reste est ignoré ; rien de ce qu'il
// contient n'est jamais écrit en HTML (textContent seulement).
import { fmtDay, fmtTime, t } from '../i18n';
import { BOARD, cleanPseudo } from './board';
import { UID } from './friends';

/** Bornes du lien : celles du classement du jour (le temps tient dans le défi). */
export const CHALLENGE = { timeMax: BOARD.dayTimeMax, killsMax: BOARD.dayKillsMax };

/** Ce qu'un lien de défi contient (décision 3) : rien d'autre. `name` et `uid` : '' quand l'expéditeur ne les a pas mis. */
export interface Challenge {
  date: string; // AAAA-MM-JJ (UTC), jour du défi joué
  t: number; // s tenues
  k: number; // ennemis vaincus
  name: string;
  uid: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INT = /^\d{1,6}$/;
/** Jour AAAA-MM-JJ qui existe au calendrier (pas de 2026-02-30). */
export function validDay(s: string): boolean {
  if (!DATE.test(s)) return false;
  const ms = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}
function readInt(raw: string | null, max: number): number {
  if (raw === null || !INT.test(raw)) return -1;
  const n = Number(raw);
  return n <= max ? n : -1;
}

/**
 * Lit un lien de défi (`location.hash`, `#` compris ou non). Null si ce n'en est pas un, ou si la date (illisible, d'avant 2026, ou après
 * `today`), le temps ou les kills sont invalides : le jeu s'ouvre alors au menu normal. Un pseudo illisible devient
 * « un ami » ; l'identifiant n'est gardé qu'avec un pseudo (décision 6 : un ami a un nom).
 */
export function parseChallenge(hash: string, today: string): Challenge | null {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  } catch {
    return null;
  }
  const date = q.get('defi');
  if (date === null || !validDay(date) || date < '2026-01-01' || date > today) return null;
  const time = readInt(q.get('t'), CHALLENGE.timeMax),
    kills = readInt(q.get('k'), CHALLENGE.killsMax);
  if (time < 0 || kills < 0) return null;
  const name = cleanPseudo(q.get('n') ?? '');
  const u = q.get('u') ?? '';
  return { date, t: time, k: kills, name, uid: name && UID.test(u) ? u : '' };
}

/** Le fragment est-il un lien de défi (valide ou non) ? main.ts le retire alors de l'adresse une fois lu. */
export function isChallengeHash(hash: string): boolean {
  return /^#?defi=/.test(hash);
}

/** Lien de défi (décision 3) : `origin` est `location.origin` (la preview marche aussi) ; paramètres dans le fragment. */
export function challengeUrl(origin: string, run: { date: string; t: number; k: number }, name = '', uid = ''): string {
  const q = new URLSearchParams();
  q.set('defi', run.date);
  q.set('t', String(Math.max(0, Math.min(CHALLENGE.timeMax, Math.floor(run.t)))));
  q.set('k', String(Math.max(0, Math.min(CHALLENGE.killsMax, Math.floor(run.k)))));
  const n = cleanPseudo(name);
  if (n) q.set('n', n);
  if (n && UID.test(uid)) q.set('u', uid);
  return `${origin}/#${q.toString()}`;
}

/** Une partie du défi, telle que la carte la montre. */
export interface CardRun {
  date: string;
  t: number;
  k: number;
  ok: boolean; // tenu jusqu'au bout
  streak: number; // série en cours (montrée à partir de 2)
}
/**
 * Texte de la carte (décision 1), dans la langue du joueur, sans rien dévoiler de la partie (ni arme, ni objet, ni
 * personnage, ni carte) : le jour, le temps, la réussite, les kills, la série, le lien.
 */
export function cardText(run: CardRun, url: string): string {
  const lines = [
    `Swarmageddon · ${t('share.title', { date: fmtDay(run.date) })}`,
    `⏱ ${fmtTime(run.t)} ${run.ok ? '✅' : '❌'}  💀 ${Math.max(0, Math.floor(run.k))}`,
  ];
  if (run.streak >= 2) lines.push(`🔥 ${t('share.streak', { n: run.streak })}`);
  lines.push(`${t('share.beatMe')} ${url}`);
  return lines.join('\n');
}

/**
 * Score à battre (décision 5) : comme le classement du jour, le temps d'abord, les kills ensuite ; l'égalité bat le défi.
 * Retourne null si le défi est battu, sinon l'écart (secondes qui manquent, ou kills à temps égal).
 */
export function challengeGap(
  mine: { t: number; k: number },
  target: { t: number; k: number },
): { t: number; k: number } | null {
  const mt = Math.floor(mine.t);
  if (mt > target.t || (mt === target.t && mine.k >= target.k)) return null;
  return mt < target.t ? { t: target.t - mt, k: 0 } : { t: 0, k: target.k - mine.k };
}
