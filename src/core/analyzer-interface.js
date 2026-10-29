/**
 * =====================================================================
 *  KONTRAK ENGINE ANALITIK — FASE 2
 * =====================================================================
 */

/**
 * @typedef {Object} Filter
 * @property {string} column
 * @property {'eq'|'neq'|'gt'|'lt'|'gte'|'lte'|'contains'} operator
 * @property {any} value
 */

/**
 * @typedef {Object} AggregateQuery
 * @property {string} xColumn
 * @property {string} yColumn
 * @property {'sum'|'avg'|'count'|'min'|'max'} function
 * @property {Filter[]} filters
 */

/**
 * @typedef {Object} ColumnStats
 * @property {string} type
 * @property {number} count
 * @property {number} distinct
 * @property {number|null} min
 * @property {number|null} max
 * @property {number|null} mean
 * @property {number|null} median
 * @property {number|null} stdDev       — sample std dev (n-1)
 * @property {number|null} q1           — 25th percentile
 * @property {number|null} q3           — 75th percentile
 * @property {number|null} iqr          — q3 - q1
 * @property {number|null} outlierCount — outliers by IQR ×1.5 (default)
 * @property {{lower: number, upper: number}|null} outlierBounds
 */

/**
 * @typedef {Object} OutlierOptions
 * @property {'iqr'|'zscore'} [method='iqr']
 * @property {number} [threshold]     — 1.5 (iqr) / 3 (zscore)
 * @property {string|null} [xColumn]  — null = row index
 */

/**
 * @typedef {Object} OutlierResult
 * @property {string} column
 * @property {string|null} xColumn
 * @property {'iqr'|'zscore'} method
 * @property {number} threshold
 * @property {{mean: number, stdDev: number, min: number, max: number, q1: number, q3: number, iqr: number}} stats
 * @property {{lower: number, upper: number}} bounds
 * @property {Array<{x: any, y: number, rowIndex: number, isOutlier: boolean}>} values
 * @property {Array<{x: any, y: number, rowIndex: number, originalRow: any[]}>} outliers
 * @property {number} outlierCount
 * @property {number} total
 */

/**
 * @typedef {Object} ExportResult
 * @property {Array<{name: string, type: string}>} columns
 * @property {Array<Array<any>>} rows
 */

/**
 * @typedef {Object} PivotQuery
 * @property {string} rowColumn
 * @property {string|null} colColumn
 * @property {string} valueColumn
 * @property {'sum'|'avg'|'count'|'min'|'max'} function
 * @property {Filter[]} filters
 */

/**
 * @typedef {Object} PivotResult
 * @property {string[]} rowLabels
 * @property {string[]} colLabels
 * @property {(number|null)[][]} matrix
 * @property {number[]} rowTotals
 * @property {number[]} colTotals
 * @property {number} grandTotal
 */


/**
 * @typedef {Object} TrendOptions
 * @property {number} [movingAvgWindow=3]
 * @property {number} [forecastPeriods=5]
 * @property {'sum'|'avg'|'count'|'min'|'max'} [aggregateFn='sum']
 */

/**
 * @typedef {Object} TrendResult
 * @property {string} xColumn
 * @property {string} yColumn
 * @property {Array<{x:any,y:number,xIdx:number,ma:number|null,predicted:number}>} points
 * @property {{slope:number,intercept:number,r2:number,se:number}} regression
 * @property {{first:number,last:number,changeAbs:number,changePct:number|null,direction:'up'|'down'|'flat',cagr:number|null}} summary
 * @property {Array<{xIdx:number,y:number}>} trendLine
 * @property {Array<{xIdx:number,x:any,y:number}>} forecast
 * @property {number} movingAvgWindow
 * @property {number} forecastPeriods
 * @property {boolean} isDateX
 * @property {boolean} isNumericX
 */


export class IAnalyzer {
  async loadDataset(dataset) { throw new Error('Not implemented'); }
  async aggregate(query) { throw new Error('Not implemented'); }
  async filterAndPaginate(filters, limit, offset) { throw new Error('Not implemented'); }
  async describeColumn(column, filters) { throw new Error('Not implemented'); }
  async exportRows(filters) { throw new Error('Not implemented'); }
  async pivotTable(query) { throw new Error('Not implemented'); }

  /**
   * Detect outliers di kolom numerik.
   * @param {string} column
   * @param {OutlierOptions} options
   * @param {Filter[]} filters
   * @returns {Promise<OutlierResult|null>}
   */
  async detectOutliers(column, options, filters) {
    throw new Error('Not implemented');
  }

    /**
   * Analisis trend pada time series.
   * @param {string} xColumn
   * @param {string} yColumn
   * @param {TrendOptions} options
   * @param {Filter[]} filters
   * @returns {Promise<TrendResult|null>}
   */
  async trendAnalysis(xColumn, yColumn, options, filters) {
    throw new Error('Not implemented');
  }

  async dispose() { throw new Error('Not implemented'); }
}