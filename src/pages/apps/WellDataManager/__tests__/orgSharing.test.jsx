/**
 * Well Data Manager U2-012: team editing of organisation wells (geo_wells
 * and its child registries), on the in-memory mirror of the team-editing
 * migration (20261002110000_geo_wells_team_editing.sql). The well keeps its
 * sharing model (shared when organization_id is set); the owner can let
 * colleagues edit it, one person at a time; tops, logs, zones, intervals and
 * core photos follow the well's check-out. Shared rules and store:
 * src/lib/recordSharing; the SQL is proved by tools/validation/org-sharing.
 * Negative control on origin/main be1fb3ef4: "Only the owner can ... this
 * well (org sharing is read-only)" for every write by a colleague.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import WellDataManager from '../WellDataManager';

jest.setTimeout(60000);
let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true }));
});

const ME = 'user-dev';
const OWNER = 'user-other';         // owns the seeded AKOMA-2, shared with the organisation
const W = { timeout: 20000 };
const akoma = (b) => b._sharing.db._rows('geo_wells').find((w) => w.name.startsWith('AKOMA-2'));
const top = (md) => ({ name: `Top ${md}`, mdM: md });
const mount = async () => { await act(async () => { render(<MemoryRouter><WellDataManager /></MemoryRouter>); }); };
const openWell = async (name) => {
  const row = (await screen.findAllByTestId('wdm-well-row', {}, W)).find((el) => el.textContent.includes(name));
  await act(async () => { fireEvent.click(row); });
};

describe('the backend follows the well\'s check-out', () => {
  test('a view-only organisation well stays read-only for a colleague, with the old sentence', async () => {
    const b = makeInMemoryBackend();
    const w = akoma(b);
    expect(w).toMatchObject({ user_id: OWNER, org_access: 'view', version: 1 });
    await expect(b.saveTop(w.id, top(900))).rejects.toThrow('Only the owner can add tops to this well (org sharing is read-only).');
    await expect(b.updateWellData(w.id, { kbM: 30 })).rejects.toThrow('Only the owner can edit this well (org sharing is read-only).');
    await expect(b.deleteWell(w)).rejects.toThrow('Only the owner can delete this well (org sharing is read-only).');
  });

  test('colleagues can edit: tops and the header only while this user holds the well; the history names them', async () => {
    const b = makeInMemoryBackend();
    const w = akoma(b);
    const owner = b._sharing.storeAs(OWNER);
    await owner.setSharing('geo_wells', w.id, { shared: true, access: 'edit' });
    await expect(b.saveTop(w.id, top(900))).rejects.toThrow(/^Start editing first/);
    expect((await b.sharing.take('geo_wells', w.id)).ok).toBe(true);
    expect(await b.saveTop(w.id, top(900))).toMatchObject({ name: 'Top 900', md_m: 900 });
    b.sharing.trackOpened('geo_wells', akoma(b));
    expect((await b.updateWellData(w.id, { kbM: 31 }, { versioned: true })).kb_m).toBe(31);
    expect(akoma(b)).toMatchObject({ kb_m: 31, updated_by: ME, user_id: OWNER, version: 2 });
    // the owner cannot write the well's children while the colleague edits, then takes over
    expect(b._sharing.db.canWriteChild(OWNER, w.id)).toBe(false);
    expect((await owner.take('geo_wells', w.id, { takeOver: true })).ok).toBe(true);
    await expect(b.saveTop(w.id, top(950))).rejects.toThrow(/^Being edited by Ama Other since /);
    await expect(b.updateWellData(w.id, { kbM: 32 }, { versioned: true })).rejects.toThrow(/^Being edited by Ama Other since /);
    // only the owner changes how the well is shared
    await expect(b.unshareWell(w.id)).rejects.toThrow();
    expect(akoma(b).organization_id).toBe('org-dev');
    const log = (await owner.history('geo_wells', w.id)).map((c) => `${c.action}:${c.changed_by_name}`);
    expect(log).toEqual(expect.arrayContaining(['taken_over:Ama Other', 'updated:You', 'checked_out:You', 'access_changed:Ama Other']));
  });

  test('a save from an older version of the well is refused; another app\'s patch of one field is not versioned', async () => {
    const b = makeInMemoryBackend({ seedSharedWell: false });
    const w = await b.saveWell({ name: 'OWN-1', surfaceX: 1, surfaceY: 2, kbM: 25 });
    b.sharing.trackOpened('geo_wells', w);
    b._sharing.db.update('geo_wells', ME, w.id, { td_md_m: 1800 });                 // the same user, another tab
    await expect(b.updateWellData(w.id, { kbM: 26 }, { versioned: true })).rejects.toThrow(/^You saved a newer version at .*\. Reload, or save yours as a copy\.$/);
    expect((await b.updateWellData(w.id, { checkshots: [] })).td_md_m).toBe(1800);   // unversioned: Seismolord saving checkshots
  });

  test('before the migration: owner-only writes, exactly as before', async () => {
    const b = makeInMemoryBackend({ sharing: { applied: false } });
    const w = akoma(b);
    expect(w.version).toBeUndefined();
    await expect(b.saveTop(w.id, top(900))).rejects.toThrow('Only the owner can add tops to this well (org sharing is read-only).');
    const mine = await b.saveWell({ name: 'OWN-1', surfaceX: 1, surfaceY: 2, kbM: 25 });
    expect((await b.updateWellData(mine.id, { kbM: 26 }, { versioned: true })).kb_m).toBe(26);
    expect((await b.shareWell(mine.id)).organization_id).toBe('org-dev');
    expect((await b.unshareWell(mine.id)).organization_id).toBeNull();
  });
});

describe('the workstation', () => {
  test('owner: the bar on the well lets colleagues edit and takes the well for the owner', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false });
    const w = await mockBackend.saveWell({ name: 'OWN-1', surfaceX: 1, surfaceY: 2, kbM: 25 });
    await mount();
    await openWell('OWN-1');
    await act(async () => { fireEvent.click(await screen.findByTestId('share-switch', {}, W)); });
    await waitFor(() => expect(mockBackend._sharing.db._rows('geo_wells')[0]).toMatchObject({ organization_id: 'org-dev', org_access: 'view' }), W);
    await act(async () => { fireEvent.change(await screen.findByTestId('share-access', {}, W), { target: { value: 'edit' } }); });
    await waitFor(() => expect(mockBackend._sharing.db._rows('geo_wells')[0]).toMatchObject({ org_access: 'edit', editing_by: ME }), W);
    expect(screen.getByTestId('sharing-banner')).toHaveTextContent('You are editing this well.');
    expect(w.id).toBeTruthy();
  });

  test('colleague: read-only until taken; then the header can be edited; "Being edited by" when the owner holds it', async () => {
    mockBackend = makeInMemoryBackend();
    const w = akoma(mockBackend);
    const owner = mockBackend._sharing.storeAs(OWNER);
    await owner.setSharing('geo_wells', w.id, { shared: true, access: 'edit' });
    await owner.release('geo_wells', w.id);                    // the owner is not editing now
    await mount();
    await openWell('AKOMA-2');
    await waitFor(() => expect(screen.getByTestId('shared-by')).toHaveTextContent('Shared by Ama Other'), W);
    expect(screen.getByTestId('wdm-header-status')).toBeDisabled();
    await act(async () => { fireEvent.click(await screen.findByTestId('start-editing', {}, W)); });
    await waitFor(() => expect(screen.getByTestId('wdm-header-status')).not.toBeDisabled(), W);
    await act(async () => { fireEvent.change(screen.getByTestId('wdm-header-status'), { target: { value: 'oil' } }); });
    await waitFor(() => expect(akoma(mockBackend)).toMatchObject({ status: 'oil', updated_by: ME, user_id: OWNER }), W);
    // the owner takes over: this user is read-only again and sees who is editing
    await owner.take('geo_wells', w.id, { takeOver: true });
    await act(async () => { fireEvent.click(screen.getByTestId('history-button')); });
    const rows = await screen.findAllByTestId('history-row', {}, W);
    expect(rows.map((r) => r.textContent).join(' | ')).toMatch(/Ama Other.*Took over editing \(owner\)/);
    expect(rows.map((r) => r.textContent).join(' | ')).toMatch(/You.*Status changed: status/);
  });

  test('before the migration: the note, and the organisation well is read-only as before', async () => {
    mockBackend = makeInMemoryBackend({ sharing: { applied: false } });
    await mount();
    await openWell('AKOMA-2');
    await waitFor(() => expect(screen.getByTestId('wdm-header-status')).toBeDisabled(), W);
    expect(screen.queryByTestId('share-switch')).toBeNull();
    expect(screen.queryByTestId('start-editing')).toBeNull();
  });
});
