import { el, clear } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { subscribe } from '../state/state-events.js';
import { openModal } from './modal.js';
import { APP_CONFIG } from '../config.js';

export function renderStatusBar(root) {
  root.classList.add('status-bar');
  const left = el('div', { class: 'status-left' });
  const center = el('div', { class: 'status-center' });
  const right = el(
    'div',
    { class: 'status-right' },
    el('span', { class: 'status-engine', id: 'engine-status' }, ''),
    el('span', {}, `v${APP_CONFIG.version}`),
    el('button', { class: 'link-btn', onclick: () => openModal('docs') }, 'Docs')
  );
  root.append(left, center, right);

  function updateLeft() {
    clear(left);
    const ds = appState.dataset;
    if (!ds) {
      left.append(el('span', {}, 'Belum ada dataset'));
      return;
    }
    left.append(
      el('span', { class: 'status-item' }, ds.name),
      el('span', { class: 'status-sep' }, '·'),
      el('span', { class: 'status-item' }, `${ds.rowCount} baris`),
      el('span', { class: 'status-sep' }, '·'),
      el('span', { class: 'status-item' }, `${ds.columns.length} kolom`)
    );
    if (appState.appliedFilters.length > 0) {
      left.append(
        el('span', { class: 'status-sep' }, '·'),
        el(
          'span',
          { class: 'status-badge' },
          `${appState.appliedFilters.length} filter aktif`
        )
      );
    }
        const report = appState.cleaningReport;
    if (report && report.actions.length > 0) {
      left.append(
        el('span', { class: 'status-sep' }, '·'),
        el(
          'span',
          {
            class: 'status-badge status-badge-clean',
            title: report.actions
              .map((a) => `${a.type}${a.column ? ' [' + a.column + ']' : ''} ×${a.count ?? ''}`)
              .join('\n'),
          },
          `🧹 ${report.actions.length} cleaned`
        )
      );
    }
  }

  function updateEngine() {
    center.textContent = `Mode: ${APP_CONFIG.phase}`;
    const engineEl = root.querySelector('#engine-status');
    if (engineEl) {
      engineEl.textContent = `Engine: ${appState.engineName}`;
      engineEl.classList.toggle(
        'is-duckdb',
        appState.engineName === 'DuckDB'
      );
    }
  }

  subscribe(updateLeft, ['dataset', 'appliedFilters', 'cleaningReport']);
  subscribe(updateEngine, ['engineName']);
  updateLeft();
  updateEngine();
}