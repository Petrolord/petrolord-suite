// Recovery Factor (RF) estimation for oil & gas reservoirs.
//
// Closes the STOIIP/GIIP -> recoverable-reserves bridge:
//     Reserves = RF x OOIP (or OGIP)
//
// Three complementary methods, in decreasing order of defensibility:
//
//   1. Drive-mechanism ANALOG ranges  (default): low/typical/high recovery
//      bands per primary drive mechanism, always shown as a sanity band
//      beside the other methods. The bands are transcribed screening ranges;
//      they are NOT validated against a published table in this build
//      (RF-U1-003) and the app says so.
//
//   2. Correlations: the API (Arps et al. 1967, API Bulletin D14) empirical
//      correlations for solution-gas-drive and water-drive oil reservoirs,
//      the exact p/z depletion relation for volumetric gas, and the trapped
//      gas relation for water-drive gas.
//
//   3. Volumetric OOIP/OGIP helpers so the tool can stand alone or take a
//      hand-off from a volumetrics app.
//
// Units: area (acres), thickness (ft), porosity & saturations (fraction),
// permeability as typed (md; the API correlations are written for darcies
// and the engine converts, RF-U1-001), viscosity (cp), pressure (psia),
// Bo/Boi (RB/STB), Bgi (reservoir-ft3/scf, matching the UI label and the
// 43560 constant in ogipVolumetric below; an RB/scf value inflates OGIP by
// about 5.615x). OOIP in STB, OGIP in scf.
//
// RF-U1-002: no silent clamp. A correlation returns what its equation gives;
// the orchestrator withholds a value outside (0, 1) with the reason, and
// flags inputs outside the physical domain of each method and estimates
// outside the analog band (rfFlags).

export const RF_ENGINE_VERSION = 'rf-2 (2026-10, RF-U1)';

/** The API (1967) correlations take permeability in darcies; the app types md. */
export const MD_PER_DARCY = 1000;

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

// RF-U1-002: the value of the equation, unclamped; null only when it is not a number.
const finiteOrNull = (rf) => (Number.isFinite(rf) ? rf : null);

// ---------------------------------------------------------------------------
// 1. Drive-mechanism analog ranges
// ---------------------------------------------------------------------------
// Recovery-factor bands (fraction of OOIP/OGIP) by primary drive mechanism.
// Transcribed screening ranges of the kind tabulated in reservoir engineering
// texts (for example Ahmed, Reservoir Engineering Handbook, on drive
// mechanisms). NOT checked against a published table in this build
// (RF-U1-003): ANALOG_BAND_SOURCE says so wherever the band is printed. The
// typical value is the app's own central choice inside each range.
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
    label: 'Gas: volumetric depletion',
    phase: 'gas',
    low: 0.70, typical: 0.80, high: 0.90,
    notes: 'Closed (no-aquifer) gas reservoir depleting on expansion; recovery set by abandonment pressure.',
  },
  {
    code: 'gas_water_drive',
    label: 'Gas: water drive',
    phase: 'gas',
    low: 0.35, typical: 0.55, high: 0.75,
    notes: 'Aquifer support traps gas behind the advancing water front, lowering recovery vs volumetric depletion.',
  },
];

export const ANALOG_BAND_SOURCE = 'Transcribed screening ranges (reservoir engineering texts, e.g. Ahmed, Reservoir Engineering Handbook, drive mechanisms); not checked against a published table in this build. Typical is the app\'s central choice inside each range. Low and High are the edges of the range, not P90 and P10.';

export const getDriveMechanism = (code) =>
  DRIVE_MECHANISMS.find((d) => d.code === code) || null;

// RF-U2-006 (closes RF-U1-019): this table is the one source of drive
// recovery bands in the Suite. Material Balance Studio reads its forecast
// reconciliation band from here through the engine's oil drive
// classification. A partial water drive (water drive with depletion) has no
// row of its own: it is two mechanisms acting together, so it reads the
// combination-drive range and says so.
export const MBAL_OIL_DRIVE_TO_RF = Object.freeze({
  depletion_drive: 'solution_gas',
  gas_cap_drive: 'gas_cap',
  strong_water_drive: 'water_drive',
  combination_drive: 'combination',
  water_drive_with_depletion: 'combination',
});

/**
 * The band of a Material Balance oil drive classification, from this table.
 * @param {string} mbalDrive the engine classification (e.g. 'strong_water_drive')
 * @returns {?{lo: number, hi: number, typical: number, rfCode: string, label: string, source: string}}
 */
