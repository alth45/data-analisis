import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: false },
  // DuckDB pakai worker + WASM; pre-bundling bisa memecah worker URL.
  // Exclude supaya module di-load apa adanya.
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
});