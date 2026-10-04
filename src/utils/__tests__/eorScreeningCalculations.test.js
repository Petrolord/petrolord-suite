import {
  EOR_METHODS, screenMethod, screenAllMethods, describeRange, sampleEorScreeningData,
} from '../eorScreeningCalculations';

const byId = (id) => EOR_METHODS.find((m) => m.id === id);

// A deep, light, low-viscosity miscible-gas candidate.
const LIGHT_DEEP = {
  gravityApi: 40, viscosityCp: 0.3, oilSatPct: 60, formation: 'sandstone',
  netThicknessFt: 30, permeabilityMd: 100, depthFt: 8000, temperatureF: 180,
};

// A shallow, heavy, viscous steam candidate. EOR-U1-004: at 5,000 cp its
// kh/mu was 24 md-ft/cp, under the 50 of Part 1, Table 3, note d, which the
// engine did not apply; 2,000 cp gives 60.
const HEAVY_SHALLOW = {
  gravityApi: 12, viscosityCp: 2000, oilSatPct: 60, formation: 'sandstone',
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

  // EOR-U1-003: "Sandstone preferred" (Part 1, Table 3; Part 2, Tables 4 and 5:
  // polymer "can be used in carbonates") is a preference, so a carbonate is
  // marginal for the chemical floods. Before the fix it failed outright.
  it('marks carbonate marginal for the sandstone-preferred chemical methods', () => {
    const carb = { ...LIGHT_DEEP, formation: 'carbonate', viscosityCp: 20, gravityApi: 25, depthFt: 5000 };
    const chem = screenMethod(byId('chemical'), carb);
    const f = chem.verdicts.find((v) => v.criterion === 'Formation');
    expect(f.status).toBe('marginal');
    expect(f.reason).toMatch(/preferred/);
    expect(chem.outcome).toBe('marginal');
    expect(chem.qualified).toBe(false);
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

  it('note d: the 5,000 cp version of the steam candidate fails on transmissibility', () => {
    const r = screenMethod(byId('steam'), { ...HEAVY_SHALLOW, viscosityCp: 5000 });
    expect(r.verdicts.find((v) => v.key === 'transmissibility').status).toBe('fail');
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
    // the sample is too heavy, viscous and shallow for nitrogen; too deep and too tight for steam, on carbonate
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
