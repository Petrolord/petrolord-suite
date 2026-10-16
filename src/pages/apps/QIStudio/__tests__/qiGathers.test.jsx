/**
 * Gather viewer (QI upgrade P1.7): the panel decodes into gathers, the
 * overlays come from the engines (angle contour, stretch mute, residual
 * moveout with the QC coherence rule), the request is checked and turned into
 * the worker's params, wells are placed, and the tab (appended after the Data
 * matrix) shows the gathers from the in-memory worker. Negative controls: a
 * flat event reads no moveout; a short panel is refused.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null,
    save: async () => ({ success: true }), remove: async () => ({ success: true }),
  };
  return { createSavedProjectsService: () => service };
});
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ organization: { name: 'Lordsway Energy' } }) }));

/* eslint-disable import/first */
import QIStudio from '../QIStudio';
import { makeInMemoryBackend, inMemoryGatherPanel } from '../services/inMemoryBackend';
import {
  decodePanel, gatherOverlays, gatherRmo, storedQcAt, wellPoint,
} from '../services/gatherViewer';
import { viewerRequestProblem, viewerParams, drawGatherLine, LINE_GAP } from '../components/GathersPanel';
import { waldenAngle } from '../engine/prestack';
/* eslint-enable import/first */

jest.setTimeout(60000);

test('a panel decodes into stores of gathers of bins; a short panel is refused', () => {
  const r = inMemoryGatherPanel({ dataset_id: 'd', compare_dataset_id: 'e', mode: 'inline', il: 2, from: 1, to: 5, step: 2, t_ms: [800, 1000] }, 'j1');
  const data = new Float32Array(r.stores * r.gathers.length * r.bins.centres.length * r.window.ns).map((_, k) => k);
  const s = decodePanel(data, r);
  expect(s).toHaveLength(2);
  expect(s[0].map((g) => g.xl)).toEqual([2002, 2004, 2006]);
  expect(s[1][0].traces[0][0]).toBe(3 * 12 * r.window.ns);
  expect(s[0][1].traces[2][5]).toBe(1 * 12 * r.window.ns + 2 * r.window.ns + 5);
  expect(() => decodePanel(data.subarray(1), r)).toThrow(/expected/);
});

test('overlays: the angle contour is where the engine angle crosses it; the stretch mute and angle mute are lines per bin', () => {
  const offsets = [250, 750, 1250, 1750, 2250];
  const w = { ns: 801, t0_ms: 0, dt_ms: 2 };
  const o = gatherOverlays({ offsets, velocity: { t_ms: [0], vrms: [2500] }, window: w, angles: [30], maxStretch: 0.3, muteAngle: 40 });
  const t30 = o.contours[0].times[3];
  expect(waldenAngle(1750, t30 / 1000, 2500, 2500)).toBeCloseTo(30, 1);
  expect(o.stretchMute).toHaveLength(5);
  expect(o.stretchMute[4]).toBeGreaterThan(o.stretchMute[0]);
  expect(o.angleMute[4]).toBeLessThan(t30 * 2);
  // no limits asked: no lines
  const none = gatherOverlays({ offsets, velocity: { t_ms: [0], vrms: [2500] }, window: w, angles: [], maxStretch: 0, muteAngle: null });
  expect(none.contours).toEqual([]); expect(none.stretchMute).toBeNull(); expect(none.angleMute).toBeNull();
});

test('residual moveout of the shown gather: the 3 ms residual is read, the flat event is not (negative control)', () => {
  const r = inMemoryGatherPanel({ dataset_id: 'd', mode: 'cdp' }, 'j2');
  return makeInMemoryBackend().fetchGatherPanel(r).then((bytes) => {
    const [[gather]] = decodePanel(bytes, r);
    const out = gatherRmo({ traces: gather.traces, fold: gather.fold, offsets: r.bins.centres, window: r.window, times: [1400, 900] });
    const at1400 = out.find((e) => e.t_ms === 1400); const at900 = out.find((e) => e.t_ms === 900);
    expect(at1400.coherent).toBe(true);
    expect(at1400.rmoFarMs).toBeGreaterThan(2);
    expect(at1400.rmoFarMs).toBeLessThan(4);
    expect(Math.abs(at900.rmoFarMs)).toBeLessThan(0.5);
    expect(at1400.picks.length).toBe(12);
  });
});

