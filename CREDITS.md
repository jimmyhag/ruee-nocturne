# Crédits

Ruée Nocturne est un jeu de **Jimmy Haggege**. Le code a été écrit avec [Claude Code](https://claude.com/claude-code) (Anthropic), phase par phase, à partir du plan de conception `PLAN.md`.

Depuis la phase 20 (1.15.0), les armes et une partie du décor sont des modèles 3D KayKit (voir plus bas), depuis la phase 25 (1.20.0) les neuf personnages sont des modèles Quaternius texturés (versions gratuites, CC0), et depuis la phase 26 (1.21.0) les ennemis aussi (morts-vivants construits avec le même kit). Le reste est produit par le code : les effets et les ouvrages sont des primitives low-poly générées au lancement, et les sons sont synthétisés par Web Audio. Il n'y a ni sprite ni fichier audio tiers.

## Modèles 3D

| Pack                                                                                                                                                                                                       | Auteur                                  | Licence                                                       | Ce qui en vient                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html)                                                                                                                     | [Quaternius](https://quaternius.com)    | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | depuis la phase 25 : têtes, yeux, sourcils et coiffures des neuf personnages                                                |
| Modular Character Outfits – Fantasy (quaternius.com)                                                                                                                                                       | Quaternius                              | CC0 1.0                                                       | tenues Rôdeur et Paysan (homme et femme), teintées par personnage ; depuis la phase 26, les morts-vivants (ennemis et boss) |
| [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) 1 et 2                                                                                                          | Quaternius                              | CC0 1.0                                                       | animations des héros (repos, course, saut, coups, sorts, mort)                                                              |
| [Modular Weapons Pack](https://quaternius.com/packs/medievalweapons.html), [Survival Pack](https://quaternius.com/packs/survival.html), [Ultimate RPG Pack](https://quaternius.com/packs/ultimaterpg.html) | Quaternius                              | CC0 1.0                                                       | objets tenus : dague, hache, épée, arc, faux, pelle, torche, cristal, bourse                                                |
| [KayKit Character Pack : Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)                                                                                          | [Kay Lousberg](https://kaylousberg.com) | CC0 1.0                                                       | épée des lames, hache du boomerang, bombe des mines (héros des phases 20 à 23)                                              |
| [KayKit Halloween Bits](https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0)                                                                                                                   | Kay Lousberg                            | CC0 1.0                                                       | arbres, lanternes, sanctuaire, tombes, citrouilles, crâne des Volants                                                       |
| [KayKit Dungeon Remastered](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0)                                                                                                           | Kay Lousberg                            | CC0 1.0                                                       | coffres, caisses, tonneau et pièces de l'échoppe                                                                            |

Le crédit n'est pas exigé par la licence CC0 ; il est donné quand même. Les fichiers de `public/models/` sont produits par `npm run assets` (`tools/assets/`) : animations utiles seulement, accessoires choisis, compression meshopt. quaternius.com n'est pas joignable depuis l'environnement de build : les personnages viennent du dépôt public [godot-3d-player-controller-v2](https://github.com/kirbycope/godot-3d-player-controller-v2) (fichiers Quaternius inchangés, licences CC0 jointes), les objets tenus du miroir [quaternius-showcase](https://github.com/trebeljahr/quaternius-showcase). Les packs d'origine ne sont pas dans le dépôt.

## Bibliothèques

| Composant                                                                          | Licence    | Rôle                                        |
| ---------------------------------------------------------------------------------- | ---------- | ------------------------------------------- |
| [Three.js](https://threejs.org/) 0.187                                             | MIT        | rendu WebGL                                 |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval)                          | Apache-2.0 | sauvegarde dans IndexedDB                   |
| [Vite](https://vite.dev/) et [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)  | MIT        | build, manifest, service worker             |
| [Workbox](https://developer.chrome.com/docs/workbox)                               | MIT        | précache et mise à jour de l'app            |
| [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) | MIT        | build en un seul fichier (artefact de test) |

Outils de développement : [glTF Transform](https://gltf-transform.dev/) (MIT) et [meshoptimizer](https://github.com/zeux/meshoptimizer) (MIT) pour le pipeline de modèles, TypeScript, Vitest, Playwright, ESLint, Prettier, Lighthouse, GitHub Actions, Firebase Hosting.

## Polices

| Police                                                     | Auteur                               | Licence                                                   |
| ---------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| [Lilita One](https://fonts.google.com/specimen/Lilita+One) | Juan Montoreano                      | [SIL Open Font License 1.1](https://openfontlicense.org/) |
| [Rubik](https://fonts.google.com/specimen/Rubik)           | Hubert & Fischer, Meir Sadan, Cyreal | [SIL Open Font License 1.1](https://openfontlicense.org/) |

Les fichiers `public/fonts/*.woff2` sont les sous-ensembles latins distribués par Google Fonts, auto-hébergés pour que le jeu fonctionne hors ligne.

## Références de ton

Des jeux qui ont servi de repères de conception, pas de source de contenu : Vampire Survivors (économie des choix, évolutions, écran de mort), Megabonk (mobilité 3D, rendu rétro), Risk of Rain 2 (lisibilité des télégraphes), Brotato (relance instantanée), Nuclear Throne (poids des armes, hit-stop).
