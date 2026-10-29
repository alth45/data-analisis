let container;

function ensureContainer() {
  if (!container || !container.isConnected) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.append(container);
  }
  return container;
}

/** @param {'info'|'success'|'warn'|'error'} type */
export function toast(message, type = 'info', duration = 3200) {
  const c = ensureContainer();
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.setAttribute('role', 'status');
  t.textContent = message;
  c.append(t);
  requestAnimationFrame(() => t.classList.add('is-visible'));
  setTimeout(() => {
    t.classList.remove('is-visible');
    setTimeout(() => t.remove(), 220);
  }, duration);
}