// Presets, resolution order and the vocabulary adapter.
import { FAMILY_KEYS, isKnownUnit } from '../registry';
import { PRESETS, normalizeProfile, makeProfile, profileUnit } from '../presets';
import { resolveProfile, BUILT_IN_RESOLUTION, LAYERS, sourceLabel } from '../profile';
import { appUnitFor, systemFor, appSystemFor } from '../vocabulary';

describe('presets', () => {
  test('every preset names a valid unit for every family', () => {
    for (const p of ['oilfield', 'metric']) for (const fam of FAMILY_KEYS) {
      expect(isKnownUnit(fam, PRESETS[p][fam])).toBe(true);
    }
  });
  test('oilfield and metric carry the agreed units', () => {
    expect(PRESETS.oilfield).toMatchObject({ depth: 'ft', pressure: 'psi', temperature: 'degF', liquidVolume: 'bbl', liquidRate: 'STB/d', gasRate: 'Mscf/d', fvfOil: 'RB/STB', area: 'acre', rockVolume: 'acre-ft', density: 'g/cc', sonic: 'us/ft', timeSeismic: 'ms' });
    expect(PRESETS.metric).toMatchObject({ depth: 'm', pressure: 'kPa', temperature: 'degC', liquidVolume: 'm3', liquidRate: 'm3/d', gasRate: '10^3 m3/d', fvfOil: 'm3/m3', area: 'km2', rockVolume: '10^6 m3', density: 'kg/m3', sonic: 'us/m', timeSeismic: 'ms' });
  });
  test('normalizeProfile drops unknown units and refuses a bad preset', () => {
    expect(normalizeProfile({ preset: 'metric', units: { depth: 'ft', pressure: 'atm', nope: 'x' } })).toEqual({ preset: 'metric', units: { depth: 'ft' }, version: 1 });
    expect(normalizeProfile({ preset: 'imperial', units: {} })).toBeNull();
    expect(normalizeProfile(null)).toBeNull();
  });
  test('custom sets only what it lists', () => {
    const c = makeProfile('custom', { pressure: 'bar' });
    expect(profileUnit(c, 'pressure')).toBe('bar');
    expect(profileUnit(c, 'depth')).toBeUndefined();
  });
});

describe('resolution order', () => {
  test('nothing stored: built-in oilfield', () => {
    expect(BUILT_IN_RESOLUTION.units.depth).toBe('ft');
    expect(BUILT_IN_RESOLUTION.sources.depth).toBe('builtin');
    expect(sourceLabel('builtin')).toBe('built-in default');
  });
  test('legacy depth beats built-in for depth only', () => {
    const r = resolveProfile({ legacyDepthUnit: 'm' });
    expect(r.units.depth).toBe('m');
    expect(r.sources.depth).toBe('legacy');
    expect(r.units.pressure).toBe('psi');
    expect(r.sources.pressure).toBe('builtin');
  });
  test('organisation beats legacy; user beats organisation', () => {
    const org = makeProfile('metric');
    const r1 = resolveProfile({ organization: org, legacyDepthUnit: 'ft' });
    expect(r1.units.depth).toBe('m');
    expect(r1.sources.depth).toBe('organization');
    const r2 = resolveProfile({ organization: org, user: makeProfile('oilfield'), legacyDepthUnit: 'm' });
    expect(r2.units.depth).toBe('ft');
    expect(r2.sources.pressure).toBe('user');
  });
  test('a custom user profile changes one family and follows the organisation for the rest', () => {
    const r = resolveProfile({ organization: makeProfile('metric'), user: makeProfile('custom', { pressure: 'bar' }) });
    expect(r.units.pressure).toBe('bar');
    expect(r.sources.pressure).toBe('user');
    expect(r.units.depth).toBe('m');
    expect(r.sources.depth).toBe('organization');
  });
  test('the reserved project layer sits between organisation and user', () => {
    expect(LAYERS).toEqual(['user', 'project', 'organization', 'legacy', 'builtin']);
    const r = resolveProfile({ organization: makeProfile('metric'), project: makeProfile('custom', { depth: 'ft' }) });
    expect(r.units.depth).toBe('ft');
    expect(r.sources.depth).toBe('project');
    const r2 = resolveProfile({ user: makeProfile('custom', { depth: 'm' }), project: makeProfile('custom', { depth: 'ft' }) });
    expect(r2.sources.depth).toBe('user');
  });
  test('negative control: a malformed organisation row is ignored, not trusted', () => {
    const r = resolveProfile({ organization: { preset: 'imperial', units: { depth: 'm' } } });
    expect(r.sources.depth).toBe('builtin');
    expect(r.units.depth).toBe('ft');
  });
});

describe('vocabulary adapter', () => {
  test('exact matches through aliases', () => {
    expect(appUnitFor('temperature', 'degF', ['C', 'F'])).toEqual({ unit: 'F', exact: true });
    expect(appUnitFor('depth', 'm', ['m', 'ft'])).toEqual({ unit: 'm', exact: true });
  });
  test('closest same-system unit when the app lacks the exact one', () => {
    expect(appUnitFor('pressure', 'kPa', ['MPa', 'psi', 'ppg', 'sg'])).toEqual({ unit: 'MPa', exact: false });
    expect(appUnitFor('pressure', 'bar', ['MPa', 'psi'])).toEqual({ unit: 'MPa', exact: false });
    expect(appUnitFor('pressure', 'psi', ['MPa', 'psi'])).toEqual({ unit: 'psi', exact: true });
  });
  test('systems by majority with the first family breaking ties', () => {
    expect(systemFor(PRESETS.oilfield, ['pressure', 'depth'])).toBe('oilfield');
    expect(systemFor(PRESETS.metric, ['pressure', 'depth'])).toBe('metric');
    expect(systemFor({ pressure: 'kPa', depth: 'ft' }, ['pressure', 'depth'])).toBe('metric');
    expect(appSystemFor('welltest', PRESETS.metric, ['pressure'])).toBe('si');
    expect(appSystemFor('rcp', PRESETS.oilfield, ['area'])).toBe('field');
    expect(appSystemFor('petro', PRESETS.metric, ['depth'])).toBe('si');
    expect(() => appSystemFor('nope', PRESETS.metric, ['depth'])).toThrow();
  });
});
