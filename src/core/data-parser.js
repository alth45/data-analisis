import Papa from 'papaparse';
import { createDataset, detectColumnType } from './dataset-model.js';

/**
 * Parse File → Dataset. Dispatch berdasarkan ekstensi.
 * @param {File} file
 * @returns {Promise<import('./dataset-model.js').Dataset>}
 */
export async function parseFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const text = await file.text();
  return parseText(text, file.name, ext);
}

/**
 * Parse raw text. Dipakai juga untuk load sample CSV via fetch.
 */
export async function parseText(text, name, ext) {
  if (ext === 'json') return parseJSON(text, name);
  return parseCSV(text, name, ext === 'tsv' ? '\t' : undefined);
}

/** @internal */
function parseCSV(text, name, delimiter) {
  const result = Papa.parse(text, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
    delimiter,
  });

  const fields = result.meta?.fields ?? [];
  if (!fields.length) {
    throw new Error('Header CSV tidak ditemukan');
  }
  if (!result.data.length) {
    throw new Error('Dataset kosong (0 baris)');
  }

  // Fail keras hanya jika delimiter salah / quote rusak DAN tidak ada data.
  const fatal = result.errors?.find(
    (e) => e.type === 'Delimiter' || (e.type === 'Quotes' && !result.data.length)
  );
  if (fatal && !result.data.length) {
    throw new Error('Gagal parse CSV (delimiter tidak dikenali)');
  }

  const rows = result.data.map((row) => fields.map((f) => row[f] ?? ''));
  const columns = fields.map((f, i) => ({
    name: f,
    type: detectColumnType(rows.map((r) => r[i])),
  }));

  return createDataset({ name, columns, rows });
}

/** @internal */
function parseJSON(text, name) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON tidak valid');
  }
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
    ? data.data
    : null;
  if (!arr) throw new Error('JSON harus berupa array objek');
  if (!arr.length) throw new Error('Dataset kosong');

  // Kumpulkan semua key (union) supaya kolom tidak hilang kalau shape beda.
  const keys = Array.from(
    new Set(arr.flatMap((o) => (o && typeof o === 'object' ? Object.keys(o) : [])))
  );
  if (!keys.length) throw new Error('JSON tidak punya kolom yang bisa dibaca');

  const rows = arr.map((o) =>
    keys.map((k) => {
      const v = o?.[k];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    })
  );

  const columns = keys.map((k, i) => ({
    name: k,
    type: detectColumnType(rows.map((r) => r[i])),
  }));

  return createDataset({ name, columns, rows });
}