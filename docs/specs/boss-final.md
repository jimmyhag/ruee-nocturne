# Le Cœur de la Nuit — un boss final après le monde 3, puis le monde infini corrompu

**Statut : 🟡 Prêt pour le dev** (après la fusion de la 1.67.0, dont il dépend)

Session du 20 novembre 2026, avec Jimmy, pendant la 1.67.0. Jimmy : « Dans le monde 3, il va y avoir une étape en plus :
une fois le boss de fin mort, on va devoir être transporté dans un autre monde qui sera le boss final du jeu, et celui-là
va devoir avoir des phases, des choses qui le rendent bien plus chiant et fort à battre que les autres boss. Après ce
boss, si vaincu, on aura un monde infini avec corrompus. » Sur la proposition du sparring : « J'aime bien l'idée des 4
phases, on va tester comme ça, go » ; pour le monde infini : « le basique que tu as fait pour les autres » (la montée
des corrompus de la prolongation). Sparring en délégation : les questions sans réponse (mort contre le boss final,
difficulté visée) sont tranchées par la recommandation du sparring, qui vaut réponse de Jimmy ; il peut revenir sur
n'importe laquelle.

## Contexte

Aujourd'hui, la mort du boss du totem du monde 3 est la **victoire** (`Mode.Won`, `Ev.Victory`, `src/sim/stages.ts`) :
la feuille de victoire propose de continuer en **monde infini** (`startEndless`, `ENDLESS`) ou de terminer. Depuis la
1.67.0, la prolongation des mondes 1 à 3 fait apparaître des **monstres corrompus** (`src/sim/corrupt.ts`, `CORRUPT`),
mais le monde infini n'en a pas.

