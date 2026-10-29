import { IAnalyzer } from './analyzer-interface.js';

export class MockAnalyzer extends IAnalyzer {
  constructor() {
    super();
    this._dataset = null;
  }

  async loadDataset(dataset) {
    this._dataset = dataset;
    await new Promise((r) => setTimeout(r, 200));
  }

  async aggregate() {
    return [
      { x: 'Jakarta', y: 45_000_000 },
      { x: 'Bandung', y: 32_000_000 },
      { x: 'Surabaya', y: 28_000_000 },
      { x: 'Medan', y: 18_000_000 },
    ];
  }

  async filterAndPaginate(filters, limit, offset) {
    if (!this._dataset) return { rows: [], total: 0 };
    return {
      rows: this._dataset.rows.slice(offset, offset + limit),
      total: this._dataset.rowCount,
    };
  }

  async describeColumn() {
    return {
      type: 'number', count: 100, distinct: 100,
      min: 0, max: 100, mean: 50, median: 50,
    };
  }

  async exportRows() {
    if (!this._dataset) return { columns: [], rows: [] };
    return { columns: this._dataset.columns, rows: this._dataset.rows };
  }

  async pivotTable() {
    return {
      rowLabels: [], colLabels: [], matrix: [],
      rowTotals: [], colTotals: [], grandTotal: 0,
    };
  }

    async detectOutliers(column) {
    return {
      column,
      xColumn: null,
      method: 'iqr',
      threshold: 1.5,
      stats: { mean: 50, stdDev: 10, min: 0, max: 100, q1: 40, q3: 60, iqr: 20 },
      bounds: { lower: 10, upper: 90 },
      values: [],
      outliers: [],
      outlierCount: 0,
      total: 100,
    };
  }

  async trendAnalysis() {
    return null;
  }

  async dispose() {
    this._dataset = null;
  }
}
