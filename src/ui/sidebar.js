import { el, svgIcon } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { setState, subscribe } from '../state/state-events.js';
import { openModal } from './modal.js';

const ITEMS = [
  { id: 'data',     label: 'Upload & Data', icon: 'table' },
  { id: 'charts',   label: 'Charts',        icon: 'chart' },
  { id: 'pivot',    label: 'Pivot',         icon: 'pivot' },
  { id: 'stats',    label: 'Statistics',    icon: 'stats' },
  { id: 'settings', label: 'Settings',      icon: 'settings' },
  { id: 'docs',     label: 'Docs',          icon: 'info' },
];

export function renderSidebar(root) {
  root.classList.add('sidebar');
  const nav = el('nav', { class: 'sidebar-nav', 'aria-label': 'Navigasi utama' });

  ITEMS.forEach((item) => {
    const btn = el(
      'button',
      {
        class: 'nav-item',
        'data-panel': item.id,
        onclick: () => handleNav(item.id),
      },
      svgIcon(item.icon),
      el('span', { class: 'nav-label' }, item.label)
    );
    if (item.id === 'data') {
      btn.append(el('span', { class: 'nav-dot', title: 'Dataset status' }));
    }
    nav.append(btn);
  });

  root.append(nav);

  function handleNav(id) {
    if (id === 'settings' || id === 'docs') return openModal(id);
    setState({ activePanel: id });
  }

  function update() {
    root.querySelectorAll('.nav-item').forEach((n) => {
      const active = n.dataset.panel === appState.activePanel;
      n.classList.toggle('is-active', active);
      n.setAttribute('aria-current', active ? 'page' : 'false');
    });
    const dot = root.querySelector('.nav-dot');
    if (dot) dot.classList.toggle('is-on', !!appState.dataset);
  }

  subscribe(update, ['activePanel', 'dataset']);
  update();
}