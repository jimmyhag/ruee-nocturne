---
name: three-rendering
description: Rendu 3D Three.js performant pour un survivor low-poly pixelisé — instancing, matériaux, caméra, lumière, pièges de version. À lire avant tout code dans src/render/.
---

# Rendu Three.js — règles du projet

## Principe
Le rendu est un **consommateur** de la sim : il lit `world`, écrit des matrices et des couleurs dans des `InstancedMesh`, et rien d'autre. Zéro logique de jeu ici.

## Vérifier l'API avant d'écrire
La version de Three est épinglée dans `package.json`. Avant d'utiliser une classe ou une méthode, vérifier qu'elle existe dans `node_modules/three/src/` (ou `build/three.module.js`). Les API bougent (ex. `Geometry` supprimé, `BatchedMesh` récent, `setColorAt` qui alloue sur `count`). Ne jamais se fier à la mémoire.

## Instancing (obligatoire pour tout ce qui se répète)
```ts
const mesh = new THREE.InstancedMesh(geo, mat, CAP);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
for (let i = 0; i < CAP; i++) mesh.setColorAt(i, WHITE); // allouer avec count = CAP
mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
mesh.count = 0;                                            // PUIS réduire
mesh.frustumCulled = false;                                // la boîte englobante ne suit pas les instances
```
- Un `Object3D` « dummy » réutilisé pour composer les matrices, jamais `new Matrix4()` par instance.
- Après écriture : `instanceMatrix.needsUpdate = true` et `instanceColor.needsUpdate = true`, une fois par mesh et par frame.
- Flash blanc = `setColorAt(i, WHITE)` ; pas de changement de matériau.
- Une famille d'instances par : type d'ennemi, type de projectile, gemmes, particules, traînées, chiffres (si en 3D), débris.

## Matériaux et lumière
- `MeshLambertMaterial` ou `MeshToonMaterial` (avec `gradientMap` 3 tons pour le look cel). Jamais `MeshStandardMaterial` sur mobile.
- Lumière : `HemisphereLight` (ciel chaud / sol violet) + une `DirectionalLight`. **Pas de shadow map**. Ombres = disques `CircleGeometry` noirs semi-transparents (`depthWrite: false`).
- `scene.fog = new THREE.Fog(couleur du fond, near, far)` pour masquer les spawns et donner de la profondeur. Fond = couleur du fog.
- Effets additifs (traînées, halos) : `MeshBasicMaterial({ transparent, blending: AdditiveBlending, depthWrite: false })`.
- Palette : tokens dans `src/render/palette.ts`, dérivés de l'UI (`--ink`, `--accent`, etc.). Un ennemi = une couleur franche et une silhouette distincte.

## Résolution et qualité (phase 9 : rendu net par défaut)
- Trois niveaux dans `GameScene.setQuality` : 2 = net (CSS × DPR ≤ 2, ≤ 1600 px de haut), 1 = net ×0,75, 0 = pixel (≈ 380 px de haut, `#c.pixel` → `image-rendering: pixelated`, texture de sol au plus proche voisin). Réglage `settings.quality` auto | net | pixel ; en auto, `main.ts` descend d'un niveau quand le p95 des intervalles de frame dépasse 24 ms pendant trois fenêtres de 2 s (jamais de remontée en cours de run).
- Le renderer est créé une fois avec `antialias: true` (MSAA, quasi gratuit sur GPU à tuiles). Pas de post-traitement.
- Le niveau pixel reste **l'optimisation mobile de secours** (3–5× moins de fragments) : tout ce qui est dessiné doit rester lisible dans les deux modes (rayon ≥ 0,35 u à la distance de caméra standard).
- Finitions nettes : ombres douces (plan à texture radiale `textures.ts`, instancé pour les ennemis et les arbres), particules rondes orientées caméra (`billboardRx`), brume `FogExp2`, lumière de contre, `setDetail(12 | 7)` pour les primitives sans `seg` (personnages, boss ; les ennemis de masse gardent 5 segments).

## Caméra
- Perspective 50°, vue 3/4 haute : position `(px, 12.5·k, pz + 10.5·k)` avec `k = 1.35` en portrait, `1` en paysage.
- Suivi amorti indépendant du framerate : `pos += (target − pos) · (1 − 0.0005^dt)`.
- Avance dans la direction de déplacement (lookahead 1–1,5 u), recul de 10 % à l'apparition d'un boss, tremblement borné (shake ≤ 0,6 u, décroissance rapide).

## Géométrie et modèles
- V1 : primitives (box, cone, icosa, octa) composées en `Group`, puis fusionnées avec `BufferGeometryUtils.mergeGeometries` pour l'instancing (une géométrie par personnage/ennemi).
- Si des modèles arrivent : glTF via `GLTFLoader`, ≤ 600 triangles par ennemi, ≤ 2000 pour le joueur, textures ≤ 256² en palette plate. Les charger une fois, extraire la géométrie, instancier.
- Animation : pas de skinning sur les ennemis (trop cher instancié). Hop sinusoïdal, rotation, squash & stretch via la matrice d'instance.

## Terrain
- Sol : `PlaneGeometry` avec `CanvasTexture` en damier bruité, `NearestFilter`, `RepeatWrapping`. Décor (arbres, rochers, lanternes) en `InstancedMesh` statique généré par seed, grille spatiale pour les collisions.
- Lac : plan légèrement surélevé, matériau additif animé par `uv.offset`.

## Post-traitement
- Mobile : aucun. Vignette et flash de dégâts en **CSS** par-dessus le canvas (gratuit).
- Desktop (option dans réglages) : `EffectComposer` + `UnrealBloomPass` basse résolution. Désactivé par défaut.

## Mesure
- `renderer.info.render.calls` et `.triangles` affichés dans l'onglet perf (F3). Budgets dans PLAN.md §4.3.
- Avant de déclarer une optimisation : chiffres avant/après dans la PR.

## Pièges rencontrés sur ce projet
- Couleurs d'instances non allouées → tout rendu blanc ou invisible (voir ci-dessus).
- `frustumCulled` oublié → instances qui disparaissent en bord d'écran.
- `lookAt` chaque frame sur un `InstancedMesh` → inutile et coûteux ; composer la rotation dans le dummy.
- Changer `material.opacity` sur un matériau partagé → change toutes les instances ; utiliser la couleur d'instance ou un second mesh.
