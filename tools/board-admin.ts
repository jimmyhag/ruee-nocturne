// Administration du classement en ligne (demande de Jimmy, 12 nov. 2026 : le premier tenait son record d'avant les
// rééquilibrages). Lancé à la main par le workflow « Classement : corriger un score » (.github/workflows/board-admin.yml),
// avec le compte de service du déploiement : les règles Firestore interdisent à un joueur de baisser un score.
//
// Ce que fait l'outil : il prend le joueur au rang demandé du classement de tous les temps (`scores`) et lit son document
// de la semaine en cours (`weeks/{semaine}/scores/{uid}`). Selon `BOARD_ACTION` :
//   lire      : rien d'autre (défaut) ;
//   semaine   : remplace ses scores de tous les temps par ceux de la semaine (record d'une semaine passée) ;
//   fixer     : écrit la partie donnée (`BOARD_STAGE`, `BOARD_TIME`, `BOARD_KILLS`) dans les deux documents (le serveur
//               ne garde que le meilleur de chaque joueur : une partie moins bonne n'est stockée nulle part) ;
//   supprimer : retire le joueur des deux classements ; sa prochaine partie l'y remet.
//
// Le dépôt est public, les journaux d'Actions aussi : l'outil n'imprime ni pseudo ni identifiant, seulement des scores
// et des dates (le classement n'est lisible que par les joueurs connectés, CLAUDE.md règle 8).
import { createSign } from 'node:crypto';
import { BOARD, BOARD_VIEWS, bestOf, isoWeek, stageOfBest, timeOfBest, type BoardView } from '../src/meta/board';

type Value = { integerValue?: string; doubleValue?: number; stringValue?: string };
interface Doc {
  name: string; // chemin complet du document
  fields: Record<string, Value>;
}
interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}') as Partial<ServiceAccount>;
const project = process.env.FIREBASE_PROJECT_ID || sa.project_id || '';
const view = (process.env.BOARD_VIEW || 'best') as BoardView;
const rank = Math.floor(Number(process.env.BOARD_RANK || 1));
const ACTIONS = ['lire', 'semaine', 'fixer', 'supprimer'] as const;
const action = (process.env.BOARD_ACTION || 'lire') as (typeof ACTIONS)[number];
const SCORE_FIELDS = ['best', 'time', 'kills', 'char', 'at'] as const;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}
if (!sa.client_email || !sa.private_key || !project) fail('Compte de service ou projet manquant.');
if (!BOARD_VIEWS.includes(view)) fail(`Vue inconnue : ${view}`);
if (!ACTIONS.includes(action)) fail(`Action inconnue : ${action}`);
if (!(rank >= 1 && rank <= BOARD.top)) fail(`Rang hors du classement affiché (1 à ${BOARD.top}).`);

const b64 = (s: string | Buffer): string => Buffer.from(s).toString('base64url');

