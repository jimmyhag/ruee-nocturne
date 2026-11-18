# L5 — Paliers visuels d'arme

**Statut : 🟢 Implémenté**

Session du 17 novembre 2026, avec Jimmy. Sparring mené **en délégation** : Jimmy a demandé
de tout réaliser sans lui redemander de confirmation. Chaque question a été tranchée par
la recommandation du sparring, qui vaut réponse de Jimmy ; il peut revenir sur n'importe
laquelle.

## Contexte

Lot L5 de `docs/specs/swarmageddon-mobile.md` (décision 12), indicateurs visés : D7, D30.
La montée d'une arme est longue (100 améliorations, `LEVEL_MAX.weapon = 100` dans
`src/sim/balance.ts`) et faite de petits pourcentages : rien ne marque un cap. Les
évolutions d'armes restent retirées (décision de Jimmy, 4 nov. 2026).

Ce qui existe : le niveau de chaque arme dans le monde (sim) ; `Ev.LevelUp` pour le
niveau du joueur ; les effets de chaque arme dans `src/render/` (instances, couleurs,
`glowW`, `slashW`, traînées) ; la barre d'équipement (phase 38) ; bannières, particules,
tremblement, sons ; le réglage « réduction des effets ».

À ne pas casser : règle 1 (zéro allocation par image), règle 2 (budgets de PLAN.md §4.3 :
appels de dessin mobile, testés en e2e), règle 3 (chaque coup garde son feedback), la
lisibilité (le joueur reste identifiable, couleur orange réservée), l'équilibrage (un
palier est **visuel seulement** : aucune stat ne change).

## Décisions

| # | Question | Décision | Pourquoi |
| - | -------- | -------- | -------- |
| 1 | Paliers | Niveaux **25, 50 et 100** d'une arme (paliers I, II, III), constantes `WEAPON_TIERS` dans `balance.ts` | Décision 12 de la spec cadre |
| 2 | Effet sur le jeu | **Aucun** : ni dégâts, ni portée, ni cadence. La sim ne fait qu'émettre l'événement | Un pic de plaisir sans toucher l'équilibrage |
| 3 | Événement | La sim émet `Ev.WeaponTier` (arme, palier) quand une arme atteint 25, 50 ou 100, une fois par palier et par partie ; l'instantané de partie (phase 49) garde le palier atteint | La sim émet, le rendu et le HUD s'abonnent |
| 4 | Apparence | Par palier, pour toutes les armes, sans nouveau modèle : la **couleur** des projectiles et effets de l'arme passe à la teinte du palier (I argent bleuté, II or, III prisme qui tourne lentement), leur **taille** grandit de 8 % par palier, et une **traînée** ou lueur s'ajoute là où l'arme n'en a pas. Tout passe par les couleurs et matrices d'instance existantes (aucun appel de dessin en plus) | Visible en un coup d'œil sur toutes les armes ; budget perf tenu |
| 5 | Célébration | Au palier : bannière « Palier {I/II/III} — {arme} » 1,8 s, gerbe de particules à la couleur du palier autour du joueur, son de niveau plus aigu, tremblement léger (0,3) ; hit-stop de rendu 80 ms. En « réduction des effets » : bannière et son seulement | Game feel (skill `game-feel` §8) |
| 6 | HUD | Dans la barre d'équipement, l'icône de l'arme prend un liseré à la couleur du palier | Le palier reste visible après la bannière |
| 7 | Joueurs existants | Rien à migrer : les paliers sont propres à la partie | Exigence de Jimmy |
| 8 | Mesure | Le bench et le test e2e du budget d'appels de dessin passent avec une arme de chaque palier à l'écran ; captures d'une arme aux paliers 0, I, II, III lues | Règle 2 |

## Scénarios

# language: fr
Fonctionnalité: Paliers visuels d'arme

  Scénario: Une arme franchit un palier visuel
    Soit une arme au niveau 24
    Quand elle passe au niveau 25
    Alors son apparence change
    Et l'écran célèbre le palier

  Scénario: Un palier ne change aucune statistique
    Soit deux mondes identiques dont l'un franchit le palier 25
    Alors les dégâts, la portée et la cadence de l'arme sont ceux de son niveau, palier ou non

  Scénario: Chaque palier n'est célébré qu'une fois par partie
    Soit une arme qui atteint le niveau 25 puis 26
    Alors un seul événement de palier est émis

  Scénario: Les trois paliers ont des apparences distinctes
    Soit une arme aux niveaux 24, 25, 50 et 100
    Alors ses projectiles ont quatre couleurs différentes

  Scénario: Une partie reprise garde ses paliers
    Soit une partie interrompue avec une arme au palier II
    Quand elle est reprise
    Alors l'arme a l'apparence du palier II sans nouvelle célébration

  Scénario: Le budget d'appels de dessin tient avec des paliers
    Soit une partie mobile avec une arme de chaque palier
    Alors le nombre d'appels de dessin reste sous le budget

  Scénario: En réduction des effets la célébration est sobre
    Soit le réglage « réduction des effets » activé
    Quand une arme franchit un palier
    Alors la bannière et le son jouent, sans tremblement ni hit-stop

## UI & Layout Contract

- **Kit** : écrans et composants suivent le kit « Nocturne » (`docs/specs/ui-nocturne.md`, maquette `docs/design/menus/`) : couleurs, polices Barlow, un seul bouton plein, filets sans carte, barre d'onglets.

- **Référence visuelle** : aucune ; Jimmy verra les captures des quatre états dans la PR.
- **Arbre de composants** :

  | Composant | Couche | Statut |
  | --------- | ------ | ------ |
  | `WEAPON_TIERS`, `Ev.WeaponTier` | `src/sim/` | créé |
  | Teinte, taille, traînée par palier | `src/render/` (writers d'armes existants) | modifié |
  | Bannière, gerbe, son | `src/main.ts` (événements) | réutilisés |
  | Liseré de l'icône | barre d'équipement (`src/ui/hud.ts`) | modifié |

- **États** : nominal ; réduction des effets (sobre) ; qualité pixel (teintes lisibles).
- **Focus** : rien d'interactif.
- **Libellés** (FR / EN) : « Palier {n} — {arme} » / “Tier {n} — {weapon}”.

## Livraison

Version **1.62.0** ; `CHANGELOG.md` pour les joueurs ; `docs/GATES.md` (Lot L5, appels de
dessin avant/après, captures lues) ; relecture `perf-reviewer`.

## Hors périmètre

- Nouveaux modèles 3D d'armes ; le retour des évolutions (décision 12).
- Paliers pour les tomes.

## Concepts travaillés

| Concept | Avant | Après |
| ------- | ----- | ----- |
| Moment « waouh » et récompense visuelle sans effet de jeu | — | discovered |
