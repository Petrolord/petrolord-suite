// WS1: the description screen on the seeded well. Typing codes resolves
// against the vocabulary and the abbreviation follows; a 90 percent sum
// is refused with the engine message; Copy previous (Ctrl+D) reproduces
// the last description and highlights only the changed field; the saved
// record carries the structured components and both depths.
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_USER } from '../services/seed';
import { parseField, fieldText } from '../services/describe';
import { mergeProfile } from '@/lib/wellsite/abbreviations';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, statusBar }) => <div>{ribbon}{explorer}{center}{statusBar}</div> }));

describe('parseField', () => {
  test('resolves each attribute kind from typed text and renders it back', () => {
    const p = mergeProfile(null);
    expect(parseField('lithology', 'sst')).toEqual({ ok: true, value: 'sandstone' });
    expect(parseField('percent', '60%')).toEqual({ ok: true, value: 60 });
    expect(parseField('colour', 'lt gy')).toEqual({ ok: true, value: { hue: 'grey', modifier: 'light' } });
    expect(parseField('grainSize', 'f-m')).toEqual({ ok: true, value: { from: 'f_sand', to: 'm_sand' } });
    expect(parseField('grainSize', 'f to m')).toEqual({ ok: true, value: { from: 'f_sand', to: 'm_sand' } });
    expect(parseField('rounding', 'sbang-sbrnd')).toEqual({ ok: true, value: { from: 'subangular', to: 'subrounded' } });
    expect(parseField('rounding', 'rnd')).toEqual({ ok: true, value: 'rounded' });
    expect(parseField('accessories', 'tr pyr, glauc')).toEqual({ ok: true, value: [{ code: 'pyrite', amount: 'trace' }, 'glauconite'] });
    expect(parseField('cement', 'calc')).toEqual({ ok: true, value: ['calcareous'] });
    expect(parseField('texture', '')).toEqual({ ok: true, value: [] });
    expect(parseField('hardness', 'granite').ok).toBe(false);
    expect(fieldText('colour', { hue: 'grey', modifier: 'light' }, p)).toBe('lt gy');
    expect(fieldText('grainSize', { from: 'f_sand', to: 'm_sand' }, p)).toBe('f-m');
    expect(fieldText('accessories', [{ code: 'pyrite', amount: 'trace' }, 'glauconite'], p)).toBe('tr pyr, glauc');
  });
});

