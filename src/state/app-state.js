export const appState = {
  // Dataset
  dataset: null,
  datasetLoading: false,
  datasetError: null,
  cleaningReport: null,

  // Table
  tablePage: 0,
  tablePageSize: 50,
  sortColumn: null,
  sortDirection: null,
  hiddenColumns: [],

  // Tools — DRAFT
  filters: [],
  xAxis: null,
  yAxis: null,
  aggregateFn: 'sum',
  chartType: 'bar',

  // Tools — COMMITTED
  appliedFilters: [],

  // Pivot
  pivot: {
    rowColumn: null,
    colColumn: null,
    valueColumn: null,
    aggregateFn: 'sum',
    showTotals: true,
  },

  // Charts page
  charts: [],
  chartPresets: [],       // [{ id, name, charts, createdAt, updatedAt }]
  activePresetId: null,   // string | null

  // Settings
  settings: null,

  // UI
  theme: 'dark',
  sidebarCollapsed: false,
  activePanel: 'data',
  modal: null,
  maximizedPanel: null,

  // Engine
  engineName: 'JS',
};