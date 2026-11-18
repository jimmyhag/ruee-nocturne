# Interface « Nocturne », passe d'ergonomie — tablettes, écrans pliables, icônes et nouveautés lisibles

**Statut : 🟢 Implémenté**

Session du 18 novembre 2026, avec Jimmy, après la mise en ligne de la 1.62.0. Jimmy, sur son
téléphone ouvert « en mode tablette » : « ça rend pas ouf, c'est pas très bien fait. […] On
remarque pas bien tout ce qui est les trucs de nouveautés. Faut que ça soit plus clair.
J'aime bien le design que t'as fait là, mais essayer de rendre ça plus clean et plus
ergonomique. Et que sur le visuel, on remarque bien les icônes. » Sparring mené **en
délégation**, comme pour `docs/specs/ui-nocturne.md` : chaque question est tranchée par la
recommandation du sparring, qui vaut réponse de Jimmy ; il peut revenir sur n'importe laquelle.

## Contexte

Le kit « Nocturne » (`docs/specs/ui-nocturne.md`, maquette `docs/design/menus/`) reste la
direction : couleurs, typographies, listes à filets, un seul bouton plein par écran. La
maquette ne dessine qu'un téléphone en portrait (390 × 844). Captures de la 1.62.0 prises à
six tailles (390 × 844, 540 × 720, 717 × 880, 820 × 1180, 1180 × 820, 844 × 390) ; constats :

1. **Écrans larges** (tablette, pliable ouvert) : toute l'interface reste une colonne de
   téléphone de 460 px au milieu de l'écran ; textes, icônes et boutons à la taille d'un
   téléphone, la moitié de l'écran vide. Les écrans intérieurs et le HUD de partie aussi.
2. **Défi du jour et Nouveautés** : deux libellés verticaux de 9 à 10 px sur les bords,
   sans icône ; la nouvelle version est un point de 5 px. Personne ne les voit.
3. **Missions du jour** : sur tablette en portrait et pliable ouvert, le panneau s'ouvre
   seul et recouvre le nom du héros, le carrousel et le prochain objectif.
4. **Haut de l'écran** : l'or, le bouton des réglages et le logo se perdent sur la lune dès
   que le fond est recadré (tablette, pliable).
5. **Onglets** : icônes de 20 px au trait de 1,7 px, libellés de 10 px, onglets inactifs
   pâles ; la barre garde 460 px sur un écran de 1180 px.
6. **Téléphone à l'horizontale** (844 × 390) : la barre d'onglets recouvre l'objectif,
   « Jouer » sort de l'écran, le héros est minuscule.
