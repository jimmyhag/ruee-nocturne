# Swarmageddon mobile — Spec cadre

**Statut : 🔵 Cadre — à découper en specs de lot via /sparring**

Session du 17 novembre 2026, avec Jimmy (sparring sur claude.ai, harnais harness-kit).
`PLAN.md` reste la source de vérité du contenu du jeu ; cette spec cadre le chantier
« rétention et publication mobile ».

## Contexte

Swarmageddon est le jeu le plus abouti de Jimmy (version 1.56) : un survivor 3D en PWA,
déjà jouable au téléphone, avec une méta riche (défi du jour, classement en ligne,
9 personnages, boutique, succès). Sa rétention n'a jamais été mesurée. Le but : le
**rendre addictif sur mobile**, au sens de Jimmy (« un jeu sur lequel on veut revenir tous
les jours pour rejouer, progresser ou se challenger »), **en restant en PWA**. La
publication sur l'App Store et le Play Store viendra quand la version PWA sera propre.

Repères de rétention (2026) : médiane du secteur autour de 26 % à D1 ; un profil de bon
jeu à 35/15/5 (D1/D7/D30) ; le quart supérieur au-dessus de 40/20/10. Les jeux d'arcade
démarrent fort et s'essoufflent vite : c'est le risque d'un survivor.

## Décisions

