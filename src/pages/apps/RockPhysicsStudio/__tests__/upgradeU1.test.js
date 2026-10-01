/**
 * Rock Physics U1 (practitioner lens, 2026-10-01): curve reading, porosity
 * basis, per-sample fluid and mineral, Gassmann limits, elastic
 * quantities and units at the door. Every test calls the shipped
 * function; numeric fixes carry a negative control.
 */
import { mapLogs, buildModel, zoneIndices, CURVE_ALIASES } from '../services/prep';
import {
  DEFAULT_SCENARIO, DEFAULT_ROCK, sideFluid, kminFromRock, kminAtVsh, substituteZone, substituteInterval, plainMessage,
} from '../services/scenario';
import { preparePublishLogs } from '../services/publish';
import { substituteVels } from '../engine/gassmann';
import { mixMinerals } from '../engine/minerals';
import { woodMix, brine, gas } from '../engine/fluids';
import { acousticImpedance, vpVs, poissonRatio, elasticMeans } from '../services/elastic';
import { condFromDisplay, condToDisplay, gorFromDisplay } from '../components/RockParamsPanel';

const FT = 0.3048;
const n = 41;
const depth = Array.from({ length: n }, (_, i) => 2000 + i * 0.5);
const fill = (v) => Array.from({ length: n }, () => v);

// ---------------------------------------------------------------- RP-U1-002
test('RP-U1-002: a Schlumberger-named well (TDEP, DTCO, DTSM, RHOZ) maps and loads', () => {
  const logs = [
    { id: 'd', mnemonic: 'TDEP', unit: 'M' }, { id: 'p', mnemonic: 'DTCO', unit: 'US/M' },
    { id: 's', mnemonic: 'DTSM', unit: 'US/M' }, { id: 'r', mnemonic: 'RHOZ', unit: 'G/C3' },
  ];
  const mapped = mapLogs(logs);
  expect(mapped.DEPT.mnemonic).toBe('TDEP');
  expect(mapped.RHOB.mnemonic).toBe('RHOZ');
  const m = buildModel({ DEPT: depth, DT: fill(1e6 / 3200), DTS: fill(1e6 / 1800), RHOB: fill(2.25) }, mapped);
  expect(m.vp[0]).toBeCloseTo(3200, 6);
  expect(m.rho[0]).toBeCloseTo(2250, 6);
  // negative control: the private table before U1 knew neither TDEP nor RHOZ
  const OLD = { DEPT: ['DEPT', 'DEPTH', 'MD'], RHOB: ['RHOB', 'DEN', 'ZDEN'] };
  expect(OLD.DEPT.includes('TDEP') || OLD.RHOB.includes('RHOZ')).toBe(false);
  expect(CURVE_ALIASES.RHOB).toContain('RHOZ');
  expect(CURVE_ALIASES.DEPT).toContain('TDEP');
});

// ---------------------------------------------------------------- RP-U1-003
describe('RP-U1-003: hostile units and nulls', () => {
  const base = { DEPT: { mnemonic: 'DEPT', unit: 'M' }, RHOB: { mnemonic: 'RHOB', unit: 'G/C3' } };

  test('a us/ft sonic with no unit reads per foot (Vp 3048 m/s, not 10000)', () => {
    const m = buildModel({ DEPT: depth, DT: fill(100), RHOB: fill(2.3) }, { ...base, DT: { mnemonic: 'DT', unit: '' } });
    expect(m.vp[0]).toBeCloseTo(1e6 * FT / 100, 6);
    expect(m.notes.join(' ')).toMatch(/read as us\/ft/);
    // negative control: the reading before U1 (us/m when the unit says nothing)
    expect(1e6 / 100).toBeGreaterThan(m.vp[0] * 3);
  });

  test('a us/m sonic with no unit stays us/m and says so', () => {
    const m = buildModel({ DEPT: depth, DT: fill(320), RHOB: fill(2.3) }, { ...base, DT: { mnemonic: 'DT', unit: '' } });
    expect(m.vp[0]).toBeCloseTo(1e6 / 320, 6);
    expect(m.notes.join(' ')).toMatch(/read as us\/m/);
  });

  test('a shear sonic with no unit is read in the unit that gives a physical Vp/Vs', () => {
    // DT in us/m (Vp 3200), DTS in us/ft for Vs 1800: 169.33 us/ft
    const dtsFt = 1e6 * FT / 1800;
    const m = buildModel({ DEPT: depth, DT: fill(1e6 / 3200), DTS: fill(dtsFt), RHOB: fill(2.25) },
      { ...base, DT: { mnemonic: 'DT', unit: 'US/M' }, DTS: { mnemonic: 'DTS', unit: '' } });
    expect(m.vs[0]).toBeCloseTo(1800, 6);
    expect(m.notes.join(' ')).toMatch(/DTS has no unit: read as us\/ft/);
    // negative control: as us/m, Vs would exceed Vp
    expect(1e6 / dtsFt).toBeGreaterThan(3200);
  });

  test('porosity in percent with no unit, vendor -999 nulls and a kg/m3 label on g/cc values', () => {
    const rhob = fill(2.25); rhob[3] = -999;
    const m = buildModel({ DEPT: depth, DT: fill(1e6 / 3200), RHOB: rhob, PHIE: fill(25) },
      { ...base, DT: { mnemonic: 'DT', unit: 'US/M' }, PHIE: { mnemonic: 'PHIE', unit: '' }, RHOB: { mnemonic: 'RHOB', unit: 'KG/M3' } });
    expect(m.phi[0]).toBeCloseTo(0.25, 12);
    expect(Number.isNaN(m.rho[3])).toBe(true);
    expect(m.rho[0]).toBeCloseTo(2250, 6);
    expect(m.notes.join(' ')).toMatch(/only percent can mean/);
    expect(m.notes.join(' ')).toMatch(/-999 or below read as null/);
    expect(m.notes.join(' ')).toMatch(/only g\/cc can mean/);
  });
});

