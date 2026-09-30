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

describe('STRAT-U2-004 display units in Tops, Intervals, Core and Ages', () => {
  test('intervals in feet: shown and typed in ft, an untouched row keeps its metres bit for bit (origin/main: metres only)', async () => {
    const IntervalsEditor = jest.requireActual('@/components/wells/IntervalsEditor').default;
    const onReplace = jest.fn(async () => {});
    const rows = [{ id: 'i1', kind: 'lithology', top_md_m: 1440.123, base_md_m: 1500, code: 'SST', properties: {} }, { id: 'i2', kind: 'lithology', top_md_m: 1500, base_md_m: 1580, code: 'SH', properties: {} }];
    render(<IntervalsEditor well={{ id: 'w', name: 'KETA-1', is_own: true }} intervals={rows} onReplace={onReplace} onStatus={() => {}} testIdPrefix="iv" unit="ft" />);
    expect(screen.getByTestId('iv-top-0').value).toBe('4724.81');
    expect(screen.getByText('Top (ft)')).toBeTruthy();
    fireEvent.change(screen.getByTestId('iv-base-1'), { target: { value: '5200' } });
    fireEvent.click(screen.getByTestId('iv-save'));
    await waitFor(() => expect(onReplace).toHaveBeenCalled());
    const saved = onReplace.mock.calls[0][1];
    expect(saved[0].top_md_m).toBe(1440.123);
    expect(saved[1].base_md_m).toBeCloseTo(5200 * 0.3048, 9);
    expect(screen.getByTestId('iv-thickness').textContent).toMatch(/ft/);
  });

  test('core photos in feet: shown in ft, an edited top converts at the door, the untouched base keeps its metres', async () => {
    const CoreImagesPanel = jest.requireActual('@/components/wells/CoreImagesPanel').default;
    const onUpdate = jest.fn(async () => {});
    const img = { id: 'img1', well_id: 'w', top_md_m: 1500.001, base_md_m: 1510.004, caption: null, bytes: 10 };
    render(<CoreImagesPanel well={{ id: 'w', name: 'KETA-1', is_own: true }} images={[img]} onUpload={jest.fn()} onUpdate={onUpdate} onDelete={jest.fn()} urlOf={async () => null} onStatus={() => {}} testIdPrefix="core" unit="ft" />);
    const row = screen.getByTestId('core-row-img1');
    const [topIn, baseIn] = row.querySelectorAll('input');
    expect(topIn.value).toBe('4921.26');
    fireEvent.change(topIn, { target: { value: '4920' } });
    fireEvent.change(baseIn, { target: { value: baseIn.value } });
    fireEvent.click(screen.getByTestId('core-save-img1'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0][1].top_md_m).toBeCloseTo(4920 * 0.3048, 9);
    expect(onUpdate.mock.calls[0][1].base_md_m).toBe(1510.004);
    expect(screen.getAllByText('Top (ft)').length).toBe(2);
  });

  test('the workstation Depths select turns Tops and Ages into feet and is saved with the project', async () => {
    const StratWorkstation = jest.requireActual('../components/StratWorkstation').default;
    const b = makeInMemoryBackend();
    render(<MemoryRouter><StratWorkstation backend={b} /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('strat-well-KETA-2', {}, T));
    await waitFor(() => expect(screen.getByTestId('strat-top-md-Top Marker').textContent).toBe('1470.0'), T);
    fireEvent.change(screen.getByTestId('strat-display-unit'), { target: { value: 'ft' } });
    expect(screen.getByTestId('strat-top-md-Top Marker').textContent).toBe('4822.8');
    fireEvent.click(screen.getByTestId('strat-view-ages'));
    await waitFor(() => expect(screen.getByTestId('strat-stage-md-Top Marker').textContent).toBe('4822.8'), T);
    // KETA-2 TVD rate 136.7 m/Ma is 448.5 ft/Ma
    expect(screen.getByTestId('strat-rate-0').textContent).toMatch(/448\.5$/);
    // the plot converts its own axis once (a double conversion drew 1471.6 ft/Ma)
    expect(screen.getByTestId('strat-agedepth-segment-0').textContent).toBe('448.5 ft/Ma');
    await waitFor(async () => expect((await b.loadStratProject())?.view?.displayUnit).toBe('ft'), T);
  }, 120000);
});