describe('DescribeView', () => {
  let n = 0;
  async function setup() {
    const db = openWellsiteDb(`ws-desc-${n += 1}`);
    const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
    const backend = makeLocalBackend({ transport, db });
    await seedWellsite(backend);
    render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
    fireEvent.click(screen.getByTestId('ws-nav-describe'));
    await waitFor(() => expect(screen.getByTestId('ws-describe')).toBeInTheDocument());
    return backend;
  }
  const type = (id, text) => { const el = screen.getByTestId(id); fireEvent.change(el, { target: { value: text } }); fireEvent.blur(el); };

  test('a full description types in as codes, renders the golden abbreviation, refuses 90 percent, then saves both depths', async () => {
    const backend = await setup();
    type('ws-desc-top-value', '10000'); type('ws-desc-base-value', '10010');
    fireEvent.click(screen.getByTestId('ws-desc-mode-full'));
    type('ws-desc-comp-0-lithology', 'sst'); type('ws-desc-comp-0-percent', '60'); type('ws-desc-comp-0-colour', 'lt gy');
    type('ws-desc-comp-0-grainSize', 'f-m'); type('ws-desc-comp-0-sorting', 'mod'); type('ws-desc-comp-0-rounding', 'sbang-sbrnd');
    type('ws-desc-comp-0-cement', 'calc'); type('ws-desc-comp-0-accessories', 'tr pyr'); type('ws-desc-comp-0-porosity', 'fr');
    fireEvent.click(screen.getByTestId('ws-desc-add'));
    await waitFor(() => expect(screen.getByTestId('ws-desc-comp-1')).toBeInTheDocument());
    type('ws-desc-comp-1-lithology', 'sh'); type('ws-desc-comp-1-percent', '30'); type('ws-desc-comp-1-colour', 'dk gy');
    type('ws-desc-comp-1-hardness', 'frm'); type('ws-desc-comp-1-texture', 'fis');
    expect(screen.getByTestId('ws-desc-sum')).toHaveTextContent('90% of 100');
    await act(async () => { fireEvent.click(screen.getByTestId('ws-desc-save')); });
    expect(screen.getByTestId('ws-desc-error')).toHaveTextContent('Component percentages sum to 90, expected 100 within 5.');
    type('ws-desc-comp-1-percent', '40');
    expect(screen.getByTestId('ws-desc-abbrev')).toHaveTextContent('60% SST: lt gy, f-m gr, mod srt, sbang-sbrnd, calc cmt, tr pyr, fr vis por; 40% SH: dk gy, frm, fis');
    expect(screen.getByTestId('ws-desc-narrative')).toHaveTextContent('Sandstone (60 percent), light grey, fine to medium grained');
    await act(async () => { fireEvent.click(screen.getByTestId('ws-desc-save')); });
    await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Description saved for 10000 ft to 10010 ft.'));
    const rows = await backend.listRecords((await backend.listWells())[0].id, { subtype: 'cuttings_description' });
    expect(rows).toHaveLength(1);
    expect(rows[0].md_calc_m).toBeCloseTo(3048, 6);
    expect(rows[0].md2_calc_m).toBeCloseTo(3051.048, 6);
    expect(rows[0].depth2_kind).toBe('lagged_sample');
    expect(rows[0].payload.components[0]).toMatchObject({ lithology: 'sandstone', percent: 60, colour: { hue: 'grey', modifier: 'light' }, grainSize: { from: 'f_sand', to: 'm_sand' }, accessories: [{ code: 'pyrite', amount: 'trace' }] });
    expect(rows[0].payload.components[1]).toMatchObject({ lithology: 'shale', percent: 40, hardness: 'firm', texture: ['fissile'] });
    // the next interval starts where this one ended
    expect(screen.getByTestId('ws-desc-top-value')).toHaveValue(10010);
    expect(screen.getByTestId('ws-desc-base-value')).toHaveValue(10020);
    // copy previous with Ctrl+D, change one percent pair, the diff names the two fields
    fireEvent.keyDown(screen.getByTestId('ws-desc-comp-0-lithology'), { key: 'd', ctrlKey: true });
    await waitFor(() => expect(screen.getByTestId('ws-desc-copied')).toHaveTextContent('0 field(s) changed'));
    expect(screen.getByTestId('ws-desc-comp-0-lithology')).toHaveValue('SST');
    type('ws-desc-comp-0-percent', '90'); type('ws-desc-comp-1-percent', '10');
    expect(screen.getByTestId('ws-desc-copied')).toHaveTextContent('2 field(s) changed');
    expect(screen.getByTestId('ws-desc-comp-0-percent')).toHaveAttribute('data-changed', '1');
    expect(screen.getByTestId('ws-desc-comp-0-colour')).not.toHaveAttribute('data-changed');
    await act(async () => { fireEvent.keyDown(screen.getByTestId('ws-desc-comp-0-percent'), { key: 's', ctrlKey: true }); });
    await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Description saved for 10010 ft to 10020 ft.'));
    const rows2 = await backend.listRecords((await backend.listWells())[0].id, { subtype: 'cuttings_description' });
    expect(rows2[1].payload.copiedFrom).toBe(rows[0].id);
    expect(rows2[1].payload.changedFields.map((c) => c.field)).toEqual(['percent', 'percent']);
  }, 30000);

  test('an unknown term keeps its text, turns amber and names itself', async () => {
    await setup();
    type('ws-desc-comp-0-lithology', 'granite');
    expect(screen.getByTestId('ws-desc-comp-0-error')).toHaveTextContent('Lithology granite is not in the vocabulary.');
    type('ws-desc-comp-0-lithology', 'lst');
    expect(screen.queryByTestId('ws-desc-comp-0-error')).toBeNull();
    expect(screen.getByTestId('ws-desc-comp-0-lithology')).toHaveValue('LST');
  });
});
