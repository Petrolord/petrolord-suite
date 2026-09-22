/**
 * Slice-plane show/hide (tester feedback 2026-09-22: "once a slice is
 * shown it can't be hidden"). One visibility state drives the 3D
 * planes, the Section window's intersection lines and the Map; a plane
 * switched off stays off, in 3D even when the switch lands while the
 * plane is still loading, and in the Section window across scrubs.
 */
import React from 'react';
import {
  render, screen, act, renderHook, fireEvent,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  renderers, stubCanvas2d, GEOM, MANIFEST, DISPLAY, gatedBricks,
} from './cubeView.harness';
import CubeView from '@/pages/apps/Seismolord/components/CubeView';
import SliceView from '@/pages/apps/Seismolord/components/SliceView';
import useSliceVisibility, { VIS_KEY, readInitialSliceVis } from '@/pages/apps/Seismolord/hooks/useSliceVisibility';
import {
  planeMarksFor, PLANE_COLORS, DEFAULT_SLICE_VIS, sanitizeSliceVis,
} from '@/pages/apps/Seismolord/viewer/planeMarks';
import { isReservedSessionName } from '@/pages/apps/Seismolord/services/sessionsService';
import { DISPLAY_PREFIX } from '@/pages/apps/Seismolord/services/volumeDisplayState';

jest.mock('@/pages/apps/Seismolord/viewer/CubeRenderer',
  () => require('./cubeView.harness').cubeRendererMock());
jest.mock('@/pages/apps/Seismolord/viewer/SliceRenderer', () => ({
  SliceRenderer: class {
    constructor() {
      this.lut = new Uint8Array(256 * 4);
      return new Proxy(this, {
        get: (t, k) => (k in t ? t[k] : () => {}),
      });
    }
  },
  SEISMIC_COLORMAPS: [{ key: 'seismic', label: 'Seismic' }],
}));
jest.mock('@/pages/apps/Seismolord/services/volumeDisplayState', () => ({
  DISPLAY_PREFIX: '__volume_display__:',
  loadVolumeDisplay: jest.fn(async () => null),
  saveVolumeDisplay: jest.fn(async () => true),
}));

beforeAll(() => stubCanvas2d());
beforeEach(() => {
  localStorage.clear();
  renderers.length = 0;
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('3D window: a plane switched off stays off', () => {
  const baseProps = (over) => ({
    geom: GEOM,
    manifest: MANIFEST,
    indices: { inline: 3, xline: 3, time: 8 },
    onChangeIndex: jest.fn(),
    display: DISPLAY,
    vexag: 1,
    sliceVis: { inline: true, xline: false, time: false },
    onToggleSlicePlane: jest.fn(),
    ...over,
  });

  test('hiding a loaded plane removes it, and scrubbing does not bring it back', async () => {
    const { getBrick } = gatedBricks({ immediate: true });
    const props = baseProps({ getBrick });
    const { rerender } = render(<CubeView {...props} />);
    await flush();
    const r = renderers[renderers.length - 1];
    expect(r.planes.has('inline')).toBe(true);
    rerender(<CubeView {...props} sliceVis={{ inline: false, xline: false, time: false }} />);
    await flush();
    expect(r.planes.has('inline')).toBe(false);
    // the Section window keeps scrubbing the inline: the 3D plane stays off
    rerender(<CubeView {...props} sliceVis={{ inline: false, xline: false, time: false }} indices={{ inline: 5, xline: 3, time: 8 }} />);
    await flush();
    expect(r.planes.has('inline')).toBe(false);
  });

  test('hiding a plane WHILE it loads keeps it hidden when the load lands (the race)', async () => {
    const gate = gatedBricks();
    const props = baseProps({ getBrick: gate.getBrick });
    const { rerender } = render(<CubeView {...props} />);
    await flush();
    expect(gate.pending()).toBeGreaterThan(0);      // inline assembling
    rerender(<CubeView {...props} sliceVis={{ inline: false, xline: false, time: false }} />);
    await flush();
    await act(async () => { gate.release(); });
    await flush();
    const r = renderers[renderers.length - 1];
    expect(r.planes.has('inline')).toBe(false);
  });

  test('showing it again loads it again', async () => {
    const { getBrick } = gatedBricks({ immediate: true });
    const props = baseProps({ getBrick });
    const { rerender } = render(<CubeView {...props} />);
    await flush();
    rerender(<CubeView {...props} sliceVis={{ inline: false, xline: false, time: false }} />);
    await flush();
    rerender(<CubeView {...props} sliceVis={{ inline: true, xline: true, time: false }} />);
    await flush();
    const r = renderers[renderers.length - 1];
    expect(r.planes.has('inline')).toBe(true);
    expect(r.planes.has('xline')).toBe(true);
  });

  test('the Planes menu toggles the shared state, not a private copy', async () => {
    const { getBrick } = gatedBricks({ immediate: true });
    const props = baseProps({ getBrick });
    render(<CubeView {...props} />);
    await flush();
    const trigger = screen.getByTitle('3D layers');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const item = await screen.findByTestId('cube-plane-inline');
    expect(item).toHaveAttribute('data-state', 'checked');
    fireEvent.click(item);
    expect(props.onToggleSlicePlane).toHaveBeenCalledWith('inline');
  });
});

describe('Section window: intersection lines follow the same switch', () => {
  test('planeMarksFor draws only the visible OTHER planes', () => {
    const idx = { inline: 4, xline: 6, time: 10 };
    expect(planeMarksFor('inline', idx, { inline: true, xline: true, time: true }))
      .toEqual([
        { orientation: 'xline', axis: 'x', at: 6, color: PLANE_COLORS.xline },
        { orientation: 'time', axis: 'y', at: 10, color: PLANE_COLORS.time },
      ]);
    expect(planeMarksFor('inline', idx, { inline: true, xline: false, time: false })).toEqual([]);
    expect(planeMarksFor('time', idx, { inline: true, xline: false, time: true }))
      .toEqual([{ orientation: 'inline', axis: 'y', at: 4, color: PLANE_COLORS.inline }]);
    expect(planeMarksFor('traverse', idx, { inline: true, xline: true, time: true })).toEqual([]);
  });

  // record the stroke colours the overlay uses
  const recordStrokes = () => {
    const strokes = [];
    const ctx = new Proxy({ strokeStyle: '' }, {
      get: (t, k) => {
        if (k === 'stroke') return () => strokes.push(t.strokeStyle);
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'createImageData' || k === 'getImageData') {
          return (w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h });
        }
        if (k in t) return t[k];
        return () => {};
      },
      set: (t, k, v) => { t[k] = v; return true; },
    });
    HTMLCanvasElement.prototype.getContext = function getContext() { return ctx; };
    return strokes;
  };

  const SLICE = {
    data: new Float32Array(16 * 8), width: 16, height: 8, traceRms: new Float32Array(8),
    nullValue: 1e30, orientation: 'inline', index: 3,
  };
  const OVERLAYS = {
    horizons: [], surfaces: [], faults: [], draftSticks: [], seedPick: null, wells: [], terminations: [],
  };

  test('a crossline switched off stays off on the inline section while scrubbing', async () => {
    const strokes = recordStrokes();
    const idx = { inline: 3, xline: 5, time: 8 };
    const props = {
      slice: SLICE, geom: GEOM, manifest: MANIFEST, orientation: 'inline', sliceIndex: 3,
      display: DISPLAY, overlays: OVERLAYS, pickMode: null, loading: false,
      onPick: () => {}, onStepSlice: () => {},
    };
    const { rerender } = render(
      <SliceView {...props} planeMarks={planeMarksFor('inline', idx, { inline: true, xline: true, time: false })} />,
    );
    await flush();
    expect(strokes).toContain(PLANE_COLORS.xline);
    // switch the crossline off, then keep scrubbing inlines
    const off = { inline: true, xline: false, time: false };
    rerender(<SliceView {...props} planeMarks={planeMarksFor('inline', idx, off)} />);
    await flush();
    strokes.length = 0;
    for (const il of [4, 5, 6]) {
      rerender(
        <SliceView
          {...props}
          slice={{ ...SLICE, index: il }}
          sliceIndex={il}
          planeMarks={planeMarksFor('inline', { ...idx, inline: il }, off)}
        />,
      );
      // eslint-disable-next-line no-await-in-loop
      await flush();
    }
    expect(strokes).not.toContain(PLANE_COLORS.xline);
    stubCanvas2d();
  });
});

