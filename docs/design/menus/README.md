# Maquette « Nocturne » (Jimmy, 17 nov. 2026)

Copie du canvas de design « Swarmageddon — Nocturne » fourni par Jimmy, choisi par lui
(« c'est plus épuré, je veux ça, et adapte vraiment toute l'interface, dans le jeu
entièrement »). Référence de la refonte (`docs/specs/ui-nocturne.md`). Chaque écran est un
fichier `.dc.html` à 390 × 844 (Kit : 900 × 660) ; ils ne s'exécutent pas hors de
l'éditeur de design (`./support.js` absent) : on les lit pour les positions, couleurs,
tailles, icônes (SVG au trait, en ligne) et textes. `canvas.json` est l'index du canvas.

Les images citées `/_blob/<id>` sont dans `assets/ui/<id>.<ext>` (sources) ; le jeu en
sert des versions WebP depuis `public/ui/`.

## Écrans

| Fichier | Écran |
| ------- | ----- |
| `Main.dc.html` | Accueil (joueur avancé, carrousel interactif) |
| `Menu-Premiere-ouverture.dc.html` | Accueil à la première ouverture (onglets verrouillés) |
| `Menu-Reprendre.dc.html` | Accueil avec une partie à reprendre, au crépuscule |
| `Kit-UI.dc.html` | Kit « Nocturne » : couleurs, typographie, actions, progression, icônes, listes |
| `Heros.dc.html` | Héros |
| `Emplacements.dc.html` | Emplacements |
| `Succes.dc.html` | Succès |
| `Bibliotheque.dc.html` | Bibliothèque |
| `Classement.dc.html` | Classement |
| `Defi-du-jour.dc.html` | Défi du jour |
| `Nouveautes.dc.html` | Nouveautés |
| `Compte.dc.html` | Compte |
| `Reglages.dc.html` | Réglages |

## Images

| Id (début) | Type | Usage |
| ---------- | ---- | ----- |
| `f30635` | jpg 1170 × 2532 | Fond de nuit (accueil net ; écrans intérieurs flouté 9 px sous un voile) |
| `3b27da` | jpg 1170 × 2532 | Fond de crépuscule (partie à reprendre) |
| `9ef8c2` | svg | Logo « Swarmageddon » (300 × 31,5) |
| `fcf4fa` | png 414 × 717 | Portrait : Éclaireuse |
| `5172ff` | png 414 × 717 | Portrait : Bûcheron |
| `21011f` | png 414 × 717 | Portrait : Vieille sorcière |
| `e6cb30` | png 414 × 717 | Portrait : Veilleuse |
| `aecb9f` | png 414 × 717 | Portrait : Braconnier |
| `1b4c2a` | png 414 × 717 | Portrait : Sapeur |
| `c87609` | png 414 × 717 | Portrait : Feu follet |
| `e80418` | png 414 × 717 | Portrait : Revenante |
| `eed242` | png 414 × 717 | Portrait : Colporteur |
| `8857d7` `b6cb22` `6c058a` `5e94f5` `f20285` `7a3041` `154506` `db85e2` `34a522` | png 192 | Avatars des héros (grille de l'écran Héros, puce de profil, classement), dans l'ordre de la grille de l'écran Héros |
| `6e94e1` | svg | Orbe filante |
| `2c86e4` | svg | Bond (sort) |
| `d86385` | svg | Foudre en chaîne |
| `abeeb9` `7f73e0` `df23e2` `e8054d` `708db1` `8cd7e9` `d4c5ad` `8e6517` `eec369` `79f6cd` `3dc043` | svg | Armes : Halo brûlant, Lames, Boomerang, Mines, Faux, Lance, Météores, Fouet, Vitriol, Esprits, Balise |

Toutes les autres icônes (onglets, réglages, or, verrou, flèches, coche, anneaux) sont des
SVG au trait de 1,7 px écrits dans les écrans : à reprendre tels quels.
