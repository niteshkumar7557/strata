# Strata

*A command-line tool for Git repository history analysis*

## 1. Abstract

Strata is a command-line tool, built with Node.js, that analyses the commit history of any Git repository and reports on the health of the codebase. Instead of examining what the code currently looks like, Strata examines how the code has changed over time — which files are rewritten most often, which files are always modified together, and which files depend on a single developer.

This category of analysis is known in software engineering research as Mining Software Repositories (MSR). The insight it provides cannot be obtained by reading source code, because the information lives in the version history rather than in the files themselves. Strata packages four such metrics into a single terminal command that runs against any repository on the user's machine and produces both a coloured terminal report and an exportable HTML or JSON report.

## 2. Problem Statement and Motivation

When a developer joins an existing project, or when a team inherits a codebase, the first practical question is "where are the risky parts of this system?" Standard tooling answers this poorly. Linters check style, test coverage tools check which lines execute, and static analysers check for known bug patterns — but none of them can identify a file that has been rewritten forty times in six months, and none of them can reveal that two files in unrelated folders are always changed together because of an undocumented dependency.

That information already exists in the Git history of every project, but it is not accessible without writing custom scripts. Strata makes it accessible through a single command.

**Specific problems addressed:**

- **Unknown risk concentration** — teams do not know which files carry the highest defect risk.
- **Hidden coupling** — dependencies that exist in practice but are not visible in the import graph.
- **Knowledge silos** — files understood by exactly one developer, which become a serious problem when that person leaves the team.
- **Stale ownership** — files whose original author is no longer active, leaving them effectively unmaintained.

## 3. Objectives

1. To design and implement a cross-platform command-line application in Node.js that reads and parses Git commit history.
2. To compute four repository health metrics: change hotspots, change coupling, bus factor, and ownership decay.
3. To present these metrics as a readable terminal report using colour, tables, and ASCII charts.
4. To support machine-readable JSON output so the tool can be integrated into other scripts or CI pipelines.
5. To provide filtering options (date range, file path, file extension, author) so that large repositories can be analysed selectively.
6. To demonstrate correct handling of command-line arguments, flags, process exit codes, and standard output conventions.

## 4. Scope of the Project

### 4.1 In scope

- Analysis of any local Git repository provided as a path argument.
- Four analysis modules, each independently runnable via a subcommand.
- Terminal output with colour coding, tables, and bar charts drawn using text characters.
- JSON and static HTML export of the full report.
- Configuration through command-line flags and an optional configuration file.
- Graceful error handling for invalid paths, non-Git directories, and repositories with no commit history.

### 4.2 Out of scope

- Any graphical user interface or web dashboard.
- Direct integration with remote hosting APIs such as GitHub or GitLab.
- Support for version control systems other than Git.
- Parsing or understanding the semantic content of source code — Strata analyses history metadata only.
- Real-time monitoring or background daemon operation.

## 5. Proposed Features

### 5.1 Core features

- **Hotspot analysis** — ranks files by a combined score of change frequency and file size. Files that are both large and frequently modified are statistically the most likely locations for defects, and are shown at the top of the report.
- **Change coupling analysis** — identifies pairs of files that are committed together more often than chance would suggest. A pair with high coupling but no direct code-level dependency indicates hidden architectural coupling.
- **Bus factor analysis** — measures how concentrated the authorship of each file is. A file where one contributor has written more than a set percentage of the changes is flagged as a knowledge-silo risk.
- **Ownership decay analysis** — identifies files whose principal author has not committed to the repository within a configurable recency window.
- **Report export** — the same analysis can be emitted as a coloured terminal report, a structured JSON document, or a self-contained HTML page.

### 5.2 Optional / stretch features

- A `--since` and `--until` date filter for analysing a specific release cycle.
- An "author profile" subcommand summarising an individual contributor's activity footprint.
- A `--compare` mode that runs the analysis at two points in history and reports whether metrics improved or worsened.
- Sparkline charts showing commit activity per file over time.

