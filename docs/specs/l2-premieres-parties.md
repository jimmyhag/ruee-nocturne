# L2 — Dévoilement progressif et premières parties adoucies

**Statut : 🟡 Prêt pour le dev**

Session du 17 novembre 2026, avec Jimmy. Sparring mené **en délégation** : Jimmy a demandé
de tout réaliser sans lui redemander de confirmation. Chaque question a été tranchée par
la recommandation du sparring, qui vaut réponse de Jimmy ; il peut revenir sur n'importe
laquelle.

## Contexte

Lot L2 de `docs/specs/swarmageddon-mobile.md` (décisions 8 et 9), indicateur visé : D1.
Aujourd'hui un nouveau joueur reçoit tout dès la première partie : glisse, sanctuaires,
marchand, totem, crânes, coffres, bonus au sol. Sur mobile c'est trop d'un coup, et
22,3 % des parties du kit de départ meurent avant 3 minutes (cible : 20 % au plus).

Ce qui existe : `WorldOptions` (`src/sim/types.ts`) passe au monde le personnage, les
armes, les emplacements, les objets bannis ; `startGame()` (`src/main.ts`) le construit
depuis la méta ; `Meta.runs` compte les parties finies ; le bot et la CLI
(`tools/sim-cli.ts`, `tools/bots/`) jouent avec les mêmes options ; l'instantané de partie
(`src/meta/run-save.ts`, phase 49) restaure une partie interrompue.

À ne pas casser : **la progression des joueurs existants** (exigence de Jimmy : un joueur
qui a déjà joué ne perd rien, aucun système ne lui est retiré), le déterminisme de la sim,
le défi du jour identique pour tous (même graine, mêmes systèmes), la règle 13
(équilibrage par la simulation).

## Décisions

