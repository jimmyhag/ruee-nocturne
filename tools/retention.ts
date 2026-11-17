// Lecture de la mesure de fréquentation (lot L1, décision de Jimmy) : `npm run retention`, lancé à la main par Jimmy.
// Lit la collection `retention` par l'API REST de Firestore avec un jeton administrateur, celui de
// `gcloud auth print-access-token` passé par la variable RETENTION_TOKEN :
//   RETENTION_TOKEN=$(gcloud auth print-access-token) npm run retention
// puis imprime le tableau D1/D7/D30 par semaine de cohorte, calculé par src/meta/retention.ts : nouveaux joueurs (f) et
// tous. N'imprime aucun identifiant : seulement des comptes et des parts.
import { readFileSync } from 'node:fs';
import { formatTable, fromFirestore, retentionTable } from '../src/meta/retention';
import type { Fields, RetentionDoc } from '../src/meta/retention';

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** Jeton d'un compte qui peut lire Firestore sur le projet (propriétaire, ou roles/datastore.viewer). */
function token(): string {
  const env = process.env.RETENTION_TOKEN?.trim();
  if (env) return env;
  return fail(
    'Pas de jeton. Se connecter une fois avec `gcloud auth login` (compte administrateur du projet), puis lancer :\n' +
      '  RETENTION_TOKEN=$(gcloud auth print-access-token) npm run retention',
  );
}

/** Projet par défaut de .firebaserc. */
function project(): string {
  try {
    const rc = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8')) as {
      projects?: { default?: string };
    };
    if (rc.projects?.default) return rc.projects.default;
  } catch {
    /* lu plus bas */
  }
  return fail('Projet introuvable : .firebaserc doit avoir projects.default.');
}

async function main(): Promise<void> {
  const auth = { authorization: `Bearer ${token()}` };
  const base = `https://firestore.googleapis.com/v1/projects/${project()}/databases/(default)/documents/retention`;
  const docs: RetentionDoc[] = [];
  let odd = 0;
  let page = '';
  do {
    const url = `${base}?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`;
    const r = await fetch(url, { headers: auth });
    if (!r.ok) fail(`Lecture refusée (${r.status}) : jeton expiré, ou compte sans droit de lecture sur Firestore.`);
    const body = (await r.json()) as { documents?: { fields?: Fields }[]; nextPageToken?: string };
    for (const d of body.documents ?? []) {
      const doc = fromFirestore(d.fields ?? {});
      if (doc) docs.push(doc);
      else odd++;
    }
    page = body.nextPageToken ?? '';
  } while (page);
  const now = Date.now();
  const live = docs.filter((d) => d.x > now).length;
  console.log(
    `${live} appareils mesurés (${docs.length - live} expirés ignorés${odd ? `, ${odd} documents illisibles` : ''}).`,
  );
  console.log('Dn : part des joueurs d’au moins n jours qui ont ouvert le jeu le jour n ; « — » : cohorte trop jeune.');
  console.log(formatTable(retentionTable(docs, now)));
}

main().catch((e: unknown) => fail(`Échec : ${e instanceof Error ? e.message : String(e)}`));
