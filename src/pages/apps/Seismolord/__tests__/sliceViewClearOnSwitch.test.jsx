/**
 * A volume switch empties the slice while the new manifest loads. The
 * Section window must clear its panel then: redrawing the previous
 * volume's texture under the new display scale showed a saturated flash of
 * the old section (found recording Seismolord demo 1, 2026-10-10).
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { stubCanvas2d, GEOM, MANIFEST, DISPLAY } from './cubeView.harness';
import SliceView from '@/pages/apps/Seismolord/components/SliceView';

const calls = [];
jest.mock('@/pages/apps/Seismolord/viewer/SliceRenderer', () => ({
  SliceRenderer: class {
    constructor() {
      this.lut = new Uint8Array(256 * 4);
      return new Proxy(this, {
        get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }),
      });
    }
  },
  SEISMIC_COLORMAPS: [{ key: 'seismic', label: 'Seismic' }],
}));

beforeAll(() => stubCanvas2d());
beforeEach(() => { calls.length = 0; });

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const SLICE = {
  data: new Float32Array(16 * 8), width: 16, height: 8, traceRms: new Float32Array(8),
  nullValue: 1e30, orientation: 'inline', index: 3,
};
const OVERLAYS = {
  horizons: [], surfaces: [], faults: [], draftSticks: [], seedPick: null, wells: [], terminations: [],
};
const props = {
  slice: SLICE, geom: GEOM, manifest: MANIFEST, orientation: 'inline', sliceIndex: 3,
  display: DISPLAY, overlays: OVERLAYS, pickMode: null, loading: false,
  onPick: () => {}, onStepSlice: () => {},
};

test('the panel clears when the slice empties, before the new display scale applies', async () => {
  const { rerender } = render(<SliceView {...props} />);
  await flush();
  expect(calls.some(([k]) => k === 'setSlice')).toBe(true);
  expect(calls.some(([k]) => k === 'clear')).toBe(false);
  calls.length = 0;
  // the switch: no slice, no manifest, and the fallback clip of the new volume
  rerender(<SliceView {...props} slice={null} manifest={null} display={{ ...DISPLAY, clip: 3 }} />);
  await flush();
  const clearAt = calls.findIndex(([k]) => k === 'clear');
  expect(clearAt).toBeGreaterThanOrEqual(0);
  expect(calls.some(([k]) => k === 'setSlice')).toBe(false);
});
