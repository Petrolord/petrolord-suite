/**
 * The model of the EOR Screening report (EOR-U1; reviewer lens RL1 to
 * RL12). One object for the Report tab and the PDF: identification, the
 * ranking with its basis, every input with its unit and source, the
 * criteria edition, each method's verdict per criterion with the required
 * range, the project average, this reservoir's value, the reason and the
 * table it came from, the limits and the flags, and the figure list.
 * Built from the engine's own results (screenAllMethods); nothing here
 * screens anything.
 *
 * Pure.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { sourceText, NOT_PROVIDED } from '@/lib/inputProvenance/wording';
import { SERIES_RGB } from '@/lib/reportKit/theme';
import {
  CRITERIA_EDITION, RANKING_BASIS, SRC, CO2_DEPTH_BY_GRAVITY, sampleEorScreeningData, formationLabel, screenAllMethods, engineInputOf,
} from '../eorScreeningCalculations.js';
import { eorUnits } from './units.js';
import { requiredText, actualText, averageText, reasonText, STATUS_WORDS, OUTCOME_WORDS } from './format.js';
import { intakeSourceText } from './intakes.js';
import { eorMmpCheck, MMP_CORRELATION, mmpVerdictWords, MPA_TO_PSI } from './mmp.js';

export const REPORT_TITLE = 'EOR Screening Report';
export const APP_NAME = 'Petrolord EOR Screening';
export const ANALYSIS_TYPE = 'Technical screening of enhanced oil recovery methods against published criteria (candidate shortlisting)';

export const IDENTIFICATION = Object.freeze([
  ['company', 'Company'], ['field', 'Field'], ['licence', 'Licence or block'], ['reservoir', 'Reservoir or zone'],
  ['wells', 'Well or wells'], ['dataDate', 'Data as of'], ['analyst', 'Analyst'],
]);

export const DEPTH_REFERENCES = Object.freeze([
  ['', 'Not stated'],
  ['tvdss', 'TVDSS (true vertical depth below mean sea level)'],
  ['tvd-rt', 'TVD below the rotary table or kelly bushing'],
  ['tvd-gl', 'TVD below ground level'],
]);
export const depthReferenceText = (key) => (DEPTH_REFERENCES.find(([k]) => k === key) || DEPTH_REFERENCES[0])[1];

/** Short names for a narrow figure axis. */
export const SHORT = Object.freeze({
  nitrogen: 'N2 & flue gas', hydrocarbon: 'HC miscible', co2: 'CO2 miscible', immiscible: 'Immiscible gas',
  chemical: 'Micellar/ASP', polymer: 'Polymer', combustion: 'Combustion', steam: 'Steam',
});
const OUTCOME_RGB = Object.freeze({ qualified: SERIES_RGB.emerald, marginal: SERIES_RGB.amber, 'screened out': SERIES_RGB.slate, 'not screened': SERIES_RGB.slate });

