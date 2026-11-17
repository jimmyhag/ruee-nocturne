# Working with agents

How the owners work with AI assistants on this repository. `AGENTS.md` holds the
rules of the project; this folder holds the **roles** the assistants play and the
**skills** they load. Nothing here relaxes a rule of `AGENTS.md`.

## Why this folder

Markdown in Git, independent of any tool: the same roles serve Claude Code today and
any other assistant tomorrow. Tools that need their own location get a **symbolic
link** into this folder, never a copy, so there is a single source to edit:

```
.agents/skills/<name>/          the skill (SKILL.md and its support files)
.agents/<role>.md               a delegated agent (frontmatter + system prompt)
.claude/skills/<name>  ->  ../../.agents/skills/<name>     one relative link per skill
.claude/agents/<role>.md  ->  ../../.agents/<role>.md      one relative link per agent
```

`.agents/skills/` is also the location other assistants (Codex, the `skills`
installer) read natively. With an assistant that has no delegated agents, a role is
played by opening a separate session and giving it the role file as its first message,
with the spec path.

## The flow

Every role starts the same way: it **routes the task** with the table of
`skills/index.md` (from the paths the work touches) and loads only the skills and
checks of those types. No role is "the front-end agent" or "the back-end agent": the
routing decides, so the same roles serve every kind of change.

0. **Setup** (`skills/harness-setup/`), once: an owner runs it on a project that does
   not have the harness yet. It inventories the stack, installs the missing gates one
   at a time, writes `AGENTS.md` from the template and fills every `TO DEFINE` marker.
   After it, the files of this folder are the owners' and no agent edits them.
1. **Sparring** (`skills/sparring/`): before anything is built, an owner brings a
   request, technical or functional. The sparring partner reads the repository, gauges
   what the owner already masters, challenges every branch of the request, teaches the
   concepts it relies on, and ends with a spec in `docs/specs/`. It writes no code.
   When the request touches a user interface, the spec carries a `## UI & Layout
   Contract`. Invoked by the owner (`/sparring` in Claude Code); it never triggers
   itself.
2. **Development** (`developer.md`): an owner delegates the spec to the developer agent
   ("Use the developer subagent on docs/specs/<name>.md", or `@agent-developer` in
   Claude Code). It runs apart, in its own git worktree, reads the skills index and
   loads only the skills the spec triggers, implements one scenario at a time test
   first behind `just preflight` (the fast gate, run after every change) and
   `just check` (the full gate, before the commit), and hands back a commit on the
   worktree's branch with a report: done, verified, not verified, deviations,
   questions. It never pushes, merges or edits the harness; the owners review and open
   the pull request. A fresh worktree has no installed dependencies: the agent installs
   first, which is the price of the isolation. The worktree starts from the committed
   history, so the spec must be committed (merged on the default branch, in the normal
   flow) before the developer is launched: an uncommitted spec is invisible to it.
3. **Inspection** (`inspector.md`): before the pull request is opened or merged, an
   owner launches the inspector on the developer's branch ("Use the inspector subagent
   on branch <name> against docs/specs/<name>.md", or `@agent-inspector`). It runs
   apart from the developer, with a fresh context, so it is never judging its own
   work. It reads the diff, routes it, maps every scenario of the spec to its test,
   and walks the rules of `AGENTS.md` the tooling cannot check. It changes nothing and
   reports findings with file and line, each tagged blocking or advisory, plus what
   only a browser, a device or an owner can judge. The owners decide; a blocking
   finding goes back to the developer with the report.
4. **Lessons** (`docs/harness/`): after a full round, an owner writes what the round
   taught about the harness itself, with the agents' reports verbatim, and changes the
   roles in a dedicated commit.

A skill changes how the current session behaves and can talk with the owner (sparring
and setup are interactive, so they are skills). A delegated agent runs apart and only
reports back (development and inspection are delegated). The developer and the
inspector are always two separate runs: a model reviewing the code it just wrote finds
what it already believed.

## Files

| File                     | Purpose                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `competences.md`         | What each owner masters, updated by the sparring partner           |
| `developer.md`           | The developer agent: a spec in, a tested commit and a report out   |
| `inspector.md`           | The inspector agent: read-only review of what tooling cannot check |
| `skills/index.md`        | Task routing, which skill each role loads, and how to add one      |
| `skills/sparring/`       | The sparring partner protocol (calibrate, grill, teach, deliver)   |
| `skills/harness-setup/`  | Installing the harness and the gates on a project, once            |

Specs live in `docs/specs/`, one file per request, named after the request; their
reference images in `docs/specs/assets/<spec-name>/`. Lessons live in `docs/harness/`,
one file per round.

## Rules for this folder

- A skill or role is added or changed in its own commit, reviewed by an owner like any
  other change. An assistant never edits a role it is playing.
- Roles and skills are written in English like the rest of the repository; sessions
  with the owners are in [TO DEFINE: the owners' language].
- No empty folder and no placeholder: a role appears with its first use. The
  `TO DEFINE` markers of the kit are the one exception, and `harness-setup` removes
  them all.
