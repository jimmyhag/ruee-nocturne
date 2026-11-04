# Journal des modifications

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : [SemVer](https://semver.org/lang/fr/).

## 1.6.0 — 4 nov. 2026 (phase 11 « Mouvement utile »)

Le saut et le dash servent à autre chose qu'à fuir : on monte, on passe au-dessus, on traverse.

### Ajouté

- **Plateaux** : 14 disques de roche (2,5–4 u de rayon, 1,4 u de haut) répartis sur la carte, hors lacs et bois. Ils se montent d'un saut ; vu d'en bas le bord est un mur, on retombe en sortant. Les marcheurs et les boss butent au pied ; Volants, crachats, cercles du Colosse, onde du Gardien et éruptions atteignent toujours un joueur perché.
- **Éruptions** (dès 2:00) : une fissure rouge suit le joueur pendant 0,8 s (plus vite qu'il ne marche) puis un pic blesse (20 PV × montée des dégâts) et projette en l'air qui est encore au sol. Se saute à mi-télégraphe, ou se dashe. Toutes les 9 s au début, 4 s à 15:00.
- **Onde de choc du Gardien** : toutes les 6 s (3 s en phase 2), un anneau rouge part du boss et s'étend à 9 u/s jusqu'à 14 u ; il blesse une fois au passage (14 PV × montée des dégâts) et se saute.
- **Charge des Brutes élites** : couloir rouge au sol pendant 0,6 s puis charge en ligne de 7 u à 16 u/s (16 PV × montée des dégâts en un coup), suivie de 0,7 s d'essoufflement. Se traverse en dash (invulnérable) ou s'évite d'un pas de côté.
- Sons et effets dédiés (coup sourd d'éruption avec gerbe de roche, nappe de l'onde, grognement de charge) ; secousse d'écran sur l'éruption. Cause de mort nommée dans la CLI (`éruption`, `anneau`, `charge`, `crachat`, `zone`).
- Bots de simulation : l'`average` saute sur une éruption ou une onde imminente, dashe à travers une charge, et saute quand il bute (pied de plateau, arbre).

### Modifié

- Projectiles ennemis : plafond 96 → 128 (éruptions et ondes).
- Première éruption à 2:30 et dégâts 18 (× montée des dégâts) après mesure : à 2:00 et 20 PV, les morts avant 3 minutes passaient de 13 à 22 %.
- Survie médiane (bot average, 100 runs) : départ **4:40** (4:25 en 1.5.0), 83 % des runs passent 3 minutes ; personnage complet **14:28** (15:09). Éruptions : 6–8 % des causes de mort. Les plateaux restent à 24 u du départ : à 12 u, le bot se faisait coincer au pied (+5 points de morts avant 3 minutes).

## 1.5.0 — 4 nov. 2026 (phase 10 « Progression lente »)

**Tout le monde repart de zéro** : or, boutique, succès, personnages, tenues et records sont remis à zéro au premier lancement (réglages conservés, bannière dans le menu).

### Ajouté

- **Emplacements** : on part avec une seule arme (celle du personnage) et deux améliorations. Les emplacements suivants se débloquent pour tous les personnages, dans l'ordre, par un succès et de l'or : Arme n°2 (« Première nuit », 300 or), Amélioration n°3 (« Faucheuse en herbe », 2 000 or), Arme n°3 (« Gardienne tombée », 4 000 or), Amélioration n°4 (« Dix minutes », 8 000 or), Arme n°4 (« Quart d'heure », 12 000 or). Bloc « Emplacements » en tête de la boutique, résumé dans le menu, rappel à la montée de niveau, prochain emplacement sur l'écran de mort. Les armes et passifs de départ d'un personnage (Revenante, Colporteur) ne comptent pas contre le plafond. Le défi du jour joue au maximum.
- `npm run sim -- --slots start|max|w,p` ; le profil nu de la CI est désormais le départ réel.

### Modifié

- Feu follet : 60 PV (50) : seul avec l'Orbe il passait sous 4 minutes.
- Bûcheron et Colporteur partent avec **Lames niveau 3** (niveau 2) : seuls avec les Lames, ils mouraient avant 3 min dans plus de 40 % des runs.
- Survie médiane au départ (bot average, 100 runs) : **4:25** (87 % des runs passent 3 minutes, 13 % meurent avant), 2 armes sans palier 5:14, 3 armes et 3 améliorations avec 4 paliers 12:07, personnage complet 15:09.

## 1.4.0 — 3 nov. 2026 (phase 9 « Rendu net »)

Le jeu n'est plus pixelisé (retour de Jimmy sur la 1.3.1).

### Ajouté

- **Rendu net** à la résolution de l'écran (jusqu'à 2× la densité de pixels, 1 600 px de haut au plus) avec anti-aliasing, texture de sol lissée en 512 px, vignette douce.
- **Finitions** : ombre douce sous le joueur, chaque ennemi et chaque arbre ; particules rondes orientées vers la caméra ; lucioles rondes ; brume exponentielle ; lumière de contre bleutée qui détache les silhouettes ; formes plus lisses (12 segments) sur le joueur et les boss.
- **Réglage « Rendu »** (pause et réglages) : auto, net, pixel. En auto, si l'appareil ne suit pas (p95 des frames > 24 ms pendant 6 s), le rendu descend d'un cran (net ×0,75, puis pixel) avec la bannière « Rendu allégé » ; jamais de remontée en cours de run. Le mode pixel est l'ancien rendu.
- Onglet perf : niveau de rendu, résolution interne et p95 des intervalles de frame.

### Modifié

- Budgets inchangés : 21 appels de rendu (+1 pour les ombres d'arbres) et 92 k triangles à 400 ennemis.

## 1.3.1 — 3 nov. 2026 (relecture d'équilibrage de la phase 8)

### Modifié

- **Réanimation** : on revient à 25 % des PV (50 % avant) avec 1 s d'invulnérabilité (2 s). À 200 or, elle valait à elle seule +4 min de survie (5:29 → 9:33) et sautait la falaise des premières minutes ; elle vaut maintenant ≈ +2:40.
- **Milieu de partie** (7:00 → 15:00) encore un peu plus raide : le plateau entre 7 et 12 min subsistait pour qui avait quelques paliers, et 4 paliers collaient déjà au personnage complet. Escalier mesuré (Éclaireuse, bot average, 100 runs) : 0 palier 5:29 · Réanimation seule 8:06 · 2 paliers 11:05 · 4 paliers 13:25 · 8 paliers ≈ 15:10. Le run nu ne change pas.

## 1.3.0 — 3 nov. 2026 (phase 8 « Progression »)

La boutique devient nécessaire et passe par personnage (retour de Jimmy sur la 1.2.0 : « trop facile de monter sans améliorer le perso »).

### Modifié

- **Difficulté** : les dégâts de base passent à ×0,95 et le milieu de partie (7:00 → 15:00) est plus raide (ennemis plus nombreux et plus résistants). Avant, plus personne ne mourait entre 6 et 15 min : la survie sautait de 5 à 15 min au moindre palier. Un run sans palier tient ≈ 5:30 en médiane (9:52 en 1.2.0) ; un personnage entièrement amélioré ≈ 15:30 et atteint le Faucheur dans ≈ 5 % des cas.
- **Boutique par personnage** : chaque personnage a ses 8 lignes de paliers ; l'or reste commun. Les paliers achetés avant la 1.3.0 sont reportés sur l'Éclaireuse, l'or en caisse est conservé.
- **Paliers** : 8 par ligne (une seule Réanimation), plus petits (+3 PV, +2 % de dégâts, +1,5 % de vitesse, +0,4 Trèfle, +10 % d'or, +10 % de rayon de collecte, −1 % de recharge) et plus chers (200 → 1 255 or, ≈ 34 000 or par personnage). Un run nu paie 2 à 3 premiers paliers.
- Écran de boutique : rangée de personnages (pastille de tenue, nombre de paliers), titre au nom du personnage ; changer de personnage ici le choisit aussi pour la prochaine partie. Textes des lignes lus dans `balance.ts`.
- `npm run sim` : `--upgrades 0|max|n|ligne=n`, `--profile naked|maxed`, or médian par run et runs pour tout maxer ; deux jeux de cibles (`tools/targets.ts`). La CI commente les deux profils.

## 1.2.0 — 3 nov. 2026 (phase 7 « Identité visuelle »)

Toujours du low-poly généré par le code, mêmes budgets, mais tout ce qui bouge a maintenant une silhouette (PLAN.md phase 7).

### Ajouté

- **Un modèle par personnage** (`src/render/characters.ts`) : tunique et plume de l'Éclaireuse, hache et bonnet du Bûcheron, chapeau et bâton à gemme de la Sorcière, lanterne et halo au sol de la Veilleuse, capuche et boomerang du Braconnier, casque et sac à mines du Sapeur, flamme flottante du Feu follet, voile et yeux luisants de la Revenante, hotte du Colporteur. Course (jambes), flottement, écrasement au tir ; la traînée de dash reprend la silhouette du personnage choisi. Tout est fusionné en une géométrie à couleurs par sommet : 4 appels de rendu au plus pour le joueur.
- **Une silhouette par ennemi** (`src/render/enemies.ts`) : fantôme à traîne, guêpe ailée, brute cornue aux poings, cristal gardien à éclats, chauve-souris, crapaud cracheur, mère pustuleuse, golem de pierre, faucheur à la faux. Yeux clairs et détails sombres bakés dans la géométrie (multiplicateur de la couleur d'instance) : flash blanc, or des élites et instancing inchangés.
- **Monde** (`src/render/decor.ts`) : deux essences d'arbres (sapin étagé, feuillu), 700 touffes d'herbe autour des bois, lanternes sur pied avec halo au sol, lucioles la nuit, sol en herbe bruitée (brins, mottes, cailloux, fleurs) sur un damier discret.
- **Tenues** : une tenue alternative par personnage (Lagune, Minuit, Marécage, Aurore, Cendre, Marine, Givre, Deuil, Foire), **400 or**, choisie sous la grille des personnages ; aperçu du menu et partie dans la tenue choisie ; dans la sauvegarde (`outfits`, `outfit`).
- `npm run portraits` (`--outfit`) et `npm run bestiary` : gros plans de chaque personnage et de chaque ennemi dans `docs/captures/phase-7/`.

### Modifié

- Primitives instanciées en masse à 5 segments : 20 appels de rendu et 87 k triangles à 400 ennemis (budgets ≤ 40 et < 150 k).
- Captures store régénérées.

## 1.1.0 — 3 nov. 2026 (phase 6 « Personnages »)

Neuf personnages qui changent la façon de jouer, débloqués par succès, or ou défi (PLAN.md §3.5 et phase 6, `docs/PHASE6-PERSONNAGES.md`).

### Ajouté

- **Six personnages** : **Veilleuse** (Halo, +20 PV ; Braise : le Halo grandit de 10 % par minute, jusqu'à +50 % ; 800 or), **Braconnier** (Boomerang niveau 2, +10 PV ; Rapporteur : un boomerang attrapé rend 60 % de sa recharge ; 1 200 or), **Sapeur** (Mines, −20 % PV, un peu plus lent ; Démolisseur : chaque atterrissage pose une mine ; succès « Gardienne tombée »), **Feu follet** (Orbe, +30 % vitesse, −50 % PV ; Traînée : dash deux fois plus long qui laisse des plaques de feu ; défi « Intouchable »), **Revenante** (Foudre et Halo, −55 % PV, un peu plus lente ; Déjà morte : une Réanimation gratuite, ×2 XP sur les kills en l'air ; succès « Aube »), **Colporteur** (Lames niveau 2, +15 PV, Trèfle et Bourse au départ ; Marchand : les coffres donnent toujours au moins 3 cartes ; 2 000 or).
- **Passifs signature** pour le Bûcheron (Fendeur : les Lames repoussent 50 % plus fort) et la Vieille sorcière (Paratonnerre : la Foudre frappe d'abord le plus proche). L'Éclaireuse reste la référence d'équilibrage, inchangée.
- **Achat de personnages en or** depuis la grille du menu (bouton sur la carte, gris tant que l'or manque) ; les personnages achetés sont dans la sauvegarde (`bought`).
- **Trois défis** sur un seul run, avec barres comme les succès : Intouchable (sans dégât pendant N minutes), Marathon (distance parcourue), Métamorphe (évolutions dans un run). Compteurs dans la méta (`noHitBest`, `distanceBest`, `evoRunBest`).
- Grille de neuf cartes : trois colonnes sur PC, rangée à crans qui défile au doigt sur téléphone ; ligne d'information (stats et passif du personnage choisi) sous la grille.
- `npm run sim -- --character <clé>` pour les neuf ; ligne « défis » dans le résumé (part des runs qui les atteignent).

### Modifié

- Équilibrage par simulation (100 runs du bot `average`, référence Éclaireuse p50 7:52) : les huit autres personnages entre 5:59 et 10:52 de survie médiane, 3 à 13 % de morts avant 3 min (`docs/GATES.md`). L'Éclaireuse est bit-identique à la 1.0.0.
- « Vaincs un boss » débloque le Sapeur, « Aube » la Revenante (ils ne débloquaient rien).
- « Il te manquait X pour… » ne considère que les succès de survie.
- `debug.kill()` met les PV très négatifs : la Sève vive annulait la mort entre deux steps (tests).

## 1.0.0 — 3 nov. 2026

Première version complète : les cinq phases de PLAN.md. Jouable sur https://ruee-nocturne.web.app, installable (PWA), hors ligne, en français et en anglais. Aucune donnée ne quitte l'appareil.

### Phase 5 « Finition et sortie »

#### Ajouté

- **Localisation français / anglais** : `src/i18n/fr.json` et `en.json` (≈ 220 clés), `t()` avec pluriels et formats de nombres par langue, réglage « Langue : auto / français / anglais » dans les réglages, appliqué à chaud (menu, HUD, cartes, écran de mort, boutique, succès). La langue suit le navigateur par défaut et survit à « Tout effacer ». La sim ne porte plus aucun texte : noms et descriptions vivent côté UI (`src/ui/cards.ts`), la sim ne manipule que des clés (`ENEMIES[].key`, identifiants d'armes, de passifs, de personnages, de succès).
- **Page « À propos »** (`/a-propos/`, lien au menu et dans les réglages) : pitch, captures, comment jouer, comment installer, confidentialité, crédits ; bilingue, précachée.
- `PRIVACY.md` (aucune donnée collectée) et `CREDITS.md` (bibliothèques, polices, références de ton) ; `README.md` de projet ; `docs/DEVICES.md` (appareils, protocole de test, bugs P0/P1).
- Captures store 1080×1920 et 1920×1080 dans `docs/store/` (`npm run store`), captures du manifest rafraîchies, icône 1024.
- Release GitHub automatique sur tag `v*` (`.github/workflows/release.yml`) : archive du build et notes extraites de ce journal. Version unique lue dans `package.json`.
- `npm run lh` : Lighthouse mobile reproductible (3 runs, médiane, seuils de la porte) ; la CI est désormais **bloquante** sur perf ≥ 85, accessibilité ≥ 90, PWA 100.

#### Modifié

- **Lighthouse perf mobile 70 → 98** (médiane de 3 runs, TBT 1,8 s → 10 ms, FCP 2,2 s → 0,65 s) : le module de rendu (three + `src/render`, 148 ko gzip) est un chunk séparé, téléchargé dès le HTML (`modulepreload`) mais évalué et construit à la **première interaction** du joueur ; shaders compilés en parallèle (`compileAsync`) ; le bundle principal passe à 34 ko gzip. « Jouer » affiche « Chargement… » si le joueur devance le module, « Réessayer » si le réseau est coupé au tout premier lancement.
- **Polices auto-hébergées** (Lilita One, Rubik variable ; SIL OFL ; 46 ko) : plus de CSS bloquante venant de Google Fonts, polices disponibles hors ligne, accessibilité Lighthouse 90 → 98 avec le retrait de `user-scalable=no` (le zoom reste bloqué par `touch-action: none` et `gesturestart`).
- La méta est lue en synchrone depuis `localStorage` au démarrage (record, or, personnages justes dès le premier affichage), IndexedDB confirme ensuite ; les cartes de personnages par défaut sont dans le HTML : plus de décalage de mise en page au chargement.
- `__game.ready` attend la scène et la méta (les tests ne couraient plus contre IndexedDB).

#### Corrigé

- **Téléphone : les écrans ne défilaient pas au doigt** (menu, réglages, boutique, succès ; retour de Jimmy sur iPhone). Le blocage du défilement et du zoom (`touchmove` annulé pour tout le document) ne s'applique plus qu'au jeu ; dans un écran, seul le pincement est annulé. Les longs panneaux sont centrés par `margin: auto` au lieu de `place-items: center`, qui coupait leur haut. L'onglet perf laisse passer les gestes. Test e2e `scroll.spec.ts` (touches réelles via CDP).
- Les chiffres de dégâts ≥ 40 (classe `big`) héritaient du style des gros boutons du menu (fond doré, bordure, ombre) et s'affichaient en pastilles jaunes géantes à chaque coup de Foudre ou de Nova ; le style des boutons est désormais limité aux `button.big`.
- Le menu ne s'affiche plus en français avant d'être traduit chez un joueur anglophone (classe `lang-pending` posée par un script inline, levée par le script principal) : plus de décalage de mise en page.

### Phase 4 « Méta et rétention »

La boucle méta de PLAN.md §2.4 : chaque run laisse une trace visible (or, succès, déblocages) et la sim reste pure, la méta n'y entre que par des options à la création du monde.

#### Ajouté

- **Personnages** (PLAN §3.5) : Éclaireuse (le joueur de la phase 3 : +15 % de vitesse, dash court, Orbe), Bûcheron (+30 PV, Lames de départ à portée +20 %, débloqué en survivant 10 min), Vieille sorcière (Foudre dès le départ, −20 % PV, débloquée à 500 kills cumulés). Cartes de sélection sur le menu, condition affichée sur les verrouillés.
- **Boutique** permanente (or) : 8 lignes × paliers à coût géométrique (40 · 1,6^palier) : Vitalité, Puissance, Foulée, Chance, Cupidité, Aimant, Cadence, Réanimation (seconde chance à 50 % des PV avec 2 s d'invulnérabilité, 2 paliers max). Accessible depuis le menu et l'écran de mort.
- **Succès** avec barres de progression (11) : survie 3 / 10 / 15 / 20 min, 100 Dards, 10 élites, un boss, une évolution, 500 / 2 000 kills, victoire. Déblocages : défi du jour (3 min), Bûcheron, Sorcière, Boomerang (100 Dards), Mines (10 élites). Le premier arrive au premier run de 3 min.
- **Écran de mort riche** : or du run, « il te manquait 0:42 pour « Dix minutes » », succès débloqués, les 3 succès les plus proches avec barres, bouton Boutique.
- **Défi du jour** : seed = hash de la date UTC (même run pour tout le monde), Éclaireuse sans boutique (égalité), classement local des 10 meilleurs temps, meilleur temps sur le bouton du menu.
- **Réglages** (menu et pause) : son, vibrations (coup reçu, boss, réanimation ; tactile seulement), effets réduits, **gaucher** (SAUT et DASH à gauche), taille du HUD (petit / normal / grand), **export / import** de la sauvegarde (fichier JSON + zone de texte, validation stricte), effacement en deux appuis.
- Sauvegarde **v2** avec migration depuis v1 (record, runs, kills, son, effets conservés), `normalizeMeta` qui borne et type tout ce qui entre (import compris).
- Outils : `npm run sim -- --character bucheron|sorciere`, hooks `__game.meta` / `__game.setMeta`, tests e2e nouveau joueur, boutique, export/import, personnage, mode gaucher ; 18 tests Vitest de méta et d'options de monde (101 au total).

#### Modifié

- `PLAYER.speed` devient la vitesse de base des personnages lourds (5,39) ; l'Éclaireuse ×1,15 = 6,2 est inchangée par rapport à la phase 3, la porte de phase 3 reste mesurée telle quelle (sans option, `World` est identique).
- `Player.dashTime` par personnage ; `Ev.Revive`.

### Phase 3 « Contenu et équilibrage »

Tout le contenu V1 de PLAN.md §3 (hors personnages, phase 4), équilibré par simulation : les 8 cibles de `survivor-design` §9 sont atteintes sur 200 runs du bot `average` (seed 42).

#### Ajouté

- Armes : **Boomerang** (part devant toi, revient, touche à l'aller et au retour ; deux au niveau 5) et **Mines** (posées sur ton passage, explosent au contact ; chaîne au niveau 5). Six armes, grammaire portée / ciblage / rythme distincte.
- Évolutions (arme au niveau 5 + passif associé + un coffre, ≈ ×2,5 mesuré) : **Nova** (Orbe + Gants lourds : salve circulaire de 8 orbes), **Soleil noir** (Halo + Cœur de pierre : rayon ×1,5, dégâts ×2, +1 PV par kill), **Tempête** (Lames + Semelles de vent : rayon ×1,5, vitesse ×2), **Orage** (Foudre + Sablier fêlé : cadence ×2, chaîne +2). Bannière, shake, son, visuel agrandi.
- Passifs **Trèfle** (+6 %/niveau de 4e carte, coffres plus généreux) et **Bourse** (+25 % d'or) ; compteur d'or (1/kill, ×3 élite, ×20 boss, + secondes/10) affiché à l'écran de fin, en attendant la boutique de phase 4.
- Ennemis : **Volant** (plane hors de portée, télégraphe par son ombre, plonge ; sauter au bon moment l'évite), **Cracheur** (garde 7–9 m, ligne de visée 0,6 s, crachat lent au sol), **élites** dorées (×6 PV, ×3 XP, anneau au sol, coffre) toutes les 40 s après 2:00.
- Boss scriptés (2 attaques télégraphiées + phase à 50 % PV) : **Gardien** (charge en ligne après recul et rugissement), **Essaim-mère** à 10:00 (pond des Dards, pulse), **Colosse** à 15:00 (cercles rouges 1 s puis explosion). Nom du boss dans la barre, coffre de 3 à 5 cartes à la mort.
- **Faucheur** à 20:00 : plus rapide que toi, 40 000 PV, fin de run forcée ; s'il meurt, écran « Victoire ».
- **Coffres** : 1 / 3 / 5 cartes (70 / 25 / 5 %, décalés par le Trèfle), bannière « Coffre : n améliorations », évolution garantie en première carte quand elle est disponible.
- Terrain : 3 **lacs** (vitesse ×0,55 au sol, Volant et Faucheur ignorent) et 4 **bois denses** (arbres ×3 avec un couloir annulaire), générés par la seed de décor ; **cycle de lumière** crépuscule → nuit (8:00) → aube (20:00).
- Rendu : 9 silhouettes d'ennemis instanciées, ombres des Volants, lignes de visée, cercles rouges qui se remplissent, crachats, boomerangs, mines, coffres, lacs ; nouveaux sons (coffre, évolution, rugissement, crachat, plongée, lancer, explosion).
- Outils : bots qui sautent au Volant, esquivent les cercles et vont aux coffres (greedy de loin) ; CLI avec taux de pick par part de prises, évolutions par run, kills@10 par build et écart inter-builds ; cibles « pick max ≤ 35 % » réelle et « variance < 3× » ; `debug.evolve`, `debug.chest`, `debug.teleport` ; 21 tests de contenu (83 au total).

#### Modifié

- `balance.ts` (équilibrage par simulation, avant → après sur 200 runs average) : survie p50 4:33 → 9:52 (seed 43 : 9:43), fin atteinte 0 → 8–10 %, morts < 3 min 13 → 5 %. Réglages : part de Brutes 8 % + t/3000, `hpScale` 1 + t/150, `dmgScale` 1 + t/450, anneaux de Dards après 7:00, montée du spawn après 10:00 divisée par 260, Colosse lent (1,2) avec cercles à 9 dégâts toutes les 4,5 s, Lames à 1,8 + 0,15·lv de rayon (un Dard collé passait sous l'anneau). Marge de maîtrise : naive p50 2:30, greedy 15:14 (16 % de Faucheur).
- `Ev.Kill` porte le drapeau élite ; `Ev.BossSpawn` porte le type ; `Enemy.y` est la hauteur courante (Volant) ; `World` expose `shots`, `chests`, `lakes`, `woods`, `evolved`, `gold`, `treeCount`.

### Phase 2 — correctifs

#### Modifié

- Musique procédurale à 3 couches retirée à la demande de Jimmy (« pas ouf ») ; tous les effets sonores restent. Le bus musique est conservé pour de vraies pistes CC0 (phase 5, `CREDITS.md`).

- Taille du rendu vérifiée à chaque frame et sur `visualViewport` / `orientationchange`, pas seulement sur `resize` : sur l'appareil de Jimmy ouvert au lancement, l'image restait écrasée ou étirée (taille de viewport figée avant la première frame).

- Squash & stretch retiré à la demande de Jimmy (iPhone : ennemis et joueur « écrasés ou étirés ») : plus d'étirement ni d'écrasement des ennemis, du joueur en saut ou à l'atterrissage, ni de grossissement au coup. Le code reste, les valeurs sont neutres dans `src/render/feel.ts` ; le coup se lit au flash blanc, aux particules et au chiffre. Le pop des gemmes et l'écrasement au tir (phase 1) sont conservés.

### Phase 2 « Game feel »

Application de la checklist du skill `game-feel` : chaque coup porté produit flash, recul, son, chiffre et particules. `src/sim/balance.ts` intact ; les constantes de ressenti vivent dans `src/render/feel.ts`.

#### Ajouté

- Hit-stop borné (`HitStop`) : 40 ms à 0,15× par kill, 120 ms par boss, 60 ms à 0,3× quand le joueur est touché ; durée max 120 ms, jamais relancé pendant un hit-stop, 250 ms entre deux. À 400 ennemis le temps de jeu avance à ≥ 88 % du temps réel (15 % en phase 1). Testé en Vitest ; l'onglet perf affiche `temps ×…` (temps de jeu / temps réel) et l'état du hit-stop.
- Squash & stretch : ressort d'atterrissage du joueur (0,85 → rebond, 120 ms), étirement vertical en saut, écrasement au tir ; ennemis étirés vers leur déplacement (1,1×), flash blanc + 1,18× au coup ; apparition des gemmes 0 → 1,3 → 1 en 120 ms ; les Dards pointent enfin vers le joueur.
- Table de particules du skill (pool unique, cap 500, remplacement de la plus ancienne) : gerbe de la couleur de l'arme orientée comme le recul à chaque coup, 7 au kill, 50 (ennemi + or) pour une Brute, 80 pour le boss, poussière à l'atterrissage, 1 particule crème par frame en dash, anneau de 30 à la montée de niveau.
- Traînées : silhouette fusionnée du joueur en 6 fantômes additifs pendant le dash (1 draw call), lames orbitales en `InstancedMesh` avec 3 fantômes chacune (6 draw calls → 2), projectiles inchangés (4 fantômes or → rouge).
- Caméra : zoom-out progressif de 8 % sur 15 min, recul de 10 % pendant un boss, shake borné à 0,6 u en bruit 2D continu (joueur touché 0,25 ; élite et apparition du boss 0,4 ; boss vaincu 0,6).
- Chiffres de dégâts : pop 1,35 → 1 interpolé sur 100 ms, fondu sur 250 ms, doré au-dessus de 40 ; les coups d'une même frame à moins de 1,5 u fusionnent (somme) pour rester lisibles et borner les écritures DOM.
- Audio : pool de 24 voix à priorité (joueur touché > niveau > boss > kill > hit > ramassage ; la voix la moins prioritaire est coupée), 4 variantes de hit à ±8 %, son de combo + accord à partir de 5 kills en 1 s, « whoosh » à la reprise après une carte, son de sélection distinct par type de carte, musique à 3 couches (nappe, rythme à 2,2 Hz, intensité) dont le gain suit `min(1, ennemis / 120)` et vaut 1 pendant un boss — tout en LFO natifs, aucun timer JS.
- UI : balayage blanc de la barre d'XP à chaque gain notable, flash de la carte choisie, flash d'écran doré au boss vaincu, compteur de kills sans `setTimeout`.
- Mode « réduction des effets » complet : shake 0, particules ÷2, hit-stop coupé, flashs d'écran atténués, fermeture immédiate des cartes ; `prefers-reduced-motion` l'active par défaut tant que le joueur n'a pas touché au réglage (`Meta.fxChosen`).
- Clavier : touches 1-3 pour choisir une carte (parité avec le tap ; les `kbd` étaient affichés mais pas câblés).
- Debug : `weak(type, dist, hp)`, `pullBoss(dist)`, `speed(s)` (0 fige la boucle pour les captures) ; captures `kill-elite`, `levelup-feel`, `boss` dans `e2e/shots.spec.ts`.

#### Modifié

- `Ev.Hit` porte la source du coup (`HitSrc` : Orbe, Halo, Lames, Foudre) et la direction du recul ; `Gem.age` ; `ELITE_TYPE` (Brute) dans `balance.ts`.
- Relecture perf : `stats(lv)` des armes mémoïsées (plus de littéral par step ni par frame), éclairs copiés sans `subarray`, opacité des chiffres écrite seulement en fondu.
- Playwright : `PW_PORT` pour choisir le port du preview (un preview étranger sur 4173 faisait tester un build obsolète).

### Phase 1 « Cœur jouable »

Le portage du prototype était déjà dans la base v0.1 : cette phase instrumente et outille pour mesurer la porte (60 fps à 400 ennemis sur téléphone, `npm run sim -- --runs 100`, couverture sim ≥ 80 %). Aucun changement de gameplay, `src/sim/balance.ts` intact.

#### Ajouté

- Onglet perf : fps réels (frames rAF sur 2 s) en tête, temps JS renommé `js p50/p95`, lisible sur mobile ; bouton « Perf » dans l'écran de pause (parité F3 / tactile).
- Mode stress `?debug=1&stress=400` : 400 ennemis maintenus, joueur invincible, onglet perf ouvert ; test e2e `stress.spec.ts` (≥ 380 ennemis, draw calls ≤ 40, triangles < 150 k) et captures `shots/*-stress.png`.
- Bots de playtest alignés sur `sim-testing` §2 : `average` (dash à ≥ 6 ennemis au contact), `greedy` (gemmes à 14 u, pick sans aléa), options de `makeAverage`.
- CLI de simulation : `--weapons orbe,foudre` (arme de départ et cartes restreintes à la liste, clés validées), `--weapons` dans l'en-tête, ligne « cibles non atteintes : attendu avant la phase 3 » ; `pickAllowed`/`enforceAllowed` testables.
- Tests Vitest des bots (`tools/bots/bots.test.ts`) : déterminisme, naive ≤ average, filtre d'armes, entrées bornées ; `test.include` étendu à `tools/**`.

#### Modifié

- Délai Vitest porté à 30 s : sous `--coverage` la sim instrumentée est ~6× plus lente.

### Phase 0 « Fondations »

#### Ajouté

- Dépôt GitHub, CI (lint, typecheck, tests avec couverture, build, bench, Playwright, Lighthouse) et déploiement Firebase Hosting (live sur `main`, preview par PR).
- PWA installable : manifest complet, icônes générées depuis `assets/icon.svg`, service worker Workbox avec précache de l'app shell, jouable hors ligne au second lancement, bannière « Nouvelle version disponible » au menu et à l'écran de mort.
- ESLint (flat config) + Prettier, hooks Git (`pre-commit` : lint, typecheck, tests).
- Playwright : fumée WebGL (desktop et iPhone 13 tactile), joystick et saut au doigt, relance < 2 s, captures d'écran.
- Hooks de debug `window.__game` (avec `?debug=1`) : `warp`, `kill`, `give`, `spawn`, `god`, `levelUp`, `seed`.
- Onglet perf (F3) : p95 glissant sur 2 s et nombre de voix audio.
- Tests de simulation : armes, passifs, spawner, combat, cartes, rng (couverture `src/sim/` 79 % → 95 %, seuil 80 %).

#### Modifié

- TypeScript 7.0 (port natif) → 6.0 : l'outillage ESLint a besoin de l'API compilateur JS.
- CI sur Node 22 (Vite 8 exige ≥ 22.12).

## 0.1.0 — 2 nov. 2026

Base v0.1 : simulation déterministe à pas fixe, rendu Three.js instancié, entrées clavier/tactile/manette, audio procédural, HUD, sauvegarde méta, CLI de simulation d'équilibrage et bench.
