import './styles/variables.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/themes.css';

import { bootstrap } from './app.js';

// ─────────────────────────────────────────────────────────────
// Register Chart.js sebagai renderer default.
// Import SETELAH app.js supaya chart-registry sudah terinisialisasi
// (native di-register dulu, lalu CJS override — ini jalur fallback
// yang aman kalau adapter gagal load).
// ─────────────────────────────────────────────────────────────
import './core/chartjs-adapter.js';

const root = document.getElementById('app');
bootstrap(root);