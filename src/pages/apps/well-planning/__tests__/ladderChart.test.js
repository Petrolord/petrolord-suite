// The anti-collision ladder's reference MD in the wellbore unit (2026-10-13,
// video dry run: a feet wellbore's ladder drew the 1,312 ft kickoff at 400
// on an axis labelled "Reference MD (ft)").
import { ladderRows } from '../charts/LadderChart';

const FT = 1 / 0.3048;
const clearance = { md: [0, 400, 2020], sf: [2.3, 1.03, 9], distanceCC: [5, 5, 300], masd: [1, 3, 20] };

describe('ladder rows', () => {
  test('feet: MD and distances convert together, SF does not', () => {
    const rows = ladderRows(clearance, (m) => m * FT);
    expect(rows[1].md).toBeCloseTo(1312.34, 2);
    expect(rows[2].md).toBeCloseTo(6627.3, 1);
    expect(rows[1].distance).toBeCloseTo(16.40, 2);
    expect(rows[1].sf).toBe(1.03);
  });
  test('negative control: metres pass through unchanged', () => {
    const rows = ladderRows(clearance);
    expect(rows.map((r) => r.md)).toEqual([0, 400, 2020]);
    expect(rows[1].distance).toBe(5);
  });
});
