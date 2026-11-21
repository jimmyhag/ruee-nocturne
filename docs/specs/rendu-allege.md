# Une image nette même quand la horde grossit

**Statut : 🟢 Implémenté**

Session du 20 novembre 2026. Version visée : **1.69.2**.

Jimmy : « Je suis allé jusqu'au boss final et il y a eu un moment avec trop d'ennemis dans le monde 3, et du coup le jeu
était pixelisé. Trouve des méthodes pour garder la qualité mais réduire l'affichage, genre les projectiles, pas tous les
afficher peut-être, etc. »

## Contexte

- Le réglage de rendu « auto » (par défaut, phase 9) mesure le p95 des intervalles entre images sur des fenêtres de 2 s
  (`src/main.ts`, vers la ligne 3700). Au-dessus de 24 ms pendant trois fenêtres de suite, il descend d'un niveau :
  2 net → 1 net ×0,75 → **0 pixel** (≈ 380 px de haut, `image-rendering: pixelated`). Il ne remonte **jamais** pendant la
  partie. Un seul pic de monde 3 suffit donc à pixeliser tout le reste de la partie, boss final compris.
- La seule réponse aux lenteurs est la résolution. Elle n'aide que si le **GPU** est le goulot. Si le temps est pris
  par le JavaScript (simulation, écriture des instances, chiffres de dégâts), réduire la résolution enlaidit l'image
  sans la rendre plus fluide. Le temps JS de chaque image (`t0` dans `frame`) n'est mesuré que quand l'onglet perf est
  ouvert.
