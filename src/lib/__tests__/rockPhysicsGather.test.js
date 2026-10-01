/**
 * RP-U2-012 (Seismolord U2-020, second half), 2026-10-01: the
 * rock-physics-gather contract. Rock Physics packs its zone gather, the
 * payload survives JSON (it lives in a jsonb column), and a reader gets the
 * same traces back or the reason it cannot; nothing is assumed about a
 * payload. The chain test runs Rock Physics' own gather through the
 * contract and reads it as Seismolord does.
 */
import {
  packGather, readGather, describeGather, loadGatherForWell, GATHER_CONTRACT, GATHER_CONTRACT_VERSION, MAX_GATHER_SAMPLES,
} from '../rockPhysicsGather';
import { makeInMemoryBackend } from '@/pages/apps/RockPhysicsStudio/services/inMemoryBackend';
import { mapLogs, buildModel } from '@/pages/apps/RockPhysicsStudio/services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK } from '@/pages/apps/RockPhysicsStudio/services/scenario';
import { computeZoneResult } from '@/pages/apps/RockPhysicsStudio/services/zoneResult';
import { zoneGather } from '@/pages/apps/RockPhysicsStudio/services/gather';
import { projectRowFromState } from '@/pages/apps/RockPhysicsStudio/services/projectState';
import { planImport } from '@/lib/portability/importPackage';

async function rpGather(name = 'KETA RP-1') {
  const backend = makeInMemoryBackend();
  const well = (await backend.listWells()).find((w) => w.name === name);
  const logs = await backend.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  const model = buildModel(curves, mapped);
  const zone = (await backend.listZones(well.id))[0];
  const res = computeZoneResult(model, zone, DEFAULT_SCENARIO, { ...DEFAULT_ROCK, kminOverrideGPa: '37' });
  return { well, model, zone, gather: zoneGather(model, zone, res.merged, {}, well) };
}

test('chain: the Rock Physics gather packs, survives JSON, and reads back trace for trace', async () => {
  const { well, model, zone, gather } = await rpGather();
  const payload = packGather({ well, zone, gather, substitutedLabel: 'Zone with 100% gas', model, now: new Date('2026-10-01T12:00:00Z'), pipelineVersion: 'rp-1.2.0' });
  expect(payload.contract).toBe(GATHER_CONTRACT);
  expect(payload.version).toBe(GATHER_CONTRACT_VERSION);
  expect(payload.well_id).toBe(well.id);
  expect(payload.cases.map((c) => c.key)).toEqual(['in-situ', 'substituted']);
  const stored = JSON.parse(JSON.stringify(payload));
  const r = readGather(stored);
  expect(r.ok).toBe(true);
  const g = r.gather;
  expect(g.angles).toEqual(gather.angles);
  expect(g.dtMs).toBe(gather.dtMs);
  expect(g.cases[1].label).toBe('Zone with 100% gas');
  expect(g.cases[0].topSample).toBe(gather.inSitu.topSample);
  // every sample of every trace, to the six significant figures the contract keeps
  let worst = 0;
  gather.inSitu.traces.forEach((tr, a) => tr.forEach((v, k) => { worst = Math.max(worst, Math.abs(v - g.cases[0].traces[a][k])); }));
  gather.substituted.traces.forEach((tr, a) => tr.forEach((v, k) => { worst = Math.max(worst, Math.abs(v - g.cases[1].traces[a][k])); }));
  expect(worst).toBeLessThan(1e-6);
  expect(g.gain).toBeCloseTo(gather.gain, 6);
  expect(g.cases[1].intercept).toBeCloseTo(gather.substituted.fit.a, 6);
  expect(g.cases[1].gradient).toBeCloseTo(gather.substituted.fit.b, 6);
  // the gas case still brightens with angle after the round trip (the demo picture)
  expect(Math.abs(g.cases[1].picks[8])).toBeGreaterThan(Math.abs(g.cases[1].picks[0]));
  expect(describeGather(g)).toBe('Rock Physics angle gather of BRINE SAND · 9 angles to 40 degrees · exact Zoeppritz · Ricker 25 Hz, zero phase · published 2026-10-01');
  // small enough for a jsonb cell
  expect(JSON.stringify(payload).length).toBeLessThan(60000);
});

test('estimated inputs travel with the gather (PL4)', async () => {
  const { well, model, zone, gather } = await rpGather('AKOMA-2 (org shared)');
  const g = readGather(JSON.parse(JSON.stringify(packGather({ well, zone, gather, model })))).gather;
  expect(g.vsSource).toBe('estimated');
  expect(g.vpSource).toBe('measured');
  expect(describeGather(g)).toMatch(/Vs estimated/);
  expect(g.notes.join(' ')).toMatch(/Vs is estimated/);
  expect(readGather(JSON.parse(JSON.stringify(packGather({ well, zone, gather, model: { ...model, vpSource: 'estimated' } })))).gather.vpSource).toBe('estimated');
});

