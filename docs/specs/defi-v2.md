# Défi du jour v2 — règle du jour, boss final, médailles, suite en monde infini

**Statut : 🟡 Prêt pour le dev**

Session du 18 novembre 2026, avec Jimmy, après la 1.63.2. Jimmy : « Le principe du défi du jour
n'est pas assez challengeant, faut faire mieux, propose-moi des idées. » Parmi les idées
proposées, il retient **une règle du jour, des médailles et un boss final**, et ajoute :
« on devrait laisser la possibilité de rester un max de temps même après le chrono et le boss
final, avec le système du monde infini ». Sparring mené **en délégation** (Jimmy : tout faire
sans redemander) : chaque question est tranchée par la recommandation du sparring, qui vaut
réponse de Jimmy ; il peut revenir sur n'importe laquelle.

## Contexte

Le défi du jour (lot L3, `docs/specs/l3-defi-serie-missions.md`) : monde 1, 5 minutes,
l'Éclaireuse au kit de départ, même graine pour tous (`dailySeed`, `dailyMapSeed`) ; vivant à
5:00 = « Défi réussi ! » (`dailyDone`, `src/sim/stages.ts` : `Mode.Won`, `Ev.Victory`), puis
`gameOver()` directement (`openVictory`, `src/main.ts`). Score : temps tenu puis vaincus
(`recordDaily`, `src/meta/daily.ts`), publié pour le classement du jour entre amis
(`days/{jour}/scores/{uid}`, lot L4) et porté par le lien de défi (`#defi=…&t=…&k=…`).

Pourquoi ce n'est pas un défi : il est réglé pour que le **bot** réussisse une fois sur deux
(CI : 47 %), et un joueur va environ deux fois plus loin que le bot (survivor-design §9) ;
c'est le début d'une partie normale, sans rien qui change d'un jour à l'autre à part la carte ;
le seul enjeu est de ne pas mourir, et tous ceux qui tiennent sont à égalité à 5:00.

Ce qui existe et sert : le monde infini (phase 39, `startEndless` : part d'une victoire,
`Mode.Won`, vagues de boss toutes les `ENDLESS.period`, marchand, montée lente) et son écran
de victoire (`#victory`, « Continuer » / « Terminer ») ; les boss de survie
(`summonSurvivalBoss`, préavis `Ev.SurvivalWarn`) ; la sauvegarde de partie (phase 49).

