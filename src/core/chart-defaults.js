/**
 * Generate chart card templates saat dataset di-load.
 * Adaptif terhadap kolom apa pun — tidak hardcode "sales" saja.
 */

let counter = 0;
function nextId() {
  counter += 1;
  return `chart_${Date.now()}_${counter.toString(36)}`;
}

function titleCase(s) {
  return String(s)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {import('./dataset-model.js').Dataset} dataset
 * @returns {Array<import('../state/app-state.js').ChartConfig>}
 */
export function generateDefaultCharts(dataset) {
  if (!dataset) return [];

  const cols = dataset.columns;
  const strCols = cols.filter((c) => c.type === 'string');
  const numCols = cols.filter((c) => c.type === 'number');
  const dateCol = cols.find((c) => c.type === 'date')?.name;

  const s1 = strCols[0]?.name;
  const s2 = strCols[1]?.name ?? strCols[0]?.name;
  const n1 = numCols[0]?.name;
  const n2 = numCols[1]?.name;

  const charts = [];

  if (s1 && n1) {
    charts.push({
      id: nextId(),
      title: `${titleCase(n1)} by ${titleCase(s1)}`,
      type: 'bar',
      xColumn: s1,
      yColumn: n1,
      aggregateFn: 'sum',
    });
  }
  if (s2 && n1) {
    charts.push({
      id: nextId(),
      title: `${titleCase(n1)} by ${titleCase(s2)}`,
      type: 'pie',
      xColumn: s2,
      yColumn: n1,
      aggregateFn: 'sum',
    });
  }
  if (dateCol && n1) {
    charts.push({
      id: nextId(),
      title: `${titleCase(n1)} over ${titleCase(dateCol)}`,
      type: 'line',
      xColumn: dateCol,
      yColumn: n1,
      aggregateFn: 'sum',
    });
  }
  if (s1 && n2) {
    charts.push({
      id: nextId(),
      title: `Avg ${titleCase(n2)} by ${titleCase(s1)}`,
      type: 'bar',
      xColumn: s1,
      yColumn: n2,
      aggregateFn: 'avg',
    });
  }

  return charts;
}