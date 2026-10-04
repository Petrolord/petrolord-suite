/**
 * EOR-U1 validation gate (PL1): the screening engine held against
 * Taber, Martin and Seright (1997) as printed. Every assertion CALLS the
 * engine (screenMethod / screenAllMethods); the published limits are
 * transcribed here once, from the papers, and probed at the limit and just
 * beyond it, so a limit typed wrong in the engine fails here.
 *
 *   Part 1, Table 3 (SPE Reservoir Engineering, Aug 1997, p. 191): the
 *   summary of every method.
 *   Part 2, Table 3 (p. 200): CO2 miscible minimum depth by oil gravity.
 *   Part 2, Tables 4 and 5 (pp. 200-201): chemical and polymer floods.
 */
import { EOR_METHODS, screenMethod, screenAllMethods, co2MinDepthFt, atLeast, atMost } from '../../eorScreeningCalculations';

const byId = (id) => EOR_METHODS.find((m) => m.id === id);
const verdict = (r, key) => r.verdicts.find((v) => v.key === key);

// As printed in Part 1, Table 3 (min / max; upper limits of the chemical
// floods read with Part 2, Tables 4 and 5, see the engine).
const PUBLISHED = {
  nitrogen: { gravity: { min: 35 }, viscosity: { max: 0.4 }, oilSat: { min: 40 }, depth: { min: 6000 } },
  hydrocarbon: { gravity: { min: 23 }, viscosity: { max: 3 }, oilSat: { min: 30 }, depth: { min: 4000 } },
  co2: { gravity: { min: 22 }, viscosity: { max: 10 }, oilSat: { min: 20 } },
  immiscible: { gravity: { min: 12 }, viscosity: { max: 600 }, oilSat: { min: 35 }, depth: { min: 1800 } },
  chemical: { gravity: { min: 20 }, viscosity: { max: 35 }, oilSat: { min: 35 }, permeability: { min: 10 }, depth: { max: 9000 }, temperature: { max: 200 } },
  polymer: { gravity: { min: 15 }, viscosity: { min: 10, max: 150 }, oilSat: { min: 50 }, permeability: { min: 10 }, depth: { max: 9000 }, temperature: { max: 200 } },
  combustion: { gravity: { min: 10 }, viscosity: { max: 5000 }, oilSat: { min: 50 }, thickness: { min: 10 }, permeability: { min: 50 }, depth: { max: 11500 }, temperature: { min: 100 } },
  steam: { gravity: { min: 8 }, viscosity: { max: 200000 }, oilSat: { min: 40 }, thickness: { min: 20 }, permeability: { min: 200 }, depth: { max: 4500 } },
};
const INPUT_KEY = { gravity: 'gravityApi', viscosity: 'viscosityCp', oilSat: 'oilSatPct', thickness: 'netThicknessFt', permeability: 'permeabilityMd', depth: 'depthFt', temperature: 'temperatureF' };
const NOT_CRITICAL = {
  nitrogen: ['permeability', 'temperature'], hydrocarbon: ['permeability', 'temperature'], co2: ['permeability', 'temperature'],
  immiscible: ['permeability', 'temperature', 'formation'], chemical: ['thickness'], polymer: ['thickness'], steam: ['temperature'],
};

