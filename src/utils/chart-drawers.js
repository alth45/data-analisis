/**
 * Drawer chart native (canvas 2D) — dipakai bersama oleh:
 *  - src/ui/chart-panel.js (single chart di view "Data")
 *  - src/ui/chart-card.js  (grid card di view "Charts")
 *
 * Ketika Step 9 (plug Chart.js) dieksekusi, drawer di sini tetap
 * jadi fallback. Registry chart-registry.js yang menentukan mana
 * yang dipakai.
 */

export const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

export function formatAxis(v) {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return String(Math.round(v));
}

export function getThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    surface:    cs.getPropertyValue('--surface').trim()        || '#1a1f28',
    text:       cs.getPropertyValue('--text-secondary').trim() || '#9aa0a6',
    textStrong: cs.getPropertyValue('--text-primary').trim()   || '#e8eaed',
    grid:       cs.getPropertyValue('--border').trim()         || '#2a3140',
    accent:     cs.getPropertyValue('--accent').trim()         || '#3b82f6',
  };
}

export function drawBarInto(ctx, w, h, data, colors) {
  const pad = { top: 30, right: 20, bottom: 46, left: 64 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  if (cw <= 0 || ch <= 0) return;

  const values = data.map((d) => d.y);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;

  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.text;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + cw, y);
    ctx.stroke();
    ctx.fillText(formatAxis(maxV - (range * i) / 4), pad.left - 6, y);
  }

  const gap = cw / data.length;
  const bw = Math.min(gap * 0.65, 70);
  data.forEach((d, i) => {
    const bh = (ch * (d.y - Math.min(0, minV))) / range;
    const x = pad.left + gap * i + (gap - bw) / 2;
    const y = pad.top + ch - bh;
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fillRect(x, y, bw, bh);

    ctx.fillStyle = colors.textStrong;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(formatAxis(d.y), x + bw / 2, y - 2);

    ctx.fillStyle = colors.text;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    const label = String(d.x);
    const maxChars = Math.max(4, Math.floor(gap / 9));
    ctx.fillText(
      label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label,
      x + bw / 2,
      pad.top + ch + 6
    );
  });
}

