/**
 * Basin & Charge Modeling U2-019: organisation sharing of 1D models
 * (bf_wells), on the in-memory mirror of the sharing migration
 * (20261002100000_suite_record_sharing.sql; the four-policy split with WITH
 * CHECK is proved by tools/validation/org-sharing). This app saves by itself
 * 1.5 s after an edit, so a model that is open read-only must keep the edit
 * on screen only, never fail a save in a loop.
 * Negative control on origin/main be1fb3ef4: models were owner-only (one ALL
 * policy; the list asked for the user's rows only; no switch).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import { MultiWellProvider, useMultiWell } from '../contexts/MultiWellContext';
import { BasinFlowProvider, useBasinFlow } from '../contexts/BasinFlowContext';
import MultiWellManager from '../components/multiwell/MultiWellManager';
import { makeInMemoryBackend } from '../services/backend';
import { HARNESS_ME, HARNESS_COLLEAGUE } from '@/lib/recordSharing';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }), toast: (...a) => mockToast(...a) }));

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
installDashboardScope({ userId: null });
beforeEach(() => { mockToast.mockClear(); try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* none */ } });

const T = 'bf_wells';
const W = { timeout: 30000 };
let probe = null;
const Probe = () => { probe = { bf: useBasinFlow(), mw: useMultiWell() }; return null; };
const mount = async (be) => {
  await act(async () => { render(<MemoryRouter><MultiWellProvider backend={be}><BasinFlowProvider><Probe /><MultiWellManager /></BasinFlowProvider></MultiWellProvider></MemoryRouter>); });
  await waitFor(() => expect(probe.mw.state.activeWellId).toBeTruthy(), W);
};
const rows = (be) => be._sharing.db._rows(T);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 1900)); });   // past the 1.5 s auto-save
const toasts = () => mockToast.mock.calls.map((c) => c[0]);

test('the owner shares the active model; the auto-save keeps working and is stamped', async () => {
  const be = makeInMemoryBackend({ persist: false });
  await mount(be);
  expect(probe.mw.state.activeWellId).toBe('bf-well-ref');
  await act(async () => { fireEvent.click(await screen.findByTestId('share-switch', {}, W)); });
  await waitFor(() => expect(rows(be)[0]).toMatchObject({ visibility: 'organization', org_access: 'view', user_id: HARNESS_ME }), W);
  expect(be._sharing.db.select(T, HARNESS_COLLEAGUE).data).toHaveLength(1);
  await settle();
  expect(toasts().filter((t) => t.variant === 'destructive')).toEqual([]);
}, 120000);

test('shared models are listed apart; the user\'s own opens first; a view-only one never saves and offers the copy', async () => {
  const be = makeInMemoryBackend({ persist: false, shared: true });
  await mount(be);
  expect(probe.mw.state.activeWellId).toBe('bf-well-ref');           // not the colleague's newer row
  expect(await screen.findByTestId('bf-shared-wells')).toHaveTextContent('Shared with me');
  fireEvent.click(screen.getByText('Keta Deep-1 (Ada)'));
  await waitFor(() => expect(probe.mw.state.activeWellId).toBe('bf-well-ada-view'), W);
  await waitFor(() => expect(screen.getByTestId('shared-by')).toHaveTextContent('Shared by Ada Colleague'), W);
  expect(screen.getByTestId('bf-read-only-note')).toHaveTextContent('Changes you make to this model are not saved. Save a copy to keep them.');
  const before = JSON.stringify(rows(be).find((r) => r.id === 'bf-well-ada-view'));
  await settle();
  await act(async () => { probe.bf.dispatch({ type: 'UPDATE_SETTINGS', payload: { surfaceTemp: 33 } }); });
  await settle();
  expect(JSON.stringify(rows(be).find((r) => r.id === 'bf-well-ada-view'))).toBe(before);   // nothing sent
  expect(toasts().filter((t) => t.variant === 'destructive')).toEqual([]);               // and nothing failed in a loop
  await act(async () => { fireEvent.click(screen.getByTestId('save-copy')); });
  await waitFor(() => expect(rows(be).some((r) => r.name === 'Keta Deep-1 (Ada) (copy)' && r.user_id === HARNESS_ME)).toBe(true), W);
  await waitFor(() => expect(rows(be).find((r) => r.name === 'Keta Deep-1 (Ada) (copy)')).toMatchObject({ visibility: 'private', settings: { surfaceTemp: 33 } }), W);
}, 180000);

