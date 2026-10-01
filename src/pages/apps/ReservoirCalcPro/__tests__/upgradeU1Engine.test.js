// ReservoirCalc Pro upgrade U1: the volume engines (RCP-U1-012, 017, 022,
// 023, 030). Calls the shipped engines on an analytic dome; the numeric
// cases were run against the unfixed engines first (negative control).

import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';
import { VolumeCalculationEngine } from '../services/VolumeCalculationEngine';
import { MonteCarloEngine } from '../services/MonteCarloEngine';
import { convertInputsOnSystemChange } from '../services/unitsCatalog';
import { reviewerLines, describeGridding, latin1 } from '../services/reportInfo';

jest.setTimeout(120000);

// crest -1500 m at the centre of a 2 x 2 km frame; z = -1500 - 0.0001 r^2,
// so the frame's side midpoints sit at -1600 m (the shallowest edge)
const dome = () => {
  const points = [];
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
    const x = 501000 + i * 50; const y = 6699000 + j * 50;
    points.push({ x, y, z: -1500 - 0.0001 * ((x - 502000) ** 2 + (y - 6700000) ** 2) });
  }
  return { points, xyUnit: 'm', depthUnit: 'm', zConvention: 'elevation' };
};
const petro = { ntg: 1, porosity: 0.2, sw: 0.3, fvf: 1.2, bg: 0.005 };
const run = (surface, extra) => ContactVolumetricsEngine.calculate({
  topSurface: surface, constantThickness: 400, unitSystem: 'metric', inputs: { ...petro, fluidType: 'oil', ...extra }, options: { resolution: 80 },
});

describe('RCP-U1-012 an open closure is said', () => {
  const surf = dome();
  it('a contact above the shallowest edge closes inside the map', () => {
    const r = run(surf, { owc: -1550 });
    expect(r.openEdge.open).toBe(false);
    expect(r.warnings.join(' ')).not.toMatch(/Open closure/);
    expect(r.openEdge.edgeElevation).toBeLessThan(-1590);
    expect(r.openEdge.edgeElevation).toBeGreaterThan(-1610);
  });
  it('a contact below it reaches the map edge: a minimum, not a trap volume', () => {
    const r = run(surf, { owc: -1700 });
    expect(r.openEdge.open).toBe(true);
    expect(r.openEdge.cells).toBeGreaterThan(10);
    expect(r.warnings.join(' ')).toMatch(/Open closure.*minimum, not a trap volume/);
  });
  it('Monte Carlo counts the realizations whose contact is open', async () => {
    const hyps = ContactVolumetricsEngine.buildHypsometry({ topSurface: surf, constantThickness: 400, unitSystem: 'metric', options: { resolution: 80 } });
    const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
    const r = await MonteCarloEngine.runSimulation(
      { fluidType: 'oil', unitSystem: 'metric', iterations: 2000, grvMode: 'structural', hypsometry: hyps },
      { owc: tri(-1650, -1590, -1560), porosity: tri(0.2, 0.2, 0.2), sw: tri(0.3, 0.3, 0.3), fvf: tri(1.2, 1.2, 1.2) },
    );
    expect(r.diagnostics.openRealizations).toBeGreaterThan(200);
    expect(r.diagnostics.warnings.join(' ')).toMatch(/closure is open there/);
  });
});

describe('RCP-U1-030 the grid is reused when only petrophysics or contacts change', () => {
  it('the slow build runs once for many edits, and the answer is unchanged', () => {
    const surf = dome();
    const spy = jest.spyOn(ContactVolumetricsEngine, '_buildCellsRaw');
    const a = run(surf, { owc: -1550 });
    const b = run(surf, { owc: -1550, porosity: 0.25 });
    const c = run(surf, { owc: -1560 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(b.grv).toBe(a.grv);
    expect(b.stooip / a.stooip).toBeCloseTo(0.25 / 0.2, 9);
    expect(c.grv).toBeGreaterThan(a.grv);
    // a new surface object (re-import) builds again
    run({ ...surf }, { owc: -1550 });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe('RCP-U1-022 a contact typed as a positive depth is named', () => {
  it('OWC +1550 over a structure below the datum says "did you mean -1550"', () => {
    const r = run(dome(), { owc: 1550 });
    expect(r.stooip).toBe(0);
    expect(r.warnings.join(' ')).toMatch(/OWC is \+1,550 m, above the datum.*did you mean -1,550/);
  });
});

describe('RCP-U1-017 condensate from the CGR', () => {
  it('condensate in place = GIIP / 1e6 x CGR, recoverable at the gas RF', () => {
    const r = VolumeCalculationEngine.calculateDeterministic(
      { area: 1000, thickness: 50, ntg: 1, porosity: 0.2, sw: 0.3, bg: 0.005, fluidType: 'gas', recoveryGas: 70, cgr: 100 }, 'field', 'simple');
    expect(r.condensate).toBeCloseTo((r.giip / 1e6) * 100, 6);
    expect(r.recoverableCondensate).toBeCloseTo(r.condensate * 0.7, 6);
    const c = run(dome(), { fluidType: 'gas', goc: -1560, cgr: 50, recoveryGas: 60 });
    expect(c.condensate).toBeCloseTo((c.giip / 1e6) * 50, 6);
  });
  it('no CGR, no condensate stream', () => {
    const r = VolumeCalculationEngine.calculateDeterministic({ area: 1000, thickness: 50, porosity: 0.2, sw: 0.3, bg: 0.005, fluidType: 'gas' }, 'field', 'simple');
    expect(r.condensate).toBeNull();
  });
  it('the unit-system toggle converts the CGR (STB/MMscf to sm3 per 1e6 sm3)', () => {
    const m = convertInputsOnSystemChange({ cgr: 100 }, 'field', 'metric');
    expect(m.cgr).toBeCloseTo(561.46, 1);
    expect(convertInputsOnSystemChange(m, 'metric', 'field').cgr).toBeCloseTo(100, 9);
  });
});

describe('RCP-U1-023 and RCP-U1-019 the result says how it was made', () => {
  it('a structural result carries its gridding, and the reviewer lines print it', () => {
    const r = run(dome(), { owc: -1700 });
    expect(r.gridding).toMatchObject({ interpolation: 'idw', nx: 80 });
    expect(describeGridding(r)).toMatch(/80 x \d+ cells .* inverse distance/);
    const lines = reviewerLines({
      report: { field: 'Keta', analyst: 'A. Analyst' }, unitSystem: 'metric', inputMethod: 'hybrid', fluidType: 'oil',
      inputs: { owc: -1700 }, results: r, now: new Date('2026-09-30T12:00:00Z'), build: 'Petrolord Suite test',
    });
    expect(lines[0]).toBe('Field: Keta | Analyst: A. Analyst | Date: 2026-09-30 | Petrolord Suite test');
    expect(lines.join('\n')).toMatch(/Contacts \(TVDSS elevation, negative below datum\): OWC -1,700 m/);
    expect(lines.join('\n')).toMatch(/OPEN CLOSURE/);
    for (const l of lines) expect(l).toBe(latin1(l));
  });
  it('the simple method says its contacts are not used', () => {
    const lines = reviewerLines({ unitSystem: 'field', inputMethod: 'simple', fluidType: 'oil', inputs: { owc: -8000 } });
    expect(lines.join('\n')).toMatch(/Contacts: not used by the Simple method/);
    expect(lines[0]).toMatch(/Field: not given \| Analyst: not given/);
  });
  it('latin1 replaces what the PDF fonts cannot print', () => {
    expect(latin1('φ − • —')).toBe('phi - | -');
  });
});