test('the stored QC reading is found at a sampled CDP only', () => {
  const rec = { result: { times: [{ t_ms: 900 }, { t_ms: 1400, noEvent: true }], maps: { sampled: [[1, 2], [4, 4]], rmo: [[0.5, 2.2], [null, null]], fold: [40, 48] } } };
  expect(storedQcAt(rec, 4, 4)).toEqual({ times: [{ t_ms: 900, rmoFarMs: 2.2, noEvent: false }, { t_ms: 1400, rmoFarMs: null, noEvent: true }], fold: 48 });
  expect(storedQcAt(rec, 3, 3)).toBeNull();
  expect(storedQcAt(null, 1, 2)).toBeNull();
});

test('a well sits at the middle of its first study target, or at its surface location', () => {
  const well = { name: 'KETA-1', surface_x: 200, surface_y: 125, kb_m: 30, depth_ref_elev_m: 30, depth_ref_kind: 'KB', deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 3000, inc: 30, azi: 90 }], td_md_m: 3000 };
  const zones = [{ name: 'SAND A', top_md_m: 2000, base_md_m: 2080 }];
  const at = wellPoint({ well, zones }, ['SAND A']);
  expect(at.at).toBe('SAND A');
  expect(at.x).toBeGreaterThan(250); // deviated east
  expect(wellPoint({ well, zones }, [])).toEqual({ x: 200, y: 125, label: 'KETA-1', at: 'surface location' });
  expect(wellPoint({ well: { name: 'X' }, zones }, ['SAND A'])).toBeNull();
});

test('requests: problems and the worker params on the store geometry', () => {
  const geometry = { il: { min: 1001, max: 1008, step: 1, count: 8 }, xl: { min: 2001, max: 2015, step: 2, count: 8 } };
  expect(viewerRequestProblem({ mode: 'cdp', il: 'x' }, null)).toMatch(/numbers/);
  expect(viewerRequestProblem({ mode: 'inline', line: '1003' }, null)).toMatch(/Show one CDP first/);
  expect(viewerRequestProblem({ mode: 'inline', line: '1003', from: '2010', to: '2003' }, geometry)).toMatch(/lower number/);
  expect(viewerRequestProblem({ mode: 'cdp', tFrom: '900' }, null)).toMatch(/both ends/);
  expect(viewerRequestProblem({ mode: 'cdp', tFrom: '900', tTo: '800' }, null)).toMatch(/later end/);
  expect(viewerRequestProblem({ mode: 'cdp', il: '', xl: '' }, null)).toBeNull();
  expect(viewerParams({ mode: 'cdp', il: '1003', xl: '2005' }, { storeId: 's', geometry })).toEqual({ dataset_id: 's', mode: 'cdp', il: 2, xl: 2 });
  expect(viewerParams({ mode: 'inline', line: '1004', from: '2003', to: '2011', step: '4', tFrom: '800', tTo: '1500' }, { storeId: 's', compareId: 't', geometry }))
    .toEqual({ dataset_id: 's', compare_dataset_id: 't', mode: 'inline', il: 3, from: 1, to: 5, step: 2, t_ms: [800, 1500] });
  expect(viewerParams({ mode: 'points' }, { storeId: 's', geometry, points: [{ x: 1, y: 2, label: 'W' }] }).points).toEqual([{ x: 1, y: 2, label: 'W' }]);
});

