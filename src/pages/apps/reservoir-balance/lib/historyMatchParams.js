/**
 * Material Balance Studio, history match (MB5) — client-side mirror of the
 * engine's parameter catalog (supabase/functions/_shared/mbal-engine.ts,
 * HM_PARAM_SPECS + defaultHistoryMatchParameters). Pure functions, jest
 * guarded: which parameters a case can fit, their default starting values,
 * and the request payload the calculate-mbal edge function expects.
 *
 * Keys, labels and applicability rules MUST stay in step with the engine.
 * The engine is the authority; a key sent for a non-applicable case gets a
 * clear engine error rather than silent behavior.
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/**
 * The aquifer model the run will actually use, mirroring the inherit chain
 * in MaterialBalanceStudioContext.executeRun.
 */
export function effectiveAquiferModel(caseData, defaultCfg) {
  return defaultCfg?.aquifer_model ?? (caseData?.has_aquifer ? 'pot' : 'none');
}

/**
 * Parameters this case can fit, with default starting values.
 *
 * Returns [{ key, label, unit, group, defaultChecked, defaultGuess|null,
 *            guessSource|null }].
 * defaultGuess null means the engine derives its own start (regression for
 * N/G, configured aquifer values otherwise) or requires the user to type one.
 */
export function applicableParameters(caseData, defaultCfg, lastResult) {
  if (!caseData) return [];
  const isGas = caseData.fluid_system === 'gas';
  const aquiferModel = effectiveAquiferModel(caseData, defaultCfg);
  const aq = defaultCfg?.aquifer_params ?? {};
  const params = [];

  if (isGas) {
    const guess = num(lastResult?.estimated_ogip_scf);
    params.push({
      key: 'ogip_scf',
      label: 'OGIP G',
      unit: 'scf',
      group: 'in_place',
      defaultChecked: true,
      defaultGuess: guess,
      guessSource: guess ? 'last run' : null,
    });
  } else {
    const guess = num(lastResult?.estimated_ooip_stb);
    params.push({
      key: 'stoiip_stb',
      label: 'STOIIP N',
      unit: 'STB',
      group: 'in_place',
      defaultChecked: true,
      defaultGuess: guess,
      guessSource: guess ? 'last run' : null,
    });
    if (caseData.has_gas_cap) {
      params.push({
        key: 'gas_cap_m',
        label: 'Gas cap ratio m',
        unit: 'fraction',
        group: 'gas_cap',
        defaultChecked: false,
        defaultGuess: num(defaultCfg?.gas_cap_ratio_m) ?? 0.2,
        guessSource: num(defaultCfg?.gas_cap_ratio_m) ? 'run config' : 'engine default',
      });
    }
  }

  if (aquiferModel === 'pot' || aquiferModel === 'fetkovich') {
    const configured = num(aq.initial_aquifer_water_in_place_rb);
    const regressed = num(lastResult?.aquifer_owip_rb);
    params.push({
      key: 'aquifer_w_rb',
      label: 'Aquifer water in place W',
      unit: 'res bbl',
      group: 'aquifer',
      defaultChecked: true,
      defaultGuess: configured ?? regressed,
      guessSource: configured ? 'Aquifer tab' : regressed ? 'last run' : null,
    });
  }
  if (aquiferModel === 'fetkovich') {
    const j = num(aq.aquifer_pi_rb_d_psi);
    params.push({
      key: 'aquifer_j_rb_d_psi',
      label: 'Aquifer productivity index J',
      unit: 'rb/d/psi',
      group: 'aquifer',
      // J trades against W on short histories (a documented degeneracy), so
      // it stays opt-in; the default fit adjusts W with J held.
      defaultChecked: false,
      defaultGuess: j,
      guessSource: j ? 'Aquifer tab' : null,
    });
  }
  if (aquiferModel === 'carter_tracy') {
    const rConfigured = num(aq.aquifer_radius_ft);
    let rDerived = null;
    const area = num(aq.reservoir_area_acres);
    if (!rConfigured && area) {
      const fWedge = (num(aq.theta_degrees) ?? 360) / 360;
      rDerived = Math.sqrt((area * 43560) / (Math.PI * fWedge));
    }
    params.push({
      key: 'aquifer_radius_ft',
      label: 'Reservoir radius at the OWC r_R',
      unit: 'ft',
      group: 'aquifer',
      defaultChecked: true,
      defaultGuess: rConfigured ?? rDerived ?? 2980,
      guessSource: rConfigured ? 'Aquifer tab' : rDerived ? 'derived from area' : 'engine default',
    });
    const k = num(aq.aquifer_permeability_md);
    params.push({
      key: 'aquifer_permeability_md',
      label: 'Aquifer permeability',
      unit: 'md',
      group: 'aquifer',
      defaultChecked: false,
      defaultGuess: k,
      guessSource: k ? 'Aquifer tab' : null,
    });
  }
  return params;
}

/**
 * Build the edge-function history_match payload from the UI selection.
 * selection: [{ key, checked, guess }] where guess is a string from the
 * input field (blank means let the engine derive the start).
 * Returns { ok: true, payload } or { ok: false, error }.
 */
export function buildHistoryMatchRequest(selection) {
  const chosen = (selection ?? []).filter((s) => s.checked);
  if (chosen.length === 0) {
    return { ok: false, error: 'Select at least one parameter to fit.' };
  }
  const payload = { fit_parameters: chosen.map((s) => s.key) };
  const initial_guesses = {};
  for (const s of selection ?? []) {
    const raw = typeof s.guess === 'string' ? s.guess.trim() : s.guess;
    if (raw === '' || raw == null) continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) {
      return {
        ok: false,
        error: `Starting value for ${s.label ?? s.key} must be a positive number.`,
      };
    }
    initial_guesses[s.key] = v;
  }
  if (Object.keys(initial_guesses).length > 0) {
    payload.initial_guesses = initial_guesses;
  }
  return { ok: true, payload };
}
