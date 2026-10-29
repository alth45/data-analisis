import { el } from '../utils/dom.js';
import { cleanDataset, DEFAULT_CLEAN_OPTIONS } from '../core/data-cleaner.js';

const ACTION_LABELS = {
  nullify: 'Null detection',
  'number-normalize': 'Number normalization',
  'date-normalize': 'Date normalization',
  'type-coerce': 'Type coercion',
  interpolate: 'Interpolation',
  'sort-by-date': 'Sort by date',
  'drop-empty-rows': 'Drop empty rows',
  'drop-duplicates': 'Drop duplicates',
};

/**
 * Buka dialog review cleaning. Return Promise<{ dataset, report }>.
 * User pilih "Apply Cleaned" atau "Use Raw".
 *
 * @param {object} rawDataset
 * @param {{ dataset: object, report: object }} initialCleaned
 */
export function openCleanDialog(rawDataset, initialCleaned) {
  return new Promise((resolve) => {
    if (document.querySelector('.modal-backdrop')) {
      resolve({ dataset: initialCleaned.dataset, report: initialCleaned.report });
      return;
    }

    let opts = { ...DEFAULT_CLEAN_OPTIONS, ...initialCleaned.report.opts };
    let current = initialCleaned;

    const close = (result) => {
      const b = document.querySelector('.modal-backdrop');
      if (!b) return;
      b.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => b.remove(), 220);
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };

    // ---- Options ----
    const optsList = el('div', { class: 'clean-opts' });
    const interpSelect = el(
      'select',
      {
        class: 'input',
        onchange: (e) => { opts = { ...opts, defaultNumericInterp: e.target.value }; rerun(); },
      },
      ...[
        ['linear', 'Linear'],
        ['mean', 'Mean'],
        ['median', 'Median'],
        ['ffill', 'Forward fill'],
        ['bfill', 'Backward fill'],
      ].map(([v, l]) =>
        el('option', { value: v, selected: opts.defaultNumericInterp === v }, l)
      )
    );

    const toggleOpts = [
      ['trim', 'Trim & strip control chars'],
      ['coerceNulls', 'Detect null sentinels (N/A, null, -, …)'],
      ['normalizeNumbers', 'Normalize numbers (Rp, $, thousand sep)'],
      ['normalizeDates', 'Normalize dates → YYYY-MM-DD'],
      ['interpolate', 'Interpolate missing numerics'],
      ['sortByDate', 'Sort by date (time-series)'],
      ['dropEmptyRows', 'Drop rows where all values null'],
      ['dropDuplicateRows', 'Drop duplicate rows'],
    ];

    toggleOpts.forEach(([key, label]) => {
      optsList.append(
        el(
          'label',
          { class: 'clean-opt' },
          el('input', {
            type: 'checkbox',
            checked: !!opts[key],
            onchange: (e) => { opts = { ...opts, [key]: e.target.checked }; rerun(); },
          }),
          el('span', {}, label)
        )
      );
    });

    optsList.append(
      el(
        'label',
        { class: 'clean-opt clean-opt-inline' },
        el('span', {}, 'Interpolation method:'),
        interpSelect
      )
    );

    // ---- Report ----
    const summaryEl = el('div', { class: 'clean-summary' });
    const actionsEl = el('div', { class: 'clean-actions-list' });
    const warningsEl = el('div', { class: 'clean-warnings' });
    const previewEl = el('div', { class: 'clean-preview' });

    function rerun() {
      current = cleanDataset(rawDataset, opts);
      refreshUI();
    }

    function refreshUI() {
      const r = current.report;

      // Summary
      summaryEl.innerHTML = '';
      summaryEl.append(
        el('div', { class: 'clean-summary-row' },
          el('span', {}, 'Rows'),
          el('span', { class: 'clean-summary-val' },
            `${r.before.rowCount} → ${r.after.rowCount}`)
        ),
        el('div', { class: 'clean-summary-row' },
          el('span', {}, 'Null cells'),
          el('span', { class: 'clean-summary-val' },
            `${r.before.totalNull} → ${r.after.totalNull}`)
        ),
        el('div', { class: 'clean-summary-row' },
          el('span', {}, 'Changes'),
          el('span', { class: 'clean-summary-val' },
            `${r.actions.length} action${r.actions.length === 1 ? '' : 's'}`)
        )
      );

      // Actions
      actionsEl.innerHTML = '';
      if (r.actions.length === 0) {
        actionsEl.append(el('div', { class: 'clean-empty' }, 'Dataset sudah bersih.'));
      } else {
        r.actions.forEach((a) => {
          const label = ACTION_LABELS[a.type] || a.type;
          const detail = a.column
            ? `[${a.column}]${a.method ? ` via ${a.method}` : ''} — ${a.count || ''}`
            : `— ${a.count || ''}`;
          actionsEl.append(
            el('div', { class: 'clean-action-row' },
              el('span', { class: 'clean-action-type' }, label),
              el('span', { class: 'clean-action-detail' }, detail)
            )
          );
        });
      }

      // Warnings
      warningsEl.innerHTML = '';
      r.warnings.forEach((w) => {
        warningsEl.append(
          el('div', { class: 'clean-warning' }, `⚠ [${w.column}] ${w.message}`)
        );
      });

      // Diff preview — 5 baris
      previewEl.innerHTML = '';
      const preview = Math.min(5, rawDataset.rows.length);
      const cols = rawDataset.columns;
      const table = el('table', { class: 'clean-diff' });
      const thead = el('thead');
      const trh = el('tr');
      trh.append(el('th', {}, '#'));
      cols.forEach((c) => trh.append(el('th', {}, c.name)));
      thead.append(trh);
      table.append(thead);

      const tbody = el('tbody');
      for (let i = 0; i < preview; i++) {
        const tr = el('tr');
        tr.append(el('td', { class: 'clean-diff-row-num' }, String(i + 1)));
        for (let ci = 0; ci < cols.length; ci++) {
          const before = rawDataset.rows[i][ci];
          const after = current.dataset.rows[i]?.[ci] ?? null;
          const changed = String(before) !== String(after);
          const cellText = after === null ? '∅' : String(after);
          tr.append(
            el('td',
              { class: changed ? 'clean-diff-changed' : '', title: changed ? `was: ${before ?? '∅'}` : '' },
              cellText
            )
          );
        }
        tbody.append(tr);
      }
      table.append(tbody);
      previewEl.append(table);
    }

    // ---- Layout ----
    const body = el(
      'div',
      { class: 'modal-body clean-body' },
      el('div', { class: 'clean-grid' },
        el('section', { class: 'clean-pane' },
          el('h3', { class: 'clean-pane-title' }, 'Options'),
          optsList
        ),
        el('section', { class: 'clean-pane' },
          el('h3', { class: 'clean-pane-title' }, 'Report'),
          summaryEl,
          actionsEl,
          warningsEl
        )
      ),
      el('section', { class: 'clean-preview-section' },
        el('h3', { class: 'clean-pane-title' }, 'Preview (first 5 rows · hijau = berubah)'),
        previewEl
      )
    );

    const applyBtn = el(
      'button',
      { class: 'btn btn-primary', onclick: () => close({ dataset: current.dataset, report: current.report, accepted: true }) },
      'Apply Cleaned Data'
    );
    const rawBtn = el(
      'button',
      { class: 'btn', onclick: () => close({ dataset: rawDataset, report: current.report, accepted: false }) },
      'Use Raw'
    );

    const backdrop = el(
      'div',
      {
        class: 'modal-backdrop',
        onclick: (e) => { if (e.target === backdrop) close(null); },
      },
      el(
        'div',
        { class: 'modal modal-wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Data Cleaning' },
        el(
          'div',
          { class: 'modal-header' },
          el('h2', {}, 'Data Cleaning'),
          el('button', { class: 'btn btn-icon', 'aria-label': 'Close', onclick: () => close(null) }, '×')
        ),
        body,
        el('div', { class: 'modal-footer' }, rawBtn, applyBtn)
      )
    );

    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => backdrop.classList.add('is-open'));

    refreshUI();
  });
}