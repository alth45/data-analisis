import { el } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { setState } from '../state/state-events.js';
import { APP_CONFIG } from '../config.js';
import { renderSettingsBody } from './settings-modal.js';

const TITLES = { about: 'About', docs: 'Dokumentasi', settings: 'Settings' };

export function openModal(type) {
  if (!TITLES[type]) return;
  if (document.querySelector('.modal-backdrop')) return;

  const close = () => {
    const b = document.querySelector('.modal-backdrop');
    if (!b) return;
    b.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => b.remove(), 220);
    setState({ modal: null });
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const backdrop = el(
    'div',
    { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } },
    el(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': TITLES[type] },
      el(
        'div',
        { class: 'modal-header' },
        el('h2', {}, TITLES[type]),
        el('button', { class: 'btn btn-icon', 'aria-label': 'Close', onclick: close }, '×')
      ),
      el('div', { class: 'modal-body' }, renderBody(type))
    )
  );

  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => backdrop.classList.add('is-open'));
  setState({ modal: type });
}

function renderBody(type) {
  if (type === 'about') {
    return el(
      'div',
      { class: 'doc-body' },
      el('p', {}, el('strong', {}, 'Data Analysis Tool'), ' — Fase 2'),
      el('p', {}, 'Upload CSV/JSON, cleaning engine, tabel preview, aggregate, chart (Chart.js), pivot, statistik, outlier, trend, heatmap, export CSV/PNG.'),
      el('p', { class: 'muted' }, 'Stack: Vite + Vanilla JS, CSS variables, papaparse, chart.js, @duckdb/duckdb-wasm (opsional).')
    );
  }
  if (type === 'docs') {
    return el(
      'div',
      { class: 'doc-body' },
      el('h3', {}, 'Shortcut'),
      el('ul', {},
        el('li', {}, 'Ctrl/Cmd + U — Upload file'),
        el('li', {}, 'Ctrl/Cmd + S — Load sample'),
        el('li', {}, 'Ctrl/Cmd + E — Export CSV'),
        el('li', {}, 'Ctrl/Cmd + Shift + E — Export chart PNG'),
        el('li', {}, 'Ctrl/Cmd + / — Toggle sidebar'),
        el('li', {}, 'T — Toggle theme'),
        el('li', {}, 'Esc — Tutup modal / un-maximize'),
      ),
      el('h3', {}, 'Chart Types'),
      el('ul', {},
        el('li', {}, 'Bar / Line / Pie / Scatter'),
        el('li', {}, 'Heatmap — matrix 2 kategori × aggregate'),
        el('li', {}, 'Outlier — scatter + bounds (IQR / Z-score)'),
        el('li', {}, 'Trend — line + moving avg + forecast + linear regression'),
      ),
      el('h3', {}, 'Engine'),
      el('p', {}, 'Default: JavaScript (instant). Auto-upgrade ke DuckDB wasm di background untuk dataset besar. Matikan via Settings → Engine.')
    );
  }
  return renderSettingsBody();
}
