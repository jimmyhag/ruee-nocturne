# [TO DEFINE: project name]

[TO DEFINE: two or three sentences: what the project is, who uses it, what it must
never do wrong.]

Code and identifiers are in English. All user-facing text is in [TO DEFINE: language].

This file is the single source of project rules for every contributor, human or AI
assistant. `CLAUDE.md` and `GEMINI.md` only import it: edit this file, not them.

## Getting started

- [TO DEFINE: runtime and version file, package manager, `just`.]
- [TO DEFINE: the install command, then the command that runs the app locally. Say
  whether any secret is needed; the aim is none, with fake adapters for every external
  service.]

## Contributing workflow

- Never push to the default branch. Work on a branch and open a pull request: CI runs
  `just check`.
- Merge only when CI is green. [TO DEFINE: what merging deploys, if anything.]
- The rules below are enforced by the gates (types, lint, tests, dead code and
  boundaries) wherever a tool can enforce them. When one of them blocks you, fix the
  code. Do not relax the configuration of a gate, and do not skip, delete or weaken a
  test to make a change pass; if a rule is truly wrong, say so in the pull request and
  change it in a dedicated commit.
- What tooling cannot check is still mandatory: the business invariants and the
  conventions described here.
- One pull request per coherent change, with what was verified and what was not.
- A request is specified before it is built: the sparring partner (`.agents/README.md`)
  challenges it with an owner and leaves a spec in `docs/specs/` (starting with
  `**Statut : 🟡 Prêt pour le dev**`). The implementation turns each scenario into a
  test of the same name: the English equivalent of the scenario title. When all tests
  pass and the implementation is complete, the developer (human or AI) updates the
  spec file to `**Statut : 🟢 Implémenté**`.

## Commands

`just check` is the gate: it must pass locally and in CI before every commit.
`just preflight` is the fast subset for the edit loop: run it after every change,
`check` before the commit.

| Command          | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `just dev`       | [TO DEFINE]                                                |
| `just test`      | Tests once; `just test <filter>` runs a subset             |
| `just typecheck` | [TO DEFINE: the type checker, strict]                      |
| `just lint`      | [TO DEFINE: the linter], warnings fail                     |
| `just deadcode`  | [TO DEFINE: dead code and dependency boundaries]           |
| `just preflight` | typecheck + lint + test + deadcode: the edit-loop gate     |
| `just check`     | preflight + [TO DEFINE: build, slow suites]: the commit gate |

## Business invariants (non-negotiable)

To be written after the first sparring session. One numbered sentence per invariant,
each one something a test or the inspector can check.

## Architecture

[TO DEFINE: the layers as they exist, one line each, and what each layer may import.
Keep the table below; the lint enforces it.]

| Layer | May import |
| ----- | ---------- |
| [TO DEFINE] | [TO DEFINE] |

### Ports and adapters

- Every external service (an API, a database, a model, a clock, the file system) goes
  through a contract written with domain types only.
- Every contract has at least two adapters: a real one and a fake one. The fake is
  deterministic: injected clock, injected latency, recorded calls.
- A single composition root chooses the adapters (from an environment variable) and
  injects them. Nothing else imports an adapter.
- Contract tests: one shared suite run against every adapter of a contract.
- Operations never throw for expected failures: they return a typed result with a
  typed error.
- No dead code: an export appears with its first consumer.

### Layout

```
[TO DEFINE: the folder tree, one line per folder with its role]
.agents/            the roles AI assistants play and the skills they load (README.md)
docs/specs/         one spec per request, written by the sparring partner
docs/harness/       what each full round of the harness taught, with the agents' reports
```

Do not create empty folders: a folder appears with its first file.

## Working rules

- Versions are resolved with the registry at install time, never from memory.
- Read the official documentation of a tool before configuring it. Report any
  incompatibility instead of working around it.
- Never say "it works" without having run it.
- No secret in the repository, ever. [TO DEFINE: where configuration comes from.]

## Out of scope

[TO DEFINE: what this project deliberately does not do, so that nobody builds it by
accident. Provide the contracts, not the implementations.]
