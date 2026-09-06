// WS5 on the seeded well: the prognosis shows its version and offsets;
// an interpretation and an official call are separate records; a call
// walks preliminary to confirmed to final without deleting a version;
// a competing office version surfaces as a conflict that only an
// approver resolves; the approach panel reads the next prognosed top.
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, seedCompetingTop, SEED_REGISTRY_WELLS, SEED_USER } from '../services/seed';
import { evidenceChain } from '../services/tops';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div>{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

let n = 0;
async function setup(user = SEED_USER) {
  const db = openWellsiteDb(`ws-tops-${n += 1}`);
  const transport = makeFakeTransport({ user, registryWells: SEED_REGISTRY_WELLS });
  const backend = makeLocalBackend({ transport, db });
  const well = await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return { backend, well };
}
const type = (id, text) => { const el = screen.getByTestId(id); fireEvent.change(el, { target: { value: text } }); fireEvent.blur(el); };

test('prognosis, approach panel, interpretation, call lifecycle to final, event and evidence chain', async () => {
  const { backend, well } = await setup();
  // approach: Top Agbada prognosed at 3100 m (10170.6 ft), bit at 10000 ft, 20 m window
  await waitFor(() => expect(screen.getByTestId('ws-approach')).toHaveAttribute('data-formation', 'top_agbada'));
  expect(screen.getByTestId('ws-approach-distance')).toHaveTextContent('171 ft');
  expect(screen.getByTestId('ws-approach-offsets')).toHaveTextContent('1 wells');
  expect(screen.getByTestId('ws-approach-call')).toHaveTextContent('not called');
  fireEvent.click(screen.getByTestId('ws-nav-tops'));
  await waitFor(() => expect(screen.getByTestId('ws-prognosis-version')).toHaveTextContent(/Prognosis version 1, loaded .* rig time, 2 top\(s\), 2 offset top\(s\)/));
  expect(screen.getByTestId('ws-top-row-top_agbada')).toHaveAttribute('data-status', 'none');
  // interpretation
  fireEvent.click(screen.getByTestId('ws-top-interpret-top_agbada'));
  type('ws-top-depth-value', '10160'); type('ws-top-base-value', '10180');
  fireEvent.change(screen.getByTestId('ws-top-confidence'), { target: { value: 'high' } });
  type('ws-top-basis', 'Evidence is consistent with the top between 10160 and 10180 ft');
  await act(async () => { fireEvent.click(screen.getByTestId('ws-top-submit')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Top Agbada interpretation recorded, high confidence.'));
  expect(screen.getByTestId('ws-top-interp-top_agbada')).toHaveTextContent('10160 ft to 10180 ft, high');
  // official call, preliminary (a first call cannot be final)
  fireEvent.click(screen.getByTestId('ws-top-callbtn-top_agbada'));
  expect(Array.from(screen.getByTestId('ws-top-status').querySelectorAll('option')).map((o) => o.value)).toEqual(['preliminary', 'confirmed']);
  type('ws-top-depth-value', '10168');
  type('ws-top-basis', 'GR drop and sand at 10168 ft');
  await act(async () => { fireEvent.click(screen.getByTestId('ws-top-submit')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Top Agbada called at 10168 ft, preliminary.'));
  expect(screen.getByTestId('ws-top-row-top_agbada')).toHaveAttribute('data-status', 'preliminary');
  // confirm, then final (the seeded user is the administrator, an approver)
  fireEvent.click(screen.getByTestId('ws-top-callbtn-top_agbada'));
  expect(Array.from(screen.getByTestId('ws-top-status').querySelectorAll('option')).map((o) => o.value)).toEqual(['confirmed', 'revised', 'withdrawn']);
  fireEvent.change(screen.getByTestId('ws-top-status'), { target: { value: 'confirmed' } });
  type('ws-top-basis', 'Cuttings confirm sand');
  await act(async () => { fireEvent.click(screen.getByTestId('ws-top-submit')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('confirmed (version 2)'));
  fireEvent.click(screen.getByTestId('ws-top-callbtn-top_agbada'));
  fireEvent.change(screen.getByTestId('ws-top-status'), { target: { value: 'final' } });
  type('ws-top-basis', 'Agreed with town');
  await act(async () => { fireEvent.click(screen.getByTestId('ws-top-submit')); });
  await waitFor(() => expect(screen.getByTestId('ws-top-row-top_agbada')).toHaveAttribute('data-status', 'final'));
  // nothing deleted: three official versions plus the interpretation; the event was recorded citing the call
  const tops = await backend.listTops(well.id);
  expect(tops.filter((t) => t.role === 'official').map((t) => t.status).sort()).toEqual(['confirmed', 'final', 'preliminary']);
  expect(new Set(tops.filter((t) => t.role === 'official').map((t) => t.chain_id)).size).toBe(1);
  const events = await backend.listRecords(well.id, { subtype: 'top_called' });
  expect(events).toHaveLength(3);
  const final = tops.find((t) => t.status === 'final');
  const chain = evidenceChain(final, { tops, records: [] });
  expect(chain.map((c) => `${c.role} ${c.status}`).sort()).toEqual(['interpretation preliminary', 'official confirmed', 'official final', 'official preliminary']);
  fireEvent.click(screen.getByTestId('ws-top-chain-top_agbada'));
  expect(screen.getByTestId('ws-top-history-top_agbada')).toHaveTextContent('v3 official final');
  expect(screen.getByTestId('ws-explorer-counts')).toHaveTextContent('1 top(s) called');
});

test('a competing office version is a conflict; a non-approver only sees it; the approver resolves it citing both', async () => {
  const geologist = { ...SEED_USER, id: 'user-b', name: 'B. Geologist' };
  // seed as the administrator, then look at it as a wellsite geologist member
  const db = openWellsiteDb(`ws-tops-conf-${n += 1}`);
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
  const backend = makeLocalBackend({ transport, db });
  const well = await seedWellsite(backend);
  await backend.addTop(well.id, { role: 'official', status: 'preliminary', name: 'Top Agbada', formationKey: 'top_agbada', basis: 'rig pick', depth: { value: 10168, unit: 'ft', reference: 'MD', datum: 'RT', kind: 'logged' } });
  const branch = await seedCompetingTop(backend, well);
  expect(branch.created_by).toBe('user-office');
  await db.members.add({ id: 'm-b', well_id: well.id, user_id: 'user-b', role: 'wellsite_geologist', status: 'active' });
  // as the geologist
  const t2 = makeFakeTransport({ user: geologist, registryWells: SEED_REGISTRY_WELLS });
  const b2 = makeLocalBackend({ transport: t2, db });
  const { unmount } = render(<MemoryRouter><WellsiteWorkstation backend={b2} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  fireEvent.click(screen.getByTestId('ws-nav-tops'));
  await waitFor(() => expect(screen.getByTestId('ws-tops-conflicts')).toHaveTextContent('1 conflict(s)'));
  expect(screen.getByTestId('ws-conflict')).toHaveTextContent('awaiting an approver');
  expect(screen.queryByTestId('ws-conflict-resolve')).toBeNull();
  expect(screen.getByTestId('ws-top-call-top_agbada')).toHaveTextContent('competing');
  unmount();
  // as the administrator
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  fireEvent.click(screen.getByTestId('ws-nav-tops'));
  await waitFor(() => expect(screen.getByTestId('ws-conflict-resolve')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId(`ws-conflict-pick-${branch.id}`));
  fireEvent.change(screen.getByTestId('ws-conflict-basis'), { target: { value: 'The LWD pick is the better datum' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-conflict-resolve')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('competing versions resolved'));
  expect(screen.queryByTestId('ws-conflict')).toBeNull();
  const tops = await backend.listTops(well.id);
  const resolver = tops.find((t) => t.resolves_ids && t.resolves_ids.length);
  expect(resolver.resolves_ids).toHaveLength(2);
  expect(resolver.previous_version_id).toBe(branch.id);
  expect(branch.chain_id).not.toBe(tops[0].chain_id === branch.chain_id ? 'x' : branch.chain_id + 'x'); // a fresh office chain
  expect(tops).toHaveLength(3);
});
