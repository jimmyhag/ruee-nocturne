# Skills index

The skills the roles may load, and when. Roles are generic: none of them knows in
advance which part of the system a task touches. Each one **routes the task first**
with the table below, then loads only the skills and runs only the checks of the task
types it found. The sparring partner and the setup skill are listed for completeness:
owners invoke them, agents do not.

## 1. Route the task

List the paths the work touches: the files a spec names (developer, sparring partner)
or the files of the diff (inspector, `git diff --name-only <base>...<head>`). Every
row whose paths match is one task type; a task usually has several. Never skip a type
because another one looks "main".

| Task type | Paths touched | Skills to load | Extra verification |
| :-------- | :------------ | :------------- | :----------------- |
| `sim` | `src/sim/`, `tools/bots/`, `tools/sim-cli.ts`, `tools/targets.ts` | `survivor-design`, `sim-testing` | Any balance change: `just sim` on 4 seeds × 2 profiles (maxed, naked), outputs pooled with `node tools/sim-pool.mjs`; then the `balance-playtester` agent |
| `render` | `src/render/`, `tools/assets/`, `public/models/` | `three-rendering`, `mobile-perf`, `game-feel` | `npm run shot` and the PNG files read; mobile draw calls in `e2e/stress.spec.ts`; the `perf-reviewer` agent |
| `loop` | `src/main.ts`, `src/debug.ts` | `mobile-perf`, `game-feel` | `just bench`; the `perf-reviewer` agent |
| `ui` | `src/ui/`, `index.html`, `src/i18n/` | `game-feel` | The e2e of the screen in both projects (`just e2e e2e/<spec>.ts`), screenshots read, French and English |
| `platform` | `src/platform/`, `vite.config.ts`, `public/` (but models), `tools/audio/` | `pwa-release`, `mobile-perf` | `just e2e e2e/smoke.spec.ts e2e/account.spec.ts` (offline reload, no request without an account) |
| `meta` | `src/meta/`, `firestore.rules`, `firebase.json` | `sim-testing` | Rule 8: `e2e/account.spec.ts`; the Firestore rules job of CI |
| `e2e` | `e2e/`, `playwright.config.ts` | `sim-testing` | The changed specs, desktop and mobile |
| `harness` | `.agents/`, `.claude/`, `docs/`, `AGENTS.md` | none (owners' files) | An owner's review |

A spec in the sparring phase has no files yet: route on the files the request will
touch once the code has been looked up.

## 2. Skills

| Skill | Path | Load when the task type is… |
| :---- | :--- | :-------------------------- |
| `sparring` | `.agents/skills/sparring/SKILL.md` | never (owners only: challenges a request and writes the spec) |
| `harness-setup` | `.agents/skills/harness-setup/SKILL.md` | never (owners only: installs the harness and the gates, once) |
| `survivor-design` | `.claude/skills/survivor-design/SKILL.md` | `sim` |
| `sim-testing` | `.claude/skills/sim-testing/SKILL.md` | `sim`, `meta`, `e2e` |
| `three-rendering` | `.claude/skills/three-rendering/SKILL.md` | `render` |
| `mobile-perf` | `.claude/skills/mobile-perf/SKILL.md` | `render`, `loop`, `platform` |
| `game-feel` | `.claude/skills/game-feel/SKILL.md` | `render`, `loop`, `ui` |
| `pwa-release` | `.claude/skills/pwa-release/SKILL.md` | `platform` |

The six game skills predate the harness and live in `.claude/skills/` as plain folders
(not links into `.agents/`): they are Jimmy's, and stay where Claude Code has always
read them. The review agents `perf-reviewer` and `balance-playtester` live in
`.claude/agents/` for the same reason.

Load skills with whatever your assistant offers (the Skill tool in Claude Code, the
native `.agents/skills/` discovery elsewhere, or simply reading the `SKILL.md`). The
procedure is the same everywhere.

## Adding a skill

A skill is a procedure the project has already applied once and wants applied the same
way again: the steps, the files, the checks, the traps met the first time. It is not a
rule (rules live in `AGENTS.md`) and not a tutorial (no concept explanation). The
first skills of a project usually appear after its first two or three specs, when a
procedure repeats.

1. A folder `skills/<kebab-name>/` with a `SKILL.md`: frontmatter `name` and
   `description` (one sentence saying when it applies), then the procedure.
2. One relative link for Claude Code: `ln -s ../../.agents/skills/<name> .claude/skills/<name>`.
3. One row in each table above (a task type if none fits, and the skill), with paths
   precise enough that no role ever hesitates.
4. Its own commit, reviewed by an owner. A skill written by an agent after a task is a
   proposal until an owner has read it.

Keep a skill short: the developer loads it on top of the spec and `AGENTS.md`. If a
skill grows past a screen, split it into support files next to its `SKILL.md`, or move
the stable part into `AGENTS.md`.
