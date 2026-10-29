/**
 * Util export canvas → PNG. Tidak ada dependency.
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    // 'image/png' — lossless, ukuran wajar untuk chart.
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null (out of memory?)'));
    }, 'image/png');
  });
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
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
 * @param {string} datasetName contoh: "sales-sample.csv"
 * @param {string} chartType   contoh: "bar"
 * @returns {string} contoh: "sales-sample-bar-2026-10-29.png"
 */
export function buildChartFilename(datasetName, chartType) {
  const base = (datasetName || 'chart').replace(/\.[^.]+$/, '') || 'chart';
  const safeType = String(chartType || 'chart').toLowerCase();
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${base}-${safeType}-${date}.png`;
}