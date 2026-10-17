// Sequential Gaussian simulation on the fine 3D grid (Earth Modeling 3D grid
// upgrade, 2026-10-17; owner decision 4: porosity by SGS, seeded and
// reproducible, kriging kept as an option).
//
// The textbook algorithm (Deutsch and Journel, GSLIB, 1998, ch. V.2.3;
// Goovaerts 1997, ch. 8):
//   1. normal-score transform of the conditioning data (the upscaled well
//      cells), so the data histogram maps onto a standard normal;
//   2. visit every cell to simulate once along a random path; at each cell,
//      simple kriging (mean 0, sill 1) from the nearest data and the cells
//      simulated before it gives a conditional mean and variance, and the
//      cell's value is drawn from that normal distribution;
//   3. back-transform the simulated normal scores through the same table,
//      so the realisation reproduces the data histogram, and the variogram
//      used in the kriging is reproduced in space.
//
// Practical choices (said in the provenance):
//   - The grid is stratigraphic: the vertical distance between two cells is
//     their layer difference times the nominal layer thickness, so a layer
//     follows the zone's shape (the usual choice in Petrel and RMS).
//   - Multiple-grid path: cells on a coarse lattice (every 8th, 4th, 2nd
//     column) are simulated first, so long-range structure is reproduced with
//     a small search (GSLIB sgsim's multiple-grid option).
//   - The search takes the `neighbours` closest simulated cells from a
//     distance-sorted template inside the variogram range, plus up to
//     `maxData` closest data cells (data sit in a few well columns, searched
//     by column).
//   - Back-transform tails are linear to the bounds (GSLIB ltail/utail 1).
// The random generator is mulberry32, so one seed gives one realisation on
// every browser and in jest. Pure, no I/O; the build runs it on the worker.

/** A small seeded generator (mulberry32): returns uniform numbers in [0, 1). */
export function mulberry32(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal draw (Box-Muller) from a uniform generator. */
export function makeGaussian(rng) {
  let spare = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0;
    while (u <= 1e-300) u = rng();
    const v = rng();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

/** The inverse standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function inverseNormal(p) {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5; const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** The standard normal CDF (Abramowitz and Stegun 7.1.26 through erf, |error| < 1.5e-7). */
export function normalCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Normal-score table tails: the score the bounds sit at. */
const TAIL_Y = 3.75;

/**
 * The normal-score table of a sample (GSLIB nscore): values sorted, each at
 * the score of its plotting position (i + 0.5) / n, with the bounds at
 * -3.75 and +3.75 for the linear tails.
 * @param {number[]} values the data
 * @param {{lo?: number, hi?: number}} [bounds] the back-transform bounds
 *   (default: a tenth of the data range beyond the extremes)
 */
export function normalScoreTable(values, { lo = null, hi = null } = {}) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) throw new Error('Sequential Gaussian simulation needs at least one data value.');
  const n = v.length;
  const span = Math.max(v[n - 1] - v[0], Math.abs(v[0]) * 1e-6, 1e-9);
  const L = Number.isFinite(lo) ? Math.min(lo, v[0]) : v[0] - 0.1 * span;
  const H = Number.isFinite(hi) ? Math.max(hi, v[n - 1]) : v[n - 1] + 0.1 * span;
  const y = v.map((_, i) => inverseNormal((i + 0.5) / n));
  return { v: [L, ...v, H], y: [-TAIL_Y, ...y, TAIL_Y], n };
}

function interp(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let a = 0; let b = n - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (xs[m] <= x) a = m; else b = m; }
  if (xs[b] === xs[a]) return (ys[a] + ys[b]) / 2;
  return ys[a] + ((ys[b] - ys[a]) * (x - xs[a])) / (xs[b] - xs[a]);
}
/** A value to its normal score through the table. */
export const toNormalScore = (table, value) => interp(table.v, table.y, value);
/** A normal score back to a value through the table (linear tails to the bounds). */
export const fromNormalScore = (table, score) => interp(table.y, table.v, score);

