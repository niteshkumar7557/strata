/**
 * @module collector
 *
 * Collector — the first stage of the Strata pipeline.
 *
 * Responsibilities:
 *   1. Validate that a given path is inside a Git repository.
 *   2. Run `git log --numstat` and parse the output into structured commit records.
 *   3. Retrieve current line counts for every tracked file (needed for hotspot scoring).
 *
 * The module exposes both the high-level orchestrator functions (`collectCommits`,
 * `getFileSizes`) and the pure parser (`parseGitLog`) so the parser can be
 * unit-tested without touching the filesystem.
 */

import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/**
 * Sentinel string injected into the git-log pretty format.
 * We split the raw output on this token to isolate individual commits.
 * The token is deliberately unlikely to appear in real commit data.
 */
const COMMIT_DELIMITER = "===STRATA_COMMIT===";

/**
 * The `--pretty=format` template passed to `git log`.
 *
 * Layout per commit (fields separated by `|`):
 *   DELIMITER
 *   <hash>|<author name>|<ISO 8601 date>
 *
 * After the pretty-printed header, `--numstat` appends one line per
 * changed file:  <lines added>\t<lines deleted>\t<file path>
 */
const LOG_FORMAT = `${COMMIT_DELIMITER}%n%H|%an|%aI`;

// ──────────────────────────────────────────────
// Git-repo validation
// ──────────────────────────────────────────────

/**
 * Check whether `dirPath` lives inside a Git work-tree.
 *
 * Instead of looking for a `.git` folder (which breaks inside worktrees
 * and submodules) we ask Git itself via `git rev-parse --is-inside-work-tree`.
 *
 * @param {string} dirPath — absolute or relative directory path.
 * @returns {Promise<boolean>} `true` when the path is in a Git repo.
 */
export async function isGitRepo(dirPath) {
	const absolutePath = resolve(dirPath);

	// First, make sure the directory actually exists on disk.
	try {
		await access(absolutePath);
	} catch {
		return false;
	}

	// Ask Git whether this directory is inside a work-tree.
	return new Promise((res) => {
		execFile(
			"git",
			["rev-parse", "--is-inside-work-tree"],
			{ cwd: absolutePath },
			(err, stdout) => {
				// If `git rev-parse` exits with a non-zero code, it's not a repo.
				res(!err && stdout.trim() === "true");
			},
		);
	});
}

// ──────────────────────────────────────────────
// Pure parser (unit-testable, no I/O)
// ──────────────────────────────────────────────

/**
 * Parse the raw text output of `git log --numstat --pretty=format:…`
 * into an array of structured commit objects.
 *
 * @param {string} raw — the full stdout string from the git-log command.
 * @returns {Array<{
 *   hash:   string,
 *   author: string,
 *   date:   string,
 *   files:  Array<{ path: string, added: number, deleted: number }>
 * }>} Parsed commit records, newest-first (the order Git emits them).
 *
 * @example
 *   const commits = parseGitLog(rawText);
 *   // commits[0].files[0].path  → 'src/cli.js'
 */
export function parseGitLog(raw) {
	// Guard: if the log is empty (brand-new repo with no commits), return [].
	if (!raw || raw.trim().length === 0) {
		return [];
	}

	/*
	 * Split on the delimiter to get one chunk per commit.
	 * The first element is always an empty string (text before the first
	 * delimiter), so we drop it with `.filter(Boolean)`.
	 */
	const chunks = raw.split(COMMIT_DELIMITER).filter((chunk) => chunk.trim());

	return chunks.map((chunk) => {
		/*
		 * Each chunk looks like:
		 *
		 *   \n<hash>|<author>|<date>        ← header line
		 *   5\t3\tsrc/foo.js                ← numstat lines (0 or more)
		 *   -\t-\timage.png                 ← binary file (dashes instead of numbers)
		 *   \n                              ← trailing blank line between commits
		 */
		const lines = chunk.split("\n").filter((line) => line.trim());

		// --- Parse the header line (first non-empty line) ---
		// We split with a limit: hash is before the first `|`, date is after
		// the last `|`, and everything in between is the author name (which
		// could theoretically contain `|` characters).
		const headerLine = lines[0];
		const firstPipe = headerLine.indexOf('|');
		const lastPipe = headerLine.lastIndexOf('|');
		const hash = headerLine.slice(0, firstPipe);
		const author = headerLine.slice(firstPipe + 1, lastPipe);
		const date = headerLine.slice(lastPipe + 1);

		// --- Parse the numstat file lines (everything after the header) ---
		const files = [];
		for (let i = 1; i < lines.length; i++) {
			const parts = lines[i].split("\t");

			// A valid numstat line has exactly 3 tab-separated fields.
			if (parts.length !== 3) continue;

			const [addedRaw, deletedRaw, filePath] = parts;

			// Binary files are reported as `-\t-\tpath` — we record them as 0/0.
			const added = addedRaw === "-" ? 0 : Number(addedRaw);
			const deleted = deletedRaw === "-" ? 0 : Number(deletedRaw);

			files.push({ path: filePath, added, deleted });
		}

		return { hash, author, date, files };
	});
}

