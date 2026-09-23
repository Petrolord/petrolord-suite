// Two tester-facing defects found while writing the user manual
// (2026-09-07): (1) there was no screen to add members, so on production
// the creator was the only member and could not walk a two-person flow;
// (2) Well Data Manager's Open in menu sends the registry (geo_wells) id,
// which the workstation looked up as a live-well id, so the well was never
// chosen. These pin both fixes.
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_USER, SEED_ORG_PEOPLE } from '../services/seed';
import { memberChangeError, canManageMembers } from '../services/members';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, statusBar }) => <div>{ribbon}{explorer}{center}{statusBar}</div> }));

let n = 0;
async function seeded({ online = true } = {}) {
  const db = openWellsiteDb(`ws-members-${n += 1}`);
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS, orgPeople: SEED_ORG_PEOPLE, online: true });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  if (!online) transport.setOnline(false);
  return { backend, transport, well };
}

describe('membership rules', () => {
  const admin = { user_id: 'a', role: 'administrator', status: 'active' };
  test('the last active administrator cannot be demoted or made inactive', () => {
    expect(memberChangeError([admin], { userId: 'a', role: 'wellsite_geologist' })).toMatch(/at least one active administrator/);
    expect(memberChangeError([admin], { userId: 'a', role: 'administrator', status: 'inactive' })).toMatch(/at least one active administrator/);
    expect(memberChangeError([admin, { user_id: 'b', role: 'administrator', status: 'active' }], { userId: 'a', role: 'wellsite_geologist' })).toBeNull();
    expect(memberChangeError([admin], { userId: 'b', role: 'operations_geologist' })).toBeNull();
    expect(memberChangeError([admin], { userId: 'b', role: 'driller' })).toMatch(/Unknown role/);
  });
  test('well administrators and organisation administrators manage members; others do not', () => {
    expect(canManageMembers({ id: 'a' }, [admin])).toBe(true);
    expect(canManageMembers({ id: 'b', org_role: 'admin' }, [admin])).toBe(true);
    expect(canManageMembers({ id: 'b', org_role: 'member' }, [admin, { user_id: 'b', role: 'wellsite_geologist', status: 'active' }])).toBe(false);
  });
});

describe('backend setMember', () => {
  test('adds, changes the role of, and deactivates a member; the server refuses a non-administrator', async () => {
    const { backend, well } = await seeded();
    await backend.setMember(well.id, { userId: 'user-office', role: 'wellsite_geologist' });
    await backend.setMember(well.id, { userId: 'user-office', role: 'operations_geologist' });
    let m = (await backend.listMembers(well.id)).find((x) => x.user_id === 'user-office');
    expect(m).toMatchObject({ role: 'operations_geologist', status: 'active' });
    await backend.setMember(well.id, { userId: 'user-office', role: 'operations_geologist', status: 'inactive' });
    m = (await backend.listMembers(well.id)).find((x) => x.user_id === 'user-office');
    expect(m.status).toBe('inactive');
    // hand administration to the lead, step down, and the fake server's ws_can_admin now refuses this user
    await backend.setMember(well.id, { userId: 'user-lead', role: 'administrator' });
    await backend.setMember(well.id, { userId: SEED_USER.id, role: 'wellsite_geologist' });
    await expect(backend.setMember(well.id, { userId: 'user-office', role: 'wellsite_geologist' })).rejects.toThrow(/Only a well administrator/);
  });
  test('the last administrator is refused before any call, and offline is refused', async () => {
    const { backend, transport, well } = await seeded();
    await expect(backend.setMember(well.id, { userId: SEED_USER.id, role: 'wellsite_geologist' })).rejects.toThrow(/at least one active administrator/);
    transport.setOnline(false);
    await expect(backend.setMember(well.id, { userId: 'user-office', role: 'wellsite_geologist' })).rejects.toThrow(/needs a connection/);
  });
});

describe('Members panel on the Config view', () => {
  test('an administrator adds a colleague from the organisation and then makes them inactive', async () => {
    const { backend } = await seeded();
    render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
    fireEvent.click(screen.getByTestId('ws-nav-config'));
    await waitFor(() => expect(screen.getByTestId(`ws-member-${SEED_USER.id}`)).toHaveTextContent('A. Geologist (you)'));
    await waitFor(() => expect(screen.getByTestId('ws-member-add-person').querySelectorAll('option').length).toBe(3));
    fireEvent.change(screen.getByTestId('ws-member-add-person'), { target: { value: 'user-office' } });
    fireEvent.change(screen.getByTestId('ws-member-add-role'), { target: { value: 'operations_geologist' } });
    await act(async () => { fireEvent.click(screen.getByTestId('ws-member-add')); });
    await waitFor(() => expect(screen.getByTestId('ws-member-user-office')).toHaveTextContent('O. Office'));
    expect(screen.getByTestId('ws-status')).toHaveTextContent('O. Office added as Operations geologist.');
    await act(async () => { fireEvent.click(screen.getByTestId('ws-member-deactivate-user-office')); });
    await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('O. Office is no longer a member.'));
    expect(screen.getByTestId('ws-member-user-office')).toHaveTextContent('inactive');
    // the only administrator cannot make themselves inactive
    await act(async () => { fireEvent.click(screen.getByTestId(`ws-member-deactivate-${SEED_USER.id}`)); });
    await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('A well keeps at least one active administrator.'));
  });
  test('offline, the list is shown and changes wait for a connection', async () => {
    const { backend } = await seeded({ online: false });
    render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
    fireEvent.click(screen.getByTestId('ws-nav-config'));
    await waitFor(() => expect(screen.getByTestId('ws-members-offline')).toBeInTheDocument());
    expect(screen.queryByTestId('ws-member-add')).toBeNull();
  });
});

describe('Open in from Well Data Manager (?well=<registry id>)', () => {
  test('a registry id with a live well opens that live well', async () => {
    const { backend } = await seeded();
    render(<MemoryRouter initialEntries={['/?well=geo-keta-2']}><WellsiteWorkstation backend={backend} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
    expect(screen.queryByTestId('ws-need-well')).toBeNull();
  });
  test('a live-well id still opens that live well', async () => {
    const { backend, well } = await seeded();
    render(<MemoryRouter initialEntries={[`/?well=${well.id}`]}><WellsiteWorkstation backend={backend} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  });
  test('a registry id with no live well opens New well with that well chosen', async () => {
    const { backend } = await seeded();
    render(<MemoryRouter initialEntries={['/?well=geo-keta-1']}><WellsiteWorkstation backend={backend} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('ws-setup-from-registry')).toHaveTextContent('KETA-1 has no live well yet'));
    expect(screen.getByTestId('ws-setup-well')).toHaveValue('geo-keta-1');
    await act(async () => { fireEvent.click(screen.getByTestId('ws-setup-create')); });
    await waitFor(() => expect(screen.queryByTestId('ws-setup')).toBeNull());
    expect(screen.getByTestId('ws-well-KETA-1')).toBeInTheDocument();
  });
});
