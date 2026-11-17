# Task runner. `just check` is the gate before every commit (CI runs `just ci`: the same with the whole e2e suite);
# `just preflight` is the edit-loop subset.
# Every recipe calls the project's npm scripts: the old commands (`npm run lint`, `npm test`…) keep working.

# cmd.exe on Windows (sh is not guaranteed to be on PATH); sh elsewhere.
[windows]
set shell := ["cmd.exe", "/c"]

# List the available recipes
default:
    @just --list

# Start the game locally (Vite, http://localhost:5173); run it in the background, it never returns
dev:
    npm run dev

# Unit tests once (Vitest, simulation and UI logic); `just test src/sim/poi.test.ts` runs a subset
test *args:
    npx vitest run {{args}}

# Type-check, strict (tsc --noEmit)
typecheck:
    npm run -s typecheck

# Lint: ESLint with zero warnings (layer boundaries included), then Prettier
lint:
    npm run -s lint

# Dead code, orphan files, undeclared dependencies (knip)
deadcode:
    npx knip --no-progress

# Unit tests under coverage, with the thresholds of vite.config.ts (simulation ≥ 80 %); ~3× slower than `just test`
coverage:
    npx vitest run --coverage

# Edit-loop gate, run after every change (check stays the gate before a commit)
preflight: typecheck lint test deadcode

# Production build (dist/)
build:
    npm run -s build

# Simulation step budget at 400 enemies (PLAN.md §4.3); fails over budget
bench:
    npm run -s bench

# Smoke simulation: a few games of the bot must run without error (balance is judged by `just sim`, not here)
sim-smoke:
    npm run -s sim -- --runs 6 --bot average --seed 42 --until 300 --no-targets

# Smoke e2e, desktop and mobile: the page loads, a run starts within the draw-call budget, offline reload works
e2e-smoke:
    npx playwright test e2e/smoke.spec.ts --trace off

# Everything that must pass before a commit: preflight (tests under coverage), the build, the bench, a smoke simulation and the smoke e2e
check: typecheck lint coverage deadcode build bench sim-smoke e2e-smoke

# The CI gate: check with the whole Playwright suite instead of the smoke (which it contains)
ci: typecheck lint coverage deadcode build bench sim-smoke e2e

# The whole Playwright suite, desktop and mobile (long: run by CI on every pull request)
e2e *args:
    npx playwright test --trace off {{args}}

# Balance simulation with targets (`just sim --runs 200 --profile maxed --seed 42`)
sim *args:
    npm run -s sim -- {{args}}
