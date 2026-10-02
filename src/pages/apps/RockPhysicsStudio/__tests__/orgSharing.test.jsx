/**
 * Rock Physics Studio: organisation sharing of the project (rp_projects; the
 * owner item "a published gather is visible to its owner only"). The
 * workstation runs on the in-memory mirror of the sharing migration
 * (20261002100000_suite_record_sharing.sql); shared rules and store:
 * src/lib/recordSharing.
 * Negative control on origin/main be1fb3ef4: the project was owner-only, so a
 * colleague's Seismolord never saw the gather; there was no switch.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import RockWorkstation from '../components/RockWorkstation';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { loadGatherForWell } from '@/lib/rockPhysicsGather';
import { HARNESS_ME, HARNESS_COLLEAGUE } from '@/lib/recordSharing';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) } } }));
jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});
HTMLCanvasElement.prototype.getContext = () => null;
beforeAll(installDomShims);
installDashboardScope({ userId: null });
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

const T = 'rp_projects';
const W = { timeout: 20000 };
const mount = async (backend) => { await act(async () => { render(<MemoryRouter><RockWorkstation backend={backend} /></MemoryRouter>); }); };
const status = () => screen.getByTestId('rp-status').textContent;
const rows = (b) => b._sharing.db._rows(T);

test('the owner shares the project; a colleague\'s Seismolord reader then finds its published gather', async () => {
  const b = makeInMemoryBackend();
  await mount(b);
  await waitFor(() => expect(status()).toMatch(/Restored saved project/), W);
  await act(async () => { fireEvent.click(await screen.findByTestId('rp-share', {}, W)); });
  await act(async () => { fireEvent.click(await screen.findByTestId('share-switch', {}, W)); });
  await waitFor(() => expect(rows(b)[0]).toMatchObject({ user_id: HARNESS_ME, visibility: 'organization', org_access: 'view' }), W);
  // the row a colleague can now read is the row loadGatherForWell reads (it lists rp_projects under RLS)
  const visibleToColleague = b._sharing.db.select(T, HARNESS_COLLEAGUE).data;
  expect(visibleToColleague.map((r) => r.id)).toEqual([rows(b)[0].id]);
  const fakeClient = { from: () => { const q = { select: () => q, contains: () => q, order: () => q, limit: async () => ({ data: visibleToColleague.map((r) => ({ ...r, well_ids: ['w-1'], avo: {} })), error: null }) }; return q; } };
  expect(await loadGatherForWell(fakeClient, 'w-1')).toEqual({ ok: false, reason: 'No gather has been published for this well.' });   // readable, nothing published yet
});

test('a colleague\'s shared project is offered apart, opens read-only, and a save is refused with the reason', async () => {
  const b = makeInMemoryBackend({ shared: true });
  await mount(b);
  await waitFor(() => expect(status()).toMatch(/Restored saved project/), W);
  const select = await screen.findByTestId('rp-project-select', {}, W);
  expect(select.textContent).toMatch(/My project/);
  expect(select.textContent).toMatch(/Gas sand study \(Ada\)/);
  await act(async () => { fireEvent.change(select, { target: { value: 'rp-project-ada' } }); });
  await waitFor(() => expect(status()).toMatch(/^Opened "Gas sand study \(Ada\)", shared by a colleague\./), W);
  await waitFor(() => expect(screen.getByTestId('shared-by')).toHaveTextContent('Shared by Ada Colleague'), W);
  const before = rows(b).find((r) => r.id === 'rp-project-ada');
  await act(async () => { fireEvent.click(screen.getByTestId('rp-save-project')); });
  await waitFor(() => expect(status()).toBe('Shared by Ada Colleague for viewing. Save a copy to work on your own version.'), W);
  expect(rows(b).find((r) => r.id === 'rp-project-ada')).toEqual(before);
  // the copy replaces the user's own project, after a question
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  await act(async () => { fireEvent.click(screen.getByTestId('save-copy')); });
  await waitFor(() => expect(status()).toBe('Saved as your own project.'), W);
  expect(confirm).toHaveBeenCalled();
  const mine = rows(b).find((r) => r.user_id === HARNESS_ME);
  expect(mine.rock.kminOverrideGPa).toBe('40');                     // Ada's parameter, now in the user's own row
  expect(rows(b).find((r) => r.id === 'rp-project-ada')).toEqual(before);
  confirm.mockRestore();
});

test('the owner\'s save carries the version: a save from a second tab is refused with who and when', async () => {
  const b = makeInMemoryBackend();
  await mount(b);
  await waitFor(() => expect(status()).toMatch(/Restored saved project/), W);
  const id = rows(b)[0].id;
  b._sharing.db.update(T, HARNESS_ME, id, { wedge: { fromOtherTab: true } });
  await act(async () => { fireEvent.click(screen.getByTestId('rp-save-project')); });
  await waitFor(() => expect(status()).toMatch(/^You saved a newer version at .*\. Reload, or save yours as a copy\.$/), W);
  expect(rows(b)[0].wedge).toEqual({ fromOtherTab: true });
});

test('before the migration: Save works as before and the control is a note', async () => {
  const b = makeInMemoryBackend({ sharing: { applied: false } });
  await mount(b);
  await waitFor(() => expect(status()).toMatch(/Restored saved project/), W);
  await act(async () => { fireEvent.click(screen.getByTestId('rp-save-project')); });
  await waitFor(() => expect(status()).toBe('Project saved.'), W);
  expect(rows(b)[0].version).toBeUndefined();
  await act(async () => { fireEvent.click(await screen.findByTestId('rp-share', {}, W)); });
  expect(await screen.findByTestId('sharing-unavailable', {}, W)).toBeInTheDocument();
  expect(screen.queryByTestId('share-switch')).toBeNull();
});