À ne pas casser : le défi du jour (son boss final et sa suite en monde infini) reste identique au bit près ; la partie
guidée (monde 1) ne change pas ; la progression des joueurs (succès, statistiques, « victoires », classement) garde son
sens ; la règle 1 (zéro allocation par pas) ; le budget d'appels de dessin mobile (PLAN.md §4.3) ; la règle 3 (chaque
coup a son retour) ; la règle 13 (tout réglage de difficulté choisi par la simulation) ; le déterminisme (`w.rng`).

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Le passage | À la mort du boss du totem du monde 3 : le monde 3 est **vaincu** (ce qui comptait jusqu'ici comme la victoire est enregistré à ce moment : statistique « victoires », succès, bonus d'or de fin, classement), le chrono tombe à 0 comme dans les autres mondes (prolongation et corrompus de la 1.67.0), et un **portail rouge** s'ouvre vers **l'Arène**. Plus de feuille de victoire à ce moment | Jimmy : « transporté dans un autre monde » ; aucune progression existante ne change de sens |
| 2 | L'Arène | Un quatrième « monde » (`stage` 3) : petite carte **ronde et fermée** (rayon ≈ un écran et demi de téléphone), sol du monde 3 assombri, bordée d'un cercle de flammes infranchissable. Pas de chrono, pas de coffres, pas de marchand, pas de sanctuaires, pas de totems ; aucune horde au départ, seulement les renforts que décident les phases. Le boss apparaît au centre 3 s après l'entrée (bannière « Le Cœur de la Nuit ») | Le face-à-face ; on entre avec ce qu'on a construit |
| 3 | Le boss | **Le Cœur de la Nuit** : le modèle du Colosse agrandi (≈ ×1,5), teint du violet des corrompus avec leur aura et leurs yeux (aucun nouveau modèle ni appel de dessin en plus), une barre de vie de boss avec ses trois seuils de phase marqués. PV et dégâts dans `balance.ts` (`FINAL`), choisis par la simulation (décision 10). Pas de rage au temps (`BOSS.enrage`) : sa fureur est la phase 4 | Plus fort et plus « chiant » que les autres, sans nouvel asset |
| 4 | Phase 1 — Le souvenir (100 → 70 %) | Il reprend, une par une et en boucle, une attaque de chacun des trois boss : la **charge** du Gardien (couloir rouge), la **salve** en éventail de l'Essaim-mère, les **cercles** du Colosse. Mêmes télégraphes, mêmes sons | Il teste ce que le joueur a appris en chemin |
| 5 | Phase 2 — Les sceaux (70 → 40 %) | À 70 %, bannière « Brise les sceaux ! » : il devient **invulnérable** (les coups font un retour « bloqué » : flash gris, son mat, pas de chiffre) et pose **4 sceaux** à quatre points de l'arène (la stèle du totem de boss, PV fixes dans `FINAL`). Tant qu'un sceau tient, il ne prend aucun dégât et continue d'attaquer (attaques de la phase 1, plus lentes) ; des **corrompus** arrivent par petits groupes. Le dernier sceau brisé le rend vulnérable et lance la phase 3. Les sceaux sont visibles sur la minicarte | Force à bouger, punit le joueur qui campe |
| 6 | Phase 3 — L'éclipse (40 → 15 %) | Bannière « L'éclipse » : l'arène s'assombrit (brume et lumière, plus une vignette CSS ; la zone autour du héros reste lisible) et le **cercle de flammes se resserre** lentement jusqu'à un rayon minimal (`FINAL.ring`), qui brûle si on le touche (annoncé : il rougit 0,7 s avant chaque pas). Il crée **deux doubles** (les vrais doubles de la phase 50) : seul le vrai a les yeux qui brillent ; taper un double ne lui fait rien, un double disparaît en fumée s'il est touché trois fois puis revient 6 s plus tard. Les doubles attaquent moins souvent que lui | Lecture de l'écran sous pression |
| 7 | Phase 4 — La fureur (15 → 0 %) | Bannière « La fureur » : ses attaques s'enchaînent ≈ 1,5× plus vite et il lance le **Jugement** toutes les ≈ 12 s : toute l'arène devient rouge sauf **une zone sûre** (cercle lumineux, placée loin du héros mais atteignable à la course), annoncée **1,5 s** avant l'impact ; être hors de la zone à l'impact coûte une grosse part des PV (pas la mort à coup sûr : `FINAL.judgement`). Les doubles disparaissent | Le final : courir au bon endroit au bon moment |
| 8 | Toujours lisible | Chaque attaque est annoncée (télégraphe d'au moins 0,6 s, 0,7 s si ça se saute, 1,5 s pour le Jugement), réutilise un danger existant quand c'est possible (déjà dessiné, sonorisé, esquivé par le bot), et a son son ; chaque changement de phase a sa bannière, un son et une courte pause du boss (≈ 1,5 s, invulnérable) pour respirer. Valeurs dans `FINAL` avec une ligne de « pourquoi » | Dur mais jamais injuste (game-feel §9) |
| 9 | Mourir dans l'Arène | La partie s'arrête ; le monde 3 reste vaincu (décision 1) : on garde l'or, les succès et la « victoire » d'avant. L'écran de fin dit « Vaincu par le Cœur de la Nuit » et la phase atteinte | Une demi-victoire, pas une punition après 25 minutes |
| 10 | Le vaincre | **Victoire totale** : bannière, feuille de victoire (celle d'aujourd'hui, qui propose de continuer en monde infini ou de terminer), bonus d'or (`FINAL.gold`), une statistique « Cœur de la Nuit vaincu » et un succès « Aube » (FR) / « Dawn » (EN), synchronisés comme les autres (`PROGRESS_KEYS`, règle 8) | La vraie fin du jeu |
| 11 | Le monde infini corrompu | Le monde infini commence **après** le boss final (plus après le monde 3) et a des **corrompus**, avec la même montée que la prolongation (10 % à l'entrée, 40 % à +3 min, `CORRUPT.share`), les mêmes compétences et récompenses. Le monde infini du défi du jour n'en a pas | Jimmy : « le basique que tu as fait pour les autres » |
| 12 | Le bot | Le bot de simulation sait jouer l'Arène : esquiver comme pour les boss d'origine, aller briser les sceaux (le plus proche d'abord), rester dans le cercle de flammes, viser le vrai boss (pas les doubles), courir à la zone sûre du Jugement. Sans cela, la mesure ne vaut rien (survivor-design §7) | Règle 13 |
| 13 | Équilibrage (règle 13) | Profils nu et maxé, bot `average`, 4 graines × 200, regroupées : **boss final vaincu par 40 à 60 % des parties maxées qui l'atteignent** (Jimmy : « bien plus chiant et fort que les autres ») ; combat p50 **2 à 4 min** ; aucune phase ne fait plus de 50 % des morts dans l'Arène ; le Jugement fait au plus 25 % des morts dans l'Arène ; les cibles existantes de `tools/targets.ts` (victoire = monde 3 vaincu) ne bougent pas de plus que le bruit ; monde infini mesuré à part (`--endless`, nouvelles valeurs consignées). Le défi du jour reste identique au bit près | Difficulté choisie par la mesure |
| 14 | Les expliquer | Une ligne dans « Comment jouer » (le passage du monde 3 vers l'Arène) ; les bannières de phase disent quoi faire (« Brise les sceaux ! », « Trouve le vrai ! », « Cours à la lumière ! ») ; FR et EN | Ce qu'on ne lit pas n'existe pas pour le joueur |
| 15 | Reprise d'une partie | Une partie sauvegardée dans l'Arène reprend dans la bonne phase ; une sauvegarde de la 1.67 reprend comme avant (le monde 3 encore en cours suit les nouvelles règles à la mort de son boss) | Phase 49 : reprise identique |

## Scénarios

```gherkin
# language: fr
Fonctionnalité: Le boss final et le monde infini corrompu

  Scénario: Battre le boss du monde 3 ouvre le passage vers l'Arène
    Soit une partie au monde 3
    Quand le boss du totem meurt
    Alors le monde 3 compte comme vaincu, le chrono tombe à 0 et un portail rouge mène à l'Arène

  Scénario: Le boss final a quatre phases
    Soit le Cœur de la Nuit dans l'Arène
    Quand ses PV passent sous 70 %, puis 40 %, puis 15 %
    Alors il passe aux sceaux, puis à l'éclipse, puis à la fureur, avec une bannière à chaque fois

  Scénario: Les sceaux protègent le boss final
    Soit le boss final en phase 2
    Alors il ne prend aucun dégât tant qu'un sceau tient
    Et il redevient vulnérable quand le dernier sceau est brisé

  Scénario: Seul le vrai boss prend des dégâts pendant l'éclipse
    Soit le boss final en phase 3 avec ses deux doubles
    Quand le joueur touche un double
    Alors le boss ne perd aucun PV
    Et le cercle de flammes se resserre sans passer sous son rayon minimal

  Scénario: Le Jugement laisse toujours une zone sûre atteignable
    Soit le boss final en phase 4
    Quand il lance le Jugement
    Alors une zone sûre est annoncée 1,5 s avant l'impact, à une distance que le héros peut parcourir à temps
    Et un héros dans la zone ne prend aucun dégât du Jugement

  Scénario: Mourir dans l'Arène garde la victoire du monde 3
    Soit un joueur qui meurt contre le boss final
    Alors sa partie compte comme une victoire du monde 3, avec son or et ses succès

  Scénario: Vaincre le boss final ouvre le monde infini corrompu
    Soit un joueur qui bat le Cœur de la Nuit
    Alors il obtient la victoire totale et le succès « Aube »
    Et le monde infini qu'il choisit fait apparaître des corrompus, 10 % au départ et jusqu'à 40 % à +3 min

  Scénario: Le défi du jour et la partie guidée ne changent pas
    Soit le défi du jour et la partie guidée simulés avant et après le lot
    Alors leurs résultats sont identiques

  Scénario: Le boss final est dur sans être un mur
    Soit 800 parties maxées
    Alors 40 à 60 % de celles qui atteignent l'Arène battent le boss final
    Et aucune phase ne fait plus de 50 % des morts dans l'Arène
```

## Livraison

Branche `lot/boss-final`, depuis `main` après la fusion de la 1.67.0 ; version **1.68.0**. Un test par scénario (titre
anglais), Vitest pour la simulation, Playwright PC et mobile pour l'interface (bannières, invulnérabilité visible,
zone sûre). `docs/GATES.md`, `CHANGELOG.md` écrit pour les joueurs, captures de chaque phase (téléphone), relues.
`perf-reviewer` (rendu et boucle touchés) et relecture de conformité avant la fusion ; budget d'appels de dessin vérifié
dans l'Arène, phase 3 comprise.

## Hors périmètre

- Un nouveau modèle 3D, une nouvelle musique ou de nouveaux sons (échantillons existants, hauteur décalée).
- Le boss final dans le défi du jour ou dans la partie guidée.
- Une règle propre à chaque monde (piste écartée pour l'instant par Jimmy).
- Une difficulté réglable par le joueur pour l'Arène.