À ne pas casser : le rendez-vous de 5 minutes (règle 12) ; le défi identique pour tous ; la
série, les missions, les premières parties (L2) ; la règle 8 (rien de nouveau ne quitte
l'appareil) ; les parties complètes ; zéro allocation par pas (règle 1).

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Format | Le rendez-vous ne change pas : **monde 1, 5 minutes**, l'Éclaireuse, même graine et même kit pour tous. Vivant à 5:00 : « Défi réussi ! » et la partie se met en pause sur un écran qui propose **« Continuer en monde infini »** ou **« Terminer »**. Mourir avant 5:00 : défi raté, comme aujourd'hui | Règle 12 (5 minutes) tenue ; Jimmy : « rester un max de temps après le chrono » |
| 2 | Règle du jour | **Une règle par jour**, tirée par la date (`hash('regle-' + date)`, UTC), la même pour tous, **jamais la même deux jours de suite**. Six règles (valeurs de départ, réglées par simulation, décision 9) : **Horde rapide** (monstres +25 % de vitesse) ; **Chasse aux élites** (une élite toutes les 15 s dès 0:30) ; **Nuée** (apparitions ×1,6, vie des monstres ×0,7) ; **Verre** (PV max ×0,5, dégâts du héros ×1,5) ; **Colosses** (vie des monstres ×1,6, apparitions ×0,7) ; **Arme imposée** (l'Éclaireuse commence avec une autre arme, tirée par la date parmi toutes, la même pour tous). La règle vaut pendant toute la partie, suite en monde infini comprise. Constantes dans `balance.ts` (`DAILY_RULES`) | Chaque jour se joue différemment ; des réglages qui passent par les leviers existants (vitesse, apparitions, vie, élites, PV, dégâts, arme de départ) |
| 3 | Boss final | À **4:00** (`DAILY.bossAt`), avec le préavis habituel (bannière « Boss final » 10 s avant), le boss du totem du monde 1 apparaît autour du joueur, PV réglés par `DAILY.bossHp` (simulation). Il **remplace** le boss de survie de 3:00 pendant le défi (pas d'autre boss dans les 5 minutes). Pas de rage. Toujours en vie à 5:00 : il reste, et compte comme un boss du monde infini si le joueur continue | Un sommet à la fin du défi ; réutilise un boss déjà dessiné, sonorisé et lu par le bot |
| 4 | Médailles | **Bronze** : vivant à 5:00. **Argent** : bronze et boss final abattu (à 4:xx ou pendant la suite). **Or** : argent et vivant à **10:00** (`DAILY.goldAt = 600`, 5 minutes de monde infini). Une bannière à chaque médaille gagnée (« Médaille d'argent ! »). Pas de médaille si le défi est raté | Un débutant décroche le bronze ; un bon joueur a une raison de rejouer pour l'or |
| 5 | Écran « Défi réussi » | Le titre « Défi réussi ! », la médaille du moment, le temps et les vaincus, ce qui reste pour la suivante (« Abats le boss final pour l'argent », « Tiens jusqu'à 10:00 pour l'or »), et les deux boutons. Mêmes touches qu'à la victoire (1 / Entrée : continuer ; 2 / Échap : terminer), même parité doigt et clavier (règle 4) | Le choix de continuer est explicite ; rien ne rallonge la session sans le vouloir |
| 6 | Suite en monde infini | Le monde infini existant (`startEndless`) sur la carte du monde 1 : vagues de boss toutes les 2:30, marchand, montée lente, et la règle du jour. Le chrono du HUD passe du compte à rebours au temps total | Le système que Jimmy a nommé ; rien à inventer |
| 7 | Score et classement | **Temps total tenu** (5:00 + la suite), puis vaincus, comme avant. `recordDaily` garde aussi la **médaille** de chaque partie (champ local `medals`, valeur par défaut 0 pour les parties d'avant) ; le menu montre la meilleure médaille du jour sur le bouton du défi ; l'écran du défi la montre à côté de chaque partie | Tenir plus longtemps se voit au classement, la médaille dit comment |
| 8 | Partage et règle 8 | Le résultat publié (`days/{jour}/scores/{uid}`) et le lien de défi **gardent exactement leurs champs** (date, temps, vaincus, pseudo, identifiant) ; seule la borne du temps passe de 300 à **3 600 s** (`firestore.rules`, `CHALLENGE.timeMax` dans `src/meta/share-card.ts`). La médaille **n'est pas publiée** : elle reste sur l'appareil. Elle est dessinée sur la carte de résultat que le joueur partage lui-même. Le défi d'un ami se joue avec la règle du jour de ce défi (elle se déduit de la date) | Rien de nouveau ne quitte l'appareil (règle 8) |
| 9 | Équilibrage (règle 13) | CLI : `--daily` joue le défi puis **continue** en monde infini (le bot continue toujours) et imprime les taux de bronze, d'argent et d'or ; `--rule <clé>` impose une règle. Cibles (`tools/targets.ts`), **pour chacune des six règles**, Éclaireuse au kit de départ, bot `average`, 4 graines × 200 parties regroupées : **bronze 35–65 %**, **argent 10–35 %**, **or 1–12 %**. Les écarts se règlent dans `DAILY_RULES`, `DAILY.bossHp`, et au besoin `DAILY.diffRate` | Un défi juste quelle que soit la règle du jour ; « deux graines ne prouvent rien » (phase 52) |
| 10 | Récompenses | Inchangées : la série et son or, les missions. **Pas d'or de médaille** dans ce lot (question laissée à Jimmy) | Une mécanique à la fois (règle 9) ; l'économie n'est pas touchée |
| 11 | Partie reprise (phase 49) | La règle, l'état du boss final, la médaille en cours et le choix fait à 5:00 sont dans l'instantané. Une partie de défi gardée avant la mise à jour reprend **sans règle** et avec le boss final s'il n'est pas encore passé | Règle 12 : reprise instantanée, rien de perdu |
| 12 | Textes | « Règle du jour », les six noms et leur phrase, « Boss final », « Médaille de bronze / d'argent / d'or », « Continuer en monde infini », « Abats le boss final pour l'argent », « Tiens jusqu'à 10:00 pour l'or » : `fr.json` et `en.json` | Français par défaut, traduction anglaise |

## Scénarios

# language: fr
Fonctionnalité: Défi du jour v2

  Scénario: La règle du jour est la même pour tous et change chaque jour
    Soit deux joueurs qui ouvrent le défi le même jour
    Alors ils ont la même règle du jour
    Et la règle de demain n'est pas celle d'aujourd'hui

  Scénario: Chaque règle du jour change la partie
    Soit une partie du défi avec chacune des six règles
    Alors l'effet de la règle se mesure dans la simulation (vitesse, élites, apparitions, vie, PV et dégâts, arme de départ)

  Scénario: La règle du jour se voit avant et pendant la partie
    Soit l'écran du défi du jour
    Alors il montre la règle du jour et sa phrase
    Et la partie commence par une bannière de la règle, rappelée dans la pause

  Scénario: Le boss final arrive à 4:00
    Soit un défi du jour en cours
    Quand le chrono atteint 4:00
    Alors le boss final apparaît après un préavis
    Et aucun autre boss n'est apparu avant

  Scénario: Tenir 5:00 donne le bronze et propose de continuer
    Soit un défi du jour en cours
    Quand le joueur est en vie à 5:00
    Alors l'écran « Défi réussi ! » montre la médaille de bronze
    Et il propose de continuer en monde infini ou de terminer, au doigt comme au clavier

  Scénario: Continuer prolonge le défi en monde infini
    Soit l'écran « Défi réussi ! »
    Quand le joueur continue
    Alors la partie reprend en monde infini avec la règle du jour
    Et le chrono montre le temps total

  Scénario: Abattre le boss final donne l'argent
    Soit un défi du jour où le joueur a tenu 5:00
    Quand le boss final tombe
    Alors la médaille d'argent est gagnée

  Scénario: Tenir jusqu'à 10:00 donne l'or
    Soit un défi du jour avec la médaille d'argent
    Quand le joueur est en vie à 10:00
    Alors la médaille d'or est gagnée

  Scénario: Mourir avant 5:00 ne donne pas de médaille
    Soit un défi du jour
    Quand le joueur meurt avant 5:00
    Alors le défi est raté et sans médaille

  Scénario: Le score compte tout le temps tenu
    Soit un défi continué jusqu'à 7:12
    Alors le classement du jour garde 7:12, la médaille et les vaincus
    Et le résultat publié et le lien de défi gardent leurs champs, avec le temps de 7:12

  Scénario: Le défi d'un ami se joue avec la règle de son jour
    Soit un lien de défi d'un ami daté d'hier
    Alors la partie se joue avec la règle du jour d'hier

  Scénario: Une partie de défi reprise garde sa règle et sa médaille
    Soit un défi du jour gardé à 6:00 avec la médaille de bronze
    Quand le joueur la reprend
    Alors la règle, le boss final et la médaille sont ceux d'avant

  Scénario: Le défi reste juste quelle que soit la règle
    Soit 800 défis simulés pour chacune des six règles
    Alors le bronze, l'argent et l'or sont dans leurs cibles

## UI & Layout Contract

- Écran du défi (`#daily`) : une ligne « Règle du jour » (nom et phrase) en tête des règles
  existantes ; les médailles expliquées en trois lignes (bronze, argent, or) ; la liste des
  meilleures parties du jour porte la médaille de chacune.
- Bouton du défi au menu (`#dailyBtn`) : « fait » devient la meilleure médaille du jour
  (pastille bronze, argent, or) ; le nom accessible la dit.
- En partie : bannière de la règle au départ ; la pause rappelle la règle ; bannière du boss
  final (préavis) ; bannière de chaque médaille.
- Écran « Défi réussi » : réutiliser la feuille de victoire (`#victory`) avec le titre et les
  lignes du défi ; « Continuer en monde infini » est le bouton plein.
- Écran de fin et carte de résultat : la médaille.
- Couleurs des médailles : bronze `#C98A4B`, argent `#C9D3E0`, or = lanterne. Aucune image,
  police ni dépendance ajoutée.
- Zéro allocation par pas : la règle est un entier dans le monde, les multiplicateurs sont lus
  dans `DAILY_RULES` au moment de l'apparition ou du coup, comme les autres.

## Livraison

Branche `lot/defi-v2`, version **1.64.0**. Tests : un test par scénario (titre anglais),
Vitest pour la simulation et la méta, Playwright PC et mobile pour l'interface. `docs/GATES.md`
(ligne et mesures : taux de bronze, argent, or par règle, avant / après), `CHANGELOG.md`
écrit pour les joueurs, captures de l'écran du défi, de l'écran « Défi réussi » et d'une
bannière de médaille. `balance-playtester` et `perf-reviewer` (la simulation est touchée)
avant la fusion. Règle 9 : c'est une évolution du défi existant ; la rétention (lot L1) est
relevée avant et après la mise en ligne.

## Hors périmètre

- Deux règles par jour ; règles qui demandent un rendu nouveau (nuit noire, brouillard).
- Or ou objets gagnés par médaille (décision 10).
- Classement en ligne des médailles (décision 8).
- Défi de la semaine.
