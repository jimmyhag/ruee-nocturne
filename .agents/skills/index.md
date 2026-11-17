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
| [TO DEFINE: one row per layer found by `harness-setup`, e.g. `ui`, `domain`, `adapter`, `api`] | [TO DEFINE: the folders] | none yet | [TO DEFINE: what must run beyond `just check`, or "none"] |
| `harness` | `.agents/`, `.claude/`, `docs/`, `AGENTS.md` | none (owners' files) | An owner's review |

A spec in the sparring phase has no files yet: route on the files the request will
touch once the code has been looked up.

## 2. Skills

| Skill | Path | Load when the task type is… |
| :---- | :--- | :-------------------------- |
| `sparring` | `.agents/skills/sparring/SKILL.md` | never (owners only: challenges a request and writes the spec) |
| `harness-setup` | `.agents/skills/harness-setup/SKILL.md` | never (owners only: installs the harness and the gates, once) |

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
