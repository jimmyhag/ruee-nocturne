# Phase 6 — Personnages (proposition validée par Jimmy le 3 nov. 2026 ; mesures finales dans `docs/GATES.md`)

Objectif : passer de 3 profils de stats à **8 personnages** qui changent la façon de jouer, débloqués par un mélange de succès, d'or et de défis. Chaque personnage = une arme de départ + un passif signature (une règle de jeu, pas un pourcentage) + une condition de déblocage qui est elle-même un objectif. C'est la boucle méta « encore une » de PLAN.md §2.4, dans l'esprit de Megabonk, sans toucher au cœur du jeu.

Ce document sert à décider **avant de coder** : noms, passifs, conditions et prix sont des propositions. Ce qui est coché « sim » existe déjà dans `src/sim/` et rend le passif réalisable sans nouvelle architecture.

## Le roster

| #          | Personnage                       | Arme de départ                  | Stats de départ                | Passif signature (règle de jeu)                                                                                                                         | Déblocage                                                         | Rôle                     |
| ---------- | -------------------------------- | ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------ |
| 1          | **Éclaireuse** (existante)       | Orbe filante 1                  | +15 % vitesse, dash court      | aucun : c'est la référence d'équilibrage des phases 3 à 5, elle ne bouge pas                                                                            | disponible                                                        | polyvalente              |
| 2          | **Bûcheron** (existant)          | Lames orbitales 2, portée +20 % | +30 PV, vitesse 1,05           | _Fendeur_ : les Lames repoussent 50 % plus fort (sim : `kbMul` par source de coup)                                                                      | succès « Dix minutes »                                            | mêlée, tank              |
| 3          | **Vieille sorcière** (existante) | Foudre en chaîne 1              | −30 % PV                       | _Paratonnerre_ : la Foudre vise d'abord l'ennemi le plus proche (sim : ciblage de la première cible)                                                    | succès « Faucheuse en herbe » (500 kills)                         | dégâts à distance        |
| 4          | **Veilleuse**                    | Halo brûlant 1                  | 100 PV                         | _Braise_ : le Halo grandit de 8 % par minute survécue, jusqu'à +40 % (sim : rayon × f(t))                                                               | **achat : 800 or**                                                | zone, tempo              |
| 5          | **Braconnier**                   | Boomerang 1                     | 100 PV                         | _Rapporteur_ : un boomerang attrapé au retour rend la moitié de sa recharge (sim : événement de retour déjà géré dans `tick.ts`)                        | **achat : 1 200 or**                                              | précision, rythme        |
| 6          | **Sapeur**                       | Mines 1                         | +20 PV, vitesse 0,95           | _Démolisseur_ : chaque atterrissage de saut pose une mine (sim : `Ev.Land` existe)                                                                      | succès « Gardienne tombée » (vaincre un boss)                     | contrôle de zone, saut   |
| 7          | **Feu follet**                   | Orbe filante 1                  | +30 % vitesse, −50 % PV        | _Traînée_ : le dash dure 2× plus longtemps et laisse une traînée de feu 1,5 s (8 dégâts/s) (sim : zone de dégâts posée pendant `dash`)                  | **défi « Intouchable »** : 4 min d'affilée sans dégât dans un run | verre et acier, mobilité |
| 8          | **Revenante**                    | Foudre 1 **et** Halo 1          | −20 % PV, vitesse 1            | _Déjà morte_ : une Réanimation gratuite par run (sim : `REVIVE` existe) ; les ennemis tués pendant un saut donnent ×2 XP (sim : `Ev.Kill` + `onGround`) | succès « Aube » (vaincre le Faucheur)                             | récompense de fin de jeu |
| 9 (option) | **Colporteur**                   | Lames 1                         | Trèfle 1 et Bourse 1 au départ | _Marchand_ : les coffres donnent toujours au moins 3 cartes (sim : `CHEST.p3`)                                                                          | **achat : 2 000 or**                                              | économie, coffres        |

