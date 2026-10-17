// Ekene walk (2026-10-14): a kriging fallback's empty variance must not move
// the P90/P10 range or the volume distribution. The NTG of a layer whose
// wells all read 1.0 cannot be kriged (no spatial variation), falls back to a
// trend, and its variance grid holds the null marker; shiftProps used to
// shift such nodes by the square root of the marker, so they went to 0 or 1.
import { shiftProps } from '../services/modelBuild';
import { NULL_VALUE } from '@/lib/gridding/numeric';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildModel, emptyDefinition } from '../services/modelBuild';

test('nodes with no variance (a fallback block) stay put; kriged nodes move by z standard deviations', () => {
  const zone = { props: { ntg: Float64Array.from([0.95, 0.95, 0.95]) }, variance: { ntg: Float64Array.from([0.0004, NULL_VALUE, 1e9]) } };
  const s = shiftProps(zone, { ntg: -1 });
  expect(s.ntg[0]).toBeCloseTo(0.93, 12);
  expect(s.ntg[1]).toBe(0.95);
  expect(s.ntg[2]).toBe(0.95);
});

test('through buildModel: a fallback zone keeps a sensible range (negative control: the old shift zeroes it)', async () => {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const surfaces = await backend.listSurfaces();
  const byName = Object.fromEntries(surfaces.map((s) => [s.name, s]));
  // every well gives the same NTG: since the 3D grid upgrade (2026-10-17) that
  // field is the constant itself, said in the provenance, with no variance to shift
  // (it used to fall back to a trend with the null marker as its variance)
  const flat = wells.map((w) => ({ ...w, zones: (w.zones || []).map((z) => ({ ...z, properties: { ...(z.properties || {}), ntg: 0.9 } })) }));
  const def = { ...emptyDefinition(), surfaceIds: [byName.TopA.id, byName.TopB.id], topNames: ['TopA', 'TopB'],
    zones: [{ name: 'Zone 1', registryZone: 'A' }], methods: { phi: 'okrige', sw: 'okrige', ntg: 'okrige' } };
  const b = await buildModel(def, flat, surfaces, backend);
  const z = b.zones[0];
  expect(z.provenance.ntg.every((r) => r.methodUsed === 'constant' && /every well reads 0\.9/.test(r.note))).toBe(true);
  expect(z.variance.ntg).toBeUndefined();
  if (z.range) {
    const { p90, p50, p10 } = z.range;
    expect(p90.hcpv_m3).toBeGreaterThan(0.5 * p50.hcpv_m3);
    expect(p10.hcpv_m3).toBeLessThan(2 * p50.hcpv_m3);
  }
});
