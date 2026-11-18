# L3 — Défi du jour court, série de jours, missions quotidiennes

**Statut : 🟢 Implémenté**

Session du 17 novembre 2026, avec Jimmy. Sparring mené **en délégation** : Jimmy a demandé
de tout réaliser sans lui redemander de confirmation. Chaque question a été tranchée par
la recommandation du sparring, qui vaut réponse de Jimmy ; il peut revenir sur n'importe
laquelle.

## Contexte

Lot L3 de `docs/specs/swarmageddon-mobile.md` (décisions 6 et 11), indicateur visé : D7.
Le défi du jour existe (`src/meta/daily.ts` : graine `hash(date UTC)`, 10 meilleurs temps
locaux ; `startGame(…, daily = true)` dans `src/main.ts`, toujours l'Éclaireuse) mais
c'est une partie complète de trois mondes (jusqu'à 30 min) : trop long pour une session
mobile, et rien ne donne envie de revenir le lendemain.

Ce qui existe : `gameOver()` (`src/main.ts`) enregistre la partie (or, stats, codex,
défi du jour, classement en ligne) ; statistiques de partie disponibles : `world.kills`,
`world.t`, `runStats.elites`, `runStats.bosses`, `world.mapChestsOpened`,
`world.weaponLvBest`, le personnage joué, les armes portées (`recordCodex`) ; les tenues
(`Meta.outfits`, tenue alternative achetée 400 or) ; les bannières et le son de niveau.

À ne pas casser : la progression des joueurs (rien n'est retiré ; les nouveaux champs
ont des valeurs par défaut), le défi identique pour tous, les parties complètes
(inchangées), la règle 13 (le défi court est réglé par simulation), la règle 12
(pause en arrière-plan, reprise instantanée), le lot L2 (le défi joue avec tout
dévoilé).

## Décisions