## 6. Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Runtime | Node.js (v18 or later) | JavaScript execution environment |
| Language | JavaScript (ES Modules) | Application logic |
| Argument parsing | commander | Subcommands, flags, help text, validation |
| Git access | simple-git / child_process | Executing and reading git log output |
| Terminal styling | chalk | Colour-coded severity in output |
| Progress feedback | ora | Spinner during long history scans |
| Tabular output | cli-table3 | Aligned tables in the terminal |
| Distribution | npm (bin field) | Global installation as a shell command |
| Testing | Node built-in test runner | Unit tests for metric calculations |

## 7. System Architecture and Working

Strata is structured as a four-stage pipeline. Each stage is implemented as a separate module, which keeps the analysis logic independent of both the data source and the output format.

| Stage | Module | Responsibility |
|---|---|---|
| 1. Input | `cli.js` | Parse the subcommand, flags and repository path; validate that the target is a Git repository. |
| 2. Extract | `collector.js` | Execute a single `git log` command with a structured output format and stream the result. |
| 3. Analyse | `metrics/*.js` | Transform the parsed commit records into the four metric result sets. |
| 4. Present | `reporters/*.js` | Render the results as terminal output, JSON, or HTML. |

### 7.1 Data extraction

The entire history is obtained through a single Git command that prints, for each commit, the hash, author, date, and the number of lines added and removed per file. This output is streamed and parsed line by line into an in-memory list of commit records, each containing a timestamp, an author, and a list of changed file paths. Because only one process is spawned, performance remains acceptable even for repositories with several thousand commits.

### 7.2 Analysis

Each metric module receives the same array of commit records and produces its own result set. The modules do not share state, so a new metric can be added later without modifying existing code.

### 7.3 Presentation

Reporters receive the metric results and are responsible only for formatting. This separation means the JSON reporter and the terminal reporter are guaranteed to describe the same underlying analysis.

## 8. Core Logic and Metric Definitions

The mathematical basis of each metric is stated below so that the implementation can be verified against a clear definition.

### 8.1 Hotspot score

For each file, let `C` be the number of commits that modified it and `L` be its current line count. Both values are normalised to a 0–1 range across all files, and the hotspot score is their product:

```
score = normalise(C) × normalise(L)
```

A file scores highly only when it is both frequently changed and large. Small files that change often, and large files that never change, are correctly ranked lower.

### 8.2 Change coupling

For every pair of files (A, B) that has appeared together in at least one commit, let `together(A,B)` be the number of commits containing both, and `commits(A)` the number of commits containing A. The coupling of B on A is:

```
coupling(A → B) = together(A,B) / commits(A)
```

Pairs are reported only when the coupling exceeds a threshold and the pair has appeared together a minimum number of times, which prevents coincidental single-commit pairings from appearing in the results.

### 8.3 Bus factor

For each file, the proportion of total changed lines contributed by its most active author is computed. If this proportion exceeds a configurable threshold (default 0.8), the file is flagged. The repository-level bus factor is the number of authors required to account for a majority of all changes.

### 8.4 Ownership decay

A file is flagged as decayed when its principal author has made no commit to the repository within the recency window (default 180 days). The output lists the file, its principal author, and the number of days since that author was last active.

### 8.5 Complexity note

Hotspot, bus factor, and ownership decay are all single-pass operations over the commit list. Change coupling requires examining every pair of files within each commit, which is quadratic in the number of files per commit; since commits typically touch a small number of files, this remains efficient in practice. A configurable limit on files-per-commit prevents very large merge commits from degrading performance.

## 9. Justification for the Command-Line Platform

This project is deliberately designed so that a command-line interface is the correct and natural choice rather than an arbitrary one.

- **Filesystem and process access** — the tool must execute Git as a subprocess and read from arbitrary directories on the local machine. Browser-based applications are prohibited from doing either.
- **Composability** — JSON output allows Strata to be piped into other Unix tools, which is a defining advantage of the CLI model.
- **Automation** — the tool can be run inside a continuous integration pipeline or scheduled task without any human interaction, and communicates success or failure through exit codes.
- **Developer workflow** — the intended user is already working in a terminal inside a repository, so requiring them to open an application and navigate a UI would be slower than typing a single command.
- **Distribution** — publishing through npm allows global installation with one command and no installer.

