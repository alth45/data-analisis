import { IAnalyzer } from './analyzer-interface.js';
import { RealAnalyzer } from './real-analyzer.js';

export class AnalyzerProxy extends IAnalyzer {
  constructor() {
    super();
    this._impl = new RealAnalyzer();
    this._name = 'JS';
  }

  get engineName() { return this._name; }

  setImpl(impl, name) {
    this._impl = impl;
    this._name = name || 'unknown';
  }

  async loadDataset(ds) { return this._impl.loadDataset(ds); }
  async aggregate(q)    { return this._impl.aggregate(q); }
  async filterAndPaginate(f, l, o) { return this._impl.filterAndPaginate(f, l, o); }
  async describeColumn(c, f) { return this._impl.describeColumn(c, f); }
  async exportRows(f)   { return this._impl.exportRows(f); }
  async pivotTable(q)   { return this._impl.pivotTable(q); }
  async detectOutliers(c, o, f) { return this._impl.detectOutliers(c, o, f); }
  async trendAnalysis(x, y, o, f) { return this._impl.trendAnalysis(x, y, o, f); }

  async dispose() {
    try { await this._impl.dispose(); } catch { /* ignore */ }
    this._impl = new RealAnalyzer();
    this._name = 'JS';
  }
}