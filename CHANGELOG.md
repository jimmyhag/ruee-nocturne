# Journal des modifications

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : [SemVer](https://semver.org/lang/fr/).

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
- `public/models/nature.glb` : 26 modèles, 364 Ko. Six textures de sol de 22 à 44 Ko. Rien n'entre dans le précache.
- Sol : un matériau à deux textures mélangées par un poids par sommet (`TerrainView`), frontière découpée par le grain de la texture.
- Sans les fichiers (hors ligne au premier lancement), le décor et le sol d'avant restent le repli.
- Mesures (PC 1280×720, monde 1) : 27 à 31 appels de rendu (budget 40), 74 000 à 86 000 triangles (budget 250 000).

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
