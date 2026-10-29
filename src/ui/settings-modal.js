import { el } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { subscribe } from '../state/state-events.js';
import {
  DEFAULT_SETTINGS,
  updateSetting,
  resetSettings,
} from '../state/settings.js';
import { APP_CONFIG } from '../config.js';
import { listChartRenderers } from '../core/chart-registry.js';
import {
  getSavedSessionInfo,
  clearCurrentSession,
} from '../state/session-store.js';
import { toast } from './toast.js';

export function renderSettingsBody() {
  const root = el('div', { class: 'settings-body' });

  function current() {
    return appState.settings || DEFAULT_SETTINGS;
  }

  function section(title) {
    return el('div', { class: 'settings-section' },
      el('div', { class: 'settings-section-title' }, title));
  }

  function row(label, hint, control) {
    return el('div', { class: 'settings-row' },
      el('div', { class: 'settings-label' },
        el('span', { class: 'settings-label-main' }, label),
        hint ? el('span', { class: 'settings-label-hint' }, hint) : null),
      el('div', { class: 'settings-control' }, control));
  }

  function seg(options, value, onChange) {
    const wrap = el('div', { class: 'seg' });
    options.forEach(({ value: v, label }) => {
      wrap.append(el('button',
        {
          type: 'button',
          class: value === v ? 'is-active' : '',
          onclick: () => onChange(v),
        },
        label));
    });
    return wrap;
  }

  function switchBtn(checked, onChange) {
    return el('button', {
      type: 'button',
      class: 'settings-switch' + (checked ? ' is-on' : ''),
      role: 'switch',
      'aria-checked': String(checked),
      onclick: () => onChange(!checked),
    });
  }

  function select(options, value, onChange) {
    return el('select',
      { class: 'input', onchange: (e) => onChange(e.target.value) },
      ...options.map(({ value: v, label }) =>
        el('option', { value: v, selected: value === v }, label)));
  }

  function formatTimeAgo(ts) {
    if (!ts) return '';
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `${sec}s lalu`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m lalu`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h lalu`;
    return new Date(ts).toLocaleDateString('id-ID');
  }

  // ─────────────────────────────────────────────────────────────
  // Sections
  // ─────────────────────────────────────────────────────────────

  function buildAppearance() {
    const sec = section('Appearance');
    const s = current();
    sec.append(
      row('Theme', 'Dark atau light',
        seg(
          [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }],
          s.theme,
          (v) => updateSetting('theme', v)
        )),
      row('Compact mode', 'Tabel dan panel lebih padat',
        switchBtn(!!s.compactMode, (v) => updateSetting('compactMode', v)))
    );
    return sec;
  }

  function buildTable() {
    const sec = section('Table');
    const s = current();
    sec.append(
      row('Page size', 'Baris per halaman',
        seg(
          [25, 50, 100, 200].map((n) => ({ value: n, label: String(n) })),
          s.pageSize,
          (v) => updateSetting('pageSize', Number(v))
        ))
    );
    return sec;
  }

  function buildCharts() {
    const sec = section('Charts');
    const s = current();
    const typeOptions = listChartRenderers().map((r) => ({
      value: r.key, label: r.label,
    }));
    const aggOptions = [
      { value: 'sum', label: 'SUM' }, { value: 'avg', label: 'AVG' },
      { value: 'count', label: 'COUNT' }, { value: 'min', label: 'MIN' },
      { value: 'max', label: 'MAX' },
    ];
    sec.append(
      row('Default chart type', 'Dipakai saat add chart baru',
        select(typeOptions, s.defaultChartType, (v) => updateSetting('defaultChartType', v))),
      row('Default aggregate', 'Dipakai saat add chart baru',
        select(aggOptions, s.defaultAggregateFn, (v) => updateSetting('defaultAggregateFn', v)))
    );
    return sec;
  }

  function buildDataPipeline() {
    const sec = section('Data Pipeline');
    const s = current();
    const interpOptions = [
      { value: 'linear', label: 'Linear' },
      { value: 'mean', label: 'Mean' },
      { value: 'median', label: 'Median' },
      { value: 'ffill', label: 'Forward fill' },
      { value: 'bfill', label: 'Backward fill' },
    ];
    sec.append(
      row('Auto-clean on upload', 'Jalankan cleaning engine setiap upload',
        switchBtn(!!s.autoClean, (v) => updateSetting('autoClean', v))),
      row('Default interpolation', 'Metode isi nilai kosong numerik',
        select(interpOptions, s.interpolationMethod,
          (v) => updateSetting('interpolationMethod', v)))
    );
    return sec;
  }

  function buildStorage() {
    const sec = section('Storage');
    const s = current();

    const infoEl = el('span', { class: 'settings-static' }, 'Loading…');

        async function loadInfo() {
      if (!APP_CONFIG.featureFlags.indexedDB) {
        infoEl.textContent = 'Not available';
        return;
      }
      if (s.persistSession === false) {
        infoEl.textContent = 'Persistence disabled';
        return;
      }
      const info = await getSavedSessionInfo();
      if (info) {
        const parts = [
          info.datasetName,
          `${info.rowCount} baris`,
          `${info.chartCount} chart`,
        ];
        if (info.presetCount) parts.push(`${info.presetCount} preset`);
        parts.push(formatTimeAgo(info.timestamp));
        infoEl.textContent = parts.join(' · ');
      } else {
        infoEl.textContent = 'Belum ada session tersimpan';
      }
    }
    loadInfo();

    const clearBtn = el('button', {
      class: 'btn btn-sm',
      onclick: async () => {
        if (!confirm('Hapus session tersimpan dari browser?\nDataset saat ini tetap terbuka sampai reload.')) return;
        const ok = await clearCurrentSession();
        if (ok) {
          toast('Saved session dihapus.', 'info');
          loadInfo();
        } else {
          toast('Gagal menghapus session.', 'error');
        }
      },
    }, 'Clear');

    sec.append(
      row('Session persistence', 'Simpan dataset + chart antar reload (debounced)',
        switchBtn(s.persistSession !== false, (v) => {
          updateSetting('persistSession', v);
          if (v) loadInfo();
          else infoEl.textContent = 'Persistence disabled';
        })),
      row('Saved session', 'Data terakhir yang tersimpan', infoEl),
      row('Clear saved data', 'Hapus dari IndexedDB saja (dataset aktif tidak terpengaruh)', clearBtn)
    );
    return sec;
  }

  function buildEngine() {
    const sec = section('Engine');
    const s = current();
    const forceBtn = switchBtn(!!s.forceJsEngine, (v) => {
      updateSetting('forceJsEngine', v);
      toast('Preferensi engine disimpan. Reload untuk menerapkan.', 'info');
    });
    sec.append(
      row('Force JS engine', 'Skip upgrade ke DuckDB wasm (butuh reload)', forceBtn),
      row('Current engine', 'Engine yang sedang aktif',
        el('span', { class: 'settings-static' },
          appState.engineName === 'DuckDB' ? 'DuckDB wasm' : 'JavaScript'))
    );
    return sec;
  }

  function buildFooter() {
    return el('div', { class: 'settings-footer' },
      el('span', { class: 'settings-footer-hint' }, 'Perubahan tersimpan otomatis.'),
      el('button', {
        type: 'button',
        class: 'btn btn-sm',
        onclick: () => {
          if (!confirm('Reset semua settings ke default?')) return;
          resetSettings();
          toast('Settings direset ke default.', 'info');
        },
      }, 'Reset Defaults'));
  }

  function rebuild() {
    root.innerHTML = '';
    root.append(
      buildAppearance(),
      buildTable(),
      buildCharts(),
      buildDataPipeline(),
      buildStorage(),
      buildEngine(),
      buildFooter()
    );
  }

  rebuild();

  const unsub = subscribe(() => {
    if (!document.body.contains(root)) {
      unsub();
      return;
    }
    rebuild();
  }, ['settings', 'engineName']);

  return root;
}