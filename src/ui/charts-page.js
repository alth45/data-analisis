import { el, clear } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { setState, subscribe } from '../state/state-events.js';
import { createChartCard } from './chart-card.js';
import { openChartDialog } from './chart-dialog.js';
import { createPanelHeader } from './panel-header.js';
import { promptText } from './prompt-dialog.js';
import { showPopupMenu } from '../utils/popup-menu.js';
import {
  getActivePreset,
  isPresetDirty,
  saveActivePreset,
  saveAsNewPreset,
  loadPreset,
  renamePreset,
  deletePreset,
  duplicatePreset,
  resetActivePreset,
} from '../state/chart-presets.js';
import { generateDefaultCharts } from '../core/chart-defaults.js';
import { toast } from './toast.js';

function chartConfigEquals(a, b) {
  if (!a || !b) return a === b;
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.type === b.type &&
    a.xColumn === b.xColumn &&
    a.yColumn === b.yColumn &&
    a.aggregateFn === b.aggregateFn
  );
}

export function renderChartsPage(root) {
  root.classList.add('panel', 'panel-charts-page');

  const addBtn = el(
    'button',
    { class: 'btn btn-primary btn-sm', id: 'add-chart-btn', onclick: addChart },
    '+ Add Chart'
  );

  const header = createPanelHeader({
    title: 'Charts',
    panelId: 'charts',
    left: [el('span', { class: 'badge badge-muted', id: 'charts-count' }, '0 charts')],
    right: [addBtn],
  });

  // ─────────────────────────────────────────────────────────────
  // Preset bar
  // ─────────────────────────────────────────────────────────────
  const presetSelect = el('select', {
    class: 'input preset-select',
    'aria-label': 'Chart preset',
    onchange: async (e) => {
      const newId = e.target.value || null;
      if (newId === appState.activePresetId) return;
      if (isPresetDirty() && appState.charts.length > 0) {
        const ok = confirm('Discard unsaved changes in current preset?');
        if (!ok) {
          e.target.value = appState.activePresetId || '';
          return;
        }
      }
      loadPreset(newId);
    },
  });

  const saveBtn = el(
    'button',
    { class: 'btn btn-sm', title: 'Update preset aktif', onclick: handleSave },
    'Save'
  );
  const saveAsBtn = el(
    'button',
    { class: 'btn btn-sm', title: 'Simpan sebagai preset baru', onclick: handleSaveAs },
    'Save As'
  );
  const menuBtn = el(
    'button',
    {
      class: 'btn btn-icon btn-sm',
      'aria-label': 'Preset menu',
      title: 'Preset menu',
      onclick: () => openMenu(),
    },
    '⋯'
  );

  const presetBar = el(
    'div',
    { class: 'charts-preset-bar' },
    el('span', { class: 'preset-label' }, 'Preset'),
    presetSelect,
    saveBtn,
    saveAsBtn,
    menuBtn
  );

  const body = el('div', { class: 'charts-page-body' });
  root.append(header, presetBar, body);

  /** @type {Map<string, ReturnType<typeof createChartCard>>} */
  const mounted = new Map();

  // ─────────────────────────────────────────────────────────────
  // Preset UI sync
  // ─────────────────────────────────────────────────────────────
  function refreshPresetBar() {
    // Rebuild options
    while (presetSelect.options.length > 0) presetSelect.remove(0);

    const active = getActivePreset();
    const dirty = isPresetDirty();

    let unsavedLabel = '(unsaved)';
    if (appState.charts.length > 0 && dirty) unsavedLabel = '● (unsaved changes)';

    presetSelect.append(
      el('option', { value: '', selected: !active }, unsavedLabel)
    );
    appState.chartPresets.forEach((p) => {
      presetSelect.append(
        el('option', { value: p.id, selected: p.id === appState.activePresetId }, p.name)
      );
    });

    // Save button state
    saveBtn.style.display = active ? '' : 'none';
    saveBtn.disabled = !active || !dirty;
    saveBtn.textContent = dirty ? 'Save ●' : 'Saved';

    // Save As — disabled kalau tidak ada chart
    saveAsBtn.disabled = appState.charts.length === 0;
  }

  async function handleSave() {
    const updated = saveActivePreset();
    if (updated) toast(`Preset "${updated.name}" diperbarui.`, 'success');
  }

  async function handleSaveAs() {
    const name = await promptText({
      title: 'Save As New Preset',
      label: 'Nama preset',
      initial: '',
      placeholder: 'e.g. Sales Dashboard',
      okLabel: 'Save',
    });
    if (name === null) return;
    const created = saveAsNewPreset(name);
    if (created) toast(`Preset "${created.name}" disimpan.`, 'success');
  }

  function openMenu() {
    const active = getActivePreset();
    const items = [
      {
        label: 'Rename…',
        disabled: !active,
        onClick: async () => {
          if (!active) return;
          const name = await promptText({
            title: 'Rename Preset',
            label: 'Nama baru',
            initial: active.name,
            required: true,
            okLabel: 'Rename',
          });
          if (name === null) return;
          renamePreset(active.id, name);
          toast('Preset di-rename.', 'success');
        },
      },
      {
        label: 'Duplicate',
        disabled: !active,
        onClick: () => {
          if (!active) return;
          const copy = duplicatePreset(active.id);
          if (copy) toast(`Duplikat "${copy.name}" dibuat.`, 'success');
        },
      },
      '---',
      {
        label: 'Reset to Defaults',
        disabled: !appState.dataset,
        onClick: () => {
          if (!appState.dataset) return;
          if (!confirm('Reset charts ke default (regenerate dari dataset)? Unsaved changes akan hilang.')) return;
          resetActivePreset(generateDefaultCharts(appState.dataset));
          toast('Charts di-reset ke default.', 'info');
        },
      },
      '---',
      {
        label: 'Delete Preset',
        danger: true,
        disabled: !active,
        onClick: () => {
          if (!active) return;
          if (!confirm(`Hapus preset "${active.name}"?`)) return;
          deletePreset(active.id);
          toast(`Preset "${active.name}" dihapus.`, 'info');
        },
      },
    ];
    showPopupMenu(menuBtn, items);
  }

  // ─────────────────────────────────────────────────────────────
  // Chart cards reconcile (existing behaviour)
  // ─────────────────────────────────────────────────────────────
  function reconcile() {
    if (!appState.dataset) {
      root.hidden = true;
      for (const inst of mounted.values()) inst.dispose();
      mounted.clear();
      clear(body);
      return;
    }
    root.hidden = false;

    const configs = appState.charts || [];
    const idSet = new Set(configs.map((c) => c.id));

    for (const [id, instance] of mounted) {
      if (!idSet.has(id)) {
        instance.dispose();
        instance.root.remove();
        mounted.delete(id);
      }
    }

    configs.forEach((cfg, idx) => {
      const existing = mounted.get(cfg.id);
      if (!existing) {
        const inst = createChartCard(cfg);
        mounted.set(cfg.id, inst);
        body.append(inst.root);
      } else {
        const current = existing.getConfig();
        if (!chartConfigEquals(current, cfg)) existing.update(cfg);
      }
      const node = mounted.get(cfg.id).root;
      if (body.children[idx] !== node) {
        body.insertBefore(node, body.children[idx] || null);
      }
    });

    if (!configs.length) {
      if (!body.querySelector('.charts-empty')) {
        body.append(
          el(
            'div',
            { class: 'charts-empty' },
            el('div', { class: 'charts-empty-title' }, 'Belum ada chart'),
            el('div', { class: 'charts-empty-hint' }, 'Klik "+ Add Chart" untuk memulai.'),
            el('button', { class: 'btn btn-primary', onclick: addChart }, '+ Add Chart')
          )
        );
      }
    } else {
      body.querySelector('.charts-empty')?.remove();
    }

    const badge = root.querySelector('#charts-count');
    if (badge) badge.textContent = `${configs.length} chart${configs.length === 1 ? '' : 's'}`;

    refreshPresetBar();
  }

  async function addChart() {
    if (!appState.dataset) {
      toast('Load dataset dulu.', 'warn');
      return;
    }
    const result = await openChartDialog({ mode: 'add', initial: null });
    if (!result) return;
    const id = `chart_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cfg = { ...result, id };
    setState({ charts: [...appState.charts, cfg] });
    toast(`Chart "${cfg.title}" ditambahkan.`, 'success');
  }

  // ─────────────────────────────────────────────────────────────
  // Subscriptions
  // ─────────────────────────────────────────────────────────────
  subscribe(reconcile, ['dataset', 'charts']);
  subscribe(refreshPresetBar, ['chartPresets', 'activePresetId', 'charts']);

  reconcile();
}