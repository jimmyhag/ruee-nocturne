# Ruée Nocturne — kit de passation pour Claude Code

Survivor 3D en PWA (téléphone + PC). Ce kit est le point de départ du dépôt.

| Fichier | Rôle |
|---|---|
| `PROMPT_CLAUDE_CODE.md` | Le prompt à coller dans Claude Code pour démarrer (phase 0). |
| `PLAN.md` | Source de vérité : vision, boucle addictive, contenu, architecture, phases et portes. |
| `CLAUDE.md` | Règles de travail de Claude Code sur ce projet. |
| `.claude/settings.json` | Hooks (typecheck, frontière sim/render, serveurs en arrière-plan) et permissions. |
| `.claude/skills/` | 6 skills : `three-rendering`, `game-feel`, `survivor-design`, `mobile-perf`, `pwa-release`, `sim-testing`. |
| `.claude/agents/` | `perf-reviewer` (revue perf/archi), `balance-playtester` (simulation d'équilibrage). |
| `.github/workflows/` | CI (lint, tests, build, bench, Playwright, sim) et déploiement Firebase Hosting. |
| `docs/GATES.md` | Suivi des portes de phase et des décisions. |
| `src/`, `tools/`, `index.html` | **Base v0.1 fonctionnelle** : sim déterministe, rendu, entrées, audio, CLI de simulation, bench. Voir `docs/STACK.md`. |
| `prototype/` | Tout premier prototype (référence, ne pas modifier). |

## Démarrage
1. Décompresser dans un dossier vide `ruee-nocturne/`, puis `npm ci && npm test && npm run bench && npm run sim -- --runs 20 && npm run dev`.
2. `gh auth login`, projet Firebase créé avec Hosting.
3. Ouvrir Claude Code dans le dossier, coller le contenu de `PROMPT_CLAUDE_CODE.md`.
