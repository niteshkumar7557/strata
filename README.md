# Strata

A command-line tool that analyses Git repository history and reports on codebase health. Instead of examining what the code currently looks like, Strata examines **how the code has changed over time** — which files are modified most often, and which files depend on a single developer.

## Why Strata?

Standard tooling (linters, coverage tools, static analysers) can't tell you:

- Which file has been rewritten 40 times in 6 months
- Which file only one person on the team understands

That information already exists in your Git history. Strata makes it accessible through a single command.

## Features

| Command | What it finds |
|---------|--------------|
| `strata hotspot` | Files that are both **large** and **frequently changed** — highest defect risk |
| `strata contributor` | Files where **one author owns ≥ 80%** of all changes — bus-factor risk |

**Output formats:** colour-coded terminal tables, JSON (pipe-friendly), and self-contained HTML reports.

## Installation

```bash
# Clone the repository
git clone https://github.com/niteshkumar7557/strata.git
cd strata

# Install dependencies
npm install

# (Optional) Link globally to use `strata` as a command
npm link
```

**Requirements:** Node.js ≥ 24, Git installed and available on PATH.

## Usage

### Hotspot Analysis

Find files with the highest churn × size score:

```bash
# Run against current directory
strata hotspot .

# Run against any repo
strata hotspot /path/to/repo

# Show top 5 results only
strata hotspot . --top 5

# Filter by date range
strata hotspot . --since 2025-01-01 --until 2025-06-30

# JSON output (pipe-friendly)
strata hotspot . --format json

# Self-contained HTML report
strata hotspot . --format html
# → saves strata-hotspot-report.html in the current directory
```

**How scoring works:**

```
score = normalise(changeFrequency) × normalise(lineCount)
```

A file scores highly **only** when it is both large and frequently modified. Small but volatile files and large but stable files both receive lower scores.

### Contributor Risk (Bus Factor)

Find files with dangerously concentrated authorship:

```bash
# Default: flag files where one author owns ≥ 80%
strata contributor .

# Custom threshold: flag files at ≥ 60% ownership
strata contributor . --threshold 0.6

# JSON output
strata contributor . --format json

# HTML report
strata contributor . --format html
```

**How it works:**

For each file, Strata tallies lines changed (added + deleted) per author and computes:

```
ownershipRatio = topAuthorLines / totalLines
```

Files exceeding the threshold are flagged as knowledge-silo risks.

### Output Formats

| Format | Flag | Description |
|--------|------|-------------|
| Terminal table | `--format table` (default) | Colour-coded tables with green/yellow/red risk indicators |
| JSON | `--format json` | Machine-readable output, pipe into `jq` or other tools |
| HTML | `--format html` | Self-contained dark-themed page with CSS bar charts |

### Colour Coding

| Colour | Hotspot Score | Ownership Ratio |
|--------|--------------|-----------------|
| 🟢 Green | < 0.3 (low risk) | < 80% (healthy) |
| 🟡 Yellow | 0.3 – 0.6 (medium) | 80 – 90% (concentrated) |
| 🔴 Red | ≥ 0.6 (high risk) | ≥ 90% (single-person dependency) |

## Architecture

Strata follows a clean three-stage pipeline:

```
Collector → Metrics → Reporter
```

```
src/
  cli.js              # Commander-based entry point; parses args, orchestrates pipeline
  collector.js         # Runs git log, parses output into commit records
  metrics/
    hotspot.js         # Hotspot analysis (frequency × size)
    contributor.js     # Bus-factor / contributor-risk analysis
  reporters/
    table.js           # Chalk + cli-table3 terminal reporter + JSON output
    html.js            # Self-contained HTML report generator
```

- **Collector** returns a uniform `commits[]` array.
- **Each metric module** exports a pure function: `commits[] → results[]`.
- **Reporters** receive metric results and handle only formatting — no analysis logic.
- Modules do not share mutable state.

## Testing

Tests use the **native Node.js test runner** (`node:test`) with hand-crafted fixture data — no real Git repository needed.

```bash
# Run all tests
node --test

# Run a specific test file
node --test tests/collector.test.js
node --test tests/metrics/hotspot.test.js
node --test tests/metrics/contributor.test.js
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js (≥ 24) |
| Language | JavaScript (ES Modules) |
| Argument parsing | commander |
| Terminal styling | chalk |
| Tabular output | cli-table3 |
| Testing | Native `node:test` runner |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | User error (invalid path, not a Git repo, bad flag value) |
| `2` | Unexpected error |

## License

MIT
