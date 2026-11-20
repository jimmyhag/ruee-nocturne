# Objets, lot A : sanctuaire doré, onze objets, Résonances

**Statut : 🟡 Prêt pour le dev**

Session du 20 novembre 2026, avec Jimmy, pendant ses essais de la 1.68.0. Version visée : **1.70.0**.

Jimmy : « je veux que tu réfléchisses à l'ajout de beaucoup beaucoup beaucoup d'objets différents, et dans le
sanctuaire je ne vois pas de stat projectile en plus […] des objets qui peuvent avoir une utilité à être pris ensemble
spécifiquement, sans le dire au joueur, ils découvrent par eux-mêmes ». Le sparring a proposé 32 objets en trois lots,
un sanctuaire doré et des combinaisons cachées (« Résonances ») avec un onglet « ? ? ? » dans la Bibliothèque. Jimmy,
le même jour : « finis tout […] je ne veux pas que tu me demandes ». Les trois questions restées ouvertes (objets à
malus, onglet « ? ? ? », commencer par le lot A) sont donc tranchées par le sparring, dans le sens de sa
recommandation : oui aux trois. Jimmy peut revenir dessus.

## Contexte

- **Objets** (`ITEM`, `ITEM_KEYS`, `ITEM_RARITY` dans `src/sim/balance.ts`, effets dans `src/sim/`, textes
  `item.<clé>.name|desc`) : 49 objets passifs, tirés dans les coffres (1 parmi 3) et chez le marchand ; règle de design :
  chaque objet change une décision, jamais un simple « +3 % », et aucun objet ne vaut plus de 2× l'objet moyen en survie
  (`npm run sim -- --no-item <clé>`). Plafonds d'exemplaires 5 / 3 / 2 (commun, rare, épique).
- **Bibliothèque** (`src/meta/library.ts`, écran à onglets) : un succès rend une arme ou un objet achetable, l'or le
  débloque ; on peut retirer un objet du tirage (`bannedItems`).
- **Sanctuaires** (`SHRINE`, 14 par monde, 4 offres) : le bonus « +1 projectile » existe mais pèse 1 contre 3 et se prend
  2 fois au plus : il apparaît environ une fois sur vingt, Jimmy ne l'a jamais vu.
- **Monde infini corrompu** (lot 1.67, `CORRUPT`) : son temps tenu p50 du profil nu (2:03 au CI de la 1.68) est sous sa
  cible (2:30–6 min) ; Jimmy n'a pas tranché, le sparring le ramène dans sa cible dans ce lot (décision 8).

