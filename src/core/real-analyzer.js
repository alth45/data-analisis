import { IAnalyzer } from './analyzer-interface.js';
import { computeTrend } from './trend-compute.js';

function percentile(sortedArr, p) {
  const n = sortedArr.length;
  if (n === 0) return null;
  if (n === 1) return sortedArr[0];
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] * (1 - (idx - lo)) + sortedArr[hi] * (idx - lo);
}

export class RealAnalyzer extends IAnalyzer {
  constructor() {
    super();
    this._dataset = null;
    this._colIndex = {};
    this._colTypes = {};
  }

  async loadDataset(dataset) {
    this._dataset = dataset;
    this._colIndex = {};
    this._colTypes = {};
    dataset.columns.forEach((c, i) => {
      this._colIndex[c.name] = i;
      this._colTypes[c.name] = c.type;
    });
  }

    async trendAnalysis(xColumn, yColumn, options = {}, filters = []) {
    if (!this._dataset) return null;
    const xi = this._colIndex[xColumn];
    const yi = this._colIndex[yColumn];
    if (xi === undefined || yi === undefined) return null;
    if (this._colTypes[yColumn] !== 'number') return null;

    const rows = this._applyFilters(filters);

    // Aggregate per x dulu (kalau ada duplikasi x, mis. banyak transaksi tanggal sama)
    const fn = options.aggregateFn || 'sum';
    const groups = new Map();
    for (const row of rows) {
      const y = this._coerce(row[yi], yColumn);
      if (typeof y !== 'number' || !Number.isFinite(y)) continue;
      const key = String(row[xi] ?? '');
      if (!groups.has(key)) groups.set(key, { x: row[xi], values: [] });
      groups.get(key).values.push(y);
    }
    const records = [];
    for (const { x, values } of groups.values()) {
      let y;
      if (fn === 'avg') y = values.reduce((s, v) => s + v, 0) / values.length;
      else if (fn === 'count') y = values.length;
      else if (fn === 'min') y = Math.min(...values);
      else if (fn === 'max') y = Math.max(...values);
      else y = values.reduce((s, v) => s + v, 0);
      records.push({ x, y });
    }

    return computeTrend(records, xColumn, yColumn, options);
  }

  async dispose() {
    this._dataset = null;
    this._colIndex = {};
    this._colTypes = {};
  }

  _coerce(value, colName) {
    const type = this._colTypes[colName];
    if (value === null || value === undefined || value === '') return null;
    if (type === 'number') {
      const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
      return Number.isNaN(n) ? null : n;
    }
    if (type === 'date') {
      const d = Date.parse(value);
      return Number.isNaN(d) ? null : d;
    }
    if (type === 'boolean') {
      if (typeof value === 'boolean') return value;
      const s = String(value).toLowerCase();
      if (s === 'true' || s === '1') return true;
      if (s === 'false' || s === '0') return false;
      return null;
    }
    return String(value);
  }

  _applyFilters(filters) {
    const ds = this._dataset;
    if (!ds) return [];
    if (!filters || !filters.length) return ds.rows;
    const active = filters.filter((f) => {
      if (this._colIndex[f.column] === undefined) return false;
      if (f.value === undefined || f.value === null || f.value === '') return false;
      return true;
    });
    if (!active.length) return ds.rows;
    return ds.rows.filter((row) =>
      active.every((f) => {
        const idx = this._colIndex[f.column];
        const rawCell = row[idx];
        if (f.operator === 'contains') {
          return String(rawCell ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase());
        }
        const cell = this._coerce(rawCell, f.column);
        const val = this._coerce(f.value, f.column);
        if (cell === null || val === null) return false;
        switch (f.operator) {
          case 'eq':  return cell === val;
          case 'neq': return cell !== val;
          case 'gt':  return cell > val;
          case 'lt':  return cell < val;
          case 'gte': return cell >= val;
          case 'lte': return cell <= val;
          default:    return true;
        }
      })
    );
  }