describe('Part 1, Table 3: every published limit, probed through the engine', () => {
  for (const [id, crit] of Object.entries(PUBLISHED)) {
    for (const [key, lim] of Object.entries(crit)) {
      it(`${id} ${key}: on the limit passes, beyond it fails`, () => {
        const m = byId(id);
        for (const [side, edge] of [['min', lim.min], ['max', lim.max]]) {
          if (edge == null) continue;
          const step = Math.max(Math.abs(edge) * 0.01, 0.01);
          const beyond = side === 'min' ? edge - step : edge + step;
          const inside = side === 'min' ? edge + step : edge - step;
          expect(verdict(screenMethod(m, { [INPUT_KEY[key]]: edge }), key).status).toBe('pass');
          expect(verdict(screenMethod(m, { [INPUT_KEY[key]]: inside }), key).status).toBe('pass');
          expect(verdict(screenMethod(m, { [INPUT_KEY[key]]: beyond }), key).status).toBe('fail');
        }
      });
    }
  }
  it('every engine limit is one the paper prints (no extra limits)', () => {
    for (const m of EOR_METHODS) {
      const probe = screenMethod(m, { gravityApi: 30, viscosityCp: 5, oilSatPct: 60, netThicknessFt: 50, permeabilityMd: 500, depthFt: 3000, temperatureF: 150 });
      for (const v of probe.verdicts) {
        if (['formation', 'transmissibility'].includes(v.key) || (m.id === 'co2' && v.key === 'depth')) continue;
        if (v.notCritical) expect(PUBLISHED[m.id][v.key]).toBeUndefined();
        else expect(PUBLISHED[m.id][v.key]).toBeDefined();
      }
    }
  });
  it('the criteria the paper marks NC are never scored', () => {
    for (const [id, keys] of Object.entries(NOT_CRITICAL)) {
      const r = screenMethod(byId(id), { formation: 'other', netThicknessFt: 1, permeabilityMd: 0.01, temperatureF: 400 });
      for (const k of keys) expect(verdict(r, k).status).toBe('na');
    }
  });
});

describe('Part 2, Table 3: CO2 miscible minimum depth by oil gravity', () => {
  const BANDS = [[45, 2500], [40, 2500], [39.9, 2800], [32, 2800], [31.9, 3300], [28, 3300], [27.9, 4000], [22, 4000]];
  it.each(BANDS)('%s API needs more than %s ft', (api, ft) => {
    expect(co2MinDepthFt(api).depthFt).toBe(ft);
    const co2 = byId('co2');
    expect(verdict(screenMethod(co2, { gravityApi: api, depthFt: ft }), 'depth').status).toBe('pass');
    expect(verdict(screenMethod(co2, { gravityApi: api, depthFt: ft - 10 }), 'depth').status).toBe('fail');
  });
  it('below 22 API CO2 fails miscible on gravity and the depth is not screened', () => {
    const r = screenMethod(byId('co2'), { gravityApi: 21.9, depthFt: 9000 });
    expect(verdict(r, 'gravity').status).toBe('fail');
    expect(verdict(r, 'depth').status).toBe('na');
    expect(verdict(r, 'depth').reason).toMatch(/immiscible/);
  });
  // EOR-U1-002 (S2): before the fix a 25 API oil at 3,000 ft qualified for CO2 miscible on the 2,500 ft summary limit.
  it('a 25 API oil at 3,000 ft is screened out of CO2 miscible', () => {
    const r = screenMethod(byId('co2'), { gravityApi: 25, viscosityCp: 3, oilSatPct: 40, formation: 'sandstone', depthFt: 3000 });
    expect(r.outcome).toBe('screened out');
    expect(verdict(r, 'depth').spec.min).toBe(4000);
  });
  it('negative control: without the depth-by-gravity rule the same case would qualify (the probe discriminates)', () => {
    const summaryOnly = { ...byId('co2'), depthByGravity: false };
    const r = screenMethod(summaryOnly, { gravityApi: 25, viscosityCp: 3, oilSatPct: 40, formation: 'sandstone', depthFt: 3000 });
    expect(r.outcome).toBe('qualified');
  });
});

