import { appState } from './app-state.js';

/** Simple pub/sub. UI subscribe → re-render section yang terdampak saja. */
export const stateEvents = new EventTarget();

/**
 * Merge patch ke state dan broadcast.
 * @param {Partial<typeof appState>} patch
 */
export function setState(patch) {
  const changedKeys = Object.keys(patch);
  Object.assign(appState, patch);
  stateEvents.dispatchEvent(
    new CustomEvent('statechange', { detail: { patch, changedKeys } })
  );
}

/**
 * Subscribe dengan filter key opsional.
 * @param {(state: typeof appState, meta: any) => void} handler
 * @param {string[]} [keys] kalau diisi, hanya panggil saat salah satu key berubah
 * @returns {() => void} unsubscribe
 */
export function subscribe(handler, keys) {
  const wrapped = (e) => {
    if (!keys || e.detail.changedKeys.some((k) => keys.includes(k))) {
      handler(appState, e.detail);
    }
  };
  stateEvents.addEventListener('statechange', wrapped);
  return () => stateEvents.removeEventListener('statechange', wrapped);
}