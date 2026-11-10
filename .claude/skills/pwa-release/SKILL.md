---
name: pwa-release
description: Livraison du jeu en PWA installable (Android, iOS, desktop) — manifest, service worker, mise à jour, Firebase Hosting, GitHub Actions, Lighthouse. À lire pour la phase 0, la phase 5, ou toute tâche de déploiement ou d'installation.
---

# PWA et mise en production

## 1. Manifest (`vite-plugin-pwa`, `manifest` dans `vite.config.ts`)
- `name` et `short_name` « Swarmageddon », `lang: fr`, `display: fullscreen`, `display_override: ['fullscreen','standalone']`, `orientation: any`, `background_color` = `theme_color` = couleur `--ink`.
- Icônes : 192, 512, 512 **maskable** (marge 12 % de sécurité), `apple-touch-icon` 180. Générées depuis `assets/icon.svg` par un script `npm run icons` (sharp) : pas d'icône dessinée à la main dans le repo.
- `screenshots` (form_factor `narrow` et `wide`) : Chrome les affiche dans la fiche d'installation, elles changent le taux d'installation.
- `start_url: '/'`, `scope: '/'`, `id: '/'`.

## 2. Service worker (Workbox via le plugin)
- Stratégie `generateSW`, `registerType: 'prompt'` : on **ne force pas** la mise à jour en pleine partie.
- Précache : app shell, JS, CSS, polices, icônes, sons essentiels. `globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ogg,m4a,json}']`, `maximumFileSizeToCacheInBytes: 4 Mo`.
- Runtime : rien n’est externe. Les polices (Lilita One, Rubik ; SIL OFL) sont auto-hébergées dans `public/fonts/` et précachées : pas de CSS bloquante venant d’une autre origine (phase 5, Lighthouse).
- UI de mise à jour : bannière « Nouvelle version disponible — Recharger », affichée **uniquement** au menu ou à l'écran de mort, jamais en jeu. `updateSW(true)` au clic.
- `navigateFallback: '/index.html'`, `navigateFallbackDenylist: [/^\/__\//]` (URL réservées de Firebase Hosting : `/__/auth/handler`, `/__/firebase/init.json`), `cleanupOutdatedCaches: true`.
- Firebase (phase 13) : aucun `runtimeCaching` pour `*.googleapis.com` ; le chunk `account-*.js` est précaché comme le reste (un joueur connecté hors ligne voit « Connecté · hors ligne »), mais il n'est chargé par la page qu'à la demande.

## 3. Installation
- Android/desktop : capter `beforeinstallprompt`, afficher un bouton « Installer l'app » au menu, appeler `prompt()` au clic, masquer après `appinstalled`.
- iOS : pas d'événement. Détecter `navigator.standalone === false` + UA iPhone/iPad → afficher l'aide « Partager → Sur l'écran d'accueil » une fois (mémorisée).
- Méta iOS : `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `apple-mobile-web-app-title`.
- Vérifier en mode installé : plein écran, pas de barre d'URL, safe areas respectées, orientation paysage OK, retour depuis l'arrière-plan sans écran noir (contexte WebGL restauré).

## 4. Firebase Hosting
- `firebase.json` : `public: dist`, `cleanUrls: true`, en-têtes :
  - `/sw.js` et `/index.html` → `Cache-Control: no-cache`
  - `/assets/**` → `Cache-Control: public, max-age=31536000, immutable` (Vite hash les noms)
  - `/manifest.webmanifest` → `Content-Type: application/manifest+json`
- Un seul site V1. Preview channels sur PR (`firebase hosting:channel:deploy pr-<n>`), expirent en 7 jours.
- Le déploiement passe **uniquement** par GitHub Actions : la commande `firebase deploy` est interdite en local par `.claude/settings.json` (traçabilité).

## 5. GitHub Actions (fichiers dans `.github/workflows/`)
- `ci.yml` : sur PR et `main` → `npm ci`, `lint`, `typecheck`, `test`, `build`, `test:e2e` (Chromium headless, `--use-angle=swiftshader`), upload des captures en artefact, Lighthouse CI mobile sur `dist/` servi localement (budgets : PWA 100, perf ≥ 85).
- `deploy.yml` : sur push `main` → build → `FirebaseExtended/action-hosting-deploy@v0` avec `FIREBASE_SERVICE_ACCOUNT` (secret) et `channelId: live` ; sur PR → `channelId: pr-${{ github.event.number }}` et commentaire d'URL automatique.
- Node 20, cache npm, concurrency par branche.

## 6. Checklist de sortie (phase 5)
- [ ] Lighthouse mobile : PWA 100, perf ≥ 85, accessibilité ≥ 90
- [ ] Installée et testée : Android Chrome, iOS Safari, Windows Edge, macOS Chrome
- [ ] Hors-ligne au 2e lancement (mode avion)
- [ ] Mise à jour : déployer une version, relancer l'app, voir la bannière au menu
- [ ] Rotation portrait/paysage sans casse de HUD
- [ ] Retour d'arrière-plan après 5 min : jeu en pause, reprise propre
- [ ] `CREDITS.md`, `PRIVACY.md` (aucune donnée collectée), `CHANGELOG.md`, tag `v1.0.0`, release GitHub
- [ ] Captures store 1080×1920 et 1920×1080 dans `docs/store/`

## 7. Pièges
- Tester le service worker avec `npm run preview` (ou le déploiement), **jamais** en `npm run dev`.
- Un SW qui précache un fichier manquant échoue en bloc : vérifier `dist/` après build.
- Changer `theme_color` ou les icônes → certains Android gardent l'ancien jusqu'à désinstallation ; c'est normal.
- iOS limite le stockage des PWA non utilisées 7 jours : la sauvegarde méta doit proposer l'export JSON (et, depuis la phase 13, le compte).
- Connexion Google par redirection : sans la `navigateFallbackDenylist` ci-dessus, le service worker sert `index.html` à la place de `/__/auth/handler` et la connexion boucle sur le menu. `authDomain` doit être l'hôte du site (`*.web.app`), sinon Safari bloque le stockage tiers de l'iframe d'authentification. Sur l'app installée iOS, le popup ne revient pas : proposer l'e-mail.
