/**
 * Chart-rendering regression for the Well Test Analysis Studio (tester round,
 * 2026-09-03). Mounts the studio with ResponsiveContainer replaced by a fixed
 * 800x360 sizer so Recharts actually lays the charts out under jsdom, then
 * checks two things the smoke test cannot see:
 *
 *  1. Every chart card holds a live chart. The log-log plots on the Diagnostics
 *     and Match tabs rendered as a blank white card because LogLogChart sat
 *     between ResponsiveContainer and the ComposedChart and dropped the
 *     width/height the container injects.
 *  2. X-axis titles sit inside the axis band (theme XAXIS_LABEL_HEIGHT) and the
 *     legend reserves its own fixed band (theme LEGEND_PROPS), so the two can
 *     no longer overprint each other ("Gauge pressure" over "Shut-in time").
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LEGEND_PROPS } from '@/utils/chartTheme';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

const WIDTH = 800;
const HEIGHT = 360;
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const React = require('react');
  // What the real ResponsiveContainer does once it has measured itself.
  const ResponsiveContainer = ({ children }) => React.cloneElement(children, { width: 800, height: 360 });
  return { ...actual, ResponsiveContainer };
});

import WellTestAnalysisStudio from '@/pages/apps/WellTestAnalysisStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.setPointerCapture = window.HTMLElement.prototype.setPointerCapture || (() => {});
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

// The ChartFrame surfaces currently mounted (one per ChartCard).
const chartFrames = () => [...document.querySelectorAll('.relative.bg-white')];

const expectFrameDrawsChart = (frame) => {
  expect(frame.querySelectorAll('.recharts-wrapper')).toHaveLength(1);
  expect(frame.querySelector('svg.recharts-surface')).toBeTruthy();
};

// Legend band and X-axis title layout, for every chart with a bottom title.
const expectTitleAndLegendSeparated = (frame) => {
  const svg = frame.querySelector('svg.recharts-surface');
  const title = svg.querySelector('.recharts-xAxis .recharts-label');
  const axisLine = svg.querySelector('.recharts-xAxis .recharts-cartesian-axis-line');
  if (!title || !axisLine) return;
  // title is anchored at its bottom edge, so its y is where the axis band ends
  const titleBottom = Number(title.getAttribute('y'));
  const axisTop = Number(axisLine.getAttribute('y1'));
  // the axis band is tall enough for tick text plus the title
  expect(titleBottom - axisTop).toBeGreaterThanOrEqual(40);
  // the title never runs below the plot's bottom margin into the legend band
  expect(titleBottom).toBeLessThanOrEqual(HEIGHT - 8);

  const legend = frame.querySelector('.recharts-legend-wrapper');
  if (legend) {
    // fixed band, so Recharts reserves exactly this much above the margin
    expect(legend.style.height).toBe(`${LEGEND_PROPS.height}px`);
    expect(legend.style.bottom).toBe('8px');
  }
};

const expectLogLog = (frame, { withModel }) => {
  const svg = frame.querySelector('svg.recharts-surface');
  // Δp and the Bourdet derivative, one symbol per sample point each
  expect(svg.querySelectorAll('.recharts-scatter-symbol').length).toBeGreaterThan(40);
  const xTicks = [...svg.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value')].map((t) => t.textContent);
  expect(xTicks).toEqual(expect.arrayContaining(['0.01', '0.1', '1', '10']));
  expect(svg.outerHTML).not.toMatch(/NaN/);
  expect(svg.querySelectorAll('.recharts-line-curve')).toHaveLength(withModel ? 2 : 0);
};

describe('Well Test Analysis Studio charts', () => {
  it('draws every chart, including the log-log plots, with titles clear of the legend', async () => {
    render(<MemoryRouter><WellTestAnalysisStudio /></MemoryRouter>);
    await screen.findByText('Well Test Analysis Studio');
    fireEvent.click(screen.getByRole('button', { name: /Sample/i }));
    await screen.findByText(/Points used/i);

    // Data tab: pressure history (legend + "Shut-in time" title) and rate history
    expect(chartFrames()).toHaveLength(2);
    chartFrames().forEach((f) => { expectFrameDrawsChart(f); expectTitleAndLegendSeparated(f); });
    expect(screen.getByText('Shut-in time (hr)')).toBeInTheDocument();

    // Diagnostics: the log-log plot is a LogLogChart wrapper inside the frame
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Diagnostics' }));
    await screen.findByText(/Log-log diagnostic plot/i);
    expect(chartFrames()).toHaveLength(1);
    expectFrameDrawsChart(chartFrames()[0]);
    expectTitleAndLegendSeparated(chartFrames()[0]);
    expectLogLog(chartFrames()[0], { withModel: false });

    // Match: log-log match with the model overlay, then the history overlay
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Match' }));
    await screen.findByRole('button', { name: /Auto-fit model/i });
    expect(chartFrames()).toHaveLength(2);
    chartFrames().forEach((f) => { expectFrameDrawsChart(f); expectTitleAndLegendSeparated(f); });
    expectLogLog(chartFrames()[0], { withModel: true });

    // Specialized: Horner and sqrt(t) plots
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Specialized' }));
    await screen.findByText(/Horner plot/i);
    expect(chartFrames()).toHaveLength(2);
    chartFrames().forEach((f) => { expectFrameDrawsChart(f); expectTitleAndLegendSeparated(f); });
  });
});