test('the Gathers tab is appended last and shows the store\'s gathers with the moveout table', async () => {
  global.ResizeObserver = global.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  const backend = makeInMemoryBackend();
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  render(<MemoryRouter><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  const tabs = await screen.findAllByRole('tab');
  expect(tabs.map((t) => t.textContent).slice(-3)).toEqual(['Data matrix', 'Maps', 'Gathers']);
  fireEvent.click(screen.getByTestId('qi-tab-gathers'));
  await screen.findByTestId('qi-gathers-store', {}, { timeout: 20000 });
  fireEvent.change(screen.getByTestId('qi-gathers-events'), { target: { value: '1400' } });
  fireEvent.click(screen.getByTestId('qi-gathers-show'));
  await screen.findByTestId('qi-gathers-result', {}, { timeout: 20000 });
  expect(enqueue).toHaveBeenCalledWith('gather_panel', { dataset_id: 'qi-d2', mode: 'cdp' });
  expect(screen.getByTestId('qi-gathers-caption')).toHaveTextContent('recorded as NMO-corrected');
  expect(screen.getByTestId('qi-gathers-canvas-0-0')).toBeInTheDocument();
  const rmo = screen.getByTestId('qi-gathers-rmo-0-0');
  expect(rmo).toHaveTextContent('1400');
  expect(rmo.textContent).toMatch(/1400[23]\.\d/);
  // an inline stretch now that the line numbers are known
  fireEvent.change(screen.getByTestId('qi-gathers-mode'), { target: { value: 'inline' } });
  fireEvent.change(screen.getByTestId('qi-gathers-line'), { target: { value: '1003' } });
  fireEvent.click(screen.getByTestId('qi-gathers-show'));
  // a line of gathers is one panel per store, labelled by its crosslines
  await waitFor(() => expect(screen.getByTestId('qi-gathers-canvas-0-line')).toBeInTheDocument(), { timeout: 20000 });
  expect(screen.getByTestId('qi-gathers-line-0')).toHaveTextContent(/inline 1003, crosslines \d+ to \d+/);
  expect(screen.queryByTestId('qi-gathers-canvas-0-7')).toBeNull();
  expect(enqueue).toHaveBeenLastCalledWith('gather_panel', { dataset_id: 'qi-d2', mode: 'inline', il: 2 });
});

// QI showcase (2026-10-16): along a line every gather had its own chart and
// axes, the offset labels ran together, the conditioned row did not line up
// with the input and was labelled "Trimmed" whatever the conditioning was.
describe('a line of gathers in one panel', () => {
  const recorder = () => {
    const calls = { text: [], images: [] };
    const ctx = {
      fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, setLineDash() {}, save() {}, restore() {}, translate() {}, rotate() {},
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (img, x, y) => calls.images.push([x, y, img.width]),
      fillText: (t, x) => calls.text.push([t, x]),
    };
    return { canvas: { getContext: () => ctx, width: 0, height: 0 }, calls };
  };
  const offsets = [100, 300, 500, 700];
  const window = { t0_ms: 900, dt_ms: 4, ns: 11 };
  const gather = (xl) => ({ il: 1027, xl, traces: offsets.map(() => Float32Array.from({ length: 11 }, (_, s) => Math.sin(s))), fold: offsets.map(() => 1) });

  test('gathers side by side on one time axis, labelled by crossline, the same width for every store', () => {
    const gs = [2044, 2045, 2046, 2047, 2048, 2049].map(gather);
    const a = recorder(); const b = recorder();
    const wa = drawGatherLine(a.canvas, { gathers: gs, offsets, window, clip: 1, display: 'density', overlays: null, traceW: 3, labelOf: (g) => `XL ${g.xl}` });
    const wb = drawGatherLine(b.canvas, { gathers: gs, offsets, window, clip: 1, display: 'density', overlays: null, traceW: 3, labelOf: (g) => `XL ${g.xl}` });
    expect(wa).toBe(44 + 6 * (4 * 3 + LINE_GAP) + 8);
    expect(wb).toBe(wa);   // the input and the conditioned rows line up
    // each gather painted at its own x, one after the other
    expect(a.calls.images.map(([x]) => x)).toEqual([0, 1, 2, 3, 4, 5].map((q) => 44 + q * (12 + LINE_GAP)));
    // crossline labels spaced so they never touch, and one time axis
    const labels = a.calls.text.filter(([t]) => /^XL /.test(t));
    expect(labels.length).toBeGreaterThan(0);
    for (let k = 1; k < labels.length; k++) expect(labels[k][1] - labels[k - 1][1]).toBeGreaterThanOrEqual(46);
    expect(a.calls.text.filter(([t]) => t === 'time (ms)')).toHaveLength(1);
  });
});
