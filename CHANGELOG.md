# Journal des modifications

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : [SemVer](https://semver.org/lang/fr/).

## 1.68.0 — 20 nov. 2026 (le Cœur de la Nuit)

Le monde 3 n'est plus la fin : un portail rouge mène au boss final.

### Ajouté

- **Le Cœur de la Nuit, le boss final** : quand le boss du monde 3 tombe, le monde est gagné, le chrono tombe à 0 et un portail rouge s'ouvre vers l'Arène, une petite arène ronde fermée par un cercle de flammes. Le Cœur de la Nuit y sort au centre, avec ses quatre phases, chacune annoncée par une bannière qui dit quoi faire :
  - **le souvenir** : il reprend la charge du Gardien, la salve de l'Essaim-mère et les cercles du Colosse, une par une ;
  - **les sceaux** : à 70 %, il devient invulnérable derrière quatre stèles violettes ; chacune brisée lui retire une part de sa vie, et des monstres corrompus arrivent pendant ce temps ;
  - **l'éclipse** : à 40 %, l'Arène s'assombrit, le cercle de flammes se resserre et brûle, et deux doubles l'entourent : seul le vrai a les yeux qui brillent ;
  - **la fureur** : à 15 %, ses attaques s'enchaînent et il lance le Jugement : toute l'Arène devient rouge, sauf une zone de lumière où courir à temps.
- **La victoire, la vraie** : le vaincre donne de l'or, le succès « Aube » et ouvre le monde infini, où la nuit corrompt les monstres comme en prolongation.
- **Comment jouer** explique le passage vers l'Arène et ses phases.

### Modifié

- **Le monde 3 vaincu reste une victoire** : statistique, succès et classement la comptent dès que son boss tombe, même si le Cœur de la Nuit gagne ensuite. L'écran de fin dit alors à quelle phase il t'a vaincu.
- **Le monde infini commence après le boss final**, et il a maintenant des monstres corrompus. Celui du défi du jour ne change pas.
- L'ancien succès « Aube » (terminer les trois mondes) s'appelle désormais « Trois mondes ».

### Technique

- Spec : `docs/specs/boss-final.md` (scénarios : `src/sim/final.test.ts`, `src/sim/final-golden.test.ts`, `src/meta/outcome.test.ts`, `e2e/boss-final.spec.ts`, `tools/final.test.ts`). À compléter avec la mesure.

## 1.67.0 — 19 nov. 2026 (monstres corrompus)

Après la fin du chrono, chaque monde devient une autre partie : la nuit corrompt les monstres.

### Ajouté

- **Monstres corrompus** : en prolongation, dans les trois mondes, des monstres teints de violet, aux yeux qui luisent, apparaissent parmi la horde : un sur dix au début, jusqu'à quatre sur dix au bout de 3 minutes. Chacun a sa compétence, toujours annoncée avant de toucher : le Spectre se scinde en deux petits spectres à sa mort, le Dard charge après un couloir rouge, la Brute laisse des flaques de feu derrière elle, le Volant lâche une bombe sous toi, le Cracheur crache en éventail, l'Archer tire une volée de trois flèches rapides et le Sorcier fait tomber trois boules de feu autour de toi. Plus dangereux, ils rapportent plus d'or et d'XP (les petits spectres, rien).
- **Une consigne** les présente la première fois que tu en croises un, et « Comment jouer » les décrit.

### Technique

- Spec : `docs/specs/corrompus.md` (scénarios : `src/sim/corrupt.test.ts`, `src/meta/corrupt-hint.test.ts`, `e2e/corrompus.spec.ts`, `tools/corrupt.test.ts`). Réglages `CORRUPT` (`balance.ts`), module `src/sim/corrupt.ts` ; tirage par `w.rng` seulement en prolongation (`corruptOn` : ni défi du jour, ni monde infini) ; Ruée par la charge des Brutes élites (`chargeOf`), flaques `ShotKind.Flame`, tirs marqués de leur compétence (`Shot.skill`), cause de mort `HurtSrc.Corrupt` + `w.hurtSkill`, événement `Ev.Corrupt`. Rendu : couleur d'instance, aura et yeux dans l'écrivain des lueurs, traînée dans le pool de particules : aucun appel de dessin de plus. Consigne `Hint.Corrupt` (bit 6). CLI : `--no-corrupt`, ligne « corrompus » (causes de mort en prolongation par compétence) ; `tools/sim-pool.mjs` les regroupe ; le bot esquive la Ruée et les flaques.
- Équilibrage (règle 13), bot moyen, 4 graines × 200 regroupées, avec et sans corrompus : victoires maxé 17,0 → 16,6 %, nu 22,5 → 23,8 % ; bot qui reste en prolongation (`BOT_FARM=1`) : tenue p50 maxé 102,5 → 92,5 s, nu 85,6 → 76,9 s, compétences corrompues 24,0 % et 22,8 % des morts en prolongation ; bot qui farme 60 s puis passe (`BOT_FARM=60`, maxé, 2 graines) : victoire 17,8 → 16,0 %, or gardé à la victoire +19 %, pas de boule de neige ; partie guidée inchangée (97,1 / 73,0 / 70,9 / 1,0 %) ; défi du jour identique au bit près (40 défis, 0 champ différent sur 2 440), parties sans corrompus identiques à la 1.66.0. Réglages retenus après trois essais : Traînée 6 PV/s toutes les 1 s, Pluie de feu ×0,45, Volée ×0,6 à ×1,25. Une victoire en prolongation rend ordinaires les corrompus vivants (`clearCorrupt`) ; les éclats de la Scission ne comptent pour rien ; la consigne des corrompus n'écrase jamais une autre consigne (`hintRank`). Le monde infini garde ses règles, mais la partie qui y arrive a pu croiser des corrompus : maxé tenu p50 3:20 → 2:58. Détail dans `docs/GATES.md`.

## 1.66.0 — 19 nov. 2026 (partie guidée v2, chrono du totem)

La partie guidée te fait vraiment tout essayer, et son boss devient un vrai combat : si tu le bats, la suite t'attend.

### Ajouté

- **Deux tomes pour commencer** : dans la partie guidée, ta première montée de niveau te fait prendre le Tome des dégâts, la deuxième le Tome des projectiles. Les autres cartes restent visibles, éteintes. Ensuite tu choisis librement ; les autres tomes arrivent dès la partie suivante.
- **Le portail dans la partie guidée** : si tu bats le Gardien, un ralenti te montre le portail, tu entres dans le monde 2 et la partie continue. À la fin, la feuille « À toi de jouer » salue ta victoire.

### Modifié

- **Quand le boss du totem meurt, le chrono tombe à 0** : le monde passe aussitôt en prolongation, la horde grossit jusqu'à ce que tu passes le portail, et le temps qui restait est perdu. Le totem s'active toujours quand tu veux, et le chrono continue pendant le combat : attends la fin pour vaincre son boss. Le défi du jour et le monde infini ne changent pas.
- **Crâne et totem de boss, pour de vrai** : la partie guidée te demande de les activer, et une bannière redit leur effet.
- **Le totem du monde attend son tour** dans la partie guidée : il est montré, mais ne s'active qu'à 2 minutes de la fin, pour le dernier défi de la partie.
- **Le Gardien de la partie guidée** est un boss normal, plus un boss imbattable : à toi de le battre.

### Technique

- Spec : `docs/specs/tutoriel.md`, révision 1.66.0, décisions 13 à 18 (scénarios : `src/meta/tutorial.test.ts`, `src/sim/stages.test.ts`, `e2e/tutoriel.spec.ts`, `e2e/stages.spec.ts`, `tools/tutorial.test.ts`). Tomes imposés : `TUTORIAL.tomes` (`degats`, `projectiles`), rien d'imposé quand les emplacements sont pleins (partie reprise), les autres tomes écartés du tirage de la partie guidée avant tout tirage, la carte imposée mise en tête sans tirage (`imposeTome`) et, à la première feuille, rendue rare (`tutorialRare`), `tutorialLock` (la simulation refuse toute autre carte : bot, clavier et doigt ; pas de relance d'une feuille imposée). Crâne et totem de boss franchis sur `Ev.SkullOn` et `Ev.BossTotemOn` seulement (déjà activés avant l'étape : elle passe), bannière à deux lignes. Totem du monde verrouillé avant `TUTORIAL.forceAt` dans la partie guidée (`totemLocked`, `guideTotemWait` pour la ligne « Pas encore »). Boss du totem normal : `TUTORIAL.bossHp`, `bossDmg`, `bossCadence` retirés, le boss et ses doubles sans `TUTORIAL.dmg` (`dmgMulNow`). Feuille de fin : texte de victoire si le boss est tombé (`tuto.end.win`). Décision 18 : `stageBossDown` avance `stageT` jusqu'à `STAGE.dur` à l'ouverture du portail (`skipStageTime` : vagues, élites, éruptions, bonus de carte et départ du marchand décalés d'autant, passages du marchand sautés perdus ; prolongation au pas suivant, `Ev.TimeUp` x2 = 1, bannière avec la ligne du portail) ; la partie guidée ne tient plus son chrono une fois le portail ouvert. CLI : `--tutorial` va jusqu'au portail (`tutoBossKill`, `tutoKillTime`, `tutoPortal`), le bot prend les tomes imposés et reste dans le crâne et le totem de boss ; cibles `PROFILES.tutorial` de la décision 17 ; `tools/sim-pool.mjs` regroupe aussi `tutorial`. Bot : totem à 7:30 (`BOT_TOTEM_AT` 450, 6:00 avant).
- Équilibrage (règle 13), bot moyen, 4 graines × 200 regroupées : partie guidée, boss atteint 97,1 %, abattu par 73,0 % de ceux-là, portail 70,9 % des parties, morts avant 5:00 1,0 % (`TUTORIAL` inchangé). Parties normales avant / après (même graines, bot au totem à 6:00 puis 7:30) : maxé monde 2 73,5 → 69,3 %, victoire 23,9 → 17,0 % ; nu monde 2 32,0 → 33,6 %, victoire 22,1 → 22,5 %, boss du totem en vie p50 35 → 26 s, monde infini tenu p50 6:39 → 7:35 ; parties adoucies : morts avant 3 min 17,9 % (inchangé). Le monde infini d'après une victoire normale change ; seule la suite du défi du jour reste identique au bit près. Détail dans `docs/GATES.md`.

## 1.65.1 — 19 nov. 2026

### Modifié

- **Première ouverture du jeu** : l'écran « Comment jouer » montre d'abord les touches. On en sort seulement par « Jouer », qui lance la partie guidée.

### Technique

