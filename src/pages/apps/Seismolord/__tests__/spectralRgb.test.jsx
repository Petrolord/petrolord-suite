/**
 * Spectral decomposition RGB blend (QI showcase, 2026-10-16): three
 * spectral volumes as red, green and blue on the Map window's time slice
 * and along a horizon.
 *  - which volumes can blend (same lattice, spectral, own children first,
 *    by frequency) and the low/middle/high auto pick;
 *  - the hook fetches the three channels' time slice at the Map's time and
 *    blends them; a horizon is sampled in each channel volume at its picks;
 *  - the attribute dialog makes the three frequency volumes in one run;
 *  - the Home ribbon group sets each channel.
 * The blend arithmetic and its known-frequency gate are engine tests
 * (packages/engines/__tests__/seismolord.spectralBlend.test.js).
 */
import React from 'react';
import {
  render, screen, fireEvent, renderHook, act, waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: { storage: { from: () => ({}) }, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } },
}));
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
const mockStart = jest.fn(async () => ({}));
jest.mock('../services/serverAttribute', () => ({
  serverAttributeAdvice: () => ({ offer: true, preferred: true }),
  startServerAttribute: (...a) => mockStart(...a),
}));
jest.mock('@/lib/localWorkspace/runtime', () => ({ useVolumePlacement: () => null, PLACEMENT: { HERE: 'here' } }));

/* eslint-disable import/first */
import useSpectralRgb, {
  spectralFreq, rgbCandidates, autoPickTriplet, blendChannels,
} from '../hooks/useSpectralRgb';
import ComputeAttributeDialog from '../components/workspace/dialogs/ComputeAttributeDialog';
import HomeTab from '../components/workspace/ribbonTabs/HomeTab';
import { geomFromManifest } from '../engine/sliceAssembly';
import { NULL_VALUE } from '../engine/manifest';
/* eslint-enable import/first */

const GEO = { il: { min: 1, max: 4, step: 1, count: 4 }, xl: { min: 1, max: 5, step: 1, count: 5 }, ns: 8, dt_us: 4000, corners: [[0, 0], [1, 0], [0, 1]] };
const MANIFEST = {
  geometry: GEO,
  brick: { size: 4, grid: [1, 2, 2], count: 4, dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1.0e30 },
};
const meta = { il: GEO.il, xl: GEO.xl, ns: 8, dt_us: 4000, corners: GEO.corners };
const spec = (id, f, parent = 'v1', extra = {}) => ({
  id, name: `Ekene [Spectral decomposition ${f} Hz 120 ms]`, kind: 'attribute', parent_volume_id: parent,
  attribute_params: { name: 'spectral', params: { freqHz: f, windowMs: 120 } }, survey_meta: meta, ...extra,
});
const VOL = { id: 'v1', name: 'Ekene', survey_meta: meta };
const VOLUMES = [VOL, spec('s40', 40), spec('s12', 12), spec('s25', 25), spec('o30', 30, 'other'),
  { id: 'env', name: 'Ekene [Envelope]', kind: 'attribute', attribute_params: { name: 'envelope' }, survey_meta: meta },
  spec('far', 20, 'v1', { survey_meta: { ...meta, il: { min: 1, max: 9, step: 1, count: 9 } } })];

describe('which volumes blend', () => {
  test('spectral frequency of a row', () => {
    expect(spectralFreq(spec('a', 25))).toBe(25);
    expect(spectralFreq(VOLUMES[5])).toBeNull();
    expect(spectralFreq(VOL)).toBeNull();
  });

  test('same-lattice spectral volumes, own children first, then by frequency', () => {
    const c = rgbCandidates(VOLUMES, VOL, MANIFEST);
    expect(c.map((v) => v.id)).toEqual(['s12', 's25', 's40', 'o30']);
  });

  test('auto pick takes low, middle and high of the own children', () => {
    const c = rgbCandidates(VOLUMES, VOL, MANIFEST);
    expect(autoPickTriplet(c, 'v1')).toEqual(['s12', 's25', 's40']);
    expect(autoPickTriplet(c.slice(0, 2), 'v1')).toBeNull();
  });

  test('blendChannels clips each channel to its own range', () => {
    const r = Float32Array.from([0, 10, 5, NULL_VALUE]);
    const g = Float32Array.from([1, 1, 3, 1]);
    const b = Float32Array.from([0, 0, 0, 0]);
    const { pixels, dominant } = blendChannels(r, g, b, { lo: 0, hi: 1 });
    expect(Array.from(pixels.slice(4, 8))).toEqual([255, 0, 0, 255]);
    expect(pixels[15]).toBe(0);
    expect(Array.from(dominant)).toEqual([0, 0, 1, -1]);
  });
});