describe('useSliceVisibility: one state, saved with the volume', () => {
  // eslint-disable-next-line global-require
  const svc = () => require('@/pages/apps/Seismolord/services/volumeDisplayState');

  beforeEach(() => {
    jest.useFakeTimers();
    svc().loadVolumeDisplay.mockReset().mockResolvedValue(null);
    svc().saveVolumeDisplay.mockReset().mockResolvedValue(true);
  });
  afterEach(() => jest.useRealTimers());

  test('defaults show inline and crossline, time slice off', () => {
    expect(readInitialSliceVis(localStorage)).toEqual(DEFAULT_SLICE_VIS);
    expect(DEFAULT_SLICE_VIS).toEqual({ inline: true, xline: true, time: false });
  });

  test('a toggle switched off stays off and is saved for this volume', async () => {
    const { result } = renderHook(() => useSliceVisibility({ volumeId: 'v1' }));
    await act(async () => {});
    act(() => result.current.toggle('inline'));
    expect(result.current.sliceVis.inline).toBe(false);
    act(() => { jest.advanceTimersByTime(1500); });
    expect(svc().saveVolumeDisplay).toHaveBeenCalledWith('v1', {
      sliceVis: { inline: false, xline: true, time: false },
    });
    expect(JSON.parse(localStorage.getItem(VIS_KEY)).inline).toBe(false);
    expect(result.current.sliceVis.inline).toBe(false);
  });

  test('opening a volume adopts its saved state', async () => {
    svc().loadVolumeDisplay.mockResolvedValue({ sliceVis: { inline: false, xline: true, time: true } });
    const { result } = renderHook(() => useSliceVisibility({ volumeId: 'v2' }));
    await act(async () => {});
    expect(result.current.sliceVis).toEqual({ inline: false, xline: true, time: true });
  });

  test('a user toggle made before the saved state arrives wins', async () => {
    let resolve;
    svc().loadVolumeDisplay.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useSliceVisibility({ volumeId: 'v3' }));
    act(() => result.current.toggle('xline'));
    await act(async () => { resolve({ sliceVis: { inline: true, xline: true, time: true } }); });
    expect(result.current.sliceVis.xline).toBe(false);
  });

  test('a named session restore wins over the volume state', async () => {
    let resolve;
    svc().loadVolumeDisplay.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useSliceVisibility({ volumeId: 'v4' }));
    act(() => result.current.restore({ inline: false, xline: false, time: true }));
    await act(async () => { resolve({ sliceVis: { inline: true, xline: true, time: false } }); });
    expect(result.current.sliceVis).toEqual({ inline: false, xline: false, time: true });
  });

  test('payloads are sanitized and the reserved rows stay out of the Sessions list', () => {
    expect(sanitizeSliceVis({ inline: 'yes', time: true })).toEqual({ inline: true, xline: true, time: true });
    expect(isReservedSessionName(`${DISPLAY_PREFIX}abc`)).toBe(true);
    expect(isReservedSessionName('My session')).toBe(false);
  });
});
