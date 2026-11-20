# Rafales de projectiles, vraie faux, explications au bon moment

**Statut : 🟡 Prêt pour le dev**

Session du 20 novembre 2026, avec Jimmy, pendant ses essais de la 1.68.0. Version visée : **1.69.0**.

Jimmy, sur la fin de la partie guidée : « le message […] est bien mais écris-le en mode plus voyant et laisse la
possibilité de revenir au menu ». Sur le portail : « si la personne ne tue pas le boss la première fois, quand il
relancera et qu'il réussira à le tuer, il y aura aussi le message qui explique le portail ». Sur le chrono à 0 et le
monde infini : « si le joueur n'a jamais eu l'explication, un pop-up qui dit attention […] et qui explique rapidement la
différence » ; aux deux fenêtres proposées (prolongation et monde infini) : « oui les deux » ; jeu en pause : « ok ».
Sur les projectiles : « un projectile part vers un ennemi et il n'y en a pas 2, 3 ou 4 qui partent vers le même, un par
un, par rapport à la cadence et au nombre de projectiles, alors que sur Megabonk c'est le cas ». Sur la faux : « un
visuel de vraie faux qui fauche, et si on augmente les projectiles c'est deux faux en face du joueur […], le tour complet
si trop de projectiles ». Sur le totem : « dire "active le totem" induit en erreur dès le début de la partie : on peut
si on veut, mais il faut faire comprendre que ce n'est pas obligé tout de suite ». La question de l'orientation des faux
est restée sans réponse : la recommandation du sparring (décision 9) vaut réponse, Jimmy peut revenir dessus.

## Contexte

- **Fin de la partie guidée** (`tutorialOver`, `renderTutoEnd`, `src/main.ts`, `#tutoEnd` dans `index.html`) : la
  feuille « À toi de jouer ! » montre le résultat (`tuto.end.win|boss|horde`) en petit texte gris (`.note`) et un seul
  bouton, « Jouer ».
- **Consignes de première apparition** (`src/meta/guide.ts`, `Hint`, `meta.hints`) : elles tournent dans toutes les
  parties, une fois par joueur. `Hint.Portal` (« Un portail est apparu : entre dedans pour découvrir la suite ») est une
  petite ligne qui n'arrête pas le jeu. Rien n'explique la prolongation ni le monde infini.
- **Projectiles en plus** (`src/sim/weapons/tick.ts`) : l'Orbe tire ses `n` projectiles en même temps vers les `n`
  ennemis les plus proches ; la Lance en éventail vers l'ennemi le plus loin ; le Boomerang devant, puis derrière, puis
  sur les côtés ; le Fouet claque devant, derrière, puis sur les côtés. Le tome Projectiles et le bonus de sanctuaire
  ajoutent à `n` (`P.projAdd`, `weaponStats`).
- **Faux** : un arc devant le héros (`arc` 120°, ligne « +15° d'arc » jusqu'au cercle complet), dessiné comme un trait
  lumineux (`Ev.Scythe`, `slashW`). Elle n'a pas de `n` : les projectiles en plus ne la changent pas.
- **Objectif du HUD** : « Active le totem » (`goal.totem`) dès la première seconde de chaque monde.

À ne pas casser : la règle 1 (zéro allocation par pas, aucune closure dans `step`) ; le déterminisme (`w.rng`) et la
reprise d'une partie gardée (instantané) ; la règle 3 (chaque coup a son retour) ; la règle 4 (clavier et tactile à
parité) ; la règle 13 (tout réglage choisi par la simulation) ; le budget d'appels de dessin mobile (PLAN.md §4.3).