| # | Question | Décision | Pourquoi |
| - | -------- | -------- | -------- |
| 1 | Temps | Non plafonné (choix de Jimmy), en parallèle de plan-b | — |
| 2 | Réussite | Atteindre **35/15/5** sur une cohorte de joueurs de la PWA ; c'est la « version propre » qui ouvre la publication sur les stores | En dessous, on améliore le jeu avant de le publier ou d'en faire la pub |
| 3 | Quel jeu | **Swarmageddon**, pas de nouveau jeu | L'option la moins chère ; base solide |
| 4 | Social | Carte de résultat à partager après le défi du jour (façon Wordle, sans spoiler, via le partage du navigateur) ; classement du défi du jour entre amis ; **défi lancé à un pote** : un lien qui ouvre la PWA sur la même graine, avec le score à battre | Sans budget pub, seule une mécanique sociale intégrée au jeu fait venir des joueurs |
| 5 | Mesure | **À trancher au lot L1** : en PWA, les stores ne mesurent rien, et la règle 8 interdit les analytics sans décision de Jimmy. Recommandation : un **comptage anonyme, uniquement si le joueur accepte** (un identifiant aléatoire local, le jour d'installation et les jours d'ouverture ; rien d'autre), sans SDK tiers, `PRIVACY.md` mis à jour ; ensuite, une mécanique de rétention à la fois, effet mesuré avant la suivante | Diagnostiquer avant d'ajouter, sans trahir la promesse de confidentialité |
| 6 | Défi du jour | Format court : **un seul monde, environ 5 minutes**, même graine pour tous ; les parties complètes restent | Une partie complète dure 3 × 10 minutes ; les sessions mobiles sont courtes |
| 7 | Plateforme | **PWA uniquement** pour ce chantier (décision de Jimmy). Plus tard, publication sur les stores avec **Capacitor**, qui emballe la PWA telle quelle ; Godot imposerait une réécriture complète. Vibrations via le navigateur quand il les permet (Android) ; la notification de rappel attend les stores | La version propre d'abord, les stores ensuite |
| 8 | Premières parties | **Dévoilement progressif** : la 1re partie n'a que le déplacement, le saut, les armes automatiques et les cartes de niveau ; glisse, sanctuaires, marchand, totem et crânes arrivent entre la 2e et la 5e partie, chacun avec un moment « Nouveau ! » | Trop de systèmes d'un coup sur mobile ; du neuf à découvrir le lendemain |
| 9 | Difficulté de départ | Les deux premières parties sont discrètement plus faciles, jusqu'à la cible de **20 % de morts avant 3 minutes au maximum** (22,3 % aujourd'hui avec le kit de départ), validé par simulation | Mourir avant d'avoir vu quelque chose tue la première impression |
| 10 | Appareils | **Fait** : testé sur l'iPhone de Jimmy et sur les Android de plusieurs amis, le jeu tourne ; consigné dans `docs/DEVICES.md`, avec si possible une mesure de référence sur Android (images par seconde à 400 ennemis) | La majorité des joueurs mobiles sont sur Android, où les performances WebGL varient le plus |
| 11 | Rendez-vous quotidien | **Série de jours** liée au défi du jour (un peu d'or chaque jour, une tenue au 7e, un joker par semaine pour sauver la série) et **3 missions quotidiennes** qui poussent à varier armes et personnages | Créer l'habitude (D7) sans nouveau contenu |
| 12 | Moment « waouh » | **Paliers visuels d'arme** aux niveaux 25, 50 et 100 : l'apparence change et l'écran le célèbre ; les évolutions restent retirées | Un pic de plaisir sans renier la montée longue choisie par Jimmy |
| 13 | Saisons | Saisons mensuelles (modificateur de monde, tenue, classement de saison) **après** la première mesure de rétention | On ne construit pas de saison pour un jeu qui ne retient pas à D7 |
| 14 | Modèle économique | **Non tranché.** La PWA reste gratuite, sans achat ni pub ; le modèle se décide en sparring avant le passage aux stores | Les pubs mobiles collectent des données, contraire à la règle de confidentialité |

## Feuille de route (chaque lot = une spec 🟡 via /sparring)

| Lot | Contenu | Indicateur visé |
| --- | ------- | --------------- |
| L1 | Mesure de la rétention : décision de Jimmy sur la méthode (Q5), puis mise en place ; invitation des premiers joueurs et lecture de la rétention de départ | Rétention de départ (D1, D7) |
| L2 | Dévoilement progressif et premières parties adoucies | D1 |
| L3 | Défi du jour court, série de jours, missions quotidiennes | D7 |
| L4 | Carte de résultat, défi lancé à un pote, classement entre amis | Nouveaux joueurs |
| L5 | Paliers visuels d'arme | D7, D30 |
| L6 | Sparring : passage aux stores (Capacitor, comptes, fiches, notification de rappel), modèle économique et saisons, d'après les mesures | D30, publication |

À partir de L1, entre deux lots, on lit la rétention avant de passer au suivant.

## Scénarios de référence

Ils décrivent le jeu attendu. Le développeur ne les implémente pas directement : chaque
spec de lot les reprend et les précise.

# language: fr
Fonctionnalité: Swarmageddon mobile

  Scénario: La première partie n'a que l'essentiel
    Soit un nouveau joueur qui lance sa toute première partie
    Alors il dispose du déplacement, du saut, des armes automatiques et des cartes de niveau
    Et ni sanctuaire, ni marchand, ni totem n'apparaissent

  Scénario: Un système se dévoile avec un moment « Nouveau ! »
    Soit un joueur qui a terminé sa première partie
    Quand il lance la deuxième
    Alors un nouveau système apparaît, annoncé par « Nouveau ! »

  Scénario: Le défi du jour tient en 5 minutes
    Soit le défi du jour
    Alors il se joue sur un seul monde, en environ 5 minutes
    Et tous les joueurs ont la même graine

  Scénario: La série de jours survit à un oubli grâce au joker
    Soit un joueur avec une série de 4 jours et un joker disponible
    Quand il ne joue pas un jour
    Alors le joker est consommé et la série reste à 4

  Scénario: Un défi lancé à un pote ouvre la même partie
    Soit un joueur qui envoie son défi à un ami
    Quand l'ami ouvre le lien
    Alors il joue la même graine
    Et voit le score à battre

  Scénario: Aucune donnée ne quitte l'appareil sans accord
    Soit un joueur sans compte qui n'a pas accepté la mesure de rétention
    Alors aucune requête réseau ne part, hors mise à jour de la PWA

  Scénario: Une arme franchit un palier visuel
    Soit une arme au niveau 24
    Quand elle passe au niveau 25
    Alors son apparence change
    Et l'écran célèbre le palier

## Hors périmètre

- La publication sur les stores et tout ce qui est natif (Capacitor, notification de
  rappel) : après la version PWA propre (Q7).
- Une réécriture en Godot (Q7).
- Tout SDK tiers d'analytics, de pub ou de suivi (Q5).
- Achats et pubs (Q14).
- Les saisons avant la première mesure de rétention (Q13).
- Le retour des évolutions d'armes (Q12).

## Concepts travaillés

| Concept | Avant | Après |
| ------- | ----- | ----- |
| Rétention D1, D7, D30 et ce que chacun diagnostique | discovered | discovered |
| Mesurer la rétention en respectant la confidentialité | — | discovered |
| Mécanique sociale intégrée au jeu (viralité organique) | — | discovered |
| Habitude quotidienne (séries, missions, notifications locales) | — | discovered |
| Expérience de première partie (dévoilement progressif) | — | discovered |
| PWA d'abord, stores ensuite (Capacitor plus tard) | discovered | discovered |
| Une mécanique à la fois, mesurée | — | discovered |