const text = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
const num = (v) => { const s = text(v); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

/** The inputs: label, kind (unit), key, where it lives. */
export const INPUT_DEFS = Object.freeze([
  { key: 'gravityApi', label: 'Oil gravity', kind: 'api', group: 'form' },
  { key: 'viscosityCp', label: 'Oil viscosity at reservoir conditions', kind: 'viscosity', group: 'form' },
  { key: 'oilSatPct', label: 'Oil saturation at the start of the EOR project', kind: 'saturation', group: 'form' },
  { key: 'formation', label: 'Formation type', kind: null, group: 'form' },
  { key: 'netThicknessFt', label: 'Net thickness', kind: 'thickness', group: 'form' },
  { key: 'permeabilityMd', label: 'Average permeability', kind: 'permeability', group: 'form' },
  { key: 'depthFt', label: 'Depth', kind: 'depth', group: 'form' },
  { key: 'temperatureF', label: 'Reservoir temperature', kind: 'temperature', group: 'form' },
  { key: 'reservoirPressurePsia', label: 'Reservoir pressure (context, not screened)', kind: 'pressure', group: 'context' },
  { key: 'saturationPressurePsia', label: 'Bubble point pressure (context, not screened)', kind: 'pressure', group: 'context' },
  { key: 'ooipStb', label: 'Original oil in place (context, not screened)', kind: 'ooip', group: 'context' },
  // EOR-U2-001: the oil composition the CO2 MMP correlation reads
  { key: 'volatilesMolPct', label: 'Oil composition C1 + N2, for the MMP (context, not screened)', kind: 'molpct', group: 'context' },
  { key: 'intermediatesMolPct', label: 'Oil composition C2 to C10 with CO2, for the MMP (context, not screened)', kind: 'molpct', group: 'context' },
]);

const SAMPLE = sampleEorScreeningData();
export const SAMPLE_SOURCE = 'Assumed: the built-in sample value of the app (illustrative, no field data behind it)';

/** The Source column of one input (RL1): intake, then sample, then the user's statement. */
export function inputSource(inputs, key) {
  const def = INPUT_DEFS.find((d) => d.key === key);
  const value = inputs[def.group]?.[key];
  const intake = intakeSourceText(inputs.intakes, key, value);
  if (intake) return sourceText(inputs.inputMeta?.[key], intake);
  if (!text(value)) return NOT_PROVIDED;
  if (inputs.sampleNote && def.group === 'form' && String(SAMPLE[key]) === String(value) && !inputs.inputMeta?.[key]?.source) return SAMPLE_SOURCE;
  return sourceText(inputs.inputMeta?.[key]);
}

function inputRows(inputs, u) {
  const rows = INPUT_DEFS.map((d) => {
    const raw = inputs[d.group]?.[d.key];
    const value = d.key === 'formation' ? (formationLabel(raw) || '') : (num(raw) == null ? '' : u.fmt(d.kind, num(raw), 6));
    return { key: d.key, label: d.label, value: value || EMPTY_VALUE, unit: d.kind ? u.label(d.kind) : '', source: inputSource(inputs, d.key), engineKeys: d.group === 'form' ? [d.key] : [] };
  });
  rows.push({ key: 'depthReference', label: 'Depth reference', value: depthReferenceText(inputs.depthReference), unit: '', source: inputs.depthReference ? 'Stated by the user' : 'Not stated: the criteria are true vertical depths; state the reference', engineKeys: [] });
  return rows;
}

function identificationPairs(inputs, { projectName, organizationName, build }) {
  const id = inputs.identification || {};
  const pairs = [['Project', text(projectName) || EMPTY_VALUE]];
  for (const [key, label] of IDENTIFICATION) {
    let v = text(id[key]);
    if (key === 'company' && !v) v = text(organizationName);
    pairs.push([label, v || EMPTY_VALUE]);
  }
  pairs.push(['Analysis type', ANALYSIS_TYPE]);
  pairs.push(['Criteria', `${CRITERIA_EDITION.short}, Parts 1 and 2 (SPE Reservoir Engineering, August 1997)`]);
  pairs.push(['Depth reference', depthReferenceText(inputs.depthReference)]);
  pairs.push(['Software build', text(build) || EMPTY_VALUE]);
  pairs.push(['Inputs', inputs.sampleNote ? 'Includes built-in sample values (illustrative)' : 'Entered or taken from other apps (sources below)']);
  return pairs;
}

const pct = (r) => (r.applicable ? `${Math.round(r.score * 100)}%` : EMPTY_VALUE);

const STATUS_TEXT = Object.freeze({ made: null, 'mmp only': 'MMP only: no reservoir pressure to compare', 'not made': 'Not made' });

/**
 * EOR-U2-001: the CO2 miscibility check as rows, in the display units. The
 * Screening tab and the report print the same rows (RL12).
 */
export function mmpSection(check, u) {
  const c = MMP_CORRELATION;
  const q = (kind, v, d) => (Number.isFinite(v) ? `${u.fmt(kind, v, d)} ${u.label(kind)}` : EMPTY_VALUE);
  const i = check.inputs || {};
  const pct2 = (v) => (Number.isFinite(v) ? `${String(parseFloat(v.toPrecision(4)))} mol %` : EMPTY_VALUE);
  // the reason in the display units (the engine's own words are in psi)
  let why = check.reason;
  if (check.status === 'made') {
    why = `${mmpVerdictWords(check.verdict)} by ${q('pressure', Math.abs(check.margin_psi), 4)}.`;
    if (check.within_error) why += ` The difference is within the largest deviation of the correlation on its own data (${q('pressure', c.error.maxMpa * MPA_TO_PSI, 4)}): a measured slim-tube MMP is needed to decide.`;
    if (check.outside?.length) why += ` Extrapolated: ${check.outside.join('; ')} (the data of the paper).`;
  }
  const verdict = check.verdict ? `${mmpVerdictWords(check.verdict)}${check.within_error ? ' (within the error of the correlation)' : ''}${check.outside?.length ? ' (extrapolated)' : ''}` : STATUS_TEXT[check.status];
  return {
    head: ['Item', 'Value'],
    rows: [
      ['Gas', 'CO2 (pure); the correlation does not cover nitrogen, hydrocarbon gas or impure CO2'],
      ['Correlation', `${c.short}: ${c.where}`],
      ['Equation', c.equation],
      ['Reservoir temperature', q('temperature', i.temperature_degF, 4)],
      ['Oil composition C1 + N2', pct2(i.volatiles_mol_pct)],
      ['Oil composition C2 to C10 with CO2', pct2(i.intermediates_mol_pct)],
      ['Minimum miscibility pressure', q('pressure', check.mmp_psia, 4)],
      ['Reservoir pressure', q('pressure', i.reservoir_pressure_psia, 5)],
      ['Pressure minus MMP', Number.isFinite(check.margin_psi) ? `${check.margin_psi >= 0 ? '+' : '-'}${u.fmt('pressure', Math.abs(check.margin_psi), 4)} ${u.label('pressure')}` : EMPTY_VALUE],
      ['Verdict', verdict],
      ['Why', why],
      ['Data of the correlation', `T ${c.range.temperatureC.join(' to ')} degC; C1 + N2 ${c.range.volatilesMolPct.join(' to ')} mol %; C2 to C10 ${c.range.intermediatesMolPct.join(' to ')} mol %; MMP ${c.range.mmpMpa.join(' to ')} MPa (the paper states no formal range)`],
      ['Error of the correlation', c.errorText],
      ['Scope', c.scope],
      ['Reference', c.citation],
    ],
    note: 'The check is printed beside the Taber verdicts and changes none of them: CO2 miscible keeps the Part 2, Table 3 depth-by-gravity criterion. A verdict within the error of the correlation, or on inputs outside its data, needs a measured slim-tube MMP.',
    check,
    why,
  };
}

/**
 * @param {object} inputs the project inputs (EorScreeningContext)
 * @param {{projectName?: string, organizationName?: string, build?: string, system?: string, results?: object[]}} o
 */
export function buildEorReportModel(inputs, { projectName = '', organizationName = '', build = '', system = null, results = null } = {}) {
  const sys = system || inputs.unitSystem || 'oilfield';
  const u = eorUnits(sys);
  const engineInput = engineInputOf(inputs.form);
  const ranked = results || screenAllMethods(engineInput);
  const mmp = mmpSection(eorMmpCheck(inputs), u);

  const ranking = {
    head: ['Rank', 'Method', 'Outcome', 'Pass', 'Marginal', 'Fail', 'Not screened', 'Share passing'],
    rows: ranked.map((r, i) => [String(i + 1), r.name, OUTCOME_WORDS[r.outcome], String(r.passes), String(r.marginals), String(r.fails), String(r.unscored), pct(r)]),
    note: `${RANKING_BASIS} "Not screened" counts criteria the paper sets for the method that could not be screened for want of an input.`,
  };

  const methods = ranked.map((r) => ({
    id: r.id,
    title: `${r.name}: ${OUTCOME_WORDS[r.outcome].toLowerCase()} (${r.group})`,
    head: ['Criterion', 'Required', 'Project average', 'This reservoir', 'Verdict', 'Reason', 'Source'],
    rows: r.verdicts.map((v) => [v.criterion, requiredText(v, sys), averageText(v, sys) || EMPTY_VALUE, actualText(v, sys), STATUS_WORDS[v.status], reasonText(v, sys) || EMPTY_VALUE, v.source || EMPTY_VALUE]),
    note: `Oil composition guide (not screened: the app has no composition input): ${r.composition}.`,
    outcome: r.outcome,
  }));

  const edition = {
    head: ['Reference', 'Edition and where the criteria are printed'],
    rows: [
      ['Part 1', `${CRITERIA_EDITION.part1}. Summary of screening criteria: ${SRC.T3}; notes b, c and d under it.`],
      ['Part 2', `${CRITERIA_EDITION.part2}. ${SRC.T3a}; ${SRC.P2T4}; ${SRC.P2T5}.`],
      ['Read as', 'Part 1, Table 3 prints "> 9,000" ft and "> 200" F for the chemical floods with downward arrows; Part 2, Tables 4 and 5 give "< about 9,000 ft" and "< 200 F", which the screening uses. 40.0 API, which falls between the printed CO2 bands "> 40" and "32 to 39.9", takes the 2,500 ft band.'],
      ['Not encoded', 'Surface mining (a mining method, outside an in-situ screen). Composition (no composition input; the guide is printed per method).'],
    ],
  };

  const co2DepthTable = {
    head: ['Oil gravity', 'CO2 miscible: depth must be greater than'],
    rows: [
      ...CO2_DEPTH_BY_GRAVITY.map((b) => [b.band, `${u.fmt('depth', b.depthFt)} ${u.label('depth')}`]),
      ['below 22 API', 'Fails miscible; screen for immiscible gas'],
    ],
    note: `${SRC.T3a}. The paper states these are for typical Permian Basin oils, with a safety margin of about 500 ft above the fracture depth for the miscibility pressure.`,
  };

  const unscoredInputs = INPUT_DEFS.filter((d) => d.group === 'form' && !text(inputs.form?.[d.key])).map((d) => d.label);
  const flags = [];
  if (unscoredInputs.length) flags.push(`Not given, so the criteria on them are not screened for any method: ${unscoredInputs.join(', ')}.`);
  if (inputs.sampleNote) flags.push(inputs.sampleNote);
  for (const it of Object.values(inputs.intakes || {})) {
    if (!it) continue;
    for (const k of it.fields || []) {
      const def = INPUT_DEFS.find((d) => d.key === k);
      const now = def ? inputs[def.group]?.[k] : null;
      if (now != null && String(now) !== '' && Number(now) !== Number(it.values?.[k])) flags.push(`${def.label} was edited after it was taken from ${it.from?.app} (received ${it.values[k]}).`);
    }
  }
  const so = num(inputs.form?.oilSatPct);
  if (so != null && (so < 0 || so > 100)) flags.push(`Oil saturation ${so} % PV is outside 0 to 100.`);
  const api = num(inputs.form?.gravityApi);
  if (api != null && (api < 5 || api > 70)) flags.push(`Oil gravity ${api} API is outside 5 to 70 API, an unusual value for a crude oil; check the entry.`);
  if (!inputs.depthReference) flags.push('The depth reference is not stated.');
  if (mmp.check.outside?.length) flags.push(`CO2 MMP extrapolated beyond the data of the correlation: ${mmp.check.outside.join('; ')}.`);
  if (mmp.check.within_error) flags.push('CO2 MMP: the reservoir pressure is within the error of the correlation; a measured slim-tube MMP is needed to decide miscibility.');

  const limits = {
    assumptions: [
      'Screening shortlists candidate methods; it does not design a process or predict recovery (Part 2, Summary). A method that qualifies needs laboratory work, simulation and economics before any decision.',
      'The criteria come from the oil and reservoir properties of field projects up to 1996 and the displacement mechanisms behind them. Limits are not sharp in nature: the paper says a value just past a limit does not make a method impossible (Part 1, p. 192). Here a value on a limit passes; nothing is interpolated between methods.',
      'Verdicts are pass, marginal, fail or not screened. Marginal means the paper itself softens the limit: a preferred formation (Part 2, Tables 4 and 5), a carbonate fracture sweep (Part 1, Table 3, note b), or a formation the table does not name for gas injection.',
      'The CO2 minimum depth by oil gravity is for typical Permian Basin oils; oils of different composition need a measured minimum miscibility pressure. The CO2 MMP check beside it uses one published correlation (Zhu et al. 2025, from Ordos Basin black oils): it states miscible or immiscible against the reservoir pressure and changes no Taber verdict.',
      'Each input is one value for the reservoir. Heterogeneity, layering, dip, vertical permeability and fractures are not screened; the geometry notes of the gas methods ("thin unless dipping") are printed and not scored.',
      'Viscosity is the oil viscosity at reservoir conditions. Transmissibility k h / mu (notes c and d) is computed from the permeability, net thickness and that viscosity.',
      'Criteria are compared in oilfield units, as published; values typed or shown in SI are converted first.',
    ],
    flags,
    noFlagsText: 'Every screening input is given and none is flagged.',
  };

  const figures = buildFigures(ranked, inputs, u);
  const who = [text(inputs.identification?.field), text(projectName)].filter(Boolean).join(', ');

  return {
    system: sys,
    identification: identificationPairs(inputs, { projectName, organizationName, build }),
    displayUnits: u.line(),
    ranking,
    inputs: { rows: inputRows(inputs, u), note: 'Every value the screening read, with its source. Values taken from another app name the project and the method; an edit after the intake says so. Context rows are printed for the reviewer and are not screened by these criteria.' },
    edition,
    co2DepthTable,
    mmp,
    methods,
    limits,
    figures,
    notes: text(inputs.identification?.notes) || null,
    footerWho: who,
    summary: {
      qualified: ranked.filter((r) => r.outcome === 'qualified').map((r) => r.name),
      marginal: ranked.filter((r) => r.outcome === 'marginal').map((r) => r.name),
    },
  };
}

function buildFigures(ranked, inputs, u) {
  const figs = [];
  const any = ranked.some((r) => r.applicable > 0);
  if (any) {
    figs.push({
      id: 'ranking',
      title: 'Share of screened criteria that pass, by method',
      caption: `Bars in ranking order: green qualified, amber marginal, dark grey screened out. A marginal verdict does not count as a pass. Criteria: ${CRITERIA_EDITION.short}.`,
      panels: [{
        kind: 'bars',
        height: 72,
        spec: {
          yTitle: 'Screened criteria passing, %',
          categories: ranked.map((r) => SHORT[r.id] || r.name),
          series: [{ name: 'Share passing', values: ranked.map((r) => (r.applicable ? Math.round(r.score * 100) : NaN)), rgbs: ranked.map((r) => OUTCOME_RGB[r.outcome]) }],
          yInclude: [0, 100],
          valueText: (v) => `${v}%`,
        },
      }],
    });
  } else {
    figs.push({ id: 'ranking', title: 'Share of screened criteria that pass, by method', statement: 'Does not apply: no input is given, so no criterion was screened.' });
  }
  const api = num(inputs.form?.gravityApi);
  const depth = num(inputs.form?.depthFt);
  if (api != null && depth != null) {
    // the CO2 miscible minimum depth as a step line over 22 to 60 API, in the display depth unit
    const d = (ft) => u.show('depth', ft);
    const steps = [[22, 4000], [28, 4000], [28, 3300], [32, 3300], [32, 2800], [40, 2800], [40, 2500], [60, 2500]].map(([x, y]) => [x, d(y)]);
    figs.push({
      id: 'co2-depth',
      title: 'Oil gravity and depth against the CO2 miscible minimum depth',
      caption: `The step line is the minimum depth for CO2 miscible flooding by oil gravity (${SRC.T3a}); below 22 API CO2 is not miscible. The point is this reservoir. Depth increases downward.`,
      panels: [{
        height: 78,
        spec: {
          xTitle: 'Oil gravity, degAPI',
          yTitle: `Depth, ${u.label('depth')}`,
          yReversed: true,
          xInclude: [10, 50, api],
          yInclude: [0, d(Math.max(6000, depth * 1.1))],
          series: [
            { name: 'CO2 miscible minimum depth', type: 'line', pts: steps, rgb: SERIES_RGB.red },
            { name: 'This reservoir', type: 'scatter', pts: [[api, d(depth)]], rgb: SERIES_RGB.blue, markerSize: 1.2 },
          ],
          lines: [{ x: 22, label: '22 API', rgb: SERIES_RGB.slate, dash: [1, 1] }],
        },
      }],
    });
  } else {
    figs.push({ id: 'co2-depth', title: 'Oil gravity and depth against the CO2 miscible minimum depth', statement: 'Does not apply: the oil gravity or the depth is not given.' });
  }
  return figs;
}
