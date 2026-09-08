// Hole-section resolver (tester fix 2026-09-08): the saved geometry spine
// wins, else the Casing & Tubing programme is derived into sections, else
// the note names what was looked for and where.
import {
  resolveHoleSections, holeSectionsFromCasingStrings, missingHoleSectionsMessage,
  holeSizeForCasingM, bitThroughCasingM, casingIdM,
} from '../services/geometrySource';
import { runHydraulics } from '../../HydraulicsStudio/services/hydRun';
import { makeInMemoryBackend } from '../../HydraulicsStudio/services/inMemoryBackend';

const IN = 0.0254;
const sec = (odIn, weightLbFt, top, bottom, grade = 'L-80') => ({ id: `s-${odIn}-${bottom}`, topMdM: top, bottomMdM: bottom, odIn, weightLbFt, grade, connection: 'BTC', kind: 'casing' });
const doc = (...strings) => ({
  casingStrings: strings.map((sections, i) => ({ id: `cs-${i}`, name: `String ${i + 1}`, sections })),
  tubingStrings: [{ id: 'ts', name: 'Tbg', sections: [sec(3.5, 9.3, 0, 6400)] }],
});
const traj = (tdM, name = 'Plan A', revision = 1) => ({
  wellbore: { id: 'wb-1', name: 'Lad', depth_unit: 'm' },
  design: { id: 'd-1', name, revision },
  label: `${name} r${revision} (definitive), 220 stations`,
  stations: [{ md: 0, inc: 0, azi: 0 }, { md: tdM, inc: 0, azi: 0 }],
});

