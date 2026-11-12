// Administration du classement en ligne (demande de Jimmy, 12 nov. 2026 : le premier tenait son record d'avant les
// rééquilibrages). Lancé à la main par le workflow « Classement : corriger un score » (.github/workflows/board-admin.yml),
// avec le compte de service du déploiement : les règles Firestore interdisent à un joueur de baisser un score.
//
// Ce que fait l'outil : il prend le joueur au rang demandé du classement de tous les temps (`scores`), lit son document
// de la semaine en cours (`weeks/{semaine}/scores/{uid}`) et, si `BOARD_APPLY=true`, remplace ses scores de tous les
// temps par ceux de la semaine. Sans `BOARD_APPLY`, il ne fait que lire.
//
// Le dépôt est public, les journaux d'Actions aussi : l'outil n'imprime ni pseudo ni identifiant, seulement des scores
// et des dates (le classement n'est lisible que par les joueurs connectés, CLAUDE.md règle 8).
import { createSign } from 'node:crypto';
import { BOARD, BOARD_VIEWS, isoWeek, stageOfBest, timeOfBest, type BoardView } from '../src/meta/board';

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
const apply = process.env.BOARD_APPLY === 'true';
const SCORE_FIELDS = ['best', 'time', 'kills', 'char', 'at'] as const;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}
if (!sa.client_email || !sa.private_key || !project) fail('Compte de service ou projet manquant.');
if (!BOARD_VIEWS.includes(view)) fail(`Vue inconnue : ${view}`);
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

  const w = await fetch(`${root}/weeks/${week}/scores/${uid}`, { headers: auth });
  if (w.status === 404) {
    console.log('Aucun score cette semaine pour ce joueur : rien à mettre à la place.');
    if (apply) fail('Rien de changé.');
    return;
  }
  if (!w.ok) fail(`Lecture de la semaine refusée (${w.status}).`);
  const wk = (await w.json()) as Doc;
  show('Cette semaine', wk);
  if (!apply) {
    console.log(
      'Lecture seule : relancer avec « appliquer » pour remplacer les scores de tous les temps par ceux de la semaine.',
    );
    return;
  }
  const fields: Record<string, Value> = {};
  for (const k of SCORE_FIELDS) if (wk.fields[k]) fields[k] = wk.fields[k];
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${k}`)
    .join('&');
  // currentDocument.exists : ne recrée pas un document que le joueur aurait supprimé entre-temps
  const p = await fetch(`${root}/scores/${uid}?${mask}&currentDocument.exists=true`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ fields }),
  });
  if (!p.ok) fail(`Écriture refusée (${p.status}).`);
  show('Tous les temps, après', (await p.json()) as Doc);
}

void main();
