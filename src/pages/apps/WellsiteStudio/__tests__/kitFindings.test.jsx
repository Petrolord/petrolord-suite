// Findings from building the Ekene kit's Wellsite Studio episode
// (2026-09-23): (1) Config showed geometry rounded to whole feet, so saving
// it again moved it; (2) nothing chose the offset wells for Load from
// registry; (3) a programme scheduled every depth from its first row, drilled
// or not, so a new version back-filled overdue samples; (5) the lag engine
// moved the bit in a straight line between records, through connections and
// circulating. (4, the pumps-off note, is an engine gate: engines #247.)
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { bitDepthAt } from '@/lib/wellsite/lag';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_USER, SEED_RIG_CONFIG } from '../services/seed';
import { bitHistoryOf, lagNow, samplesToSchedule, programmeStartMdM } from '../services/samples';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, statusBar }) => <div>{ribbon}{explorer}{center}{statusBar}</div> }));

// the Config round trip saves twice through the Dexie store; under a full jest batch it can pass 5 s
jest.setTimeout(20000);

const FT = 0.3048;
const MIN = 60000;
const T0 = Date.parse('2026-09-07T06:00:00Z');
const iso = (m) => new Date(T0 + m * MIN).toISOString();

let n = 0;
async function seeded() {
  const db = openWellsiteDb(`ws-kitfind-${n += 1}`);
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return { backend, well };
}

describe('(1) Config geometry round trip', () => {
  test('saving an unedited config keeps the stored metres exactly; an edited value takes what was typed', async () => {
    const { backend, well } = await seeded();
    fireEvent.click(screen.getByTestId('ws-nav-config'));
    await waitFor(() => expect(screen.getByTestId('ws-config')).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByTestId('ws-config-save-rig')); });
    await waitFor(async () => expect((await backend.listRecords(well.id, { subtype: 'rig_config' })).length).toBe(2));
    const saved = (await backend.latestRecord(well.id, 'rig_config')).payload;
    // the seeded open hole ends at 3200 m (10498.688 ft); a whole-foot display saved it back as 3200.1 m
    const geom = (s) => ({ from: s.from_md_m, to: s.to_md_m, id: s.cased ? s.casing_id_m : s.hole_id_m });
    expect(saved.hole_sections.map(geom)).toEqual(SEED_RIG_CONFIG.hole_sections.map(geom));
    expect(saved.bha[0]).toMatchObject({ lengthM: SEED_RIG_CONFIG.bha[0].lengthM, odM: SEED_RIG_CONFIG.bha[0].odM, idM: SEED_RIG_CONFIG.bha[0].idM });
    expect(saved.drillpipe).toMatchObject({ odM: SEED_RIG_CONFIG.drillpipe.odM, idM: SEED_RIG_CONFIG.drillpipe.idM });
    // shown to the thousandth of a foot, so what is typed is what is stored
    expect(screen.getByTestId('ws-config-section-cell-1-to_ft')).toHaveValue('10498.688');
    fireEvent.change(screen.getByTestId('ws-config-section-cell-1-to_ft'), { target: { value: '10500.25' } });
    await act(async () => { fireEvent.click(screen.getByTestId('ws-config-save-rig')); });
    await waitFor(async () => expect((await backend.listRecords(well.id, { subtype: 'rig_config' })).length).toBe(3));
    const edited = (await backend.latestRecord(well.id, 'rig_config')).payload;
    expect(edited.hole_sections[1].to_md_m).toBeCloseTo(10500.25 * FT, 9);
    expect(edited.hole_sections[0].to_md_m).toBe(914.4);
  });
});

describe('(2) offset wells for Load from registry', () => {
  test('the chosen offset well is what the new prognosis version carries', async () => {
    const { backend, well } = await seeded();
    fireEvent.click(screen.getByTestId('ws-nav-tops'));
    // the seeded prognosis carries KETA-1 as its offset, so the chooser starts from that
    await waitFor(() => expect(screen.getByTestId('ws-prognosis-offsets-summary')).toHaveTextContent('Offset wells (1 chosen)'));
    // the anchored well (KETA-2) is not offered as its own offset
    expect(screen.queryByTestId('ws-prognosis-offset-KETA-2')).toBeNull();
    fireEvent.click(screen.getByTestId('ws-prognosis-offset-KETA-1'));
    expect(screen.getByTestId('ws-prognosis-offsets-summary')).toHaveTextContent('Offset wells (0 chosen)');
    await act(async () => { fireEvent.click(screen.getByTestId('ws-prognosis-load')); });
    await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent(/Prognosis version \d+ loaded: .*, 0 offset top\(s\)/));
    expect((await backend.listPrognosis(well.id)).sort((a, b) => b.version - a.version)[0].source.offset_well_ids).toEqual([]);
    fireEvent.click(screen.getByTestId('ws-prognosis-offset-KETA-1'));
    await act(async () => { fireEvent.click(screen.getByTestId('ws-prognosis-load')); });
    await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent(/Prognosis version \d+ loaded: .*, 2 offset top\(s\)/));
    const versions = await backend.listPrognosis(well.id);
    const last = versions.sort((a, b) => b.version - a.version)[0];
    expect(last.source.offset_well_ids).toEqual(['geo-keta-1']);
  });
});

