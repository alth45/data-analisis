/**
 * Konfigurasi global + SWAP POINT analyzer.
 * ------------------------------------------------------------------
 * `analyzer` adalah AnalyzerProxy — default pakai RealAnalyzer (JS),
 * otomatis di-upgrade ke DuckDBAnalyzer di background (src/app.js)
 * kalau WASM berhasil di-load.
 *
 * Untuk memaksa JS (mis. debug offline), hapus pemanggilan
 * `tryUpgradeToDuckDB()` di app.js — tidak ada perubahan lain.
 * ------------------------------------------------------------------
 */
import { AnalyzerProxy } from './core/analyzer-proxy.js';

export const APP_CONFIG = {
  version: '1.1.0',
  phase: 'PDF Export (Fase 2)',
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxRows: 50_000,
  sampleDatasetPath: '/samples/sales-sample.csv',
  sampleName: 'sales-sample.csv',
  supportedExtensions: ['csv', 'json', 'tsv'],
  featureFlags: {
    realAnalytics: true,
    exportCsv: true,
    exportPng: true,
    indexedDB: true,
    duckdb: true,
    chartjs: true
  },
};

export const analyzer = new AnalyzerProxy();