test('hostile payloads are refused with a reason; nothing is drawn from a guess', async () => {
  const { well, model, zone, gather } = await rpGather();
  const good = JSON.parse(JSON.stringify(packGather({ well, zone, gather, model })));
  const bad = (patch) => readGather({ ...good, ...patch });
  expect(readGather(null)).toEqual({ ok: false, reason: 'No gather has been published.' });
  expect(readGather('x').ok).toBe(false);
  expect(bad({ contract: 'other' }).reason).toMatch(/not a Rock Physics gather/);
  expect(bad({ version: 2 }).reason).toMatch(/contract version 2; this reader knows version 1\. Publish it again/);
  expect(bad({ angles_deg: [] }).reason).toMatch(/angle list/);
  expect(bad({ angles_deg: [0, 95] }).reason).toMatch(/angle list/);
  expect(bad({ dt_ms: 0 }).reason).toMatch(/time sampling/);
  expect(bad({ cases: [] }).reason).toMatch(/no traces/);
  expect(bad({ cases: [{ ...good.cases[0], traces: good.cases[0].traces.slice(1) }] }).reason).toMatch(/one trace per angle/);
  expect(bad({ cases: [{ ...good.cases[0], traces: good.cases[0].traces.map((t, i) => (i ? t : [...t, null])) }] }).reason).toMatch(/not numeric/);
  expect(bad({ cases: [{ ...good.cases[0], traces: good.cases[0].traces.map((t, i) => (i ? t : t.slice(2))) }] }).reason).toMatch(/differ in length/);
  // a missing gain is rebuilt from the traces; missing picks and labels are tolerated
  const lean = bad({ gain: undefined, cases: [{ key: 'in-situ', traces: good.cases[0].traces }] });
  expect(lean.ok).toBe(true);
  expect(lean.gather.gain).toBeGreaterThan(0);
  expect(lean.gather.cases[0].label).toBe('In situ');
  expect(lean.gather.cases[0].picks).toBeNull();
  // packing refuses what a reader would refuse
  expect(() => packGather({ well, zone, gather: { error: 'Fewer than two usable samples.' }, model })).toThrow(/Fewer than two usable samples/);
  const long = { ...gather, inSitu: { ...gather.inSitu, traces: gather.inSitu.traces.map(() => new Float32Array(MAX_GATHER_SAMPLES + 1)) } };
  expect(() => packGather({ well, zone, gather: long, model })).toThrow(/at most 4000 can be published\. Shorten the pad/);
});

test('the reader finds the newest gather for the well in the user\'s projects, and only that well\'s', async () => {
  const { well, model, zone, gather } = await rpGather();
  const payload = JSON.parse(JSON.stringify(packGather({ well, zone, gather, model })));
  const calls = [];
  const fake = (rows, error = null) => ({
    from(table) {
      const q = {
        select(cols) { calls.push({ table, cols }); return q; },
        contains(col, v) { calls.push({ col, v }); return q; },
        order() { return q; },
        limit() { return Promise.resolve({ data: rows, error }); },
      };
      return q;
    },
  });
  const ok = await loadGatherForWell(fake([{ id: 'p1', well_ids: [well.id], avo: { published_gather: payload } }]), well.id);
  expect(ok.ok).toBe(true);
  expect(ok.gather.wellName).toBe('KETA RP-1');
  expect(calls[0].table).toBe('rp_projects');
  expect(calls[1]).toEqual({ col: 'well_ids', v: [well.id] });
  // a project now on this well whose gather was published for another well is not shown
  expect((await loadGatherForWell(fake([{ id: 'p1', well_ids: ['other'], avo: { published_gather: payload } }]), 'other')).reason).toMatch(/No gather has been published for this well/);
  expect((await loadGatherForWell(fake([{ id: 'p1', well_ids: [well.id], avo: {} }]), well.id)).ok).toBe(false);
  expect((await loadGatherForWell(fake([], { message: 'permission denied' }), well.id)).reason).toMatch(/Could not read Rock Physics projects: permission denied/);
  expect((await loadGatherForWell(fake([]), null)).ok).toBe(false);
});

test('a .pld import carries the gather with its project and points it at the imported well', async () => {
  const { model, zone, gather } = await rpGather();
  const WELL = '11111111-1111-4111-8111-111111111111';
  const SRC = '44444444-4444-4444-8444-444444444444';
  const payload = JSON.parse(JSON.stringify(packGather({ well: { id: WELL, name: 'W' }, zone, gather, model })));
  const state = { scenario: DEFAULT_SCENARIO, rock: DEFAULT_ROCK, avo: { mode: 'top', published_gather: payload }, wedge: {}, wellId: WELL, zoneId: null };
  const pkg = {
    manifest: { package_id: '66666666-6666-4666-8666-666666666666', name: 't', source: { user_id: SRC }, created_at: '2026-10-01T00:00:00Z', notes: [] },
    tables: {
      geo_wells: [{ id: WELL, user_id: SRC, organization_id: null, name: 'W' }],
      rp_projects: [{ id: '55555555-5555-4555-8555-555555555555', user_id: SRC, name: 'Default project', ...projectRowFromState(state) }],
    },
    blobs: new Map(),
  };
  const plan = planImport(pkg, { userId: '77777777-7777-4777-8777-777777777777', organizationId: null });
  const row = plan.planned.rp_projects[0];
  const newWell = plan.planned.geo_wells[0].id;
  expect(newWell).not.toBe(WELL);
  expect(row.well_ids).toEqual([newWell]);
  expect(row.avo.published_gather.well_id).toBe(newWell);
  expect(readGather(row.avo.published_gather).ok).toBe(true);
});
