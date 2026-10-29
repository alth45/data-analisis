/**
 * Adapter Chart.js — menggantikan renderer native sebagai default.
 *
 * Desain:
 *  - Setiap key (bar/line/pie/scatter) → renderer Chart.js
 *  - Native renderer tetap tersedia di key `-native` (fallback)
 *  - Kalau Chart.js gagal di runtime → otomatis fallback ke native
 *
 * Strategi render:
 *  Chart.js butuh canvas offscreen. Set `devicePixelRatio: dpr` supaya
 *  Chart.js render hi-DPI internal. Setelah constructor selesai, PANGGIL
 *  `chart.update('none')` untuk memaksa render sinkron — Chart.js
 *  kadang masih defer draw via requestAnimationFrame meski
 *  `animation: false`, yang menyebabkan `drawImage` menarik canvas kosong.
 */
import { Chart } from 'chart.js/auto';
import { registerChartRenderer } from './chart-registry.js';

import {
  PALETTE,
  drawBarInto,
  drawLineInto,
  drawBarMultiInto,
  drawLineMultiInto,
  drawPieInto,
  drawScatterInto,
  drawOutlierInto,
  drawHeatmapInto,
  drawTrendInto,
} from '../utils/chart-drawers.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Baca skala transform dari ctx (untuk DPR-aware rendering). */
function ctxScale(ctx) {
  try {
    const t = ctx.getTransform ? ctx.getTransform() : null;
    const a = t?.a;
    return Math.max(1, Number.isFinite(a) && a > 0 ? a : 1);
  } catch {
    return 1;
  }
}

/**
 * Render config Chart.js ke target ctx.
 * Return true kalau berhasil gambar (off canvas tidak kosong).
 */
function renderToTarget(targetCtx, w, h, chartConfig) {
  if (w < 2 || h < 2) {
    console.warn('[chartjs-adapter] canvas too small', { w, h });
    return false;
  }

  const dpr = ctxScale(targetCtx);

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;

  const chart = new Chart(off, {
    ...chartConfig,
    options: {
      ...chartConfig.options,
      responsive: false,
      animation: false,
      maintainAspectRatio: false,
      devicePixelRatio: dpr,
    },
  });

  // Force synchronous render — Chart.js kadang masih defer ke RAF meski
  // animation:false. `update('none')` secara eksplisit meminta update
  // tanpa animasi dan blocking sampai selesai.
  try {
    chart.update('none');
  } catch (err) {
    console.warn('[chartjs-adapter] chart.update failed', err);
  }

  targetCtx.drawImage(off, 0, 0, w, h);

  chart.destroy();
  return true;
}

