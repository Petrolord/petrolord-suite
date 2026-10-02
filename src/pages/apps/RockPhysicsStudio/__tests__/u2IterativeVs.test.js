/**
 * RP-U2-005 (RP-U1-018), 2026-10-01.
 *
 * Iterative Vs: a gas sand with no shear log whose truth is known (its
 * brine state lies on the Greenberg-Castagna line; the logs are its
 * Gassmann gas state through the engine). The iteration recovers the true
 * Vs; the direct regression on the gas Vp does not (negative control), and
 * taking the rock back to brine then returns the brine truth.
 */
import { buildModel, zoneIndices } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK, substituteZone, makeSampler } from '../services/scenario';
import { applyIterativeVs, shearSourceText } from '../services/iterativeVs';
import { preparePublishLogs } from '../services/publish';
import { reportHeader } from '../services/substitutionCsv';
import { brine, gas, woodMix } from '../engine/fluids';
import { substituteVels } from '../engine/gassmann';
import { gcSandShaleVs } from '../engine/vsEstimate';
import { MINERALS } from '../engine/minerals';

const cond = DEFAULT_SCENARIO.conditions;
const br = brine(cond.tC, cond.pMPa, cond.salinity);
const g = gas(cond.tC, cond.pMPa, 0.6);
const SW = 0.2;
const mixed = woodMix([{ ...br, sat: SW }, { ...g, sat: 1 - SW }]);
const KMIN = MINERALS.quartz.k;
const PHI = 0.25;

// 2000 to 2060 m at 0.5 m: shale, then a gas sand 2020 to 2040 m, then shale
function gasWell({ swLog }) {
  const depth = []; const dt = []; const rhob = []; const phie = []; const vsh = []; const sw = [];
  const truth = { vs: [], vpBrine: [] };
  for (let d = 2000; d <= 2060 + 1e-9; d += 0.5) {
    const sand = d >= 2020 && d <= 2040;
    let vp; let vs; let rho;
    if (sand) {
      const vpB = 3300; const vsB = gcSandShaleVs(vpB, 0); const rhoB = (1 - PHI) * 2650 + PHI * br.rho;
      const hc = substituteVels(vpB, vsB, rhoB, KMIN, PHI, br, mixed);
      vp = hc.vp; vs = hc.vs; rho = hc.rho;
      truth.vpBrine.push(vpB);
    } else { vp = 2900; vs = gcSandShaleVs(2900, 1); rho = 2400; truth.vpBrine.push(NaN); }
    truth.vs.push(vs);
    depth.push(d); dt.push(1e6 / vp); rhob.push(rho / 1000); phie.push(sand ? PHI : 0.06); vsh.push(sand ? 0 : 1); sw.push(sand ? SW : 1);
  }
  const curves = { DEPT: depth, DT: dt, RHOB: rhob, PHIE: phie, VSH: vsh, ...(swLog ? { SW: sw } : {}) };
  const mapped = {
    DEPT: { mnemonic: 'DEPT', unit: 'M' }, DT: { mnemonic: 'DT', unit: 'US/M' }, RHOB: { mnemonic: 'RHOB', unit: 'G/C3' },
    PHIE: { mnemonic: 'PHIE', unit: 'V/V' }, VSH: { mnemonic: 'VSH', unit: 'V/V' }, ...(swLog ? { SW: { mnemonic: 'SW', unit: 'V/V' } } : {}),
  };
  return { model: buildModel(curves, mapped), truth };
}
const ZONE = { name: 'GAS SAND', top_md_m: 2020, base_md_m: 2040 };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