describe('STRAT-U2-005 biozone paste with scheme and ages; ranges in the section', () => {
  const fs = require('fs'); const path = require('path');
  const { parseDelimited, guessMapping, guessIntervalUnit, buildIntervals, BIOZONE_INTERVAL_FIELDS, INTERVAL_FIELDS } = jest.requireActual('@/lib/wellImport');
  const read = (f) => fs.readFileSync(path.join(__dirname, '../../../../../e2e/fixtures/strat/hostile', f), 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('\n');
  const door = (f, fields = BIOZONE_INTERVAL_FIELDS) => {
    const parsed = parseDelimited(read(f));
    const map = guessMapping(parsed.header, fields);
    return buildIntervals(parsed.rows, map, { mdUnit: guessIntervalUnit(parsed.header, map) || 'm', header: parsed.header, delimiter: parsed.delimiter });
  };

  test('the StrataBugs export keeps its ages on the ranges (origin/main: ages dropped, typed per row)', () => {
    const rows = door('intervals_stratabugs_biozones_ft.csv');
    expect(rows.map((r) => [r.code, r.properties.age_top_ma, r.properties.age_base_ma])).toEqual([['NN12', 5.59, 8.29], ['NN11', 8.29, 11.63]]);
    expect(rows[0].top_md_m).toBeCloseTo(4921.3 * 0.3048, 9);
    // the plain interval door still ignores them
    expect(door('intervals_stratabugs_biozones_ft.csv', INTERVAL_FIELDS)[0].properties).toEqual({});
  });

  test('scheme column, ages in ka converted to Ma, a blank age left blank, semicolons with comma decimals', () => {
    const rows = door('intervals_biozones_scheme_ka.csv');
    expect(rows.map((r) => [r.code, r.properties.scheme, r.properties.age_top_ma, r.properties.age_base_ma ?? null, r.top_md_m]))
      .toEqual([['NN21', 'NN', 0, 0.29, 1440], ['NN20', 'NN', 0.29, 0.44, 1455.5], ['NN19', 'NN', 0.44, null, 1470]]);
  });

  test('a range whose base age is not older than its top is refused by row', () => {
    const parsed = parseDelimited('Zone,Top,Base,Top Age (Ma),Base Age (Ma)\nNN12,1440,1460,8.29,5.59');
    const map = guessMapping(parsed.header, BIOZONE_INTERVAL_FIELDS);
    expect(() => buildIntervals(parsed.rows, map, { header: parsed.header })).toThrow(/Row 1: the base age \(5.59 Ma\) is not older than the top age \(8.29 Ma\)/);
  });

  test('the section outlines the biozone ranges with scheme and ages, and can hide them', async () => {
    const b = makeInMemoryBackend();
    await b.replaceIntervals('corr-w1', 'biozone_interval', [{ top_md_m: 1440, base_md_m: 1455.5, code: 'NN21', properties: { scheme: 'NN', age_top_ma: 0, age_base_ma: 0.29 } }]);
    renderSection(b);
    await wellsDrawn(3);
    await waitFor(() => expect(screen.getByTestId('corr-section').getAttribute('data-band-spans')).toMatch(/KETA-1:[^;]*1440\.0-1455\.5/), T);
    fireEvent.click(screen.getByTestId('strat-show-biozones'));
    await waitFor(() => expect(screen.getByTestId('corr-section').getAttribute('data-band-spans')).not.toMatch(/1440\.0-1455\.5/), T);
  }, 120000);
});

describe('STRAT-U2-007 the column editor at scale', () => {
  const ColumnEditor = jest.requireActual('../components/ColumnEditor').default;
  const scaleUnits = () => {
    const out = [];
    for (let g = 0; g < 4; g++) {
      out.push({ id: `g${g}`, name: `Group ${g + 1}`, rank: 'group', parent_id: null, order_index: g, age_top_ma: g * 15, age_base_ma: g * 15 + 15, colour: '#94a3b8' });
      for (let f = 0; f < 5; f++) {
        out.push({ id: `g${g}f${f}`, name: `Fm ${g + 1}.${f + 1}`, rank: 'formation', parent_id: `g${g}`, order_index: f, age_top_ma: g * 15 + f * 3, age_base_ma: g * 15 + f * 3 + 3, colour: '#f59e0b' });
        for (let m = 0; m < 3; m++) out.push({ id: `g${g}f${f}m${m}`, name: `Mbr ${g + 1}.${f + 1}.${m + 1}`, rank: 'member', parent_id: `g${g}f${f}`, order_index: m, age_top_ma: g * 15 + f * 3 + m, age_base_ma: g * 15 + f * 3 + m + 1, colour: '#fde68a' });
      }
    }
    return out;
  };

  test('84 units open with a few hundred options instead of ~16,000; a list renders on focus and still sets the parent (origin/main: 16,212 options)', async () => {
    const onSave = jest.fn(async () => {});
    const { container } = render(<ColumnEditor units={scaleUnits()} onSave={onSave} onStatus={() => {}} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(84);
    const n = container.querySelectorAll('tbody option').length;
    expect(n).toBeLessThan(84 * 8); // rank lists (6 each) plus the placeholder and current choice
    const parent = screen.getByTestId('strat-unit-parent-2');
    expect(parent.getAttribute('data-options')).toBe('83');
    fireEvent.focus(parent);
    expect(parent.querySelectorAll('option')).toHaveLength(84);
    fireEvent.change(parent, { target: { value: 'g1' } });
    const stage = screen.getByTestId('strat-unit-stage-2');
    fireEvent.focus(stage);
    fireEvent.change(stage, { target: { value: 'Chattian' } });
    expect(screen.getByTestId('strat-unit-agebase-2').value).toBe('27.3');
  });

  test('an edit in one row leaves the other rows in place and lands in its own row (memoised rows)', () => {
    const units = scaleUnits();
    const { container } = render(<ColumnEditor units={units} onSave={jest.fn()} onStatus={() => {}} />);
    const before = container.querySelector('[data-testid="strat-unit-row-40"]');
    fireEvent.change(screen.getByTestId('strat-unit-agetop-3'), { target: { value: '1.5' } });
    expect(container.querySelector('[data-testid="strat-unit-row-40"]')).toBe(before);
    expect(screen.getByTestId('strat-unit-agetop-3').value).toBe('1.5');
  });
});

describe('STRAT-U2-011 strat maps on vertical thickness', () => {
  const { verticalThicknessPoints } = jest.requireActual('@/lib/stratigraphy/verticalThickness');
  const { thicknessPoints } = jest.requireActual('@/lib/stratigraphy/stratMaps');
  const wellsOf = async (b) => Promise.all((await b.listWells()).map(async (w) => ({ ...w, tops: await b.listTops(w.id), intervals: await b.listIntervals(w.id) })));

  test('deviated KETA-2: gross Top Dome to Mid Shale is 67.6 m TVD where the engine alone gives 70.0 m MD; vertical KETA-1 unchanged', async () => {
    const wells = await wellsOf(makeInMemoryBackend());
    const ib = Object.fromEntries(wells.map((w) => [w.id, w.intervals]));
    const md = thicknessPoints(wells, 'Top Dome', 'Mid Shale', { intervalsByWell: ib, measure: 'gross' });
    const tv = verticalThicknessPoints(wells, 'Top Dome', 'Mid Shale', { intervalsByWell: ib, measure: 'gross' });
    const at = (r, n) => r.points.find((p) => p.well === n);
    expect(at(md, 'KETA-2').z).toBeCloseTo(70, 9);                 // negative control: along hole
    expect(at(tv, 'KETA-2').z).toBeCloseTo(67.6, 1);
    expect(at(tv, 'KETA-2')).toMatchObject({ top_md_m: 1540, base_md_m: 1610, basis: 'tvd' });
    expect(at(tv, 'KETA-1').z).toBeCloseTo(at(md, 'KETA-1').z, 9);
    expect(tv.basis).toBe('mixed'); // KETA-1 has no survey (KETA-3 lacks Mid Shale): taken as vertical and named
    expect(tv.mdWells).toEqual(['KETA-1']);
  });

  test('net sand goes through the survey interval by interval, never more than the gross; a well without a survey is named', async () => {
    const wells = await wellsOf(makeInMemoryBackend());
    const ib = Object.fromEntries(wells.map((w) => [w.id, w.intervals]));
    const net = verticalThicknessPoints(wells, 'Top Dome', 'Mid Shale', { intervalsByWell: ib, measure: 'net' });
    const gross = verticalThicknessPoints(wells, 'Top Dome', 'Mid Shale', { intervalsByWell: ib, measure: 'gross' });
    for (const p of net.points) expect(p.z).toBeLessThanOrEqual(gross.points.find((g) => g.well === p.well).z + 1e-9);
    const k2 = net.points.find((p) => p.well === 'KETA-2');
    const mdNet = thicknessPoints(wells, 'Top Dome', 'Mid Shale', { intervalsByWell: ib, measure: 'net' }).points.find((p) => p.well === 'KETA-2');
    expect(k2.z).toBeLessThan(mdNet.z);
    // a surveyless well stays MD and is named
    const flat = verticalThicknessPoints([{ ...wells[0], deviation: null, name: 'NOSURVEY' }], 'Top Dome', 'Mid Shale', { intervalsByWell: { [wells[0].id]: wells[0].intervals }, measure: 'gross' });
    expect(flat.mdWells).toEqual(['NOSURVEY']);
    expect(flat.basis).toBe('md');
  });
});

describe('STRAT-U2-012 Data AI facies labels from systems tracts and biozones', () => {
  const { intervalKinds, intervalKindName, intervalKindNote, compactIntervals, coreFacies } = jest.requireActual('@/utils/dataAi/faciesData');

  test('recorded tracts label the samples they hold, offered by name after the facies kinds (origin/main: raw code, last in the list)', async () => {
    const b = makeInMemoryBackend();
    const { sequenceTracts } = jest.requireActual('@/lib/stratigraphy/sequenceTracts');
    const tops = await b.listTops('corr-w1');
    await b.replaceIntervals('corr-w1', 'systems_tract', sequenceTracts(tops)); // what Record tracts writes (HST 1440 to 1580)
    await b.replaceIntervals('corr-w1', 'facies', [{ top_md_m: 1440, base_md_m: 1500, code: 'sand' }]);
    const table = {
      group: ['KETA-1', 'KETA-1', 'KETA-1'], depth: [1450, 1579.9, 1600],
      intervals: { 'KETA-1': compactIntervals(await b.listIntervals('corr-w1')) },
    };
    expect(intervalKinds(table).map((k) => k.kind)).toEqual(['facies', 'lithology', 'systems_tract']);
    expect(intervalKindName('systems_tract')).toBe('Systems tract');
    expect(intervalKindName('biozone_interval')).toBe('Biozone');
    expect(coreFacies(table, { source: 'intervals', kind: 'systems_tract' }).labels).toEqual(['HST', 'HST', null]);
    expect(intervalKindNote('systems_tract')).toMatch(/recorded in Stratigraphy Studio \(Section, Record tracts\)/);
  });
});