7. **Les appuis « passent mal »** (Jimmy, même session : « quand je clique sur des trucs,
   ça clique pas bien »). Mesuré sur le build de la 1.62.0, téléphone simulé, processeur
   ralenti 4 fois : le **premier appui** de la session lance le téléchargement, l'évaluation
   et la construction de toute la scène 3D dans la foulée (`warm` dans `src/main.ts`) : une
   tâche de **8,6 s** bloque l'écran juste après l'appui (9,2 s entre l'appui sur un onglet
   et l'écran affiché ; 0,15 s pour l'appui suivant). Le rendu logiciel de la machine de
   test grossit le chiffre, pas le mécanisme : le travail le plus lourd du jeu est placé sur
   le premier geste du joueur. Et **aucun élément ne réagit à l'appui** : seuls le bouton
   plein et les boutons tactiles de partie ont un état pressé (`:active`), la surbrillance
   du navigateur est coupée ; onglets, flèches, lignes et liens ne montrent rien tant que
   l'écran n'a pas changé.

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Garder le kit ? | **Oui.** Couleurs, polices, filets, bouton plein unique : inchangés. On change la mise en page selon l'écran, la taille des éléments et la visibilité des entrées | Jimmy : « J'aime bien le design » |
| 2 | Quelles tailles d'écran ? | Quatre **gabarits**, choisis par la taille de la fenêtre (jamais par l'appareil ni par JavaScript) : **compact** (largeur < 600 px, plus haut que large : téléphone en portrait), **moyen** (largeur ≥ 600 px et hauteur ≥ largeur × 0,9 : tablette en portrait, pliable ouvert), **large** (plus large que haut et hauteur ≥ 600 px : tablette en paysage, PC), **bas** (plus large que haut et hauteur < 600 px : téléphone à l'horizontale). Tourner l'appareil change de gabarit sans recharger | Les constats 1 et 6 ; un pliable change de taille en cours de partie |
| 3 | Gabarit **moyen** | Même structure qu'un téléphone, **agrandie** : colonne de contenu de `min(88 vw, 760 px)`, textes, icônes, boutons et portrait du héros agrandis d'un facteur 1,25 à 1,5 selon la place (le bouton plein fait au moins 64 px de haut, les cibles tactiles au moins 48 px). Rien ne reste à la taille téléphone | Constat 1 |
| 4 | Gabarit **large** | **Deux zones** : à gauche le héros en grand (portrait, nom, armes, carrousel) ; à droite un panneau (prochain objectif, missions du jour **dépliées**, « Jouer »). La barre d'onglets prend la largeur de l'écran (contenu centré, 960 px au plus). Au moins 80 % de la largeur de l'écran est occupée | Constat 1 ; un écran large n'est pas un grand téléphone |
| 5 | Gabarit **bas** | Deux zones serrées : héros (réduit) et nom à gauche, objectif et « Jouer » à droite ; barre d'onglets fine (icônes et libellés, 48 px de haut) ; missions repliées. « Jouer », l'objectif et les cinq onglets sont visibles sans défiler et ne se chevauchent pas ; les zones sûres (`env(safe-area-inset-*)`) sont respectées | Constat 6 |
| 6 | Défi du jour et Nouveautés | **Plus de libellés verticaux.** Deux **boutons horizontaux** côte à côte sous l'accroche, chacun avec une **icône** : flamme + « Défi du jour » + « 5 min » + série en cours ; étincelle + « Nouveautés » + numéro de version. 48 px de haut au moins, texte de 12 px au moins, fond nuit translucide pour rester lisibles sur l'illustration. En gabarit large ils vont en tête du panneau de droite | Constat 2 ; « on remarque pas bien les nouveautés » |
| 7 | Annoncer une nouvelle version | Tant que les Nouveautés de la version courante n'ont pas été ouvertes : le bouton porte une **pastille « Nouveau »** (texte sur fond lanterne) et un contour lanterne ; elle disparaît à l'ouverture. La logique existante (`seenNotes`) ne change pas | Constat 2 |
| 8 | Défi du jour pas encore joué | Le bouton est en état **« à jouer »** (flamme et contour lanterne) tant que le défi d'aujourd'hui n'a pas été joué, **« fait »** (coche, sans contour) ensuite. La note du joker reste sous l'accroche | Donner une raison de toucher le bouton chaque jour (lot L3) |
| 9 | Missions du jour | **Repliées par défaut** en compact, moyen et bas : une ligne « Missions du jour · 1/3 ». Dépliées, elles s'ouvrent **par-dessus** l'accueil (fond opaque, fermeture au toucher hors du panneau et à Échap) et ne déplacent rien. Fermées, elles ne recouvrent ni le nom du héros, ni le carrousel, ni l'objectif. En large : dépliées dans le panneau de droite | Constat 3 |
| 10 | Haut de l'écran | Un **voile de nuit** dégradé sous la barre du haut et le logo (opaque à 70 % en haut, transparent en bas) ; la puce de profil, l'or et les réglages sont des **boutons à fond nuit translucide** de 44 px au moins. L'icône des réglages fait 24 px | Constat 4 |
| 11 | Onglets et icônes | Icônes des onglets de **26 px** au moins en compact (agrandies avec le gabarit), trait de **2 px** ; libellés de 11 px au moins ; onglet inactif en lune à 80 % (plus 55 %) ; onglet courant : icône et libellé lanterne **et** une marque (filet ou pastille lanterne) ; la barre a un fond nuit opaque et un filet en haut. Les autres icônes d'action de l'accueil (flèches du carrousel, réglages, flèche retour) passent aussi au trait de 2 px | Constat 5 ; « qu'on remarque bien les icônes » |
| 12 | Écrans intérieurs | Colonne de `min(92 vw, 760 px)` en moyen, jusqu'à 1040 px en large, avec les textes agrandis comme l'accueil. En large : **Bibliothèque** en grille d'au moins 6 colonnes avec la fiche de l'élément à côté ; **Héros** : fiche à gauche, défis à droite ; **Succès** et **Emplacements** sur deux colonnes ; **Nouveautés**, **Défi du jour**, **Compte**, **Réglages**, **Aide** : colonne de lecture de 760 px au plus. Un écran ouvert commence toujours en haut (titre et flèche retour visibles) | Constat 1 |
| 13 | HUD de partie | En moyen et en large, le HUD grandit : textes, barres et chrono × 1,25 au moins, minicarte de 130 px au moins, boutons tactiles (saut, sort, glisse) × 1,25 au moins. En compact et en bas : inchangé. **Uniquement en CSS** : le DOM, les caches et les écritures du HUD ne changent pas (règle 1) | Constat 1 ; un bouton de saut de 80 px est petit sous un pouce de tablette |
| 14 | Feuilles en partie | Cartes de niveau, coffre, marchand, pause, fin de partie : même agrandissement que le reste en moyen et en large, colonne de 760 px au plus | Cohérence |
| 15 | Performance et poids | Aucune image, aucune police, aucune dépendance ajoutée. Lighthouse reste au-dessus du seuil (la marge est mince depuis la 1.61.0 : mesurer avant et après) | Règles 2 et 5 |
| 16 | Un appui doit se voir | **Tout élément qu'on peut toucher a un état pressé** visible dès que le doigt se pose (fond lune à 10 %, ou léger enfoncement) : onglets, boutons Défi du jour et Nouveautés, flèches, puce de profil, or, réglages, ligne des missions, objectif, lignes de liste, liens, flèche retour, cartes de niveau, offres du marchand. Coupé nulle part : c'est un retour d'état, pas une animation | Constat 7 |
| 17 | Rien de lourd pendant un appui | La scène 3D ne se prépare **plus dans le premier geste**. Elle se prépare quand le joueur ne touche à rien (après son premier geste, écran au repos depuis un instant ; chaque nouvel appui repousse le départ), par étapes qui rendent la main entre elles autant que le code le permet. Si le joueur touche « Jouer » avant qu'elle soit prête : préparation immédiate, le bouton montre l'état « chargement » déjà existant, la partie démarre dès que c'est prêt. Le son suit la même règle : son initialisation ne bloque pas l'appui qui la déclenche. Le score Lighthouse ne baisse pas (rien ne part avant le premier geste) | Constat 7 ; un menu doit répondre dans l'instant |

## Scénarios

Chaque scénario devient un test Playwright du même nom en anglais (`e2e/ergonomie.spec.ts`).
Les tailles sont posées par `page.setViewportSize` ; « ne se chevauchent pas » se vérifie sur
les rectangles englobants.

- **L'accueil remplit une tablette en portrait** — à 820 × 1180, la colonne de contenu fait
  au moins 600 px de large, « Jouer » au moins 64 px de haut, les icônes d'onglet au moins
  30 px ; le nom du héros, l'objectif, la ligne des missions, « Jouer » et la barre d'onglets
  sont visibles et ne se chevauchent pas.
- **L'accueil passe en deux zones sur un écran large** — à 1180 × 820, le portrait du héros
  est à gauche du bouton « Jouer » ; les missions du jour sont dépliées dans le panneau de
  droite ; l'ensemble occupe au moins 80 % de la largeur ; rien ne se chevauche.
- **L'accueil tient sur un téléphone à l'horizontale** — à 844 × 390, « Jouer », l'objectif
  et les cinq onglets sont dans l'écran et ne se chevauchent pas ; chaque onglet fait au
  moins 44 px.
- **Tourner l'appareil change la mise en page sans recharger** — de 820 × 1180 à
  1180 × 820 puis retour : le gabarit suit, le héros choisi et l'écran ouvert sont gardés.
- **Le défi du jour et les nouveautés se voient d'un coup d'œil** — en compact, deux
  boutons horizontaux avec icône, de 48 px de haut au moins, texte horizontal de 12 px au
  moins ; chacun s'ouvre au doigt et au clavier (Entrée) et rend le focus à la fermeture.
- **Une nouvelle version s'annonce clairement** — `seenNotes` plus ancienne que la version :
  le bouton Nouveautés porte la pastille « Nouveau » sur fond lanterne ; après l'ouverture
  des Nouveautés, elle a disparu.
- **Le défi pas encore joué est mis en avant** — sans partie du défi aujourd'hui : état
  « à jouer » ; après un défi enregistré aujourd'hui : état « fait ».
- **Les missions ne cachent jamais le héros** — à 390 × 844, 717 × 880 et 820 × 1180, à
  l'ouverture de l'accueil : missions repliées, la ligne ne recouvre ni le nom du héros ni
  l'objectif ; dépliées : par-dessus, « Jouer » reste visible, Échap et un toucher hors du
  panneau les referment.
- **L'or et les réglages restent lisibles sur la lune** — les trois boutons du haut ont un
  fond (opacité ≥ 0,5) et font au moins 44 px ; le voile du haut est présent.
- **Les onglets se lisent bien** — en compact : icône ≥ 26 px, trait de 2 px, libellé
  ≥ 11 px, inactif à 80 % d'opacité au moins, onglet courant en lanterne avec sa marque ;
  la barre a un fond opaque.
- **Les écrans intérieurs utilisent la largeur de l'écran** — à 820 × 1180, le contenu de
  Héros et de Bibliothèque fait au moins 600 px ; à 1180 × 820 au moins 800 px et la grille
  de la Bibliothèque a au moins 6 colonnes ; chaque écran s'ouvre en haut (flèche retour
  visible).
