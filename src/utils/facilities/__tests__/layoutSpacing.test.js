// Facilities F8 adapter gates. The physics is gated in the engines
// package (facilities.spacing.test.js against the Vincenty/chord and
// round-trip oracle); what is tested HERE is the translation between
// what the Layout Mapper holds and what the engine expects, and the
// honesty of what the check refuses to judge.

import {
  ICON_TO_TYPE, typeOfLayer, layersToItems, skippedLayers,
  runLayoutCheck, toFeet, requiredSpacingM,
  DEFAULT_SPACING_INPUTS, spacingInputsToRadiation, normaliseSpacingInputs,
  spacingReportSection, poolRadiusFromCentreM, poolFireSetbackM,
} from '../layoutSpacing';
import { checkLayout } from '@/utils/facilities/engine/spacing';

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
      flareEnabled: true, reliefRateKgS: 20, flareLhvKjKg: 46000,
      flareFractionRadiated: 0.3, flareAllowableKwM2: 4.73,
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
      layers, radiation: spacingInputsToRadiation({ ...DEFAULT_SPACING_INPUTS, poolEnabled: true }),
    });
    expect(on.sources).toHaveLength(2); // one per tank
    expect(on.sources[0].label).toMatch(/Pool fire/);
  });

  test('converts to feet for the secondary readout', () => {
    expect(toFeet(30.48)).toBeCloseTo(100, 6);
    expect(Number.isNaN(toFeet(undefined))).toBe(true);
  });
});

// FC1-0 S1: the pool-fire setback was passed as the distance from the pool
// EDGE while checkLayout measures centre to centre (the tank icon is the
// pool centre), so the check was short by D/2 and failed open.
describe('FC1-0: pool fire radius is measured from the tank centre', () => {
  const pool = spacingInputsToRadiation({ ...DEFAULT_SPACING_INPUTS, flareEnabled: false, poolEnabled: true });

  test('the default 20 m bund needs 66.1 m from the centre (56.1 m from the edge)', () => {
    const p = poolFireSetbackM({ poolDiameterM: 20 });
    expect(p.radiusFromCentreM).toBeCloseTo(66.1, 1);
    expect(p.setbackFromEdgeM).toBeCloseTo(56.1, 1);
    const r = runLayoutCheck({ layers: [layer('t', 'Tank', 0), layer('s', 'Separator', 200)], radiation: pool });
    expect(r.sources[0].setbackM).toBeCloseTo(66.1, 1);
    expect(r.sources[0].setbackFromEdgeM).toBeCloseTo(56.1, 1);
  });

  test('an item 60 m from the tank is flagged (it sat inside the old 56.1 m figure)', () => {
    const layers = [layer('t', 'Tank', 0), layer('s', 'Separator', 60)];
    const r = runLayoutCheck({ layers, radiation: pool });
    const rad = r.violations.filter((v) => v.kind === 'radiation');
    expect(rad).toHaveLength(1);
    expect(rad[0].requiredM).toBeCloseTo(66.1, 1);
    expect(rad[0].actualM).toBeLessThan(60.1);

    // The pre-fix wiring, reproduced: the edge figure passes the same pair.
    const items = r.items;
    const old = checkLayout({
      items,
      radiationSources: [{ id: 't', setbackM: r.sources[0].setbackFromEdgeM, allowableKwM2: 4.73 }],
    });
    expect(old.violations.filter((v) => v.kind === 'radiation')).toHaveLength(0);
  });

  test('negative control: an item 70 m away passes the radiation check', () => {
    const layers = [layer('t', 'Tank', 0), layer('s', 'Separator', 70)];
    const r = runLayoutCheck({ layers, radiation: pool });
    expect(r.sources).toHaveLength(1);
    expect(r.violations.filter((v) => v.kind === 'radiation')).toHaveLength(0);
    expect(r.complete).toBe(true);
  });

  test('a later engine without radiusFromCentreM is rebuilt conservatively', () => {
    expect(poolRadiusFromCentreM({ radiusFromCentreM: 12 }, 20)).toBe(12);
    expect(poolRadiusFromCentreM({ setbackFromEdgeM: 56.1 }, 20)).toBeCloseTo(66.1, 6);
    expect(Number.isNaN(poolRadiusFromCentreM({}, 20))).toBe(true);
  });
});

