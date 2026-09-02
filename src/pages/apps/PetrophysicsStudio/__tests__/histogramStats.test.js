// PS7: histogram stats (client-side presentation math) + the
// normalization engine vs the NORM golden.

import fs from 'fs';
import path from 'path';
import { histogram, cumulative, maskForWindow, passingFraction } from '../viewer/stats';
import { percentile, fitNormalization, applyNormalization } from '../engine/normalize';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const goldens = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));
const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));
const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

describe('histogram', () => {
  test('counts partition the finite samples; NaN and mask excluded', () => {
    const gr = curve('GR');
    const h = histogram(gr, { bins: 20 });
    const finite = Array.from(gr).filter(Number.isFinite).length;
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(finite);
    expect(h.n).toBe(finite);
    const mask = maskForWindow(curve('DEPT'), 2010, 2030);
    const hm = histogram(gr, { bins: 20, mask });
    expect(hm.n).toBe(Array.from(mask).filter(Boolean).length); // no nulls in that window
  });

  test('hi edge is inclusive; fixed domain drops outsiders', () => {
    const h = histogram([0, 5, 10], { bins: 10, domain: [0, 10] });
    expect(h.counts[0]).toBe(1);
    expect(h.counts[5]).toBe(1);
    expect(h.counts[9]).toBe(1); // 10 folds into the last bin (hi inclusive)
    const h2 = histogram([0, 5, 999], { bins: 10, domain: [0, 10] });
    expect(h2.counts.reduce((a, b) => a + b, 0)).toBe(2);
  });

  test('log binning excludes non-positives and bins in log10 space', () => {
    const h = histogram([0.1, 1, 10, 100, -5, 0], { bins: 3, log: true });
    expect(h.n).toBe(4);
    // one decade per bin: 0.1 in bin 0; 1 sits on the edge and opens
    // bin 1; 10 opens bin 2; 100 folds into the last bin
    expect(Array.from(h.counts)).toEqual([1, 1, 2]);
    expect(close(h.edges[0], 0.1)).toBe(true);
    expect(close(h.edges[3], 100)).toBe(true);
  });

  test('cumulative ends at 1; passingFraction matches counting', () => {
    const c = cumulative(Uint32Array.from([1, 2, 3, 4]));
    expect(close(c[3], 1)).toBe(true);
    expect(close(c[0], 0.1)).toBe(true);
    expect(close(passingFraction([1, 2, 3, 4, NaN], 2.5, 'below'), 0.5)).toBe(true);
    expect(close(passingFraction([1, 2, 3, 4], 2.5, 'above'), 0.5)).toBe(true);
  });
});

describe('normalization vs the NORM golden', () => {
  const gr = curve('GR');
  const target = Float64Array.from(goldens.NORM.GR_TARGET, (v) => (v === null ? NaN : v));

  test('two-point fit matches the golden and restores GR exactly', () => {
    const fit = fitNormalization(gr, target, { method: 'two-point' });
    expect(close(fit.shift, goldens.NORM.two_point.shift)).toBe(true);
    expect(close(fit.scale, goldens.NORM.two_point.scale)).toBe(true);
    expect(close(fit.refP[0], goldens.NORM.two_point.refP[0])).toBe(true);
    const back = applyNormalization(target, fit);
    for (let i = 0; i < gr.length; i++) {
      if (Number.isNaN(gr[i])) expect(Number.isNaN(back[i])).toBe(true);
      else expect(Math.abs(back[i] - gr[i])).toBeLessThan(1e-9);
    }
  });

  test('mean-std fit matches the golden', () => {
    const fit = fitNormalization(gr, target, { method: 'mean-std' });
    expect(close(fit.shift, goldens.NORM.mean_std.shift)).toBe(true);
    expect(close(fit.scale, goldens.NORM.mean_std.scale)).toBe(true);
  });

  test('percentile matches the oracle values in the golden', () => {
    expect(close(percentile(gr, 5), goldens.NORM.two_point.refP[0])).toBe(true);
    expect(close(percentile(gr, 95), goldens.NORM.two_point.refP[1])).toBe(true);
  });

  test('degenerate flat target yields NaN, never a fake fit', () => {
    const flat = [5, 5, 5, 5];
    expect(Number.isNaN(fitNormalization(gr, flat, { method: 'two-point' }).scale)).toBe(true);
    expect(Number.isNaN(fitNormalization(gr, flat, { method: 'mean-std' }).scale)).toBe(true);
  });
});
