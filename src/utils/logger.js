const PREFIX = '[DAT]';
export const logger = {
  info: (...a) => console.info(PREFIX, ...a),
  warn: (...a) => console.warn(PREFIX, ...a),
  error: (...a) => console.error(PREFIX, ...a),
  debug: (...a) => {
    if (import.meta.env?.DEV) console.debug(PREFIX, ...a);
  },
};