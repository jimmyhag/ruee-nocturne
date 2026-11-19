# Monstres corrompus — l'infini de chaque monde devient une autre façon de jouer

**Statut : 🟡 Prêt pour le dev** (après la fusion de la 1.66.0, dont il dépend)

Session du 19 novembre 2026, avec Jimmy, après la 1.65.1. Jimmy : « Il faudra revoir le monde infini [de chaque
monde], le rendre différent du monde normal. » Parmi les pistes proposées, il retient « les monstres corrompus avec
d'autres styles de compétences » (et, à part, une règle par monde, à trouver plus tard). Sur la proposition détaillée :
« J'aime beaucoup, go, mais pas le bonus en plus [l'onde à la mort] ; et oui pour l'or et l'XP, à tester, que ce ne
soit pas trop fort, trop de boule de neige. » Sparring en délégation : chaque question restante est tranchée par la
recommandation du sparring, qui vaut réponse de Jimmy ; il peut revenir sur n'importe laquelle.

## Contexte

Quand le chrono d'un monde tombe à 0 (à la mort du boss du totem depuis la 1.66.0, ou chrono écoulé), le monde passe en
**prolongation** (`STAGE.over` dans `src/sim/balance.ts`) : la horde grossit (cadence, PV, dégâts, vitesse) jusqu'à ce
que le joueur entre dans le portail ou meure. Rien d'autre ne change : ce sont les mêmes monstres, plus nombreux.
Depuis la 1.66.0, tout joueur qui bat le boss du totem passe par là : c'est le bon moment pour en faire une phase à part.

À ne pas casser : le défi du jour et le monde infini d'après la victoire (`ENDLESS`) restent identiques au bit près ; la
règle 1 (zéro allocation par pas) ; le budget d'appels de dessin (PLAN.md §4.3, mobile) ; la règle 3 (chaque coup a son
retour) ; la règle 13 (tout réglage de difficulté choisi par la simulation) ; le déterminisme (`w.rng` seulement).

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Où | Les corrompus n'apparaissent **qu'en prolongation**, dans les mondes 1, 2 et 3, parmi les monstres que le monde fait déjà apparaître (un corrompu est un monstre tiré normalement, qui devient corrompu). Pas dans le défi du jour, pas dans le monde infini d'après la victoire, pas dans la partie guidée avant sa prolongation | Jimmy : l'infini de chaque monde, différent du monde normal |
| 2 | Combien | Part de corrompus parmi les apparitions : **10 %** à l'entrée en prolongation, montant linéairement jusqu'à **40 %** à +3 min, plafonnée (`CORRUPT.share`) ; tirage par `w.rng` à l'apparition. Jamais un boss, jamais une élite (une élite reste une élite) | Plus on reste, plus l'infini est l'infini |
| 3 | À quoi on les reconnaît | Le même modèle, teint d'un **violet maladif** (couleur d'instance, pas de nouveau maillage), les yeux plus lumineux, une fine traînée de particules (pool existant, cap respecté) ; un son d'apparition commun discret. Aucun appel de dessin en plus | Lisible en 0,2 s (survivor-design §6) ; budget mobile |
| 4 | Leurs compétences | Une par type, chacune **réutilise un danger existant** (survivor-design §7, game-feel §9 : déjà dessiné, sonorisé, esquivé par le bot), télégraphe d'au moins 0,6 s (0,7 s si ça se saute) : **Spectre — Scission** : à sa mort, deux petits spectres rapides et fragiles (sans XP ni or) ; **Dard — Ruée** : couloir rouge au sol 0,6 s (celui de la charge des Brutes élites), puis sprint en ligne droite ; **Brute — Traînée ardente** : laisse derrière elle des flaques de feu (zone au sol, rendu des zones existantes) qui durent 3 s ; **Volant — Bombardier** : au lieu de plonger, lâche une bombe sous le joueur (cercle rouge 1 s, zone du Colosse) ; **Cracheur — Éventail** : trois crachats en éventail ; **Archer — Volée perçante** : trois flèches en éventail (la volée de l'élite), plus rapides ; **Sorcier — Pluie de feu** : trois boules de feu en triangle autour du joueur. Toutes les valeurs dans `balance.ts` (`CORRUPT`), avec une ligne de « pourquoi » | Jimmy : « d'autres styles de compétences » ; chaque compétence pose une question différente |
| 5 | Pas d'onde à la mort | Retirée de la proposition (Jimmy : « pas le bonus en plus ») | Décision de Jimmy |
| 6 | Récompense, sans boule de neige | Un corrompu rapporte plus d'or et d'XP qu'un monstre normal (`CORRUPT.gold`, `CORRUPT.xp`), mais le multiplicateur est **choisi par la simulation** pour ne pas faire boule de neige (décision 9) ; point de départ ×1,5 (pas ×2), à baisser si la mesure le demande. Les petits spectres de la Scission ne rapportent rien | Une raison de rester un peu, pas une ferme |
| 7 | Les expliquer | Une consigne de **première apparition** (bits `hints` de la partie guidée) : « Monstres corrompus : l'infini les réveille. Plus dangereux, ils rapportent plus. » ; une ligne dans « Comment jouer » ; l'entrée « Corrompus » dans la Bibliothèque (bestiaire) si elle liste les monstres, avec la compétence de chacun. FR et EN | Ce qu'on ne lit pas n'existe pas pour le joueur |
| 8 | Le bot | Le bot de simulation esquive chaque compétence comme il esquive le danger qu'elle réutilise (couloir, cercle, éventail, flaques) ; il reste en prolongation comme aujourd'hui (même politique), pour que la mesure compare des choses comparables | Survivor-design §7 : « le bot doit savoir esquiver ce qu'un joueur esquive » |
| 9 | Équilibrage (règle 13) | Profils nu et maxé, bot `average`, 4 graines × 200, regroupées, **avec et sans corrompus** (`--no-corrupt` dans la CLI) : toutes les cibles de `tools/targets.ts` tiennent ; **victoires +3 points au plus** par rapport à sans corrompus (anti boule de neige) ; **survie en prolongation** (bot qui reste) **p50 entre −20 s et +0 s** par rapport à sans corrompus (plus dangereux, pas un mur) ; **compétences corrompues ≤ 30 % des morts en prolongation** (CLI : causes de mort par compétence). Partie guidée (`--tutorial`) : cibles de la 1.66.0 inchangées | Jimmy : « à tester, que ce ne soit pas trop fort » |
| 10 | Retour des coups | Chaque coup reçu d'une compétence corrompue a son retour habituel (flash, son, chiffre) ; chaque compétence a son son au lancement (échantillons existants, hauteur décalée) | Règle 3 |

