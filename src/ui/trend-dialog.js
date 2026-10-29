import { el, clear } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { analyzer } from '../config.js';
import { logger } from '../utils/logger.js';
import { renderChart } from '../core/chart-registry.js';
import { getThemeColors } from '../utils/chart-drawers.js';
import { formatNumber } from '../utils/formatters.js';

/**
 * Trend drill-down dialog. Bisa di-trigger dari Statistics untuk kolom date.
 * @param {string} xColumn - kolom date
 * @param {string} yColumn - kolom numeric (kalau null, pakai numeric pertama)
 */
export function openTrendDialog(xColumn, yColumn = null) {
  if (!appState.dataset) return;
  if (document.querySelector('.modal-backdrop')) return;

  const cols = appState.dataset.columns;
  const numCols = cols.filter((c) => c.type === 'number');
  if (!numCols.length) return;

  let state = {
    xColumn: xColumn || cols.find((c) => c.type === 'date')?.name,
    yColumn: yColumn || numCols[0].name,
    aggregateFn: 'sum',
    movingAvgWindow: 3,
    forecastPeriods: 5,
  };
  if (!state.xColumn) return;

  let currentResult = null;
  let requestId = 0;

  // ── Config controls ──
  const xSelect = el(
    'select',
    { class: 'input', onchange: (e) => { state.xColumn = e.target.value; reload(); } },
    ...cols.filter((c) => c.type === 'date' || c.type === 'number')
      .map((c) => el('option', { value: c.name, selected: c.name === state.xColumn }, c.name))
  );
  const ySelect = el(
    'select',
    { class: 'input', onchange: (e) => { state.yColumn = e.target.value; reload(); } },
    ...numCols.map((c) => el('option', { value: c.name, selected: c.name === state.yColumn }, c.name))
  );
  const fnSelect = el(
    'select',
    { class: 'input', onchange: (e) => { state.aggregateFn = e.target.value; reload(); } },
    ...['sum', 'avg', 'count', 'min', 'max'].map((fn) =>
      el('option', { value: fn, selected: fn === state.aggregateFn }, fn.toUpperCase()))
  );
  const maInput = el('input', {
    type: 'number', min: '2', max: '50', class: 'input',
    value: state.movingAvgWindow,
    oninput: (e) => {
      const v = Number(e.target.value);
      state.movingAvgWindow = v >= 2 ? v : 3;
      reload();
    },
  });
  const forecastInput = el('input', {
    type: 'number', min: '0', max: '100', class: 'input',
    value: state.forecastPeriods,
    oninput: (e) => {
      const v = Number(e.target.value);
      state.forecastPeriods = v >= 0 ? v : 5;
      reload();
    },
  });

  const summaryEl = el('div', { class: 'trend-summary' });
  const canvasWrap = el('div', { class: 'trend-chart-wrap' });
  const canvas = el('canvas', { class: 'trend-canvas' });
  canvasWrap.append(canvas);

  const body = el('div', { class: 'modal-body trend-body' },
    el('div', { class: 'trend-config' },
      el('label', { class: 'trend-cfg' }, el('span', {}, 'X (waktu)'), xSelect),
      el('label', { class: 'trend-cfg' }, el('span', {}, 'Y (nilai)'), ySelect),
      el('label', { class: 'trend-cfg' }, el('span', {}, 'Aggregate'), fnSelect),
      el('label', { class: 'trend-cfg' }, el('span', {}, 'MA Window'), maInput),
      el('label', { class: 'trend-cfg' }, el('span', {}, 'Forecast'), forecastInput)
    ),
    summaryEl,
    canvasWrap
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
  const onResize = () => drawCanvas();

  const backdrop = el('div',
    { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } },
    el('div',
      { class: 'modal modal-wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Trend Analysis' },
      el('div', { class: 'modal-header' },
        el('h2', {}, 'Trend Analysis'),
        el('button', { class: 'btn btn-icon', 'aria-label': 'Close', onclick: close }, '×')),
      body
    )
  );

  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => backdrop.classList.add('is-open'));

  async function reload() {
    const myId = ++requestId;
    try {
      const r = await analyzer.trendAnalysis(
        state.xColumn, state.yColumn,
        {
          movingAvgWindow: state.movingAvgWindow,
          forecastPeriods: state.forecastPeriods,
          aggregateFn: state.aggregateFn,
        },
        appState.appliedFilters
      );
      if (myId !== requestId) return;
      currentResult = r;
      renderAll();
    } catch (err) {
      logger.error('trend failed', err);
      clear(summaryEl);
      summaryEl.append(el('div', { class: 'trend-empty' }, `Error: ${err.message}`));
    }
  }

  function renderAll() {
    if (!currentResult) {
      clear(summaryEl);
      summaryEl.append(el('div', { class: 'trend-empty' },
        'Butuh ≥2 titik data untuk analisis trend.'));
      drawCanvas(); return;
    }
    renderSummary(); drawCanvas();
  }

  function renderSummary() {
    clear(summaryEl);
    const r = currentResult;
    const dir = r.summary.direction === 'up' ? '↑ Up'
      : r.summary.direction === 'down' ? '↓ Down' : '→ Flat';
    const dirClass = r.summary.direction === 'up' ? 'trend-val-up'
      : r.summary.direction === 'down' ? 'trend-val-down' : '';

    const items = [
      ['Direction', dir, dirClass],
      ['Slope/period', r.regression.slope.toFixed(4), ''],
      ['R² (fit)', r.regression.r2.toFixed(4), ''],
      ['First → Last', `${fmtNum(r.summary.first)} → ${fmtNum(r.summary.last)}`, ''],
      ['Δ absolute', `${r.summary.changeAbs >= 0 ? '+' : ''}${fmtNum(r.summary.changeAbs)}`, ''],
      ['Δ %', r.summary.changePct === null ? '—'
        : `${r.summary.changePct >= 0 ? '+' : ''}${r.summary.changePct.toFixed(2)}%`,
        r.summary.changePct > 0 ? 'trend-val-up'
        : r.summary.changePct < 0 ? 'trend-val-down' : ''],
    ];
    if (r.summary.cagr !== null) {
      items.push(['CAGR', `${r.summary.cagr >= 0 ? '+' : ''}${r.summary.cagr.toFixed(2)}%/yr`,
        r.summary.cagr >= 0 ? 'trend-val-up' : 'trend-val-down']);
    }

    items.forEach(([label, val, cls]) => {
      summaryEl.append(
        el('div', { class: 'trend-sum-item' },
          el('span', { class: 'trend-sum-label' }, label),
          el('span', { class: `trend-sum-val ${cls}` }, val))
      );
    });
  }

  function fmtNum(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
    if (Number.isInteger(v)) return formatNumber(v);
    return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
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
    renderChart(ctx, rect.width, rect.height, currentResult, 'trend', getThemeColors());
  }

  reload();
  setTimeout(drawCanvas, 50);
}