  async filterAndPaginate(filters, limit, offset) {
    if (!this._dataset) return { rows: [], total: 0 };
    const filtered = this._applyFilters(filters);
    return {
      rows: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }

  async aggregate({ xColumn, yColumn, function: fn, filters = [] }) {
    if (!this._dataset) return [];
    const xi = this._colIndex[xColumn];
    const yi = this._colIndex[yColumn];
    if (xi === undefined) return [];
    const rows = this._applyFilters(filters);
    const groups = new Map();
    for (const row of rows) {
      const key = String(row[xi] ?? '');
      if (!groups.has(key)) groups.set(key, []);
      const yVal = yi !== undefined ? this._coerce(row[yi], yColumn) : null;
      groups.get(key).push(yVal);
    }
    const result = [];
    for (const [key, values] of groups) {
      const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
      let y = 0;
      if (fn === 'count') y = values.filter((v) => v !== null).length;
      else if (fn === 'sum') y = nums.reduce((s, v) => s + v, 0);
      else if (fn === 'avg') y = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0;
      else if (fn === 'min') y = nums.length ? Math.min(...nums) : 0;
      else if (fn === 'max') y = nums.length ? Math.max(...nums) : 0;
      result.push({ x: key, y });
    }
    result.sort((a, b) => b.y - a.y);
    return result;
  }

  async describeColumn(column, filters = []) {
    const empty = {
      type: this._colTypes[column] ?? 'string',
      count: 0, distinct: 0,
      min: null, max: null, mean: null, median: null,
      stdDev: null, q1: null, q3: null, iqr: null,
      outlierCount: null, outlierBounds: null,
    };
    if (!this._dataset) return empty;
    const idx = this._colIndex[column];
    if (idx === undefined) return empty;

    const sourceRows = filters && filters.length ? this._applyFilters(filters) : this._dataset.rows;
    const distinctSet = new Set();
    const nums = [];
    let nonNullCount = 0;

    for (const row of sourceRows) {
      const raw = row[idx];
      if (raw === null || raw === undefined || raw === '') continue;
      nonNullCount++;
      distinctSet.add(String(raw));
      const v = this._coerce(raw, column);
      if (typeof v === 'number' && Number.isFinite(v)) nums.push(v);
    }

    const base = {
      type: this._colTypes[column] ?? 'string',
      count: nonNullCount,
      distinct: distinctSet.size,
    };

    if (!nums.length) {
      return { ...base, min: null, max: null, mean: null, median: null,
        stdDev: null, q1: null, q3: null, iqr: null,
        outlierCount: null, outlierBounds: null };
    }

    nums.sort((a, b) => a - b);
    const sum = nums.reduce((s, v) => s + v, 0);
    const mean = sum / nums.length;
    const mid = Math.floor(nums.length / 2);
    const median = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    const variance = nums.length > 1
      ? nums.reduce((s, v) => s + (v - mean) ** 2, 0) / (nums.length - 1)
      : 0;
    const stdDev = Math.sqrt(variance);
    const q1 = percentile(nums, 0.25);
    const q3 = percentile(nums, 0.75);
    const iqr = q3 - q1;

    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const outlierCount = nums.filter((v) => v < lower || v > upper).length;

    return {
      ...base,
      min: nums[0],
      max: nums[nums.length - 1],
      mean, median,
      stdDev, q1, q3, iqr,
      outlierCount,
      outlierBounds: { lower, upper },
    };
  }

  async detectOutliers(column, options = {}, filters = []) {
    if (!this._dataset) return null;
    if (this._colTypes[column] !== 'number') return null;
    const yi = this._colIndex[column];
    if (yi === undefined) return null;

    const method = options.method || 'iqr';
    const threshold = options.threshold ?? (method === 'iqr' ? 1.5 : 3);
    const xColumn = options.xColumn || null;
    const xi = xColumn ? this._colIndex[xColumn] : null;

    const rows = this._applyFilters(filters);
    const records = [];
    for (let i = 0; i < rows.length; i++) {
      const y = this._coerce(rows[i][yi], column);
      if (typeof y !== 'number' || !Number.isFinite(y)) continue;
      const x = xi !== null && xi !== undefined ? String(rows[i][xi] ?? '') : i;
      records.push({ rowIndex: i, x, y, originalRow: rows[i] });
    }
    if (!records.length) return null;

    const ys = records.map((r) => r.y);
    const ysSorted = [...ys].sort((a, b) => a - b);
    const n = ys.length;
    const mean = ys.reduce((s, v) => s + v, 0) / n;
    const variance = n > 1 ? ys.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
    const stdDev = Math.sqrt(variance);
    const q1 = percentile(ysSorted, 0.25);
    const q3 = percentile(ysSorted, 0.75);
    const iqr = q3 - q1;

    let lower, upper;
    if (method === 'iqr') {
      lower = q1 - threshold * iqr;
      upper = q3 + threshold * iqr;
    } else {
      lower = mean - threshold * stdDev;
      upper = mean + threshold * stdDev;
    }

    const values = records.map((r) => ({
      x: r.x, y: r.y, rowIndex: r.rowIndex,
      isOutlier: r.y < lower || r.y > upper,
    }));
    values.sort((a, b) => {
      if (typeof a.x === 'number' && typeof b.x === 'number') return a.x - b.x;
      return String(a.x).localeCompare(String(b.x));
    });

    const outliers = values
      .filter((v) => v.isOutlier)
      .map((v) => ({
        x: v.x, y: v.y, rowIndex: v.rowIndex,
        originalRow: records.find((r) => r.rowIndex === v.rowIndex)?.originalRow,
      }));

    return {
      column, xColumn, method, threshold,
      stats: { mean, stdDev, min: ysSorted[0], max: ysSorted[n - 1], q1, q3, iqr },
      bounds: { lower, upper },
      values, outliers,
      outlierCount: outliers.length,
      total: n,
    };
  }

  async exportRows(filters = []) {
    if (!this._dataset) return { columns: [], rows: [] };
    return { columns: this._dataset.columns, rows: this._applyFilters(filters) };
  }

  async pivotTable({ rowColumn, colColumn, valueColumn, function: fn, filters = [] }) {
    const ds = this._dataset;
    const empty = {
      rowLabels: [], colLabels: [], matrix: [],
      rowTotals: [], colTotals: [], grandTotal: 0,
    };
    if (!ds) return empty;
    const ri = this._colIndex[rowColumn];
    const vi = this._colIndex[valueColumn];
    const ci = colColumn ? this._colIndex[colColumn] : null;
    if (ri === undefined || vi === undefined) return empty;
    if (colColumn && ci === undefined) return empty;
    const rows = this._applyFilters(filters);
    const detailMap = new Map();
    const rowGroups = new Map();
    const colGroups = new Map();
    const allValues = [];
    for (const row of rows) {
      const rowKey = String(row[ri] ?? '');
      const colKey = ci !== null ? String(row[ci] ?? '') : '(nilai)';
      const v = this._coerce(row[vi], valueColumn);
      if (!detailMap.has(rowKey)) detailMap.set(rowKey, new Map());
      const colMap = detailMap.get(rowKey);
      if (!colMap.has(colKey)) colMap.set(colKey, []);
      colMap.get(colKey).push(v);
      if (!rowGroups.has(rowKey)) rowGroups.set(rowKey, []);
      rowGroups.get(rowKey).push(v);
      if (!colGroups.has(colKey)) colGroups.set(colKey, []);
      colGroups.get(colKey).push(v);
      allValues.push(v);
    }
    const aggArr = (arr) => {
      if (!arr || !arr.length) return 0;
      const nums = arr.filter((x) => typeof x === 'number' && Number.isFinite(x));
      if (fn === 'count') return arr.filter((x) => x !== null && x !== undefined).length;
      if (!nums.length) return 0;
      if (fn === 'sum') return nums.reduce((s, v) => s + v, 0);
      if (fn === 'avg') return nums.reduce((s, v) => s + v, 0) / nums.length;
      if (fn === 'min') return Math.min(...nums);
      if (fn === 'max') return Math.max(...nums);
      return 0;
    };
    const rowLabels = [...rowGroups.keys()].sort();
    const colLabels = ci !== null ? [...colGroups.keys()].sort() : ['(nilai)'];
    const matrix = rowLabels.map((r) =>
      colLabels.map((c) => {
        const vals = detailMap.get(r)?.get(c);
        return vals && vals.length ? aggArr(vals) : null;
      })
    );
    const rowTotals = rowLabels.map((r) => aggArr(rowGroups.get(r) || []));
    const colTotals = colLabels.map((c) => aggArr(colGroups.get(c) || []));
    const grandTotal = aggArr(allValues);
    return { rowLabels, colLabels, matrix, rowTotals, colTotals, grandTotal };
  }
}