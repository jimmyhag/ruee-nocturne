# Première partie guidée — tout le jeu appris en jouant, au monde 1

**Statut : 🟢 Implémenté**

Session du 19 novembre 2026, avec Jimmy, après la 1.64.0. Jimmy : « Pour le start du jeu,
quand on est nouveau joueur, il faut qu'on fasse quelque chose de beaucoup plus assisté. […]
La première partie nous guide de A à Z dans le monde 1 uniquement, jusqu'à l'affrontement du
boss final, qui volontairement sera trop fort pour nous et nous tuera. » Les cinq premières
minutes apprennent tout (déplacement, tir automatique, sort, glisse et saut glissé, cartes de
niveau et raretés, sanctuaires, coffres, courses, totems de boss, totem du monde, crânes) ; les
cinq suivantes se jouent seul, avec des indications, jusqu'au totem du monde que le joueur est
obligé d'activer ; le boss le tue, puis « À toi de jouer ». Dans la partie suivante, le portail
est expliqué au moment où il apparaît. Sparring mené **en délégation** (Jimmy : tout faire
sans redemander) : chaque question est tranchée par la recommandation du sparring, qui vaut
réponse de Jimmy ; il peut revenir sur n'importe laquelle.

## Contexte

Aujourd'hui (lot L2, `docs/specs/l2-premieres-parties.md`) : à la toute première ouverture,
l'écran « Comment jouer » (`#help`, `meta.seenHelp`), puis un **dévoilement progressif** sur
cinq parties (`Meta.reveal` 0 → 4 : la glisse à la 2e partie, les sanctuaires à la 3e, le
marchand à la 4e, totem, crânes et totems de boss à la 5e) avec une bannière « Nouveau ! » et
deux premières parties adoucies (`FIRST_RUNS`). Rien n'apprend en jouant : un écran de texte,
puis des systèmes qui apparaissent sans démonstration ; le joueur découvre seul le totem et le
portail, ou pas du tout.

