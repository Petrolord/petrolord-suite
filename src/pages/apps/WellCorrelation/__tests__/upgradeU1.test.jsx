/**
 * AppUpgrade WC-U1 (2026-09-29): Well Correlation's practitioner-lens
 * findings on the real workstation (CorrelationWorkstation on the in-memory
 * backend, seeded from the evidence kit e2e/fixtures/wc).
 *
 *  WC-U1-001 Propagate with the depth left blank wrote the top at MD 0 on
 *            every owned well (Number('') is 0), straight into the shared
 *            geo_wells_tops rows Seismolord and Mapping read.
 *  WC-U1-006 A saved section this build cannot open (a newer build's row)
 *            emptied the wells list, and Save then overwrote that row.
 *  WC-U1-007 A saved section naming a well that has since been deleted or
 *            unshared counted it ("3 wells") and drew two, silently.
 *  WC-U1-008 Tops spelled differently by two tools (TOP AGBADA, Top Agbada)
 *            were two correlations, and renaming one onto the other was
 *            refused, so they could never be merged in the section.
 *  WC-U1-009 The datum depth box snapped: clearing it set the datum to 0.
 *  WC-U1-013 Nothing said a section had unsaved changes; the ghost curve and
 *            the report header were not saved at all.
 * Negative control: each test fails on origin/main (c71824ef6).
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import CorrelationWorkstation from '../components/CorrelationWorkstation';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

// the PNG composer is canvas work jsdom cannot do; record what it is given
const mockPng = [];
jest.mock('@/components/wells/plotPng', () => ({
  trackPlotPng: (args) => { mockPng.push(args); return Promise.resolve(new Blob(['png'])); },
}));

const FIX = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wc');
const hostileWells = () => JSON.parse(fs.readFileSync(path.join(FIX, 'hostile', 'wells.json'), 'utf8'));
const saved = (name) => JSON.parse(fs.readFileSync(path.join(FIX, 'saved', name), 'utf8'));

const noopCtx = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
});

const mount = (backend, query = '') => render(
  <MemoryRouter initialEntries={[`/dev/well-correlation${query}`]}>
    <CorrelationWorkstation backend={backend} />
  </MemoryRouter>,
);
const status = () => screen.getByTestId('corr-status').textContent;
// Testing Library trims test ids when it matches; a name with a trailing
// space (the hostile case) is found by its exact attribute instead
const byExactId = (id) => document.querySelector(`[data-testid=${JSON.stringify(id)}]`);
const ready = async (n) => {
  await screen.findByTestId('corr-explorer');
  if (n) await waitFor(() => expect(screen.getAllByTestId(/^corr-remove-/)).toHaveLength(n), { timeout: 8000 });
};

describe('WC-U1-001 propagate needs a depth, and a depth inside the well', () => {
  test('a blank depth writes nothing and says what is missing', async () => {
    const b = makeInMemoryBackend();
    mount(b, '?wells=corr-w1,corr-w2,corr-w3');
    await ready(3);
    fireEvent.change(screen.getByTestId('corr-prop-name'), { target: { value: 'Marker Z' } });
    fireEvent.click(screen.getByTestId('corr-prop-run'));
    await waitFor(() => expect(status()).toMatch(/depth/i));
    for (const id of ['corr-w1', 'corr-w2']) {
      expect((await b.listTops(id)).some((t) => t.name === 'Marker Z')).toBe(false);
    }
  });

  test('a depth below a well’s TD skips that well and names it; the shared well is named too', async () => {
    const b = makeInMemoryBackend();
    mount(b, '?wells=corr-w1,corr-w2,corr-w3');
    await ready(3);
    fireEvent.change(screen.getByTestId('corr-prop-name'), { target: { value: 'Deep Marker' } });
    fireEvent.change(screen.getByTestId('corr-prop-md'), { target: { value: '1800' } }); // TD is 1,750 m
    fireEvent.click(screen.getByTestId('corr-prop-run'));
    await waitFor(() => expect(status()).toMatch(/below TD/));
    expect(status()).toMatch(/KETA-1/);
    expect(status()).toMatch(/KETA-3/); // shared, read-only
    expect((await b.listTops('corr-w1')).some((t) => t.name === 'Deep Marker')).toBe(false);
  });
});

describe('WC-U1-006 a saved section this build cannot open', () => {
  test('keeps the wells list and refuses Save with the reason', async () => {
    const b = makeInMemoryBackend({ section: saved('section-newer-build.json') });
    const save = jest.spyOn(b, 'saveSection');
    mount(b);
    await screen.findByTestId('corr-explorer');
    await waitFor(() => expect(status()).toMatch(/newer version/));
    expect(screen.getAllByTestId(/^corr-add-/)).toHaveLength(3);
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toMatch(/not saved/i));
    expect(save).not.toHaveBeenCalled();
  });
});

describe('WC-U1-007 a saved section naming a well that is gone', () => {
  test('leaves it out, counts what is drawn and says so', async () => {
    const b = makeInMemoryBackend({ section: saved('section-missing-well.json') });
    mount(b);
    await ready(2);
    expect(screen.getByTestId('corr-order-count').textContent).toBe('2');
    expect(status()).toMatch(/1 of its 3 wells is no longer in your registry/);
  });
});

describe('WC-U1-008 tops spelled two ways', () => {
  const seed = () => makeInMemoryBackend({ sample: false, seedWells: hostileWells() });

  test('the tops list flags the spelling variants', async () => {
    mount(seed(), '?wells=hw-utm,hw-nosurvey,hw-case');
    await ready(3);
    await screen.findByTestId('corr-top-row-TOP AGBADA', {}, { timeout: 8000 });
    expect(screen.getByTestId('corr-top-variant-TOP AGBADA').textContent).toMatch(/Top Agbada/);
    expect(byExactId('corr-top-variant-Base Seal ').textContent).toMatch(/"Base Seal"/);
  });

  test('renaming onto an existing spelling merges it; a well that has both keeps both and is named', async () => {
    const b = seed();
    mount(b, '?wells=hw-utm,hw-nosurvey,hw-case');
    await ready(3);
    await waitFor(() => expect(byExactId('corr-top-row-Base Seal ')).not.toBeNull(), { timeout: 8000 });
    fireEvent.click(byExactId('corr-top-rename-Base Seal '));
    fireEvent.change(byExactId('corr-top-rename-input-Base Seal '), { target: { value: 'Base Seal' } });
    fireEvent.click(byExactId('corr-top-rename-ok-Base Seal '));
    await waitFor(() => expect(status()).toMatch(/Renamed/), { timeout: 8000 });
    expect((await b.listTops('hw-case')).map((t) => t.name)).toContain('Base Seal');
    // IDU 11 carries Top Agbada AND TOP AGBADA: renaming onto Top Agbada skips it
    fireEvent.click(screen.getByTestId('corr-top-rename-TOP AGBADA'));
    fireEvent.change(screen.getByTestId('corr-top-rename-input-TOP AGBADA'), { target: { value: 'Top Agbada' } });
    fireEvent.click(screen.getByTestId('corr-top-rename-ok-TOP AGBADA'));
    await waitFor(() => expect(status()).toMatch(/IDU 11 already has Top Agbada/));
  });
});

describe('WC-U1-009 the datum depth is typed, not snapped', () => {
  test('clearing the box keeps the datum; a new flatten starts at the top’s own depth', async () => {
    mount(makeInMemoryBackend(), '?wells=corr-w1,corr-w2,corr-w3');
    await ready(3);
    fireEvent.change(screen.getByTestId('corr-datum-mode'), { target: { value: 'flatten' } });
    fireEvent.change(screen.getByTestId('corr-datum-top'), { target: { value: 'Base Sand' } });
    // flatten starts on Top Marker (the first top) at KETA-1's own 1,440 m
    const sec = await screen.findByTestId('corr-section');
    const input = screen.getByTestId('corr-datum-depth');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '16' } });
    fireEvent.change(input, { target: { value: '1600.' } });
    expect(input.value).toBe('1600.');
    expect(sec).toBeTruthy();
  });
  test('the first flatten sits the datum at the chosen top in the first well', async () => {
    mount(makeInMemoryBackend(), '?wells=corr-w1,corr-w2,corr-w3');
    await ready(3);
    fireEvent.change(screen.getByTestId('corr-datum-mode'), { target: { value: 'flatten' } });
    expect(screen.getByTestId('corr-datum-depth').value).toBe('1440');
  });
});

describe('WC-U1-013 unsaved changes and what Save keeps', () => {
  test('the status bar says when the section differs from the saved one, and Save clears it', async () => {
    const b = makeInMemoryBackend();
    mount(b, '?wells=corr-w1,corr-w2,corr-w3');
    await ready(3);
    await waitFor(() => expect(screen.getByTestId('corr-unsaved')).toBeTruthy());
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toMatch(/Section saved/));
    expect(screen.queryByTestId('corr-unsaved')).toBeNull();
    fireEvent.change(screen.getByTestId('corr-depth-ref'), { target: { value: 'tvdss' } });
    await waitFor(() => expect(screen.getByTestId('corr-unsaved')).toBeTruthy());
  });

  test('the ghost curve and the report header are saved and restored', async () => {
    const b = makeInMemoryBackend();
    const first = mount(b, '?wells=corr-w1,corr-w2,corr-w3');
    await ready(3);
    fireEvent.change(screen.getByTestId('corr-ghost-source'), { target: { value: 'corr-w1' } });
    fireEvent.change(screen.getByTestId('corr-report-field'), { target: { value: 'Keta Field' } });
    fireEvent.change(screen.getByTestId('corr-report-analyst'), { target: { value: 'A. Analyst' } });
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toMatch(/Section saved/));
    first.unmount();
    mount(b);
    await ready(3);
    await waitFor(() => expect(screen.getByTestId('corr-ghost-source').value).toBe('corr-w1'));
    expect(screen.getByTestId('corr-report-field').value).toBe('Keta Field');
    expect(screen.getByTestId('corr-report-analyst').value).toBe('A. Analyst');
    await act(async () => {});
    expect(screen.queryByTestId('corr-unsaved')).toBeNull();
  });
});

describe('WC-U1-010 the exported PNG carries the reviewer header', () => {
  test('field, analyst, datum, reference, unit, scale, date and build reach the image header', async () => {
    window.URL.createObjectURL = () => 'blob:x';
    window.URL.revokeObjectURL = () => {};
    mount(makeInMemoryBackend(), '?wells=corr-w1,corr-w2,corr-w3');
    await ready(3);
    fireEvent.change(screen.getByTestId('corr-report-field'), { target: { value: 'Keta Field' } });
    fireEvent.change(screen.getByTestId('corr-report-analyst'), { target: { value: 'A. Analyst' } });
    fireEvent.change(screen.getByTestId('corr-depth-ref'), { target: { value: 'tvdss' } });
    fireEvent.click(screen.getByTestId('corr-export-png'));
    await waitFor(() => expect(status()).toMatch(/exported as PNG/));
    const { title, caption } = mockPng[mockPng.length - 1];
    expect(title).toBe('Well Correlation: Keta Field (3 wells)');
    const text = caption.join(' | ');
    for (const s of ['KETA-1, KETA-2, KETA-3', 'Structural (true depth)', 'Depth TVDSS in m', 'Analyst A. Analyst', 'Template Raw quicklook']) expect(text).toContain(s);
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).toMatch(/Petrolord Suite/);
  });
});

describe('WC-U1-015 the section path map', () => {
  test('says when the wells are in different coordinate systems or have no location', async () => {
    const seed = hostileWells().map((w) => (w.name === 'IDU 9' ? { ...w, surface_x: null } : w));
    mount(makeInMemoryBackend({ sample: false, seedWells: seed }));
    const note = await screen.findByTestId('corr-map-frames', {}, { timeout: 15000 });
    expect(note.textContent).toMatch(/Mixed coordinate systems/);
    expect(note.textContent).toMatch(/EPSG:2277/);
    expect(note.textContent).toMatch(/EPSG:32632/);
    expect(note.textContent).toMatch(/1 well has no surface location/);
  });
  test('one frame, every well located: no note', async () => {
    mount(makeInMemoryBackend());
    await screen.findByTestId('corr-explorer');
    await waitFor(() => expect(screen.getAllByTestId(/^corr-add-/)).toHaveLength(3));
    expect(screen.queryByTestId('corr-map-frames')).toBeNull();
  });
});
