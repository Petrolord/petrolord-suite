/**
 * H5 (Reservoir honesty sweep): the PVT tab's "Prefill from correlations"
 * built its table with Standing and Beggs-Robinson whatever the tab had
 * selected, the rows landed in the lab table, and the report printed
 * "PVT source: lab_table" for a table no laboratory ever measured.
 */
import { buildPvtPrefillRows } from '../fluidStudioPvtPrefill';
import { describePvtSource, markTableEdited, PVT_TABLE_ORIGIN_KEY } from '../pvtSource';
import { computePvtRow, rsAt } from '@/utils/fluidStudioCalculations';
import { mbalInputRows } from '../reportModel';

jest.mock('jspdf', () => jest.fn());
jest.mock('jspdf-autotable', () => jest.fn());

const OIL = {
  fluidSystem: 'oil', apiGravity: 35, gasSg: 0.75, temperatureF: 180,
  bubblePointPsia: 2500, maxPressurePsia: 4000, nPoints: 15,
};

describe('H5: the prefill follows the selected correlations and says what it used', () => {
  it.each(['standing', 'vasquez_beggs', 'glaso'])('Rs and Bo follow the selected %s', (key) => {
    const r = buildPvtPrefillRows({ ...OIL, correlations: { pb_rs_bo: key, oil_viscosity: 'beggs_robinson' } });
    expect(r.ok).toBe(true);
    // the oracle is the Fluid Systems engine itself, on the selected correlation
    const fluid = { api: 35, gasGravity: 0.75, temp: 180, salinity: 0, pb: null, rsb: 0, correlations: { pb_rs_bo: key, viscosity: 'beggs_robinson' } };
    fluid.rsb = rsAt(2500, fluid);
    const node = r.rows.find((row) => row.pressure_psia === 2500);
    const ref = computePvtRow(2500, fluid, 2500);
    expect(node.rs_scf_stb).toBe(ref.Rs);
    expect(node.bo_rb_stb).toBe(ref.Bo);
    expect(node.oil_viscosity_cp).toBe(ref.mu_o);
    expect(r.origin.methods.pb_rs_bo.key).toBe(key);
  });

  it('a different selection gives a different table (it used to be Standing always)', () => {
    const standing = buildPvtPrefillRows({ ...OIL, gorScfStb: 600, correlations: { pb_rs_bo: 'standing' } });
    const vb = buildPvtPrefillRows({ ...OIL, gorScfStb: 600, correlations: { pb_rs_bo: 'vasquez_beggs' } });
    const at = (r) => r.rows.find((row) => row.pressure_psia === 2500).bo_rb_stb;
    expect(at(vb)).not.toBe(at(standing));
    // no selection keeps the old default
    expect(buildPvtPrefillRows({ ...OIL, gorScfStb: 600 }).rows).toEqual(standing.rows);
  });

  it('names every method the table was built with, including the ones it could not follow', () => {
    const r = buildPvtPrefillRows({
      ...OIL, correlations: { pb_rs_bo: 'glaso', oil_viscosity: 'beal_standing', z_factor: 'dranchuk_abou_kassem' },
    });
    const m = r.origin.methods;
    expect(m.pb_rs_bo.label).toBe('Glaso');
    expect(m.oil_viscosity.label).toBe('Beggs-Robinson');
    expect(m.z_factor.label).toMatch(/Papay/);
    expect(m.gas_viscosity.label).toBe('Lee-Gonzalez-Eakin');
    // the selections the Fluid Systems engine has no equivalent for are said, not hidden
    expect(r.origin.substitutions.join(' ')).toMatch(/Beal/);
    expect(r.origin.substitutions.join(' ')).toMatch(/Dranchuk-Abou-Kassem/);
    expect(r.origin.kind).toBe('correlation_prefill');
    expect(r.origin.edited).toBe(false);
  });
});

describe('H5: the report and the screen state the true source', () => {
  const origin = buildPvtPrefillRows({ ...OIL, correlations: { pb_rs_bo: 'vasquez_beggs' } }).origin;
  const built = {
    pvt_source: 'lab_table',
    pvt_lab_table: [{ pressure_psia: 1000 }, { pressure_psia: 2000 }],
    pvt_correlations: { pb_rs_bo: 'vasquez_beggs', oil_viscosity: 'beggs_robinson', [PVT_TABLE_ORIGIN_KEY]: origin },
  };

  it('a correlation-built table is not called a lab table', () => {
    const text = describePvtSource(built);
    expect(text).toMatch(/built from correlations/i);
    expect(text).toMatch(/Vasquez-Beggs/);
    expect(text).toMatch(/Beggs-Robinson/);
    expect(text).not.toMatch(/^lab_table$/);
    expect(text).toMatch(/with no lab data/);
  });

  it('a hand edit after the prefill is carried', () => {
    const edited = { ...built, pvt_correlations: markTableEdited(built.pvt_correlations) };
    expect(describePvtSource(edited)).toMatch(/edited by hand/);
    // marking a table that was never prefilled changes nothing
    expect(markTableEdited({ pb_rs_bo: 'standing' })).toEqual({ pb_rs_bo: 'standing' });
  });

  it('a typed table and a correlated run are named for what they are', () => {
    expect(describePvtSource({ pvt_source: 'lab_table', pvt_lab_table: [{}, {}], pvt_correlations: { pb_rs_bo: 'standing' } }))
      .toMatch(/Table entered on the PVT tab/);
    const corr = describePvtSource({
      pvt_source: 'correlated',
      pvt_correlations: { pb_rs_bo: 'glaso', oil_viscosity: 'beal_standing', z_factor: 'hall_yarborough', water: 'mccain', gas_viscosity: 'lee_gonzalez_eakin' },
    });
    expect(corr).toMatch(/^Correlations: Glaso/);
    expect(corr).toMatch(/Beal-Standing/);
    expect(corr).toMatch(/Hall-Yarborough/);
    expect(describePvtSource(null)).toBe('n/a');
  });

  it('the report inputs table prints that text, never the raw enum', () => {
    const rows = mbalInputRows({ caseData: { fluid_system: 'oil', initial_pressure_psia: 3000 }, runConfig: built, study: null, result: null });
    const source = rows.find((r) => r.key === 'pvt_source');
    expect(source.source).toBe(describePvtSource(built));
    expect(`${source.value} ${source.source}`).not.toMatch(/lab_table/);
    // the generated table names its origin in its own row too
    expect(rows.find((r) => r.key === 'pvt_table').source).toBe(describePvtSource(built));
  });
});
