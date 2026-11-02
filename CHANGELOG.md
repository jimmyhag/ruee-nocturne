# Journal des modifications

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : [SemVer](https://semver.org/lang/fr/).

## Non publié — phase 2, correctifs

### Modifié

- Taille du rendu vérifiée à chaque frame et sur `visualViewport` / `orientationchange`, pas seulement sur `resize` : sur l'appareil de Jimmy ouvert au lancement, l'image restait écrasée ou étirée (taille de viewport figée avant la première frame).

- Squash & stretch retiré à la demande de Jimmy (iPhone : ennemis et joueur « écrasés ou étirés ») : plus d'étirement ni d'écrasement des ennemis, du joueur en saut ou à l'atterrissage, ni de grossissement au coup. Le code reste, les valeurs sont neutres dans `src/render/feel.ts` ; le coup se lit au flash blanc, aux particules et au chiffre. Le pop des gemmes et l'écrasement au tir (phase 1) sont conservés.

## Non publié — phase 2 « Game feel »

Application de la checklist du skill `game-feel` : chaque coup porté produit flash, recul, son, chiffre et particules. `src/sim/balance.ts` intact ; les constantes de ressenti vivent dans `src/render/feel.ts`.

### Ajouté

- Hit-stop borné (`HitStop`) : 40 ms à 0,15× par kill, 120 ms par boss, 60 ms à 0,3× quand le joueur est touché ; durée max 120 ms, jamais relancé pendant un hit-stop, 250 ms entre deux. À 400 ennemis le temps de jeu avance à ≥ 88 % du temps réel (15 % en phase 1). Testé en Vitest ; l'onglet perf affiche `temps ×…` (temps de jeu / temps réel) et l'état du hit-stop.
- Squash & stretch : ressort d'atterrissage du joueur (0,85 → rebond, 120 ms), étirement vertical en saut, écrasement au tir ; ennemis étirés vers leur déplacement (1,1×), flash blanc + 1,18× au coup ; apparition des gemmes 0 → 1,3 → 1 en 120 ms ; les Dards pointent enfin vers le joueur.
- Table de particules du skill (pool unique, cap 500, remplacement de la plus ancienne) : gerbe de la couleur de l'arme orientée comme le recul à chaque coup, 7 au kill, 50 (ennemi + or) pour une Brute, 80 pour le boss, poussière à l'atterrissage, 1 particule crème par frame en dash, anneau de 30 à la montée de niveau.
- Traînées : silhouette fusionnée du joueur en 6 fantômes additifs pendant le dash (1 draw call), lames orbitales en `InstancedMesh` avec 3 fantômes chacune (6 draw calls → 2), projectiles inchangés (4 fantômes or → rouge).
- Caméra : zoom-out progressif de 8 % sur 15 min, recul de 10 % pendant un boss, shake borné à 0,6 u en bruit 2D continu (joueur touché 0,25 ; élite et apparition du boss 0,4 ; boss vaincu 0,6).
- Chiffres de dégâts : pop 1,35 → 1 interpolé sur 100 ms, fondu sur 250 ms, doré au-dessus de 40 ; les coups d'une même frame à moins de 1,5 u fusionnent (somme) pour rester lisibles et borner les écritures DOM.
- Audio : pool de 24 voix à priorité (joueur touché > niveau > boss > kill > hit > ramassage ; la voix la moins prioritaire est coupée), 4 variantes de hit à ±8 %, son de combo + accord à partir de 5 kills en 1 s, « whoosh » à la reprise après une carte, son de sélection distinct par type de carte, musique à 3 couches (nappe, rythme à 2,2 Hz, intensité) dont le gain suit `min(1, ennemis / 120)` et vaut 1 pendant un boss — tout en LFO natifs, aucun timer JS.
- UI : balayage blanc de la barre d'XP à chaque gain notable, flash de la carte choisie, flash d'écran doré au boss vaincu, compteur de kills sans `setTimeout`.
- Mode « réduction des effets » complet : shake 0, particules ÷2, hit-stop coupé, flashs d'écran atténués, fermeture immédiate des cartes ; `prefers-reduced-motion` l'active par défaut tant que le joueur n'a pas touché au réglage (`Meta.fxChosen`).
- Clavier : touches 1-3 pour choisir une carte (parité avec le tap ; les `kbd` étaient affichés mais pas câblés).
- Debug : `weak(type, dist, hp)`, `pullBoss(dist)`, `speed(s)` (0 fige la boucle pour les captures) ; captures `kill-elite`, `levelup-feel`, `boss` dans `e2e/shots.spec.ts`.

### Modifié

- `Ev.Hit` porte la source du coup (`HitSrc` : Orbe, Halo, Lames, Foudre) et la direction du recul ; `Gem.age` ; `ELITE_TYPE` (Brute) dans `balance.ts`.
- Relecture perf : `stats(lv)` des armes mémoïsées (plus de littéral par step ni par frame), éclairs copiés sans `subarray`, opacité des chiffres écrite seulement en fondu.
- Playwright : `PW_PORT` pour choisir le port du preview (un preview étranger sur 4173 faisait tester un build obsolète).

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
