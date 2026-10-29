import { appState } from './app-state.js';
import { setState } from './state-events.js';

function newId() {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cloneCharts(charts) {
  return JSON.parse(JSON.stringify(charts || []));
}

export function getActivePreset() {
  if (!appState.activePresetId) return null;
  return appState.chartPresets.find((p) => p.id === appState.activePresetId) || null;
}

/**
 * True kalau `charts` saat ini beda dari preset aktif,
 * atau tidak ada preset aktif tapi ada chart (unsaved state).
 */
export function isPresetDirty() {
  const active = getActivePreset();
  if (!active) return appState.charts.length > 0;
  return JSON.stringify(active.charts) !== JSON.stringify(appState.charts);
}

/** Update preset aktif dengan charts saat ini. Return preset atau null. */
export function saveActivePreset() {
  const active = getActivePreset();
  if (!active) return null;
  const now = Date.now();
  const presets = appState.chartPresets.map((p) =>
    p.id === active.id
      ? { ...p, charts: cloneCharts(appState.charts), updatedAt: now }
      : p
  );
  setState({ chartPresets: presets });
  return presets.find((p) => p.id === active.id);
}

/** Buat preset baru dari charts saat ini. Return preset baru atau null. */
export function saveAsNewPreset(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const now = Date.now();
  const preset = {
    id: newId(),
    name: trimmed,
    charts: cloneCharts(appState.charts),
    createdAt: now,
    updatedAt: now,
  };
  setState({
    chartPresets: [...appState.chartPresets, preset],
    activePresetId: preset.id,
  });
  return preset;
}

/** Load preset ke active charts. */
export function loadPreset(presetId) {
  if (!presetId) {
    setState({ activePresetId: null });
    return;
  }
  const preset = appState.chartPresets.find((p) => p.id === presetId);
  if (!preset) return;
  setState({
    activePresetId: preset.id,
    charts: cloneCharts(preset.charts),
  });
}

export function renamePreset(presetId, newName) {
  const trimmed = String(newName || '').trim();
  if (!trimmed) return;
  const presets = appState.chartPresets.map((p) =>
    p.id === presetId ? { ...p, name: trimmed, updatedAt: Date.now() } : p
  );
  setState({ chartPresets: presets });
}

export function deletePreset(presetId) {
  const presets = appState.chartPresets.filter((p) => p.id !== presetId);
  const wasActive = appState.activePresetId === presetId;
  setState({
    chartPresets: presets,
    activePresetId: wasActive ? null : appState.activePresetId,
  });
}

export function duplicatePreset(presetId) {
  const source = appState.chartPresets.find((p) => p.id === presetId);
  if (!source) return null;
  const now = Date.now();
  const copy = {
    id: newId(),
    name: `${source.name} (copy)`,
    charts: cloneCharts(source.charts),
    createdAt: now,
    updatedAt: now,
  };
  setState({
    chartPresets: [...appState.chartPresets, copy],
    activePresetId: copy.id,
    charts: cloneCharts(copy.charts),
  });
  return copy;
}

/** Reset active charts ke default dataset (regenerate). */
export function resetActivePreset(generatedCharts) {
  setState({
    charts: cloneCharts(generatedCharts),
    activePresetId: null,
  });
}