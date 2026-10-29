import { el } from './dom.js';

/**
 * Popup menu anchored ke elemen. Item spec:
 *   { label: string, onClick: () => void, danger?: boolean, disabled?: boolean }
 *   '---' = separator
 *
 * @param {HTMLElement} anchorEl
 * @param {Array<object|'---'>} items
 */
export function showPopupMenu(anchorEl, items) {
  // Close menu yang sudah terbuka
  const existing = document.querySelector('.popup-menu');
  if (existing) existing.remove();

  const menu = el('div', { class: 'popup-menu', role: 'menu' });
  items.forEach((it) => {
    if (it === '---') {
      menu.append(el('div', { class: 'popup-menu-sep' }));
      return;
    }
    menu.append(
      el(
        'button',
        {
          class: 'popup-menu-item' + (it.danger ? ' is-danger' : ''),
          role: 'menuitem',
          disabled: !!it.disabled,
          onclick: (e) => {
            e.stopPropagation();
            closeMenu();
            it.onClick && it.onClick();
          },
        },
        it.label
      )
    );
  });

  document.body.append(menu);

  // Position di bawah anchor
  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;

  function closeMenu() {
    menu.remove();
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey);
  }
  function onDocClick(e) {
    if (!menu.contains(e.target) && e.target !== anchorEl) closeMenu();
  }
  function onKey(e) {
    if (e.key === 'Escape') closeMenu();
  }
  setTimeout(() => {
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
  }, 0);
}