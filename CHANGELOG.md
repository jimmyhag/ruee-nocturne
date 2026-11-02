# Journal des modifications

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : [SemVer](https://semver.org/lang/fr/).

## Non publié — phase 1 « Cœur jouable »

Le portage du prototype était déjà dans la base v0.1 : cette phase instrumente et outille pour mesurer la porte (60 fps à 400 ennemis sur téléphone, `npm run sim -- --runs 100`, couverture sim ≥ 80 %). Aucun changement de gameplay, `src/sim/balance.ts` intact.

### Ajouté

- Onglet perf : fps réels (frames rAF sur 2 s) en tête, temps JS renommé `js p50/p95`, lisible sur mobile ; bouton « Perf » dans l'écran de pause (parité F3 / tactile).
- Mode stress `?debug=1&stress=400` : 400 ennemis maintenus, joueur invincible, onglet perf ouvert ; test e2e `stress.spec.ts` (≥ 380 ennemis, draw calls ≤ 40, triangles < 150 k) et captures `shots/*-stress.png`.
- Bots de playtest alignés sur `sim-testing` §2 : `average` (dash à ≥ 6 ennemis au contact), `greedy` (gemmes à 14 u, pick sans aléa), options de `makeAverage`.
- CLI de simulation : `--weapons orbe,foudre` (arme de départ et cartes restreintes à la liste, clés validées), `--weapons` dans l'en-tête, ligne « cibles non atteintes : attendu avant la phase 3 » ; `pickAllowed`/`enforceAllowed` testables.
- Tests Vitest des bots (`tools/bots/bots.test.ts`) : déterminisme, naive ≤ average, filtre d'armes, entrées bornées ; `test.include` étendu à `tools/**`.

### Modifié

- Délai Vitest porté à 30 s : sous `--coverage` la sim instrumentée est ~6× plus lente.

## Non publié — phase 0 « Fondations »

### Ajouté

- Dépôt GitHub, CI (lint, typecheck, tests avec couverture, build, bench, Playwright, Lighthouse) et déploiement Firebase Hosting (live sur `main`, preview par PR).
- PWA installable : manifest complet, icônes générées depuis `assets/icon.svg`, service worker Workbox avec précache de l'app shell, jouable hors ligne au second lancement, bannière « Nouvelle version disponible » au menu et à l'écran de mort.
- ESLint (flat config) + Prettier, hooks Git (`pre-commit` : lint, typecheck, tests).
- Playwright : fumée WebGL (desktop et iPhone 13 tactile), joystick et saut au doigt, relance < 2 s, captures d'écran.
- Hooks de debug `window.__game` (avec `?debug=1`) : `warp`, `kill`, `give`, `spawn`, `god`, `levelUp`, `seed`.
- Onglet perf (F3) : p95 glissant sur 2 s et nombre de voix audio.
- Tests de simulation : armes, passifs, spawner, combat, cartes, rng (couverture `src/sim/` 79 % → 95 %, seuil 80 %).

### Modifié

- TypeScript 7.0 (port natif) → 6.0 : l'outillage ESLint a besoin de l'API compilateur JS.
- CI sur Node 22 (Vite 8 exige ≥ 22.12).

## 0.1.0 — 2 nov. 2026

Base v0.1 : simulation déterministe à pas fixe, rendu Three.js instancié, entrées clavier/tactile/manette, audio procédural, HUD, sauvegarde méta, CLI de simulation d'équilibrage et bench.
