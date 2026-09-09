// PT10b: the curve-vs-depth density grid and its overlay outline (pure
// presentation math, viewer/depthDensity.js). Gates from the plan: the
// fullest cell is exactly 1 and empty cells 0; the depth bin honours the
// display unit; log X excludes non-positive values; an overlay shares the
// primary's edges; the outline of a rectangular block has 2a + 2b
// segments; a zone mask reduces the count; unplaced depths are counted.

import { depthDensityGrid, envelopeOutline, defaultDepthBinM, binOf } from '../viewer/depthDensity';
import { makeScale, ticksFor } from '../components/crossplotScales';
import { M_PER_FT } from '@/components/wells/depthModes';

const seq = (n, f) => Float64Array.from({ length: n }, (_, i) => f(i));

describe('depthDensityGrid', () => {
  test('the fullest cell is exactly 1, empty cells are 0, counts sum to n', () => {
    // 200 samples over 2000..2099.5 m, values 0..1 rising; depth bin 25 m -> 4 rows
    const depth = seq(200, (i) => 2000 + i * 0.5);
    const values = seq(200, (i) => i / 200);
    const g = depthDensityGrid({ values, depth, xBins: 10, depthBin: 25 });
    expect(g.xBins).toBe(10);
    expect(g.depthBins).toBe(4);
    expect(g.n).toBe(200);
    expect(g.unplaced).toBe(0);
    const max = Math.max(...g.density);
    expect(max).toBe(1);
    let sum = 0; for (const c of g.counts) sum += c;
    expect(sum).toBe(200);
    // an empty cell (top-left row, high X) is 0 and never painted
    expect(g.density[9]).toBe(0);
    expect(g.counts[9]).toBe(0);
    // edges are the data extent and multiples of the bin
    expect(g.xEdges[0]).toBe(0);
    expect(g.xEdges[10]).toBeCloseTo(199 / 200, 12);
    expect(g.depthEdges[0]).toBe(2000);
    expect(g.depthEdges[4]).toBe(2100);
  });

  test('the depth bin honours the display unit: 100 ft under ft, 25 m under m', () => {
    expect(defaultDepthBinM('m')).toBe(25);
    expect(defaultDepthBinM('ft')).toBeCloseTo(100 * M_PER_FT, 12);
    const depth = seq(100, (i) => 6000 * M_PER_FT + i);
    const values = seq(100, () => 0.2);
    const g = depthDensityGrid({ values, depth, depthBin: defaultDepthBinM('ft') });
    for (let k = 0; k < g.depthEdges.length; k++) {
      const ft = g.depthEdges[k] / M_PER_FT;
      expect(Math.abs(ft / 100 - Math.round(ft / 100))).toBeLessThan(1e-9);
    }
  });

  test('log X excludes non-positive values and spaces edges in log10', () => {
    const depth = seq(6, (i) => 2000 + i);
    const values = Float64Array.from([-1, 0, 0.1, 1, 10, 100]);
    const g = depthDensityGrid({ values, depth, xBins: 3, log: true });
    expect(g.n).toBe(4);
    expect(Array.from(g.xEdges).map((v) => Number(v.toPrecision(6)))).toEqual([0.1, 1, 10, 100]);
    const lin = depthDensityGrid({ values, depth, xBins: 3, log: false });
    expect(lin.n).toBe(6);
  });

  test('an overlay binned on the primary edges shares them exactly, and the zone mask reduces the count', () => {
    const depth = seq(120, (i) => 2000 + i);
    const values = seq(120, (i) => Math.sin(i / 7) * 0.5 + 0.5);
    const primary = depthDensityGrid({ values, depth, xBins: 20, depthBin: 25 });
    const other = depthDensityGrid({ values: seq(50, (i) => 0.3 + i / 200), depth: seq(50, (i) => 2030 + i), edges: { xEdges: primary.xEdges, depthEdges: primary.depthEdges } });
    expect(other.xEdges).toBe(primary.xEdges);
    expect(other.depthEdges).toBe(primary.depthEdges);
    expect(other.xBins).toBe(20);
    expect(other.depthBins).toBe(primary.depthBins);
    expect(other.n).toBe(50);
    // mask: keep 2040..2059 only
    const mask = new Uint8Array(120);
    for (let i = 0; i < 120; i++) mask[i] = depth[i] >= 2040 && depth[i] < 2060 ? 1 : 0;
    const masked = depthDensityGrid({ values, depth, mask, xBins: 20, depthBin: 25 });
    expect(masked.n).toBe(20);
    expect(masked.n).toBeLessThan(primary.n);
  });

  test('a NaN depth (above the first survey station) is dropped and counted; a range keeps only its samples', () => {
    const depth = Float64Array.from([NaN, NaN, 2000, 2001, 2002, 2100]);
    const values = seq(6, () => 0.5);
    const g = depthDensityGrid({ values, depth, depthBin: 25 });
    expect(g.unplaced).toBe(2);
    expect(g.n).toBe(4);
    const r = depthDensityGrid({ values, depth, depthBin: 25, depthRange: [2000, 2010] });
    expect(r.n).toBe(3);
    expect(r.depthEdges[0]).toBe(2000);
    expect(r.depthEdges[r.depthBins]).toBe(2025);
    // nothing at all
    const e = depthDensityGrid({ values: Float64Array.from([NaN]), depth: Float64Array.from([2000]) });
    expect(e.xBins).toBe(0);
    expect(e.n).toBe(0);
  });
});