| # | Question | Décision | Pourquoi |
| - | -------- | -------- | -------- |
| 1 | Quels systèmes se dévoilent | Cinq étapes. **Partie 1** : déplacement, saut, armes automatiques, cartes de niveau, gemmes, coffres de carte, bonus au sol. **Partie 2** : + glisse. **Partie 3** : + sanctuaires. **Partie 4** : + marchand. **Partie 5** : + totem et crânes (donc les mondes 2 et 3, les totems de boss) | Ordre de la spec cadre ; le totem ouvre les mondes suivants, il vient en dernier |
| 2 | Comment le jeu sait où en est le joueur | Nouveau champ de progression `Meta.reveal` (0 à 4 : nombre d'étapes dévoilées). Il monte de 1 à la fin de chaque partie finie (mort, victoire, abandon après 60 s de jeu), jamais au-delà de 4 | Un compteur dédié plutôt que `runs`, que la migration peut fixer sans toucher au reste |
| 3 | Joueurs existants | **Migration** : une sauvegarde sans `reveal` dont `runs` > 0 reçoit `reveal = 4` (tout dévoilé, rien ne disparaît) ; sans partie jouée, `reveal = 0`. Même règle pour une progression reçue du nuage d'un ancien client. Un joueur qui a fini au moins une partie avant la mise à jour ne voit **jamais** un système retiré | Exigence de Jimmy |
| 4 | Synchronisation | `reveal` est une clé de progression (`PROGRESS_KEYS`) : ajoutée aux clés permises de `saves/{uid}` dans `firestore.rules` (entier 0 à 4, facultatif pour les anciens clients) ; le test de non-dérive l'impose. Fusion : le plus grand des deux | Un joueur qui change d'appareil garde son avancement |
| 5 | Dans la sim | `WorldOptions.reveal?: number` (absent = 4, tout). La sim ne crée ni sanctuaire (< 2), ni passage du marchand (< 3), ni totem, ni crâne, ni totem de boss (< 4) ; la glisse est refusée par la sim (< 1), pas seulement cachée. Le reste de la carte (coffres, bonus au sol, lieux) ne change pas | La règle vit dans la sim, testée sans navigateur ; le bot joue la même partie que le joueur |
| 6 | Interface | Le bouton GLISSE et sa touche sont masqués tant que `reveal` < 1 ; la minicarte et la grande carte n'affichent que ce qui existe. L'aide (« Comment jouer ») ne montre que les systèmes dévoilés | Ne pas montrer ce qui n'existe pas encore |
| 7 | Moment « Nouveau ! » | Au début de la partie qui dévoile une étape : bannière « Nouveau ! » avec le nom du système et une phrase qui dit quoi faire (textes ci-dessous), son de niveau, 4 s ; la première apparition du système dans la partie (premier sanctuaire, premier passage du marchand, premier totem) porte une étiquette « Nouveau » sur la minicarte jusqu'à la première interaction | Le joueur doit savoir quoi chercher, sans tutoriel bloquant |
| 8 | Défi du jour | Le défi du jour joue **toujours avec tout dévoilé** (`reveal = 4`) : même partie pour tous. Il ne fait pas monter `reveal`. Le bouton du défi reste disponible dès la première visite | Décision 6 de la spec cadre : même graine pour tous |
| 9 | Parties adoucies | Les **deux premières parties** (`reveal` 0 et 1 au lancement) ont un adoucissement en sim : `FIRST_RUNS` dans `balance.ts` (multiplicateurs de PV, de dégâts et de cadence d'apparition des ennemis), choisi avec la simulation pour que les morts avant 3 min soient **≤ 20 %** sur le kit de départ, **sans** que la survie médiane dépasse la cible du profil nu de plus d'1 min. Rien n'est affiché au joueur (« discrètement ») | Décision 9 de la spec cadre ; un réglage de difficulté se choisit par simulation (règle 13) |
| 10 | Mesure | La CLI reçoit `--reveal <0..4>` ; `npm run sim -- --runs 200 --bot average --seed 42 --profile naked --reveal 0` (puis 1) sur au moins 4 graines, regroupées. Les cibles du profil nu existantes restent vérifiées pour `--reveal 4` (inchangé) | Leçon de la phase 52 : deux graines ne prouvent rien |
| 11 | Partie interrompue | L'instantané de partie garde `reveal` et l'adoucissement : une partie reprise est identique | Phase 49 : reprise identique |

## Scénarios

# language: fr
Fonctionnalité: Dévoilement progressif et premières parties adoucies

  Scénario: La première partie n'a que l'essentiel
    Soit un nouveau joueur qui lance sa toute première partie
    Alors il dispose du déplacement, du saut, des armes automatiques et des cartes de niveau
    Et ni sanctuaire, ni marchand, ni totem, ni crâne n'apparaissent
    Et le bouton de glisse n'est pas affiché

  Scénario: Un système se dévoile avec un moment « Nouveau ! »
    Soit un joueur qui a terminé sa première partie
    Quand il lance la deuxième
    Alors la glisse est disponible
    Et la bannière « Nouveau ! » annonce la glisse

  Scénario: Tout est dévoilé à la cinquième partie
    Soit un joueur qui a terminé quatre parties
    Quand il lance la cinquième
    Alors sanctuaires, marchand, totem et crânes existent dans la partie

  Scénario: Un joueur qui avait déjà joué garde tout
    Soit une sauvegarde d'avant la mise à jour avec au moins une partie jouée
    Quand le jeu la charge
    Alors tous les systèmes sont dévoilés
    Et l'or, les succès, les personnages et les emplacements sont inchangés

  Scénario: Une progression du nuage d'un ancien client garde tout
    Soit une progression synchronisée sans champ de dévoilement avec des parties jouées
    Quand elle est appliquée à l'appareil
    Alors tous les systèmes sont dévoilés

  Scénario: La sim refuse la glisse avant qu'elle soit dévoilée
    Soit un monde créé avec le dévoilement à 0
    Quand l'entrée demande une glisse
    Alors le joueur ne glisse pas

  Scénario: Le défi du jour est le même pour tous
    Soit un nouveau joueur et un joueur ancien
    Quand chacun lance le défi du jour
    Alors les deux parties ont tous les systèmes et la même graine
    Et le dévoilement du nouveau joueur n'avance pas

  Scénario: Les deux premières parties meurent moins tôt
    Soit 800 parties simulées du kit de départ au dévoilement 0, puis 1
    Alors au plus 20 % meurent avant 3 minutes

  Scénario: Une partie reprise garde son dévoilement
    Soit une partie de dévoilement 1 interrompue puis reprise
    Alors elle continue sans sanctuaire ni marchand ni totem et avec le même adoucissement

  Scénario: La glisse se dévoile au clavier comme au doigt
    Soit un joueur à sa deuxième partie
    Alors la touche de glisse et le bouton GLISSE fonctionnent tous les deux

## UI & Layout Contract

- **Référence visuelle** : aucune ; la bannière reprend les bannières existantes (vague,
  boss, « Carte explorée »), avec le mot « Nouveau ! » au-dessus du nom.
- **Arbre de composants** :

  | Composant | Couche | Statut |
  | --------- | ------ | ------ |
  | Bannière « Nouveau ! » | `src/main.ts` (bannières) | réutilisée, deux lignes |
  | Étiquette « Nouveau » sur la minicarte | `src/ui/minimap.ts` | modifiée |
  | Bouton GLISSE masqué | `src/ui/hud.ts` / `index.html` | modifié |
  | Aide filtrée | `#help` | modifiée |

- **États** : nominal (bannière 4 s au début de la partie) ; joueur ancien : aucune
  bannière ; défi du jour : aucune bannière.
- **Focus** : la bannière ne prend pas le focus et ne bloque pas le jeu.
- **Libellés** (FR / EN) :
  - « Nouveau ! » / “New!”
  - Glisse : « La glisse — maintiens GLISSE en descente pour filer plus vite » / “Slide — hold SLIDE downhill to go faster”
  - Sanctuaires : « Les sanctuaires — reste dans le cercle pour gagner un bonus » / “Shrines — stand in the circle to earn a bonus”
  - Marchand : « Le marchand — il passe pendant la partie, dépense ton or » / “The merchant — he visits during the run, spend your gold”
  - Totem et crânes : « Le totem et les crânes — active le totem pour ouvrir le monde suivant ; les crânes durcissent la partie et la récompense » / “Totem and skulls — activate the totem to open the next world; skulls make the run harder and richer”
  - Minicarte : « Nouveau » / “New”

## Livraison

Version **1.58.0** ; `CHANGELOG.md` écrit pour les joueurs (les nouveaux joueurs
découvrent le jeu pas à pas ; rien ne change pour ceux qui ont déjà joué) ; mesures avant
et après dans `docs/GATES.md` (Lot L2) ; `PLAN.md` (premières parties) et skill
`survivor-design` (§9, cibles) mis à jour par les propriétaires après relecture.

## Hors périmètre

- Un tutoriel guidé ou bloquant.
- Le dévoilement des armes, objets, personnages : la Bibliothèque et les emplacements le
  font déjà.
- Afficher l'adoucissement au joueur.

## Concepts travaillés

| Concept | Avant | Après |
| ------- | ----- | ----- |
| Expérience de première partie (dévoilement progressif) | discovered | discovered |
| Migration de sauvegarde sans perte | — | discovered |
