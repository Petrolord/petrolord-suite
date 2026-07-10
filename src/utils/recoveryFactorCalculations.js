// Recovery Factor (RF) estimation for oil & gas reservoirs.
//
// Closes the STOIIP/GIIP -> recoverable-reserves bridge:
//     Reserves = RF x OOIP (or OGIP)
//
// Three complementary methods, in decreasing order of defensibility:
//
//   1. Drive-mechanism ANALOG ranges  (default) — published low/typical/high
//      recovery bands per primary drive mechanism. Transparent, hard to abuse,
//      always shown as a sanity band alongside the other methods.
//
//   2. Material/PVT correlations — API (1967) empirical correlations for
//      solution-gas-drive and water-drive oil reservoirs, and the exact p/z
//      depletion relation for volumetric gas. The API correlations are
//      empirical fits with wide scatter; they are GATED behind a warning and
//      should be validated against the analog band and, ideally, simulation.
//
//   3. Volumetric OOIP/OGIP helpers so the tool can stand alone or take a
//      hand-off from a volumetrics app.
//
// Field units throughout: area (acres), thickness (ft), porosity & saturations
// (fraction), permeability (md), viscosity (cp), pressure (psia),
// Bo/Boi (RB/STB), Bgi (RB/scf). OOIP in STB, OGIP in scf.

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

const clampFraction = (rf) => {
  if (!Number.isFinite(rf)) return null;
  return Math.min(0.95, Math.max(0.01, rf));
};

// ---------------------------------------------------------------------------
// 1. Drive-mechanism analog ranges
// ---------------------------------------------------------------------------
// Recovery-factor bands (fraction of OOIP/OGIP) by primary drive mechanism.
// Ranges reflect commonly published values (e.g. API, Ahmed, Satter & Iqbal,
// Tarek Ahmed "Reservoir Engineering Handbook"). They are indicative screening
// bands, not guarantees — always confirm against reservoir-specific data.
export const DRIVE_MECHANISMS = [
  {
    code: 'solution_gas',
    label: 'Solution-gas drive',
    phase: 'oil',
    low: 0.05, typical: 0.15, high: 0.30,
    notes: 'Depletion (dissolved-gas) drive. Low efficiency; primary target for pressure maintenance / secondary recovery.',
  },
  {
    code: 'gas_cap',
    label: 'Gas-cap expansion drive',
    phase: 'oil',
    low: 0.20, typical: 0.30, high: 0.40,
    notes: 'Expanding gas cap displaces oil downward. Efficiency improves with gas-cap size and structural relief.',
  },
  {
    code: 'water_drive',
    label: 'Water drive (edge/bottom)',
    phase: 'oil',
    low: 0.35, typical: 0.50, high: 0.75,
    notes: 'Aquifer influx maintains pressure. Strong, active water drive gives the highest primary recoveries.',
  },
  {
    code: 'gravity_drainage',
    label: 'Gravity drainage',
    phase: 'oil',
    low: 0.40, typical: 0.60, high: 0.80,
    notes: 'Steeply dipping / high-relief reservoirs with good vertical permeability; slow but very efficient.',
  },
  {
    code: 'combination',
    label: 'Combination drive',
    phase: 'oil',
    low: 0.20, typical: 0.35, high: 0.50,
    notes: 'Two or more mechanisms acting together (typical of many real fields).',
  },
  {
    code: 'gas_volumetric',
    label: 'Gas — volumetric depletion',
    phase: 'gas',
    low: 0.70, typical: 0.80, high: 0.90,
    notes: 'Closed (no-aquifer) gas reservoir depleting on expansion; recovery set by abandonment pressure.',
  },
  {
    code: 'gas_water_drive',
    label: 'Gas — water drive',
    phase: 'gas',
    low: 0.35, typical: 0.55, high: 0.75,
    notes: 'Aquifer support traps gas behind the advancing water front, lowering recovery vs volumetric depletion.',
  },
];

export const getDriveMechanism = (code) =>
  DRIVE_MECHANISMS.find((d) => d.code === code) || null;

