import { el, clear } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { subscribe } from '../state/state-events.js';
import { analyzer } from '../config.js';
import { formatNumber } from '../utils/formatters.js';
import { logger } from '../utils/logger.js';
import { openOutlierDialog } from './outlier-dialog.js';
import { openTrendDialog } from './trend-dialog.js';


const TYPE_LABEL = { number: '#', string: 'T', date: 'D', boolean: 'B' };

export function renderStatsPanel(root) {
  root.classList.add('panel', 'panel-stats');

  const header = el(
    'div',
    { class: 'panel-header' },
    el('h2', { class: 'panel-title' }, 'Statistics'),
    el('span', { class: 'panel-meta', id: 'stats-meta' }, '')
  );
  const body = el('div', { class: 'stats-body' });
  root.append(header, body);

  let requestId = 0;

  async function refresh() {
    if (!appState.dataset) {
      clear(body);
      root.hidden = true;
      return;
    }
    root.hidden = false;

    const myId = ++requestId;
    const ds = appState.dataset;
    const results = await Promise.all(
      ds.columns.map(async (col) => {
        try {
          const stats = await analyzer.describeColumn(col.name, appState.appliedFilters);
          return { col, stats };
        } catch (err) {
          logger.error('describeColumn failed', col.name, err);
          return { col, stats: null };
        }
      })
    );
    if (myId !== requestId) return;

    clear(body);

    const meta = root.querySelector('#stats-meta');
    if (meta) {
      meta.textContent = appState.appliedFilters.length > 0
        ? `${appState.appliedFilters.length} filter aktif`
        : `${ds.rowCount} baris`;
    }

    if (!results.length) {
      body.append(el('div', { class: 'stat-muted' }, 'Dataset tidak memiliki kolom.'));
      return;
    }

    for (const { col, stats } of results) {
      body.append(renderCard(col, stats));
    }
  }

  function renderCard(col, stats) {
    const head = el(
      'div',
      { class: 'stat-card-head' },
      el('span', { class: 'stat-card-title', title: col.name }, col.name),
      el('span', { class: `type-badge type-${col.type}`, title: col.type }, TYPE_LABEL[col.type] ?? 'T')
    );

    if (!stats) {
      return el('div', { class: 'stat-card' }, head,
        el('div', { class: 'stat-muted' }, 'Gagal hitung statistik'));
    }

    const rows = [
      statRow('Count', stats.count),
      statRow('Distinct', stats.distinct),
    ];

    if (col.type === 'number') {
      rows.push(statRow('Min', stats.min, true));
      rows.push(statRow('Max', stats.max, true));
      rows.push(statRow('Mean', stats.mean, true));
      rows.push(statRow('Median', stats.median, true));
      rows.push(statRow('Std Dev', stats.stdDev, true));
      rows.push(statRow('Q1', stats.q1, true));
      rows.push(statRow('Q3', stats.q3, true));
      rows.push(statRow('IQR', stats.iqr, true));

      if (stats.outlierCount !== null && stats.outlierCount !== undefined) {
        rows.push(
          el(
            'div',
            { class: 'stat-row stat-row-outliers' },
            el('span', { class: 'stat-label' }, 'Outliers'),
            el(
              'button',
              {
                class: 'link-btn',
                title: stats.outlierBounds
                  ? `Bounds: [${fmt(stats.outlierBounds.lower)} – ${fmt(stats.outlierBounds.upper)}] (IQR ×1.5)`
                  : '',
                onclick: () => openOutlierDialog(col.name),
              },
              `${stats.outlierCount} →`
            )
          )
        );
      }
    }
        if (col.type === 'date' && appState.dataset) {
      const numCols = appState.dataset.columns.filter((c) => c.type === 'number');
      if (numCols.length > 0) {
        rows.push(
          el('div', { class: 'stat-row' },
            el('span', { class: 'stat-label' }, 'Trend'),
            el('button', {
              class: 'link-btn',
              title: 'Buka analisis trend kolom ini vs kolom numerik',
              onclick: () => openTrendDialog(col.name, numCols[0].name),
            }, 'View →')
          )
        );
      }
    }

    return el('div', { class: 'stat-card' }, head, el('div', { class: 'stat-rows' }, ...rows));
  }

  function statRow(label, value, asFloat = false) {
    let display;
    if (value === null || value === undefined) display = '—';
    else if (typeof value === 'number') {
      display = asFloat && !Number.isInteger(value)
        ? value.toLocaleString('id-ID', { maximumFractionDigits: 2 })
        : formatNumber(value);
    } else display = String(value);

    return el(
      'div',
      { class: 'stat-row' },
      el('span', { class: 'stat-label' }, label),
      el('span', { class: 'stat-value' }, display)
    );
  }

  function fmt(v) {
    if (typeof v !== 'number') return '—';
    return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  }

  subscribe(refresh, ['dataset', 'appliedFilters']);
  refresh();
}