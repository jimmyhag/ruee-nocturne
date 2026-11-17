---
name: harness-setup
description: Installs the harness on a project that does not have it yet. Inventories the stack and the existing gates (types, lint, tests, boundaries, task runner, CI), lists what is missing, installs each missing gate one at a time with the owner's agreement, writes AGENTS.md from the template and fills every TO DEFINE marker. User-triggered only; run it once, before the first sparring session.
disable-model-invocation: true
---

You set up the harness on this project, with its owner, in mentor mode: before each
step you say in a few lines what you are about to do and why, then you wait for their
agreement. You do nothing they did not agree to. Speak the owner's language (the kit's
README is in French; follow the owner). Code, identifiers, commit messages and the
harness files stay in English.

This is the only session allowed to edit the harness files (`.agents/`, `.claude/`,
`AGENTS.md`, the `justfile`, lint, type, test and CI configuration), because the harness
does not exist yet. Once it exists, those files are the owner's: the developer agent
never touches them.

The harness only works on a project with **gates**: automatic checks that tell the
developer agent it is wrong, without a human reading the code. Types, lint, tests, and
ideally dependency boundaries and dead code. Your job is to make sure every gate
exists, bites, and runs behind two commands, `just preflight` and `just check`, before
anyone writes a spec.

## 0. Who and what

Ask who participates (one owner or several: their names become the columns of
`.agents/competences.md`), and what the project is in one sentence. Then read the
kit's `README.md` and `AGENTS.template.md`, so you know what the end state looks like.

## 1. Inventory (read-only, then one table)

Look, do not ask. Read the manifest(s), the lock file, the scripts, the existing
configuration files, the CI workflows, the folder layout, the README. Determine:

- the language(s), the runtime and its version file (`.node-version`, `.python-version`,
  `go.mod`, `rust-toolchain.toml`…), the package manager and whether a lock file exists;
- how the app runs locally and whether it needs secrets to start;
- the folders that form layers (domain, application, adapters, UI, scripts…) and the
  dependency direction between them, as far as the code shows it;
- for every gate below, whether it exists, where it is configured, and whether it is
  strict (a warning that does not fail is not a gate).

Then show the owner one table and stop:

| Gate | Purpose | Found | Strict? | Proposal |
| ---- | ------- | ----- | ------- | -------- |
| Types | the compiler refuses an unsound program | … | … | … |
| Lint | warnings fail; forbidden imports between layers | … | … | … |
| Tests | a runner, run once, with a filtered mode for the edit loop | … | … | … |
| Dead code and boundaries | an export nobody uses, an import across a layer, fail | … | … | … |
| Task runner (`just`) | `just preflight` and `just check` exist and are the only entry points | … | … | … |
| CI | `just check` runs on every pull request and on the default branch | … | … | … |
| Branch protection | the default branch cannot be pushed to directly; the check is required | … | … | owner does it in the forge's settings |

Proposals name a tool for this stack. Suggestions, to be confirmed against each tool's
official documentation before installing, never from memory:

| Stack | Types | Lint | Tests | Dead code / boundaries |
| ----- | ----- | ---- | ----- | ---------------------- |
| TypeScript | `tsc` with `strict` | ESLint, `--max-warnings 0`, `no-restricted-imports` between layers | Vitest or the runner in place | `knip` or `fallow`; `dependency-cruiser` for boundaries |
| Python | `pyright` or `mypy --strict` | `ruff check` | `pytest` | `vulture`; `import-linter` for boundaries |
| Go | `go vet` | `golangci-lint` or `staticcheck` | `go test ./...` | `golangci-lint` `unused`; `depguard` for boundaries |
| Rust | `cargo check` | `cargo clippy -- -D warnings` | `cargo test` | `cargo-machete` |

Keep what exists when it is strict: the harness adapts to the project's tools, not the
other way round. Replace a tool only when the owner agrees and says why.

## 2. Plan, then one gate at a time

Propose the order (usually: task runner, then types, lint, tests, boundaries, CI) and
wait for the owner's agreement. Then, for each gate, in its own commit on a branch:

1. Resolve the tool's version with the registry (`npm view`, `pip index versions`,
   `go list -m -versions`, `cargo search`), never from memory. Read its official
   documentation before writing its configuration.
2. Install and configure it strictly.
3. **Prove it bites**: introduce a deliberate error of the kind the gate is for (an
   unsound type, a forbidden import, a failing assertion, an unused export), run the
   gate, see it fail, revert the error. A gate that has never failed is not known to
   work.
4. Run it on the real code. Existing violations are the owner's decision: fix them now
   in this commit when they are few and mechanical, otherwise list them and let the
   owner choose between fixing and a dated, explicit exception. Never silence a rule
   to go green.
5. Add its recipe to the `justfile`, and add it to `preflight` (fast checks) or to
   `check` (everything, including the build and the slow suites).
6. Time `just preflight` and `just check`, cold and warm, and tell the owner. If
   `preflight` is slower than about a minute, look for caching before adding more.

## 3. CI

A single workflow that runs `just check` on every pull request and on the default
branch, with the runtime version taken from the project's version file, third-party
actions pinned to a version (a commit SHA when the forge allows it), least privilege.
Then ask the owner to protect the default branch in the forge's settings: no direct
push, the check required. You cannot do that part; say so.

## 4. AGENTS.md

Write `AGENTS.md` from `AGENTS.template.md`, keeping its sections and order. Fill what
the inventory and the installed gates make true: Getting started, Contributing
workflow, Commands, Architecture (the layers as they exist today and the dependency
rules the lint now enforces), Working rules. Leave **Business invariants** with the
sentence "to be written after the first sparring session": inventing them is not your
job. Leave **Out of scope** for the owner to dictate.

Then create `CLAUDE.md` and `GEMINI.md` containing only `@AGENTS.md`, unless the
assistant in use reads `AGENTS.md` natively and the owner prefers not to have them.

## 5. The harness files

- Replace every `[TO DEFINE: …]` marker in `.agents/README.md`, `.agents/developer.md`,
  `.agents/inspector.md`, `.agents/skills/index.md` and `.agents/skills/sparring/SKILL.md`
  with what is now true for this project. Fill the routing table of `skills/index.md`
  with one row per layer the inventory found; no skill yet (skills appear with their
  first spec).
- `.agents/competences.md`: one column per participant, no rows.
- `.claude/agents/*.md` and `.claude/skills/*` are relative symbolic links into
  `.agents/`. Check they survived the copy (`ls -l .claude/agents .claude/skills`).
  On Windows, or if links are not possible, copy the files instead and write in
  `.agents/README.md` that `.claude/` is a copy to keep in sync.
- `.gitignore`: `.claude/settings.local.json` and `.claude/worktrees/`.
- `docs/specs/` and `docs/harness/` are created by their first file, not now.

## 6. Exit checklist

Show the owner the list, each line checked by a command you ran:

- `just preflight` green, `just check` green, with their timings.
- Every gate proven to bite (name the deliberate error you used for each).
- CI green on the pull request that carries the setup.
- `grep -rn "TO DEFINE" AGENTS.md .agents/ justfile` returns nothing.
- `ls -l .claude/agents .claude/skills` shows links (or the copy is documented).
- Branch protection: done by the owner, or listed as pending.

Then say, in one line, what comes next: a first small request, through the sparring
partner (`/sparring` in Claude Code, or the skill invoked the way your assistant
invokes skills), which will produce the first spec in `docs/specs/`.

## Report

End with a report for the owner, in their language, in this order:

- **Fait**: the gates installed or kept, each with its tool and version, and the
  commits.
- **Vérifié**: the exact commands run and their results, including the deliberate
  errors that proved each gate bites.
- **Non vérifié**: what you could not run here (a CI you cannot see, an OS you do not
  have).
- **Décisions laissées au propriétaire**: existing violations, exceptions, branch
  protection, anything you did not decide.

## Never

- Change the behaviour of the application, or weaken, skip or delete an existing test.
- Install, upgrade or remove a tool without the owner's agreement.
- Choose a version from memory, or configure a tool without reading its documentation.
- Declare a gate installed that you have not seen fail.
- Write a business rule into `AGENTS.md`: the sparring partner does that, with the
  owner, in the first spec.
