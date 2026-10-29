import { el, clear } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { setState, subscribe } from '../state/state-events.js';

const OPERATORS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains'];
const FN_LIST = ['sum', 'avg', 'count', 'min', 'max'];
const CHART_TYPES = ['bar', 'line', 'pie', 'scatter', 'table'];

/** Dropdown dipakai kalau distinct value kolom ≤ threshold ini. */
const DROPDOWN_THRESHOLD = 100;

/** Cache per kolom — diinvalidasi saat dataset berubah. */
let distinctCache = {};

/**
 * Ambil nilai unik dari dataset (sync, in-memory).
 * Mengembalikan { values: raw[], truncated: boolean, total: number }.
 */
function getDistinctValues(columnName, limit = DROPDOWN_THRESHOLD) {
  const ds = appState.dataset;
  if (!ds) return { values: [], truncated: false, total: 0 };
  const idx = ds.columns.findIndex((c) => c.name === columnName);
  if (idx === -1) return { values: [], truncated: false, total: 0 };

  const cacheKey = `${columnName}::${limit}`;
  if (distinctCache[cacheKey]) return distinctCache[cacheKey];

  const seen = new Set();
  const values = [];
  for (const row of ds.rows) {
    const v = row[idx];
    if (v === null || v === undefined || v === '') continue;
    const key = String(v);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(v);
  }

  // Sort: numerik jika semua bisa di-parse, jika tidak lexicographic.
  values.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });

  const result = {
    values: values.slice(0, limit),
    truncated: values.length > limit,
    total: values.length,
  };
  distinctCache[cacheKey] = result;
  return result;
}

/** Tentukan mode control: 'dropdown' atau 'input'. */
function getValueMode(operator, columnName) {
  if (operator !== 'eq' && operator !== 'neq') return 'input';
  const { total } = getDistinctValues(columnName, DROPDOWN_THRESHOLD + 1);
  return total > 0 && total <= DROPDOWN_THRESHOLD ? 'dropdown' : 'input';
}