## Scénarios

```gherkin
# language: fr
Fonctionnalité: Monstres corrompus en prolongation

  Scénario: Les corrompus n'apparaissent qu'en prolongation
    Soit un monde dont le chrono n'est pas à 0
    Alors aucun monstre corrompu n'apparaît
    Quand le chrono tombe à 0
    Alors environ 10 % des apparitions sont corrompues, et jusqu'à 40 % à +3 min

  Scénario: Le défi du jour et le monde infini ne changent pas
    Soit le défi du jour et le monde infini d'après la victoire simulés avant et après le lot
    Alors leurs résultats sont identiques

  Scénario: Un corrompu se reconnaît
    Soit un monstre corrompu à l'écran
    Alors il est teint de violet, avec une traînée, sans appel de dessin en plus

  Scénario: Chaque corrompu a sa compétence
    Soit un corrompu de chaque type
    Alors le Spectre se scinde à sa mort, le Dard charge après un couloir rouge, la Brute laisse des flaques de feu, le Volant lâche une bombe annoncée, le Cracheur crache en éventail, l'Archer tire une volée et le Sorcier fait pleuvoir trois boules de feu
    Et chaque danger est annoncé au moins 0,6 s avant de toucher

  Scénario: Un corrompu rapporte plus sans faire boule de neige
    Soit 800 parties par profil avec et sans corrompus
    Alors les victoires ne montent pas de plus de 3 points
    Et les compétences corrompues font au plus 30 % des morts en prolongation

  Scénario: Les corrompus sont expliqués la première fois
    Soit un joueur qui n'a jamais vu de corrompu
    Quand le premier apparaît
    Alors une consigne explique ce qu'ils sont, une seule fois
```

## Livraison

Branche `lot/corrompus`, depuis `main` après la fusion de la 1.66.0 ; version **1.67.0**. Un test par scénario (titre
anglais), Vitest pour la simulation, Playwright PC et mobile pour l'interface. `docs/GATES.md`, `CHANGELOG.md` écrit
pour les joueurs, captures de chaque corrompu (téléphone), relues. `perf-reviewer` (rendu et boucle touchés) avant la
fusion ; budget d'appels de dessin vérifié.

## Hors périmètre

- La règle propre à l'infini de chaque monde (piste retenue par Jimmy, à proposer dans un lot suivant).
- Des boss corrompus.
- De nouveaux modèles 3D ou de nouveaux sons.
- L'onde à la mort (refusée par Jimmy).