// ──────────────────────────────────────────────
// High-level orchestrators (I/O-bound)
// ──────────────────────────────────────────────

/**
 * Run `git log` on the repository at `repoPath` and return parsed commits.
 *
 * @param {string} repoPath — path to the Git repository.
 * @param {object}  [options]            — optional filters.
 * @param {string}  [options.since]      — ISO date string; only commits after this date.
 * @param {string}  [options.until]      — ISO date string; only commits before this date.
 * @param {number}  [options.maxCommits] — cap the number of commits fetched.
 * @returns {Promise<Array>} Array of commit records (see `parseGitLog`).
 */
export async function collectCommits(repoPath, options = {}) {
	const absolutePath = resolve(repoPath);

	/*
	 * Build the `git log` argument list.
	 * --numstat gives added/deleted line counts per file.
	 * --no-merges skips merge commits (they duplicate file entries).
	 * --pretty=format uses our custom template with the commit delimiter.
	 */
	const args = [
		"log",
		`--pretty=format:${LOG_FORMAT}`,
		"--numstat",
		"--no-merges",
	];

	// Append optional date-range filters.
	if (options.since) args.push(`--since=${options.since}`);
	if (options.until) args.push(`--until=${options.until}`);

	// Limit the number of commits if requested.
	if (options.maxCommits) args.push(`-n`, String(options.maxCommits));

	// Execute git and capture stdout.
	const raw = await runGit(args, absolutePath);

	return parseGitLog(raw);
}

/**
 * Get the current line count for every tracked file in the repository.
 *
 * This is used by the hotspot metric, which needs the current size of
 * each file to compute `score = norm(frequency) × norm(size)`.
 *
 * Strategy:
 *   1. `git ls-files` lists every tracked file (respects .gitignore).
 *   2. For each file, we count the number of newline characters.
 *   3. Binary / missing files are silently skipped (size = 0 would
 *      rank them last in the hotspot list, which is the correct behaviour).
 *
 * @param {string} repoPath — path to the Git repository.
 * @returns {Promise<Record<string, number>>} Map of `filePath → lineCount`.
 */
export async function getFileSizes(repoPath) {
	const absolutePath = resolve(repoPath);

	// Get the list of tracked files, one per line.
	const filesRaw = await runGit(["ls-files"], absolutePath);

	if (!filesRaw.trim()) return {};

	const filePaths = filesRaw.trim().split("\n");
	const sizes = {};

	/*
	 * For each tracked file, use `git show HEAD:<path>` to read its
	 * content directly from Git's object store. This avoids filesystem
	 * access and works even when the worktree is dirty.
	 *
	 * We count lines by splitting on newlines. Errors (binary files,
	 * submodules, etc.) are silently caught — the file simply won't
	 * appear in the sizes map.
	 *
	 * Files are processed in batches to avoid spawning hundreds of
	 * git processes simultaneously on large repositories.
	 */
	const BATCH_SIZE = 20;

	for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
		const batch = filePaths.slice(i, i + BATCH_SIZE);
		const promises = batch.map(async (filePath) => {
			try {
				const content = await runGit(
					["show", `HEAD:${filePath}`],
					absolutePath,
				);
				// Count lines: split by newline, length gives approximate line count.
				const lineCount = content.split("\n").length;
				sizes[filePath] = lineCount;
			} catch {
				// Binary or unreadable file — skip silently.
			}
		});
		await Promise.all(promises);
	}

	return sizes;
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

/**
 * Thin wrapper around `child_process.execFile` that returns a Promise
 * resolving to the command's stdout string.
 *
 * @param {string[]} args     — arguments for `git`.
 * @param {string}   cwd      — working directory for the subprocess.
 * @returns {Promise<string>} stdout of the git command.
 * @throws {Error} if git exits with a non-zero code.
 */
function runGit(args, cwd) {
	return new Promise((resolve, reject) => {
		execFile(
			"git",
			args,
			{
				cwd,
				// Allow large histories — default 1 MB buffer may be too small.
				maxBuffer: 50 * 1024 * 1024, // 50 MB
			},
			(err, stdout) => {
				if (err) return reject(err);
				resolve(stdout);
			},
		);
	});
}