describe('Notes of Part 1, Table 3 and the softer words of Part 2', () => {
  it('note b: a carbonate polymer flood at 3 to 10 md is marginal (fracture sweep), below 3 md it fails', () => {
    const p = byId('polymer');
    expect(verdict(screenMethod(p, { formation: 'carbonate', permeabilityMd: 5 }), 'permeability').status).toBe('marginal');
    expect(verdict(screenMethod(p, { formation: 'carbonate', permeabilityMd: 2 }), 'permeability').status).toBe('fail');
    expect(verdict(screenMethod(p, { formation: 'sandstone', permeabilityMd: 5 }), 'permeability').status).toBe('fail');
  });
  it('notes c and d: transmissibility kh/mu above 20 (combustion) and 50 (steam) md-ft/cp', () => {
    // k 200 md, h 25 ft, mu 100 cp: 50 md-ft/cp, on the steam limit
    const steam = screenMethod(byId('steam'), { permeabilityMd: 200, netThicknessFt: 25, viscosityCp: 100 });
    expect(verdict(steam, 'transmissibility').actual).toBeCloseTo(50, 12);
    expect(verdict(steam, 'transmissibility').status).toBe('pass');
    const tight = screenMethod(byId('steam'), { permeabilityMd: 200, netThicknessFt: 25, viscosityCp: 101 });
    expect(verdict(tight, 'transmissibility').status).toBe('fail');
    const comb = screenMethod(byId('combustion'), { permeabilityMd: 60, netThicknessFt: 10, viscosityCp: 40 });
    expect(verdict(comb, 'transmissibility').status).toBe('fail'); // 15 < 20
    expect(verdict(screenMethod(byId('steam'), { permeabilityMd: 200 }), 'transmissibility').status).toBe('na');
  });
  it('the thermal methods name high-porosity sand or sandstone: a carbonate fails', () => {
    expect(verdict(screenMethod(byId('steam'), { formation: 'carbonate' }), 'formation').status).toBe('fail');
    expect(verdict(screenMethod(byId('steam'), { formation: 'sand' }), 'formation').status).toBe('pass');
  });
});

describe('the boundary is compared in one unit system with a tolerance', () => {
  it('a value a conversion leaves a hair past the limit is on the limit', () => {
    const ft = 1371.6 / 0.3048; // 4,500 ft typed as 1,371.6 m
    expect(ft === 4500).toBe(false);
    expect(atMost(ft, 4500)).toBe(true);
    expect(verdict(screenMethod(byId('steam'), { depthFt: ft }), 'depth').status).toBe('pass');
    expect(atMost(4500.01, 4500)).toBe(false);
    expect(atLeast(34.999999999999, 35)).toBe(true);
  });
});

describe('field cases', () => {
  // Part 2, Table 5 (p. 201), the four successful polymer floods the authors
  // single out: reservoir temperature and permeability are printed; nothing
  // else the screen needs is. A successful project must not be screened out
  // on what the paper prints, and the unprinted criteria stay unscored.
  it.each([
    ['Marmul', 115, 15000], ['Oerrel', 136, 2000], ['Courtenay', 86, 2000], ['Daqing', 113, 870],
  ])('%s polymer flood (Part 2, Table 5): %s F, %s md', (_name, t, k) => {
    const r = screenMethod(byId('polymer'), { temperatureF: t, permeabilityMd: k });
    expect(r.outcome).toBe('qualified');
    expect(r.applicable).toBe(2);
    expect(r.unscored).toBeGreaterThanOrEqual(5);
  });

  // Bati Raman, Turkey: the 13 API immiscible CO2 project that Part 1 (p. 192)
  // says made the authors lower the immiscible gravity limit to 12 API.
  // Properties from a secondary source (12 API average, 450 to 1,000 cp,
  // about 1,310 m, Garzan limestone, 64 m, bulk 10 to 100 md); see the
  // upgrade doc. The field straddles the 600 cp limit, and the engine says so.
  const BATI = { gravityApi: 12, oilSatPct: null, formation: 'carbonate', netThicknessFt: 64 / 0.3048, permeabilityMd: 50, depthFt: 1310 / 0.3048, temperatureF: null };
  it('Bati Raman at the low end of its viscosity qualifies for immiscible gas only', () => {
    const all = screenAllMethods({ ...BATI, viscosityCp: 450 });
    expect(all[0].id).toBe('immiscible');
    expect(all[0].outcome).toBe('qualified');
    expect(all.filter((r) => r.outcome === 'qualified').map((r) => r.id)).toEqual(['immiscible']);
    const co2 = all.find((r) => r.id === 'co2');
    expect(verdict(co2, 'gravity').status).toBe('fail');
    expect(verdict(all.find((r) => r.id === 'steam'), 'formation').status).toBe('fail');
  });
  it('Bati Raman at 1,000 cp is screened out of immiscible gas on viscosity (the field sits on the limit)', () => {
    const r = screenMethod(byId('immiscible'), { ...BATI, viscosityCp: 1000 });
    expect(r.outcome).toBe('screened out');
    expect(verdict(r, 'viscosity').status).toBe('fail');
  });
});
