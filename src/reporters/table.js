/**
 * @module reporters/table
 *
 * Table reporter — the presentation layer of the Strata pipeline.
 *
 * Responsibilities:
 *   1. Receive raw metric results (plain arrays of objects).
 *   2. Render them as colour-coded terminal tables using chalk + cli-table3.
 *   3. Alternatively, output raw JSON when `--format json` is requested.
 *
 * This module contains ZERO analysis logic — it only formats and prints.
 * The same data can be rendered in different formats without re-running
 * the analysis.
 */

import chalk from 'chalk';
import Table from 'cli-table3';

// ──────────────────────────────────────────────
// Colour thresholds
// ──────────────────────────────────────────────

/**
 * Apply a colour to a score based on severity.
 *
 * Thresholds:
 *   - ≥ 0.6  → red    (high risk)
 *   - ≥ 0.3  → yellow (medium risk)
 *   - < 0.3  → green  (low risk)
 *
 * @param {number} score — a value between 0 and 1.
 * @returns {string} The score string wrapped in a chalk colour.
 */
function colourScore(score) {
  const text = score.toFixed(4);
  if (score >= 0.6) return chalk.red.bold(text);
  if (score >= 0.3) return chalk.yellow(text);
  return chalk.green(text);
}

/**
 * Apply a colour to an ownership ratio based on severity.
 *
 * Thresholds:
 *   - ≥ 0.9  → red    (single-person dependency)
 *   - ≥ 0.8  → yellow (high concentration)
 *   - < 0.8  → green  (healthy distribution)
 *
 * @param {number} ratio — a value between 0 and 1.
 * @returns {string} The ratio as a percentage string, colour-coded.
 */
function colourOwnership(ratio) {
  const text = `${(ratio * 100).toFixed(1)}%`;
  if (ratio >= 0.9) return chalk.red.bold(text);
  if (ratio >= 0.8) return chalk.yellow(text);
  return chalk.green(text);
}

// ──────────────────────────────────────────────
// Hotspot table
// ──────────────────────────────────────────────

/**
 * Print hotspot results as a formatted terminal table.
 *
 * Columns: Rank | File | Commits | Lines | Score
 *
 * @param {Array<{
 *   path:    string,
 *   commits: number,
 *   lines:   number,
 *   score:   number
 * }>} results — hotspot analysis output from `analyseHotspots()`.
 */
export function printHotspotTable(results) {
  if (results.length === 0) {
    console.log(chalk.yellow('\n  No hotspot data found.\n'));
    return;
  }

  // Print a header banner.
  console.log(chalk.cyan.bold('\n  🔥 Hotspot Analysis'));
  console.log(chalk.dim(`  Showing top ${results.length} files by churn × size\n`));

  // Create a compact table — no borders between rows, minimal padding.
  const table = new Table({
    head: [
      chalk.white.bold('#'),
      chalk.white.bold('File'),
      chalk.white.bold('Commits'),
      chalk.white.bold('Lines'),
      chalk.white.bold('Score'),
    ],
    colAligns: ['right', 'left', 'right', 'right', 'right'],
    style: {
      head: [],
      border: [],
      // Tighter cell padding: 1 space on each side instead of default.
      'padding-left': 1,
      'padding-right': 1,
    },
    // Remove the horizontal lines between each row.
    chars: {
      'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '',
    },
  });

  // Populate rows — one per file, ranked by score.
  results.forEach((entry, index) => {
    table.push([
      chalk.dim(String(index + 1)),
      entry.path,
      String(entry.commits),
      String(entry.lines),
      colourScore(entry.score),
    ]);
  });

  console.log(table.toString());
  console.log();
}

// ──────────────────────────────────────────────
// Contributor-risk table
// ──────────────────────────────────────────────

/**
 * Print contributor-risk results as a formatted terminal table.
 *
 * Columns: Rank | File | Top Author | Ownership | Changes | Authors
 *
 * @param {Array<{
 *   path:           string,
 *   topAuthor:      string,
 *   ownershipRatio: number,
 *   totalChanges:   number,
 *   authorCount:    number
 * }>} results — contributor analysis output from `analyseContributors()`.
 */
export function printContributorTable(results) {
  if (results.length === 0) {
    console.log(chalk.yellow('\n  No contributor-risk issues found.\n'));
    return;
  }

  // Print a header banner.
  console.log(chalk.cyan.bold('\n  👤 Contributor Risk (Bus Factor)'));
  console.log(chalk.dim(`  Showing ${results.length} files with high single-author ownership\n`));

  const table = new Table({
    head: [
      chalk.white.bold('#'),
      chalk.white.bold('File'),
      chalk.white.bold('Top Author'),
      chalk.white.bold('Ownership'),
      chalk.white.bold('Changes'),
      chalk.white.bold('Authors'),
    ],
    colAligns: ['right', 'left', 'left', 'right', 'right', 'right'],
    style: {
      head: [],
      border: [],
      'padding-left': 1,
      'padding-right': 1,
    },
    chars: {
      'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '',
    },
  });

  results.forEach((entry, index) => {
    table.push([
      chalk.dim(String(index + 1)),
      entry.path,
      entry.topAuthor,
      colourOwnership(entry.ownershipRatio),
      String(entry.totalChanges),
      String(entry.authorCount),
    ]);
  });

  console.log(table.toString());
  console.log();
}

// ──────────────────────────────────────────────
// JSON output
// ──────────────────────────────────────────────

/**
 * Print any metric results as formatted JSON to stdout.
 *
 * This is used when `--format json` is passed on the CLI,
 * making the output pipe-friendly for other tools (e.g. `jq`).
 *
 * @param {Array<object>} results — any metric result array.
 */
export function printJSON(results) {
  console.log(JSON.stringify(results, null, 2));
}
