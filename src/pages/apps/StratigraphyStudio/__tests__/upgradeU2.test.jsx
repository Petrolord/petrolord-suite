/**
 * AppUpgrade Step 2 for Stratigraphy Studio (docs/upgrade/StratigraphyStudio-UPGRADE.md,
 * batch decision 2026-09-30). One block per item; each records the negative
 * control it failed on origin/main bf9cc1ebc (or on the item before it).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SectionView from '../components/SectionView';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { isOptionalRefPath } from '@/lib/portability/exportPackage';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const recordingCtx = () => new Proxy({}, {
  get: (t, k) => {
    if (k in t) return t[k];
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    return () => {};
  },
  set: (t, k, v) => { t[k] = v; return true; },
});
beforeAll(() => {
  global.ResizeObserver = global.ResizeObserver || class { observe() {} disconnect() {} };
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(recordingCtx);
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 1000; } });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 600; } });
});
afterAll(() => {
  delete window.HTMLElement.prototype.clientWidth;
  delete window.HTMLElement.prototype.clientHeight;
});

const T = { timeout: 20000 };
export const renderSection = (backend, props = {}) => render(
  <MemoryRouter>
    <SectionView backend={backend} mode={props.mode || 'section'} scheme="catuneanu" onStatus={props.onStatus || (() => {})}
      saved={props.saved || null} onSaveProject={props.onSaveProject} report={props.report || null} />
  </MemoryRouter>,
);
const wellsDrawn = (n) => waitFor(() => expect(screen.getByTestId('strat-section-summary').textContent).toMatch(new RegExp(`^${n} wells`)), T);

describe('STRAT-U2-002 the studio section at Well Correlation U2 parity', () => {
  test('the registry backend lists named sections, surfaces and zones (origin/main: no listSections, so the picker never showed outside the harness)', () => {
    const { makeRegistryBackend } = jest.requireActual('../services/registryBackend');
    const b = makeRegistryBackend();
    for (const fn of ['listSections', 'listSurfaces', 'downloadSurfaceGrid', 'listZones']) expect(typeof b[fn]).toBe('function');
  });

  test('Seismolord horizons draw, name the wells they miss and hang the datum (origin/main: no horizons control)', async () => {
    const b = makeInMemoryBackend();
    renderSection(b);
    await wellsDrawn(3);
    fireEvent.click(await screen.findByTestId('strat-hz-surf-dome-depth', {}, T));
    await waitFor(() => expect(screen.getByTestId('strat-hz-note-surf-dome-depth').textContent).toMatch(/drawn on 3 wells/), T);
    fireEvent.click(screen.getByTestId('strat-hz-surf-dome-twt'));
    await waitFor(() => expect(screen.getByTestId('strat-hz-note-surf-dome-twt').textContent).toMatch(/drawn on 2 wells; not on KETA-3 \(no checkshots for a time horizon\)/), T);
    fireEvent.change(screen.getByTestId('strat-datum-mode'), { target: { value: 'flatten' } });
    fireEvent.change(screen.getByTestId('strat-datum-top'), { target: { value: 'H: Dome' } });
    await waitFor(() => expect(JSON.parse(screen.getByTestId('strat-section-controls').getAttribute('data-datum')).topName).toBe('H: Dome'), T);
    // read only: no top was written
    expect((await b.listTops('corr-w1')).some((t) => t.name.startsWith('H: '))).toBe(false);
  }, 120000);

  test('pay, zone and unit strips draw and name what is missing; column width, horizons, strips and the ghost save with the view', async () => {
    const b = makeInMemoryBackend();
    const onSaveProject = jest.fn(async () => {});
    renderSection(b, { onSaveProject });
    await wellsDrawn(3);
    for (const k of ['pay', 'zones', 'units']) fireEvent.click(await screen.findByTestId(`strat-strip-${k}`, {}, T));
    const sec = () => screen.getByTestId('corr-section');
    await waitFor(() => expect(sec().getAttribute('data-well-notes')).toMatch(/KETA-2=[^;]*no published PAY/), T);
    expect(sec().getAttribute('data-well-notes')).not.toMatch(/KETA-1=[^;]*no published PAY/);
    fireEvent.change(screen.getByTestId('strat-col-width'), { target: { value: '220' } });
    await waitFor(() => expect(sec().getAttribute('data-col-w')).toBe('220,220,220'), T);
    fireEvent.click(screen.getByTestId('strat-hz-surf-dome-depth'));
    fireEvent.click(screen.getByTestId('strat-save-view'));
    await waitFor(() => expect(onSaveProject).toHaveBeenCalled(), T);
    const view = onSaveProject.mock.calls[0][0].view;
    expect(view.strips).toEqual({ pay: true, zones: true, units: true });
    expect(view.columnWidth).toBe(220);
    expect(view.horizons).toEqual(['surf-dome-depth']);
  }, 120000);

  test('the ghost shift reads and moves in feet on a feet section, with all tracks and a stretch (origin/main: metres, first track only)', async () => {
    const b = makeInMemoryBackend();
    renderSection(b);
    await wellsDrawn(3);
    fireEvent.change(screen.getByTestId('strat-depth-unit'), { target: { value: 'ft' } });
    fireEvent.change(screen.getByTestId('strat-ghost-source'), { target: { value: 'corr-w1' } });
    const shift = screen.getByTestId('strat-ghost-shift');
    expect(shift.getAttribute('max')).toBe('656');
    fireEvent.change(shift, { target: { value: '100' } });
    expect(screen.getByTestId('strat-ghost-shift-value').textContent).toBe('+100 ft');
    fireEvent.change(screen.getByTestId('strat-ghost-tracks'), { target: { value: 'all' } });
    fireEvent.change(screen.getByTestId('strat-ghost-stretch'), { target: { value: '125' } });
    // stored in metres: 100 ft = 30.48 m
    await waitFor(() => expect(screen.getByTestId('corr-section').getAttribute('data-ghost')).toMatch(/^corr-w1>corr-w2:30\.48\d*:x1\.25:all$/), T);
  }, 120000);

  test('a saved view restores horizons, strips and column width', async () => {
    const b = makeInMemoryBackend({ sections: [{ id: 's-a', name: 'Dip line', well_ids: ['corr-w1', 'corr-w2'], datum: { mode: 'structural' }, track_layout: {} }, { id: 's-b', name: 'Strike line', well_ids: ['corr-w1', 'corr-w2', 'corr-w3'], datum: { mode: 'structural' }, track_layout: {} }] });
    const saved = { id: 'p1', section_id: 's-a', flatten: { mode: 'structural' }, view: { horizons: ['surf-dome-depth'], strips: { pay: true, zones: false, units: false }, columnWidth: 160 } };
    renderSection(b, { saved });
    await wellsDrawn(2);
    await waitFor(() => expect(screen.getByTestId('corr-section').getAttribute('data-col-w')).toBe('160,160'), T);
    await waitFor(() => expect(screen.getByTestId('strat-hz-note-surf-dome-depth').textContent).toMatch(/drawn on 2 wells/), T);
    expect(screen.getByTestId('strat-strip-pay').checked).toBe(true);
  }, 120000);

  test('the Wheeler view offers the named sections', async () => {
    const b = makeInMemoryBackend({ sections: [{ id: 's-a', name: 'Dip line', well_ids: ['corr-w1', 'corr-w2'], datum: { mode: 'structural' }, track_layout: {} }, { id: 's-b', name: 'Strike line', well_ids: ['corr-w1', 'corr-w2', 'corr-w3'], datum: { mode: 'structural' }, track_layout: {} }] });
    renderSection(b, { mode: 'wheeler' });
    const pick = await screen.findByTestId('strat-wheeler-section-pick', {}, T);
    expect([...pick.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Strike line (3 wells)', 'Dip line (2 wells)']);
  }, 120000);

  test('a .pld import remaps the ghost wells and horizons in the saved view (origin/main: left as dangling ids)', () => {
    expect(isOptionalRefPath('strat_projects', 'view.ghost.sourceWellId')).toBe(true);
    expect(isOptionalRefPath('strat_projects', 'view.ghost.targetWellId')).toBe(true);
    expect(isOptionalRefPath('strat_projects', 'view.horizons[0]')).toBe(true);
  });
});

describe('STRAT-U2-001 Wheeler columns spaced by distance', () => {
  // three dated wells at 0, 100 and 1,000 m along X in one projected CRS
  const dated = (id, x, extra = {}) => ({
    id, name: id.toUpperCase(), surface_x: x, surface_y: 0, crs: 'EPSG:32632', xy_unit: 'm', ...extra,
    surfaces: [{ name: 'A', md_m: 1000, age_ma: 2, surface_type: 'MFS' }, { name: 'B', md_m: 1100, age_ma: 6, surface_type: 'SU' }],
  });
  const colX = () => screen.getByTestId('wh-chart').getAttribute('data-col-x').split(',').map(Number);
  const { default: WheelerChart } = jest.requireActual('@/components/wells/section/WheelerChart');

  test('by distance: the gaps stand in the ratio of the wellhead distances and print them (origin/main: equal columns only)', () => {
    render(<WheelerChart wells={[dated('w1', 0), dated('w2', 300), dated('w3', 1200)]} spacing="proportional" width={900} testIdPrefix="wh" />);
    const [a, b, c] = colX();
    expect((c - b) / (b - a)).toBeCloseTo(3, 1);
    expect(screen.getByTestId('wh-chart').getAttribute('data-spacing')).toBe('proportional');
    expect(screen.getByTestId('wh-gap-0').textContent).toBe('300 m');
    expect(screen.getByTestId('wh-gap-1').textContent).toBe('900 m');
  });

  test('equal stays equal; mixed coordinate systems fall back to equal and say why', () => {
    const { unmount } = render(<WheelerChart wells={[dated('w1', 0), dated('w2', 100), dated('w3', 1000)]} spacing="equal" width={900} testIdPrefix="wh" />);
    let [a, b, c] = colX();
    expect(c - b).toBeCloseTo(b - a, 5);
    unmount();
    render(<WheelerChart wells={[dated('w1', 0), dated('w2', 100, { crs: 'EPSG:26332' }), dated('w3', 1000)]} spacing="proportional" width={900} testIdPrefix="wh" />);
    [a, b, c] = colX();
    expect(c - b).toBeCloseTo(b - a, 5);
    expect(screen.getByTestId('wh-spacing-note').textContent).toMatch(/different coordinate systems/);
  });

  test('along the section line: the saved along-line distances place the columns; an undated well between does not hold a gap', () => {
    const undated = { id: 'w9', name: 'W9', surface_x: 50, surface_y: 0, crs: 'EPSG:32632', xy_unit: 'm', surfaces: [] };
    render(<WheelerChart wells={[dated('w1', 0), undated, dated('w2', 5000), dated('w3', 9000)]} spacing="line" alongM={{ w1: 0, w9: 10, w2: 600, w3: 800 }} width={900} testIdPrefix="wh" />);
    const [a, b, c] = colX();
    expect((b - a) / (c - b)).toBeCloseTo(3, 1);
    expect(screen.getByTestId('wh-gap-0').textContent).toBe('600 m');
  });

  test('the studio Wheeler offers the spacing, follows the section, and saves it in strat_projects.wheeler', async () => {
    const b = makeInMemoryBackend();
    const onSaveProject = jest.fn(async () => {});
    renderSection(b, { mode: 'wheeler', onSaveProject });
    const sel = await screen.findByTestId('strat-wheeler-spacing', {}, T);
    expect(sel.value).toBe('equal');
    fireEvent.change(sel, { target: { value: 'proportional' } });
    await waitFor(() => expect(screen.getByTestId('strat-wheeler-chart').getAttribute('data-spacing')).toBe('proportional'), T);
    fireEvent.click(screen.getByTestId('strat-wheeler-save-view'));
    await waitFor(() => expect(onSaveProject).toHaveBeenCalled(), T);
    expect(onSaveProject.mock.calls[0][0].wheeler).toEqual({ spacing: 'proportional' });
  }, 120000);
});
