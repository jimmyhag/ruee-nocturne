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
   gcloud projects add-iam-policy-binding ruee-nocturne --member serviceAccount:github-action-hosting@ruee-nocturne.iam.gserviceaccount.com --role roles/serviceusage.serviceUsageViewer
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

   Les trois premiers rôles sont ceux documentés par `FirebaseExtended/action-hosting-deploy` (Hosting Admin pour déployer, API Keys Viewer et Cloud Run Viewer pour les preview channels). Service Usage Viewer est nécessaire en plus : sans lui, firebase-tools échoue en 403 sur `serviceusage.services.get` (constaté le 2 nov. 2026). Fait pour `ruee-nocturne` le 2 nov. 2026 : compte `github-action-hosting`, secret et variable posés. La clé ne doit jamais être commitée ni collée dans une conversation : seul `gh secret set` la lit.

   Alternative sans `gcloud` : `firebase init hosting:github` (interactif, crée le compte de service et pose le secret lui-même ; refuser l'écriture des workflows proposés, les nôtres existent déjà).

## Vérifier un déploiement

- Onglet **Actions** du dépôt : job « Déploiement Firebase Hosting » vert, URL dans le résumé (et en commentaire sur la PR).
- Sur téléphone : ouvrir l'URL, installer (Android : bouton « Installer l'app » au menu ; iPhone : Partager → Sur l'écran d'accueil), couper le réseau, relancer l'app depuis l'écran d'accueil : le menu doit s'afficher.
- Mise à jour : après un nouveau déploiement, rouvrir l'app installée ; la bannière « Nouvelle version disponible — Recharger » apparaît au menu (jamais en jeu).

## En-têtes (`firebase.json`)

- `/sw.js`, `/index.html`, `/`, `/manifest.webmanifest` : `Cache-Control: no-cache` (le navigateur revalide, le service worker décide).
- `/assets/**` et `/workbox-*.js` : `public, max-age=31536000, immutable` (noms hashés par Vite).
