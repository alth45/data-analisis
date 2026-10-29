import { appState } from './app-state.js';
import { setState } from './state-events.js';

const STORAGE_KEY = 'datatool:settings';
const LEGACY_THEME_KEY = 'datatool:theme';

export const DEFAULT_SETTINGS = {
  // Appearance
  theme: 'dark',
  compactMode: false,

  // Table
  pageSize: 50,

  // Charts
  defaultChartType: 'bar',
  defaultAggregateFn: 'sum',

  // Data Pipeline
  autoClean: true,
  interpolationMethod: 'linear',

  // Storage
  persistSession: true,  // ← NEW

  // Engine
  forceJsEngine: false,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    if (!parsed.theme) {
      const legacy = localStorage.getItem(LEGACY_THEME_KEY);
      if (legacy === 'dark' || legacy === 'light') parsed.theme = legacy;
    }

    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function applySettings(settings) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.body.classList.toggle('is-compact', !!settings.compactMode);
  }

  if (appState.theme !== settings.theme) {
    setState({ theme: settings.theme });
  }
  if (appState.tablePageSize !== settings.pageSize) {
    setState({ tablePageSize: settings.pageSize, tablePage: 0 });
  }
}

export function updateSetting(key, value) {
  const current = appState.settings || DEFAULT_SETTINGS;
  const next = { ...current, [key]: value };
  setState({ settings: next });
  saveSettings(next);
  applySettings(next);
}

export function resetSettings() {
  const next = { ...DEFAULT_SETTINGS };
  setState({ settings: next });
  saveSettings(next);
  applySettings(next);
}

export function toggleTheme() {
  const next = appState.theme === 'dark' ? 'light' : 'dark';
  updateSetting('theme', next);
}