Six armes, un personnage par arme (Orbe ×2 avec l'Éclaireuse et le Feu follet, deux styles opposés), deux variantes extrêmes (Feu follet, Revenante). Les trois existants gardent leurs stats actuelles ; leurs passifs sont **optionnels** : si tu préfères ne pas toucher à l'équilibre validé en phase 4, on les laisse sans passif.

## Déblocages : trois voies

| Voie                     | Personnages                                       | Pourquoi                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Succès** (existant)    | Bûcheron, Sorcière, Sapeur, Revenante             | jalons de progression : 10 min, 500 kills, un boss, le Faucheur. « Gardienne tombée » et « Aube » ne débloquaient rien jusqu'ici                                                                                                                                |
| **Or** (nouveau, simple) | Veilleuse 800, Braconnier 1 200, Colporteur 2 000 | un run médian rapporte ≈ 1 500 or : le premier achat arrive au 1er ou 2e run, le dernier demande de choisir entre un personnage et des paliers de boutique                                                                                                      |
| **Défis** (nouveau)      | Feu follet                                        | objectif de maîtrise, pas de grind. Trois défis proposés, un seul débloque un personnage, les deux autres sont des succès « prestige » : **Intouchable** (4 min sans dégât), **Marathon** (4 km parcourus en un run), **Métamorphe** (3 évolutions dans un run) |

Les prix en or sont à ajuster après mesure : la cible est « un nouveau personnage toutes les 2 à 4 parties » pendant les 15 premières parties, puis un rythme plus lent.

## Ce que ça change dans le code

- `src/sim/` : `CharacterDef` reçoit un champ `passive` (identifiant) lu par la sim aux bons endroits : `Ev.Land` (Sapeur), dash (Feu follet), retour de boomerang (Braconnier), rayon du Halo (Veilleuse), ciblage de la Foudre (Sorcière), recul des Lames (Bûcheron), réanimation et XP (Revenante), coffres (Colporteur). Tout reste pur et déterministe ; chaque passif = une constante dans `balance.ts` et un test unitaire.
- `src/meta/` : `MetaStats` gagne trois compteurs (plus longue période sans dégât, distance par run, évolutions par run) ; les déblocages à l'or passent par la boutique existante (`SHOP`) avec une ligne par personnage ; `unlockedCharacters` lit succès + achats.
- `src/ui/` : la grille des personnages passe à 8 ou 9 cartes (deux rangées sur PC, défilement horizontal à crans sur téléphone, qui défile désormais correctement), bouton « Acheter » sur les cartes verrouillées par l'or, condition affichée pour les autres.
- `tools/bots` : rien de nouveau, les bots sautent et dashent déjà ; `--character` existe dans la CLI.
- i18n : 2 clés par personnage et par défi, dans les deux langues.

## Porte de la phase (proposition à ajouter à PLAN.md §5)

- 8 personnages jouables, chacun mesuré sur 100 runs du bot `average` : survie p50 à **± 3 min de l'Éclaireuse**, morts avant 3 min **≤ 15 %** (règle « différents, pas meilleurs » de `survivor-design` §8).
- Un nouveau joueur débloque **un nouveau personnage en moins de 5 runs** (test Playwright « nouveau joueur », à côté de celui de la phase 4).
- Les trois défis sont atteignables par le bot `greedy` en 200 runs (preuve qu'ils ne sont pas hors de portée).
- Tests, Lighthouse et bench inchangés ; captures des 8 cartes ; `docs/GATES.md`.

## Coût et découpage

Environ une demi-journée de travail par personnage, équilibrage par simulation compris, plus une journée pour les défis, la boutique et la grille. Découpage en quatre PR pour garder des mesures lisibles :

1. Infrastructure : `passive` dans la sim, déblocage à l'or, trois compteurs de défis, grille à 8 cartes (aucun nouveau personnage encore).
2. Veilleuse, Braconnier, Sapeur (un par arme manquante) + équilibrage.
3. Feu follet, Revenante + défis + équilibrage.
4. Passifs optionnels des trois existants, Colporteur si retenu, captures, porte.

## À décider (Jimmy)

1. Le roster : les 8 (ou 9) ci-dessus, des noms à changer, un passif qui ne te plaît pas ?
2. Les trois personnages existants : on leur ajoute leur passif signature, ou on les laisse tels quels ?
3. Les prix en or (800 / 1 200 / 2 000) et le défi retenu pour le Feu follet.
4. Ajout de la phase 6 dans PLAN.md §5 (c'est ton document) : je te propose le paragraphe ci-dessus, tu l'y colles ou je le fais.
