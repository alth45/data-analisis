/**
 * PDF export — generates report based on current active view.
 *
 * Dependencies: jspdf (lazy-loaded via dynamic import).
 * No heavy image manipulation — chart di-render ke canvas offscreen
 * via chart-registry (support semua chart type), lalu di-embed sebagai
 * PNG ke PDF.
 *
 * Format: A4 landscape, light theme always (print-friendly).
 */
import { appState } from '../state/app-state.js';
import { analyzer } from '../config.js';
import { renderChart } from '../core/chart-registry.js';
import { normalizeSeries, fetchMultiSeries } from '../core/multi-series.js';
import { logger } from './logger.js';

// A4 landscape dalam mm
const A4 = { w: 297, h: 210 };
const M = 12; // margin
const CW = A4.w - M * 2;
const CH = A4.h - M * 2;

const C = {
  surface: '#ffffff',
  headerBg: '#f8f9fb',
  text: '#1a1d24',
  textSecondary: '#5f6368',
  textMuted: '#8b9099',
  border: '#e1e4ea',
  accent: '#2563eb',
  error: '#dc2626',
  zebra: '#fafafc',
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function getJsPDF() {
  const mod = await import('jspdf');
  return mod.jsPDF;
}

function pdfColors() {
  return {
    surface: C.surface,
    text: C.textSecondary,
    textStrong: C.text,
    grid: C.border,
    accent: C.accent,
  };
}

/** Render chart ke canvas offscreen (background solid putih). */
function renderChartCanvas(data, type, w, h) {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, w, h);
  try {
    renderChart(ctx, w, h, data, type, pdfColors());
  } catch (err) {
    logger.error('PDF chart render failed', err);
  }
  return canvas;
}

/** Fetch data untuk chart config (support semua type). */
async function fetchChartData(cfg) {
  const ds = appState.dataset;
  if (!ds) return null;
  const cols = ds.columns;
  const hasCol = (name) => !!name && cols.some((c) => c.name === name);

  if (cfg.type === 'heatmap') {
    if (!hasCol(cfg.xColumn) || !hasCol(cfg.yColumn) || !hasCol(cfg.valueColumn)) return null;
    return analyzer.pivotTable({
      rowColumn: cfg.yColumn,
      colColumn: cfg.xColumn,
      valueColumn: cfg.valueColumn,
      function: cfg.aggregateFn || 'sum',
      filters: appState.appliedFilters,
    });
  }
  if (cfg.type === 'outlier') {
    if (!hasCol(cfg.yColumn)) return null;
    return analyzer.detectOutliers(
      cfg.yColumn,
      {
        method: cfg.outlierMethod || 'iqr',
        threshold: cfg.outlierThreshold ?? undefined,
        xColumn: cfg.xColumn || null,
      },
      appState.appliedFilters
    );
  }
  if (cfg.type === 'trend') {
    if (!hasCol(cfg.xColumn) || !hasCol(cfg.yColumn)) return null;
    return analyzer.trendAnalysis(
      cfg.xColumn,
      cfg.yColumn,
      {
        movingAvgWindow: cfg.movingAvgWindow,
        forecastPeriods: cfg.forecastPeriods,
        aggregateFn: cfg.aggregateFn,
      },
      appState.appliedFilters
    );
  }

  const series = normalizeSeries(cfg);
  if (!hasCol(cfg.xColumn)) return null;

  if ((cfg.type === 'bar' || cfg.type === 'line') && series.length > 1) {
    return fetchMultiSeries(analyzer, cfg.xColumn, series, appState.appliedFilters);
  }

  const yCol = series[0]?.yColumn || cfg.yColumn;
  const aggFn = series[0]?.aggregateFn || cfg.aggregateFn || 'sum';
  if (!hasCol(yCol)) return null;

  return analyzer.aggregate({
    xColumn: cfg.xColumn,
    yColumn: yCol,
    function: aggFn,
    filters: appState.appliedFilters,
  });
}

function fmtNum(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return v.toLocaleString('id-ID');
    return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  }
  return String(v);
}