// a channel source: time slice data = channel weight x (i * 5 + x); bricks hold sample index k
function fakeSource(weight) {
  return {
    getSlice: jest.fn(async () => ({ data: Float32Array.from({ length: 20 }, (_, c) => weight * (c + 1)), width: 5, height: 4 })),
    getBrick: jest.fn(async (i, j, k) => Float32Array.from({ length: 64 }, (_, n) => weight * (k * 4 + (n % 4)))),
    close: jest.fn(),
  };
}

describe('useSpectralRgb', () => {
  const geom = geomFromManifest(MANIFEST);
  const sources = { s12: fakeSource(1), s25: fakeSource(2), s40: fakeSource(3) };
  const openSource = jest.fn(async (row) => ({ source: sources[row.id], manifest: MANIFEST }));
  const props = {
    volumes: VOLUMES, volume: VOL, manifest: MANIFEST, geom, timeOn: true, timeIndex: 3, openSource, debounceMs: 0,
  };

  test('auto pick opens three channels and blends their time slice at the Map time', async () => {
    const h = renderHook((p) => useSpectralRgb(p), { initialProps: props });
    expect(h.result.current.active).toBe(false);
    await act(async () => { expect(await h.result.current.autoPick()).toBe(true); });
    expect(h.result.current.ids).toEqual(['s12', 's25', 's40']);
    await waitFor(() => expect(h.result.current.slice).not.toBeNull());
    const s = h.result.current.slice;
    expect(s).toMatchObject({ width: 5, height: 4, index: 3, ms: 12 });
    expect(s.pixels).toHaveLength(80);
    expect(sources.s25.getSlice).toHaveBeenCalledWith({ orientation: 'time', index: 3, prefetch: false }, expect.anything());
    expect(h.result.current.info.map((x) => x.freqHz)).toEqual([12, 25, 40]);
  });

  test('a horizon is sampled in each channel volume at its picks', async () => {
    const h = renderHook((p) => useSpectralRgb(p), { initialProps: props });
    await act(async () => { await h.result.current.autoPick(); });
    const grid = new Float32Array(20).fill(2);
    grid[0] = NULL_VALUE;
    let res;
    await act(async () => { res = await h.result.current.horizon(grid); });
    // brick values at sample 2 are weight x 2
    expect(res.r[1]).toBeCloseTo(2);
    expect(res.g[1]).toBeCloseTo(4);
    expect(res.b[1]).toBeCloseTo(6);
    expect(res.pixels[3]).toBe(0);   // null pick is transparent
    expect(res.pixels[7]).toBe(255);
  });

  test('clear drops the blend and closes the channel sources', async () => {
    const h = renderHook((p) => useSpectralRgb(p), { initialProps: props });
    await act(async () => { await h.result.current.autoPick(); });
    act(() => h.result.current.clear());
    expect(h.result.current.active).toBe(false);
    expect(h.result.current.slice).toBeNull();
    expect(sources.s12.close).toHaveBeenCalled();
  });

  test('a volume on another lattice is refused with a message', async () => {
    const onError = jest.fn();
    const other = { ...MANIFEST, geometry: { ...GEO, il: { min: 1, max: 9, step: 1, count: 9 } } };
    const h = renderHook((p) => useSpectralRgb(p), {
      initialProps: { ...props, onError, openSource: async () => ({ source: fakeSource(1), manifest: other }) },
    });
    await act(async () => { await h.result.current.setChannel(0, 's12'); });
    expect(onError).toHaveBeenCalledWith('RGB blend unavailable', expect.stringMatching(/same survey lattice/));
    expect(h.result.current.ids[0]).toBeNull();
  });
});