describe('U2-005 iterative Vs', () => {
  test('with the SW log: the gas sand gets its true Vs; direct Greenberg-Castagna is more than 10 percent low', () => {
    const { model, truth } = gasWell({ swLog: true });
    expect(model.vsSource).toBe('estimated');
    const i = model.depth.indexOf(2030);
    // negative control: the direct regression on the gas Vp
    expect(rel(model.vs[i], truth.vs[i])).toBeGreaterThan(0.1);
    expect(model.vs[i]).toBeLessThan(truth.vs[i]);
    const it = applyIterativeVs(model, DEFAULT_SCENARIO, DEFAULT_ROCK, null);
    expect(it.vsMethod).toBe('iterative');
    expect(it.vsIter).toEqual({ applied: 41, failed: 0, firstError: null, scope: 'sw-log' });
    for (const k of zoneIndices(model.depth, 2020, 2040)) expect(rel(it.vs[k], truth.vs[k])).toBeLessThan(1e-5);
    // the shale (Sw 1, and outside the limits) keeps the direct estimate exactly
    expect(it.vs[0]).toBe(model.vs[0]);
    // the base model is not mutated
    expect(model.vsMethod).toBeUndefined();
    // back to brine: the brine truth Vp returns (3300 m/s); with the direct Vs it does not
    const toBrine = { ...DEFAULT_SCENARIO, fluidB: { sw: 1, hc: { kind: 'gas', gravity: 0.6 } } };
    const idx = zoneIndices(model.depth, 2020, 2040);
    const good = substituteZone(it, idx, toBrine, DEFAULT_ROCK);
    const bad = substituteZone(model, idx, toBrine, DEFAULT_ROCK);
    expect(rel(good.vp[i], 3300)).toBeLessThan(1e-5);
    expect(rel(bad.vp[i], 3300)).toBeGreaterThan(0.01);
  });

  test('with a typed Sw: only the selected zone is iterated; switching it off keeps the direct estimate', () => {
    const { model, truth } = gasWell({ swLog: false });
    const typed = { ...DEFAULT_SCENARIO, fluidA: { sw: SW, swFromLog: true, hc: { kind: 'gas', gravity: 0.6 } } };
    expect(applyIterativeVs(model, typed, DEFAULT_ROCK, null)).toBe(model); // no zone, nothing to scope it to
    const it = applyIterativeVs(model, typed, DEFAULT_ROCK, ZONE);
    expect(it.vsIter.scope).toBe('zone');
    expect(it.vsIter.applied).toBe(41);
    const i = model.depth.indexOf(2030);
    expect(rel(it.vs[i], truth.vs[i])).toBeLessThan(1e-5);
    expect(applyIterativeVs(model, typed, { ...DEFAULT_ROCK, iterativeVs: false }, ZONE)).toBe(model);
    // brine in situ (the default): nothing to iterate
    expect(applyIterativeVs(model, DEFAULT_SCENARIO, DEFAULT_ROCK, ZONE)).toBe(model);
    // a measured shear log is never touched
    expect(applyIterativeVs({ ...model, vsSource: 'measured' }, typed, DEFAULT_ROCK, ZONE).vsMethod).toBeUndefined();
    expect(applyIterativeVs(null, typed, DEFAULT_ROCK, ZONE)).toBeNull();
  });

  test('samples the engine refuses keep the direct estimate and are counted; the words follow', () => {
    const { model } = gasWell({ swLog: true });
    // a mineral softer than the rock: Gassmann refuses every sand sample
    const soft = { ...DEFAULT_ROCK, kminOverrideGPa: '5' };
    const it = applyIterativeVs(model, DEFAULT_SCENARIO, soft, null);
    expect(it.vsIter.applied).toBe(0);
    expect(it.vsIter.failed).toBe(41);
    expect(it.vsIter.firstError).toBeTruthy();
    expect(it.vsIter.firstError).not.toMatch(/—/);
    expect(it.vs[model.depth.indexOf(2030)]).toBe(model.vs[model.depth.indexOf(2030)]);
    expect(shearSourceText(it)).toBe('Vs estimated (Greenberg-Castagna on VSH); no shear log');
    const ok = applyIterativeVs(model, DEFAULT_SCENARIO, DEFAULT_ROCK, null);
    expect(shearSourceText(ok)).toBe('Vs estimated (Greenberg-Castagna on VSH; iterated through the brine state in 41 hydrocarbon samples); no shear log');
    expect(shearSourceText({ vsSource: 'measured' })).toBe('measured shear log');
    // exports and publish say so (PL4)
    const idx = zoneIndices(model.depth, 2020, 2040);
    const sub = substituteZone(ok, idx, DEFAULT_SCENARIO, DEFAULT_ROCK);
    const header = reportHeader({ well: { name: 'W' }, zone: ZONE, model: ok, sub, indices: idx, scenario: DEFAULT_SCENARIO, rock: DEFAULT_ROCK, units: { velocity: 'm/s', density: 'kg/m3', depth: 'm' } });
    expect(header.find(([k]) => k === 'Shear')[1]).toMatch(/iterated through the brine state in 41 hydrocarbon samples/);
    const logs = preparePublishLogs(ok, sub, idx, ZONE, { scenario: DEFAULT_SCENARIO, rock: DEFAULT_ROCK, kmin: sub.kmin });
    const vsLog = logs.find((l) => l.mnemonic === 'VS_SUB');
    expect(vsLog.description).toMatch(/Vs estimated, Greenberg-Castagna, iterated through brine in hydrocarbon samples/);
    expect(vsLog.provenance.vs_method).toBe('greenberg-castagna-iterative');
    expect(vsLog.provenance.vs_iterated_samples).toBe(41);
  });

  test('the sampler reads each sample once for every consumer: SW log fluid, clay K_min, limits', () => {
    const { model } = gasWell({ swLog: true });
    const sm = makeSampler(model, DEFAULT_SCENARIO, { ...DEFAULT_ROCK, clayFromVsh: true });
    const i = model.depth.indexOf(2030);
    expect(sm.swA(i)).toEqual({ sw: SW, fallback: false });
    expect(rel(sm.fluidA(i).k, mixed.k)).toBeLessThan(1e-6);
    expect(sm.fluidA(0)).toBe(sm.brine);
    expect(sm.outside(0)).toBe(true); // shale
    expect(sm.outside(i)).toBe(false);
    expect(sm.kmin(i)).toBeCloseTo(KMIN, 0);
    expect(sm.kmin(0)).toBeCloseTo(MINERALS.clay.k, 0);
    expect(sm.kminSource).toBe('vsh');
  });
});