// ---------------------------------------------------------------------------
// 2a. API (1967) solution-gas-drive correlation  — GATED (empirical)
// ---------------------------------------------------------------------------
// ER = 0.41815 * [ phi(1-Swi)/Bob ]^0.1611 * (k/muob)^0.0979
//               * Swi^0.3722 * (pb/pa)^0.1741            (fraction of OOIP)
export function apiSolutionGasDriveRF({ phi, swi, bob, k, muob, pb, pa }) {
  const _phi = num(phi), _swi = num(swi), _bob = num(bob),
    _k = num(k), _muob = num(muob), _pb = num(pb), _pa = num(pa);
  if ([_phi, _swi, _bob, _k, _muob, _pb, _pa].some((x) => !Number.isFinite(x))) return null;
  if (_bob <= 0 || _muob <= 0 || _pa <= 0 || _k <= 0 || _swi <= 0) return null;
  const rf = 0.41815
    * Math.pow((_phi * (1 - _swi)) / _bob, 0.1611)
    * Math.pow(_k / _muob, 0.0979)
    * Math.pow(_swi, 0.3722)
    * Math.pow(_pb / _pa, 0.1741);
  return clampFraction(rf);
}

// 2b. API (1967) water-drive correlation — GATED (empirical)
// ER = 0.54898 * [ phi(1-Swi)/Boi ]^0.0422 * [ (k*muwi)/muoi ]^0.0770
//               * Swi^-0.1903 * (pi/pa)^-0.2159          (fraction of OOIP)
export function apiWaterDriveRF({ phi, swi, boi, k, muwi, muoi, pi, pa }) {
  const _phi = num(phi), _swi = num(swi), _boi = num(boi), _k = num(k),
    _muwi = num(muwi), _muoi = num(muoi), _pi = num(pi), _pa = num(pa);
  if ([_phi, _swi, _boi, _k, _muwi, _muoi, _pi, _pa].some((x) => !Number.isFinite(x))) return null;
  if (_boi <= 0 || _muoi <= 0 || _pa <= 0 || _k <= 0 || _swi <= 0 || _pi <= 0) return null;
  const rf = 0.54898
    * Math.pow((_phi * (1 - _swi)) / _boi, 0.0422)
    * Math.pow((_k * _muwi) / _muoi, 0.0770)
    * Math.pow(_swi, -0.1903)
    * Math.pow(_pi / _pa, -0.2159);
  return clampFraction(rf);
}

// ---------------------------------------------------------------------------
// 2c. Gas depletion via p/z (exact for volumetric gas)
// ---------------------------------------------------------------------------
// RF = 1 - (pa/za) / (pi/zi)
export function gasPZDepletionRF({ pi, zi, pa, za }) {
  const _pi = num(pi), _zi = num(zi), _pa = num(pa), _za = num(za);
  if ([_pi, _zi, _pa, _za].some((x) => !Number.isFinite(x))) return null;
  if (_pi <= 0 || _zi <= 0 || _za <= 0) return null;
  const rf = 1 - (_pa / _za) / (_pi / _zi);
  return clampFraction(rf);
}

// 2d. Water-drive gas — trapped-gas / sweep estimate
// RF = sweep * (1 - Sgr/(1-Swi))
export function gasWaterDriveRF({ swi, sgr, sweep }) {
  const _swi = num(swi), _sgr = num(sgr), _sweep = num(sweep);
  if ([_swi, _sgr, _sweep].some((x) => !Number.isFinite(x))) return null;
  if (_swi >= 1) return null;
  const displaceable = 1 - _sgr / (1 - _swi);
  const rf = _sweep * displaceable;
  return clampFraction(rf);
}

// ---------------------------------------------------------------------------
// 3. Volumetric hydrocarbon-in-place helpers
// ---------------------------------------------------------------------------
// OOIP (STB) = 7758 * A * h * phi * (1-Sw) * NTG / Boi
export function stoiipVolumetric({ area, thickness, phi, sw, boi, ntg = 1 }) {
  const A = num(area), h = num(thickness), p = num(phi), s = num(sw), B = num(boi), n = num(ntg);
  if ([A, h, p, s, B, n].some((x) => !Number.isFinite(x)) || B <= 0) return null;
  return (7758 * A * h * p * (1 - s) * n) / B;
}

