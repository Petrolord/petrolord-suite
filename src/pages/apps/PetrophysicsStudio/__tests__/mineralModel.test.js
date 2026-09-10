/**
 * PT11d: the mineral model service over the in-memory type well: defaults
 * and problems, the run against the MINERAL golden, the template, publish
 * payloads, export columns, and phiSource 'mineral' through the pipeline.
 */
import fs from 'fs';
import path from 'path';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs } from '../services/curveMap';
import {
  defaultMineralModel, modelProblem, engineModel, runMineralModel, ensureMineralTemplate, mineralPublishLogs,
  mineralSources, mineralSummaryLine, fractionName, MINERAL_UNSUITED, MINERAL_TEMPLATE_ID, publishedEndpoint,
} from '../services/mineralModel';
import { MINERAL_ENDPOINTS, solveMineralSample } from '../engine/mineral';
import { computeWellZoned, DEFAULT_PARAMS, PIPELINE_VERSION } from '../engine/pipeline';
import { buildDefaultLayouts, activeTemplate, MINERAL_FIXED_SOURCES, isMineralSource, INPUT_SOURCES } from '../layout/layoutSchema';
import { resolveTracks, sourceStatus } from '../layout/resolveTracks';
import { exportColumns } from '../services/petroExport';
import { FIELDS } from '../services/paramFields';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const goldens = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));
const G = goldens.MINERAL;
const close = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

async function openWell(backend) {
  const well = (await backend.listWells()).find((w) => w.is_own);
  const logs = await backend.listLogs(well.id);
  const raw = {};
  for (const l of logs) raw[l.mnemonic] = await backend.downloadCurve(l);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [key, log] of Object.entries(mapped)) if (log) curves[key] = raw[log.mnemonic];
  return { wellId: well.id, curves, logs: raw, allLogs: logs, inventory: Object.entries(mapped).map(([key, log]) => ({ key, log })), tops: [], intervals: [] };
}

/** The golden's model as a Studio model (its own quartz nphi of 0.0). */
function goldenModel() {
  const m = defaultMineralModel();
  m.minerals = ['quartz', 'calcite', 'clay'];
  for (const k of m.minerals) m.endpoints[k] = { ...m.endpoints[k], rho: G.minerals[k].rho, nphi: G.minerals[k].nphi, pe: G.minerals[k].pe };
  m.fluid = { ...G.fluid };
  return m;
}

test('defaults are the published table, and the problem sentence names what is wrong', async () => {
  const m = defaultMineralModel();
  expect(m.minerals).toEqual(['quartz', 'calcite', 'dolomite']);
  expect(m.endpoints.quartz.pe).toBe(MINERAL_ENDPOINTS.quartz.pe);
  expect(publishedEndpoint('dolomite').rho).toBe(2.87);
  expect(modelProblem(m)).toBeNull();
  expect(modelProblem({ ...m, minerals: ['quartz', 'quartz', 'calcite'] })).toMatch(/must be different/);
  expect(modelProblem({ ...m, minerals: ['quartz', 'calcite'] })).toMatch(/three minerals/);
  expect(modelProblem({ ...m, endpoints: { ...m.endpoints, quartz: { ...m.endpoints.quartz, pe: 'x' } } })).toMatch(/Pe/);
  // the well needs the three tools
  const backend = makeInMemoryBackend();
  const wd = await openWell(backend);
  expect(modelProblem(m, wd)).toBeNull(); // the type well carries PEF since PT11d
  expect(modelProblem(m, { curves: { RHOB: [], NPHI: [] } })).toMatch(/PEF is not mapped/);
  expect(MINERAL_UNSUITED.some((t) => /Gas-bearing/.test(t))).toBe(true);
  expect(fractionName('quartz')).toBe('V_QUARTZ');
  expect(engineModel(m).minerals[0].u).toBeCloseTo(1.81 * ((2.65 + 0.1883) / 1.0704), 9);
});

