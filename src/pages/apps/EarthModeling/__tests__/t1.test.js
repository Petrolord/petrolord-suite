// Earth Modeling T1: contacts and in-place volumes through the build
// (EM-T1-001), fallbacks and mis-ties reported (002, 003), clamp masks
// (004), the property range (E1) and readable provenance (007).
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildModel, emptyDefinition, parseFluidsInput, hasFluids, MISTIE_WARN_M } from '../services/modelBuild';
import { describeProvenance } from '../services/propertyKriging';
import { volumeValue, volumeUnitLabel } from '../services/units';
import { volumesCsv } from '../services/volumesCsv';

async function build(extra = {}) {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const surfaces = await backend.listSurfaces();
  const byName = Object.fromEntries(surfaces.map((s) => [s.name, s]));
  return buildModel({
    ...emptyDefinition(),
    surfaceIds: [byName.TopA.id, byName.TopB.id, byName.BaseB.id],
    topNames: ['TopA', 'TopB', 'BaseB'],
    zones: [{ name: 'Zone A', registryZone: 'A' }, { name: 'Zone B', registryZone: 'B' }],
    ...extra,
  }, wells, surfaces, backend);
}

test('parseFluidsInput converts feet contacts to metres and refuses bad values plainly', () => {
  expect(parseFluidsInput([{ goc: '5000', owc: '5100', bo: '1.3', bg: '', unit: 'ft' }])[0])
    .toEqual({ goc: 5000 * 0.3048, owc: 5100 * 0.3048, bo: 1.3, bg: null });
  expect(parseFluidsInput([null, { owc: '1550', unit: 'm' }])).toEqual([null, { goc: null, owc: 1550, bo: null, bg: null }]);
  expect(() => parseFluidsInput([{ owc: 'abc' }])).toThrow(/Zone 1: the OWC must be a number/);
  expect(() => parseFluidsInput([{ bo: '0' }])).toThrow(/Bo must be greater than zero/);
  expect(() => parseFluidsInput([{ goc: '1600', owc: '1500', unit: 'm' }])).toThrow(/GOC is deeper than the OWC/);
  expect(hasFluids({ goc: null, owc: null, bo: null, bg: null })).toBe(false);
});

describe('a build with and without contacts', () => {
  let plain; let cut;
  beforeAll(async () => {
    plain = await build();
    const top = plain.clamped[0];
    let zmin = Infinity; let zmax = -Infinity;
    for (const v of top) if (Math.abs(v) < 1e29) { zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); }
    const owc = (zmin + zmax) / 2 + 20; // cuts zone A somewhere inside
    cut = await build({ fluidsInput: [{ owc: String(owc), bo: '1.25', unit: 'm' }] });
  });

  test('an OWC inside zone A lowers its HCPV and gives a STOIIP; zone B is untouched', () => {
    const a0 = plain.zones[0].volumes.total; const a1 = cut.zones[0].volumes.total;
    expect(a1.hcpv_m3).toBeLessThan(a0.hcpv_m3);
    expect(a1.hcpv_m3).toBeGreaterThan(0);
    expect(a1.bulk_m3).toBeCloseTo(a0.bulk_m3, 6);
    expect(a1.stoiip_m3).toBeCloseTo(a1.oil_hcpv_m3 / 1.25, 6);
    expect(cut.zones[1].volumes.total.hcpv_m3).toBeCloseTo(plain.zones[1].volumes.total.hcpv_m3, 6);
  });

  test('clamp masks count what the clamp report counts; mis-ties beyond 10 m are listed', () => {
    plain.clampMasks.forEach((m, i) => expect(m.reduce((a, b) => a + b, 0)).toBe(plain.counts[i]));
    expect(plain.misties.every((t) => Math.abs(t.residualM) > MISTIE_WARN_M)).toBe(true);
    expect(plain.misties.length).toBeGreaterThan(0);
    expect(Array.isArray(plain.fallbacks)).toBe(true);
  });

  test('the CSV carries the split and in-place columns when contacts are set', () => {
    const { text } = volumesCsv(cut, { volumeUnits: 'field' });
    expect(text).toContain('oil_hcpv (MMbbl)');
    expect(text).toContain('stoiip (MMstb)');
    expect(volumesCsv(plain).text).not.toContain('stoiip');
  });
});

test('the property range appears only when a property is kriged, P90 <= P50 <= P10', async () => {
  const b = await build({ methods: { phi: 'okrige', sw: 'okrige', ntg: 'constant' } });
  const r = b.zones[0].range;
  expect(r).not.toBeNull();
  expect(r.p90.hcpv_m3).toBeLessThanOrEqual(r.p50.hcpv_m3);
  expect(r.p50.hcpv_m3).toBeLessThanOrEqual(r.p10.hcpv_m3);
  expect((await build()).zones[0].range).toBeNull();
});

test('in-place units and readable provenance', () => {
  expect(volumeUnitLabel('stoiip_m3', 'field')).toBe('MMstb');
  expect(volumeUnitLabel('giip_m3', 'field')).toBe('Bscf');
  expect(volumeValue(1e6, 'giip_m3', 'field')).toBeCloseTo(0.0353146667, 9);
  expect(volumeValue(158987.294928, 'stoiip_m3', 'field')).toBeCloseTo(1, 9);
  expect(describeProvenance([{ block: 0, methodUsed: 'constant', wells: 4, fellBack: false }, { block: 1, methodUsed: 'trend', wells: 1, fellBack: true }]))
    .toBe('block 0: constant (weighted mean) from 4 wells; block 1: trend (plane) from 1 well, fell back');
});