## Décisions

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Fin de la partie guidée | Le résultat devient le **titre** de la feuille, en grand : « Tu as battu le Gardien ! » (doré) ou « Le Gardien était trop fort… pour cette fois » / « La horde a eu raison de toi… pour cette fois » ; la phrase d'encouragement reste dessous. Deux boutons : **Rejouer** (comme « Jouer » aujourd'hui) et **Retour au menu**. La partie guidée est finie dans les deux cas (rien ne change dans ce qu'elle compte) | Jimmy |
| 2 | Le portail expliqué | La première ouverture d'un portail (toute partie, une fois par joueur, guidée ou non) ouvre une **fenêtre** qui met le jeu en pause : le chrono est tombé à 0, le portail mène au monde suivant, et rester fait se renforcer les monstres minute après minute (corrompus compris). Bouton « Compris ». Elle remplace la ligne `Hint.Portal` ; un joueur qui l'a déjà vue (bit de `meta.hints`) ne la revoit pas | Jimmy : l'explication arrive la première fois que le joueur tue le boss, même hors partie guidée |
| 3 | La prolongation annoncée | La première fois que le chrono d'un monde atteint 0 **sans** que son boss ait été tué (une fois par joueur) : fenêtre « Temps écoulé ! » : les monstres se renforcent chaque minute et la nuit les corrompt ; active la statue rouge, tue le boss et prends le portail. Si le boss est tué avant (chute du chrono), c'est la fenêtre du portail (décision 2) qui l'explique | Jimmy |
| 4 | Le monde infini annoncé | La première entrée dans un monde infini (une fois par joueur, défi du jour compris) : fenêtre « Monde infini ! » : plus de chrono, une vague de boss toutes les 2 min 30, des monstres toujours plus forts ; tiens le plus longtemps possible. Le texte ne parle pas de corrompus (le monde infini du défi n'en a pas) | Jimmy : « oui les deux » |
| 5 | Les fenêtres | Feuille dans le style des autres (titre, deux ou trois lignes, bouton « Compris », focus clavier sur le bouton, Entrée/Espace et toucher), jeu en pause pendant qu'elle est ouverte ; une feuille déjà ouverte (carte de niveau, coffre, marchand) passe d'abord, la fenêtre attend. Bits dans `meta.hints` (synchronisés comme aujourd'hui) | Jimmy : « pause ok » ; règle 4 |
| 6 | Rafale de projectiles | Les projectiles en plus de l'**Orbe**, de la **Lance**, du **Boomerang** et du **Fouet** ne partent plus en même temps : une **rafale**, un projectile après l'autre (écart `BURST.gap`, de l'ordre de 0,08 s, toujours plus court que la recharge), chacun vers la cible de l'arme **au moment où il part** : la première, dans l'ordre de l'arme, qui n'est pas **couverte**. Une cible est couverte quand les dégâts déjà en route vers elle suffisent à la tuer, ou quand elle a déjà reçu `BURST.maxSame` projectiles de cette rafale (2, ou 3 si élites et boss tiennent nettement plus longtemps à la simulation). Si toutes les cibles à portée sont couvertes, le projectile repart vers la première : un ennemi seul reçoit toute la rafale, un ennemi solide dans la horde en reçoit deux et le reste va à la horde, une horde fragile reçoit un projectile chacun ; une cible qui bouge ou meurt fait tourner la rafale vers la suivante. La recharge part du premier tir | Jimmy : « comme Megabonk », « un par un » ; puis (précisions du 20 nov.) garder le multi-cible, et qu'une élite proche n'absorbe pas toute la rafale pendant que la horde avance |
| 7 | La cible de chaque arme | Orbe : l'ennemi le plus proche (aujourd'hui : un ennemi différent par projectile). Lance : l'ennemi le plus loin à portée (aujourd'hui : éventail). **Boomerang** : l'ennemi le plus proche (aujourd'hui : direction du regard puis dos et côtés). **Fouet** : l'ennemi le plus proche à sa portée, sinon la direction du regard (aujourd'hui : devant, derrière, côtés). Sans ennemi, l'arme attend comme aujourd'hui. Foudre, Météores, Mines, Lames, Vitriol, Esprits, Balise : inchangés | Jimmy : « tirés tous normalement vers les cibles existantes » |
| 8 | La vraie faux | Un modèle de **faux** (manche et lame courbe, procédural ou CC0, contour et teinte de l'arme) apparaît à chaque coup et **fauche** son arc (balayage ≈ 0,25 s, traînée), à la place du trait lumineux. Son, flash, recul et chiffres comme aujourd'hui (règle 3) | Jimmy |
| 9 | Plusieurs faux | La faux gagne un nombre `n` (1 au départ) que le tome Projectiles et le bonus de sanctuaire augmentent comme les autres armes, et une ligne « +1 faux » **remplace** la ligne « +15° d'arc ». Chaque faux couvre un arc fixe (≈ 120°) ; les faux se placent **côte à côte, centrées sur la direction du regard** : 1 faux devant, 2 faux couvrent tout l'avant, 3 faux et plus le tour complet. Elles fauchent ensemble | Jimmy : « deux faux en face du joueur », « le tour complet si trop de projectiles » ; le regard garde la faux maniable (recommandation du sparring) |
| 10 | Le totem n'est pas pressé | Objectif du HUD : **« Survis · totem quand tu es prêt »** pendant le chrono ; **« Active le totem »** en rouge qui pulse dans la dernière minute, puis rouge vif une fois le chrono à 0. Partie guidée : le totem de boss est dit **facultatif** (« Totem de boss, facultatif : un boss de plus à chaque vague, plus de récompenses. Essaie-le ici. ») ; « Comment jouer » commence la phrase du totem par « Rien ne presse : » | Jimmy : « faut faire comprendre que c'est pas obligé tout de suite » |
| 11 | Parties gardées | Une partie gardée en 1.68 reprend : ses lignes d'arc de faux deviennent des faux (une faux de plus par tranche de 120° gagnée, arrondi au plus proche, au plus le tour complet) ; aucune rafale en cours n'est perdue à la reprise (l'état de la rafale est dans l'instantané) | Aucune progression perdue |
| 12 | Équilibrage | Réglé par la simulation (règle 13), 4 graines × 200 parties, profils nu et maxé : taux de pick de chaque arme entre 8 et 35 %, cibles existantes inchangées (dans le bruit), les neuf personnages à ± 3 min de l'Éclaireuse. Leviers : dégâts de base et `BURST.gap` de l'arme touchée, arc et plafond `n` de la faux. Le défi du jour et la partie guidée changent avec les armes : leurs cibles (médailles, fin de guide) restent tenues Amendement (sparring, 20 nov.) : les cibles existantes priment sur cette liste de leviers ; les PV des trois boss que la rafale entière frappe seul (boss final, boss final du défi du jour, boss de la partie guidée) sont aussi des leviers, réglés au centre de leurs cibles (boss final vaincu ≈ 50 %, argent au défi ≈ 20–25 %, boss guidé abattu ≈ 55–70 %) ; ni l'Orbe ni `BURST` ne bougent | Règle 13 |

## Hors périmètre

Les nouveaux objets et les combinaisons cachées (lot suivant) ; un changement des autres armes ; une nouvelle musique ;
une nouvelle consigne pour les crânes ou les totems de boss.

## Scénarios

```gherkin
# language: fr
Fonctionnalité: Rafales, faux et explications au bon moment

  Scénario: La fin de la partie guidée se lit d'un coup d'œil
    Soit un joueur qui meurt pendant la partie guidée
    Alors la feuille de fin montre son résultat en titre
    Et elle propose « Rejouer » et « Retour au menu »

  Scénario: Le portail s'explique une seule fois
    Soit un joueur qui n'a jamais vu de portail
    Quand le boss d'un monde meurt
    Alors une fenêtre explique le portail et le chrono à 0, le jeu en pause
    Et elle ne revient pas au portail suivant

  Scénario: Le temps écoulé s'annonce une seule fois
    Soit un joueur dont le chrono atteint 0 sans avoir tué le boss du monde
    Alors une fenêtre « Temps écoulé ! » explique la prolongation, le jeu en pause, une seule fois

  Scénario: Le monde infini s'annonce une seule fois
    Soit un joueur qui entre pour la première fois dans un monde infini
    Alors une fenêtre « Monde infini ! » explique ce qui change, le jeu en pause, une seule fois

  Scénario: Les projectiles en plus partent en rafale
    Soit une Orbe à 3 projectiles et un seul ennemi immobile
    Quand elle tire
    Alors les 3 projectiles partent l'un après l'autre vers cet ennemi

  Scénario: La rafale suit la cible du moment
    Soit une rafale en cours dont la cible meurt
    Alors le projectile suivant part vers le nouvel ennemi le plus proche

  Scénario: Un ennemi solide seul reçoit toute la rafale
    Soit une Orbe à 5 projectiles et un seul ennemi solide à portée
    Quand elle tire
    Alors les 5 projectiles partent l'un après l'autre vers lui

  Scénario: Un ennemi solide dans la horde reçoit deux tirs et le reste va à la horde
    Soit une Orbe à 5 projectiles, une élite proche et trois monstres fragiles plus loin
    Quand elle tire
    Alors les 2 premiers projectiles partent vers l'élite
    Et chacun des trois monstres fragiles reçoit un des 3 suivants

  Scénario: Une rafale se répartit sur des ennemis fragiles
    Soit une Orbe à 3 projectiles et trois monstres qu'un projectile suffit à tuer
    Quand elle tire
    Alors chacun reçoit un projectile

  Scénario: Les faux couvrent l'avant puis tout le tour
    Soit une faux avec 1, puis 2, puis 3 faux
    Alors elles fauchent l'avant, puis tout l'avant, puis le tour complet du héros

  Scénario: Le totem n'est pas pressé
    Soit le début d'un monde
    Alors l'objectif dit qu'on active le totem quand on est prêt
    Et il demande d'activer le totem dans la dernière minute du chrono

  Scénario: Les armes restent équilibrées
    Soit les profils nu et maxé sur quatre graines
    Alors chaque arme est choisie dans 8 à 35 % des parties et les cibles existantes tiennent
```
