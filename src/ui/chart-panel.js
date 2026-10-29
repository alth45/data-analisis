import { el, svgIcon } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { setState, subscribe } from '../state/state-events.js';
import { analyzer, APP_CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';
import { toast } from './toast.js';
import { getThemeColors } from '../utils/chart-drawers.js';
import { renderChart } from '../core/chart-registry.js';
import { createPanelHeader } from './panel-header.js';
import {
  canvasToBlob,
  downloadBlob,
  buildChartFilename,
} from '../utils/png.js';

export function renderChartPanel(root) {
  root.classList.add('panel', 'panel-chart');

  const exportBtn = el(
    'button',
    {
      class: 'btn btn-sm',
      id: 'chart-export-btn',
      onclick: handleExportPng,
    },
    svgIcon('image'),
    el('span', {}, 'Export PNG')
  );

  const header = createPanelHeader({
    title: 'Chart',
    panelId: 'chart',
    left: [el('span', { class: 'badge badge-muted', id: 'chart-badge' }, 'Pilih axis')],
    right: [exportBtn],
  });

  const chips = el('div', { class: 'chart-chips' });
  ['bar', 'line', 'pie', 'scatter'].forEach((t) => {
    chips.append(
      el(
        'button',
        {
          class: 'chip',
          'data-chart': t,
          onclick: () => setState({ chartType: t }),
        },
        t.charAt(0).toUpperCase() + t.slice(1)
      )
    );
  });

  const canvasWrap = el('div', { class: 'chart-canvas-wrap' });
  const canvas = el('canvas', {
    class: 'chart-canvas',
    role: 'img',
    'aria-label': 'Chart preview',
  });
  canvasWrap.append(canvas);
  root.append(header, chips, canvasWrap);

  const ctx = canvas.getContext('2d');

  let lastData = [];
  let lastError = null;
  let requestId = 0;
  let exporting = false;

  // ─────────────────────────────────────────────────────────────
  // Layout
  // ─────────────────────────────────────────────────────────────

  function resize() {
    const rect = canvasWrap.getBoundingClientRect();
    // Guard: panel hidden (0×0) → skip. ResizeObserver / activePanel
    // subscription akan trigger ulang saat visible.
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
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, w / 2, h / 2);
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (w < 2 || h < 2) return;

    ctx.clearRect(0, 0, w, h);

    if (!appState.dataset) {
      drawHint('Chart akan muncul setelah dataset di-load');
      return;
    }
    if (lastError) {
      drawHint('Error: ' + lastError);
      return;
    }
    if (appState.chartType === 'table') {
      drawHint('Table view — lihat Data Preview di atas');
      return;
    }
    if (!lastData.length) {
      drawHint('Pilih X dan Y axis di panel Tools untuk menampilkan chart');
      return;
    }

    const ok = renderChart(ctx, w, h, lastData, appState.chartType, getThemeColors());
    if (!ok) drawHint(`Chart type "${appState.chartType}" belum tersedia`);
  }

  // ─────────────────────────────────────────────────────────────
  // Data refresh
  // ─────────────────────────────────────────────────────────────

  async function refreshChart() {
    if (!appState.dataset) {
      lastData = [];
      lastError = null;
      draw();
      refreshExportButton();
      return;
    }

    // ⚠ BUG FIX: deklarasi xAxis & yAxis yang benar
    const xAxis = appState.xAxis;
    const yAxis = appState.yAxis;

    if (!xAxis || !yAxis) {
      lastData = [];
      lastError = null;
      draw();
      refreshExportButton();
      return;
    }

    const myId = ++requestId;
    try {
      const data = await analyzer.aggregate({
        xColumn: xAxis,
        yColumn: yAxis,
        function: appState.aggregateFn,
        filters: appState.appliedFilters,
      });
      if (myId !== requestId) return;
      lastData = data;
      lastError = null;
      draw();
    } catch (err) {
      if (myId !== requestId) return;
      logger.error('aggregate failed', err);
      lastError = err.message || 'Unknown error';
      draw();
    }
    refreshExportButton();
  }

  // ─────────────────────────────────────────────────────────────
  // UI helpers
  // ─────────────────────────────────────────────────────────────

  function updateChips() {
    root.querySelectorAll('.chip').forEach((c) =>
      c.classList.toggle('is-active', c.dataset.chart === appState.chartType)
    );
  }

  function updateBadge() {
    const badge = root.querySelector('#chart-badge');
    if (!badge) return;
    const n = appState.appliedFilters.length;
    const x = appState.xAxis;
    const y = appState.yAxis;
    if (x && y) {
      badge.textContent = n > 0
        ? `${appState.aggregateFn}(${y}) by ${x} · ${n} filter`
        : `${appState.aggregateFn}(${y}) by ${x}`;
      badge.classList.add('badge-muted');
    } else {
      badge.textContent = 'Pilih axis';
      badge.classList.add('badge-muted');
    }
  }

  function refreshExportButton() {
    const disabled =
      exporting ||
      !appState.dataset ||
      appState.chartType === 'table' ||
      lastData.length === 0;
    exportBtn.disabled = disabled;
    if (!appState.dataset) exportBtn.title = 'Belum ada dataset';
    else if (appState.chartType === 'table') exportBtn.title = 'Chart type "Table" tidak punya chart untuk diekspor';
    else if (lastData.length === 0) exportBtn.title = 'Pilih X/Y axis atau ubah filter';
    else exportBtn.title = `Export chart sebagai PNG (${appState.chartType})`;
  }

  // ─────────────────────────────────────────────────────────────
  // Export PNG
  // ─────────────────────────────────────────────────────────────

  function buildSubtitle() {
    const x = appState.xAxis;
    const y = appState.yAxis;
    if (!x || !y) return '';
    const agg = appState.aggregateFn.toUpperCase();
    const filterInfo = appState.appliedFilters.length
      ? ` · ${appState.appliedFilters.length} filter aktif`
      : '';
    return `${agg}(${y}) by ${x}${filterInfo}`;
  }

  function renderForExport() {
    if (!appState.dataset || !lastData.length) return null;
    if (appState.chartType === 'table') return null;

    const scale = 2;
    const targetW = 1200;
    const targetH = 720;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetW * scale;
    exportCanvas.height = targetH * scale;
    const xctx = exportCanvas.getContext('2d');
    xctx.scale(scale, scale);

    const colors = getThemeColors();
    xctx.fillStyle = colors.surface;
    xctx.fillRect(0, 0, targetW, targetH);

    xctx.fillStyle = colors.textStrong;
    xctx.font = 'bold 20px system-ui, sans-serif';
    xctx.textAlign = 'left';
    xctx.textBaseline = 'top';
    xctx.fillText(appState.dataset.name, 28, 24);

    xctx.fillStyle = colors.text;
    xctx.font = '14px system-ui, sans-serif';
    xctx.fillText(buildSubtitle(), 28, 54);

    const chartX = 28;
    const chartY = 92;
    const chartW = targetW - 56;
    const chartH = targetH - 92 - 44;

    xctx.save();
    xctx.translate(chartX, chartY);
    const ok = renderChart(xctx, chartW, chartH, lastData, appState.chartType, colors);
    xctx.restore();

    if (!ok) return null;

    xctx.fillStyle = colors.text;
    xctx.font = '11px system-ui, sans-serif';
    xctx.textAlign = 'left';
    xctx.textBaseline = 'bottom';
    const footerLeft = appState.appliedFilters.length > 0
      ? `${lastData.length} kategori · ${appState.appliedFilters.length} filter aktif`
      : `${lastData.length} kategori · ${appState.dataset.rowCount} baris`;
    xctx.fillText(footerLeft, 28, targetH - 16);

    const ts = new Date().toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    xctx.textAlign = 'right';
    xctx.fillText(`Data Analysis Tool · ${ts}`, targetW - 28, targetH - 16);

    return exportCanvas;
  }

  async function handleExportPng() {
    if (exporting) return;
    if (!APP_CONFIG.featureFlags.exportPng) {
      toast('Export PNG belum diaktifkan.', 'warn');
      return;
    }
    if (!appState.dataset) {
      toast('Belum ada dataset untuk diekspor.', 'warn');
      return;
    }
    if (appState.chartType === 'table') {
      toast('Chart type "Table" tidak bisa diekspor sebagai PNG.', 'warn');
      return;
    }
    if (!lastData.length) {
      toast('Pilih X/Y axis terlebih dahulu.', 'warn');
      return;
    }

    exporting = true;
    exportBtn.disabled = true;
    const labelEl = exportBtn.querySelector('span:last-child');
    const originalLabel = labelEl.textContent;
    labelEl.textContent = 'Exporting…';

    try {
      const exportCanvas = renderForExport();
      if (!exportCanvas) throw new Error('Gagal render chart untuk export');

      const blob = await canvasToBlob(exportCanvas);
      const filename = buildChartFilename(appState.dataset.name, appState.chartType);
      downloadBlob(blob, filename);

      const sizeKB = (blob.size / 1024).toFixed(0);
      toast(`Chart ${appState.chartType} → ${filename} (${sizeKB} KB)`, 'success');
    } catch (err) {
      logger.error('export png failed', err);
      toast(`Export PNG gagal: ${err.message}`, 'error');
    } finally {
      exporting = false;
      labelEl.textContent = originalLabel;
      refreshExportButton();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Subscriptions
  // ─────────────────────────────────────────────────────────────

  subscribe(() => {
    lastData = [];
    lastError = null;
    root.hidden = !appState.dataset;
    updateChips();
    updateBadge();
    resize();
    refreshChart();
  }, ['dataset']);

  subscribe(() => {
    updateChips();
    draw();
    refreshExportButton();
  }, ['chartType', 'theme']);

  subscribe(() => {
    updateBadge();
    refreshChart();
  }, ['appliedFilters', 'xAxis', 'yAxis', 'aggregateFn']);

  // Re-resize saat panel visible (pindah view Data ↔ Charts ↔ dst.)
  subscribe(() => {
    if (root.hidden) return;
    requestAnimationFrame(resize);
  }, ['activePanel']);

  const ro = new ResizeObserver(resize);
  ro.observe(canvasWrap);

  root.hidden = !appState.dataset;
  updateChips();
  updateBadge();
  refreshExportButton();
  resize();
  refreshChart();

  document.addEventListener('datatool:focus-chart', () => {
    if (!root.hidden) root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}