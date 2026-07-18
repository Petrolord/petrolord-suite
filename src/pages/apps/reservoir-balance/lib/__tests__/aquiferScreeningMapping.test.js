// MB4: the Screening -> server run-config field translation contract.
import { mapScreeningToAquiferParams } from '../aquiferScreeningMapping.js';

const CT_PARAMS = {
  k: 200, muw: 0.55, phi: 0.25, ct: 7e-6, h: 100, rR: 9200, theta: 140, reD: 5,
};

describe('mapScreeningToAquiferParams', () => {
  test('carter-tracy maps the full geometry including finite reD', () => {
    const out = mapScreeningToAquiferParams('carter-tracy', CT_PARAMS);
    expect(out.aquifer_model).toBe('carter_tracy');
    expect(out.aquifer_params).toEqual({
      aquifer_permeability_md: 200,
      aquifer_water_viscosity_cp: 0.55,
      aquifer_porosity: 0.25,
      aquifer_total_compressibility_psi: 7e-6,
      aquifer_thickness_ft: 100,
      aquifer_radius_ft: 9200,
      theta_degrees: 140,
      radius_ratio: 5,
    });
  });

  test('veh maps to carter_tracy with an explanatory note', () => {
    const out = mapScreeningToAquiferParams('veh', CT_PARAMS);
    expect(out.aquifer_model).toBe('carter_tracy');
    expect(out.note).toMatch(/van Everdingen-Hurst/);
    expect(out.aquifer_params.radius_ratio).toBe(5);
  });

  test('infinite-acting screening omits radius_ratio', () => {
    const { reD, ...noReD } = CT_PARAMS;
    const out = mapScreeningToAquiferParams('carter-tracy', noReD);
    expect(out.aquifer_params.radius_ratio).toBeUndefined();
  });

  test('fetkovich prefers the engine-derived W and J from the result', () => {
    const out = mapScreeningToAquiferParams(
      'fetkovich',
      { ct: 7e-6, W: '', J: '' },
      { W: 1.10483e10, J: 116.5 },
    );
    expect(out.aquifer_model).toBe('fetkovich');
    expect(out.aquifer_params.initial_aquifer_water_in_place_rb).toBeCloseTo(1.10483e10, 0);
    expect(out.aquifer_params.aquifer_pi_rb_d_psi).toBeCloseTo(116.5, 5);
    expect(out.aquifer_params.aquifer_total_compressibility_psi).toBe(7e-6);
  });

  test('string inputs from form fields are parsed', () => {
    const out = mapScreeningToAquiferParams('carter-tracy', {
      k: '200', muw: '0.55', phi: '0.25', ct: '7e-6', h: '100', rR: '9200', theta: '140',
    });
    expect(out.aquifer_params.aquifer_permeability_md).toBe(200);
  });

  test('missing required fields return null', () => {
    expect(mapScreeningToAquiferParams('carter-tracy', { k: 200 })).toBeNull();
    expect(mapScreeningToAquiferParams('fetkovich', { ct: 7e-6 })).toBeNull();
    expect(mapScreeningToAquiferParams('unknown', CT_PARAMS)).toBeNull();
  });
});
