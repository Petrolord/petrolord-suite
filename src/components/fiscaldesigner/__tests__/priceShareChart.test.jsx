/**
 * EC2-1 (owner decision 2026-09-14): the government share chart draws each
 * point for what it is. Fixtures are the engine's published goldens, run
 * through the real engine:
 *
 *   cmp_never_recovers   every regime undefined at every price: no line, one
 *                        shaded band across the sweep, and the verdict
 *                        declines to rank
 *   cmp_angola_capex_x3  the barely positive points: 2223 percent at 50 and
 *                        144 at 60 are pinned open markers that do not set the
 *                        scale, and 40 is a shaded band
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { runFiscalComparison } from '@/utils/fiscalDesignerCalculations';
import { buildPriceShareChart, describePoint, UNECONOMIC_BAND_LABEL } from '../priceShareChart';
import PriceShareChart from '../PriceShareChart';
import { metricDefinition } from '@/utils/fiscalConventions';

jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const React = require('react');
  // What the real ResponsiveContainer does once it has measured itself.
  const ResponsiveContainer = ({ children }) => React.cloneElement(children, { width: 800, height: 360 });
  return { ...actual, ResponsiveContainer };
});

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const G = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../../../packages/engines/test-data/economics/goldens/fiscal_cases.json'), 'utf8',
));
const run = (id) => {
  const c = G.comparisons.find((x) => x.id === id);
  return runFiscalComparison({ projectInputs: c.project, regimes: c.regimes });
};
const COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626'];

// A drawn line is a curve path with geometry in it.
const drawnCurves = (container) => [...container.querySelectorAll('path.recharts-line-curve')]
  .filter((p) => (p.getAttribute('d') || '').trim().length > 0);

describe('never recovers: all six regimes undefined across the sweep', () => {
  let res;
  let model;
  beforeAll(async () => {
    res = await run('cmp_never_recovers');
    model = buildPriceShareChart(res.sensitivityData.price, res.summary);
  });

  it('models no line, no marker and one band over the whole sweep', () => {
    expect(model.names).toHaveLength(6);
    expect(model.hasShareLine).toBe(false);
    model.rows.forEach((row) => model.names.forEach((name) => {
      expect(row[name]).toBeNull();
      expect(row.meta[name]).toEqual({ state: 'undefined', value: null });
    }));
    expect(model.pinned).toEqual([]);
    expect(model.bands).toEqual([{ x1: 35, x2: 125, from: 40, to: 120 }]);
    expect(describePoint(model.rows[0].meta[model.names[0]])).toBe(`no government take: ${UNECONOMIC_BAND_LABEL}`);
  });

  it('renders no line, the shaded band with its label, and no pinned marker', () => {
    const { container } = render(<PriceShareChart model={model} colors={COLORS} />);
    expect(drawnCurves(container)).toHaveLength(0);
    expect(container.querySelectorAll('.fiscal-uneconomic-band')).toHaveLength(1);
    expect(container.textContent).toContain(UNECONOMIC_BAND_LABEL);
    expect(container.querySelectorAll('.fiscal-pinned-marker')).toHaveLength(0);
    // Nothing is drawn at zero: there is no dot on the plot either.
    expect(container.querySelectorAll('.recharts-line-dot')).toHaveLength(0);
  });

  it('carries the government take definition inside the exported frame', () => {
    const { container } = render(<PriceShareChart model={model} colors={COLORS} />);
    const header = container.querySelector('.chart-frame-header');
    expect(header.textContent).toBe(metricDefinition('governmentTake'));
    // Inside the captured element, so the PNG export carries it.
    expect(header.closest('[id^="chart-frame-"]')).toBeTruthy();
  });

  it('the insight declines to rank and says no regime is economic', () => {
    const price = res.insights.find((i) => i.key === 'price');
    expect(price.text).toMatch(/^No regime can be ranked across this sweep/);
    expect(price.text).toMatch(/No regime is economic at any swept price from 40 to 120 USD per bbl\.$/);
  });
});

describe('the barely positive point: Angola with tripled capex', () => {
  let model;
  beforeAll(async () => {
    const res = await run('cmp_angola_capex_x3');
    model = buildPriceShareChart(res.sensitivityData.price, res.summary);
  });

  it('flags 50 and 60 as exceeds, pins them at the top and keeps the true value', () => {
    const [angola] = model.names;
    expect(model.rows.map((r) => r.meta[angola].state).slice(0, 4)).toEqual(['undefined', 'exceeds', 'exceeds', 'share']);
    expect(model.pinned).toHaveLength(1);
    const [p50, p60] = model.pinned[0].points;
    expect(p50.price).toBe(50);
    expect(p50.value).toBeCloseTo(2223.0766, 4);
    expect(p60.price).toBe(60);
    expect(p60.value).toBeCloseTo(144.0692, 4);
    expect(p50.pinnedAt).toBe(model.domain[1]);
    expect(p60.pinnedAt).toBe(model.domain[1]);
    expect(describePoint(model.rows[1].meta[angola])).toMatch(/^2223\.1 %, above 100 percent/);
  });

  it('does not let the exceeds points set the scale', () => {
    expect(model.domain[1]).toBeLessThanOrEqual(100);
    // The shares run 53.8218 (at 100) to 85.6015 (at 70), so the axis is 40 to
    // 100 and the 2223 percent point sits pinned at its top.
    expect(model.domain).toEqual([40, 100]);
    expect(model.rows[1][model.names[0]]).toBeNull();
  });

  it('renders two open markers on one row at the top, a drawn line and the band at 40', () => {
    const { container } = render(<PriceShareChart model={model} colors={COLORS} />);
    const markers = [...container.querySelectorAll('.fiscal-pinned-marker')];
    expect(markers).toHaveLength(2);
    expect(markers[0].getAttribute('fill')).toBe('#ffffff');
    expect(markers[0].getAttribute('cy')).toBe(markers[1].getAttribute('cy'));
    expect(drawnCurves(container)).toHaveLength(1);
    expect(container.querySelectorAll('.fiscal-uneconomic-band')).toHaveLength(1);
    expect(model.bands).toEqual([{ x1: 35, x2: 45, from: 40, to: 40 }]);
  });
});

describe('an ordinary comparison', () => {
  it('draws every point as a share, with no band and no marker', async () => {
    const res = await run('cmp_all_templates_default_project');
    const model = buildPriceShareChart(res.sensitivityData.price, res.summary);
    expect(model.bands).toEqual([]);
    expect(model.pinned).toEqual([]);
    expect(model.hasShareLine).toBe(true);
    model.rows.forEach((row) => model.names.forEach((name) => expect(row[name]).toEqual(expect.any(Number))));
  });
});
