import { el, svgIcon } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { subscribe } from '../state/state-events.js';
import { toggleTheme } from '../state/settings.js';
import { openModal } from './modal.js';
import { createExportButton } from './export-button.js';

export function renderTopbar(root) {
  root.classList.add('topbar');

  // ─────────────────────────────────────────────────────────────
  // Logo + brand
  // ─────────────────────────────────────────────────────────────
  const logo = el(
    'div',
    { class: 'topbar-logo' },
    el('span', { class: 'logo-mark' }, svgIcon('logo', 20)),
    el(
      'div',
      { class: 'topbar-brand' },
      el('span', { class: 'brand-name' }, 'Data Analysis Tool'),
      el('span', { class: 'badge' }, 'v0.7')
    )
  );

  // ─────────────────────────────────────────────────────────────
  // Center — nama dataset aktif
  // ─────────────────────────────────────────────────────────────
  const center = el(
    'div',
    { class: 'topbar-center' },
    el('span', { class: 'dataset-name', id: 'dataset-name' }, 'Belum ada dataset')
  );

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────
  const uploadBtn = el(
    'button',
    {
      class: 'btn',
      title: 'Upload (Ctrl+U)',
      'aria-label': 'Upload',
      onclick: () => document.dispatchEvent(new CustomEvent('datatool:upload')),
    },
    svgIcon('upload'),
    el('span', {}, 'Upload')
  );

  const sampleBtn = el(
    'button',
    {
      class: 'btn',
      title: 'Load sample (Ctrl+S)',
      'aria-label': 'Load sample',
      onclick: () => document.dispatchEvent(new CustomEvent('datatool:load-sample')),
    },
    'Sample'
  );

  const exportBtn = createExportButton();

  const themeBtn = el(
    'button',
    {
      class: 'btn btn-icon',
      id: 'theme-btn',
      title: 'Theme (T)',
      'aria-label': 'Toggle theme',
      onclick: () => toggleTheme(),
    },
    svgIcon('moon')
  );

  const aboutBtn = el(
    'button',
    {
      class: 'btn btn-icon',
      'aria-label': 'About',
      title: 'About',
      onclick: () => openModal('about'),
    },
    svgIcon('info')
  );

  const actions = el(
    'div',
    { class: 'topbar-actions' },
    uploadBtn,
    sampleBtn,
    exportBtn,
    themeBtn,
    aboutBtn
  );

  root.append(logo, center, actions);

  // ─────────────────────────────────────────────────────────────
  // Reactive updates
  // ─────────────────────────────────────────────────────────────
  function update() {
    // Dataset name
    const nameEl = root.querySelector('#dataset-name');
    if (nameEl) {
      nameEl.textContent = appState.dataset
        ? appState.dataset.name
        : 'Belum ada dataset';
    }

    // Theme icon (sun saat dark = bisa switch ke light, moon saat light)
    const tb = root.querySelector('#theme-btn');
    if (tb) {
      tb.innerHTML = '';
      tb.append(svgIcon(appState.theme === 'dark' ? 'sun' : 'moon'));
    }
  }

  subscribe(update, ['dataset', 'theme']);
  update();
}