// Wellsite Studio upgrade U1 (2026-10-01) on the real workstation, local
// database and fake transport: the screen-level Step 1 fixes, each with the
// case that was wrong before.
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_ORG_PEOPLE } from '../services/seed';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

// a production user: a uuid, never the harness id 'user-a' the screens used to special-case
const UID = '7b0c2a52-5d1e-4c1b-9a0e-3f2a1b4c5d6e';
const RIG_USER = { id: UID, email: 'rig@example.com', name: 'R. Rigsite', organization_id: 'org-1', role: 'wellsite_geologist' };
const PEOPLE = [{ user_id: UID, name: 'R. Rigsite', email: 'rig@example.com' }, ...SEED_ORG_PEOPLE];
const REG = SEED_REGISTRY_WELLS.map((w) => ({ ...w, user_id: UID }));
const WD_SECTIONS = [
  { from_md_m: 0, to_md_m: 914.4, cased: true, casing_id_m: 12.347 * 0.0254, hole_id_m: 17.5 * 0.0254, description: '13 3/8 in casing' },
  { from_md_m: 914.4, to_md_m: 3200, cased: false, hole_id_m: 12.25 * 0.0254, description: '12 1/4 in hole' },
];

let n = 0;
async function setup() {
  const db = openWellsiteDb(`ws-u1-${n += 1}`);
  const transport = makeFakeTransport({ user: RIG_USER, registryWells: REG, orgPeople: PEOPLE, prognosisSources: () => ({ holeSections: WD_SECTIONS, casingPoints: [] }) });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return { backend, well };
}
const type = (id, text) => { const el = screen.getByTestId(id); fireEvent.change(el, { target: { value: text } }); fireEvent.blur(el); };

afterEach(() => { delete window.matchMedia; });

test('WS-U1-009: tops history and the conflict resolver name people, never their ids', async () => {
  const { backend, well } = await setup();
  await act(async () => { await backend.addTop(well.id, { role: 'official', status: 'preliminary', name: 'Top Agbada', formationKey: 'top_agbada', basis: 'GR drop', depth: { value: 10168, unit: 'ft', reference: 'MD', datum: 'KB', kind: 'logged' } }); });
  fireEvent.click(screen.getByTestId('ws-nav-tops'));
  await waitFor(() => expect(screen.getByTestId('ws-top-row-top_agbada')).toHaveAttribute('data-status', 'preliminary'));
  fireEvent.click(screen.getByTestId('ws-top-chain-top_agbada'));
  const hist = await screen.findByTestId('ws-top-history-top_agbada');
  await waitFor(() => expect(hist).toHaveTextContent('by R. Rigsite'));
  expect(hist.textContent).not.toContain(UID);
});

test('WS-U1-006: the tops table shows the call subsea and how it came in against the prognosis', async () => {
  const { backend, well } = await setup();
  // prognosis Top Agbada at 3100 m MD; the call 10 m MD shallower on the 30 degree leg
  await act(async () => { await backend.addTop(well.id, { role: 'official', status: 'preliminary', name: 'Top Agbada', formationKey: 'top_agbada', basis: 'GR drop', depth: { value: 3090, unit: 'm', reference: 'MD', datum: 'KB', kind: 'logged' } }); });
  fireEvent.click(screen.getByTestId('ws-nav-tops'));
  await waitFor(() => expect(screen.getByTestId('ws-top-vsprog-top_agbada')).toHaveTextContent('28 ft high'));
  expect(screen.getByTestId('ws-top-tvdss-top_agbada').textContent).toMatch(/^\d+ ft$/);
});

test('WS-U1-001: a hand prognosis uncertainty is read in the unit its label shows', async () => {
  const { backend, well } = await setup();
  fireEvent.change(screen.getByTestId('ws-unit'), { target: { value: 'm' } });
  fireEvent.click(screen.getByTestId('ws-nav-tops'));
  await screen.findByTestId('ws-prog-name');
  // the entry form is in the well's default unit (ft); the label must say so
  expect(screen.getByTestId('ws-prog-unc').closest('label')).toHaveTextContent('Uncertainty (ft)');
  type('ws-prog-name', 'Top Benin');
  type('ws-prog-depth-value', '10500');
  type('ws-prog-unc', '15');
  await act(async () => { fireEvent.click(screen.getByTestId('ws-prog-add')); });
  await waitFor(async () => {
    const rows = await backend.listPrognosis(well.id);
    const top = rows.sort((a, b) => b.version - a.version)[0].tops.find((t) => t.name === 'Top Benin');
    expect(top.uncertainty_m).toBeCloseTo(15 * 0.3048, 9);
  });
});

test('WS-U1-007 and WS-U1-011: the lag panel shows volumes and flow; Live shows ROP from the bit log', async () => {
  await setup();
  await waitFor(() => expect(screen.getByTestId('ws-lag-annulus')).toHaveTextContent(/\d+\.\d bbl/));
  expect(screen.getByTestId('ws-lag-perstroke')).toHaveTextContent('0.1018 bbl/stk');
  expect(screen.getByTestId('ws-lag-flow')).toHaveTextContent(/6\.11 bbl\/min \(256 gpm\)/);
  expect(screen.getByTestId('ws-live-rop')).toHaveTextContent('50.0 ft/hr');
});

test('WS-U1-005 and WS-U1-008: Config fills from Well Design and takes fractional sizes', async () => {
  const { backend, well } = await setup();
  fireEvent.click(screen.getByTestId('ws-nav-config'));
  fireEvent.click(await screen.findByTestId('ws-config-from-prognosis'));
  // wait out the prognosis reload, then type a size the way the driller writes it
  fireEvent.change(screen.getByTestId('ws-config-section-cell-1-id_in'), { target: { value: '12 1/4' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-config-save-rig')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Rig configuration recorded.'));
  const cfg = await backend.latestRecord(well.id, 'rig_config');
  expect(cfg.payload.hole_sections).toHaveLength(2);
  expect(cfg.payload.hole_sections[1].hole_id_m).toBeCloseTo(12.25 * 0.0254, 12);
});

test('WS-U1-004: below 900 px the workstation stacks with a well chooser and no desktop shell', async () => {
  window.matchMedia = (q) => ({ matches: /max-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  await setup();
  const compact = screen.getByTestId('ws-compact');
  expect(screen.queryByTestId('ws-desktop')).toBeNull();
  expect(within(compact).getByTestId('ws-compact-well')).toHaveDisplayValue('KETA-2');
  expect(within(compact).getByTestId('ws-compact-dock')).toContainElement(screen.getByTestId('ws-lag-panel'));
});
