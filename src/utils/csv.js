/**
 * Serialize + download CSV tanpa dependency.
 * Escape RFC 4180: cell mengandung `,` `"` `\n` `\r` dibungkus quotes,
 * quotes di-double. Output pakai CRLF (kompatibel Excel & Numbers).
 */

/**
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s === '') return '';
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * @param {Array<{name: string}>} columns
 * @param {Array<Array<any>>} rows
 * @returns {string} CSV text (tanpa BOM)
 */
export function serializeCsv(columns, rows) {
  const lines = [];
  lines.push(columns.map((c) => escapeCell(c.name)).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  // Trailing CRLF — beberapa tools (Excel lama) butuh agar baris terakhir
  // tidak hilang saat parse ulang.
  return lines.join('\r\n') + '\r\n';
}

/**
 * Trigger download file di browser.
 * BOM UTF-8 prepended supaya Excel mendeteksi encoding dengan benar.
 * @param {string} filename
 * @param {string} csvText
 */
export function downloadCsv(filename, csvText) {
  const blob = new Blob(['\uFEFF' + csvText], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Bangun nama file export.
 * @param {string} datasetName contoh: "sales-sample.csv"
 * @param {boolean} hasFilter
 * @returns {string} contoh: "sales-sample-2026-10-29-filtered.csv"
 */
export function buildExportFilename(datasetName, hasFilter) {
  const base = (datasetName || 'dataset').replace(/\.[^.]+$/, '') || 'dataset';
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const suffix = hasFilter ? 'filtered' : 'export';
  return `${base}-${date}-${suffix}.csv`;
}