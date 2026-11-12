# Déploiement (Firebase Hosting via GitHub Actions)

Le déploiement passe **uniquement** par `.github/workflows/deploy.yml` : `firebase deploy` est interdit en local (`.claude/settings.json`).

| Événement       | Canal Hosting | URL                                             |
| --------------- | ------------- | ----------------------------------------------- |
| push sur `main` | `live`        | https://ruee-nocturne.web.app                   |
| PR (même dépôt) | `pr-<numéro>` | commentée automatiquement sur la PR, expire 7 j |

Projet Firebase : `ruee-nocturne` (créé le 2 nov. 2026, site Hosting par défaut `ruee-nocturne`).

## Secrets GitHub à poser une fois

1. **Variable** `FIREBASE_PROJECT_ID` = `ruee-nocturne`

   ```bash
   gh variable set FIREBASE_PROJECT_ID --body ruee-nocturne
   ```

2. **Secret** `FIREBASE_SERVICE_ACCOUNT` = la clé JSON d'un compte de service du projet. Avec `gcloud` connecté sur le compte propriétaire du projet :

   ```bash
   gcloud iam service-accounts create github-action-hosting --project ruee-nocturne --display-name "GitHub Actions Hosting"
   ```

   ```bash
   gcloud projects add-iam-policy-binding ruee-nocturne --member serviceAccount:github-action-hosting@ruee-nocturne.iam.gserviceaccount.com --role roles/firebasehosting.admin
   ```

   ```bash
   gcloud projects add-iam-policy-binding ruee-nocturne --member serviceAccount:github-action-hosting@ruee-nocturne.iam.gserviceaccount.com --role roles/serviceusage.apiKeysViewer
   ```

   ```bash
   gcloud projects add-iam-policy-binding ruee-nocturne --member serviceAccount:github-action-hosting@ruee-nocturne.iam.gserviceaccount.com --role roles/run.viewer
   ```

   ```bash
   gcloud iam service-accounts keys create "$TEMP/firebase-sa.json" --iam-account github-action-hosting@ruee-nocturne.iam.gserviceaccount.com
   ```

   ```bash
   gh secret set FIREBASE_SERVICE_ACCOUNT < "$TEMP/firebase-sa.json"
   ```

   ```bash
   rm "$TEMP/firebase-sa.json"
   ```

   Les trois rôles sont ceux documentés par `FirebaseExtended/action-hosting-deploy` (Hosting Admin pour déployer, API Keys Viewer et Cloud Run Viewer pour les preview channels). La clé ne doit jamais être commitée ni collée dans une conversation : seul `gh secret set` la lit.

   Alternative sans `gcloud` : `firebase init hosting:github` (interactif, crée le compte de service et pose le secret lui-même ; refuser l'écriture des workflows proposés, les nôtres existent déjà).

## Règles Firestore et comptes (phase 13)

Les comptes (Google, e-mail / mot de passe) et la progression par compte reposent sur Firebase Authentication et Cloud Firestore du même projet. Les règles de sécurité sont dans `firestore.rules` et déployées par le job `rules` de `deploy.yml` à chaque push sur `main`, avant l'hébergement (`continue-on-error` : un échec des règles n'empêche pas de livrer le jeu).

Rôles supplémentaires du compte de service (une fois, avec `gcloud` connecté sur le compte propriétaire) :

```bash
gcloud projects add-iam-policy-binding ruee-nocturne --member serviceAccount:github-action-hosting@ruee-nocturne.iam.gserviceaccount.com --role roles/firebaserules.admin
```

```bash
gcloud projects add-iam-policy-binding ruee-nocturne --member serviceAccount:github-action-hosting@ruee-nocturne.iam.gserviceaccount.com --role roles/datastore.viewer
```

Si le job `rules` remonte un `PERMISSION_DENIED` nommant `serviceusage.services.get`, ajouter aussi `roles/serviceusage.serviceUsageViewer`.

### Corriger le classement (12 nov. 2026)

Le workflow manuel « Classement : corriger un score » (`.github/workflows/board-admin.yml`, `tools/board-admin.ts`) lit le joueur à un rang du classement et peut remplacer ou retirer son score, quand un record date d'avant un rééquilibrage. Les règles Firestore interdisent à un joueur de baisser son score : seul le compte de service le peut. Avec `roles/datastore.viewer`, l'outil ne fait que **lire** (écriture et suppression refusées, 403). Pour qu'il puisse écrire, une fois, avec le compte propriétaire :

```bash
gcloud projects add-iam-policy-binding ruee-nocturne --member serviceAccount:github-action-hosting@ruee-nocturne.iam.gserviceaccount.com --role roles/datastore.user
```

Sans ce rôle, la même correction se fait à la main dans la console Firebase (Firestore, collections `scores` et `weeks/{semaine}/scores`). Les journaux d'Actions sont publics : l'outil n'y écrit ni pseudo ni identifiant.

Console Firebase (projet `ruee-nocturne`), à faire une fois : app web liée au site Hosting (c'est ce qui sert `/__/firebase/init.json`, lu par le jeu : rien à coller dans le dépôt), Authentication → fournisseurs **Google** et **E-mail / Mot de passe**, Firestore → base `(default)` en mode production (région irréversible, `europe-west1`), client OAuth Google → URI de redirection `https://ruee-nocturne.web.app/__/auth/handler`. Détail pas à pas dans `docs/GATES.md` (phase 13).

Dev local : la configuration web n'est pas servie par `vite dev` / `vite preview` ; coller la sortie de `curl -s https://ruee-nocturne.web.app/__/firebase/init.json` dans `.env.local` (ignoré par git) :

```
VITE_FIREBASE_CONFIG='{"apiKey":"…","authDomain":"…","projectId":"ruee-nocturne","appId":"…"}'
```

Sans configuration, le panneau Compte affiche « Comptes indisponibles dans cette version » et le jeu reste jouable sans compte. Les previews de PR parlent au même Auth et à la même base que le live ; Google y échoue (`auth/unauthorized-domain`, domaine non autorisé), l'e-mail fonctionne.

## Vérifier un déploiement

- Onglet **Actions** du dépôt : job « Déploiement Firebase Hosting » vert, URL dans le résumé (et en commentaire sur la PR).
- Sur téléphone : ouvrir l'URL, installer (Android : bouton « Installer l'app » au menu ; iPhone : Partager → Sur l'écran d'accueil), couper le réseau, relancer l'app depuis l'écran d'accueil : le menu doit s'afficher.
- Mise à jour : après un nouveau déploiement, rouvrir l'app installée ; la bannière « Nouvelle version disponible — Recharger » apparaît au menu (jamais en jeu).

## En-têtes (`firebase.json`)

- `/sw.js`, `/index.html`, `/`, `/manifest.webmanifest` : `Cache-Control: no-cache` (le navigateur revalide, le service worker décide).
- `/assets/**` et `/workbox-*.js` : `public, max-age=31536000, immutable` (noms hashés par Vite).