export function drawLineInto(ctx, w, h, data, colors) {
  const pad = { top: 30, right: 20, bottom: 46, left: 64 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  if (cw <= 0 || ch <= 0) return;

  const values = data.map((d) => d.y);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;

  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.text;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + cw, y);
    ctx.stroke();
    ctx.fillText(formatAxis(maxV - (range * i) / 4), pad.left - 6, y);
  }

  const stepX = data.length > 1 ? cw / (data.length - 1) : 0;
  const pts = data.map((d, i) => ({
    x: pad.left + stepX * i + (data.length === 1 ? cw / 2 : 0),
    y: pad.top + ch - (ch * (d.y - Math.min(0, minV))) / range,
  }));

  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();

  pts.forEach((p, i) => {
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = colors.text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  data.forEach((d, i) => {
    const label = String(d.x);
    const maxChars = Math.max(4, Math.floor(stepX / 9));
    ctx.fillText(
      label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label,
      pts[i].x,
      pad.top + ch + 6
    );
  });
}

export function drawPieInto(ctx, w, h, data, colors) {
  const pos = data.filter((d) => d.y > 0);
  if (!pos.length) return;
  const total = pos.reduce((s, d) => s + d.y, 0);
  const cx = w * 0.35;
  const cy = h / 2;
  const r = Math.min(w * 0.28, h * 0.42);

  let start = -Math.PI / 2;
  pos.forEach((d, i) => {
    const angle = (d.y / total) * Math.PI * 2;
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fill();
    start += angle;
  });

  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lx = cx + r + 16;
  const maxLegendItems = Math.min(pos.length, 12);
  pos.slice(0, maxLegendItems).forEach((d, i) => {
    const ly = cy - ((maxLegendItems - 1) * 20) / 2 + i * 20;
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fillRect(lx, ly - 6, 12, 12);
    ctx.fillStyle = colors.text;
    const pct = ((d.y / total) * 100).toFixed(1);
    const label = String(d.x);
    const short = label.length > 14 ? label.slice(0, 13) + '…' : label;
    ctx.fillText(`${short} · ${pct}%`, lx + 18, ly);
  });
  if (pos.length > maxLegendItems) {
    ctx.fillStyle = colors.text;
    ctx.fillText(
      `+ ${pos.length - maxLegendItems} lainnya`,
      lx + 18,
      cy + ((maxLegendItems - 1) * 20) / 2 + 20
    );
  }
}

export function drawScatterInto(ctx, w, h, data, colors) {
  const pad = { top: 30, right: 20, bottom: 46, left: 64 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  if (cw <= 0 || ch <= 0) return;

  const values = data.map((d) => d.y);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;

  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.text;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + cw, y);
    ctx.stroke();
    ctx.fillText(formatAxis(maxV - (range * i) / 4), pad.left - 6, y);
  }

  const stepX = data.length > 1 ? cw / (data.length - 1) : 0;
  data.forEach((d, i) => {
    const x = pad.left + stepX * i + (data.length === 1 ? cw / 2 : 0);
    const y = pad.top + ch - (ch * (d.y - Math.min(0, minV))) / range;
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Dispatcher. Return true kalau chart tergambar.
 */
export function drawChartInto(ctx, w, h, data, chartType, colors) {
  if (!data || !data.length) return false;
  if (chartType === 'bar')     { drawBarInto(ctx, w, h, data, colors); return true; }
  if (chartType === 'line')    { drawLineInto(ctx, w, h, data, colors); return true; }
  if (chartType === 'pie')     { drawPieInto(ctx, w, h, data, colors); return true; }
  if (chartType === 'scatter') { drawScatterInto(ctx, w, h, data, colors); return true; }
  return false;
}

/**
 * Outlier scatter: inlier (accent), outlier (merah), bounds (garis putus).
 * @param {object} outlierResult shape dari analyzer.detectOutliers()
 */
export function drawOutlierInto(ctx, w, h, outlierResult, colors) {
  const values = outlierResult?.values ?? [];
  if (!values.length) return;

  const pad = { top: 40, right: 20, bottom: 46, left: 64 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  if (cw <= 0 || ch <= 0) return;

  const ys = values.map((v) => v.y);
  const yMin = Math.min(...ys, outlierResult.bounds.lower);
  const yMax = Math.max(...ys, outlierResult.bounds.upper);
  const yRange = yMax - yMin || 1;

  const yToPx = (v) => pad.top + ch - ((v - yMin) / yRange) * ch;
  const xToPx = (i) => pad.left + (i / Math.max(1, values.length - 1)) * cw;

  // Grid
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.text;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const py = pad.top + (ch * i) / 4;
    const val = yMax - (yRange * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(pad.left + cw, py);
    ctx.stroke();
    ctx.fillText(formatAxis(val), pad.left - 6, py);
  }

  // Bounds (red dashed)
  ctx.strokeStyle = '#ef4444';
  ctx.setLineDash([6, 4]);
  const lowerY = yToPx(outlierResult.bounds.lower);
  const upperY = yToPx(outlierResult.bounds.upper);
  ctx.beginPath();
  ctx.moveTo(pad.left, upperY); ctx.lineTo(pad.left + cw, upperY); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pad.left, lowerY); ctx.lineTo(pad.left + cw, lowerY); ctx.stroke();

  // Mean (accent dashed)
  ctx.strokeStyle = colors.accent;
  const meanY = yToPx(outlierResult.stats.mean);
  ctx.beginPath();
  ctx.moveTo(pad.left, meanY); ctx.lineTo(pad.left + cw, meanY); ctx.stroke();
  ctx.setLineDash([]);

  // Labels for bounds
  ctx.fillStyle = '#ef4444';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`↑ ${formatAxis(outlierResult.bounds.upper)}`, pad.left + 4, upperY - 2);
  ctx.textBaseline = 'top';
  ctx.fillText(`↓ ${formatAxis(outlierResult.bounds.lower)}`, pad.left + 4, lowerY + 2);

  // Points
  values.forEach((v, i) => {
    const px = xToPx(i);
    const py = yToPx(v.y);
    if (v.isOutlier) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = colors.accent + '99';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Title overlay
  ctx.fillStyle = colors.textStrong;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `${outlierResult.column} — ${outlierResult.outlierCount}/${outlierResult.total} outliers · ${outlierResult.method.toUpperCase()} ×${outlierResult.threshold}`,
    pad.left, 8
  );
}


/**
 * Heatmap — grid cell berwarna, tiap cell = nilai aggregate 2 dimensi.
 * Input `data` adalah PivotResult: { rowLabels, colLabels, matrix, ... }.
 *
 * Color scale: low = biru, mid = kuning, high = merah.
 * Null cell = abu-abu tipis.
 */
export function drawHeatmapInto(ctx, w, h, data, colors) {
  const { rowLabels = [], colLabels = [], matrix = [] } = data || {};
  if (!rowLabels.length || !colLabels.length) return;

  // Compute min/max untuk color scale
  let min = Infinity, max = -Infinity;
  for (const row of matrix) {
    for (const v of row) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!Number.isFinite(min)) return;

  const rowLabelWidth = Math.min(140, Math.max(70, w * 0.18));
  const pad = { top: 32, right: 96, bottom: 24, left: rowLabelWidth + 10 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  if (cw <= 0 || ch <= 0) return;

  const cols = colLabels.length;
  const rows = rowLabels.length;
  const cellW = cw / cols;
  const cellH = ch / rows;
  const gap = 1;

  // Color interpolation: biru → kuning → merah
  const lowC = [37, 99, 235];
  const midC = [245, 158, 11];
  const highC = [239, 68, 68];
  const colorFor = (v) => {
    if (v === null || v === undefined || !Number.isFinite(v)) {
      return 'rgba(128,128,128,0.15)';
    }
    const t = max > min ? (v - min) / (max - min) : 0.5;
    let r, g, b;
    if (t < 0.5) {
      const u = t * 2;
      r = lowC[0] + (midC[0] - lowC[0]) * u;
      g = lowC[1] + (midC[1] - lowC[1]) * u;
      b = lowC[2] + (midC[2] - lowC[2]) * u;
    } else {
      const u = (t - 0.5) * 2;
      r = midC[0] + (highC[0] - midC[0]) * u;
      g = midC[1] + (highC[1] - midC[1]) * u;
      b = midC[2] + (highC[2] - midC[2]) * u;
    }
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  };

  // Cells
  for (let ri = 0; ri < rows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      const v = matrix[ri]?.[ci];
      const x = pad.left + ci * cellW;
      const y = pad.top + ri * cellH;
      ctx.fillStyle = colorFor(v);
      ctx.fillRect(x + gap, y + gap, cellW - gap * 2, cellH - gap * 2);

      if (cellW > 44 && cellH > 20 && v !== null && Number.isFinite(v)) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatAxis(v), x + cellW / 2, y + cellH / 2);
      }
    }
  }

  // Row labels (kiri)
  ctx.fillStyle = colors.text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const maxRowChars = Math.floor((rowLabelWidth - 6) / 6.5);
  rowLabels.forEach((label, ri) => {
    const y = pad.top + ri * cellH + cellH / 2;
    const short = label.length > maxRowChars
      ? label.slice(0, maxRowChars - 1) + '…' : label;
    ctx.fillText(short, pad.left - 6, y);
  });

  // Col labels (atas)
  ctx.fillStyle = colors.text;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  colLabels.forEach((label, ci) => {
    const x = pad.left + ci * cellW + cellW / 2;
    const maxColChars = Math.max(3, Math.floor(cellW / 6));
    const short = label.length > maxColChars
      ? label.slice(0, maxColChars - 1) + '…' : label;
    ctx.fillText(short, x, pad.top - 4);
  });

  // Legend bar (kanan)
  const legendW = 12;
  const legendH = Math.min(ch * 0.6, 220);
  const legendX = w - pad.right + 20;
  const legendY = pad.top + (ch - legendH) / 2;
  const grad = ctx.createLinearGradient(0, legendY, 0, legendY + legendH);
  grad.addColorStop(0, colorFor(max));
  grad.addColorStop(0.5, colorFor((min + max) / 2));
  grad.addColorStop(1, colorFor(min));
  ctx.fillStyle = grad;
  ctx.fillRect(legendX, legendY, legendW, legendH);
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, legendW, legendH);

  ctx.fillStyle = colors.text;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatAxis(max), legendX + legendW + 4, legendY + 4);
  ctx.fillText(formatAxis((min + max) / 2), legendX + legendW + 4, legendY + legendH / 2);
  ctx.fillText(formatAxis(min), legendX + legendW + 4, legendY + legendH - 4);
}