describe('attribute dialog: three frequencies in one run', () => {
  beforeEach(() => mockStart.mockClear());

  test('makes one spectral volume per frequency, named by frequency, with a 120 ms window', async () => {
    render(<ComputeAttributeDialog open onOpenChange={() => {}} volume={{ id: 'v1', name: 'Ekene', user_id: 'u1' }} manifest={MANIFEST} initialAttribute="spectral" />);
    fireEvent.click(await screen.findByTestId('sl-attr-rgb-set'));
    expect(screen.getByTestId('sl-attr-rgb-freqs')).toHaveValue('12, 25, 40');
    fireEvent.click(screen.getByRole('button', { name: /compute/i }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(3));
    const calls = mockStart.mock.calls.map(([a]) => [a.attribute.params.freqHz, a.attribute.params.windowMs, a.name]);
    expect(calls).toEqual([
      [12, 120, 'Ekene [Spectral decomposition 12 Hz 120 ms]'],
      [25, 120, 'Ekene [Spectral decomposition 25 Hz 120 ms]'],
      [40, 120, 'Ekene [Spectral decomposition 40 Hz 120 ms]'],
    ]);
  });

  test('frequencies out of order are refused before anything runs', async () => {
    render(<ComputeAttributeDialog open onOpenChange={() => {}} volume={{ id: 'v1', name: 'Ekene' }} manifest={MANIFEST} initialAttribute="spectral" />);
    fireEvent.click(await screen.findByTestId('sl-attr-rgb-set'));
    fireEvent.change(screen.getByTestId('sl-attr-rgb-freqs'), { target: { value: '40, 25, 12' } });
    expect(screen.getByTestId('sl-attr-blocked')).toHaveTextContent(/ascending/);
    expect(screen.getByRole('button', { name: /compute/i })).toBeDisabled();
  });
});

const noop = () => {};
const HOME = {
  orientation: 'inline', setOrientation: noop, lineLabel: 'Inline 1', sliceIndex: 0, maxIndex: 3, changeIndex: noop,
  colormap: 'rwb', setColormap: noop, gain: 1, setGain: noop, clipRms: 3, setClipRms: noop, polarity: 1, setPolarity: noop,
  traceBalance: false, setTraceBalance: noop, scaleMode: 'rms', setScaleMode: noop, clipPct: 99, setClipPct: noop,
  manualClip: 0, setManualClip: noop, agcOn: false, setAgcOn: noop, agcWindowMs: 120, setAgcWindowMs: noop,
  wiggleMode: 'off', setWiggleMode: noop, reverseCmap: false, setReverseCmap: noop, overlayCandidates: [],
  overlayVolumeId: null, selectOverlayVolume: noop, overlayColormap: 'viridis', setOverlayColormap: noop,
  overlayOpacity: 0.5, setOverlayOpacity: noop, overlayBlend: 'mix', setOverlayBlend: noop, onUndo: noop, onRedo: noop,
  canUndo: false, canRedo: false, onOpenSessions: noop, sectionDomain: 'twt', setSectionDomain: noop, depthReady: false,
};

describe('Home ribbon: Spectral RGB', () => {
  test('each channel select sets its channel; Auto picks', () => {
    const rgb = {
      candidates: rgbCandidates(VOLUMES, VOL, MANIFEST), ids: [null, null, null],
      setChannel: jest.fn(), autoPick: jest.fn(), clear: jest.fn(), active: false,
    };
    render(<HomeTab {...HOME} volumes={VOLUMES} volume={VOL} manifest={MANIFEST} spectralRgb={rgb} />);
    fireEvent.change(screen.getByTestId('sl-rgb-green'), { target: { value: 's25' } });
    expect(rgb.setChannel).toHaveBeenCalledWith(1, 's25');
    fireEvent.click(screen.getByTestId('sl-rgb-auto'));
    expect(rgb.autoPick).toHaveBeenCalled();
    expect(screen.queryByTestId('sl-rgb-clear')).toBeNull();
  });

  test('no group without the blend wired in', () => {
    render(<HomeTab {...HOME} volumes={[VOL]} volume={VOL} manifest={MANIFEST} />);
    expect(screen.queryByTestId('sl-rgb-red')).toBeNull();
  });
});
