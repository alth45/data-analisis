/**
 * Shared trend computation — dipakai RealAnalyzer & DuckDBAnalyzer.
 * Pure function, tidak touch engine state.
 *
 * Input `records`: [{ x, y }] — x bisa date/numeric/string, y numeric.
 * Sort otomatis by x (numeric/date). Index jadi xIdx untuk regression.
 *
 * @param {Array<{x:any, y:number}>} records
 * @param {string} xColumn
 * @param {string} yColumn
 * @param {{movingAvgWindow?:number, forecastPeriods?:number}} options
 * @returns {object|null}
 */
export function computeTrend(records, xColumn, yColumn, options = {}) {
  if (!records || records.length < 2) return null;

  const maWindow = Math.max(2, options.movingAvgWindow ?? 3);
  const forecastPeriods = Math.max(0, Math.min(100, options.forecastPeriods ?? 5));

  const xsNumeric = records.every((r) => !Number.isNaN(Number(r.x)));
  const xsDates = !xsNumeric && records.every((r) => !Number.isNaN(Date.parse(String(r.x))));

  const sorted = records.slice();
  if (xsNumeric) sorted.sort((a, b) => Number(a.x) - Number(b.x));
  else if (xsDates) sorted.sort((a, b) => Date.parse(a.x) - Date.parse(b.x));

  const ys = sorted.map((r) => r.y);
  const n = ys.length;
  if (n < 2) return null;

  // ── OLS linear regression: y = slope * i + intercept ──
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += ys[i];
    sumXY += i * ys[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  let ssTotal = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTotal += (ys[i] - meanY) ** 2;
    ssRes += (ys[i] - (slope * i + intercept)) ** 2;
  }
  const r2 = ssTotal === 0 ? 1 : 1 - ssRes / ssTotal;
  const se = n > 2 ? Math.sqrt(ssRes / (n - 2) / (sumXX - sumX * sumX / n)) : 0;

  // ── Moving average ──
  const ma = ys.map((_, i) => {
    if (i < maWindow - 1) return null;
    let s = 0;
    for (let j = i - maWindow + 1; j <= i; j++) s += ys[j];
    return s / maWindow;
  });

  // ── Summary ──
  const first = ys[0], last = ys[n - 1];
  const changeAbs = last - first;
  const changePct = first !== 0 ? (changeAbs / Math.abs(first)) * 100 : null;
  const direction = Math.abs(slope) < 1e-9 ? 'flat' : slope > 0 ? 'up' : 'down';

  // ── CAGR — butuh x berupa tanggal ──
  let cagr = null;
  if (xsDates && first > 0 && last > 0) {
    const t0 = Date.parse(sorted[0].x);
    const t1 = Date.parse(sorted[n - 1].x);
    const years = (t1 - t0) / (365.25 * 24 * 3600 * 1000);
    if (years > 0) cagr = (Math.pow(last / first, 1 / years) - 1) * 100;
  }

  // ── Points ──
  const points = sorted.map((r, i) => ({
    x: r.x,
    y: r.y,
    xIdx: i,
    ma: ma[i],
    predicted: slope * i + intercept,
  }));

  const trendLine = [
    { xIdx: 0, y: intercept },
    { xIdx: n - 1, y: slope * (n - 1) + intercept },
  ];

  // ── Forecast ──
  const forecast = [];
  if (forecastPeriods > 0) {
    let xDelta = 1;
    if (xsNumeric && n > 1) {
      xDelta = (Number(sorted[n - 1].x) - Number(sorted[0].x)) / (n - 1);
    } else if (xsDates && n > 1) {
      xDelta = (Date.parse(sorted[n - 1].x) - Date.parse(sorted[0].x)) / (n - 1);
    }
    for (let i = 1; i <= forecastPeriods; i++) {
      const fx = n - 1 + i;
      let fxLabel;
      if (xsNumeric) fxLabel = Number(sorted[n - 1].x) + xDelta * i;
      else if (xsDates) {
        fxLabel = new Date(Date.parse(sorted[n - 1].x) + xDelta * i)
          .toISOString().slice(0, 10);
      } else fxLabel = String(sorted[n - 1].x) + ' +' + i;
      forecast.push({ xIdx: fx, x: fxLabel, y: slope * fx + intercept });
    }
  }

  return {
    xColumn, yColumn,
    points,
    regression: { slope, intercept, r2, se },
    summary: { first, last, changeAbs, changePct, direction, cagr },
    trendLine,
    forecast,
    movingAvgWindow: maWindow,
    forecastPeriods,
    isDateX: xsDates,
    isNumericX: xsNumeric,
  };
}