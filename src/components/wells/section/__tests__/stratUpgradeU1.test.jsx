/**
 * AppUpgrade Stratigraphy Step 1 (docs/upgrade/StratigraphyStudio-UPGRADE.md):
 * the shared section kit seen from Stratigraphy Studio. Well Correlation
 * draws the same component, so every fix here reaches it unchanged.
 *
 *  STRAT-U1-003 systems-tract and motif bands were placed by their MD on a
 *  TVD, TVDSS or TWT section (KB metres too deep in TVDSS; metres on a
 *  millisecond axis in TWT). Negative control on origin/main (4300f020a):
 *  the TVDSS span reads 1440-1580 (MD) where the well is at 1410-1550.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import CrossSection from '../CrossSection';
import { makeDepthFrame } from '@/pages/apps/WellDataManager/engine/checkshots';

const noopCtx = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
beforeAll(() => {
  global.ResizeObserver = global.ResizeObserver || class { observe() {} disconnect() {} };
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 900; } });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 600; } });
});
afterAll(() => {
  delete window.HTMLElement.prototype.clientWidth;
  delete window.HTMLElement.prototype.clientHeight;
});

const depth = Float64Array.from({ length: 101 }, (_, k) => 1400 + k * 3);
const well = (id, name, extra = {}) => ({
  id, name, is_own: true, kb_m: 30, depth, tracks: [],
  tops: [{ id: `${id}-a`, name: 'Top A', md_m: 1440 }, { id: `${id}-b`, name: 'Top B', md_m: 1580 }],
  frame: makeDepthFrame({ deviation: null, kbM: 30, tdMdM: 1700 }), ...extra,
});
const bands = [{ wellId: 'w1', top_md_m: 1440, base_md_m: 1580, colour: '#10b981', label: 'HST' }];
const spans = () => screen.getByTestId('corr-section').getAttribute('data-band-spans');

test('STRAT-U1-003 bands follow the depth reference: MD, TVDSS through KB, TWT through checkshots', () => {
  const { rerender } = render(<CrossSection wells={[well('w1', 'A')]} datum={{ mode: 'structural' }} shownTops={[]} bands={bands} depthRef="md" />);
  expect(spans()).toBe('A:1440.0-1580.0');
  rerender(<CrossSection wells={[well('w1', 'A')]} datum={{ mode: 'structural' }} shownTops={[]} bands={bands} depthRef="tvdss" />);
  expect(spans()).toBe('A:1410.0-1550.0');
  // TWT: a linear checkshot 1000 m/s one-way (TWT ms = 2 x TVDSS m)
  const cs = [{ tvdss_m: 0, twt_ms: 0 }, { tvdss_m: 2000, twt_ms: 4000 }];
  rerender(<CrossSection wells={[well('w1', 'A', { checkshots: cs })]} datum={{ mode: 'structural' }} shownTops={[]} bands={bands} depthRef="twt" />);
  expect(spans()).toBe('A:2820.0-3100.0');
});

test('STRAT-U1-003 a well not drawn in time draws no band', () => {
  render(<CrossSection wells={[well('w1', 'A')]} datum={{ mode: 'structural' }} shownTops={[]} bands={bands} depthRef="twt" />);
  expect(spans()).toBe('A:');
});
