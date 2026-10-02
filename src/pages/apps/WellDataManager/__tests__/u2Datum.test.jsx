/**
 * WDM-U2-007: the well datum model in Well Data Manager.
 *  - a well with no reference elevation says so and withholds TVDSS;
 *  - the Header editor states the full datum, in the display unit;
 *  - a correction on a well with data shows what moves, waits for a
 *    confirmation, re-derives the checkshots and records who and when;
 *  - hostile entries are refused with the reason and Save stays disabled;
 *  - before the registry upgrade (no datum columns) only the elevation is
 *    saved, the form says so, and the record is merged into crs_provenance;
 *  - a LAS header proposes the datum, and the user's confirmation saves it.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import WellDataManager from '../WellDataManager';
import { readWellDatum, DATUM_COLUMNS } from '@/lib/wellDatum';

jest.setTimeout(300000);
let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

const SLOW = { timeout: 60000 };
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true }));
});

const nullDatum = Object.fromEntries(DATUM_COLUMNS.map((c) => [c, null]));
const base = {
  user_id: 'user-dev', organization_id: null, uwi: null, surface_x: 482254.99, surface_y: 151280.445, td_md_m: 3000,
  crs: 'EPSG:26391', xy_unit: 'm', crs_provenance: null, deviation: [], created_at: '2026-09-21T00:00:00.000Z',
};
const tops = (id) => [{ id: `${id}-t1`, name: 'Top Agbada', md_m: 1500 }, { id: `${id}-t2`, name: 'Base Agbada', md_m: 2000 }];
// MD-referenced checkshots entered at KB 30: TVDSS = MD - 30 on this vertical well
const CS = {
  checkshots: [{ tvdss_m: 970, twt_ms: 800, md_m: 1000 }, { tvdss_m: 1970, twt_ms: 1500, md_m: 2000 }],
  checkshots_provenance: { units_in: { depth_ref: 'md', depth_unit: 'm', time: 'twt' }, source: 'well-import', kb_m_used: 30, deviation_stations_used: 0, edited_at: '2026-09-21T00:00:00.000Z' },
};
const UNSET = { ...base, id: 'w-unset', name: 'LAD-1', kb_m: 0, checkshots: [], ...nullDatum };
const STATED = { ...base, id: 'w-kb', name: 'OKAN-7', kb_m: 30, ...CS, ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 30, created_at: '2026-09-22T00:00:00.000Z' };
const LEGACY = { ...base, id: 'w-old', name: 'OLD-3', kb_m: 30, ...CS, created_at: '2026-09-23T00:00:00.000Z' };

async function open(name, tab = null) {
  render(<MemoryRouter><WellDataManager /></MemoryRouter>);
  const rows = await screen.findAllByTestId('wdm-well-row', {}, SLOW);
  fireEvent.click(rows.find((r) => r.dataset.wellName === name));
  await screen.findByText(name, { selector: '[data-testid=wdm-detail-name]' }, SLOW);
  if (tab) fireEvent.click(screen.getByTestId(`wdm-detail-tab-${tab}`));
}
const stored = async (id) => (await mockBackend.listWells()).find((w) => w.id === id);
const set = (testId, value) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

test('a well with no reference elevation says so, withholds TVDSS, and takes a full offshore datum', async () => {
  mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: { wells: [UNSET], tops: { 'w-unset': tops('w-unset') } } });
  await open('LAD-1');
  expect(await screen.findByTestId('wdm-datum-line', {}, SLOW)).toHaveTextContent('Depth reference not set');
  expect(screen.getByTestId('wdm-datum-unset')).toHaveTextContent('LAD-1 has no depth reference elevation, so TVDSS and elevations cannot be given.');
  expect(screen.getByTestId('wdm-header-ref-elev')).toHaveTextContent('not set');

  // TVDSS is withheld on the Tops tab; MD and TVD stay
  fireEvent.click(screen.getByTestId('wdm-detail-tab-tops'));
  expect(await screen.findByTestId('wdm-tops-kb-note', {}, SLOW)).toHaveTextContent('TVDSS is withheld');
  expect(screen.getByTestId('wdm-top-md-Top Agbada')).toHaveTextContent('1500.0');
  expect(screen.getByTestId('wdm-top-tvdss-Top Agbada')).toHaveTextContent('n/a');

  // enter it: KB 25 m above MSL, 100 m of water
  fireEvent.click(screen.getByTestId('wdm-detail-tab-header'));
  fireEvent.click(await screen.findByTestId('wdm-edit-header', {}, SLOW));
  expect(screen.getByTestId('wdm-header-kb')).toHaveValue('');           // blank, never 0
  expect(screen.getByTestId('wdm-datum-kind')).toHaveValue('');
  set('wdm-datum-kind', 'KB');
  set('wdm-header-kb', '25');
  set('wdm-datum-vdatum', 'MSL');
  set('wdm-datum-env', 'offshore');
  set('wdm-datum-water', '100');
  fireEvent.click(screen.getByTestId('wdm-header-save'));
  // the well has tops, so the first entry is confirmed too
  const impact = await screen.findByTestId('wdm-datum-impact', {}, SLOW);
  expect(impact).toHaveTextContent('The reference elevation becomes 25.00 m. TVDSS and elevations of this well become available.');
  expect(impact).toHaveTextContent('2 tops: MD kept, TVDSS and elevation move.');
  expect((await stored('w-unset')).depth_ref_elev_m).toBeNull();          // nothing written before the confirmation
  set('wdm-datum-reason', 'rig survey report');
  fireEvent.click(screen.getByTestId('wdm-datum-confirm'));

  await waitFor(async () => expect((await stored('w-unset')).depth_ref_elev_m).toBe(25), SLOW);
  const w = await stored('w-unset');
  expect(w).toMatchObject({ depth_ref_kind: 'KB', depth_ref_elev_m: 25, kb_m: 25, well_environment: 'offshore', water_depth_m: 100, ground_elev_m: null, vertical_datum: 'MSL', elev_unit: 'm' });
  expect(w.datum_changes).toHaveLength(1);
  expect(w.datum_changes[0]).toMatchObject({ by: 'user-dev', by_name: 'Dev User', reason: 'rig survey report', kind: 'first', app: 'well-data-manager' });
  expect(w.datum_changes[0].affected.tops).toBe(2);
  expect(await screen.findByTestId('wdm-datum-line', {}, SLOW)).toHaveTextContent('KB 25.00 m above MSL, water depth 100.00 m');
  expect(screen.getByTestId('wdm-datum-history')).toHaveTextContent('Dev User changed the depth reference from not set to KB 25.00 m (rig survey report)');
  // and the tops now read their subsea depth
  fireEvent.click(screen.getByTestId('wdm-detail-tab-tops'));
  expect(await screen.findByTestId('wdm-top-tvdss-Top Agbada', {}, SLOW)).toHaveTextContent('1475.0');
  expect(screen.queryByTestId('wdm-tops-kb-note')).toBeNull();
});

test('a correction shows what moves, waits, re-derives the checkshots and records the change; Go back writes nothing', async () => {
  mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: { wells: [STATED], tops: { 'w-kb': tops('w-kb') } } });
  await open('OKAN-7');
  fireEvent.click(await screen.findByTestId('wdm-edit-header', {}, SLOW));
  expect(screen.getByTestId('wdm-header-kb')).toHaveValue('30');
  set('wdm-header-kb', '36.5');
  fireEvent.click(screen.getByTestId('wdm-header-save'));
  const impact = await screen.findByTestId('wdm-datum-impact', {}, SLOW);
  expect(impact).toHaveTextContent('The reference elevation changes from 30.00 m to 36.50 m. Every TVDSS of this well becomes 6.50 m shallower');
  expect(impact).toHaveTextContent('2 tops: MD kept, TVDSS and elevation move.');
  expect(impact).toHaveTextContent('2 checkshot rows: re-derived through the new elevation (entered as MD, that reference is kept).');
  expect(impact).toHaveTextContent('Seismolord synthetics and well ties made on this well used the old elevation: re-run them.');
  expect(screen.getByTestId('wdm-header-save')).toBeDisabled();           // only Confirm or Go back from here

  // Go back: nothing written
  fireEvent.click(screen.getByTestId('wdm-datum-cancel'));
  expect(screen.queryByTestId('wdm-datum-impact')).toBeNull();
  expect((await stored('w-kb')).depth_ref_elev_m).toBe(30);
  expect((await stored('w-kb')).checkshots[0].tvdss_m).toBe(970);

  fireEvent.click(screen.getByTestId('wdm-header-save'));
  await screen.findByTestId('wdm-datum-impact', {}, SLOW);
  fireEvent.click(screen.getByTestId('wdm-datum-confirm'));
  await waitFor(async () => expect((await stored('w-kb')).depth_ref_elev_m).toBe(36.5), SLOW);
  const w = await stored('w-kb');
  expect(w.kb_m).toBe(36.5);
  // MD kept, TVDSS re-derived: 1000 - 36.5
  expect(w.checkshots.map((r) => r.md_m)).toEqual([1000, 2000]);
  expect(w.checkshots[0].tvdss_m).toBeCloseTo(963.5, 9);
  expect(w.checkshots[1].tvdss_m).toBeCloseTo(1963.5, 9);
  expect(w.checkshots_provenance.kb_m_used).toBe(36.5);
  expect(w.datum_changes[0]).toMatchObject({ kind: 'correction', by_name: 'Dev User' });
  expect(w.datum_changes[0].shift_tvdss_m).toBeCloseTo(-6.5, 9);
  expect(await screen.findByTestId('wdm-status', {}, SLOW)).toHaveTextContent('Checkshots re-derived for the new elevation 36.50 m (2 rows, MD reference kept).');
});

test('hostile entries are refused with the reason: water depth on an onshore well, a negative offshore KB, text', async () => {
  mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: { wells: [STATED] } });
  await open('OKAN-7');
  fireEvent.click(await screen.findByTestId('wdm-edit-header', {}, SLOW));
  set('wdm-datum-env', 'offshore');
  set('wdm-datum-water', '100');
  set('wdm-datum-env', 'onshore');
  expect(screen.getByTestId('wdm-datum-error')).toHaveTextContent('Water depth belongs to an offshore well. This well is onshore: clear the water depth or change the environment.');
  expect(screen.getByTestId('wdm-header-save')).toBeDisabled();
  set('wdm-datum-env', 'offshore');
  expect(screen.queryByTestId('wdm-datum-error')).toBeNull();
  set('wdm-header-kb', '-30');
  expect(screen.getByTestId('wdm-datum-error')).toHaveTextContent('An offshore KB cannot be below the vertical datum (-30 m). Check the sign.');
  set('wdm-header-kb', 'thirty');
  expect(screen.getByTestId('wdm-datum-error')).toHaveTextContent('Reference elevation must be a number.');
  expect(screen.getByTestId('wdm-header-save')).toBeDisabled();
  // feet: 98.43 ft is 30.0015 m; the unit switch converts what was typed, it never relabels it
  set('wdm-header-kb', '30');
  set('wdm-header-unit', 'ft');
  expect(screen.getByTestId('wdm-header-kb')).toHaveValue('98.425');
  expect(screen.getByTestId('wdm-datum-water')).toHaveValue('328.08399');
  expect((await stored('w-kb')).depth_ref_elev_m).toBe(30);
});

test('before the registry upgrade: the elevation alone is saved, the form says so, and the record rides in crs_provenance', async () => {
  const survey = { source: 'wellsite-studio', ws_well_name: 'OLD-3', survey_version: 2, stations: 9, published_at: '2026-10-01T10:00:00.000Z' };
  mockBackend = makeInMemoryBackend({ seedSharedWell: false, datumColumns: false, seedRows: { wells: [{ ...LEGACY, crs_provenance: { deviation: survey } }] } });
  await open('OLD-3');
  expect(await screen.findByTestId('wdm-datum-line', {}, SLOW)).toHaveTextContent('KB 30.00 m above datum (not named, taken as mean sea level)');
  expect(readWellDatum(await stored('w-old')).state).toBe('legacy-kb');
  fireEvent.click(screen.getByTestId('wdm-edit-header'));
  expect(screen.getByTestId('wdm-datum-legacy-note')).toHaveTextContent('The registry on this server keeps one elevation per well for now, read as the KB.');
  expect(screen.getByTestId('wdm-datum-kind')).toBeDisabled();
  expect(screen.getByTestId('wdm-datum-env')).toBeDisabled();
  set('wdm-header-kb', '32');
  fireEvent.click(screen.getByTestId('wdm-header-save'));
  await screen.findByTestId('wdm-datum-impact', {}, SLOW);
  fireEvent.click(screen.getByTestId('wdm-datum-confirm'));
  await waitFor(async () => expect((await stored('w-old')).kb_m).toBe(32), SLOW);
  const w = await stored('w-old');
  for (const c of DATUM_COLUMNS) expect(c in w).toBe(false);             // no datum column invented
  expect(w.crs_provenance.deviation).toEqual(survey);                    // Wellsite's survey source kept
  expect(w.crs_provenance.datum_changes).toHaveLength(1);
  expect(w.crs_provenance.datum_changes[0]).toMatchObject({ kind: 'correction', by_name: 'Dev User' });
  expect(w.checkshots[0].tvdss_m).toBeCloseTo(968, 9);
  expect(await screen.findByTestId('wdm-datum-history', {}, SLOW)).toHaveTextContent('changed the depth reference from KB 30.00 m to KB 32.00 m');
});

test('a LAS header proposes the datum; the confirmed proposal is what the new well is saved with', async () => {
  mockBackend = makeInMemoryBackend({ seedSharedWell: false });
  render(<MemoryRouter><WellDataManager /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('wdm-open-las', {}, SLOW));
  const text = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'hostile', 'las20_petrel_export.las'), 'utf8');
  fireEvent.change(await screen.findByTestId('wdm-las-file', {}, SLOW), { target: { files: [{ name: 'las20_petrel_export.las', text: async () => text }] } });
  const box = await screen.findByTestId('wdm-las-datum', {}, SLOW);
  expect(within(box).getByTestId('wdm-las-datum-source')).toHaveTextContent('Proposed from the file header (EKB 25.3 m, EGL 4.1 m). Check it before importing');
  expect(screen.getByTestId('wdm-las-kb')).toHaveValue('25.3');
  expect(screen.getByTestId('wdm-las-datum-kind')).toHaveValue('KB');
  expect(screen.getByTestId('wdm-las-datum-ground')).toHaveValue('4.1');
  expect(screen.getByTestId('wdm-las-datum-env')).toHaveValue('onshore');
  // the user corrects the proposal before confirming: the datum name
  set('wdm-las-datum-vdatum', 'MSL');
  fireEvent.click(screen.getByTestId('wdm-las-import'));
  await waitFor(async () => expect((await mockBackend.listWells()).length).toBe(1), SLOW);
  const [w] = await mockBackend.listWells();
  expect(w).toMatchObject({ depth_ref_kind: 'KB', depth_ref_elev_m: 25.3, kb_m: 25.3, well_environment: 'onshore', ground_elev_m: 4.1, vertical_datum: 'MSL' });
});
