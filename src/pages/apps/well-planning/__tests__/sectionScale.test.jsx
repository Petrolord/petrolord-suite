// Section true scale (tester case Darm PlanB): the section view drew a
// 3 deg/30 m build as a corner because VS and TVD were fitted on their
// own. These pin the equal-aspect frame, the exaggeration factor and
// its printed label, and the DLS colour binning against Max DLS.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  fitAspectFrame, boxOf, exaggerationLabel, exaggerationOption, EXAGGERATION_OPTIONS,
  dlsColor, dlsRuns, dlsLegendBins, DLS_RAMP, DLS_OVER_COLOR, niceStep,
} from '../services/sectionScale';
import SectionViewChart from '../charts/SectionViewChart';

const close = (a, b, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);

// Tester geometry: vertical to 2,000 m, then 3 deg/30 m to 6.6 deg,
// then hold to 3,000 m TVD (metres, VS along the build azimuth).
function testerRows() {
  const rows = [];
  for (let md = 0; md <= 2000; md += 30) rows.push({ md, inc: 0, tvd: md, vs: 0, dls30m: 0 });
  const R = 30 / ((3 * Math.PI) / 180);
  const arc = (6.6 / 3) * 30;
  for (let s = 10; s <= arc + 1e-9; s += 10) {
    const th = s / R;
    rows.push({ md: 2000 + s, inc: (th * 180) / Math.PI, tvd: 2000 + R * Math.sin(th), vs: R * (1 - Math.cos(th)), dls30m: 3 });
  }
  const last = rows[rows.length - 1];
  const inc = (6.6 * Math.PI) / 180;
  for (let d = 30; last.tvd + d * Math.cos(inc) <= 3000; d += 30) {
    rows.push({ md: last.md + d, inc: 6.6, tvd: last.tvd + d * Math.cos(inc), vs: last.vs + d * Math.sin(inc), dls30m: 0 });
  }
  return rows;
}

describe('fitAspectFrame', () => {
  test('true scale: equal pixels per unit and the frame fills the pixel box', () => {
    const f = fitAspectFrame({ minX: 0, maxX: 100, minY: 0, maxY: 2000 }, { w: 600, h: 400 }, 1);
    close(f.sx, f.sy);
    close((f.maxX - f.minX) * f.sx, 600, 1e-6);
    close((f.maxY - f.minY) * f.sy, 400, 1e-6);
    expect(f.minY).toBeLessThanOrEqual(0);
    expect(f.maxY).toBeGreaterThanOrEqual(2000);
    expect(f.minX).toBeLessThanOrEqual(0);
    expect(f.maxX).toBeGreaterThanOrEqual(100);
  });

  test('exaggeration: TVD pixels per unit are ratio times VS pixels per unit', () => {
    const v5 = fitAspectFrame({ minX: 0, maxX: 3000, minY: 0, maxY: 3100 }, { w: 800, h: 500 }, 5);
    close(v5.sy / v5.sx, 5);
    const h10 = fitAspectFrame({ minX: 0, maxX: 50, minY: 0, maxY: 5000 }, { w: 800, h: 500 }, 1 / 10);
    close(h10.sx / h10.sy, 10);
    // the data still fits in both
    expect(h10.maxY - h10.minY).toBeGreaterThanOrEqual(5000);
    expect(h10.maxX - h10.minX).toBeGreaterThanOrEqual(50);
  });

  test('5,000 m near-vertical well at true scale is a thin line, centred, not squashed', () => {
    const f = fitAspectFrame({ minX: 0, maxX: 40, minY: 0, maxY: 5000 }, { w: 900, h: 500 }, 1);
    close(f.sx, f.sy);
    // TVD span sets the scale; VS gets the spare width, centred on the data
    close((f.minX + f.maxX) / 2, 20, 1e-6);
    expect(f.maxX - f.minX).toBeGreaterThan(5000);
  });

  test('degenerate and empty boxes still give a usable frame', () => {
    const f = fitAspectFrame(boxOf([[[0, 0]]]), { w: 300, h: 200 }, 1);
    expect(Number.isFinite(f.sx)).toBe(true);
    expect(f.maxX).toBeGreaterThan(f.minX);
    const g = fitAspectFrame({ minX: null, maxX: null, minY: null, maxY: null }, { w: 300, h: 200 }, 1);
    expect(Number.isFinite(g.sy)).toBe(true);
  });

  test('tester case: the drawn slope of the hold equals its inclination at true scale', () => {
    const rows = testerRows();
    const box = boxOf([rows.map((r) => [r.vs, r.tvd])]);
    const a = rows[rows.length - 2];
    const b = rows[rows.length - 1];
    const drawnInc = (f) => (Math.atan2((b.vs - a.vs) * f.sx, (b.tvd - a.tvd) * f.sy) * 180) / Math.PI;
    const trueScale = fitAspectFrame(box, { w: 900, h: 500 }, 1);
    close(drawnInc(trueScale), 6.6, 1e-6);
    // what the old independent fit did: both axes stretched to the box
    const pad = 1.16;
    const old = { sx: 900 / ((box.maxX - box.minX) * pad), sy: 500 / ((box.maxY - box.minY) * pad) };
    expect(drawnInc(old)).toBeGreaterThan(40); // a gentle build read as a corner
    // and a stated exaggeration gives the matching drawn angle
    const h5 = fitAspectFrame(box, { w: 900, h: 500 }, 1 / 5);
    close(Math.tan((drawnInc(h5) * Math.PI) / 180), 5 * Math.tan((6.6 * Math.PI) / 180), 1e-9);
  });

  test('boxOf skips non-finite points and never spreads', () => {
    const big = Array.from({ length: 200000 }, (_, i) => [i % 7, i]);
    const box = boxOf([big, [[NaN, 5], [3, Infinity]]]);
    expect(box).toEqual({ minX: 0, maxX: 6, minY: 0, maxY: 199999 });
  });

  test('niceStep gives round steps', () => {
    expect(niceStep(1000)).toBe(200);
    expect(niceStep(60, 6)).toBe(10);
  });
});

