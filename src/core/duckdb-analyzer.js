import * as duckdb from '@duckdb/duckdb-wasm';
import { IAnalyzer } from './analyzer-interface.js';
import { computeTrend } from './trend-compute.js';

const TABLE = 'data';
const INSERT_BATCH = 500;

export class DuckDBAnalyzer extends IAnalyzer {
  constructor() {
    super();
    this._db = null;
    this._conn = null;
    this._dataset = null;
    this._columnNames = [];
    this._columnTypes = {};
  }

  async init() {
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: 'text/javascript',
      })
    );
    const worker = new Worker(workerUrl);
    const logger = new duckdb.VoidLogger();
    this._db = new duckdb.AsyncDuckDB(logger, worker);
    await this._db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    this._conn = await this._db.connect();
  }

  async dispose() {
    try {
      if (this._conn) await this._conn.close();
    } catch { /* ignore */ }
    try {
      if (this._db) await this._db.terminate();
    } catch { /* ignore */ }
    this._conn = null;
    this._db = null;
    this._dataset = null;
    this._columnNames = [];
    this._columnTypes = {};
  }

  async loadDataset(dataset) {
    this._dataset = dataset;
    this._columnNames = dataset.columns.map((c) => c.name);
    this._columnTypes = {};
    dataset.columns.forEach((c) => {
      this._columnTypes[c.name] = c.type;
    });

    await this._conn.query(`DROP TABLE IF EXISTS ${TABLE}`);
    const colDefs = dataset.columns
      .map((c) => `${this._ident(c.name)} ${this._sqlType(c.type)}`)
      .join(', ');
    await this._conn.query(`CREATE TABLE ${TABLE} (${colDefs})`);

    if (dataset.rows.length) {
      await this._conn.query('BEGIN TRANSACTION');
      try {
        for (let i = 0; i < dataset.rows.length; i += INSERT_BATCH) {
          const chunk = dataset.rows.slice(i, i + INSERT_BATCH);
          const values = chunk
            .map((row) => {
              const cells = row.map((v, j) =>
                this._fmt(v, dataset.columns[j].type)
              );
              return `(${cells.join(',')})`;
            })
            .join(',');
          await this._conn.query(`INSERT INTO ${TABLE} VALUES ${values}`);
        }
        await this._conn.query('COMMIT');
      } catch (err) {
        await this._conn.query('ROLLBACK');
        throw err;
      }
    }
  }

  async filterAndPaginate(filters, limit, offset) {
    if (!this._dataset) return { rows: [], total: 0 };
    const where = this._where(filters);

    const countRes = await this._conn.query(
      `SELECT COUNT(*) AS c FROM ${TABLE} ${where}`
    );
    const total = Number(countRes.toArray()[0].c) || 0;

    const rowsRes = await this._conn.query(
      `SELECT * FROM ${TABLE} ${where} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    );
    const rows = rowsRes.toArray().map((r) => this._rowToArray(r));

    return { rows, total };
  }

  async aggregate({ xColumn, yColumn, function: fn, filters = [] }) {
    if (!this._columnTypes[xColumn]) return [];

    const where = this._where(filters);
    const xCol = this._ident(xColumn);
    const yCol = yColumn ? this._ident(yColumn) : null;

    let selectY;
    if (fn === 'count') {
      selectY = yCol ? `COUNT(${yCol}) AS y` : `COUNT(*) AS y`;
    } else {
      if (!yCol) return [];
      const sqlFn = { sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX' }[fn] || 'SUM';
      selectY = `${sqlFn}(${yCol}) AS y`;
    }

    const sql = `
      SELECT ${xCol} AS x, ${selectY}
      FROM ${TABLE}
      ${where}
      GROUP BY ${xCol}
      ORDER BY y DESC
    `;
    const res = await this._conn.query(sql);
    return res.toArray().map((r) => ({
      x: r.x === null || r.x === undefined ? '' : String(r.x),
      y: Number(r.y) || 0,
    }));
  }

    async describeColumn(column, filters = []) {
    const type = this._columnTypes[column] ?? 'string';
    const empty = {
      type, count: 0, distinct: 0,
      min: null, max: null, mean: null, median: null,
      stdDev: null, q1: null, q3: null, iqr: null,
      outlierCount: null, outlierBounds: null,
    };
    if (!this._columnTypes[column]) return empty;

    const where = this._where(filters);
    const col = this._ident(column);

    // ── Query 1: base count & distinct ──
    const baseRes = await this._conn.query(`
      SELECT
        COUNT(${col}) AS c,
        COUNT(DISTINCT ${col}) AS d
      FROM ${TABLE} ${where}
    `);
    const base = baseRes.toArray()[0];
    const count = Number(base.c) || 0;
    const distinct = Number(base.d) || 0;

    if (type !== 'number') {
      return { ...empty, count, distinct };
    }

    // ── Query 2: numeric stats (semua aggregate level-atas, tanpa nesting) ──
    const numRes = await this._conn.query(`
      SELECT
        MIN(${col}) AS min,
        MAX(${col}) AS max,
        AVG(${col}) AS mean,
        MEDIAN(${col}) AS median,
        STDDEV_SAMP(${col}) AS stddev,
        QUANTILE_CONT(${col}, 0.25) AS q1,
        QUANTILE_CONT(${col}, 0.75) AS q3
      FROM ${TABLE} ${where}
    `);
    const num = numRes.toArray()[0];

    const q1 = num.q1 === null || num.q1 === undefined ? null : Number(num.q1);
    const q3 = num.q3 === null || num.q3 === undefined ? null : Number(num.q3);
    const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;
    const lower = q1 !== null && iqr !== null ? q1 - 1.5 * iqr : null;
    const upper = q3 !== null && iqr !== null ? q3 + 1.5 * iqr : null;

    // ── Query 3: outlier count — bounds sebagai literal, bukan nested aggregate ──
    let outlierCount = null;
    if (
      lower !== null && upper !== null &&
      Number.isFinite(lower) && Number.isFinite(upper)
    ) {
      const outlierWhere = where
        ? `${where} AND (${col} < ${lower} OR ${col} > ${upper})`
        : `WHERE (${col} < ${lower} OR ${col} > ${upper})`;
      try {
        const outRes = await this._conn.query(
          `SELECT COUNT(*) AS c FROM ${TABLE} ${outlierWhere}`
        );
        outlierCount = Number(outRes.toArray()[0].c) || 0;
      } catch (err) {
        // Kalau bounds ternyata NaN/Inf (edge case), skip outlier count
        // tapi jangan gagalkan seluruh describeColumn.
        outlierCount = null;
      }
    }

    return {
      type, count, distinct,
      min: num.min === null ? null : Number(num.min),
      max: num.max === null ? null : Number(num.max),
      mean: num.mean === null ? null : Number(num.mean),
      median: num.median === null ? null : Number(num.median),
      stdDev: num.stddev === null ? null : Number(num.stddev),
      q1, q3, iqr,
      outlierCount,
      outlierBounds: lower !== null && upper !== null ? { lower, upper } : null,
    };
  }

  async detectOutliers(column, options = {}, filters = []) {
    if (!this._dataset) return null;
    if (this._columnTypes[column] !== 'number') return null;

    const method = options.method || 'iqr';
    const threshold = options.threshold ?? (method === 'iqr' ? 1.5 : 3);
    const xColumn = options.xColumn || null;

    const col = this._ident(column);
    const xCol = xColumn ? this._ident(xColumn) : null;
    const where = this._where(filters);
    const whereNonNull = where
      ? `${where} AND ${col} IS NOT NULL`
      : `WHERE ${col} IS NOT NULL`;

    const statsRes = await this._conn.query(`
      SELECT
        AVG(${col}) AS mean,
        STDDEV_SAMP(${col}) AS stddev,
        MIN(${col}) AS min,
        MAX(${col}) AS max,
        QUANTILE_CONT(${col}, 0.25) AS q1,
        QUANTILE_CONT(${col}, 0.75) AS q3,
        COUNT(${col}) AS n
      FROM ${TABLE} ${where}
    `);
    const s = statsRes.toArray()[0];
    const n = Number(s.n) || 0;
    if (n === 0) return null;

    const mean = Number(s.mean);
    const stdDev = Number(s.stddev) || 0;
    const min = Number(s.min);
    const max = Number(s.max);
    const q1 = Number(s.q1);
    const q3 = Number(s.q3);
    const iqr = q3 - q1;

    let lower, upper;
    if (method === 'iqr') {
      lower = q1 - threshold * iqr;
      upper = q3 + threshold * iqr;
    } else {
      lower = mean - threshold * stdDev;
      upper = mean + threshold * stdDev;
    }

    const xExpr = xCol || 'ROW_NUMBER() OVER ()';
    const valuesRes = await this._conn.query(`
      SELECT ${xExpr} AS x, ${col} AS y
      FROM ${TABLE} ${whereNonNull}
      ORDER BY x
    `);
    const values = valuesRes.toArray().map((row) => {
      const y = Number(row.y);
      return {
        x: xCol ? String(row.x ?? '') : Number(row.x),
        y,
        isOutlier: y < lower || y > upper,
      };
    });

    const outlierFilter = `(${col} < ${lower} OR ${col} > ${upper})`;
    const outlierWhere = where
      ? `${where} AND ${outlierFilter}`
      : `WHERE ${outlierFilter}`;
    const outExpr = xCol || 'ROW_NUMBER() OVER ()';
    const outliersRes = await this._conn.query(`
      SELECT ${outExpr} AS __x, * FROM ${TABLE} ${outlierWhere} ORDER BY __x
    `);
    const outliers = outliersRes.toArray().map((row) => ({
      x: xCol ? String(row.__x ?? '') : Number(row.__x),
      y: Number(row[column]),
      originalRow: this._columnNames.map((name) => row[name]),
    }));

    return {
      column, xColumn, method, threshold,
      stats: { mean, stdDev, min, max, q1, q3, iqr },
      bounds: { lower, upper },
      values, outliers,
      outlierCount: outliers.length,
      total: n,
    };
  }

    async trendAnalysis(xColumn, yColumn, options = {}, filters = []) {
    if (!this._dataset) return null;
    if (!this._columnTypes[xColumn] || !this._columnTypes[yColumn]) return null;
    if (this._columnTypes[yColumn] !== 'number') return null;

    const where = this._where(filters);
    const xCol = this._ident(xColumn);
    const yCol = this._ident(yColumn);
    const fn = options.aggregateFn || 'sum';
    const sqlFn = { sum: 'SUM', avg: 'AVG', count: 'COUNT', min: 'MIN', max: 'MAX' }[fn] || 'SUM';

    const res = await this._conn.query(`
      SELECT ${xCol} AS x, ${sqlFn}(${yCol}) AS y
      FROM ${TABLE} ${where}
      GROUP BY ${xCol}
      ORDER BY x
    `);
    const records = res.toArray()
      .map((r) => ({ x: r.x, y: Number(r.y) }))
      .filter((r) => Number.isFinite(r.y));

    return computeTrend(records, xColumn, yColumn, options);
  }

  async exportRows(filters = []) {
    if (!this._dataset) return { columns: [], rows: [] };
    const where = this._where(filters);
    const res = await this._conn.query(`SELECT * FROM ${TABLE} ${where}`);
    const rows = res.toArray().map((r) => this._rowToArray(r));
    return { columns: this._dataset.columns, rows };
  }

  async pivotTable({ rowColumn, colColumn, valueColumn, function: fn, filters = [] }) {
    const empty = {
      rowLabels: [], colLabels: [], matrix: [],
      rowTotals: [], colTotals: [], grandTotal: 0,
    };
    if (!this._dataset) return empty;
    if (!this._columnTypes[rowColumn] || !this._columnTypes[valueColumn]) {
      return empty;
    }
    if (colColumn && !this._columnTypes[colColumn]) return empty;

    const where = this._where(filters);
    const rCol = this._ident(rowColumn);
    const vCol = this._ident(valueColumn);
    const cCol = colColumn ? this._ident(colColumn) : null;

    let aggExpr;
    if (fn === 'count') aggExpr = `COUNT(${vCol})`;
    else {
      const sqlFn = { sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX' }[fn] || 'SUM';
      aggExpr = `${sqlFn}(${vCol})`;
    }

    // row labels
    const rowLabelsRes = await this._conn.query(
      `SELECT DISTINCT ${rCol} AS x FROM ${TABLE} ${where} ORDER BY x`
    );
    const rowLabels = rowLabelsRes.toArray().map((r) => (r.x === null ? '' : String(r.x)));

    // col labels
    let colLabels;
    if (cCol) {
      const colLabelsRes = await this._conn.query(
        `SELECT DISTINCT ${cCol} AS x FROM ${TABLE} ${where} ORDER BY x`
      );
      colLabels = colLabelsRes.toArray().map((r) => (r.x === null ? '' : String(r.x)));
    } else {
      colLabels = ['(nilai)'];
    }

    // detail
    const detailMap = new Map();
    if (cCol) {
      const detailRes = await this._conn.query(`
        SELECT ${rCol} AS r, ${cCol} AS c, ${aggExpr} AS v
        FROM ${TABLE} ${where}
        GROUP BY ${rCol}, ${cCol}
      `);
      detailRes.toArray().forEach((row) => {
        const r = String(row.r ?? '');
        const c = String(row.c ?? '');
        if (!detailMap.has(r)) detailMap.set(r, new Map());
        detailMap.get(r).set(c, Number(row.v) || 0);
      });
    } else {
      const detailRes = await this._conn.query(`
        SELECT ${rCol} AS r, ${aggExpr} AS v
        FROM ${TABLE} ${where}
        GROUP BY ${rCol}
      `);
      detailRes.toArray().forEach((row) => {
        const r = String(row.r ?? '');
        if (!detailMap.has(r)) detailMap.set(r, new Map());
        detailMap.get(r).set('(nilai)', Number(row.v) || 0);
      });
    }

    // row totals
    const rowTotalsRes = await this._conn.query(`
      SELECT ${rCol} AS r, ${aggExpr} AS v
      FROM ${TABLE} ${where}
      GROUP BY ${rCol}
    `);
    const rowTotalsMap = new Map();
    rowTotalsRes.toArray().forEach((row) => {
      rowTotalsMap.set(String(row.r ?? ''), Number(row.v) || 0);
    });

    // col totals
    let colTotals = [0];
    if (cCol) {
      const colTotalsRes = await this._conn.query(`
        SELECT ${cCol} AS c, ${aggExpr} AS v
        FROM ${TABLE} ${where}
        GROUP BY ${cCol}
      `);
      const map = new Map();
      colTotalsRes.toArray().forEach((row) => {
        map.set(String(row.c ?? ''), Number(row.v) || 0);
      });
      colTotals = colLabels.map((c) => map.get(c) ?? 0);
    }

    // grand total
    const grandRes = await this._conn.query(
      `SELECT ${aggExpr} AS v FROM ${TABLE} ${where}`
    );
    const grandTotal = Number(grandRes.toArray()[0]?.v) || 0;
    if (!cCol) colTotals = [grandTotal];

    // matrix
    const matrix = rowLabels.map((r) =>
      colLabels.map((c) => {
        const v = detailMap.get(r)?.get(c);
        return v === undefined ? null : v;
      })
    );

    const rowTotals = rowLabels.map((r) => rowTotalsMap.get(r) ?? 0);

    return { rowLabels, colLabels, matrix, rowTotals, colTotals, grandTotal };
  }

  // ---- Internals ----

  _ident(name) {
    return '"' + String(name).replace(/"/g, '""') + '"';
  }

  _sqlType(t) {
    switch (t) {
      case 'number':  return 'DOUBLE';
      case 'boolean': return 'BOOLEAN';
      default:        return 'VARCHAR';
    }
  }

  _fmt(v, type) {
    if (v === null || v === undefined || v === '') return 'NULL';
    if (type === 'number') {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
      return Number.isFinite(n) ? String(n) : 'NULL';
    }
    if (type === 'boolean') {
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      const s = String(v).toLowerCase();
      if (s === 'true' || s === '1') return 'TRUE';
      if (s === 'false' || s === '0') return 'FALSE';
      return 'NULL';
    }
    return "'" + String(v).replace(/'/g, "''") + "'";
  }

  _where(filters) {
    const active = (filters || []).filter((f) => {
      if (!this._columnTypes[f.column]) return false;
      if (f.value === undefined || f.value === null || f.value === '') return false;
      return true;
    });
    if (!active.length) return '';

    const conds = active.map((f) => {
      const col = this._ident(f.column);
      const type = this._columnTypes[f.column];
      if (f.operator === 'contains') {
        const safe = String(f.value).replace(/'/g, "''");
        return `CAST(${col} AS VARCHAR) ILIKE '%${safe}%'`;
      }
      const val = this._fmt(f.value, type);
      if (val === 'NULL') return '1=0';
      const op = {
        eq: '=', neq: '<>', gt: '>', lt: '<', gte: '>=', lte: '<=',
      }[f.operator] || '=';
      return `${col} ${op} ${val}`;
    });
    return 'WHERE ' + conds.join(' AND ');
  }

  _rowToArray(row) {
    return this._columnNames.map((name) => {
      const v = row[name];
      return v === null || v === undefined ? '' : v;
    });
  }
}