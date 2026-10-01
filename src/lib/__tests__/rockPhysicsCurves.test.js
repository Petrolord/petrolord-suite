/**
 * RP-U1-009: Rock Physics' substituted curves reach Seismolord's synthetics.
 * The publish is Rock Physics' own (preparePublishLogs on the oracle brine
 * sand, brine to gas); the reader is the one the synthetics panel uses
 * (substitutedCurveKind, normalizeInputCurve); the impedance and RC come
 * from Seismolord's engine.
 */
import { substitutedCurveKind, substitutedCurveLabel } from '@/lib/rockPhysicsCurves';
import { guessCurveKind } from '@/pages/apps/WellDataManager/engine/lasImport';
import { normalizeInputCurve } from '@/components/wells/curveUnits';
import { slownessToVelocity, computeImpedance } from '../../../packages/engines/engines/seismolord/synthetics';
import { preparePublishLogs } from '@/pages/apps/RockPhysicsStudio/services/publish';
import { substituteZone, DEFAULT_SCENARIO, DEFAULT_ROCK } from '@/pages/apps/RockPhysicsStudio/services/scenario';

// shale over the oracle brine sand (constant layers)
const n = 40;
const depth = Array.from({ length: n }, (_, i) => 2000 + i);
const sand = (i) => i >= 20;
const model = {
  n, depth, vsSource: 'measured', phiBasis: 'effective', phiCurve: 'PHIE',
  vp: depth.map((_, i) => (sand(i) ? 3200 : 2900)),
  vs: depth.map((_, i) => (sand(i) ? 1800 : 1330)),
  rho: depth.map((_, i) => (sand(i) ? 2250 : 2290)),
  phi: depth.map((_, i) => (sand(i) ? 0.25 : 0.08)),
  vsh: depth.map((_, i) => (sand(i) ? 0 : 0.9)),
  sw: null,
};
const rock = { ...DEFAULT_ROCK, kminOverrideGPa: '37' };
const zoneIdx = depth.map((_, i) => i).filter(sand);
const sub = substituteZone(model, zoneIdx, DEFAULT_SCENARIO, rock);
const logs = preparePublishLogs(model, sub, zoneIdx, { name: 'BRINE SAND', top_md_m: 2020, base_md_m: 2039 }, { scenario: DEFAULT_SCENARIO, rock, kmin: 37e9 })
  .map((l) => ({ ...l, unit: l.unit, mnemonic: l.mnemonic }));
const byName = (m) => logs.find((l) => l.mnemonic === m);

test('the publish carries DT_SUB in us/m beside VP_SUB, VS_SUB and RHOB_SUB', () => {
  expect(logs.map((l) => l.mnemonic)).toEqual(['VP_SUB', 'VS_SUB', 'RHOB_SUB', 'DT_SUB']);
  const dt = byName('DT_SUB');
  expect(dt.unit).toBe('US/M');
  expect(dt.data[25]).toBeCloseTo(1e6 / byName('VP_SUB').data[25], 2);
  expect(dt.provenance.fluids).toBe('100% brine to 100% gas');
});

test('a reader lists DT_SUB as a sonic and RHOB_SUB as a density by their provenance', () => {
  expect(substitutedCurveKind(byName('DT_SUB'))).toBe('sonic');
  expect(substitutedCurveKind(byName('RHOB_SUB'))).toBe('density');
  expect(substitutedCurveKind(byName('VP_SUB'))).toBeNull();
  expect(substitutedCurveKind({ mnemonic: 'DT_SUB', provenance: { computed: true, engine: 'other' } })).toBeNull();
  expect(substitutedCurveLabel(byName('DT_SUB'))).toMatch(/fluid substituted: 100% brine to 100% gas in BRINE SAND/);
  // negative control: the registry's kind guess alone never offered them
  expect(guessCurveKind('DT_SUB')).toBeNull();
  expect(guessCurveKind('RHOB_SUB')).toBeNull();
});

test('through the synthetics door: the RC at the sand top is the substituted case', () => {
  const dt = normalizeInputCurve('DT', byName('DT_SUB'), byName('DT_SUB').data).data;
  const rhoR = normalizeInputCurve('RHOB', byName('RHOB_SUB'), byName('RHOB_SUB').data);
  expect(rhoR.decision.readAs).toBe('KG/M3');
  const z = computeImpedance(slownessToVelocity(dt), rhoR.data);
  const rc = (z[20] - z[19]) / (z[20] + z[19]);
  const zUp = 2900 * 2.29;
  const zGas = sub.vp[20] * (sub.rho[20] / 1000);
  expect(z[20]).toBeCloseTo(zGas, 0);
  expect(rc).toBeCloseTo((zGas - zUp) / (zGas + zUp), 5);
  // the in-situ (brine) RC is positive, the gas case negative: the synthetic shows the fluid
  const zBrine = 3200 * 2.25;
  expect((zBrine - zUp) / (zBrine + zUp)).toBeGreaterThan(0);
  expect(rc).toBeLessThan(0);
});
