# Journal des modifications

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : [SemVer](https://semver.org/lang/fr/).

## Non publié — phase 3 « Contenu et équilibrage »

Tout le contenu V1 de PLAN.md §3 (hors personnages, phase 4), équilibré par simulation : les 8 cibles de `survivor-design` §9 sont atteintes sur 200 runs du bot `average` (seed 42).

### Ajouté

- Armes : **Boomerang** (part devant toi, revient, touche à l'aller et au retour ; deux au niveau 5) et **Mines** (posées sur ton passage, explosent au contact ; chaîne au niveau 5). Six armes, grammaire portée / ciblage / rythme distincte.
- Évolutions (arme au niveau 5 + passif associé + un coffre, ≈ ×2,5 mesuré) : **Nova** (Orbe + Gants lourds : salve circulaire de 8 orbes), **Soleil noir** (Halo + Cœur de pierre : rayon ×1,5, dégâts ×2, +1 PV par kill), **Tempête** (Lames + Semelles de vent : rayon ×1,5, vitesse ×2), **Orage** (Foudre + Sablier fêlé : cadence ×2, chaîne +2). Bannière, shake, son, visuel agrandi.
- Passifs **Trèfle** (+6 %/niveau de 4e carte, coffres plus généreux) et **Bourse** (+25 % d'or) ; compteur d'or (1/kill, ×3 élite, ×20 boss, + secondes/10) affiché à l'écran de fin, en attendant la boutique de phase 4.
- Ennemis : **Volant** (plane hors de portée, télégraphe par son ombre, plonge ; sauter au bon moment l'évite), **Cracheur** (garde 7–9 m, ligne de visée 0,6 s, crachat lent au sol), **élites** dorées (×6 PV, ×3 XP, anneau au sol, coffre) toutes les 40 s après 2:00.
- Boss scriptés (2 attaques télégraphiées + phase à 50 % PV) : **Gardien** (charge en ligne après recul et rugissement), **Essaim-mère** à 10:00 (pond des Dards, pulse), **Colosse** à 15:00 (cercles rouges 1 s puis explosion). Nom du boss dans la barre, coffre de 3 à 5 cartes à la mort.
- **Faucheur** à 20:00 : plus rapide que toi, 40 000 PV, fin de run forcée ; s'il meurt, écran « Victoire ».
- **Coffres** : 1 / 3 / 5 cartes (70 / 25 / 5 %, décalés par le Trèfle), bannière « Coffre : n améliorations », évolution garantie en première carte quand elle est disponible.
- Terrain : 3 **lacs** (vitesse ×0,55 au sol, Volant et Faucheur ignorent) et 4 **bois denses** (arbres ×3 avec un couloir annulaire), générés par la seed de décor ; **cycle de lumière** crépuscule → nuit (8:00) → aube (20:00).
- Rendu : 9 silhouettes d'ennemis instanciées, ombres des Volants, lignes de visée, cercles rouges qui se remplissent, crachats, boomerangs, mines, coffres, lacs ; nouveaux sons (coffre, évolution, rugissement, crachat, plongée, lancer, explosion).
- Outils : bots qui sautent au Volant, esquivent les cercles et vont aux coffres (greedy de loin) ; CLI avec taux de pick par part de prises, évolutions par run, kills@10 par build et écart inter-builds ; cibles « pick max ≤ 35 % » réelle et « variance < 3× » ; `debug.evolve`, `debug.chest`, `debug.teleport` ; 21 tests de contenu (83 au total).

### Modifié

- `balance.ts` (équilibrage par simulation, avant → après sur 200 runs average) : survie p50 4:33 → 9:52 (seed 43 : 9:43), fin atteinte 0 → 8–10 %, morts < 3 min 13 → 5 %. Réglages : part de Brutes 8 % + t/3000, `hpScale` 1 + t/150, `dmgScale` 1 + t/450, anneaux de Dards après 7:00, montée du spawn après 10:00 divisée par 260, Colosse lent (1,2) avec cercles à 9 dégâts toutes les 4,5 s, Lames à 1,8 + 0,15·lv de rayon (un Dard collé passait sous l'anneau). Marge de maîtrise : naive p50 2:30, greedy 15:14 (16 % de Faucheur).
- `Ev.Kill` porte le drapeau élite ; `Ev.BossSpawn` porte le type ; `Enemy.y` est la hauteur courante (Volant) ; `World` expose `shots`, `chests`, `lakes`, `woods`, `evolved`, `gold`, `treeCount`.

## Non publié — phase 2, correctifs

### Modifié

- Musique procédurale à 3 couches retirée à la demande de Jimmy (« pas ouf ») ; tous les effets sonores restent. Le bus musique est conservé pour de vraies pistes CC0 (phase 5, `CREDITS.md`).

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