describe('envelopeOutline', () => {
  test('a solid 3 by 2 block has 2a + 2b = 10 segments; two separate cells have 8', () => {
    const grid = { xEdges: Float64Array.from([0, 1, 2, 3, 4, 5]), depthEdges: Float64Array.from([0, 10, 20, 30, 40]), xBins: 5, depthBins: 4, counts: new Uint32Array(20) };
    // rows 1..2, columns 1..3
    for (const di of [1, 2]) for (const xi of [1, 2, 3]) grid.counts[di * 5 + xi] = 1;
    const segs = envelopeOutline(grid);
    expect(segs).toHaveLength(10);
    // the top edge runs along depth 10 from x=1 to x=4 in three pieces
    expect(segs.filter((s) => s.d0 === 10 && s.d1 === 10)).toHaveLength(3);
    const two = { ...grid, counts: new Uint32Array(20) };
    two.counts[0] = 3; two.counts[19] = 1;
    expect(envelopeOutline(two)).toHaveLength(8);
    expect(envelopeOutline({ ...grid, xBins: 0, depthBins: 0 })).toEqual([]);
  });
});

describe('crossplotScales (shared with the scatter)', () => {
  test('binOf, makeScale round trip and ticks', () => {
    const edges = Float64Array.from([0, 1, 2, 3]);
    expect(binOf(edges, -0.1)).toBe(-1);
    expect(binOf(edges, 0)).toBe(0);
    expect(binOf(edges, 2.5)).toBe(2);
    expect(binOf(edges, 3)).toBe(2);
    expect(binOf(edges, 3.1)).toBe(-1);
    const s = makeScale([0.1, 1000], 400, true, false);
    expect(s.inv(s.fwd(7))).toBeCloseTo(7, 9);
    expect(ticksFor([0.1, 1000], true).map((v) => Number(v.toPrecision(6)))).toEqual([0.1, 1, 10, 100, 1000]);
    // about six 1-2-5 ticks: a 200 m span steps by 20
    expect(ticksFor([2000, 2200], false).map((v) => Number(v.toFixed(6)))).toEqual([2000, 2020, 2040, 2060, 2080, 2100, 2120, 2140, 2160, 2180, 2200]);
    expect(ticksFor([5, 5], false)).toEqual([]);
  });
});
