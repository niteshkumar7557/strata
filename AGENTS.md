# AGENTS.md — Strata Development Rules

## 1. Plan Before You Code

- Read `docs/design.md` for full context before making changes.
- For any non-trivial feature, outline the approach (files to create/modify, data flow, edge cases) before writing code.
- Get approval on the plan before starting implementation.

## 2. Test-Driven Development (TDD)

- Use the **native `node:test`** runner (`node --test`) — no external test frameworks.
- Write or update unit tests **before or alongside** the module they cover; never merge a module without its tests.
- Tests live in a top-level `tests/` directory, mirroring `src/` structure (e.g., `tests/metrics/hotspot.test.js`).
- Use hand-crafted fixture data (plain JS objects) so tests are deterministic and don't depend on a real Git repo.

## 3. Clean Modular Architecture

Follow the pipeline: **Collector → Metrics → Reporter**, mediated by the CLI entry point.

```
src/
  cli.js            # commander-based entry point; parses args, orchestrates pipeline
  collector.js      # runs `git log`, parses output into commit records
  metrics/
    hotspot.js      # hotspot analysis
    contributor.js  # bus-factor / contributor-risk analysis
  reporters/
    table.js        # chalk + cli-table3 terminal reporter
    html.js         # self-contained HTML report generator
```

- **Collector** returns a uniform `commits[]` array.
- **Each metric module** exports a pure function: `commits[] → results[]`.
- **Reporters** receive metric results and handle only formatting — no analysis logic.
- Modules must not share mutable state.

## 4. Leverage CLI Strengths

- Use **commander** for subcommands, flags, and auto-generated `--help`.
- Use **chalk** for colour-coded severity; respect `NO_COLOR` / piped output.
- Use **cli-table3** for aligned tables.
- Support `--format json` for machine-readable output (pipe-friendly).
- Use correct exit codes: `0` success, `1` user error, `2` unexpected error.
- Validate the target path is a Git repo before running analysis.

## 5. Code Style

- ES Modules (`"type": "module"` in `package.json`).
- Node.js ≥ 24, no transpilation.
- Prefer `const`; avoid `var`.
- Keep functions small and single-purpose.
- Document every exported function with a JSDoc comment.
