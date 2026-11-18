# Swarmageddon (ex-Ruée Nocturne)

A 3D survivor game, low-poly, shipped as a PWA for phones and PCs (TypeScript, Three.js,
Vite, Firebase Hosting): https://ruee-nocturne.web.app. Its players are the public, on
their phone first. It must never send a player's data off the device without an account or their consent,
never stutter in the hot loop (zero allocation per frame), and never ship an unbalanced
change: every difficulty setting is chosen and checked with the simulation.

Code and identifiers are in English. All user-facing text is in French by default, with
an English translation (`src/i18n/fr.json`, `src/i18n/en.json`); commits, comments and
docs are in French.

This file is the single source of project rules for every contributor, human or AI
assistant. `CLAUDE.md` only imports it: edit this file, not it. `PLAN.md` stays the source
of truth for the game's content; `docs/GATES.md` records what each phase delivered.

## Getting started

- Node 22 (the version CI uses; Vite 8 needs ≥ 22.12), npm with `package-lock.json`, and
  [`just`](https://github.com/casey/just) ≥ 1.42 (`winget install --id Casey.Just --exact`
  on Windows, `brew install just` on macOS, `cargo install just` elsewhere).
- `npm ci`, then `just dev` (http://localhost:5173). No secret is needed: without
  `VITE_FIREBASE_CONFIG` in `.env.local`, the account and the online leaderboard are
  simply unavailable, and everything else works offline.

## Contributing workflow

- Never push to `main`. Work on a branch and open a pull request: CI runs the gates of `just ci` (those of
  `just check` with the whole Playwright suite) as parallel jobs (checks, the Playwright suite in five shards,
  Lighthouse), joined in the `verify` check, plus the balance simulation (commented on the PR).
- Merge only when CI is green, and only on Jimmy's explicit order. Merging deploys:
  every push to `main` publishes the live site (`.github/workflows/deploy.yml`); each pull
  request gets its own preview channel, whose URL the deploy job comments.
- The rules below are enforced by the gates (types, lint, layer boundaries, tests, dead
  code) wherever a tool can enforce them. When one of them blocks you, fix the code. Do
  not relax the configuration of a gate, and do not skip, delete or weaken a test to make
  a change pass; if a rule is truly wrong, say so in the pull request and change it in a
  dedicated commit.
- What tooling cannot check is still mandatory: the business invariants and the
  conventions described here.
- One pull request per coherent change, with what was verified and what was not.
- A request is specified before it is built: the sparring partner (`.agents/README.md`)
  challenges it with Jimmy and leaves a spec in `docs/specs/` (starting with
  `**Statut : 🟡 Prêt pour le dev**`). The implementation turns each scenario into a
  test of the same name: the English equivalent of the scenario title. When all tests
  pass and the implementation is complete, the developer (human or AI) updates the
  spec file to `**Statut : 🟢 Implémenté**`.
- The mobile retention project (`docs/specs/swarmageddon-mobile.md`) is cut into lots
  (L1, L2…) instead of the former phases: one lot, one spec from the sparring, one branch,
  one pull request.
- The end of a lot keeps the project's habits (« Fin de phase » of the former
  `CLAUDE.md`, word for word):
  1. `docs/GATES.md` : porte, mesures réelles, captures, date.
  2. `CHANGELOG.md` mis à jour. Ses sections Ajouté, Modifié et Corrigé sont affichées dans le jeu (feuille « Nouveautés », `src/meta/patch-notes.ts`) : les écrire pour les joueurs, sans code ni nom de personne ; le détail d'implémentation va sous « Technique », qui n'y paraît pas. La version de `package.json` doit être en tête du journal (test Vitest).
  3. PR avec : résumé, décisions prises, mesures perf avant/après, GIF ou captures, checklist de la phase.
  4. Message à Jimmy : ce qu'il doit tester sur son téléphone (URL de preview) et ce qui attend sa décision.

