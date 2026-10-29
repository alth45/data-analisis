import { el, svgIcon } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { subscribe } from '../state/state-events.js';
import { analyzer, APP_CONFIG } from '../config.js';
import { serializeCsv, downloadCsv, buildExportFilename } from '../utils/csv.js';
import { exportCurrentViewAsPdf } from '../utils/pdf-export.js';
import { showPopupMenu } from '../utils/popup-menu.js';
import { toast } from './toast.js';
import { logger } from '../utils/logger.js';

const VIEW_LABELS = {
  data: 'Data',
  charts: 'Charts',
  pivot: 'Pivot',
  stats: 'Statistics',
};

export function createExportButton() {
  let busy = false;

  const btn = el(
    'button',
    {
      class: 'btn export-btn',
      id: 'export-btn',
      onclick: handleClick,
    },
    svgIcon('download'),
    el('span', { class: 'export-btn-label' }, 'Export'),
    el('span', { class: 'export-btn-caret' }, '▾')
  );

  // ───────────────────────────────────────────────────────────
  // Click → open menu (kalau ada dataset)
  // ───────────────────────────────────────────────────────────
  function handleClick() {
    if (busy) return;
    if (!appState.dataset) {
      toast('Belum ada dataset untuk diekspor.', 'warn');
      return;
    }

    const hasFilters = appState.appliedFilters.length > 0;
    const view = appState.activePanel;
    const viewLabel = VIEW_LABELS[view] || 'Data';

    showPopupMenu(btn, [
      {
        label: hasFilters ? 'Export Filtered CSV' : 'Export CSV',
        onClick: () => runExport('csv'),
      },
      {
        label: `Export ${viewLabel} as PDF`,
        onClick: () => runExport('pdf'),
      },
    ]);
  }

  // ───────────────────────────────────────────────────────────
  // Wrapper dengan loading state
  // ───────────────────────────────────────────────────────────
  async function runExport(kind) {
    if (busy) return;
    if (!appState.dataset) {
      toast('Belum ada dataset untuk diekspor.', 'warn');
      return;
    }

    busy = true;
    btn.disabled = true;
    const labelEl = btn.querySelector('.export-btn-label');
    const origLabel = labelEl?.textContent || 'Export';
    if (labelEl) labelEl.textContent = 'Exporting…';

    try {
      if (kind === 'csv') await exportCsv();
      else if (kind === 'pdf') await exportPdf();
    } finally {
      busy = false;
      btn.disabled = !appState.dataset;
      if (labelEl) labelEl.textContent = origLabel;
    }
  }

  // ───────────────────────────────────────────────────────────
  // CSV
  // ───────────────────────────────────────────────────────────
  async function exportCsv() {
    if (!APP_CONFIG.featureFlags.exportCsv) {
      toast('Export CSV belum diaktifkan.', 'warn');
      return;
    }
    const hasFilter = appState.appliedFilters.length > 0;
    try {
      const { columns, rows } = await analyzer.exportRows(appState.appliedFilters);
      if (!columns.length) {
        toast('Dataset tidak punya kolom.', 'error');
        return;
      }
      if (!rows.length) {
        toast(
          hasFilter ? 'Tidak ada baris yang cocok dengan filter aktif.' : 'Dataset kosong.',
          'warn'
        );
        return;
      }
      const csv = serializeCsv(columns, rows);
      const filename = buildExportFilename(appState.dataset.name, hasFilter);
      downloadCsv(filename, csv);
      toast(`CSV ${rows.length} baris → ${filename}`, 'success');
    } catch (err) {
      logger.error('export csv failed', err);
      toast(`Export CSV gagal: ${err.message}`, 'error');
    }
  }

  // ───────────────────────────────────────────────────────────
  // PDF
  // ───────────────────────────────────────────────────────────
  async function exportPdf() {
    try {
      const t0 = performance.now();
      toast('Generating PDF…', 'info', 60000);
      const { filename, view } = await exportCurrentViewAsPdf();
      const ms = Math.round(performance.now() - t0);
      toast(`PDF (${VIEW_LABELS[view] || view}) → ${filename} · ${ms}ms`, 'success', 4000);
    } catch (err) {
      logger.error('export pdf failed', err);
      toast(`Export PDF gagal: ${err.message}`, 'error');
    }
  }

  // ───────────────────────────────────────────────────────────
  // State sync
  // ───────────────────────────────────────────────────────────
  function refreshState() {
    const hasDataset = !!appState.dataset;
    btn.disabled = !hasDataset || busy;
    btn.title = hasDataset ? 'Export (CSV / PDF)' : 'Belum ada dataset';
  }

  subscribe(refreshState, ['dataset', 'appliedFilters', 'activePanel']);
  refreshState();

  // ───────────────────────────────────────────────────────────
  // Event listeners — shortcut bypass menu
  // ───────────────────────────────────────────────────────────
  document.addEventListener('datatool:export-csv', () => runExport('csv'));
  document.addEventListener('datatool:export-pdf', () => runExport('pdf'));

  return btn;
}