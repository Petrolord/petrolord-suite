/**
 * H11 (Reservoir honesty sweep): the Hall plot.
 *
 * Hall (1963) plots the cumulative pressure-time integral (psi-day) on the
 * y axis against cumulative water injected (bbl) on the x axis. The slope
 * d(integral)/d(injected) is p/q, so it RISES when the well plugs. The
 * engine computes exactly that slope (computeHallPlots), and its alert says
 * "Hall slope up, declining injectivity".
 *
 * The chart had the axes the other way round: integral on x, injection on
 * y. On that chart a plugging well bends DOWN while the legend quoted a
 * slope that went up and the caption said "a steepening slope signals
 * declining injectivity".
 *
 * Known case: 1000 bbl/d throughout; 2000 psi for 15 days, then 3000 psi
 * for 15 days (plugging). Baseline slope 2 psi-day/bbl, recent slope 3.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { computeHallPlots } from '@/utils/waterfloodCalculations';

const mockSeen = { scatters: [], x: null, y: null };
jest.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return {
    ScatterChart: Pass,
    CartesianGrid: () => null,
    ZAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
    XAxis: (props) => { mockSeen.x = props; return <div data-testid="x-axis">{props.label?.value}</div>; },
    YAxis: (props) => { mockSeen.y = props; return <div data-testid="y-axis">{props.label?.value}</div>; },
    Scatter: (props) => { mockSeen.scatters.push(props); return <div data-testid="series">{props.name}</div>; },
  };
});
jest.mock('@/components/charts/ChartFrame', () => ({ children }) => <div>{children}</div>);
jest.mock('framer-motion', () => ({ motion: { div: ({ children }) => <div>{children}</div> } }));

import HallPlotPanel, { hallPlotPoints } from '@/components/waterflood/HallPlotPanel';

const day = (i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
function hallCase(pressureOf) {
  const dates = Array.from({ length: 30 }, (_, i) => day(i));
  const series = new Map([['INJ-1', {
    well: 'INJ-1', type: 'injector', dates,
    inj: dates.map(() => 1000),
    whp: dates.map((_, i) => pressureOf(i)),
  }]]);
  return computeHallPlots({ series }, ['INJ-1'], {});
}
const plugging = hallCase((i) => (i < 15 ? 2000 : 3000));
const steady = hallCase(() => 2000);

// slope of the drawn curve over its last ten points, dy/dx
const drawnSlope = (pts, from, to) => (pts[to].y - pts[from].y) / (pts[to].x - pts[from].x);

beforeEach(() => { mockSeen.scatters = []; mockSeen.x = null; mockSeen.y = null; });

describe('H11: the Hall plot follows the Hall (1963) convention', () => {
  it('the engine slope is integral over injected volume and rises with plugging', () => {
    const h = plugging.hall_plots[0];
    expect(h.slope_baseline).toBeCloseTo(2, 9); // 2000 psi / 1000 bbl/d
    expect(h.slope_last).toBeCloseTo(3, 9);     // 3000 psi / 1000 bbl/d
    expect(h.slope_ratio).toBeCloseTo(1.5, 9);
    expect(plugging.injectivity_alerts[0].message).toMatch(/Hall slope up 1\.50.*declining injectivity/);
    // negative control: a well that does not plug raises no alert
    expect(steady.hall_plots[0].slope_ratio).toBeCloseTo(1, 9);
    expect(steady.injectivity_alerts).toEqual([]);
  });

  it('the drawn curve has the slope the legend quotes', () => {
    const h = plugging.hall_plots[0];
    const pts = hallPlotPoints(h);
    expect(pts[0]).toEqual({ x: 1000, y: 2000 });            // one day: 1000 bbl, 2000 psi-day
    expect(pts[29]).toEqual({ x: 30000, y: 75000 });          // 15 x 2000 + 15 x 3000 psi-day
    expect(drawnSlope(pts, 20, 29)).toBeCloseTo(h.slope_last, 9);
    expect(drawnSlope(pts, 0, 9)).toBeCloseTo(h.slope_baseline, 9);
    // the curve steepens when the well plugs
    expect(drawnSlope(pts, 20, 29)).toBeGreaterThan(drawnSlope(pts, 0, 9));
    // negative control: the old mapping (integral on x) gives the reciprocal, and flattens
    const swapped = pts.map((p) => ({ x: p.y, y: p.x }));
    expect(drawnSlope(swapped, 20, 29)).toBeCloseTo(1 / 3, 9);
    expect(drawnSlope(swapped, 20, 29)).not.toBeCloseTo(h.slope_last, 1);
    expect(drawnSlope(swapped, 20, 29)).toBeLessThan(drawnSlope(swapped, 0, 9));
  });

  it('the chart puts injected water on x and the integral on y, and says so', () => {
    render(<HallPlotPanel data={plugging.hall_plots} alerts={{ injectivity_issue: plugging.injectivity_alerts }} />);
    expect(screen.getByTestId('x-axis')).toHaveTextContent(/Cumulative water injected \(bbl\)/);
    expect(screen.getByTestId('y-axis')).toHaveTextContent(/Hall integral.*\(psi·day\)/);
    const drawn = mockSeen.scatters[0].data;
    expect(drawn).toEqual(hallPlotPoints(plugging.hall_plots[0]));
    expect(drawnSlope(drawn, 20, 29)).toBeCloseTo(plugging.hall_plots[0].slope_last, 9);
    // the legend quotes the slope with its unit, and the caption names the axes in that order
    expect(screen.getByTestId('series')).toHaveTextContent('INJ-1 (recent slope 3.00 psi·day/bbl)');
    expect(screen.getByTestId('hall-caption')).toHaveTextContent(/on the vertical axis against cumulative water injected/);
    expect(screen.getByTestId('hall-caption')).toHaveTextContent(/Hall \(1963\)/);
  });
});
