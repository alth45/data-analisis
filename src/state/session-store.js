import { appState } from './app-state.js';
import { setState, subscribe } from './state-events.js';
import { idbPut, idbGet, idbDelete } from '../core/idb-store.js';
import { APP_CONFIG, analyzer } from '../config.js';
import { logger } from '../utils/logger.js';

const KEY = 'current';
const SCHEMA = 1;
const DEBOUNCE_MS = 500;

let saveTimer = null;
let initialized = false;

async function saveCurrentSession() {
  if (!APP_CONFIG.featureFlags.indexedDB) return;
  if (appState.settings && appState.settings.persistSession === false) return;
  if (!appState.dataset) {
    try { await idbDelete(KEY); } catch { /* ignore */ }
    return;
  }

  const payload = {
    schema: SCHEMA,
    timestamp: Date.now(),
    dataset: appState.dataset,
    cleaningReport: appState.cleaningReport,
    appliedFilters: appState.appliedFilters,
    xAxis: appState.xAxis,
    yAxis: appState.yAxis,
    aggregateFn: appState.aggregateFn,
    pivot: appState.pivot,
    charts: appState.charts,
    chartPresets: appState.chartPresets,
    activePresetId: appState.activePresetId,
    activePanel: appState.activePanel,
  };

  try {
    await idbPut(KEY, payload);
    logger.debug('Session saved', {
      rows: payload.dataset.rowCount,
      charts: payload.charts.length,
      presets: payload.chartPresets.length,
    });
  } catch (err) {
    logger.warn('Session save failed', err);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveCurrentSession();
  }, DEBOUNCE_MS);
}

export async function restoreSession() {
  if (!APP_CONFIG.featureFlags.indexedDB) return { restored: false };
  if (appState.settings && appState.settings.persistSession === false) return { restored: false };

  try {
    const saved = await idbGet(KEY);
    if (!saved) return { restored: false };

    if (saved.schema !== SCHEMA) {
      logger.warn('Session schema mismatch, discarding', { saved: saved.schema, current: SCHEMA });
      await idbDelete(KEY);
      return { restored: false };
    }

    if (!saved.dataset?.columns?.length || !Array.isArray(saved.dataset?.rows)) {
      logger.warn('Corrupt session payload, discarding');
      await idbDelete(KEY);
      return { restored: false };
    }

    await analyzer.loadDataset(saved.dataset);

    setState({
      dataset: saved.dataset,
      datasetError: null,
      cleaningReport: saved.cleaningReport ?? null,
      appliedFilters: saved.appliedFilters ?? [],
      xAxis: saved.xAxis ?? null,
      yAxis: saved.yAxis ?? null,
      aggregateFn: saved.aggregateFn ?? 'sum',
      pivot: saved.pivot ?? {
        rowColumn: null, colColumn: null, valueColumn: null,
        aggregateFn: 'sum', showTotals: true,
      },
      charts: saved.charts ?? [],
      chartPresets: saved.chartPresets ?? [],
      activePresetId: saved.activePresetId ?? null,
      activePanel: saved.activePanel ?? 'data',
      tablePage: 0,
    });

    return {
      restored: true,
      info: {
        datasetName: saved.dataset.name,
        rowCount: saved.dataset.rowCount,
        chartCount: saved.charts?.length ?? 0,
        presetCount: saved.chartPresets?.length ?? 0,
        timestamp: saved.timestamp,
      },
    };
  } catch (err) {
    logger.warn('Session restore failed', err);
    return { restored: false };
  }
}

export async function clearCurrentSession() {
  try {
    await idbDelete(KEY);
    return true;
  } catch (err) {
    logger.warn('Clear session failed', err);
    return false;
  }
}

export async function getSavedSessionInfo() {
  if (!APP_CONFIG.featureFlags.indexedDB) return null;
  try {
    const saved = await idbGet(KEY);
    if (!saved || saved.schema !== SCHEMA) return null;
    return {
      datasetName: saved.dataset?.name ?? 'unknown',
      rowCount: saved.dataset?.rowCount ?? 0,
      chartCount: saved.charts?.length ?? 0,
      presetCount: saved.chartPresets?.length ?? 0,
      timestamp: saved.timestamp,
    };
  } catch {
    return null;
  }
}

export function initSessionPersistence() {
  if (initialized) return;
  initialized = true;
  if (!APP_CONFIG.featureFlags.indexedDB) return;

  subscribe(scheduleSave, [
    'dataset',
    'appliedFilters',
    'charts',
    'chartPresets',
    'activePresetId',
    'pivot',
    'xAxis',
    'yAxis',
    'aggregateFn',
  ]);

  window.addEventListener('beforeunload', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      saveCurrentSession();
    }
  });
}