- Ce qui grossit avec la horde : les ennemis (jusqu'à 520, ≈ 330 triangles en version nette, ≈ 150 en version simple),
  leurs contours et ombres, les projectiles du héros et leurs traînées additives, les particules (plafond 500), les
  chiffres de dégâts, les gemmes.

À ne pas casser : la règle 1 (zéro allocation par image), la règle 2 (budgets de PLAN.md §4.3, `just bench`), la
règle 3 (chaque coup garde flash, recul, son et chiffre), le réglage manuel net / pixel, la réduction des effets.

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Que réduire d'abord | En « auto », la descente **allège d'abord ce qui se dessine**, à résolution pleine, puis seulement baisse la résolution. Ordre : net → **net allégé** → net allégé ×0,85 → ×0,7 → ×0,6 | Jimmy : « garder la qualité mais réduire l'affichage » |
| 2 | Le mode pixel | Le mode « auto » ne choisit **plus jamais** le mode pixel. Le plancher automatique est la résolution ×0,6, avec un filtrage lisse : l'image est un peu plus douce, pas pixelisée. Le pixel reste un réglage manuel | Même retour. À ×0,6 sur un téléphone à DPR 2, on dessine à peu près autant de pixels qu'en mode pixel |
| 3 | Ce que l'allègement retire | Uniquement ce qui ne porte pas d'information de jeu. (a) Projectiles **du héros** au-delà d'un plafond : les plus éloignés du héros ne sont plus dessinés ; leurs dégâts, leurs sons et leurs chiffres restent. (b) Traînées des projectiles du héros réduites à un fantôme. (c) Particules plafonnées plus bas, sans jamais sauter un effet de kill (on remplace les plus anciennes). (d) Ennemis éloignés du héros en version simple (≈ 150 triangles), sans contour. (e) Décor dessiné moins loin. Les valeurs (plafond de projectiles, plafond de particules, distance de la version simple, distance du décor) sont des constantes nommées, choisies en mesurant les triangles et les appels de dessin au stress test, et écrites dans la PR | Le joueur ne compte pas les projectiles ; il voit un danger qui manque |
| 4 | Ce qui n'est jamais retiré | Les tirs ennemis et tous les télégraphes, tous les ennemis (au pire en version simple), les élites, les boss, les coffres, les bonus au sol, le héros, les feedbacks d'un coup (flash, recul, son, chiffre). Les chiffres gardent leur fusion actuelle | Règle 3 ; un danger invisible est un bug |
| 5 | CPU ou GPU | Le temps JS de chaque image est toujours mesuré (sans allocation). Si la lenteur vient du JS (son p95 dépasse 70 % de celui des intervalles), la résolution **ne baisse pas** : seul l'allègement s'applique. Précision (sparring, 21 nov.) : le temps JS compte la simulation et la préparation de la scène, **sans l'envoi au GPU** (`renderer.render`), qui peut attendre une file de commandes pleine sur un téléphone limité par le GPU | Baisser la résolution n'accélère pas le JS ; un envoi au GPU qui attend est une lenteur du GPU, pas du JS |
| 6 | Remontée | Quand la horde passe, le rendu **remonte** d'un cran après 10 s d'images confortables (p95 < 18 ms), cran par cran, jusqu'au net. Anti yo-yo : un cran qui retombe dans les 20 s après une remontée reste bloqué pour la partie | Un pic du monde 3 ne gâche plus le boss final |
| 7 | Ce que voit le joueur | Aucune bannière pour l'allègement ni pour la remontée. La bannière « Rendu allégé » n'apparaît qu'à la première baisse de résolution de la partie | Moins de bruit |
| 8 | Où vit la logique | L'automate de qualité (paliers, seuils, remontée, blocage) est une fonction pure testée par Vitest, sans DOM. `main.ts` lui passe les mesures, `GameScene` applique le palier. Les seuils sont des constantes nommées | Testable sans navigateur |
| 9 | Onglet perf | Il affiche le palier courant (net, allégé, ×0,85…) et le p95 du temps JS | Pour les mesures sur téléphone |
| 10 | Version | 1.69.2, livrée après la 1.69.1 et avant le lot A d'objets | Jimmy veut les choses en ligne vite |

## Hors périmètre

- Optimiser la simulation elle-même (le bench de 400 ennemis reste dans son budget).
- Changer le réglage manuel « net » : en « net », rien ne descend, comme aujourd'hui.
- Un mode de résolution continu (changer la taille du canevas à chaque image) : les paliers suffisent.

## Scénarios

```gherkin
# language: fr
Fonctionnalité: Une image nette même quand la horde grossit

  Scénario: Le rendu s'allège avant de baisser la résolution
    Soit une partie en réglage auto, au rendu net
    Quand les images traînent pendant trois fenêtres de mesure
    Alors le rendu passe au palier allégé
    Et la résolution interne ne change pas

  Scénario: Le réglage auto ne pixelise jamais l'image
    Soit une partie en réglage auto
    Quand les images traînent longtemps
    Alors la résolution descend palier par palier jusqu'à ×0,6
    Et le canevas n'est jamais en mode pixel

  Scénario: Une lenteur du JavaScript ne baisse pas la résolution
    Soit une partie en réglage auto
    Quand les images traînent parce que le JavaScript de chaque image est lent
    Alors le rendu passe au palier allégé
    Et la résolution interne ne baisse pas

  Scénario: Le rendu remonte quand la horde passe
    Soit une partie en réglage auto descendue au palier ×0,85
    Quand les images redeviennent fluides pendant 10 secondes
    Alors le rendu remonte d'un palier, puis d'un autre, jusqu'au net

  Scénario: Un palier qui retombe juste après une remontée reste bloqué
    Soit une partie en réglage auto remontée au rendu net
    Quand les images traînent de nouveau dans les 20 secondes
    Alors le rendu redescend
    Et il ne remonte plus jusqu'à la fin de la partie

  Scénario: L'allègement ne cache aucun danger
    Soit une partie au palier allégé avec une horde, des tirs ennemis, une élite et un boss
    Alors chaque tir ennemi, chaque ennemi, l'élite et le boss sont dessinés
    Et le nombre de projectiles du héros dessinés ne dépasse pas le plafond
    Et le nombre de triangles dessinés baisse par rapport au rendu net

  Scénario: Le réglage net ne descend jamais
    Soit une partie en réglage net
    Quand les images traînent longtemps
    Alors le rendu reste net, sans allègement
```

## Vérification attendue

- Vitest pour l'automate (chaque scénario de palier), e2e PC et mobile avec le crochet `debug.slowFrames` (et un crochet
  équivalent pour un JS lent), `e2e/quality.spec.ts` adapté dans un commit dédié : le repli « 2 → 1 → 0 » devient la
  descente de la décision 1.
- Mesures avant / après au stress test (ennemis, triangles, appels de dessin, temps JS) dans la PR, `just bench`
  inchangé, relecture `perf-reviewer`.
- Captures lues : net, allégé et ×0,6 sur la même horde.
