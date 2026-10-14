// Publish state (2026-10-14): the open prognosis against the curves published
// on the well, through the shipped publish preparation (preparePublishLogs) so
// the comparison reads exactly what a reader would read.
import { publishedSet, compareWithPublished, publishStateText } from '../services/publishState';
import { preparePublishLogs } from '../services/publish';
import { computeProfile } from '../engine/profile';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildProfileInput, mapLogs, normalizePpCurves } from '../services/prep';

async function harness() {
  const b = makeInMemoryBackend();
  const [w] = await b.listWells();
  const logs = await b.listLogs(w.id);
  const m = mapLogs(logs);
  const [depth, dt, rho] = await Promise.all([b.downloadCurve(m.DEPT), b.downloadCurve(m.DT), m.RHOB ? b.downloadCurve(m.RHOB) : null]);
  const norm = normalizePpCurves({ depth, dt, rho, dtLog: m.DT, rhoLog: m.RHOB });
  const project = await b.loadProject();
  const params = { ...project.params };
  const input = buildProfileInput({ depth: norm.depth, dt: norm.dt, rho: norm.rho }, norm.units, { mudlineMdM: params.mudlineMdM });
  return { b, w, input, params };
}

const asPublished = (prepared, at = '2026-10-14T10:02:00Z') => {
  const rows = prepared.map((l, k) => ({ id: `l${k}`, mnemonic: l.mnemonic, start_md_m: l.startMdM, step_m: l.stepM, created_at: at, provenance: l.provenance }));
  return { set: publishedSet(rows), values: Object.fromEntries(prepared.map((l) => [l.mnemonic, l.data])) };
};

describe('publish state', () => {
  test('the prognosis just published matches itself (every sample compared)', async () => {
    const { input, params } = await harness();
    const r = computeProfile({ ...input, params });
    const pub = asPublished(preparePublishLogs(input, r, params, { projectId: 'p1', inputLogIds: [] }));
    const cmp = compareWithPublished(input, r, params, pub);
    expect(cmp.compared).toBe(2 * input.zBmlM.length);
    expect(cmp.same).toBe(true);
    expect(cmp.maxPpg).toBeLessThan(0.005); // float32 storage only
    expect(publishStateText({ set: pub.set, cmp, projectId: 'p1', wellName: 'W' })).toMatchObject({ tone: 'ok', chip: 'Published, matches' });
  });

  test('a recalibration that is not published is caught, with its size and depth', async () => {
    const { input, params } = await harness();
    const r0 = computeProfile({ ...input, params });
    const pub = asPublished(preparePublishLogs(input, r0, params, { projectId: 'p1', inputLogIds: [] }));
    const p1 = { ...params, eatonN: params.eatonN + 0.5 };
    const r1 = computeProfile({ ...input, params: p1 });
    const cmp = compareWithPublished(input, r1, p1, pub);
    expect(cmp.same).toBe(false);
    expect(cmp.maxPpg).toBeGreaterThan(0.1);
    // the largest PP difference is where the overpressure is (deepest ramp sample)
    expect(cmp.atBmlM).toBeGreaterThan(2500);
    const t = publishStateText({ set: pub.set, cmp, projectId: 'p1', wellName: 'W', fmtZ: (z) => `${Math.round(z)} m bml` });
    expect(t.tone).toBe('warn');
    expect(t.chip).toBe(`Unpublished changes (${cmp.maxPpg.toFixed(2)} ppg)`);
    expect(t.text).toMatch(/still use the published one until you publish/);
    expect(t.text).toMatch(/2026-10-14 10:02 UTC/);
    expect(t.text).not.toMatch(/—/);
  });

  test('negative control: with no published curve values nothing is compared and nothing is claimed', async () => {
    const { input, params } = await harness();
    const r = computeProfile({ ...input, params });
    const pub = asPublished(preparePublishLogs(input, r, params, { projectId: 'p1', inputLogIds: [] }));
    const cmp = compareWithPublished(input, r, params, { set: pub.set, values: {} });
    expect(cmp.compared).toBe(0);
    expect(cmp.same).toBe(false);
    expect(publishStateText({ set: pub.set, cmp, wellName: 'W' }).chip).toBe('Published');
  });

  test('publishedSet: only this studio\'s curves, newest of each; none says so', () => {
    const logs = [
      { mnemonic: 'PP', created_at: '2026-10-01', provenance: { engine: 'pore-pressure-studio', project_id: 'a' } },
      { mnemonic: 'PP', created_at: '2026-10-05', provenance: { engine: 'pore-pressure-studio', project_id: 'a', pipeline_version: 'pp-1.1.0' } },
      { mnemonic: 'PP', created_at: '2026-10-09', provenance: {} },
      { mnemonic: 'DT', created_at: '2026-10-09', provenance: { engine: 'pore-pressure-studio' } },
    ];
    const s = publishedSet(logs);
    expect(s.PP.created_at).toBe('2026-10-05');
    expect(s.publishedAt).toBe('2026-10-05');
    expect(s.pipelineVersion).toBe('pp-1.1.0');
    expect(publishedSet([{ mnemonic: 'GR', provenance: {} }])).toBeNull();
    expect(publishStateText({ set: null, wellName: 'Ekene-1' }).chip).toBe('Not published');
    expect(publishStateText({ set: s, cmp: { compared: 1, same: true, maxPpg: 0 }, projectId: 'b', wellName: 'W' }).text).toMatch(/another project/);
  });
});