test('an edit model saves only while this user holds it, and the save is stamped with them', async () => {
  const be = makeInMemoryBackend({ persist: false, shared: true });
  await mount(be);
  fireEvent.click(screen.getByText('Keta Shelf-2, team model'));
  await waitFor(() => expect(probe.mw.state.activeWellId).toBe('bf-well-ada-edit'), W);
  await settle();
  expect(rows(be).find((r) => r.id === 'bf-well-ada-edit').version).toBe(1);
  await act(async () => { fireEvent.click(await screen.findByTestId('start-editing', {}, W)); });
  await waitFor(() => expect(rows(be).find((r) => r.id === 'bf-well-ada-edit').editing_by).toBe(HARNESS_ME), W);
  await act(async () => { probe.bf.dispatch({ type: 'UPDATE_SETTINGS', payload: { surfaceTemp: 27 } }); });
  await settle();
  await waitFor(() => expect(rows(be).find((r) => r.id === 'bf-well-ada-edit')).toMatchObject({ settings: { surfaceTemp: 27 }, updated_by: HARNESS_ME, user_id: HARNESS_COLLEAGUE }), W);
  const log = be._sharing.db.listChanges(T, HARNESS_COLLEAGUE, 'bf-well-ada-edit').data;
  expect(log[0]).toMatchObject({ action: 'updated', changed_by: HARNESS_ME, summary: 'Model saved' });
  expect(log[0].changed_fields).toContain('settings');
}, 180000);

test('a newer version saved elsewhere: the refusal is said once, the model stops saving, Reload brings the saved one', async () => {
  const be = makeInMemoryBackend({ persist: false });
  await mount(be);
  await settle();
  be._sharing.db.update(T, HARNESS_ME, 'bf-well-ref', { settings: { ...rows(be)[0].settings, surfaceTemp: 99 } });   // the other tab
  await act(async () => { probe.bf.dispatch({ type: 'UPDATE_SETTINGS', payload: { surfaceTemp: 12 } }); });
  await settle();
  await waitFor(() => expect(screen.getByTestId('bf-save-blocked').textContent).toMatch(/^You saved a newer version at .*\. Reload, or save yours as a copy\./), W);
  await act(async () => { probe.bf.dispatch({ type: 'UPDATE_SETTINGS', payload: { surfaceTemp: 13 } }); });
  await settle();
  expect(toasts().filter((t) => t.title === 'Not saved')).toHaveLength(1);
  expect(rows(be)[0].settings.surfaceTemp).toBe(99);
  await act(async () => { fireEvent.click(screen.getByTestId('bf-reload')); });
  await waitFor(() => expect(probe.bf.state.settings.surfaceTemp).toBe(99), W);
  expect(screen.queryByTestId('bf-save-blocked')).toBeNull();
}, 180000);

test('before the migration: the auto-save works as before and the control is a note', async () => {
  const be = makeInMemoryBackend({ persist: false, sharing: { applied: false } });
  await mount(be);
  await act(async () => { probe.bf.dispatch({ type: 'UPDATE_SETTINGS', payload: { surfaceTemp: 18 } }); });
  await settle();
  await waitFor(() => expect(rows(be)[0].settings.surfaceTemp).toBe(18), W);
  expect(rows(be)[0].version).toBeUndefined();
  expect(await screen.findByTestId('sharing-unavailable', {}, W)).toBeInTheDocument();
  expect(toasts().filter((t) => t.variant === 'destructive')).toEqual([]);
}, 120000);
