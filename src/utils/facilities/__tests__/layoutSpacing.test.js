// Facilities F8 adapter gates. The physics is gated in the engines
// package (facilities.spacing.test.js against the Vincenty/chord and
// round-trip oracle); what is tested HERE is the translation between
// what the Layout Mapper holds and what the engine expects, and the
// honesty of what the check refuses to judge.

import {
  ICON_TO_TYPE, typeOfLayer, layersToItems, skippedLayers,
  runLayoutCheck, toFeet, requiredSpacingM,
} from '../layoutSpacing';

const BASE_LAT = 4.8156;
const BASE_LON = 7.0498;

/** Place an icon layer dLatM metres north of the base point. */
const layer = (id, iconName, dLatM, extra = {}) => ({
  id,
  type: 'icon',
  iconName,
  tag: `${iconName}-001`,
  latlng: { lat: BASE_LAT + dLatM / 111320, lng: BASE_LON },
  ...extra,
});

describe('icon to equipment type', () => {
  test('maps every standard mapper icon that has a spacing class', () => {
    expect(typeOfLayer({ iconName: 'Heater-Treater' })).toBe('heaterTreater');
    expect(typeOfLayer({ iconName: 'Wellhead' })).toBe('wellhead');
    expect(typeOfLayer({ iconName: 'Nonsense' })).toBeNull();
    // every mapped type must exist in the engine's table
    Object.values(ICON_TO_TYPE).forEach((t) => {
      expect(requiredSpacingM({ typeA: t, typeB: t })).not.toBeNull();
    });
  });
});

describe('layers to items', () => {
  test('keeps standard equipment and drops what cannot be judged', () => {
    const layers = [
      layer('a', 'Wellhead', 0),
      layer('b', 'Tank', 100),
      { id: 'p', type: 'pipeline', latlngs: [] },
      layer('c', 'Custom Skid', 50, { isCustom: true }),
      layer('d', 'Nonsense', 60),
      { id: 'e', type: 'icon', iconName: 'Tank', latlng: null },
    ];
    const items = layersToItems(layers);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
    // and the skipped ones are reported rather than hidden
    const skipped = skippedLayers(layers);
    expect(skipped.map((l) => l.id).sort()).toEqual(['c', 'd', 'p']);
  });
});

describe('the mapper check', () => {
  test('asks for two items before judging anything', () => {
    const r = runLayoutCheck({ layers: [layer('a', 'Wellhead', 0)], radiation: {} });
    expect(r.error).toMatch(/at least two/);
  });

  test('flags a table violation with both names', () => {
    const layers = [layer('a', 'Wellhead', 0), layer('b', 'Tank', 10)];
    const r = runLayoutCheck({ layers, radiation: {} });
    expect(r.pass).toBe(false);
    expect(r.worst.requiredM).toBe(30);
    expect(r.worst.actualM).toBeLessThan(30);
    expect(r.worst.aName).toContain('Wellhead');
    expect(r.worst.bName).toContain('Tank');
  });

  test('passes a well-spread site', () => {
    const layers = [layer('a', 'Wellhead', 0), layer('b', 'Tank', 200)];
    const r = runLayoutCheck({ layers, radiation: {} });
    expect(r.pass).toBe(true);
    expect(r.neighbours).toHaveLength(2);
    expect(r.neighbours[0].nearest.id).toBe('b');
  });

  test('builds a computed flare setback from the stated duty', () => {
    const layers = [layer('f', 'Flare', 0), layer('t', 'Tank', 40)];
    const radiation = {
      flareEnabled: true, reliefRateKgS: 20, lhvKjKg: 46000,
      fractionRadiated: 0.3, allowableKwM2: 4.73,
    };
    const r = runLayoutCheck({ layers, radiation });
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0].setbackM).toBeGreaterThan(50);
    const rad = r.violations.find((v) => v.kind === 'radiation');
    expect(rad).toBeTruthy();
    // and a smaller relief makes a smaller setback: it moves with the duty
    const smaller = runLayoutCheck({
      layers, radiation: { ...radiation, reliefRateKgS: 2 },
    });
    expect(smaller.sources[0].setbackM).toBeLessThan(r.sources[0].setbackM);
  });

  test('a pool fire setback attaches to tanks when enabled', () => {
    const layers = [layer('t1', 'Tank', 0), layer('t2', 'Tank', 20)];
    const off = runLayoutCheck({ layers, radiation: { poolEnabled: false } });
    expect(off.sources).toHaveLength(0);
    const on = runLayoutCheck({
      layers, radiation: { poolEnabled: true, poolDiameterM: 20, allowableKwM2: 4.73 },
    });
    expect(on.sources).toHaveLength(2); // one per tank
    expect(on.sources[0].label).toMatch(/Pool fire/);
  });

  test('converts to feet for the secondary readout', () => {
    expect(toFeet(30.48)).toBeCloseTo(100, 6);
    expect(Number.isNaN(toFeet(undefined))).toBe(true);
  });
});
