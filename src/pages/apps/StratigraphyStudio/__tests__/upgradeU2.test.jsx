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

describe('STRAT-U2-003 ICS 2026/06 with the chart version of every age', () => {
  const { flagAges, acceptPlan, withStamps, changedAges, flagText } = jest.requireActual('@/lib/stratigraphy/ageCharts');
  const { TIMESCALE_VERSION } = jest.requireActual('@/lib/stratigraphy/timescale');

  test('the studio draws on 2026/06 (origin/main: ICS 2023/09, J/K at 145.0)', () => {
    expect(TIMESCALE_VERSION).toBe('ICS 2026/06');
  });

  test('flags: an unstamped age on a moved boundary gets the change; a stamped one does not; an off-boundary age names its new stage', () => {
    const tops = [
      { id: 't1', well_id: 'w1', name: 'Base K', age_ma: 145.0 },
      { id: 't2', well_id: 'w1', name: 'Near JK', age_ma: 144.0 },
      { id: 't3', well_id: 'w1', name: 'Mid Mio', age_ma: 12.0 },
      { id: 't4', well_id: 'w1', name: 'Typed now', age_ma: 145.0 },
    ];
    const stamps = withStamps({}, [{ kind: 'tops', id: 't4', field: 'age_ma' }]);
    const flags = flagAges({ tops, wellName: () => 'KETA-1', stamps });
    expect(flags.map((f) => [f.id, f.update?.to_ma ?? null, f.stageTo])).toEqual([['t1', 143.1, 'Berriasian'], ['t2', null, 'Tithonian']]);
    expect(flagText(flags[0])).toBe('entered under ICS 2023/09 on the base of the Berriasian (base of the Cretaceous): 145 to 143.1 Ma (-1.9 Myr) on ICS 2026/06');
    expect(flagText(flags[1])).toMatch(/the number stays, but on ICS 2026\/06 it falls in the Tithonian \(was Berriasian\)/);
  });

  test('accept plan: moves boundary ages, stamps every flag, leaves shared rows and a broken hiatus order named', () => {
    const tops = [
      { id: 't1', well_id: 'w1', name: 'Base K', age_ma: 145.0, hiatus_to_ma: null },
      { id: 't2', well_id: 'w2', name: 'Top Olig', age_ma: 27.82 },
      { id: 't3', well_id: 'w1', name: 'Odd SU', age_ma: 143.5, hiatus_to_ma: 145.0 },
    ];
    const flags = flagAges({ tops, canEdit: (k, r) => r.well_id === 'w1' });
    const plan = acceptPlan(flags, { tops });
    expect(plan.writes).toEqual([{ kind: 'tops', id: 't1', patch: { age_ma: 143.1 } }]);
    expect(plan.stamps).toEqual([{ kind: 'tops', id: 't1', field: 'age_ma' }]);
    expect(plan.skipped.join(' | ')).toMatch(/Top Olig age \(shared with you, read-only; its owner accepts it\)/);
    expect(plan.skipped.join(' | ')).toMatch(/Odd SU \(after the update the hiatus end, 143.1 Ma, would not be older than 143.5 Ma\)/);
  });

  test('only a changed age is stamped (a type change on a row keeps its old chart)', () => {
    expect(changedAges('tops', { id: 't1', age_ma: 145, hiatus_to_ma: null }, { age_ma: 145, hiatus_to_ma: null, surface_type: 'SU' })).toEqual([]);
    expect(changedAges('tops', { id: 't1', age_ma: 145 }, { age_ma: 150 })).toEqual([{ kind: 'tops', id: 't1', field: 'age_ma' }]);
    expect(changedAges('units', { id: 'u1' }, { age_top_ma: 2.58, age_base_ma: 33.9 })).toHaveLength(2);
  });

  test('workstation: flags counted, shown on the row, accepted per project; a newly typed age is stamped 2026/06', async () => {
    const StratWorkstation = jest.requireActual('../components/StratWorkstation').default;
    const shared = { id: 'sh-1', name: 'SHARED-1', is_own: false, user_id: 'user-other', organization_id: 'org-dev', surface_x: 501500, surface_y: 6700300, kb_m: 30, curves: {}, logMeta: {},
      tops: [{ id: 'sh-top', well_id: 'sh-1', name: 'Top Olig', md_m: 900, age_ma: 27.82, surface_type: 'formation_top' }] };
    const b = makeInMemoryBackend({ seedWells: [shared], units: [{ id: 'u-k', user_id: 'user-a', organization_id: null, name: 'Lower K', rank: 'formation', parent_id: null, order_index: 0, age_top_ma: 100.5, age_base_ma: 145.0, colour: '#84cc16' }] });
    await b.updateTop('corr-w1-top-0', { age_ma: 145.0 });   // Top Marker typed under 2023/09 on the J/K
    render(<MemoryRouter><StratWorkstation backend={b} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('strat-timescale-badge').textContent).toBe('3'), T);
    fireEvent.click(screen.getByTestId('strat-view-timescale'));
    expect(screen.getByTestId('strat-timescale-count').textContent).toBe('3 ages, 3 on a moved boundary');
    expect(screen.getByTestId('strat-timescale-flag-KETA-1 Top Marker age').textContent).toMatch(/145 Ma.*143\.1 Ma \(-1\.9\)/);
    expect(screen.getByTestId('strat-timescale-change-Berriasian').textContent).toMatch(/base of the Berriasian \(base of the Cretaceous\)145143\.1-1\.9/);
    // the Tops view marks the row
    fireEvent.click(screen.getByTestId('strat-well-KETA-1'));
    fireEvent.click(screen.getByTestId('strat-view-tops'));
    expect((await screen.findByTestId('strat-top-agechart-Top Marker-age_ma', {}, T)).textContent).toBe('143.1 on 2026/06');
    // accept for the project
    fireEvent.click(screen.getByTestId('strat-view-timescale'));
    fireEvent.click(screen.getByTestId('strat-timescale-accept'));
    await waitFor(() => expect(screen.getByTestId('strat-status').textContent).toMatch(/Accepted the ICS 2026\/06 updates: 2 ages moved with their boundary, 2 stamped ICS 2026\/06; left as entered: SHARED-1 Top Olig age \(shared with you/), T);
    expect((await b.listTops('corr-w1')).find((t) => t.name === 'Top Marker').age_ma).toBe(143.1);
    expect((await b.listUnits()).find((u) => u.id === 'u-k').age_base_ma).toBe(143.1);
    expect((await b.listTops('sh-1'))[0].age_ma).toBe(27.82);
    const proj = await b.loadStratProject();
    expect(proj.view.ageCharts.tops['corr-w1-top-0']).toEqual({ age_ma: 'ICS 2026/06' });
    expect(proj.view.ageCharts.units['u-k']).toEqual({ age_base_ma: 'ICS 2026/06' });
    await waitFor(() => expect(screen.getByTestId('strat-timescale-count').textContent).toBe('1 age, 1 on a moved boundary'), T);
    // a new age typed now is stamped with the current chart and never flagged
    fireEvent.click(screen.getByTestId('strat-view-tops'));
    await waitFor(() => expect(screen.getByTestId('strat-top-age-Top Marker').value).toBe('143.1'), T); // the refreshed rows
    fireEvent.change(screen.getByTestId('strat-top-age-Top Dome'), { target: { value: '145' } });
    fireEvent.click(screen.getByTestId('strat-tops-save'));
    await waitFor(async () => expect((await b.loadStratProject()).view.ageCharts.tops['corr-w1-top-1']).toEqual({ age_ma: 'ICS 2026/06' }), T);
    expect(screen.queryByTestId('strat-top-agechart-Top Dome-age_ma')).toBeNull();
  }, 120000);
});

