/**
 * Representasi dataset yang dipakai di seluruh aplikasi.
 * @typedef {Object} Column
 * @property {string} name
 * @property {'string'|'number'|'date'|'boolean'} type
 *
 * @typedef {Object} Dataset
 * @property {string} id
 * @property {string} name
 * @property {Column[]} columns
 * @property {any[][]} rows
 * @property {number} rowCount
 * @property {number} columnCount
 */

export function createDataset({ id, name, columns, rows }) {
  return {
    id: id ?? `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    columns,
    rows,
    rowCount: rows.length,
    columnCount: columns.length,
  };
}

const DATE_RE = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/;

/**
 * Deteksi tipe kolom dari sample value.
 * Simple heuristic; Fase 2 bisa pakai schema profiling lebih kaya.
 */
export function detectColumnType(values) {
  let sawNumber = 0;
  let sawDate = 0;
  let sawString = 0;
  let sawBool = 0;
  let nonNull = 0;

  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    nonNull++;
    if (typeof v === 'boolean') { sawBool++; continue; }
    if (typeof v === 'number' && !Number.isNaN(v)) { sawNumber++; continue; }
    const s = String(v).trim();
    if (!s) continue;
    if (!Number.isNaN(Number(s))) { sawNumber++; continue; }
    if (DATE_RE.test(s) && !Number.isNaN(Date.parse(s))) { sawDate++; continue; }
    if (s === 'true' || s === 'false') { sawBool++; continue; }
    sawString++;
  }

  if (nonNull === 0) return 'string';
  if (sawString > 0) return 'string';
  if (sawNumber > 0 && sawDate === 0) return 'number';
  if (sawDate > 0 && sawNumber === 0) return 'date';
  if (sawBool > 0) return 'boolean';
  return 'string';
}