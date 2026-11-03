# Crédits

Ruée Nocturne est un jeu de **Jimmy Haggege**. Le code a été écrit avec [Claude Code](https://claude.com/claude-code) (Anthropic), phase par phase, à partir du plan de conception `PLAN.md`.

Tout ce qui se voit et s'entend dans le jeu est produit par le code : les formes sont des primitives low-poly générées au lancement, les sons sont synthétisés par Web Audio. Il n'y a ni sprite, ni modèle 3D, ni fichier audio tiers.

## Bibliothèques

| Composant                                                                          | Licence    | Rôle                                        |
| ---------------------------------------------------------------------------------- | ---------- | ------------------------------------------- |
| [Three.js](https://threejs.org/) 0.187                                             | MIT        | rendu WebGL                                 |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval)                          | Apache-2.0 | sauvegarde dans IndexedDB                   |
| [Vite](https://vite.dev/) et [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)  | MIT        | build, manifest, service worker             |
| [Workbox](https://developer.chrome.com/docs/workbox)                               | MIT        | précache et mise à jour de l'app            |
| [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) | MIT        | build en un seul fichier (artefact de test) |

Outils de développement : TypeScript, Vitest, Playwright, ESLint, Prettier, Lighthouse, GitHub Actions, Firebase Hosting.

## Polices

| Police                                                     | Auteur                               | Licence                                                   |
| ---------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| [Lilita One](https://fonts.google.com/specimen/Lilita+One) | Juan Montoreano                      | [SIL Open Font License 1.1](https://openfontlicense.org/) |
| [Rubik](https://fonts.google.com/specimen/Rubik)           | Hubert & Fischer, Meir Sadan, Cyreal | [SIL Open Font License 1.1](https://openfontlicense.org/) |

Les fichiers `public/fonts/*.woff2` sont les sous-ensembles latins distribués par Google Fonts, auto-hébergés pour que le jeu fonctionne hors ligne.

## Références de ton

Des jeux qui ont servi de repères de conception, pas de source de contenu : Vampire Survivors (économie des choix, évolutions, écran de mort), Megabonk (mobilité 3D, rendu rétro), Risk of Rain 2 (lisibilité des télégraphes), Brotato (relance instantanée), Nuclear Throne (poids des armes, hit-stop).