/**
 * Trend chart — original line + moving average + regression line + forecast.
 * Input `result` = TrendResult dari analyzer.trendAnalysis().
 */
export function drawTrendInto(ctx, w, h, result, colors) {
  if (!result?.points?.length) return;
  const points = result.points;
  const forecast = result.forecast || [];
  const n = points.length;
  const nTotal = n + forecast.length;

  const pad = { top: 54, right: 20, bottom: 56, left: 68 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  if (cw <= 0 || ch <= 0) return;

  const ys = points.map((p) => p.y);
  const fitYs = result.trendLine.map((t) => t.y);
  const forecastYs = forecast.map((f) => f.y);
  const maYs = points.map((p) => p.ma).filter((v) => v !== null);
  const allYs = [...ys, ...fitYs, ...forecastYs, ...maYs];
  const yMin = Math.min(...allYs);
  const yMax = Math.max(...allYs);
  const yRange = yMax - yMin || 1;

  const xToPx = (idx) => pad.left + (idx / Math.max(1, nTotal - 1)) * cw;
  const yToPx = (v) => pad.top + ch - ((v - yMin) / yRange) * ch;

  // Grid
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.text;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const py = pad.top + (ch * i) / 4;
    const val = yMax - (yRange * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(pad.left + cw, py);
    ctx.stroke();
    ctx.fillText(formatAxis(val), pad.left - 6, py);
  }

  // Forecast boundary
  if (forecast.length > 0) {
    ctx.strokeStyle = colors.grid;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xToPx(n - 1), pad.top);
    ctx.lineTo(xToPx(n - 1), pad.top + ch);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.text;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('forecast →', xToPx(n - 1) - 4, pad.top + 4);
  }

  // Original line
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const px = xToPx(i);
    const py = yToPx(p.y);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Points
  points.forEach((p, i) => {
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(xToPx(i), yToPx(p.y), 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Moving average
  const maPts = points.map((p, i) => ({ i, ma: p.ma })).filter((p) => p.ma !== null);
  if (maPts.length > 1) {
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    maPts.forEach((p, idx) => {
      const px = xToPx(p.i);
      const py = yToPx(p.ma);
      idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Trend line (extend into forecast)
  const trendEnd = forecast.length > 0
    ? { xIdx: forecast[forecast.length - 1].xIdx, y: forecast[forecast.length - 1].y }
    : result.trendLine[1];
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(xToPx(result.trendLine[0].xIdx), yToPx(result.trendLine[0].y));
  ctx.lineTo(xToPx(trendEnd.xIdx), yToPx(trendEnd.y));
  ctx.stroke();
  ctx.setLineDash([]);

  // Forecast hollow dots
  forecast.forEach((f) => {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = colors.surface;
    ctx.beginPath();
    ctx.arc(xToPx(f.xIdx), yToPx(f.y), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // X labels (sparse)
  ctx.fillStyle = colors.text;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = Math.max(1, Math.floor(nTotal / Math.min(8, nTotal)));
  for (let i = 0; i < nTotal; i += step) {
    const xVal = i < n ? points[i].x : forecast[i - n].x;
    const label = String(xVal);
    const short = label.length > 10 ? label.slice(0, 9) + '…' : label;
    ctx.fillText(short, xToPx(i), pad.top + ch + 6);
  }

  // Annotation top-left
  const dirIcon = result.summary.direction === 'up' ? '↑'
    : result.summary.direction === 'down' ? '↓' : '→';
  const dirColor = result.summary.direction === 'up' ? '#10b981'
    : result.summary.direction === 'down' ? '#ef4444' : colors.text;
  ctx.fillStyle = dirColor;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `${dirIcon} ${result.summary.direction.toUpperCase()}  ·  slope=${result.regression.slope.toFixed(3)}  ·  R²=${result.regression.r2.toFixed(3)}`,
    pad.left, 6
  );

  // Legend (bottom)
  const items = [
    { label: 'Actual', color: colors.accent, kind: 'line' },
    { label: `MA(${result.movingAvgWindow})`, color: '#10b981', kind: 'dash' },
    { label: 'Trend', color: '#ef4444', kind: 'dash' },
  ];
  if (forecast.length > 0) items.push({ label: 'Forecast', color: '#ef4444', kind: 'hollow' });

  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let lx = pad.left;
  const ly = pad.top + ch + 32;
  items.forEach((item) => {
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineWidth = 1.5;
    if (item.kind === 'hollow') {
      ctx.beginPath();
      ctx.arc(lx + 6, ly, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (item.kind === 'dash') {
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 14, ly);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 14, ly);
      ctx.stroke();
    }
    ctx.fillStyle = colors.text;
    ctx.fillText(item.label, lx + 20, ly);
    lx += 22 + ctx.measureText(item.label).width + 14;
  });
}

// ─────────────────────────────────────────────────────────────
// Multi-series native fallback (single-scale — dual axis hanya di Chart.js)
// ─────────────────────────────────────────────────────────────

function _multiScale(data) {
  let maxV = 0;
  let minV = 0;
  data.series.forEach((s) => {
    s.data.forEach((v) => {
      if (typeof v === 'number' && Number.isFinite(v)) {
        if (v > maxV) maxV = v;
        if (v < minV) minV = v;
      }
    });
  });
  return { maxV, minV, range: maxV - minV || 1 };
}

function _drawMultiLegend(ctx, w, h, data, colors) {
  const items = data.series.map((s, i) => ({
    label: s.name,
    color: s.color || PALETTE[i % PALETTE.length],
  }));
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const y = h - 12;
  let x = 12;
  items.forEach((it) => {
    ctx.fillStyle = it.color;
    ctx.fillRect(x, y - 5, 10, 10);
    ctx.fillStyle = colors.text;
    ctx.fillText(it.label, x + 14, y);
    x += 14 + ctx.measureText(it.label).width + 16;
  });
}

function _drawMultiAxis(ctx, w, h, data, colors, pad, ch) {
  const { maxV, minV, range } = _multiScale(data);
  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.text;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const py = pad.top + (ch * i) / 4;
    const val = maxV - (range * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(pad.left + (w - pad.left - pad.right), py);
    ctx.stroke();
    ctx.fillText(formatAxis(val), pad.left - 6, py);
  }
  return { maxV, minV, range };
}

export function drawBarMultiInto(ctx, w, h, data, colors) {
  const n = data.labels.length;
  const sCount = data.series.length;
  if (!n || !sCount) return;

  const pad = { top: 34, right: 20, bottom: 52, left: 64 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  if (cw <= 0 || ch <= 0) return;

  const { minV, range } = _drawMultiAxis(ctx, w, h, data, colors, pad, ch);
  const hasRight = data.series.some((s) => s.axis === 'right');

  const groupW = cw / n;
  const barW = Math.min((groupW * 0.75) / sCount, 40);
  const groupPad = (groupW - barW * sCount) / 2;

  data.labels.forEach((lbl, i) => {
    const groupX = pad.left + i * groupW + groupPad;
    data.series.forEach((se, si) => {
      const v = se.data[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) return;
      const bh = (ch * (v - Math.min(0, minV))) / range;
      const x = groupX + si * barW;
      const y = pad.top + ch - bh;
      ctx.fillStyle = se.color || PALETTE[si % PALETTE.length];
      ctx.fillRect(x, y, Math.max(1, barW - 1), bh);
    });
    // x label
    ctx.fillStyle = colors.text;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const label = String(lbl);
    const maxChars = Math.max(4, Math.floor(groupW / 8));
    ctx.fillText(
      label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label,
      pad.left + i * groupW + groupW / 2,
      pad.top + ch + 6
    );
  });

  _drawMultiLegend(ctx, w, h, data, colors);

  if (hasRight) {
    ctx.fillStyle = colors.text;
    ctx.font = 'italic 9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('native: dual axis tidak didukung — semua di left', w - 12, 6);
  }
}

export function drawLineMultiInto(ctx, w, h, data, colors) {
  const n = data.labels.length;
  const sCount = data.series.length;
  if (!n || !sCount) return;

  const pad = { top: 34, right: 20, bottom: 52, left: 64 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  if (cw <= 0 || ch <= 0) return;

  const { minV, range } = _drawMultiAxis(ctx, w, h, data, colors, pad, ch);
  const hasRight = data.series.some((s) => s.axis === 'right');
  const stepX = n > 1 ? cw / (n - 1) : 0;

  data.series.forEach((se, si) => {
    const color = se.color || PALETTE[si % PALETTE.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    se.data.forEach((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) { started = false; return; }
      const x = pad.left + stepX * i + (n === 1 ? cw / 2 : 0);
      const y = pad.top + ch - (ch * (v - Math.min(0, minV))) / range;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // points
    se.data.forEach((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return;
      const x = pad.left + stepX * i + (n === 1 ? cw / 2 : 0);
      const y = pad.top + ch - (ch * (v - Math.min(0, minV))) / range;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // x labels
  ctx.fillStyle = colors.text;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = Math.max(1, Math.floor(n / 10));
  for (let i = 0; i < n; i += step) {
    const label = String(data.labels[i]);
    const maxChars = Math.max(4, Math.floor(stepX / 8) || 10);
    ctx.fillText(
      label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label,
      pad.left + stepX * i + (n === 1 ? cw / 2 : 0),
      pad.top + ch + 6
    );
  }

  _drawMultiLegend(ctx, w, h, data, colors);

  if (hasRight) {
    ctx.fillStyle = colors.text;
    ctx.font = 'italic 9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('native: dual axis tidak didukung — semua di left', w - 12, 6);
  }
}

/**
 * Update drawBarInto / drawLineInto asli agar delegate ke multi kalau shape
 * multi-series. Ini memastikan native fallback tidak crash.
 */
const _originalDrawBarInto = drawBarInto;
const _originalDrawLineInto = drawLineInto;
// Tidak menimpa signature export; chart-registry memanggil sesuai key.