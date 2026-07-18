/**
 * MB6 — tank-model contact movement (piston-front screening estimates on the
 * engine's We and gas-cap expansion series).
 */
import { computeContactMovement, CONTACT_DEFAULTS } from '../contactMovement';

const BASE_PARAMS = {
  initialOwcFt: 8500,
  initialGocFt: 8000,
  areaOwcAcres: 1000,
  areaGocAcres: 1000,
  porosity: 0.2,
  swi: 0.25,
  sorWater: 0.25,
  sorGas: 0.15,
  ooipStb: 100e6,
  gasCapM: 0.5,
  fluidSystem: 'oil_with_gas_cap',
};

const PLOT = {
  timestep_index: [0, 1, 2],
  pressure: [3000, 2800, 2600],
  We: [0, 1e6, 2e6],
  cum_water_stb: [0, 100000, 200000],
  Bw: [1.02, 1.02, 1.02],
  Eg_oil: [0, 0.01, 0.02],
};

describe('computeContactMovement', () => {
  it('moves the OWC up by the net influx spread over the contact area', () => {
    const r = computeContactMovement(BASE_PARAMS, PLOT);
    expect(r.ok).toBe(true);
    expect(r.series[0].owcFt).toBe(8500);
    // Step 2: net water = 2e6 - 200000*1.02 = 1.796e6 rb
    // dh = 1.796e6 * 5.615 / (1000*43560*0.2*0.5) = 2.315 ft
    expect(r.series[2].dhOwcFt).toBeCloseTo(
      (1.796e6 * 5.615) / (1000 * 43560 * 0.2 * (1 - 0.25 - 0.25)),
      6,
    );
    expect(r.currentOwcFt).toBeLessThan(8500);
  });

  it('moves the GOC down by the gas-cap expansion volume m·N·Eg_oil', () => {
    const r = computeContactMovement(BASE_PARAMS, PLOT);
    // Step 2: 0.5 * 100e6 * 0.02 = 1e6 rb
    const expected = (1e6 * 5.615) / (1000 * 43560 * 0.2 * (1 - 0.25 - 0.15));
    expect(r.series[2].dhGocFt).toBeCloseTo(expected, 6);
    expect(r.currentGocFt).toBeGreaterThan(8000);
  });

  it('clamps the OWC at initial depth when produced water exceeds influx', () => {
    const r = computeContactMovement(BASE_PARAMS, {
      ...PLOT,
      We: [0, 50000, 60000],
      cum_water_stb: [0, 100000, 200000],
    });
    expect(r.ok).toBe(true);
    expect(r.series.every((s) => s.owcFt <= 8500 && s.owcFt >= 8499.999)).toBe(true);
  });

  it('gas case tracks the water contact only (no GOC)', () => {
    const r = computeContactMovement(
      { ...BASE_PARAMS, fluidSystem: 'gas', initialGocFt: null },
      PLOT,
    );
    expect(r.ok).toBe(true);
    expect(r.currentGocFt).toBeNull();
    expect(r.series[2].gocFt).toBeNull();
  });

  it('degrades to a static GOC with a warning when m or Eg_oil is missing', () => {
    const noM = computeContactMovement({ ...BASE_PARAMS, gasCapM: 0 }, PLOT);
    expect(noM.ok).toBe(true);
    expect(noM.currentGocFt).toBe(8000);
    expect(noM.warnings.join(' ')).toMatch(/gas cap ratio m/);

    const legacy = computeContactMovement(BASE_PARAMS, { ...PLOT, Eg_oil: undefined });
    expect(legacy.currentGocFt).toBe(8000);
    expect(legacy.warnings.join(' ')).toMatch(/rerun the engine/);
  });

  it('warns when the tracked contacts collide', () => {
    const r = computeContactMovement(
      { ...BASE_PARAMS, initialOwcFt: 8010, initialGocFt: 8000, areaOwcAcres: 10, areaGocAcres: 10 },
      PLOT,
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/reached the tracked OWC/);
  });

  it('validates geometry and saturations with actionable errors', () => {
    expect(computeContactMovement({ ...BASE_PARAMS, porosity: 0 }, PLOT).ok).toBe(false);
    expect(computeContactMovement({ ...BASE_PARAMS, swi: 0.8, sorWater: 0.3 }, PLOT).ok).toBe(false);
    expect(computeContactMovement(BASE_PARAMS, { timestep_index: [0] }).ok).toBe(false);
  });

  it('exports sane defaults for residual saturations', () => {
    expect(CONTACT_DEFAULTS.sorWater).toBeGreaterThan(0);
    expect(CONTACT_DEFAULTS.sorGas).toBeGreaterThan(0);
  });
});
