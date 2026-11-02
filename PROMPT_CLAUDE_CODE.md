# Prompt de lancement Claude Code — Ruée Nocturne

> **Avant de coller (côté Jimmy, 5 minutes)**
> 1. Décompresser le kit dans un dossier vide `ruee-nocturne/`.
> 2. `cd ruee-nocturne && npm ci && npm test && npm run bench` → tout doit être vert.
> 3. `gh auth login` fait. Un projet Firebase créé avec Hosting activé ; noter son ID.
> 4. Ouvrir Claude Code dans le dossier, coller tout ce qui suit la ligne.

---

Tu reprends le projet **Ruée Nocturne** : un survivor 3D (famille Vampire Survivors / Megabonk), jouable sur téléphone et PC, livré en PWA installable. Objectif final : un jeu **satisfaisant et addictif** sur une base technique irréprochable. Tu travailles en autonomie, phase par phase, et tu t'arrêtes à chaque porte pour que je teste sur mes appareils.

## 1. Ce qui existe déjà (ne pas réinventer)
Une base v0.1 fonctionnelle est dans le dépôt : simulation déterministe à pas fixe (`src/sim/`), rendu Three.js instancié (`src/render/`), entrées clavier/tactile/manette, audio procédural, HUD, sauvegarde méta, CLI de simulation d'équilibrage et bench (`tools/`). Elle tourne, elle est testée, elle a des chiffres. Ton travail est de la **compléter et la durcir**, pas de la remplacer. Toute réécriture d'un module existant doit être justifiée par une mesure.

## 2. Lis, dans cet ordre, avant toute action
1. `CLAUDE.md` : tes règles de travail. Elles priment sur tes habitudes.
2. `PLAN.md` en entier : vision, boucle addictive (§2), contenu V1 (§3), architecture (§4), phases et portes (§5), définition de « terminé » (§6).
3. `docs/STACK.md` : ce qui est fait, les mesures actuelles, ce qui manque pour chaque porte.
4. `docs/GATES.md` : le journal des portes et des décisions, que tu tiendras à jour.
5. `.claude/skills/*/SKILL.md` : six skills. Tu les relis **au moment** de toucher leur domaine, pas une fois pour toutes :
   - `three-rendering` avant tout code dans `src/render/`
   - `game-feel` avant tout effet, feedback ou tâche de phase 2
   - `survivor-design` avant tout contenu, `balance.ts` ou tâche de phase 3/4
   - `mobile-perf` avant toute optimisation ou code dans la boucle chaude
   - `pwa-release` pour la phase 0 et la phase 5
   - `sim-testing` avant d'écrire un test, un bot ou de valider une porte
6. `.claude/agents/` : `perf-reviewer` et `balance-playtester`. Tu les lances en fin de phase (et `balance-playtester` après tout changement de `balance.ts`), jamais à chaque commit.
7. `prototype/index.html` : le tout premier prototype. Référence de direction artistique. Interdit en écriture.

Puis exécute `npm ci && npm test && npm run bench && npm run sim -- --runs 20 --bot average --seed 42` et confirme-moi les chiffres avant de modifier quoi que ce soit.

