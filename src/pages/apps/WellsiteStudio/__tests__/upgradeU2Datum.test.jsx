// Wellsite Studio upgrade U2-019 (2026-10-02, closes WS-U1-024): the KB of a
// live well is correctable in Wellsite, through the wells registry's own
// datum door (src/lib/wellDatum.js, src/lib/wellsRegistry.updateWellDatum):
// the change is reviewed first, only the owner of the registry well can save
// it, it is recorded with who and when, and the live well's own copy follows.
// A registry well that states no reference elevation is not read as KB 0.
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_USER } from '../services/seed';
import { wellContext, kbStatus } from '../services/wellContext';
import { offsetTopsFrom, offsetWellsWithoutDatum } from '../services/tops';
import { readWellDatum, DATUM_COLUMNS } from '@/lib/wellDatum';
import { mdToTvd } from '@/lib/wellsite/depth';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));
jest.setTimeout(240000);
const SLOW = { timeout: 60000 };

const nullDatum = Object.fromEntries(DATUM_COLUMNS.map((c) => [c, null]));
let n = 0;
async function make({ owner = SEED_USER.id, patch = {} } = {}) {
  const db = openWellsiteDb(`ws-u2-datum-${n += 1}`);
  const registryWells = SEED_REGISTRY_WELLS.map((w, i) => ({ ...w, user_id: owner, ...(i === 0 ? patch : {}) }));
  const transport = makeFakeTransport({ registryWells });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  return { db, transport, backend, well, registryWells };
}

describe('correcting the KB from Wellsite', () => {
  test('the review says what moves; the owner confirms; the registry, its record and the live well all follow', async () => {
    const { backend, well, registryWells } = await make({ patch: { ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 25 } });
    const plan = await backend.kbCorrectionPlan(well.id, 31.5);
    expect(plan.errors).toEqual([]);
    expect(plan.reg.ownedByMe).toBe(true);
    expect(plan.impact.kind).toBe('correction');
    expect(plan.impact.shiftM).toBeCloseTo(-6.5, 9);
    const text = plan.impact.lines.join('\n');
    expect(text).toMatch(/from 25\.00 m to 31\.50 m\. Every TVDSS of this well becomes 6\.50 m shallower/);
    expect(text).toMatch(/2 tops: MD kept, TVDSS and elevation move\./);
    expect(text).toMatch(/1 Wellsite well linked to it: the KB copy follows this change/);
    // nothing was written by the review
    expect(registryWells[0].depth_ref_elev_m).toBe(25);

    const res = await backend.correctKb(well.id, 31.5, { reason: 'rig survey report' });
    expect(res.changed).toBe(true);
    const geo = registryWells[0];
    expect(geo).toMatchObject({ depth_ref_kind: 'KB', depth_ref_elev_m: 31.5, kb_m: 31.5 });
    expect(geo.datum_changes).toHaveLength(1);
    expect(geo.datum_changes[0]).toMatchObject({ by: SEED_USER.id, by_name: SEED_USER.name, app: 'wellsite-studio', reason: 'rig survey report', kind: 'correction' });
    // the live well's copy follows, so its subsea depths are computed from the new KB
    const live = await backend.getWell(well.id);
    expect(live.header.kb_elev_m).toBe(31.5);
    const ctx = wellContext(live);
    expect(ctx.kbElevM).toBe(31.5);
    expect(mdToTvd(1000, ctx).tvdssM).toBeCloseTo(1000 - 31.5, 6);
    // NEGATIVE CONTROL: on the old KB the same depth was 6.5 m deeper
    expect(mdToTvd(1000, { ...ctx, kbElevM: 25 }).tvdssM - mdToTvd(1000, ctx).tvdssM).toBeCloseTo(6.5, 6);
    // the same elevation again changes nothing and writes no second record
    expect((await backend.correctKb(well.id, 31.5)).changed).toBe(false);
    expect(registryWells[0].datum_changes).toHaveLength(1);
  });

  test('someone who does not own the registry well is refused before anything is written (negative control)', async () => {
    const { backend, well, registryWells } = await make({ owner: 'someone-else', patch: { ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 25 } });
    const plan = await backend.kbCorrectionPlan(well.id, 31.5);
    expect(plan.reg.ownedByMe).toBe(false);
    await expect(backend.correctKb(well.id, 31.5)).rejects.toThrow(/Only the owner of the registry well can correct its depth reference/);
    expect(registryWells[0].depth_ref_elev_m).toBe(25);
    expect((await backend.getWell(well.id)).header.kb_elev_m).toBe(25);
  });

  test('hostile elevations are refused by the shared checks', async () => {
    const { backend, well, registryWells } = await make({ patch: { ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 25, well_environment: 'offshore', water_depth_m: 100 } });
    await expect(backend.correctKb(well.id, -25)).rejects.toThrow(/An offshore KB cannot be below the vertical datum/);
    await expect(backend.correctKb(well.id, 62010)).rejects.toThrow(/Check the unit/);
    expect(registryWells[0].depth_ref_elev_m).toBe(25);
  });

  test('offline it is refused with the reason', async () => {
    const { backend, well, transport } = await make({ patch: { ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 25 } });
    transport.setOnline(false);
    await expect(backend.correctKb(well.id, 31.5)).rejects.toThrow(/needs a connection/);
  });

  test('before the registry upgrade the elevation is kept in kb_m and the record rides beside the survey source', async () => {
    const survey = { source: 'wellsite-studio', survey_version: 'rig-1' };
    const { backend, well, registryWells } = await make({ patch: { crs_provenance: { deviation: survey } } });
    expect(readWellDatum(registryWells[0]).state).toBe('legacy-kb');
    const res = await backend.correctKb(well.id, 31.5, { reason: 'rig survey report' });
    expect(res.changed).toBe(true);
    expect(res.dropped).toEqual([]);                       // a KB with nothing else: nothing to drop
    const geo = registryWells[0];
    expect(geo.kb_m).toBe(31.5);
    for (const c of DATUM_COLUMNS) expect(c in geo).toBe(false);
    expect(geo.crs_provenance.deviation).toEqual(survey);
    expect(geo.crs_provenance.datum_changes).toHaveLength(1);
    expect((await backend.getWell(well.id)).header.kb_elev_m).toBe(31.5);
  });
});