À ne pas casser : la règle 1 (zéro allocation par pas, aucune closure dans `step`), le déterminisme (`w.rng`), la reprise
d'une partie gardée (instantané : une partie de la 1.69 reprend), la règle 3 (chaque coup a son retour), la règle 4
(clavier et tactile à parité), la règle 8 (la Bibliothèque et les Résonances découvertes font partie de la progression
locale ; synchronisées seulement avec un compte, comme le reste de `PROGRESS_KEYS`), la règle 13, le budget d'appels de
dessin mobile (PLAN.md §4.3), et la progression des joueurs existants (rien de ce qu'ils ont débloqué ne se reperd).

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Sanctuaire doré | Environ **1 sanctuaire sur 7** de chaque monde (tirage par `w.rng` à la génération de la carte, au moins 1 par monde) est **doré** : même règle de charge, mais il propose toujours **une stat forte** (+1 projectile, chances de critique, dégâts) parmi ses 4 offres, en plus des 3 autres tirées comme aujourd'hui. Reconnaissable de loin : colonne de lumière et teinte or, pastille dorée sur la minicarte. Le « +1 projectile » d'un sanctuaire doré compte dans le même plafond que celui des sanctuaires normaux (2), et ce plafond passe à 3 si la simulation le permet | Jimmy : « dans le sanctuaire je ne vois pas de stat projectile » |
| 2 | Onze objets | Les onze objets du tableau ci-dessous entrent dans le tirage **d'office** (ni succès ni or) ; ils apparaissent dans la Bibliothèque, qu'on peut retirer du tirage comme les autres. Rareté au choix du développeur selon leur force mesurée, au plus 3 épiques | Jimmy : « beaucoup beaucoup d'objets » |
| 3 | Objets à malus | Autorisés (un avantage net avec un prix clair, écrit sur la carte) ; ce lot n'en a qu'un (Aiguille), les autres viennent au lot B | Recommandation du sparring |
| 4 | Résonances | Dix **paires d'objets** déclenchent un effet caché (tableau ci-dessous). Rien ne les annonce : ni la carte d'un objet, ni la Bibliothèque avant la découverte. Quand un joueur possède pour la première fois les deux objets d'une paire dans une partie : bannière « Résonance découverte ! » avec son nom, son distinct, aura brève sur le héros ; l'effet est actif tant qu'il a les deux objets. Une Résonance déjà découverte s'annonce plus discrètement (« Résonance : nom ») | Jimmy : « sans dire au joueur, ils découvrent par eux-mêmes » |
| 5 | Onglet de la Bibliothèque | Un onglet **Résonances** : une case « ? ? ? » par Résonance non découverte (le nombre total est visible), puis son nom, ses deux objets et son effet une fois découverte. Les découvertes sont gardées dans la progression (`Meta`, migration sans perte, `PROGRESS_KEYS`) | Recommandation du sparring : savoir qu'il en reste donne envie de chercher |
| 6 | Bot et simulation | Le bot sait évaluer chaque nouvel objet (`cardValue`/valeur d'objet) ; la CLI imprime la part de chaque objet et la part des parties où chaque Résonance s'active. Aucune Résonance ne doit faire plus de +15 points de victoire au profil maxé quand elle est active (mesure par ablation ou comparaison des parties) | Règle 13 ; règle de design (pas plus de 2× l'objet moyen) |
| 7 | Équilibrage | 4 graines × 200 parties, profils nu et maxé, `--endless` : toutes les cibles existantes tenues (dans le bruit), aucun objet au-delà de 2× l'objet moyen en survie, taux de pick des armes 8–35 %, les neuf personnages à ± 3 min comme avant (pas pire). Leviers : les valeurs de chaque nouvel objet et de chaque Résonance, la fréquence et les offres du sanctuaire doré | Règle 13 |
| 8 | Monde infini corrompu | Le temps tenu p50 du monde infini (profils nu et maxé) est ramené dans sa cible 2:30–6 min ; leviers : `CORRUPT.share0/share1/rampT` seulement. Le défi du jour (sans corrompus) ne bouge pas | Ancienne décision en attente de Jimmy, tranchée par le sparring |
| 9 | Parties gardées | Une partie gardée en 1.69 reprend telle quelle (les sanctuaires déjà générés restent normaux, les nouveaux objets n'y apparaissent qu'aux tirages suivants) | Aucune progression perdue |

### Les onze objets

| Objet (clé) | Effet |
|---|---|
| Carquois fendu (`carquois`) | Chaque 5e projectile tiré part en double (même cible, même dégâts) |
| Prisme (`prisme`) | Un projectile qui touche un obstacle se divise en 2 projectiles plus faibles (50 %), qui repartent vers les ennemis les plus proches |
| Fronde (`fronde`) | Les projectiles grossissent et frappent plus fort avec la distance parcourue (jusqu'à +40 % à pleine portée) |
| Écho (`echo`) | 15 % des coups portés se répètent 0,3 s plus tard sur la même cible (60 % des dégâts) |
| Aiguille (`aiguille`) | +2 perforations à tous les projectiles, mais −10 % de dégâts (objet à malus) |
| Girouette (`girouette`) | Les projectiles font un demi-tour autour du héros avant de partir vers leur cible, touchant au passage les ennemis au contact |
| Clou de cercueil (`clou`) | Chaque 10e ennemi tué fige les ennemis dans un rayon de 5 u pendant 1 s (pas les boss) |
| Glu (`glu`) | Un ennemi qui touche le héros est ralenti de 40 % pendant 3 s |
| Gong (`gong`) | Chaque saut repousse les ennemis proches (rayon 3,5 u, recul fort, pas les boss) |
| Chaîne (`chaine`) | Une élite reste liée à son point d'apparition (rayon 6 u) : elle ne peut pas te poursuivre au-delà |
| Sel (`sel`) | Un monstre corrompu touché perd sa compétence pendant 2 s |

Valeurs indicatives : le développeur les règle par la simulation (décision 7) et note les valeurs finales dans
`docs/GATES.md`. Chaque objet a une icône SVG dans le style des autres, des textes FR/EN, et un retour visible ou audible
quand il agit (règle 3).

### Les dix Résonances

| Résonance | Paire | Effet caché |
|---|---|---|
| Soif sans fond | Croc de vampire + Calice sanglant | Le vol de vie peut dépasser les PV max : l'excédent forme un bouclier, jusqu'à 30 % des PV max |
| Ronces | Épines + Armure d'écorce | Les épines renvoient aussi les tirs ennemis qui touchent le héros |
| Vapeur | Cœur de glace + Patins de braise | La glissade laisse une vapeur qui ralentit **et** brûle |
| Main heureuse | Dé pipé + Fer à cheval | Une carte de niveau sur 10 devient épique (3 lignes) |
| Renaissance | Plume de phénix + Second souffle | La résurrection déclenche une explosion de feu autour du héros |
| Kaléidoscope | Carquois fendu + Prisme | Les projectiles doublés se divisent aussi en touchant un ennemi (pas seulement un obstacle) |
| Bas de laine | Tirelire + Bourse du colporteur | Le marchand offre un objet gratuit par monde (le moins cher de ses offres) |
| Glas | Clou de cercueil + Sablier fêlé | Les ennemis figés prennent ×2 dégâts |
| Marécage | Toxine + Glu | Les ennemis ralentis par la Glu sont aussi empoisonnés |
| Tonnerre | Écho + Talisman orageux | Les coups répétés par l'Écho déclenchent aussi un éclair |

## Hors périmètre

Les lots B (mouvement, risque, or) et C (boss, Arène, utilitaire) ; un nouveau type d'arme ; un changement des
sanctuaires normaux autre que la part dorée ; une refonte de l'écran de la Bibliothèque au-delà de l'onglet.

## Scénarios

```gherkin
# language: fr
Fonctionnalité: Objets du lot A, sanctuaire doré et Résonances

  Scénario: Un sanctuaire doré propose toujours une stat forte
    Soit un monde avec un sanctuaire doré
    Quand le joueur le charge
    Alors l'une des quatre offres est +1 projectile, chances de critique ou dégâts

  Scénario: Chaque monde a au moins un sanctuaire doré
    Soit une carte de monde générée
    Alors au moins un de ses sanctuaires est doré

  Scénario: Les nouveaux objets entrent dans le tirage d'office
    Soit un joueur sans aucun succès
    Alors les onze nouveaux objets peuvent sortir d'un coffre

  Scénario: Chaque nouvel objet agit et se voit
    Soit un héros qui porte un des onze nouveaux objets
    Quand la situation de l'objet se présente
    Alors son effet s'applique et produit un retour visible ou audible

  Scénario: Une Résonance se découvre en réunissant sa paire
    Soit un joueur qui n'a jamais découvert la Résonance Glas
    Quand il porte le Clou de cercueil et le Sablier fêlé dans la même partie
    Alors la bannière « Résonance découverte ! » s'affiche
    Et la Résonance est gardée dans sa progression

  Scénario: Une Résonance est active tant que la paire est réunie
    Soit un héros qui porte les deux objets d'une Résonance
    Alors son effet caché s'applique

  Scénario: La Bibliothèque garde le mystère
    Soit un joueur qui a découvert une Résonance sur dix
    Quand il ouvre l'onglet Résonances de la Bibliothèque
    Alors il voit cette Résonance avec ses deux objets et neuf cases « ? ? ? »

  Scénario: Les cartes d'objets ne dévoilent pas les Résonances
    Soit la carte d'un objet qui fait partie d'une Résonance
    Alors son texte ne parle pas de la Résonance

  Scénario: Le monde infini corrompu tient sa cible
    Soit la simulation du monde infini, profils nu et maxé
    Alors le temps tenu médian est entre 2 min 30 et 6 min

  Scénario: Les nouveaux objets restent équilibrés
    Soit la simulation de 4 graines × 200 parties, profils nu et maxé
    Alors les cibles existantes tiennent
    Et aucun objet ne vaut plus de deux fois l'objet moyen en survie
```
