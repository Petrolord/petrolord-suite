/**
 * The model of the Recovery Factor report (RF-U1-005; reviewer lens RL1 to
 * RL12). One object for the Report tab and the PDF: identification, headline
 * results with their basis, the in-place volume by its parts, the method by
 * its factors, every input with its unit and source, the method and basis,
 * the validation state of each method, the limits and flags, the intake
 * records. Built from what deriveRf already returned (the objects the screen
 * shows); nothing here calls an engine.
 *
 * Pure.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { eorContextRows } from './eorContext.js';
import { inputRow, sourceText } from '@/lib/inputProvenance/wording';
import { isStated } from '@/lib/inputProvenance/model';
import { describePvtContract } from '@/lib/inputProvenance/pvtContract';
import {
  METHOD_BASIS, ANALOG_BAND_SOURCE, API_SOLUTION_GAS, RF_ENGINE_VERSION,
} from '@/utils/recoveryFactorCalculations';
import { corrFieldsFor, VOL_FIELDS_OIL, VOL_FIELDS_GAS, PLAIN_LABELS, methodLabel } from '@/components/rfestimator/rfFields';
import { rfUnits } from './units.js';
import { IDENTIFICATION_FIELDS, LINKED_KEYS } from './model.js';
import { rfPvtSourceText } from './pvtIntake.js';
import { inPlaceSourceText, driveSuggestion } from './inPlaceIntake.js';
import { Z_METHOD_DAK, Z_REFERENCE, zMethodLabel } from './gasZ.js';
import { dcaImpliedRf } from './dcaCrossCheck.js';

export const REPORT_TITLE = 'Recovery Factor Report';
export const APP_NAME = 'Petrolord Recovery Factor Estimator';
export const SAMPLE_SOURCE = 'Sample value of the app, not a measurement (assumed)';

/** What each method's validation rests on in this build (printed; RF-U1-011). */
export const VALIDATION_STATE = Object.freeze({
  analog: 'Not validated: the ranges are transcribed screening ranges and were not checked against a published table in this build.',
  api_solution_gas: 'Equation checked as restated with k in darcies (Ahmed, Reservoir Engineering Handbook); a worked value on the sample case is held by a test that calls the engine. No published worked example was available to compare with, and the API D14 data ranges were not available, so no range check against the data set is made.',
  api_water_drive: 'As for the solution-gas correlation: equation checked as restated with k in darcies, worked value held by a test; no published worked example; API D14 data ranges not checked.',
  displacement_sweep: 'ED comes from the canonical fractional-flow engine (welgeTangent, recoveryProfile), gated in the engines library against published Buckley-Leverett cases; the test here holds ED at breakthrough and at the end point to their closed forms and the product ED x Ev. The sweep is a stated input, not validated.',
  gas_pz: 'Exact relation; checked against 1 - Bgi/Bga from the canonical fluid engine at constant temperature (agreement to 1e-12).',
  gas_water_drive: 'Definition checked by volume bookkeeping of the swept and unswept volumes; with the swept volume abandoned at pa (RF-U2-010) the relation is held to reduce exactly to the maintained form at pa = pi and to the p/z depletion relation at Ev = 0. No published worked example compared.',
});

const text = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
const num = (v) => {
  if (v === '' || v == null) return NaN;
  const x = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(x) ? x : NaN;
};
const g = (v, s = 4) => (Number.isFinite(v) ? String(parseFloat(Number(v).toPrecision(s))) : EMPTY_VALUE);
const th = (v, d = 0) => (Number.isFinite(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : EMPTY_VALUE);
const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) : EMPTY_VALUE);

/** The engine input of the case: what the completeness guard holds the inputs rows against. */
export function engineInputOf(inputs, krIntake = null) {
  const method = inputs?.method || 'analog';
  const corr = {};
  for (const [k] of corrFieldsFor(inputs)) corr[k] = inputs?.corr?.[k];
  const out = { method, driveCode: inputs?.driveCode, correlationInputs: corr };
  // RF-U2-009: the Corey set the displacement efficiency reads
  if (method === 'displacement_sweep') out.kr = { ...(krIntake?.params || { Swc: null, Sor: null, krwMax: null, kroMax: null, nw: null, no: null }) };
  // RF-U2-003: z by Dranchuk-Abou-Kassem reads gas gravity, temperature and pi
  if (inputs?.phase === 'gas' && inputs?.zMethod === Z_METHOD_DAK) {
    out.gasZ = { gasGravity: inputs?.corr?.gasGravity, tempF: inputs?.corr?.tempF };
    if (!('pi' in corr)) out.gasZ.pi = inputs?.corr?.pi; // pi printed with the method inputs otherwise
  }
  if (inputs?.inPlaceMode === 'direct') out.ooip = inputs?.ooipDirect;
  else {
    const fields = inputs?.phase === 'gas' ? VOL_FIELDS_GAS : VOL_FIELDS_OIL;
    out.vol = Object.fromEntries(fields.map(([k]) => [k, inputs?.vol?.[k]]));
  }
  return out;
}

