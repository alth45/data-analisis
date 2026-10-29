/**
 * Registry chart renderer — plug point untuk library eksternal
 * (Chart.js, ECharts, Plotly) di fase berikutnya.
 *
 * Setiap entry:
 *   { key, label, source: 'native'|'chartjs'|'echarts', draw }
 *
 * `draw(ctx, w, h, data, colors)` — signature konsisten dengan
 * drawer native, jadi adapter library tinggal menggambar ke ctx yang
 * sama (bisa offscreen lalu `ctx.drawImage`).
 *
 * CONTOH FASE 3 (Chart.js adapter — jangan aktifkan dulu):
 *
 *   import { Chart } from 'chart.js/auto';
 *   registerChartRenderer({
 *     key: 'bar',
 *     label: 'Bar (Chart.js)',
 *     source: 'chartjs',
 *     draw(ctx, w, h, data, colors) {
 *       const off = document.createElement('canvas');
 *       off.width = w; off.height = h;
 *       new Chart(off, {
 *         type: 'bar',
 *         data: { labels: data.map(d => d.x), datasets: [{ data: data.map(d => d.y), backgroundColor: PALETTE }] },
 *         options: { responsive: false, animation: false }
 *       });
 *       ctx.drawImage(off, 0, 0);
 *     }
 *   });
 */
import {
  drawBarInto, drawLineInto, drawPieInto, drawScatterInto,
  drawOutlierInto, drawHeatmapInto, drawTrendInto,
} from '../utils/chart-drawers.js';

const registry = new Map();

/**
 * @param {{ key: string, label: string, source?: string, draw: Function }} renderer
 */
export function registerChartRenderer(renderer) {
  if (!renderer?.key || typeof renderer.draw !== 'function') {
    throw new Error('registerChartRenderer: butuh { key, draw }');
  }
  registry.set(renderer.key, {
    source: 'native',
    label: renderer.key,
    ...renderer,
  });
}

export function getChartRenderer(key) {
  return registry.get(key) || null;
}

export function listChartRenderers() {
  return [...registry.values()];
}

/** @returns {boolean} true kalau berhasil digambar */
export function renderChart(ctx, w, h, data, chartType, colors) {
  const r = getChartRenderer(chartType);
  if (!r) return false;
  r.draw(ctx, w, h, data, colors);
  return true;
}

// ─────────────────────────────────────────────────────────────
// Register native (default)
// ─────────────────────────────────────────────────────────────
registerChartRenderer({ key: 'bar',     label: 'Bar',     draw: drawBarInto });
registerChartRenderer({ key: 'line',    label: 'Line',    draw: drawLineInto });
registerChartRenderer({ key: 'pie',     label: 'Pie',     draw: drawPieInto });
registerChartRenderer({ key: 'scatter', label: 'Scatter', draw: drawScatterInto });
registerChartRenderer({ key: 'outlier', label: 'Outlier', draw: drawOutlierInto });
registerChartRenderer({ key: 'heatmap', label: 'Heatmap', draw: drawHeatmapInto });
registerChartRenderer({ key: 'trend', label: 'Trend', draw: drawTrendInto });
