/**
 * MB7 — lab-table prefill from the Fluid Studio client black-oil engine.
 */
import { buildPvtPrefillRows } from '../fluidStudioPvtPrefill';

const OIL = {
  fluidSystem: 'oil',
  apiGravity: 35,
  gasSg: 0.75,
  temperatureF: 180,
  bubblePointPsia: 2500,
  maxPressurePsia: 4000,
  nPoints: 15,
};

describe('buildPvtPrefillRows oil', () => {
  it('builds an ascending table with an exact bubble-point node', () => {
    const r = buildPvtPrefillRows(OIL);
    expect(r.ok).toBe(true);
    const pressures = r.rows.map((row) => row.pressure_psia);
    expect([...pressures].sort((a, b) => a - b)).toEqual(pressures);
    expect(pressures).toContain(2500);
    expect(r.derivedGor).toBeGreaterThan(0); // GOR derived from Pb
  });

  it('caps Rs at the bubble point and shrinks Bo above it', () => {
    const r = buildPvtPrefillRows(OIL);
    const atPb = r.rows.find((row) => row.pressure_psia === 2500);
    const above = r.rows.filter((row) => row.pressure_psia > 2500);
    const below = r.rows.filter((row) => row.pressure_psia < 2500);
    expect(above.every((row) => row.rs_scf_stb === atPb.rs_scf_stb)).toBe(true);
    expect(above.every((row) => row.bo_rb_stb <= atPb.bo_rb_stb)).toBe(true);
    expect(below.every((row) => row.rs_scf_stb <= atPb.rs_scf_stb)).toBe(true);
    // Saturated Bo grows with pressure toward Pb.
    for (let i = 1; i < below.length; i++) {
      expect(below[i].bo_rb_stb).toBeGreaterThanOrEqual(below[i - 1].bo_rb_stb);
    }
  });

  it('honors an explicit GOR instead of deriving one', () => {
    const r = buildPvtPrefillRows({ ...OIL, gorScfStb: 600 });
    expect(r.ok).toBe(true);
    expect(r.derivedGor).toBeNull();
    const atPb = r.rows.find((row) => row.pressure_psia === 2500);
    expect(atPb.rs_scf_stb).toBeLessThanOrEqual(600);
  });

  it('needs either a GOR or a bubble point', () => {
    const r = buildPvtPrefillRows({ ...OIL, bubblePointPsia: null });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/GOR/);
  });
});

describe('buildPvtPrefillRows gas', () => {
  it('builds z, Bg and gas viscosity columns only', () => {
    const r = buildPvtPrefillRows({
      fluidSystem: 'gas',
      gasSg: 0.65,
      temperatureF: 239,
      maxPressurePsia: 7000,
      nPoints: 12,
    });
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(12);
    for (const row of r.rows) {
      expect(row.z_factor).toBeGreaterThan(0.2);
      expect(row.bg_rb_mscf).toBeGreaterThan(0);
      expect(row.gas_viscosity_cp).toBeGreaterThan(0);
      expect(row.bo_rb_stb).toBeUndefined();
    }
    // Bg grows as pressure falls.
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i].bg_rb_mscf).toBeLessThan(r.rows[i - 1].bg_rb_mscf);
    }
  });

  it('validates inputs with actionable errors', () => {
    expect(buildPvtPrefillRows({ fluidSystem: 'gas', gasSg: 0, temperatureF: 200, maxPressurePsia: 5000 }).ok).toBe(false);
    expect(buildPvtPrefillRows({ fluidSystem: 'gas', gasSg: 0.7, temperatureF: 200, maxPressurePsia: 50 }).ok).toBe(false);
  });
});
