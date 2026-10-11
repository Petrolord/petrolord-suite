// Project Data Inventory: the interval of interest and curve coverage over
// it, from the log metadata (start, stop, null count) and, once the samples
// are read, from the data itself (valid fraction, valid depth range, gaps).
// Hole condition from the caliper against the bit size and from the density
// correction. All depths are measured depth in metres, as stored. Pure.

import { CURVE_ALIASES } from '@/components/wells/curveMap';

const M_PER_FT = 0.3048;
const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const isDepthLog = (l) => CURVE_ALIASES.DEPT.includes(String(l?.mnemonic || '').toUpperCase().split(':')[0]);

/** Values the LAS null convention leaves in a curve. */
export const isNullValue = (v) => !Number.isFinite(v) || v === -999.25 || v === -9999 || v === -999 || v === -9999.25;

/** The logged interval of a well: the widest extent of its curves (depth index excluded). */
export function loggedInterval(logs = []) {
  let top = Infinity;
  let base = -Infinity;
  for (const l of logs) {
    if (isDepthLog(l)) continue;
    const a = num(l.start_md_m);
    const b = num(l.stop_md_m);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    top = Math.min(top, a, b);
    base = Math.max(base, a, b);
  }
  return Number.isFinite(top) && base > top ? { top, base } : null;
}

/**
 * The interval of interest of one well.
 * spec { mode: 'well' } is the logged interval; { mode: 'zones', names }
 * spans the named zones present on the well (shallowest top to deepest
 * base). A well with none of the zones falls back to its logged interval
 * and says so (matched: false), so the matrix still has something to judge.
 * @returns {{top: number, base: number, label: string, matched: boolean, zones: string[]} | null}
 */
export function resolveInterval({ logs = [], zones = [] }, spec = { mode: 'well' }) {
  const logged = loggedInterval(logs);
  if (spec?.mode === 'zones' && Array.isArray(spec.names) && spec.names.length) {
    const hit = (zones || []).filter((z) => spec.names.includes(z.name)
      && Number.isFinite(num(z.top_md_m)) && Number.isFinite(num(z.base_md_m)) && num(z.base_md_m) > num(z.top_md_m));
    if (hit.length) {
      const top = Math.min(...hit.map((z) => num(z.top_md_m)));
      const base = Math.max(...hit.map((z) => num(z.base_md_m)));
      return { top, base, label: [...new Set(hit.map((z) => z.name))].join(', '), matched: true, zones: [...new Set(hit.map((z) => z.name))] };
    }
    return logged ? { ...logged, label: 'logged interval', matched: false, zones: [] } : null;
  }
  return logged ? { ...logged, label: 'logged interval', matched: true, zones: [] } : null;
}

/**
 * Coverage from the metadata alone: the share of the interval inside the
 * curve's recorded extent, reduced by its null fraction (spread evenly, as
 * the metadata cannot say where the nulls are). approx: true says so.
 */
export function metadataCoverage(log, interval) {
  if (!interval || !(interval.base > interval.top)) return { fraction: 0, top: null, base: null, approx: true, gaps: [] };
  const a = num(log.start_md_m);
  const b = num(log.stop_md_m);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { fraction: 0, top: null, base: null, approx: true, gaps: [] };
  const lo = Math.max(Math.min(a, b), interval.top);
  const hi = Math.min(Math.max(a, b), interval.base);
  const overlap = Math.max(0, hi - lo) / (interval.base - interval.top);
  const n = num(log.n_samples);
  const nulls = num(log.null_count);
  const valid = Number.isFinite(n) && n > 0 && Number.isFinite(nulls) ? Math.max(0, 1 - nulls / n) : 1;
  return { fraction: overlap * valid, top: hi > lo ? lo : null, base: hi > lo ? hi : null, approx: true, gaps: [], nullShare: 1 - valid };
}

/**
 * Coverage from the samples: the curve sits on a regular grid from
 * start_md_m in steps of step_m. Within the interval, the share of the
 * interval length carried by valid samples; the depth range of valid
 * samples; and the gaps (runs of nulls, or the interval beyond the curve's
 * ends) at least minGapM long.
 * @param {{start_md_m, stop_md_m, step_m}} log
 * @param {ArrayLike<number>} values
 * @param {{top: number, base: number}} interval
 */
