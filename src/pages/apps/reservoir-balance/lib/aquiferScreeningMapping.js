// MB4: map the client-side aquifer screening state (Screening segment of the
// Aquifer tab, engine src/utils/aquiferInfluxCalculations.js) onto the server
// engine's run-config aquifer fields ("Use in model"). Pure and jest-guarded:
// the field-name translation between the two engines is exactly the kind of
// contract that silently rots without a test.
//
// Screening params (client field units):
//   k (md), muw (cp), phi, ct (1/psi), h (ft), rR (ft), theta (deg),
//   re (ft, Fetkovich geometry), W (rb), J (rb/d/psi), reD (Carter-Tracy)
// Server aquifer_params: see MBALInputs.aquifer_params in
//   supabase/functions/_shared/mbal-engine.ts.
//
// Returns { aquifer_model, aquifer_params, note } or null when the screening
// state cannot be mapped. The server has no van Everdingen-Hurst model, so a
// vEH screening maps to Carter-Tracy (its standard marching approximation);
// the note says so.
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};

export function mapScreeningToAquiferParams(method, params = {}, result = {}) {
  if (method === 'fetkovich') {
    // Prefer the values the client engine actually used (it derives W and J
    // from geometry when the direct inputs are blank and reports them back).
    const W = num(result.W) ?? num(params.W);
    const J = num(result.J) ?? num(params.J);
    const ct = num(params.ct);
    if (!(W > 0) || !(J > 0) || !(ct > 0)) return null;
    return {
      aquifer_model: 'fetkovich',
      aquifer_params: {
        initial_aquifer_water_in_place_rb: W,
        aquifer_pi_rb_d_psi: J,
        aquifer_total_compressibility_psi: ct,
      },
      note: 'Fetkovich aquifer applied to the case: W and J as screened (geometry-derived values included).',
    };
  }

  if (method === 'carter-tracy' || method === 'veh') {
    const required = ['k', 'muw', 'phi', 'ct', 'h', 'rR', 'theta'];
    const p = {};
    for (const key of required) {
      p[key] = num(params[key]);
      if (p[key] === undefined || p[key] <= 0) return null;
    }
    const aquifer_params = {
      aquifer_permeability_md: p.k,
      aquifer_water_viscosity_cp: p.muw,
      aquifer_porosity: p.phi,
      aquifer_total_compressibility_psi: p.ct,
      aquifer_thickness_ft: p.h,
      aquifer_radius_ft: p.rR,
      theta_degrees: p.theta,
    };
    const reD = num(params.reD);
    if (reD > 1) aquifer_params.radius_ratio = reD;
    return {
      aquifer_model: 'carter_tracy',
      aquifer_params,
      note:
        method === 'veh'
          ? 'van Everdingen-Hurst screening applied as a Carter-Tracy model (the server engine’s marching approximation of vEH). Same geometry and properties.'
          : 'Carter-Tracy aquifer applied to the case with the screened geometry and properties.',
    };
  }

  return null;
}
