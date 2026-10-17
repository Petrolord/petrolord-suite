/**
 * Geoscience video Part B (2026-10-17): the well map fills the view, can
 * lay a structure surface under the wells and stacks the labels of
 * co-located wells; the Logs tab draws a built-in track template (GR fill,
 * density-neutron crossover, log RT) and keeps the ticked-curve quick view
 * as "Custom".
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import WellsMap, { stackLabels, zDisplayFactor, backdropSurfaces } from '../components/WellsMap';
import { wdmTemplates, resolveWellTemplate, publishedOutputs, depthWindows, dataExtent, CUSTOM_VIEW } from '../services/logTemplates';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);

let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true }));
});

describe('labels and units', () => {
  test('co-located wells take successive label lines; others stay on line 0', () => {
    const lines = stackLabels([{ id: 'a', px: 100, py: 100 }, { id: 'b', px: 102, py: 101 }, { id: 'c', px: 300, py: 100 }, { id: 'd', px: 100, py: 104 }]);
    expect([...lines.entries()]).toEqual([['a', 0], ['b', 1], ['c', 0], ['d', 2]]);
    // negative control: wells further apart than the tolerance never stack
    expect([...stackLabels([{ id: 'a', px: 0, py: 0 }, { id: 'b', px: 20, py: 0 }]).values()]).toEqual([0, 0]);
  });

  test('surface z shows in the session depth unit; time and other units are left alone', () => {
    expect(zDisplayFactor('m', 'ft')).toBeCloseTo(3.28084, 5);
    expect(zDisplayFactor('ft', 'm')).toBeCloseTo(0.3048, 6);
    expect(zDisplayFactor('ft', 'ft')).toBe(1);
    expect(zDisplayFactor('ms', 'ft')).toBe(1);
  });

  test('only structure surfaces with a real grid are offered as a backdrop', () => {
    const rows = [{ id: 1, kind: 'structure', nx: 10, ny: 10 }, { id: 2, kind: 'attribute', nx: 10, ny: 10 }, { id: 3, kind: 'structure', nx: 1, ny: 10 }, { id: 4, nx: 5, ny: 5 }];
    expect(backdropSurfaces(rows).map((s) => s.id)).toEqual([1, 4]);
  });
});

describe('the well map backdrop', () => {
  const wells = [
    { id: 'w1', name: 'Ekene-1', surface_x: 401000, surface_y: 521000 },
    { id: 'w2', name: 'PPS demo: Ekene-1', surface_x: 401000, surface_y: 521000 },
    { id: 'w3', name: 'Ekene-2', surface_x: 402200, surface_y: 521150, organization_id: 'org' },
  ];
  const surf = { id: 's1', name: 'Ekene Sand (depth ft)', kind: 'structure', nx: 3, ny: 2, dx: 600, dy: 600, origin_x: 400800, origin_y: 520800, z_unit: 'ft' };

  test('None by default; picking a surface downloads its grid and draws it under the wells', async () => {
    const backend = {
      listSurfaces: jest.fn(async () => [surf, { ...surf, id: 's2', name: 'Amplitude', kind: 'attribute' }]),
      downloadSurfaceGrid: jest.fn(async () => Float32Array.of(-5000, -5010, -5020, -5030, -5040, -5050)),
    };
    render(<WellsMap wells={wells} selectedId={null} onSelect={() => {}} backend={backend} unit="ft" />);
    const select = await screen.findByTestId('wdm-map-surface');
    await waitFor(() => expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['None', 'Ekene Sand (depth ft)']));
    expect(screen.getByTestId('wdm-map').dataset.surface).toBe('');
    fireEvent.change(select, { target: { value: 's1' } });
    await waitFor(() => expect(screen.getByTestId('wdm-map').dataset.surface).toBe('Ekene Sand (depth ft)'));
    expect(backend.downloadSurfaceGrid).toHaveBeenCalledWith(surf);
    expect(screen.getByTestId('wdm-map-caption')).toHaveTextContent('Backdrop: Ekene Sand (depth ft), contoured.');
  });

  test('a backend without a surface registry shows no backdrop control', () => {
    render(<WellsMap wells={wells} selectedId={null} onSelect={() => {}} backend={{}} />);
    expect(screen.queryByTestId('wdm-map-surface')).toBeNull();
    expect(screen.getByTestId('wdm-map')).toBeInTheDocument();
  });
});

// a regular well: DEPT 1500-1600 m at 0.5 m with GR, RT, RHOB, NPHI and a published PHIE
const N = 201;
const depth = Array.from({ length: N }, (_, i) => 1500 + i * 0.5);
const curve = (f) => depth.map((d, i) => f(i, d));
const LOGS = {
  DEPT: curve((i, d) => d),
  GR: curve((i) => (i % 40 < 20 ? 25 : 110)),
  RT: curve((i) => (i % 40 < 20 ? 40 : 2)),
  RHOB: curve((i) => (i % 40 < 20 ? 2.25 : 2.5)),
  NPHI: curve((i) => (i % 40 < 20 ? 0.2 : 0.35)),
  PHIE: curve((i) => (i % 40 < 20 ? 0.22 : 0.02)),
};
const UNITS = { DEPT: 'M', GR: 'GAPI', RT: 'OHMM', RHOB: 'G/C3', NPHI: 'V/V', PHIE: 'V/V' };
const seedRows = () => ({
  wells: [{ id: 'pb-1', user_id: 'user-dev', organization_id: null, name: 'Part B-1', surface_x: 401000, surface_y: 521000, kb_m: 25, td_md_m: 1600 }],
  tops: { 'pb-1': [{ id: 't1', name: 'Ekene Sand', md_m: 1550 }] },
  logs: {
    'pb-1': Object.keys(LOGS).map((m, k) => ({
      id: `pb-log-${k}`, mnemonic: m, unit: UNITS[m], start_md_m: 1500, stop_md_m: 1600, step_m: 0.5, n_samples: N, null_count: 0,
      storage_path: `user-dev/pb-1/logs/${m}.f32`, samples: LOGS[m],
    })),
  },
});

describe('log templates', () => {
  const cw = { curves: { DEPT: Float32Array.from(LOGS.DEPT), GR: Float32Array.from(LOGS.GR), RT: Float32Array.from(LOGS.RT), RHOB: Float32Array.from(LOGS.RHOB), NPHI: Float32Array.from(LOGS.NPHI) }, logs: { PHIE: Float32Array.from(LOGS.PHIE) } };

  test('the built-ins, in menu order', () => {
    expect(wdmTemplates().map((t) => t.id)).toEqual(['quicklook', 'lithology-quicklook', 'std-triple-combo', 'borehole-qc']);
  });

  test('Raw quicklook resolves GR, RT and the density-neutron crossover; a published PHIE fills the triple combo', () => {
    const [quick, , triple] = wdmTemplates();
    const q = resolveWellTemplate(quick, cw);
    expect(q.map((t) => t.title)).toEqual(['GR (API)', 'RT (ohm·m)', 'Density–Neutron']);
    expect(q[2].fills.some((f) => f.mode === 'crossover')).toBe(true);
    expect(q[1].scale).toBe('log');
    const tri = resolveWellTemplate(triple, cw);
    expect(tri.some((t) => t.curves.some((c) => c.data === cw.logs.PHIE))).toBe(true);
    // negative control: without the published curve the PHIE track has nothing to draw
    const bare = resolveWellTemplate(triple, { ...cw, logs: {} });
    expect(bare.some((t) => t.curves.some((c) => c.data === cw.logs.PHIE))).toBe(false);
    expect(publishedOutputs({ PHIE: 1, SW: 2, GR: 3 })).toEqual({ PHIE: 1, SW: 2 });
  });

  test('depth windows: the whole logged interval, then one around each top inside it', () => {
    const q = resolveWellTemplate(wdmTemplates()[0], cw);
    const ext = dataExtent(cw.curves.DEPT, q);
    expect(ext).toEqual({ top: 1500, base: 1600 });
    const w = depthWindows(ext, [{ name: 'Ekene Sand', md_m: 1550 }, { name: 'Deep', md_m: 3000 }], 20);
    expect(w).toEqual([{ key: 'all', label: 'Whole well', top: 1500, base: 1600 }, { key: 'top:Ekene Sand', label: 'Around Ekene Sand', top: 1530, base: 1570 }]);
  });
});

describe('the Logs tab', () => {
  test('opens on Raw quicklook; picking a template redraws; ticking a curve switches to Custom', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: seedRows() });
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    fireEvent.click((await screen.findAllByTestId('wdm-well-row'))[0]);
    const detail = await screen.findByTestId('wdm-detail');
    fireEvent.click(within(detail).getByRole('button', { name: /^Logs/ }));
    const pick = await screen.findByTestId('wdm-log-template');
    expect(pick.value).toBe('quicklook');
    await waitFor(() => expect(screen.getByTestId('wdm-log-tracks').dataset.template).toBe('quicklook'));
    expect(screen.getByTestId('wdm-log-tracks').dataset.tracks).toBe('3');
    fireEvent.change(pick, { target: { value: 'std-triple-combo' } });
    await waitFor(() => expect(screen.getByTestId('wdm-log-tracks').dataset.template).toBe('std-triple-combo'));
    const win = screen.getByTestId('wdm-log-window');
    fireEvent.change(win, { target: { value: 'top:Ekene Sand' } });
    await waitFor(() => expect(Number(screen.getByTestId('wdm-log-tracks').dataset.depthTop)).toBeCloseTo(1550 - 45.72, 2));
    fireEvent.click(screen.getByTestId('wdm-plot-GR'));
    expect(screen.getByTestId('wdm-log-template').value).toBe(CUSTOM_VIEW);
    await waitFor(() => expect(screen.getByTestId('wdm-log-tracks').dataset.template).toBeUndefined());
  });
});
