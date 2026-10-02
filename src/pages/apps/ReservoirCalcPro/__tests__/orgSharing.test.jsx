/**
 * ReservoirCalc Pro U2-014: organisation sharing of projects
 * (saved_quickvol_projects) and prospects (rcp_prospects). The app runs on
 * the in-memory mirror of the sharing migration
 * (20261002100000_suite_record_sharing.sql); shared rules and store:
 * src/lib/recordSharing. The header strip is walked in the browser by
 * e2e/org-sharing.spec.js.
 * Negative control on origin/main be1fb3ef4: projects and prospects were
 * owner-only (no shared list, no read-only state, no version check).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act, renderHook, within } from '@testing-library/react';
import { ReservoirCalcProvider, useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { makeInMemoryRcpBackend } from '../services/rcpBackend';
import { makeInMemoryProspectsBackend } from '../services/prospectsService';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import ProjectManager from '../components/tools/ProjectManager';
import ProspectRiskingPanel from '../components/tools/ProspectRiskingPanel';
import { HARNESS_ME, HARNESS_COLLEAGUE, makeHarnessSharing } from '@/lib/recordSharing';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) } } }));
jest.mock('@/components/ui/use-toast', () => { const toast = jest.fn(); return { useToast: () => ({ toast }), toast }; });

const T = 'saved_quickvol_projects';
const ctx = (backend) => renderHook(() => useReservoirCalc(), { wrapper: ({ children }) => <ReservoirCalcProvider backend={backend}>{children}</ReservoirCalcProvider> });
const rows = (backend) => backend._sharing.db._rows(T);
// a rejection inside act() leaves React's queue unflushed for the rest of the
// file, so the error is caught inside and returned
const attempt = async (fn) => { let error = null; await act(async () => { try { await fn(); } catch (e) { error = e; } }); return error; };

describe('projects', () => {
  test('the list carries the owner and the sharing state; the user\'s save is theirs and private', async () => {
    const backend = makeInMemoryRcpBackend({ sharedRows: true });
    const { result } = ctx(backend);
    await act(async () => { await result.current.saveCurrentProject(HARNESS_ME, { name: 'Mine' }); });
    const list = result.current.state.projects;
    expect(list.map((p) => [p.name, p.user_id])).toEqual(expect.arrayContaining([['Mine', HARNESS_ME], ['Keta North (Ada)', HARNESS_COLLEAGUE]]));
    expect(list.find((p) => p.name === 'Mine').sharing).toMatchObject({ visibility: 'private', version: 1 });
  });

  test('a project shared for viewing is never overwritten; "Save a copy" makes it the user\'s own', async () => {
    const backend = makeInMemoryRcpBackend({ sharedRows: true });
    const { result } = ctx(backend);
    await act(async () => { await result.current.loadProjects(); });
    const shared = result.current.state.projects.find((p) => p.id === 'proj-shared-view');
    await act(async () => { result.current.loadProject(shared); });
    const before = rows(backend).find((r) => r.id === 'proj-shared-view');
    expect((await attempt(() => result.current.saveCurrentProject(HARNESS_ME, { name: 'hacked' }))).message)
      .toBe('Shared by Ada Colleague for viewing. Save a copy to work on your own version.');
    expect(rows(backend).find((r) => r.id === 'proj-shared-view')).toEqual(before);
    let copy;
    await act(async () => { copy = await result.current.saveCurrentProject(HARNESS_ME, { name: 'Keta North (copy)' }, { asNew: true }); });
    expect(copy).toMatchObject({ name: 'Keta North (copy)', user_id: HARNESS_ME });
    expect(result.current.state.project.id).toBe(copy.id);
    await act(async () => { await result.current.saveCurrentProject(HARNESS_ME, { name: 'Keta North (copy)' }); });   // and it saves from now on
    expect(rows(backend).find((r) => r.id === copy.id).version).toBe(2);
  });

  test('a project colleagues can edit: refused without the check-out, saved with it, stamped with the editor', async () => {
    const backend = makeInMemoryRcpBackend({ sharedRows: true });
    const { result } = ctx(backend);
    await act(async () => { await result.current.loadProjects(); });
    await act(async () => { result.current.loadProject(result.current.state.projects.find((p) => p.id === 'proj-shared-edit')); });
    expect((await attempt(() => result.current.saveCurrentProject(HARNESS_ME))).message).toMatch(/^Start editing first/);
    expect((await backend.sharing.take(T, 'proj-shared-edit')).ok).toBe(true);
    await act(async () => { await result.current.saveCurrentProject(HARNESS_ME); });
    expect(rows(backend).find((r) => r.id === 'proj-shared-edit')).toMatchObject({ updated_by: HARNESS_ME, user_id: HARNESS_COLLEAGUE, version: 2 });
    const log = backend._sharing.db.listChanges(T, HARNESS_COLLEAGUE, 'proj-shared-edit').data;
    expect(log[0]).toMatchObject({ action: 'updated', changed_by: HARNESS_ME, summary: 'Project saved (v2)' });
    // the colleague takes it back: the next save is refused with their name
    await backend._sharing.colleagueStore.take(T, 'proj-shared-edit');   // refused: the user holds it
    backend._sharing.db._expire(T, 'proj-shared-edit');
    expect((await backend._sharing.colleagueStore.take(T, 'proj-shared-edit')).ok).toBe(true);
    expect((await attempt(() => result.current.saveCurrentProject(HARNESS_ME))).message).toMatch(/^Being edited by Ada Colleague since /);
  });

  test('no silent overwrite: a save from a stale version is refused (the same user in two tabs)', async () => {
    const backend = makeInMemoryRcpBackend();
    const { result } = ctx(backend);
    let saved;
    await act(async () => { saved = await result.current.saveCurrentProject(HARNESS_ME, { name: 'Two tabs' }); });
    backend._sharing.db.update(T, HARNESS_ME, saved.id, { project_name: 'saved in the other tab' });
    expect((await attempt(() => result.current.saveCurrentProject(HARNESS_ME))).message).toMatch(/^You saved a newer version at .*\. Reload, or save yours as a copy\.$/);
    expect(rows(backend).find((r) => r.id === saved.id).project_name).toBe('saved in the other tab');
  });

  test('before the migration: saves work as before and nothing new is sent', async () => {
    const backend = makeInMemoryRcpBackend({ sharing: { applied: false } });
    const { result } = ctx(backend);
    let saved;
    await act(async () => { saved = await result.current.saveCurrentProject(HARNESS_ME, { name: 'Before apply' }); });
    await act(async () => { await result.current.saveCurrentProject(HARNESS_ME, { name: 'Before apply' }); });
    expect(rows(backend).find((r) => r.id === saved.id).version).toBeUndefined();
    expect(result.current.state.project.version).toBe(2);
    expect(await backend.sharing.capability(T)).toEqual({ available: false });
  });

  test('Project Manager: shared projects are listed apart with who shared them; only "Save a copy" is offered', async () => {
    const backend = makeInMemoryRcpBackend({ sharedRows: true });
    await act(async () => {
      render(<AuthContext.Provider value={{ user: { id: HARNESS_ME } }}><ReservoirCalcProvider backend={backend}><ProjectManager /></ReservoirCalcProvider></AuthContext.Provider>);
    });
    expect(await screen.findByTestId('rcp-shared-projects')).toHaveTextContent('Shared with me');
    const row = (await screen.findAllByTestId('rcp-project-row')).find((el) => el.textContent.includes('Keta North (Ada)'));
    await waitFor(() => expect(within(row).getByTestId('shared-row-note')).toHaveTextContent('Shared by Ada Colleague, view only'));
    fireEvent.click(row);
    expect(screen.queryByText('Delete')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId('rcp-project-save-copy')); });
    await waitFor(() => expect(rows(backend).some((r) => r.project_name === 'Keta North (Ada) (copy)' && r.user_id === HARNESS_ME)).toBe(true));
  });
});

describe('prospects', () => {
  const SEED = [{ name: 'Own A', pg_factors: { trap: 0.5, reservoir: 0.5, charge: 1, seal: 1 }, inputs: { mean: 100, unit: 'MMbbl', basis: 'recoverable' }, risked: { risked_mean: 25 } }];
  const mount = async (backend) => { await act(async () => { render(<ProspectRiskingPanel backend={backend} unrisked={{ mean: 40, p90: 12, p50: 33, p10: 78 }} />); }); };

  test('the inventory and the portfolio are the user\'s own; shared prospects are listed apart and copied in', async () => {
    const backend = makeInMemoryProspectsBackend(SEED, { sharedRows: true });
    await mount(backend);
    await waitFor(() => expect(screen.getByTestId('prospect-count')).toHaveTextContent('1'));
    expect(screen.getByTestId('prospect-shared-count')).toHaveTextContent('1');
    expect(screen.getByTestId('portfolio')).toHaveTextContent('Portfolio (1 prospects');
    await waitFor(() => expect(screen.getByTestId('prospect-shared-row')).toHaveTextContent('Shared by Ada Colleague, view only'));
    await act(async () => { fireEvent.click(screen.getByTestId('prospect-copy-Ada Deep (shared)')); });
    await waitFor(() => expect(screen.getByTestId('prospect-count')).toHaveTextContent('2'));
    expect(screen.getByTestId('prospect-status')).toHaveTextContent('Saved Ada Deep (shared) (copy) into your inventory.');
    expect(await backend.listProspects()).toHaveLength(2);
    // the colleague's prospect cannot be deleted by the user
    await expect(backend.deleteProspect({ id: 'prospect-shared' })).rejects.toThrow('Only the owner can delete a prospect.');
  });

  test('the owner shares a prospect for viewing from its row; a colleague then reads it', async () => {
    const sharing = makeHarnessSharing();
    const backend = makeInMemoryProspectsBackend(SEED, { sharing });
    await mount(backend);
    await act(async () => { fireEvent.click(await screen.findByTestId('prospect-share-Own A')); });
    await act(async () => { fireEvent.click(await screen.findByTestId('share-switch')); });
    await waitFor(() => expect(sharing.db._rows('rcp_prospects')[0]).toMatchObject({ visibility: 'organization', org_access: 'view' }));
    expect(screen.queryByTestId('share-access')).toBeNull();                 // viewing only: prospects are not edited in place
    expect(screen.getByTestId('share-view-only')).toBeInTheDocument();
    expect(sharing.db.select('rcp_prospects', HARNESS_COLLEAGUE).data).toHaveLength(1);
  });

  test('before the migration the row shows the note and the inventory works as before', async () => {
    const backend = makeInMemoryProspectsBackend(SEED, { sharing: makeHarnessSharing({ applied: false }) });
    await mount(backend);
    await act(async () => { fireEvent.click(await screen.findByTestId('prospect-share-Own A')); });
    expect(await screen.findByTestId('sharing-unavailable')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('prospect-name'), { target: { value: 'New one' } });
    await act(async () => { fireEvent.click(screen.getByTestId('prospect-add')); });
    await waitFor(() => expect(screen.getByTestId('prospect-count')).toHaveTextContent('2'));
  });
});
