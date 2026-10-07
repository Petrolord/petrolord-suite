// PT9g: low/mid/high — mid IS the ordinary pipeline, a scenario patch
// wins in every zone, the pessimistic default really is pessimistic on
// the type well, twins carry the suffix, the CSV has a row per zone and
// case, and the template is created once and reactivated after.

import fs from 'fs';
import path from 'path';
import { computeWellZoned, DEFAULT_PARAMS } from '../engine/pipeline';
import { buildDefaultLayouts } from '../layout/layoutSchema';
import {
  defaultScenarios, runScenarios, scenarioOutputs, scenarioSummaries, scenariosCsv, ensureScenarioTemplate, caseZoneList, SCENARIO_TEMPLATE_ID,
} from '../services/scenarios';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));
const curves = { DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'), NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT') };
const zones = [{ id: 'a', name: 'SAND A', top_md_m: 2010, base_md_m: 2030 }, { id: 'b', name: 'SAND B', top_md_m: 2050, base_md_m: 2080 }];

test('mid is the plain zoned pipeline, sample for sample', () => {
  const sc = defaultScenarios(DEFAULT_PARAMS);
  const zl = [{ top: 2010, base: 2030, params: { rw: 0.03 } }];
  const r = runScenarios(curves, DEFAULT_PARAMS, zl, sc);
  const plain = computeWellZoned(curves, DEFAULT_PARAMS, zl);
  for (const k of Object.keys(plain.outputs)) {
    expect(Array.from(r.mid.outputs[k]).map((v) => (Number.isNaN(v) ? null : v))).toEqual(Array.from(plain.outputs[k]).map((v) => (Number.isNaN(v) ? null : v)));
  }
});

test('the default low case is pessimistic and high optimistic on the type well zones', () => {
  const sc = defaultScenarios(DEFAULT_PARAMS);
  const r = runScenarios(curves, DEFAULT_PARAMS, [], sc);
  const s = scenarioSummaries(curves, r, DEFAULT_PARAMS, zones, {}, sc);
  for (const z of zones) {
    expect(s[z.id].low.net_m).toBeLessThanOrEqual(s[z.id].mid.net_m);
    expect(s[z.id].mid.net_m).toBeLessThanOrEqual(s[z.id].high.net_m);
  }
  // the gas sand keeps pay in every case, so its averages order too
  // (SAND B, oil to water, loses all pay in the low case: net 0, no average)
  const a = s.a;
  expect(a.low.phi_avg).toBeLessThan(a.mid.phi_avg);
  expect(a.mid.phi_avg).toBeLessThan(a.high.phi_avg);
  expect(a.low.sw_avg).toBeGreaterThan(a.mid.sw_avg);
  expect(a.mid.sw_avg).toBeGreaterThan(a.high.sw_avg);
  // PETRO-M-003: shale volume follows the case at every sample (low more shale, high less); the
  // clean line used to move the wrong way. Net-averaged Vsh is no test: the net interval itself changes.
  const vsh = (c) => r[c].outputs.VSH;
  let lowLess = 0; let highMore = 0; let lowMore = 0; let highLess = 0;
  for (let i = 0; i < vsh('mid').length; i++) {
    if (!Number.isFinite(vsh('mid')[i])) continue;
    if (vsh('low')[i] < vsh('mid')[i] - 1e-12) lowLess += 1;
    if (vsh('high')[i] > vsh('mid')[i] + 1e-12) highMore += 1;
    if (vsh('low')[i] > vsh('mid')[i] + 1e-12) lowMore += 1;
    if (vsh('high')[i] < vsh('mid')[i] - 1e-12) highLess += 1;
  }
  expect(lowLess).toBe(0); // never less shale in the low case (clamped samples tie)
  expect(highMore).toBe(0);
  expect(lowMore).toBeGreaterThan(20);
  expect(highLess).toBeGreaterThan(20);
  expect(s.b.low.net_m).toBe(0);
});

test('a scenario patch wins over a zone override for the parameter it names', () => {
  const zl = [{ top: 2010, base: 2030, params: { rw: 0.03, m: 1.9 } }];
  const low = caseZoneList(zl, { low: { rw: 0.1 } }, 'low');
  expect(low[0].params).toEqual({ rw: 0.1, m: 1.9 });
  expect(caseZoneList(zl, { low: { rw: 0.1 } }, 'mid')).toBe(zl);
});

test('twins carry the suffix; CSV has a row per zone and case; template created once', () => {
  const sc = defaultScenarios(DEFAULT_PARAMS);
  const r = runScenarios(curves, DEFAULT_PARAMS, [], sc);
  const twins = scenarioOutputs(r);
  expect(Object.keys(twins).sort()).toEqual(['BVW_HIGH', 'BVW_LOW', 'KPERM_HIGH', 'KPERM_LOW', 'PAY_HIGH', 'PAY_LOW', 'PHIE_HIGH', 'PHIE_LOW', 'PHIT_HIGH', 'PHIT_LOW', 'SW_HIGH', 'SW_LOW']);
  const s = scenarioSummaries(curves, r, DEFAULT_PARAMS, zones, {}, sc);
  const csv = scenariosCsv(zones, s);
  const lines = csv.trim().split('\n');
  expect(lines).toHaveLength(1 + 2 * 3);
  expect(lines[0]).toBe('zone,case,top_m,base_m,gross_m,net_m,ntg,phi_avg,vsh_avg,sw_avg,k_gm_md');
  expect(lines[1].startsWith('"SAND A",low,')).toBe(true);

  const l0 = buildDefaultLayouts();
  const l1 = ensureScenarioTemplate(l0);
  expect(l1.templates).toHaveLength(l0.templates.length + 1);
  expect(l1.activeTemplateId).toBe(SCENARIO_TEMPLATE_ID);
  const back = { ...l1, activeTemplateId: l0.activeTemplateId };
  const l2 = ensureScenarioTemplate(back);
  expect(l2.templates).toHaveLength(l1.templates.length);
  expect(l2.activeTemplateId).toBe(SCENARIO_TEMPLATE_ID);
  expect(ensureScenarioTemplate(l2)).toBe(l2);
});

test('PETRO-M-007: scenario zone summaries take the vertical thickness, so TVT matches the zone card on a deviated well', () => {
  const sc = defaultScenarios(DEFAULT_PARAMS);
  const r = runScenarios(curves, DEFAULT_PARAMS, [], sc);
  const n = curves.DEPT.length;
  // a 60 degree well: each sample's vertical thickness is half its MD thickness
  const md = Float64Array.from({ length: n }, (_, i) => (i === 0 ? curves.DEPT[1] - curves.DEPT[0] : curves.DEPT[i] - curves.DEPT[i - 1]));
  const vth = Float64Array.from(md, (t) => t * 0.5);
  const s = scenarioSummaries(curves, r, DEFAULT_PARAMS, zones, {}, sc, { vth });
  const z = zones[0].id;
  expect(s[z].mid.tvt_source).toBe('deviation survey');
  expect(s[z].mid.gross_tvt_m).toBeLessThan(0.6 * s[z].mid.gross_m);
  // negative control: without it TVT equals MD (the old behaviour)
  const plain = scenarioSummaries(curves, r, DEFAULT_PARAMS, zones, {}, sc);
  expect(plain[z].mid.gross_tvt_m).toBeCloseTo(plain[z].mid.gross_m, 9);
});