export function sampleCoverage(log, values, interval, { minGapM = 1.5 } = {}) {
  const start = num(log.start_md_m);
  const step = num(log.step_m);
  if (!interval || !(interval.base > interval.top) || !values?.length || !Number.isFinite(start) || !(Math.abs(step) > 0)) {
    return metadataCoverage(log, interval);
  }
  const s = Math.abs(step);
  const threshold = Math.max(minGapM, 2 * s);
  let validCount = 0;
  let firstValid = null;
  let lastValid = null;
  const gaps = [];
  let lastEnd = interval.top;
  const depths = [];
  for (let i = 0; i < values.length; i++) {
    const d = start + i * step;
    if (d >= interval.top - 1e-9 && d <= interval.base + 1e-9 && !isNullValue(values[i])) depths.push(d);
  }
  depths.sort((x, y) => x - y);
  for (const d of depths) {
    validCount += 1;
    if (firstValid === null) firstValid = d;
    lastValid = d;
    if (d - lastEnd >= threshold) gaps.push({ top: lastEnd, base: d });
    lastEnd = d;
  }
  if (interval.base - lastEnd >= threshold) gaps.push({ top: lastEnd, base: interval.base });
  const fraction = Math.min(1, (validCount * s) / (interval.base - interval.top));
  return { fraction, top: firstValid, base: lastValid, approx: false, gaps, validCount };
}

/** Plugs (or any sparse curve) inside the interval: their count and depth span. */
export function sparseCount(log, values, interval) {
  const start = num(log.start_md_m);
  const step = num(log.step_m);
  if (!values?.length || !Number.isFinite(start) || !(Math.abs(step) > 0)) {
    const total = Math.max(0, num(log.n_samples) - num(log.null_count));
    return { inInterval: null, total: Number.isFinite(total) ? total : null, top: null, base: null };
  }
  let inInterval = 0;
  let total = 0;
  let top = null;
  let base = null;
  for (let i = 0; i < values.length; i++) {
    if (isNullValue(values[i])) continue;
    total += 1;
    const d = start + i * step;
    if (!interval || (d >= interval.top && d <= interval.base)) {
      inInterval += 1;
      top = top === null ? d : Math.min(top, d);
      base = base === null ? d : Math.max(base, d);
    }
  }
  return { inInterval, total, top, base };
}

// Nominal bit sizes (inches) of the common hole sections.
export const NOMINAL_BITS = Object.freeze([6, 6.125, 6.5, 8.5, 9.875, 12.25, 14.75, 16, 17.5, 22, 24, 26, 36]);

/** Caliper values in inches (a caliper stored in mm or cm is converted by its unit). */
export function caliperInches(value, unit) {
  const u = String(unit || '').trim().toUpperCase();
  if (u === 'MM') return value / 25.4;
  if (u === 'CM') return value / 2.54;
  if (u === 'M') return value / 0.0254;
  return value;
}

/**
 * The bit size of a hole section inferred from the caliper: the nominal bit
 * at or just below the 20th percentile of the caliper (a gauge hole reads
 * the bit; a washed hole reads more). Used only when
 * the well has no bit-size curve, and said so.
 */
export function inferBitSize(calInches) {
  const v = Array.from(calInches).filter((x) => Number.isFinite(x) && x > 2 && x < 60).sort((a, b) => a - b);
  if (!v.length) return null;
  // the low fifth of the readings: gauge hole reads the bit and a washout
  // only adds high readings, so this holds even where washouts dominate
  const low = v[Math.floor(v.length * 0.2)];
  let bit = null;
  for (const b of NOMINAL_BITS) if (b <= low + 0.25) bit = b;
  return bit;
}

/**
 * Hole condition over the interval, from whichever evidence exists:
 * the caliper against the bit size (washout: caliper more than washoutIn
 * above the bit) and the density correction (|DRHO| above drhoLimit g/cc,
 * the usual bad-pad threshold). Each source gives the share of the
 * interval flagged; the bad-hole share is the union.
 * @param {{cal?: {log, values}, bs?: {log, values}, drho?: {log, values}}} curves samples on each log's own grid
 */
