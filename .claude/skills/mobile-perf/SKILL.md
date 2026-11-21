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
- Résolution interne : net par défaut depuis la phase 9 (CSS × DPR ≤ 2). 1.69.2 : en auto, le repli allège d'abord ce qui se dessine (rendu allégé), puis baisse la résolution par paliers ×0,85, ×0,7, ×0,6, toujours lisses ; le mode pixel (≈ 400 px de haut) n'est plus qu'un réglage manuel (voir `three-rendering`).
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
- Rendu auto (1.69.2, automate pur `src/render/quality.ts`, appelé par `main.ts` à chaque fenêtre de 2 s, en jeu) : p95 des intervalles et p95 du temps JS, sur les images de la fenêtre seulement (`windowP95` : anneau de 240 images, 2 s à 120 Hz ; à 5 images par seconde il couvrirait presque une minute). Temps JS = simulation et préparation de la scène, **sans** `renderer.render` (`GameScene.submitMs`) : sur un téléphone limité par le GPU, l'envoi attend une file de commandes pleine et ferait croire à un JS goulot. Trois fenêtres au-delà de 24 ms → un palier plus bas (net → net allégé → ×0,85 → ×0,7 → ×0,6) ; si le JS dépasse 70 % du p95 des intervalles, la résolution ne baisse pas (elle n'accélère pas le JS), seul l'allègement s'applique. Cinq fenêtres sous 18 ms (10 s) → un palier plus haut ; un palier qui retombe moins de 20 s après une remontée reste bloqué pour la partie. Bannière « Rendu allégé » à la première baisse de résolution de la partie seulement. Le temps JS de chaque image est toujours mesuré (anneau préalloué). Testé par `debug.slowFrames(ms)` et `debug.jsTime(ms)` (`e2e/quality.spec.ts`) ; `debug.renderStep(n)` impose un palier (mesures, captures).

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
