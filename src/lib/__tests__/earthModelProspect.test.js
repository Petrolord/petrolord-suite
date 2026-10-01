// Earth Modeling U2-009: the model to ReservoirCalc Pro as a prospect. The
// gate runs ReservoirCalc Pro's own VolumeCalculationEngine on the handed
// inputs and gets the model's STOIIP and GIIP back.
import { makeInMemoryBackend } from '@/pages/apps/EarthModeling/services/inMemoryBackend';
import { buildModel, emptyDefinition } from '@/pages/apps/EarthModeling/services/modelBuild';
import { VolumeCalculationEngine } from '@/pages/apps/ReservoirCalcPro/services/VolumeCalculationEngine';
import {
  buildEarthModelProspect, prospectZoneToRcpInputs, writeProspectHandoff, readProspectHandoff, rcpProspectHref, EM_PROSPECT_SCHEMA,
} from '../earthModelProspect';

const M3_PER_BBL = 0.158987294928;

async function built(fluidsInput) {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const surfaces = await backend.listSurfaces();
  const by = Object.fromEntries(surfaces.map((s) => [s.name, s]));
  const b = await buildModel({
    ...emptyDefinition(), name: 'Handoff test',
    surfaceIds: [by.TopA.id, by.TopB.id, by.BaseB.id], topNames: ['TopA', 'TopB', 'BaseB'],
    zones: [{ name: 'Zone A', registryZone: 'A' }, { name: 'Zone B', registryZone: 'B' }],
    methods: { phi: 'trend', sw: 'trend', ntg: 'trend' },
    fluidsInput,
  }, wells, surfaces, backend);
  return { b, wells };
}

const memStore = () => {
  const m = new Map();
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test('an oil zone: RCP\'s own engine returns the model\'s STOIIP (metric exactly, field to the 7758 constant)', async () => {
  const { b, wells } = await built([{ owc: '1580', owcUnit: 'm', bo: '1.25' }, null]);
  const p = buildEarthModelProspect(b, { name: 'Handoff test', wells, report: { field: 'Keta' } });
  expect(p.schema).toBe(EM_PROSPECT_SCHEMA);
  expect(p.wells).toEqual(['W1', 'W2', 'W3', 'W4']);
  const em = b.zones[0].volumes.total.stoiip_m3;
  const metric = prospectZoneToRcpInputs(p, 0, 'metric');
  expect(metric.inputs.fluidType).toBe('oil');
  expect(metric.inputs.owc).toBeCloseTo(-1580, 9);
  const rm = VolumeCalculationEngine.calculateDeterministic(metric.inputs, 'metric', 'simple');
  expect(Math.abs(rm.stooip / em - 1)).toBeLessThan(1e-9);
  const field = prospectZoneToRcpInputs(p, 0, 'field');
  const rf = VolumeCalculationEngine.calculateDeterministic(field.inputs, 'field', 'simple');
  // RCP folds acre-ft to bbl with 7758 (exact: 7758.367), so 5e-5 apart
  expect(Math.abs(rf.stooip / (em / M3_PER_BBL) - 1)).toBeLessThan(1e-4);
  expect(field.inputs.owc).toBeCloseTo(-1580 / 0.3048, 6);
  // negative control: the plain mean Sw over the zone gives another STOIIP
  const sw = b.zones[0].props.sw; let s = 0; let n = 0;
  for (const v of sw) if (Math.abs(v) < 1e29) { s += v; n += 1; }
  const naive = VolumeCalculationEngine.calculateDeterministic({ ...metric.inputs, sw: s / n }, 'metric', 'simple');
  expect(Math.abs(naive.stooip / em - 1)).toBeGreaterThan(1e-3);
  expect(metric.notes.join(' ')).toMatch(/keeps the model's HCPV/);
});

test('a gas zone gives RCP gas and its GIIP; a zone with no hydrocarbon is refused', async () => {
  const { b } = await built([{ owc: '1600', owcUnit: 'm', bg: '0.005' }, null]);
  const p = buildEarthModelProspect(b, {});
  const g = prospectZoneToRcpInputs(p, 0, 'metric');
  expect(g.inputs.fluidType).toBe('gas');
  const r = VolumeCalculationEngine.calculateDeterministic(g.inputs, 'metric', 'simple');
  expect(Math.abs(r.giip / b.zones[0].volumes.total.giip_m3 - 1)).toBeLessThan(1e-9);
  const { b: dry } = await built([{ owc: '1000', owcUnit: 'm', bo: '1.2' }, null]);
  expect(() => prospectZoneToRcpInputs(buildEarthModelProspect(dry, {}), 0, 'metric')).toThrow(/holds no hydrocarbon/);
  expect(() => prospectZoneToRcpInputs({ schema: 'x' }, 0)).toThrow(/em-prospect\/1/);
  expect(() => prospectZoneToRcpInputs(p, 5)).toThrow(/no zone 6/);
});

test('the handoff store keeps the last five and reads back by id; the link carries id and zone', async () => {
  const { b } = await built([{ owc: '1580', bo: '1.25' }, null]);
  const st = memStore();
  const ids = [];
  for (let i = 0; i < 7; i++) ids.push(writeProspectHandoff(buildEarthModelProspect(b, { now: new Date(2026, 9, 1, 0, 0, i) }), st));
  expect(st.length).toBe(5);
  expect(readProspectHandoff(ids[0], st)).toBeNull();
  expect(readProspectHandoff(ids[6], st).zones).toHaveLength(2);
  expect(readProspectHandoff('nope', st)).toBeNull();
  expect(rcpProspectHref('a b', 1, '/dev/reservoircalc-pro')).toBe('/dev/reservoircalc-pro?emProspect=a%20b&zone=1');
});