export function bandForMbalDrive(mbalDrive) {
  const code = MBAL_OIL_DRIVE_TO_RF[mbalDrive];
  const d = code ? getDriveMechanism(code) : null;
  if (!d) return null;
  const label = mbalDrive === 'water_drive_with_depletion' ? `partial water drive, read as ${d.label.toLowerCase()}` : d.label.toLowerCase();
  return Object.freeze({ lo: d.low, hi: d.high, typical: d.typical, rfCode: d.code, label, source: ANALOG_BAND_SOURCE });
}

// ---------------------------------------------------------------------------
// 2a. API (1967) solution-gas-drive correlation (Arps et al. 1967)
// ---------------------------------------------------------------------------
// ER = 0.41815 * [ phi(1-Swi)/Bob ]^0.1611 * (k/muob)^0.0979
//               * Swi^0.3722 * (pb/pa)^0.1741            (fraction of OOIP)
// k in DARCIES (the published form; 41.815 when ER is in percent). The app
// types k in md and converts here (RF-U1-001: md fed straight in raised the
// sample estimate from 17.7 to 34.8 percent).
export const API_SOLUTION_GAS = Object.freeze({
  constant: 0.41815,
  exponents: Object.freeze({ storage: 0.1611, mobility: 0.0979, swi: 0.3722, pressure: 0.1741 }),
  reference: 'Arps, J.J., Brons, F., van Everdingen, A.F., Buchwald, R.W. and Smith, A.E. (1967) A Statistical Study of Recovery Efficiency, API Bulletin D14; as restated with k in darcies in Ahmed, Reservoir Engineering Handbook',
});

/** The API solution-gas-drive estimate with each factor of the product (RL2). */
export function apiSolutionGasDrive({ phi, swi, bob, k, muob, pb, pa }) {
  const _phi = num(phi), _swi = num(swi), _bob = num(bob),
    _k = num(k), _muob = num(muob), _pb = num(pb), _pa = num(pa);
  if ([_phi, _swi, _bob, _k, _muob, _pb, _pa].some((x) => !Number.isFinite(x))) return null;
  if (_bob <= 0 || _muob <= 0 || _pa <= 0 || _k <= 0 || _swi <= 0 || _pb <= 0 || _phi <= 0 || _swi >= 1) return null;
  const kD = _k / MD_PER_DARCY;
  const e = API_SOLUTION_GAS.exponents;
  const terms = [
    { key: 'storage', label: '[phi (1 - Swi) / Bob]^0.1611', base: (_phi * (1 - _swi)) / _bob },
    { key: 'mobility', label: '(k / muob)^0.0979, k in darcy', base: kD / _muob },
    { key: 'swi', label: 'Swi^0.3722', base: _swi },
    { key: 'pressure', label: '(pb / pa)^0.1741', base: _pb / _pa },
  ].map((t) => ({ ...t, exponent: e[t.key], value: Math.pow(t.base, e[t.key]) }));
  const rf = terms.reduce((acc, t) => acc * t.value, API_SOLUTION_GAS.constant);
  return { rf: finiteOrNull(rf), constant: API_SOLUTION_GAS.constant, terms, k_darcy: kD };
}

export function apiSolutionGasDriveRF(inputs) {
  return apiSolutionGasDrive(inputs || {})?.rf ?? null;
}

// 2b. API (1967) water-drive correlation (Arps et al. 1967)
// ER = 0.54898 * [ phi(1-Swi)/Boi ]^0.0422 * [ (k*muwi)/muoi ]^0.0770
//               * Swi^-0.1903 * (pi/pa)^-0.2159          (fraction of OOIP)
// k in DARCIES, as above (RF-U1-001: the sample read 72.0 percent with md, 42.3 with darcies).
export const API_WATER_DRIVE = Object.freeze({
  constant: 0.54898,
  exponents: Object.freeze({ storage: 0.0422, mobility: 0.0770, swi: -0.1903, pressure: -0.2159 }),
  reference: API_SOLUTION_GAS.reference,
});