// OGIP (scf) = 43560 * A * h * phi * (1-Sw) * NTG / Bgi   (Bgi in RB... use ft3)
// Using Bgi in reservoir-ft3/scf: OGIP = 43560*A*h*phi*(1-Sw)*NTG / Bgi
export function ogipVolumetric({ area, thickness, phi, sw, bgi, ntg = 1 }) {
  const A = num(area), h = num(thickness), p = num(phi), s = num(sw), B = num(bgi), n = num(ntg);
  if ([A, h, p, s, B, n].some((x) => !Number.isFinite(x)) || B <= 0) return null;
  return (43560 * A * h * p * (1 - s) * n) / B;
}

// ---------------------------------------------------------------------------
// Reserves rollup
// ---------------------------------------------------------------------------
export function reservesFromRF(ooip, rf) {
  const o = num(ooip), r = num(rf);
  if (!Number.isFinite(o) || !Number.isFinite(r)) return null;
  return o * r;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
// state = {
//   method: 'analog' | 'api_solution_gas' | 'api_water_drive' | 'gas_pz' | 'gas_water_drive',
//   driveCode, ooip,        // ooip is OOIP (STB) or OGIP (scf)
//   correlationInputs: {...}
// }
// Returns { phase, rf, rfLow, rfHigh, reserves, reservesLow, reservesHigh,
//           analog, method, warnings }
export function estimateRecovery(state) {
  const { method = 'analog', driveCode, ooip, correlationInputs = {} } = state || {};
  const warnings = [];
  const ip = num(ooip);
  const analog = getDriveMechanism(driveCode);
  const phase = analog?.phase
    || (method === 'gas_pz' || method === 'gas_water_drive' ? 'gas' : 'oil');

  let rf = null;
  let rfLow = analog?.low ?? null;
  let rfHigh = analog?.high ?? null;

  switch (method) {
    case 'analog':
      rf = analog?.typical ?? null;
      break;
    case 'api_solution_gas':
      rf = apiSolutionGasDriveRF(correlationInputs);
      warnings.push('API-1967 solution-gas-drive correlation is an empirical fit with wide scatter — validate against the analog band and simulation.');
      break;
    case 'api_water_drive':
      rf = apiWaterDriveRF(correlationInputs);
      warnings.push('API-1967 water-drive correlation is an empirical fit with wide scatter — validate against the analog band and simulation.');
      break;
    case 'gas_pz':
      rf = gasPZDepletionRF(correlationInputs);
      break;
    case 'gas_water_drive':
      rf = gasWaterDriveRF(correlationInputs);
      warnings.push('Trapped-gas recovery is sensitive to residual gas saturation and sweep efficiency — both are uncertain and field-specific.');
      break;
    default:
      rf = analog?.typical ?? null;
  }

  // Fall back to the analog band edges when a correlation is the point estimate.
  if (method !== 'analog' && analog) {
    rfLow = analog.low;
    rfHigh = analog.high;
  }

  const reserves = Number.isFinite(ip) && Number.isFinite(rf) ? ip * rf : null;
  const reservesLow = Number.isFinite(ip) && Number.isFinite(rfLow) ? ip * rfLow : null;
  const reservesHigh = Number.isFinite(ip) && Number.isFinite(rfHigh) ? ip * rfHigh : null;

  return {
    phase, method,
    rf, rfLow, rfHigh,
    reserves, reservesLow, reservesHigh,
    analog, warnings,
  };
}

// A realistic demo case so the app is useful on first open.
export function sampleRecoveryData() {
  return {
    method: 'analog',
    driveCode: 'water_drive',
    volumetric: { area: 1200, thickness: 45, phi: 0.22, sw: 0.28, boi: 1.30, ntg: 0.85, bgi: 0.005 },
    correlationInputs: {
      phi: 0.22, swi: 0.28, boi: 1.30, bob: 1.32, k: 150, muob: 0.9,
      muwi: 0.5, muoi: 0.9, pb: 3200, pi: 4200, pa: 1500,
      zi: 0.92, za: 0.95, sgr: 0.30, sweep: 0.75,
    },
  };
}
