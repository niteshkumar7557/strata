/**
 * @file tests/metrics/hotspot.test.js
 *
 * Unit tests for the hotspot analysis metric.
 *
 * Every test uses hand-crafted fixture data (plain JS objects that look
 * like collector output) so results are deterministic and don't depend
 * on a real Git repository.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyseHotspots } from '../../src/metrics/hotspot.js';

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

/**
 * Three files with varying change frequencies:
 *   - app.js    → changed in 5 commits
 *   - utils.js  → changed in 3 commits
 *   - readme.md → changed in 1 commit
 */
const COMMITS_BASIC = [
  { files: [{ path: 'src/app.js' }, { path: 'src/utils.js' }] },
  { files: [{ path: 'src/app.js' }] },
  { files: [{ path: 'src/app.js' }, { path: 'src/utils.js' }] },
  { files: [{ path: 'src/app.js' }, { path: 'src/utils.js' }] },
  { files: [{ path: 'src/app.js' }, { path: 'readme.md' }] },
];

/**
 * File sizes (current line counts):
 *   - app.js   → 400 lines (large)
 *   - utils.js → 200 lines (medium)
 *   - readme   → 50 lines  (small)
 */
const SIZES_BASIC = {
  'src/app.js': 400,
  'src/utils.js': 200,
  'readme.md': 50,
};

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('analyseHotspots', () => {

  // --- Edge cases ---

  it('should return an empty array when no commits are provided', () => {
    const result = analyseHotspots([], {});
    assert.deepStrictEqual(result, []);
  });

  it('should return an empty array when commits have no files', () => {
    const commits = [{ files: [] }, { files: [] }];
    const result = analyseHotspots(commits, {});
    assert.deepStrictEqual(result, []);
  });

  // --- Scoring and ranking ---

  it('should rank app.js first (most commits + largest file)', () => {
    const result = analyseHotspots(COMMITS_BASIC, SIZES_BASIC);

    // app.js has the highest frequency (5) AND the most lines (400),
    // so it must have the highest score.
    assert.equal(result[0].path, 'src/app.js');
  });

  it('should include commit count and line count in each result', () => {
    const result = analyseHotspots(COMMITS_BASIC, SIZES_BASIC);

    const appEntry = result.find((r) => r.path === 'src/app.js');
    assert.equal(appEntry.commits, 5);
    assert.equal(appEntry.lines, 400);
  });

  it('should produce scores between 0 and 1 (inclusive)', () => {
    const result = analyseHotspots(COMMITS_BASIC, SIZES_BASIC);

    for (const entry of result) {
      assert.ok(entry.score >= 0 && entry.score <= 1,
        `Score ${entry.score} for ${entry.path} is out of [0, 1] range`);
    }
  });

  it('should rank a small but frequently changed file below a large + frequent one', () => {
    // readme.md is changed 1 time and is 50 lines → low score.
    // app.js is changed 5 times and is 400 lines → high score.
    const result = analyseHotspots(COMMITS_BASIC, SIZES_BASIC);

    const appIndex = result.findIndex((r) => r.path === 'src/app.js');
    const readmeIndex = result.findIndex((r) => r.path === 'readme.md');

    assert.ok(appIndex < readmeIndex,
      'app.js should be ranked higher than readme.md');
  });

  // --- Top-N limiting ---

  it('should respect the top option to limit results', () => {
    const result = analyseHotspots(COMMITS_BASIC, SIZES_BASIC, { top: 2 });

    assert.equal(result.length, 2);
  });

  it('should return all files when top exceeds file count', () => {
    const result = analyseHotspots(COMMITS_BASIC, SIZES_BASIC, { top: 100 });

    // Only 3 unique files exist in COMMITS_BASIC.
    assert.equal(result.length, 3);
  });

  // --- Missing file sizes ---

  it('should treat files missing from fileSizes as 0 lines', () => {
    // Provide no sizes at all — every file gets lines = 0.
    const result = analyseHotspots(COMMITS_BASIC, {});

    for (const entry of result) {
      assert.equal(entry.lines, 0);
    }
  });

  // --- Single file edge case ---

  it('should handle a single file (normalisation edge case)', () => {
    const commits = [{ files: [{ path: 'only.js' }] }];
    const sizes = { 'only.js': 100 };

    const result = analyseHotspots(commits, sizes);

    // With only one file, both normalised values are 0 (no spread),
    // so the score should be 0.
    assert.equal(result.length, 1);
    assert.equal(result[0].score, 0);
  });
});
