/**
 * MB5 — history-match parameter catalog (client mirror of the engine's
 * HM_PARAM_SPECS applicability rules and default-guess chains).
 */
import {
  effectiveAquiferModel,
  applicableParameters,
  buildHistoryMatchRequest,
} from '../historyMatchParams';

const oilCase = { fluid_system: 'oil', has_aquifer: true, has_gas_cap: false };
const gasCase = { fluid_system: 'gas', has_aquifer: true, has_gas_cap: false };

describe('effectiveAquiferModel', () => {
  it('prefers the saved run-config model, falls back to pot for has_aquifer', () => {
    expect(effectiveAquiferModel(oilCase, { aquifer_model: 'carter_tracy' })).toBe('carter_tracy');
    expect(effectiveAquiferModel(oilCase, null)).toBe('pot');
    expect(effectiveAquiferModel({ ...oilCase, has_aquifer: false }, null)).toBe('none');
  });
});

describe('applicableParameters', () => {
  it('gas + pot: OGIP (checked, guess from last run) and W', () => {
    const params = applicableParameters(
      gasCase,
      { aquifer_model: 'pot', aquifer_params: {} },
      { estimated_ogip_scf: 1.008e11, aquifer_owip_rb: 7.45e7 },
    );
    expect(params.map((p) => p.key)).toEqual(['ogip_scf', 'aquifer_w_rb']);
    const g = params[0];
    expect(g.defaultChecked).toBe(true);
    expect(g.defaultGuess).toBe(1.008e11);
    const w = params[1];
    expect(w.defaultGuess).toBe(7.45e7);
    expect(w.guessSource).toBe('last run');
  });

  it('fetkovich: J is opt-in (degeneracy) and seeds from the Aquifer tab', () => {
    const params = applicableParameters(
      gasCase,
      {
        aquifer_model: 'fetkovich',
        aquifer_params: { initial_aquifer_water_in_place_rb: 6.33e8, aquifer_pi_rb_d_psi: 485 },
      },
      null,
    );
    const j = params.find((p) => p.key === 'aquifer_j_rb_d_psi');
    expect(j.defaultChecked).toBe(false);
    expect(j.defaultGuess).toBe(485);
    const w = params.find((p) => p.key === 'aquifer_w_rb');
    expect(w.defaultGuess).toBe(6.33e8);
    expect(w.guessSource).toBe('Aquifer tab');
  });

  it('carter_tracy: r_R chain explicit -> area-derived -> 2980 legacy', () => {
    const explicit = applicableParameters(
      oilCase,
      { aquifer_model: 'carter_tracy', aquifer_params: { aquifer_radius_ft: 9200 } },
      null,
    ).find((p) => p.key === 'aquifer_radius_ft');
    expect(explicit.defaultGuess).toBe(9200);

    const derived = applicableParameters(
      oilCase,
      { aquifer_model: 'carter_tracy', aquifer_params: { reservoir_area_acres: 640 } },
      null,
    ).find((p) => p.key === 'aquifer_radius_ft');
    // Full circle: r = sqrt(640 * 43560 / pi) = 2978.7 ft
    expect(derived.defaultGuess).toBeCloseTo(2978.7, 0);
    expect(derived.guessSource).toBe('derived from area');

    const legacy = applicableParameters(
      oilCase,
      { aquifer_model: 'carter_tracy', aquifer_params: {} },
      null,
    ).find((p) => p.key === 'aquifer_radius_ft');
    expect(legacy.defaultGuess).toBe(2980);
    expect(legacy.guessSource).toBe('engine default');
  });

  it('oil with gas cap exposes optional gas_cap_m; gas case never does', () => {
    const withCap = applicableParameters(
      { fluid_system: 'oil', has_aquifer: false, has_gas_cap: true },
      null,
      null,
    );
    const m = withCap.find((p) => p.key === 'gas_cap_m');
    expect(m).toBeTruthy();
    expect(m.defaultChecked).toBe(false);
    expect(m.defaultGuess).toBe(0.2);
    expect(applicableParameters(gasCase, null, null).some((p) => p.key === 'gas_cap_m')).toBe(false);
  });

  it('no aquifer: only the in-place scale', () => {
    const params = applicableParameters(
      { fluid_system: 'oil', has_aquifer: false, has_gas_cap: false },
      null,
      null,
    );
    expect(params.map((p) => p.key)).toEqual(['stoiip_stb']);
  });
});

describe('buildHistoryMatchRequest', () => {
  it('requires at least one checked parameter', () => {
    const r = buildHistoryMatchRequest([{ key: 'stoiip_stb', checked: false, guess: '' }]);
    expect(r.ok).toBe(false);
  });

  it('collects fit keys and only the non-blank guesses (unchecked included)', () => {
    const r = buildHistoryMatchRequest([
      { key: 'stoiip_stb', checked: true, guess: '150e6' },
      { key: 'aquifer_radius_ft', checked: true, guess: '' },
      // Unchecked scale-companion guess still travels: the engine needs a
      // value for the held parameter too.
      { key: 'aquifer_permeability_md', checked: false, guess: '200' },
    ]);
    expect(r.ok).toBe(true);
    expect(r.payload.fit_parameters).toEqual(['stoiip_stb', 'aquifer_radius_ft']);
    expect(r.payload.initial_guesses).toEqual({
      stoiip_stb: 150e6,
      aquifer_permeability_md: 200,
    });
  });

  it('rejects non-positive or non-numeric starting values', () => {
    expect(buildHistoryMatchRequest([{ key: 'stoiip_stb', checked: true, guess: '-5' }]).ok).toBe(false);
    expect(buildHistoryMatchRequest([{ key: 'stoiip_stb', checked: true, guess: 'abc' }]).ok).toBe(false);
  });
});