- **Le HUD grandit sur tablette** — à 820 × 1180 en partie : le chrono, le bouton de saut et
  la minicarte sont au moins 1,25 fois plus grands qu'à 390 × 844 ; à 390 × 844 : tailles
  de la 1.62.0.
- **Un appui se voit tout de suite** — doigt posé (sans relâcher) sur un onglet, sur le
  bouton Nouveautés, sur une flèche du carrousel et sur une ligne de liste : le style de
  l'élément change (état pressé) ; relâché : il revient.
- **Le premier appui répond sans attendre** — page chargée sans le mode debug, processeur
  ralenti 4 fois (Chromium) : le tout premier appui, sur un onglet, affiche l'écran en moins
  de 400 ms, et aucune tâche de plus de 200 ms ne démarre dans la seconde qui suit un appui
  au menu ; la scène se prépare ensuite, écran au repos.
- **Jouer en premier geste lance quand même la partie** — premier appui de la session sur
  « Jouer » : le bouton passe à l'état « chargement » en moins de 300 ms, puis la partie
  démarre.
- **Rien ne déborde aux tailles courantes** — à 360 × 640, 390 × 844, 540 × 720, 717 × 880,
  820 × 1180, 1180 × 820, 844 × 390 et 1280 × 720 : pas de défilement horizontal, « Jouer »
  et les cinq onglets dans l'écran, aucune cible tactile de l'accueil sous 44 px.

