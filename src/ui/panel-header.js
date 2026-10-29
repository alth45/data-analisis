import { el, svgIcon } from '../utils/dom.js';
import { appState } from '../state/app-state.js';
import { setState, subscribe } from '../state/state-events.js';

/**
 * Header panel standar dengan judul, elemen tambahan (kiri), tombol aksi
 * (kanan), dan tombol maximize otomatis (kalau panelId diberikan).
 *
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} [opts.panelId]  'table' | 'chart' | 'charts' | 'pivot' | 'stats'
 * @param {HTMLElement[]} [opts.left]   elemen setelah judul (badge, meta, ...)
 * @param {HTMLElement[]} [opts.right]  tombol aksi (Export, Add, ...)
 * @returns {HTMLElement}
 */
export function createPanelHeader({ title, panelId, left = [], right = [] }) {
  const header = el(
    'div',
    { class: 'panel-header' },
    el(
      'div',
      { class: 'panel-header-left' },
      el('h2', { class: 'panel-title', title }, title),
      ...left
    ),
    el('div', { class: 'panel-actions' }, ...right)
  );

  if (!panelId) return header;

  const actions = header.querySelector('.panel-actions');

  const maxBtn = el(
    'button',
    {
      class: 'btn btn-icon btn-sm panel-max-btn',
      'data-panel-id': panelId,
      'aria-label': 'Maximize panel',
      title: 'Maximize',
      onclick: () => {
        setState({
          maximizedPanel: appState.maximizedPanel === panelId ? null : panelId,
        });
      },
    },
    svgIcon('maximize', 14)
  );

  actions.append(maxBtn);

  subscribe(() => {
    const isMax = appState.maximizedPanel === panelId;
    maxBtn.innerHTML = '';
    maxBtn.append(svgIcon(isMax ? 'minimize' : 'maximize', 14));
    maxBtn.title = isMax ? 'Minimize (Esc)' : 'Maximize';
    maxBtn.setAttribute('aria-label', isMax ? 'Minimize panel' : 'Maximize panel');
    maxBtn.classList.toggle('is-active', isMax);
  }, ['maximizedPanel']);

  return header;
}