describe('FC1-0: radiation inputs are explicit and blanks stay blank', () => {
  test('flare and pool each use their own allowable', () => {
    const layers = [layer('f', 'Flare', 0), layer('t', 'Tank', 500)];
    const base = { ...DEFAULT_SPACING_INPUTS, flareEnabled: true, poolEnabled: true };
    const a = runLayoutCheck({ layers, radiation: spacingInputsToRadiation(base) });
    const b = runLayoutCheck({
      layers, radiation: spacingInputsToRadiation({ ...base, poolAllowableKwM2: '1.58' }),
    });
    const flare = (r) => r.sources.find((s) => s.kind === 'flare').setbackM;
    const poolR = (r) => r.sources.find((s) => s.kind === 'pool').setbackM;
    // Changing only the pool allowable moves the pool setback...
    expect(poolR(b)).toBeGreaterThan(poolR(a));
    // ...and negative control: the flare setback does not move with it.
    expect(flare(b)).toBeCloseTo(flare(a), 9);
  });

  test('pool burn rate, heating value and fraction radiated reach the engine', () => {
    const layers = [layer('t', 'Tank', 0), layer('s', 'Separator', 500)];
    const base = { ...DEFAULT_SPACING_INPUTS, flareEnabled: false, poolEnabled: true };
    const r0 = runLayoutCheck({ layers, radiation: spacingInputsToRadiation(base) });
    const r1 = runLayoutCheck({
      layers, radiation: spacingInputsToRadiation({ ...base, poolBurnRateKgM2S: '0.11' }),
    });
    expect(r1.sources[0].setbackM).toBeGreaterThan(r0.sources[0].setbackM);
  });

  test('a blank flare heating value is named, the source is not computed, the check is incomplete', () => {
    const layers = [layer('f', 'Flare', 0), layer('t', 'Tank', 40)];
    const r = runLayoutCheck({
      layers,
      radiation: spacingInputsToRadiation({ ...DEFAULT_SPACING_INPUTS, flareLhvKjKg: '' }),
    });
    expect(r.sources).toHaveLength(0);
    expect(r.complete).toBe(false);
    expect(r.sourceErrors[0].message).toBe(
      'Flare setback not computed. Missing or invalid: Flare LHV (kJ/kg).',
    );
    // negative control: the same layout with the value present is complete
    const ok = runLayoutCheck({ layers, radiation: spacingInputsToRadiation(DEFAULT_SPACING_INPUTS) });
    expect(ok.complete).toBe(true);
    expect(ok.sources).toHaveLength(1);
  });

  test('a fraction radiated above 1 is invalid; blanks parse to NaN, never a default', () => {
    const rad = spacingInputsToRadiation({ ...DEFAULT_SPACING_INPUTS, poolEnabled: true, poolFractionRadiated: '1.5', poolLhvKjKg: '' });
    expect(Number.isNaN(rad.poolLhvKjKg)).toBe(true);
    const r = runLayoutCheck({ layers: [layer('t', 'Tank', 0), layer('s', 'Separator', 90)], radiation: rad });
    const pool = r.sourceErrors.find((e) => e.source === 'pool');
    expect(pool.missing).toEqual(['Pool LHV (kJ/kg)', 'Pool fraction radiated']);
  });

  test('stored inputs merge over the defaults, and a stored blank stays blank', () => {
    const n = normaliseSpacingInputs({ poolDiameterM: '', poolEnabled: 1 });
    expect(n.poolDiameterM).toBe('');
    expect(n.poolEnabled).toBe(true);
    expect(n.poolBurnRateKgM2S).toBe(DEFAULT_SPACING_INPUTS.poolBurnRateKgM2S);
  });

  test('the report section carries summary, setbacks, violations and notes', () => {
    const layers = [layer('t', 'Tank', 0), layer('s', 'Separator', 60)];
    const r = runLayoutCheck({
      layers, radiation: spacingInputsToRadiation({ ...DEFAULT_SPACING_INPUTS, poolEnabled: true }),
    });
    const sec = spacingReportSection(r);
    expect(sec.summary[0]).toMatch(/of \d+ checks fail/);
    expect(sec.setbacks[0][1]).toBe('66');
    expect(sec.setbacks[0][2]).toBe('56');
    expect(sec.violations.some((row) => /Pool fire/.test(row[1]))).toBe(true);
    expect(sec.notes.join(' ')).toMatch(/centre to centre/);
    // negative control: a check that could not run says so and lists nothing
    const none = spacingReportSection(runLayoutCheck({ layers: [layers[0]], radiation: {} }));
    expect(none.summary[0]).toMatch(/Spacing check not run/);
    expect(none.violations).toHaveLength(0);
  });
});
