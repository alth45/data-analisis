# Data Analysis Tool — Skeleton (Fase 1)

Web app skeleton untuk upload dataset, preview tabel, dan UI analitik.
**Fase 1**: layout, state management, upload parser, tabel preview, chart
placeholder, tools panel. **Tanpa** engine analitik & chart sungguhan.

- Stack: **Vite 5 + Vanilla JS + CSS variables**
- Parser: `papaparse` (CSV/TSV), native `JSON.parse` (JSON)
- Chart: `<canvas>` placeholder (bukan Chart.js/ECharts)
- Tanpa DuckDB / AlaSQL di fase ini

---

## Cara Run

```bash
npm install
npm run dev
```


# Engine Analitik — RealAnalyzer vs DuckDB

## App menjalankan **dua engine** dengan cara transparan:

| Engine | Kapan aktif | Karakteristik |
|--------|-------------|---------------|
| `RealAnalyzer` (JS) | Default, saat bootstrap | Instant, zero network, loop JS O(n) |
| `DuckDBAnalyzer` (wasm) | Setelah ~1-2s bootstrap | SQL engine, cepat untuk dataset besar, butuh internet |

## Cara Kerja Upgrade

`src/app.js` → `tryUpgradeToDuckDB`:

1. Bootstrap → engine default = JS, UI siap dipakai.
2. Background: init DuckDB wasm via JsDelivr bundles.
3. Sukses → `analyzer.setImpl(duckDBAnalyzer, 'DuckDB')` → re-load dataset aktif → semua panel auto re-render → status bar badge berubah jadi **Engine: DuckDB** (kuning).
4. Gagal (offline / WASM error) → tetap JS, tanpa toast error. Cek console: `DuckDB upgrade failed`.

## Swap Manual

Kalau butuh paksa pakai JS, misal offline dev:

```js
// src/config.js
featureFlags: {
  duckdb: false, // ← matikan background upgrade
}
```

**Untuk memaksa DuckDB-only tanpa fallback** (misal production dengan CDN lokal): ganti `RealAnalyzer` default di `analyzer-proxy.js` dengan `DuckDBAnalyzer`, dan await `init()` di bootstrap sebelum `renderLayout`.

## Kontrak `IAnalyzer`

`src/core/analyzer-interface.js` tidak berubah antara kedua implementasi. Menambah engine ketiga (mis. DuckDB native backend) cukup:

```js
class MyEngine extends IAnalyzer { ... }
analyzer.setImpl(new MyEngine(), 'MyEngine');
```

Dan update Known Limitations — hapus baris "> 10.000 baris" dari Fase 1:

```diff
- - Maks 10MB / 50.000 baris
+ - Maks 10MB / 50.000 baris (parser). DuckDB engine bisa handle lebih
+   besar, tapi UI table virtualization masih basic.
```

## Verifikasi

Setelah `npm install` + hot reload:

### A — Bootstrap

- Console: tidak ada error
- Status bar kanan: Engine: JS (badge abu-abu)
- Setelah ~1-2s: console log `[DAT] DuckDB ready in XXXms`, toast "Engine upgraded to DuckDB (XXXms)", badge berubah jadi Engine: DuckDB (kuning)

### B — Load sample sebelum DuckDB ready (race condition)

- Hard refresh (Ctrl+Shift+R) → langsung klik Sample dalam <1 detik
- Tabel tampil (via JS engine) — instant
- Setelah DuckDB ready → toast muncul → tabel re-render (tidak berkedip aneh)
- Badge jadi DuckDB

### C — Load sample setelah DuckDB ready

- Hard refresh → tunggu ~2s sampai badge DuckDB
- Klik Sample → dataset masuk langsung ke DuckDB
- Console tidak ada error

### D — Regresi fungsional penuh (pakai DuckDB)

Semua test dari Step 2–5 harus tetap ✅:

- Filter: `region eq Jakarta` → Apply → tabel 25 baris, chart 1 bar
- Aggregate: ganti X=product, Y=revenue, fn=sum → 5 bar dengan sum revenue per produk
- Aggregate dengan filter: filter Jakarta + aggregate revenue by product → hanya product dari Jakarta
- Statistics: 5 cards, revenue punya Min/Max/Mean/Median nyata (bukan 0/100)
- Export tanpa filter: 100 baris, angka ter-format benar
- Export dengan filter: 25 baris
- Export edge: filter `region eq PlanetMars` → toast warning, tidak download

### E — Perbandingan engine (opsional tapi worth checking)

1. Test dengan DuckDB (default)
2. Set `featureFlags.duckdb = false` di config, hard reload → test lagi dengan JS
3. Bandingkan:
   - Angka filter count harus identik
   - Angka aggregate harus identik (minor floating point diff bisa terjadi, <0.01%)
   - Statistics min/max identik, mean/median bisa ~identik
   - Export CSV baris & kolom identik

Kalau ada perbedaan besar → bug logic di salah satu engine. Kabari saya.

### F — Failure fallback

- Putus internet / disable network di DevTools → hard reload
- Console: `[DAT] DuckDB upgrade failed, using JS engine` (warn, bukan error)
- Status bar tetap Engine: JS
- Semua fitur tetap jalan (RealAnalyzer)

### G — Upload dataset baru setelah DuckDB ready

- Setelah DuckDB ready, upload CSV berbeda
- `analyzer.loadDataset(ds)` → `DuckDBAnalyzer.loadDataset` → drop + create + insert
- Tabel & chart update normal
- Filter & statistics jalan di dataset baru

### H — Keyboard shortcut export

- Ctrl/Cmd + E → sama seperti klik Export
- Tetap jalan baik di JS maupun DuckDB engine

## Ringkasan

| Sebelum | Sesudah |
|---------|---------|
| RealAnalyzer (JS loops) | Default JS, auto-upgrade ke DuckDB wasm |
| Interface static | AnalyzerProxy swap di runtime |
| — | Fallback otomatis ke JS (offline-safe) |
| — | Engine: JS/DuckDB badge di status bar |
| — | Dataset yang sudah di-load di-reload saat swap |
| — | Race condition upload-during-swap ter-handle |
| — | `featureFlags.duckdb` untuk opt-out |