test('the tester case: one 9-5/8 string typed to TD + 0.01 becomes one cased section clamped to TD', () => {
  // The live wp_ct_cases row for the "Lad" wellbore (case 'BTU'), TD 6,500 m.
  const ct = { id: 'ct-1', name: 'BTU', updated_at: '2026-09-07T11:09:40Z', strings: doc([sec(9.625, 47, 0, 6500.01)]) };
  const r = resolveHoleSections({ geometry: null, ctCases: [ct], trajectory: traj(6500) });
  expect(r.source).toBe('casing_programme');
  expect(r.hole_sections).toHaveLength(1);
  const s = r.hole_sections[0];
  expect(s.cased).toBe(true);
  expect(s.from_md_m).toBe(0);
  expect(s.to_md_m).toBe(6500);
  expect(s.casing_od_m).toBeCloseTo(9.625 * IN, 9);
  expect(s.casing_id_m).toBeCloseTo(8.681 * IN, 9); // API 5CT 9-5/8 47#
  expect(s.hole_id_m).toBeCloseTo(12.25 * IN, 9);
  expect(r.label).toMatch(/derived from Casing & Tubing case 'BTU'/);
  expect(r.label).toMatch(/9-5\/8" casing to 6,500 m/);
  expect(r.note).toMatch(/String & Geometry tab in Torque & Drag Studio/);
  expect(r.wellbore_id).toBe('wb-1');
});

test('telescoping programme from surface: innermost string governs, open hole through the deepest shoe to TD', () => {
  const strings = doc([sec(20, 94, 0, 500, 'K-55')], [sec(13.375, 68, 0, 2000)], [sec(9.625, 47, 0, 4500)]);
  const out = holeSectionsFromCasingStrings(strings, 6500);
  expect(out).toHaveLength(2);
  expect(out[0]).toMatchObject({ from_md_m: 0, to_md_m: 4500, cased: true });
  expect(out[0].casing_id_m).toBeCloseTo(8.681 * IN, 9);
  expect(out[1]).toMatchObject({ from_md_m: 4500, to_md_m: 6500, cased: false });
  expect(out[1].hole_id_m).toBeCloseTo(8.5 * IN, 9); // largest standard bit through 8.681 in
  expect(out[1].description).toBe('8-1/2" open hole');
});

test('a liner hung inside the previous string splits the cased interval at the liner top', () => {
  const strings = doc([sec(9.625, 47, 0, 3000)], [sec(7, 29, 2800, 5000, 'P-110')]);
  const out = holeSectionsFromCasingStrings(strings, 5500);
  expect(out.map((s) => [s.from_md_m, s.to_md_m, s.cased])).toEqual([[0, 2800, true], [2800, 5000, true], [5000, 5500, false]]);
  expect(out[0].casing_id_m).toBeCloseTo(8.681 * IN, 9);
  expect(out[1].casing_id_m).toBeCloseTo(6.184 * IN, 9);
  expect(out[2].hole_id_m).toBeCloseTo(6 * IN, 9); // 6.184 - 0.125 drift excludes 6-1/8
});

test('no open hole when TD is at or above the deepest shoe; no TD keeps the programme as typed', () => {
  const strings = doc([sec(9.625, 47, 0, 3000)]);
  expect(holeSectionsFromCasingStrings(strings, 3000)).toHaveLength(1);
  expect(holeSectionsFromCasingStrings(strings, 0)).toEqual([expect.objectContaining({ to_md_m: 3000, cased: true })]);
  expect(holeSectionsFromCasingStrings({ casingStrings: [] }, 3000)).toEqual([]);
});

test('helpers: conventional hole per OD, bit through ID, ID from the API weight identity when off-catalog', () => {
  expect(holeSizeForCasingM(13.375 * IN) / IN).toBeCloseTo(17.5, 9);
  expect(holeSizeForCasingM(8.625 * IN) / IN).toBeCloseTo(12.25, 9); // 8-5/8 not tabled: first bit >= 11.125
  expect(bitThroughCasingM(12.415 * IN) / IN).toBeCloseTo(12.25, 9);
  expect(casingIdM(9.625, 47) / IN).toBeCloseTo(8.681, 9);
  expect(casingIdM(9.625, 47.5) / IN).toBeCloseTo(8.681, 1); // identity within a tenth of an inch
});

test('the saved spine row wins over any casing programme and keeps its columns', () => {
  const geometry = { id: 'g-1', wellbore_id: 'wb-1', hole_sections: [{ from_md_m: 0, to_md_m: 1000, cased: false, hole_id_m: 0.3 }] };
  const ct = { id: 'ct-1', name: 'BTU', strings: doc([sec(9.625, 47, 0, 6500)]) };
  const r = resolveHoleSections({ geometry, ctCases: [ct], trajectory: traj(6500) });
  expect(r.source).toBe('geometry');
  expect(r.id).toBe('g-1');
  expect(r.hole_sections).toHaveLength(1);
  expect(r.note).toBe('');
  expect(r.label).toMatch(/String & Geometry tab/);
});

test('nothing anywhere: the note names the wellbore, the plan, and both places that were checked', () => {
  const r = resolveHoleSections({ geometry: null, ctCases: [], trajectory: traj(6500) });
  expect(r.source).toBe('none');
  expect(r.hole_sections).toEqual([]);
  expect(r.note).toMatch(/^No hole sections found for wellbore 'Lad' on Plan A r1: /);
  expect(r.note).toMatch(/String & Geometry tab in Torque & Drag Studio/);
  expect(r.note).toMatch(/Casing & Tubing Design Studio/);
  expect(missingHoleSectionsMessage(r)).toBe(r.note);
  expect(missingHoleSectionsMessage(null)).toMatch(/String & Geometry tab/);
  // A C&T case with only tubing counts as nothing.
  const tubingOnly = { id: 'ct-2', name: 'T', strings: { casingStrings: [], tubingStrings: [{ sections: [sec(3.5, 9.3, 0, 100)] }] } };
  expect(resolveHoleSections({ geometry: null, ctCases: [tubingOnly], trajectory: traj(6500) }).source).toBe('none');
});

test('the Hydraulics run guard surfaces the resolver note and runs on derived sections', async () => {
  const backend = makeInMemoryBackend();
  const [caseRow] = await backend.listCases('wb-1');
  const { stations } = await backend.getDefinitiveTrajectory('wb-1');
  const none = resolveHoleSections({ geometry: null, ctCases: [], trajectory: traj(stations[stations.length - 1].md) });
  expect(() => runHydraulics({ stations, caseRow, geometryRow: none })).toThrow(/No hole sections found for wellbore 'Lad' on Plan A r1/);
  const ct = { id: 'ct-1', name: 'BTU', strings: doc([sec(9.625, 47, 0, stations[stations.length - 1].md - 500)]) };
  const derived = resolveHoleSections({ geometry: null, ctCases: [ct], trajectory: { ...traj(stations[stations.length - 1].md), stations } });
  expect(derived.source).toBe('casing_programme');
  const res = runHydraulics({ stations, caseRow, geometryRow: derived });
  expect(res.summary).toBeTruthy();
  expect(Array.isArray(res.ecdProfile)).toBe(true);
});
