# Première partie guidée — tout le jeu appris en jouant, au monde 1

**Statut : 🟢 Implémenté** (révision 1.66.0)

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

## Révision 1.66.0 (retour de Jimmy après la 1.65.1, 19 nov. 2026)

Jimmy : « Pas assez clair pour les crânes et totems de boss : obligé à activer en vrai, la première partie c'est pour
découvrir. Au début, impose deux tomes, celui de dégâts et celui de projectiles ; les autres arriveront à la deuxième
partie. Tu laisses la personne sélectionner, mais pas vraiment : tu la forces à prendre ça dans le choix. Pour le boss
final, dans le tuto, tu dis bien d'activer la statue, mais seulement quand c'est son tour ; avant, on ne doit pas
pouvoir l'activer. Laisse le boss normal : si la personne arrive à le tuer, trop cool, et il y a directement
l'enchaînement avec « regarde, un portail… ». » Ces décisions **remplacent** celles qu'elles citent.

| # | Question | Décision | Remplace |
|---|---|---|---|
| 13 | Deux tomes imposés | À la **première** montée de niveau, la feuille propose le **Tome des dégâts** : il est sur la première carte, mis en avant, et c'est la seule carte qu'on peut prendre (les autres restent visibles, éteintes, avec la consigne « Prends le Tome des dégâts », construite sur le nom affiché de la carte). À la **deuxième** montée, même chose avec le **Tome des projectiles**. Les explications de la feuille (arme, tome, raretés) restent sur la première. Ensuite, le joueur choisit librement, mais **aucun autre tome** n'est proposé de toute la partie guidée (ses deux emplacements de tome sont pris) ; les autres tomes arrivent dès la partie suivante. La carte imposée est changée sans toucher `w.rng` (comme la carte rare de la 1.65.0) ; le choix d'une autre carte est refusé par la simulation, pas seulement par l'interface (le bot et le clavier suivent la même règle) | décision 4 (« le joueur choisit lui-même ») |
| 14 | Crâne et totem de boss activés pour de vrai | Les étapes du **crâne** et du **totem de boss** ne passent qu'à leur **activation** par le joueur (plus de « à voir »). Consignes plus claires, en deux temps : ce que c'est, puis ce que ça fait (« Reste dans le crâne pour l'activer : la difficulté monte, et les récompenses aussi » ; « Active le totem de boss : un boss de plus à chaque vague de boss de ce monde, à vaincre avant que le portail s'ouvre »), avec une bannière à l'activation qui redit l'effet | décision 5 (crâne et totem de boss « à voir, jamais imposé ») |
| 15 | Le totem du monde attend son tour | Dans la partie guidée, le **totem du monde ne s'active pas** avant son tour : rester dessus ne fait rien et une ligne dit « Pas encore : ce sera le dernier défi de la partie ». L'étape « totem du monde » des lieux le **montre** seulement (« Le totem du monde : tu l'activeras à la fin, pour affronter le boss du monde »). Son tour vient à **8:00** (décision 6, inchangée : flèche, bannière « Va activer la statue rouge : le boss du monde t'attend », chrono tenu à 0:30, horde éclaircie) : il devient activable à ce moment-là | décision 5 (totem du monde « quand tu es prêt ») |
| 16 | Un vrai boss, et le portail dans la foulée | Le boss du totem de la partie guidée est un **boss normal** (plus de `TUTORIAL.bossHp`, `bossDmg`). S'il **tombe** : ralenti et consigne « Un portail est apparu : entre dedans pour découvrir la suite », flèche vers le portail ; à l'arrivée au monde 2, la consigne du nouveau monde ; la partie continue comme une partie normale (les monstres ne sont adoucis qu'au monde 1) et sa fin ouvre la feuille de fin de guide, avec un texte de victoire (« Tu as battu le Gardien ! … À toi de jouer ! »). S'il **tue** le joueur : la feuille « Le Gardien était trop fort… pour cette fois » de la 1.65.0. Ces deux consignes ne reviennent plus dans les parties suivantes (bits de `hints`) | décisions 7 et 8 (boss renforcé qui tue ; portail expliqué seulement dans la partie suivante) |
| 17 | Équilibrage (règle 13) | Cibles de `--tutorial` (bot `average`, 4 graines × 200, regroupées) : **boss du monde atteint ≥ 90 %** ; **morts avant 5:00 ≤ 3 %** ; **boss du monde abattu entre 25 et 75 %** de ceux qui l'atteignent (un vrai combat, gagnable sans être donné) ; la CLI compte aussi les parties qui entrent dans le portail. Leviers : ceux de `TUTORIAL` (horde, monstres du monde 1, attente du totem), pas les boss eux-mêmes. Le bot active le crâne et le totem de boss quand le guide le demande et prend les tomes imposés. Les parties normales, adoucies et le défi du jour restent identiques au bit près | décision 11 (mourir contre le boss ≥ 95 %) |
| 18 | La mort du boss du totem fait tomber le chrono à 0 (ajoutée au lot par Jimmy, 19 nov. 2026 : « pour que les gens attendent vraiment la fin ») | Règle de **toute partie**, mondes 1, 2 et 3 : le totem s'active quand on veut et son activation ne change rien au chrono, qui continue pendant le combat. C'est quand le **boss du totem meurt** (avec ses doubles) que le chrono du monde **tombe à 0** : le monde passe aussitôt en **prolongation** (l'état « chrono écoulé, la horde ne fait que grossir », sa rampe, son dépassement en rouge) tant que le portail est ouvert ; le temps qui restait est perdu. Au monde 3, sa mort reste la victoire. Textes : la ligne de l'aide (`menu.ctrl.worlds` : « Quand le boss du totem meurt, le chrono tombe à 0 : la horde grossit jusqu'à ce que tu passes le portail. Mieux vaut donc vaincre le boss tard, près de la fin du chrono. »), la jauge du totem (« Totem du boss », puis sur sa propre ligne « À sa mort, le chrono tombe à 0 » ; pas de jauge tant que le totem est verrouillé dans la partie guidée) et une bannière à la mort du boss (« Le chrono tombe à 0 : entre dans le portail ! », avec la ligne du portail). Partie guidée : la décision 15 tient (totem verrouillé jusqu'à 8:00, puis obligatoire, chrono tenu à 0:30 jusqu'à l'activation et à 0:00 pendant le combat) ; la mort du boss y fait aussi tomber le chrono à 0, avec la consigne du portail (décision 16). Le temps sauté est perdu sans rattrapage : les minuteries du monde (vagues, élites, éruptions, bonus, départ du marchand) sont décalées d'autant et les passages du marchand qui y tombaient sont perdus (relecture). Pas concernés : le défi du jour (pas de totem du monde) et sa suite en monde infini, identiques au bit près ; le monde infini d'après une victoire normale change par ricochet (le bot y arrive plus fort). Une partie gardée en 1.65 et reprise garde son état d'avant (accepté à la relecture). Équilibrage (règle 13) : les parties normales changent, donc la mesure avant/après remplace l'identité au bit près : profils nu et maxé, 4 graines × 200 regroupées, toutes les cibles de `tools/targets.ts` (monde infini compris) ; le bot adapte l'heure du totem pour que le boss meure vers la fin du chrono (politique et mesures : `docs/GATES.md`) ; un écart se règle par la prolongation ou `STAGE` (`balance.ts`), ou se signale avec le levier | règle de la 1.45.2 (le chrono continue après la mort du boss) ; décision 17 (parties normales identiques au bit près) |

Version **1.66.0**, branche `lot/tutoriel-v2`.

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

  Scénario: Les deux premiers tomes sont imposés
    Soit la première montée de niveau de la partie guidée
    Alors la carte du Tome des dégâts est la seule qu'on peut prendre
    Quand le joueur essaie de prendre une autre carte, au doigt ou au clavier
    Alors rien ne se passe
    Et à la deuxième montée, c'est le Tome des projectiles
    Et aucun autre tome n'est proposé de toute la partie guidée

  Scénario: Les lieux de la carte sont montrés un par un
    Soit la partie guidée après les gestes
    Alors un coffre, un sanctuaire, une course, un crâne, un totem de boss et le totem du monde sont montrés tour à tour, près du joueur, avec une flèche

  Scénario: Un coffre ouvert pendant les gestes saute l'étape du coffre
    Soit un joueur qui a déjà ouvert le coffre offert avant que le guide le montre
    Quand le guide arrive à l'étape du coffre
    Alors il passe au sanctuaire, sans promettre un coffre gratuit qui ne l'est plus

  Scénario: Le crâne et le totem de boss doivent être activés
    Soit la partie guidée à l'étape du crâne
    Quand le joueur ne l'active pas
    Alors la consigne reste
    Quand il l'active
    Alors une bannière redit son effet et l'étape du totem de boss commence, qui attend aussi son activation

  Scénario: Le totem du monde ne s'active pas avant son tour
    Soit la partie guidée avant 8:00
    Quand le joueur reste sur le totem du monde
    Alors il ne s'active pas et une ligne dit « Pas encore »
    Quand vient 8:00
    Alors il s'active normalement

  Scénario: À deux minutes de la fin le totem est obligatoire
    Soit la partie guidée à 8:00 sans totem activé
    Alors une flèche et une bannière mènent au totem du monde
    Et le chrono s'arrête à 0:30 tant qu'il n'est pas activé

  Scénario: Le boss de la partie guidée est un vrai boss
    Soit le totem activé dans la partie guidée
    Alors le boss a les points de vie et les dégâts d'un boss normal du monde 1
    Quand il tue le joueur
    Alors une feuille dit « À toi de jouer » avec l'or gagné et la prime de fin de guide

  Scénario: Battre le boss de la partie guidée montre le portail
    Soit le boss du totem vaincu dans la partie guidée
    Alors un ralenti et une consigne montrent le portail, avec une flèche
    Quand le joueur entre dans le portail
    Alors la consigne du nouveau monde s'affiche et la partie continue

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
    Et entre 25 et 75 % de ceux qui l'atteignent abattent le boss

  Scénario: La mort du boss du totem fait tomber le chrono à 0
    Soit une partie normale, au monde 1, 2 ou 3, avec du temps au chrono
    Quand le joueur active le totem
    Alors le chrono continue pendant le combat
    Quand le boss du totem meurt
    Alors le chrono tombe à 0, une bannière le dit et la prolongation commence tant que le portail est ouvert
    Et au monde 3 c'est la victoire
    Et l'aide et la jauge du totem expliquent la règle

  Scénario: Le défi du jour et le monde infini ne changent pas
    Soit le défi du jour, puis le monde infini après une victoire
    Quand leurs boss meurent
    Alors leur chrono n'est pas touché et aucune prolongation ne commence

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