export function renderToolsPanel(root) {
  root.classList.add('panel', 'panel-tools');

  const header = el(
    'div',
    { class: 'panel-header' },
    el('h2', { class: 'panel-title' }, 'Tools'),
    el('span', { class: 'badge' }, 'Fase 2')
  );
  const body = el('div', { class: 'tools-body' });
  root.append(header, body);

  let filterListEl = null;
  let lastFilterCount = -1;
  /** Index baris yang perlu di-focus setelah re-render berikutnya. */
  let pendingFocusRow = -1;

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  function validDraft() {
    return appState.filters.filter(
      (f) => f.value !== '' && f.value !== undefined && f.value !== null
    );
  }

  function applyAnalysis() {
    setState({ appliedFilters: validDraft(), tablePage: 0 });
  }

  function resetAll() {
    setState({ filters: [], appliedFilters: [], tablePage: 0 });
  }

  function isDirty() {
    return JSON.stringify(validDraft()) !== JSON.stringify(appState.appliedFilters);
  }

  function refreshApplyButton() {
    const btn = body.querySelector('.btn-apply');
    const hint = body.querySelector('.apply-hint');
    if (!btn) return;
    const dirty = isDirty();
    btn.disabled = !dirty;
    btn.title = dirty ? 'Terapkan filter ke tabel & chart' : 'Tidak ada perubahan';
    btn.setAttribute('aria-disabled', String(!dirty));
    if (hint) {
      const n = appState.appliedFilters.length;
      hint.textContent = dirty
        ? 'Ada perubahan belum diterapkan'
        : n > 0
        ? `${n} filter aktif`
        : 'Belum ada filter aktif';
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Value control — dropdown untuk kategorikal, input untuk kontinu
  // ─────────────────────────────────────────────────────────────

  function renderValueControl(i, f, cols) {
    const colMeta = cols.find((c) => c.name === f.column);
    if (!colMeta) {
      return el('input', { class: 'input input-value', disabled: true });
    }

    const mode = getValueMode(f.operator, f.column);
    const currentVal = f.value ?? '';

    if (mode === 'dropdown') {
      const { values } = getDistinctValues(f.column);
      const hasCurrent = values.some((v) => String(v) === String(currentVal));

      const options = [el('option', { value: '' }, '— pilih —')];
      values.forEach((v) => {
        options.push(
          el(
            'option',
            {
              value: String(v),
              selected: String(v) === String(currentVal),
            },
            String(v)
          )
        );
      });
      // Carry-over: value lama yang tidak ada di distinct list (mis. hasil
      // ganti operator/kolom) tetap tampil supaya tidak "hilang diam-diam".
      if (currentVal !== '' && !hasCurrent) {
        options.push(
          el(
            'option',
            { value: String(currentVal), selected: true },
            String(currentVal)
          )
        );
      }

      return el(
        'select',
        {
          class: 'input input-value',
          'aria-label': `Value untuk ${f.column}`,
          title: `${values.length} nilai unik`,
          onchange: (e) => updateFilter(i, { value: e.target.value }),
        },
        ...options
      );
    }

    return el('input', {
      class: 'input input-value',
      'aria-label': `Value untuk ${f.column}`,
      placeholder: 'value',
      value: currentVal,
      oninput: (e) => updateFilter(i, { value: e.target.value }),
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Filter list
  // ─────────────────────────────────────────────────────────────

  function renderFilterList() {
    if (!filterListEl) return;
    clear(filterListEl);
    const cols = appState.dataset?.columns ?? [];
    lastFilterCount = appState.filters.length;

    const focusRow = pendingFocusRow;
    pendingFocusRow = -1;

    appState.filters.forEach((f, i) => {
      const valueControl = renderValueControl(i, f, cols);

      const row = el(
        'div',
        { class: 'filter-row' },
        el(
          'select',
          {
            class: 'input',
            'aria-label': 'Kolom',
            onchange: (e) => {
              const newCol = e.target.value;
              pendingFocusRow = i;
              updateFilter(i, { column: newCol, value: '' });
              // Mode bisa berubah (dropdown ↔ input) → re-render list.
              renderFilterList();
            },
          },
          ...cols.map((c) =>
            el('option', { value: c.name, selected: c.name === f.column }, c.name)
          )
        ),
        el(
          'select',
          {
            class: 'input',
            'aria-label': 'Operator',
            onchange: (e) => {
              const newOp = e.target.value;
              const oldMode = getValueMode(f.operator, f.column);
              const newMode = getValueMode(newOp, f.column);
              updateFilter(i, { operator: newOp });
              if (oldMode !== newMode) {
                pendingFocusRow = i;
                renderFilterList();
              }
            },
          },
          ...OPERATORS.map((op) =>
            el('option', { value: op, selected: op === f.operator }, op)
          )
        ),
        valueControl,
        el(
          'button',
          {
            class: 'btn btn-icon',
            'aria-label': 'Hapus filter',
            onclick: () => {
              setState({
                filters: appState.filters.filter((_, idx) => idx !== i),
              });
            },
          },
          '×'
        )
      );

      filterListEl.append(row);

      if (i === focusRow && valueControl) {
        setTimeout(() => valueControl.focus(), 0);
      }
    });
  }

  function updateFilter(i, patch) {
    const filters = appState.filters.map((f, idx) =>
      idx === i ? { ...f, ...patch } : f
    );
    setState({ filters });
  }

  // ─────────────────────────────────────────────────────────────
  // Full render
  // ─────────────────────────────────────────────────────────────

  function render() {
    clear(body);
    const cols = appState.dataset?.columns ?? [];
    const numCols = cols.filter((c) => c.type === 'number');

    // ---- FILTER ----
    filterListEl = el('div', { class: 'filter-list' });
    body.append(
      el(
        'section',
        { class: 'tool-section' },
        el(
          'div',
          { class: 'tool-title-row' },
          el('h3', { class: 'tool-title' }, 'Filter'),
          el(
            'button',
            {
              class: 'link-btn',
              onclick: () => {
                if (appState.filters.length) setState({ filters: [] });
              },
            },
            'Clear'
          )
        ),
        filterListEl,
        el(
          'button',
          {
            class: 'btn btn-sm',
            onclick: () => {
              if (!cols.length) return;
              // Default: kolom string pertama, supaya dropdown langsung berisi.
              const defaultCol =
                cols.find((c) => c.type === 'string')?.name ?? cols[0].name;
              pendingFocusRow = appState.filters.length;
              setState({
                filters: [
                  ...appState.filters,
                  { column: defaultCol, operator: 'eq', value: '' },
                ],
              });
              // Subscription akan renderFilterList (length berubah),
              // pendingFocusRow akan dipakai untuk auto-focus.
            },
          },
          '+ Tambah filter'
        )
      )
    );
    renderFilterList();

    // ---- AGGREGATE ----
    body.append(
      el(
        'section',
        { class: 'tool-section' },
        el('h3', { class: 'tool-title' }, 'Aggregate'),
        el(
          'div',
          { class: 'tool-field' },
          el('label', {}, 'X-Axis'),
          el(
            'select',
            {
              class: 'input',
              onchange: (e) => setState({ xAxis: e.target.value || null }),
            },
            el('option', { value: '' }, '— pilih kolom —'),
            ...cols.map((c) =>
              el('option', { value: c.name, selected: appState.xAxis === c.name }, c.name)
            )
          )
        ),
        el(
          'div',
          { class: 'tool-field' },
          el('label', {}, 'Y-Axis'),
          el(
            'select',
            {
              class: 'input',
              onchange: (e) => setState({ yAxis: e.target.value || null }),
            },
            el('option', { value: '' }, '— pilih kolom —'),
            ...numCols.map((c) =>
              el('option', { value: c.name, selected: appState.yAxis === c.name }, c.name)
            )
          )
        ),
        el(
          'div',
          { class: 'tool-field' },
          el('label', {}, 'Function'),
          el(
            'select',
            { class: 'input', onchange: (e) => setState({ aggregateFn: e.target.value }) },
            ...FN_LIST.map((fn) =>
              el('option', { value: fn, selected: appState.aggregateFn === fn }, fn.toUpperCase())
            )
          )
        )
      )
    );

    // ---- CHART TYPE ----
    body.append(
      el(
        'section',
        { class: 'tool-section' },
        el('h3', { class: 'tool-title' }, 'Chart Type'),
        el(
          'div',
          { class: 'radio-group' },
          ...CHART_TYPES.map((t) =>
            el(
              'label',
              { class: 'radio' },
              el('input', {
                type: 'radio',
                name: 'chartType',
                value: t,
                checked: appState.chartType === t,
                onchange: () => setState({ chartType: t }),
              }),
              el('span', {}, t.charAt(0).toUpperCase() + t.slice(1))
            )
          )
        )
      )
    );

    // ---- APPLY + RESET ----
    body.append(
      el(
        'div',
        { class: 'tool-apply' },
        el(
          'button',
          { class: 'btn btn-primary btn-block btn-apply', onclick: applyAnalysis },
          'Apply Analysis'
        ),
        el('div', { class: 'hint apply-hint' }, ''),
        el(
          'button',
          {
            class: 'btn btn-sm btn-block btn-reset',
            onclick: resetAll,
            style: { marginTop: '6px' },
          },
          'Reset'
        )
      )
    );

    lastFilterCount = appState.filters.length;
    refreshApplyButton();
  }

  function syncChartTypeRadios() {
    body.querySelectorAll('input[name="chartType"]').forEach((r) => {
      r.checked = r.value === appState.chartType;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Subscriptions
  // ─────────────────────────────────────────────────────────────

  // Dataset berubah → invalidate cache distinct value → full render.
  subscribe(() => {
    distinctCache = {};
    render();
  }, ['dataset']);

  // Chart type berubah (mis. dari chip chart panel) → sync radio saja.
  subscribe(syncChartTypeRadios, ['chartType']);

  // Jumlah filter berubah → rebuild list. Isi filter berubah → hanya update
  // tombol Apply (input tetap fokus).
  subscribe(() => {
    if (appState.filters.length !== lastFilterCount) {
      renderFilterList();
    }
    refreshApplyButton();
  }, ['filters', 'appliedFilters']);

  // Axis/fungsi berubah → sync dropdown (tidak full render supaya nilai
  // filter yang belum di-apply tidak hilang).
  subscribe(render, ['xAxis', 'yAxis', 'aggregateFn']);

  subscribe((state) => {
    root.dataset.active = state.activePanel === 'tools' ? 'true' : 'false';
  }, ['activePanel']);

  render();
}