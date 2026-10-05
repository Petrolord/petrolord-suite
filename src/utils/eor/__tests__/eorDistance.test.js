// EOR-U2-007: how far each input sits from each published limit, as
// information (the paper's own remark that limits are not sharp, Part 1,
// p. 192), never a score. The distance is taken on the engine's verdicts.
import { screenMethod, EOR_METHODS, screenAllMethods } from '@/utils/eorScreeningCalculations';
import { distanceToLimit, distanceText } from '../format';
import { buildEorReportModel } from '../reportModel';
import { fieldCase } from './eorTestKit';

const co2 = EOR_METHODS.find((m) => m.id === 'co2');
const polymer = EOR_METHODS.find((m) => m.id === 'polymer');
const verdict = (method, input, key) => screenMethod(method, input).verdicts.find((v) => v.key === key);

describe('distance to the limit', () => {
  it('measures from the limit the verdict was judged on, signed inside (+) or outside (-)', () => {
    // CO2 at 34 API: the depth limit is the 2,800 ft band (Part 2, Table 3)
    const d = distanceToLimit(verdict(co2, { gravityApi: 34, depthFt: 3500 }, 'depth'));
    expect(d).toMatchObject({ limit: 'min', limitValue: 2800, delta: 700, inside: true });
    expect(d.relPct).toBeCloseTo(25, 9);
    const out = distanceToLimit(verdict(co2, { gravityApi: 34, depthFt: 2600 }, 'depth'));
    expect(out).toMatchObject({ delta: -200, inside: false });
    // a window (polymer viscosity 10 to 150 cp): the nearer limit
    expect(distanceToLimit(verdict(polymer, { viscosityCp: 140 }, 'viscosity'))).toMatchObject({ limit: 'max', limitValue: 150, delta: 10 });
    expect(distanceToLimit(verdict(polymer, { viscosityCp: 12 }, 'viscosity'))).toMatchObject({ limit: 'min', limitValue: 10, delta: 2 });
    expect(distanceToLimit(verdict(polymer, { viscosityCp: 200 }, 'viscosity'))).toMatchObject({ limit: 'max', delta: -50, inside: false });
  });
  it('words in the display units; a temperature difference converts without the offset', () => {
    const t = verdict(EOR_METHODS.find((m) => m.id === 'combustion'), { temperatureF: 118 }, 'temperature');
    expect(distanceText(t, 'oilfield')).toBe('18 degF above the minimum 100 degF (18 %)');
    expect(distanceText(t, 'si')).toBe('10 degC above the minimum 37.78 degC (18 %)');
    expect(distanceText(verdict(co2, { gravityApi: 34, depthFt: 2600 }, 'depth'), 'oilfield')).toBe('200 ft below the minimum 2,800 ft (7.1 %)');
  });
  it('negative controls: no distance for a blank input, a criterion that is not critical, or the formation', () => {
    expect(distanceToLimit(verdict(co2, { gravityApi: 34 }, 'depth'))).toBeNull();
    expect(distanceToLimit(verdict(co2, { permeabilityMd: 10 }, 'permeability'))).toBeNull();
    expect(distanceToLimit(verdict(co2, { formation: 'sandstone' }, 'formation'))).toBeNull();
    expect(distanceText(verdict(co2, { gravityApi: 34 }, 'depth'))).toBe('n/a');
  });
  it('is information only: the verdicts and ranking are the same with or without it', () => {
    const inputs = fieldCase();
    const m = buildEorReportModel(inputs);
    const ranked = screenAllMethods({ gravityApi: 34, viscosityCp: 1.1, oilSatPct: 42, formation: 'sandstone', netThicknessFt: 60, permeabilityMd: 150, depthFt: 7200, temperatureF: 190 });
    expect(m.ranking.rows.map((r) => [r[1], r[2]])).toEqual(ranked.map((r) => [r.name, { qualified: 'Qualified', marginal: 'Marginal', 'screened out': 'Screened out', 'not screened': 'Not screened' }[r.outcome]]));
    const co2Table = m.methods.find((x) => x.id === 'co2');
    expect(co2Table.head).toContain('Distance to the limit');
    const depthRow = co2Table.rows.find((r) => r[0] === 'Depth');
    expect(depthRow[co2Table.head.indexOf('Distance to the limit')]).toBe('4,400 ft above the minimum 2,800 ft (157 %)');
  });
});
