// Wellsite Studio upgrade U2-009 (2026-10-01, closes Well Data Manager
// U2-009): the rig survey goes to the shared wells registry through the
// registry writer, by the owner, with where it came from; the send is a
// record on the live well; Well Data Manager can say the source.
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
import { buildRun, registrySurveyPlan, activeSurvey, SURVEY_PUBLISHED_SUBTYPE, SURVEY_SUBTYPE } from '../services/surveys';
import { registrySurveySourceText } from '@/lib/wellsite/registrySurveySource';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

let n = 0;
async function make({ owner = SEED_USER.id } = {}) {
  const db = openWellsiteDb(`ws-u2-regsvy-${n += 1}`);
  // a private copy of the registry: the send changes it
  const registryWells = SEED_REGISTRY_WELLS.map((w) => ({ ...w, user_id: owner, deviation: w.deviation ? w.deviation.map((s) => ({ ...s })) : w.deviation, crs_provenance: { source: 'well-design-studio', datum_transform: 'EPSG:1234' } }));
  const transport = makeFakeTransport({ registryWells });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  return { db, transport, backend, well, registryWells };
}
const run = (current) => buildRun({ stations: [{ md: 3300, inc: 32, azi: 91 }, { md: 3330, inc: 33, azi: 91 }], mdUnit: 'm', azimuthRef: 'grid', current });

describe('the plan and the send', () => {
  test('with no rig survey there is nothing to send, and the reason is said', async () => {
    const { backend, well } = await make();
    const { plan } = await backend.registrySurveyPlanFor(well.id);
    expect(plan).toMatchObject({ can: false, reason: 'No rig survey has been recorded: the survey in use is the one the registry already holds.' });
    await expect(backend.publishSurveyToRegistry(well.id)).rejects.toThrow(/No rig survey has been recorded/);
  });
  test('the owner sends the rig survey: the registry holds it, its provenance says where it came from and keeps the CRS provenance', async () => {
    const { backend, well, registryWells, db } = await make();
    await backend.addRecord(well.id, run(SEED_REGISTRY_WELLS[0].deviation));
    const { plan } = await backend.registrySurveyPlanFor(well.id);
    expect(plan.can).toBe(true);
    expect(plan.lines.slice(0, 2)).toEqual(['The registry holds 4 station(s) to 3200.0 m MD.', 'The rig survey in use (rig-1, 1 run(s)) holds 6 station(s) to 3330.0 m MD.']);
    const { result, record } = await backend.publishSurveyToRegistry(well.id);
    expect(result).toMatchObject({ stations: 6, provenanceSaved: true });
    const geo = registryWells[0];
    expect(geo.deviation.map((s) => s.md)).toEqual([0, 1400, 1750, 3200, 3300, 3330]);
    expect(geo.deviation[5]).toEqual({ md: 3330, inc: 33, azi: 91 });
    expect(geo.crs_provenance).toMatchObject({ source: 'well-design-studio', datum_transform: 'EPSG:1234', deviation: { source: 'wellsite-studio', ws_well_id: well.id, survey_version: 'rig-1', stations: 6, td_md_m: 3330, azimuth_reference: 'grid', published_by: SEED_USER.name, previous: { stations: 4, td_md_m: 3200 } } });
    expect(registrySurveySourceText(geo.crs_provenance)).toMatch(/^Wellsite Studio live well KETA-2, survey rig-1, 6 stations, sent \d{4}-\d{2}-\d{2} by A\. Geologist$/);
    // the send is a record on the live well, queued for the other devices
    expect(record).toMatchObject({ subtype: SURVEY_PUBLISHED_SUBTYPE });
    expect(record.payload.text).toBe('Survey rig-1 sent to the well registry: 6 station(s) to 3330.0 m MD, replacing 4 station(s).');
    expect(await db.outbox.where('entity_id').equals(record.id).count()).toBe(1);
    // sending again changes nothing and says so
    expect((await backend.registrySurveyPlanFor(well.id)).plan).toMatchObject({ can: false, reason: 'The registry already holds this survey (6 stations).' });
    // the live well's own survey in use is unchanged by the send
    const runs = await backend.listRecords(well.id, { subtype: SURVEY_SUBTYPE });
    expect(activeSurvey(await backend.getWell(well.id), runs).survey.stations).toHaveLength(6);
  });
  test('someone who does not own the registry well is refused before anything is written (negative control)', async () => {
    const { backend, well, registryWells } = await make({ owner: 'someone-else' });
    await backend.addRecord(well.id, run(SEED_REGISTRY_WELLS[0].deviation));
    const { plan } = await backend.registrySurveyPlanFor(well.id);
    expect(plan).toMatchObject({ can: false });
    expect(plan.reason).toMatch(/Only the owner of the registry well can update its survey/);
    await expect(backend.publishSurveyToRegistry(well.id)).rejects.toThrow(/Only the owner/);
    expect(registryWells[0].deviation).toHaveLength(4);
    expect(await backend.listRecords(well.id, { subtype: SURVEY_PUBLISHED_SUBTYPE })).toHaveLength(0);
  });
  test('offline, and a provenance note that cannot be saved, are both said', async () => {
    const { backend, well, transport } = await make();
    await backend.addRecord(well.id, run(SEED_REGISTRY_WELLS[0].deviation));
    transport._server.knobs.provenanceFail = true;
    const { result } = await backend.publishSurveyToRegistry(well.id);
    expect(result).toMatchObject({ stations: 6, provenanceSaved: false, provenanceError: 'Failed to fetch' });
    transport.setOnline(false);
    await expect(backend.registrySurveyPlanFor(well.id)).rejects.toThrow('Comparing with the registry needs a connection.');
  });
  test('the source line reads nothing into a registry well that does not say', () => {
    expect(registrySurveySourceText(null)).toBeNull();
    expect(registrySurveySourceText({ source: 'well-design-studio' })).toBeNull();
    expect(registrySurveySourceText({ deviation: { source: 'somewhere-else' } })).toBeNull();
    expect(registrySurveyPlan({ well: { id: 'w' }, inUse: null, registryWell: null }).reason).toBe('The registry well could not be read.');
  });
});

test('screen: compare with the registry, send, and see what was sent', async () => {
  const { backend, well, registryWells } = await make();
  await backend.addRecord(well.id, run(SEED_REGISTRY_WELLS[0].deviation));
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  fireEvent.click(screen.getByTestId('ws-nav-surveys'));
  await waitFor(() => expect(screen.getByTestId('ws-survey-inuse')).toHaveTextContent('version rig-1'));
  await act(async () => { fireEvent.click(screen.getByTestId('ws-survey-registry-compare')); });
  await waitFor(() => expect(screen.getByTestId('ws-survey-registry-plan')).toHaveTextContent('The registry holds 4 station(s) to 3200.0 m MD.'));
  expect(registryWells[0].deviation).toHaveLength(4);
  await act(async () => { fireEvent.click(screen.getByTestId('ws-survey-registry-send')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Survey rig-1 sent to the well registry: 6 station(s) now held, replacing 4.'));
  expect(registryWells[0].deviation).toHaveLength(6);
  await waitFor(() => expect(screen.getByTestId('ws-survey-registry-last')).toHaveTextContent('Last sent: Survey rig-1 sent to the well registry: 6 station(s) to 3330.0 m MD, replacing 4 station(s).'));
});