## Commands

`just check` is the gate: it must pass locally and in CI before every commit.
`just preflight` is the fast subset for the edit loop: run it after every change,
`check` before the commit. Every recipe calls the npm scripts, which keep working.

| Command          | Purpose                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `just dev`       | Vite dev server, http://localhost:5173; always in the background, it never returns        |
| `just test`      | Vitest once (simulation and UI logic); `just test src/sim/poi.test.ts` runs a subset      |
| `just typecheck` | `tsc --noEmit`, strict                                                                    |
| `just lint`      | ESLint with zero warnings (layer boundaries included), then Prettier                      |
| `just deadcode`  | knip: unused exports, orphan files, undeclared dependencies                               |
| `just preflight` | typecheck + lint + test + deadcode: the edit-loop gate (about 1 min)                      |
| `just check`     | preflight + build + bench + smoke simulation + smoke e2e: the commit gate (about 4 min)   |
| `just e2e`       | The whole Playwright suite, desktop and mobile (long; CI runs it on every pull request)   |
| `just ci`        | What CI runs, in parallel jobs: check with the whole Playwright suite                     |
| `just sim`       | Balance simulation with targets: `just sim --runs 200 --bot average --seed 42 --profile maxed` |
| `just bench`     | 600 simulation steps at 400 enemies; fails over the budgets of PLAN.md §4.3               |

Other npm scripts: `npm run preview` (serves `dist/`: test the service worker there, never
in dev), `npm run shot` (Playwright screenshots in `shots/`), `npm run store`,
`npm run icons`, `npm run assets`, `npm run audio`, `npm run lh` (Lighthouse), `npm run retention` (the
retention table, read with an administrator token: `docs/DEPLOY.md`).

## Business invariants (non-negotiable)

### Règles non négociables (reprises de `CLAUDE.md`, mot pour mot, numéros conservés ; règle 8 complétée aux lots L1 et L4)