function truncate(s, max) {
  const str = String(s ?? '');
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ─────────────────────────────────────────────────────────────
// Layout primitives
// ─────────────────────────────────────────────────────────────

function drawHeader(doc, title) {
  doc.setFillColor(...rgb(C.headerBg));
  doc.rect(0, 0, A4.w, 20, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...rgb(C.text));
  doc.text(title, M, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...rgb(C.textMuted));
  const ts = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Data Analysis Tool · ${ts}`, A4.w - M, 13, { align: 'right' });

  doc.setDrawColor(...rgb(C.border));
  doc.setLineWidth(0.2);
  doc.line(0, 20, A4.w, 20);
}

function drawFooter(doc) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...rgb(C.textMuted));
  const n = doc.internal.getNumberOfPages();
  const cur = doc.internal.getCurrentPageInfo().pageNumber;
  doc.text(`Halaman ${cur} / ${n}`, A4.w / 2, A4.h - 6, { align: 'center' });
}

function drawDatasetInfo(doc, x, y) {
  const ds = appState.dataset;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...rgb(C.textSecondary));

  let cursor = y;
  doc.text(`Dataset: ${ds.name}`, x, cursor);
  cursor += 5;
  doc.text(`Rows: ${ds.rowCount} · Columns: ${ds.columnCount}`, x, cursor);
  cursor += 5;
  doc.text(`Engine: ${appState.engineName}`, x, cursor);
  cursor += 5;

  if (appState.appliedFilters.length > 0) {
    doc.setTextColor(...rgb(C.text));
    doc.setFont('helvetica', 'bold');
    doc.text(`Filters (${appState.appliedFilters.length} aktif):`, x, cursor);
    cursor += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...rgb(C.textMuted));
    appState.appliedFilters.forEach((f) => {
      doc.text(`• ${f.column} ${f.operator} ${f.value}`, x + 3, cursor);
      cursor += 4;
    });
    doc.setFontSize(9);
  }
  return cursor;
}

// ─────────────────────────────────────────────────────────────
// Report builders
// ─────────────────────────────────────────────────────────────

async function buildChartsReport(doc) {
  // Cover
  drawHeader(doc, 'Charts Report');
  let y = 30;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...rgb(C.text));
  doc.text('Charts Dashboard', M, y);
  y += 10;

  y = drawDatasetInfo(doc, M, y + 5);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...rgb(C.text));
  doc.text(`Total: ${appState.charts.length} chart${appState.charts.length === 1 ? '' : 's'}`, M, y);

  const charts = appState.charts;
  if (!charts.length) {
    doc.addPage();
    drawHeader(doc, 'Charts');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(13);
    doc.setTextColor(...rgb(C.textMuted));
    doc.text('Belum ada chart dikonfigurasi.', A4.w / 2, A4.h / 2, { align: 'center' });
    drawFooter(doc);
    return;
  }

  // Chart pages — 4 per page (2×2)
  for (let i = 0; i < charts.length; i += 4) {
    doc.addPage();
    drawHeader(doc, `Charts (${i + 1}–${Math.min(i + 4, charts.length)} dari ${charts.length})`);
    await renderChartGrid(doc, charts.slice(i, i + 4));
    drawFooter(doc);
  }
}

async function renderChartGrid(doc, charts) {
  const gap = 6;
  const topOffset = 24;
  const cellW = (CW - gap) / 2;
  const cellH = (CH - topOffset - gap) / 2;

  for (let i = 0; i < charts.length; i++) {
    const cfg = charts[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * (cellW + gap);
    const y = topOffset + row * (cellH + gap);

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...rgb(C.text));
    doc.text(truncate(cfg.title, Math.floor(cellW / 2)), x, y + 4);

    // Chart image
    const chartY = y + 8;
    const chartH = cellH - 14;
    try {
      const data = await fetchChartData(cfg);
      if (!data) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(...rgb(C.error));
        doc.text('Data tidak tersedia', x + cellW / 2, chartY + chartH / 2, { align: 'center' });
      } else {
        const canvas = renderChartCanvas(data, cfg.type, cellW, chartH);
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, chartY, cellW, chartH);
      }
    } catch (err) {
      logger.error('PDF chart cell failed', err);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...rgb(C.error));
      doc.text('Error render', x + cellW / 2, chartY + chartH / 2, { align: 'center' });
    }

    // Footer label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...rgb(C.textMuted));
    doc.text(
      cfg.type.toUpperCase() +
        (cfg.xColumn ? ` · ${cfg.xColumn}` : '') +
        (cfg.yColumn ? ` / ${cfg.yColumn}` : ''),
      x,
      y + cellH - 2
    );
  }
}

async function buildDataReport(doc) {
  drawHeader(doc, 'Data Report');
  let y = 30;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...rgb(C.text));
  doc.text('Data Analysis', M, y);
  y += 10;

  y = drawDatasetInfo(doc, M, y + 5);
  y += 8;

  // Chart (kalau ada axis terpilih)
  if (appState.xAxis && appState.yAxis) {
    try {
      const chartData = await analyzer.aggregate({
        xColumn: appState.xAxis,
        yColumn: appState.yAxis,
        function: appState.aggregateFn,
        filters: appState.appliedFilters,
      });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...rgb(C.text));
      doc.text(
        `${appState.aggregateFn.toUpperCase()}(${appState.yAxis}) by ${appState.xAxis} · ${appState.chartType}`,
        M,
        y
      );
      y += 2;

      const chartH = 80;
      const canvas = renderChartCanvas(chartData, appState.chartType, CW, chartH);
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', M, y, CW, chartH);
      y += chartH + 6;
    } catch (err) {
      logger.error('PDF data chart failed', err);
    }
  }

  // Preview rows
  const res = await analyzer.filterAndPaginate(appState.appliedFilters, 15, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...rgb(C.text));
  doc.text(`Preview (${res.total} total rows, menampilkan 15)`, M, y);
  y += 3;

  drawDataTable(doc, res.rows, M, y, CW);
  drawFooter(doc);
}

function drawDataTable(doc, rows, x, y, maxW) {
  const ds = appState.dataset;
  if (!ds || !rows.length) return;
  const cols = ds.columns;
  const colW = maxW / cols.length;
  const rowH = 5;
  const startY = y;

  // Header
  doc.setFillColor(...rgb(C.headerBg));
  doc.rect(x, y, maxW, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...rgb(C.text));
  cols.forEach((c, i) => {
    doc.text(truncate(c.name, Math.floor(colW / 1.8)), x + i * colW + 1, y + 3.5);
  });
  y += rowH;

  // Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  rows.forEach((row, ri) => {
    if (y + rowH > A4.h - 12) return;
    if (ri % 2 === 0) {
      doc.setFillColor(...rgb(C.zebra));
      doc.rect(x, y, maxW, rowH, 'F');
    }
    row.forEach((cell, i) => {
      doc.setTextColor(...rgb(i === 0 ? C.text : C.textSecondary));
      doc.text(truncate(String(cell ?? ''), Math.floor(colW / 1.8)), x + i * colW + 1, y + 3.5);
    });
    y += rowH;
  });

  // Border box
  doc.setDrawColor(...rgb(C.border));
  doc.setLineWidth(0.2);
  doc.rect(x, startY, maxW, y - startY);
}

async function buildStatsReport(doc) {
  drawHeader(doc, 'Statistics Report');
  let y = 30;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...rgb(C.text));
  doc.text('Statistics', M, y);
  y += 10;

  y = drawDatasetInfo(doc, M, y + 5);
  y += 8;

  const ds = appState.dataset;
  const results = await Promise.all(
    ds.columns.map(async (c) => ({
      col: c,
      stats: await analyzer.describeColumn(c.name, appState.appliedFilters),
    }))
  );

  const headers = ['Column', 'Type', 'Count', 'Distinct', 'Min', 'Max', 'Mean', 'Median', 'StdDev', 'Q1', 'Q3'];
  const widths = [42, 10, 13, 13, 22, 22, 22, 22, 22, 20, 20];
  const rowH = 5;
  const totalW = widths.reduce((s, w) => s + w, 0);
  const startY = y;

  // Header
  doc.setFillColor(...rgb(C.headerBg));
  doc.rect(M, y, totalW, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...rgb(C.text));
  let tx = M;
  headers.forEach((h, i) => {
    doc.text(h, tx + 1, y + 3.5);
    tx += widths[i];
  });
  y += rowH;

  // Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  results.forEach((r, ri) => {
    if (y + rowH > A4.h - 12) return;
    if (ri % 2 === 0) {
      doc.setFillColor(...rgb(C.zebra));
      doc.rect(M, y, totalW, rowH, 'F');
    }
    const vals = [
      truncate(r.col.name, 25),
      r.col.type,
      String(r.stats.count),
      String(r.stats.distinct),
      fmtNum(r.stats.min),
      fmtNum(r.stats.max),
      fmtNum(r.stats.mean),
      fmtNum(r.stats.median),
      fmtNum(r.stats.stdDev),
      fmtNum(r.stats.q1),
      fmtNum(r.stats.q3),
    ];
    let x = M;
    vals.forEach((v, i) => {
      doc.setTextColor(...rgb(i === 0 ? C.text : C.textSecondary));
      doc.text(String(v), x + 1, y + 3.5);
      x += widths[i];
    });
    y += rowH;
  });

  doc.setDrawColor(...rgb(C.border));
  doc.setLineWidth(0.2);
  doc.rect(M, startY, totalW, y - startY);

  drawFooter(doc);
}

async function buildPivotReport(doc) {
  drawHeader(doc, 'Pivot Report');
  let y = 30;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...rgb(C.text));
  doc.text('Pivot Table', M, y);
  y += 10;

  y = drawDatasetInfo(doc, M, y + 5);
  y += 8;

  const p = appState.pivot;
  if (!p.rowColumn || !p.valueColumn) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(13);
    doc.setTextColor(...rgb(C.textMuted));
    doc.text('Pivot belum dikonfigurasi.', M, y);
    drawFooter(doc);
    return;
  }

  const result = await analyzer.pivotTable({
    rowColumn: p.rowColumn,
    colColumn: p.colColumn,
    valueColumn: p.valueColumn,
    function: p.aggregateFn,
    filters: appState.appliedFilters,
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...rgb(C.text));
  doc.text(
    `${p.aggregateFn.toUpperCase()}(${p.valueColumn}) by ${p.rowColumn}${p.colColumn ? ' × ' + p.colColumn : ''}`,
    M,
    y
  );
  y += 5;

  if (!result.rowLabels.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(...rgb(C.textMuted));
    doc.text('Tidak ada data.', M, y);
    drawFooter(doc);
    return;
  }

  // Table — limit fit to page
  const maxRows = Math.min(result.rowLabels.length, 20);
  const maxCols = Math.min(result.colLabels.length, 6);
  const rowLabelW = 45;
  const cellW = Math.min(30, (CW - rowLabelW) / (maxCols + 1));
  const rowH = 5;
  const totalW = rowLabelW + cellW * (maxCols + 1);
  const startY = y;

  // Header
  doc.setFillColor(...rgb(C.headerBg));
  doc.rect(M, y, totalW, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...rgb(C.text));
  doc.text(truncate(p.rowColumn, 25), M + 1, y + 3.5);
  for (let ci = 0; ci < maxCols; ci++) {
    doc.text(truncate(result.colLabels[ci], 10), M + rowLabelW + ci * cellW + 1, y + 3.5);
  }
  doc.text('Total', M + rowLabelW + maxCols * cellW + 1, y + 3.5);
  y += rowH;

  // Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  for (let ri = 0; ri < maxRows; ri++) {
    if (ri % 2 === 0) {
      doc.setFillColor(...rgb(C.zebra));
      doc.rect(M, y, totalW, rowH, 'F');
    }
    doc.setTextColor(...rgb(C.text));
    doc.text(truncate(result.rowLabels[ri], 25), M + 1, y + 3.5);
    doc.setTextColor(...rgb(C.textSecondary));
    for (let ci = 0; ci < maxCols; ci++) {
      const v = result.matrix[ri]?.[ci];
      doc.text(v === null ? '—' : fmtNum(v), M + rowLabelW + ci * cellW + 1, y + 3.5);
    }
    doc.setTextColor(...rgb(C.text));
    doc.text(fmtNum(result.rowTotals[ri]), M + rowLabelW + maxCols * cellW + 1, y + 3.5);
    y += rowH;
  }

  // Footer info
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...rgb(C.textMuted));
  if (result.rowLabels.length > maxRows || result.colLabels.length > maxCols) {
    doc.text(
      `Menampilkan ${maxRows}/${result.rowLabels.length} rows × ${maxCols}/${result.colLabels.length} cols`,
      M,
      y + 4
    );
  }

  doc.setDrawColor(...rgb(C.border));
  doc.setLineWidth(0.2);
  doc.rect(M, startY, totalW, y - startY);

  drawFooter(doc);
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

export async function exportCurrentViewAsPdf() {
  if (!appState.dataset) {
    throw new Error('Belum ada dataset untuk diekspor');
  }

  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const view = appState.activePanel;

  try {
    if (view === 'charts') await buildChartsReport(doc);
    else if (view === 'pivot') await buildPivotReport(doc);
    else if (view === 'stats') await buildStatsReport(doc);
    else await buildDataReport(doc);
  } catch (err) {
    logger.error('PDF export builder failed', err);
    throw err;
  }

  const filename = buildFilename(view);
  doc.save(filename);
  return { filename, view };
}

function buildFilename(view) {
  const ds = appState.dataset;
  const base = (ds?.name || 'report').replace(/\.[^.]+$/, '');
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-${date}-${view}.pdf`;
}