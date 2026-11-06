# Crédits

Ruée Nocturne est un jeu de **Jimmy Haggege**. Le code a été écrit avec [Claude Code](https://claude.com/claude-code) (Anthropic), phase par phase, à partir du plan de conception `PLAN.md`.

Depuis la phase 20 (1.15.0), les armes et une partie du décor sont des modèles 3D KayKit (voir plus bas), depuis la phase 21 (1.16.0) les ennemis aussi, et depuis la phase 24 (1.19.0) les neuf personnages sont des modèles Quaternius. Le reste est produit par le code : les effets et les ouvrages sont des primitives low-poly générées au lancement, et les sons sont synthétisés par Web Audio. Il n'y a ni sprite ni fichier audio tiers.

## Modèles 3D

| Pack                                                                                                                                                                                                       | Auteur                                  | Licence                                                       | Ce qui en vient                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Ultimate Modular Women Pack](https://quaternius.com/packs/ultimatemodularwomen.html)                                                                                                                      | [Quaternius](https://quaternius.com)    | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | depuis la phase 24 : Éclaireuse (Adventurer), Sorcière (Witch), Veilleuse (Medieval), Feu follet (Punk), Revenante (Formal) |
| [Ultimate Modular Men Pack](https://quaternius.com/packs/ultimatemodularmen.html)                                                                                                                          | Quaternius                              | CC0 1.0                                                       | Bûcheron (Farmer), Braconnier (Adventurer), Sapeur (Worker), Colporteur (King)                                              |
| [Cyberpunk Game Kit](https://quaternius.com/packs/cyberpunkgamekit.html) et [Platformer Game Kit](https://quaternius.com/packs/ultimateplatformer.html)                                                    | Quaternius                              | CC0 1.0                                                       | animations des héros (reciblées sur les personnages modulaires)                                                             |
| [Modular Weapons Pack](https://quaternius.com/packs/medievalweapons.html), [Survival Pack](https://quaternius.com/packs/survival.html), [Ultimate RPG Pack](https://quaternius.com/packs/ultimaterpg.html) | Quaternius                              | CC0 1.0                                                       | objets tenus : dague, hache, épée, arc, faux, pelle, torche, cristal, bourse                                                |
| [KayKit Character Pack : Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)                                                                                          | [Kay Lousberg](https://kaylousberg.com) | CC0 1.0                                                       | épée des lames, hache du boomerang, bombe des mines (héros des phases 20 à 23)                                              |
| [KayKit Character Pack : Skeletons](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0)                                                                                             | Kay Lousberg                            | CC0 1.0                                                       | depuis la phase 21, tous les ennemis et les boss (Minion, Warrior, Mage, Rogue et leurs armes)                              |
| [KayKit Halloween Bits](https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0)                                                                                                                   | Kay Lousberg                            | CC0 1.0                                                       | arbres, lanternes, sanctuaire, tombes, citrouilles, crâne des Volants                                                       |
| [KayKit Dungeon Remastered](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0)                                                                                                           | Kay Lousberg                            | CC0 1.0                                                       | coffres, caisses, tonneau et pièces de l'échoppe                                                                            |

Le crédit n'est pas exigé par la licence CC0 ; il est donné quand même. Les fichiers de `public/models/` sont produits par `npm run assets` (`tools/assets/`) : animations utiles seulement, accessoires choisis, compression meshopt. Les modèles Quaternius viennent du miroir public [quaternius-showcase](https://github.com/trebeljahr/quaternius-showcase) (licences listées dans son `LICENSES.md`). Les packs d'origine ne sont pas dans le dépôt.

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
