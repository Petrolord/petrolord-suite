/**
 * Tester round 2, item 4: proposals from the shared wells registry. The
 * deviated well is a build from vertical; its TVDs are checked against the
 * registry's own depth frame and against the vertical case.
 */
import { proposeFromRegistry, completionPatchFromProposal, zonePatchFromProposal } from '@/utils/welltest/registryProposal';
import { makeWellFrame } from '@/lib/wellDatum';

const FT = 0.3048;
const deviated = {
  id: 'w1', name: 'Obodo-7', uwi: 'NG-OB-0007', kb_m: 25, td_md_m: 3400,
  deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1500, inc: 0, azi: 90 }, { md: 2400, inc: 35, azi: 90 }, { md: 3400, inc: 35, azi: 90 }],
};
const zones = [
  { id: 'z1', name: 'D-3 sand', top_md_m: 3000, base_md_m: 3020, properties: { net_m: 13.7, phi_avg: 0.184, sw_avg: 0.22 } },
  { id: 'z2', name: 'E-1 sand', top_md_m: 3100, base_md_m: 3130, properties: {} },
];
const completion = { perfTopMd: String(3002 / FT), perfBaseMd: String(3011 / FT), payTopMd: String(3000 / FT) };

test('TVD of the perforations comes through the well survey, in feet', () => {
  const p = proposeFromRegistry({ well: deviated, zones, completion });
  const frame = makeWellFrame(deviated);
  expect(p.hasSurvey).toBe(true);
  expect(p.tvd.perfTopTvd).toBeCloseTo(frame.mdToTvd(3002) / FT, 1);
  expect(p.tvd.perfBaseTvd).toBeCloseTo(frame.mdToTvd(3011) / FT, 1);
  // 9 m along a 35 degree hole is 9 cos(35) m vertically
  expect((p.tvd.perfBaseTvd - p.tvd.perfTopTvd) * FT).toBeCloseTo(9 * Math.cos((35 * Math.PI) / 180), 2);
  // and TVD is shallower than MD on a deviated well
  expect(p.tvd.perfTopTvd).toBeLessThan(3002 / FT - 100);
  expect(p.tvdSource).toBe('Deviation survey of registry well Obodo-7');
  expect(completionPatchFromProposal(p)).toEqual({
    perfTopTvd: String(p.tvd.perfTopTvd), perfBaseTvd: String(p.tvd.perfBaseTvd), payTopTvd: String(p.tvd.payTopTvd),
    tvdSource: 'Deviation survey of registry well Obodo-7',
  });
});

test('a registry well with no survey is taken as vertical, and the source says so', () => {
  const p = proposeFromRegistry({ well: { id: 'w2', name: 'Vert-1', deviation: [] }, zones: [], completion });
  expect(p.hasSurvey).toBe(false);
  expect(p.tvd.perfTopTvd).toBeCloseTo(3002 / FT, 1);
  expect(p.tvdSource).toBe('Registry well Vert-1 has no deviation survey: taken as vertical');
});

test('no MD entered: no TVD is proposed and nothing is patched', () => {
  const p = proposeFromRegistry({ well: deviated, zones, completion: {} });
  expect(Number.isNaN(p.tvd.perfTopTvd)).toBe(true);
  expect(completionPatchFromProposal(p)).toEqual({});
  expect(proposeFromRegistry({ well: null })).toBeNull();
});

test('zones carry their published summary; applying one names its source', () => {
  const p = proposeFromRegistry({ well: deviated, zones, completion });
  expect(p.zones[0]).toMatchObject({ name: 'D-3 sand', phi: 0.184, sw: 0.22, netBasis: 'along hole' });
  expect(p.zones[0].netFt).toBeCloseTo(13.7 / FT, 1);
  expect(p.zones[0].topMdFt).toBeCloseTo(3000 / FT, 1);
  const patch = zonePatchFromProposal(p.zones[0], p.wellName);
  expect(patch.identification).toEqual({ zone: 'D-3 sand' });
  expect(patch.reservoir).toEqual({ h: String(p.zones[0].netFt), phi: '0.184', sw: '0.22' });
  expect(patch.inputMeta.phi.note).toBe('Petrophysics zone summary of Obodo-7, zone D-3 sand');
  // a zone with no published summary proposes its name only
  const bare = zonePatchFromProposal(p.zones[1], p.wellName);
  expect(bare.reservoir).toEqual({});
  expect(bare.identification.zone).toBe('E-1 sand');
});

test('below the last survey station the proposal says the inclination is carried on', () => {
  const p = proposeFromRegistry({ well: deviated, zones: [], completion: { perfTopMd: String(3500 / FT), perfBaseMd: String(3510 / FT) } });
  expect(p.tvdNote).toMatch(/below the last survey station/);
});
