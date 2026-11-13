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
- Palette : tokens dans `src/render/palette.ts`, dérivés de l'UI (`--ink`, `--accent`, etc.) : nuit bleue depuis la phase 14 (`ink #0f1628`, `fog #182341`, accent lanterne `#ffb347`) ; les deux sources doivent rester identiques. Un ennemi = une couleur franche et une silhouette distincte. Le menu rend la scène en continu derrière l'accueil (`renderIdle`, cadrage `menuWide`) : zéro allocation là aussi.

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
- Modèles glTF (voir plus bas) : ≤ 600 triangles par instance de décor nombreuse, ≤ 2000 pour un objet unique à l'écran ; héros KayKit ≈ 4,5 k triangles (un seul à l'écran). Les charger une fois, extraire la géométrie, instancier.
- Animation : pas de skinning sur les ennemis (trop cher instancié). Hop sinusoïdal, rotation, squash & stretch via la matrice d'instance.

### Modèles glTF (phase 20 : KayKit CC0)
- **Pipeline** : `npm run assets` (`tools/assets/config.ts` choisit modèles, animations, accessoires et plafonds de triangles ; `build.ts` produit `public/models/*.glb` et `src/render/models.json`). Ne jamais commiter les packs sources.
- gltf-transform : jeter les **samplers et channels** d'une animation avant l'animation elle-même, sinon `prune` garde leurs accessors (un héros pesait 2 Mo) ; retirer les pistes égales à la pose de repos ; `unpartition()` pour un seul buffer.
- Héros skinnés : exporter avec `meshopt({ quantizationVolume: 'scene' })`. En quantification par maillage, chaque partie a son propre repère et la fusion en une `SkinnedMesh` n'affiche plus que la tête.
- Objets statiques : **déquantifier** (`toFloat` dans `src/render/models.ts`) avant `applyMatrix4` : un Int16 normalisé est borné à [-1, 1] et le modèle s'aplatit.
- Fusion skinnée (`mergeSkinned`) : mêmes attributs partout (UV ajoutés si absents, `skinIndex` en Uint16) ; un maillage émissif à part (yeux de la Revenante) plutôt qu'un attribut manquant qui casse tout.
- Contour par coque inversée sur un modèle à arêtes vives : normales **lissées** pour l'extrusion + `polygonOffset`, sinon des traits noirs traversent le visage.
- Les InstanceWriter du décor reçoivent la géométrie et le matériau du modèle une fois chargé (couleur d'instance blanche) : même nombre d'appels qu'avant. Décor dense (arbres, lanternes, cimetières) : seules les instances à moins de `PROP_DRAW` u sont écrites, re-triées tous les 4 u de déplacement.
- Toujours un **repli procédural** : rien ne doit attendre un fichier pour être jouable.

### Décor stylisé (phase 44 : Quaternius « Ultimate Stylized Nature », CC0)
- **Pipeline** : `npm run assets -- --nature` (`tools/assets/nature.ts`, modèles et plafonds dans `NATURE` de `config.ts`). Les FBX se lisent en Node avec le `FBXLoader` de three ; dans tout le pack, l'axe **y de la géométrie** est la hauteur (ignorer la rotation du nœud).
- Un arbre = écorce simplifiée (meshopt, drapeau `Prune` pour retirer les rameaux isolés) + cartes de feuilles échantillonnées par points les plus éloignés et agrandies + un cœur opaque sombre par houppier. Plafond : 600 triangles.
- **Un seul matériau** pour tout le décor : toon, `vertexColors`, `alphaTest 0.5`, UNE face (cartes tournées vers l'extérieur ; herbe et fleurs ont leur matériau à deux faces), atlas 1024². Les parties sans texture visent un texel blanc opaque de l'atlas.
- `COLOR_0` est un VEC4 : `a = 1` marque ce que le monde teinte (feuilles, herbe). `loadNature` sépare couleur et masque (`toFloat` retire l'attribut à 4 composantes, sinon l'alpha de sommet découperait l'écorce) ; `tintedNature` rend une géométrie teintée par monde (`PAL.stages[i].decor`).
- Normales des feuilles « en boule » autour du houppier : ombrage doux, pas de papillotement carte par carte.
- Le semis (herbe, fleurs, buissons) vient d'une grille hachée autour du joueur (`scatter`), refait tous les 4 u, sans allocation ; `TerrainView.bareAt` l'écarte de la terre, des pistes et des lacs.

### Foule animée (phase 21 : morphs instanciés)
- Pas de squelette par instance : poses cuites au chargement (`mixer.setTime` → `SkinnedMesh.getVertexPosition` / `applyBoneTransform` avec un Vector4 de w = 0 pour les normales) en `morphAttributes.position` et `normal` **absolues** (`morphTargetsRelative = false`).
- `InstancedMesh.morphTexture` : une ligne par instance = [poids de base, poids des poses]. Pour des poses absolues, le poids de base est **0** et les poids somment à 1. Allouer la DataTexture à **pleine capacité** soi-même (`setMorphAt` l'alloue sur `count`, même piège que les couleurs) et écrire dans `image.data` (`src/render/pose.ts`), `needsUpdate` une fois par frame et par type.
- Simplification : meshopt `simplifyWithAttributes` en mode **Permissive**. Le mode normal bloque à ≈ 1 500 triangles sur les modèles KayKit, qui ont presque un sommet par triangle à cause des coutures d'UV et de normales.
- Contour d'une géométrie morphée : pousser APRÈS `#include <morphtarget_vertex>` (le chunk multiplie `transformed` par le poids de base, 0) et recalculer la normale morphée. `objectNormal` n'existe pas dans un MeshBasicMaterial non skinné.
- Un jumeau peut partager `instanceMatrix` et `morphTexture` avec le maillage principal : il suffit de recopier `count`.

## Terrain
- Sol : maillage en relief (fenêtre mobile, `terrain.ts`), `MeshLambertMaterial` à couleurs par sommet. Phase 44 : **deux textures** par monde (tapis `a`, terre `b`, `public/models/ground-*.jpg`) mélangées dans `onBeforeCompile` par l'attribut `blend.x` ; `blend.y` efface la texture (pistes). La frontière est découpée par le grain du tapis. La couleur de sommet ne porte que l'ombrage cuit et de grandes taches claires et sombres.
- Tant que les textures chargent (ou hors ligne), la texture dessinée (`groundTexture`) sert de repli pour les deux.
- Décor (arbres, rochers, lanternes) en `InstancedMesh` généré par seed, grille spatiale pour les collisions.
- Lac : plan légèrement surélevé, matériau additif animé par `uv.offset`.

## Matériaux toon habillés (phase 44 B)
- Tout matériau toon passe par `stylize()` (`toon.ts`) ou `toonMaterial()` : la rampe (`toonGradient`, RGBA) est lue en couleur, l'ombre tire vers le bleu-violet. Un `MeshToonMaterial` créé à la main ne lit que le canal rouge (ombres grises).
- Liseré de lumière : `stylize(mat, couleur, force)`, terme de Fresnel au cube ajouté avant `opaque_fragment`. Héros : chaud, 0,75. Ennemis : couleur du type, 0,4 (boss ×1,5). Au-delà, les petits modèles vus de loin deviennent des aplats fluo ; sur un modèle clair (crâne du Volant), force 0.
- Un seul programme pour tous (liseré noir = aucun) ; la couleur est un uniforme par matériau (`userData.rim`).

## Effets lumineux sur sol clair (1.42.1)
- Plus d'`AdditiveBlending` pur pour les effets de jeu : sur l'herbe claire il se délave en blanc. `softGlow(mat, cover, core)` (`textures.ts`) : couleur prémultipliée, alpha écrit = `cover` × alpha (0 = additif, 1 = normal), cœur blanc optionnel. Orbes 0,75 / 0,8 ; arcs 0,8 / 0,3 ; éclairs 0,6 / 0,7 ; halos et colonnes 0,5.
- Une couleur d'effet pâle reste pâle : choisir des teintes franches (`cSlashFaux`, `cSlashBlade`, `PAL.proj`).

## Personnages KayKit en proportions humanoïdes (phase 46)
- **Jamais d'échelle d'os à l'exécution pour changer des proportions** : une échelle non uniforme héritée cisaille le membre dès que l'articulation plie. `reproportion()` (`tools/assets/kaykit.ts`) déplace les articulations et redéforme le maillage une fois, au repos : sommet′ = Σ poids · (monde′ de l'os · étirement local · inverse de liaison) · sommet, puis inverses de liaison = (monde′)⁻¹. À l'exécution, c'est un squelette ordinaire.
- **Un squelette peut être partagé par plusieurs maillages** (three : même `Skeleton` pour toutes les parties d'un personnage) : garder les inverses de liaison d'origine jusqu'à la fin du calcul, sinon la deuxième partie est déformée avec celles de la première.
- **Reprendre une animation sur un autre squelette** (`retargetClips`) : le tronc et la tête prennent la rotation de la pose par rapport au repos (les deux repos sont debout) ; chaque segment de membre est orienté dans la direction du segment source (arc le plus court depuis sa direction courante, de la racine vers l'extrémité) ; la main prend la rotation de la main source par rapport à son repos, corrigée de l'écart entre les deux poses de repos (A contre T). Le bassin suit à hauteur relative.
- **Le repos d'un fichier dont les pistes immobiles ont été retirées est la pose par défaut de ses nœuds**, pas `skeleton.pose()` (qui remet la pose de liaison, différente).
- `getElement(i, cible)` de gltf-transform écrit dans le tableau donné sans le raccourcir : un tableau par taille d'élément.
- Objets tenus : liés à 100 % à l'os `handslot` de KayKit ; « tenu droit » = axe long vers le haut à la première image du repos (calculé au build, pas d'angles à deviner).
- Tenues recolorées : la texture KayKit est une palette où peau et tenue se côtoient ; la peau est reconnue à sa couleur (teinte 14–44°, claire) et laissée.
- **Ennemis (phase 46 B)** : même chaîne que les héros (`ENEMY_MODELS`, `npm run assets -- --enemies`), plusieurs niveaux de détail tirés des mêmes sommets (`KayBuild.lods`).
  - Les clips du pack KayKit ne vont pas sur un corps affiné (bras tenus loin du buste, faits pour des corps trapus) : reprendre les clips UAL.
  - Texture en palette : simplifier en **respectant les coutures d'UV**. Laisser les UV libres étire des triangles entre deux cases de la palette et mélange les couleurs.
  - À ≈ 330 triangles, un membre fin devient un fil : les sbires ont leur réglage (`FIT_MASS`, tête et membres plus forts). Juger sur une capture en jeu, à la distance de la caméra, pas sur une planche rapprochée.
  - Maillage rigide porté par un os (ailes du vampire) : lié à 100 % à cet os à la fusion ; son point d'attache suit l'étirement de l'os.
  - Texture hors fichier (`texture`) : tous les matériaux du modèle l'utilisent, aucun ne devient une pastille de couleur.
  - Créature volante (`fly`) : cuite centrée sur sa hauteur et penchée vers la caméra ; le rendu ne fait que la poser à son altitude.
  - Modèles déjà colorés : couleur d'instance presque blanche, liseré éclairci et faible, sinon la couleur du type salit la texture.

## Pierre à runes : totem et sanctuaires (1.42.1, phase 45)
- `stoneKit()` (`src/render/totem.ts`) assemble des pièces à facettes : couleur unie par sommet, attribut `glow` (1 = la pièce prend la couleur de l'état). `stoneMaterial(glow?)` : avec une couleur, un uniforme (objet unique, le totem) ; sans, la couleur d'instance (`shrine.ts`), que la pierre ignore (`vColor.rgb = color` sous `USE_INSTANCING_COLOR`).
- L'état d'un objet instancié se lit donc par la couleur d'instance de ses seules parties lumineuses : pas de second écrivain, pas d'appel en plus. Une couleur au-delà de 1 reste lisible en plein jour.
- Un objet au centre d'une zone où le joueur se tient (sanctuaire) ne doit pas le cacher : fer à cheval ouvert vers la caméra (+z), rotation d'instance nulle.
- Projectiles de boss (`Shot.boss`) : orbe dans `spitW` + halo dans `glowW`, deux écrivains déjà actifs.

## Lumière et brume (phase 44)
- Les intensités de three sont physiques : une lumière de 1 éclaire une surface blanche à 1/π. Hémisphère ≈ 2 et soleil ≈ 2,4 donnent une texture à sa vraie couleur ; en dessous, tout est sombre.
- Brume **linéaire** (`THREE.Fog`, 30 → 115 u) : la caméra est à ≈ 16 u du joueur, une brume exponentielle voilait tout l'écran.
- Couleurs et intensités par monde dans `PAL.stages` (`dusk` → `night`), interpolées par `lightCycle`.

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
- Un matériau `transparent` et `side: DoubleSide` est dessiné en **deux appels** par three (faces arrière, puis avant), sauf `forceSinglePass: true`. Pour une forme plate (anneau, disque, plan, ruban), la seconde passe ne change pas un pixel : toujours mettre `forceSinglePass`. Trois appels étaient payés pour rien dans chaque combat (cercles d'attaque, disques, arcs de lame) jusqu'à la 1.53.1. Pour trouver ce genre de fuite : compter les passages par `onAfterRender` et comparer à `renderer.info.render.calls`.
- Un `InstancedMesh` à `frustumCulled = false` coûte un appel de dessin dès qu'il a une instance, même derrière la caméra. Pour les lieux de la carte (crâne, totem de boss, coffre, sanctuaire, stèle), n'écrire l'instance que si `GameScene.seen(x, y, z, r)` dit qu'elle touche le champ de la caméra (champ de la frame précédente, marge de 6 u). Sans ce test, 7 à 20 crânes par carte ont fait passer le mobile de 38 à 43 appels pour un budget de 40 (1.53.1). Un test de distance au joueur ne suffit pas : la caméra regarde vers le nord, pas en cercle.
- Lieu de la carte ajouté (phase 48 : crânes, totems de boss) : un `InstancedMesh` à `count = 0` ne coûte aucun appel, mais dès qu'une instance est écrite l'appel est payé, même hors champ (`frustumCulled = false`). N'écrire le modèle et son anneau que sous `TOTEM_VIEW2` (38 u, ce que la caméra voit), pas sous `POI_DRAW2` (50 u) ; seule la colonne de lumière se dessine de loin. Le budget mobile d'appels est au plafond : tout appel ajouté au centre de l'écran doit être mesuré par `e2e/stress.spec.ts`.
