/**
 * The Field view's depth axis read metres in a feet session ("Displayed depth
 * (m)", seabed at -1488 when flattened on the Ekene Sand). It now takes the
 * session's depth unit: the axis title says ft and the painter scales by
 * 1/0.3048. Depths stay in metres inside, so only the labels change.
 * Negative control (run 2026-10-09): with the old fixed 'Displayed depth (m)' call the feet test fails.
 */
import React from 'react';
import { render } from '@testing-library/react';

const mockAxis = jest.fn();
jest.mock('@/components/wells/trackPainter', () => ({
  PALETTES: { light: {} },
  paintTrackBody: () => {},
  paintDepthAxis: (...a) => mockAxis(...a),
}));
jest.mock('@/components/wells/DepthNavigator', () => () => null);

import MultiWellTracks from '../components/MultiWellTracks';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} disconnect() {} };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ width: 10 })), set: (t, k, v) => { t[k] = v; return true; } });
});
beforeEach(() => mockAxis.mockClear());

const wells = [{ id: 'w1', name: 'Ekene-1', curves: { DEPT: Float64Array.from([1500, 1550, 1600]) }, tracks: [], tops: [], shift: 0, hasDatumTop: true }];

test('a feet session labels the axis in feet', () => {
  render(<MultiWellTracks wells={wells} depthUnit="ft" />);
  const args = mockAxis.mock.calls.at(-1)?.[1];
  expect(args.title).toBe('Displayed depth (ft)');
  expect(args.F).toBeCloseTo(1 / 0.3048, 10);
});

test('metres by default', () => {
  render(<MultiWellTracks wells={wells} />);
  const args = mockAxis.mock.calls.at(-1)?.[1];
  expect(args.title).toBe('Displayed depth (m)');
  expect(args.F).toBe(1);
});
