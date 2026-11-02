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

## 2. Bots de playtest (`tools/bots/`)
Un bot = `decide(world): InputState` + `pick(cards, world): number`. Trois niveaux :
- **naive** : se déplace en cercle constant, prend la carte 0. Mesure le plancher.
- **average** : fuit le centre de masse des ennemis dans un rayon de 8 u, dash quand ≥ 6 ennemis à < 2 u, saute quand un Volant est à < 3 u, pick = carte qui augmente le plus le DPS théorique, avec 30 % d'aléatoire. **C'est le bot de référence pour les cibles.**
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
évolutions nova 31 % · soleil 22 % · tempête 18 % · orage 12 %
cause mort  dard 38 % · brute 24 % · boss 20 % · cracheur 12 % · volant 6 %
cibles      ✔ survie  ✔ faucheur  ✔ picks  ✘ kills@10 (1180 < 900–1500 ✔)  …
```
- Les cibles viennent de `survivor-design` §9, codées dans `tools/targets.ts`. Le CLI retourne un code ≠ 0 si une cible échoue → utilisable en CI (job `balance`, non bloquant mais commenté sur la PR).
- Vitesse : > 50 runs/min sur un portable (sim pure, pas de rendu). Si plus lent, profiler la sim : c'est aussi un test de perf.
- Toujours fixer `--seed` dans les PR pour comparer avant/après.

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

## 7. Ce qu'on ne teste pas
- Le rendu Three pixel par pixel (fragile). On teste : pas d'erreur, nombre de draw calls, et on **regarde** les captures.
- Le son (on teste que le pool ne dépasse pas 24 voix via un compteur exposé).
