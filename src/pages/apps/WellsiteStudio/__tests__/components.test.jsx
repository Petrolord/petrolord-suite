// WS0 screens on the local store: DepthEntry refuses an incomplete depth
// and shows what will be stored; the workstation opens the seeded well
// and records a bit depth through the port.
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DepthEntry from '../components/DepthEntry';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_USER } from '../services/seed';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, statusBar }) => <div>{ribbon}{explorer}{center}{statusBar}</div> }));

const ctx = { kbElevM: 25, glElevM: 4, survey: { version: 'v2', stations: [{ md: 0, inc: 0, azi: 0 }, { md: 1400, inc: 0, azi: 0 }, { md: 1750, inc: 30, azi: 90 }] } };

describe('DepthEntry', () => {
  test('an incomplete depth reports its defect and yields no calculation', () => {
    const onChange = jest.fn();
    render(<DepthEntry value={{ value: 1000, unit: 'ft', reference: 'MD', datum: '' }} onChange={onChange} kind="bit_depth" ctx={ctx} />);
    expect(screen.getByTestId('ws-depth-error')).toHaveTextContent('Depth datum is missing');
    expect(screen.queryByTestId('ws-depth-calc')).toBeNull();
    fireEvent.change(screen.getByTestId('ws-depth-datum'), { target: { value: 'RT' } });
    expect(onChange).toHaveBeenCalled();
    const [entry, calc] = onChange.mock.calls[0];
    expect(entry.datum).toBe('RT');
    expect(calc.mdM).toBeCloseTo(304.8, 6);
  });
  test('a complete depth shows the stored MD, TVD and the survey version', () => {
    render(<DepthEntry value={{ value: 1600, unit: 'm', reference: 'MD', datum: 'KB' }} onChange={() => {}} kind="logged" ctx={ctx} />);
    const calc = screen.getByTestId('ws-depth-calc');
    expect(calc).toHaveTextContent('Stored as 1600.0 m MD below KB');
    expect(calc).toHaveTextContent('TVD 1597.0 m');
    expect(calc).toHaveTextContent('survey v2');
  });
  test('TVDSS locks the datum to MSL', () => {
    const onChange = jest.fn();
    render(<DepthEntry value={{ value: 900, unit: 'm', reference: 'MD', datum: 'KB' }} onChange={onChange} kind="event" ctx={ctx} />);
    fireEvent.change(screen.getByTestId('ws-depth-ref'), { target: { value: 'TVDSS' } });
    expect(onChange.mock.calls[0][0]).toMatchObject({ reference: 'TVDSS', datum: 'MSL' });
  });
});

describe('WellsiteWorkstation on the seeded harness backend', () => {
  let n = 0;
  async function setup() {
    const db = openWellsiteDb(`ws-ui-${n += 1}`);
    const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
    const backend = makeLocalBackend({ transport, db, autoSync: false });
    await seedWellsite(backend);
    return backend;
  }
  test('opens KETA-2 with the bit at 10000 ft and records a new bit depth', async () => {
    const backend = await setup();
    render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
    expect(screen.getByTestId('ws-status-spm')).toHaveTextContent('60 spm');
    expect(screen.getByTestId('ws-status-tour')).toHaveTextContent(/tour/);
    expect(screen.getByTestId('ws-live-tvd')).not.toHaveTextContent('10000');
    fireEvent.change(screen.getByTestId('ws-bit-value'), { target: { value: '10050' } });
    await act(async () => { fireEvent.click(screen.getByTestId('ws-bit-save')); });
    await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10050 ft'));
    expect(screen.getByTestId('ws-status')).toHaveTextContent('Bit depth recorded.');
    expect(screen.getByTestId('ws-sync-state')).toHaveTextContent(/to share|shared|sharing/);
    // metres display
    fireEvent.change(screen.getByTestId('ws-unit'), { target: { value: 'm' } });
    expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 3063.2 m');
  });
  test('a well with no live record shows the setup screen and creates one online', async () => {
    const db = openWellsiteDb(`ws-ui-empty-${n += 1}`);
    const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
    const backend = makeLocalBackend({ transport, db, autoSync: false });
    render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('ws-no-wells')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('ws-setup-well').querySelectorAll('option').length).toBe(3));
    fireEvent.change(screen.getByTestId('ws-setup-well'), { target: { value: 'geo-keta-1' } });
    fireEvent.change(screen.getByTestId('ws-setup-gl'), { target: { value: '3' } });
    await act(async () => { fireEvent.click(screen.getByTestId('ws-setup-create')); });
    await waitFor(() => expect(screen.getByTestId('ws-well-KETA-1')).toBeInTheDocument());
    const w = (await backend.listWells())[0];
    expect(w.header).toMatchObject({ kb_elev_m: 24, gl_elev_m: 3 });
    expect((await backend.listMembers(w.id))[0].role).toBe('administrator');
  });
});