describe('exaggeration presets and labels', () => {
  test('true scale is the default and prints 1:1', () => {
    expect(exaggerationOption(undefined).ratio).toBe(1);
    expect(exaggerationOption('nonsense').id).toBe('1');
    expect(exaggerationLabel(1)).toBe('True scale (1:1)');
  });
  test('factors print both ways, without dashes', () => {
    expect(exaggerationLabel(5)).toBe('Vertical exaggeration 5x');
    expect(exaggerationLabel(1 / 10)).toBe('Horizontal exaggeration 10x (VS stretched)');
    EXAGGERATION_OPTIONS.forEach((o) => {
      expect(exaggerationLabel(o.ratio)).not.toMatch(/[—–]/);
      expect(o.short).not.toMatch(/[—–]/);
    });
  });
});

describe('DLS colour', () => {
  const scale = { maxDls: 3 };
  test('a build compiled at exactly Max DLS is the top bin, not flagged', () => {
    expect(dlsColor(3, scale)).toEqual({ bin: DLS_RAMP.length - 1, color: DLS_RAMP[DLS_RAMP.length - 1], over: false });
    expect(dlsColor(3 * (1 + 1e-12), scale).over).toBe(false);
  });
  test('above Max DLS is flagged red', () => {
    expect(dlsColor(3.2, scale)).toEqual({ bin: DLS_RAMP.length, color: DLS_OVER_COLOR, over: true });
  });
  test('sequential bins from zero, bad values count as zero', () => {
    expect(dlsColor(0, scale).bin).toBe(0);
    expect(dlsColor(1.3, scale).bin).toBe(2);
    expect(dlsColor(NaN, scale).bin).toBe(0);
  });
  test('without Max DLS the plan maximum sets the ramp and nothing is flagged', () => {
    expect(dlsColor(8, { scaleMax: 8 }).over).toBe(false);
    expect(dlsColor(8, { scaleMax: 8 }).bin).toBe(DLS_RAMP.length - 1);
    expect(dlsLegendBins({ scaleMax: 8 }).bins.some((b) => b.over)).toBe(false);
    expect(dlsLegendBins(scale).bins[DLS_RAMP.length]).toMatchObject({ from: 3, over: true });
  });
  test('runs group consecutive segments; segment i-1 to i takes row i DLS', () => {
    const rows = [0, 0, 3, 3, 5, 0].map((d, i) => ({ vs: i, tvd: i * 10, dls30m: d }));
    const runs = dlsRuns(rows, (r) => [r.vs, r.tvd], (r) => r.dls30m, scale);
    expect(runs.map((r) => r.bin)).toEqual([0, 4, 5, 0]);
    expect(runs[0].points).toEqual([[0, 0], [1, 10]]);
    expect(runs[1].points).toEqual([[1, 10], [2, 20], [3, 30]]);
    expect(runs[2].over).toBe(true);
    // runs share their joining vertex, so the path stays continuous
    expect(runs[3].points[0]).toEqual(runs[2].points[runs[2].points.length - 1]);
  });
});

describe('SectionViewChart', () => {
  test('prints the scale on the plot and follows the exaggeration picker', () => {
    render(<SectionViewChart rows={testerRows()} unit="m" vsAzimuthDeg={45} />);
    expect(screen.getByTestId('section-scale-note')).toHaveTextContent('True scale (1:1)');
    fireEvent.change(screen.getByTestId('section-exaggeration'), { target: { value: 'v5' } });
    expect(screen.getByTestId('section-scale-note')).toHaveTextContent('Vertical exaggeration 5x');
    fireEvent.change(screen.getByTestId('section-exaggeration'), { target: { value: 'h10' } });
    expect(screen.getByTestId('section-scale-note')).toHaveTextContent('Horizontal exaggeration 10x');
  });

  test('DLS colouring shows the legend with the Max DLS flag', () => {
    render(<SectionViewChart rows={testerRows()} unit="m"
      dlsScale={{ key: 'dls30m', unitLabel: 'deg/30m', maxDls: 2.5, scaleMax: 3 }} />);
    expect(screen.getByTestId('dls-legend')).toHaveTextContent('above max 2.5 (flagged)');
  });
});
