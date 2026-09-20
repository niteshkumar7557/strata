/**
 * @file tests/collector.test.js
 *
 * Unit tests for the collector module's pure parser function `parseGitLog`.
 *
 * Strategy:
 *   - We test ONLY the pure parser here (no real git commands).
 *   - Each test feeds a hand-crafted string that mimics `git log --numstat
 *     --pretty=format:…` output and asserts the shape and values of the
 *     returned commit records.
 *   - This keeps the tests deterministic and independent of any real repo.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseGitLog } from "../src/collector.js";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Build a fake git-log block for a single commit.
 * Mirrors the format produced by `--pretty=format:===STRATA_COMMIT===\n%H|%an|%aI`
 * followed by `--numstat` lines.
 *
 * @param {string}   hash   — fake commit hash.
 * @param {string}   author — author name.
 * @param {string}   date   — ISO 8601 date.
 * @param {string[]} files  — numstat lines, e.g. ['5\t3\tsrc/a.js'].
 * @returns {string} One commit block including the delimiter.
 */
function commitBlock(hash, author, date, files = []) {
	const header = `===STRATA_COMMIT===\n${hash}|${author}|${date}`;
	const fileLines = files.length > 0 ? "\n" + files.join("\n") : "";
	return header + fileLines;
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe("parseGitLog", () => {
	// --- Edge cases: empty / missing input ---

	it("should return an empty array for empty string input", () => {
		const result = parseGitLog("");
		assert.deepStrictEqual(result, []);
	});

	it("should return an empty array for null / undefined input", () => {
		assert.deepStrictEqual(parseGitLog(null), []);
		assert.deepStrictEqual(parseGitLog(undefined), []);
	});

	it("should return an empty array for whitespace-only input", () => {
		assert.deepStrictEqual(parseGitLog("   \n\n  "), []);
	});

	// --- Single commit ---

	it("should parse a single commit with one file", () => {
		const raw = commitBlock(
			"abc123",
			"Alice",
			"2025-06-15T10:00:00+00:00",
			["10\t2\tsrc/app.js"],
		);

		const commits = parseGitLog(raw);

		assert.equal(commits.length, 1);
		assert.equal(commits[0].hash, "abc123");
		assert.equal(commits[0].author, "Alice");
		assert.equal(commits[0].date, "2025-06-15T10:00:00+00:00");
		assert.equal(commits[0].files.length, 1);
		assert.deepStrictEqual(commits[0].files[0], {
			path: "src/app.js",
			added: 10,
			deleted: 2,
		});
	});

	it("should parse a commit with multiple files", () => {
		const raw = commitBlock("def456", "Bob", "2025-07-01T14:30:00+05:30", [
			"5\t3\tsrc/collector.js",
			"20\t0\ttests/collector.test.js",
			"1\t1\tREADME.md",
		]);

		const commits = parseGitLog(raw);

		assert.equal(commits.length, 1);
		assert.equal(commits[0].files.length, 3);
		assert.equal(commits[0].files[0].path, "src/collector.js");
		assert.equal(commits[0].files[1].added, 20);
		assert.equal(commits[0].files[2].deleted, 1);
	});

	it("should parse a commit with no file changes (empty commit)", () => {
		// A commit that somehow has no numstat lines (e.g., --allow-empty).
		const raw = commitBlock("aaa111", "Charlie", "2025-08-01T00:00:00Z");

		const commits = parseGitLog(raw);

		assert.equal(commits.length, 1);
		assert.equal(commits[0].hash, "aaa111");
		assert.deepStrictEqual(commits[0].files, []);
	});

	// --- Multiple commits ---

	it("should parse multiple commits in order", () => {
		const raw = [
			commitBlock("first1", "Alice", "2025-09-10T10:00:00Z", [
				"3\t1\ta.js",
			]),
			commitBlock("secon2", "Bob", "2025-09-09T09:00:00Z", [
				"7\t0\tb.js",
			]),
			commitBlock("third3", "Alice", "2025-09-08T08:00:00Z", [
				"0\t5\tc.js",
			]),
		].join("\n");

		const commits = parseGitLog(raw);

		// Should preserve the order (newest-first as git emits them).
		assert.equal(commits.length, 3);
		assert.equal(commits[0].hash, "first1");
		assert.equal(commits[1].hash, "secon2");
		assert.equal(commits[2].hash, "third3");
	});

	// --- Binary files ---

	it("should handle binary files (dashes in numstat) as 0 added/deleted", () => {
		const raw = commitBlock("bin999", "Dave", "2025-05-20T12:00:00Z", [
			"-\t-\tlogo.png",
		]);

		const commits = parseGitLog(raw);

		assert.equal(commits[0].files.length, 1);
		assert.deepStrictEqual(commits[0].files[0], {
			path: "logo.png",
			added: 0,
			deleted: 0,
		});
	});

	// --- Mixed content: text + binary files in the same commit ---

	it("should handle a mix of text and binary files in one commit", () => {
		const raw = commitBlock("mix000", "Eve", "2025-04-10T16:00:00Z", [
			"12\t4\tsrc/utils.js",
			"-\t-\tassets/icon.svg",
			"1\t0\t.gitignore",
		]);

		const commits = parseGitLog(raw);

		assert.equal(commits[0].files.length, 3);
		// Text file parsed normally
		assert.equal(commits[0].files[0].added, 12);
		// Binary file → 0/0
		assert.equal(commits[0].files[1].added, 0);
		assert.equal(commits[0].files[1].deleted, 0);
		// Short edit also parsed correctly
		assert.equal(commits[0].files[2].path, ".gitignore");
	});

	// --- Robustness: extra whitespace and blank lines ---

	it("should be resilient to extra blank lines between commits", () => {
		const raw =
			"\n\n" +
			commitBlock("aaa111", "Alice", "2025-01-01T00:00:00Z", [
				"1\t0\tx.js",
			]) +
			"\n\n\n" +
			commitBlock("bbb222", "Bob", "2025-01-02T00:00:00Z", [
				"2\t1\ty.js",
			]) +
			"\n\n";

		const commits = parseGitLog(raw);

		assert.equal(commits.length, 2);
		assert.equal(commits[0].hash, "aaa111");
		assert.equal(commits[1].hash, "bbb222");
	});
});