/** Variogram structure at a normalised distance (h / range): 0 at 0, 1 at the range (spherical) or practically (3/range). */
export function structure(model, h) {
  if (h <= 0) return 0;
  if (model === 'exponential') return 1 - Math.exp(-3 * h);
  if (model === 'gaussian') return 1 - Math.exp(-3 * h * h);
  return h >= 1 ? 1 : 1.5 * h - 0.5 * h * h * h;
}

/** Covariance (sill 1) of the normal scores at a normalised distance. */
export const covariance = (model, nugget, h) => (h <= 0 ? 1 : (1 - nugget) * (1 - structure(model, h)));

/** The SGS defaults: spherical, 900 m across the layers (the kriging default), 10 ft down them, nugget 0.1 of the sill. */
export const SGS_DEFAULTS = Object.freeze({ model: 'spherical', rangeM: 900, rangeVM: 3.048, nugget: 0.1, seed: 2026, neighbours: 12, maxData: 4 });

/** Cholesky solve of the SPD system A x = b (A n x n, row-major, overwritten). Returns false when A is not positive definite. */
function choleskySolve(A, b, n, x) {
  for (let j = 0; j < n; j++) {
    let s = A[j * n + j];
    for (let k = 0; k < j; k++) s -= A[j * n + k] * A[j * n + k];
    if (!(s > 1e-12)) return false;
    const d = Math.sqrt(s);
    A[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = A[i * n + j];
      for (let k = 0; k < j; k++) t -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = t / d;
    }
  }
  for (let i = 0; i < n; i++) {
    let t = b[i];
    for (let k = 0; k < i; k++) t -= A[i * n + k] * x[k];
    x[i] = t / A[i * n + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let t = x[i];
    for (let k = i + 1; k < n; k++) t -= A[k * n + i] * x[k];
    x[i] = t / A[i * n + i];
  }
  return true;
}

/**
 * Simulate one realisation.
 * @param {object} p
 * @param {number} p.nx @param {number} p.ny @param {number} p.nk grid size (columns x rows x layers)
 * @param {number} p.dx @param {number} p.dy cell size across (m)
 * @param {number} p.dz the nominal layer thickness (m), the vertical lag
 * @param {Uint8Array} [p.active] 1 where a cell is simulated (default all)
 * @param {Array<{i:number, j:number, k:number, v:number}>} p.data conditioning cells (column, row, layer)
 * @param {object} [p.variogram] {model, rangeM, rangeVM, nugget} in metres, nugget as a fraction of the sill
 * @param {number} [p.seed]
 * @param {number} [p.neighbours] simulated cells in each kriging (0 makes white noise: the negative control)
 * @param {number} [p.maxData] data cells in each kriging
 * @param {{lo?: number, hi?: number}} [p.bounds] back-transform bounds
 * @param {(f: number) => void} [p.onProgress] fraction done
 * @param {number[]} [p.reference] the histogram to reproduce when it is not the data's (an unconditional run)
 * @returns {{values: Float32Array, scores: Float32Array, table: object, path: number, stats: object}}
 */
export function sgs3d({
  nx, ny, nk, dx, dy, dz, active = null, data = [], variogram = {}, seed = SGS_DEFAULTS.seed,
  neighbours = SGS_DEFAULTS.neighbours, maxData = SGS_DEFAULTS.maxData, bounds = {}, onProgress = null, reference = null,
}) {
  const N = nx * ny; const M = N * nk;
  const vg = { ...SGS_DEFAULTS, ...variogram };
  const model = ['spherical', 'exponential', 'gaussian'].includes(vg.model) ? vg.model : 'spherical';
  const aH = Math.max(1e-6, Number(vg.rangeM)); const aV = Math.max(1e-6, Number(vg.rangeVM));
  const nug = Math.min(0.999, Math.max(0, Number(vg.nugget) || 0));
  const reach = model === 'spherical' ? 1 : 1.5; // normalised search radius
  const hn = (di, dj, dk) => Math.sqrt(((di * dx) / aH) ** 2 + ((dj * dy) / aH) ** 2 + ((dk * dz) / aV) ** 2);
  // every lag between two cells is a whole number of cells, so the covariance
  // comes from a table over the lags inside twice the search radius
  const Ri = 2 * Math.ceil((reach * aH) / dx); const Rj = 2 * Math.ceil((reach * aH) / dy); const Rk = Math.min(Math.max(0, nk - 1), 2 * Math.ceil((reach * aV) / dz));
  const tableOk = (Ri + 1) * (Rj + 1) * (Rk + 1) <= 4_000_000;
  const covTable = tableOk ? new Float64Array((Ri + 1) * (Rj + 1) * (Rk + 1)) : null;
  if (covTable) {
    for (let dk = 0; dk <= Rk; dk++) for (let dj = 0; dj <= Rj; dj++) for (let di = 0; di <= Ri; di++) covTable[(dk * (Rj + 1) + dj) * (Ri + 1) + di] = covariance(model, nug, hn(di, dj, dk));
  }
  const cov = (di, dj, dk) => {
    const a = di < 0 ? -di : di; const b2 = dj < 0 ? -dj : dj; const c = dk < 0 ? -dk : dk;
    if (covTable && a <= Ri && b2 <= Rj && c <= Rk) return covTable[(c * (Rj + 1) + b2) * (Ri + 1) + a];
    return covariance(model, nug, hn(di, dj, dk));
  };

  // the histogram to reproduce: the data's, or a reference sample (an unconditional run)
  const table = normalScoreTable(reference || data.map((d) => d.v), bounds);
  const Y = new Float32Array(M).fill(NaN);
  const state = new Uint8Array(M); // 0 to simulate, 1 simulated, 2 data, 3 inactive
  if (active) for (let c = 0; c < M; c++) if (!active[c]) state[c] = 3;

  // data: one value per cell (the mean of the cell's data), held exactly
  const dataSum = new Map();
  for (const d of data) {
    if (!(d.i >= 0 && d.i < nx && d.j >= 0 && d.j < ny && d.k >= 0 && d.k < nk) || !Number.isFinite(d.v)) continue;
    const c = d.k * N + d.j * nx + d.i;
    const e = dataSum.get(c) || { s: 0, n: 0, i: d.i, j: d.j, k: d.k };
    e.s += d.v; e.n += 1; dataSum.set(c, e);
  }
  const dataCells = [];
  for (const [c, e] of dataSum) {
    const v = e.s / e.n;
    Y[c] = toNormalScore(table, v);
    state[c] = 2;
    dataCells.push({ c, i: e.i, j: e.j, k: e.k, v, y: Y[c] });
  }
  // data grouped by well column, for the data search
  const cols = new Map();
  for (const d of dataCells) {
    const key = d.j * nx + d.i;
    if (!cols.has(key)) cols.set(key, { i: d.i, j: d.j, cells: [] });
    cols.get(key).cells.push(d);
  }
  const columns = [...cols.values()];
  for (const col of columns) col.cells.sort((a, b) => a.k - b.k);

  const rng = mulberry32(seed);
  const gauss = makeGaussian(rng);

  // multiple-grid levels by column: the coarse lattice first
  const maxLevel = Math.max(1, Math.min(8, 2 ** Math.floor(Math.log2(Math.max(1, aH / Math.max(dx, dy) / 4)))));
  const levelOf = (i, j) => { let s = maxLevel; while (s > 1 && (i % s || j % s)) s >>= 1; return s; };
  const levels = [];
  for (let s = maxLevel; s >= 1; s >>= 1) levels.push(s);
  const byLevel = new Map(levels.map((s) => [s, []]));
  for (let c = 0; c < M; c++) {
    if (state[c] !== 0) continue;
    const j0 = c % N;
    byLevel.get(levelOf(j0 % nx, (j0 / nx) | 0)).push(c);
  }
  const pathC = new Int32Array(levels.reduce((a, s) => a + byLevel.get(s).length, 0));
  const pathS = new Uint8Array(pathC.length);
  let pn = 0;
  for (const s of levels) {
    const L = byLevel.get(s);
    for (let q = L.length - 1; q > 0; q--) { const r = Math.floor(rng() * (q + 1)); const t = L[q]; L[q] = L[r]; L[r] = t; }
    for (const c of L) { pathC[pn] = c; pathS[pn] = s; pn += 1; }
    byLevel.set(s, null);
  }

  // a distance-sorted template per level (offsets on that level's lattice)
  const TEMPLATE_MAX = 3000;
  const templates = new Map();
  const templateFor = (s) => {
    if (templates.has(s)) return templates.get(s);
    const ri = Math.ceil((reach * aH) / dx / s); const rj = Math.ceil((reach * aH) / dy / s); const rk = Math.min(nk - 1, Math.ceil((reach * aV) / dz));
    const offs = [];
    for (let dk = -rk; dk <= rk; dk++) {
      for (let dj = -rj; dj <= rj; dj++) {
        for (let di = -ri; di <= ri; di++) {
          if (!di && !dj && !dk) continue;
          const h = hn(di * s, dj * s, dk);
          if (h <= reach) offs.push({ di: di * s, dj: dj * s, dk, h });
        }
      }
    }
    offs.sort((a, b) => a.h - b.h);
    const t = offs.slice(0, TEMPLATE_MAX);
    const T = { di: Int32Array.from(t, (o) => o.di), dj: Int32Array.from(t, (o) => o.dj), dk: Int32Array.from(t, (o) => o.dk), n: t.length };
    templates.set(s, T);
    return T;
  };

  const maxN = Math.max(0, Math.floor(neighbours)) + Math.max(0, Math.floor(maxData));
  const ni = new Int32Array(maxN); const nj = new Int32Array(maxN); const nkk = new Int32Array(maxN); const ny_ = new Float64Array(maxN);
  const A = new Float64Array(maxN * maxN); const b = new Float64Array(maxN); const w = new Float64Array(maxN); const b0 = new Float64Array(maxN);
  const selH = new Float64Array(Math.max(1, maxData)); const selD = new Array(Math.max(1, maxData));
  const vReachK = Math.ceil((reach * aV) / dz);
  let solved = 0; let fallbacks = 0;
  const total = pathC.length;
  const tick = Math.max(1, Math.floor(total / 50));
  for (let p = 0; p < total; p++) {
    const c = pathC[p]; const s = pathS[p];
    const k = (c / N) | 0; const j0 = c - k * N; const j = (j0 / nx) | 0; const i = j0 - j * nx;
    let n = 0;
    // simulated neighbours from the template
    if (neighbours > 0) {
      const T = templateFor(s);
      for (let q = 0; q < T.n && n < neighbours; q++) {
        const ii = i + T.di[q]; const jj = j + T.dj[q]; const kk = k + T.dk[q];
        if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nk) continue;
        const cc = kk * N + jj * nx + ii;
        if (state[cc] !== 1) continue;
        ni[n] = ii; nj[n] = jj; nkk[n] = kk; ny_[n] = Y[cc]; n += 1;
      }
      // data cells, closest first, by well column: within a column only the
      // layers inside the vertical reach can count, so a window of layers
      // around this one is scanned and the best maxData kept in order
      if (maxData > 0 && columns.length) {
        let m = 0;
        for (let q = 0; q < columns.length; q++) {
          const col = columns[q];
          const hx = ((col.i - i) * dx) / aH; const hy = ((col.j - j) * dy) / aH;
          const h2 = hx * hx + hy * hy;
          if (h2 > reach * reach) continue;
          const cells = col.cells;
          // the column's cells sorted by layer; start at the first one at or above k - vReach
          let lo = 0; let hi = cells.length;
          const kMin = k - vReachK;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (cells[mid].k < kMin) lo = mid + 1; else hi = mid; }
          for (let t = lo; t < cells.length && cells[t].k <= k + vReachK; t++) {
            const d = cells[t];
            const hz = ((d.k - k) * dz) / aV;
            const hh = h2 + hz * hz;
            if (hh > reach * reach) continue;
            // insertion into the kept list (ascending distance)
            let pos = m < maxData ? m : maxData - 1;
            if (m === maxData && hh >= selH[maxData - 1]) continue;
            while (pos > 0 && selH[pos - 1] > hh) { selH[pos] = selH[pos - 1]; selD[pos] = selD[pos - 1]; pos -= 1; }
            selH[pos] = hh; selD[pos] = d;
            if (m < maxData) m += 1;
          }
        }
        for (let q = 0; q < m; q++) {
          const d = selD[q];
          ni[n] = d.i; nj[n] = d.j; nkk[n] = d.k; ny_[n] = d.y; n += 1;
        }
      }
    }
    let mean = 0; let variance = 1;
    if (n > 0) {
      for (let a = 0; a < n; a++) {
        A[a * n + a] = 1;
        for (let bq = 0; bq < a; bq++) {
          const cv = cov(ni[a] - ni[bq], nj[a] - nj[bq], nkk[a] - nkk[bq]);
          A[a * n + bq] = cv; A[bq * n + a] = cv;
        }
        b[a] = cov(ni[a] - i, nj[a] - j, nkk[a] - k);
      }
      // a small ridge keeps duplicated positions solvable
      for (let a = 0; a < n; a++) { A[a * n + a] += 1e-9; b0[a] = b[a]; }
      if (choleskySolve(A, b, n, w)) {
        let m = 0; let v = 0;
        for (let a = 0; a < n; a++) {
          m += w[a] * ny_[a];
          v += w[a] * b0[a];
        }
        mean = m; variance = Math.max(0, 1 - v);
        solved += 1;
      } else fallbacks += 1;
    }
    Y[c] = mean + Math.sqrt(variance) * gauss();
    state[c] = 1;
    if (onProgress && p % tick === 0) onProgress(p / total);
  }
  const values = new Float32Array(M).fill(NaN);
  for (let c = 0; c < M; c++) if (state[c] === 1) values[c] = fromNormalScore(table, Y[c]);
  for (const d of dataCells) values[d.c] = d.v;
  if (onProgress) onProgress(1);
  return {
    values, scores: Y, table, path: total,
    stats: { simulated: total, data: dataCells.length, solved, fallbacks, levels: maxLevel, model, rangeM: aH, rangeVM: aV, nugget: nug, seed, neighbours, maxData },
  };
}

/**
 * The experimental semivariogram of a gridded realisation along one grid
 * axis, at whole-cell lags (for the validation and the QC chart). Cells that
 * are NaN are skipped.
 * @param {ArrayLike<number>} values @param {number} nx @param {number} ny @param {number} nk
 * @param {'i'|'j'|'k'} axis @param {number[]} lags in cells
 * @returns {Array<{lag: number, gamma: number, pairs: number}>}
 */
export function experimentalVariogram(values, nx, ny, nk, axis, lags) {
  const N = nx * ny;
  return lags.map((L) => {
    let s = 0; let n = 0;
    for (let k = 0; k < nk; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const i2 = axis === 'i' ? i + L : i; const j2 = axis === 'j' ? j + L : j; const k2 = axis === 'k' ? k + L : k;
          if (i2 >= nx || j2 >= ny || k2 >= nk) continue;
          const a = values[k * N + j * nx + i]; const b2 = values[k2 * N + j2 * nx + i2];
          if (!Number.isFinite(a) || !Number.isFinite(b2)) continue;
          s += (a - b2) ** 2; n += 1;
        }
      }
    }
    return { lag: L, gamma: n ? s / (2 * n) : NaN, pairs: n };
  });
}
