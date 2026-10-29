import { el, clear } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { setState, subscribe } from '../state/state-events.js';
import { analyzer } from '../config.js';
import { formatNumber } from '../utils/formatters.js';
import { logger } from '../utils/logger.js';
import { toast } from './toast.js';
import { serializeCsv, downloadCsv, buildExportFilename } from '../utils/csv.js';
import { createPanelHeader } from './panel-header.js';

const FN_LIST = ['sum', 'avg', 'count', 'min', 'max'];
const MAX_COLS = 50;

export function renderPivotPanel(root) {
  root.classList.add('panel', 'panel-pivot');

    const exportBtn = el(
        'button',
        {
        class: 'btn btn-sm',
        id: 'pivot-export-btn',
        onclick: handleExportCsv,
        },
        'Export CSV'
  );

  const header = createPanelHeader({
    title: 'Pivot Table',
    panelId: 'pivot',
    left: [el('span', { class: 'badge badge-muted', id: 'pivot-badge' }, '')],
    right: [exportBtn],
  });

  const controls = el('div', { class: 'pivot-controls' });
  const body = el('div', { class: 'pivot-body' });
  root.append(header, controls, body);

  let lastResult = null;
  let lastError = null;
  let requestId = 0;

  // ─────────────────────────────────────────────────────────────
  // Config helpers
  // ─────────────────────────────────────────────────────────────

  function setPivot(partial) {
    setState({ pivot: { ...appState.pivot, ...partial } });
  }

  function autoPickDefaults() {
    const cols = appState.dataset?.columns ?? [];
    const firstString = cols.find((c) => c.type === 'string')?.name ?? null;
    const firstNumber = cols.find((c) => c.type === 'number')?.name ?? null;
    const cur = appState.pivot;
    const patch = {};
    if (!cur.rowColumn) patch.rowColumn = firstString;
    if (!cur.valueColumn) patch.valueColumn = firstNumber;
    if (Object.keys(patch).length) setPivot(patch);
  }

  // ─────────────────────────────────────────────────────────────
  // Controls (render ulang hanya kalau dataset berubah)
  // ─────────────────────────────────────────────────────────────

  function renderControls() {
    clear(controls);
    const cols = appState.dataset?.columns ?? [];
    const numCols = cols.filter((c) => c.type === 'number');

    if (!cols.length) {
      controls.append(
        el('div', { class: 'pivot-empty-hint' }, 'Upload dataset untuk memulai pivot.')
      );
      return;
    }

    const rowSelect = el(
      'select',
      {
        class: 'input',
        onchange: (e) => setPivot({ rowColumn: e.target.value || null }),
      },
      el('option', { value: '' }, '— pilih —'),
      ...cols.map((c) =>
        el('option', { value: c.name, selected: appState.pivot.rowColumn === c.name }, c.name)
      )
    );

    const colSelect = el(
      'select',
      {
        class: 'input',
        onchange: (e) => setPivot({ colColumn: e.target.value || null }),
      },
      el('option', { value: '' }, '— tanpa kolom —'),
      ...cols
        .filter((c) => c.type !== 'number')
        .map((c) =>
          el('option', { value: c.name, selected: appState.pivot.colColumn === c.name }, c.name)
        )
    );

    const valSelect = el(
      'select',
      {
        class: 'input',
        onchange: (e) => setPivot({ valueColumn: e.target.value || null }),
      },
      el('option', { value: '' }, '— pilih —'),
      ...numCols.map((c) =>
        el('option', { value: c.name, selected: appState.pivot.valueColumn === c.name }, c.name)
      )
    );

    const fnSelect = el(
      'select',
      {
        class: 'input',
        onchange: (e) => setPivot({ aggregateFn: e.target.value }),
      },
      ...FN_LIST.map((fn) =>
        el(
          'option',
          { value: fn, selected: appState.pivot.aggregateFn === fn },
          fn.toUpperCase()
        )
      )
    );

    const totalsCheck = el('input', {
      type: 'checkbox',
      checked: appState.pivot.showTotals,
      onchange: (e) => setPivot({ showTotals: e.target.checked }),
    });

    controls.append(
      el(
        'div',
        { class: 'pivot-ctrl-grid' },
        el('label', { class: 'pivot-ctrl' }, el('span', {}, 'Rows'), rowSelect),
        el('label', { class: 'pivot-ctrl' }, el('span', {}, 'Columns'), colSelect),
        el('label', { class: 'pivot-ctrl' }, el('span', {}, 'Values'), valSelect),
        el('label', { class: 'pivot-ctrl' }, el('span', {}, 'Function'), fnSelect),
        el(
          'label',
          { class: 'pivot-ctrl pivot-ctrl-check' },
          el('span', {}, 'Totals'),
          el('div', { class: 'pivot-check-wrap' }, totalsCheck)
        )
      )
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Refresh — aggregate ulang & render tabel
  // ─────────────────────────────────────────────────────────────

  async function refresh() {
    if (!appState.dataset) {
      lastResult = null;
      lastError = null;
      body.innerHTML = '';
      root.hidden = true;
      refreshBadge();
      refreshExportBtn();
      return;
    }
    root.hidden = false;

    const { rowColumn, colColumn, valueColumn, aggregateFn, showTotals } = appState.pivot;

    if (!rowColumn || !valueColumn) {
      clear(body);
      body.append(
        el('div', { class: 'pivot-empty-hint' },
          'Pilih Rows dan Values untuk memulai pivot.'
        )
      );
      lastResult = null;
      refreshBadge();
      refreshExportBtn();
      return;
    }

    const myId = ++requestId;
    try {
      const result = await analyzer.pivotTable({
        rowColumn,
        colColumn,
        valueColumn,
        function: aggregateFn,
        filters: appState.appliedFilters,
      });
      if (myId !== requestId) return;
      lastResult = result;
      lastError = null;
      renderTable(result);
    } catch (err) {
      if (myId !== requestId) return;
      logger.error('pivotTable failed', err);
      lastResult = null;
      lastError = err.message || 'Unknown error';
      clear(body);
      body.append(
        el('div', { class: 'pivot-empty-hint error' },
          'Gagal menghitung pivot: ' + lastError
        )
      );
    }
    refreshBadge();
    refreshExportBtn();
  }

  function renderTable(result) {
    clear(body);

    if (!result.rowLabels.length) {
      body.append(
        el('div', { class: 'pivot-empty-hint' },
          'Tidak ada data untuk filter/config ini.'
        )
      );
      return;
    }

    if (result.colLabels.length > MAX_COLS) {
      body.append(
        el('div', { class: 'pivot-empty-hint error' },
          `Terlalu banyak kolom unik (${result.colLabels.length} > ${MAX_COLS}). ` +
          `Pilih kolom lain atau filter dulu.`
        )
      );
      return;
    }

    const { rowColumn, colColumn, valueColumn, aggregateFn, showTotals } = appState.pivot;
    const singleDim = !colColumn;

    // Header
    const thead = el('thead');
    const trh = el('tr');
    trh.append(el('th', { class: 'pivot-corner' }, `${rowColumn} \\ ${colColumn || 'Value'}`));
    if (singleDim) {
      trh.append(
        el('th', { class: 'pivot-col-head' },
          `${aggregateFn.toUpperCase()}(${valueColumn})`
        )
      );
    } else {
      result.colLabels.forEach((c) => {
        trh.append(el('th', { class: 'pivot-col-head', title: c }, c));
      });
      if (showTotals) {
        trh.append(el('th', { class: 'pivot-col-head pivot-total-col' }, 'Total'));
      }
    }
    thead.append(trh);

    // Body
    const tbody = el('tbody');
    result.rowLabels.forEach((r, ri) => {
      const tr = el('tr');
      tr.append(el('th', { scope: 'row', class: 'pivot-row-head', title: r }, r));

      if (singleDim) {
        const v = result.matrix[ri]?.[0];
        tr.append(el('td', { class: 'pivot-cell pivot-cell-value' }, formatNum(v)));
      } else {
        result.matrix[ri].forEach((v) => {
          tr.append(
            el(
              'td',
              { class: 'pivot-cell' + (v === null ? ' pivot-cell-empty' : '') },
              v === null ? '·' : formatNum(v)
            )
          );
        });
        if (showTotals) {
          tr.append(
            el('td', { class: 'pivot-cell pivot-total-col' }, formatNum(result.rowTotals[ri]))
          );
        }
      }
      tbody.append(tr);
    });

    // Footer (grand total row)
    const tfoot = el('tfoot');
    if (showTotals) {
      const trf = el('tr');
      trf.append(el('th', { scope: 'row', class: 'pivot-row-head pivot-total-row' }, 'Total'));
      if (singleDim) {
        trf.append(
          el('td', { class: 'pivot-cell pivot-cell-value pivot-total-row' },
            formatNum(result.grandTotal)
          )
        );
      } else {
        result.colTotals.forEach((v) => {
          trf.append(el('td', { class: 'pivot-cell pivot-total-row' }, formatNum(v)));
        });
        trf.append(
          el('td', { class: 'pivot-cell pivot-total-col pivot-total-row' },
            formatNum(result.grandTotal)
          )
        );
      }
      tfoot.append(trf);
    }

    const table = el('table', { class: 'pivot-table' }, thead, tbody, tfoot);
    const wrap = el('div', { class: 'pivot-table-wrap' }, table);
    body.append(wrap);
  }

  function formatNum(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return formatNumber(v);
      return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
    }
    return String(v);
  }

  function refreshBadge() {
    const badge = root.querySelector('#pivot-badge');
    if (!badge) return;
    const parts = [];
    if (appState.appliedFilters.length > 0) {
      parts.push(`${appState.appliedFilters.length} filter`);
    }
    if (lastResult) {
      parts.push(`${lastResult.rowLabels.length} row × ${lastResult.colLabels.length} col`);
    }
    badge.textContent = parts.join(' · ') || '—';
  }

  function refreshExportBtn() {
    const btn = root.querySelector('#pivot-export-btn');
    if (!btn) return;
    btn.disabled = !lastResult || lastResult.rowLabels.length === 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Export CSV
  // ─────────────────────────────────────────────────────────────

  function handleExportCsv() {
    if (!lastResult || !lastResult.rowLabels.length) {
      toast('Belum ada pivot untuk diekspor.', 'warn');
      return;
    }
    if (!appState.dataset) {
      toast('Belum ada dataset.', 'warn');
      return;
    }

    const { rowColumn, colColumn, valueColumn, aggregateFn, showTotals } = appState.pivot;
    const singleDim = !colColumn;

    const headers = [{ name: rowColumn }];
    if (singleDim) {
      headers.push({ name: `${aggregateFn.toUpperCase()}(${valueColumn})` });
    } else {
      lastResult.colLabels.forEach((c) => headers.push({ name: c }));
      if (showTotals) headers.push({ name: 'Total' });
    }

    const rows = lastResult.rowLabels.map((r, i) => {
      const out = [r];
      if (singleDim) {
        out.push(lastResult.matrix[i]?.[0] ?? '');
      } else {
        lastResult.matrix[i].forEach((v) => out.push(v === null ? '' : v));
        if (showTotals) out.push(lastResult.rowTotals[i]);
      }
      return out;
    });

    if (showTotals) {
      const totalRow = ['Total'];
      if (singleDim) {
        totalRow.push(lastResult.grandTotal);
      } else {
        lastResult.colTotals.forEach((v) => totalRow.push(v));
        totalRow.push(lastResult.grandTotal);
      }
      rows.push(totalRow);
    }

    const csv = serializeCsv(headers, rows);
    const filename = buildExportFilename(appState.dataset.name, appState.appliedFilters.length > 0)
      .replace(/\.csv$/, '-pivot.csv');
    downloadCsv(filename, csv);
    toast(`Pivot → ${filename} (${rows.length} baris)`, 'success');
  }

  // ─────────────────────────────────────────────────────────────
  // Subscriptions
  // ─────────────────────────────────────────────────────────────

  subscribe(() => {
    renderControls();
    autoPickDefaults();
    refresh();
  }, ['dataset']);

  subscribe(() => {
    renderControls();
    refresh();
  }, ['pivot']);

  subscribe(refresh, ['appliedFilters']);

  // Initial
  root.hidden = !appState.dataset;
  renderControls();
  if (appState.dataset) autoPickDefaults();
  refresh();
}