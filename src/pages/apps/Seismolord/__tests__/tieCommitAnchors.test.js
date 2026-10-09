// A derived checkshot set has one level per anchor, and a well's time-depth
// only uses a set of two levels or more (effectiveCheckshots). A one-anchor
// tie used to commit, then be ignored everywhere (2026-10-09).
import { canCommitTie } from '../components/SyntheticsPanel';
import { effectiveCheckshots } from '../services/wellsService';

test('a tie commits with two anchors or more', () => {
  expect(canCommitTie([])).toBe(false);
  expect(canCommitTie([{ synTwtMs: 1200, seisTwtMs: 1196 }])).toBe(false);
  expect(canCommitTie([{ synTwtMs: 900, seisTwtMs: 896 }, { synTwtMs: 1300, seisTwtMs: 1296 }])).toBe(true);
});

test('why: a one-level derived set is not used, the imported checkshots are', () => {
  const imported = [{ tvdss_m: 100, twt_ms: 150 }, { tvdss_m: 1500, twt_ms: 1280 }];
  const one = effectiveCheckshots({ checkshots: imported, checkshots_derived: { rows: [{ tvdss_m: 1500, twt_ms: 1276 }] } });
  expect(one.derived).toBe(false);
  const two = effectiveCheckshots({ checkshots: imported, checkshots_derived: { rows: [{ tvdss_m: 900, twt_ms: 896 }, { tvdss_m: 1500, twt_ms: 1276 }] } });
  expect(two.derived).toBe(true);
});