describe('STRAT-U2-006 stratigraphic summary PDF, read back', () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { execFileSync } = require('child_process');
  const read = (doc) => {
    const f = path.join(os.tmpdir(), `strat-summary-${process.pid}.pdf`);
    fs.writeFileSync(f, Buffer.from(doc.output('arraybuffer')));
    const text = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'latin1' }).replace(/[ \t]+/g, ' ');
    fs.unlinkSync(f);
    return text;
  };

  test('KETA-2 (deviated): reviewer header, tops with TVD, stage and chart, rates in TVD, Wheeler cells, the column (origin/main: no PDF)', async () => {
    const { buildStratSummary } = jest.requireActual('../services/stratSummaryPdf');
    const { seededUnits } = jest.requireActual('../services/inMemoryBackend');
    const b = makeInMemoryBackend();
    const well = (await b.listWells()).find((w) => w.id === 'corr-w2');
    const tops = await b.listTops('corr-w2');
    const { doc, fileName } = await buildStratSummary({ well, tops, intervals: await b.listIntervals('corr-w2'), units: seededUnits(), scheme: 'exxon', section: 'KETA section',
      report: { field: 'Keta (sample)', analyst: 'A. Geologist' }, ageCharts: { tops: { [tops.find((t) => t.name === 'Mid Shale').id]: { age_ma: 'ICS 2026/06' } } }, now: new Date('2026-09-30T12:00:00Z') });
    expect(fileName).toBe('KETA-2_stratigraphic_summary.pdf');
    const t = read(doc);
    for (const s of ['Stratigraphic summary', 'Well KETA-2', 'Field Keta (sample)', 'Section KETA section', 'Prepared by A. Geologist', 'Prepared on 2026-09-30',
      'Timescale ICS 2026/06', 'Terms Exxon (display; stored Catuneanu)', 'TVD below KB through the survey', 'Reviewed by']) expect(t).toContain(s);
    // tops: Mid Shale typed now, Base Sand entered before stamps
    expect(t).toMatch(/Mid Shale 1610\.0 1606\.6 MFS n\/a 5 Zanclean ICS 2026\/06/);
    expect(t).toMatch(/Base Sand 1705\.0 .*10 \(hiatus to 12\) Tortonian ICS 2023\/09/);
    // rates in TVD (the U1-015 basis) and the hiatus
    expect(t).toMatch(/Top Marker Mid Shale 1469\.9 to 1606\.6 4 to 5 136\.7/);
    expect(t).toMatch(/hiatus at Base Sand .*10 to 12 no deposition/);
    // Wheeler cells and the column
    expect(t).toMatch(/Wheeler \(time down, this well\)/);
    expect(t).toMatch(/12 .*removed or not deposited/);
    expect(t).toMatch(/Agbada group 2\.58 33\.9 ICS 2023\/09/);
    expect(t).toMatch(/Age \(Ma\), ICS 2026\/06/);
  });

  test('feet: depths and rates in ft, and a well with one dated surface says so', async () => {
    const { buildStratSummary } = jest.requireActual('../services/stratSummaryPdf');
    const well = { id: 'x', name: 'X-1', kb_m: 25 };
    const tops = [{ id: 'a', name: 'A', md_m: 1000, age_ma: 3 }, { id: 'b', name: 'B', md_m: 1100, age_ma: null }];
    const t = read((await buildStratSummary({ well, tops, unit: 'ft' })).doc);
    expect(t).toMatch(/A 3280\.8 3280\.8/);
    expect(t).toMatch(/Fewer than two dated surfaces/);
    expect(t).toMatch(/Prepared by n\/a/);
  });
});
