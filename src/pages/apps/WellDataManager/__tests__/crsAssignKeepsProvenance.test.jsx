/**
 * Assigning a CRS by hand merges into geo_wells.crs_provenance. It used to
 * replace the object, which dropped the `deviation` entry Wellsite Studio
 * U2-009 writes there (the "survey came from Wellsite" line) and any other
 * key another app keeps in it.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import WellDataManager from '../WellDataManager';
import { assignedCrsProvenance } from '../engine/provenance';

jest.setTimeout(240000);
let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true }));
});

const WELLSITE_SURVEY = { source: 'wellsite-studio', ws_well_name: 'KETA-1', survey_version: 3, stations: 12, published_at: '2026-10-01T10:00:00.000Z', published_by: 'Ada Obi' };
const well = {
  id: 'w1', name: 'KETA-1', user_id: 'user-dev', organization_id: null, surface_x: 482254.99, surface_y: 151280.445, kb_m: 30, td_md_m: 3000,
  crs: null, xy_unit: null, crs_provenance: { deviation: WELLSITE_SURVEY, note_from_another_app: 'kept' }, deviation: [], checkshots: [],
  created_at: '2026-09-21T00:00:00.000Z',
};
const other = { ...well, id: 'w2', name: 'NO-CRS-2', crs_provenance: null, created_at: '2026-09-20T00:00:00.000Z' };

test('Assign CRS keeps the Wellsite survey source and every other provenance key', async () => {
  mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: { wells: [well, other] } });
  render(<MemoryRouter><WellDataManager /></MemoryRouter>);
  fireEvent.click((await screen.findAllByTestId('wdm-well-row', {}, { timeout: 60000 })).find((r) => r.dataset.wellName === 'KETA-1'));
  expect(await screen.findByTestId('wdm-survey-source', {}, { timeout: 30000 })).toHaveTextContent('Wellsite Studio live well KETA-1, survey 3, 12 stations, sent 2026-10-01 by Ada Obi');

  fireEvent.click(screen.getByText('Assign CRS…'));
  fireEvent.click(screen.getByText('Choose a coordinate reference system'));
  fireEvent.change(screen.getByPlaceholderText('Search name, EPSG code or region'), { target: { value: 'Minna' } });
  fireEvent.click(screen.getByText('Minna / Nigeria East Belt'));

  const stored = async () => (await mockBackend.listWells()).find((w) => w.id === 'w1');
  await waitFor(async () => expect((await stored()).crs).toBe('EPSG:26393'), { timeout: 30000 });
  const saved = await stored();
  expect(saved.crs_provenance.assigned_manually).toBe(true);
  expect(saved.crs_provenance.declared_crs).toBe('EPSG:26393');
  // the keys other apps keep there are still there
  expect(saved.crs_provenance.deviation).toEqual(WELLSITE_SURVEY);
  expect(saved.crs_provenance.note_from_another_app).toBe('kept');
  // and the Header still says where the survey came from
  expect(await screen.findByTestId('wdm-survey-source', {}, { timeout: 30000 })).toHaveTextContent('Wellsite Studio live well KETA-1');

  // the assignment belongs to that well: another well with no CRS still says so
  fireEvent.click(screen.getAllByTestId('wdm-well-row').find((r) => r.dataset.wellName === 'NO-CRS-2'));
  await screen.findByText('NO-CRS-2', { selector: '[data-testid=wdm-detail-name]' }, { timeout: 30000 });
  expect(screen.getByText('Assign CRS…')).toBeInTheDocument();
  expect((await mockBackend.listWells()).find((w) => w.id === 'w2').crs).toBeNull();
});

test('the merge itself: the assignment keys are set, nothing else is lost, the input is not mutated', () => {
  const before = { deviation: WELLSITE_SURVEY, datum_transform: 'EPSG:1168' };
  const out = assignedCrsProvenance(before, 'EPSG:26393', new Date('2026-10-02T08:00:00.000Z'));
  expect(out).toEqual({ deviation: WELLSITE_SURVEY, datum_transform: 'EPSG:1168', assigned_manually: true, declared_crs: 'EPSG:26393', date: '2026-10-02T08:00:00.000Z' });
  expect(before).toEqual({ deviation: WELLSITE_SURVEY, datum_transform: 'EPSG:1168' });
  expect(assignedCrsProvenance(null, 'LOCAL', new Date('2026-10-02T08:00:00.000Z'))).toEqual({ assigned_manually: true, declared_crs: 'LOCAL', date: '2026-10-02T08:00:00.000Z' });
  // a stored non-object (a legacy string) never spreads into characters
  expect(assignedCrsProvenance('legacy', 'LOCAL', new Date('2026-10-02T08:00:00.000Z'))).toEqual({ assigned_manually: true, declared_crs: 'LOCAL', date: '2026-10-02T08:00:00.000Z' });
});
