/**
 * Ekene walk (video round, 2026-10-14): Earth Modeling reconciles with
 * ReservoirCalc Pro's booked Ekene case (rcp-01, "cross-check vs RCP 12.14").
 * Known truth, from ReservoirCalc Pro on the same registry rows: the
 * Ekene Sand top and base six-well maps, OWC 5,036.1 ft TVDSS (1,535.0 m),
 * NTG 0.8, porosity 0.2, Sw 0.35, Bo 1.2 give GRV 18,058 acre-ft over
 * 418 acres and STOIIP 12.14 MMstb (the kit books 12,139,208 stb).
 * Every number here comes from buildModel and RCP's own engine.
 */
import fs from 'fs';
import path from 'path';
import { buildModel, emptyDefinition, zonePropertyValue, hcCellCounts } from '../services/modelBuild';
import { buildEarthModelProspect, prospectZoneToRcpInputs } from '@/lib/earthModelProspect';
import { VolumeCalculationEngine } from '@/pages/apps/ReservoirCalcPro/services/VolumeCalculationEngine';
import { M3_PER_ACRE_FT, M3_PER_BBL } from '../services/units';

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ekene-six-well.json'), 'utf8'));
const backend = { downloadSurfaceGrid: async (s) => Float32Array.from(FX.surfaces.find((x) => x.id === s.id).grid) };
const surfaces = FX.surfaces.map(({ grid, ...s }) => s);
const ACRE = 4046.8564224;

const booked = (wells) => wells.map((w) => ({ ...w, zones: w.zones.map((z) => ({ ...z, properties: { ...z.properties, phi_avg: 0.2, sw_avg: 0.35, net_res_tvt_m: 0.8 * z.properties.gross_tvt_m } })) }));
const definition = (over = {}) => ({
  ...emptyDefinition(),
  name: 'Ekene booked', surfaceIds: ['ekene-top', 'ekene-base'], topNames: ['Ekene Sand', 'Ekene Sand Base'],
  zones: [{ name: 'Ekene Sand', registryZone: 'Ekene Sand' }],
  fluidsInput: [{ owc: '5036.1', owcUnit: 'ft', bo: '1.2' }],
  ...over,
});

describe('the booked Ekene case equals ReservoirCalc Pro', () => {
  let built;
  beforeAll(async () => { built = await buildModel(definition(), booked(FX.wells), surfaces, backend); });

  test('GRV above the contact, HC area and STOIIP are RCP\'s 18,058 acre-ft, 418 acres and 12.14 MMstb', () => {
    const t = built.zones[0].volumes.total;
    expect((t.hc_bulk_m3 / M3_PER_ACRE_FT).toFixed(0)).toBe('18058');
    expect((t.hc_area_m2 / ACRE).toFixed(0)).toBe('418');
    expect((t.stoiip_m3 / M3_PER_BBL / 1e6).toFixed(2)).toBe('12.14');
    // the whole zone is bigger: the bulk column alone never matched RCP
    expect(t.bulk_m3 / M3_PER_ACRE_FT).toBeGreaterThan(50000);
  });

  test('the prospect handed to RCP reproduces the model in RCP\'s own engine, with RCP\'s HC area', () => {
    const payload = buildEarthModelProspect(built, { name: 'Ekene booked', now: new Date('2026-10-14T00:00:00Z') });
    const { inputs, notes } = prospectZoneToRcpInputs(payload, 0, 'field');
    expect(inputs.area.toFixed(0)).toBe('418');
    const r = VolumeCalculationEngine.calculateDeterministic({ ...inputs, recovery: 25, recoveryGas: 70 }, 'field', 'simple');
    expect((r.stooip / 1e6).toFixed(2)).toBe('12.14');
    expect(notes.join(' ')).toMatch(/area with a hydrocarbon column/);
  });
});

describe('NTG from a published zone is net reservoir over gross', () => {
  test('the Ekene wells read 0.948, 0.932, 0.958 and 0.957 (pay NTG 0.371, 0, 0.542, 0)', () => {
    const v = FX.wells.map((w) => zonePropertyValue(w.zones[0].properties, 'ntg'));
    expect(v.map((x) => x.v.toFixed(3))).toEqual(['0.948', '0.932', '0.958', '0.957']);
    expect(v.every((x) => x.basis === 'net reservoir')).toBe(true);
  });
  test('negative control: a summary with no net reservoir thickness falls back to net pay, and the build says so', async () => {
    const payOnly = FX.wells.map((w) => ({ ...w, zones: w.zones.map((z) => ({ ...z, properties: { phi_avg: z.properties.phi_avg, sw_avg: z.properties.sw_avg, ntg: z.properties.ntg } })) }));
    expect(zonePropertyValue(payOnly[1].zones[0].properties, 'ntg')).toEqual({ v: 0, basis: 'net pay' });
    const b = await buildModel(definition(), payOnly, surfaces, backend);
    const live = await buildModel(definition(), FX.wells, surfaces, backend);
    // pay NTG counts the water cut twice: the live field is several times larger
    expect(live.zones[0].volumes.total.stoiip_m3 / b.zones[0].volumes.total.stoiip_m3).toBeGreaterThan(3);
    expect(b.notes.join(' ')).toMatch(/net PAY over gross/);
    expect(live.zones[0].provenance.ntg[0].note).toMatch(/net reservoir over gross/);
  });
});

test('hcCellCounts counts the nodes with a column above the OWC (per node, per block, none)', () => {
  const top = [1000, 1000, 1000]; const base = [1010, 1010, 1010];
  expect(hcCellCounts(top, base, null, { owc: 1005 })).toEqual({ total: 3, 0: 3 });
  expect(hcCellCounts(top, base, null, { owc: 999 })).toEqual({ total: 0 });
  expect(hcCellCounts(top, base, Int32Array.from([0, 1, 1]), { owc: { 1: 999 } })).toEqual({ total: 1, 0: 1 });
  expect(hcCellCounts(top, base, null, { owc: Float64Array.from([1005, NaN, 990]) })).toEqual({ total: 2, 0: 2 });
});
