---
name: sim-testing
description: Tests de la simulation déterministe, bots de playtest headless, CLI d'équilibrage, tests Playwright WebGL et captures. À lire avant d'écrire un test, de toucher tools/sim-cli.ts, ou de valider une porte de phase.
---

# Tests et simulation headless

La sim est pure et déterministe : c'est ce qui permet de **tester un jeu comme un backend**. Même seed + mêmes inputs = même run, octet pour octet.

## 1. Tests unitaires (Vitest, `src/sim/**/*.test.ts`)
- `rng.ts` : séquence fixe pour une seed (snapshot des 10 premières valeurs).
- `progression.ts` : `needFor`, tirage des cartes (garanties du skill `survivor-design` §3 vérifiées sur 1000 tirages).
- `weapons/*` : stats par niveau (table), comportement sur un monde minimal (1 ennemi à 5 u → touché en < N steps).
- `spawner.ts` : nombre d'ennemis créés sur 60 s simulées à ±10 % de l'intégrale de `spawnRate`.
- `step.ts` : **déterminisme** — deux mondes même seed, 3600 steps avec le même input script → `JSON.stringify` identiques. Ce test est le garde-fou de tout le projet.
- Zéro import de `three` ou du DOM dans `src/sim/` (test qui lit les fichiers et échoue sur `from 'three'`, `document.`, `window.`).
- Couverture `src/sim/` ≥ 80 % (`vitest --coverage`, seuil dans `vitest.config.ts`).

### Instantané de partie (phase 49)
- `src/sim/snapshot.ts` copie tout le `World` sauf la carte (refaite par `buildMapFor(seed)`). `snapshot.test.ts` sauvegarde → texte → restaure, puis joue les deux mondes : ils doivent rester **identiques au bit près**. C'est aussi un détecteur d'état caché : un champ qui n'est pas dans le monde (variable de module, champ privé d'une classe) ou un emplacement de réserve qui garde des valeurs de son ancien occupant fait diverger les deux mondes.
- Diagnostic d'une divergence : jouer les deux mondes pas à pas et comparer `snapshotWorld(a).fields` champ par champ au premier pas qui diffère (c'est ainsi qu'on a trouvé `allocShot` qui laissait `hit`, `ox`, `oz`, `t0`).
- Un champ ajouté au `World` est sauvegardé sans rien faire ; une classe ajoutée dedans fait échouer le test de couverture (lui donner `save`/`load` comme `FlowField`, ou la classer dans `MAP_FIELDS` si la carte la refait).

## 2. Bots de playtest (`tools/bots/`)
Un bot = `decide(world): InputState` + `pick(cards, world): number`. Trois niveaux :
- **naive** : se déplace en cercle constant, prend la carte 0. Mesure le plancher.
- **average** : fuit le centre de masse des ennemis dans un rayon de 8 u, dash quand ≥ 6 ennemis à < 2 u, saute quand un Volant est à < 3 u, pick = somme de la valeur des lignes de la carte (phase 12 : +1 projectile ≈ 22, +10 % dégâts ≈ 7…) avec un bonus de concentration sur l'arme la plus montée, 30 % d'aléatoire. Phase 11 : saute sur une éruption (< 0,4 s) ou une onde du Gardien (< 0,3 s) imminentes, dashe à travers une charge de Brute élite, saute quand il bute trois frames de suite (pied de plateau, arbre). **C'est le bot de référence pour les cibles.**
- **greedy** : idem mais va chercher gemmes et coffres, pick optimal sans aléatoire. Mesure le plafond.

