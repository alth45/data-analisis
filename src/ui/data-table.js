import { el, clear } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { setState, subscribe } from '../state/state-events.js';
import { analyzer } from '../config.js';
import { formatCell } from '../utils/formatters.js';
import { logger } from '../utils/logger.js';
import { createPanelHeader } from './panel-header.js';

export function renderDataTable(root) {
  root.classList.add('panel', 'panel-table');

  const header = createPanelHeader({
    title: 'Data Preview',
    panelId: 'table',
    right: [el('span', { class: 'panel-meta', id: 'table-meta' }, '')],
  });

  const body = el('div', { class: 'table-wrap' });
  const tableEl = el('table', { class: 'data-table' });
  body.append(tableEl);
  const pager = el('div', { class: 'table-pager' });
  root.append(header, body, pager);

  async function refresh() {
    if (!appState.dataset) {
      root.hidden = true;
      return;
    }
    root.hidden = false;

    const ds = appState.dataset;
    const { tablePage, tablePageSize, sortColumn, sortDirection } = appState;

    clear(tableEl);

    // THEAD
    const thead = el('thead');
    const trh = el('tr');
    ds.columns.forEach((col) => {
      const th = el(
        'th',
        {
          scope: 'col',
          class: `col-type-${col.type}`,
          'data-col': col.name,
          tabindex: '0',
          onclick: () => handleSort(col.name),
          onkeydown: (e) => {
            if (e.key === 'Enter') handleSort(col.name);
          },
        },
        el('span', { class: 'col-name' }, col.name),
        el('span', { class: 'col-type', title: col.type }, typeTag(col.type)),
        sortColumn === col.name
          ? el('span', { class: 'sort-arrow' }, sortDirection === 'asc' ? '▲' : '▼')
          : null
      );
      trh.append(th);
    });
    thead.append(trh);
    tableEl.append(thead);

    // TBODY — pakai appliedFilters
    const offset = tablePage * tablePageSize;
    let rows = [];
    let filteredTotal = 0;
    try {
      const res = await analyzer.filterAndPaginate(
        appState.appliedFilters,
        tablePageSize,
        offset
      );
      rows = res.rows;
      filteredTotal = res.total;
    } catch (err) {
      logger.error('filterAndPaginate failed', err);
    }

    const tbody = el('tbody');
    if (!rows.length) {
      tbody.append(
        el('tr', {},
          el('td', { colspan: ds.columns.length, class: 'empty-cell' },
            'Tidak ada data untuk filter ini.'
          )
        )
      );
    } else {
      rows.forEach((row) => {
        const tr = el('tr');
        row.forEach((cell, i) => {
          const type = ds.columns[i]?.type ?? 'string';
          const text = formatCell(cell, type);
          tr.append(
            el(
              'td',
              { class: `cell cell-${type}`, title: String(cell ?? '') },
              text
            )
          );
        });
        tbody.append(tr);
      });
    }
    tableEl.append(tbody);

    // PAGINATION — pakai filteredTotal
    const total = filteredTotal;
    const start = total === 0 ? 0 : Math.min(offset + 1, total);
    const end = Math.min(offset + rows.length, total);
    clear(pager);
    pager.append(
      el(
        'button',
        {
          class: 'btn btn-sm',
          disabled: tablePage <= 0,
          onclick: () => setState({ tablePage: tablePage - 1 }),
        },
        '◀ Prev'
      ),
      el('span', { class: 'pager-info' }, `${start}–${end} dari ${total} baris`),
      el(
        'button',
        {
          class: 'btn btn-sm',
          disabled: end >= total,
          onclick: () => setState({ tablePage: tablePage + 1 }),
        },
        'Next ▶'
      )
    );

    // META
    const meta = root.querySelector('#table-meta');
    if (meta) {
      const filtered = appState.appliedFilters.length > 0;
      meta.textContent = filtered
        ? `${filteredTotal} dari ${ds.rowCount} baris (ter-filter) · ${ds.columns.length} kolom`
        : `${filteredTotal} baris · ${ds.columns.length} kolom`;
    }
  }

  function typeTag(type) {
    return { number: '#', date: 'D', boolean: 'B', string: 'T' }[type] ?? 'T';
  }

  function handleSort(col) {
    const { sortColumn, sortDirection } = appState;
    if (sortColumn === col) {
      const next = sortDirection === 'asc' ? 'desc' : sortDirection === 'desc' ? null : 'asc';
      setState({ sortColumn: next ? col : null, sortDirection: next });
    } else {
      setState({ sortColumn: col, sortDirection: 'asc' });
    }
  }

  subscribe(refresh, [
    'dataset',
    'tablePage',
    'sortColumn',
    'sortDirection',
    'appliedFilters',
  ]);
  refresh();
}