test('the run on the type well reproduces the MINERAL golden and the gas zone is refused', async () => {
  const backend = makeInMemoryBackend();
  const wd = await openWell(backend);
  const res = runMineralModel(wd, goldenModel());
  expect(res.names).toEqual(['V_QUARTZ', 'V_CALCITE', 'V_CLAY']);
  for (let i = 0; i < wd.curves.DEPT.length; i++) {
    expect(res.outputs.MM_FLAG[i]).toBe(G.MM_FLAG[i]);
    for (const k of ['PHI_MM', 'V_QUARTZ', 'V_CALCITE', 'V_CLAY', 'MM_RES']) {
      if (G[k][i] == null) expect(Number.isNaN(res.outputs[k][i])).toBe(true);
      else expect(close(res.outputs[k][i], G[k][i])).toBe(true);
    }
    // cumulative fractions stack to 1 - phi where accepted
    if (G.MM_FLAG[i] === 0) expect(close(res.outputs.V_CLAY_CUM[i], 1 - res.outputs.PHI_MM[i], 1e-9)).toBe(true);
  }
  expect(res.counts.accepted).toBe(G.MM_FLAG.filter((f) => f === 0).length);
  expect(res.counts.outOfRange).toBeGreaterThan(0);
  expect(mineralSummaryLine(res)).toMatch(/accepted/);
  expect(mineralSummaryLine(res)).toMatch(/out of range/);
  expect(mineralSources(res)).toEqual(['output:V_QUARTZ', 'output:V_CALCITE', 'output:V_CLAY']);
  expect(res.model.minerals).toEqual(['quartz', 'calcite', 'clay']);
  expect(res.pipeline_version).toBe(PIPELINE_VERSION);
  // a run with a singular set throws the sentence rather than returning numbers
  const bad = goldenModel();
  bad.endpoints.calcite = { ...bad.endpoints.quartz };
  const r2 = runMineralModel(wd, bad);
  expect(r2.counts.singular).toBeGreaterThan(0);
  expect(r2.counts.accepted).toBe(0);
});

test('the Mineral model layout, the sources, and the status words', async () => {
  const backend = makeInMemoryBackend();
  const wd = await openWell(backend);
  const res = runMineralModel(wd, goldenModel());
  const layouts = ensureMineralTemplate(buildDefaultLayouts(), res);
  expect(layouts.activeTemplateId).toBe(MINERAL_TEMPLATE_ID);
  const t = activeTemplate(layouts);
  expect(t.tracks.map((x) => x.title)).toEqual(['GR (API)', 'Lithology (quartz, calcite, clay)', 'Porosity (v/v)', 'Residual (excursion)']);
  const lith = t.tracks[1];
  expect(lith.curves.map((c) => c.source)).toEqual(['output:V_QUARTZ_CUM', 'output:V_CALCITE_CUM', 'output:V_CLAY_CUM']);
  expect(lith.fills[0]).toMatchObject({ mode: 'threshold', threshold: { value: 0 } });
  expect(lith.fills[1]).toMatchObject({ mode: 'crossover', a: 'output:V_CALCITE_CUM', b: 'output:V_QUARTZ_CUM' });
  // resolves against the run outputs; empty without them
  const ctx = { curves: wd.curves, logs: wd.logs, outputs: { ...res.outputs }, params: DEFAULT_PARAMS, depth: wd.curves.DEPT, keepUnresolved: true };
  const tracks = resolveTracks(t, ctx);
  expect(tracks.find((x) => x.title.startsWith('Lithology')).curves).toHaveLength(3);
  expect(sourceStatus('output:V_QUARTZ', { curves: wd.curves, logs: wd.logs, outputs: {} })).toMatch(/run Mineral model/);
  expect(sourceStatus('output:PHI_MM', { curves: wd.curves, logs: wd.logs, outputs: {} })).toMatch(/run Mineral model/);
  expect(isMineralSource('output:V_QUARTZ')).toBe(true);
  expect(isMineralSource('output:PHIE')).toBe(false);
  expect(MINERAL_FIXED_SOURCES).toContain('output:MM_FLAG');
  expect(INPUT_SOURCES).toContain('input:PEF');
  // the same minerals keep the user's template; a new set replaces it
  const again = ensureMineralTemplate({ ...layouts, activeTemplateId: 'std-triple-combo' }, res);
  expect(again.templates.length).toBe(layouts.templates.length);
  const other = runMineralModel(wd, { ...goldenModel(), minerals: ['quartz', 'dolomite', 'clay'] });
  const replaced = ensureMineralTemplate(layouts, other);
  expect(activeTemplate(replaced).tracks[1].title).toBe('Lithology (quartz, dolomite, clay)');
  expect(replaced.templates.length).toBe(layouts.templates.length);
});