## 3. Le harnais, et comment t'en servir
- `.claude/settings.json` porte des **hooks** : formatage + typecheck après chaque édition `.ts` ; refus de tout import de `three` ou du DOM dans `src/sim/` ; obligation de lancer `npm run dev` et `preview` en arrière-plan ; rappel des fichiers non commités à la fin d'un tour. Si un hook te bloque, il a raison : corrige la cause, ne contourne jamais.
- Les **permissions** interdisent `git push --force`, `git reset --hard`, `rm -rf`, `firebase deploy` en local (le déploiement passe par GitHub Actions), et toute écriture dans `prototype/`.
- **Serveurs et Playwright** : toujours `run_in_background: true`, puis lecture de la sortie. Chromium headless avec `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Les polices Google peuvent ne pas charger hors ligne : ce n'est pas un bug.
- **Vérification visuelle** : `npm run shot` puis **lire les PNG** avec l'outil Read. Tu n'affirmes jamais qu'un effet est visible sans l'avoir regardé.
- **Plan mode** au début de chaque phase. **Liste de tâches** (TaskCreate) pour toute phase, une tâche = un commit ou un petit groupe de commits.
- Une phase = une branche `phase/N-nom` = une PR vers `main`. Commits atomiques, messages à l'impératif en français. Jamais de commit direct sur `main` après la phase 0.

## 4. Ta mission immédiate : Phase 0 — Fondations
Référence : `PLAN.md` §5 Phase 0, skill `pwa-release`, `docs/STACK.md` section « Reste pour franchir les portes ».

1. **Dépôt** : `git init`, commit initial « Base v0.1 et harnais » avec le kit tel quel, `gh repo create ruee-nocturne --private --source=. --push`.
2. **Outillage manquant** : ESLint (flat config) + Prettier ; Playwright dans `e2e/` avec deux projets (desktop 1280×720, mobile iPhone 13 tactile) ; `vite-plugin-pwa` (manifest complet, icônes 192/512/maskable générées par un script `npm run icons` depuis un SVG, service worker `registerType: 'prompt'`, bannière « Nouvelle version » affichée uniquement au menu ou à l'écran de mort) ; `simple-git-hooks` (pre-commit : lint + typecheck + test). Scripts `lint`, `test:e2e`, `shot` fonctionnels, conformes à `CLAUDE.md`.
3. **Tests** : `e2e/smoke.spec.ts` (page chargée, canvas, zéro `console.error` hors polices, partie démarrée, ennemis présents, draw calls ≤ 40), `e2e/touch.spec.ts` (joystick → le joueur bouge, SAUT → `y > 0`), `e2e/restart.spec.ts` (mort → en jeu < 2 s). Seuil de couverture `src/sim/` ≥ 80 % dans la config Vitest.
4. **Onglet perf (F3)** : ajoute le nombre de voix audio et un p95 glissant sur 2 s.
5. **CI/CD** : vérifie et adapte `.github/workflows/ci.yml` et `deploy.yml`. `firebase.json` avec les en-têtes du skill (`sw.js` et `index.html` en `no-cache`, `assets/**` immutable). Dis-moi **exactement** quoi coller dans le secret `FIREBASE_SERVICE_ACCOUNT` et la variable `FIREBASE_PROJECT_ID`, puis attends ma confirmation avant de considérer le déploiement validé.
6. **Porte** : URL live, PWA installable (je teste sur Android et iPhone), hors-ligne au second lancement, Lighthouse PWA = 100, CI verte. Consigne les mesures dans `docs/GATES.md`, ouvre la PR, puis **arrête-toi** et envoie-moi un compte rendu : ce que je dois tester, ce qui attend ma décision.

Ne commence pas la phase 1 sans mon feu vert.

## 5. Les phases suivantes (pour que tu saches où on va)
- **Phase 1** : fps mesurés sur mon téléphone avec 400 ennemis, couverture sim ≥ 80 %, bots et CLI consolidés.
- **Phase 2** : checklist `game-feel` à 100 %, 3 GIF Playwright, budget perf inchangé.
- **Phase 3** : Boomerang, Mines, 4 évolutions, Volant, Cracheur, élites, coffres, 3 boss + Faucheur, zones de terrain, cycle de lumière ; équilibrage **aux chiffres** avec `npm run sim` jusqu'aux cibles de `survivor-design` §9.
- **Phase 4** : or, boutique, succès avec barres, 3 personnages, écran de mort riche, défi quotidien, réglages.
- **Phase 5** : FR/EN, 4 appareils réels, Lighthouse perf ≥ 85, `v1.0.0`.
Rien de V2 (deuxième carte, coop, classement en ligne, skins, Capacitor) ne doit entrer avant `v1.0.0`.

## 6. Règles de conduite
- Français partout (commits, docs, PR, UI) ; identifiants de code en anglais.
- Pas de framework UI. Pas de dépendance sans justification écrite dans la PR (taille gz, alternative native évaluée).
- Chaque valeur de gameplay vit dans `src/sim/balance.ts` avec un commentaire qui dit pourquoi.
- Zéro allocation par frame dans la boucle chaude. `npm run bench` est un test, pas un indicateur.
- Si `PLAN.md` ne répond pas à une question de design : choisis l'option la plus simple qui respecte les règles d'or (§2.5), note-la dans « Décisions prises » de `docs/GATES.md`, continue.
- Si tu es bloqué par un accès (secret, projet Firebase, appareil réel) : prépare tout ce qui peut l'être, puis demande-moi précisément ce qui manque. Ne simule jamais un résultat que tu n'as pas obtenu.
- Quand tu as un doute entre « faire plus » et « faire propre » : propre.

## 7. Format de tes comptes rendus
À chaque fin de phase, et à chaque fois que tu attends quelque chose de moi, un message court :
1. **Fait** : 3–6 lignes, avec les mesures réelles.
2. **À tester par Jimmy** : URL, appareils, quoi regarder précisément.
3. **Décisions prises** sans moi (si tu en as pris).
4. **En attente de ta décision** : questions fermées, une par ligne, avec ta recommandation.

Commence maintenant : lis les fichiers dans l'ordre du §2, lance les commandes de vérification, puis propose-moi ton plan de phase 0 en mode plan.
