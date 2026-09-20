#!/usr/bin/env node

/**
 * @module cli
 *
 * CLI entry point for Strata — orchestrates the full pipeline:
 *
 *   1. Parse subcommand + flags  (commander)
 *   2. Validate the target path  (collector.isGitRepo)
 *   3. Extract commit history    (collector.collectCommits)
 *   4. Run the chosen metric     (metrics/*.js)
 *   5. Present the results       (reporters/table.js)
 *
 * Subcommands:
 *   strata hotspot <path>       — find high-churn, high-size files
 *   strata contributor <path>   — find single-author knowledge silos
 *
 * Common flags:
 *   --top <N>            — number of results to show (default: 10)
 *   --format <table|json|html> — output format (default: table)
 *   --since <date>       — only analyse commits after this date
 *   --until <date>       — only analyse commits before this date
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isGitRepo, collectCommits, getFileSizes } from './collector.js';
import { analyseHotspots } from './metrics/hotspot.js';
import { analyseContributors } from './metrics/contributor.js';
import { printHotspotTable, printContributorTable, printJSON } from './reporters/table.js';
import { generateHotspotHTML, generateContributorHTML } from './reporters/html.js';

// ──────────────────────────────────────────────
// Program setup
// ──────────────────────────────────────────────

const program = new Command();

program
  .name('strata')
  .description('Analyse Git repository history for code health insights')
  .version('0.1.0');

// ──────────────────────────────────────────────
// Shared option definitions
// ──────────────────────────────────────────────

/**
 * Attach the common flags (--top, --format, --since, --until) to a command.
 * This avoids duplicating option definitions across subcommands.
 *
 * @param {Command} cmd — a commander Command instance.
 * @returns {Command} The same command, with options attached.
 */
function addCommonOptions(cmd) {
  return cmd
    .option('-n, --top <number>', 'number of results to display', '10')
    .option('-f, --format <type>', 'output format: table, json, or html', 'table')
    .option('--since <date>', 'analyse commits after this date (e.g. 2025-01-01)')
    .option('--until <date>', 'analyse commits before this date');
}

// ──────────────────────────────────────────────
// Validation helper
// ──────────────────────────────────────────────

/**
 * Validate that the given path is a Git repository.
 * If not, print an error message and exit with code 1.
 *
 * @param {string} repoPath — the path provided by the user.
 * @returns {Promise<void>} Resolves if valid, exits the process if not.
 */
async function validateRepo(repoPath) {
  const valid = await isGitRepo(repoPath);
  if (!valid) {
    console.error(
      chalk.red(`\n  ✖ "${repoPath}" is not a Git repository.\n`) +
      chalk.dim('    Make sure the path exists and contains a .git directory.\n'),
    );
    process.exit(1);
  }
}

/**
 * Validate and parse the shared CLI options.
 * Exits with code 1 if --format or --top have invalid values.
 *
 * @param {object} opts — raw options object from commander.
 * @returns {{ top: number, format: string }} Validated and parsed options.
 */
function validateOptions(opts) {
  // Validate --format: must be one of the supported output types.
  const validFormats = ['table', 'json', 'html'];
  if (!validFormats.includes(opts.format)) {
    console.error(
      chalk.red(`\n  ✖ Unknown format "${opts.format}".\n`) +
      chalk.dim(`    Supported formats: ${validFormats.join(', ')}\n`),
    );
    process.exit(1);
  }

  // Validate --top: must be a positive integer.
  const top = parseInt(opts.top, 10);
  if (Number.isNaN(top) || top < 1) {
    console.error(
      chalk.red(`\n  ✖ --top must be a positive number, got "${opts.top}".\n`),
    );
    process.exit(1);
  }

  return { top, format: opts.format };
}

// ──────────────────────────────────────────────
// Subcommand: hotspot
// ──────────────────────────────────────────────

const hotspotCmd = new Command('hotspot')
  .description('Find files with highest churn × size (defect risk)')
  .argument('<path>', 'path to the Git repository');

addCommonOptions(hotspotCmd);

hotspotCmd.action(async (repoPath, opts) => {
  try {
    // Step 1: Validate inputs.
    await validateRepo(repoPath);
    const { top, format } = validateOptions(opts);

    // Step 2: Collect commit history from Git.
    const commits = await collectCommits(repoPath, {
      since: opts.since,
      until: opts.until,
    });

    // Step 3: Get current file sizes (line counts) for scoring.
    const fileSizes = await getFileSizes(repoPath);

    // Step 4: Run the hotspot analysis.
    const results = analyseHotspots(commits, fileSizes, { top });

    // Step 5: Present the results in the chosen format.
    if (format === 'json') {
      printJSON(results);
    } else if (format === 'html') {
      const html = generateHotspotHTML(results, repoPath);
      const outPath = resolve('strata-hotspot-report.html');
      await writeFile(outPath, html);
      console.log(chalk.green(`\n  ✔ Report saved to ${outPath}\n`));
    } else {
      printHotspotTable(results);
    }
  } catch (err) {
    console.error(chalk.red(`\n  ✖ Unexpected error: ${err.message}\n`));
    process.exit(2);
  }
});

program.addCommand(hotspotCmd);

// ──────────────────────────────────────────────
// Subcommand: contributor
// ──────────────────────────────────────────────

const contributorCmd = new Command('contributor')
  .description('Find files with high single-author ownership (bus-factor risk)')
  .argument('<path>', 'path to the Git repository');

addCommonOptions(contributorCmd);

contributorCmd
  .option('-t, --threshold <ratio>', 'ownership ratio to flag (0-1)', '0.8');

contributorCmd.action(async (repoPath, opts) => {
  try {
    // Step 1: Validate inputs.
    await validateRepo(repoPath);
    const { top, format } = validateOptions(opts);

    // Step 2: Collect commit history from Git.
    const commits = await collectCommits(repoPath, {
      since: opts.since,
      until: opts.until,
    });

    // Step 3: Run the contributor-risk analysis.
    const results = analyseContributors(commits, {
      threshold: parseFloat(opts.threshold),
      top,
    });

    // Step 4: Present the results in the chosen format.
    if (format === 'json') {
      printJSON(results);
    } else if (format === 'html') {
      const html = generateContributorHTML(results, repoPath);
      const outPath = resolve('strata-contributor-report.html');
      await writeFile(outPath, html);
      console.log(chalk.green(`\n  ✔ Report saved to ${outPath}\n`));
    } else {
      printContributorTable(results);
    }
  } catch (err) {
    console.error(chalk.red(`\n  ✖ Unexpected error: ${err.message}\n`));
    process.exit(2);
  }
});

program.addCommand(contributorCmd);

// ──────────────────────────────────────────────
// Parse and execute
// ──────────────────────────────────────────────

program.parse();