test('publish payloads carry the whole model and the flags; export columns carry the run', async () => {
  const backend = makeInMemoryBackend();
  const wd = await openWell(backend);
  const res = runMineralModel(wd, goldenModel());
  const logs = mineralPublishLogs(wd, res, { phiSource: 'mineral' }, { projectId: 'p1', interpretationName: 'Test' });
  expect(logs.map((l) => l.mnemonic)).toEqual(['V_QUARTZ', 'V_CALCITE', 'V_CLAY', 'PHI_MM', 'MM_RES', 'MM_FLAG']);
  const q = logs[0];
  expect(q.provenance).toMatchObject({ computed: true, engine: 'petrophysics-studio', operation: 'mineral-model', project_id: 'p1', tools: ['RHOB', 'NPHI', 'PEF'] });
  expect(q.provenance.model.minerals).toEqual(['quartz', 'calcite', 'clay']);
  expect(q.provenance.model.endpoints.clay.nphi).toBe(0.3);
  expect(q.provenance.counts.accepted).toBe(res.counts.accepted);
  expect(q.provenance.flags[2]).toBe('out of range');
  expect(q.provenance.residual_definition).toMatch(/excursion/);
  expect(q.provenance.input_log_ids).toHaveLength(3);
  expect(q.data).toBeInstanceOf(Float32Array);
  const saved = await backend.publishCurves(wd.wellId, logs, 'p1');
  expect(saved).toHaveLength(6);
  const cols = exportColumns(wd, { ...res.outputs });
  const keys = cols.map((c) => c.key);
  expect(keys).toEqual(expect.arrayContaining(['V_QUARTZ', 'V_CALCITE', 'V_CLAY', 'PHI_MM', 'MM_RES', 'MM_FLAG']));
  expect(keys).not.toContain('V_QUARTZ_CUM');
});

test('phiSource mineral takes PHIT from the run through the zoned pipeline, and without a run says so; never a default', async () => {
  const backend = makeInMemoryBackend();
  const wd = await openWell(backend);
  const res = runMineralModel(wd, goldenModel());
  const withMm = computeWellZoned({ ...wd.curves, PHI_MM: res.outputs.PHI_MM }, { ...DEFAULT_PARAMS, phiSource: 'mineral' }, []);
  for (let i = 0; i < wd.curves.DEPT.length; i++) {
    if (res.outputs.MM_FLAG[i] !== 0) { expect(Number.isNaN(withMm.outputs.PHIT[i])).toBe(true); continue; }
    expect(Object.is(withMm.outputs.PHIT[i], res.outputs.PHI_MM[i])).toBe(true);
  }
  const without = computeWellZoned(wd.curves, { ...DEFAULT_PARAMS, phiSource: 'mineral' }, []);
  expect(without.outputs.PHIT).toBeUndefined();
  expect(without.missing).toContain('mineral porosity inputs');
  expect(DEFAULT_PARAMS.phiSource).toBe('density');
  const phiField = FIELDS.find((f) => f.key === 'phiSource');
  expect(phiField.options).toContain('mineral');
  const hint = FIELDS.find((f) => f.testId === 'petro-param-phi-mineral');
  expect(hint.show({ phiSource: 'mineral' })).toBe(true);
  expect(hint.hint({ phiSource: 'mineral' })).toMatch(/never a fallback/);
  expect(hint.show({ phiSource: 'density' })).toBe(false);
  // the sample-level API agrees with the curve loop
  const i = 100;
  const one = solveMineralSample({ rhob: wd.curves.RHOB[i], nphi: wd.curves.NPHI[i], pef: wd.curves.PEF[i] }, engineModel(goldenModel()));
  expect(close(one.phi, res.outputs.PHI_MM[i])).toBe(true);
});
