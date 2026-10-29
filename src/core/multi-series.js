/**
 * Fetch + merge data untuk multi-series chart.
 * Setiap series di-aggregate independen, lalu digabung by x (union).
 */
export async function fetchMultiSeries(analyzer, xColumn, series, filters) {
  const validSeries = series.filter((s) => s.yColumn);
  if (!validSeries.length) {
    return { __multiSeries: true, labels: [], series: [] };
  }

  const results = await Promise.all(
    validSeries.map((s) =>
      analyzer.aggregate({
        xColumn,
        yColumn: s.yColumn,
        function: s.aggregateFn || 'sum',
        filters,
      })
    )
  );

  // Union of x values, numerik-aware sort
  const xSet = new Set();
  results.forEach((r) => r.forEach((p) => xSet.add(String(p.x))));
  const labels = [...xSet].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const seriesData = validSeries.map((s, i) => {
    const map = new Map();
    results[i].forEach((p) => map.set(String(p.x), p.y));
    return {
      name: `${(s.aggregateFn || 'sum').toUpperCase()}(${s.yColumn})`,
      yColumn: s.yColumn,
      aggregateFn: s.aggregateFn || 'sum',
      axis: s.axis === 'right' ? 'right' : 'left',
      color: s.color || null,
      data: labels.map((x) => (map.has(x) ? map.get(x) : null)),
    };
  });

  return { __multiSeries: true, labels, series: seriesData };
}

/** Normalisasi config: selalu kembalikan array series (backward compat). */
export function normalizeSeries(config) {
  if (config.series && config.series.length) {
    return config.series.filter((s) => s.yColumn);
  }
  if (config.yColumn) {
    return [{
      yColumn: config.yColumn,
      aggregateFn: config.aggregateFn || 'sum',
      axis: 'left',
    }];
  }
  return [];
}