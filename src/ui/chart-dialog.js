import { el } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { getChartRenderer, listChartRenderers } from '../core/chart-registry.js';

/**
 * Dialog add/edit chart.
 * - bar / line: series editor (multi-series, dual axis)
 * - lainnya   : single Y (pie, scatter, heatmap, outlier, trend)
 */
export function openChartDialog({ mode = 'add', initial = null } = {}) {
  return new Promise((resolve) => {
    if (document.querySelector('.modal-backdrop')) {
      resolve(null);
      return;
    }

    const cols = appState.dataset?.columns ?? [];
    const numCols = cols.filter((c) => c.type === 'number');

    // ── Normalisasi series (backward compat) ──
    function normalizeInitialSeries(init) {
      if (!init) return [{ yColumn: '', aggregateFn: 'sum', axis: 'left' }];
      if (init.series && init.series.length) {
        return init.series.map((s) => ({
          yColumn: s.yColumn,
          aggregateFn: s.aggregateFn || 'sum',
          axis: s.axis || 'left',
        }));
      }
      if (init.yColumn) {
        return [{
          yColumn: init.yColumn,
          aggregateFn: init.aggregateFn || 'sum',
          axis: 'left',
        }];
      }
      return [{ yColumn: numCols[0]?.name || '', aggregateFn: 'sum', axis: 'left' }];
    }

    let values = {
      title: initial?.title ?? '',
      type: initial?.type ?? (appState.settings?.defaultChartType || 'bar'),
      xColumn: initial?.xColumn ?? '',
      aggregateFn: initial?.aggregateFn ?? (appState.settings?.defaultAggregateFn || 'sum'),
      valueColumn: initial?.valueColumn ?? '',
      outlierMethod: initial?.outlierMethod ?? 'iqr',
      outlierThreshold: initial?.outlierThreshold ?? null,
      movingAvgWindow: initial?.movingAvgWindow ?? 3,
      forecastPeriods: initial?.forecastPeriods ?? 5,
      series: normalizeInitialSeries(initial),
    };

    const close = (result) => {
      const b = document.querySelector('.modal-backdrop');
      if (!b) return;
      b.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => b.remove(), 220);
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };

    // ── Fields ──
    const errorEl = el('div', { class: 'form-error', hidden: true });

    const titleInput = el('input', {
      class: 'input',
      placeholder: 'e.g. Revenue by Region',
      value: values.title,
      oninput: (e) => { values.title = e.target.value; },
    });

    const typeRadios = listChartRenderers().map((r) => {
      const radio = el('input', {
        type: 'radio',
        name: 'dlg-chart-type',
        value: r.key,
        checked: values.type === r.key,
        onchange: () => {
          values.type = r.key;
          updateTypeUI();
          errorEl.hidden = true;
        },
      });
      return el('label',
        { class: 'radio', title: r.source ? `source: ${r.source}` : '' },
        radio,
        el('span', {}, r.label));
    });

    const xEmptyOption = el('option', { value: '' }, '— pilih kolom —');
    const xSelect = el(
      'select',
      { class: 'input', onchange: (e) => { values.xColumn = e.target.value; } },
      xEmptyOption,
      ...cols.map((c) =>
        el('option', { value: c.name, selected: values.xColumn === c.name }, c.name)
      )
    );

    // ── Single-Y select (pie/scatter/heatmap-y/outlier/trend) ──
    const ySelect = el(
      'select',
      { class: 'input', onchange: (e) => { values.yColumnSingle = e.target.value; } }
    );
    values.yColumnSingle = initial?.yColumn ?? (numCols[0]?.name || '');

    function rebuildYOptions() {
      const isHeatmap = values.type === 'heatmap';
      const list = isHeatmap ? cols : numCols;
      while (ySelect.options.length > 0) ySelect.remove(0);
      ySelect.append(
        el('option', { value: '' },
          isHeatmap ? '— pilih kolom kategori —' : '— pilih kolom numerik —')
      );
      for (const c of list) {
        ySelect.append(el('option',
          { value: c.name, selected: c.name === values.yColumnSingle }, c.name));
      }
      if (values.yColumnSingle && !list.some((c) => c.name === values.yColumnSingle)) {
        values.yColumnSingle = '';
        ySelect.value = '';
      }
    }

    const valueSelect = el(
      'select',
      { class: 'input', onchange: (e) => { values.valueColumn = e.target.value; } },
      el('option', { value: '' }, '— pilih kolom numerik —'),
      ...numCols.map((c) =>
        el('option', { value: c.name, selected: values.valueColumn === c.name }, c.name))
    );

    const fnSelect = el(
      'select',
      { class: 'input', onchange: (e) => { values.aggregateFn = e.target.value; } },
      ...['sum', 'avg', 'count', 'min', 'max'].map((fn) =>
        el('option', { value: fn, selected: values.aggregateFn === fn }, fn.toUpperCase()))
    );

    const outlierMethodSelect = el(
      'select',
      { class: 'input', onchange: (e) => {
        values.outlierMethod = e.target.value;
        values.outlierThreshold = null;
        outlierThresholdInput.value = '';
      } },
      el('option', { value: 'iqr', selected: values.outlierMethod === 'iqr' }, 'IQR (Tukey)'),
      el('option', { value: 'zscore', selected: values.outlierMethod === 'zscore' }, 'Z-score')
    );
    const outlierThresholdInput = el('input', {
      type: 'number', step: '0.1', min: '0', class: 'input',
      placeholder: '1.5 (IQR) / 3 (z-score)',
      value: values.outlierThreshold ?? '',
      oninput: (e) => {
        const v = e.target.value;
        values.outlierThreshold = v === '' ? null : Number(v);
      },
    });

    const maWindowInput = el('input', {
      type: 'number', min: '2', max: '50', class: 'input',
      value: values.movingAvgWindow,
      oninput: (e) => {
        const v = Number(e.target.value);
        values.movingAvgWindow = v >= 2 ? v : 3;
      },
    });
    const forecastInput = el('input', {
      type: 'number', min: '0', max: '100', class: 'input',
      value: values.forecastPeriods,
      oninput: (e) => {
        const v = Number(e.target.value);
        values.forecastPeriods = v >= 0 ? v : 5;
      },
    });

    // ── Series editor (bar/line only) ──
    const seriesRowsEl = el('div', { class: 'series-rows' });

    function renderSeriesRows() {
      seriesRowsEl.innerHTML = '';
      values.series.forEach((s, i) => {
        const yColSel = el(
          'select',
          { class: 'input', onchange: (e) => { values.series[i].yColumn = e.target.value; } },
          el('option', { value: '' }, 'Y column'),
          ...numCols.map((c) =>
            el('option', { value: c.name, selected: c.name === s.yColumn }, c.name))
        );
        const aggSel = el(
          'select',
          { class: 'input', onchange: (e) => { values.series[i].aggregateFn = e.target.value; } },
          ...['sum', 'avg', 'count', 'min', 'max'].map((fn) =>
            el('option', { value: fn, selected: fn === s.aggregateFn }, fn.toUpperCase()))
        );
        const axisSel = el(
          'select',
          { class: 'input', onchange: (e) => { values.series[i].axis = e.target.value; } },
          el('option', { value: 'left', selected: s.axis === 'left' }, 'Left'),
          el('option', { value: 'right', selected: s.axis === 'right' }, 'Right')
        );
        const delBtn = el('button',
          {
            type: 'button',
            class: 'btn btn-icon btn-sm',
            'aria-label': 'Hapus series',
            disabled: values.series.length <= 1,
            onclick: () => {
              if (values.series.length <= 1) return;
              values.series.splice(i, 1);
              renderSeriesRows();
            },
          },
          '×'
        );

        seriesRowsEl.append(
          el('div', { class: 'series-row' },
            el('span', { class: 'series-bullet' }, String(i + 1)),
            yColSel, aggSel, axisSel, delBtn
          )
        );
      });
    }

    const addSeriesBtn = el(
      'button',
      {
        type: 'button',
        class: 'btn btn-sm',
        onclick: () => {
          values.series.push({ yColumn: '', aggregateFn: 'sum', axis: 'left' });
          renderSeriesRows();
        },
      },
      '+ Add Series'
    );

    const seriesSection = el(
      'div',
      { class: 'form-series-section' },
      el('div', { class: 'form-label' }, 'Series (Y)'),
      seriesRowsEl,
      addSeriesBtn
    );

    // ── Labels yang berubah ──
    const xLabelText = el('span', { class: 'form-label' }, 'X-Axis');
    const yLabelText = el('span', { class: 'form-label' }, 'Y-Axis');

    const valueRow = el('label', { class: 'form-row' },
      el('span', { class: 'form-label' }, 'Value Column'), valueSelect);

    const ySingleRow = el('label', { class: 'form-row' }, yLabelText, ySelect);

    const aggregateRow = el('label', { class: 'form-row' },
      el('span', { class: 'form-label' }, 'Aggregate'), fnSelect);

    const outlierFieldsWrap = el('div', { class: 'form-outlier-fields' },
      el('label', { class: 'form-row' },
        el('span', { class: 'form-label' }, 'Outlier Method'), outlierMethodSelect),
      el('label', { class: 'form-row' },
        el('span', { class: 'form-label' }, 'Threshold (kosongkan = default)'),
        outlierThresholdInput)
    );

    const trendFieldsWrap = el('div', { class: 'form-outlier-fields' },
      el('label', { class: 'form-row' },
        el('span', { class: 'form-label' }, 'Moving Avg Window (≥2)'), maWindowInput),
      el('label', { class: 'form-row' },
        el('span', { class: 'form-label' }, 'Forecast Periods'), forecastInput)
    );

    function isMultiType() {
      return values.type === 'bar' || values.type === 'line';
    }

    function updateTypeUI() {
      const isOutlier = values.type === 'outlier';
      const isHeatmap = values.type === 'heatmap';
      const isTrend = values.type === 'trend';
      const isMulti = isMultiType();

      xLabelText.textContent = isOutlier
        ? 'X-Axis (optional)'
        : isHeatmap ? 'X-Axis (kategori)'
        : isTrend ? 'X-Axis (waktu / numerik)'
        : 'X-Axis';
      yLabelText.textContent = isOutlier ? 'Column to analyze'
        : isHeatmap ? 'Y-Axis (kategori)' : 'Y-Axis';

      xEmptyOption.textContent = isOutlier ? '— Row index (default) —' : '— pilih kolom —';

      rebuildYOptions();

      // Bar/line → series editor. Lainnya → single Y + aggregate.
      seriesSection.hidden = !isMulti;
      ySingleRow.hidden = isMulti;
      aggregateRow.hidden = isOutlier || isMulti; // heatmap butuh aggregate, tapi tidak pakai ySingle (ySingle dipakai untuk kategori)
      // khusus heatmap: ySingle tampil (kategori), aggregate tampil (fn)
      if (isHeatmap) {
        ySingleRow.hidden = false;
        aggregateRow.hidden = false;
      }

      valueRow.hidden = !isHeatmap;
      outlierFieldsWrap.hidden = !isOutlier;
      trendFieldsWrap.hidden = !isTrend;

      if (isMulti) renderSeriesRows();
    }

    // ── Validate & submit ──
    function validate() {
      if (!values.title.trim()) return 'Title wajib diisi.';
      if (!getChartRenderer(values.type)) return 'Chart type tidak dikenal.';

      if (values.type === 'outlier') {
        if (!values.yColumnSingle) return 'Pilih kolom numerik untuk analisis outlier.';
      } else if (values.type === 'heatmap') {
        if (!values.xColumn) return 'X-Axis (kategori) wajib dipilih.';
        if (!values.yColumnSingle) return 'Y-Axis (kategori) wajib dipilih.';
        if (!values.valueColumn) return 'Value Column wajib dipilih (numerik).';
      } else if (values.type === 'trend') {
        if (!values.xColumn) return 'X-Axis (waktu) wajib dipilih.';
        if (!values.yColumnSingle) return 'Y-Axis (numerik) wajib dipilih.';
      } else if (isMultiType()) {
        if (!values.xColumn) return 'X-Axis wajib dipilih.';
        const validSeries = values.series.filter((s) => s.yColumn);
        if (!validSeries.length) return 'Minimal 1 series dengan kolom Y.';
      } else {
        if (!values.xColumn) return 'X-Axis wajib dipilih.';
        if (!values.yColumnSingle) return 'Y-Axis wajib dipilih (kolom numerik).';
      }
      return null;
    }

    function submit() {
      const err = validate();
      if (err) { errorEl.textContent = err; errorEl.hidden = false; return; }

      const base = {
        ...(initial?.id ? { id: initial.id } : {}),
        title: values.title.trim(),
        type: values.type,
      };

      if (values.type === 'outlier') {
        close({
          ...base,
          xColumn: values.xColumn || null,
          yColumn: values.yColumnSingle,
          aggregateFn: null,
          outlierMethod: values.outlierMethod,
          outlierThreshold: values.outlierThreshold,
        });
        return;
      }

      if (values.type === 'heatmap') {
        close({
          ...base,
          xColumn: values.xColumn,
          yColumn: values.yColumnSingle,
          valueColumn: values.valueColumn,
          aggregateFn: values.aggregateFn,
        });
        return;
      }

      if (values.type === 'trend') {
        close({
          ...base,
          xColumn: values.xColumn,
          yColumn: values.yColumnSingle,
          aggregateFn: values.aggregateFn,
          movingAvgWindow: values.movingAvgWindow,
          forecastPeriods: values.forecastPeriods,
        });
        return;
      }

      if (isMultiType()) {
        const validSeries = values.series.filter((s) => s.yColumn);
        close({
          ...base,
          xColumn: values.xColumn,
          series: validSeries.map((s) => ({
            yColumn: s.yColumn,
            aggregateFn: s.aggregateFn,
            axis: s.axis,
          })),
          // Backward compat: kalau hanya 1 series & left, tetap isi yColumn
          yColumn: validSeries.length === 1 ? validSeries[0].yColumn : undefined,
          aggregateFn: validSeries.length === 1 ? validSeries[0].aggregateFn : undefined,
        });
        return;
      }

      close({
        ...base,
        xColumn: values.xColumn,
        yColumn: values.yColumnSingle,
        aggregateFn: values.aggregateFn,
      });
    }

    const form = el(
      'form',
      { class: 'chart-dialog-form', onsubmit: (e) => { e.preventDefault(); submit(); } },
      el('label', { class: 'form-row' },
        el('span', { class: 'form-label' }, 'Title'), titleInput),
      el('fieldset', { class: 'form-fieldset' },
        el('legend', { class: 'form-label' }, 'Chart Type'),
        el('div', { class: 'radio-group' }, ...typeRadios)),
      el('label', { class: 'form-row' }, xLabelText, xSelect),
      ySingleRow,
      valueRow,
      aggregateRow,
      seriesSection,
      outlierFieldsWrap,
      trendFieldsWrap,
      errorEl
    );

    const backdrop = el(
      'div',
      { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(null); } },
      el('div',
        {
          class: 'modal modal-wide', role: 'dialog', 'aria-modal': 'true',
          'aria-label': mode === 'add' ? 'Add Chart' : 'Edit Chart',
        },
        el('div', { class: 'modal-header' },
          el('h2', {}, mode === 'add' ? 'Tambah Chart' : 'Edit Chart'),
          el('button', { class: 'btn btn-icon', 'aria-label': 'Close', onclick: () => close(null) }, '×')),
        el('div', { class: 'modal-body' }, form),
        el('div', { class: 'modal-footer' },
          el('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          el('button', { class: 'btn btn-primary', type: 'button', onclick: submit },
            mode === 'add' ? 'Add Chart' : 'Save'))
      )
    );

    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    updateTypeUI();
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      titleInput.focus();
    });
  });
}