/**
 * Well Correlation: organisation sharing of named sections
 * (geo_correlation_sections; the owner item "named sections are owner-only").
 * The workstation runs on the in-memory mirror of the sharing migration
 * (20261002100000_suite_record_sharing.sql); shared rules and store:
 * src/lib/recordSharing.
 * Negative control on origin/main be1fb3ef4: sections were owner-only (the
 * picker said "only you can see them"; no switch, no read-only state).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import CorrelationWorkstation from '../components/CorrelationWorkstation';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { HARNESS_ME, HARNESS_COLLEAGUE } from '@/lib/recordSharing';

jest.mock('@/components/wells/plotPng', () => ({ trackPlotPng: () => Promise.resolve(new Blob(['png'])) }));
const noopCtx = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
});

const T = 'geo_correlation_sections';
const W = { timeout: 15000 };
const mount = async (backend) => { await act(async () => { render(<MemoryRouter initialEntries={['/dev/well-correlation']}><CorrelationWorkstation backend={backend} /></MemoryRouter>); }); };
const status = () => screen.getByTestId('corr-status').textContent;
const rowsIn = async (n) => waitFor(() => expect(screen.queryAllByTestId('corr-order-row')).toHaveLength(n), W);
const section = (id, name, wellIds) => ({ id, name, well_ids: wellIds, datum: { mode: 'structural' }, track_layout: { depthUnit: 'm' }, schema_version: 1 });
const rows = (b) => b._sharing.db._rows(T);
const open = async (id) => { await act(async () => { fireEvent.change(screen.getByTestId('corr-section-select'), { target: { value: id } }); }); };

describe('owner', () => {
  test('shares the open section from the ribbon; the colleague can then list it', async () => {
    const b = makeInMemoryBackend({ sections: [section('s-north', 'North line', ['corr-w1', 'corr-w2'])] });
    await mount(b);
    await rowsIn(2);
    await act(async () => { fireEvent.click(await screen.findByTestId('corr-section-share', {}, W)); });
    await act(async () => { fireEvent.click(await screen.findByTestId('share-switch', {}, W)); });
    await waitFor(() => expect(rows(b)[0]).toMatchObject({ visibility: 'organization', org_access: 'view', user_id: HARNESS_ME }), W);
    expect(b._sharing.db.select(T, HARNESS_COLLEAGUE).data.map((r) => r.name)).toEqual(['North line']);
    // an owner save still goes through and is not a problem for a view share
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toMatch(/Section saved as North line/), W);
  });
});

describe('colleague', () => {
  test('shared sections are listed apart; a view-only one opens read-only and the copy is the user\'s own', async () => {
    const b = makeInMemoryBackend({ sections: [section('s-mine', 'My line', ['corr-w3'])], sharedSections: true });
    await mount(b);
    await rowsIn(1);
    await waitFor(() => expect(screen.getByTestId('corr-sections-shared').textContent).toMatch(/Regional dip line \(Ada\) \(2 wells\), by Ada Colleague/), W);
    await open('section-ada-view');
    await rowsIn(2);
    await waitFor(() => expect(screen.getByTestId('shared-by')).toHaveTextContent('Shared by Ada Colleague'), W);
    expect(screen.getByTestId('corr-section-rename')).toBeDisabled();
    expect(screen.getByTestId('corr-section-delete')).toBeDisabled();
    const before = rows(b).find((r) => r.id === 'section-ada-view');
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toBe('Section not saved. Shared by Ada Colleague for viewing. Save a copy to work on your own version. Use the copy button to save it as your own section.'), W);
    expect(rows(b).find((r) => r.id === 'section-ada-view')).toEqual(before);
    await act(async () => { fireEvent.click(screen.getByTestId('save-copy')); });
    await waitFor(() => expect(status()).toMatch(/Saved a copy as Regional dip line \(Ada\) \(copy\); you are now working in it\./), W);
    expect(rows(b).find((r) => r.name === 'Regional dip line (Ada) (copy)')).toMatchObject({ user_id: HARNESS_ME, visibility: 'private' });
  });

  test('an edit section: refused until taken, then saved and stamped with the editor; the owner reads who', async () => {
    const b = makeInMemoryBackend({ sharedSections: true });
    await mount(b);
    await waitFor(() => expect(screen.getByTestId('corr-sections-shared')).toBeInTheDocument(), W);
    await open('section-ada-edit');
    await rowsIn(2);
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toMatch(/^Section not saved\. Start editing first/), W);
    await act(async () => { fireEvent.click(await screen.findByTestId('start-editing', {}, W)); });
    await waitFor(() => expect(rows(b).find((r) => r.id === 'section-ada-edit').editing_by).toBe(HARNESS_ME), W);
    fireEvent.click(screen.getByTestId('corr-remove-KETA-2'));
    await rowsIn(1);
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toMatch(/Section saved as Field strike line, team/), W);
    expect(rows(b).find((r) => r.id === 'section-ada-edit')).toMatchObject({ updated_by: HARNESS_ME, user_id: HARNESS_COLLEAGUE, version: 2 });
    const log = b._sharing.db.listChanges(T, HARNESS_COLLEAGUE, 'section-ada-edit').data;
    expect(log[0]).toMatchObject({ action: 'updated', changed_by: HARNESS_ME, summary: 'Section saved' });
    expect(log[0].changed_fields).toContain('well_ids');
  });

  test('the owner saved a newer version meanwhile: starting to edit says so, and a save from the old copy is refused', async () => {
    const b = makeInMemoryBackend({ sharedSections: true });
    await mount(b);
    await waitFor(() => expect(screen.getByTestId('corr-sections-shared')).toBeInTheDocument(), W);
    await open('section-ada-edit');
    await rowsIn(2);
    // the owner saves from her own session before this user starts editing
    expect(b._sharing.db.update(T, HARNESS_COLLEAGUE, 'section-ada-edit', { datum: { mode: 'flatten', top: 'Top Dome' } }).data[0].version).toBe(2);
    await act(async () => { fireEvent.click(await screen.findByTestId('start-editing', {}, W)); });
    await waitFor(() => expect(screen.getByTestId('sharing-notice').textContent).toMatch(/^Ada Colleague saved a newer version at .*\. Reload, or save yours as a copy\./), W);
    fireEvent.click(screen.getByTestId('corr-remove-KETA-2'));
    await rowsIn(1);
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toMatch(/^Ada Colleague saved a newer version at .*\. Reload, or save yours as a copy\.$/), W);
    expect(b._sharing.db._rows(T).find((r) => r.id === 'section-ada-edit')).toMatchObject({ version: 2, datum: { mode: 'flatten', top: 'Top Dome' } });
  });
});

describe('before the migration is applied', () => {
  test('the picker and Save work as before and the control is a note', async () => {
    const b = makeInMemoryBackend({ sections: [section('s-north', 'North line', ['corr-w1', 'corr-w2'])], sharing: { applied: false } });
    await mount(b);
    await rowsIn(2);
    fireEvent.click(screen.getByTestId('corr-remove-KETA-2'));
    await rowsIn(1);
    fireEvent.click(screen.getByTestId('corr-save'));
    await waitFor(() => expect(status()).toMatch(/Section saved as North line/), W);
    expect(rows(b)[0].version).toBeUndefined();
    await act(async () => { fireEvent.click(await screen.findByTestId('corr-section-share', {}, W)); });
    expect(await screen.findByTestId('sharing-unavailable', {}, W)).toBeInTheDocument();
    expect(screen.queryByTestId('share-switch')).toBeNull();
  });
});
