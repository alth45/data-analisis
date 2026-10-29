import { el } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { setState, subscribe } from '../state/state-events.js';
import { analyzer } from '../config.js';
import { logger } from '../utils/logger.js';
import { renderChart } from '../core/chart-registry.js';
import { getThemeColors } from '../utils/chart-drawers.js';
import { openChartDialog } from './chart-dialog.js';
import { fetchMultiSeries, normalizeSeries } from '../core/multi-series.js';
import { toast } from './toast.js';

const PENCIL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
const TRASH  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>`;

export function createChartCard(initialConfig) {
  let config = initialConfig;
  let lastData = null;
  let lastError = null;
  let requestId = 0;

  const titleEl = el('span',
    { class: 'chart-card-title', title: config.title }, config.title);
  const editBtn = el('button',
    { class: 'btn btn-icon btn-sm', 'aria-label': 'Edit chart', title: 'Edit', onclick: () => editChart() },
    el('span', { html: PENCIL }));
  const deleteBtn = el('button',
    { class: 'btn btn-icon btn-sm', 'aria-label': 'Delete chart', title: 'Hapus', onclick: () => deleteChart() },
    el('span', { html: TRASH }));
  const header = el('div', { class: 'chart-card-header' },
    titleEl,
    el('div', { class: 'chart-card-actions' }, editBtn, deleteBtn));

  const canvas = el('canvas', {
    class: 'chart-card-canvas', role: 'img', 'aria-label': config.title,
  });
  const canvasWrap = el('div', { class: 'chart-card-body' }, canvas);
  const footer = el('div', { class: 'chart-card-footer' }, '—');

  const root = el('div', { class: 'chart-card', 'data-chart-id': config.id },
    header, canvasWrap, footer);

  const ctx = canvas.getContext('2d');
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvasWrap);

  function resize() {
    const rect = canvasWrap.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function drawHint(msg) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (w < 2 || h < 2) return;
    ctx.clearRect(0, 0, w, h);
    const c = getThemeColors();
    ctx.fillStyle = c.text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, w / 2, h / 2);
  }

  function dataHasContent() {
    if (!lastData) return false;
    if (lastData.__multiSeries) return lastData.labels.length > 0 && lastData.series.length > 0;
    if (config.type === 'heatmap') return Array.isArray(lastData.rowLabels) && lastData.rowLabels.length > 0;
    if (config.type === 'outlier') return Array.isArray(lastData.values) && lastData.values.length > 0;
    if (config.type === 'trend') return Array.isArray(lastData.points) && lastData.points.length > 0;
    return Array.isArray(lastData) && lastData.length > 0;
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (w < 2 || h < 2) return;

    ctx.clearRect(0, 0, w, h);
    if (lastError) { drawHint('Error: ' + lastError); return; }
    if (!dataHasContent()) { drawHint('Tidak ada data untuk filter ini'); return; }

    const ok = renderChart(ctx, w, h, lastData, config.type, getThemeColors());
    if (!ok) drawHint(`Chart type "${config.type}" belum tersedia`);
  }

  async function refresh() {
    const cols = appState.dataset?.columns ?? [];
    const hasCol = (name) => !!name && cols.some((c) => c.name === name);

    // ── Heatmap ──
    if (config.type === 'heatmap') {
      if (!hasCol(config.xColumn) || !hasCol(config.yColumn) || !hasCol(config.valueColumn)) {
        lastData = null; lastError = 'Kolom tidak ada di dataset'; draw();
        footer.textContent = '⚠ Kolom hilang'; return;
      }
      const myId = ++requestId;
      try {
        const r = await analyzer.pivotTable({
          rowColumn: config.yColumn,
          colColumn: config.xColumn,
          valueColumn: config.valueColumn,
          function: config.aggregateFn || 'sum',
          filters: appState.appliedFilters,
        });
        if (myId !== requestId) return;
        lastData = r; lastError = null; draw();
        footer.textContent = `${(config.aggregateFn || 'sum').toUpperCase()}(${config.valueColumn}) · ${r.rowLabels.length}×${r.colLabels.length}`;
      } catch (err) {
        if (myId !== requestId) return;
        logger.error('heatmap failed', err);
        lastError = err.message || 'Unknown'; draw();
        footer.textContent = '⚠ Gagal memuat data';
      }
      return;
    }

    // ── Outlier ──
    if (config.type === 'outlier') {
      if (!hasCol(config.yColumn)) {
        lastData = null; lastError = 'Kolom analisis tidak ada'; draw();
        footer.textContent = '⚠ Kolom hilang'; return;
      }
      const myId = ++requestId;
      try {
        const r = await analyzer.detectOutliers(
          config.yColumn,
          {
            method: config.outlierMethod || 'iqr',
            threshold: config.outlierThreshold ?? undefined,
            xColumn: config.xColumn || null,
          },
          appState.appliedFilters
        );
        if (myId !== requestId) return;
        lastData = r; lastError = null; draw();
        footer.textContent = r
          ? `${r.outlierCount}/${r.total} outliers · ${r.method.toUpperCase()} ×${r.threshold}`
          : 'Tidak ada data';
      } catch (err) {
        if (myId !== requestId) return;
        logger.error('outlier failed', err);
        lastError = err.message || 'Unknown'; draw();
        footer.textContent = '⚠ Gagal memuat data';
      }
      return;
    }

    // ── Trend ──
    if (config.type === 'trend') {
      if (!hasCol(config.xColumn) || !hasCol(config.yColumn)) {
        lastData = null; lastError = 'Kolom tidak ada'; draw();
        footer.textContent = '⚠ Kolom hilang'; return;
      }
      const myId = ++requestId;
      try {
        const r = await analyzer.trendAnalysis(
          config.xColumn, config.yColumn,
          {
            movingAvgWindow: config.movingAvgWindow,
            forecastPeriods: config.forecastPeriods,
            aggregateFn: config.aggregateFn,
          },
          appState.appliedFilters
        );
        if (myId !== requestId) return;
        lastData = r; lastError = null; draw();
        if (r) {
          const dir = r.summary.direction === 'up' ? '↑'
            : r.summary.direction === 'down' ? '↓' : '→';
          const pct = r.summary.changePct !== null
            ? ` · ${r.summary.changePct >= 0 ? '+' : ''}${r.summary.changePct.toFixed(1)}%`
            : '';
          footer.textContent = `${dir} ${r.points.length} titik · slope=${r.regression.slope.toFixed(3)} · R²=${r.regression.r2.toFixed(3)}${pct}`;
        } else {
          footer.textContent = 'Data tidak cukup (min 2 titik)';
        }
      } catch (err) {
        if (myId !== requestId) return;
        logger.error('trend failed', err);
        lastError = err.message || 'Unknown'; draw();
        footer.textContent = '⚠ Gagal memuat data';
      }
      return;
    }

    // ── Bar / Line (single atau multi series) ──
    if (config.type === 'bar' || config.type === 'line') {
      if (!hasCol(config.xColumn)) {
        lastData = null; lastError = 'X column tidak ada'; draw();
        footer.textContent = '⚠ Kolom hilang'; return;
      }
      const series = normalizeSeries(config);
      if (!series.length) {
        lastData = null; lastError = 'Konfigurasi series kosong'; draw();
        footer.textContent = '⚠ Series kosong'; return;
      }
      const missing = series.find((s) => !hasCol(s.yColumn));
      if (missing) {
        lastData = null; lastError = `Kolom "${missing.yColumn}" tidak ada`; draw();
        footer.textContent = '⚠ Kolom hilang'; return;
      }

      const myId = ++requestId;
      try {
        if (series.length === 1) {
          // Single — reuse aggregate (identik dengan sebelumnya)
          const data = await analyzer.aggregate({
            xColumn: config.xColumn,
            yColumn: series[0].yColumn,
            function: series[0].aggregateFn,
            filters: appState.appliedFilters,
          });
          if (myId !== requestId) return;
          lastData = data; lastError = null; draw();
          footer.textContent = `${series[0].aggregateFn.toUpperCase()}(${series[0].yColumn}) by ${config.xColumn} · ${data.length} kategori`;
        } else {
          const result = await fetchMultiSeries(analyzer, config.xColumn, series, appState.appliedFilters);
          if (myId !== requestId) return;
          lastData = result; lastError = null; draw();
          const axes = series.some((s) => s.axis === 'right') ? ' · dual-axis' : '';
          footer.textContent = `${series.length} series · ${result.labels.length} kategori${axes}`;
        }
      } catch (err) {
        if (myId !== requestId) return;
        logger.error('series fetch failed', err);
        lastError = err.message || 'Unknown'; draw();
        footer.textContent = '⚠ Gagal memuat data';
      }
      return;
    }

    // ── Lainnya (pie, scatter) — existing single path ──
    if (!hasCol(config.xColumn) || !hasCol(config.yColumn)) {
      lastData = null; lastError = 'Kolom tidak ada'; draw();
      footer.textContent = '⚠ Kolom hilang'; return;
    }
    const myId = ++requestId;
    try {
      const data = await analyzer.aggregate({
        xColumn: config.xColumn,
        yColumn: config.yColumn,
        function: config.aggregateFn,
        filters: appState.appliedFilters,
      });
      if (myId !== requestId) return;
      lastData = data; lastError = null; draw();
      footer.textContent = `${config.aggregateFn.toUpperCase()}(${config.yColumn}) by ${config.xColumn} · ${data.length} kategori`;
    } catch (err) {
      if (myId !== requestId) return;
      logger.error('aggregate failed', err);
      lastError = err.message || 'Unknown'; draw();
      footer.textContent = '⚠ Gagal memuat data';
    }
  }

  function applyConfig(newConfig) {
    if (!newConfig) return;
    config = newConfig;
    titleEl.textContent = config.title;
    titleEl.title = config.title;
    canvas.setAttribute('aria-label', config.title);
    refresh();
  }

  async function editChart() {
    const result = await openChartDialog({ mode: 'edit', initial: config });
    if (!result) return;
    const next = appState.charts.map((c) =>
      c.id === config.id ? { ...result, id: config.id } : c
    );
    setState({ charts: next });
    toast('Chart diperbarui.', 'success');
  }

  function deleteChart() {
    const next = appState.charts.filter((c) => c.id !== config.id);
    setState({ charts: next });
    toast('Chart dihapus.', 'info');
  }

  const unsubData = subscribe(() => { refresh(); }, ['dataset', 'appliedFilters']);
  const unsubTheme = subscribe(() => { draw(); }, ['theme']);

  refresh();

  return {
    root,
    getConfig: () => config,
    update: applyConfig,
    dispose: () => {
      unsubData(); unsubTheme();
      ro.disconnect();
      requestId = -1;
    },
  };
}