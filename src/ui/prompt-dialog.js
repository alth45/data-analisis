import { el } from '../utils/dom.js';

/**
 * Dialog prompt single input. Return Promise<string|null>.
 * @param {{ title?: string, label?: string, initial?: string, placeholder?: string, required?: boolean, okLabel?: string }} opts
 */
export function promptText({
  title = 'Input',
  label = 'Value',
  initial = '',
  placeholder = '',
  required = true,
  okLabel = 'OK',
} = {}) {
  return new Promise((resolve) => {
    if (document.querySelector('.modal-backdrop')) {
      resolve(null);
      return;
    }

    const input = el('input', {
      class: 'input',
      value: initial,
      placeholder,
      autocomplete: 'off',
    });

    let closed = false;
    const close = (val) => {
      if (closed) return;
      closed = true;
      const b = document.querySelector('.modal-backdrop');
      if (b) {
        b.classList.remove('is-open');
        setTimeout(() => b.remove(), 220);
      }
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };

    const submit = () => {
      const v = input.value.trim();
      if (required && !v) return;
      close(v);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    };

    const form = el(
      'form',
      { onsubmit: (e) => { e.preventDefault(); submit(); } },
      el('label', { class: 'form-row' },
        el('span', { class: 'form-label' }, label),
        input
      )
    );

    const backdrop = el(
      'div',
      {
        class: 'modal-backdrop',
        onclick: (e) => { if (e.target === backdrop) close(null); },
      },
      el(
        'div',
        { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        el('div', { class: 'modal-header' },
          el('h2', {}, title),
          el('button', { class: 'btn btn-icon', 'aria-label': 'Close', onclick: () => close(null) }, '×')),
        el('div', { class: 'modal-body' }, form),
        el('div', { class: 'modal-footer' },
          el('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          el('button', { class: 'btn btn-primary', type: 'button', onclick: submit }, okLabel))
      )
    );

    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      input.focus();
      input.select();
    });
  });
}