export function holeCondition(curves, interval, { washoutIn = 1, drhoLimit = 0.15, blockM = 30 } = {}) {
  if (!interval || !(interval.base > interval.top)) return null;
  const sources = [];
  const flagged = new Map(); // depth key -> true, on a 0.1 m lattice
  const key = (d) => Math.round(d * 10);
  let lattice = 0;
  const visit = (entry, test) => {
    const start = num(entry.log.start_md_m);
    const step = num(entry.log.step_m);
    if (!Number.isFinite(start) || !(Math.abs(step) > 0)) return null;
    let n = 0;
    let bad = 0;
    for (let i = 0; i < entry.values.length; i++) {
      const d = start + i * step;
      if (d < interval.top || d > interval.base) continue;
      const v = entry.values[i];
      if (isNullValue(v)) continue;
      n += 1;
      if (test(v, d, i)) { bad += 1; flagged.set(key(d), true); }
    }
    lattice = Math.max(lattice, n);
    return n ? { n, bad, share: bad / n } : null;
  };
  let bit = null;
  let bitFrom = null;
  if (curves.cal?.values) {
    const calIn = Array.from(curves.cal.values, (v) => (isNullValue(v) ? NaN : caliperInches(v, curves.cal.log.unit)));
    const start = num(curves.cal.log.start_md_m);
    const step = num(curves.cal.log.step_m);
    let bitAt = null; // sample index -> bit size (inches)
    if (curves.bs?.values) {
      const bs = Array.from(curves.bs.values, (v) => (isNullValue(v) ? NaN : caliperInches(v, curves.bs.log.unit)));
      const bsStart = num(curves.bs.log.start_md_m);
      const bsStep = num(curves.bs.log.step_m);
      if (bs.some(Number.isFinite) && Math.abs(bsStep) > 0) {
        bitAt = (i) => { const j = Math.round((start + i * step - bsStart) / bsStep); return Number.isFinite(bs[j]) ? bs[j] : NaN; };
        bitFrom = 'bit-size curve';
      }
    }
    if (!bitAt && Math.abs(step) > 0) {
      // the hole changes size down the well: infer the bit block by block
      // (blockM of hole each) so a 26 in surface section does not read as
      // a washout of the 12.25 in section below it
      const per = Math.max(1, Math.round(blockM / Math.abs(step)));
      const bits = [];
      for (let b0 = 0; b0 < calIn.length; b0 += per) bits.push(inferBitSize(calIn.slice(b0, b0 + per)));
      bitAt = (i) => bits[Math.floor(i / per)] ?? NaN;
      bitFrom = 'inferred from the caliper';
    }
    if (bitAt) {
      const used = new Map();
      const r = visit({ log: curves.cal.log, values: calIn }, (v, d, i) => { const b = bitAt(i); if (Number.isFinite(b)) used.set(b, (used.get(b) || 0) + 1); return Number.isFinite(b) && v - b > washoutIn; });
      // the hole sizes that make up at least a tenth of the interval
      const total = [...used.values()].reduce((a, c) => a + c, 0);
      bit = total ? [...used.entries()].filter(([, c]) => c >= 0.1 * total).map(([b]) => b).sort((x, y) => x - y) : null;
      if (r && bit) sources.push({ key: 'caliper', ...r, bitIn: bit, bitFrom });
    }
  }
  if (curves.drho?.values) {
    const r = visit(curves.drho, (v) => Math.abs(v) > drhoLimit);
    if (r) sources.push({ key: 'drho', ...r });
  }
  if (!sources.length) return { assessed: false, sources, badShare: null, bitIn: bit, bitFrom };
  const badShare = lattice ? Math.min(1, flagged.size / lattice) : 0;
  return { assessed: true, sources, badShare, bitIn: bit, bitFrom };
}

// --- depth display (stored metres, shown in the project's unit) -----------
export const toDisplayDepth = (m, unit) => (unit === 'ft' ? m / M_PER_FT : m);
export function fmtDepth(m, unit, digits = 0) {
  if (!Number.isFinite(m)) return '';
  return `${toDisplayDepth(m, unit).toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}
export const fmtRange = (top, base, unit) => (Number.isFinite(top) && Number.isFinite(base) ? `${fmtDepth(top, unit)}-${fmtDepth(base, unit)} ${unit} MD` : '');
