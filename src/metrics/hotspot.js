/**
 * @module hotspot
 *
 * Hotspot analysis — identifies files that are both large AND frequently
 * changed.  These files carry the highest statistical risk of defects
 * because complexity (size) and churn (change frequency) compound.
 *
 * Scoring formula (from "Your Code as a Crime Scene"):
 *
 *   score = normalise(changeFrequency) × normalise(currentLineCount)
 *
 * Both axes are normalised to the 0 – 1 range so that neither dimension
 * dominates.  A file scores highly ONLY when it is large AND modified
 * often — small but volatile files and large but stable files both
 * receive lower scores, which is the desired behaviour.
 */

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Normalise an array of numbers to the 0 – 1 range using min-max scaling.
 *
 * If every value is the same (max === min), all normalised values are 0
 * to avoid division-by-zero and to indicate "no variance".
 *
 * @param {number[]} values — raw numeric values.
 * @returns {number[]} Values scaled to [0, 1].
 */
function normalise(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);

  // When all values are identical there is no spread to normalise.
  if (max === min) return values.map(() => 0);

  return values.map((v) => (v - min) / (max - min));
}

// ──────────────────────────────────────────────
// Main analysis function
// ──────────────────────────────────────────────

/**
 * Compute hotspot scores for every file that appears in the commit history.
 *
 * @param {Array<{ files: Array<{ path: string }> }>} commits
 *   Parsed commit records from the collector (only the `files[].path`
 *   field is used).
 *
 * @param {Record<string, number>} fileSizes
 *   Map of `filePath → currentLineCount`, typically from
 *   `collector.getFileSizes()`.  Files absent from this map are
 *   treated as having 0 lines (e.g. deleted files).
 *
 * @param {object}  [options]        — optional configuration.
 * @param {number}  [options.top=10] — how many results to return.
 *
 * @returns {Array<{
 *   path:      string,
 *   commits:   number,
 *   lines:     number,
 *   score:     number
 * }>} Top N files sorted by hotspot score (descending).
 */
export function analyseHotspots(commits, fileSizes, options = {}) {
  const top = options.top ?? 10;

  // ── Step 1: Count how many commits touched each file ──
  // We use a Map so that every file path has a single counter.
  const frequencyMap = new Map();

  for (const commit of commits) {
    for (const file of commit.files) {
      frequencyMap.set(file.path, (frequencyMap.get(file.path) ?? 0) + 1);
    }
  }

  // If no files were found at all, return early.
  if (frequencyMap.size === 0) return [];

  // ── Step 2: Build parallel arrays for normalisation ──
  // We need the file paths, raw frequencies, and raw line counts
  // in matching order so we can normalise and recombine them.
  const paths = [...frequencyMap.keys()];
  const rawFreqs = paths.map((p) => frequencyMap.get(p));
  const rawSizes = paths.map((p) => fileSizes[p] ?? 0);

  // ── Step 3: Normalise both dimensions to 0 – 1 ──
  const normFreqs = normalise(rawFreqs);
  const normSizes = normalise(rawSizes);

  // ── Step 4: Compute the combined score ──
  const results = paths.map((path, i) => ({
    path,
    commits: rawFreqs[i],
    lines: rawSizes[i],
    score: parseFloat((normFreqs[i] * normSizes[i]).toFixed(4)),
  }));

  // ── Step 5: Sort descending by score and return the top N ──
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, top);
}
