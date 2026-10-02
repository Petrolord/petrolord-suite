/**
 * Organisation sharing: the rules, the store and the shared control, on the
 * in-memory database that mirrors the migrations
 * (20261002100000_suite_record_sharing.sql, 20261002110000_geo_wells_team_editing.sql).
 * The SQL itself is proved by tools/validation/org-sharing (495 checks on a
 * scratch Postgres and, rolled back, on the live database).
 * Negative control on origin/main be1fb3ef4: none of this existed (every
 * record owner-only, no version check, no author stamp, no log).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { makeSharingDb, makeSharingStore, memoryTransport, accessOf, copyName, splitOwnAndShared, describeChange, sharingOf } from '../index';
import { useRecordSharing } from '../useRecordSharing';
import RecordSharingBar from '@/components/recordSharing/RecordSharingBar';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) } } }));

const MEMBERS = {
  'u-owner': { orgId: 'org-1', name: 'Olu Owner' },
  'u-col': { orgId: 'org-1', name: 'Chidi Colleague' },
  'u-third': { orgId: 'org-1', name: 'Tari Third' },
  'u-other': { orgId: 'org-2', name: 'Other Org' },
  'u-solo': { orgId: null, name: 'Solo' },
};
const T = 'em_models';

function world({ applied = true } = {}) {
  const db = makeSharingDb({ members: MEMBERS, applied });
  const store = (uid) => makeSharingStore(memoryTransport(db, uid));
  return { db, store };
}
const make = (db, uid = 'u-owner', extra = {}) => db.insert(T, uid, { user_id: uid, name: 'Model A', definition: { n: 1 }, ...extra }).data;

describe('the in-memory database mirrors the policies and the guard', () => {
  test('insert: stamps come from the server; a forged author, version and check-out are ignored', () => {
    const { db } = world();
    const r = db.insert(T, 'u-owner', { user_id: 'u-owner', name: 'M', updated_by: 'u-other', version: 9, editing_by: 'u-other', editing_expires: '2099-01-01' }).data;
    expect(r).toMatchObject({ visibility: 'private', org_access: 'view', version: 1, updated_by: 'u-owner', editing_by: null });
    expect(db.insert(T, 'u-owner', { user_id: 'u-col', name: 'M' }).error.code).toBe('42501');
    expect(db.insert(T, 'u-owner', { user_id: 'u-owner', name: 'M', visibility: 'organization', organization_id: 'org-2' }).error.code).toBe('42501');
    expect(db.insert(T, null, { user_id: 'u-owner', name: 'M' }).error.code).toBe('42501');
  });

  test('a private record is the owner\'s alone; anon reads nothing', () => {
    const { db } = world();
    const r = make(db);
    expect(db.select(T, 'u-owner').data).toHaveLength(1);
    expect(db.select(T, 'u-col').data).toHaveLength(0);
    expect(db.select(T, 'u-other').data).toHaveLength(0);
    expect(db.select(T, null).error.code).toBe('42501');
    expect(db.update(T, 'u-col', r.id, { name: 'hacked' }).data).toEqual([]);
    expect(db.remove(T, 'u-col', r.id).data).toEqual([]);
    expect(db.rpc('suite_record_take', 'u-col', { p_table: T, p_id: r.id }).data.reason).toBe('not_found');
  });

  test('nobody shares into an organisation they do not belong to', () => {
    const { db } = world();
    const r = make(db);
    expect(db.update(T, 'u-owner', r.id, { visibility: 'organization', organization_id: 'org-2' }).error.code).toBe('42501');
    expect(db.update(T, 'u-other', r.id, { visibility: 'organization', organization_id: 'org-2' }).data).toEqual([]);
    expect(db._rows(T)[0]).toMatchObject({ visibility: 'private', organization_id: null });
  });

  test('shared for viewing: a colleague reads, cannot write, cannot take; another organisation and anon read nothing', () => {
    const { db } = world();
    const r = make(db);
    db.update(T, 'u-owner', r.id, { visibility: 'organization', organization_id: 'org-1' });
    expect(db.select(T, 'u-col').data).toHaveLength(1);
    expect(db.select(T, 'u-other').data).toHaveLength(0);
    expect(db.select(T, null).error.code).toBe('42501');
    expect(db.update(T, 'u-col', r.id, { name: 'hacked' }).data).toEqual([]);
    expect(db.rpc('suite_record_take', 'u-col', { p_table: T, p_id: r.id }).data).toMatchObject({ ok: false, reason: 'view_only' });
    expect(db.remove(T, 'u-col', r.id).data).toEqual([]);
    expect(db.listChanges(T, 'u-col', r.id).data.map((c) => c.action)).toEqual(['shared', 'created']);
    expect(db.listChanges(T, 'u-other', r.id).data).toEqual([]);
  });

  test('shared for editing: one editor at a time, the check-out is taken and refused', () => {
    const { db } = world();
    const r = make(db);
    db.update(T, 'u-owner', r.id, { visibility: 'organization', organization_id: 'org-1', org_access: 'edit' });
    expect(db.update(T, 'u-col', r.id, { name: 'no check-out' }).data).toEqual([]);
    // a client update cannot set the check-out columns
    db.update(T, 'u-owner', r.id, { editing_by: 'u-col', editing_expires: '2099-01-01T00:00:00Z' });
    expect(db._rows(T)[0].editing_by).toBeNull();
    expect(db.rpc('suite_record_take', 'u-other', { p_table: T, p_id: r.id }).data.reason).toBe('not_found');
    expect(db.rpc('suite_record_take', 'u-col', { p_table: T, p_id: r.id }).data.ok).toBe(true);
    expect(db.rpc('suite_record_take', 'u-third', { p_table: T, p_id: r.id }).data).toMatchObject({ ok: false, reason: 'locked', editing_by: 'u-col' });
    expect(db.rpc('suite_record_take', 'u-owner', { p_table: T, p_id: r.id }).data.reason).toBe('locked');
    expect(db.update(T, 'u-third', r.id, { name: 'third' }).data).toEqual([]);
    expect(db.update(T, 'u-owner', r.id, { name: 'owner overwrite' }).error.code).toBe('SR002');
    // the colleague saves: stamped with the colleague whatever the payload says
    const saved = db.update(T, 'u-col', r.id, { name: 'by colleague', version: 1, updated_by: 'u-other', user_id: 'u-col', change_note: 'Renamed' }).data[0];
    expect(saved).toMatchObject({ name: 'by colleague', version: 2, updated_by: 'u-col', user_id: 'u-owner', change_note: null });
    // only the owner changes the sharing
    expect(db.update(T, 'u-col', r.id, { visibility: 'private' }).error.code).toBe('SR003');
    expect(db.update(T, 'u-col', r.id, { org_access: 'view' }).error.code).toBe('SR003');
    expect(db.update(T, 'u-col', r.id, { organization_id: 'org-2' }).error.code).toBe('SR003');
  });

  test('no silent overwrite: a save from a stale version is refused, also in the owner\'s second tab', () => {
    const { db } = world();
    const r = make(db);
    expect(db.update(T, 'u-owner', r.id, { name: 'tab one', version: 1 }).data[0].version).toBe(2);
    const stale = db.update(T, 'u-owner', r.id, { name: 'tab two', version: 1 });
    expect(stale.error.code).toBe('SR001');
    expect(JSON.parse(stale.error.details)).toMatchObject({ version: 2, updated_by: 'u-owner' });
    expect(db._rows(T)[0].name).toBe('tab one');
    // a build from before the migration sends no version and still saves
    expect(db.update(T, 'u-owner', r.id, { name: 'old build' }).data[0].version).toBe(3);
  });

  test('sharing and check-out changes are not new versions; an empty save is not one either', () => {
    const { db } = world();
    const r = make(db);
    db.update(T, 'u-owner', r.id, { visibility: 'organization', organization_id: 'org-1', org_access: 'edit' });
    db.rpc('suite_record_take', 'u-col', { p_table: T, p_id: r.id });
    db.update(T, 'u-col', r.id, { name: 'Model A' });
    expect(db._rows(T)[0]).toMatchObject({ version: 1, updated_by: 'u-owner' });
  });

  test('expiry: after 30 minutes without a save the check-out lapses; a save renews it', () => {
    const { db } = world();
    const r = make(db);
    db.update(T, 'u-owner', r.id, { visibility: 'organization', organization_id: 'org-1', org_access: 'edit' });
    db.rpc('suite_record_take', 'u-col', { p_table: T, p_id: r.id });
    db.advance(20 * 60000);
    expect(db.update(T, 'u-col', r.id, { name: 'at 20 min' }).data).toHaveLength(1);   // renews to 50 min
    db.advance(25 * 60000);
    expect(db.update(T, 'u-col', r.id, { name: 'at 45 min' }).data).toHaveLength(1);
    db.advance(31 * 60000);
    expect(db.update(T, 'u-col', r.id, { name: 'late' }).data).toEqual([]);
    expect(db.rpc('suite_record_renew', 'u-col', { p_table: T, p_id: r.id }).data).toMatchObject({ ok: false, reason: 'not_holder' });
    expect(db.update(T, 'u-owner', r.id, { name: 'owner after expiry' }).data).toHaveLength(1);
    expect(db.rpc('suite_record_take', 'u-third', { p_table: T, p_id: r.id }).data.ok).toBe(true);
  });

  test('the owner takes over and releases; both are logged with the owner', () => {
    const { db } = world();
    const r = make(db);
    db.update(T, 'u-owner', r.id, { visibility: 'organization', organization_id: 'org-1', org_access: 'edit' });
    db.rpc('suite_record_take', 'u-col', { p_table: T, p_id: r.id });
    expect(db.rpc('suite_record_take', 'u-third', { p_table: T, p_id: r.id, p_take_over: true }).data.reason).toBe('locked');
    expect(db.rpc('suite_record_take', 'u-owner', { p_table: T, p_id: r.id, p_take_over: true }).data.ok).toBe(true);
    expect(db.update(T, 'u-col', r.id, { name: 'late' }).data).toEqual([]);
    expect(db.rpc('suite_record_release', 'u-col', { p_table: T, p_id: r.id }).data.reason).toBe('not_holder');
    expect(db.rpc('suite_record_release', 'u-owner', { p_table: T, p_id: r.id }).data.ok).toBe(true);
    db.rpc('suite_record_take', 'u-col', { p_table: T, p_id: r.id });
    expect(db.rpc('suite_record_release', 'u-owner', { p_table: T, p_id: r.id }).data.ok).toBe(true);
    const log = db._changes().map((c) => `${c.action}:${c.changed_by}`);
    expect(log).toEqual(['created:u-owner', 'shared:u-owner', 'checked_out:u-col', 'taken_over:u-owner', 'released:u-owner', 'checked_out:u-col', 'released:u-owner']);
    expect(db._changes().at(-1).summary).toBe('Editing ended by the owner');
  });

  test('history: the right author, field names, the app\'s summary; saves within ten minutes fold; nobody else reads it', () => {
    const { db } = world();
    const r = make(db);
    db.update(T, 'u-owner', r.id, { visibility: 'organization', organization_id: 'org-1', org_access: 'edit' });
    db.rpc('suite_record_take', 'u-col', { p_table: T, p_id: r.id });
    db.update(T, 'u-col', r.id, { definition: { n: 2 }, change_note: 'Contacts edited', app_build: 'abc' });
    db.update(T, 'u-col', r.id, { name: 'Model B' });
    const top = db.listChanges(T, 'u-owner', r.id).data[0];
    expect(top).toMatchObject({ action: 'updated', changed_by: 'u-col', summary: 'Contacts edited', changed_fields: ['definition', 'name'], change_count: 2 });
    db.advance(11 * 60000);
    db.update(T, 'u-col', r.id, { name: 'Model C' });   // check-out lapsed? no: saves renewed it
    expect(db.listChanges(T, 'u-owner', r.id).data[0]).toMatchObject({ changed_fields: ['name'], change_count: 1 });
    // turning sharing off ends the colleague's check-out and their reading of the log
    db.update(T, 'u-owner', r.id, { visibility: 'private' });
    expect(db._rows(T)[0].editing_by).toBeNull();
    expect(db.listChanges(T, 'u-col', r.id).data).toEqual([]);
    db.remove(T, 'u-owner', r.id);
    expect(db.listChanges(T, 'u-owner', r.id).data[0].action).toBe('deleted');
  });

  test('geo_wells: shared when organization_id is set; children follow the well\'s check-out', () => {
    const { db } = world();
    const w = db.insert('geo_wells', 'u-owner', { user_id: 'u-owner', name: 'W-1' }).data;
    expect(db.canWriteChild('u-owner', w.id)).toBe(true);
    expect(db.canWriteChild('u-col', w.id)).toBe(false);
    db.update('geo_wells', 'u-owner', w.id, { organization_id: 'org-1' });
    expect(db.select('geo_wells', 'u-col').data).toHaveLength(1);
    expect(db.canWriteChild('u-col', w.id)).toBe(false);
    db.update('geo_wells', 'u-owner', w.id, { org_access: 'edit' });
    expect(db.canWriteChild('u-col', w.id)).toBe(false);          // no check-out yet
    expect(db.canWriteChild('u-owner', w.id)).toBe(true);         // nobody is editing
    db.rpc('suite_record_take', 'u-col', { p_table: 'geo_wells', p_id: w.id });
    expect(db.canWriteChild('u-col', w.id)).toBe(true);
    expect(db.canWriteChild('u-owner', w.id)).toBe(false);        // the colleague is editing
    expect(db.canWriteChild('u-other', w.id)).toBe(false);
    db.logChild('u-col', w.id, 'tops', 'added', 3);
    expect(db.listChanges('geo_wells', 'u-owner', w.id).data[0]).toMatchObject({ changed_by: 'u-col', summary: 'Tops: 3 added', changed_fields: ['tops'] });
    expect(db.update('geo_wells', 'u-col', w.id, { organization_id: null }).error.code).toBe('SR003');
    db.rpc('suite_record_take', 'u-owner', { p_table: 'geo_wells', p_id: w.id, p_take_over: true });
    expect(db.canWriteChild('u-col', w.id)).toBe(false);
    expect(db.canWriteChild('u-owner', w.id)).toBe(true);
  });
});

describe('the store: sentences for refusals, version tracking, the before-migration fallback', () => {
  async function sharedEdit() {
    const w = world();
    const r = make(w.db);
    const owner = w.store('u-owner'); const col = w.store('u-col');
    await owner.setSharing(T, r.id, { shared: true, access: 'edit' });
    return { ...w, r, owner, col };
  }

  test('a stale save names who saved and when, and offers the copy', async () => {
    const { db, r, owner } = await sharedEdit();
    const tabOne = owner; const tabTwo = makeSharingStore(memoryTransport(db, 'u-owner'));
    tabOne.trackOpened(T, db._rows(T)[0]); tabTwo.trackOpened(T, db._rows(T)[0]);
    expect((await tabOne.update(T, r.id, { name: 'one' })).error).toBeNull();
    const res = await tabTwo.update(T, r.id, { name: 'two' });
    expect(res.error).toMatchObject({ name: 'RecordConflict', kind: 'stale' });
    expect(res.error.message).toMatch(/^Olu Owner saved a newer version at .*\. Reload, or save yours as a copy\.$/);
    // the first tab keeps saving: its version moved with its own save
    expect((await tabOne.update(T, r.id, { name: 'one again' })).data.version).toBe(3);
  });

  test('a colleague: view only, no check-out, locked and gone each get their sentence', async () => {
    const { db, r, owner, col } = await sharedEdit();
    col.trackOpened(T, db._rows(T)[0]);
    expect((await col.update(T, r.id, { name: 'x' })).error).toMatchObject({ kind: 'no_checkout' });
    expect((await makeSharingStore(memoryTransport(db, 'u-third')).take(T, r.id)).ok).toBe(true);
    const locked = await col.update(T, r.id, { name: 'x' });
    expect(locked.error).toMatchObject({ kind: 'locked' });
    expect(locked.error.message).toMatch(/^Being edited by Tari Third since /);
    const refused = await col.take(T, r.id);
    expect(refused).toMatchObject({ ok: false, reason: 'locked' });
    expect(refused.message).toMatch(/Being edited by Tari Third/);
    await owner.setSharing(T, r.id, { shared: true, access: 'view' });
    expect((await col.update(T, r.id, { name: 'x' })).error).toMatchObject({ kind: 'view_only', message: 'Shared by Olu Owner for viewing. Save a copy to work on your own version.' });
    await owner.setSharing(T, r.id, { shared: false });
    expect((await col.update(T, r.id, { name: 'x' })).error).toMatchObject({ kind: 'gone' });
    expect((await col.take(T, r.id)).reason).toBe('not_found');
  });

  test('taking a record whose content moved on says so, so the editor reloads first', async () => {
    const { db, r, owner, col } = await sharedEdit();
    col.trackOpened(T, db._rows(T)[0]);
    await owner.update(T, r.id, { name: 'owner moved on' });
    expect(await col.take(T, r.id)).toMatchObject({ ok: true, stale: true });
    expect((await col.update(T, r.id, { name: 'from the old copy' })).error.kind).toBe('stale');
    col.trackOpened(T, db._rows(T)[0]);
    expect((await col.update(T, r.id, { name: 'after reload', updated_by: 'u-other' }, { note: 'Renamed' })).data).toMatchObject({ updated_by: 'u-col', version: 3 });
    const h = await owner.history(T, r.id);
    expect(h[0]).toMatchObject({ action: 'updated', changed_by_name: 'Chidi Colleague', summary: 'Renamed' });
  });

  test('names stay inside the organisation: another organisation sees "A colleague", never an email', async () => {
    const { store } = world();
    expect(await store('u-col').names(['u-owner', 'u-other'])).toEqual({ 'u-owner': 'Olu Owner', 'u-other': 'A colleague' });
  });

  test('a user with no organisation cannot share, and is told why', async () => {
    const { db, store } = world();
    const r = make(db, 'u-solo');
    await expect(store('u-solo').setSharing(T, r.id, { shared: true })).rejects.toThrow('You are not in an organisation, so there is nobody to share with.');
  });

  test('before the migration: saves are the plain update, nothing new is sent, sharing says it is not available', async () => {
    const { db, store } = world({ applied: false });
    const r = db.insert(T, 'u-owner', { user_id: 'u-owner', name: 'M' }).data;
    expect(r.version).toBeUndefined();
    const s = store('u-owner');
    expect(await s.capability(T)).toEqual({ available: false });
    s.trackOpened(T, { ...r, version: 4 });
    const res = await s.update(T, r.id, { name: 'saved before apply' }, { note: 'ignored' });
    expect(res).toMatchObject({ error: null, data: { name: 'saved before apply' } });
    expect(res.data.version).toBeUndefined();
    await expect(s.setSharing(T, r.id, { shared: true })).rejects.toThrow(/not switched on for this database yet/);
    expect(await s.take(T, r.id)).toMatchObject({ ok: false, reason: 'not_available' });
    expect(await s.history(T, r.id)).toEqual([]);
    expect(accessOf(T, r, { userId: 'u-owner', available: false })).toMatchObject({ canWrite: true, shared: false });
    // and the database flips to applied without a reload of the page logic
    db.setApplied(true);
  });

  test('helpers: copy names, own and shared lists, plain words for a change', () => {
    expect(copyName('Model A', ['model a (copy)'])).toBe('Model A (copy 2)');
    expect(copyName('Model A (copy)', [])).toBe('Model A (copy)');
    expect(splitOwnAndShared([{ id: 1, user_id: 'a' }, { id: 2, user_id: 'b' }, { id: 3 }], 'a')).toEqual({ own: [{ id: 1, user_id: 'a' }, { id: 3 }], shared: [{ id: 2, user_id: 'b' }] });
    expect(describeChange({ action: 'updated', changed_fields: ['track_layout', 'name'], change_count: 3 }, { track_layout: 'tracks' })).toBe('Changed tracks, name (3 saves)');
    expect(describeChange({ action: 'taken_over' })).toBe('Took over editing (owner)');
    expect(sharingOf({ id: 'x', user_id: 'u', name: 'n', version: 2 })).toMatchObject({ id: 'x', user_id: 'u', version: 2, visibility: null });
  });
});

describe('the shared control', () => {
  function Harness({ store, table = T, row, onSaveCopy }) {
    const s = useRecordSharing({ store, table, record: row });
    return (<div><RecordSharingBar sharing={s} label="model" onSaveCopy={onSaveCopy} /><span data-testid="can-write">{String(s.canWrite)}</span></div>);
  }
  const mount = async (store, row, extra = {}) => {
    let view;
    await act(async () => { view = render(<Harness store={store} row={row} {...extra} />); });
    await screen.findByTestId('record-sharing-bar');
    return view;
  };

  test('owner: the switch shares with the organisation, then chooses view or edit; editing is taken for the owner', async () => {
    const { db, store } = world();
    const r = make(db);
    await mount(store('u-owner'), db._rows(T)[0]);
    expect(screen.getByTestId('share-switch')).toHaveAttribute('aria-checked', 'false');
    await act(async () => { fireEvent.click(screen.getByTestId('share-switch')); });
    await waitFor(() => expect(db._rows(T)[0]).toMatchObject({ visibility: 'organization', organization_id: 'org-1', org_access: 'view' }));
    await act(async () => { fireEvent.change(screen.getByTestId('share-access'), { target: { value: 'edit' } }); });
    await waitFor(() => expect(db._rows(T)[0]).toMatchObject({ org_access: 'edit', editing_by: 'u-owner' }));
    expect(screen.getByTestId('sharing-banner')).toHaveTextContent('You are editing this model. Colleagues see it read-only until you finish.');
    expect(screen.getByTestId('can-write')).toHaveTextContent('true');
    await act(async () => { fireEvent.click(screen.getByTestId('done-editing')); });
    await waitFor(() => expect(db._rows(T)[0].editing_by).toBeNull());
    expect(screen.getByTestId('can-write')).toHaveTextContent('false');
    expect(screen.getByTestId('start-editing')).toBeInTheDocument();
    expect(r.id).toBeTruthy();
  });

  test('colleague on a view-only record: "Shared by", read-only, Save a copy, no switch', async () => {
    const { db, store } = world();
    const r = make(db);
    db.update(T, 'u-owner', r.id, { visibility: 'organization', organization_id: 'org-1' });
    const onSaveCopy = jest.fn();
    await mount(store('u-col'), db._rows(T)[0], { onSaveCopy });
    await waitFor(() => expect(screen.getByTestId('shared-by')).toHaveTextContent('Shared by Olu Owner'));
    expect(screen.queryByTestId('share-switch')).toBeNull();
    expect(screen.queryByTestId('start-editing')).toBeNull();
    expect(screen.getByTestId('sharing-banner')).toHaveTextContent('Shared by Olu Owner for viewing.');
    expect(screen.getByTestId('can-write')).toHaveTextContent('false');
    fireEvent.click(screen.getByTestId('save-copy'));
    expect(onSaveCopy).toHaveBeenCalled();
  });

  test('colleague on an edit record: starts editing; a third user sees who is editing; the owner can take over', async () => {
    const { db, store } = world();
    const r = make(db);
    db.update(T, 'u-owner', r.id, { visibility: 'organization', organization_id: 'org-1', org_access: 'edit' });
    const first = await mount(store('u-col'), db._rows(T)[0]);
    expect(screen.getByTestId('can-write')).toHaveTextContent('false');
    await act(async () => { fireEvent.click(screen.getByTestId('start-editing')); });
    await waitFor(() => expect(screen.getByTestId('can-write')).toHaveTextContent('true'));
    expect(db._rows(T)[0].editing_by).toBe('u-col');
    first.unmount();   // closing releases
    await waitFor(() => expect(db._rows(T)[0].editing_by).toBeNull());

    db.rpc('suite_record_take', 'u-col', { p_table: T, p_id: r.id });
    const third = await mount(store('u-third'), db._rows(T)[0]);
    await waitFor(() => expect(screen.getByTestId('sharing-banner')).toHaveTextContent(/^Being edited by Chidi Colleague since /));
    expect(screen.queryByTestId('start-editing')).toBeNull();
    expect(screen.queryByTestId('take-over')).toBeNull();
    third.unmount();

    await mount(store('u-owner'), db._rows(T)[0]);
    await act(async () => { fireEvent.click(screen.getByTestId('take-over')); });
    await waitFor(() => expect(db._rows(T)[0].editing_by).toBe('u-owner'));
    expect(db._changes().some((c) => c.action === 'taken_over' && c.changed_by === 'u-owner')).toBe(true);
  });

  test('history panel: who, when, what', async () => {
    const { db, store } = world();
    const r = make(db);
    db.update(T, 'u-owner', r.id, { visibility: 'organization', organization_id: 'org-1', org_access: 'edit' });
    db.rpc('suite_record_take', 'u-col', { p_table: T, p_id: r.id });
    db.update(T, 'u-col', r.id, { definition: { n: 5 }, change_note: 'Contacts edited' });
    await mount(store('u-owner'), db._rows(T)[0]);
    await act(async () => { fireEvent.click(screen.getByTestId('history-button')); });
    const rows = await screen.findAllByTestId('history-row');
    expect(rows[0]).toHaveTextContent('Chidi Colleague');
    expect(rows[0]).toHaveTextContent('Contacts edited: definition');
    expect(rows.at(-1)).toHaveTextContent('You');
    expect(rows.at(-1)).toHaveTextContent('Created');
    await waitFor(() => expect(screen.getByTestId('last-saved-by')).toHaveTextContent(/^Last saved by Chidi Colleague at /));
  });

  test('no organisation: the switch is disabled with the reason', async () => {
    const { db, store } = world();
    make(db, 'u-solo');
    await mount(store('u-solo'), db._rows(T)[0]);
    expect(screen.getByTestId('share-switch')).toBeDisabled();
    expect(screen.getByTestId('share-no-org')).toHaveTextContent('You are not in an organisation, so there is nobody to share with.');
  });

  test('before the migration: the control is hidden behind an honest note and the record stays writable', async () => {
    const { db, store } = world({ applied: false });
    db.insert(T, 'u-owner', { user_id: 'u-owner', name: 'M' });
    await mount(store('u-owner'), db._rows(T)[0]);
    expect(screen.getByTestId('sharing-unavailable')).toHaveTextContent('Sharing with your organisation is not switched on for this database yet. Records stay private until it is.');
    expect(screen.queryByTestId('share-switch')).toBeNull();
    expect(screen.getByTestId('can-write')).toHaveTextContent('true');
  });
});
