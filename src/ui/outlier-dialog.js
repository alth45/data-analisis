import { el, clear } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { analyzer } from '../config.js';
import { logger } from '../utils/logger.js';
import { renderChart } from '../core/chart-registry.js';
import { getThemeColors } from '../utils/chart-drawers.js';
import { formatNumber } from '../utils/formatters.js';

/**
 * Dialog drill-down outliers. Render chart + stat summary + tabel outliers.
 * Method & threshold bisa diubah live (refetch + re-render).
 */
export function openOutlierDialog(columnName) {
  if (!appState.dataset) return;
  if (document.querySelector('.modal-backdrop')) return;

  const ds = appState.dataset;
  const cols = ds.columns;

  let state = {
    method: 'iqr',
    threshold: null,  // null = pakai default (1.5 / 3)
    xColumn: null,    // null = row index
  };
  let currentResult = null;
  let requestId = 0;

  // ---- DOM ----
  const methodSelect = el(
    'select',
    { class: 'input', onchange: (e) => { state.method = e.target.value; state.threshold = null; reload(); } },
    el('option', { value: 'iqr' }, 'IQR (Tukey)'),
    el('option', { value: 'zscore' }, 'Z-score')
  );
  const thresholdInput = el('input', {
    type: 'number',
    step: '0.1',
    min: '0',
    class: 'input',
    placeholder: 'default',
    oninput: (e) => {
      const v = e.target.value;
      state.threshold = v === '' ? null : Number(v);
      reload();
    },
  });
  const xSelect = el(
    'select',
    { class: 'input', onchange: (e) => { state.xColumn = e.target.value || null; reload(); } },
    el('option', { value: '' }, 'Row index'),
    ...cols.filter((c) => c.type === 'string' || c.type === 'date')
      .map((c) => el('option', { value: c.name }, c.name))
  );

  const summaryEl = el('div', { class: 'outlier-summary' });
  const canvasWrap = el('div', { class: 'outlier-chart-wrap' });
  const canvas = el('canvas', { class: 'outlier-canvas' });
  canvasWrap.append(canvas);
  const tableWrap = el('div', { class: 'outlier-table-wrap' });

  const body = el(
    'div',
    { class: 'modal-body outlier-body' },
    el('div', { class: 'outlier-config' },
      el('label', { class: 'outlier-cfg' },
        el('span', {}, 'Method'), methodSelect),
      el('label', { class: 'outlier-cfg' },
        el('span', {}, 'Threshold'), thresholdInput),
      el('label', { class: 'outlier-cfg' },
        el('span', {}, 'X-Axis'), xSelect)
    ),
    summaryEl,
    canvasWrap,
    tableWrap
  );

  const close = () => {
    const b = document.querySelector('.modal-backdrop');
    if (!b) return;
    b.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    setTimeout(() => b.remove(), 220);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const backdrop = el(
    'div',
    {
      class: 'modal-backdrop',
      onclick: (e) => { if (e.target === backdrop) close(); },
    },
    el(
      'div',
      { class: 'modal modal-wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Outliers ${columnName}` },
      el('div', { class: 'modal-header' },
        el('h2', {}, `Outliers — ${columnName}`),
        el('button', { class: 'btn btn-icon', 'aria-label': 'Close', onclick: close }, '×')
      ),
      body
    )
  );

  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => backdrop.classList.add('is-open'));

  // ---- Data flow ----
  async function reload() {
    const myId = ++requestId;
    try {
      const result = await analyzer.detectOutliers(
        columnName,
        {
          method: state.method,
          threshold: state.threshold ?? undefined,
          xColumn: state.xColumn,
        },
        appState.appliedFilters
      );
      if (myId !== requestId) return;
      currentResult = result;
      renderAll();
    } catch (err) {
      logger.error('detectOutliers failed', err);
      clear(summaryEl);
      summaryEl.append(el('div', { class: 'outlier-empty' }, `Error: ${err.message}`));
    }
  }

  function renderAll() {
    if (!currentResult) {
      clear(summaryEl);
      clear(tableWrap);
      summaryEl.append(el('div', { class: 'outlier-empty' }, 'Tidak ada data.'));
      drawCanvas();
      return;
    }
    renderSummary();
    drawCanvas();
    renderTable();
  }

  function renderSummary() {
    clear(summaryEl);
    const r = currentResult;
    const pct = r.total > 0 ? ((r.outlierCount / r.total) * 100).toFixed(1) : '0.0';
    summaryEl.append(
      el('div', { class: 'outlier-sum-item' },
        el('span', { class: 'outlier-sum-label' }, 'Outliers'),
        el('span', { class: 'outlier-sum-val outlier-val-bad' }, `${r.outlierCount} / ${r.total} (${pct}%)`)
      ),
      el('div', { class: 'outlier-sum-item' },
        el('span', { class: 'outlier-sum-label' }, 'Mean'),
        el('span', { class: 'outlier-sum-val' }, formatNumber(r.stats.mean))
      ),
      el('div', { class: 'outlier-sum-item' },
        el('span', { class: 'outlier-sum-label' }, 'Std Dev'),
        el('span', { class: 'outlier-sum-val' }, fmtFloat(r.stats.stdDev))
      ),
      el('div', { class: 'outlier-sum-item' },
        el('span', { class: 'outlier-sum-label' }, 'Q1 / Q3'),
        el('span', { class: 'outlier-sum-val' }, `${formatNumber(r.stats.q1)} / ${formatNumber(r.stats.q3)}`)
      ),
      el('div', { class: 'outlier-sum-item' },
        el('span', { class: 'outlier-sum-label' }, 'IQR'),
        el('span', { class: 'outlier-sum-val' }, fmtFloat(r.stats.iqr))
      ),
      el('div', { class: 'outlier-sum-item' },
        el('span', { class: 'outlier-sum-label' }, 'Bounds'),
        el('span', { class: 'outlier-sum-val' }, `[${fmtFloat(r.bounds.lower)}, ${fmtFloat(r.bounds.upper)}]`)
      ),
    );
  }

  function drawCanvas() {
    const rect = canvasWrap.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!currentResult) return;
    renderChart(ctx, rect.width, rect.height, currentResult, 'outlier', getThemeColors());
  }

  function renderTable() {
    clear(tableWrap);
    const r = currentResult;
    if (!r.outliers.length) {
      tableWrap.append(el('div', { class: 'outlier-empty' }, 'Tidak ada baris outlier.'));
      return;
    }

    const headers = ['#', 'x', columnName];
    // Kolom lain: 2 kolom pertama dataset untuk konteks
    const extraCols = cols.filter((c) => c.name !== columnName).slice(0, 3);
    extraCols.forEach((c) => headers.push(c.name));

    const table = el('table', { class: 'outlier-table' });
    const thead = el('thead');
    const trh = el('tr');
    headers.forEach((h) => trh.append(el('th', {}, h)));
    thead.append(trh);
    table.append(thead);

    const tbody = el('tbody');
    const maxShow = 100;
    r.outliers.slice(0, maxShow).forEach((o, idx) => {
      const tr = el('tr');
      tr.append(el('td', {}, String(idx + 1)));
      tr.append(el('td', {}, String(o.x)));
      tr.append(el('td', { class: 'outlier-cell-bad' }, fmtFloat(o.y)));
      if (o.originalRow) {
        extraCols.forEach((c) => {
          const ci = cols.findIndex((cc) => cc.name === c.name);
          tr.append(el('td', {}, String(o.originalRow[ci] ?? '')));
        });
      }
      tbody.append(tr);
    });
    table.append(tbody);
    tableWrap.append(table);

    if (r.outliers.length > maxShow) {
      tableWrap.append(el('div', { class: 'outlier-more' },
        `Menampilkan ${maxShow} dari ${r.outliers.length} outliers`));
    }
  }

  function fmtFloat(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
    return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  }

  function onResize() { drawCanvas(); }

  // initial
  reload();
  setTimeout(drawCanvas, 50);
}