export function apiWaterDrive({ phi, swi, boi, k, muwi, muoi, pi, pa }) {
  const _phi = num(phi), _swi = num(swi), _boi = num(boi), _k = num(k),
    _muwi = num(muwi), _muoi = num(muoi), _pi = num(pi), _pa = num(pa);
  if ([_phi, _swi, _boi, _k, _muwi, _muoi, _pi, _pa].some((x) => !Number.isFinite(x))) return null;
  if (_boi <= 0 || _muoi <= 0 || _muwi <= 0 || _pa <= 0 || _k <= 0 || _swi <= 0 || _pi <= 0 || _phi <= 0 || _swi >= 1) return null;
  const kD = _k / MD_PER_DARCY;
  const e = API_WATER_DRIVE.exponents;
  const terms = [
    { key: 'storage', label: '[phi (1 - Swi) / Boi]^0.0422', base: (_phi * (1 - _swi)) / _boi },
    { key: 'mobility', label: '(k muwi / muoi)^0.0770, k in darcy', base: (kD * _muwi) / _muoi },
    { key: 'swi', label: 'Swi^-0.1903', base: _swi },
    { key: 'pressure', label: '(pi / pa)^-0.2159', base: _pi / _pa },
  ].map((t) => ({ ...t, exponent: e[t.key], value: Math.pow(t.base, e[t.key]) }));
  const rf = terms.reduce((acc, t) => acc * t.value, API_WATER_DRIVE.constant);
  return { rf: finiteOrNull(rf), constant: API_WATER_DRIVE.constant, terms, k_darcy: kD };
}

export function apiWaterDriveRF(inputs) {
  return apiWaterDrive(inputs || {})?.rf ?? null;
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
  return finiteOrNull(rf);
}

