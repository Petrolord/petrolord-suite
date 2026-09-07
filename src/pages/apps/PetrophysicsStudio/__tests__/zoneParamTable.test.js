// PT9c: the zone parameter table's pure side against the PS3 override
// model — rows carry effective values and override flags, drafts turn
// into patches by the same "equal to global is no override" rule, hidden
// fields never leak into a patch, copy moves whole patches.

import { DEFAULT_PARAMS } from '../engine/pipeline';
import { PARAM_FIELDS } from '../services/paramFields';
import {
  buildZoneTable, patchFromDraft, patchesFromDrafts, copyOverrides, overrideCounts, effectiveFor,
} from '../services/zoneParamTable';

const zones = [
  { id: 'a', name: 'SAND A', top_md_m: 2010, base_md_m: 2030 },
  { id: 'b', name: 'SAND B', top_md_m: 2050, base_md_m: 2080 },
];
const zoneParams = { a: { rw: 0.03, m: 1.9 } };

test('rows: one per parameter field, effective values, override flags, applicability', () => {
  const rows = buildZoneTable({ params: DEFAULT_PARAMS, zones, zoneParams });
  expect(rows.map((r) => r.key)).toEqual(PARAM_FIELDS.map((f) => f.key));
  const rw = rows.find((r) => r.key === 'rw');
  expect(rw.global).toBe(0.05);
  expect(rw.cells[0]).toMatchObject({ zoneId: 'a', value: 0.03, overridden: true, applies: true });
  expect(rw.cells[1]).toMatchObject({ zoneId: 'b', value: 0.05, overridden: false, applies: true });
  // a field hidden under the zone's models is flagged as not applying
  const rsh = rows.find((r) => r.key === 'rsh');
  expect(rsh.cells[0].applies).toBe(false); // archie does not use Rsh
  expect(overrideCounts(rows)).toMatchObject({ rw: 1, m: 1, n: 0 });
});

test('draft -> patch: only differing fields, numbers parsed, hidden fields dropped, bad text reported', () => {
  const draft = { ...effectiveFor(DEFAULT_PARAMS, zoneParams, 'a'), rw: '0.04', m: 2, rsh: 'garbage' };
  const { patch, invalid } = patchFromDraft(DEFAULT_PARAMS, draft);
  expect(patch).toEqual({ rw: 0.04 });          // m back to global -> no override
  expect(invalid).toEqual([]);                  // rsh is hidden under archie, so its text is ignored
  const shown = { ...draft, swMethod: 'simandoux' };
  const r2 = patchFromDraft(DEFAULT_PARAMS, shown);
  expect(r2.invalid).toEqual(['rsh']);
  expect(r2.patch.swMethod).toBe('simandoux');
});

test('every zone at once, and an unchanged zone yields an empty patch', () => {
  const drafts = { a: effectiveFor(DEFAULT_PARAMS, zoneParams, 'a'), b: { ...DEFAULT_PARAMS, cutSw: '0.7' } };
  const { patches, invalid } = patchesFromDrafts(DEFAULT_PARAMS, drafts);
  expect(patches.a).toEqual({ rw: 0.03, m: 1.9 });
  expect(patches.b).toEqual({ cutSw: 0.7 });
  expect(invalid).toEqual({});
});

test('copy moves a whole patch; Global clears', () => {
  const copied = copyOverrides(zoneParams, 'a', 'b');
  expect(copied.b).toEqual({ rw: 0.03, m: 1.9 });
  expect(copied.b).not.toBe(copied.a);
  const cleared = copyOverrides(copied, 'global', 'a');
  expect(cleared.a).toBeUndefined();
  expect(cleared.b).toEqual({ rw: 0.03, m: 1.9 });
});