1. **Zéro allocation par frame** en régime permanent : pools d'objets, tableaux réutilisés, pas de `filter/map` dans la boucle chaude, pas de closures créées dans `step()`.
2. **Les budgets perf de PLAN.md §4.3 sont des tests** : `npm run bench` échoue si dépassés.
3. **Chaque coup porté produit un feedback** (flash, recul, son, chiffre). Pas d'arme muette.
4. **Clavier et tactile à parité** : toute fonctionnalité d'entrée est testée dans les deux modes.
5. **Pas de dépendance ajoutée sans justification** dans la PR (taille gz, alternative native évaluée). Pas de framework UI.
6. **Three.js épinglé** : vérifier l'API de la version installée dans `node_modules/three/` avant d'utiliser une méthode. Version actuelle : 0.187 (`docs/STACK.md`). On garde le schéma « allouer les couleurs à pleine capacité puis `count = 0` » (`src/render/instancing.ts`) : il est correct sur toutes les versions.
7. **Ne jamais modifier `prototype/`** : c'est une référence historique, pas du code vivant.
8. Sans compte, aucune donnée utilisateur ne quitte l'appareil. Avec un compte (décision de Jimmy, phase 13), seule la progression (`PROGRESS_KEYS` de `src/meta/sync.ts`) est écrite dans Firestore `saves/{uid}` : jamais les réglages, jamais d'analytics sans décision explicite de Jimmy. Seul `src/platform/account.ts` importe `firebase`, chargé à la demande ; un joueur sans compte n'émet aucune requête (test e2e). Classement en ligne (décision de Jimmy, phase 38) : un joueur connecté qui a choisi un pseudo publie ses meilleurs scores (`scores/{uid}`, `weeks/{semaine}/scores/{uid}`, forme dans `src/meta/board.ts`), lisibles par les seuls joueurs connectés ; rien d'autre. Mesure de fréquentation (décision de Jimmy, lot L1, 17 nov. 2026) : un joueur, avec ou sans compte, qui l'a **acceptée** écrit un seul document anonyme `retention/{id}` (identifiant aléatoire, jour de l'accord, jours d'ouverture jusqu'à J30, expiration ; forme dans `docs/specs/l1-mesure-retention.md`) par l'API REST de Firestore, sans SDK ; sans accord, aucune requête (test e2e). Défi entre amis (décision de Jimmy, lot L4, 17 nov. 2026) : le résultat du défi du jour d'un joueur connecté avec un pseudo est publié comme ses scores de la semaine (`days/{jour}/scores/{uid}`, forme dans `src/meta/board.ts`, expiration `x` à J+7), lisible par les seuls joueurs connectés et montré dans le jeu à lui seul et aux joueurs qui ont ouvert un de ses liens de défi ; un lien de défi, que le joueur partage lui-même (`src/platform/share.ts`), porte ses paramètres dans le fragment (`/#defi=…`, jamais envoyé à l'hébergeur) et ne contient que la date, le temps, les kills, et, si l'expéditeur a un pseudo, ce pseudo, et, s'il est connecté, son identifiant de compte ; ses amis (identifiant et pseudo lus dans ces liens) font partie de sa progression ; ouvrir un lien sans compte n'émet aucune requête (test e2e).

### Chantier mobile (décisions de Jimmy, 17 nov. 2026)

9. **Mesurer avant d'ajouter** : dès que la mesure de rétention existe (lot L1), **une seule mécanique de rétention à la fois**, dont l'effet est mesuré avant la suivante.
10. **Zéro SDK de suivi, de pub ou d'analytics tiers.** Toute mesure respecte la règle 8 et la décision prise par Jimmy au lot L1.
11. **PWA uniquement** pour ce chantier : rien de natif (ni Capacitor, ni store). Ce qui dépend d'une API du navigateur (vibrations, partage) passe par `src/platform/`, avec un repli quand l'API manque (par exemple les vibrations sur iPhone).
12. **Sessions mobiles** : le défi du jour tient en environ 5 minutes ; toute partie se met en pause en arrière-plan et reprend instantanément.
13. **Équilibrage par la simulation** : tout réglage de difficulté (premières parties comprises) est choisi et vérifié avec `npm run sim`, comme aujourd'hui.

## Architecture

The detail is in PLAN.md §4. The simulation emits **events**; rendering, audio and the
HUD subscribe to them, never the reverse.

| Layer | Folder | Role | May import |
| ----- | ------ | ---- | ---------- |
| sim | `src/sim/` | Pure, deterministic game logic, fixed 60 Hz step; every numeric constant lives in `src/sim/balance.ts` | `src/sim/` only; no `three`, no DOM, no `Math.random` or `Date.now` (randomness through `w.rng`) |
| render | `src/render/` | Three.js: reads the world, never writes to it; `InstancedMesh` for everything that repeats | `three`, `src/sim/` |
| ui | `src/ui/` | Native DOM (no UI framework): HUD, sheets, cards | `src/sim/`, `src/render/`, `src/platform/`, `src/meta/`, `src/i18n/` |
| platform | `src/platform/` | Input, audio, storage, PWA, sharing, the account (the only Firebase import), the retention measure (Firestore REST, no SDK) | `src/sim/`, `src/meta/` |
| meta | `src/meta/` | Saved progression (with the progressive reveal of systems), the daily challenge and its streak, daily missions, the result card and challenge link, friends, achievements, library, sync, leaderboard and retention shapes | `src/sim/`, `src/platform/`, `src/i18n/` |
| i18n | `src/i18n/` | French and English strings, number formats | `src/sim/`, `src/meta/` |
| entry | `src/main.ts`, `src/debug.ts` | Composition: the loop, the event handlers, the debug hooks (`?debug=1`) | everything |
| tools | `tools/` | Node CLIs: simulation and bots, bench, assets, audio, icons, Lighthouse, retention reading | `src/` |

The lint enforces the `sim` and `render` rows and the Firebase rule (`eslint.config.js`);
the test « frontière sim/render » (`src/sim/sim.test.ts`) checks the sim row again.

### External services and the platform boundary

- Everything that depends on the browser or a service (input, audio, storage, the
  service worker, vibration, sharing, the account, the retention measure) goes through
  `src/platform/`, with a fallback when the API is missing.
- Firebase is imported by `src/platform/account.ts` alone, loaded on demand; a player
  without an account never loads it (rule 8, e2e test `e2e/account.spec.ts`).
- The simulation is tested headless by Vitest and played by bots (`tools/bots/`); the
  browser is tested by Playwright on the production build (`vite preview`), desktop and
  mobile projects.
- No dead code: an export appears with its first consumer (knip enforces it).

### Layout

```
src/sim/            simulation (pure, deterministic), its tests next to each module
src/render/         Three.js scene, instancing, effects, models
src/ui/             DOM screens and HUD
src/platform/       input, audio, storage, PWA, sharing, account, Firebase configuration, retention measure
src/meta/           saved progression, progressive reveal, daily challenge and streak, daily missions, result card and challenge link, friends, achievements, library, sync, leaderboard, retention
src/i18n/           fr.json, en.json and the formatting helpers
tools/              simulation CLI and bots, bench, asset and audio pipelines, icons, Lighthouse, retention
e2e/                Playwright specs (desktop 1280×720 and iPhone 13)
public/             static files: icons, models, sounds, fonts
assets/             sources of generated files (icon.svg)
docs/               DEPLOY, DEVICES, GATES, STACK, store screenshots, captures
prototype/          historical reference, never modified
.claude/            the game's skills and review agents, plus links to the harness roles
.agents/            the roles AI assistants play and the skills they load (README.md)
docs/specs/         one spec per request, written by the sparring partner
docs/harness/       what each full round of the harness taught, with the agents' reports
```

Do not create empty folders: a folder appears with its first file.

## Working rules

- Versions are resolved with the registry at install time (`npm view <package> version`),
  never from memory.
- Read the official documentation of a tool before configuring it. Report any
  incompatibility instead of working around it.
- Never say "it works" without having run it. Never claim an effect is visible without
  having looked at it: `npm run shot` (or the screenshots a Playwright spec writes), then
  read the PNG files.
- The dev server and Playwright run in the background; read their output, never let a
  process block the session.
- The game's skills in `.claude/skills/` are read **before** writing the code they cover:
  rendering → `three-rendering`, effects and game feel → `game-feel`, balance and content
  → `survivor-design`, performance → `mobile-perf`, delivery → `pwa-release`, tests and
  bots → `sim-testing` (routing in `.agents/skills/index.md`).
- Review agents: `perf-reviewer` reviews any change to `src/render/` or the loop;
  `balance-playtester` runs the simulation and comments the balance targets. At the end
  of a lot, not at every commit.
- When a design question has no answer: apply PLAN.md; if it says nothing, choose the
  simplest option that respects the golden rules (PLAN.md §2.5) and write it in the pull
  request under « Décisions prises ».
- No secret in the repository, ever. The Firebase web configuration comes from
  `.env.local` (`VITE_FIREBASE_CONFIG`, ignored by git) in dev and from Hosting's reserved
  URL `/__/firebase/init.json` in production; deployment credentials live in GitHub
  secrets.

## Out of scope

From Jimmy's decisions (PLAN.md and the mobile brief of 17 Nov. 2026):

- Native apps and the stores (Capacitor, push reminders) during the mobile project: after
  a clean PWA. No rewrite in another engine.
- Any third-party analytics, advertising or tracking SDK; purchases and ads.
- Seasons before the first retention measure; the return of weapon evolutions.
- Any V2 phase of PLAN.md.
