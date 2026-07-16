import {
  EOR_METHODS, screenMethod, screenAllMethods, describeRange, sampleEorScreeningData,
} from '../eorScreeningCalculations';

const byId = (id) => EOR_METHODS.find((m) => m.id === id);

// A deep, light, low-viscosity miscible-gas candidate.
const LIGHT_DEEP = {
  gravityApi: 40, viscosityCp: 0.3, oilSatPct: 60, formation: 'sandstone',
  netThicknessFt: 30, permeabilityMd: 100, depthFt: 8000, temperatureF: 180,
};

// A shallow, heavy, viscous steam candidate.
const HEAVY_SHALLOW = {
  gravityApi: 12, viscosityCp: 5000, oilSatPct: 60, formation: 'sandstone',
  netThicknessFt: 80, permeabilityMd: 1500, depthFt: 1200, temperatureF: 90,
};

describe('screenMethod', () => {
  it('qualifies the classic candidates for their textbook methods', () => {
    expect(screenMethod(byId('nitrogen'), LIGHT_DEEP).qualified).toBe(true);
    expect(screenMethod(byId('hydrocarbon'), LIGHT_DEEP).qualified).toBe(true);
    expect(screenMethod(byId('co2'), LIGHT_DEEP).qualified).toBe(true);
    expect(screenMethod(byId('steam'), HEAVY_SHALLOW).qualified).toBe(true);
  });

  it('disqualifies the mismatches for the right reasons', () => {
    const steamOnLight = screenMethod(byId('steam'), LIGHT_DEEP);
    expect(steamOnLight.qualified).toBe(false);
    const depth = steamOnLight.verdicts.find((v) => v.criterion === 'Depth');
    expect(depth.status).toBe('fail'); // 8000 ft > 4500 ft steam limit

    const n2OnHeavy = screenMethod(byId('nitrogen'), HEAVY_SHALLOW);
    expect(n2OnHeavy.qualified).toBe(false);
    expect(n2OnHeavy.verdicts.find((v) => v.criterion === 'Oil gravity').status).toBe('fail');
    expect(n2OnHeavy.verdicts.find((v) => v.criterion === 'Oil viscosity').status).toBe('fail');
    expect(n2OnHeavy.verdicts.find((v) => v.criterion === 'Depth').status).toBe('fail');
  });

  it('enforces the polymer viscosity window on both sides', () => {
    const base = { ...HEAVY_SHALLOW, depthFt: 3000, temperatureF: 150, oilSatPct: 60 };
    // 0.5 cp: too thin — polymer not needed (fails the > 10 cp side)
    expect(
      screenMethod(byId('polymer'), { ...base, viscosityCp: 0.5, gravityApi: 35 })
        .verdicts.find((v) => v.criterion === 'Oil viscosity').status,
    ).toBe('fail');
    // 60 cp: inside 10-150
    expect(
      screenMethod(byId('polymer'), { ...base, viscosityCp: 60, gravityApi: 25 })
        .verdicts.find((v) => v.criterion === 'Oil viscosity').status,
    ).toBe('pass');
    // 500 cp: too viscous
    expect(
      screenMethod(byId('polymer'), { ...base, viscosityCp: 500, gravityApi: 25 })
        .verdicts.find((v) => v.criterion === 'Oil viscosity').status,
    ).toBe('fail');
  });

  it('fails carbonate for the sandstone-preferred chemical methods', () => {
    const carb = { ...LIGHT_DEEP, formation: 'carbonate', viscosityCp: 20, gravityApi: 25, depthFt: 5000 };
    const chem = screenMethod(byId('chemical'), carb);
    expect(chem.verdicts.find((v) => v.criterion === 'Formation').status).toBe('fail');
  });

  it('treats missing inputs as not-applicable, never as pass or fail', () => {
    const sparse = screenMethod(byId('co2'), { gravityApi: 30 });
    const visc = sparse.verdicts.find((v) => v.criterion === 'Oil viscosity');
    expect(visc.status).toBe('na');
    expect(sparse.applicable).toBe(1); // only gravity was screenable
    expect(sparse.passes).toBe(1);
  });

  it('keeps geometry advisory: thin-unless-dipping never scores', () => {
    const r = screenMethod(byId('nitrogen'), LIGHT_DEEP);
    const th = r.verdicts.find((v) => v.criterion === 'Net thickness');
    expect(th.status).toBe('na');
    expect(th.required).toMatch(/advisory/i);
  });

  it('scores as passes over applicable criteria', () => {
    const r = screenMethod(byId('steam'), LIGHT_DEEP);
    expect(r.score).toBeCloseTo(r.passes / r.applicable, 12);
    expect(r.score).toBeLessThan(1);
  });
});

describe('screenAllMethods', () => {
  it('ranks qualified methods first', () => {
    const results = screenAllMethods(HEAVY_SHALLOW);
    expect(results).toHaveLength(EOR_METHODS.length);
    expect(results[0].qualified).toBe(true);
    expect(results[0].id).toBe('steam');
    const lastQualifiedIdx = results.map((r) => r.qualified).lastIndexOf(true);
    const firstUnqualifiedIdx = results.map((r) => r.qualified).indexOf(false);
    expect(firstUnqualifiedIdx).toBeGreaterThan(lastQualifiedIdx === -1 ? -1 : lastQualifiedIdx - 1);
  });

  it('screens the shipped sample as a CO2 candidate', () => {
    const results = screenAllMethods(sampleEorScreeningData());
    const co2 = results.find((r) => r.id === 'co2');
    expect(co2.qualified).toBe(true);
    // Sample is too shallow/heavy for nitrogen and too cool/shallow-oil for steam thickness? Steam depth passes (1200<4500 is false: 5200>4500)
    expect(results.find((r) => r.id === 'nitrogen').qualified).toBe(false);
    expect(results.find((r) => r.id === 'steam').qualified).toBe(false);
  });
});

describe('describeRange', () => {
  it('formats min/max/window specs', () => {
    expect(describeRange({ min: 22 }, '°API')).toBe('> 22 °API');
    expect(describeRange({ max: 4500 }, 'ft')).toBe('< 4500 ft');
    expect(describeRange({ min: 10, max: 150 }, 'cp')).toBe('10 to 150 cp');
  });
});
