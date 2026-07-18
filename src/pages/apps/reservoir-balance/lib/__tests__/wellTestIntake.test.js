// MB3: the WTA -> Material Balance Studio intake mapping is pure and
// jest-guarded so the studio restructure (and any future one) cannot silently
// break the WT5 handoff contract.
import { mapWellTestIntake } from '../wellTestIntake.js';

describe('mapWellTestIntake (WT5 handoff contract)', () => {
  test('maps the full payload into new-case prefill', () => {
    const out = mapWellTestIntake({
      pAvg_psia: 3510.46,
      tempF: 212.4,
      fluid: 'gas',
      wellName: 'AKO-3',
      k_md: 48.037,
      skin: 1.43,
      source: 'Well Test Analysis Studio',
    });
    expect(out.prefill).toEqual({
      initial_pressure_psia: '3510.5',
      reservoir_temperature_f: '212',
      fluid_system: 'gas',
      name: 'AKO-3 material balance',
    });
    expect(out.note).toContain('Well Test Analysis Studio');
    expect(out.note).toContain('k = 48.0 md');
    expect(out.note).toContain('skin = 1.4');
  });

  test('oil fluid does not force the fluid_system field', () => {
    const out = mapWellTestIntake({ pAvg_psia: 2900, fluid: 'oil' });
    expect(out.prefill.fluid_system).toBeUndefined();
    expect(out.prefill.initial_pressure_psia).toBe('2900.0');
  });

  test('non-finite and non-positive values are dropped', () => {
    const out = mapWellTestIntake({
      pAvg_psia: NaN,
      tempF: -10,
      wellName: 'X-1',
    });
    expect(out.prefill).toEqual({ name: 'X-1 material balance' });
  });

  test('empty or useless payloads return null', () => {
    expect(mapWellTestIntake(null)).toBeNull();
    expect(mapWellTestIntake({})).toBeNull();
    expect(mapWellTestIntake({ pAvg_psia: 0, tempF: 0 })).toBeNull();
  });

  test('missing k/skin omits the reference clause', () => {
    const out = mapWellTestIntake({ pAvg_psia: 3000 });
    expect(out.note).not.toContain('for reference');
  });
});