## UI & Layout Contract

- Les gabarits sont des **requêtes média CSS** dans `index.html` (largeur, hauteur,
  orientation) ; aucun calcul de mise en page en JavaScript, aucune lecture de
  `innerWidth` dans la boucle. Un facteur d'échelle par gabarit (propriété personnalisée,
  ou `zoom` si la version des navigateurs visés le permet : à vérifier avant) plutôt que
  des tailles recopiées règle par règle.
- Les identifiants existants sont gardés (`#dailyBtn`, `#notesBtn`, `#playBtn`, `#tabBar`,
  `#missions…`, `#settingsBtn`, `#profileBtn`…) : les tests d'avant continuent de les
  trouver. Les tests de `e2e/nocturne.spec.ts` et `e2e/daily.spec.ts` qui vérifient la
  **forme** des anciens rails (texte vertical, position sur les bords) sont mis à la forme
  nouvelle, sans rien retirer de ce qu'ils vérifient du comportement.
- Textes : « Nouveau » / « New », « à jouer » / « to play », « fait » / « done » et les
  libellés d'accessibilité, en `fr.json` et `en.json`. Les deux boutons gardent un nom
  accessible complet (« Défi du jour, 5 minutes, série de 6 jours, à jouer »).
- Mouvement : la pastille « Nouveau » peut pulser doucement ; coupé par « Effets réduits »
  et `prefers-reduced-motion`, comme le reste du menu.
- Contraste : texte sur fond translucide ≥ 4,5:1 sur la partie la plus claire de
  l'illustration (la lune).

## Livraison

Branche `lot/ui-ergonomie`, version **1.63.0**. `docs/GATES.md` (ligne et section, mesures
Lighthouse avant et après), `CHANGELOG.md` écrit pour les joueurs, captures avant / après de
l'accueil, d'un écran intérieur et du HUD aux six tailles dans
`docs/captures/ergonomie/`, toutes relues. `perf-reviewer` (le HUD et la boucle sont
touchés par le CSS) et inspecteur avant la pull request.

## Hors périmètre

- Changer les couleurs, les polices ou l'illustration de l'accueil.
- Une mise en page à deux écrans propre aux pliables (charnière, `viewport-segments`).
- Redessiner les icônes d'armes, d'objets et de sorts.
- Toute mécanique de jeu ou de rétention : rien ne change dans `src/sim/` ni `src/meta/`.
