---
name: mobile-perf
description: Performance d'un jeu WebGL sur téléphone — zéro allocation par frame, pools, grille spatiale, budgets, profilage, bench reproductible. À lire avant toute optimisation, tout code dans la boucle chaude, ou quand npm run bench échoue.
---

# Performance mobile — méthode et recettes

## 1. Mesurer d'abord
- `npm run bench` : 10 s de sim à 400 ennemis, imprime `ms/step` (p50, p95), allocations (`performance.measureUserAgentSpecificMemory` si dispo, sinon delta heap Node), entités. **Échoue** si p95 > 6 ms de sim ou si le tas croît de > 2 Mo sur 10 s.
- Onglet perf en jeu (F3) : frame ms (p50/p95 glissants), `renderer.info` (calls, triangles), entités, voix audio. Lire ces chiffres sur un **vrai téléphone** avant toute conclusion.
- Chrome DevTools > Performance avec CPU ×4 : simule un milieu de gamme. Memory > Allocation sampling pour traquer les allocations par frame.
- Playwright peut relever `renderer.info` via `page.evaluate` : utile en CI pour le nombre de draw calls.

## 2. Zéro allocation en régime permanent
Interdit dans `step()` et `render()` :
- `array.filter/map/slice`, spread `[...a]`, `Object.assign`, `new Vector3()`, `{}` littéraux, closures (`arr.forEach(e => …)`).
- `Math.hypot` sur les chemins chauds (lent sur certains moteurs) → `Math.sqrt(dx*dx+dz*dz)`, ou comparer les carrés.
- `Set`/`Map` créés par frame. Les grilles spatiales réutilisent leurs tableaux (`length = 0`, jamais `new`).

Autorisé : boucles `for` indexées, pools avec `alive` + swap-remove, scratch vectors modulaires, `Float32Array` préallouées.

Pattern de pool :
```ts
class Pool<T> { items: T[]; count = 0; constructor(n: number, make: () => T) { this.items = Array.from({length: n}, make); }
  alloc(): T | null { return this.count < this.items.length ? this.items[this.count++] : null; }
  free(i: number) { this.count--; const t = this.items[i]; this.items[i] = this.items[this.count]; this.items[this.count] = t; } }
```

## 3. Grille spatiale (ennemis, projectiles, gemmes)
- Cellule 2,5 u (≈ plus grand rayon ennemi + marge). Clé entière `ix * 65536 + iz`. Reconstruite chaque step dans des tableaux réutilisés (`cellStart`/`cellCount` + indices triés en bucket).
- Requêtes : `query(x, z, r)` ne visite que les 9 cellules voisines. Séparation ennemi-ennemi : uniquement voisins immédiats.
- Collision ennemi-joueur : 1 requête. Projectiles : 1 requête par projectile. Aura : 1 requête de rayon r. Jamais O(n²).

## 4. Rendu
- Résolution interne ≈ 400 px de haut, upscale pixelisé → c'est le levier n°1 (voir `three-rendering`).
- ≤ 40 draw calls : une `InstancedMesh` par famille, décor statique fusionné.
- Pas de shadow map, pas de post-traitement, pas de `MeshStandardMaterial`.
- `renderer.info.autoReset = false` + reset manuel si on veut cumuler.
- Textures : ≤ 256², `NearestFilter`, pas de mipmaps inutiles ; palette plate.
- Audio : décoder les buffers une fois ; pas de `new Audio()`.

## 5. Boucle principale
```ts
let acc = 0; const STEP = 1/60;
function frame(now) { let dt = min(0.1, (now - last)/1000); last = now; acc += dt;
  let n = 0; while (acc >= STEP && n < 4) { step(world, input, STEP); acc -= STEP; n++; }
  if (n === 4) acc = 0;  // spirale de la mort évitée : on saute, on ne rattrape pas
  render(world, acc / STEP);  // interpolation
}
```
- `visibilitychange` → pause. Retour d'onglet → `last = now` (pas de méga-step).
- Sur un frame > 50 ms répété 10× : passer le préréglage qualité d'un cran (particules ÷2, résolution interne −20 %, traînées off). Préréglages : Haut / Moyen / Bas / Auto.

## 6. Mémoire et chargement
- Build ≤ 1,5 Mo gz. Three importé par modules (`three/src/...` ou tree-shaking Vite), pas de `three/examples/jsm/*` en vrac.
- Assets audio ≤ 600 ko total, `.ogg` + `.m4a`.
- Précache PWA de tout l'app shell ; chargement différé des sons de boss et de la musique couche 3.
- Pas de fuite : écouteurs retirés à la fin d'un run, `geometry.dispose()` sur les objets non poolés.

## 7. iOS Safari — pièges
- `AudioContext` créé et `resume()` **dans** un geste utilisateur.
- `100vh` faux → `height: 100%` sur html/body, `viewport-fit=cover`, `env(safe-area-inset-*)`.
- `touch-action: none` sur le canvas, `preventDefault` sur `touchmove` document pour bloquer le scroll et le zoom.
- WebGL perd le contexte sur fond prolongé : écouter `webglcontextlost`/`restored`, recréer les ressources.
- Pas de `requestAnimationFrame` au-dessus de 60 Hz garanti : ne rien supposer sur la cadence.

## 8. Protocole d'une PR perf
1. Chiffres avant (bench + téléphone).
2. Une seule optimisation par commit.
3. Chiffres après. Si gain < 5 %, on revient en arrière : complexité non payée.
4. Capture de l'onglet perf dans la PR.