describe('a registry well with no reference elevation', () => {
  test('a new live well takes no KB from it (never 0), the note says so, and entering one here sets it in the registry', async () => {
    const db = openWellsiteDb(`ws-u2-datum-${n += 1}`);
    const geoWell = { ...SEED_REGISTRY_WELLS[0], id: 'geo-unset', name: 'LAD-1', kb_m: 0, ...nullDatum, user_id: SEED_USER.id };
    const transport = makeFakeTransport({ registryWells: [geoWell] });
    const backend = makeLocalBackend({ transport, db, autoSync: false });
    const well = await backend.createWell({ geoWell, name: 'LAD-1', header: {}, settings: {} });
    expect(well.header.kb_elev_m).toBeNull();
    expect(wellContext(well).kbElevM).toBeNull();
    expect(kbStatus(NaN).note).toMatch(/has no KB elevation/);
    const res = await backend.correctKb(well.id, 30, { reason: 'first entry' });
    expect(res.plan.impact.kind).toBe('first');
    expect(geoWell).toMatchObject({ depth_ref_kind: 'KB', depth_ref_elev_m: 30, kb_m: 30 });
    expect((await backend.getWell(well.id)).header.kb_elev_m).toBe(30);
  });
  test('an older registry row (kb_m 0, no datum columns) keeps the earlier reading, and the note names the zero', async () => {
    const db = openWellsiteDb(`ws-u2-datum-${n += 1}`);
    const geoWell = { ...SEED_REGISTRY_WELLS[0], id: 'geo-old', name: 'OLD-1', kb_m: 0, user_id: SEED_USER.id };
    const backend = makeLocalBackend({ transport: makeFakeTransport({ registryWells: [geoWell] }), db, autoSync: false });
    const well = await backend.createWell({ geoWell, name: 'OLD-1', header: {}, settings: {} });
    expect(well.header.kb_elev_m).toBe(0);
    expect(kbStatus(0).note).toMatch(/KB elevation is 0 m above MSL/);
  });
  test('offset wells with no reference elevation are left out of the offset comparison and named', () => {
    const offsets = [
      { id: 'a', name: 'KETA-1', kb_m: 24, deviation: null, tops: [{ name: 'Top Agbada', md_m: 2690 }] },
      { id: 'b', name: 'LAD-1', kb_m: null, deviation: null, tops: [{ name: 'Top Agbada', md_m: 2700 }] },
    ];
    expect(offsetTopsFrom(offsets).map((t) => `${t.well_name} ${t.tvdss_m}`)).toEqual(['KETA-1 2666']);
    expect(offsetWellsWithoutDatum(offsets).map((w) => w.name)).toEqual(['LAD-1']);
  });
});

describe('the Config screen', () => {
  test('Correct KB reviews the change, waits for Confirm, then saves through the registry door', async () => {
    const { backend, well, registryWells } = await make({ patch: { ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 25 } });
    render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'), SLOW);
    fireEvent.click(screen.getByTestId('ws-nav-config'));
    expect(await screen.findByTestId('ws-config-kb', {}, SLOW)).toHaveValue('25');
    expect(screen.getByTestId('ws-config-kb')).toBeDisabled();            // the value is the registry's; it changes through the door below
    fireEvent.click(screen.getByTestId('ws-config-kb-correct'));
    expect(screen.getByTestId('ws-config-kb-input')).toHaveValue('25');
    // a non-number is refused in the panel
    fireEvent.change(screen.getByTestId('ws-config-kb-input'), { target: { value: 'thirty' } });
    fireEvent.click(screen.getByTestId('ws-config-kb-review'));
    expect(await screen.findByTestId('ws-config-kb-error', {}, SLOW)).toHaveTextContent('Type the KB elevation in metres above the vertical datum.');
    fireEvent.change(screen.getByTestId('ws-config-kb-input'), { target: { value: '31.5' } });
    fireEvent.click(screen.getByTestId('ws-config-kb-review'));
    const impact = await screen.findByTestId('ws-config-kb-impact', {}, SLOW);
    expect(impact).toHaveTextContent('The reference elevation changes from 25.00 m to 31.50 m.');
    expect(impact).toHaveTextContent('1 Wellsite well linked to it');
    expect(registryWells[0].depth_ref_elev_m).toBe(25);                   // nothing saved yet
    fireEvent.change(screen.getByTestId('ws-config-kb-reason'), { target: { value: 'rig survey report' } });
    fireEvent.click(screen.getByTestId('ws-config-kb-confirm'));
    await waitFor(() => expect(registryWells[0].depth_ref_elev_m).toBe(31.5), SLOW);
    await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('KB corrected to 31.5 m in the registry and on this well.'), SLOW);
    expect((await backend.getWell(well.id)).header.kb_elev_m).toBe(31.5);
    expect(registryWells[0].datum_changes[0].reason).toBe('rig survey report');
    await waitFor(() => expect(screen.getByTestId('ws-config-kb')).toHaveValue('31.5'), SLOW);
  });
});
