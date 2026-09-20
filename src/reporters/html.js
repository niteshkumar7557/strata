/**
 * @module reporters/html
 *
 * HTML reporter — generates a self-contained HTML page from metric results.
 *
 * The output is a single `.html` file with all CSS inlined, no external
 * dependencies, and no JavaScript required.  It can be opened directly
 * in any browser, emailed, or committed alongside the codebase.
 *
 * Features:
 *   - Colour-coded risk cells (green / amber / red)
 *   - CSS bar charts for visual score comparison
 *   - Responsive layout that works on any screen width
 *   - Dark-friendly colour palette
 */

// ──────────────────────────────────────────────
// Colour helpers
// ──────────────────────────────────────────────

/**
 * Map a hotspot score (0–1) to a CSS class name.
 *
 * @param {number} score — value between 0 and 1.
 * @returns {string} CSS class: 'risk-high', 'risk-med', or 'risk-low'.
 */
function scoreClass(score) {
  if (score >= 0.6) return 'risk-high';
  if (score >= 0.3) return 'risk-med';
  return 'risk-low';
}

/**
 * Map an ownership ratio (0–1) to a CSS class name.
 *
 * @param {number} ratio — value between 0 and 1.
 * @returns {string} CSS class: 'risk-high', 'risk-med', or 'risk-low'.
 */
function ownershipClass(ratio) {
  if (ratio >= 0.9) return 'risk-high';
  if (ratio >= 0.8) return 'risk-med';
  return 'risk-low';
}

// ──────────────────────────────────────────────
// Shared CSS (inlined into every report)
// ──────────────────────────────────────────────

const STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117;
    color: #c9d1d9;
    padding: 2rem;
    line-height: 1.6;
  }

  .container { max-width: 960px; margin: 0 auto; }

  /* ── Header ── */
  h1 {
    font-size: 1.8rem;
    color: #58a6ff;
    margin-bottom: 0.25rem;
  }
  .subtitle {
    color: #8b949e;
    font-size: 0.95rem;
    margin-bottom: 2rem;
  }
  .meta {
    color: #8b949e;
    font-size: 0.85rem;
    margin-bottom: 1.5rem;
  }

  /* ── Section headers ── */
  h2 {
    font-size: 1.3rem;
    color: #58a6ff;
    margin: 2rem 0 0.5rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid #21262d;
  }
  .section-desc {
    color: #8b949e;
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  /* ── Table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 2rem;
    font-size: 0.9rem;
  }
  th {
    text-align: left;
    padding: 0.6rem 0.8rem;
    background: #161b22;
    color: #c9d1d9;
    font-weight: 600;
    border-bottom: 2px solid #30363d;
  }
  th.num { text-align: right; }

  td {
    padding: 0.5rem 0.8rem;
    border-bottom: 1px solid #21262d;
  }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.file { font-family: 'SF Mono', Menlo, monospace; font-size: 0.85rem; }

  tr:hover { background: #161b22; }

  /* ── Risk badges ── */
  .risk-high { color: #f85149; font-weight: 700; }
  .risk-med  { color: #d29922; font-weight: 600; }
  .risk-low  { color: #3fb950; }

  /* ── CSS bar chart ── */
  .bar-cell { width: 120px; }
  .bar {
    height: 14px;
    border-radius: 3px;
    min-width: 2px;
  }
  .bar.high { background: #f85149; }
  .bar.med  { background: #d29922; }
  .bar.low  { background: #3fb950; }

  /* ── Footer ── */
  .footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #21262d;
    color: #484f58;
    font-size: 0.8rem;
  }

  /* ── Empty state ── */
  .empty {
    color: #8b949e;
    font-style: italic;
    padding: 1rem 0;
  }
`;

// ──────────────────────────────────────────────
// Table builders
// ──────────────────────────────────────────────

/**
 * Build the HTML table rows for hotspot results.
 *
 * Each row includes a small CSS bar whose width is proportional to
 * the score, giving a visual comparison across files.
 *
 * @param {Array} results — hotspot analysis output.
 * @returns {string} HTML table string.
 */
function buildHotspotTable(results) {
  if (results.length === 0) {
    return '<p class="empty">No hotspot data found.</p>';
  }

  // The highest score sets the bar chart scale (100% width).
  const maxScore = results[0].score || 1;

  const rows = results.map((r, i) => {
    const cls = scoreClass(r.score);
    // Bar width as a percentage of the max score.
    const barWidth = maxScore > 0 ? (r.score / maxScore) * 100 : 0;
    const barClass = r.score >= 0.6 ? 'high' : r.score >= 0.3 ? 'med' : 'low';

    return `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="file">${escapeHtml(r.path)}</td>
        <td class="num">${r.commits}</td>
        <td class="num">${r.lines}</td>
        <td class="num ${cls}">${r.score.toFixed(4)}</td>
        <td class="bar-cell"><div class="bar ${barClass}" style="width:${barWidth.toFixed(1)}%"></div></td>
      </tr>`;
  }).join('\n');

  return `
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>File</th>
          <th class="num">Commits</th>
          <th class="num">Lines</th>
          <th class="num">Score</th>
          <th>Risk</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * Build the HTML table rows for contributor-risk results.
 *
 * Each row includes a bar representing the ownership percentage.
 *
 * @param {Array} results — contributor analysis output.
 * @returns {string} HTML table string.
 */
function buildContributorTable(results) {
  if (results.length === 0) {
    return '<p class="empty">No contributor-risk issues found.</p>';
  }

  const rows = results.map((r, i) => {
    const cls = ownershipClass(r.ownershipRatio);
    const pct = (r.ownershipRatio * 100).toFixed(1);
    const barClass = r.ownershipRatio >= 0.9 ? 'high' : r.ownershipRatio >= 0.8 ? 'med' : 'low';

    return `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="file">${escapeHtml(r.path)}</td>
        <td>${escapeHtml(r.topAuthor)}</td>
        <td class="num ${cls}">${pct}%</td>
        <td class="num">${r.totalChanges}</td>
        <td class="num">${r.authorCount}</td>
        <td class="bar-cell"><div class="bar ${barClass}" style="width:${pct}%"></div></td>
      </tr>`;
  }).join('\n');

  return `
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>File</th>
          <th>Top Author</th>
          <th class="num">Ownership</th>
          <th class="num">Changes</th>
          <th class="num">Authors</th>
          <th>Risk</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ──────────────────────────────────────────────
// HTML escape (security)
// ──────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS if file paths
 * or author names contain angle brackets, quotes, etc.
 *
 * @param {string} str — raw string.
 * @returns {string} Escaped string safe for HTML insertion.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Generate a complete, self-contained HTML report for hotspot analysis.
 *
 * @param {Array} results — hotspot analysis output.
 * @param {string} repoPath — the repository path (shown in the header).
 * @returns {string} Full HTML document as a string.
 */
export function generateHotspotHTML(results, repoPath) {
  const timestamp = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Strata — Hotspot Report</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="container">
    <h1>🔥 Hotspot Analysis</h1>
    <p class="subtitle">Files ranked by churn × size — highest defect risk first</p>
    <p class="meta">Repository: <strong>${escapeHtml(repoPath)}</strong> · Generated: ${timestamp} · Files shown: ${results.length}</p>

    ${buildHotspotTable(results)}

    <div class="footer">Generated by Strata v0.1.0</div>
  </div>
</body>
</html>`;
}

/**
 * Generate a complete, self-contained HTML report for contributor risk.
 *
 * @param {Array} results — contributor analysis output.
 * @param {string} repoPath — the repository path (shown in the header).
 * @returns {string} Full HTML document as a string.
 */
export function generateContributorHTML(results, repoPath) {
  const timestamp = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Strata — Contributor Risk Report</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="container">
    <h1>👤 Contributor Risk (Bus Factor)</h1>
    <p class="subtitle">Files with high single-author ownership — knowledge-silo risk</p>
    <p class="meta">Repository: <strong>${escapeHtml(repoPath)}</strong> · Generated: ${timestamp} · Files flagged: ${results.length}</p>

    ${buildContributorTable(results)}

    <div class="footer">Generated by Strata v0.1.0</div>
  </div>
</body>
</html>`;
}