- Aide du premier lancement obligatoire pour un nouveau joueur (`tutorialDue`) : flèche retour, Échap et « Rejouer la partie guidée » masqués, focus clavier sur « Jouer » ; `seenHelp` passe à vrai quand on le presse. Spec `docs/specs/tutoriel.md` : décision 1 et scénarios mis à jour, un scénario ajouté (Entrée au menu après l'aide) ; e2e `tutoriel.spec.ts`, `touch.spec.ts`.

## 1.65.0 — 19 nov. 2026 (partie guidée)

Ta toute première partie te guide pas à pas dans le monde 1 : tout le jeu s'apprend en jouant, jusqu'au boss du monde.

### Ajouté

- **Partie guidée** : un nouveau joueur commence par elle en touchant « Jouer ». Une consigne à la fois, en haut de l'écran, avec le bouton à toucher sur téléphone ou la touche à presser au clavier, et une flèche vers ce qu'il faut voir. Chaque geste attend que tu le fasses : se déplacer, laisser ton héros tirer tout seul, ramasser les cristaux, sauter par-dessus une onde (au ralenti), glisser, sauter en pleine glisse, lancer ton sort.
- **Les cartes expliquées** : à ta première montée de niveau, la feuille t'explique ce qu'est une arme, un tome, et ce que disent les couleurs (commune, rare bleue, épique or). Elle propose toujours au moins une carte rare.
- **Les lieux du monde montrés un par un**, tout près : un coffre (ouvert gratuitement cette fois), un sanctuaire, une course, un crâne, un totem de boss et le totem du monde. Crâne et totem de boss sont seulement montrés : à toi de choisir.
- **Seul ensuite**, avec une indication la première fois que tu croises un bonus au sol, une élite, un boss de survie ou le marchand. À deux minutes de la fin, une flèche te mène au totem rouge et le chrono t'attend à 0:30.
- **« À toi de jouer ! »** : le boss de la partie guidée est volontairement trop fort. Après lui, une feuille te dit pourquoi, et tu gardes l'or de la partie avec une prime de fin de guide.
- **Le portail et le monde 2 expliqués** la première fois que tu les vois, dans les parties suivantes.
- **Rejouer la partie guidée** depuis « Comment jouer », et **la passer** depuis la pause. Fermée en cours de route, elle reprend à son étape.

### Modifié

- **Premières parties** : la partie guidée remplace l'écran « Comment jouer » du premier lancement et la découverte des systèmes partie après partie. Après elle, tout est disponible, et les deux parties suivantes restent un peu plus douces.
- **Rien ne change pour les joueurs qui ont déjà joué** : ils ne voient ni la partie guidée ni ses indications.

### Technique

- Spec : `docs/specs/tutoriel.md` (15 scénarios : `src/meta/tutorial.test.ts`, `e2e/tutoriel.spec.ts`, `tools/tutorial.test.ts`). Sim : `WorldOptions.tutorial` et `TUTORIAL` (`balance.ts`) seulement : carte `TUTORIAL.map` (1825, lieux près du départ), horde légère jusqu'à 5:00 (`spawn`), monstres du monde 1 adoucis (`hp`, `dmg`), horde éclaircie (`wait`) et chrono tenu à 0:30 (`hold`) de 8:00 à l'activation du totem, sans prolongation ni rappel, boss du totem renforcé (`bossHp`, `bossDmg`), premier coffre de carte gratuit (`freeChests`), première feuille de niveau avec au moins une carte rare (ligne ajoutée sans tirage : l'état de `w.rng` est inchangé). `WorldOptions.soft` : les parties adoucies (`FIRST_RUNS`) deviennent les deux qui suivent la partie guidée (`FIRST_RUNS.afterTutorial`). Guide : automate pur `src/meta/guide.ts` (étapes franchies sur les événements de la sim, étapes « à voir » sur un délai, consignes de première apparition en bits), affichage `src/ui/tutorial.ts` (nœuds de `index.html` créés une fois, textes réécrits au changement d'étape, flèche écrite quand elle bouge, ralenti ×0,3 sur l'accumulateur de la boucle, coupé par « Effets réduits »), projection `GameScene.project`. Méta : `tutorial`, `softLeft`, `hints`, propres à l'appareil (`DEVICE_KEYS`) ; une sauvegarde ou une progression du nuage avec des parties jouées ne la propose jamais ; fin : `tutorialEnd` (or + `TUTORIAL.gold` la première fois, ni série, ni record, ni succès, ni classement), `tutorialSkip`. Partie gardée : l'état du guide dans `SavedRun.guide`. CLI : `--tutorial` (le bot fait les gestes et va aux lieux demandés par le même automate, puis au totem à 8:00), cibles `PROFILES.tutorial`. Crochets : `startTutorial()`, `guide`, `guideStep(n)`, `tutoScale`. Sous `?debug=1`, « Jouer » ne lance la partie guidée qu'avec `tuto=1` (comme l'aide avec `help=1`).
- Équilibrage (règle 13), bot moyen, 4 graines × 200 parties guidées regroupées : boss atteint 96,4 %, mort contre lui 98,7 % de ceux-là, en 39 s (médiane ; p10 12 s, p90 102 s), morts avant 5:00 1,6 %. Parties adoucies qui suivent (`--soft`, tout dévoilé) : morts avant 3 min 17,9 %, survie médiane 5:28 ; la CI les mesure avec la partie guidée à chaque pull request. Parties normales et défi du jour identiques au bit près à la 1.64.0. Détail dans `docs/GATES.md`.

## 1.64.0 — 18 nov. 2026 (défi du jour v2)

Le défi du jour devient un vrai défi : une règle qui change chaque jour, un boss final, des médailles, et la liberté de tenir aussi longtemps que tu peux.

### Ajouté

- **Règle du jour** : chaque jour, le défi se joue avec une règle, la même pour tout le monde et jamais celle de la veille. Horde rapide, Chasse aux élites, Nuée, Verre, Colosses ou Arme imposée : elle est expliquée sur la feuille du défi, annoncée au départ et rappelée dans la pause.
- **Boss final** : à 4:00, le Gardien vient te chercher, annoncé quelques secondes avant. Plus de boss de survie pendant les 5 minutes du défi : c'est lui le sommet.
- **Médailles** : bronze si tu es en vie à 5:00, argent si tu as aussi abattu le boss final, or si tu tiens en plus jusqu'à 10:00. Chaque médaille gagnée s'annonce en jeu.
- **Continuer en monde infini** : à 5:00, l'écran « Défi réussi ! » montre ta médaille et ce qui te manque pour la suivante, puis te laisse t'arrêter là ou continuer. Le boss final, s'il est encore debout, te suit ; la règle du jour aussi.
- **Ta meilleure médaille du jour** sur le bouton du défi au menu, et la médaille de chacune de tes parties sur la feuille du défi.

### Modifié

- **Score du défi** : le temps total tenu, 5:00 et la suite comprises, puis les vaincus. Le chrono du défi décompte jusqu'à 5:00, puis compte le temps total si tu continues.
- **Défi d'un ami** : il se joue avec la règle du jour de ce défi, montrée sur sa feuille.
- **Carte de résultat** : ta médaille y figure. Elle reste sur ton appareil : ni le classement entre amis ni le lien de défi ne la montrent.

### Technique

- Spec : `docs/specs/defi-v2.md` (13 scénarios : `src/meta/defi-v2.test.ts`, `e2e/defi-v2.spec.ts`, `tools/daily.test.ts`). Sim : `w.dailyRule` (index de `DAILY_RULE_KEYS`, multiplicateurs `DAILY_RULES` lus à l'apparition, au coup et à la création, `w.rule()` sans allocation), boss final (`DAILY.bossAt`, `bossHp`, `bossCadence`, compté comme boss de survie, sans Traque avant 5:00 ni rage, horde calmée comme pour le boss du totem), médailles (`w.medal`, `Ev.Medal`, `Ev.Victory` x2), suite du défi en monde infini à `DAILY.endlessDiffRate`. Méta : `dailyRule` (jamais celle de la veille), `dailyWeapon` (parmi `DAILY_ARMORY`), `Meta.daily.medals` gardées hors du nuage (`progressOf`, `keepMedals`), borne du temps du classement du jour et du lien 300 → 3 600 s (`firestore.rules`, `BOARD.dayTimeMax`). CLI : `--daily` continue toujours en monde infini, `--rule <clé>`, médailles par règle et par arme ; cibles bronze 35–65 %, argent 10–35 %, or 1–12 % (`tools/targets.ts`). Partie reprise : règle, boss final et médaille dans l'instantané ; un défi gardé avant la mise à jour reprend sans règle (`adoptDaily`). Crochet de débogage `slayBoss()`.
- Équilibrage (règle 13), Éclaireuse au kit de départ, bot moyen, 4 graines × 200 défis par règle (bronze / argent / or) : Horde rapide 40,8 / 19,9 / 2,9 % ; Chasse aux élites 39,6 / 29,0 / 5,5 % ; Nuée 47,6 / 29,1 / 6,5 % ; Verre 46,4 / 22,4 / 2,9 % ; Colosses 49,6 / 17,9 / 2,3 % ; Arme imposée 46,5 / 17,5 / 5,6 %. Avant : 49,4 % de défis réussis (lot L3), sans médailles. Réglages retenus : `DAILY.bossHp` 1,8, `bossCadence` 0,6, `endlessDiffRate` 2 ; vitesse ×1,08 ; une élite toutes les 20 s dès 0:45 ; apparitions ×1,3 et vie ×0,95 ; PV ×0,7 et dégâts ×1,1 ; vie ×1,15 et apparitions ×0,75 ; arme tirée parmi neuf (`DAILY_ARMORY`, sans la Faux, les Esprits ni la Balise : 3 à 22 % de bronze seules). Détail dans `docs/GATES.md`.

## 1.63.2 — 18 nov. 2026 (retour de Jimmy : les couleurs de rareté)

Commune, rare, épique : la rareté se voit de nouveau à sa couleur.

### Modifié

- **Cartes de niveau, coffres, marchand, sanctuaires** : chaque choix porte la couleur de sa rareté, gris clair pour commune, bleu pour rare, or pour épique, avec une barre à gauche, un fond teinté, le nom à la couleur et une étiquette pleine. Fini la petite pastille qu'il fallait chercher.
- **Bibliothèque** : l'étiquette de rareté de la fiche est pleine elle aussi, et le nom d'un objet rare ou épique que tu possèdes est à sa couleur dans la grille.

### Technique

- Spec : `docs/specs/ui-nocturne.md`, décision 14 bis et scénario « La rareté se lit à sa couleur » (`e2e/nocturne.spec.ts`). CSS (`.card`, `.rar`, `.lib.r1` / `.r2`) et une classe de rareté sur les tuiles de la Bibliothèque (`src/ui/library.ts`). Les choix restent une liste : la teinte est une image de fond, la barre une ombre intérieure, le test « Level-up cards are a ruled list » est inchangé.

## 1.63.1 — 18 nov. 2026 (retour de Jimmy : l'accueil à la verticale sur tous les écrans)

Ton héros reprend sa place à l'accueil, quel que soit l'écran tenu à la verticale.

### Modifié

- **Héros plus grand à l'accueil** sur les écrans courts ou larges tenus à la verticale (iPhone dans le navigateur, téléphone à deux écrans, téléphone déplié, tablette) : il était devenu tout petit, il occupe de nouveau le centre de l'écran.
- **Objectif et missions côte à côte** sur ces écrans plus larges : la place gagnée va au héros.
- **La lune derrière ton héros** : sur tablette et téléphone déplié elle passait derrière le titre du jeu ; elle éclaire maintenant ton héros, et le titre se lit sur le ciel.

### Corrigé

- **Petits écrans** (320 px de large, petit iPhone dans le navigateur) : « Jouer » passait sous la barre d'onglets, l'accroche tenait sur deux lignes, le titre « Bibliothèque » et le nom du héros étaient coupés, les libellés des onglets se touchaient.

### Technique

- Spec : `docs/specs/ui-ergonomie.md`, constat 8 et décisions 18 à 21 ; quatre scénarios de plus dans `e2e/ergonomie.spec.ts`. CSS seul et une enveloppe `.goalpair` (`display: contents` hors de la rangée) autour de l'objectif et des missions : aucun script, image, police ni dépendance. Part du héros dans la hauteur de l'écran : 25 → 32 % à 375 × 667, 30 → 43 % à 540 × 720, 28 → 42 % à 717 × 880, 26 → 40 % à 768 × 1024, 36 → 45 % à 820 × 1180 ; iPhone dans Safari avec l'aide d'installation (390 × 664) : 19 → 27 %.

## 1.63.0 — 18 nov. 2026 (retour de Jimmy : passe d'ergonomie de l'interface)

L'interface s'adapte à ton écran : tablette, téléphone déplié ou tenu à l'horizontale, et chaque appui répond tout de suite.

### Ajouté

- **Tablette et téléphone déplié** : tout grandit avec l'écran (textes, icônes, boutons, héros) au lieu de rester une colonne de téléphone au milieu. Les écrans intérieurs prennent la largeur, la partie aussi : chrono, minicarte et boutons de saut, de sort et de glisse plus grands.
- **Écran large** (tablette à l'horizontale, PC) : l'accueil passe en deux zones, ton héros en grand à gauche, et à droite le défi du jour, les nouveautés, ton prochain objectif, les missions du jour et « Jouer ». La Bibliothèque montre sa grille et la fiche côte à côte, les Héros leur fiche et leurs défis, les Succès et les Emplacements tiennent sur deux colonnes.
- **Téléphone à l'horizontale** : l'accueil tient enfin dans l'écran, « Jouer » et les onglets compris.
- **Défi du jour et Nouveautés** : deux vrais boutons sous le titre, avec leur icône. Le défi du jour dit s'il est « à jouer » (contour doré) ou « fait », et montre ta série ; une nouvelle version s'annonce par une pastille « Nouveau ».
- **Un appui se voit** : tout ce qui se touche s'éclaire dès que le doigt se pose.

### Modifié

- **Les appuis répondent tout de suite** : le jeu ne se prépare plus pendant ton premier appui (l'écran pouvait rester figé plusieurs secondes), mais quand tu ne touches à rien. Si tu touches « Jouer » avant, il se prépare aussitôt et la partie démarre dès que c'est prêt.
- **Missions du jour** : une seule ligne sur téléphone et tablette, qui s'ouvre par-dessus l'accueil d'un toucher et se referme en touchant ailleurs ; elles ne cachent plus ton héros. Sur écran large, elles restent dépliées.
- **Onglets plus lisibles** : icônes plus grandes au trait plus épais, libellés plus clairs, l'onglet ouvert souligné d'un trait doré ; la barre a son propre fond.
- **Haut de l'écran** : ton profil, ton or et les réglages sont des boutons sur fond sombre, lisibles même devant la lune. Toucher ton or ouvre les Emplacements.

### Corrigé

- L'écran « Défi du jour » s'ouvrait parfois déjà défilé, le titre et la flèche de retour hors de vue : chaque écran s'ouvre maintenant en haut, et « Lancer le défi » reste toujours visible.

### Technique

- Spec : `docs/specs/ui-ergonomie.md` (17 décisions). Gabarits compact, moyen, large et bas en requêtes média dans `index.html` (largeur, hauteur, orientation, rapport), jamais en JavaScript ; échelle par `zoom` (`--k` pour les menus, `--hk` pour le HUD, qui multiplie la taille du HUD des réglages) : DOM, caches et écritures du HUD inchangés. Aucune image, police ni dépendance ajoutée.
- `src/main.ts` : la scène 3D se prépare après le premier geste, écran au repos (`atRest`, 1,2 s sans appui, chaque appui repoussant l'étape suivante), par étapes (module, construction, héros, décor, shaders) ; « Jouer » la rend urgente (`loadScene(true)`). En `?debug=1`, préparation immédiate comme avant. Le modèle d'un autre héros au carrousel attend lui aussi le repos.
- Missions : la liste est hors du `<details>` (`#missionsPanel`), montrée par la mise en page sur écran large ; Échap et un appui ailleurs la referment. Or du menu : un bouton (`#menuGold`). Textes : `menu.dailyName`, `menu.dailyMin`, `menu.dailyTodo`, `menu.dailyDone`, `menu.new`, `menu.streakAria`, `menu.dailyAriaLeft` (FR et EN).
- Tests : `e2e/ergonomie.spec.ts`, un test par scénario (16), PC et iPhone 13, tailles posées par `setViewportSize`. Mesures et captures : `docs/GATES.md`, `docs/captures/ergonomie/`.

## 1.62.0 — 18 nov. 2026 (décision de Jimmy, lot L4 : partage, défi à un pote, classement entre amis)

Ton défi du jour se partage, se lance à un ami et se compare entre amis.

### Ajouté

- **Partager ton défi** : à la fin d'un défi du jour, le bouton « Partager » prépare ton résultat, sans rien dévoiler de ta partie : le jour, ton temps (✅ si tu as tenu jusqu'au bout, ❌ sinon), tes ennemis vaincus, ta série et un lien pour te battre. Sur téléphone, la feuille de partage s'ouvre ; ailleurs, le texte est copié (« Copié ! »).
- **Défi lancé à un pote** : ton ami ouvre le lien et tombe sur « Défi de… : 5:00 · 412 kills — à toi ! ». « Relever le défi » lance exactement la même partie que la tienne. Pendant la partie, le score à battre reste sous le chrono, et à la fin : « Défi battu ! » ou « Raté de … ». Le défi d'aujourd'hui compte pour ta série et tes parties du jour ; celui d'un jour passé se rejoue à l'identique, mais ne compte ni pour la série ni pour le classement du jour (l'or et les missions comptent toujours).
- **Classement du jour entre amis** : le lien d'un ami connecté avec un pseudo l'ajoute à tes amis ; connecté avec un pseudo, tu les vois dans le nouvel onglet « Défi du jour · Amis » du classement, avec toi, triés par temps puis par ennemis vaincus. Ton résultat du jour n'est montré qu'à toi et aux joueurs qui ont ouvert un de tes liens, et s'efface 7 jours plus tard. Un ami se retire d'un bouton.

### Technique

- Spec : `docs/specs/l4-partage-defi-amis.md`. Carte et lien : `src/meta/share-card.ts` (pur : `cardText`, `challengeUrl`, `parseChallenge` qui valide et borne chaque paramètre, `challengeGap`) ; partage : `src/platform/share.ts` (`navigator.share`, sinon `navigator.clipboard.writeText`, sinon zone de texte sélectionnée ; règle 11). Le lien porte ses paramètres dans le fragment (`/#defi=…&t=…&k=…&n=…&u=…`) : ni pseudo ni identifiant ne partent vers l'hébergeur ; le fragment est lu au démarrage (et à `hashchange` au menu), puis retiré de l'adresse ; aucun paramètre ne passe par `innerHTML`. La carte d'un défi d'un jour passé ne montre pas la série d'aujourd'hui.
- Défi d'un ami : `startGame(…, challenge)` joue la graine du jour du lien (`dailyMapSeed`, `dailySeed`) avec les règles du défi ; `runRanked` faux pour un jour passé (ni `recordDaily`, ni `recordStreak`, ni publication du jour). Partie gardée : `SavedRun.ranked` et `SavedRun.beat`. HUD : `#beatLbl` écrit au départ, jamais par image.
- Amis : `Meta.friends` (`src/meta/friends.ts`, identifiant et pseudo, 50 au plus, sans doublon, jamais soi-même) est une clé de progression (`PROGRESS_KEYS`, synchronisée) ; absente chez un joueur d'avant le lot : liste vide.
- Classement du jour : `days/{AAAA-MM-JJ}/scores/{uid}` (`name`, `time`, `kills`, `at`, et l'expiration `x` = début du jour + 7 jours ; `mergeDay`, `readDay`, `friendRows`, `dayExpiry`, `dayWritable` dans `src/meta/board.ts`), écrit avec les scores de la semaine par `src/platform/account.ts` tant que le jour est dans la fenêtre des règles, lu par identifiants (`documentId() in`, 30 par requête). `firestore.rules` : jour au format AAAA-MM-JJ et dans une fenêtre de J-2 à J+1 autour de l'heure du serveur, `x` exigé et égal au début du jour + 7 jours, lecture des connectés (100 au plus), écriture de son seul document, clés fermées, `time` ≤ 300, `kills` ≤ 20000, meilleure partie qui ne peut que monter (temps, puis kills) ; `friends` bornée à 50, éléments `{ uid, name }`. Suppression du compte : le document du jour en cours est effacé ; ceux des jours passés expirent d'eux-mêmes (règle TTL `days`/`x` à activer, `docs/DEPLOY.md`). Bouton « Retirer » à 44 px de haut.
- Règle 8 complétée (`AGENTS.md`, `PRIVACY.md`, À propos). Sans compte, ouvrir un lien, jouer et partager n'émettent aucune requête (test e2e).
- Tests : Vitest `src/meta/share-card.test.ts` ; e2e `e2e/defi-amis.spec.ts` (PC et iPhone 13), un test par scénario de la spec.

## 1.61.0 — 18 nov. 2026 (décision de Jimmy : interface « Nocturne »)

Nouvelle interface : tout le jeu passe à la nuit, plus épuré, du menu jusqu'au dernier chiffre en partie.

### Ajouté

- **Nouvel accueil** : ton héros en grand sur une clairière de nuit (au crépuscule quand une partie t'attend), des yeux rouges qui clignent dans les buissons, des lucioles. Les flèches (ou ← → au clavier) font défiler les neuf héros ; un héros encore verrouillé montre ce qu'il faut faire pour l'avoir.
- **Prochain objectif** : sous ton héros, le succès le plus proche qui débloque quelque chose, avec sa progression et sa récompense. Le toucher ouvre les Succès.
- **Barre d'onglets** en bas : Héros, Emplacements, Succès, Bibliothèque, Classement. Ton profil (et ton record) en haut à gauche ouvre le Compte, l'icône à droite ouvre les Réglages ; le défi du jour et les nouveautés sont sur les bords de l'écran.
- À ta toute première ouverture, Emplacements, Bibliothèque et Classement attendent ta première partie.

### Modifié

- **Toute l'interface est redessinée** : nouvelles polices, un seul bouton plein par écran, des listes à filets fins à la place des cartes et des cadres, partout (héros, emplacements, succès, bibliothèque, classement, défi du jour, nouveautés, compte, réglages, aide).
- **En partie**, mêmes informations aux mêmes places, plus lisibles : chiffres fins, barres de vie et d'expérience en filets, aucune boîte derrière les compteurs. Les boutons tactiles deviennent des anneaux, la recharge du sort se lit sur un anneau doré.
- **Cartes de niveau, coffre et marchand** : une liste claire, la rareté écrite en toutes lettres (commune, rare, épique). Les bannières disent leur sens par leur couleur : doré pour une récompense, rouge pour un danger.
- **Réglages** : de vrais interrupteurs et des choix d'un toucher (effets, rendu, langue), un groupe « Vie privée » pour la mesure de fréquentation.
- Le menu ne fait plus tourner la 3D derrière lui : moins de batterie au menu, la partie démarre comme avant.

### Technique

- Interface « Nocturne » (`docs/specs/ui-nocturne.md`, maquette `docs/design/menus/`) : jetons du kit en variables CSS (`--night`, `--moon`, `--lantern`, `--swarm`, `--moon-70`, `--moon-55`, `--rule`) et classes réutilisables (`.btn-full`, `.btn-act`, `.btn-link`, `.lbl`, `.prog`, `.switch`, `.seg`, `.tabs`, `.row`, `.dot`, `.lockico`) dans `index.html`. Animations de la maquette en CSS (`breathe`, `blink`, `fly`, `soft`), coupées par `prefers-reduced-motion` et par « Effets réduits » (`body.calm`).
- Polices : Barlow (400, 500, 600) et Barlow Condensed (300, 500, 600, 700), SIL OFL, latin + latin étendu, auto-hébergées (`public/fonts/`, 14 fichiers, ≈ 255 ko dont 155 ko de latin, précaché ; le latin étendu, hors précache, ne se charge que s'il sert ; la graisse 300 du chrono se charge avec la scène) ; Lilita One et Rubik retirées (la page « À propos » suit).
- Images : `npm run ui-images` (`tools/ui-images.ts`, sharp, déjà là) tire de `assets/ui/` 9 portraits, 9 avatars, les fonds nuit, crépuscule et nuit floutée en WebP, et le logo SVG (`public/ui/`, ≈ 376 ko au total, plafonds de la spec vérifiés par le script) ; `webp` ajouté au précache du service worker.
- Accueil : `src/ui/home.ts` (carrousel, prochain objectif `nextGoal` dans `src/meta/achievements.ts`, onglets fermés tant que `Meta.reveal` vaut 0). Plus de `renderIdle` : la scène 3D se charge comme avant mais ne rend que la partie (`gameShown`, `src/main.ts`) ; menu et écrans intérieurs ont un fond illustré opaque et le canvas n'y est pas composité. Le héros glTF est compilé (`compileAsync`) et ses textures envoyées avant d'être posé, puisque le menu ne le rend plus ; le carrousel ne le pose qu'après 300 ms d'arrêt.
- Écrans refaits : `src/ui/meta-ui.ts` (héros, emplacements par section, succès avec onglets, défis), `src/ui/library.ts` (fiche + grille), `src/ui/board.ts` (avatars, podium), `src/ui/account.ts` (« Invité » ou pseudo sur la puce de profil). Échap ferme tout écran intérieur, le focus revient sur ce qui l'a ouvert.
- HUD : même DOM, mêmes caches, aucune écriture de plus par image (règle 1) ; seul le CSS change. `hud.banner(texte, ton, sous-titre, durée)` : ton `reward`, `danger` ou `info`. Rareté des cartes : `.rar` (commune, rare `#7FB4FF`, épique lanterne).
- Lot L5 au kit : le palier visuel d'une arme est un filet de 2 px au-dessus de son icône dans la barre d'équipement (I argent bleuté, II lanterne, III prisme animé, coupé par « Effets réduits » et `prefers-reduced-motion`), comme la rareté d'un objet, au lieu d'un cadre.
- Lot L4 au kit (à la fusion des deux branches) : « Partager » en action secondaire sous les chiffres de l'écran de fin, feuille « Défi de {pseudo} » comme celle du défi du jour, « À battre » sous le chrono en libellé lanterne, onglet « Amis » du Classement (lignes et podium de la maquette, « Retirer » en lien de 44 px).
- Lot L3 au kit : flamme et série sur le rail « Défi du jour · 5 min » (le temps du jour s'efface quand une série est en cours), note du joker en lanterne sous l'accroche, missions du jour en lignes à filets comme le prochain objectif (`src/ui/missions.ts` ; repliées en surimpression sur téléphone, colonne à droite sur PC), feuille du défi avec lignes Série, Joker et Récompense (`streakPreview`, `src/meta/daily.ts`) et parties du jour en colonnes (temps, vaincus), récompenses de fin en lignes lanterne, bannière « Défi réussi ! » au ton `reward`.
- Tests : `e2e/nocturne.spec.ts` (un test par scénario de la spec, PC et mobile), `src/ui/home.test.ts` ; specs e2e mises à jour pour les `id` et textes changés (réglages en interrupteurs et choix, avatars `.char`, achat d'un héros depuis sa fiche, fiche de la Bibliothèque). Captures avant / après : `docs/captures/nocturne/`.

## 1.60.0 — 18 nov. 2026 (décision de Jimmy, lot L3 : défi du jour court, série, missions)

Un rendez-vous de 5 minutes chaque jour, une série à faire grandir et trois missions qui changent tous les jours.

### Ajouté

- **Série de jours** : chaque jour où tu termines le défi du jour (réussi ou raté), ta série grandit et te rapporte de l'or, de 40 à 100 selon sa longueur. Au 7e jour, puis tous les 7 jours, une tenue alternative t'est offerte (d'abord celle du personnage que tu as choisi). La flamme et le nombre de jours sont sur le bouton du défi.
- **Joker** : un par semaine. Si tu oublies un seul jour, il sauve ta série, et le menu te le dit dès l'ouverture. Deux jours oubliés de suite (même à cheval sur deux semaines), ou un deuxième oubli dans la même semaine, et la série repart à un. Un défi commencé avant minuit et terminé après compte pour son jour.
- **Missions du jour** : trois objectifs qui changent chaque jour à minuit (heure universelle), sous les boutons du menu : jouer avec un autre personnage, finir une partie avec une arme (dès que tu as un deuxième emplacement d'arme), vaincre des ennemis, des élites, tenir quelques minutes, ouvrir des coffres, monter une arme. Elles comptent dans toutes les parties et paient 60 à 100 or à la fin de la partie qui les remplit. Sur téléphone, le bloc est replié : touche « Missions du jour » pour l'ouvrir.

### Modifié

- **Défi du jour en 5 minutes** : un seul monde, et si tu es encore debout à 5:00, c'est « Défi réussi ! ». Tout le monde joue la même partie avec l'Éclaireuse et le kit de départ (une arme, deux tomes, les objets de base) : tes déblocages ne comptent pas. Tes parties du jour sont classées au temps tenu, puis aux ennemis vaincus. Les parties lancées par « Jouer » ne changent pas : toujours trois mondes.
- L'aide « Comment jouer » parle du défi, de la série et des missions.

### Technique

- Sim : `DAILY` (`balance.ts` : `duration` 300 s, `diffRate` 1) ; `WorldOptions.daily` fixe `World.dailyEnd` (gardé par l'instantané). Le défi se joue au monde 1 sans le totem du passage (`TOTEM_HIDDEN`, `hideUnrevealed`) ; à `dailyEnd` s de partie, `tickStage` arrête la partie (`Mode.Won`, `Ev.Victory`, bonus d'or de fin) et `step` s'arrête là (rien d'autre ne joue ce pas). `stageLeft` rend le chrono du défi. Un défi gardé avant la mise à jour devient le défi court à la reprise (`adoptDaily`). `worldOptions(…, true)` : Éclaireuse, `SLOTS_START`, armes et objets d'un nouveau joueur, tout dévoilé.
- Équilibrage (règle 13) : `npm run sim -- --daily` (profil `daily`, cible « défi réussi 35–65 % »), bot moyen, 4 graines × 200 parties regroupées : **49,4 %** de défis réussis (47 / 50 / 51 / 49,5 % par graine) avec `diffRate` 1, sans accélérateur. Deux cibles du profil nu s'ajoutent au profil `daily` et restent hors cible, à dessein (écart rendu visible, réponse proposée à Jimmy) : morts avant 3 min 22,1 % (≤ 20 %), plus forte chute 17 à 24 pts selon la graine (≤ 22). La courbe des vivants du défi s'arrête à 5:00. Détail : `docs/GATES.md`, lot L3. `tools/sim-pool.mjs` lit aussi les fichiers `<préfixe>-daily-<graine>.json`.
- Méta : `Meta.streak` (`last`, `count`, `best`, `jokerWeek`, `jokerDay` : le jour pardonné, un joker ne se chaîne pas à un autre) et `Meta.missions` (`date`, `list` de `{ k, p, goal, prog, done }`) sont des clés de progression (`PROGRESS_KEYS`, synchronisées), `Meta.daily.kills` s'ajoute aux temps. `src/meta/daily.ts` : `recordDaily` (temps puis vaincus), `settleStreak`, `recordStreak`, `streakNow`, `mergeStreak` ; `src/meta/missions.ts` : tirage par `hash('missions-' + date)` dans un ordre fixe, `missionsAfterRun`, `mergeMissions`. Or et objectifs dans `STREAK` et `MISSIONS` (`balance.ts`). Fusion du nuage : la série la plus récente puis la plus longue ; les missions du même jour gardent la meilleure progression. Le menu ne règle pas la série tant qu'un défi gardé du lendemain du dernier jour compté attend ; une horloge reculée ne refait pas le tirage des missions et ne paie rien. La mission d'arme n'est tirée qu'avec un deuxième emplacement d'arme.
- `firestore.rules` : `streak` et `missions` facultatives et bornées (clés fermées, types et tailles des valeurs, 3 missions de 5 champs au plus), `daily.kills` facultatif (10 au plus). Sans compte, rien ne part (règle 8).
- Joueurs existants : série à 0, missions tirées à la première ouverture, vaincus du défi à 0 pour les temps déjà enregistrés ; rien d'autre ne change.
- Interface : `#dailyStreak` (flamme et nombre) sur le bouton du défi, `#streakNote` (joker), bloc `<details id="missions">` (`src/ui/missions.ts`, replié au départ sur un petit écran), `#oRewards` à l'écran de fin, bannière « Défi réussi ! » ; HUD « Défi du jour » et chrono de 5:00. `debug.warp` s'arrête à la fin du défi.
- Tests : Vitest `src/meta/daily.test.ts`, `src/meta/missions.test.ts`, `tools/daily.test.ts` (un test par scénario de la spec, en anglais) ; `e2e/daily.spec.ts` (PC et mobile).

## 1.59.0 — 18 nov. 2026 (décision de Jimmy, lot L5 : paliers visuels d'arme)

Une arme que tu fais grandir change d'allure : chaque cap se voit, et se fête.

### Ajouté

- **Paliers d'arme** : aux niveaux 25, 50 et 100, une arme passe un palier. Palier I : ses tirs et ses effets prennent une teinte argent bleuté ; palier II : l'or ; palier III : un prisme dont les couleurs tournent lentement. À chaque palier ses projectiles grossissent un peu, les bombes et les flaques de Vitriol gagnent une lueur, les Esprits un halo plus large et le disque du Halo luit davantage. Rien ne change aux dégâts, à la portée ni à la cadence : c'est pour les yeux.
- **Le palier se fête** : bannière « Palier II — Orbe filante », gerbe de lumière à la couleur du palier autour de toi, son de niveau plus aigu, petite secousse. Avec « Réduction des effets », la bannière et le son seulement. Chaque palier n'est fêté qu'une fois par partie, et une partie reprise garde les siens.
- **Barre d'équipement** : l'icône d'une arme garde un liseré à la couleur de son palier.

### Technique

- Sim : `WEAPON_TIERS` [25, 50, 100] (`balance.ts`) ; `src/sim/tiers.ts` : `reachTiers` à la prise d'une carte d'arme (un `Ev.WeaponTier` par palier franchi, v = palier, x2 = index dans `WEAPON_KEYS`), `syncTiers` en silence à la reprise d'une partie (une partie gardée avant les paliers les retrouve sans célébration) et dans `debug.give` / `debug.upgrade`. `w.wtier` (palier atteint par arme) est gardé par l'instantané. `Ev.Bolt` porte en v l'arme qui le lance (Foudre, Balise ; 0 pour un objet ou un sort). Aucune statistique ne lit `w.wtier`.
- Rendu : `src/render/tiers.ts` (`tierColor` : teinte du palier à la clarté de la couleur remplacée, plus 12 % d'éclat par palier ; prisme HSL à 0,1 tour par seconde, décalé d'un fantôme de traînée au suivant ; `tierScale` : +8 % par palier ; `TierTint`). Les couleurs d'arme de `scene.ts` sont des `TierTint` refaites une fois par image (`tintWeapons`), sans allocation ; éclairs de la Foudre et de la Balise, claque du Fouet (`Bolts`) et étincelles de coup (`hitTint`, `main.ts`, par `GameScene.tint` : three reste hors du chunk principal) suivent. Les zones de dégâts (Halo, flaques, cercles des Météores, arcs de la Faux, croissant des Lames) gardent leur vraie taille : seuls projectiles et objets grandissent. Lueurs ajoutées dans les écrivains que l'arme utilise déjà : aucun appel de dessin en plus.
- Célébration : `tierCelebration` (`feel.ts`, `FEEL.tier` : tremblement 0,3, hit-stop de rendu 80 ms, son de niveau ×1,19 / ×1,33 / ×1,5 selon le palier, `AudioBus.levelUp(rate)`), bannière `banner.tier` (FR, EN). Liseré de la barre d'équipement : classes `.gw.tier1..3` (`index.html`, `--tier1`), prisme animé en CSS, fixe en mouvement réduit.
- Tests : Vitest (`src/sim/tiers.test.ts`, `src/render/tiers.test.ts`, `src/render/feel.test.ts`, `src/ui/gear.test.ts`) et `e2e/paliers.spec.ts` (PC et mobile, carte prise au clavier et au doigt, captures des paliers 0 à III) ; « The draw call budget holds with tiers » dans `e2e/stress.spec.ts`.
- Mesures : même image figée avec et sans paliers (huit armes) : autant d'appels de dessin des deux côtés (37 et 43 sur PC, 35 sur mobile) ; à 400 ennemis, budget mobile de 40 tenu (27 à 35). Bench p95 0,87–1,09 ms, tas +0,38 Mo. Chunk principal 135,03 → 135,64 ko gz. Détail dans `docs/GATES.md` (Lot L5), captures dans `docs/captures/l5/`.

## 1.58.0 — 17 nov. 2026 (décision de Jimmy, lot L2 : premières parties)

Un nouveau joueur découvre le jeu pas à pas. Rien ne change pour ceux qui ont déjà joué.

### Ajouté

- **Découverte pas à pas** : ta toute première partie va à l'essentiel (se déplacer, sauter, armes automatiques, cartes de niveau, coffres et bonus au sol). La glisse arrive à la 2e partie, les sanctuaires à la 3e, le marchand à la 4e, le totem et les crânes (donc les mondes suivants) à la 5e.
- **« Nouveau ! »** : au début de la partie qui t'apporte quelque chose, une bannière te dit ce que c'est et quoi en faire. Le premier sanctuaire, le premier passage du marchand et le premier totem portent une étiquette « Nouveau » sur la minicarte jusqu'à ce que tu t'en serves.

### Modifié

- **Si tu as déjà joué, tu gardes tout** : glisse, sanctuaires, marchand, totem et crânes restent là, sur cet appareil comme sur ton compte, avec ton or, tes succès, tes personnages et tes emplacements.
- **Défi du jour** : il se joue toujours avec tout, la même partie pour tout le monde.
- L'aide « Comment jouer » et la légende de la grande carte ne parlent que de ce que tu as déjà découvert. Le bouton GLISSE et sa touche apparaissent avec la glisse.

### Technique

- `Meta.reveal` (0 à 4, clé de progression synchronisée, `firestore.rules` : entier 0–4 facultatif) monte d'une étape à chaque partie finie (mort, victoire, ou abandon après `REVEAL.abandonAfter` = 60 s de jeu), jamais au défi du jour. `Meta.seenReveal` (clé d'appareil) retient la dernière étape annoncée. `src/meta/reveal.ts` : `readReveal`, `revealAfterRun`, `revealNews`.
- Migration : une sauvegarde ou une progression du nuage sans `reveal` qui a fini au moins une partie reçoit 4 (tout), sans bannière ; sans partie, 0. Fusion du nuage : le plus grand des deux. La remise à zéro de la progression garde le dévoilement.
- Sim : `WorldOptions.reveal` (absent = 4). `hideUnrevealed` (`src/sim/poi.ts`) retire sanctuaires (< 2), crânes et totems de boss (< 4) et cache le totem du monde (`TOTEM_HIDDEN`, < 4) après tous les tirages de la carte : coffres, bonus et lieux d'une graine ne bougent pas. Le marchand ne passe pas (< 3) ; la glisse est refusée (< 1). Avec `reveal` à 4, les parties sont identiques à la 1.57.0 (contrôle : 20 parties du kit de départ et 10 du kit complet en monde infini, identiques une à une).
- `FIRST_RUNS` (`balance.ts`) : les monstres apparus pendant les 180 premières secondes des deux premières parties ont PV ×0,965 et dégâts ×0,9 (cadence ×1). Gardé par l'instantané : une partie reprise est identique.
- Interface : bannière à deux lignes (`hud.banner(texte, sous-titre, durée)`), 4 s, son de niveau ; étiquette « Nouveau » sur la minicarte (`MapView.setNew`) ; `data-reveal` sur les lignes de l'aide et de la légende de la carte (`showRevealed`) ; bouton GLISSE et touche masqués (`hud.kit`).
- CLI : `npm run sim -- --reveal 0..4` ; `tools/sim-pool.mjs` donne aussi la survie médiane regroupée.
- Équilibrage (règle 13, bot moyen, kit de départ, 4 graines × 200 parties regroupées) : morts avant 3 min **22,3 %** et survie médiane 4:52 avant le lot (tout dévoilé) ; **19,1 %** et **4:51** aux dévoilements 0 et 1 avec l'adoucissement retenu (cible ≤ 20 % et ≤ 7:00). Sans adoucissement, le dévoilement 0 meurt plus tôt (25,3 %, 2 graines). Les dévoilements 0 et 1 donnent les mêmes parties au bit près : le bot de référence ne glisse pas. Adoucir toute la partie fait sauter la médiane au-delà de 7:00 (pas de totem avant la 5e partie, la survie après le boss de 3:00 s'étire jusqu'à la fin du chrono) : la fenêtre des 180 premières secondes évite ce saut. Détail et candidats essayés : `docs/GATES.md`, lot L2.
- Sans totem, une partie des étapes 0 à 3 se termine dans la prolongation du premier monde (toutes les parties encore en vie meurent entre 10:00 et 12:00) : la cible « plus forte chute des vivants en une minute ≤ 22 points » n'a pas de sens pour ces parties (29 à 31 points mesurés).
- Tests : Vitest `src/sim/reveal.test.ts` et `src/meta/reveal.test.ts` (un test par scénario de la spec, en anglais), `e2e/reveal.spec.ts` (PC et mobile). Les specs e2e d'avant le lot partent d'un joueur qui a tout découvert (`openGame`, `e2e/helpers.ts`) ; les mesures de `e2e/stress.spec.ts` se font avec tout dévoilé, la scène la plus chargée.

## 1.57.0 — 17 nov. 2026 (décision de Jimmy, lot L1 : mesurer la rétention, sur accord)

Le jeu peut compter, si tu es d'accord, les jours où tu l'ouvres. Sans ton accord, rien ne part.

### Ajouté

- **« Aider à améliorer le jeu ? »** : après ta première partie, une question s'affiche une seule fois au menu. Si tu réponds « Oui, compter », le jeu note de façon anonyme les jours où tu l'ouvres pendant 30 jours, sous un identifiant tiré au hasard : ni compte, ni score, ni appareil. « Non merci » (ou Échap) et rien ne part, la question ne revient jamais.
- **Réglages → Mesure anonyme de fréquentation** : tu changes d'avis quand tu veux. La couper efface ce qui a été envoyé ; la remettre repart de zéro avec un nouvel identifiant.

### Technique

- `src/platform/retention.ts` : un document Firestore `retention/{id}` par appareil qui a accepté (`c` jour de l'accord en jours depuis 1970, `f` au plus une partie finie à l'accord, `o` jours d'ouverture J0 à J30, `x` expiration à cohorte + 90 jours), écrit par l'API REST (`PATCH`, clé d'API web dans l'URL) avec `fetch`, sans SDK Firebase. Une écriture par jour UTC au plus (lancement ou retour au premier plan), aucune après J30 ; hors ligne ou en échec, le jour reste noté et la liste complète repart à l'ouverture suivante, sans boucle ni erreur visible. Retrait : `DELETE` du document ; l'identifiant n'est plus utilisé et reste en attente de suppression, retentée à chaque ouverture, tant que le serveur ne l'a pas confirmée. État dans `localStorage` `ruee-retention`, hors de `Meta` (ni sauvegarde, ni export, ni synchronisation).
- `src/meta/retention.ts` (pur) : état local, corps de la requête, lecture des documents et tableau D1/D7/D30 par semaine de cohorte (Dn sur les seuls joueurs d'au moins n jours, « — » pour une cohorte trop jeune).
- `src/platform/firebase-config.ts` : `loadConfig()` et `FirebaseConfig` quittent `account.ts` (sans import de `firebase`) ; sans configuration, la mesure ne fait rien.
- `firestore.rules` : bloc `retention/{id}` (identifiant de 36 caractères, clés `c`, `f`, `o`, `x` seules et toutes présentes, cohorte entre 31 jours avant et 2 jours après la création, puis figée, 31 jours au plus, expiration à moins de 100 jours, suppression permise, aucune lecture). Règle TTL sur `x` à activer une fois (`docs/DEPLOY.md`).
- `npm run retention` (`tools/retention.ts`) : lit la collection avec un jeton administrateur (`RETENTION_TOKEN=$(gcloud auth print-access-token) npm run retention`) et imprime le tableau, nouveaux joueurs et tous, sans aucun identifiant.
- La demande s'affiche au retour au menu (`toMenu`) quand au moins une partie est finie ; masquée en debug comme l'aide du premier lancement, sauf avec `?consent=1`.
- Tests : Vitest (état, document, URL, tableau, règles) et `e2e/retention.spec.ts` (un test par scénario de la spec, PC et mobile, Firestore et `/__/firebase/init.json` simulés par `page.route`).

## 1.56.1 — 16 nov. 2026 (choix de Jimmy : la nouvelle icône)

### Modifié

- **Nouvelle icône de l'app** : le « S » doré du titre sur la nuit bleue du jeu, cerné par la nuée aux yeux rouges. Elle remplace le dessin de l'époque « Ruée Nocturne ». Sur un téléphone où le jeu est déjà installé, l'ancienne icône peut rester jusqu'à ce que tu réinstalles l'app.

### Technique

- `assets/icon.svg` redessiné, la lettre en contour du glyphe de Lilita One (aucune police à charger) ; `npm run icons` régénère `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.svg` et `docs/store/icon-1024.png`. Fond en dégradé vertical : 31 ko en 512 px, contre 116 ko avec un dégradé radial.
- Trois propositions montrées (héroïne, crâne couronné, lettre), chacune en carré, rond, carré arrondi et 48 px ; la lettre a été retenue.

## 1.56.0 — 16 nov. 2026 (idées de Jimmy : coffres, marchand du monde infini, intensité des ennemis, carte à 100 %)

Les coffres de carte restent achetables toute la partie, le marchand revient en monde infini, et tu vois ce que valent les monstres.

### Ajouté

- **Intensité des ennemis** : sous ta barre de vie, une pastille « Ennemis ×2,4 » (une tête de mort et la valeur sur téléphone) dit combien les monstres ont de PV par rapport au début de la partie. En pause, la fiche de stats donne le détail : PV, dégâts, vitesse et apparitions des monstres.
- **Carte explorée à 100 %** : explorer toute la carte d'un monde s'annonce et rapporte **200 or** (davantage avec tes bonus d'or), une fois par monde.

### Modifié

- **Coffres de carte moins chers à la longue** : le prix monte de **50 % par coffre** au lieu de doubler. Le premier coûte toujours 20 or, le 5e 101 or au lieu de 320, le 8e 342 au lieu de 2 560, le 10e 769 au lieu de 10 240. À or égal on en ouvre à peu près moitié plus, et ils restent achetables jusqu'au dernier monde.
- **Marchand en monde infini** : il revient entre chaque vague de boss, sans limite. Il s'arrêtait après deux passages.

### Technique

- `enemyIntensity(w, out)` (`src/sim/spawner.ts`) : PV, dégâts, vitesse et apparitions des monstres par rapport au début de partie, avec les mêmes termes que `spawnEnemy` et `tickSpawner` (temps du monde, prolongation ou monde infini, difficulté). Le HUD ne refait son texte que quand le dixième change.
- `Ev.Explored`, `DISCOVER.full` (99,5 % des cases, l'arrondi de la grande carte) et `DISCOVER.gold` ; drapeau `w.exploredAll` par monde, gardé dans la partie sauvegardée ; `debug.reveal()` pour les tests.
- `ENDLESS.merchantVisits`, `Ev.MerchantLast` et les textes « dernier passage » sont retirés.
- `MAPCHEST.growth` 1 → 0,5, choisi par simulation entre +35, +50 et +65 % (bot moyen, 400 parties par candidat, 800 pour la référence et le réglage retenu ; monde 2 atteint / monde 3 / victoire, coffres par partie). Kit complet : ×2 71,0 / 40,3 / 19,4 % et 6,6 ; +65 % 76,0 / 46,0 / 24,0 % et 8,8 ; +50 % 73,5 / 49,3 / 25,3 % et 10,1 ; +35 % 77,3 / 53,3 / 28,5 % et 12,6 (au-dessus de la cible de victoires, 5–28 %). Kit de départ : 31,0 / 25,9 / 21,0 % et 4,6 avec ×2 ; 31,8 / 26,8 / 21,5 % et 6,6 à +50 %.
- Réglage livré (coffres à +50 %, marchand à chaque vague), 4 graines × 200 parties par profil. Kit complet : 73,5 / 50,0 / 23,9 % (monde 3 +9,7 points, victoires +4,5, dans leurs cibles ; « monde 2 ≥ 75 % » reste manquée de peu, comme avant), 10,1 coffres, monde infini tenu 2:47 en médiane (3:08 avant, cible tenue). Kit de départ : 32,0 / 27,3 / 22,1 %, 6,5 coffres, morts avant 3 min 22,3 % (20,5 % avant, cible ≤ 20 %, déjà dépassée avant ; écart dans le bruit), monde infini tenu 6:39 en médiane (4:01 avant) et 12:36 au neuvième décile (10:34 avant) : **hors de ses cibles** (2:30–6 min et ≤ 12 min) ; en moyenne les parties y durent 1:12 de plus. Cet allongement vient des coffres, pas du marchand : sur les mêmes graines, avec et sans marchand illimité, les parties sont identiques jusqu'à son troisième passage et l'écart ensuite est nul (−31 s ± 35). Levier chiffré mais non appliqué, la décision revient à Jimmy : durcir le terme tardif de `ENDLESS.ramp` raccourcit les très longues parties (neuvième décile 12:39 → 10:30 sur deux graines, écart encore dans le bruit) sans toucher au kit complet.
- `tools/sim-pool.mjs` : regroupe les sorties `--out` de plusieurs graines d'un même réglage.
- Relecture perf : la pastille d'intensité est arrondie à la précision affichée (`multQuant`), sans quoi son texte était refait jusqu'à 58 fois par seconde en prolongation ; le texte des PV du héros n'est plus construit à chaque image.
- Relecture d'équilibrage : choix de +50 % confirmé, prix de base inchangé ; l'outil de simulation dit maintenant « dépensé en partie (marchand et coffres) » là où il disait « au marchand ».
- Contrôle : 50 parties par profil rejouées sur le code livré, identiques une à une à celles du réglage mesuré (qui tournait sur la 1.55 avec `--set`).
- Bench : p95 1,12 ms, tas +0,37 Mo, instantané 3,5 ms. Vitest : 1039 verts. Tests navigateur PC et mobile : pastille d'intensité (compacte sur téléphone, sans recouvrir la puce d'objectif) et groupe « Ennemis » de la pause, annonce des 100 %, marchand au 3e et au 4e passage du monde infini ; captures lues.

## 1.55.0 — 15 nov. 2026 (demande de Jimmy : toutes les stats du jeu dans les sanctuaires)

Les sanctuaires peuvent maintenant donner n'importe quelle stat du jeu, un projectile de plus compris.

### Ajouté

- **Vingt bonus de sanctuaire de plus** : tout ce que seuls les tomes donnaient se trouve aussi dans les sanctuaires.
  - **+1 projectile pour toutes les armes** (Sanctuaire de la volée). C'est un bonus **rare**, et un sanctuaire en donne **deux au plus** par partie, en plus de ceux du tome.
  - Projectiles : durée, vitesse. Recul.
  - Survie : PV par ennemi tué, PV soignés à chaque niveau, réserve de soin, garde, riposte.
  - Attaque : dégâts à bas PV, revanche, chance de ralentir, durée des ralentissements, dégâts aux ennemis ralentis.
  - Butin : or des coffres, or par élite, prix du marchand, butin et fréquence des élites, difficulté.
- La **fiche de stats** de la pause montre maintenant toutes ces stats (38 lignes).

### Modifié

- Un sanctuaire propose toujours **4 choix**, tirés parmi 38 bonus au lieu de 18 : les sanctuaires sont plus variés, une stat précise revient moins souvent.
- Un bonus qui ne te servirait à rien n'est pas proposé : la **difficulté** attend que tu aies activé un crâne, la **réserve de soin** que tu aies un soin qui y puise, et les deux bonus du **givre** (dégâts aux ennemis ralentis, durée des ralentissements) que tu aies de quoi ralentir ou étourdir.
- Tome Bastion, ligne de riposte : affichée « +100 % des dégâts de contact renvoyés » (elle disait « +1 »).

### Technique

- `BoonKey`, `BOON_KEYS`, `BOON` : 20 clés de plus, à la suite (l'ordre de `w.boons` et les parties gardées ne bougent pas ; une sauvegarde à 18 cases se reprend). `BOON_MAX` (prises au plus), `BOON_WEIGHT` (`proj` : 1 contre 3), `BOON_STAT`, `BOON_OWN_TEXT`.
- `applyStat(P, stat, step)` extrait de `applyTomeLine` : un seul code pour une ligne de tome et un bonus de sanctuaire, plafonds compris. Test garde-fou : toute stat de `TOMES` a son bonus.
- `boonCapped` : bornes de prises, plafonds de garde et de prix, conditions de la difficulté et de la réserve de soin. `rollBoonChoices` pondéré, un tirage par offre comme avant.
- Outil de simulation : part des parties qui prennent chaque bonus (ligne `sanctuaires`).
- Mesures (200 parties par graine, bot moyen ; monde 2 atteint / monde 3 / victoire). Kit complet, graines 42 à 45 : 75 / 49 / 23, 70 / 43 / 20, 71 / 45 / 19 et 73 / 47 / 20 % avant ; 70 / 43 / 18, 73 / 41 / 22, 69 / 41 / 21 et 74 / 39 / 20 % après. Kit de départ, graines 42 à 45 : 33 / 26 / 19, 32 / 27 / 22, 28 / 23 / 18 et 28 / 25 / 19 % avant ; 28 / 23 / 19, 32 / 24 / 20, 33 / 28 / 21 et 28 / 22 / 17 % après. Monde infini, temps tenu médian : kit complet 2:54, 3:04, 2:32 et 2:56 avant, 2:46, 3:38, 3:22 et 3:12 après ; kit de départ 7:32, 7:05, 4:24 et 5:03 avant, 3:36, 3:09, 5:03 et 7:05 après (≈ 40 parties seulement continuent en monde infini : la médiane bouge de 3 à 7 min d'une graine à l'autre pour un même réglage). Aucune cible ne change de côté. Un seul écart approche le seuil de lecture : le kit complet atteint le monde 3 dans 41 % des parties au lieu de 46 % (quatre graines dans le même sens, cible ≥ 35 % tenue, victoires inchangées à 20 %) ; piste, non prouvée : un des quatre bonus les plus forts est proposé dans 38 % des sanctuaires au lieu de 67 %. Ablations : sans « +1 projectile » aux sanctuaires 70 / 41 / 18 % (kit complet, graine 42), aucun effet mesurable ; à 5 choix 73 / 46 / 24 et 77 / 43 / 23 % (graines 42 et 43), entre les deux. Le bot prend 2,3 sanctuaires par partie avec le kit complet, 1,6 au départ, et « +1 projectile » 0,06 fois par partie ; aucun bonus ne dépasse 9 % des prises.
- Cibles à leur limite, avant comme après, non corrigées ici : « monde 2 atteint ≥ 75 % » du kit complet (72 % en moyenne de quatre graines) ; « morts avant 3 min ≤ 20 % » du kit de départ (22 % avant, 20 % après) ; monde infini du kit de départ depuis le niveau 100 (médiane 5:18 en moyenne de quatorze échantillons, de 3:09 à 7:32, pour une cible de 2:30–6 ; neuvième décile au-dessus de 12 min une fois sur deux ; 2:49 et 6:23 avec le plafond à 40).
- Relecture d'équilibrage : deux bonus du givre (dégâts aux ennemis ralentis, durée des ralentissements) pouvaient être proposés à un héros qui ne ralentit rien ; ils demandent maintenant une source (`chills`, `boonCapped`). Contrôle après cette règle (graine 42) : kit complet 71 / 44 / 18 %, départ 31 / 26 / 20 %.
- Bench : p95 1,09 ms, tas +0,39 Mo, instantané 3,4 ms. Vitest : 1031 verts. Tests navigateur PC et mobile : `e2e/sanctuaires.spec.ts` (carte « +1 projectile » avec « 0 → 1 », riposte en pourcentage, prix du marchand, bonus pris, fiche de stats à 38 lignes) et 44 autres tests verts (bonus au sol, lisibilité, exploration, difficulté, mondes, partie gardée, fumée, langue, nouveautés) ; deux tests PC hors délai pendant que des simulations occupaient la machine, verts une fois la machine libre ; captures lues (`shots/*-sanctuaire-stats.png`, `shots/*-pause-stats.png`).
- Tests e2e de la 1.54.0 corrigés (CI rouge sur mobile) : `bonus.spec` lisait la bannière « Rage » après que l'annonce des totems de boss l'avait remplacée, `lisibilite.spec` ne comptait pas le son du bonus qu'une élite lâche une fois sur cinq. Échec reproduit puis vert.

## 1.54.0 — 15 nov. 2026 (retours de Jimmy : élites, coffres lâchés, sons de drop, minicarte, totems de boss)

Ce qui compte se voit et s'entend : les élites, ce qu'elles lâchent, et les totems de boss sur la carte.

### Ajouté

- **Coffres lâchés par les élites et les boss** : une colonne de lumière dorée, un halo au sol, une apparition avec rebond et une gerbe d'étincelles. Ils ont enfin **leur son**, et ils figurent sur la minicarte (petit carré doré cerclé).
- **Totems de boss sur la carte** : toujours affichés sur la minicarte et la grande carte, même dans les zones pas encore explorées. Quand ils sont hors du cadre de la minicarte, une **flèche orange** sur le bord donne leur direction.
- Au début de chaque monde, une ligne annonce **combien de totems de boss** il contient (il y en a toujours entre 1 et 3) ; la légende de la grande carte le rappelle.

### Modifié

- **Élites** : elles se reconnaissent de loin. Une **couronne** dorée tourne au-dessus de leur tête, une **aura** les entoure, leur anneau au sol est plus large et doublé, leur or est plus franc et il bat. Elles sont aussi un peu plus grandes à l'image (leur taille de collision ne change pas).
- **Sons de drop** : le son d'un bonus qui tombe au sol est plus fort, plus long (deux notes) et ne se fait plus couper par le bruit du combat. Même traitement pour le son des coffres lâchés.
- **Minicarte** : les bonus au sol sont des **étoiles** cerclées, plus des points ronds, pour ne plus les confondre avec un crâne, un sanctuaire ou un boss.
- **Aimant** (le bonus qui attire toute l'XP) : **rose vif** au lieu du violet, qui reste la couleur des crânes.
- Le bonus lâché par une élite tombe à côté de son coffre : il le cachait.
- Un totem de boss déjà activé reste sur la carte, en gris.

### Technique

- Sim : `Ev.ChestDrop` (x, z, v = 1 pour un boss) émis par `dropChest` ; `POWER.eliteScatter` (le bonus d'une élite est décalé, sans tirage de plus : la suite du rng ne change pas). Test : au moins `BOSSTOTEM.min` totems de boss aux trois mondes sur 100 graines (900 cartes comptées à la main : 0 échec ; le retour « pas dans chaque monde » venait de la minicarte).
- Rendu, aucun appel de dessin en plus : couronne dans `gemW`, aura et halo des coffres dans `glowW`, second anneau dans `metW` (`ELITE_RINGS` 48 → 96), colonne des coffres dans `beamW` (capacité + `CAPS.chests`). Élites relevées dans la boucle des ennemis (`eliteBuf`, tableau fixe) et marquées quand les écrivains sont ouverts. `FEEL.elite`, `FEEL.chestDrop`.
- Son : `PRIO.drop` (4, au-dessus de `kill`) ; `powerDrop()` passait à 70 % en priorité `pickup`, refusée dès 4 voix actives ; `chestDrop(boss)` composé des échantillons `coin` et `powerDrop`, sans nouveau fichier audio. Compteur `drops` dans l'état audio pour les tests.
- Minicarte (`src/ui/minimap.ts`) : `star()`, totems de boss sans `seenAt`, dessinés après le marchand et les bonus, flèche de bord (minicarte seulement). `debug.elite()` pour les tests.
- Budget d'appels de dessin inchangé (`e2e/stress.spec.ts`, mobile, rendu net) : 33 avec quatre armes, 37 au pire point de la carte, pour 40. Bench : p95 1,00 ms, tas +0,38 Mo, instantané 3,9 ms. Relecture perf approuvée ; ses remarques appliquées (capacité de `gemW`, anneaux seulement pour une élite marquée, test du nombre d'appels).

## 1.53.1 — 12 nov. 2026 (budget de rendu du téléphone tenu avec les crânes et les totems de boss)

Un réglage de fluidité pour les téléphones, sans rien changer au jeu.

### Corrigé

- **Fluidité sur téléphone** : les crânes, les totems de boss, les coffres et les sanctuaires qui ne sont pas à l'écran ne demandent plus aucun travail d'affichage. Avec jusqu'à 20 crânes et 3 totems de boss par monde, le téléphone en affichait parfois pour rien.
- Les cercles d'attaque au sol, leurs disques et les arcs de lame sont affichés en une seule fois au lieu de deux, sans changer d'aspect.

### Technique

- `GameScene.seen()` : test d'une boule contre le champ de la caméra (frame précédente, marge de 6 u, sans allocation) avant d'écrire le modèle et l'anneau d'un lieu (crâne, totem de boss, coffre de carte, sanctuaire, stèle et anneaux du totem). Les colonnes de lumière restent visibles de loin. Champ ignoré une frame après un changement de taille ou un saut de caméra.
- `forceSinglePass` sur les matériaux transparents à double face des formes plates (`flat()` : cercles d'attaque, disques, filet, aura, eau des lacs ; arcs de lame ; éclairs) : three les dessinait en deux appels (faces arrière puis avant), pour une image identique.
- Cause : `e2e/stress.spec.ts` rouge en CI sur mobile, 41 à 43 appels de dessin pour un budget de 40 (4 armes au niveau 8, 400 ennemis) ; 40 sur 40 dès la 1.50.0. Scène de base mesurée objet par objet : 36 à 38 appels, plus 2 par crâne à l'écran et 1 par coffre. Après les deux correctifs, mobile, rendu net : 33 à 37 appels sur huit cartes tirées, 33 et 37 au test, pire point de la carte 36.
- Test de capture du boss du totem : attente portée de 15 à 45 s (la charge prend 11 à 14 s réelles en rendu logiciel, autant en 1.52.0 qu'en 1.53.0).

## 1.53.0 — 12 nov. 2026 (demande de Jimmy : une difficulté sans limite, des crânes et des totems en nombre variable, un objet contre les boss)

La difficulté part de 0 % et monte aussi haut que tu oses : plus de crânes, plus de boss, et un poison pour en venir à bout.

### Ajouté

- **Toxine** (objet rare, disponible dès le départ) : tes coups sur un boss peuvent l'empoisonner. Chaque dose lui retire un peu de sa vie chaque seconde, et les doses s'empilent ; plus tu en as d'exemplaires, plus elle empoisonne souvent et plus elle empile de doses. Un boss empoisonné vire au vert.

### Modifié

- **Difficulté** : elle part de **0 %** (la partie normale) et n'a plus de maximum. Elle s'affiche dès le début, sous ta barre de vie (« ▲ 0 % »).
- **Crânes** : entre **7 et 20 par monde**, selon la carte. Chacun monte la difficulté de **5 %** (au lieu de 10 %) : on monte plus doucement, mais aussi loin qu'on veut.
- **Tome de difficulté** : plus de limite de lignes.
- **Armes et tomes : niveau 100 au plus** (40 avant). Une arme que tu pousses seule continue de monter jusqu'au bout de la partie, monde infini compris.
- **Totems de boss** : entre **1 et 3 par monde**, selon la carte. Chacun ajoute un **double exact** du boss de chaque vague : le même boss, avec la même vie et les mêmes attaques.

### Technique

- `DIFFICULTY` : `skullMin` 7, `skullMax` 20, `skullStep` 0,05, `skullSpacing` 18, plus de `max` ; `BOSSTOTEM` : `min` 1, `max` 3, `extraHp` 1, `extraCadence` 1 ; nombres tirés avec le rng de la carte, après le totem (les autres lieux d'une graine ne bougent pas). Ligne `difficulty` du tome sans `max`.
- Toxine : `ITEM.toxine` (chance 0,12 × exemplaires, 0,2 % des PV max par dose et par seconde, 5 s, 4 doses par exemplaire), champs `tox`, `toxT`, `toxAcc` d'Enemy, `HitSrc.Toxin` ; le tirage n'a lieu qu'avec l'objet.
- `LEVEL_MAX` : 40 → 100 (armes et tomes). Mesuré contre 40, parties gagnées qui continuent : kit complet identique ; kit à une arme, monde infini tenu 2:49 → 4:24 en médiane, 6:23 → 11:08 pour une partie sur dix, cibles tenues sans toucher à la rampe.
- Mesures (200 parties, graine 42, monde 2 atteint / monde 3 / victoire) : sans rien activer, kit complet 78 / 52 / 25 %, départ 29 / 25 / 19 % ; 1 / 2 / 3 totems de boss par monde 46 / 17 / 7, 34 / 10 / 5, 34 / 12 / 4 % ; 10 crânes par monde 24 / 5 / 0 % (dont le détour du bot : 35 / 10 / 1 % avec des crânes à 0 %). Toxine : boss de survie environ 30 % plus courts quand on la possède, valeur en survie égale à celle de l'objet moyen. Détail dans PLAN.md, phase 50.
- Test de reprise des neuf personnages allégé et délai porté à 120 s : il dépassait 30 s sur le runner de CI avec la couverture (CI rouge de la 1.52.0, jeu non touché).
- Tests navigateur corrigés après la CI de la 1.53.0 (jeu non touché) : la Bibliothèque compte 49 objets avec la Toxine ; le test de reprise après rafraîchissement rend le joueur invincible dans le même appel que le saut dans le temps (il mourait entre les deux sur le runner).

## 1.52.0 — 12 nov. 2026 (demande de Jimmy : ne plus perdre une partie en cours)

Une partie en cours ne se perd plus : ferme l'app, reviens, et reprends-la là où tu l'avais laissée.

### Ajouté

- **Ta partie t'attend** : rafraîchir la page, fermer l'app ou passer à une autre app ne fait plus perdre la partie. Au retour, le menu propose **Reprendre**, avec le monde et le chrono où tu en étais.
- La partie reprend **en pause**, exactement comme tu l'avais laissée : mêmes monstres, mêmes boss, même vie, même équipement. Si tu étais en train de choisir une carte, un objet de coffre, un bonus de sanctuaire ou d'acheter chez le marchand, ce choix revient avec les mêmes propositions.
- Le défi du jour se reprend aussi, et compte pour le jour où tu l'as commencé.

### Modifié

- **Menu** dans la pause ne met plus fin à la partie : elle t'attend au menu, sous « Reprendre ».
- Lancer une nouvelle partie alors qu'une autre attend demande d'abord de l'abandonner. Une partie abandonnée ne rapporte rien, comme avant.

### Corrigé

- Un cercle d'attaque de boss pouvait, rarement, garder l'état d'une attaque précédente.

### Technique

- `src/sim/snapshot.ts` (`snapshotWorld` / `restoreWorld`) : carte refaite par `buildMapFor(seed)`, le reste du `World` copié champ par champ, réserves en colonnes ; test de reprise identique au bit près (neuf personnages, 8 min avec un instantané par minute, mondes 2 et 3, monde infini, choix de cartes, marchand) et de couverture des champs. `Rng.setState` (état sur 32 bits, même suite tirée), `FlowField.save/load`, `allocShot` remet `hit`, `ox`, `oz`, `t0`.
- `src/meta/run-save.ts` : localStorage synchrone, IndexedDB si le quota déborde ; sur l'appareil seulement (ni `Meta`, ni compte en ligne). Écrite à l'onglet caché, `pagehide`, pause, choix, marchand ; jamais pendant l'action.
- Bench : instantané à 400 ennemis 3-4 ms et 212 Ko (seuil 6 ms et 600 Ko). e2e `runsave.spec.ts` PC et mobile.

## 1.51.0 — 12 nov. 2026 (demande de Jimmy : des totems de boss)

### Ajouté

- **Totems de boss** : deux petits totems orange par monde, marqués d'une colonne de lumière et sur la carte. Reste 3 s dans le cercle : **un boss de plus à chaque vague de boss de ce monde**, celles de 3:00 et de 7:00 si elles ne sont pas passées, et le combat du totem. Deux totems activés, deux boss de plus.
- Un boss en plus est un second couteau, plus petit que le boss de la vague : moitié moins de vie, et il attaque moins souvent. Deux boss à la fois restent un vrai pari : active un totem trop tôt, avec un équipement faible, et la vague de 3:00 ne pardonne pas.
- Le portail ne s'ouvre que lorsque tous les boss du totem sont vaincus. Chaque boss en plus laisse un coffre ; le soin complet et le grand coffre arrivent avec le dernier.
- La barre de boss dit combien il en reste (« Le Gardien +1 ») et une pastille « Boss +1 » rappelle les totems activés dans le monde.
- Les totems de boss valent pour leur monde : au monde suivant, tout repart de zéro. Au monde 3, ils comptent aussi pour les vagues du monde infini.

### Technique

- `BOSSTOTEM` dans `balance.ts`, `w.bossExtra` (remis à zéro au monde suivant), `w.totemAlive` (le portail attend zéro), `Enemy.cadence` (recharges d'attaque d'un boss en plus à 60 %, télégraphes inchangés). Totems tirés après les crânes : les lieux d'une graine connue ne bougent pas.
- Mesuré sur 200 parties (kit complet, graine 42), monde 2 atteint / monde 3 / victoires : sans totem 78 / 46 / 18 % ; un totem par monde activé après la vague de 3:00 : 65 / 36 / 14 % ; un totem dès 0:30 : 50 / 26 / 13 % (graine 43 : 58 / 31 / 15 %) ; deux totems dès 0:30 : 26 / 13 / 4 %. Départ (1 arme), un totem dès 0:30 : 21 / 11 / 9 % contre 33 / 26 / 19 %.
- Réglage : à 75 % des PV et cadence normale, un totem donnait 46 % et deux 14 %. Baisser les PV seuls (48 et 17 %) ou faire arriver les boss du même côté (46 et 12 %) ne changeait rien : ce sont les attaques superposées à 3:00 et 7:00 qui tuent, d'où la cadence réduite.
- Sans totem activé, les parties sont celles de la 1.50.0 (17 parties sur 200 diffèrent : le bot s'écarte des cercles de totem de boss ; aucune activation par accident).
- CLI : `--boss-totems N` (le bot active N totems de boss par monde), `--boss-totem-at S` (à partir de S secondes dans le monde).

## 1.50.0 — 12 nov. 2026 (demande de Jimmy : la difficulté, des crânes sur la carte, un tome de difficulté)

### Ajouté

- **Difficulté de la partie** : elle part de 100 % et c'est toi qui la montes. À 150 %, il apparaît une fois et demie plus de monstres, et ils ont un quart de vie en plus ; leurs dégâts et leur vitesse ne changent pas. Plus de monstres, c'est plus d'XP, d'or et de vaincus : de quoi viser plus haut au classement des vaincus. Monter trop vite, c'est mourir plus tôt. Si tu n'actives aucun crâne, rien ne change.
- **Crânes** : six crânes violets par monde, marqués d'une colonne de lumière et sur la carte. Reste 2,5 s dans le cercle : difficulté +10 %, jusqu'à la fin de la partie, mondes suivants compris.
- **Tome de difficulté** : il rejoint tes cartes dès que tu as activé un crâne. Chaque ligne : difficulté +5 %, élites 8 % plus fréquentes, ou XP et or des élites +8 %.
- La difficulté s'affiche sous la barre de vie, dans la fiche de stats de la pause et sur l'écran de fin.

### Technique

- `P.difficulty` (0 = 100 %), `DIFFICULTY` dans `balance.ts` : apparitions × (1 + d), vie × (1 + 0,5 · d), boss compris. Crânes tirés après le totem : les lieux d'une graine connue ne bougent pas.
- Mesuré sur 200 parties (kit complet, graine 42) avec 0 / 2 / 4 / 6 crânes par monde : monde 2 atteint 77 / 63 / 56 / 48 %, victoires 17 / 8 / 7 / 4 %, kills à 10 min 1 467 / 1 743 / 2 005 / 2 261, meilleure partie 10 198 / 14 269 / 16 544 / 21 123 kills.
- Le tome n'entre dans les tirages qu'après un crâne : toujours présent et jamais pris, il coûtait 8 points de « monde 2 atteint » (dilution du tirage).
- CLI : `--skulls N` (le bot active N crânes par monde), `--take-defi`.

## 1.49.0 — 12 nov. 2026 (demande de Jimmy : un récap de tous les patchs dans le menu)

### Ajouté

- **Nouveautés** : un bouton sous le titre du menu ouvre la liste de toutes les versions du jeu, de la plus récente à la plus ancienne, avec ce qui a été ajouté, changé et corrigé. La dernière version est ouverte ; les autres se déplient d'un appui, les plus anciennes derrière « Versions plus anciennes ».
- **Pastille de mise à jour** : le bouton s'allume en doré quand une version est arrivée depuis ta dernière lecture, et les versions que tu n'as pas encore lues portent l'étiquette « Nouveau ».

### Technique

- La feuille lit ce journal : `src/meta/patch-notes.ts` le réduit au build (sections Ajouté, Modifié, Corrigé ; sans les sections techniques, les lignes qui citent du code ou un outil, ni les noms de personnes) et `vite.config.ts` le sert sous `virtual:patch-notes`, un chunk chargé à l'ouverture de la feuille seulement. Une version ajoutée ici apparaît dans le jeu sans autre geste ; un test Vitest échoue si la version de `package.json` n'est pas en tête du journal.
- `meta.seenNotes` (dernière version lue) reste sur l'appareil, comme l'aide vue : jamais synchronisée.
- Le texte du journal est échappé à l'affichage ; seul le gras passe.

## 1.48.1 — 11 nov. 2026 (retours de Jimmy : « le défi du jour, je ne sais pas ce que c'est », « le phénix reste affiché »)

### Modifié

- **Défi du jour** : le bouton ouvre une feuille qui dit ce que c'est avant de lancer. Une partie par jour, la même pour tous (carte et hasard du jour) ; on y joue l'Éclaireuse avec toutes les armes, tous les objets et tous les emplacements ; le but est de tenir le plus longtemps ; l'or et les succès comptent. La feuille liste tes temps du jour (10 au plus) et le délai avant le prochain défi. Au clavier : Entrée lance, Échap ferme.
- **Plume de phénix** : une plume consommée quitte la barre d'équipement (×2 → ×1 → plus rien), en jeu comme sur l'écran de fin. C'est le seul objet qui se consomme ; le Bouclier se recharge.

### Technique

- `World.itemUsed` compte les exemplaires consommés ; l'affichage montre `items − itemUsed`. `items` garde le compte obtenu dans la partie : une plume consommée compte toujours dans la limite de deux par partie, les tirages ne changent pas.
- Revenante : sa réanimation gratuite part avant la plume.

## 1.48.0 — 11 nov. 2026 (demande de Jimmy : des armes)

### Ajouté

- **Quatre armes** (13 en tout), chacune avec sa portée, son ciblage et son rythme :
  - **Fouet** : une claque en ligne devant toi, toutes les 0,8 s, qui repousse très fort. Ses lignes ajoutent des directions : derrière, puis les côtés.
  - **Vitriol** : une fiole lancée sur le plus gros groupe ; la flaque ronge pendant 4 s et ralentit ceux qui la traversent.
  - **Esprits** : deux familiers tournent autour de toi, foncent sur les ennemis proches et reviennent.
  - **Balise** : posée où tu te tiens, elle tire seule pendant 8 s. Faite pour tenir un cercle de sanctuaire ou de totem.
- **Quatre synergies** : Saignée (Sang + Fouet : chaque ennemi fouetté rend un demi-PV), Corrosion (Cadence + Vitriol : flaques 50 % plus longues), Meute (Mouvement + Esprits : plus vifs, repartent plus tôt), Batterie (Dégâts + Balise : une cible de plus par tir).
- **Quatre succès** qui les ouvrent à l'achat (2 500 or chacune) : 100 élites (Fouet), 5 000 ennemis (Vitriol), 20 parties (Esprits), 25 coffres de carte (Balise).

### Modifié par rapport au plan

- L'arme « Fiole » s'appelle **Vitriol**, pour ne pas doublonner avec l'objet Fiole de sang.
- Trois synergies prévues s'appuyaient sur les tomes Givre, Bastion et Défi, restés en réserve : elles sont rattachées à Cadence, Mouvement et Dégâts.

### Technique

- Sources de coup : 20 (16 avant), les treize armes en tête dans l'ordre de `WEAPON_KEYS` ; le drapeau « critique » de `Ev.Hit` passe de 16 à 32 (`HIT_CRIT`).
- Aucun appel de dessin en plus : flaques et pieds de balise sur l'écrivain des cercles de météores, esprits et balises sur celui des orbes, claque du Fouet et tirs de balise sur celui des éclairs (variante orangée et tendue).
- État des armes dans `World.wstate` (tableaux préalloués), remis à zéro au changement de monde.

## 1.47.0 — 11 nov. 2026 (demande de Jimmy : beaucoup plus d'objets)

### Ajouté

- **Seize objets** (48 en tout), une règle de jeu chacun, cumulables comme les autres.
  - Communs, disponibles d'office : **Bandage** (6 s sans coup reçu : +1,5 PV/s), **Savon** (glissade 15 % plus rapide), **Enclume** (recul +30 %), **Clé rouillée** (coffres de carte −20 %), **Encens** (sanctuaires et totem chargés 40 % plus vite), **Tirelire** (+12 or par minute).
  - Rares, à débloquer à la Bibliothèque : **Fiole de sang** (vol de vie 1 % et réserve de soin +1,5 PV/s), **Miroir** (12 % de chance qu'une arme tire deux fois), **Cœur de glace** (+20 % de dégâts aux ennemis ralentis ou étourdis), **Ailes de cire** (un saut de plus en l'air), **Coquille** (dans un cercle de sanctuaire ou de totem : −35 % de dégâts subis), **Cloche de bronze** (un sanctuaire activé rend 25 % des PV et repousse les ennemis), **Trophée** (+1 % de dégâts par élite vaincue, 30 % au plus).
  - Épiques, à débloquer : **Idole** (le boss du totem arrive avec 15 % de PV en moins), **Dent de dragon** (les coups critiques embrasent : 30 % de dégâts en plus sur 3 s, l'ennemi vire à l'orange), **Grimoire** (un bonus de plus aux sanctuaires, cartes rares et épiques plus fréquentes).
- **Dix succès** qui ouvrent ces objets à l'achat (10 000 ennemis, 200 élites, 20 boss, 30 parties, monde 3, trois victoires, 5 000 m de glisse, 2 min sans dégât, 10 cartes épiques, une arme à 35 améliorations).

### Modifié par rapport au plan

- **Coquille** : prévue « à l'arrêt », elle agit dans un cercle de sanctuaire ou de totem en charge : c'est le seul moment où l'on s'arrête, et l'effet se lit à l'écran.
- **Fiole de sang** : elle porte aussi 1 % de vol de vie, pour ne jamais être un objet sans effet quand on n'a aucun soin.

### Technique

- Touches 5 et 6 pour choisir la cinquième et la sixième carte (sanctuaire avec le Grimoire).
- Source de coup `Burn` (brûlure) : la seizième et dernière tant que le critique vaut +16 ; les armes de la livraison suivante élargiront ce masque.
- `Player.airJumps`, `Enemy.burn/burnT/burnAcc`, `World.inShrine/inTotem` ; `echo()` dans `weapons/tick.ts` (Miroir : aucun tirage du générateur sans l'objet, les parties d'avant restent identiques).

## 1.46.0 — 11 nov. 2026 (demande de Jimmy : toutes les stats au sanctuaire, un tome de vol de vie)

### Ajouté

- **Sanctuaires : toutes les stats.** Chaque sanctuaire propose **4 bonus** (3 avant) tirés parmi **18** (7 avant) : PV max, régénération, armure, **vol de vie**, dégâts, critique, dégâts critiques, dégâts aux élites et boss, recharge des armes, taille, vitesse, saut, recharge et puissance du sort, **chance**, collecte, XP, or.
- **La carte d'un bonus montre où en est la stat** : « Vol de vie : 2 % → 4 % ». Un bonus dont la stat est déjà au plafond (armure, recharges) n'est plus proposé.
- **Fiche de stats** dans l'écran de pause : les vingt stats du héros, par famille (survie, attaque, mouvement, sort, butin). C'est elle qui dit quoi monter au prochain sanctuaire.
- **Tome du Sang** : vol de vie +2 % par ligne, réserve de soin +0,6 PV/s, dégâts +6 % sous la moitié des PV. Le vol de vie se cumule avec le Croc et la Couronne et reste plafonné en PV par seconde (la réserve de soin, 8 PV/s au plus pour le tome et les sanctuaires), sinon il rendrait immortel en fin de partie.

### Modifié

- Quatre cartes (sanctuaire, ou la 4e carte de la chance) s'affichent en deux rangées de deux sur PC, au lieu de trois et une.

### Pas encore en jeu

- **Tomes du Givre, du Bastion et du Défi** : écrits et testés, mais gardés hors tirage. Mesuré sur 200 parties : avec douze tomes pour quatre emplacements, on tombe moins souvent sur le tome des Projectiles, de loin le plus fort, et le kit complet atteint le monde 2 dans 59 % des parties au lieu de 76 %. Ils sortiront avec un moyen d'élargir le tirage sans le diluer (bannir une carte, déblocage à la Bibliothèque) : décision de Jimmy.

### Technique

- Stats du héros : `steal`, `stealCap`, `lowDmg`, `slowChance`, `chillDmg`, `slowMul`, `thorns`, `guard`, `revenge`, `spawnMul`, `eliteLoot`, `eliteRate` ; `Player.taken` calculé une fois par pas.
- Ligne de tome à prérequis (`needs: 'heal'`) : la réserve de soin n'est proposée que si un soin y puise.
- Simulation : `--no-tome`, `--held-tomes`, `--tome-prior` ; le bot choisit un nouveau tome par famille.
- CI : l'installation des dépendances système de Playwright ne fait plus échouer la CI quand les miroirs Ubuntu ne répondent pas (trois CI rouges avant le premier test, 1.45.1 à 1.45.3).

## 1.45.3 — 11 nov. 2026 (retour de Jimmy : après un clic droit, ZQSD répond mal)

### Corrigé

- **Le clic droit n'ouvre plus le menu du navigateur dans le jeu.** Pendant que ce menu était ouvert, le navigateur n'envoyait plus les relâchements de touches : une direction restait « tenue » après sa fermeture, et une gauche coincée empêchait d'aller à droite. Le menu reste disponible dans les champs de texte (pseudo, code de sauvegarde).
- Le clic milieu ne lance plus le défilement automatique, qui capture le clavier de la même façon.

## 1.45.2 — 11 nov. 2026 (demande de Jimmy : activer le totem quand on veut, et voir la jauge)

### Modifié

- **Le totem s'active à tout moment.** Il ne se ferme plus quand le chrono tombe à 0:00. Attendre a un prix : après 0:00 les monstres se renforcent de minute en minute, et le boss appelé à ce moment-là aussi.
- **Jauge d'activation.** Dans le cercle du totem, une puce « Totem du boss » montre la jauge qui se remplit (3 s), comme pour un sanctuaire. En sortir la vide.
- Le rappel à une minute de la fin dit maintenant « Plus qu'une minute : ensuite, les monstres se renforcent ! ». L'objectif reste « Active le totem » après 0:00, flèche comprise.

### Technique

- L'état « totem fermé » (3) n'existe plus : retiré de la sim, du HUD, de la minicarte et du rendu.

## 1.45.1 — 11 nov. 2026 (retour de Jimmy : boss du totem tué, pas de portail)

### Corrigé

- **Le portail s'ouvre même si le boss du totem meurt après 0:00.** Il suffit d'avoir activé le totem avant la fin du chrono. Avant, le chrono qui tombait à zéro pendant le combat fermait le passage pour de bon : on tuait le boss et rien ne s'ouvrait. Au monde 3, ce boss donne la victoire de la même façon.
- À 0:00 pendant le combat, la bannière dit « Le temps est écoulé ! Tue le boss pour ouvrir le portail ». Les monstres se renforcent comme dans toute prolongation.
- Ce qui ne change pas : un totem jamais activé à 0:00 se ferme.

### Technique

- `tickStage` ne ferme plus un totem en combat à 0:00 ; `Ev.TimeUp` porte l'état (0 fermé, 1 portail ouvert, 2 combat en cours).
- Simulation (200 parties, bot moyen, graine 42) : 21 % de victoires avec le kit de départ et avec le kit complet, 78 % de passages au monde 2, comme en 1.43.0.

## 1.45.0 — 11 nov. 2026 (demande de Jimmy : des ennemis du même univers que les héros, « pas des zombies »)

### Modifié

- **Tous les ennemis ont un nouveau modèle.** Les morts-vivants laissent la place à onze créatures, une par type, dans le même dessin que les héros (KayKit, licence libre CC0) et aux mêmes proportions humanoïdes :
  - Spectre : gobelin à la massue. Dard : loup-garou. Brute : orc à la hache. Volant : dragonnet. Cracheur : ninja. Archer : homme-oiseau à l'arc. Sorcier : démone.
  - Boss : le Gardien est un chevalier noir (épée et bouclier), l'Essaim-mère une chamane au bâton, le Colosse un golem de glace, le Faucheur un seigneur vampire à la faux.
- **Les noms, les attaques et la difficulté ne changent pas** : seule l'apparence change.
- **Les animations sont celles d'avant** (marche, course, coup d'épée, sort, tir), reprises sur les nouveaux modèles. Le dragonnet bat des ailes ; le crâne volant était immobile. En plongée, il s'arrête au ras du sol au lieu de le traverser.
- Les sbires ont la tête et les membres un peu plus forts que les héros : ils sont dessinés avec très peu de triangles et vus de loin, et des membres fins devenaient illisibles.
- Les ennemis gardent leurs vraies couleurs : la teinte par type, qui servait à distinguer les morts-vivants, est presque retirée. Le flash blanc du coup, l'or des élites et le rouge de la rage restent.

### Technique

- `ENEMY_MODELS` (`tools/assets/config.ts`) : onze modèles, trois réglages de proportions (`FIT` pour les boss, `FIT_LARGE` pour les grands gabarits, `FIT_MASS` pour les sbires). `npm run assets -- --enemies` refait `enemies.glb` et sa partie du manifeste.
- `mergeKay` produit plusieurs niveaux de détail à partir des mêmes sommets, lie les maillages rigides portés par un os (ailes du vampire) et accepte une texture hors fichier.
- `enemies.glb` : 532 Ko (636 Ko avant). Le dragonnet vient du pack Ultimate Monsters de Quaternius (CC0).
- La horde du test de charge (`?stress=400`) compte un Volant sur vingt : la mesure couvre le modèle animé qui vole. 215 k triangles en rendu net à 400 ennemis (plafond 250 k).
- Essayés et écartés : les clips du pack KayKit (bras tenus loin du corps, faits pour des corps trapus) ; une simplification qui ignore les coutures de texture (elle mélange les couleurs).

## 1.44.0 — 11 nov. 2026 (demande de Jimmy : de nouveaux skins de héros, plus « fantasy »)

### Modifié

- **Les neuf héros ont un nouveau modèle.** Ce sont des personnages KayKit (Kay Lousberg, licence libre CC0), remis en proportions humanoïdes : tête plus petite, jambes, torse et bras allongés, taille marquée, membres fins.
  - Éclaireuse : voleuse à la dague. Bûcheron : barbare à deux haches. Sorcière : mage au bâton. Veilleuse : clerc à la masse. Braconnier : rôdeur à l'arc. Sapeur : ingénieur. Feu follet : esprit encapuchonné. Revenante : nécromancienne à la faux. Colporteur : marchande au grand sac.
- **Les animations ne changent pas.** Course, saut, glissade, roulade, sorts : ce sont celles d'avant, reprises sur les nouveaux personnages. Les mains n'ont plus de doigts animés (les nouveaux modèles n'en ont pas).
- **Tenues 2 et 3** : la recoloration touche toute la tenue et laisse la peau telle quelle.
- Chaque héros pèse 280 à 370 Ko à télécharger, contre 590 à 685 Ko avant.

### Technique

- `tools/assets/kaykit.ts` : proportions changées au repos (articulations déplacées, maillage redéformé, matrices de liaison refaites : aucune échelle d'os à l'exécution) ; clips repris image par image du squelette actuel (65 os) vers le squelette KayKit (23 os) ; une primitive skinnée, atlas 1024² (personnage en 768², objets tenus en tuiles).
- `npm run assets -- --heroes` refait les neuf héros et leur partie du manifeste sans toucher au reste.
- Les ennemis ne changent pas dans cette version : ils suivent dans la 1.45.0.

## 1.43.0 — 11 nov. 2026 (demande de Jimmy : refaire les sanctuaires et les attaques des boss)

### Ajouté

- **Traque : des cercles sous tes pieds.** Les trois boss (Gardien, Essaim-mère, Colosse) lancent régulièrement une salve de cercles rouges (3 à 5, puis 5 à 7 en phase 2) à l'endroit où tu te trouves, un toutes les 0,4 à 0,5 s. Un cercle sur deux vise là où tu seras si tu continues tout droit : il faut changer de direction, sauter ou dasher. En phase 2 (boss sous 50 % de PV), la salve est plus longue ; en rage, les salves se rapprochent. Elle est réservée aux boss du totem et du monde infini : les boss imposés de 3:00 et 7:00, qui arrivent face à un kit encore faible, ne l'ont pas.
- **Éclats du Gardien.** Sa charge finit sur une étoile de 10 projectiles rouges qui partent dans toutes les directions (14 en phase 2). On passe entre deux ou on les saute.

### Modifié

- **Le Sillage du Gardien est retiré.** Sa charge laissait des cercles derrière lui, là où le joueur n'est jamais : ils ne menaçaient personne.
- **Sanctuaires refaits.** Un cercle de cinq stèles runiques dans la pierre du totem, ouvert vers la caméra, sur une dalle gravée. Les runes et les cristaux disent l'état : bleus quand le sanctuaire est libre, de plus en plus clairs pendant la charge, gris une fois utilisé.
- **Projectiles de boss.** Les Éclats et la Salve de l'Essaim-mère sont des orbes rouges lumineux ; le crachat vert reste celui des Cracheurs.
- Le remplissage des cercles de danger est un peu plus marqué.

### Technique

- `BOSS.hunt`, `BOSS.huntFirst`, `BOSS.burst` dans `src/sim/balance.ts` ; `BOSS.wake` supprimé. Deux champs d'ennemi (`hunt`, `huntT`), un champ de tir (`boss`).
- `src/render/shrine.ts` : une géométrie, un matériau, un appel de rendu. `stoneKit()` et `stoneMaterial()` (`src/render/totem.ts`) sont partagés par le totem (couleur par uniforme) et les sanctuaires (couleur d'instance).
- Simulation (200 parties, bot moyen, graine 42) : victoire 21 % avec le kit de départ (24 % avant) et 21 % avec le kit complet (19 % avant, écart dans le bruit) ; toutes les cibles tenues. Le combat du totem du monde 1 est plus dur pour les personnages fragiles avec leur kit de départ : la Sorcière passe au monde 2 dans 10 % des parties (17 % avant), le Bûcheron dans 11 % (19 % avant).
- `e2e/scroll.spec.ts` et `e2e/pistes.spec.ts` : délais relevés. Le test de défilement tactile prenait 53 s pour 60 s de limite et expirait sur la CI de la 1.42.1 ; le défilement lui-même fonctionne.

## 1.42.1 — 10 nov. 2026 (demande de Jimmy : refaire le totem et les armes)

### Modifié

- **Totem refait.** Une vraie stèle de pierre à la place du sanctuaire agrandi : socle à deux marches, trois blocs empilés, cornes, cristal flottant. Les runes et le cristal brillent dans la couleur de l'état : rouge quand il faut l'activer, orangé quand le boss est appelé, gris quand il est fermé. Il est plus haut (environ 5,4 unités) et ne se confond plus avec les sanctuaires.
- **Effets des armes lisibles de jour.** Les orbes, les arcs de lame et de faux, les éclairs, le halo, les lances et les météores se délavaient en blanc sur l'herbe claire. Ils gardent maintenant leur couleur, avec un cœur blanc : or pour l'orbe, violet pour la faux, bleu acier pour les lames.

### Technique

- `src/render/totem.ts` : une géométrie fusionnée, un matériau, un appel de rendu (l'instance de sanctuaire du totem disparaît). Runes et cristal par attribut de sommet et uniforme de couleur.
- `softGlow()` (`src/render/textures.ts`) : fusion couvrante à la place de l'additif pur (couleur prémultipliée, alpha écrit réduit). Aucun appel de rendu en plus.
- Non refait : les modèles des armes (épée, hache, bombe) et les armes tenues par les héros.

## 1.42.0 — 10 nov. 2026 (demande de Jimmy : refonte visuelle, 2e livraison : personnages et menus)

### Modifié

- **Personnages et ennemis plus lisibles.**
  - Un liseré de lumière borde les silhouettes : chaud sur le héros, de la couleur de son type sur chaque ennemi, plus fort sur les boss.
  - Les ombres tirent vers le bleu au lieu du gris, sur les personnages comme sur le décor.
  - Les contours sont plus fins.
  - Les ennemis ont des couleurs plus franches : on reconnaît leur type de loin.
- **Menus refaits.**
  - Panneaux à double liseré doré, titre de l'accueil en dégradé d'or, bouton « Jouer » à reflet.
  - Cartes de niveau, coffres et marchand : l'icône est dans un médaillon cerclé, le cercle et le fond de la carte disent la rareté (or, bleu rare, or lumineux épique).
  - Bibliothèque et succès : icônes en pastilles cerclées.
  - Barres de vie et d'XP à reflet.

### Technique

- `stylize()` (`src/render/toon.ts`) habille tous les matériaux toon : rampe lue en couleur, liseré par uniforme. Un seul programme de plus, aucun appel de rendu en plus.
- L'habillage des menus est entièrement en CSS : aucune image, aucune requête, mêmes classes et même structure (les tests ne changent pas).
- Les icônes restent celles du jeu (dessinées en couleur) : les remplacer par des pictogrammes monochromes d'un pack libre aurait fait perdre la couleur ; elles sont maintenant mises en valeur par les médaillons.
- Non refait : les modèles 3D eux-mêmes (héros, ennemis, armes tenues) et les effets des armes.

## 1.41.0 — 10 nov. 2026 (demande de Jimmy : refonte visuelle, 1re livraison : le monde)

### Ajouté

- **Sol texturé.** Chaque monde a son herbe et sa terre (textures Poly Haven, libres) : la terre apparaît sous les bois, au pied des arbres, au bord des lacs, sur les pentes et par plaques.
- **Décor stylisé** (pack libre « Ultimate Stylized Nature » de Quaternius) : arbres feuillus, bouleaux, érables, sapins, arbres morts, buissons, touffes d'herbe, fleurs et rochers.
- **Trois ambiances nettes** :
  - monde 1 : clairière verte ;
  - monde 2 : bois d'automne, érables rouges et tapis de feuilles ;
  - monde 3 : marais pâle, mousse, vase et arbres morts.
- **Cristaux d'XP à facettes**, à la place des petits carrés bleus.

### Modifié

- **Le jeu est beaucoup plus clair.** La brume ne couvre plus que le lointain, les lumières sont plus fortes, la nuit reste bleue mais lisible.
- Le halo des lanternes ne se voit plus que la nuit.
- La minicarte et la vignette de l'écran suivent les nouvelles couleurs.

### Technique

- Pipeline : `tools/assets/nature.ts` (lecture des FBX par le chargeur de three, troncs simplifiés, feuillage allégé, un atlas) et `tools/assets/ground.ts` (textures réduites et étalonnées). `npm run assets -- --nature` ne reconstruit que ce lot.
- `public/models/nature.glb` : 26 modèles, 331 Ko, arbres à 600 triangles au plus. Six textures de sol de 22 à 44 Ko. Rien n'entre dans le précache.
- Sol : un matériau à deux textures mélangées par un poids par sommet (`TerrainView`), frontière découpée par le grain de la texture.
- Sans les fichiers (hors ligne au premier lancement), le décor et le sol d'avant restent le repli.
- Mesures à 400 ennemis, au point le plus chargé du décor : sur mobile 36 appels de rendu et 113 000 triangles en rendu « pixel », 39 appels et 213 000 triangles en rendu net (budgets : 40 appels, 150 000 et 250 000 triangles).
- En rendu « pixel » (secours des téléphones lents), le semis se réduit à l'herbe, moins dense.
- Feuillage des arbres dessiné d'un seul côté, herbe sans découpe : mesuré en rendu logiciel, c'est le feuillage qui coûtait le plus.
- CI : limite de durée portée de 60 à 90 minutes (56 minutes en 1.40.0) ; trois tests navigateur attendent un état au lieu d'un délai fixe (reprise, bord de carte, Temps figé).
- Non mesuré ici : la fluidité sur un vrai téléphone.

## 1.40.0 — 10 nov. 2026 (demande de Jimmy : changer les touches sur PC)

### Ajouté

- **Touches du clavier configurables**, dans Réglages → « Touches du clavier » : Haut, Bas, Gauche, Droite, Saut, Glissade, Sort, Carte et Pause.
  - Clique sur une touche, puis appuie sur la nouvelle. Échap annule.
  - Si la touche sert déjà à une autre action, les deux actions échangent leurs touches.
  - « Touches par défaut » remet tout comme avant.
  - Les flèches (déplacement) et Échap (pause) marchent toujours, quel que soit le réglage.
  - Touches réservées, qu'on ne peut pas attribuer : flèches, Échap, Entrée, 1 à 4 (choix des cartes), R (relance), F1 à F12, Tab.
- Le bandeau des touches en jeu et l'écran « Comment jouer » affichent les touches choisies.
- Le réglage n'apparaît pas sur un téléphone ou une tablette sans clavier ni souris.

### Corrigé

- **Clavier AZERTY : la touche M ouvre la carte.** Avant, il fallait appuyer sur la virgule (la touche à l'emplacement du M d'un clavier américain).

### Technique

- Les touches choisies font partie des réglages : elles restent sur l'appareil et ne sont jamais envoyées au compte.
- `src/platform/keymap.ts` (règles, pur) et `src/ui/keys.ts` (grille, capture, noms des touches). La lecture du clavier ne fait aucune allocation par image.
- Tests : Vitest (9, dont 400 réglages tirés au hasard sans jamais deux actions sur la même touche) ; e2e `touches.spec.ts` (PC : changer, échanger, remettre, garder après rechargement ; mobile : réglage masqué).

## 1.39.0 — 10 nov. 2026 (phase 43 « Grand rééquilibrage », demande de Jimmy)

Un ami de Jimmy tenait plus de 15 minutes en monde infini sans avoir tout débloqué. Le jeu était trop facile sur la fin. Tout concentrer sur une seule arme était la stratégie la plus forte : cette build finissait toujours par dépasser les monstres.

### Modifié

- **Armes et tomes : niveau 40 au plus** (100 avant), comme dans Megabonk. Un niveau au plafond s'affiche en couleur dans la barre d'équipement.
- **Niveaux plus longs à partir du niveau 30.** Le début de partie ne change pas.
- **Objets : exemplaires limités par objet**, selon la rareté : commun ×5, rare ×3, épique ×2.
  - Le nombre total d'objets reste libre.
  - Les 2 premiers exemplaires valent plein, les suivants moitié (3 avant).
  - Un objet au plafond est marqué « max » et ne sort plus des tirages. La Bibliothèque indique le maximum de chaque objet.
- **Marchand plus cher** :
  - relance à 60 or, qui double à chaque relance de la visite (60, 120, 240…) et part de plus haut à chaque visite (avant : 40, 80, 120, remis à 40) ;
  - prix des objets +35 % par visite (25 % avant) et +25 % par objet porté (20 % avant).
- **Monde infini** :
  - le marchand passe **2 fois** (1:15 et 3:45), puis ne revient plus ; une bannière annonce « Dernier passage du marchand » ;
  - **un seul coffre par vague de boss**, laissé par le dernier boss, avec 1 objet (avant : un coffre de 2 objets par boss) ;
  - un boss tué rend **60 % des PV**, plus la totalité ;
  - la difficulté des monstres monte moins vite qu'en monde (voir « Technique »).
- **Mondes 2 et 3 plus durs** : les monstres y partent de plus haut. Le monde 1 ne change pas avant le premier boss.
- **Carte « Soin »** (quand tout est au plafond) : rend 30 % des PV, plus la totalité.

### Ajouté

- **Une attaque de plus par boss** :
  - **Gardien** : sa charge laisse un sillage de 4 cercles qui explosent derrière lui ; en phase 2, deux ondes à sauter coup sur coup ;
  - **Essaim-mère** : elle gonfle, puis crache un éventail de 5 projectiles à sauter (7 en phase 2) ; en phase 2, deux Volants sortent à chaque ponte ;
  - **Colosse** : une onde de choc part de lui quand on reste collé (un cercle se remplit d'abord à ses pieds) ; en phase 2, une attaque sur deux dessine une croix de cercles centrée sur le joueur.
- **Rage** : un boss du totem ou du monde infini en vie depuis 90 s devient rouge, attaque 40 % plus souvent et avance 25 % plus vite. Bannière « Le boss enrage ! ». Pas les boss de survie.
- **Boss du totem plus solides** : PV ×1,15 au monde 1, ×1,4 au monde 2, ×1,5 au monde 3 et en monde infini.

### Technique

- **Mesures** (bot moyen, 200 parties par profil, graine 42) :

  | Mesure                                                  | Avant       | Après       | Cible       |
  | ------------------------------------------------------- | ----------- | ----------- | ----------- |
  | Victoires, profil de départ (1 arme)                    | 33 %        | 24 %        | ≤ 30 %      |
  | Victoires, profil maxé (4 armes)                        | 34 %        | 19 %        | 5 à 28 %    |
  | Morts avant 3 min, profil de départ                     | 20 %        | 20 %        | ≤ 20 %      |
  | Monde infini, temps tenu médian (départ)                | 7:39        | 4:25        | 2:30 à 6:00 |
  | Monde infini, 1 partie sur 10 dépasse (départ)          | 17:51       | 7:52        | ≤ 12:00     |
  | Monde infini, 6 vagues passées (départ)                 | 24 %        | 0 %         | ≤ 5 %       |
  | Combat contre le boss du totem, médiane (départ / maxé) | 31 s / 38 s | 36 s / 47 s | 35 à 75 s   |

  Un joueur va environ deux fois plus loin que le bot : 15 minutes en monde infini restent possibles, mais c'est un exploit.

- **Profil intermédiaire** (2 armes, 3 tomes, 100 parties) : 36 % → 15 % de victoires. C'est le plus touché : ses dégâts sont répartis, et le boss du monde 3 l'élimine une fois sur deux.
- **Un levier à la fois** (profil intermédiaire) : les PV des boss, les nouvelles attaques et l'économie pèsent chacun 4 à 5 points de victoire ; le plafond de niveau et l'XP tardive, zéro dans les trois mondes (ils jouent en monde infini).
- **Écarts avec le plan** :
  - en monde infini, le soin par boss est de 60 % (35 % prévu) et les PV des boss par vague ne montent pas plus vite : avec le plafond de niveau, le monde infini était déjà trop court (2:48 en médiane au premier essai) ;
  - la difficulté y avance à 40 % de sa vitesse (`ENDLESS.diffRate`) : à pleine vitesse, c'est la horde qui tuait en 3 min, pas les boss ;
  - la rage vient à 90 s (75 s prévu) et épargne les boss de survie : ils vivent 110 s en médiane, la rage les touchait presque tous dès 3:00 ;
  - le « barrage » du Colosse est devenu une croix (une ligne s'évitait d'un pas) ;
  - pas de ligne ajoutée à l'écran « Comment jouer » (il ne liste que les commandes) : le plafond se lit sur le marqueur « max » et dans la Bibliothèque, le départ du marchand sur sa bannière et dans l'échoppe ;
  - les PV des boss montent par monde, et les boss de survie gardent leurs PV : à ×1,5 partout, les victoires du profil de départ tombaient à 16 %.
- **Bot** : il saute maintenant un éventail de crachats et le centre de la croix, comme un joueur. Avant, il restait planté et la simulation surestimait ces attaques de 10 points de victoire.
- **CLI** : `--set ENDLESS.diffRate=0.4,BOSS.hpMul.0=1` règle une constante sans toucher `balance.ts` ; avec `--endless`, la CLI imprime les objets et le niveau à la victoire et à la mort, les causes de mort en monde infini, la durée de vie des boss par sorte, et vérifie les cibles du monde infini. La CI les mesure sur le profil de départ.
- **Relecture perf** : approuvée. Aucune allocation par image, pool de tirs à 76/192 au pire avec 6 boss enragés. Trois corrections appliquées : seconde onde du Gardien jamais pendant sa charge, cercle d'annonce de l'onde du Colosse dessiné, remplissage des cercles du sillage. Le bench couvre maintenant 6 boss.
- **Classement** : les records faits avant la 1.39.0 restent affichés (décision à prendre par Jimmy).

## 1.38.0 — 10 nov. 2026 (choix de Jimmy : nouveau nom)

### Modifié

- **Le jeu s'appelle désormais Swarmageddon** (ex-Ruée Nocturne). Le nouveau nom apparaît :
  - sur l'écran-titre ;
  - dans le nom de l'onglet ;
  - dans le nom de l'app installée (Android, iPhone, PC) ;
  - sur la page À propos ;
  - dans le fichier de sauvegarde exporté ;
  - dans les notes de version.
- Les captures de la fiche d'installation et du store sont refaites avec l'interface actuelle et le nouveau titre.

### Inchangé

- **Ta progression reste là.** Les sauvegardes, le compte et le classement ne bougent pas.
- **L'adresse du site ne change pas** : ruee-nocturne.web.app. Le dépôt et le projet Firebase gardent aussi `ruee-nocturne`.
- Une sauvegarde exportée avant le changement de nom s'importe toujours, et inversement.
- Sur un appareil où le jeu est déjà installé, le nouveau nom sous l'icône peut demander de réinstaller l'app. Le navigateur met parfois du temps à appliquer ce changement.

### Technique

- `tools/store-shots.ts` : la capture du boss montre le boss de survie de 3:00. Le boss du monde ne vient plus seul à 5:00 depuis la phase 37.

## 1.37.1 — 10 nov. 2026 (retours de Jimmy)

### Corrigé

- **Le héros garde son élan à la reprise**, après une pause, une montée de niveau, un coffre ou le marchand.
  - Avant : au doigt, on lève le pouce pour toucher une carte, donc le joystick était relâché à la reprise et le héros restait planté. Au clavier, une touche relâchée pendant la pause donnait le même résultat.
  - Maintenant, le héros continue dans sa dernière direction jusqu'à 3 s, ou jusqu'à ce que tu reprennes la main (doigt reposé, touche, manette).
  - Le jeu repart aussi en douceur : le temps remonte de 35 % à 100 % en une demi-seconde. Ce n'est pas le cas avec « réduction des effets ».
- **Le marchand ne s'installe plus hors de la carte.** Près du bord, son échoppe pouvait tomber dans la lisière, hors d'atteinte. Elle reste maintenant toujours dans la zone jouable.

### Technique

- `InputManager.resume()` conserve la dernière direction (`CARRY_MS`). `backToPlay()` regroupe toutes les reprises dans `main.ts`. `FEEL.resume` règle l'accélération.
- Tests :
  - Vitest : 40 graines avec le joueur dans un coin.
  - e2e `resume.spec.ts` (clavier et doigt) : il échoue sans le correctif.

## 1.37.0 — 10 nov. 2026 (phase 42 « Boss de survie », demande de Jimmy)

### Ajouté

- **Deux boss de survie dans chaque monde**, à **3:00** et **7:00** du chrono (l'horloge affiche alors 7:00, puis 3:00), avant le boss du totem.
  - Ils arrivent tout seuls, en cercle autour de toi.
  - 10 s avant, une bannière annonce « Un boss de survie arrive ! », avec un grondement.
  - Le type tourne : ce ne sont jamais le boss du totem du monde, donc chaque monde montre ses trois boss.
- La barre de boss suit le boss de survie. Si le boss du totem est là, elle suit le boss du totem. Quand l'un tombe, elle passe à l'autre.

### Modifié

- **Un boss de survie se bat sans filet** :
  - il est aussi solide que le boss du totem à 3:00, et 1,4 fois plus à 7:00 ;
  - il ne soigne pas à sa mort ;
  - il laisse un coffre d'élite ;
  - il ne calme pas la horde.
- Seul le boss du totem ouvre le portail.
- Le passage du marchand de 7:00 passe à 7:30, pour ne pas tomber avec le boss.

### Technique

- **Équilibrage** (150 runs) : le profil nu gagne 34 % de ses parties (43 % avant) et meurt avant 3 min dans 20 % des cas (inchangé). Le profil maxé gagne 31 % (41 % avant).
- Premier essai, avec la récompense d'un vrai boss (soin complet, coffre de boss, horde calmée) : ça rendait la partie plus facile, le profil maxé passait de 41 à 53 % de victoires.
- Le boss du totem est suivi par son identifiant d'ennemi (stable dans le pool). La CLI gagne `--no-survival` et `--survival-hp`.

## 1.36.1 — 10 nov. 2026 (demande de Jimmy : jouer hors ligne)

### Modifié

- **Jouer hors ligne, synchroniser au retour du réseau** : la progression gagnée hors ligne part toute seule vers le compte dès que le réseau revient, sans rouvrir le panneau Compte.
  - Lancé sans réseau, le jeu recharge le compte au retour du réseau (avant, il fallait ouvrir le panneau Compte).
  - Un envoi raté alors que le téléphone se croit en ligne (wifi sans internet, serveur injoignable) est réessayé tout seul : 5 s, 15 s, 30 s, 1 min, 2 min, puis toutes les 5 min.
  - En revenant sur l'app, une progression pas encore envoyée part aussitôt.
- Le bouton du menu affiche « Compte · à synchroniser » tant que la progression attend le réseau.

### Technique

- e2e : partie jouée hors ligne puis envoyée au retour du réseau ; envoi raté puis réessayé (compte factice, aucun appel Firebase).

## 1.36.0 — 9 nov. 2026 (phase 41 « Défis par personnage »)

### Ajouté

- **3 défis par personnage**, à remplir en une partie avec lui, visibles sur sa fiche (barre de progression) :
  - **défi I** : un exploit de signature (son arme, son sort, sa traînée, ses kills en l'air…), il rapporte **500 or** ;
  - **défi II** : plus dur, il rapporte **1 500 or** ;
  - **défi III** : terminer les trois mondes avec lui, il débloque sa **tenue de maître** (or sur nuit), gratuite.
- L'écran de fin propose les défis du personnage joué parmi les objectifs les plus proches et annonce ceux qui tombent (« Bûcheron I : 500 or »).

### Technique

- La sim compte les ennemis tués par source (armes, traînée, sort), en l'air, les élites et les boss ; la méta garde par personnage ses meilleures valeurs en une partie (synchronisées avec le compte, règles Firestore : clé facultative).
- Objectifs calés sur le bot nu (100 runs par personnage) : défi I tenu dans 28 à 56 % des parties, défi II dans 6 à 25 % ; le défi III suit le taux de victoire du personnage (0 % pour le Sapeur nu, le plus dur).
- Héros : atlas teinté vers l'or pour la tenue de maître (cache par tenue). Portraits : `npm run portraits -- --master`.

## 1.35.0 — 9 nov. 2026 (phase 40 « Bibliothèque »)

### Ajouté

- **Bibliothèque** (bouton du menu) : toutes les armes, tous les objets, tomes et synergies, en quatre onglets (touches 1 à 4 au clavier).
  - Chaque fiche dit si l'entrée est **disponible**, **à acheter** (prix en or) ou **à débloquer** (le défi à remplir, avec sa barre).
  - Elle compte aussi les parties jouées avec chaque arme, objet, tome et synergie (« Pris dans 3 parties », « Jamais obtenu »).
- **Débloquer, puis acheter** : un défi rempli rend une arme ou un objet achetable ; l'or le débloque. Prix : objets communs 600, rares 1 500, épiques 4 000 ; armes 2 500.
- **12 objets à débloquer** pour un nouveau joueur, chacun derrière un défi : Phénix (5 boss), Couronne (20 min), Calice (15 min), Croc (2 000 ennemis), Rune (Érudit), Gant (carte à 3 lignes), Boussole (Marathon), Sablier (10 parties), Collier (50 élites), Corne (10 coffres de carte), Bouclier (monde 2), Souffle (2:30 en monde infini). 6 défis nouveaux.
- **Retirer du tirage** : un objet rare ou épique débloqué peut être retiré des coffres et du marchand, puis remis. Les communs restent toujours dans le tirage (retour de Jimmy).

### Modifié

- Les 5 armes à défi (Boomerang, Mines, Faux, Lance, Météores) s'achètent aussi une fois le défi rempli.
- **Joueurs actuels** : rien n'est perdu. Une sauvegarde qui a déjà joué garde les 12 objets et les armes dont le défi était rempli.
- Défi du jour : tout est disponible, rien n'est retiré (égalité entre joueurs).

### Technique

- **Équilibrage** (150 runs, profil nu = nouveau joueur sans les 12 objets) : victoire 43 % (46 % avec tous les objets), morts avant 3 min 20 %. Profil maxé inchangé (48 %).
- Méta v5 (`unlocks`, `itemsOff`, `codex`), synchronisée avec le compte ; règles Firestore : clés facultatives et bornées, vérifiées dans l'émulateur (10 cas). La CLI gagne `--items start|all`.

## 1.34.1 — 9 nov. 2026 (monde infini, décisions déléguées par Jimmy)

### Modifié

- **Le marchand revient en monde infini** : il passe à 1:15, puis toutes les 2:30, entre deux vagues de boss.
- **Les monstres normaux se renforcent deux fois moins vite** en monde infini : leurs PV font ×1,6 à 10 min et ×4 à 30 min (×2 et ×7 avant).

### Technique

- **Équilibrage** (150 runs, parties gagnées qui continuent) : profil nu, temps tenu médian 10:05 et 4 vagues (6:25 et 2 vagues avant) ; profil maxé, 3:09 et 1 vague (2:55). Le profil maxé meurt à la horde quelle que soit la montée : c'est son kit à quatre armes qui le limite, pas la rampe.
- La CLI de simulation gagne `--ramp` (échelle de la montée en monde infini). Une option sans valeur (`--endless`) n'avale plus l'option suivante.

## 1.34.0 — 9 nov. 2026 (phase 39 « Monde infini »)

### Ajouté

- **Monde infini** : après la victoire au monde 3, un écran te laisse **continuer** ou **terminer** (clavier : Entrée ou 1 pour continuer, Échap ou 2 pour terminer).
- **En monde infini** :
  - on reste sur la carte du monde 3, sans chrono qui s'écoule ni prolongation ;
  - des **boss** arrivent **toutes les 2:30** : 1, puis 1, puis 2, 2, 3, 3… jusqu'à 4 par vague (6 en vie au plus), plus solides à chaque vague, en cercle autour de toi ;
  - les monstres normaux se renforcent doucement de minute en minute.
- **Repères** : le chrono affiche « Monde infini » et le temps tenu ; la puce indique « Boss dans 1:12 » ; une bannière annonce « Vague n : x boss ».
- **Écran de fin** : il affiche le temps tenu et la vague atteinte. Le meilleur temps en monde infini est gardé.

### Modifié

- La puce d'objectif passe sous la barre de boss : elle cachait le nom du boss.
- Au classement, une partie infinie compte comme les trois mondes, plus le temps total.

### Technique

- **Équilibrage** (100 parties gagnées qui continuent) : profil nu, temps tenu médian 6:25, 2 vagues (90 % sous 12:41) ; profil maxé, 2:38, 1 vague. Le profil maxé meurt à la horde (Brutes) plutôt qu'aux boss. Les monstres normaux montent doucement en monde infini (PV ×2 à 10 min, ×7 à 30) : sans cette rampe, une bonne partie ne mourait plus.
- La victoire, les stats et le score ne sont comptés qu'une fois, à la fin réelle de la partie. Le bonus d'or de fin n'est payé qu'une fois.

## 1.33.2 — 9 nov. 2026 (retour de Jimmy)

### Modifié

- **Prix des coffres de carte** : le premier coûte **20 or**, puis le prix **double** à chaque coffre acheté (20, 40, 80, 160, 320…). Il ne monte toujours qu'à l'achat.
- Équilibrage (100 parties, victoire) : nu 46 %, maxé 49 % (1.33.1 : 47 % / 38 %).

## 1.33.1 — 9 nov. 2026 (retour de Jimmy)

### Modifié

- **Prix des coffres de carte** : il ne monte plus qu'à chaque coffre acheté. Tant que tu n'en achètes pas, il reste fixe : ni le temps ni les objets portés ne le font plus monter. Premier coffre à 80 or, puis +60 % par coffre acheté (80, 128, 205, 328…).
- **Équilibrage** (100 parties, victoire, avant → après) : nu 41 → 47 % (cible ≤ 40 %), maxé 31 → 38 %. Avec 40 or puis +35 %, le bot achetait 8 coffres par partie (49 % / 43 %) ; le prix ne monte plus avec le temps, ce qui rend les premiers coffres bon marché.

## 1.33.0 — 9 nov. 2026 (phase 38 « Classement et objets cumulables »)

### Ajouté

- **Classement en ligne** (bouton « Classement » du menu), pour les joueurs connectés :
  - trois onglets : **meilleure partie** (le monde d'abord, puis le temps), **plus longue survie**, **plus de kills** ;
  - **tous les temps** ou **cette semaine** (remise à zéro le lundi) ;
  - le top 50, avec le pseudo et le personnage ; ta ligne est surlignée, et ton meilleur score rappelé si tu n'es pas dans le top ;
  - un **pseudo** à choisir dans Compte (le prénom du compte Google est proposé) ; sans pseudo, rien n'est publié ;
  - tes meilleurs scores partent à la fin de chaque partie (ou au retour du réseau) ;
  - sans compte, l'écran invite à se connecter et aucune requête ne part.
- **Barre d'équipement** en bas de l'écran :
  - les icônes des armes avec leur niveau, puis celles des objets sur une pastille de leur rareté, avec « ×2 », « ×3 »… ;
  - sur téléphone, elle tient à côté des boutons Saut, Sort et Glisse (à l'opposé en mode gaucher) ; au-delà de la place, les plus anciens objets se regroupent en « +n » ;
  - l'écran de fin rappelle l'équipement de la partie.

### Modifié

- **Plus de limite d'objets** (6 avant) : un objet déjà pris peut revenir dans un coffre ou chez le marchand, la carte indique « Objet ×2 », et ses effets se **cumulent**. Les trois premiers exemplaires comptent en entier, les suivants à moitié.
- Cas particuliers du cumul :
  - les réductions (recharge de la Cape et de la Rune, rabais de la Bourse, dégâts subis de la Brume) se multiplient, dans les planchers existants ;
  - Talisman, Corne et Bouclier frappent plus souvent ;
  - Phénix : une réanimation par exemplaire plein ;
  - Fer à cheval : une offre de plus par exemplaire chez le marchand, deux au plus ;
  - Bottes : le saut une seule fois, l'onde d'atterrissage se cumule ;
  - Sablier et Plume ont un plancher ; la Boussole s'arrête à deux.
- Un coffre d'élite sur **ELITE** ouvre un choix d'objet ; les autres donnent un sac d'or (sans limite, une partie en comptait près de 28).
- En haut à gauche, il ne reste que le niveau, les PV, les tomes et les synergies.

### Corrigé

- Le **Sablier fêlé** ne ralentissait plus rien dès qu'on en avait deux.

### Technique

- **BALANCE**
- Règles Firestore : `scores/{uid}` et `weeks/{semaine}/scores/{uid}`, lecture réservée aux connectés (100 lignes au plus par requête), écriture du seul propriétaire, clés fermées, valeurs bornées, scores qui ne peuvent que monter ; vérifiées dans l'émulateur (27 cas). Le pseudo rejoint la progression synchronisée.
- Supprimer son compte retire aussi ses lignes du classement.

## 1.32.1 — 9 nov. 2026 (correctif)

### Corrigé

- **« Sauvegarde refusée par le serveur »** avec un compte : depuis la 1.12.0, la progression ne contient plus l'ancienne boutique par personnage, mais les règles Firestore l'exigeaient encore ; toute synchronisation était refusée. La règle la rend facultative (vérifié dans l'émulateur Firestore) et un test empêche qu'une règle exige à nouveau un champ absent.
- Test e2e « game feel » : le boss sort du totem depuis la 1.32.0 (il attendait un boss à 5:00).

## 1.32.0 — 9 nov. 2026 (phase 37 « Trois mondes »)

### Ajouté

- **Trois mondes** de 10 minutes chacun, chacun avec sa carte et son ambiance :
  - **Nuit bleue** ;
  - **Bois de braise**, à la brume ambrée ;
  - **Marais blême**, vert pâle et violet.
- **Le totem** de chaque monde :
  - une pierre rouge avec une colonne de lumière, en losange rouge sur la minicarte ;
  - une puce en haut de l'écran donne la direction et la distance ;
  - rester 3 s dans son cercle, tant que le chrono tourne, appelle le boss du monde : le Gardien, puis l'Essaim-mère, puis le Colosse ;
  - un rappel s'affiche à une minute de la fin.
- **Le portail** :
  - il s'ouvre si le boss tombe avant la fin du chrono ;
  - rester 1 s dedans mène au monde suivant, avec ta build, tes objets et ton or ;
  - tu peux aussi rester pour farmer.
- **La prolongation** :
  - le chrono passe en rouge et compte le dépassement ;
  - les monstres se renforcent de minute en minute (plus nombreux, plus solides, plus forts, plus rapides) : jouable au début, mortel en une à deux minutes et demie ;
  - si le boss n'est pas tombé à temps, le passage est fermé.
- **La victoire** : battre le boss du monde 3 à temps. Un boss final s'y ajoutera.
- **Écran de fin** : il affiche le monde atteint. Le menu garde le meilleur monde.
- **Revenante** : son succès devient « Termine les trois mondes ».

### Modifié

- Plus de boss à 5, 10 et 15 minutes, ni de Faucheur à 20 minutes.
- Chaque monde repart un peu plus bas qu'il ne finissait, puis monte plus haut que le précédent.
- Les PV du boss d'un monde ne dépendent pas de l'heure à laquelle on l'appelle : farmer rend le combat plus facile, le risque, c'est le chrono.
- Pendant le combat contre le boss, la horde se calme (apparitions ×0,6).
- Le marchand passe deux fois par monde.

### Technique

- **Équilibrage** sur 200 parties par profil ; le bot active le totem à 6:00 :

  | Profil         | Monde 2 | Monde 3 | Victoire |
  | -------------- | ------- | ------- | -------- |
  | Nu (1 arme)    | 50 %    | 45 %    | 36 %     |
  | Maxé (4 armes) | 86 %    | 46 %    | 10 %     |

- **Prolongation**, avec un bot qui reste farmer après le boss : mort à +1:28 en médiane (p90 +2:10, max +2:36).
- **Changement de monde** : la carte est reconstruite dans la même partie, à l'identique d'une partie neuve de même graine (test). Le fondu au noir monte pendant la seconde passée dans le portail.

## 1.31.3 — 9 nov. 2026 (retour de Jimmy : glissade collée au sol)

### Modifié

- **La glissade reste collée au sol** dans les collines, les pentes et les dénivelés, et aussi sur les bosses, les bords de plateau et les hauts de rampe. Tu sautes quand tu veux, comme sur le plat.
  - Seul le bord d'un tremplin fait encore décoller.
  - Mesure sur 12 cartes : en glissade sur le relief, aucun appui de saut perdu (0 sur 426, contre 3,7 % en 1.31.2) et aucun petit saut.
- **Pistes chronométrées faisables en glissant** : sur 60 pistes de 15 cartes, en glissant tout droit vers l'arrivée, 55 sont gagnées (14 en 1.31.2).
  - Les petits décollages faisaient perdre l'élan : 36 % du temps en l'air, et la pente n'accélère pas en l'air.

## 1.31.2 — 9 nov. 2026 (retour de Jimmy : glissade sur les pentes)

### Corrigé

- **Glissade sur le relief** :
  - **Plus de petits décollages** : sur les pentes et les dénivelés, la glissade décollait de quelques centimètres à chaque cassure du sol.
    - Mesure sur 12 cartes : 30 % du temps de glisse en l'air, un appui de saut sur trois perdu (29 %).
    - À la réception, la glissade reprenait : on restait en glissade.
    - Le corps allongé se mettait à plat, et la partie côté montée entrait dans le relief.
  - La glissade ne décolle plus que sur une vraie crête : bord de plateau, bosse, tremplin, haut de rampe.
- **Saut plus tolérant** :
  - juste après un décollage, un appui de saut compte encore pendant 0,12 s : c'est un saut depuis la glisse, avec réception debout ;
  - en l'air, un appui fait juste avant de toucher le sol (0,15 s) saute dès la réception.
  - Mesure sur 12 cartes : appuis perdus pendant une glissade sur le relief, de 29 % à 3,7 %. Ceux qui restent sont faits en plein vol au-dessus d'une crête, où on ne peut pas sauter.
- **Rendu** : pendant un court décollage depuis une glissade, le corps suit la pente au lieu de se mettre à plat.

## 1.31.1 — 9 nov. 2026 (retour de Jimmy : « trop d'effets »)

### Modifié

- **Bruitages moins denses**. Mesure sur 6 parties de 10 min jouées par le bot, en fin de partie (8–10 min) :

  |                              | 1.31.0 | 1.31.1 |
  | ---------------------------- | ------ | ------ |
  | sons par seconde             | 22     | 10     |
  | sons en même temps (moyenne) | 6,9    | 3,2    |
  | sons en même temps (pointe)  | 24     | 8      |

- **Coups, kills et gemmes plus espacés** :
  - coups : au plus 4 par seconde, au lieu de 12 ;
  - pas de son de coup juste après un kill ;
  - les kills d'une même rafale font un seul son ;
  - la montée de hauteur des gemmes est gardée.
- **Plafond de sons simultanés** :
  - chaque arme et chaque attaque ennemie a un écart minimal entre deux lectures ;
  - les petits sons se taisent quand 4 sons jouent déjà ;
  - un son qu'on n'a pas entendu depuis 0,8 s passe quand même : aucune arme ne devient muette.
- **Plus discret** : effets −1,5 dB, annonce des météores plus discrète.

## 1.31.0 — 9 nov. 2026 (phase 36 « Son propre »)

### Ajouté

- **Bruitages enregistrés** à la place des sons synthétisés. Chaque arme a son son :
  - **Orbe** : souffle ;
  - **Lames** : tranche au couteau ;
  - **Foudre** : zap ;
  - **Boomerang** : swoosh ;
  - **Mines** : coup sourd ;
  - **Faux** : coup d'épée ;
  - **Lance** : estoc métallique ;
  - **Météores** : sifflement à l'annonce.
- Les autres bruitages :
  - coups mats et os brisés sur les squelettes ;
  - impacts réverbérés sur le boss ;
  - coup de poing quand le héros est touché ;
  - pas sur l'herbe à la réception, étoffe au saut et à la glisse ;
  - pièces, jingles de niveau, de coffre, de victoire et de défaite ;
  - un son par bonus au sol ;
  - les attaques ennemies sont plus graves que les sons du héros.
- Chaque son a plusieurs variantes et une hauteur qui varie un peu : rien ne se répète à l'identique. Tous les sons sont ramenés au même niveau par catégorie, rien ne claque plus fort que le reste.
- **Musique de fond** :
  - en partie, « Dangerous Voyage », sous une ambiance de forêt la nuit ;
  - au menu, « Creppy Piano 1 » ;
  - fondu enchaîné entre les deux ;
  - en pause, au choix de carte et chez le marchand, la musique baisse et s'étouffe ;
  - elle se coupe quand l'appli passe en arrière-plan.
- **Réglages** : curseurs Effets et Musique (0 à 100 %), gardés sur l'appareil.

### Technique

- `npm run audio` (`tools/audio/`, ffmpeg) produit la planche de bruitages `public/audio/sfx.mp3` (92 sons, 399 Ko) et les musiques (1,75 Mo, 1,62 Mo, ambiance 0,36 Mo). Rien n'est téléchargé avant le premier geste. Les bruitages sont mis en cache pour jouer hors ligne ; la musique est lue en flux (sans réseau, pas de musique).
- Sans réseau, le jeu garde ses sons synthétisés.
- Crédits : Kenney (CC0), Oculus Audio Pack 01 (CC BY 4.0), HoliznaCC0 (CC0), dans `CREDITS.md` et la page À propos.

## 1.30.2 — 8 nov. 2026 (retour de Jimmy sur la glisse)

### Corrigé

- **Glisse parfaite dans la direction tenue** : en changeant de direction en l'air puis en re-glissant à la réception, la glissade part dans la nouvelle direction (même un demi-tour), avec la vitesse du saut. Avant, elle repartait dans la direction de l'ancien élan. Sans direction tenue, elle suit l'élan du saut.

## 1.30.1 — 8 nov. 2026 (retour de Jimmy sur la glisse)

### Modifié

- **Plus de vrille** : en l'air, la touche de glisse ne fait plus tourner le héros.
- **Glisse parfaite** : appuie sur glisse juste avant de toucher le sol (0,25 s) ou juste après (0,12 s). Tu repars en glissade avec l'élan du saut, sans attendre la recharge, et un élan de vitesse ×1,2 pendant 1,5 s. « Glisse parfaite ! » s'affiche.
  - Trop tôt, l'appui se perd ; trop tard, c'est une glissade normale.
  - Ça permet d'enchaîner proprement : glisse, saut, glisse parfaite, saut, puis un appui pour se relever.
- Le succès Acrobate (5 dans une partie, débloque la Lance) et l'Écharpe du vent comptent désormais les glisses parfaites.

## 1.30.0 — 8 nov. 2026 (phase 35 « Bonus au sol »)

### Ajouté

- **Bonus au sol** : cinq bonus à ramasser en marchant dessus. Ils apparaissent sur la carte devant le héros toutes les 45 à 70 s, et les ennemis en lâchent (souvent les élites, deux pour chaque boss). L'aimant ne les attire pas : il faut aller les chercher.
  - **Aimant** : toute l'XP de la carte arrive sur le héros.
  - **Pluie d'or** : or des ennemis ×2 pendant 15 s.
  - **Élan** : vitesse ×1,3 pendant 7 s.
  - **Temps figé** : ennemis, tirs et dangers immobiles pendant 3 s, et toujours touchables.
  - **Rage** : dégâts ×1,25 pendant 6 s.
- Au sol, chaque bonus est un gros cristal de couleur avec son icône. Il clignote avant de disparaître (30 s) et apparaît sur la minicarte.
- Au ramassage : une bannière, un son propre et une pastille avec la durée restante au HUD.
- Pendant le Temps figé : ennemis givrés et voile bleuté. Pendant l'Élan : silhouettes vertes. Pendant la Rage : lueur rouge autour du héros.
- PLAN.md : la liste des idées retenues pour la suite (Nuits, esquive parfaite, série sans dégât, etc.).

## 1.29.0 — 8 nov. 2026 (phase 34 « Une seule arme au départ »)

### Modifié

- **Tous les personnages commencent avec une seule arme, au niveau 1, et aucun tome** : les tomes se choisissent en partie.
- **Revenante** : elle ne part plus avec le Halo en plus de la Foudre. À la place, _frisson du tombeau_ : une aura de froid ralentit les ennemis à moins de 3,5 u (ils virent au bleu).
- **Colporteur** : il ne part plus avec les tomes Chance et Or. À la place, son passif _Marchand_ gagne un flair : +1 Chance et +40 % d'or ramassé, sans occuper d'emplacement de tome.
- Textes de personnages corrigés (Braconnier +35 PV, Feu follet −40 % PV).

## 1.28.0 — 8 nov. 2026 (phase 33 « Armes qui partent de zéro »)

### Modifié

- **Une arme débloquée part de zéro** : la carte « Nouvelle arme » donne l'arme de base seule — un projectile, une cible, aucune stat en prime. Ce sont les cartes suivantes qui ajoutent des projectiles, des cibles (Foudre, Lames…), des dégâts ou de la cadence.
- **Météores** : un seul météore au départ (deux avant), qui tombe plus souvent (toutes les 2 s) ; les cartes en ajoutent.
- **Colporteur et Braconnier** : ils partent eux aussi avec leur arme de base, sans améliorations ; le Braconnier gagne des PV en échange (+35).

## 1.27.0 — 8 nov. 2026 (phase 32 « Lames ciblées »)

### Modifié

- **Lames** : elles ne tournent plus autour du héros (le Halo fait déjà le cercle). Elles repèrent l'ennemi le plus proche et le tranchent : l'épée apparaît sur lui et balaie tout ce qui est autour, dans une zone qui grossit avec la taille (ligne « zone » de l'arme, tome Projectiles, synergie Tourbillon). Les cartes ajoutent des cibles par coup, de la zone, des dégâts et de la cadence.
- **Tourbillon** (Mouvement + Lames) : coups 30 % plus fréquents et zone +25 %.
- **Bûcheron** : part avec les Lames de base (avec ses anciens bonus, les nouvelles Lames le rendaient presque immortel) ; il garde ses +30 PV et son recul renforcé.

## 1.26.0 — 8 nov. 2026 (phase 31 « Relances et nouveaux objets »)

### Ajouté

- **Relancer les cartes** : à une montée de niveau, le bouton « Relancer » (ou la touche R) tire d'autres cartes que celles proposées. Une relance par partie au départ, et jusqu'à 3 de plus à acheter dans la boutique (500, 1 500 puis 4 000 or). Les coffres et les sanctuaires ne se relancent pas ; le marchand garde sa propre relance payante.
- **Douze nouveaux objets** :
  - **Soin** : Croc de vampire (vol de vie), Calice sanglant (chaque ennemi tué soigne), Mousse de troll (régénération), Second souffle (forte régénération quand les PV sont bas).
  - **Pourcentages** : Pierre à aiguiser (dégâts), Dé pipé (critique), Gant du bourreau (dégâts contre les ennemis affaiblis), Pendentif de brume (dégâts subis), Sandales ailées (vitesse), Amulette du savant (expérience), Armure d'écorce (armure).
  - **Couronne du berserker** (épique) : plus de dégâts quand tes PV baissent, avec un peu de vol de vie.
- **Chiffre vert** : les PV rendus par le vol de vie et le Calice s'affichent au-dessus du héros, une fois par seconde.

## 1.25.1 — 7 nov. 2026 (retour de Jimmy sur les éruptions)

### Modifié

- **Éruptions** : le cercle rouge apparaît toujours sous le héros, mais il ne le suit plus. Il pète là où il est apparu, un peu plus vite (0,65 s au lieu de 0,8 s) : on en sort en marchant, ou on le saute au bon moment.

## 1.25.0 — 7 nov. 2026 (phase 30 « Armes stylées »)

### Modifié

- **Effets d'armes redessinés** : orbes en boules de lumière avec une traînée or et rouge ; éclairs de Foudre épais et lumineux (on les voit enfin, aussi sur téléphone) ; la Faux trace un vrai arc de lame, aussi large que sa zone de coupe (jusqu'au tour complet) ; les Lames laissent un sillage en arc ; la Lance a une pointe lumineuse ; les météores tombent du ciel avant l'impact ; mines armées qui battent en rouge ; boomerangs avec une traînée ; Halo en anneau de runes qui tourne.
- **Boules de feu des Sorciers** : de vraies comètes de feu (cœur clair, halo orange, flammèches) au lieu d'une boule à facettes.
- **Foudre** : elle ne frappe plus qu'**un** ennemi au départ (avant : quatre), mais plus souvent ; les ricochets arrivent avec les cartes « +1 cible en chaîne » (deux fois plus fréquentes), le tome Projectiles et la synergie Orage (+3).
- **Météores** : un peu plus forts (recharge 2,5 s, 42 dégâts) : c'était l'arme la plus faible jouée seule.
- **Optimisation** : les projectiles, traînées et boules de feu partagent une seule famille de sprites lumineux (deux appels de rendu en moins quand ils sont à l'écran), et seules les instances réellement affichées partent vers la carte graphique à chaque image (avant, chaque famille d'objets renvoyait toute sa réserve, même vide).

## 1.24.1 — 7 nov. 2026 (retour de Jimmy sur le saut glissé)

### Modifié

- **Glisser puis sauter annule la glissade** : le héros reprend l'animation normale de saut, et la réception se fait debout, en course. L'élan de la glissade porte toujours le saut (on saute plus loin), et la vrille reste possible en l'air. Un envol depuis une crête ou un tremplin, lui, se réceptionne toujours en glissade.

## 1.24.0 — 7 nov. 2026 (phase 29 « Bordure et mouvements »)

### Ajouté

- **Bordure de la carte** : une lisière de forêt ferme la zone de jeu. Une rangée de rochers là où l'on bute, des sapins sombres derrière, un sous-bois qui se perd dans la nuit : fini le sol coupé net sur le vide et le mur invisible. Visible aussi sur la minicarte et la grande carte.

### Modifié

- **Glisser sur une piste** : le héros reste allongé en glisse sur les bosses, au lieu de se relever et de s'accroupir à chaque saut de bosse.
- **Réceptions** : en courant ou en glissant, on enchaîne sans s'accroupir ; l'accroupi ne se joue qu'après un vrai saut, à l'arrêt. Un saut glissé garde la pose de glisse en l'air.
- **Transitions plus douces** : chaque passage (course, repos, glisse, chute) a son propre fondu ; plus d'aller-retour course/repos à petite vitesse ; foulée qui ne s'emballe plus en sortie de glisse.
- **Corps vivant** : le héros se penche dans les virages et en démarrant, et suit la pente quand il glisse. La vrille part vite et s'amortit.

### Corrigé

- **Glissade au clavier** : relâcher puis réappuyer vite sur C ne relevait parfois pas le joueur (l'appui se perdait entre deux pas de jeu).

## 1.23.0 — 7 nov. 2026 (phase 28 « Pistes et trésors »)

Plus de choses à trouver et à faire, de vraies pentes pour rider, et une image pour chaque arme et chaque objet.

### Ajouté

- **Grandes pistes** : quatre par carte. Une montagne, une longue descente claire (neige tassée) ponctuée de bosses qui font décoller, et un tremplin au pied. D'autres tremplins attendent au bas des rampes : on y arrive en glissade, on s'envole, on vrille.
- **Pistes chronométrées** : une arche cyan en haut de chaque grande piste, une arche dorée en bas. Passer l'arche lance le chrono (affiché en haut de l'écran) ; arriver à temps, en glissant, donne un **coffre d'objet**, une fois par piste. Départs repérés sur la minicarte.
- **Trois armes** : **Faux** (un arc devant soi, recul fort), **Lance** (vers l'ennemi le plus loin, traverse tout), **Météores** (cercles dorés annoncés, puis impact de zone). Chacune avec ses lignes de stats, son critique, son son et sa couleur de chiffre.
- **Trois succès** pour les débloquer, liés à la glisse : glisser 1 000 u au total (Faux), 5 vrilles réussies dans une partie (Lance), ouvrir 50 coffres de carte (Météores).
- **Trois synergies** : Moissonneuse (Vitalité + Faux, soigne sur les coups), Volée (Projectiles + Lance, +1 lance), Pluie d'étoiles (Savoir + Météores, +1 météore).
- **Six objets** : Patins de braise (en glissade, on blesse ce qu'on traverse), Écharpe du vent (une vrille réussie soigne et recharge le sort), Plume (vols plus longs), Boussole (on découvre plus loin, coffres et sanctuaires visibles sur la carte), Bouclier (annule un coup toutes les 20 s), Corne de guerre (onde qui repousse et étourdit toutes les 25 s).
- **Icônes dessinées** pour les 9 armes, 8 tomes, 20 objets, 7 bonus de sanctuaire et 9 sorts : cartes de montée de niveau, coffres, marchand, HUD, bouton du sort, fiche personnage et succès.

### Modifié

- Le Bouclier annule le coup au moment où il est reçu : plus d'écran rouge ni de défi « Intouchable » perdu pour un coup bloqué.

## 1.22.1 — 7 nov. 2026 (retour de Jimmy sur la glissade)

### Modifié

- **Glissade droite** : elle part tout droit dans ta direction et ne fait plus de courbes (ni la pente de côté ni le joystick ne la font tourner) ; la pente ne change que la vitesse (plus vite en descente, elle cale en montée).
- **Se relever** : un second appui sur GLISSE (ou C) pendant la glissade remet debout ; relâcher ne coupe plus rien, au clavier comme au doigt.
- **Glisser, sauter, glisser** : après un saut glissé, la réception continue la glissade toute seule ; un appui relève.

## 1.22.0 — 7 nov. 2026 (phase 27 « Glisse et carte »)

Le terrain change de forme et le mouvement prend de l'élan : on glisse, on saute, on s'envole des plateaux, et chaque partie a sa propre carte à découvrir.

### Ajouté

- **Glissade** : C au clavier, X ou LB à la manette, bouton **GLISSE** au doigt (un appui suffit, la glissade dure tant qu'elle a de l'élan). Plus rapide que la marche au départ, elle **accélère dans les descentes** et cale en montée.
- **Saut glissé et envol** : sauter en glissant garde l'élan (la montée d'une rampe s'ajoute au saut) ; passer vite le bord d'un plateau fait décoller, et l'on vole d'autant plus longtemps que le sol descend.
- **Vrille** : en l'air après un saut glissé ou un envol, un appui sur glisse fait tourner le héros ; réussie à la réception (« Vrille ! »), elle donne un élan de vitesse ; ratée si l'on atterrit en pleine vrille.
- **Une carte par partie** : relief, lieux, coffres et sanctuaires tirés au hasard à chaque partie (même carte pour tous au défi du jour).
- **Carte à découvrir** : minicarte en haut à droite, grande carte (M, appui sur la minicarte, ou bouton « Carte » de la pause) ; ce qui n'a pas été vu reste dans le brouillard ; coffres, sanctuaires, marchand et boss y sont repérés, avec la part explorée.
- **Nouveaux lieux** : cimetières (clôture, tombes, stèle), campements abandonnés (tonneaux, caisses, un coffre au milieu), champs de citrouilles.
- Animation de glissade pour les neuf héros.

### Modifié

- **Relief en plans nets** : fini les collines molles ; des plateaux à flancs plans, des terrasses, de longues rampes (les pistes de glisse) et des combes à fond plat. Les flancs ont la couleur de la terre, les arêtes sont éclairées.
- **Carte plus remplie** : environ 1,5 fois plus de lieux, 30 coffres de carte (au lieu de 20), dont au pied des rampes et au fond des combes, 14 sanctuaires (au lieu de 10).
- Le Faucheur va toujours plus vite que le joueur, même lancé en glissade.

### Corrigé

- **Morts-vivants en lévitation** : les ennemis 3D gardaient la hauteur des anciennes silhouettes (centrées, donc posées en l'air) : de 0,5 m pour les petits à plus de 2 m pour le Gardien. Ils marchent maintenant pieds au sol, sans le petit saut des silhouettes ; seul le Volant (le crâne) reste en vol. Le sol du modèle est le point le plus bas de sa marche, pour qu'aucun pas ne s'enfonce. Test e2e : pieds à hauteur du sol pour le Spectre, la Brute, le Gardien et l'Archer, Volant en l'air.

## 1.21.3 — 7 nov. 2026 (correctif)

### Corrigé

- **Les anciens ennemis revenaient après la mise à jour** (« enemies.glb : zombie absent » dans l'onglet perf) : l'adresse du fichier des ennemis n'était pas versionnée (`?v=0`), donc le cache hors ligne de l'application continuait de servir le fichier d'avant la phase 26. Elle porte maintenant sa taille, comme les héros et les objets, et un test vérifie que chaque fichier du manifeste est versionné.
- Si le fichier reçu ne contient pas les ennemis attendus, l'essai suivant le retélécharge sans passer par le cache.

## 1.21.2 — 6 nov. 2026 (correctif)

### Corrigé

- **Diagnostic des modèles d'ennemis** : l'onglet perf (Pause → Perf) indique l'étape en cours (téléchargement, cuisson des poses, compilation des shaders), le temps de chargement ou l'erreur.
- La compilation des shaders des ennemis est plafonnée à 4 s : un pilote graphique lent ne peut plus bloquer le passage aux modèles 3D.

## 1.21.1 — 6 nov. 2026 (correctif)

### Corrigé

- **Ennemis en silhouettes roses au début d'une partie** : sur réseau mobile, et après chaque mise à jour (les modèles se retéléchargent), la partie démarrait avant l'arrivée des modèles 3D des ennemis. Le bouton « Jouer » attend maintenant les modèles (8 s au plus, puis la partie démarre quand même), et le chargement réessaie seul en cas d'échec.
- **Onglet perf** (Pause → Perf) : nouvelle ligne « modèles » qui indique si les ennemis 3D sont prêts, en combien de temps, ou l'erreur rencontrée.

## 1.21.0 — 6 nov. 2026 (phase 26 « Ennemis assortis »)

La horde change de visage : fini les squelettes de dessin animé, place à des morts-vivants dans le même style que les héros.

### Modifié

- **Morts-vivants** : zombies à la démarche traînante, coureuses à la dague, brutes à la hache, archers et lanceuses encapuchonnés ; peau gris-vert, vêtements ternis.
- **Boss** : le Gardien porte épée et bouclier, le Colosse une grande hache, l'Essaim-mère un cristal, le Faucheur une faux.
- Le Volant reste un crâne flottant.

## 1.20.0 — 6 nov. 2026 (phase 25 « Avatars HD »)

Les personnages passent en haute définition : visages détaillés, vêtements texturés, coiffures, et de nouvelles animations plus fluides.

### Modifié

- **Neuf personnages texturés** (Quaternius, CC0) : vraie tête avec yeux et sourcils, coiffures (chignon, cheveux longs, barbe, crâne rasé…), tenues de rôdeur ou de paysan teintées pour chacun, capuche pour la Veilleuse, le Braconnier et la Revenante.
- **Nouvelles animations** : course, saut, roulade, coup d'épée, lancer, sort, danse de victoire ; repos propre à certains (la Veilleuse lève sa torche, le Colporteur croise les bras, la Revenante titube).
- **Seconde tenue** : la couleur des vêtements change, le visage et les cheveux restent.

## 1.19.0 — 6 nov. 2026 (phase 24 « Nouveaux avatars »)

Les neuf personnages changent complètement de look : fini le style chibi, place à des héros adultes, plus fantasy, chacun avec sa silhouette.

### Modifié

- **Neuf nouveaux modèles** (Quaternius, CC0), un par personnage :

  | Personnage | Nouveau look                             |
  | ---------- | ---------------------------------------- |
  | Éclaireuse | aventurière, dague                       |
  | Bûcheron   | chemise rouge, salopette, chapeau, hache |
  | Sorcière   | chapeau pointu, robe violette, cristal   |
  | Veilleuse  | armure de cuir, épée et torche           |
  | Braconnier | barbe, sac à dos, arc                    |
  | Sapeur     | casque de chantier, gilet, pelle         |
  | Feu follet | crête et cheveux de flamme, flotte       |
  | Revenante  | robe spectrale, peau blême, faux         |
  | Colporteur | vieux roi couronné, bourse               |

- **Animations** : course, repos, saut, coup reçu, mort et une animation par sort, reprises des personnages animés du même auteur.
- **Tenues** : la seconde tenue de chaque personnage change les couleurs de ses vêtements (peau, cheveux et métal gardés).

## 1.18.0 — 6 nov. 2026 (phase 23 « Cartes de niveau variées »)

Les cartes de montée de niveau ne répètent plus la même ligne, et il y a beaucoup plus de façons de s'améliorer.

### Modifié

- **Une carte n'a jamais deux fois la même ligne** : fini « +10 % dégâts » trois fois ; on peut toujours monter une stat de carte en carte.

### Ajouté

- **Coup critique** sur toutes les armes : nouvelle ligne +5 % de chance (+3 % pour le Boomerang) ; un critique fait double dégâts et s'affiche en grand chiffre doré (« 37! »).
- **Halo** : chance de ralentir. **Foudre** : chance d'étourdir (pas les boss).
- **Nouvelles lignes de tomes** :

  | Tome      | Ligne                          |
  | --------- | ------------------------------ |
  | Dégâts    | dégâts critiques               |
  | Cadence   | recharge du sort               |
  | Vitalité  | PV rendus à chaque ennemi tué  |
  | Mouvement | saut plus haut                 |
  | Savoir    | soin à chaque niveau           |
  | Chance    | critique pour toutes les armes |
  | Or        | prix du marchand plus bas      |

## 1.17.0 — 6 nov. 2026 (phase 22 « Sorts rares, recharge à gagner »)

Le sort de chaque personnage devient un temps fort : il se recharge bien plus lentement, frappe plus fort, et la recharge se gagne.

### Modifié

- **Recharges ×2,5** :
  - Comète 6 s, Bond 8 s ;
  - Clignement 12 s, Pétard 14 s ;
  - Tourbillon et Collet 16 s ;
  - Éclat, Voile et Bourse 18 s.
- **Sorts plus forts** : dégâts ≈ +30 %, étourdissements, filets, voile et tourbillon plus longs ; le Bond lâche 7 orbes, le Clignement frappe 7 ennemis.
- **Tome du mouvement** : −8 % de recharge du sort par ligne (au lieu de −6 %). **Cape de brume** : −25 % (au lieu de −15 %).
- La recharge descend au plus à 35 % de sa durée de base, toutes sources cumulées.

### Ajouté

- **Rune de rappel** (objet rare) : recharge du sort −30 %.
- **Collier d'os** (objet rare) : chaque ennemi tué rend 0,1 s de recharge (1 s par seconde au plus) ; un boss, 4 s.
- **Sanctuaire de l'arcane** : −12 % de recharge du sort pour la partie.
- Le bouton du sort affiche les **secondes restantes** (« 18 » au doigt, « Maj Éclat 18 s » au clavier).

## 1.16.0 — 5 nov. 2026 (phase 21 « Ennemis en vrais modèles »)

La horde se lève : tous les ennemis sont des squelettes animés (pack KayKit Skeletons de Kay Lousberg, CC0).

### Ajouté

- **Ennemis en squelettes qui marchent et courent**, chacun avec son pas, jamais au même rythme que ses voisins :
  - Spectres : squelettes de base ;
  - Dards : petits squelettes rapides, lame en main ;
  - Brutes : grands guerriers casqués à la hache ;
  - Volants : crânes flottants ;
  - Cracheurs, Sorciers et Archers : ils prennent la pose quand ils visent (crachat, sort, arbalète).
- **Boss géants avec contour** : le Gardien au bouclier, l'Essaim-mère qui invoque, le Colosse à la hache, le Faucheur encapuchonné. Ils frappent ou incantent pendant leurs télégraphes.
- Les élites restent dorées, les ennemis étourdis pâlissent, les ralentis bleuissent, et un coup fait toujours flasher.

### Modifié

- Rendu « pixel » (téléphones faibles, repli automatique) : les squelettes y sont plus simples pour garder la fluidité.
- Les modèles des ennemis se chargent à la demande (≈ 580 ko) ; sans eux, les silhouettes d'avant restent.

## 1.15.0 — 5 nov. 2026 (phase 20 « Vraie 3D : héros, armes et décor »)

Les personnages, leurs armes et le décor passent en vrais modèles 3D, animés et dessinés à la main (packs KayKit de Kay Lousberg, domaine public CC0).

### Ajouté

- **Neuf héros en modèles animés** :
  - chacun a son allure : dague et cape pour l'Éclaireuse, hache à deux mains pour le Bûcheron, bâton et chapeau pour la Sorcière, épée et lanterne pour la Veilleuse, arbalète et capuche pour le Braconnier, casque et bouclier pour le Sapeur, baguette et lueur pour le Feu follet, squelette encapuchonné pour la Revenante, chope et chapeau pour le Colporteur ;
  - ils courent, sautent, se réceptionnent, encaissent et tombent ;
  - chaque sort a son geste : élan, moulinet, incantation, lancer, bras levés ;
  - les deux tenues de chaque personnage recolorent le modèle, sans toucher à la peau.
- **Armes en modèles** : épées en orbite pour les Lames, haches qui tournent à plat pour le Boomerang, bombes pour les Mines.
- **Objets** : coffres en bois cerclé, sanctuaire à bougies, échoppe du marchand avec caisses, tonneau et pièces.
- **Décor** : sapins d'automne, arbres morts, lanternes sur potence, petits cimetières (stèle, tombe, citrouille) au pied des arbres.
- Crédits KayKit dans CREDITS.md et la page À propos.

### Modifié

- Les modèles se chargent à la demande : chaque joueur ne télécharge que son héros et les objets (≈ 390 ko). Tant qu'ils ne sont pas là (hors ligne à la première visite), le jeu garde ses formes d'avant.
- Les ennemis ne changent pas encore (phase 21).

## 1.14.0 — 5 nov. 2026 (phase 19 « Un sort par classe »)

Chaque personnage a maintenant son propre sort, sur le bouton de l'ancien dash (Maj au clavier, bouton à l'écran).

### Ajouté

- **Neuf sorts de classe** :
  - **Bond** (Éclaireuse) : un élan invulnérable, puis 6 orbes en étoile.
  - **Tourbillon** (Bûcheron) : il tournoie 1,2 s, frappe tout autour et encaisse moitié moins.
  - **Clignement** (Sorcière) : elle se téléporte de 6 u, et des éclairs frappent là où elle était.
  - **Éclat** (Veilleuse) : une onde de lumière repousse et étourdit tout autour.
  - **Collet** (Braconnier) : il lance un filet ; les ennemis pris restent figés 3 s.
  - **Pétard** (Sapeur) : une explosion sous ses pieds le projette en l'air.
  - **Comète** (Feu follet) : un long élan qui laisse du feu.
  - **Voile** (Revenante) : 1,5 s de spectre, intouchable et rapide.
  - **Bourse** (Colporteur) : une bourse explosive, plus forte avec l'or que tu gardes.
- **Chaque sort a son son, sa gerbe et ses effets qui durent** : filet au sol, bras de lumière du Tourbillon, silhouettes du Voile. Les ennemis étourdis pâlissent, les ennemis ralentis bleuissent.
- **Nom et glyphe du sort** sur le bouton, à côté de la touche Maj et sur la fiche de chaque personnage.

### Modifié

- **Tome Mouvement** : réduit la recharge du sort (−6 % par ligne) et augmente sa puissance (+8 %), au lieu de jouer sur le dash.
- **Cape** : rend invulnérable 0,4 s après chaque sort et réduit sa recharge de 15 %.
- Le personnage ne clignote plus pendant l'invulnérabilité d'un sort, seulement après un coup encaissé.

## 1.13.1 — 5 nov. 2026 (suivi de la phase 18)

### Modifié

- **Braconnier** : une ligne de dégâts de départ en moins sur le Boomerang (dégâts, recharge, portée). Avec le relief, les coffres de carte et les sanctuaires, il survivait près de 4 min de plus que les autres sans améliorations (9:34 contre 5:46 sur 200 runs) ; il revient à 5:45, avec 11 % de morts avant 3 min et 10:49 en profil maxé (relecture `balance-playtester`).

## 1.13.0 — 5 nov. 2026 (phase 18 « Relief, exploration et rythme »)

La carte n'est plus plate ni vide : on monte, on descend, et il y a toujours quelque chose à aller chercher.

### Ajouté

- **Relief** : des collines douces partout sur la carte (jusqu'à 5–6 u de haut, jamais de falaise). Monter ralentit, descendre accélère, pour toi comme pour les ennemis. Les creux sont plus sombres et bleutés, les sommets plus clairs.
- **Coffres de carte** (20) : sur les sommets, dans les ruines et les cercles de pierres. Reste un instant dessus pour l'ouvrir ; il se paie avec l'or de la partie (40 or au départ, de plus en plus cher au fil des coffres et du temps). Il donne un objet au choix, ou un bonus pour la partie si tu portes déjà 6 objets.
- **Sanctuaires** (10) : reste 4 s dans le cercle de pierres pendant que les ennemis arrivent, puis choisis un bonus pour la partie parmi 3 (PV, dégâts, vitesse, recharge, collecte ou or).
- **Colonnes de lumière** au-dessus des coffres (dorées si tu peux payer, grises sinon) et des sanctuaires (bleues) : on les voit de loin.
- **Annonce des boss** : « Le Gardien approche… » 15 s avant, et moins d'ennemis les 10 dernières secondes pour se placer.

### Modifié

- Difficulté plus régulière : plus de « mur » à 10:00 (la montée de densité commence plus tôt et plus doucement), le Gardien a un peu moins de PV, la fin de partie est un peu moins raide.

## 1.12.1 — 5 nov. 2026

### Ajouté

- **L'or de la partie s'affiche en jeu**, à côté des ennemis vaincus, avec un petit rebond à chaque gain : on sait ce qu'on peut dépenser chez le marchand et ce qu'on gardera à la fin.

### Modifié

- Le Braconnier : un boomerang attrapé rend 30 % de sa recharge (au lieu de la moitié), et il part avec un Boomerang un peu moins fort ; il tenait trois fois plus longtemps que les autres personnages.

## 1.12.0 — 5 nov. 2026 (phase 17 « Marchand, objets passifs et synergies »)

La puissance ne s'achète plus entre les parties : elle se construit pendant la partie.

### Ajouté

- **Objets passifs** (12) : Plume de phénix (une réanimation), Cape de brume, Lanterne du veilleur, Cœur de pierre, Talisman orageux, Sablier fêlé, Épines, Bottes de saut, Œil du chasseur, Aimant d'âme, Fer à cheval, Bourse du colporteur. Chacun change une règle du jeu ; uniques, 6 au plus, affichés sous les armes.
- **Coffres** : un coffre propose 3 objets au choix (4 avec le Colporteur), un coffre de boss deux choix ; avec 6 objets, un sac d'or.
- **Le marchand** passe à 2:30, 6:30, 10:30 et 14:30 et reste 45 s : une flèche au bord de l'écran indique son échoppe. Y entrer met la partie en pause ; on achète avec l'or de la partie, on relance les offres ou on part. Clavier : 1–4, R, Échap ; boutons au doigt.
- **Synergies** (8) : une arme et le tome associé (3 cartes) déclenchent un bonus (Orage, Essaim, Brasier, Tourbillon, Charge creuse, Ricochet, Moisson, Rempart) ; à la montée de niveau, la carte qui en complète une est marquée « Synergie ».

### Modifié

- **La boutique par personnage est retirée** : tout l'or dépensé en paliers est rendu à l'ouverture du jeu. La feuille devient « Emplacements » ; l'or sert aux emplacements, aux personnages et aux tenues.
- Le Colporteur : ses coffres proposent 4 objets (au lieu d'au moins 3 cartes).
- Équilibrage refait sans la boutique : on monte de niveau plus vite (les cartes des coffres passent dans les niveaux) ; chaque synergie donne en plus des PV max et de l'armure, davantage à la 2e, à la 3e… Pour un joueur moyen simulé, une partie avec les emplacements de départ dure environ 6 min en médiane, avec tous les emplacements environ 10 min.

## 1.11.0 — 5 nov. 2026 (phase 16 « Carte construite et tireurs »)

Une carte pensée, toujours ouverte, et des ennemis qui tirent.

### Ajouté

- **Lieux construits** : ruines de murets en pierre (en L, en U, en croix, enceintes brisées), cercles de pierres autour d'une lanterne, troncs couchés, bosquets et lacs, répartis sur toute la carte ; la clairière de départ reste dégagée.
- **Obstacles utiles** : on franchit un muret ou un tronc d'un saut pour échapper à la meute, qui doit faire le tour ; murets, menhirs, arbres et rochers arrêtent les flèches et les crachats.
- **Archer** (dès 1:30) : garde ses distances, vise une demi-seconde (ligne fine) puis tire une flèche rapide ; un pas de côté, un dash ou un muret l'esquive. L'Archer doré tire une volée de trois.
- **Sorcier** (dès 4:00) : lance une boule de feu en cloche qui retombe là où vous étiez ; un cercle rouge se remplit au sol pendant le vol.
- Sons et éclats pour chaque tir, et pour un tir arrêté par un obstacle.

### Modifié

- **Toujours un accès aux ennemis** : les plateaux surélevés sont retirés ; les ennemis contournent les ouvrages par le chemin le plus court et trouvent toujours un passage (vérifié sur toute la carte).
- Le Cracheur arrive dès 3:00 (6:00 avant) ; au plus 24 tireurs à l'écran.
- Moins d'arbres et de rochers épars, mieux espacés : le terrain se lit.
- Après 15:00, les ennemis encaissent nettement plus : un personnage complet ne survit plus aussi souvent jusqu'au Faucheur (environ 7 % des parties au lieu de 20 %).

## 1.10.0 — 4 nov. 2026 (phase 15 « Direction artistique toon »)

Fini les cubes : ombrage toon à trois tons, contours sombres, formes arrondies.

### Ajouté

- **Rendu toon** : personnages, ennemis et décor passent à un ombrage à trois tons (ombre, demi-teinte, lumière) à bandes nettes ; le soleil est un peu plus fort pour que les tons se lisent la nuit.
- **Contours** : un contour bleu nuit presque noir entoure les personnages, les ennemis (plus épais sur les boss) et les plateaux. Il est cuit dans les géométries (coque inversée fusionnée) : aucun appel de rendu en plus, les budgets ne bougent pas.
- **Formes arrondies** : sur les personnages et les boss, toute boîte assez épaisse devient une boîte à bords arrondis (têtes, torses, corps du Colosse) ; les plaques fines (ailes, visières, lames) restent nettes. Les ennemis de masse gardent des boîtes simples sous leur contour (budget de triangles à 400 ennemis).

### Modifié

- Sol : plus de damier marqué, une prairie à peine mouchetée. Lanternes à la couleur chaude de la palette. Lumière de la nuit un peu plus présente.

## 1.9.0 — 4 nov. 2026 (phase 14 « Interface »)

Un menu de vrai jeu : la clairière plein écran, le personnage devant toi, des panneaux propres.

### Ajouté

- **Écran-titre immersif** : plus de voile ni de page qui défile ; la clairière 3D occupe l'écran, le personnage choisi se tient face à toi (à droite sur PC, au centre sur téléphone), le logo en haut, Jouer et Défi du jour en bas, et une barre d'icônes : Personnage, Boutique, Succès, Compte, Réglages.
- **Feuilles** : chaque bouton ouvre un panneau à en-tête commun (titre, croix) sur la clairière assombrie. Les personnages (grille, tenues) ont leur feuille ; l'aide « Comment jouer » aussi, affichée une fois au premier lancement et depuis les Réglages.
- Nouvelle palette **nuit bleue profonde, lanternes chaudes**, partagée par l'interface et le rendu (fond, brouillard, lumières).

### Modifié

- Système d'interface commun : boutons (doré, sombre à bord fin, icônes), cartes, pastilles, barres ; cartes de niveau et écran de mort restylés, HUD aux nouvelles couleurs. Page « À propos » et icône de l'app aux nouvelles couleurs.

### Corrigé

- Le libellé « Rendu : … » des réglages restait dans l'ancienne langue après un changement de langue.

## 1.8.0 — 4 nov. 2026 (phase 13 « Comptes »)

Un compte facultatif pour retrouver sa progression sur un autre appareil. Sans compte, rien ne change.

### Ajouté

- **Compte** (bouton « Compte » au menu) : connexion avec Google ou avec une adresse e-mail et un mot de passe (création, connexion, mot de passe oublié). La progression (record, or, boutique, succès, personnages, emplacements) est enregistrée sur le compte et retrouvée sur n'importe quel appareil ; les réglages restent propres à chaque appareil.
- Synchronisation : envoi après chaque changement (regroupé), lecture au menu ; au premier login sur un appareil qui a déjà une progression différente de celle du compte, le joueur choisit laquelle garder ; hors ligne, tout reste local et repart au retour du réseau.
- « Supprimer mon compte et ses données » (deux appuis) : la sauvegarde en ligne et le compte disparaissent, la progression locale reste.
- Règles de sécurité Firestore versionnées (`firestore.rules`) et déployées par la CI avant chaque mise en ligne.

### Modifié

- Politique de confidentialité (`PRIVACY.md`, page « À propos ») : deux modes, sans compte (rien ne quitte l'appareil) et avec compte (e-mail, identifiant et progression sur Firebase ; jamais les réglages, pas d'analytics).
- Le module Firebase n'est téléchargé qu'à l'ouverture du panneau Compte ou quand une session est connue : le premier chargement du jeu ne change pas, un joueur sans compte n'émet aucune requête (test automatisé).

### Corrigé

- Dans un champ texte (zone de sauvegarde, compte), Espace, Entrée et les chiffres restent au champ : avant, Espace était avalé par le saut et Entrée lançait la partie.

## 1.7.0 — 4 nov. 2026 (phase 12 « Lignes de stats »)

La progression en run devient longue et granulaire : les armes et les tomes se montent par petites lignes de stats, jusqu'à 100 fois.

### Ajouté

- **Lignes de stats** : chaque carte d'arme apporte 1 à 3 lignes tirées dans la famille de l'arme (dégâts, recharge, projectiles, vitesse, perforation, rayon, rotation, cibles, portée, mines, chaîne), chacune petite ; une arme s'améliore jusqu'à 100 fois. Les lignes en % se cumulent (×1,10 par ligne de dégâts d'arme), les lignes entières s'ajoutent (+1 projectile).
- **Tomes** : huit tomes remplacent les huit passifs : Dégâts, Cadence, Projectiles (+1 projectile pour toutes les armes, taille, vitesse), Vitalité (PV, régénération, dégâts subis), Mouvement (course, dash), Savoir (XP, collecte), Chance, Or. Une carte de tome tire aussi 1 à 3 lignes.
- **Rareté** : 1 ligne = commune, 2 = rare (cadre bleu), 3 = épique (cadre or). La chance (boutique, tome Chance) décale les tirages vers le rare et l'épique.
- Succès « Triple ligne » (prendre une carte épique) et « Érudit » (une arme à 25 améliorations dans un run) remplacent « Métamorphose » et « Métamorphe ».
- `npm run sim` : ligne `lignes` (lignes par carte, part d'épiques, niveau d'arme principale à 10 min), cible « arme principale à 10 min entre 15 et 30 ».

### Modifié

- **Plus d'évolutions** (Nova, Soleil noir, Tempête, Orage) : la puissance vient des lignes (décision de Jimmy).
- Courbe d'XP aplatie (≈ 3× plus de montées de niveau : ≈ 35 cartes à 10 min, une toutes les ~15 s) et montée des ennemis plus douce (PV t/170 avec un milieu de partie à /85 et une fin de partie raide après 15:00, dégâts t/500 puis très raides après 15:00, éruptions 12 PV, crachats 11) pour que la montée par petites lignes reste sensible.
- **Lames** : rayon de frappe de chaque lame 0,55 → 0,75 u. Un Dard collé au joueur passait sous l'anneau ; le Bûcheron et le Colporteur, qui en dépendent, mouraient avant 3 min dans 40–46 % des runs (3:12 et 3:24 de survie médiane) et reviennent à 5:04 et 4:51 (16 et 20 % de morts précoces). La ligne « taille » du tome Projectiles agrandit la lame (et sa frappe), plus l'orbite.
- Kit de départ converti en lignes fixes à puissance égale : Bûcheron et Colporteur partent avec Lames +2 lames et six lignes de dégâts (≈ l'ancien Lames 3 : 4 lames, 21 dégâts), le Braconnier avec Boomerang quatre lignes de dégâts, recharge et portée (≈ l'ancien Boomerang 2), le Colporteur avec deux lignes de Chance et trois d'Or (≈ Trèfle 1 et Bourse 1).
- Survie médiane (bot average, 100 runs) : départ **4:11** (4:40 en 1.6.0), 17 % de morts avant 3 minutes, 83 % passent 3 minutes ; personnage complet **14:59** (14:28), 23 % de runs jusqu'au Faucheur (15 % avant l'élargissement de la frappe des Lames : voir `docs/GATES.md`, écart à trancher). Le bot de simulation s'écarte désormais des crachats et concentre ses lignes sur son arme principale, comme un joueur moyen.

## 1.6.0 — 4 nov. 2026 (phase 11 « Mouvement utile »)

Le saut et le dash servent à autre chose qu'à fuir : on monte, on passe au-dessus, on traverse.

### Ajouté

- **Plateaux** : 14 disques de roche (2,5–4 u de rayon, 1,4 u de haut) répartis sur la carte, hors lacs et bois. Ils se montent d'un saut ; vu d'en bas le bord est un mur, on retombe en sortant. Les marcheurs et les boss butent au pied ; Volants, crachats, cercles du Colosse, onde du Gardien et éruptions atteignent toujours un joueur perché.
- **Éruptions** (dès 2:30) : une fissure rouge suit le joueur pendant 0,8 s (plus vite qu'il ne marche) puis un pic blesse (15 PV × montée des dégâts) et projette en l'air qui est encore au sol. Se saute à mi-télégraphe, ou se dashe. Toutes les 9 s au début, 4 s à 15:00.
- **Onde de choc du Gardien** : toutes les 6 s (3 s en phase 2), un anneau rouge part du boss et s'étend à 9 u/s jusqu'à 14 u ; il blesse une fois au passage (14 PV × montée des dégâts) et se saute.
- **Charge des Brutes élites** : couloir rouge au sol pendant 0,6 s puis charge en ligne de 7 u à 16 u/s (16 PV × montée des dégâts en un coup), suivie de 0,7 s d'essoufflement. Se traverse en dash (invulnérable) ou s'évite d'un pas de côté.
- Sons et effets dédiés (coup sourd d'éruption avec gerbe de roche, nappe de l'onde, grognement de charge) ; secousse d'écran sur l'éruption. Cause de mort nommée dans la CLI (`éruption`, `anneau`, `charge`, `crachat`, `zone`).
- Bots de simulation : l'`average` saute sur une éruption ou une onde imminente, dashe à travers une charge, et saute quand il bute (pied de plateau, arbre).

### Modifié

- Projectiles ennemis : plafond 96 → 128 (éruptions et ondes).
- Première éruption à 2:30 et dégâts 15 (× montée des dégâts) après mesure : à 2:00 et 20 PV, les morts avant 3 minutes passaient de 13 à 22 % ; à 18 PV, les éruptions faisaient jusqu'à 18 % des morts d'un personnage complet (porte ≤ 15 %), 10 % à 15 PV.
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
