/**
 * @file tests/metrics/contributor.test.js
 *
 * Unit tests for the contributor-risk (bus factor) analysis metric.
 *
 * All tests use hand-crafted commit fixtures so results are deterministic
 * and independent of any real Git repository.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyseContributors } from '../../src/metrics/contributor.js';

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

/**
 * Scenario with clear ownership patterns:
 *
 *   - app.js:   Alice changed 90 lines, Bob changed 10 → 90% ownership (flagged)
 *   - utils.js: Alice changed 50 lines, Bob changed 50 → 50% ownership (safe)
 *   - config.js: Charlie alone changed 30 lines         → 100% ownership (flagged)
 */
const COMMITS_MIXED = [
  {
    author: 'Alice',
    files: [
      { path: 'src/app.js', added: 50, deleted: 10 },    // Alice: 60 lines
      { path: 'src/utils.js', added: 30, deleted: 20 },   // Alice: 50 lines
    ],
  },
  {
    author: 'Alice',
    files: [
      { path: 'src/app.js', added: 20, deleted: 10 },    // Alice: +30 → total 90
    ],
  },
  {
    author: 'Bob',
    files: [
      { path: 'src/app.js', added: 5, deleted: 5 },      // Bob: 10 lines
      { path: 'src/utils.js', added: 25, deleted: 25 },   // Bob: 50 lines
    ],
  },
  {
    author: 'Charlie',
    files: [
      { path: 'src/config.js', added: 20, deleted: 10 },  // Charlie: 30 (sole owner)
    ],
  },
];

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('analyseContributors', () => {

  // --- Edge cases ---

  it('should return an empty array when no commits are provided', () => {
    const result = analyseContributors([]);
    assert.deepStrictEqual(result, []);
  });

  it('should return an empty array when all files have zero line changes', () => {
    const commits = [
      { author: 'Alice', files: [{ path: 'bin.png', added: 0, deleted: 0 }] },
    ];
    const result = analyseContributors(commits);
    assert.deepStrictEqual(result, []);
  });

  // --- Flagging logic ---

  it('should flag files where top-author ownership ≥ 0.8 (default threshold)', () => {
    const result = analyseContributors(COMMITS_MIXED);

    const paths = result.map((r) => r.path);

    // app.js (90%) and config.js (100%) should be flagged.
    assert.ok(paths.includes('src/app.js'), 'app.js should be flagged (90%)');
    assert.ok(paths.includes('src/config.js'), 'config.js should be flagged (100%)');

    // utils.js (50/50 split) should NOT be flagged.
    assert.ok(!paths.includes('src/utils.js'), 'utils.js should NOT be flagged (50%)');
  });

  it('should identify the correct top author for each file', () => {
    const result = analyseContributors(COMMITS_MIXED);

    const app = result.find((r) => r.path === 'src/app.js');
    const config = result.find((r) => r.path === 'src/config.js');

    assert.equal(app.topAuthor, 'Alice');
    assert.equal(config.topAuthor, 'Charlie');
  });

  it('should compute correct ownership ratios', () => {
    const result = analyseContributors(COMMITS_MIXED);

    const app = result.find((r) => r.path === 'src/app.js');
    const config = result.find((r) => r.path === 'src/config.js');

    // app.js: Alice = 90, total = 100 → ratio = 0.9
    assert.equal(app.ownershipRatio, 0.9);

    // config.js: Charlie = 30, total = 30 → ratio = 1.0
    assert.equal(config.ownershipRatio, 1.0);
  });

  it('should include the correct author count per file', () => {
    const result = analyseContributors(COMMITS_MIXED);

    const app = result.find((r) => r.path === 'src/app.js');
    const config = result.find((r) => r.path === 'src/config.js');

    // app.js was touched by Alice and Bob → 2 authors.
    assert.equal(app.authorCount, 2);

    // config.js was touched by Charlie only → 1 author.
    assert.equal(config.authorCount, 1);
  });

  // --- Sorting ---

  it('should sort results by ownership ratio (highest risk first)', () => {
    const result = analyseContributors(COMMITS_MIXED);

    // config.js (1.0) should come before app.js (0.9).
    assert.equal(result[0].path, 'src/config.js');
    assert.equal(result[1].path, 'src/app.js');
  });

  // --- Custom threshold ---

  it('should respect a custom threshold', () => {
    // Lower the threshold to 0.5 — now utils.js (50%) is also at risk.
    const result = analyseContributors(COMMITS_MIXED, { threshold: 0.5 });

    const paths = result.map((r) => r.path);
    assert.ok(paths.includes('src/utils.js'),
      'utils.js should be flagged at 0.5 threshold');
  });

  it('should return nothing when threshold is set to 1.01 (impossible to reach)', () => {
    const result = analyseContributors(COMMITS_MIXED, { threshold: 1.01 });
    // Even 100% ownership (1.0) won't pass a 1.01 threshold.
    assert.deepStrictEqual(result, []);
  });

  // --- Top-N limiting ---

  it('should respect the top option to limit results', () => {
    const result = analyseContributors(COMMITS_MIXED, { top: 1 });
    assert.equal(result.length, 1);
  });

  // --- Single-author repo ---

  it('should flag all files in a single-author repository', () => {
    const commits = [
      { author: 'Solo', files: [
        { path: 'a.js', added: 100, deleted: 0 },
        { path: 'b.js', added: 50, deleted: 10 },
      ]},
    ];

    const result = analyseContributors(commits);

    // Every file has 100% ownership by the sole author.
    assert.equal(result.length, 2);
    assert.ok(result.every((r) => r.ownershipRatio === 1.0));
    assert.ok(result.every((r) => r.topAuthor === 'Solo'));
  });
});