## 10. Expected Outcome and Deliverables

1. A working Node.js command-line application, installable globally and runnable against any Git repository.
2. Four functioning analysis subcommands with configurable thresholds.
3. Terminal, JSON, and HTML report output.
4. Complete source code with a README covering installation, usage, and the definition of each metric.
5. A demonstration run against a well-known open-source repository, with the resulting report included in the final documentation.
6. A unit test suite covering the metric calculations against a small fixture repository.
7. The complete AI prompt history maintained for this project, as required by the course.

## 11. Development Timeline

| Phase | Activity | Duration |
|---|---|---|
| Phase 1 | Project setup, CLI skeleton, argument parsing, repository validation | 2 days |
| Phase 2 | Git log extraction and commit record parsing | 2 days |
| Phase 3 | Hotspot and bus factor metrics with unit tests | 2 days |
| Phase 4 | Change coupling and ownership decay metrics | 2 days |
| Phase 5 | Terminal reporter — colour, tables, ASCII charts | 2 days |
| Phase 6 | JSON and HTML export, configuration file support | 1 day |
| Phase 7 | Testing on multiple repositories, edge cases, error handling | 2 days |
| Phase 8 | Documentation, README, demonstration run, final report | 2 days |
| | **Total estimated duration** | **15 days** |

## 12. Testing and Validation Plan

- **Unit testing** — each metric function is tested against a hand-constructed set of commit records with a manually calculated expected result.
- **Fixture repository** — a small Git repository is created inside the test suite with a scripted commit history, so that results are deterministic and reproducible.
- **Edge case testing** — repositories with a single commit, files renamed mid-history, binary files, merge commits, and directories that are not Git repositories.
- **Performance testing** — the tool is run against a large public repository to confirm that analysis completes within an acceptable time.
- **Output validation** — JSON output is checked against a schema, and the terminal output is manually reviewed for readability at different terminal widths.

## 13. Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Very large repositories cause slow analysis or high memory usage | Stream the git log output rather than buffering it; provide `--since` and `--max-commits` limits |
| File renames break the history of a file, splitting its statistics | Enable Git rename detection in the log command and merge the records for renamed paths |
| Coupling analysis produces noisy results on small repositories | Apply a minimum-occurrence threshold before reporting any pair |
| Terminal output breaks on narrow or non-colour terminals | Detect terminal width at runtime and disable colour when output is redirected |
| Git is not installed on the evaluation machine | Check for Git at startup and exit with a clear, actionable error message |

## 14. Declaration of AI Assistance

In accordance with the course requirements, artificial intelligence tools will be used during the development of this project, and a complete record of that use will be submitted alongside the final code.

### 14.1 Intended use of AI

- Clarifying the correct format and flags for Git commands used in history extraction.
- Reviewing and debugging the parsing logic for `git log` output.
- Assistance with terminal formatting libraries and output layout.
- Generating test fixture data and reviewing edge cases.

### 14.2 Record maintained

- A dedicated conversation thread will be used exclusively for this project so that its prompt history remains separate from the other two projects.
- The complete prompt history, including debugging and correction prompts, will be exported and submitted.
- The design decisions, metric definitions, and final code structure remain the student's own work; AI is used as a reference and review aid, not as a substitute for design.

## 15. References

- Tornhill, A. — *Your Code as a Crime Scene*, Pragmatic Bookshelf (source of the hotspot and change-coupling techniques).
- Git documentation — `git-log` and `git-diff` options, including `--numstat` and rename detection.
- Node.js official documentation — `child_process`, streams, and the built-in test runner.
- Commander.js documentation — command-line argument parsing for Node.js.
- Literature on Mining Software Repositories (MSR) for the theoretical background of history-based code analysis.