À ne pas casser : les joueurs existants (ils ne voient jamais la partie guidée) ; le défi du
jour (toujours tout dévoilé) ; la règle 4 (doigt et clavier à parité) ; la règle 12 (pause en
arrière-plan, reprise instantanée, partie guidée comprise) ; la règle 8 (rien ne quitte
l'appareil) ; la règle 1 (zéro allocation par pas, le guide compris) ; le déterminisme de la
simulation (le guide ne touche jamais `w.rng` ni l'ordre des pas).

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Qui la joue | Un **nouveau joueur** (aucune partie jouée, `runs = 0`, ni progression reçue du nuage) : « Jouer » lance la partie guidée, l'Éclaireuse au kit de départ. Elle remplace le dévoilement progressif. À la toute première ouverture, l'écran « Comment jouer » montre les touches, sans retour possible : son « Jouer » est la seule sortie et lance la partie guidée (1.65.1, retour de Jimmy : « il me faut le menu qui me montre les touches et le bouton Jouer obligatoire »). Les joueurs existants ne la voient jamais ; tout le monde peut la rejouer depuis l'Aide (« Rejouer la partie guidée ») | Jimmy : l'obligation de lancer une partie, et tout montrer dès le début |
| 2 | Forme | Une partie **normale du monde 1** (carte, horde, cartes de niveau, chrono de 10 min), avec un **guide** par-dessus : une consigne à la fois, une ligne de texte au plus, la commande dessinée selon l'appareil (bouton au doigt, touche au clavier), une flèche vers la cible quand il y en a une. Une étape se termine quand le joueur **a fait le geste** (surveillance de l'entrée ou de l'événement de la simulation), jamais sur un simple délai, sauf les étapes « à voir » (décision 5). **Ralenti** (×0,3) pour montrer un danger ou un geste précis ; **pause** seulement sur la feuille de niveau (décision 4) | Apprendre en faisant ; une consigne qu'on lit en deux secondes |
| 3 | Les cinq premières minutes : le geste | Dans l'ordre, chacune attendant le geste : **se déplacer** ; **le tir automatique** (quelques monstres viennent, « ton héros tire tout seul sur le plus proche », 5 vaincus) ; **ramasser les cristaux** (jusqu'au niveau 2) ; **la carte de niveau** (décision 4) ; **sauter** (une onde au sol à franchir, au ralenti) ; **glisser** ; **le saut glissé** (sur une pente : glisse puis saute en pleine glisse, « tu gardes ta vitesse ») ; **le sort** de l'Éclaireuse. Pendant ces étapes la horde reste légère (`TUTORIAL.spawn`) | Les gestes d'abord : ils servent toute la partie |
| 4 | Cartes et raretés | À la première montée de niveau, la feuille s'ouvre en pause avec trois lignes posées dessus : ce qu'est une **arme** et un **tome**, et ce que disent les **couleurs** (commune, rare bleue, épique or) ; la première feuille propose au moins une carte rare (tirage du guide, sans toucher `w.rng`). Le joueur choisit lui-même | Les raretés colorées (1.63.2) se lisent dès la première carte |
| 5 | Les cinq premières minutes : la carte | Ensuite, chaque lieu est **posé près du joueur** pour la partie guidée, avec flèche et consigne : un **coffre de carte** (l'or pour l'ouvrir est offert ; geste : l'ouvrir) ; un **sanctuaire** (geste : rester dans le cercle et prendre le bonus) ; une **course** (les arches ; geste : passer la première, ou 20 s à voir) ; un **crâne** (« +5 % de difficulté, plus de récompenses : à toi de choisir » ; à voir, jamais imposé) ; un **totem de boss** (« un boss en plus à chaque vague de boss » ; à voir) ; le **totem du monde** (« quand tu es prêt, active-le pour affronter le boss du monde » ; à voir). Les autres systèmes ont une consigne à leur **première apparition** dans la partie, sans arrêter le jeu : bonus au sol, élite et son coffre, boss de survie (3:00), marchand (2:30) | Tout ce qu'il y a dans le jeu, vu une fois, dans les cinq premières minutes |
| 6 | Les cinq dernières minutes | Le joueur joue **seul** : plus de consigne à geste, seulement celles des premières apparitions. À **8:00** (2 minutes restantes) : flèche permanente et bannière « Va activer le totem rouge : le boss du monde t'attend ». Le chrono du monde **s'arrête à 0:30** tant que le totem n'est pas activé (pas de prolongation dans la partie guidée) et la horde s'éclaircit ; la consigne reste jusqu'à l'activation | Obligé d'y aller, sans être puni de ne pas avoir trouvé |
| 7 | Le boss, volontairement trop fort | Le boss du totem de la partie guidée est renforcé (`TUTORIAL.bossHp`, `bossDmg`) pour **tuer le joueur** en 20 à 60 s. À la mort : ralenti, puis une feuille dédiée (pas l'écran de fin habituel) : « Le Gardien était trop fort… pour cette fois. Deviens plus fort à chaque partie et reviens le battre. À toi de jouer ! » ; l'or de la partie est gardé, avec une **prime de fin de guide** (`TUTORIAL.gold`) ; un bouton « Jouer ». La mort ne compte pas pour la série ni pour les records | La défaite voulue par Jimmy, présentée comme une étape et pas comme un échec |
| 8 | La partie suivante : le portail | Les parties suivantes se jouent seules, avec deux **consignes uniques** : la première fois qu'un boss du totem tombe, ralenti et « Un portail est apparu : entre dedans pour découvrir la suite » avec une flèche ; la première arrivée dans un nouveau monde, « Monde 2 : nouvelle carte, ta build te suit ». Les consignes de première apparition (décision 5) restent pour ce que le joueur n'a pas vu | Jimmy : le portail expliqué dans la partie suivante |
| 9 | Ce que devient le lot L2 | Un nouveau joueur qui finit (ou passe) la partie guidée a **tout dévoilé** (`reveal = 4`) : plus de bannière « Nouveau ! » ni de systèmes cachés. Les **deux parties adoucies** (`FIRST_RUNS`) deviennent les deux parties **après** la partie guidée. Les joueurs déjà au milieu du dévoilement le gardent tel quel | La partie guidée montre tout ; l'adoucissement aide encore à gagner les premières parties seul |
| 10 | Passer | « Passer la partie guidée » dans la **pause** (pas sur l'écran de jeu) : la partie s'arrête sans compter, tout est dévoilé, retour au menu. Un joueur qui ferme le jeu en pleine partie guidée la reprend où il en était (sauvegarde de partie, phase 49, avec l'étape du guide) | Un joueur qui réinstalle n'est pas forcé de tout refaire ; la règle 12 tient |
| 11 | Équilibrage (règle 13) | Le guide ne change la simulation que par des réglages dans `balance.ts` (`TUTORIAL` : horde légère des cinq premières minutes, horde éclaircie en attente du totem, boss renforcé, or offert, prime). La CLI reçoit `--tutorial` (le bot fait les gestes demandés et va au totem à 8:00) ; cibles : **arriver au boss ≥ 90 %**, **mourir contre le boss ≥ 95 %** de ceux qui y arrivent, **mort du boss en 20 à 60 s** en médiane, **morts avant 5:00 ≤ 3 %** (bot `average`, 4 graines × 200) | Personne ne doit perdre la partie guidée avant d'avoir tout vu |
| 12 | Textes et accessibilité | Toutes les consignes en `fr.json` et `en.json`, une ligne chacune ; la consigne est aussi lue par les lecteurs d'écran (`role="status"`) ; « Effets réduits » coupe les ralentis (la pause de la feuille de niveau reste) | Français d'abord, traduction anglaise ; ralentis coupables |

## Scénarios

# language: fr
Fonctionnalité: Première partie guidée

  Scénario: Un nouveau joueur commence par la partie guidée
    Soit un joueur qui ouvre le jeu pour la première fois
    Alors l'écran « Comment jouer » montre les touches, sans flèche retour ni Échap
    Quand il touche « Jouer » sur cet écran
    Alors la partie guidée commence au monde 1 avec l'Éclaireuse
    Et au lancement suivant, l'écran « Comment jouer » ne s'ouvre plus

  Scénario: Un nouveau joueur la lance aussi avec Entrée
    Soit un joueur qui n'a jamais joué, au clavier
    Quand il presse Entrée sur l'écran « Comment jouer » du premier lancement
    Alors la partie guidée commence, comme avec « Jouer »

  Scénario: Un nouveau joueur qui a vu les touches la lance avec Entrée au menu
    Soit un joueur qui a vu les touches mais n'a pas fini la partie guidée, au clavier
    Quand il presse Entrée au menu
    Alors la partie guidée commence

  Scénario: Un joueur existant ne la voit jamais
    Soit un joueur qui a déjà joué (une partie finie, ou abandonnée après une minute de jeu)
    Quand il touche « Jouer »
    Alors une partie normale commence

  Scénario: Chaque geste attend que le joueur le fasse
    Soit la partie guidée à l'étape du saut
    Quand le joueur ne saute pas pendant 30 secondes
    Alors la consigne du saut reste affichée
    Quand il saute
    Alors l'étape suivante commence

  Scénario: Les consignes suivent l'appareil
    Soit la partie guidée sur téléphone puis au clavier
    Alors chaque consigne de geste montre le bouton à toucher ou la touche à presser

  Scénario: La première carte de niveau explique les raretés
    Soit la première montée de niveau de la partie guidée
    Alors la feuille s'ouvre en pause avec l'arme, le tome et les trois couleurs de rareté expliqués
    Et au moins une carte est rare

  Scénario: Les lieux de la carte sont montrés un par un
    Soit la partie guidée après les gestes
    Alors un coffre, un sanctuaire, une course, un crâne, un totem de boss et le totem du monde sont montrés tour à tour, près du joueur, avec une flèche

  Scénario: Un coffre ouvert pendant les gestes saute l'étape du coffre
    Soit un joueur qui a déjà ouvert le coffre offert avant que le guide le montre
    Quand le guide arrive à l'étape du coffre
    Alors il passe au sanctuaire, sans promettre un coffre gratuit qui ne l'est plus

  Scénario: Le crâne et le totem de boss ne sont jamais imposés
    Soit la partie guidée à l'étape du crâne
    Alors l'étape passe sans que le joueur l'active

  Scénario: À deux minutes de la fin le totem est obligatoire
    Soit la partie guidée à 8:00 sans totem activé
    Alors une flèche et une bannière mènent au totem du monde
    Et le chrono s'arrête à 0:30 tant qu'il n'est pas activé

  Scénario: Le boss de la partie guidée est trop fort
    Soit le totem activé dans la partie guidée
    Alors le boss tue le joueur
    Et une feuille dit « À toi de jouer » avec l'or gagné et la prime de fin de guide

  Scénario: La partie guidée ne compte ni pour la série ni pour les records
    Soit la partie guidée finie
    Alors la série, le record de survie et les succès de survie n'ont pas bougé

  Scénario: Après la partie guidée tout est dévoilé
    Soit la partie guidée finie ou passée
    Alors toutes les mécaniques sont disponibles dans la partie suivante, sans bannière « Nouveau ! »
    Et les deux parties suivantes sont adoucies

  Scénario: Le portail est expliqué la première fois
    Soit la première partie autonome
    Quand le boss du totem tombe pour la première fois
    Alors un ralenti et une consigne montrent le portail
    Et la consigne ne revient plus aux parties suivantes

  Scénario: La partie guidée se rejoue depuis l'Aide
    Soit un joueur qui a fini ou passé la partie guidée
    Quand il choisit « Rejouer la partie guidée » dans « Comment jouer »
    Alors la partie guidée recommence au monde 1, sans nouvelle prime de fin de guide

  Scénario: La partie guidée se passe depuis la pause
    Soit la partie guidée en cours
    Quand le joueur choisit « Passer la partie guidée » dans la pause
    Alors il revient au menu avec tout dévoilé

  Scénario: Une partie guidée interrompue reprend à son étape
    Soit la partie guidée fermée à l'étape du sanctuaire
    Quand le joueur rouvre le jeu et reprend
    Alors la partie et le guide reprennent à l'étape du sanctuaire

  Scénario: Personne ne perd la partie guidée avant le boss
    Soit 800 parties guidées simulées
    Alors au moins 90 % arrivent au boss et au plus 3 % meurent avant 5:00

## UI & Layout Contract

- Le guide : une bulle en haut au centre (sous le chrono), une ligne, le pictogramme de la
  commande (bouton au doigt, touche au clavier : celles des réglages de touches), une flèche au
  bord de l'écran ou au sol vers la cible. Kit « Nocturne » : fond nuit, texte lune, accent
  lanterne. Aucune image, police ni dépendance ajoutée.
- Le guide ne crée aucun nœud DOM par image : bulle et flèche créées une fois, textes mis à
  jour au changement d'étape seulement.
- La feuille de fin de guide : le kit des feuilles de partie (`#over`), titre en capitales,
  l'or gagné et la prime, un bouton plein « Jouer ».
- Pause : « Passer la partie guidée » sous les boutons existants, en lien discret.
- Aide : « Rejouer la partie guidée ».

## Livraison

Branche `lot/tutoriel`, version **1.65.0**. Un test par scénario (titre anglais), Vitest pour
la simulation et la méta, Playwright PC et mobile pour l'interface (crochets de débogage pour
sauter d'étape en étape). `docs/GATES.md`, `CHANGELOG.md` écrit pour les joueurs, captures de
chaque étape du guide (téléphone), relues. `perf-reviewer` (boucle et HUD touchés) et
`balance-playtester` ou équivalent (cibles de la décision 11) avant la fusion. Règle 9 : la
rétention est relevée avant et après la mise en ligne ; c'est D1 qui est visé.

## Hors périmètre

- Une scène scriptée hors de la partie (cinématique) : le guide se joue dans une vraie partie.
- Une partie guidée pour chaque personnage.
- La voix off et les sons nouveaux.
