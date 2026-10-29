import { el } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { setState, subscribe } from '../state/state-events.js';
import { renderTopbar } from './topbar.js';
import { renderSidebar } from './sidebar.js';
import { renderUploadPanel } from './upload-panel.js';
import { renderDataTable } from './data-table.js';
import { renderChartPanel } from './chart-panel.js';
import { renderChartsPage } from './charts-page.js';
import { renderStatsPanel } from './stats-panel.js';
import { renderPivotPanel } from './pivot-panel.js';
import { renderToolsPanel } from './tools-panel.js';
import { renderStatusBar } from './status-bar.js';

export function renderLayout(root) {
  root.innerHTML = '';

  const app = el('div', { class: 'app-shell' });

  const topbar = el('header', { class: 'topbar-area', role: 'banner' });
  const sidebar = el('aside', { class: 'sidebar-area', 'aria-label': 'Sidebar' });
  const main = el('main', { class: 'main', role: 'main' });
  const tools = el('aside', { class: 'tools-area', 'aria-label': 'Tools' });
  const status = el('footer', { class: 'status-area', role: 'contentinfo' });

  const mobileNav = el(
    'nav',
    { class: 'mobile-nav', 'aria-label': 'Mobile navigation' },
    el('button', { class: 'mobile-nav-btn', 'data-target': 'data',   onclick: () => setState({ activePanel: 'data' }) },   'Data'),
    el('button', { class: 'mobile-nav-btn', 'data-target': 'charts', onclick: () => setState({ activePanel: 'charts' }) }, 'Charts'),
    el('button', { class: 'mobile-nav-btn', 'data-target': 'pivot',  onclick: () => setState({ activePanel: 'pivot' }) },  'Pivot'),
    el('button', { class: 'mobile-nav-btn', 'data-target': 'stats',  onclick: () => setState({ activePanel: 'stats' }) },  'Stats'),
    el('button', { class: 'mobile-nav-btn', 'data-target': 'tools',  onclick: () => setState({ activePanel: 'tools' }) },  'Tools')
  );

  const center = el('div', { class: 'center-stack' });
  const uploadWrap      = el('section', { class: 'panel-upload-slot',       'data-panel-slot': 'upload' });
  const tableWrap       = el('section', { class: 'panel-table-slot',        'data-panel-slot': 'table' });
  const chartWrap       = el('section', { class: 'panel-chart-slot',        'data-panel-slot': 'chart' });
  const chartsPageWrap  = el('section', { class: 'panel-charts-page-slot',  'data-panel-slot': 'charts' });
  const pivotWrap       = el('section', { class: 'panel-pivot-slot',        'data-panel-slot': 'pivot' });
  const statsWrap       = el('section', { class: 'panel-stats-slot',        'data-panel-slot': 'stats' });

  center.append(uploadWrap, tableWrap, chartWrap, chartsPageWrap, pivotWrap, statsWrap);
  main.append(mobileNav, center);

  app.append(topbar, sidebar, main, tools, status);
  root.append(app);

  renderTopbar(topbar);
  renderSidebar(sidebar);
  renderUploadPanel(uploadWrap);
  renderDataTable(tableWrap);
  renderChartPanel(chartWrap);
  renderChartsPage(chartsPageWrap);
  renderPivotPanel(pivotWrap);
  renderStatsPanel(statsWrap);
  renderToolsPanel(tools);
  renderStatusBar(status);

  const slotMap = {
    table: tableWrap,
    chart: chartWrap,
    charts: chartsPageWrap,
    pivot: pivotWrap,
    stats: statsWrap,
  };

  function reflect() {
    app.dataset.activePanel = appState.activePanel;
    app.classList.toggle('is-sidebar-collapsed', appState.sidebarCollapsed);
    app.classList.toggle('has-dataset', !!appState.dataset);

    const isMax = !!appState.maximizedPanel;
    app.classList.toggle('is-maximized', isMax);
    if (isMax) app.dataset.maximized = appState.maximizedPanel;
    else delete app.dataset.maximized;

    for (const [key, wrap] of Object.entries(slotMap)) {
      wrap.classList.toggle('is-maximized-active', appState.maximizedPanel === key);
    }

    mobileNav.querySelectorAll('.mobile-nav-btn').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.target === appState.activePanel)
    );
  }

  subscribe(reflect, ['activePanel', 'sidebarCollapsed', 'dataset', 'maximizedPanel']);
  reflect();
}