describe('(3) a programme schedules from the bit depth when it was authorised', () => {
  const history = [{ utcMs: T0 - 600 * MIN, mdM: 9500 * FT }, { utcMs: T0, mdM: 10000 * FT }];
  const programme = { version: 2, rows: [{ fromMdM: 0, toMdM: null, intervalM: 5 * FT }], authorisedAtUtc: iso(0) };
  test('nothing above the bit at authorisation is scheduled; the old from-zero walk is the negative control', () => {
    const from = programmeStartMdM(programme, history);
    expect(from / FT).toBeCloseTo(10000, 9);
    const todo = samplesToSchedule(programme, [], { fromMdM: from, toMdM: 10015 * FT });
    expect(todo.map((s) => Math.round(s.mdM / FT))).toEqual([10000, 10005, 10010, 10015]);
    expect(samplesToSchedule(programme, [], { toMdM: 10015 * FT })).toHaveLength(2003);
  });
  test('authorised before the first bit depth: scheduling starts at the first recorded depth', () => {
    expect(programmeStartMdM({ ...programme, authorisedAtUtc: iso(-900) }, history) / FT).toBeCloseTo(9500, 9);
    expect(programmeStartMdM({ ...programme, authorisedAtUtc: iso(-300) }, history) / FT).toBeCloseTo(9750, 9);
    expect(programmeStartMdM(programme, [])).toBe(0);
  });
});

describe('(5) the bit is held through non-deepening events', () => {
  const bitDepths = [{ occurred_at: iso(0), md_calc_m: 3000 }, { occurred_at: iso(60), md_calc_m: 3030 }];
  const ev = (type, a, b) => ({ type, startUtcMs: T0 + a * MIN, endUtcMs: b == null ? null : T0 + b * MIN });
  test('circulating from 0 to 30 min without a bit record at its end: the bit stays at 3000 m through it', () => {
    const plain = bitHistoryOf(bitDepths);
    const held = bitHistoryOf(bitDepths, [ev('circulation', 0, 30), ev('gas_event', 35, 40)]);
    expect(bitDepthAt(plain, T0 + 30 * MIN)).toBeCloseTo(3015, 9);
    expect(bitDepthAt(held, T0 + 30 * MIN)).toBeCloseTo(3000, 9);
    expect(bitDepthAt(held, T0 + 45 * MIN)).toBeCloseTo(3015, 9);
    // a gas event does not stop the hole being deepened; drilling and coring are not holds either
    expect(bitHistoryOf(bitDepths, [ev('drilling', 0, 60), ev('coring', 10, 20)])).toEqual(plain);
  });
  test('the lag readout uses the held history: the lagged depth changes with the events', () => {
    const well = { settings: {}, header: { kb_elev_m: 25 }, survey: null };
    const pumpEvents = [{ occurred_at: iso(-600), payload: { spm: 60 } }];
    const deep = [{ occurred_at: iso(-600), md_calc_m: 2800 }, { occurred_at: iso(0), md_calc_m: 3000 }, { occurred_at: iso(600), md_calc_m: 3100 }];
    const a = lagNow({ well, rigConfig: SEED_RIG_CONFIG, bitDepths: deep, pumpEvents, nowUtcMs: T0 + 600 * MIN });
    const b = lagNow({ well, rigConfig: SEED_RIG_CONFIG, bitDepths: deep, pumpEvents, events: [ev('trip_out', 60, 400)], nowUtcMs: T0 + 600 * MIN });
    expect(a.available && b.available).toBe(true);
    expect(Number.isFinite(a.laggedMdM) && Number.isFinite(b.laggedMdM)).toBe(true);
    expect(b.laggedMdM).toBeLessThan(a.laggedMdM);
  });
});
