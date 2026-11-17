# Task runner. `just check` is the gate, locally and in CI.
# `harness-setup` replaces every recipe that fails with "TO DEFINE".

# cmd.exe on Windows (sh is not guaranteed to be on PATH); sh elsewhere.
[windows]
set shell := ["cmd.exe", "/c"]

# List the available recipes
default:
    @just --list

# Start the application locally
dev:
    @echo "TO DEFINE: the command that runs the app" && exit 1

# Run the test suite once; `just test <filter>` runs a subset
test *args:
    @echo "TO DEFINE: the test runner (filtered when args are given: {{args}})" && exit 1

# Type-check, strict
typecheck:
    @echo "TO DEFINE: the type checker" && exit 1

# Lint; warnings fail
lint:
    @echo "TO DEFINE: the linter with warnings as errors" && exit 1

# Dead code and dependency boundaries
deadcode:
    @echo "TO DEFINE: the dead-code and boundaries tool" && exit 1

# Edit-loop gate, run after every change (check stays the gate before a commit)
preflight: typecheck lint test deadcode

# Everything that must pass before a commit: preflight plus the build and the slow suites
check: preflight
    @echo "TO DEFINE: the production build and anything too slow for preflight" && exit 1
