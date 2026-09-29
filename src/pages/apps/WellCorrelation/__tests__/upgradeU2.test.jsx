/**
 * AppUpgrade WC-U2 (2026-09-29): Step 2 batches on the real workstation
 * (CorrelationWorkstation on the in-memory backend).
 *
 *  U2-001 named sections: many owner-only sections per user, opened, created,
 *         duplicated, renamed and deleted from the ribbon, unsaved changes
 *         guarded. Negative control: on origin/main there is one implicit
 *         section and Save always writes the newest row.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import CorrelationWorkstation from '../components/CorrelationWorkstation';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

const mockPng = [];
jest.mock('@/components/wells/plotPng', () => ({
  trackPlotPng: (args) => { mockPng.push(args); return Promise.resolve(new Blob(['png'])); },
}));

const noopCtx = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
});

export const mount = (backend, query = '') => render(
  <MemoryRouter initialEntries={[`/dev/well-correlation${query}`]}>
    <CorrelationWorkstation backend={backend} />
  </MemoryRouter>,
);
const status = () => screen.getByTestId('corr-status').textContent;
const T = { timeout: 15000 };
const rowsIn = async (n) => waitFor(() => expect(screen.queryAllByTestId('corr-order-row')).toHaveLength(n), T);
const section = (id, name, wellIds, extra = {}) => ({ id, name, well_ids: wellIds, datum: { mode: 'structural' }, track_layout: { depthUnit: 'm' }, schema_version: 1, ...extra });
const nameIt = (kind, name) => {
  fireEvent.click(screen.getByTestId(`corr-section-${kind}`));
  fireEvent.change(screen.getByTestId('corr-section-name-input'), { target: { value: name } });
  fireEvent.click(screen.getByTestId('corr-section-name-ok'));
};
const optionNames = () => [...screen.getByTestId('corr-section-select').querySelectorAll('option')].map((o) => o.textContent);

describe('U2-001 named sections', () => {
  const two = () => makeInMemoryBackend({ sections: [section('s-south', 'South line', ['corr-w3']), section('s-north', 'North line', ['corr-w1', 'corr-w2'])] });

  test('opens the newest, lists both, and opening the other replaces the wells', async () => {
    const b = two();
    mount(b);
    await rowsIn(2);
    await waitFor(() => expect(optionNames()).toEqual(['North line (2 wells)', 'South line (1 well)']), T);
    fireEvent.change(screen.getByTestId('corr-section-select'), { target: { value: 's-south' } });
    await rowsIn(1);
    expect(status()).toMatch(/Opened section South line/);
    expect(screen.getByTestId('corr-section-select').value).toBe('s-south');
  });

  test('Save writes the open section only', async () => {
    const b = two();
    mount(b);
    await rowsIn(2);
    fireEvent.change(screen.getByTestId('corr-section-select'), { target: { value: 's-south' } });
    await rowsIn(1);
    fireEvent.click(await screen.findByTestId('corr-add-KETA-1', {}, T));
    await rowsIn(2);
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toMatch(/Section saved as South line/), T);
    expect((await b.loadSection('s-south')).well_ids).toEqual(['corr-w3', 'corr-w1']);
    expect((await b.loadSection('s-north')).well_ids).toEqual(['corr-w1', 'corr-w2']);
  });

  test('unsaved changes are guarded: Discard opens without saving, Save first saves then opens', async () => {
    const b = two();
    mount(b);
    await rowsIn(2);
    fireEvent.click(screen.getByTestId('corr-remove-KETA-2'));
    await rowsIn(1);
    await screen.findByTestId('corr-unsaved');
    fireEvent.change(screen.getByTestId('corr-section-select'), { target: { value: 's-south' } });
    expect(screen.getByTestId('corr-section-pending').textContent).toMatch(/Unsaved changes. Before you open South line/);
    fireEvent.click(screen.getByTestId('corr-section-discard'));
    await waitFor(() => expect(status()).toMatch(/Opened section South line/), T);
    expect((await b.loadSection('s-north')).well_ids).toEqual(['corr-w1', 'corr-w2']);

    fireEvent.click(await screen.findByTestId('corr-add-KETA-2', {}, T));
    await rowsIn(2);
    fireEvent.change(screen.getByTestId('corr-section-select'), { target: { value: 's-north' } });
    fireEvent.click(screen.getByTestId('corr-section-save-first'));
    await waitFor(() => expect(status()).toMatch(/Opened section North line/), T);
    expect((await b.loadSection('s-south')).well_ids).toEqual(['corr-w3', 'corr-w2']);
  });

  test('New starts an empty named section and keeps the others', async () => {
    const b = two();
    mount(b);
    await rowsIn(2);
    nameIt('new', 'West line');
    await waitFor(() => expect(status()).toMatch(/New section West line/), T);
    await rowsIn(0);
    expect((await b.listSections()).map((s) => s.name).sort()).toEqual(['North line', 'South line', 'West line']);
    expect(screen.queryByTestId('corr-unsaved')).toBeNull();
  });

  test('Duplicate saves a copy under a new name and continues in it; the original is untouched', async () => {
    const b = two();
    mount(b);
    await rowsIn(2);
    fireEvent.click(screen.getByTestId('corr-remove-KETA-2'));
    await rowsIn(1);
    fireEvent.click(screen.getByTestId('corr-section-duplicate'));
    expect(screen.getByTestId('corr-section-name-input').value).toBe('North line (copy)');
    fireEvent.click(screen.getByTestId('corr-section-name-ok'));
    await waitFor(() => expect(status()).toMatch(/Saved a copy as North line \(copy\)/), T);
    const copy = (await b.listSections()).find((s) => s.name === 'North line (copy)');
    expect((await b.loadSection(copy.id)).well_ids).toEqual(['corr-w1']);
    expect((await b.loadSection('s-north')).well_ids).toEqual(['corr-w1', 'corr-w2']);
    expect(screen.queryByTestId('corr-unsaved')).toBeNull();
  });

  test('Rename refuses a name already used (any case) and applies a free one', async () => {
    const b = two();
    mount(b);
    await rowsIn(2);
    nameIt('rename', 'south LINE');
    await waitFor(() => expect(status()).toMatch(/already have a section named South line/), T);
    nameIt('rename', 'North line v2');
    await waitFor(() => expect(status()).toMatch(/renamed to North line v2/), T);
    expect((await b.loadSection('s-north')).name).toBe('North line v2');
  });

  test('Delete removes the section (tops stay) and opens the next one', async () => {
    const b = two();
    mount(b);
    await rowsIn(2);
    const topsBefore = (await b.listTops('corr-w1')).length;
    fireEvent.click(screen.getByTestId('corr-section-delete'));
    fireEvent.click(screen.getByTestId('corr-section-delete'));
    await waitFor(() => expect(status()).toMatch(/Deleted section North line. Its tops stay/), T);
    await rowsIn(1);
    expect((await b.listSections()).map((s) => s.name)).toEqual(['South line']);
    expect((await b.listTops('corr-w1')).length).toBe(topsBefore);
  });

  test('the first save with no sections creates Default section; a second new section is its own row', async () => {
    const b = makeInMemoryBackend();
    mount(b, '?wells=corr-w1');
    await rowsIn(1);
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toMatch(/saved as Default section/), T);
    nameIt('new', 'Second');
    await waitFor(() => expect(status()).toMatch(/New section Second/), T);
    fireEvent.click(await screen.findByTestId('corr-add-KETA-2', {}, T));
    await rowsIn(1);
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toMatch(/saved as Second/), T);
    const list = await b.listSections();
    expect(list.map((s) => s.name).sort()).toEqual(['Default section', 'Second']);
    expect((await b.loadSection(list.find((s) => s.name === 'Default section').id)).well_ids).toEqual(['corr-w1']);
  });
});

describe('U2-007 undo for tops edits (the shared registry rows)', () => {
  const kWells = '?wells=corr-w1,corr-w2,corr-w3';
  const names = async (b, id) => (await b.listTops(id)).map((t) => t.name);

  test('undo a delete puts every row back with its attributes, including by Ctrl+Z', async () => {
    const b = makeInMemoryBackend();
    const mid = (await b.listTops('corr-w1')).find((t) => t.name === 'Mid Shale');
    await b.updateTop(mid.id, { surface_type: 'mfs', confidence: 'low', notes: 'picked on GR' });
    mount(b, kWells);
    await rowsIn(3);
    expect(screen.getByTestId('corr-undo').disabled).toBe(true);
    fireEvent.click(await screen.findByTestId('corr-top-delete-Mid Shale', {}, T));
    fireEvent.click(screen.getByTestId('corr-top-delete-Mid Shale'));
    await waitFor(() => expect(status()).toMatch(/Deleted Mid Shale from 2 wells/), T);
    expect(await names(b, 'corr-w1')).not.toContain('Mid Shale');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(status()).toMatch(/Undid: delete Mid Shale from 2 wells/), T);
    const back = (await b.listTops('corr-w1')).find((t) => t.name === 'Mid Shale');
    expect(back).toMatchObject({ md_m: 1580, surface_type: 'mfs', confidence: 'low', notes: 'picked on GR' });
    expect(await names(b, 'corr-w2')).toContain('Mid Shale');
    expect(screen.getByTestId('corr-undo').disabled).toBe(true);
  });

  test('undo a rename, then a propagate, in reverse order', async () => {
    const b = makeInMemoryBackend();
    mount(b, kWells);
    await rowsIn(3);
    fireEvent.click(await screen.findByTestId('corr-top-rename-Top Marker', {}, T));
    fireEvent.change(screen.getByTestId('corr-top-rename-input-Top Marker'), { target: { value: 'Marker A' } });
    fireEvent.click(screen.getByTestId('corr-top-rename-ok-Top Marker'));
    await waitFor(() => expect(status()).toMatch(/Renamed Top Marker to Marker A/), T);
    fireEvent.change(screen.getByTestId('corr-prop-name'), { target: { value: 'Seed Z' } });
    fireEvent.change(screen.getByTestId('corr-prop-md'), { target: { value: '1520' } });
    fireEvent.click(screen.getByTestId('corr-prop-run'));
    await waitFor(() => expect(status()).toMatch(/Propagated Seed Z to 2 wells/), T);
    expect(screen.getByTestId('corr-undo').textContent).toMatch(/Undo \(2\)/);
    fireEvent.click(screen.getByTestId('corr-undo'));
    await waitFor(() => expect(status()).toMatch(/Undid: propagate Seed Z to 2 wells/), T);
    expect(await names(b, 'corr-w1')).not.toContain('Seed Z');
    fireEvent.click(screen.getByTestId('corr-undo'));
    await waitFor(() => expect(status()).toMatch(/Undid: rename Top Marker to Marker A/), T);
    expect(await names(b, 'corr-w1')).toContain('Top Marker');
    expect(await names(b, 'corr-w2')).toContain('Top Marker');
  });

  test('a top edited since in another app is kept, and the undo says why', async () => {
    const b = makeInMemoryBackend();
    mount(b, kWells);
    await rowsIn(3);
    fireEvent.change(screen.getByTestId('corr-prop-name'), { target: { value: 'Seed Y' } });
    fireEvent.change(screen.getByTestId('corr-prop-md'), { target: { value: '1520' } });
    fireEvent.click(screen.getByTestId('corr-prop-run'));
    await waitFor(() => expect(status()).toMatch(/Propagated Seed Y/), T);
    const y1 = (await b.listTops('corr-w1')).find((t) => t.name === 'Seed Y');
    await b.updateTop(y1.id, { mdM: 1530 }); // moved in Petrophysics meanwhile
    fireEvent.click(screen.getByTestId('corr-undo'));
    await waitFor(() => expect(status()).toMatch(/Not undone: Seed Y was edited since and was kept/), T);
    expect(await names(b, 'corr-w1')).toContain('Seed Y');
    expect(await names(b, 'corr-w2')).not.toContain('Seed Y');
  });
});

describe('U2-004 tops file import and export in the app', () => {
  test('a TVDSS file is read, shown with its columns, applied at MD, and undone', async () => {
    const b = makeInMemoryBackend();
    mount(b, '?wells=corr-w1,corr-w2,corr-w3');
    await rowsIn(3);
    fireEvent.click(await screen.findByTestId('corr-tops-import-open', {}, T));
    fireEvent.change(await screen.findByTestId('corr-tops-paste', {}, T), { target: { value: 'Well,Top,TVDSS (m)\nKETA-1,Sand Q,1500\nKETA-3,Sand Q,1480\nNOPE,Sand Q,1\n' } });
    await waitFor(() => expect(screen.getByTestId('corr-tops-plan-summary').textContent).toBe('1 new, 0 moved, 0 unchanged, 2 not applied.'), T);
    const plan = screen.getByTestId('corr-tops-plan').textContent;
    expect(plan).toMatch(/depth from "TVDSS \(m\)" as TVDSS \(below sea level\) in m/);
    expect(screen.getByTestId('corr-tops-problems').textContent).toMatch(/KETA-3 is shared with you read-only/);
    fireEvent.click(screen.getByTestId('corr-tops-apply'));
    await waitFor(() => expect(status()).toMatch(/Tops file applied: 1 added, 0 moved, 2 lines not applied/), T);
    const kb = (await b.listWells()).find((w) => w.id === 'corr-w1').kb_m || 0;
    expect((await b.listTops('corr-w1')).find((t) => t.name === 'Sand Q').md_m).toBeCloseTo(1500 + kb, 3);
    fireEvent.click(screen.getByTestId('corr-undo'));
    await waitFor(() => expect(status()).toMatch(/Undid: apply the tops file/), T);
    expect((await b.listTops('corr-w1')).some((t) => t.name === 'Sand Q')).toBe(false);
   }, 300000); // several awaited writes: slow under a loaded box

  test('Export CSV downloads the shown tops with MD, TVD and TVDSS in the display unit', async () => {
    const blobs = [];
    window.URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:x'; };
    window.URL.revokeObjectURL = () => {};
    mount(makeInMemoryBackend(), '?wells=corr-w1,corr-w2');
    await rowsIn(2);
    fireEvent.change(screen.getByTestId('corr-depth-unit'), { target: { value: 'ft' } });
    fireEvent.click(await screen.findByTestId('corr-tops-export', {}, T));
    await waitFor(() => expect(status()).toMatch(/Exported 8 tops/), T);
    const text = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(blobs[blobs.length - 1]); });
    expect(text).toMatch(/Well,UWI,Top,Surface type,MD \(ft\),TVD \(ft\),TVDSS \(ft\),TWT \(ms\)/);
    expect(text).toMatch(new RegExp(`KETA-1,[^,]*,Top Dome,[^,]*,${(1500 / 0.3048).toFixed(2)}`));
  });
});

describe('U2-005 propagate at the displayed depth', () => {
  const flatten = async () => {
    fireEvent.change(screen.getByTestId('corr-datum-mode'), { target: { value: 'flatten' } });
    fireEvent.change(screen.getByTestId('corr-datum-top'), { target: { value: 'Top Dome' } });
    await waitFor(() => expect(screen.getByTestId('corr-section').getAttribute('data-datum-mode')).toBe('flatten'), T);
  };
  const mdOf = async (b, id, name) => (await b.listTops(id)).find((t) => t.name === name)?.md_m;

  test('on a section flattened on Top Dome, the seed lands at the same flattened depth in each well', async () => {
    const b = makeInMemoryBackend();
    mount(b, '?wells=corr-w1,corr-w2,corr-w3');
    await rowsIn(3);
    await flatten(); // datum 1500: KETA-1 shift 0, KETA-2 (Top Dome 1540 m) shift -40
    fireEvent.change(screen.getByTestId('corr-prop-name'), { target: { value: 'Seed F' } });
    fireEvent.change(screen.getByTestId('corr-prop-md'), { target: { value: '1520' } });
    fireEvent.click(screen.getByTestId('corr-prop-run'));
    await waitFor(() => expect(status()).toMatch(/Propagated Seed F to 2 wells at 1520.0 m flattened MD \(MD 1520.0 m to 1560.0 m\)/), T);
    expect(await mdOf(b, 'corr-w1', 'Seed F')).toBeCloseTo(1520, 6);
    expect(await mdOf(b, 'corr-w2', 'Seed F')).toBeCloseTo(1560, 6); // one MD for all would put it 40 m high
  });

  test('"one MD in every well" keeps the old meaning', async () => {
    const b = makeInMemoryBackend();
    mount(b, '?wells=corr-w1,corr-w2,corr-w3');
    await rowsIn(3);
    await flatten();
    fireEvent.change(screen.getByTestId('corr-prop-name'), { target: { value: 'Seed G' } });
    fireEvent.change(screen.getByTestId('corr-prop-md'), { target: { value: '1520' } });
    fireEvent.change(screen.getByTestId('corr-prop-ref'), { target: { value: 'md' } });
    fireEvent.click(screen.getByTestId('corr-prop-run'));
    await waitFor(() => expect(status()).toMatch(/Propagated Seed G to 2 wells at 1520.0 m MD/), T);
    expect(await mdOf(b, 'corr-w2', 'Seed G')).toBeCloseTo(1520, 6);
  });

  test('in TVDSS the deviated well gets its own MD through its survey', async () => {
    const b = makeInMemoryBackend();
    mount(b, '?wells=corr-w1,corr-w2');
    await rowsIn(2);
    fireEvent.change(screen.getByTestId('corr-depth-ref'), { target: { value: 'tvdss' } });
    const wells = await b.listWells();
    const { makeDepthFrame } = await import('@/pages/apps/WellDataManager/engine/checkshots');
    const w2 = wells.find((w) => w.id === 'corr-w2');
    const f2 = makeDepthFrame({ deviation: w2.deviation, kbM: w2.kb_m });
    const tvdss = f2.mdToTvdss(1700).tvdss;
    fireEvent.change(screen.getByTestId('corr-prop-name'), { target: { value: 'Seed H' } });
    fireEvent.change(screen.getByTestId('corr-prop-md'), { target: { value: tvdss.toFixed(4) } });
    fireEvent.click(screen.getByTestId('corr-prop-run'));
    await waitFor(() => expect(status()).toMatch(/Propagated Seed H to 2 wells at .* TVDSS/), T);
    expect(await mdOf(b, 'corr-w2', 'Seed H')).toBeCloseTo(1700, 2);
  });

  test('a blank depth seeds from an existing pick of the top (flattened)', async () => {
    const b = makeInMemoryBackend();
    const mid2 = (await b.listTops('corr-w2')).find((t) => t.name === 'Mid Shale');
    await b.deleteTop(mid2);
    mount(b, '?wells=corr-w1,corr-w2,corr-w3');
    await rowsIn(3);
    await flatten();
    fireEvent.change(screen.getByTestId('corr-prop-name'), { target: { value: 'Mid Shale' } });
    fireEvent.click(screen.getByTestId('corr-prop-run'));
    await waitFor(() => expect(status()).toMatch(/Propagated Mid Shale to 1 well at 1580.0 m flattened MD \(seeded from its pick on KETA-1\)/), T);
    expect(await mdOf(b, 'corr-w2', 'Mid Shale')).toBeCloseTo(1620, 6);
  });
});

describe('U2-014 the well list at field scale', () => {
  test('filters by name or UWI and adds or removes every shown well at once', async () => {
    const { scaleWells } = await import('../services/scaleSection');
    const b = makeInMemoryBackend({ sample: false, seedWells: scaleWells(50) });
    mount(b);
    await screen.findByTestId('corr-add-FIELD-50', {}, T);
    fireEvent.change(screen.getByTestId('corr-well-filter'), { target: { value: 'field-1' } });
    // FIELD-10 .. FIELD-19
    expect(screen.getAllByTestId(/^corr-add-FIELD-/)).toHaveLength(10);
    fireEvent.click(screen.getByTestId('corr-add-shown'));
    await rowsIn(10);
    expect(status()).toMatch(/Added 10 wells/);
    // FIELD-10 .. FIELD-19 carry UWIs SC-1009 .. SC-1018: "SC-101" (dash ignored) matches nine of them
    fireEvent.change(screen.getByTestId('corr-well-filter'), { target: { value: 'SC-101' } });
    expect(screen.getByTestId('corr-order-shown').textContent).toBe('(9 shown)');
    fireEvent.change(screen.getByTestId('corr-well-filter'), { target: { value: 'field-15' } });
    fireEvent.click(screen.getByTestId('corr-remove-shown'));
    await rowsIn(0); // the filter shows the in-section rows only
    fireEvent.click(screen.getByTestId('corr-well-filter-clear'));
    await rowsIn(9);
    fireEvent.change(screen.getByTestId('corr-well-filter'), { target: { value: 'nothing like it' } });
    expect(screen.getByTestId('corr-filter-empty').textContent).toMatch(/No well name or UWI contains "nothing like it"/);
  }, 300000);
});

describe('U2-003 TWT and seismic horizons in the section', () => {
  test('TWT: wells with checkshots are drawn in time, a well without is named; horizons draw and the section flattens on one', async () => {
    const b = makeInMemoryBackend();
    mount(b, '?wells=corr-w1,corr-w2,corr-w3');
    await rowsIn(3);
    fireEvent.change(screen.getByTestId('corr-depth-ref'), { target: { value: 'twt' } });
    const sec = () => screen.getByTestId('corr-section');
    await waitFor(() => expect(sec().getAttribute('data-well-notes')).toMatch(/KETA-3 \(shared\)=no checkshots: not drawn in time|KETA-3=no checkshots: not drawn in time/), T);
    expect(screen.getByTestId('corr-depth-status').textContent).toMatch(/TWT/);
    // both Seismolord horizons are listed; the time one is drawn on the two wells with checkshots
    fireEvent.click(await screen.findByTestId('corr-hz-surf-dome-twt', {}, T));
    await waitFor(() => expect(screen.getByTestId('corr-hz-note-surf-dome-twt').textContent).toMatch(/drawn on 2 wells; not on KETA-3 \(no checkshots for a time horizon\)/), T);
    fireEvent.click(screen.getByTestId('corr-hz-surf-dome-depth'));
    await waitFor(() => expect(screen.getByTestId('corr-hz-note-surf-dome-depth').textContent).toMatch(/drawn on 3 wells/), T);
    // flatten on the horizon: it is offered by the datum control
    fireEvent.change(screen.getByTestId('corr-depth-ref'), { target: { value: 'md' } });
    fireEvent.change(screen.getByTestId('corr-datum-mode'), { target: { value: 'flatten' } });
    fireEvent.change(screen.getByTestId('corr-datum-top'), { target: { value: 'H: Dome' } });
    await waitFor(() => expect(screen.getByTestId('corr-datum-top').value).toBe('H: Dome'), T);
    // horizons are read only: they are not in the tops list and nothing was written
    expect(screen.queryByTestId('corr-top-row-H: Dome')).toBeNull();
    expect((await b.listTops('corr-w1')).some((t) => t.name.startsWith('H: '))).toBe(false);
  }, 300000);
});
