/**
 * Data Cleaner & Interpolation Engine.
 *
 * Input: Dataset mentah (dari parser) yang mungkin punya:
 *  - whitespace, control chars, unicode aneh
 *  - null sentinels bervariasi ("", "N/A", "null", "-", ...)
 *  - number dengan format lokal ("Rp 1.234,56", "$1,234.56")
 *  - date dengan format berbeda-beda
 *  - cell kosong (NaN, blank)
 *
 * Output: { dataset, report }
 *  - dataset: Dataset dengan baris & tipe kolom sudah dikoersi
 *  - report : { before, after, actions[], warnings[], opts }
 *
 * Tidak ada dependency eksternal.
 */

// ─────────────────────────────────────────────────────────────
// Konstanta
// ─────────────────────────────────────────────────────────────

const NULL_SENTINELS = new Set([
  '', 'null', 'nil', 'none', 'undefined', 'nan', '#n/a',
  'n/a', 'na', '-', '--', '—', '–', '?', 'missing',
]);

const CURRENCY_RE = /(?:^|\s)(?:rp|usd|idr|sgd|myr|thb|php|vnd|krw|jpy|cny|inr|aud|cad|eur|gbp|\$|€|£|¥|₹|₩|₽|₺|฿|₫)\s?/gi;
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const DEFAULT_CLEAN_OPTIONS = {
  trim: true,
  stripControl: true,
  coerceNulls: true,
  normalizeNumbers: true,
  normalizeDates: true,
  interpolate: true,
  defaultNumericInterp: 'linear', // linear | mean | median | ffill | bfill
  sortByDate: true,
  dropEmptyRows: false,
  dropDuplicateRows: false,
};

// ─────────────────────────────────────────────────────────────
// Primitive helpers
// ─────────────────────────────────────────────────────────────

function sanitizeString(s) {
  return String(s).normalize('NFKC').replace(CONTROL_CHAR_RE, '').trim();
}

function isNullish(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') {
    return NULL_SENTINELS.has(v.trim().toLowerCase());
  }
  if (typeof v === 'number') return !Number.isFinite(v);
  return false;
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  const hadPercent = /%\s*$/.test(s);
  s = s.replace(CURRENCY_RE, '').replace(/%/g, '');
  // Heuristic: kedua . dan , → . = thousand, , = decimal
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  s = s.replace(/\s/g, '');
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return hadPercent ? n : n;
}

function parseDate(v) {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : toISODate(v);
  }
  const s = String(v).trim();
  if (!s) return null;

  // ISO-ish: sudah "YYYY-MM-DD" → cepat
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return toISODate(d);
  }
  // Numeric separators: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, dst.
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const n1 = Number(a);
    const n2 = Number(b);
    let day, month;
    if (n1 > 12) { day = n1; month = n2; }
    else if (n2 > 12) { day = n2; month = n1; }
    else { day = n1; month = n2; } // default DD/MM
    const d = new Date(year, month - 1, day);
    if (!Number.isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month - 1) {
      return toISODate(d);
    }
  }
  // Fallback: native Date.parse (handles "Jan 15 2024", ISO with time, dll)
  const fallback = Date.parse(s);
  if (!Number.isNaN(fallback)) return toISODate(new Date(fallback));
  return null;
}

function inferType(values) {
  let sawNum = 0, sawDate = 0, sawBool = 0, sawStr = 0, nonNull = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    nonNull++;
    if (typeof v === 'number') { sawNum++; continue; }
    if (typeof v === 'boolean') { sawBool++; continue; }
    const s = String(v).trim();
    if (!s) continue;
    if (parseNumber(s) !== null && !/^\d{4}-\d{2}-\d{2}$/.test(s)) { sawNum++; continue; }
    if (parseDate(s) !== null) { sawDate++; continue; }
    sawStr++;
  }
  if (nonNull === 0) return 'string';
  const total = sawNum + sawDate + sawBool + sawStr;
  if (sawStr / total >= 0.5) return 'string';
  if (sawNum / total >= 0.5) return 'number';
  if (sawDate / total >= 0.5) return 'date';
  if (sawBool / total >= 0.5) return 'boolean';
  return 'string';
}

// ─────────────────────────────────────────────────────────────
// Interpolation — input array of (number|null), return array lengkap
// ─────────────────────────────────────────────────────────────

