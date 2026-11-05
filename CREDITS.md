# Crédits

Ruée Nocturne est un jeu de **Jimmy Haggege**. Le code a été écrit avec [Claude Code](https://claude.com/claude-code) (Anthropic), phase par phase, à partir du plan de conception `PLAN.md`.

Depuis la phase 20 (1.15.0), les personnages, leurs armes et une partie du décor sont des modèles 3D KayKit (voir plus bas), et depuis la phase 21 (1.16.0) les ennemis aussi. Le reste est produit par le code : les effets et les ouvrages sont des primitives low-poly générées au lancement, et les sons sont synthétisés par Web Audio. Il n'y a ni sprite ni fichier audio tiers.

## Modèles 3D

| Pack                                                                                                              | Auteur                                  | Licence                                                       | Ce qui en vient                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [KayKit Character Pack : Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | [Kay Lousberg](https://kaylousberg.com) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | héros (Rogue, Barbarian, Mage, Knight), épée des lames, hache du boomerang, bombe des mines                                    |
| [KayKit Character Pack : Skeletons](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0)    | Kay Lousberg                            | CC0 1.0                                                       | la Revenante (Skeleton Rogue) ; depuis la phase 21, tous les ennemis et les boss (Minion, Warrior, Mage, Rogue et leurs armes) |
| [KayKit Halloween Bits](https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0)                          | Kay Lousberg                            | CC0 1.0                                                       | arbres, lanternes, sanctuaire, tombes, citrouilles, crâne des Volants                                                          |
| [KayKit Dungeon Remastered](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0)                  | Kay Lousberg                            | CC0 1.0                                                       | coffres, caisses, tonneau et pièces de l'échoppe                                                                               |

Le crédit n'est pas exigé par la licence CC0 ; il est donné quand même. Les fichiers de `public/models/` sont produits par `npm run assets` (`tools/assets/`) : animations utiles seulement, accessoires choisis, compression meshopt. Les packs d'origine ne sont pas dans le dépôt.

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
