import { renderLayout } from './ui/layout.js';
import { appState } from './state/app-state.js';
import { setState } from './state/state-events.js';
import { analyzer, APP_CONFIG } from './config.js';
import { loadSettings, toggleTheme } from './state/settings.js';
import { restoreSession, initSessionPersistence } from './state/session-store.js';
import { toast } from './ui/toast.js';
import { logger } from './utils/logger.js';

export function bootstrap(root) {
  // 1. Settings dulu
  const settings = loadSettings();
  appState.settings = settings;
  appState.theme = settings.theme;
  appState.tablePageSize = settings.pageSize;
  document.documentElement.setAttribute('data-theme', settings.theme);
  document.body.classList.toggle('is-compact', !!settings.compactMode);

  // 2. Render UI (empty state dulu — restore bisa async)
  renderLayout(root);
  setState({ engineName: 'JS' });

  // 3. Init persistence (subscribe auto-save)
  initSessionPersistence();

  // 4. Restore session (async, non-blocking) — kalau ada
  restoreSession().then(({ restored, info }) => {
    if (restored) {
      const ts = info.timestamp ? new Date(info.timestamp).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      }) : '';
      toast(
        `Session restored: ${info.datasetName} (${info.rowCount} baris, ${info.chartCount} chart) · ${ts}`,
        'success',
        5000
      );
    }
  }).catch((err) => {
    logger.warn('Restore pipeline error', err);
  });

  // 5. Background DuckDB upgrade
  if (APP_CONFIG.featureFlags.duckdb && !settings.forceJsEngine) {
    tryUpgradeToDuckDB();
  }

  // 6. Shortcuts
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isEditing = tag === 'input' || tag === 'textarea' || tag === 'select';

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('datatool:upload'));
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('datatool:load-sample'));
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('datatool:export-csv'));
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('datatool:export-pdf'));
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      const btn = document.getElementById('chart-export-btn');
      if (btn && !btn.disabled) btn.click();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const next = !appState.sidebarCollapsed;
      setState({ sidebarCollapsed: next });
      localStorage.setItem('datatool:sidebarCollapsed', String(next));
    }
    if (!isEditing && (e.key === 't' || e.key === 'T')) {
      toggleTheme();
    }
    if (
      e.key === 'Escape' &&
      appState.maximizedPanel &&
      !document.querySelector('.modal-backdrop')
    ) {
      e.preventDefault();
      setState({ maximizedPanel: null });
    }
  });
}

async function tryUpgradeToDuckDB() {
  const t0 = performance.now();
  try {
    const { DuckDBAnalyzer } = await import('./core/duckdb-analyzer.js');
    const duck = new DuckDBAnalyzer();
    await duck.init();

    const hadDataset = appState.dataset;
    analyzer.setImpl(duck, 'DuckDB');
    if (hadDataset) await duck.loadDataset(hadDataset);

    setState({
      engineName: 'DuckDB',
      dataset: appState.dataset,
      appliedFilters: appState.appliedFilters,
    });

    const ms = Math.round(performance.now() - t0);
    logger.info(`DuckDB ready in ${ms}ms`);
    toast(`Engine upgraded to DuckDB (${ms}ms)`, 'success');
  } catch (err) {
    logger.warn('DuckDB upgrade failed, using JS engine', err);
    setState({ engineName: 'JS' });
  }
}