// ReservoirCalc Pro upgrade U2-001: the area/depth table as a GRV input
// and export. Gates call the shipped engines: an analytic cone (exact
// GRV known) and Mapping's own contactVolumes on the same lattice.

import { VolumeCalculationEngine } from '../services/VolumeCalculationEngine';
import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';
import { parseAreaDepthText, checkAreaDepthRows, areaDepthHypsometry, areaDepthCsv, plIntegral } from '../services/areaDepth';
import { makeLattice } from '../services/lattice';
import { convertInputsOnSystemChange } from '../services/unitsCatalog';
import { handleMcMessage, cloneableConfig } from '../services/mcWorkerProtocol';
import { contactVolumes } from '@/pages/apps/MappingSurfaceStudio/services/contactVolumes';

jest.setTimeout(120000);

const unit = { ntg: 1, porosity: 1, sw: 0, fvf: 1, bg: 1 };
// cone z = -1000 - 0.1 r: the area above depth d below the crest is pi (10 d)^2
const coneRows = (step = 10, maxD = 300) => {
  const rows = [];
  for (let d = 0; d <= maxD; d += step) rows.push({ depth: -1000 - d, areaTop: (Math.PI * (10 * d) ** 2) / 1e6, areaBase: null });
  return rows;
};
const coneGrv = (h) => (Math.PI * 100 * h ** 3) / 3; // m3 above a contact h below the crest
const coneGrvThick = (c, t) => (Math.PI * 100 * (c ** 3 - Math.max(0, c - t) ** 3)) / 3;

describe('U2-001 GRV from an area/depth table: analytic cone', () => {
  it('no base: within 0.6 percent of pi (10 h)^2 h / 3', () => {
    const r = VolumeCalculationEngine.calculateDeterministic({ ...unit, fluidType: 'oil', owc: -1100, areaDepth: { rows: coneRows() } }, 'metric', 'areadepth');
    expect(r.error).toBeUndefined();
    expect(Math.abs(r.grv / coneGrv(100) - 1)).toBeLessThan(0.006);
    expect(r.method).toBe('area-depth');
  });

  it('a constant gross thickness of 30 m: within 1 percent of the analytic shell', () => {
    const r = VolumeCalculationEngine.calculateDeterministic({ ...unit, fluidType: 'oil', owc: -1250, thickness: 30, areaDepth: { rows: coneRows() } }, 'metric', 'areadepth');
    expect(Math.abs(r.grv / coneGrvThick(250, 30) - 1)).toBeLessThan(0.01);
    // negative control: without the thickness the whole column counts
    const noBase = VolumeCalculationEngine.calculateDeterministic({ ...unit, fluidType: 'oil', owc: -1250, areaDepth: { rows: coneRows() } }, 'metric', 'areadepth');
    expect(noBase.grv / coneGrvThick(250, 30)).toBeGreaterThan(1.3);
  });

  it('a gas cap and an oil leg split at the GOC and add up', () => {
    const r = VolumeCalculationEngine.calculateDeterministic({ ...unit, fluidType: 'oil_gas', goc: -1050, owc: -1100, areaDepth: { rows: coneRows(5) } }, 'metric', 'areadepth');
    expect(Math.abs(r.grvGas / coneGrv(50) - 1)).toBeLessThan(0.006);
    expect(Math.abs((r.grvGas + r.grvOil) / coneGrv(100) - 1)).toBeLessThan(0.006);
  });

  it('a contact below the table is said to be a minimum', () => {
    const r = VolumeCalculationEngine.calculateDeterministic({ ...unit, fluidType: 'oil', owc: -1400, areaDepth: { rows: coneRows() } }, 'metric', 'areadepth');
    expect(r.warnings.join(' ')).toMatch(/below the deepest row.*minimum/);
  });

  it('the piecewise-linear integral is exact for a linear area', () => {
    expect(plIntegral([0, 10], [0, 10], 0, 10)).toBeCloseTo(50, 12);
    expect(plIntegral([0, 10], [0, 10], -5, 20)).toBeCloseTo(50 + 100, 12);
  });
});