// ---------------------------------------------------------------- RP-U1-004
describe('RP-U1-004: porosity basis and clay', () => {
  const units = { DEPT: { mnemonic: 'DEPT', unit: 'M' }, DT: { mnemonic: 'DT', unit: 'US/M' }, RHOB: { mnemonic: 'RHOB', unit: 'G/C3' } };
  test('PHIT is total porosity and is never read as PHIE', () => {
    const mapped = mapLogs([{ id: 1, mnemonic: 'DEPT' }, { id: 2, mnemonic: 'PHIT', unit: 'V/V' }]);
    expect(mapped.PHIE).toBeNull();
    expect(mapped.PHIT.mnemonic).toBe('PHIT');
    const m = buildModel({ DEPT: depth, DT: fill(312.5), RHOB: fill(2.25), PHIT: fill(0.25) }, { ...units, PHIT: mapped.PHIT });
    expect(m.phiBasis).toBe('total');
    expect(m.phiCurve).toBe('PHIT');
  });
  test('a Studio PHIE published before PT9a is total porosity', () => {
    const phie = { mnemonic: 'PHIE', unit: 'V/V', provenance: { computed: true, engine: 'petrophysics-studio', pipeline_version: 4 } };
    const m = buildModel({ DEPT: depth, DT: fill(312.5), RHOB: fill(2.25), PHIE: fill(0.2) }, { ...units, PHIE: phie });
    expect(m.phiBasis).toBe('total');
    const now = buildModel({ DEPT: depth, DT: fill(312.5), RHOB: fill(2.25), PHIE: fill(0.2) }, { ...units, PHIE: { ...phie, provenance: { ...phie.provenance, pipeline_version: 5 } } });
    expect(now.phiBasis).toBe('effective');
  });
  test('clay from VSH: each sample substitutes with its own K_min', () => {
    const rock = { ...DEFAULT_ROCK, minerals: { quartz: 1, calcite: 0, dolomite: 0, clay: 0 }, clayFromVsh: true, vshMax: 1 };
    expect(kminAtVsh(rock, 0)).toBeCloseTo(mixMinerals([{ name: 'quartz', frac: 1 }]).k, 3);
    const k30 = mixMinerals([{ name: 'quartz', frac: 0.7 }, { name: 'clay', frac: 0.3 }]).k;
    expect(kminAtVsh(rock, 0.3)).toBeCloseTo(k30, 3);
    const model = { n: 1, depth: [2000], vp: [3000], vs: [1600], rho: [2300], phi: [0.2], vsh: [0.3], sw: null };
    const out = substituteZone(model, [0], { ...DEFAULT_SCENARIO, fluidA: { ...DEFAULT_SCENARIO.fluidA, swFromLog: false } }, rock);
    const flA = sideFluid(DEFAULT_SCENARIO.conditions, { sw: 1, hc: DEFAULT_SCENARIO.fluidA.hc });
    const flB = sideFluid(DEFAULT_SCENARIO.conditions, DEFAULT_SCENARIO.fluidB);
    expect(out.vp[0]).toBeCloseTo(substituteVels(3000, 1600, 2300, k30, 0.2, flA, flB).vp, 9);
    expect(out.kminSource).toBe('vsh');
    // negative control: the clay-free table modulus gives a different answer
    const quartzOnly = substituteZone(model, [0], { ...DEFAULT_SCENARIO, fluidA: { ...DEFAULT_SCENARIO.fluidA, swFromLog: false } }, { ...rock, clayFromVsh: false });
    expect(Math.abs(quartzOnly.vp[0] - out.vp[0])).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------- RP-U1-005
test('RP-U1-005: fluid A from the SW log; the round trip back to it is the identity', () => {
  const cond = DEFAULT_SCENARIO.conditions;
  const model = { n: 3, depth: [1, 2, 3], vp: [2900, 2950, 3000], vs: [1650, 1660, 1700], rho: [2150, 2160, 2200], phi: [0.25, 0.24, 0.22], vsh: [0.05, 0.05, 0.05], sw: [0.25, 0.4, 0.9] };
  const toBrine = { ...DEFAULT_SCENARIO, fluidA: { sw: 1, swFromLog: true, hc: { kind: 'gas', gravity: 0.6 } }, fluidB: { sw: 1, hc: { kind: 'gas', gravity: 0.6 } } };
  const rock = { ...DEFAULT_ROCK, kminOverrideGPa: '37' };
  const wet = substituteZone(model, [0, 1, 2], toBrine, rock);
  expect(wet.done).toBe(3);
  expect(wet.swFromLog).toBe(true);
  // each sample used its own log Sw: equals the engine with that sample's Wood mix
  const br = brine(cond.tC, cond.pMPa, cond.salinity);
  const g = gas(cond.tC, cond.pMPa, 0.6);
  for (let i = 0; i < 3; i++) {
    const a = woodMix([{ ...br, sat: model.sw[i] }, { ...g, sat: 1 - model.sw[i] }]);
    expect(wet.vp[i]).toBeCloseTo(substituteVels(model.vp[i], model.vs[i], model.rho[i], 37e9, model.phi[i], a, br).vp, 9);
  }
  // invariant: brine back to the log's own fluid returns the logs (1e-9 relative)
  for (let i = 0; i < 3; i++) {
    const a = woodMix([{ ...br, sat: model.sw[i] }, { ...g, sat: 1 - model.sw[i] }]);
    const back = substituteVels(wet.vp[i], wet.vs[i], wet.rho[i], 37e9, model.phi[i], br, a);
    expect(Math.abs(back.vp - model.vp[i]) / model.vp[i]).toBeLessThan(1e-9);
    expect(Math.abs(back.rho - model.rho[i]) / model.rho[i]).toBeLessThan(1e-9);
  }
  // negative control: the typed Sw 1 (brine to brine) changes nothing, so it
  // misses the hydrocarbon the log says is there
  const typed = substituteZone(model, [0, 1, 2], { ...toBrine, fluidA: { ...toBrine.fluidA, swFromLog: false } }, rock);
  expect(Math.abs(typed.vp[0] - model.vp[0])).toBeLessThan(1e-6);
  expect(wet.vp[0] - model.vp[0]).toBeGreaterThan(50);
});

// ---------------------------------------------------------------- RP-U1-006
test('RP-U1-006: shale and tight samples stay in situ, counted, and publish their in-situ values', () => {
  const model = { n: 4, depth: [1, 2, 3, 4], vp: [3200, 3200, 3000, 3800], vs: [1800, 1800, 1500, 2300], rho: [2250, 2250, 2400, 2500], phi: [0.25, 0.25, 0.15, 0.01], vsh: [0, 0, 0.8, 0.05], sw: null };
  const rock = { ...DEFAULT_ROCK, kminOverrideGPa: '37' };
  const out = substituteZone(model, [0, 1, 2, 3], DEFAULT_SCENARIO, rock);
  expect(out.done).toBe(2);
  expect(out.outside).toBe(2);
  expect(Number.isNaN(out.vp[2])).toBe(true);
  const pub = preparePublishLogs({ ...model, vsSource: 'measured' }, out, [0, 1, 2, 3], { name: 'Z', top_md_m: 1, base_md_m: 4 }, { scenario: DEFAULT_SCENARIO, rock, kmin: 37e9 });
  const vpSub = pub.find((l) => l.mnemonic === 'VP_SUB').data;
  expect(vpSub[2]).toBeCloseTo(3000, 3);
  expect(vpSub[0]).toBeLessThan(3200);
  // negative control: the pre-U1 interval substitution moved the shale too
  const old = substituteInterval(model, [0, 1, 2, 3], 37e9, sideFluid(DEFAULT_SCENARIO.conditions, DEFAULT_SCENARIO.fluidA), sideFluid(DEFAULT_SCENARIO.conditions, DEFAULT_SCENARIO.fluidB), 0.2);
  // and the tight sample failed with a K_dry error the user had to decode
  expect(old.firstError).toMatch(/K_dry/);
  expect(Math.abs(old.vp[2] - 3000)).toBeGreaterThan(1);
});

test('RP-U1-015: engine messages reach the screen without dashes', () => {
  const model = { n: 1, depth: [1], vp: [1500], vs: [1400], rho: [2000], phi: [0.3], vsh: [0], sw: null };
  const out = substituteZone(model, [0], DEFAULT_SCENARIO, { ...DEFAULT_ROCK, kminOverrideGPa: '37' });
  expect(out.skipped).toBe(1);
  expect(out.firstError).not.toMatch(/—/);
  expect(plainMessage('a — b')).toBe('a: b');
});

// ---------------------------------------------------------------- RP-U1-007
test('RP-U1-007: AI, Vp/Vs and Poisson\'s ratio by their definitions', () => {
  // the oracle brine sand
  expect(acousticImpedance(3200, 2250)).toBeCloseTo(7.2e6, 3);
  expect(vpVs(3200, 1800)).toBeCloseTo(16 / 9, 12);
  const nu = poissonRatio(3200, 1800);
  // invariant: Vp/Vs from nu by the inverse relation
  expect(Math.sqrt((2 * (1 - nu)) / (1 - 2 * nu))).toBeCloseTo(16 / 9, 12);
  expect(poissonRatio(3000, 3000)).toBeNaN();
  const m = elasticMeans([3200, 2540], [1800, 1620], [2250, 2090], [0, 1]);
  expect(m.ai).toBeCloseTo((3200 * 2250 + 2540 * 2090) / 2, 3);
  expect(m.vpvs).toBeCloseTo((3200 / 1800 + 2540 / 1620) / 2, 12);
});

// ---------------------------------------------------------------- RP-U1-008
test('RP-U1-008: conditions typed in field units equal the SI scenario', () => {
  const field = { temperature: 'degF', pressure: 'psi', salinity: 'ppm' };
  const c = condFromDisplay({ tC: '140', pMPa: '3625.94', salinity: '35000' }, field);
  expect(c.tC).toBeCloseTo(60, 9);
  expect(c.pMPa).toBeCloseTo(25, 4);
  expect(c.salinity).toBeCloseTo(0.035, 12);
  const a = brine(c.tC, c.pMPa, c.salinity);
  const b = brine(60, 25, 0.035);
  expect(Math.abs(a.k - b.k) / b.k).toBeLessThan(1e-5);
  // and back to the display
  expect(condToDisplay({ tC: 60, pMPa: 25, salinity: 0.035 }, field)).toEqual({ tC: '140', pMPa: '3625.9434', salinity: '35000' });
  // GOR 561.46 scf/STB is 100 m3/m3 (the engine's L/L)
  expect(gorFromDisplay('561.458', 'scf/STB')).toBeCloseTo(100, 3);
  // negative control: 140 typed as degC is not the same brine
  expect(Math.abs(brine(140, 25, 0.035).k - b.k) / b.k).toBeGreaterThan(0.05);
});

test('zone indices and the oracle zone still substitute to the golden (no regression)', () => {
  const model = { n: 2, depth: [2020, 2021], vp: [3200, 3200], vs: [1800, 1800], rho: [2250, 2250], phi: [0.25, 0.25], vsh: [0, 0], sw: null };
  const out = substituteZone(model, zoneIndices(model.depth, 2020, 2040), DEFAULT_SCENARIO, { ...DEFAULT_ROCK, kminOverrideGPa: '37' });
  expect(out.vp[0]).toBeCloseTo(2905.70, 1);
  expect(kminFromRock({ ...DEFAULT_ROCK, kminOverrideGPa: '37' })).toBe(37e9);
});
