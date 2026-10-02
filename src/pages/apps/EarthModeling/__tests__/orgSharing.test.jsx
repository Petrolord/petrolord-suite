/**
 * Earth Modeling U2-014: organisation sharing of saved models (em_models).
 * The app runs on the in-memory mirror of the sharing migration
 * (20261002100000_suite_record_sharing.sql), so two users meet the same
 * refusals the database gives. Shared rules and store: src/lib/recordSharing.
 * Negative control on origin/main be1fb3ef4: models were owner-only (no
 * switch, no shared list, no read-only state, no version check).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import EarthWorkstation from '../components/EarthWorkstation';
import { HARNESS_COLLEAGUE, HARNESS_ME } from '@/lib/recordSharing';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const mount = async (backend) => {
  let view;
  await act(async () => { view = render(<MemoryRouter><EarthWorkstation backend={backend} /></MemoryRouter>); });
  await screen.findByTestId('em-save-model');
  return view;
};
const rows = (backend) => backend._sharing.db._rows('em_models');
const loadRow = async (name) => {
  const row = (await screen.findAllByTestId('em-model-row')).find((el) => el.textContent.includes(name));
  await act(async () => { fireEvent.click(within(row).getByText('load')); });
};

describe('owner', () => {
  test('saves a model, shares it with the organisation, and the row says so', async () => {
    const backend = makeInMemoryBackend();
    await mount(backend);
    expect(screen.queryByTestId('record-sharing-bar')).toBeNull();   // nothing to share before the first save
    await act(async () => { fireEvent.click(screen.getByTestId('em-save-model')); });
    await screen.findByTestId('share-switch');
    expect(rows(backend)[0]).toMatchObject({ user_id: HARNESS_ME, visibility: 'private', version: 1 });
    await act(async () => { fireEvent.click(screen.getByTestId('share-switch')); });
    await waitFor(() => expect(rows(backend)[0]).toMatchObject({ visibility: 'organization', org_access: 'view' }));
    await waitFor(() => expect(screen.getByTestId('shared-row-note')).toHaveTextContent('Shared: colleagues can view'));
    // an owner save still works on a view-shared model and is logged
    await act(async () => { fireEvent.click(screen.getByTestId('em-save-model')); });
    await waitFor(() => expect(screen.getByTestId('em-status')).toHaveTextContent(/Saved model .* \(updated\)/));
  });

  test('a save made from an older version is refused with who and when (two tabs)', async () => {
    const backend = makeInMemoryBackend({ savedModels: true });
    await mount(backend);
    const name = rows(backend)[0].name;
    await loadRow(name);
    // the same user saves from another tab
    const id = rows(backend).find((r) => r.name === name).id;
    backend._sharing.db.update('em_models', HARNESS_ME, id, { definition: { name, changedElsewhere: true } });
    await act(async () => { fireEvent.click(screen.getByTestId('em-save-model')); });
    await waitFor(() => expect(screen.getByTestId('em-status')).toHaveTextContent(/^You saved a newer version at .*\. Reload, or save yours as a copy\.$/));
    expect(rows(backend).find((r) => r.id === id).definition.changedElsewhere).toBe(true);   // not overwritten
  });
});

describe('colleague', () => {
  test('shared models are listed apart; a view-only model opens read-only and saves as the user\'s own copy', async () => {
    const backend = makeInMemoryBackend({ savedModels: true, sharedModels: true });
    await mount(backend);
    expect(await screen.findByTestId('em-shared-models')).toHaveTextContent('Shared with me');
    await loadRow('Regional framework (Ada)');
    await waitFor(() => expect(screen.getByTestId('shared-by')).toHaveTextContent('Shared by Ada Colleague'));
    expect(screen.queryByTestId('share-switch')).toBeNull();
    const before = rows(backend).find((r) => r.name === 'Regional framework (Ada)');
    await act(async () => { fireEvent.click(screen.getByTestId('em-save-model')); });
    await waitFor(() => expect(screen.getByTestId('em-status')).toHaveTextContent('Shared by Ada Colleague for viewing. Save a copy to work on your own version. "Save as a new model" keeps your changes as your own copy.'));
    expect(rows(backend).find((r) => r.id === before.id)).toEqual(before);
    await act(async () => { fireEvent.click(screen.getByTestId('save-copy')); });
    await waitFor(() => expect(screen.getByTestId('em-status')).toHaveTextContent('Saved your own copy as "Regional framework (Ada) (copy)".'));
    const copy = rows(backend).find((r) => r.name === 'Regional framework (Ada) (copy)');
    expect(copy).toMatchObject({ user_id: HARNESS_ME, visibility: 'private' });
    await screen.findByTestId('share-switch');   // the copy is the user's own
  });

  test('an edit model: start editing, save (stamped with the editor), and the owner sees who', async () => {
    const backend = makeInMemoryBackend({ sharedModels: true });
    await mount(backend);
    await loadRow('Field model, team copy');
    const id = rows(backend).find((r) => r.name === 'Field model, team copy').id;
    await act(async () => { fireEvent.click(screen.getByTestId('em-save-model')); });
    await waitFor(() => expect(screen.getByTestId('em-status')).toHaveTextContent(/^Start editing first/));
    await act(async () => { fireEvent.click(await screen.findByTestId('start-editing')); });
    await waitFor(() => expect(rows(backend).find((r) => r.id === id).editing_by).toBe(HARNESS_ME));
    await act(async () => { fireEvent.click(screen.getByTestId('em-save-model')); });
    await waitFor(() => expect(rows(backend).find((r) => r.id === id)).toMatchObject({ updated_by: HARNESS_ME, version: 2, user_id: HARNESS_COLLEAGUE }));
    const log = backend._sharing.db.listChanges('em_models', HARNESS_COLLEAGUE, id).data;
    expect(log[0]).toMatchObject({ action: 'updated', changed_by: HARNESS_ME, summary: 'Model definition saved' });
  });

  test('a model the colleague is editing stays read-only with their name', async () => {
    const backend = makeInMemoryBackend({ sharedModels: true });
    const id = rows(backend).find((r) => r.name === 'Field model, team copy').id;
    backend._sharing.db.rpc('suite_record_take', HARNESS_COLLEAGUE, { p_table: 'em_models', p_id: id });
    await mount(backend);
    await loadRow('Field model, team copy');
    await waitFor(() => expect(screen.getByTestId('sharing-banner')).toHaveTextContent(/^Being edited by Ada Colleague since /));
    expect(screen.queryByTestId('start-editing')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId('em-save-model')); });
    await waitFor(() => expect(screen.getByTestId('em-status')).toHaveTextContent(/^Being edited by Ada Colleague since /));
    expect(rows(backend).find((r) => r.id === id).version).toBe(1);
  });
});

describe('before the migration is applied', () => {
  test('the control is a note, nothing is shared, and saving works as before', async () => {
    const backend = makeInMemoryBackend({ sharing: { applied: false } });
    await mount(backend);
    await act(async () => { fireEvent.click(screen.getByTestId('em-save-model')); });
    await waitFor(() => expect(screen.getByTestId('sharing-unavailable')).toHaveTextContent('Sharing with your organisation is not switched on for this database yet.'));
    expect(screen.queryByTestId('share-switch')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId('em-save-model')); });
    await waitFor(() => expect(screen.getByTestId('em-status')).toHaveTextContent(/Saved model .* \(updated\)/));
    expect(rows(backend)).toHaveLength(1);
    expect(rows(backend)[0].version).toBeUndefined();
  });
});
