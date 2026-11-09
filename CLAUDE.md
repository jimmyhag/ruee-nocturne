# Ruée Nocturne — instructions pour Claude Code

Survivor 3D en PWA (téléphone + PC). Source de vérité : `PLAN.md`. Avancement des phases : `docs/GATES.md`.
Langue du projet : **français** (commits, commentaires, docs, UI par défaut). Code en anglais (identifiants).

## Commandes
```
npm run dev          # Vite, http://localhost:5173 — toujours en arrière-plan (run_in_background), jamais bloquant
npm run build        # build prod dans dist/
npm run preview      # sert dist/ (tester le service worker ici, pas en dev)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint + prettier --check
npm test             # vitest run (sim uniquement, headless)
npm run test:e2e     # playwright (fumée WebGL + captures mobile/desktop)
npm run sim -- --runs 200 --bot average --seed 42   # simulation d'équilibrage, sort un JSON + résumé
npm run bench        # 10 s de sim à 400 ennemis, imprime ms/step et allocations
npm run shot         # captures Playwright dans shots/ (desktop 1280×720, mobile 390×844)
```

## Architecture (résumé, détail dans PLAN.md §4)
- `src/sim/` : logique pure, déterministe, **aucun import de `three` ni du DOM**. Pas fixe 60 Hz. Toute constante numérique vit dans `src/sim/balance.ts`.
- `src/render/` : Three.js, lit le monde, n'écrit jamais dedans. `InstancedMesh` pour tout ce qui se répète.
- `src/ui/` : DOM natif. `src/platform/` : input, audio, stockage, PWA. `src/meta/` : sauvegarde méta.
- La sim émet des **événements** ; rendu, audio et HUD s'y abonnent. Jamais l'inverse.

## Règles non négociables
1. **Zéro allocation par frame** en régime permanent : pools d'objets, tableaux réutilisés, pas de `filter/map` dans la boucle chaude, pas de closures créées dans `step()`.
2. **Les budgets perf de PLAN.md §4.3 sont des tests** : `npm run bench` échoue si dépassés.
3. **Chaque coup porté produit un feedback** (flash, recul, son, chiffre). Pas d'arme muette.
4. **Clavier et tactile à parité** : toute fonctionnalité d'entrée est testée dans les deux modes.
5. **Pas de dépendance ajoutée sans justification** dans la PR (taille gz, alternative native évaluée). Pas de framework UI.
6. **Three.js épinglé** : vérifier l'API de la version installée dans `node_modules/three/` avant d'utiliser une méthode. Version actuelle : 0.187 (`docs/STACK.md`). On garde le schéma « allouer les couleurs à pleine capacité puis `count = 0` » (`src/render/instancing.ts`) : il est correct sur toutes les versions.
7. **Ne jamais modifier `prototype/`** : c'est une référence historique, pas du code vivant.
8. Sans compte, aucune donnée utilisateur ne quitte l'appareil. Avec un compte (décision de Jimmy, phase 13), seule la progression (`PROGRESS_KEYS` de `src/meta/sync.ts`) est écrite dans Firestore `saves/{uid}` : jamais les réglages, jamais d'analytics sans décision explicite de Jimmy. Seul `src/platform/account.ts` importe `firebase`, chargé à la demande ; un joueur sans compte n'émet aucune requête (test e2e). Classement en ligne (décision de Jimmy, phase 38) : un joueur connecté qui a choisi un pseudo publie ses meilleurs scores (`scores/{uid}`, `weeks/{semaine}/scores/{uid}`, forme dans `src/meta/board.ts`), lisibles par les seuls joueurs connectés ; rien d'autre.

## Façon de travailler
- **Une phase = une branche `phase/N-nom` = une PR vers `main`.** Avant de coder une phase : plan mode, lecture de la porte dans PLAN.md §5, découpage en tâches (TaskCreate).
- Commits atomiques, message à l'impératif en français (`Ajoute le pool de particules`, `Corrige l'allocation des couleurs d'instances`).
- Les skills du dossier `.claude/skills/` se chargent selon la tâche : rendu → `three-rendering`, effets et sensations → `game-feel`, équilibrage et contenu → `survivor-design`, perf → `mobile-perf`, livraison → `pwa-release`, tests et bot → `sim-testing`. Les lire **avant** d'écrire le code concerné.
- Agents : `perf-reviewer` relit toute PR touchant `src/render/` ou la boucle ; `balance-playtester` lance la simulation et commente les cibles d'équilibrage. Les lancer en fin de phase, pas à chaque commit.
- Vérification visuelle : `npm run shot` puis lire les PNG avec l'outil Read. Ne jamais affirmer qu'un effet est visible sans l'avoir regardé.
- Serveur de dev et Playwright : toujours `run_in_background`, puis lire la sortie. Ne pas laisser un processus bloquer la session.
- En cas de doute sur une décision de design : appliquer PLAN.md ; s'il ne répond pas, choisir l'option la plus simple qui respecte les règles d'or (§2.5) et le noter dans la PR sous « Décisions prises ».
- Ne pas démarrer une phase V2.

## Fin de phase
1. `docs/GATES.md` : porte, mesures réelles, captures, date.
2. `CHANGELOG.md` mis à jour.
3. PR avec : résumé, décisions prises, mesures perf avant/après, GIF ou captures, checklist de la phase.
4. Message à Jimmy : ce qu'il doit tester sur son téléphone (URL de preview) et ce qui attend sa décision.
