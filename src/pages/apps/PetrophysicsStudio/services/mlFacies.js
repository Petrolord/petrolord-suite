// Facies interchange with Data AI (AppUpgrade PETRO-U2-006, 2026-09-29).
// Data AI's Electrofacies Studio writes its classes as a facies CURVE
// (EFAC_KM, EFAC_CART ..., one code per sample, the legend in provenance);
// the Studio's rule and crossplot facies are registry INTERVALS, which Data
// AI already reads as a core facies source. This module reads the Data AI
// curves into the same interval form the Studio's strip tracks draw, so ML
// facies and rule facies sit on one set of tracks, and tabulates how the
// two classifications agree sample by sample.

import { intervalsFromRuns, rasterizeIntervals } from '@/lib/stratigraphy/intervals';

const PALETTE = ['#2563eb', '#d97706', '#059669', '#db2777', '#7c3aed', '#0891b2', '#b91c1c', '#65a30d', '#a16207', '#475569'];

/** Data AI facies curves on a well: written by electrofacies-studio, or named EFAC_*. */
export function mlFaciesLogs(allLogs = []) {
  return allLogs.filter((l) => l.provenance?.engine === 'electrofacies-studio' || /^EFAC_/i.test(String(l.mnemonic || '')));
}

/** The strip-track kind a Data AI curve is drawn under (not a registry kind). */
export const mlKind = (mnemonic) => `mlfacies:${mnemonic}`;

/**
 * One Data AI facies curve as interval rows: runs of one code, labelled from
 * the curve's legend (cluster number and matched facies when the run had a
 * core comparison), NaN breaking a run.
 * @returns {{rows: Array, labels: string[], method: ?string}}
 */
export function mlFaciesIntervals(depth, data, log) {
  const legend = Array.isArray(log?.provenance?.legend) ? log.provenance.legend : [];
  const codes = [];
  for (let i = 0; i < data.length; i++) if (Number.isFinite(data[i]) && !codes.includes(data[i])) codes.push(data[i]);
  codes.sort((a, b) => a - b);
  const labelOf = (code) => {
    const e = legend.find((x) => Number(x.code) === code);
    if (!e) return `class ${code}`;
    return e.matchedFacies ? `${e.label} (${e.matchedFacies})` : String(e.label ?? `class ${code}`);
  };
  const labels = codes.map(labelOf);
  const idx = Float64Array.from({ length: data.length }, (_, i) => (Number.isFinite(data[i]) ? codes.indexOf(data[i]) : NaN));
  const rows = intervalsFromRuns(depth, idx, labels, { kind: mlKind(log.mnemonic), colours: codes.map((_, k) => PALETTE[k % PALETTE.length]), source: 'log' });
  return { rows, labels, method: log?.provenance?.method || null };
}

/**
 * How two classifications agree: samples by (class A, class B), each
 * rasterised from its intervals on the well's depth vector.
 * @returns {{a: string[], b: string[], counts: number[][], n: number}}
 */
export function faciesCrosstab(depth, rowsA, kindA, rowsB, kindB) {
  const A = rasterizeIntervals(rowsA, kindA, depth);
  const B = rasterizeIntervals(rowsB, kindB, depth);
  const counts = A.categories.map(() => B.categories.map(() => 0));
  let n = 0;
  for (let i = 0; i < depth.length; i++) {
    const x = A.data[i]; const y = B.data[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    counts[x][y] += 1; n += 1;
  }
  return { a: A.categories.map((c) => c.label || c.code), b: B.categories.map((c) => c.label || c.code), counts, n };
}