/** Jeton OAuth du compte de service (JWT signé RS256, portée Firestore) : pas de dépendance pour un outil d'un soir. */
async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 600,
    }),
  );
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key!);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${b64(sig)}`,
    }),
  });
  if (!res.ok) fail(`Jeton refusé (${res.status}).`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const num = (v: Value | undefined): number =>
  v?.integerValue !== undefined ? Number(v.integerValue) : (v?.doubleValue ?? 0);
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/** Les scores d'un document, sans rien qui désigne le joueur. */
function show(label: string, d: Doc): void {
  const best = num(d.fields.best);
  console.log(
    `${label} : meilleure partie monde ${stageOfBest(best)} en ${mmss(timeOfBest(best))} · plus longue survie ` +
      `${mmss(num(d.fields.time))} · ${num(d.fields.kills)} vaincus · mis à jour le ${new Date(num(d.fields.at)).toISOString()}`,
  );
}

async function main(): Promise<void> {
  const auth = { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' };
  const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  // le joueur au rang demandé, dans l'ordre de la vue (comme l'écran du classement)
  const q = await fetch(`${root}:runQuery`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'scores' }],
        orderBy: [{ field: { fieldPath: view }, direction: 'DESCENDING' }],
        limit: rank + 1, // le suivant aussi : ce que deviendra la tête du classement
      },
    }),
  });
  if (!q.ok)
    fail(
      `Lecture du classement refusée (${q.status}) : le compte de service a-t-il le rôle « Utilisateur Cloud Datastore » ?`,
    );
  const rows = ((await q.json()) as { document?: Doc }[]).filter((r) => r.document).map((r) => r.document!);
  if (rows.length < rank) fail(`Le classement n'a que ${rows.length} joueur(s).`);
  const all = rows[rank - 1];
  const uid = all.name.slice(all.name.lastIndexOf('/') + 1);
  const week = isoWeek(Date.now());
  console.log(`Vue « ${view} », rang ${rank}, semaine ${week}.`);
  show('Tous les temps', all);
  if (rows[rank]) show('Rang suivant', rows[rank]);

  const weekPath = `${root}/weeks/${week}/scores/${uid}`;
  const w = await fetch(weekPath, { headers: auth });
  if (!w.ok && w.status !== 404) fail(`Lecture de la semaine refusée (${w.status}).`);
  const wk = w.ok ? ((await w.json()) as Doc) : null;
  if (wk) show('Cette semaine', wk);
  else console.log('Aucun score cette semaine pour ce joueur.');
  if (action === 'lire') {
    console.log('Lecture seule : rien de changé.');
    return;
  }

  /** Écrit `fields` dans un document existant (jamais de création : le joueur a pu le supprimer entre-temps). */
  const patch = async (path: string, fields: Record<string, Value>, label: string): Promise<void> => {
    const mask = Object.keys(fields)
      .map((k) => `updateMask.fieldPaths=${k}`)
      .join('&');
    const p = await fetch(`${path}?${mask}&currentDocument.exists=true`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ fields }),
    });
    if (!p.ok) fail(`Écriture refusée (${p.status}).`);
    show(label, (await p.json()) as Doc);
  };
  if (action === 'supprimer') {
    for (const path of wk ? [`${root}/scores/${uid}`, weekPath] : [`${root}/scores/${uid}`]) {
      const d = await fetch(path, { method: 'DELETE', headers: auth });
      if (!d.ok) fail(`Suppression refusée (${d.status}).`);
    }
    console.log(
      `Joueur retiré du classement${wk ? ' (tous les temps et semaine)' : ''} : sa prochaine partie l'y remet.`,
    );
    return;
  }
  if (action === 'semaine') {
    if (!wk) fail('Rien à mettre à la place : rien de changé.');
    const fields: Record<string, Value> = {};
    for (const k of SCORE_FIELDS) if (wk.fields[k]) fields[k] = wk.fields[k];
    await patch(`${root}/scores/${uid}`, fields, 'Tous les temps, après');
    return;
  }
  // fixer : la partie donnée devient le score du joueur, dans les deux classements
  const stage = Math.floor(Number(process.env.BOARD_STAGE));
  const t = /^(\d+):(\d{2})$/.exec(process.env.BOARD_TIME || '');
  const time = t ? Number(t[1]) * 60 + Number(t[2]) : NaN;
  const kills = Math.floor(Number(process.env.BOARD_KILLS));
  if (!(stage >= 1 && stage <= BOARD.stageMax))
    fail(`Monde attendu : 1 à ${BOARD.stageMax} (4 = les trois mondes terminés).`);
  if (!(time >= 0 && time <= BOARD.timeMax)) fail('Temps attendu au format minutes:secondes, par exemple 24:10.');
  if (!(kills >= 0 && kills <= BOARD.killsMax)) fail('Nombre de vaincus invalide.');
  const fields: Record<string, Value> = {
    best: { integerValue: String(bestOf(stage, time)) },
    time: { integerValue: String(time) },
    kills: { integerValue: String(kills) },
    at: { integerValue: String(Date.now()) },
  };
  await patch(`${root}/scores/${uid}`, fields, 'Tous les temps, après');
  if (wk) await patch(weekPath, fields, 'Cette semaine, après');
}

void main();
