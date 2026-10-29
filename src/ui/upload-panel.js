import { el, svgIcon } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { setState, subscribe } from '../state/state-events.js';
import { APP_CONFIG, analyzer } from '../config.js';
import { parseFile, parseText } from '../core/data-parser.js';
import { cleanDataset, DEFAULT_CLEAN_OPTIONS } from '../core/data-cleaner.js';
import { generateDefaultCharts } from '../core/chart-defaults.js';
import { openCleanDialog } from './clean-dialog.js';
import { toast } from './toast.js';
import { logger } from '../utils/logger.js';

export function renderUploadPanel(root) {
  root.classList.add('panel', 'panel-upload');

  const zone = el(
    'div',
    { class: 'drop-zone', tabindex: '0' },
    el('div', { class: 'drop-icon' }, svgIcon('upload', 40)),
    el('div', { class: 'drop-title' }, 'Drop CSV atau JSON di sini'),
    el('div', { class: 'drop-hint' },
      'Maks 10MB · 50.000 baris · Format: .csv, .json, .tsv'
    ),
    el('button', { class: 'btn btn-primary', onclick: () => pickFile() }, 'Pilih File'),
    el('input', {
      type: 'file',
      hidden: true,
      id: 'file-input',
      accept: '.csv,.json,.tsv',
      onchange: handleInput,
    }),
    el('div', { class: 'drop-sep' }, 'atau'),
    el('button', { class: 'btn', onclick: loadSample }, 'Load Sample Dataset')
  );

  const progressWrap = el(
    'div',
    { class: 'progress-wrap', hidden: true },
    el('div', { class: 'progress' }, el('div', { class: 'progress-bar' }, '')),
    el('div', { class: 'progress-label' }, 'Parsing...')
  );

  root.append(zone, progressWrap);

  // ─────────────────────────────────────────────────────────────
  // File input + drag & drop
  // ─────────────────────────────────────────────────────────────

  function pickFile() {
    root.querySelector('#file-input').click();
  }

  function handleInput(e) {
    const file = e.target.files[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  ['dragenter', 'dragover'].forEach((evt) =>
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('is-drag');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove('is-drag');
    })
  );
  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pickFile();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Pipeline: raw → clean → dialog (opsional) → analyzer
  // ─────────────────────────────────────────────────────────────

    async function commitParsedDataset(rawDataset) {
    const settings = appState.settings;

    // Auto-clean off → langsung load raw, tidak buka dialog
    if (settings && settings.autoClean === false) {
      await analyzer.loadDataset(rawDataset);
      activateDataset(rawDataset, null);
      toast(`Dataset "${rawDataset.name}" dimuat (raw, auto-clean off).`, 'success');
      return;
    }

    // Auto-clean on → clean dengan interpolation method dari settings
    const cleanOpts = {
      ...DEFAULT_CLEAN_OPTIONS,
      defaultNumericInterp: settings?.interpolationMethod || 'linear',
    };
    const initial = cleanDataset(rawDataset, cleanOpts);

    let finalDataset = initial.dataset;
    let report = initial.report;
    let accepted = true;

    if (initial.report.actions.length > 0) {
      showProgress(false);
      const result = await openCleanDialog(rawDataset, initial);
      if (!result) {
        toast('Data cleaning dibatalkan — pakai data mentah.', 'warn');
        finalDataset = rawDataset;
        report = null;
        accepted = false;
      } else {
        finalDataset = result.dataset;
        report = result.report;
        accepted = result.accepted;
      }
    }

    await analyzer.loadDataset(finalDataset);
    activateDataset(finalDataset, report);

    const msg = accepted && report && report.actions.length > 0
      ? `Dataset "${finalDataset.name}" dibersihkan — ${report.actions.length} aksi.`
      : `Dataset "${finalDataset.name}" dimuat (mentah).`;
    toast(msg, 'success');
  }

  // ─────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────

  async function handleFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!APP_CONFIG.supportedExtensions.includes(ext)) {
      toast(`Format .${ext} tidak didukung. Gunakan .csv / .json / .tsv.`, 'error');
      return;
    }
    if (file.size > APP_CONFIG.maxFileSizeBytes) {
      toast(
        `File terlalu besar (${(file.size / 1e6).toFixed(1)}MB). Maks ${(
          APP_CONFIG.maxFileSizeBytes / 1e6
        ).toFixed(0)}MB.`,
        'error'
      );
      return;
    }

    showProgress(true, 'Parsing...');
    try {
      const rawDataset = await parseFile(file);
      if (rawDataset.rowCount > APP_CONFIG.maxRows) {
        toast(`Dataset > ${APP_CONFIG.maxRows} baris — mungkin lambat.`, 'warn');
      }
      await commitParsedDataset(rawDataset);
    } catch (err) {
      logger.error(err);
      setState({ datasetError: err.message });
      toast(`Gagal memproses file: ${err.message}`, 'error');
    } finally {
      showProgress(false);
    }
  }

  async function loadSample() {
    showProgress(true, 'Memuat sample...');
    try {
      const res = await fetch(APP_CONFIG.sampleDatasetPath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const rawDataset = await parseText(text, APP_CONFIG.sampleName, 'csv');
      await commitParsedDataset(rawDataset);
    } catch (err) {
      logger.error(err);
      toast(`Gagal memuat sample: ${err.message}`, 'error');
    } finally {
      showProgress(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // State activation — TIDAK auto-pick axis (per Step 10)
  // ─────────────────────────────────────────────────────────────

    function activateDataset(dataset, cleaningReport = null) {
    setState({
      dataset,
      datasetError: null,
      cleaningReport,
      tablePage: 0,
      sortColumn: null,
      sortDirection: null,
      filters: [],
      appliedFilters: [],
      xAxis: null,
      yAxis: null,
      activePanel: 'data',
      pivot: {
        rowColumn: null,
        colColumn: null,
        valueColumn: null,
        aggregateFn: 'sum',
        showTotals: true,
      },
      charts: generateDefaultCharts(dataset),
      activePresetId: null, // dataset baru → unsaved state
      // chartPresets TIDAK di-reset — user bisa switch manual
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────

  function showProgress(on, label) {
    progressWrap.hidden = !on;
    if (label) progressWrap.querySelector('.progress-label').textContent = label;
  }

  document.addEventListener('datatool:upload', pickFile);
  document.addEventListener('datatool:load-sample', loadSample);

  subscribe(({ dataset }) => {
    root.hidden = !!dataset;
  }, ['dataset']);
  root.hidden = !!appState.dataset;
}