/**
 * FC1-0 (engines #188) in the Layout Mapper adapter.
 *
 * The engine now reports what it skipped, whether the check was complete,
 * whether anything was checked at all, and two named rankings instead of one
 * "worst". The adapter used to set its own `skipped` over the engine's and
 * derive its own `complete`; both lists are kept now and the flag is the
 * engine's.
 */
import {
  runLayoutCheck, adapterSkipped, unplacedItems, describeSkipped, incompleteReasons,
  spacingReportSection, DEFAULT_SPACING_INPUTS, spacingInputsToRadiation,
} from '../layoutSpacing';

const BASE_LAT = 4.8156;
const BASE_LON = 7.0498;
const layer = (id, iconName, dLatM, extra = {}) => ({
  id,
  type: 'icon',
  iconName,
  tag: `${iconName}-001`,
  latlng: { lat: BASE_LAT + dLatM / 111320, lng: BASE_LON },
  ...extra,
});

describe('both skip lists survive', () => {
  const layers = [
    layer('a', 'Wellhead', 0),
    layer('b', 'Tank', 10),
    { id: 'p', type: 'pipeline', latlngs: [] },
    layer('c', 'Skid', 30, { isCustom: true }),
    { id: 'u', type: 'icon', iconName: 'Separator', tag: 'Sep-9', latlng: null },
  ];

  it('merges what the engine skipped with what the adapter never sent it', () => {
    const r = runLayoutCheck({ layers, radiation: {} });
    const byReason = (reason) => r.skipped.filter((s) => s.reason === reason).map((s) => s.id);
    expect(byReason('bad-coordinates')).toEqual(['u']);
    expect(byReason('pipe-run')).toEqual(['p']);
    expect(byReason('custom-icon')).toEqual(['c']);
    // The adapter's own list is unchanged in shape and still available.
    expect(adapterSkipped(layers).map((s) => s.reason).sort())
      .toEqual(['custom-icon', 'pipe-run']);
    expect(unplacedItems(layers).map((i) => i.id)).toEqual(['u']);
  });

  it('describes a skip list in words', () => {
    expect(describeSkipped([
      { id: 'p', reason: 'pipe-run' }, { id: 'q', reason: 'pipe-run' }, { id: 'c', reason: 'custom-icon' },
    ])).toBe('2 pipe runs, 1 custom icon');
    expect(describeSkipped([])).toBe('');
  });
});

describe('completeness is the engine flag', () => {
  it('an unplaced piece of equipment makes the check incomplete, with the reason', () => {
    const layers = [
      layer('a', 'Wellhead', 0),
      layer('b', 'Tank', 200),
      { id: 'u', type: 'icon', iconName: 'Separator', tag: 'Sep-9', latlng: null },
    ];
    const r = runLayoutCheck({ layers, radiation: {} });
    expect(r.complete).toBe(false);
    expect(incompleteReasons(r).join('; ')).toMatch(/1 item with no position on the map could not be judged/);
  });

  it('negative control: everything placed, and a pipe run alongside, is complete', () => {
    const layers = [
      layer('a', 'Wellhead', 0), layer('b', 'Tank', 200), { id: 'p', type: 'pipeline', latlngs: [] },
    ];
    const r = runLayoutCheck({ layers, radiation: {} });
    expect(r.complete).toBe(true);
    expect(incompleteReasons(r)).toEqual([]);
    // A pipe run is out of scope, not an incompleteness.
    expect(r.skipped).toEqual([{ id: 'p', reason: 'pipe-run' }]);
  });

  it('a radiation source the adapter could not compute still makes it incomplete', () => {
    const layers = [layer('f', 'Flare', 0), layer('t', 'Tank', 400)];
    const r = runLayoutCheck({
      layers,
      radiation: spacingInputsToRadiation({ ...DEFAULT_SPACING_INPUTS, flareLhvKjKg: '' }),
    });
    expect(r.complete).toBe(false);
    expect(incompleteReasons(r)[0]).toMatch(/Flare setback not computed/);
  });
});

describe('the two rankings and the shortfall fraction', () => {
  it('names the largest shortfall in metres and the largest against its own requirement', () => {
    // Wellhead to tank needs 30 m and is 25 m short; two wellheads need less
    // and are proportionally further inside their figure.
    const layers = [layer('a', 'Wellhead', 0), layer('b', 'Tank', 5), layer('c', 'Wellhead', 3)];
    const r = runLayoutCheck({ layers, radiation: {} });
    expect(r.worst).toBeUndefined();
    expect(r.worstAbsolute.shortfallM).toBeGreaterThanOrEqual(r.worstRelative.shortfallM * 0);
    r.violations.forEach((v) => {
      expect(v.shortfallFraction).toBeCloseTo(v.shortfallM / v.requiredM, 12);
      expect(v.severity).toBeUndefined();
    });
    // Sorted by absolute shortfall, largest first.
    const shortfalls = r.violations.map((v) => v.shortfallM);
    expect([...shortfalls].sort((x, y) => y - x)).toEqual(shortfalls);
    expect(r.worstAbsolute).toEqual(r.violations[0]);
  });
});

describe('the exported report section', () => {
  it('says a check was incomplete and what it did not check', () => {
    const layers = [
      layer('t', 'Tank', 0), layer('s', 'Separator', 60),
      { id: 'u', type: 'icon', iconName: 'Wellhead', tag: 'WH-9', latlng: null },
      { id: 'p', type: 'pipeline', latlngs: [] },
    ];
    const sec = spacingReportSection(runLayoutCheck({
      layers, radiation: spacingInputsToRadiation({ ...DEFAULT_SPACING_INPUTS, poolEnabled: true }),
    }));
    expect(sec.summary.some((line) => /Check incomplete/.test(line))).toBe(true);
    expect(sec.notes.join(' ')).toMatch(/Not checked: 1 item with no position on the map, 1 pipe run/);

    // Negative control: a complete layout says nothing about incompleteness.
    const clean = spacingReportSection(runLayoutCheck({
      layers: [layer('t', 'Tank', 0), layer('s', 'Separator', 200)], radiation: {},
    }));
    expect(clean.summary.some((line) => /Check incomplete/.test(line))).toBe(false);
  });
});
