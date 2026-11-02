# Stack et état de la base (v0.1 + phase 0, 2 nov. 2026)

| Composant        | Version | Note                                                                                                              |
| ---------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| Node             | 22      | CI et déploiement (Vite 8 exige ≥ 22.12) ; Node 25 en local fonctionne avec un avertissement `EBADENGINE`         |
| Vite             | 8.3     | `SINGLE=1` → build en un fichier (artifact / test rapide), sans PWA                                               |
| TypeScript       | 6.0     | strict, `noUnusedLocals`. TS 7 (port natif) n'expose pas l'API JS requise par typescript-eslint : voir GATES.md   |
| Three.js         | 0.187.0 | `InstancedMesh.setColorAt` alloue sur la capacité (plus de piège r128) ; `three.core.js` séparé                   |
| Vitest           | 5.1     | sim uniquement, couverture v8 sur `src/sim/` avec seuil 80 % (branches 70 %)                                      |
| Playwright       | 1.64    | Chromium SwiftShader, projets `desktop` 1280×720 et `mobile` iPhone 13 tactile, sert le build de prod (`preview`) |
| ESLint           | 10      | flat config, `typescript-eslint` recommended, `eslint-config-prettier`                                            |
| Prettier         | 3.9     | `singleQuote`, `printWidth` 120, LF. Les docs de Jimmy et les skills ne sont pas reformatés (`.prettierignore`)   |
| vite-plugin-pwa  | 2.0     | `generateSW`, `registerType: 'prompt'`, manifest complet, polices Google en CacheFirst                            |
| simple-git-hooks | 2.14    | pre-commit : `lint` + `typecheck` + `test`                                                                        |
| tsx              | 4       | CLI sim, bench, génération d'icônes                                                                               |
| idb-keyval       | 6.2     | sauvegarde méta, repli localStorage                                                                               |

## Ce qui est fait (phase 1 largement couverte, début de phase 2)

- `src/sim/` : monde, pools, grille spatiale à tableaux fixes, spawner, 4 armes, 6 passifs, progression, événements. Déterministe (test sur 3600 steps). **Couverture 95 % (41 tests)**.
- `src/render/` : instancing pour tout, décor généré par seed, particules, éclairs, chiffres de dégâts, caméra avec avance et shake.
- `src/platform/` : clavier (ZQSD/WASD/flèches), joystick flottant, manette (Gamepad API), audio procédural 3 bus + pool 24 voix + musique 3 couches, **PWA (`pwa.ts`)**.
- `src/ui/` : HUD à cache, cartes de niveau, écrans, bannière de mise à jour (menu et écran de mort seulement).
- `src/debug.ts` : `window.__game` (`?debug=1` ou dev) : `world`, `app`, `renderer`, `audioVoices`, `debug.{warp, kill, give, spawn, god, levelUp, seed}`.
- `tools/` : `sim-cli` (3 bots, percentiles, cibles, JSON), `bench` (p95, tas), `icons` (PNG depuis `assets/icon.svg` via Chromium Playwright).
- `e2e/` : `smoke` (canvas, console, partie, draw calls ≤ 40, hors-ligne via service worker), `touch` (joystick + saut), `restart` (< 2 s), `shots` (captures menu / 3 min / niveau / mort).
- Hit-stop, recul au tir, squash du corps, fantôme de PV, balayage de la barre d'XP, pop du compteur de kills, mode « effets réduits ».
- Onglet perf (F3) : frame p50/p95 glissants sur 2 s, draw calls, triangles, entités, voix audio, résolution interne.

## Mesures (PC de Jimmy, Windows 11, Node 25, Chromium SwiftShader)

- bench : p50 0,20 ms · p95 0,36 ms par step à ~390 ennemis · tas −0,27 Mo sur 600 steps
- rendu à 3 min (capture Playwright) : 20 draw calls, ~23 k triangles, résolution interne 676×380
- relance mort → en jeu : 86 ms desktop, 97 ms mobile (test `restart`)
- sim bot average, 20 runs, seed 42 : survie p10 4:10 · p50 6:04 · p90 12:07 · morts < 3 min 0 % · kills@10 1352 · niveau@10 15 (50 runs/min)
- build : précache 13 entrées, 667 ko (Three inclus) ; ~165 ko gzip

## Reste pour franchir les portes

- Phase 0 : secret `FIREBASE_SERVICE_ACCOUNT` + variable `FIREBASE_PROJECT_ID` sur GitHub, CI verte, test d'installation Android/iOS par Jimmy (voir `docs/GATES.md`).
- Phase 1 : mesure fps sur le téléphone de Jimmy (onglet perf, 400 ennemis).
- Phase 2 : checklist game-feel (traînée de dash, hit-stop bornable, GIF), musique réelle.
- Phase 3 : Boomerang, Mines, évolutions, Volant, Cracheur, élites, coffres, 3 boss, zones de terrain, équilibrage aux cibles (survie p50 9–13 min, fin de run 8–15 %).