describe('U2-001 the table of a surface reproduces Mapping\'s contactVolumes', () => {
  // the same cone as a 201 x 201 lattice at 20 m
  const n = 201; const d = 20;
  const spec = { x0: -2000, y0: -2000, dx: d, dy: d, nx: n, ny: n };
  const g = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) g[r * n + c] = -1000 - 0.1 * Math.hypot(-2000 + c * d, -2000 + r * d);
  const surface = { name: 'Cone lattice', points: [{ x: 0, y: 0, z: -1000 }, { x: 1, y: 0, z: -1000 }, { x: 0, y: 1, z: -1000 }], xyUnit: 'm', xyToM: 1, depthUnit: 'm', zConvention: 'elevation', lattice: makeLattice(spec, g) };

  it('export, then GRV from the table: total, gas and oil within 0.5 percent of contactVolumes', () => {
    const tab = ContactVolumetricsEngine.areaDepthTable({ topSurface: surface, constantThickness: 300, unitSystem: 'metric' }, 120);
    expect(tab.gridding).toBe('lattice');
    const csv = areaDepthCsv(tab.rows, 'metric');
    const back = parseAreaDepthText(csv);
    expect(back.ok).toBe(true);
    expect(back.notes.join(' ')).toMatch(/header/);
    const r = VolumeCalculationEngine.calculateDeterministic({ ...unit, fluidType: 'oil_gas', goc: -1080, owc: -1150, areaDepth: { rows: back.rows } }, 'metric', 'areadepth');
    const mv = contactVolumes({ spec, gridM: g, owcM: -1150, gocM: -1080, xyToM: 1 });
    expect(mv.open).toBe(false);
    expect(Math.abs(r.grv / mv.totalM3 - 1)).toBeLessThan(0.005);
    expect(Math.abs(r.grvGas / mv.gasM3 - 1)).toBeLessThan(0.005);
    expect(Math.abs(r.grvOil / mv.oilM3 - 1)).toBeLessThan(0.005);
    // and the analytic cone holds too
    expect(Math.abs(r.grv / coneGrv(150) - 1)).toBeLessThan(0.01);
  });
});

describe('U2-001 hostile tables are refused with the reason', () => {
  it('reads a header, semicolons and positive depths (said)', () => {
    const r = parseAreaDepthText('Depth;Area\n1500;0\n1550;2\n1600;8\n');
    expect(r.ok).toBe(true);
    expect(r.rows[0].depth).toBe(-1500);
    expect(r.notes.join(' ')).toMatch(/positive.*depths below the datum/);
  });
  it('refuses an area that shrinks with depth, mixed signs, a base larger than the top, a ragged base column', () => {
    expect(parseAreaDepthText('-1500,0\n-1550,5\n-1600,3').reason).toMatch(/falls from 5 to 3/);
    expect(parseAreaDepthText('-1500,0\n1550,5').reason).toMatch(/positive and some negative/);
    expect(parseAreaDepthText('-1500,0,0\n-1550,5,6').reason).toMatch(/base area .* larger than the top/);
    expect(parseAreaDepthText('-1500,0,0\n-1550,5').reason).toMatch(/every row or on none/);
    expect(parseAreaDepthText('-1500,0').reason).toMatch(/at least two rows/);
    expect(parseAreaDepthText('-1500,0\n-1550,abc').reason).toMatch(/Row 2/);
  });
});

describe('U2-001 the table in Monte Carlo and across a unit toggle', () => {
  it('the Monte Carlo samples contacts against the table through the worker handler', () => {
    const h = areaDepthHypsometry(checkAreaDepthRows(coneRows()).rows, { unitSystem: 'metric' });
    const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
    const replies = [];
    handleMcMessage({ type: 'run', id: 1, config: cloneableConfig({ fluidType: 'oil', unitSystem: 'metric', iterations: 2000, grvMode: 'structural', hypsometry: h, seed: 4 }), inputs: { owc: tri(-1100, -1100, -1100), porosity: tri(1, 1, 1), sw: tri(0, 0, 0), fvf: tri(1, 1, 1) } }, (m) => replies.push(m));
    const done = replies.find((m) => m.type === 'done');
    expect(Math.abs(done.result.stats.stooip.p50 / coneGrv(100) - 1)).toBeLessThan(0.006);
  });

  it('field and metric give one GRV (acre-ft x 1233.48 = m3)', () => {
    const metric = { ...unit, fluidType: 'oil', owc: -1100, thickness: 30, areaDepth: { rows: coneRows() } };
    const field = convertInputsOnSystemChange(metric, 'metric', 'field');
    expect(field.areaDepth.rows[1].depth).toBeCloseTo(-1010 / 0.3048, 6);
    const rm = VolumeCalculationEngine.calculateDeterministic(metric, 'metric', 'areadepth');
    const rf = VolumeCalculationEngine.calculateDeterministic(field, 'field', 'areadepth');
    expect(Math.abs((rf.grv * 1233.48183754752) / rm.grv - 1)).toBeLessThan(1e-6);
  });
});