## 3. CLI d'équilibrage (`tools/sim-cli.ts`, `npm run sim`)
```
npm run sim -- --runs 200 --bot average --seed 42 [--until 1200] [--out sim/out.json] [--weapons orbe,halo]
```
Sortie console (et JSON) :
```
runs 200 · bot average · seed 42
survie     p10 4:12  p50 10:48  p90 17:30  faucheur 11 %
niveau@10  p50 18     kills@10  p50 1180
morts <3min 6 %
picks      orbe 24 % · halo 19 % · lames 17 % · foudre 15 % · boomerang 14 % · mines 11 %
lignes      1.6 par carte · 14 % de cartes épiques · arme principale niv 18 à 10 min, 24 en fin de run
cause mort  dard 38 % · brute 24 % · boss 20 % · cracheur 12 % · volant 6 % · éruption 5 % · anneau 2 %
éruptions   14 par run · 9 % touchent le bot · 5 % des morts
cibles      ✔ survie  ✔ faucheur  ✔ picks  ✘ kills@10 (1180 < 900–1500 ✔)  …
```
- Les cibles viennent de `survivor-design` §9, codées dans `tools/targets.ts`. Le CLI retourne un code ≠ 0 si une cible échoue → utilisable en CI (job `balance`, non bloquant mais commenté sur la PR).
- Vitesse : > 50 runs/min sur un portable (sim pure, pas de rendu). Si plus lent, profiler la sim : c'est aussi un test de perf.
- Toujours fixer `--seed` dans les PR pour comparer avant/après.
- Cause de mort : la dernière source de dégâts (`w.lastHurt`) pour les dangers nommés (éruption, anneau, charge, crachat, zone) ; pour le contact, l'ennemi le plus proche au dernier coup (approximatif : la Brute, large, est sur-attribuée).

## 4. Bench (`tools/bench.ts`, `npm run bench`)
- Monde avec 400 ennemis forcés, 600 steps, mesure `performance.now()` par step (p50/p95) et le delta de `process.memoryUsage().heapUsed` après `gc()` (`node --expose-gc`).
- Seuils : p95 ≤ 6 ms, croissance du tas ≤ 2 Mo. Échec = sortie ≠ 0.

## 5. Playwright (`e2e/`)
- Config : Chromium, `args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']`, deux projets : `desktop` 1280×720 et `mobile` iPhone 13 (`hasTouch: true`).
- `smoke.spec.ts` : la page charge, `canvas` présent, aucun `console.error`, `window.__game.ready === true`, démarrer une partie, 5 s, `__game.world.enemies.count > 0`, `renderer.info.render.calls ≤ 40`.
- `touch.spec.ts` : `page.touchscreen.tap` sur Jouer, drag joystick → le joueur bouge, tap SAUT → `player.y > 0`.
- `restart.spec.ts` : forcer la mort (`__game.debug.kill()`), mesurer mort → en jeu < 2000 ms.
- `shots.spec.ts` : captures menu / jeu à 3 min (via `__game.debug.warp(180)`) / level-up / boss / mort, dans `shots/`. Lire ces PNG avec Read pour vérifier visuellement.
- GIF : enregistrer `page.video()` puis convertir avec ffmpeg (`-vf fps=20,scale=640:-1`) pour les PR de phase 2.
- Exposer `window.__game` **uniquement** si `import.meta.env.DEV` ou `?debug=1`.

## 6. Hooks de debug (`src/debug.ts`)
`warp(seconds)`, `kill()`, `give(weapon, lv)`, `spawn(type, n)`, `god()`, `seed(n)`. Indispensables pour les tests et les captures ; jamais inclus en prod sans `?debug=1`.
- `warp` rend au joueur ses PV normaux à la fin : s'il doit rester en vie ensuite, appeler `god()` **dans le même `page.evaluate`**. Dans deux appels séparés, le joueur immobile au milieu de la horde mourait entre les deux sur le runner de CI, lent (vert en local, rouge en CI : `e2e/runsave.spec.ts`, 1.53.0).
- Ajouter un contenu (objet, arme, succès) : chercher les nombres en dur dans **tous** les specs (`grep -rn toHaveCount e2e/`), pas seulement ceux de la phase. La Toxine a cassé `e2e/library.spec.ts` (48 → 49 objets) sans que les tests de la phase le voient.

## 7. Ce qu'on ne teste pas
- Le rendu Three pixel par pixel (fragile). On teste : pas d'erreur, nombre de draw calls, et on **regarde** les captures.
- Le son (on teste que le pool ne dépasse pas 24 voix via un compteur exposé).
