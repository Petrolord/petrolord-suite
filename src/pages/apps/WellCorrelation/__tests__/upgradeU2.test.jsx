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