function interpolateColumn(values, method = 'linear') {
  const n = values.length;
  const result = values.slice();

  if (method === 'mean') {
    const nums = values.filter((v) => typeof v === 'number');
    if (!nums.length) return result;
    const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
    return result.map((v) => (v === null ? mean : v));
  }
  if (method === 'median') {
    const nums = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
    if (!nums.length) return result;
    const mid = Math.floor(nums.length / 2);
    const median = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    return result.map((v) => (v === null ? median : v));
  }
  if (method === 'ffill') {
    let last = null;
    return result.map((v) => {
      if (v !== null) { last = v; return v; }
      return last;
    });
  }
  if (method === 'bfill') {
    let next = null;
    for (let i = n - 1; i >= 0; i--) {
      if (result[i] !== null) next = result[i];
      else result[i] = next;
    }
    return result;
  }
  // linear (default)
  const firstIdx = result.findIndex((v) => v !== null);
  if (firstIdx === -1) return result;
  let lastIdx = firstIdx;
  for (let i = firstIdx + 1; i < n; i++) if (result[i] !== null) lastIdx = i;

  // Leading & trailing fill
  for (let i = 0; i < firstIdx; i++) result[i] = result[firstIdx];
  for (let i = lastIdx + 1; i < n; i++) result[i] = result[lastIdx];

  // Linear gap fill
  let prev = firstIdx;
  for (let i = firstIdx + 1; i <= lastIdx; i++) {
    if (result[i] === null) continue;
    const gap = i - prev - 1;
    if (gap > 0) {
      const step = (result[i] - result[prev]) / (i - prev);
      for (let j = 1; j <= gap; j++) {
        result[prev + j] = result[prev] + step * j;
      }
    }
    prev = i;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// Report helper
// ─────────────────────────────────────────────────────────────

function summarize(ds) {
  const nullCounts = {};
  let totalNull = 0;
  ds.columns.forEach((col, ci) => {
    let n = 0;
    for (const row of ds.rows) {
      if (isNullish(row[ci])) n++;
    }
    nullCounts[col.name] = n;
    totalNull += n;
  });
  return {
    rowCount: ds.rowCount,
    columnCount: ds.columnCount,
    totalNull,
    nullCounts,
    types: Object.fromEntries(ds.columns.map((c) => [c.name, c.type])),
  };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

/**
 * @param {import('./dataset-model.js').Dataset} dataset
 * @param {Partial<typeof DEFAULT_CLEAN_OPTIONS>} [userOpts]
 * @returns {{ dataset: import('./dataset-model.js').Dataset, report: object }}
 */
export function cleanDataset(dataset, userOpts = {}) {
  const opts = { ...DEFAULT_CLEAN_OPTIONS, ...userOpts };
  const actions = [];
  const warnings = [];
  const before = summarize(dataset);

  // Clone rows & columns — jangan mutate dataset asli
  const cols = dataset.columns.map((c) => ({ ...c }));
  let rows = dataset.rows.map((r) => r.slice());

  // ---- 1. Sanitize strings ----
  if (opts.trim || opts.stripControl) {
    rows = rows.map((row) =>
      row.map((cell) => {
        if (typeof cell !== 'string') return cell;
        let s = cell;
        if (opts.stripControl) s = sanitizeString(s);
        else if (opts.trim) s = s.trim();
        return s;
      })
    );
  }

  // ---- 2. Null sentinels ----
  if (opts.coerceNulls) {
    const counts = {};
    rows = rows.map((row) =>
      row.map((cell, ci) => {
        if (isNullish(cell)) {
          const name = cols[ci].name;
          counts[name] = (counts[name] || 0) + 1;
          return null;
        }
        return cell;
      })
    );
    for (const [col, count] of Object.entries(counts)) {
      actions.push({ type: 'nullify', column: col, count });
    }
  }

  // ---- 3. Per-column coercion ----
  for (let ci = 0; ci < cols.length; ci++) {
    const col = cols[ci];
    const originalValues = rows.map((r) => r[ci]);
    const nonNull = originalValues.filter((v) => v !== null);
    if (!nonNull.length) continue;

    const inferred = inferType(nonNull);

    if (inferred === 'number' && opts.normalizeNumbers) {
      let converted = 0, failed = 0;
      const newVals = originalValues.map((v) => {
        if (v === null) return null;
        const n = parseNumber(v);
        if (n === null) { failed++; return null; }
        if (typeof v !== 'number') converted++;
        return n;
      });
      const validCount = newVals.filter((v) => v !== null).length;
      if (validCount >= nonNull.length * 0.5) {
        rows.forEach((row, ri) => { row[ci] = newVals[ri]; });
        if (col.type !== 'number') {
          actions.push({ type: 'type-coerce', column: col.name, from: col.type, to: 'number', count: converted });
          cols[ci] = { ...col, type: 'number' };
        } else if (converted > 0) {
          actions.push({ type: 'number-normalize', column: col.name, count: converted });
        }
        if (failed > 0) {
          actions.push({ type: 'nullify', column: col.name, count: failed });
        }
      }
    } else if (inferred === 'date' && opts.normalizeDates) {
      let converted = 0, failed = 0;
      const newVals = originalValues.map((v) => {
        if (v === null) return null;
        const d = parseDate(v);
        if (d === null) { failed++; return null; }
        if (v !== d) converted++;
        return d;
      });
      const validCount = newVals.filter((v) => v !== null).length;
      if (validCount >= nonNull.length * 0.5) {
        rows.forEach((row, ri) => { row[ci] = newVals[ri]; });
        if (col.type !== 'date') {
          actions.push({ type: 'type-coerce', column: col.name, from: col.type, to: 'date', count: converted });
          cols[ci] = { ...col, type: 'date' };
        } else if (converted > 0) {
          actions.push({ type: 'date-normalize', column: col.name, count: converted });
        }
        if (failed > 0) actions.push({ type: 'nullify', column: col.name, count: failed });
      }
    }
  }

  // ---- 4. Drop empty rows ----
  if (opts.dropEmptyRows) {
    const beforeLen = rows.length;
    rows = rows.filter((row) => row.some((v) => v !== null));
    if (rows.length < beforeLen) {
      actions.push({ type: 'drop-empty-rows', count: beforeLen - rows.length });
    }
  }

  // ---- 5. Drop duplicates ----
  if (opts.dropDuplicateRows) {
    const seen = new Set();
    const beforeLen = rows.length;
    rows = rows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (rows.length < beforeLen) {
      actions.push({ type: 'drop-duplicates', count: beforeLen - rows.length });
    }
  }

  // ---- 6. Sort by date (untuk time-series interp) ----
  const dateCi = cols.findIndex((c) => c.type === 'date');
  if (opts.sortByDate && dateCi !== -1) {
    const alreadySorted = rows.every(
      (r, i) => i === 0 || String(rows[i - 1][dateCi] ?? '').localeCompare(String(r[dateCi] ?? '')) <= 0
    );
    if (!alreadySorted) {
      rows.sort((a, b) => String(a[dateCi] ?? '').localeCompare(String(b[dateCi] ?? '')));
      actions.push({ type: 'sort-by-date', column: cols[dateCi].name });
    }
  }

  // ---- 7. Interpolate numeric columns ----
  if (opts.interpolate) {
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      if (col.type !== 'number') continue;

      const vals = rows.map((r) => (typeof r[ci] === 'number' ? r[ci] : null));
      const nullCount = vals.filter((v) => v === null).length;
      if (nullCount === 0) continue;

      const pct = nullCount / vals.length;
      if (pct > 0.5) {
        warnings.push({
          column: col.name,
          message: `${Math.round(pct * 100)}% nilai kosong — interpolasi mungkin tidak akurat`,
        });
      }

      const method = opts.defaultNumericInterp;
      const filled = interpolateColumn(vals, method);
      const filledCount = filled.filter((v, i) => v !== null && vals[i] === null).length;

      if (filledCount > 0) {
        rows.forEach((row, ri) => { row[ci] = filled[ri]; });
        actions.push({ type: 'interpolate', column: col.name, method, count: filledCount });
      }
    }
  }

  // ---- Final dataset ----
  const cleanedDataset = {
    ...dataset,
    columns: cols,
    rows,
    rowCount: rows.length,
    columnCount: cols.length,
  };

  return {
    dataset: cleanedDataset,
    report: {
      before,
      after: summarize(cleanedDataset),
      actions,
      warnings,
      opts,
    },
  };
}