// 2d. Water-drive gas: trapped-gas / sweep estimate
// RF = sweep * (1 - Sgr/(1-Swi))
// Assumes the swept volume is abandoned at the initial pressure (Bg at
// abandonment = Bgi, pressure fully maintained) and the unswept volume
// gives nothing; both are stated in the report (RF-U1-009).
export function gasWaterDriveRF({ swi, sgr, sweep }) {
  const _swi = num(swi), _sgr = num(sgr), _sweep = num(sweep);
  if ([_swi, _sgr, _sweep].some((x) => !Number.isFinite(x))) return null;
  if (_swi >= 1) return null;
  const displaceable = 1 - _sgr / (1 - _swi);
  const rf = _sweep * displaceable;
  return finiteOrNull(rf);
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
// Validity: the domain of each method (RF-U1-004, reviewer lens RL9)
// ---------------------------------------------------------------------------
// The API D14 data ranges are NOT printed: the bulletin was not available in
// this round, so no published data range is claimed. What is checked is the
// physical domain each relation needs, and what each method assumes.

/** What each method assumes, in words (printed under "Limits of this analysis"). */
export const METHOD_BASIS = Object.freeze({
  analog: 'Drive-mechanism analog band: a screening range for the primary drive named; the estimate is the typical value of the band.',
  api_solution_gas: 'API (Arps et al. 1967) solution-gas drive: a multiple regression on case histories of solution-gas-drive reservoirs, recovery from the bubble point to the abandonment pressure; k in darcies; empirical, with wide scatter about the fit.',
  api_water_drive: 'API (Arps et al. 1967) water drive: a multiple regression on case histories of water-drive sandstone reservoirs; k in darcies; empirical, with wide scatter about the fit.',
  gas_pz: 'p/z depletion: exact for a volumetric (closed, no aquifer) gas reservoir at constant temperature, RF = 1 - (pa/za)/(pi/zi).',
  gas_water_drive: 'Water-drive gas: RF = Ev (1 - Sgr/(1 - Swi)); the swept volume is abandoned at the initial pressure with residual gas Sgr trapped, the unswept volume gives nothing.',
});

/** The drive each correlation was derived for (a mismatch is flagged). */
const METHOD_DRIVES = Object.freeze({
  api_solution_gas: ['solution_gas'],
  api_water_drive: ['water_drive'],
  gas_pz: ['gas_volumetric'],
  gas_water_drive: ['gas_water_drive'],
});

const inOpen01 = (v) => Number.isFinite(v) && v > 0 && v < 1;

/**
 * Flags on the inputs of a method: each { key, text }. Pure.
 * @param {string} method
 * @param {object} c correlation inputs (strings or numbers)
 */
export function correlationInputFlags(method, c = {}) {
  const v = Object.fromEntries(Object.entries(c || {}).map(([k, x]) => [k, num(x)]));
  const out = [];
  const need = (keys) => keys.filter((k) => !Number.isFinite(v[k])).forEach((k) => out.push({ key: k, text: `${k} is blank or not a number, so the method cannot run.` }));
  const frac = (k, label) => { if (Number.isFinite(v[k]) && !inOpen01(v[k])) out.push({ key: k, text: `${label} ${v[k]} is outside 0 to 1 (a fraction).` }); };
  if (method === 'api_solution_gas') {
    need(['phi', 'swi', 'bob', 'k', 'muob', 'pb', 'pa']);
    frac('phi', 'Porosity'); frac('swi', 'Swi');
    if (Number.isFinite(v.pb) && Number.isFinite(v.pa) && v.pa >= v.pb) out.push({ key: 'pa', text: `Abandonment pressure ${v.pa} psia is not below the bubble point ${v.pb} psia: the correlation describes depletion below the bubble point.` });
    if (Number.isFinite(v.bob) && v.bob < 1) out.push({ key: 'bob', text: `Bob ${v.bob} RB/STB is below 1, which an oil with solution gas cannot have.` });
  } else if (method === 'api_water_drive') {
    need(['phi', 'swi', 'boi', 'k', 'muwi', 'muoi', 'pi', 'pa']);
    frac('phi', 'Porosity'); frac('swi', 'Swi');
    if (Number.isFinite(v.pi) && Number.isFinite(v.pa) && v.pa >= v.pi) out.push({ key: 'pa', text: `Abandonment pressure ${v.pa} psia is not below the initial pressure ${v.pi} psia.` });
    if (Number.isFinite(v.boi) && v.boi < 1) out.push({ key: 'boi', text: `Boi ${v.boi} RB/STB is below 1.` });
  } else if (method === 'gas_pz') {
    need(['pi', 'zi', 'pa', 'za']);
    if (Number.isFinite(v.pi) && Number.isFinite(v.pa) && v.pa >= v.pi) out.push({ key: 'pa', text: `Abandonment pressure ${v.pa} psia is not below the initial pressure ${v.pi} psia.` });
    for (const k of ['zi', 'za']) if (Number.isFinite(v[k]) && (v[k] < 0.2 || v[k] > 2)) out.push({ key: k, text: `${k} ${v[k]} is outside 0.2 to 2, the span of the Standing-Katz chart.` });
  } else if (method === 'gas_water_drive') {
    need(['swi', 'sgr', 'sweep']);
    frac('swi', 'Swi'); frac('sgr', 'Sgr');
    if (Number.isFinite(v.sweep) && !(v.sweep > 0 && v.sweep <= 1)) out.push({ key: 'sweep', text: `Sweep efficiency ${v.sweep} is outside 0 to 1.` });
    if (Number.isFinite(v.sgr) && Number.isFinite(v.swi) && v.sgr >= 1 - v.swi) out.push({ key: 'sgr', text: `Sgr ${v.sgr} is not below the initial gas saturation 1 - Swi = ${+(1 - v.swi).toFixed(4)}.` });
  }
  return out;
}

/**
 * Flags on the volumetric inputs (fractions, positive volumes).
 * @param {object} vol {area, thickness, phi, sw, ntg, boi | bgi}
 * @param {'oil'|'gas'} phase
 */
export function volumetricInputFlags(vol = {}, phase = 'oil') {
  const v = Object.fromEntries(Object.entries(vol || {}).map(([k, x]) => [k, num(x)]));
  const out = [];
  const keys = ['area', 'thickness', 'phi', 'sw', 'ntg', phase === 'gas' ? 'bgi' : 'boi'];
  for (const k of keys) if (!Number.isFinite(v[k])) out.push({ key: k, text: `${k} is blank or not a number, so the in-place volume cannot be computed.` });
  for (const k of ['area', 'thickness']) if (Number.isFinite(v[k]) && v[k] <= 0) out.push({ key: k, text: `${k} ${v[k]} is not above zero.` });
  for (const [k, label] of [['phi', 'Porosity'], ['sw', 'Sw']]) if (Number.isFinite(v[k]) && !inOpen01(v[k])) out.push({ key: k, text: `${label} ${v[k]} is outside 0 to 1 (a fraction).` });
  if (Number.isFinite(v.ntg) && !(v.ntg > 0 && v.ntg <= 1)) out.push({ key: 'ntg', text: `Net-to-gross ${v.ntg} is outside 0 to 1.` });
  if (phase === 'oil' && Number.isFinite(v.boi) && v.boi < 1) out.push({ key: 'boi', text: `Boi ${v.boi} RB/STB is below 1.` });
  if (phase === 'gas' && Number.isFinite(v.bgi) && (v.bgi <= 0 || v.bgi > 0.1)) out.push({ key: 'bgi', text: `Bgi ${v.bgi} ft3/scf is outside 0 to 0.1; a value in RB/scf or bbl/Mscf inflates or shrinks OGIP.` });
  return out;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
// state = {
//   method: 'analog' | 'api_solution_gas' | 'api_water_drive' | 'gas_pz' | 'gas_water_drive',
//   driveCode, ooip,        // ooip is OOIP (STB) or OGIP (scf)
//   correlationInputs: {...}
// }
// Returns { phase, rf, rfRaw, rfLow, rfHigh, reserves, reservesLow, reservesHigh,
//           analog, method, warnings, flags, withheld, detail, outsideBand, engineVersion }
// `withheld` names why rf is null when the equation gave a number outside (0, 1).
export function estimateRecovery(state) {
  const { method = 'analog', driveCode, ooip, correlationInputs = {} } = state || {};
  const warnings = [];
  const ip = num(ooip);
  const analog = getDriveMechanism(driveCode);
  const phase = analog?.phase
    || (method === 'gas_pz' || method === 'gas_water_drive' ? 'gas' : 'oil');

  let rf = null;
  let detail = null;
  const rfLow = analog?.low ?? null;
  const rfHigh = analog?.high ?? null;

  switch (method) {
    case 'api_solution_gas':
      detail = apiSolutionGasDrive(correlationInputs);
      rf = detail?.rf ?? null;
      warnings.push('API-1967 solution-gas-drive correlation is an empirical fit with wide scatter. Compare it with the analog band and, where you have one, a simulation.');
      break;
    case 'api_water_drive':
      detail = apiWaterDrive(correlationInputs);
      rf = detail?.rf ?? null;
      warnings.push('API-1967 water-drive correlation is an empirical fit with wide scatter. Compare it with the analog band and, where you have one, a simulation.');
      break;
    case 'gas_pz':
      rf = gasPZDepletionRF(correlationInputs);
      break;
    case 'gas_water_drive':
      rf = gasWaterDriveRF(correlationInputs);
      warnings.push('Trapped-gas recovery is sensitive to residual gas saturation and sweep efficiency; both are uncertain and field-specific.');
      break;
    case 'analog':
    default:
      rf = analog?.typical ?? null;
  }

  // RF-U1-002: no clamp. A value outside (0, 1) is withheld with its reason.
  const rfRaw = rf;
  let withheld = null;
  if (Number.isFinite(rf) && !(rf > 0 && rf < 1)) {
    withheld = `The ${method === 'analog' ? 'analog' : 'method'} gave ${(rf * 100).toFixed(1)} percent, outside 0 to 100 percent, so no recovery factor is reported. Check the inputs flagged below.`;
    rf = null;
  }

  const flags = method === 'analog' ? [] : correlationInputFlags(method, correlationInputs).map((f) => ({ ...f, scope: 'input' }));
  const fits = METHOD_DRIVES[method];
  if (fits && analog && !fits.includes(analog.code)) {
    flags.push({ key: 'driveCode', scope: 'method', text: `The method was derived for ${fits.map((c) => getDriveMechanism(c)?.label || c).join(' or ')}, and the drive named is ${analog.label}.` });
  }
  let outsideBand = null;
  if (method !== 'analog' && Number.isFinite(rf) && analog) {
    if (rf < analog.low) outsideBand = 'below';
    else if (rf > analog.high) outsideBand = 'above';
    if (outsideBand) flags.push({ key: 'rf', scope: 'result', text: `The estimate ${(rf * 100).toFixed(1)} percent is ${outsideBand} the ${analog.label} analog band (${(analog.low * 100).toFixed(0)} to ${(analog.high * 100).toFixed(0)} percent).` });
  }

  const reserves = Number.isFinite(ip) && Number.isFinite(rf) ? ip * rf : null;
  const reservesLow = Number.isFinite(ip) && Number.isFinite(rfLow) ? ip * rfLow : null;
  const reservesHigh = Number.isFinite(ip) && Number.isFinite(rfHigh) ? ip * rfHigh : null;

  return {
    phase, method,
    rf, rfRaw, rfLow, rfHigh,
    reserves, reservesLow, reservesHigh,
    analog, warnings, flags, withheld, detail, outsideBand,
    engineVersion: RF_ENGINE_VERSION,
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