/**
 * @param {{inputs: object, derived: object, identification?: object, inputMeta?: object,
 *   pvtIntake?: ?object, inPlaceIntake?: ?object, migration?: ?object}} s
 * @param {{projectName?: string, organizationName?: string, build?: string, system?: string}} ctx
 */
export function buildRfReportModel(s, { projectName = '', organizationName = '', build = '', system = 'oilfield' } = {}) {
  if (!s?.inputs || !s?.derived) return null;
  const u = rfUnits(system);
  const { inputs, derived } = s;
  const r = derived.result;
  const meta = s.inputMeta || {};
  const gas = derived.phase === 'gas';
  const ip = gas ? 'OGIP' : 'OOIP';
  const method = inputs.method || 'analog';
  const volKind = gas ? 'gasVolume' : 'oilVolume';
  const bigKind = gas ? 'gasVolumeB' : 'oilVolumeMM';
  const big = (v) => (Number.isFinite(v) ? g(u.show(bigKind, v / (gas ? 1e9 : 1e6)), 5) : EMPTY_VALUE);
  const caseState = derived.isSample ? 'Sample data shipped with the app'
    : (inputs.origin === 'sample-edited' ? 'Sample data, partly replaced by entered values' : 'Entered by the user');

  // ---- identification (RL4) ------------------------------------------------
  const id = s.identification || {};
  const identification = [['Project', text(projectName) || EMPTY_VALUE]];
  for (const { key, label } of IDENTIFICATION_FIELDS) {
    let v = text(id[key]);
    if (key === 'company' && !v) v = text(organizationName);
    identification.push([label, v || EMPTY_VALUE]);
  }
  identification.push(['Fluid', gas ? 'Gas' : 'Oil']);
  identification.push(['Analysis type', `Recovery factor screening: ${methodLabel(method)}`]);
  identification.push(['Case data', caseState]);
  identification.push(['Software build', text(build) || EMPTY_VALUE]);
  identification.push(['Engine', RF_ENGINE_VERSION]);

  // ---- sources ------------------------------------------------------------
  const srcOf = (group, key, value) => {
    const metaKey = `${group}.${key}`;
    if (isStated(meta[metaKey])) {
      const pvt = rfPvtSourceText(s.pvtIntake, group, key, value);
      return pvt && pvt.startsWith('Edited') ? sourceText(meta[metaKey], pvt) : sourceText(meta[metaKey]);
    }
    const pvt = rfPvtSourceText(s.pvtIntake, group, key, value);
    if (pvt) return pvt;
    if (derived.sampleKeys?.has(metaKey)) return SAMPLE_SOURCE;
    return sourceText(meta[metaKey]);
  };
  const shown = (kind, v) => (Number.isFinite(num(v)) ? g(u.show(kind, num(v)), 6) : '');
  // RF-U2-003: the values the engine read (zi, za and Bgi computed on Dranchuk-Abou-Kassem)
  const used = derived.inputsUsed || inputs;
  const gz = derived.gasZ;
  const zSource = (what) => `Computed (${what}): ${Z_REFERENCE}`;

  const inputRows = [];
  const add = (key, label, value, unit, source, engineKeys) => {
    const row = inputRow({ key, label, value, unit, auto: source });
    if (!text(value)) row.source = 'Not provided';
    inputRows.push({ ...row, engineKeys });
  };
  add('phase', 'Fluid', gas ? 'Gas' : 'Oil', '', 'Chosen in the app', []);
  add('method', 'Method', methodLabel(method), '', 'Chosen in the app', ['method']);
  add('driveCode', 'Primary drive mechanism (sets the analog range)', r.analog?.label || '', '', 'Chosen in the app', ['driveCode']);
  if (inputs.inPlaceMode === 'direct') {
    const auto = s.inPlaceIntake ? inPlaceSourceText(s.inPlaceIntake, inputs.ooipDirect) : null;
    add('ooipDirect', `${ip}, entered directly`, shown(volKind, inputs.ooipDirect), u.label(volKind),
      auto || sourceText(meta.ooipDirect), ['ooip']);
  } else {
    for (const [k, , kind] of gas ? VOL_FIELDS_GAS : VOL_FIELDS_OIL) {
      if (k === 'bgi' && gz?.ok) { add('vol.bgi', `${PLAIN_LABELS.bgi} (volumetrics)`, shown(kind, used.vol.bgi), u.label(kind), zSource('Bgi at pi'), ['vol.bgi']); continue; }
      add(`vol.${k}`, `${PLAIN_LABELS[k]} (volumetrics)`, shown(kind, inputs.vol?.[k]), u.label(kind), srcOf('vol', k, inputs.vol?.[k]), [`vol.${k}`]);
    }
  }
  const corrKeys = corrFieldsFor(inputs).map(([k]) => k);
  for (const [k, , kind] of corrFieldsFor(inputs)) {
    if ((k === 'zi' || k === 'za') && gz?.ok && used.corr?.[k] != null && (k === 'zi' || gz.za)) {
      add(`corr.${k}`, PLAIN_LABELS[k], shown(kind, used.corr[k]), u.label(kind), zSource(k === 'zi' ? 'z at pi' : 'z at pa'), [`correlationInputs.${k}`]);
      continue;
    }
    if (inputs.linked && inputs.inPlaceMode !== 'direct' && LINKED_KEYS[k]) {
      add(`corr.${k}`, PLAIN_LABELS[k], shown(kind, used.corr?.[k]), u.label(kind), `The volumetric value (one value per case): ${PLAIN_LABELS[LINKED_KEYS[k]] || LINKED_KEYS[k]}, source above`, [`correlationInputs.${k}`]);
      continue;
    }
    add(`corr.${k}`, PLAIN_LABELS[k], shown(kind, inputs.corr?.[k]), u.label(kind), srcOf('corr', k, inputs.corr?.[k]), [`correlationInputs.${k}`]);
  }
  // RF-U2-009: the kr-1 Corey set
  if (method === 'displacement_sweep') {
    const kp = s.krIntake?.params || {};
    for (const [k, label] of [['Swc', 'Connate water Swc (kr-1)'], ['Sor', 'Residual oil Sor (kr-1)'], ['krwMax', 'krw at Sor (kr-1)'], ['kroMax', 'kro at Swc (kr-1)'], ['nw', 'Corey exponent nw (kr-1)'], ['no', 'Corey exponent no (kr-1)']]) {
      add(`kr.${k}`, label, Number.isFinite(kp[k]) ? g(kp[k], 6) : '', 'frac', s.krIntake ? s.krIntake.source : 'Not taken', [`kr.${k}`]);
    }
  }
  // RF-U2-003: what the z computation read
  if (gas && inputs.zMethod === Z_METHOD_DAK) {
    add('corr.gasGravity', PLAIN_LABELS.gasGravity, shown('dimensionless', inputs.corr?.gasGravity), '', srcOf('corr', 'gasGravity', inputs.corr?.gasGravity), ['gasZ.gasGravity']);
    add('corr.tempF', PLAIN_LABELS.tempF, shown('temperature', inputs.corr?.tempF), u.label('temperature'), srcOf('corr', 'tempF', inputs.corr?.tempF), ['gasZ.tempF']);
    if (!corrKeys.includes('pi')) add('corr.pi', PLAIN_LABELS.pi, shown('pressure', inputs.corr?.pi), u.label('pressure'), srcOf('corr', 'pi', inputs.corr?.pi), ['gasZ.pi']);
  }
  const inputsNote = 'Every value the estimate read, in the display units. A value taken from another app names it; a sample value is labelled as such; "Entered, source not stated" means nobody said where the number came from.';

  // ---- headline (with basis, RL7) ------------------------------------------
  const ipBasis = inputs.inPlaceMode === 'direct'
    ? (s.inPlaceIntake ? `taken from ${s.inPlaceIntake.app} (${s.inPlaceIntake.quantity} ${s.inPlaceIntake.method ? `by ${s.inPlaceIntake.method}` : ''})` : 'entered directly')
    : 'volumetric, from the inputs below';
  const headline = {
    head: ['Quantity', 'Value', 'Unit', 'Basis'],
    rows: [
      ['Recovery factor', r.withheld ? EMPTY_VALUE : pct(r.rf), 'percent', `${methodLabel(method)}; fraction of ${ip} at stock-tank (standard) conditions`],
      ['Analog range, low edge to high edge', `${pct(r.rfLow, 0)} to ${pct(r.rfHigh, 0)}`, 'percent', r.analog ? `${r.analog.label}; edges of a screening range, not P90 and P10` : 'No drive named'],
      [ip, big(derived.inPlace), u.label(bigKind), ipBasis],
      ['Recoverable volume, estimate', big(r.reserves), u.label(bigKind), `RF x ${ip}; technically recoverable, no economic limit, not a PRMS reserves class`],
      ['Recoverable volume at the range edges', `${big(r.reservesLow)} to ${big(r.reservesHigh)}`, u.label(bigKind), 'Analog range edges x in-place volume'],
    ],
    note: r.withheld || (r.outsideBand ? `The estimate lies ${r.outsideBand} the analog range of the drive named.` : ''),
  };

  // ---- in-place by its parts (RL2) -----------------------------------------
  let inPlaceSplit = null;
  if (!derived.direct && derived.parts) {
    const p = derived.parts;
    inPlaceSplit = {
      head: ['Step', 'Value', 'Unit'],
      rows: [
        ['Gross rock volume A h', g(u.show('rockVolume', p.grv_acft), 6), u.label('rockVolume')],
        ['Net rock volume A h NTG', g(u.show('rockVolume', p.nrv_acft), 6), u.label('rockVolume')],
        ['Pore volume A h NTG phi', g(u.show('resVolumeMM', p.pv_rb / 1e6), 6), u.label('resVolumeMM')],
        ['Hydrocarbon pore volume x (1 - Sw)', g(u.show('resVolumeMM', p.hcpv_rb / 1e6), 6), u.label('resVolumeMM')],
        [gas ? 'Divided by Bgi' : 'Divided by Boi', g(u.show(gas ? 'fvfGasCf' : 'fvfOil', p.fvf), 6), u.label(gas ? 'fvfGasCf' : 'fvfOil')],
        [`${ip}`, big(p.total), u.label(bigKind)],
      ],
      note: `${p.formula}. The steps close on the engine total; the constant 7,758 is 43,560 ft3 per acre-ft over 5.6146 ft3 per bbl, rounded (0.005 percent).`,
    };
  }

  // ---- the method by its parts (RL2, RL3) ----------------------------------
  let methodSplit = null;
  const d = r.detail;
  if (d?.terms?.length) {
    methodSplit = {
      head: ['Factor', 'Base', 'Exponent', 'Value'],
      rows: [
        ['Constant', '', '', g(d.constant, 5)],
        ...d.terms.map((t) => [t.label, g(t.base, 5), g(t.exponent, 4), g(t.value, 5)]),
        ['Product: recovery factor', '', '', g(d.rf, 5)],
      ],
      note: `The product of the factors is the estimate (the parts close on the total). Permeability ${g(num(inputs.corr?.k), 5)} md enters as ${g(d.k_darcy, 5)} darcy, as the published equation is written.`,
    };
  } else if (method === 'gas_pz' && Number.isFinite(r.rfRaw)) {
    const c = inputs.corr || {};
    const pzi = num(c.pi) / num(c.zi); const pza = num(c.pa) / num(c.za);
    methodSplit = {
      head: ['Step', 'Value', 'Unit'],
      rows: [
        ['p/z at initial pressure, pi/zi', g(u.show('pressure', pzi), 6), u.label('pressure')],
        ['p/z at abandonment, pa/za', g(u.show('pressure', pza), 6), u.label('pressure')],
        ['Ratio (pa/za)/(pi/zi)', g(pza / pzi, 6), ''],
        ['Recovery factor 1 - ratio', g(r.rfRaw, 6), 'fraction'],
      ],
      note: 'Volumetric depletion at constant temperature: the gas produced is the fall of p/z along a straight line to the abandonment pressure.',
    };
  } else if (method === 'displacement_sweep' && d && Number.isFinite(d.ed)) {
    methodSplit = {
      head: ['Step', 'Value', 'Unit'],
      rows: [
        ['End-point mobility ratio M', g(d.mobilityRatio, 5), ''],
        ['Front saturation Swf (Welge tangent)', g(d.swf, 5), 'fraction'],
        ['Pore volumes injected at breakthrough', g(d.qiBt, 5), 'PV'],
        ['Displacement efficiency at breakthrough', g(d.edBt, 5), 'fraction'],
        ['Displacement efficiency at the end point (1 - Swc - Sor)/(1 - Swc)', g(d.edMax, 5), 'fraction'],
        [`Displacement efficiency ED used (${d.at}${d.qi != null ? `, Qi ${g(d.qi, 4)} PV` : ''})`, g(d.ed, 5), 'fraction'],
        ['Volumetric sweep Ev (stated)', g(d.ev, 5), 'fraction'],
        ['Recovery factor ED x Ev', g(d.rf, 5), 'fraction'],
      ],
      note: 'One-dimensional Buckley-Leverett displacement by the Welge construction of the canonical engine (horizontal, capillary pressure neglected, Bo unchanged, the flood from Swc), times the stated sweep. ED x Ev closes on the recovery factor.',
    };
  } else if (method === 'gas_water_drive' && Number.isFinite(r.rfRaw) && d) {
    const rows = [
      ['Initial gas saturation Sgi = 1 - Swi', g(d.sgi, 5), 'fraction'],
      ['Displacement efficiency 1 - Sgr/Sgi', g(d.displacement, 5), 'fraction'],
      ['Volumetric sweep Ev', g(d.sweep, 5), 'fraction'],
    ];
    if (d.mode === 'abandonment') {
      rows.push(
        ['Bgi/Bga = (pa/za)/(pi/zi)', g(d.bgiOverBga, 6), 'fraction'],
        ['Trapped gas left in the swept volume, Ev (Sgr/Sgi) Bgi/Bga', g(d.trappedSwept, 5), 'fraction of OGIP'],
        ['Gas left in the unswept volume, (1 - Ev) Bgi/Bga', g(d.unswept, 5), 'fraction of OGIP'],
        ['Recovery factor 1 - the two', g(r.rfRaw, 5), 'fraction'],
      );
    } else rows.push(['Recovery factor Ev x displacement', g(r.rfRaw, 5), 'fraction']);
    methodSplit = {
      head: ['Step', 'Value', 'Unit'],
      rows,
      note: d.mode === 'abandonment'
        ? 'The swept volume is abandoned at pa with Sgr trapped and the unswept volume keeps its gas at pa; the parts left and the recovery close on 1.'
        : 'The swept volume is abandoned at the initial pressure with Sgr trapped; the unswept volume gives nothing.',
    };
  }

  // ---- method, basis and validation ---------------------------------------
  const basisText = method === 'gas_water_drive' && inputs.corr?.gwdMode === 'abandonment' ? METHOD_BASIS.gas_water_drive_pa : METHOD_BASIS[method];
  const methodRows = [
    ['Method', methodLabel(method)],
    ['What it assumes', basisText || EMPTY_VALUE],
    ['Reference', method.startsWith('api_') ? API_SOLUTION_GAS.reference
      : method === 'gas_pz' ? 'Gas material balance for a volumetric reservoir (Craft and Hawkins, Applied Petroleum Reservoir Engineering)'
        : method === 'gas_water_drive' ? 'Trapped gas behind an advancing water front (Craft and Hawkins, Applied Petroleum Reservoir Engineering)'
          : method === 'displacement_sweep' ? 'Buckley and Leverett (1942) and Welge (1952), as in Dake, Fundamentals of Reservoir Engineering, ch. 10, and Willhite, Waterflooding, ch. 3; canonical engine packages/engines/engines/scal/fractionalFlow.js'
            : ANALOG_BAND_SOURCE],
    ['Validation in this build', VALIDATION_STATE[method] || EMPTY_VALUE],
    ['Analog range source', ANALOG_BAND_SOURCE],
  ];
  const basis = [
    ['Recovery factor', `Fraction of ${ip} at stock-tank (standard) conditions, printed in percent`],
    ['In-place volume', ipBasis],
    ['Recoverable volume', 'Technically recoverable volume RF x in-place; no economic limit, no development plan and no PRMS classification applied'],
    ['Pressures', 'Absolute, as entered; no datum correction'],
    ...(gas ? [['Gas z factor and Bgi', inputs.zMethod === Z_METHOD_DAK ? `${zMethodLabel(Z_METHOD_DAK)}: ${Z_REFERENCE}; Bgi in ft3/scf at pi` : zMethodLabel('typed')]] : []),
    ['Range', 'Low and high are the edges of the analog screening range of the drive named, not P90 and P10 of a distribution'],
    ['Display units', u.line()],
    ['Uncertainty', derived.uncertainty?.ok ? `Seeded Monte Carlo on the Suite's canonical sampler, seed ${derived.uncertainty.seed}, ${derived.uncertainty.accepted} realisations. ${derived.uncertainty.convention}` : 'Not run: the estimate is deterministic'],
  ];

  // ---- uncertainty (RF-U2-002) ---------------------------------------------
  let uncertainty = null;
  const unc = derived.uncertainty;
  if (unc?.ok) {
    const st = unc.stats;
    const vol = (v) => big(v);
    uncertainty = {
      head: ['Quantity', 'P90 (low)', 'P50', 'P10 (high)', 'Mean', 'Unit'],
      rows: [
        ['Recovery factor', pct(st.rf.p90), pct(st.rf.p50), pct(st.rf.p10), pct(st.rf.mean), 'percent'],
        [ip, vol(st.inPlace.p90), vol(st.inPlace.p50), vol(st.inPlace.p10), vol(st.inPlace.mean), u.label(bigKind)],
        ['Recoverable volume', vol(st.recoverable.p90), vol(st.recoverable.p50), vol(st.recoverable.p10), vol(st.recoverable.mean), u.label(bigKind)],
      ],
      runRows: [
        ['Recovery factor distribution', unc.words.rf],
        [`${ip} distribution`, unc.words.ip],
        ['Dependence', 'RF and the in-place volume drawn independently'],
        ['Sampler', 'The Suite\'s canonical Monte Carlo module (src/lib/monteCarlo.js), mulberry32 generator'],
        ['Seed', String(unc.seed)],
        ['Realisations', `${unc.accepted} used of ${unc.iterations}${unc.rejected ? `; ${unc.rejected} rejected (RF outside 0 to 1 or a volume not above zero)` : ''}`],
        ['Convention', unc.convention],
      ],
      note: `Recoverable volume is RF x ${ip} in each realisation; its percentiles are not the products of the RF and ${ip} percentiles. Technically recoverable, no economic limit, not a PRMS class.`,
      notes: unc.notes,
    };
  } else if (unc && !unc.ok) {
    uncertainty = { failed: unc.errors };
  }

  // ---- limits and flags (RL9) ----------------------------------------------
  const assumptions = [
    'A screening estimate. It does not replace a reservoir simulation, a decline or material balance forecast, or a reserves study.',
    basisText,
    'Recovery depends on the development plan, well count, secondary and tertiary recovery and economics; none of these is modelled.',
  ];
  if (method.startsWith('api_')) assumptions.push('The API correlations are empirical fits with wide scatter. The API D14 data ranges were not available in this build, so an input inside the physical domain may still be outside the data the correlation was fitted to.');
  const ranges = {
    head: ['Method', 'Domain checked by the app'],
    rows: [
      ['API solution-gas drive', 'pa below pb; 0 < phi < 1; 0 < Swi < 1; Bob at least 1; k and muob above zero'],
      ['API water drive', 'pa below pi; 0 < phi < 1; 0 < Swi < 1; Boi at least 1; k, muwi and muoi above zero'],
      ['p/z depletion', 'pa below pi; z between 0.2 and 2 (the Standing-Katz chart)'],
      ['Water-drive gas', '0 < Swi < 1; Sgr below 1 - Swi; 0 < Ev at most 1'],
      ['Volumetrics', '0 < phi < 1; 0 < Sw < 1; 0 < NTG at most 1; Boi at least 1; Bgi between 0 and 0.1 ft3/scf'],
    ],
  };
  const flags = [...(r.withheld ? [r.withheld] : []), ...derived.flags.map((f) => f.text)];
  if (derived.uncertainty && !derived.uncertainty.ok) flags.push(`Uncertainty not run: ${derived.uncertainty.errors.join(' ')}`);
  if (s.migration?.note) flags.push(s.migration.note);
  if (s.migration?.zNote && gas && inputs.zMethod === 'typed') flags.push(s.migration.zNote);

  // ---- intake blocks (RL11) -------------------------------------------------
  const pvtBlock = s.pvtIntake?.contract ? [
    ...describePvtContract(s.pvtIntake.contract),
    ['Values taken', Object.entries(s.pvtIntake.values || {}).map(([k, v]) => `${k} ${v}`).join(', ') || EMPTY_VALUE],
    ['Taken at', `${String(s.pvtIntake.from?.takenAt || '').slice(0, 16).replace('T', ' ')} UTC`],
    ...(s.pvtIntake.skipped?.length ? [['Not taken', s.pvtIntake.skipped.join('; ')]] : []),
  ] : null;
  const inPlaceBlock = s.inPlaceIntake ? [
    ['From', `${s.inPlaceIntake.app}${s.inPlaceIntake.contract === 'mbal-1' ? ' (contract mbal-1)' : ''}`],
    ['Record', `${s.inPlaceIntake.recordName || EMPTY_VALUE}${s.inPlaceIntake.reservoir ? `, reservoir ${s.inPlaceIntake.reservoir}` : ''}`],
    ['Value received', `${th(s.inPlaceIntake.value)} ${s.inPlaceIntake.unit}`],
    ['Method at the source', s.inPlaceIntake.method || EMPTY_VALUE],
    ['95 percent interval at the source', s.inPlaceIntake.ci95 ? `${th(s.inPlaceIntake.ci95[0])} to ${th(s.inPlaceIntake.ci95[1])} ${s.inPlaceIntake.unit}` : 'Not stated by the source'],
    ['Status at the source', s.inPlaceIntake.status === 'earlier_run' ? 'The case was changed after this run' : 'Current run of the case'],
    ['Taken at', `${String(s.inPlaceIntake.takenAt || '').slice(0, 16).replace('T', ' ')} UTC`],
    // RF-U2-008: what the drive indices suggest, and whether the drive named follows it
    ...(() => {
      const sg = driveSuggestion(s.inPlaceIntake, derived.phase, inputs.driveCode);
      return sg ? [['Drive suggested by the source', `${sg.text}${sg.code ? (sg.agrees ? ' The drive named in this report is the suggested one.' : ` The drive named in this report is ${r.analog?.label || 'none'}, chosen by the user.`) : ''}`]] : [];
    })(),
  ] : null;

  // ---- RF-U2-014: decline EUR over in-place, a cross-check ------------------
  let dcaCheck = null;
  const imp = dcaImpliedRf(s.dcaCheck, { inPlace: derived.inPlace, phase: derived.phase, rf: r.rf });
  if (imp) {
    dcaCheck = {
      head: ['Well', 'Decline Curve Analysis project', 'Data cut-off', 'EUR', 'Unit', 'Forecast ends at'],
      rows: [
        ...s.dcaCheck.items.map((i) => [i.wellName || EMPTY_VALUE, i.projectName || EMPTY_VALUE, i.cutoff || EMPTY_VALUE, big(i.eur), u.label(bigKind),
          i.endReason === 'economic-limit' ? 'economic limit' : i.endReason === 'horizon' ? 'horizon' : (i.endReason || EMPTY_VALUE)]),
        ['Sum of the wells taken', '', '', big(imp.eur), u.label(bigKind), ''],
        [`EUR over ${ip}`, '', '', imp.impliedRf == null ? EMPTY_VALUE : pct(imp.impliedRf), 'percent', ''],
      ],
      note: `${imp.text} ${imp.vsEstimate || ''} Read by id as dca-forecast-1; oil volumes in bbl at stock-tank conditions are STB, gas volumes in Mscf are times 1,000 for scf.`.trim(),
    };
  }

  // ---- the EOR screening beside the estimate (eor-screen-1 by id), context only ----
  const eorContext = eorContextRows(s.eorContext, { fmtPressure: (p) => `${g(u.show('pressure', p), 4)} ${u.label('pressure')}` });

  const who = [text(id.field), text(id.reservoir)].filter(Boolean).join(', ');
  return {
    u,
    phase: derived.phase,
    method,
    identification,
    displayUnits: u.system === 'si' ? 'SI' : 'Oilfield',
    headline,
    inPlaceSplit,
    methodSplit,
    inputs: { rows: inputRows, note: inputsNote },
    engineInput: engineInputOf(inputs, s.krIntake),
    methodRows,
    basis,
    limits: { assumptions, ranges, flags },
    pvtBlock,
    inPlaceBlock,
    uncertainty,
    dcaCheck,
    eorContext,
    notes: text(id.notes),
    footerWho: who || text(projectName),
    caseState,
  };
}