| # | Question | Décision | Pourquoi |
| - | -------- | -------- | -------- |
| 1 | Format du défi | **Monde 1 seulement, 5 minutes** : à 5:00 la partie s'arrête sur « Défi réussi ! » ; mourir avant, c'est un défi raté. Même graine pour tous (`dailySeed`), même personnage (l'Éclaireuse), même kit pour tous (emplacements de départ, aucune arme ni objet de la Bibliothèque en plus) | Décision 6 de la spec cadre ; un défi comparable entre joueurs |
| 2 | Score du défi | Classement : **temps tenu** (≤ 5:00), puis **ennemis tués** à égalité. Le classement local du jour garde les 10 meilleurs (temps, kills) | Lisible : « 5:00 · 412 kills » |
| 3 | Difficulté du défi | Constantes `DAILY` dans `balance.ts` (au minimum `DAILY.duration = 300`, et si besoin un accélérateur de la difficulté), réglées par la CLI `--daily` pour que l'Éclaireuse au kit de départ **réussisse dans 35 à 65 %** des parties (bot `average`, 4 graines × 200 parties regroupées) | Un défi qu'on réussit une fois sur deux donne envie de revenir |
| 4 | Parties complètes | Inchangées : le bouton « Jouer » lance toujours la partie de trois mondes | Décision 6 : les parties complètes restent |
| 5 | Série de jours | Un jour compte quand le joueur **termine un défi du jour** ce jour-là (réussi ou raté). `Meta.streak = { last, count, best, jokerWeek }` (`last` : date UTC `AAAA-MM-JJ` du dernier jour compté ; `jokerWeek` : semaine ISO du dernier joker utilisé) | L'habitude se crée autour du défi |
| 6 | Joker | **Un par semaine ISO.** Si exactement un jour manque (`last` = avant-hier) et que le joker de la semaine du jour manqué n'a pas servi, il est consommé : la série continue (elle reste à sa valeur, puis +1 avec le défi d'aujourd'hui). Deux jours manqués ou plus, ou pas de joker : la série repart à 1. Au menu, un joueur qui a manqué hier voit « Ta série est sauvée par le joker » dès l'ouverture, sans attendre de jouer | Décision 11 ; pardonner un oubli sans rendre la série gratuite |
| 7 | Récompense de série | Chaque jour compté : **30 + 10 × min(série, 7) or** (40 à 100). Au **7e jour** de série (puis chaque multiple de 7) : la **tenue alternative** gratuite d'un personnage qui ne l'a pas (d'abord le personnage choisi), annoncée par une bannière ; si toutes sont possédées : 400 or | Décision 11 : un peu d'or chaque jour, une tenue au 7e ; la tenue existe déjà, aucun rendu à créer |
| 8 | Missions quotidiennes | **3 missions par jour**, tirées par une graine `hash('missions-' + date)` dans une liste de modèles, parmi le contenu que le joueur possède (armes débloquées, personnages débloqués). Au moins une mission de **personnage** et une d'**arme** quand c'est possible, pour faire varier. Elles comptent dans **toutes les parties** (complètes ou défi). Récompense : 60, 80 ou 100 or selon le modèle, créditée à la fin de la partie qui la remplit, annoncée à l'écran de fin. `Meta.missions = { date, list: [{ k, p, goal, prog, done }] }` ; nouvelle liste au changement de date UTC | Décision 11 : pousser à varier armes et personnages, sans nouveau contenu |
| 9 | Modèles de missions | Personnage : « Joue une partie avec {personnage} » (un autre que le dernier joué). Arme : « Termine une partie avec {arme} dans ton équipement ». Kills : « Élimine {300/500/800} ennemis en une partie ». Élites : « Abats {3/5/8} élites en une partie ». Survie : « Tiens {4/6/8} minutes en une partie ». Coffres : « Ouvre {2/4} coffres de carte en une partie ». Niveau : « Monte une arme au niveau {10/15/20} ». Chaque modèle ne s'appuie que sur une statistique que la partie mesure déjà | Pas de compteur nouveau dans la sim |
| 10 | Joueurs existants | Champs absents → valeurs par défaut (série 0, missions du jour tirées à la première ouverture). Rien d'autre ne change | Exigence de Jimmy |
| 11 | Synchronisation | `streak` et `missions` sont des clés de progression : ajoutées à `saves/{uid}` dans `firestore.rules` (cartes bornées, facultatives) ; fusion : la série la plus récente (`last`), puis la plus longue | Changer d'appareil ne casse pas la série |
| 12 | Interface | Menu : le bouton du défi dit « Défi du jour · 5 min » et montre la série (flamme + nombre) ; un bloc « Missions du jour » (3 lignes avec barre de progression, coche quand c'est fait) sous les boutons, repliable sur téléphone. Écran de fin : missions remplies et or gagné, série du jour | Le rendez-vous se voit dès l'ouverture |
| 13 | Heure du changement de jour | Minuit **UTC**, comme le défi actuel (`todayKey`) ; le menu affiche le temps restant avant le prochain défi (`msToNextDaily`, existant) | Même jour pour tous |

## Scénarios

# language: fr
Fonctionnalité: Défi du jour court, série de jours et missions

  Scénario: Le défi du jour tient en 5 minutes
    Soit le défi du jour
    Alors il se joue sur un seul monde
    Et la partie s'arrête sur « Défi réussi ! » à 5:00
    Et tous les joueurs ont la même graine, le même personnage et le même kit

  Scénario: Le défi est réussi une fois sur deux environ
    Soit 800 défis simulés de l'Éclaireuse au kit de départ
    Alors entre 35 % et 65 % atteignent 5:00

  Scénario: Les parties complètes ne changent pas
    Soit une partie lancée par « Jouer »
    Alors elle a toujours trois mondes

  Scénario: La série augmente d'un jour au suivant
    Soit un joueur dont la série est de 2, comptée hier
    Quand il termine le défi du jour aujourd'hui
    Alors sa série passe à 3
    Et il reçoit 60 or

  Scénario: La série survit à un oubli grâce au joker
    Soit un joueur avec une série de 4 jours et un joker disponible
    Quand il ne joue pas un jour
    Alors le joker est consommé et la série reste à 4

  Scénario: Deux jours manqués remettent la série à un
    Soit un joueur avec une série de 4 jours, comptée il y a trois jours
    Quand il termine le défi du jour
    Alors sa série est de 1

  Scénario: Un seul joker par semaine
    Soit un joueur qui a déjà utilisé le joker cette semaine
    Quand il manque encore un jour de la même semaine
    Alors sa série repart à 1

  Scénario: Le septième jour offre une tenue
    Soit un joueur avec une série de 6 jours et un personnage sans tenue alternative
    Quand il termine le défi du jour
    Alors la tenue alternative de ce personnage lui est offerte

  Scénario: Trois missions par jour qui font varier
    Soit un joueur qui possède plusieurs armes et personnages
    Quand il ouvre le jeu un nouveau jour
    Alors trois missions du jour sont tirées
    Et l'une porte sur un personnage et une autre sur une arme

  Scénario: Les missions sont les mêmes toute la journée
    Soit un joueur qui rouvre le jeu le même jour
    Alors ses missions et leur progression n'ont pas changé

  Scénario: Une mission remplie paie à la fin de la partie
    Soit une mission « Élimine 300 ennemis en une partie »
    Quand le joueur finit une partie avec 312 ennemis tués
    Alors la mission est cochée et son or est crédité une seule fois

  Scénario: Un joueur existant garde tout
    Soit une sauvegarde d'avant la mise à jour
    Quand le jeu la charge
    Alors son or, ses succès, ses tenues et son défi du jour sont inchangés
    Et sa série est à 0

  Scénario: Le défi du jour se lance au clavier comme au doigt
    Soit le menu
    Alors le bouton « Défi du jour » se lance au toucher et avec sa touche

## UI & Layout Contract

- **Kit** : écrans et composants suivent le kit « Nocturne » (`docs/specs/ui-nocturne.md`, maquette `docs/design/menus/`) : couleurs, polices Barlow, un seul bouton plein, filets sans carte, barre d'onglets.
  Le lot est développé en parallèle de l'interface Nocturne : il s'écrit avec les composants existants, et passe au kit au moment de sa fusion après Nocturne (le texte et la structure des écrans ne changent pas).

- **Référence visuelle** : aucune ; composants existants (`btn`, `chip`, `sheet`, barres
  de progression des succès).
- **Arbre de composants** :

  | Composant | Couche | Statut |
  | --------- | ------ | ------ |
  | Bouton « Défi du jour · 5 min » + série | `index.html`, `src/main.ts` | modifié |
  | Bloc « Missions du jour » | `src/ui/` (nouveau module) , `index.html` | créé : aucun bloc existant ne liste des objectifs du jour |
  | Écran de fin : missions et série | `#over` | modifié |
  | Bannière « Défi réussi ! », « Série sauvée », « Tenue offerte » | bannières existantes | réutilisées |
  | Règles du défi et des missions | `src/meta/daily.ts`, `src/meta/missions.ts` (purs) | modifié / créé |

- **États** : aucune mission (aucun contenu possédé pour un modèle) : le modèle est
  remplacé ; toutes faites : « Missions du jour terminées — reviens demain » ; hors
  ligne : tout marche (rien n'est en ligne).
- **Focus** : inchangé (le bloc de missions n'est pas interactif, sauf repli).
- **Libellés** (FR / EN) :
  - « Défi du jour · 5 min » / “Daily challenge · 5 min”
  - « Défi réussi ! » / “Challenge complete!”
  - « Série : {n} jours » / “Streak: {n} days” ; « Ta série est sauvée par le joker » / “Your streak was saved by the joker”
  - « Tenue offerte : {personnage} » / “Free outfit: {character}”
  - « Missions du jour » / “Daily missions” ; « Missions du jour terminées — reviens demain » / “Daily missions done — come back tomorrow”
  - Modèles : « Joue une partie avec {char} » / “Play a run with {char}” ; « Termine une partie avec {weapon} dans ton équipement » / “Finish a run with {weapon} equipped” ; « Élimine {n} ennemis en une partie » / “Defeat {n} enemies in one run” ; « Abats {n} élites en une partie » / “Take down {n} elites in one run” ; « Tiens {n} minutes en une partie » / “Last {n} minutes in one run” ; « Ouvre {n} coffres de carte en une partie » / “Open {n} map chests in one run” ; « Monte une arme au niveau {n} » / “Raise a weapon to level {n}”

## Livraison

Version **1.61.0** ; `CHANGELOG.md` pour les joueurs ; `docs/GATES.md` (Lot L3, mesures
du défi) ; l'aide « Comment jouer » mentionne le défi, la série et les missions.

## Hors périmètre

- Notification de rappel (attend les stores, décision 7 de la spec cadre).
- Classement en ligne du défi et partage : lot L4.
- Nouvelles tenues dessinées pour la série.

## Concepts travaillés

| Concept | Avant | Après |
| ------- | ----- | ----- |
| Habitude quotidienne (séries, missions, notifications locales) | discovered | discovered |
| Boucle de rendez-vous et récompense variable | — | discovered |