function themeScales(colors) {
  return {
    x: {
      ticks: {
        color: colors.text,
        font: { size: 10, family: 'system-ui, sans-serif' },
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 20,
      },
      grid: { display: false },
      border: { color: colors.grid },
    },
    y: {
      ticks: {
        color: colors.text,
        font: { size: 10, family: 'system-ui, sans-serif' },
      },
      grid: { color: colors.grid },
      border: { color: colors.grid },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Config builders per type
// ─────────────────────────────────────────────────────────────

function barConfig(data, colors) {
  return {
    type: 'bar',
    data: {
      labels: data.map((d) => String(d.x)),
      datasets: [
        {
          data: data.map((d) => d.y),
          backgroundColor: data.map((_, i) => PALETTE[i % PALETTE.length]),
          borderColor: data.map((_, i) => PALETTE[i % PALETTE.length]),
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: themeScales(colors),
    },
  };
}

function lineConfig(data, colors) {
  return {
    type: 'line',
    data: {
      labels: data.map((d) => String(d.x)),
      datasets: [
        {
          data: data.map((d) => d.y),
          borderColor: colors.accent,
          backgroundColor: colors.accent + '22',
          borderWidth: 2,
          tension: 0.25,
          fill: false,
          pointBackgroundColor: data.map((_, i) => PALETTE[i % PALETTE.length]),
          pointBorderColor: colors.surface,
          pointBorderWidth: 1,
          pointRadius: 4,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: themeScales(colors),
    },
  };
}

function pieConfig(data, colors) {
  const pos = data.filter((d) => d.y > 0);
  return {
    type: 'pie',
    data: {
      labels: pos.map((d) => String(d.x)),
      datasets: [
        {
          data: pos.map((d) => d.y),
          backgroundColor: pos.map((_, i) => PALETTE[i % PALETTE.length]),
          borderWidth: 0,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: colors.text,
            font: { size: 11, family: 'system-ui, sans-serif' },
            boxWidth: 12,
            padding: 8,
            generateLabels(chart) {
              const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
              const total = chart.data.datasets[0].data.reduce((s, v) => s + v, 0);
              return items.map((item) => {
                const v = chart.data.datasets[0].data[item.index];
                const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';
                return { ...item, text: `${item.text} · ${pct}%` };
              });
            },
          },
        },
        tooltip: { enabled: false },
      },
    },
  };
}

function scatterConfig(data, colors) {
  return {
    type: 'line',
    data: {
      labels: data.map((d) => String(d.x)),
      datasets: [
        {
          data: data.map((d) => d.y),
          backgroundColor: colors.accent,
          borderColor: colors.accent,
          pointRadius: 6,
          pointHoverRadius: 6,
          pointBorderColor: colors.surface,
          pointBorderWidth: 1,
          showLine: false,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: themeScales(colors),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Multi-series config builder (bar / line)
// ─────────────────────────────────────────────────────────────

function multiSeriesConfig(data, colors, chartType) {
  const datasets = data.series.map((s, i) => {
    const color = s.color || PALETTE[i % PALETTE.length];
    const base = {
      label: s.name,
      data: s.data,
      backgroundColor: chartType === 'bar' ? color : color + '33',
      borderColor: color,
      borderWidth: chartType === 'bar' ? 1 : 2,
      yAxisID: s.axis === 'right' ? 'y1' : 'y',
      tension: 0.25,
      fill: false,
      spanGaps: true,
    };
    if (chartType === 'bar') {
      base.borderRadius = 4;
    } else {
      base.pointRadius = 3;
      base.pointHoverRadius = 3;
      base.pointBackgroundColor = color;
      base.pointBorderColor = colors.surface;
      base.pointBorderWidth = 1;
    }
    return base;
  });

  const hasRight = data.series.some((s) => s.axis === 'right');
  const leftSeries = data.series.find((s) => s.axis !== 'right');
  const rightSeries = data.series.find((s) => s.axis === 'right');

  const scales = {
    x: {
      ticks: {
        color: colors.text,
        font: { size: 10, family: 'system-ui, sans-serif' },
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 20,
      },
      grid: { display: false },
      border: { color: colors.grid },
    },
    y: {
      position: 'left',
      ticks: {
        color: colors.text,
        font: { size: 10, family: 'system-ui, sans-serif' },
      },
      grid: { color: colors.grid },
      border: { color: colors.grid },
      title: {
        display: hasRight && !!leftSeries,
        text: leftSeries?.name || '',
        color: colors.text,
        font: { size: 9, family: 'system-ui, sans-serif' },
      },
    },
  };

  if (hasRight) {
    scales.y1 = {
      position: 'right',
      ticks: {
        color: colors.text,
        font: { size: 10, family: 'system-ui, sans-serif' },
      },
      grid: { display: false },
      border: { color: colors.grid },
      title: {
        display: !!rightSeries,
        text: rightSeries?.name || '',
        color: colors.text,
        font: { size: 9, family: 'system-ui, sans-serif' },
      },
    };
  }

  return {
    type: chartType,
    data: { labels: data.labels, datasets },
    options: {
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: colors.text,
            font: { size: 10, family: 'system-ui, sans-serif' },
            boxWidth: 12,
            padding: 8,
          },
        },
        tooltip: { enabled: false },
      },
      scales,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Register — Chart.js sebagai default (dengan native fallback)
// ─────────────────────────────────────────────────────────────

registerChartRenderer({
  key: 'bar',
  label: 'Bar',
  source: 'chartjs',
  draw(ctx, w, h, data, colors) {
    try {
      if (data?.__multiSeries) {
        renderToTarget(ctx, w, h, multiSeriesConfig(data, colors, 'bar'));
      } else {
        if (!data.length) return;
        renderToTarget(ctx, w, h, barConfig(data, colors));
      }
    } catch (err) {
      console.error('[chartjs] bar failed, fallback to native', err);
      if (data?.__multiSeries) {
        drawBarMultiInto(ctx, w, h, data, colors);
      } else {
        drawBarInto(ctx, w, h, data, colors);
      }
    }
  },
});

registerChartRenderer({
  key: 'line',
  label: 'Line',
  source: 'chartjs',
  draw(ctx, w, h, data, colors) {
    try {
      if (data?.__multiSeries) {
        renderToTarget(ctx, w, h, multiSeriesConfig(data, colors, 'line'));
      } else {
        if (!data.length) return;
        renderToTarget(ctx, w, h, lineConfig(data, colors));
      }
    } catch (err) {
      console.error('[chartjs] line failed, fallback to native', err);
      if (data?.__multiSeries) {
        drawLineMultiInto(ctx, w, h, data, colors);
      } else {
        drawLineInto(ctx, w, h, data, colors);
      }
    }
  },
});

registerChartRenderer({
  key: 'pie',
  label: 'Pie',
  source: 'chartjs',
  draw(ctx, w, h, data, colors) {
    if (!data.length) return;
    try {
      renderToTarget(ctx, w, h, pieConfig(data, colors));
    } catch (err) {
      console.error('[chartjs] pie failed, fallback to native', err);
      drawPieInto(ctx, w, h, data, colors);
    }
  },
});

registerChartRenderer({
  key: 'scatter',
  label: 'Scatter',
  source: 'chartjs',
  draw(ctx, w, h, data, colors) {
    if (!data.length) return;
    try {
      renderToTarget(ctx, w, h, scatterConfig(data, colors));
    } catch (err) {
      console.error('[chartjs] scatter failed, fallback to native', err);
      drawScatterInto(ctx, w, h, data, colors);
    }
  },
});

// ─────────────────────────────────────────────────────────────
// Outlier — scatter + bounds
// ─────────────────────────────────────────────────────────────

function outlierConfig(result, colors) {
  const values = result.values;
  const n = values.length;
  const inliers = [];
  const outliers = [];
  values.forEach((v, i) => {
    const point = { x: i, y: v.y };
    if (v.isOutlier) outliers.push(point);
    else inliers.push(point);
  });

  return {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Inliers',
          data: inliers,
          backgroundColor: colors.accent,
          pointRadius: 3,
          pointHoverRadius: 3,
        },
        {
          label: 'Outliers',
          data: outliers,
          backgroundColor: '#ef4444',
          pointRadius: 6,
          pointHoverRadius: 6,
        },
        {
          label: 'Mean',
          data: [{ x: 0, y: result.stats.mean }, { x: n - 1, y: result.stats.mean }],
          type: 'line',
          borderColor: colors.accent,
          borderDash: [4, 4],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Upper bound',
          data: [{ x: 0, y: result.bounds.upper }, { x: n - 1, y: result.bounds.upper }],
          type: 'line',
          borderColor: '#ef4444',
          borderDash: [4, 4],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Lower bound',
          data: [{ x: 0, y: result.bounds.lower }, { x: n - 1, y: result.bounds.lower }],
          type: 'line',
          borderColor: '#ef4444',
          borderDash: [4, 4],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: colors.text,
            font: { size: 10, family: 'system-ui, sans-serif' },
            boxWidth: 12,
            padding: 8,
            filter: (item) => !item.text.includes('bound') && item.text !== 'Mean',
          },
        },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: colors.text,
            font: { size: 10, family: 'system-ui, sans-serif' },
            maxTicksLimit: 10,
            callback: (v) => {
              const idx = Math.round(v);
              if (idx < 0 || idx >= values.length) return '';
              return String(values[idx].x).slice(0, 10);
            },
          },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: colors.text,
            font: { size: 10, family: 'system-ui, sans-serif' },
          },
          grid: { color: colors.grid },
        },
      },
    },
  };
}

registerChartRenderer({
  key: 'outlier',
  label: 'Outlier',
  source: 'chartjs',
  draw(ctx, w, h, result, colors) {
    if (!result?.values?.length) return;
    try {
      renderToTarget(ctx, w, h, outlierConfig(result, colors));
    } catch (err) {
      console.error('[chartjs] outlier failed, fallback to native', err);
      drawOutlierInto(ctx, w, h, result, colors);
    }
  },
});

// ─────────────────────────────────────────────────────────────
// Native fallback — tetap tersedia via key `-native`
// ─────────────────────────────────────────────────────────────

registerChartRenderer({ key: 'bar-native',     label: 'Bar (Native)',     source: 'native', draw: drawBarInto });
registerChartRenderer({ key: 'line-native',    label: 'Line (Native)',    source: 'native', draw: drawLineInto });
registerChartRenderer({ key: 'pie-native',     label: 'Pie (Native)',     source: 'native', draw: drawPieInto });
registerChartRenderer({ key: 'scatter-native', label: 'Scatter (Native)', source: 'native', draw: drawScatterInto });