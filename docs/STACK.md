# Stack et état de la base (v0.1, 2 nov. 2026)

| Composant | Version | Note |
|---|---|---|
| Node | 22 | |
| Vite | 8.3 | `SINGLE=1` → build en un fichier (artifact / test rapide) |
| TypeScript | 7.0 | strict, `noUnusedLocals` |
| Three.js | 0.187.0 | `InstancedMesh.setColorAt` alloue sur la capacité (plus de piège r128) ; `three.core.js` séparé |
| Vitest | 5.0 | sim uniquement |
| tsx | 4 | CLI sim et bench |
| idb-keyval | 6.2 | sauvegarde méta, repli localStorage |

## Ce qui est fait (phase 1 largement couverte, début de phase 2)
- `src/sim/` : monde, pools, grille spatiale à tableaux fixes, spawner, 4 armes, 6 passifs, progression, événements. Déterministe (test sur 3600 steps).
- `src/render/` : instancing pour tout, décor généré par seed, particules, éclairs, chiffres de dégâts, caméra avec avance et shake.
- `src/platform/` : clavier (ZQSD/WASD/flèches), joystick flottant, manette (Gamepad API), audio procédural 3 bus + pool 24 voix + musique 3 couches.
- `src/ui/` : HUD à cache, cartes de niveau, écrans.
- `tools/` : `sim-cli` (3 bots, percentiles, cibles, JSON), `bench` (p95, tas).
- Hit-stop, recul au tir, squash du corps, fantôme de PV, balayage de la barre d'XP, pop du compteur de kills, mode « effets réduits ».

## Mesures (conteneur, Chromium swiftshader)
- bench : p50 0,38 ms · p95 0,60 ms par step à ~380 ennemis · tas +0,12 Mo sur 600 steps
- rendu à 3 min : 18–24 draw calls, ~23 k triangles
- sim bot average, 40 runs, seed 42 : survie p10 4:06 · p50 7:21 · p90 12:48 · morts < 3 min 3 % · kills@10 1362 · niveau@10 15
- build : 162 ko gzip (Three inclus)

## Reste pour franchir les portes
- Phase 0 : ESLint/Prettier, Playwright configuré en `e2e/`, vite-plugin-pwa, hooks Git, repo GitHub, Firebase, CI verte, Lighthouse.
- Phase 1 : mesure fps sur le téléphone de Jimmy, couverture sim ≥ 80 %.
- Phase 2 : checklist game-feel (traînée de dash, hit-stop bornable, GIF), musique réelle.
- Phase 3 : Boomerang, Mines, évolutions, Volant, Cracheur, élites, coffres, 3 boss, zones de terrain, équilibrage aux cibles (survie p50 9–13 min, fin de run 8–15 %).
