/**
 * @module contributor
 *
 * Contributor-risk (bus factor) analysis — identifies files where
 * knowledge is concentrated in a single developer.
 *
 * For each file the module tallies lines changed (added + deleted)
 * per author, then computes the ownership ratio of the top contributor:
 *
 *   ownershipRatio = topAuthorLines / totalLines
 *
 * When this ratio exceeds a configurable threshold (default 0.8 = 80%),
 * the file is flagged as a knowledge-silo risk.  If that one person
 * leaves the team, nobody else understands the file well enough to
 * maintain it safely.
 *
 * The output is sorted by ownership ratio (highest risk first) and
 * only flagged files are returned.
 */

// ──────────────────────────────────────────────
// Main analysis function
// ──────────────────────────────────────────────

/**
 * Analyse contributor risk across all files in the commit history.
 *
 * @param {Array<{
 *   author: string,
 *   files:  Array<{ path: string, added: number, deleted: number }>
 * }>} commits
 *   Parsed commit records from the collector.
 *
 * @param {object}  [options]               — optional configuration.
 * @param {number}  [options.threshold=0.8] — ownership ratio above which
 *                                            a file is flagged (0 – 1).
 * @param {number}  [options.top=10]        — max results to return.
 *
 * @returns {Array<{
 *   path:           string,
 *   topAuthor:      string,
 *   ownershipRatio: number,
 *   totalChanges:   number,
 *   authorCount:    number
 * }>} Flagged files sorted by ownership ratio (descending).
 */
export function analyseContributors(commits, options = {}) {
  const threshold = options.threshold ?? 0.8;
  const top = options.top ?? 10;

  // ── Step 1: Build a per-file, per-author tally of lines changed ──
  //
  // Structure:  fileStats = {
  //   'src/app.js': {
  //     authors: { 'Alice': 120, 'Bob': 30 },
  //     total:   150
  //   }
  // }
  const fileStats = {};

  for (const commit of commits) {
    for (const file of commit.files) {
      const linesChanged = file.added + file.deleted;

      // Skip files with zero changes (e.g. mode-only changes).
      if (linesChanged === 0) continue;

      // Initialise the file entry if we haven't seen it before.
      if (!fileStats[file.path]) {
        fileStats[file.path] = { authors: {}, total: 0 };
      }

      const stat = fileStats[file.path];

      // Accumulate this author's contribution to this file.
      stat.authors[commit.author] = (stat.authors[commit.author] ?? 0) + linesChanged;
      stat.total += linesChanged;
    }
  }

  // ── Step 2: For each file, find the top author and their ratio ──
  const results = [];

  for (const [path, stat] of Object.entries(fileStats)) {
    // Find the author who changed the most lines in this file.
    let topAuthor = '';
    let topLines = 0;

    for (const [author, lines] of Object.entries(stat.authors)) {
      if (lines > topLines) {
        topAuthor = author;
        topLines = lines;
      }
    }

    // Ownership ratio: what fraction of all changes came from one person.
    const ownershipRatio = parseFloat((topLines / stat.total).toFixed(4));

    // Only include files that exceed the risk threshold.
    if (ownershipRatio >= threshold) {
      results.push({
        path,
        topAuthor,
        ownershipRatio,
        totalChanges: stat.total,
        authorCount: Object.keys(stat.authors).length,
      });
    }
  }

  // ── Step 3: Sort by risk (highest ownership ratio first) ──
  // Break ties by total changes (more changes = more risk).
  results.sort((a, b) => b.ownershipRatio - a.ownershipRatio || b.totalChanges - a.totalChanges);

  return results.slice(0, top);
}
