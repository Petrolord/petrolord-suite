/**
 * Fluid Systems Studio report model (FLUID-U1; reviewer lens RL1 to RL12).
 *
 * One builder for everything a reviewer reads: the Report tab on screen and
 * the PDF print the rows this returns, and the plots come from the series
 * builder the screen charts use (pvtSeries.js). Pure formatting: every
 * number is the engine's own (analyzeFluidSystem, runEosPvtTable and the
 * saved tuning record), converted to the display unit and nothing else.
 * No correlation is named here: method names come from results.meta.methods
 * and eos.pvtTable.methods, which the engine wrote beside its calls.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { sourceText, NOT_PROVIDED } from '@/lib/inputProvenance';
import { PVT1_PB_SOURCES } from '@/lib/inputProvenance/pvtContract';
import {
  normalizeFluid, publishedRange, PB_RS_BO_METHODS, OIL_VISCOSITY_METHODS, pbRsBoMethod, oilViscosityMethod,
} from '@/utils/fluidStudioCalculations';
import { tuningState, isActiveStage } from '@/utils/fluidstudio/eosAnalysis';
import { COMPONENT_ORDER, PLUS_FRACTION_KEY } from '@/utils/fluidstudio/eos/components';
import { untunedKnobs } from '@/utils/fluidstudio/eos/labTune';
import { fluidUnits } from '@/utils/fluidstudio/units';
import { readPtProfile } from '@/utils/fluidstudio/ptProfileImport';
import { isEosHandoff, eosRangeFlags } from '@/utils/fluidstudio/pvtHandoff';

export const REPORT_TITLE = 'Fluid Properties Report';
export const APP_NAME = 'Petrolord Fluid Systems Studio';

/** The identification a project carries (saved with it, all free text). */
export const IDENTIFICATION_FIELDS = Object.freeze([
  ['company', 'Company', 'Defaults to your organisation'],
  ['field', 'Field', ''],
  ['licence', 'Licence or block', ''],
  ['well', 'Well', ''],
  ['reservoir', 'Reservoir or zone', ''],
  ['sampleName', 'Sample or fluid name', ''],
  ['sampleDepth', 'Sample depth and reference', 'For example 9,850 ft MD below KB'],
  ['sampleDate', 'Sampling date', ''],
  ['samplingMethod', 'Sampling method', 'Bottomhole, separator recombined, wellhead'],
  ['laboratory', 'Laboratory', ''],
  ['labReport', 'Lab report number', ''],
  ['analyst', 'Analyst', ''],
  ['analysisDate', 'Analysis date', ''],
]);

export const emptyIdentification = () => Object.fromEntries(IDENTIFICATION_FIELDS.map(([k]) => [k, '']));

/** Identification as saved, with every field present; an old project gives blanks. */
export const identificationOf = (inputs) => ({ ...emptyIdentification(), ...(inputs?.identification && typeof inputs.identification === 'object' ? inputs.identification : {}) });

/** The inputs a source can be stated for (keys of inputs.inputMeta). */
export const SOURCE_KEYS = Object.freeze({
  blackOil: [
    ['api', 'API gravity'], ['gor', 'Solution GOR'], ['gasSg', 'Gas gravity'], ['temp', 'Reservoir temperature'],
    ['pb', 'Bubble point'], ['salinity', 'Water salinity'], ['separator', 'Separator stages'],
  ],
  eos: [
    ['composition', 'Feed composition'], ['plus', 'C7+ molecular weight and gravity'], ['flash', 'Reservoir pressure and temperature'],
    ['salinity', 'Water salinity'], ['separator', 'Separator stages'],
  ],
  blending: [['streamB', 'Stream B properties']],
});

/** The note a value loaded with the sample fluid carries until it is edited. */
export const SAMPLE_NOTE = 'Sample fluid value, not field data';
export const sampleMeta = () => ({ source: 'assumed', note: SAMPLE_NOTE });
/** Provenance records of the sample fluid: every input an assumption, named as the sample. */
export const sampleInputMeta = () => Object.fromEntries(
  [...SOURCE_KEYS.blackOil, ...SOURCE_KEYS.eos, ...SOURCE_KEYS.blending].map(([k]) => [k, sampleMeta()]),
);

/**
 * The values behind each provenance key, so an edit can be told from a
 * re-render: when the value of a key changes, a sample mark on it is dropped.
 */
export function sourceValues(inputs) {
  const bo = inputs?.streamA?.blackOil ?? {};
  const c = inputs?.streamA?.composition ?? {};
  return {
    api: bo.api ?? null,
    gor: bo.gor ?? null,
    gasSg: bo.gasSg ?? null,
    temp: bo.temp ?? null,
    pb: bo.pb ?? null,
    salinity: bo.salinity ?? null,
    separator: JSON.stringify(inputs?.separatorTrain?.stages ?? null),
    composition: JSON.stringify(c.zPct ?? null),
    plus: JSON.stringify(c.plus ?? null),
    flash: JSON.stringify([c.pressure ?? null, c.temp ?? null]),
    streamB: JSON.stringify(inputs?.streamB?.blackOil ?? null),
  };
}

/** Drop the sample mark of every input whose value changed between two states. */
export function clearEditedSampleMarks(prev, next) {
  const meta = next?.inputMeta;
  if (!meta || prev === next) return next;
  const a = sourceValues(prev);
  const b = sourceValues(next);
  let out = null;
  for (const key of Object.keys(b)) {
    if (a[key] !== b[key] && meta[key]?.note === SAMPLE_NOTE) {
      out = out || { ...meta };
      delete out[key];
    }
  }
  return out ? { ...next, inputMeta: out } : next;
}

// ---- number formats ---------------------------------------------------------

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const fx = (v, d) => (finite(v) ? v.toFixed(d) : EMPTY_VALUE);
const th = (v, d = 0) => (finite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : EMPTY_VALUE);
const sg = (v, n = 4) => {
  if (!finite(v)) return EMPTY_VALUE;
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a < 1e-3) return v.toExponential(n - 1);
  if (a >= 1000) return Number(v.toPrecision(n)).toLocaleString('en-US');
  return v.toPrecision(n);
};
const text = (v) => (v == null || String(v).trim() === '' ? '' : String(v).trim());
const orNA = (v) => text(v) || EMPTY_VALUE;

/** How each quantity is printed: kind (for the unit) and the formatter. */
const SHOW = {
  pressure: (u, v) => th(u.show('pressure', v), u.system === 'si' ? 0 : 0),
  pressure1: (u, v) => th(u.show('pressure', v), 1),
  temperature: (u, v) => fx(u.show('temperature', v), 1),
  gor: (u, v) => (u.system === 'si' ? fx(u.show('gor', v), 2) : th(u.show('gor', v), 1)),
  fvfOil: (u, v) => fx(u.show('fvfOil', v), 4),
  fvfGas: (u, v) => sg(u.show('fvfGas', v), 4),
  viscosity: (u, v) => sg(u.show('viscosity', v), 4),
  compressibility: (u, v) => sg(u.show('compressibility', v), 3),
  z: (u, v) => fx(v, 4),
  api: (u, v) => fx(v, 1),
  gravity: (u, v) => fx(v, 3),
  salinity: (u, v) => th(v, 0),
  rate: (u, v) => th(u.show('liquidRate', v), 0),
  gasRate: (u, v) => th(u.show('gasRate', v), 1),
};

// ---- identification ---------------------------------------------------------

const MODEL_WORDS = { 'black-oil': 'black-oil correlations', eos: 'equation of state (PR78)' };

/**
 * The header pairs of the report: what was analysed, by whom, with what.
 * A blank prints as EMPTY_VALUE (the kit does that for the PDF; the screen
 * uses the same pairs).
 */
export function identificationPairs({ inputs, projectName, organizationName, mode, build }) {
  const id = identificationOf(inputs);
  return [
    ['Project', text(projectName) || 'Unsaved workspace'],
    ['Company', text(id.company) || text(organizationName)],
    ['Field', id.field],
    ['Licence or block', id.licence],
    ['Well', id.well],
    ['Reservoir or zone', id.reservoir],
    ['Sample or fluid', id.sampleName],
    ['Sample depth', id.sampleDepth],
    ['Sampling date', id.sampleDate],
    ['Sampling method', id.samplingMethod],
    ['Laboratory', id.laboratory],
    ['Lab report', id.labReport],
    ['Analyst', id.analyst],
    ['Analysis date', id.analysisDate],
    ['Analysis type', `PVT, ${MODEL_WORDS[mode]}`],
    ['Build', text(build)],
  ].map(([k, v]) => [k, text(v)]);
}

// ---- inputs -----------------------------------------------------------------

const stageRows = (inputs, u, meta) => {
  const stages = (inputs?.separatorTrain?.stages || []).filter(isActiveStage);
  const rows = stages.map((s, i) => ({
    key: `separator.${i}`,
    label: `Separator stage ${i + 1}, pressure and temperature`,
    value: `${SHOW.pressure1(u, Number(s.pressure))} / ${SHOW.temperature(u, Number.isFinite(Number(s.temperature)) ? Number(s.temperature) : 60)}`,
    unit: `${u.label('pressure')} / ${u.label('temperature')}`,
    source: sourceText(meta.separator),
  }));
  if (!rows.length) rows.push({ key: 'separator.none', label: 'Separator stages', value: EMPTY_VALUE, unit: '', source: `${NOT_PROVIDED}: a single flash to stock tank` });
  return rows;
};

function blackOilInputRows({ inputs, results, u }) {
  const meta = inputs?.inputMeta || {};
  const bo = inputs?.streamA?.blackOil ?? {};
  const m = results?.meta;
  const fluid = m?.fluid || normalizeFluid(inputs);
  const blended = !!m?.blended;
  const rows = [];
  const row = (r) => rows.push(r);
  const stream = (prefix, b, metaKeyFor, tag) => {
    row({ key: `${prefix}api`, label: `${tag}API gravity of the stock-tank oil`, value: SHOW.api(u, Number(b.api)), unit: u.label('api'), source: sourceText(metaKeyFor('api')) });
    row({ key: `${prefix}gor`, label: `${tag}Solution GOR at the bubble point Rsb`, value: SHOW.gor(u, Number(b.gor)), unit: u.label('gor'), source: sourceText(metaKeyFor('gor')) });
    row({ key: `${prefix}gasSg`, label: `${tag}Gas gravity`, value: SHOW.gravity(u, Number(b.gasSg)), unit: u.label('gasGravity'), source: sourceText(metaKeyFor('gasSg')) });
    row({ key: `${prefix}temp`, label: `${tag}Reservoir temperature`, value: SHOW.temperature(u, Number(b.temp)), unit: u.label('temperature'), source: sourceText(metaKeyFor('temp')) });
    row({ key: `${prefix}salinity`, label: `${tag}Water salinity`, value: SHOW.salinity(u, Number(b.salinity)), unit: u.label('salinity'), source: sourceText(metaKeyFor('salinity')) });
  };
  if (blended) {
    const frac = Math.min(Math.max(Number(inputs.blending?.streamB_fraction) || 0, 0), 100);
    stream('a.', bo, (k) => meta[k], 'Stream A: ');
    stream('b.', inputs.streamB?.blackOil ?? {}, () => meta.streamB, 'Stream B: ');
    row({ key: 'blend', label: 'Stream B share of the blend', value: fx(frac, 0), unit: 'volume %', source: 'Entered (blend ratio)' });
    const how = 'Computed: volume blend of streams A and B';
    row({ key: 'api', engineKeys: ['api'], label: 'Blended API gravity', value: SHOW.api(u, fluid.api), unit: u.label('api'), source: `${how}, on a specific gravity basis` });
    row({ key: 'gor', engineKeys: ['rsb'], label: 'Blended solution GOR', value: SHOW.gor(u, fluid.rsb), unit: u.label('gor'), source: how });
    row({ key: 'gasSg', engineKeys: ['gasGravity'], label: 'Blended gas gravity', value: SHOW.gravity(u, fluid.gasGravity), unit: u.label('gasGravity'), source: `${how}, weighted by gas volume` });
    row({ key: 'temp', engineKeys: ['temp'], label: 'Blended temperature', value: SHOW.temperature(u, fluid.temp), unit: u.label('temperature'), source: `${how}, a mass-weighted estimate` });
    row({ key: 'salinity', engineKeys: ['salinity'], label: 'Blended water salinity', value: SHOW.salinity(u, fluid.salinity), unit: u.label('salinity'), source: how });
    row({ key: 'pb', engineKeys: ['pb'], label: 'Bubble point pressure (optional input)', value: EMPTY_VALUE, unit: u.label('pressure'), source: 'Not used for a blend: the bubble point of the blend is solved' });
  } else {
    stream('', bo, (k) => meta[k], '');
    rows.find((r) => r.key === 'api').engineKeys = ['api'];
    rows.find((r) => r.key === 'gor').engineKeys = ['rsb'];
    rows.find((r) => r.key === 'gasSg').engineKeys = ['gasGravity'];
    rows.find((r) => r.key === 'temp').engineKeys = ['temp'];
    rows.find((r) => r.key === 'salinity').engineKeys = ['salinity'];
    const typed = fluid.pb != null && m?.pbSource === 'entered';
    row({
      key: 'pb', engineKeys: ['pb'], label: 'Bubble point pressure (optional input)',
      value: typed ? SHOW.pressure(u, fluid.pb) : EMPTY_VALUE, unit: u.label('pressure'),
      source: typed ? sourceText(meta.pb) : `${NOT_PROVIDED}: solved from the solution GOR`,
    });
  }
  row({ key: 'corr.pb_rs_bo', engineKeys: ['correlations.pb_rs_bo'], label: 'Bubble point, Rs and Bo correlation', value: pbRsBoMethod(fluid).label, unit: '', source: inputs?.correlations?.pb_rs_bo && PB_RS_BO_METHODS[inputs.correlations.pb_rs_bo] ? 'Selected in the app' : 'Assumed default (none selected)' });
  row({ key: 'corr.viscosity', engineKeys: ['correlations.viscosity'], label: 'Oil viscosity correlation', value: oilViscosityMethod(fluid).label, unit: '', source: inputs?.correlations?.viscosity && OIL_VISCOSITY_METHODS[inputs.correlations.viscosity] ? 'Selected in the app' : 'Assumed default (none selected)' });
  const rateGiven = inputs?.feed?.oilRate != null && inputs.feed.oilRate !== '';
  row({ key: 'oilRate', engineKeys: ['feed.oilRate'], label: 'Stock-tank oil basis for stage gas rates', value: SHOW.rate(u, fluid.feed.oilRate), unit: u.label('liquidRate'), source: rateGiven ? 'Entered (a reporting basis)' : 'Assumed default 1,000 STB/d (no value entered)' });
  rows.push(...stageRows(inputs, u, meta));
  rows.push({ key: 'stockTank', label: 'Stock tank (last stage)', value: `${SHOW.pressure1(u, m?.standardConditions?.pressure_psia ?? 14.7)} / ${SHOW.temperature(u, m?.standardConditions?.temperature_degF ?? 60)}`, unit: `${u.label('pressure')} / ${u.label('temperature')}`, source: 'Standard conditions, always added by the app' });
  return {
    rows,
    note: 'The PVT table uses the API gravity, the solution GOR, the gas gravity, the temperature, the bubble point when one is entered and the two correlation choices. Salinity enters the water viscosity only. The stock-tank oil basis scales the stage gas rates and nothing else. Flowline geometry is recorded in the app and enters no calculation.',
  };
}

const LAB_ROWS = [
  ['psatPsia', 'Measured saturation pressure', 'pressure', SHOW.pressure],
  ['psatTF', 'Temperature of the measured saturation pressure', 'temperature', SHOW.temperature],
  ['totalGor', 'Measured total GOR of the separator test', 'gor', SHOW.gor],
  ['stoApi', 'Measured stock-tank API gravity', 'api', SHOW.api],
  ['bo', 'Measured Bo of the separator test at reservoir conditions', 'fvfOil', SHOW.fvfOil],
];

function eosInputRows({ inputs, eos, u }) {
  const meta = inputs?.inputMeta || {};
  const c = inputs?.streamA?.composition ?? {};
  const rows = [];
  const zPct = c.zPct || {};
  const sum = [...COMPONENT_ORDER, PLUS_FRACTION_KEY].reduce((s, k) => s + (Number(zPct[k]) || 0), 0);
  for (const k of [...COMPONENT_ORDER, PLUS_FRACTION_KEY]) {
    const v = Number(zPct[k]) || 0;
    if (!(v > 0)) continue;
    rows.push({ key: `z.${k}`, engineKeys: [`z.${k}`], label: `${k} in the feed`, value: fx(v, 3), unit: 'mol%', source: sourceText(meta.composition) });
  }
  rows.push({ key: 'z.sum', label: 'Feed total', value: fx(sum, 3), unit: 'mol%', source: Math.abs(sum - 100) > 1e-6 ? 'Computed: the engine renormalises the feed to 100 mol%' : 'Computed: sum of the components' });
  const hasPlus = (Number(zPct[PLUS_FRACTION_KEY]) || 0) > 0;
  if (hasPlus) {
    rows.push({ key: 'plus.mw', engineKeys: ['plus.mw'], label: 'C7+ molecular weight', value: fx(Number(c.plus?.mw), 1), unit: u.label('molecularWeight'), source: sourceText(meta.plus) });
    rows.push({ key: 'plus.sg', engineKeys: ['plus.sg'], label: 'C7+ specific gravity', value: fx(Number(c.plus?.sg), 4), unit: '60/60', source: sourceText(meta.plus) });
    const tb = Number(c.plus?.tbF);
    const tbGiven = c.plus?.tbF != null && c.plus.tbF !== '' && Number.isFinite(tb) && tb > 0;
    rows.push({ key: 'plus.tb', engineKeys: ['plus.tbR'], label: 'C7+ normal boiling point (optional)', value: tbGiven ? SHOW.temperature(u, tb) : EMPTY_VALUE, unit: u.label('temperature'), source: tbGiven ? sourceText(meta.plus) : `${NOT_PROVIDED}: estimated from molecular weight and gravity (Soreide)` });
  }
  rows.push({ key: 'flash.p', engineKeys: ['pressurePsia'], label: 'Reservoir (flash) pressure', value: SHOW.pressure(u, Number(c.pressure)), unit: u.label('pressure'), source: sourceText(meta.flash) });
  rows.push({ key: 'flash.t', engineKeys: ['tempF'], label: 'Reservoir (flash) temperature', value: SHOW.temperature(u, Number(c.temp)), unit: u.label('temperature'), source: sourceText(meta.flash) });
  rows.push({ key: 'salinity', label: 'Water salinity', value: SHOW.salinity(u, Number(inputs?.streamA?.blackOil?.salinity)), unit: u.label('salinity'), source: sourceText(meta.salinity) });
  rows.push(...stageRows(inputs, u, meta));
  const sc = eos?.pvtTable?.standardConditions;
  rows.push({ key: 'stockTank', label: 'Stock tank (last stage)', value: `${SHOW.pressure1(u, sc?.pressure_psia ?? 14.696)} / ${SHOW.temperature(u, sc?.temperature_degF ?? 60)}`, unit: `${u.label('pressure')} / ${u.label('temperature')}`, source: 'Standard conditions, always added by the app' });

  const lab = c.tuning?.lab || {};
  for (const [key, label, kind, show] of LAB_ROWS) {
    const raw = lab[key];
    const given = raw != null && raw !== '' && Number.isFinite(Number(raw));
    if (!given) continue;
    rows.push({ key: `lab.${key}`, label, value: show(u, Number(raw)), unit: u.label(kind), source: 'Measured (lab), as entered in the Lab tuning card' });
  }
  const t = tuningState(c, inputs?.separatorTrain?.stages);
  if (t.applied) {
    const how = t.status === 'tuned' ? 'Computed: regression to the measured values above' : 'Computed by an earlier regression; see the lab tuning section';
    rows.push({ key: 'tune.fTc', engineKeys: ['tuning.fTc'], label: 'C7+ critical temperature multiplier', value: fx(t.applied.fTc, 4), unit: '', source: how });
    rows.push({ key: 'tune.fPc', engineKeys: ['tuning.fPc'], label: 'C7+ critical pressure multiplier', value: fx(t.applied.fPc, 4), unit: '', source: how });
    rows.push({ key: 'tune.kC1', engineKeys: ['tuning.kC1'], label: 'Methane to C7+ interaction coefficient', value: fx(t.applied.kC1, 4), unit: '', source: how });
    rows.push({ key: 'tune.sPlus', engineKeys: ['tuning.sPlus'], label: 'C7+ volume shift', value: fx(t.applied.sPlus, 4), unit: '', source: how });
  }
  return {
    rows,
    note: 'The compositional model uses the feed composition, the C7+ description, the reservoir pressure and temperature, the separator stages and, when applied, the tuning parameters. Salinity enters the water viscosity only. The measured values enter only through the tuning.',
  };
}

/**
 * The engine input object of the mode, for the completeness guard: the
 * black-oil engine reads normalizeFluid(inputs); the EOS reads the parsed
 * composition.
 */
export function engineInputOf({ inputs, results, eos, mode }) {
  if (mode === 'eos') {
    const p = eos?.pvtTable?.parsed;
    return {
      z: Object.fromEntries((p?.keys || []).map((k, i) => [k, p.z[i]])),
      plus: p?.plus || {},
      tempF: p?.tempF,
      pressurePsia: p?.pressurePsia,
      tuning: p?.tuning || {},
    };
  }
  const { rsScale: _scale, ...fluid } = results?.meta?.fluid || normalizeFluid(inputs);
  return fluid;
}

// ---- headline, methods, basis ------------------------------------------------

const methodOf = (methods, key) => (methods || []).find((m) => m.key === key);
const methodWords = (methods, key) => methodOf(methods, key)?.method || EMPTY_VALUE;

function blackOilHeadline({ results, u }) {
  const k = results.pvt.kpis;
  const meta = results.meta;
  const ms = meta.methods;
  const pbWord = PVT1_PB_SOURCES[meta.pbSource] || '';
  return {
    head: ['Quantity', 'Value', 'Unit', 'Method'],
    rows: [
      ['Bubble point pressure Pb', SHOW.pressure(u, k.pb), u.label('pressure'), `${methodWords(ms, 'pb')} (${pbWord})`],
      ['Solution GOR at Pb', SHOW.gor(u, k.rsb), u.label('gor'), 'Input (the solution GOR)'],
      ['Oil formation volume factor at Pb', SHOW.fvfOil(u, k.bo_at_pb), u.label('fvfOil'), methodWords(ms, 'bo')],
      ['Oil viscosity at Pb', SHOW.viscosity(u, k.mu_o_at_pb), u.label('viscosity'), methodWords(ms, 'mu_o')],
      ['Dead oil viscosity', SHOW.viscosity(u, k.mu_od), u.label('viscosity'), methodWords(ms, 'mu_od')],
      ['Oil compressibility at Pb', SHOW.compressibility(u, k.co_at_pb), u.label('compressibility'), methodWords(ms, 'co')],
      ['Gas deviation factor Z at Pb', SHOW.z(u, k.z_at_pb), '', methodWords(ms, 'z')],
      ['Gas formation volume factor at Pb', SHOW.fvfGas(u, k.bg_at_pb), u.label('fvfGas'), methodWords(ms, 'bg')],
      ['Water formation volume factor at Pb', SHOW.fvfOil(u, k.bw_at_pb), u.label('fvfWater'), methodWords(ms, 'bw')],
      ['Water viscosity at Pb', SHOW.viscosity(u, k.mu_w_at_pb), u.label('viscosity'), methodWords(ms, 'mu_w')],
    ],
    note: 'Values at the bubble point pressure and the reservoir temperature. Pressures are absolute.',
  };
}

function eosHeadline({ eos, u }) {
  const t = eos.pvtTable.table;
  const ms = eos.pvtTable.methods;
  const pbRow = t.rows.find((r) => r.phase === 'saturated');
  const word = t.satKind === 'dew' ? 'Dew point pressure' : 'Bubble point pressure Pb';
  const rows = [
    [word, SHOW.pressure(u, t.pb), u.label('pressure'), methodWords(ms, 'pb')],
    ['Solution GOR at Pb, separator basis', SHOW.gor(u, t.kpis.rsfb), u.label('gor'), 'Separator train flash of the saturated oil'],
    ['Oil formation volume factor at Pb, separator basis', SHOW.fvfOil(u, t.kpis.bofb), u.label('fvfOil'), 'Separator train flash of the saturated oil'],
    ['Differential Bo at Pb (Bodb)', SHOW.fvfOil(u, t.kpis.bodb), u.label('fvfOil'), 'Differential liberation'],
    ['Differential Rs at Pb (Rsdb)', SHOW.gor(u, t.kpis.rsdb), u.label('gor'), 'Differential liberation'],
    ['Oil viscosity at Pb', SHOW.viscosity(u, pbRow?.mu_o), u.label('viscosity'), methodWords(ms, 'mu_o')],
    ['Stock-tank oil gravity', SHOW.api(u, t.kpis.stoApi), u.label('api'), 'Separator train flash'],
    ['Surface gas gravity', SHOW.gravity(u, t.kpis.surfaceGasGravity), u.label('gasGravity'), 'Separator train flash'],
    ['Water formation volume factor at Pb', SHOW.fvfOil(u, pbRow?.Bw), u.label('fvfWater'), methodWords(ms, 'bw')],
    ['Water viscosity at Pb', SHOW.viscosity(u, pbRow?.mu_w), u.label('viscosity'), methodWords(ms, 'mu_w')],
  ];
  const f = eos.flash;
  const p = eos.parsed;
  if (f) {
    const at = `${SHOW.pressure(u, p.pressurePsia)} ${u.label('pressure')} and ${SHOW.temperature(u, p.tempF)} ${u.label('temperature')}`;
    rows.push([`Phases at reservoir conditions (${at})`, f.phases === 2 ? 'Two' : 'One', '', f.phases === 2 ? `Stability test and flash: vapour mole fraction ${fx(f.beta, 4)}` : `Stability test: ${f.feed.label}`]);
  }
  return {
    head: ['Quantity', 'Value', 'Unit', 'Method'],
    rows,
    note: 'Values at the saturation pressure and the reservoir temperature. Pressures are absolute. "Separator basis" means per stock-tank barrel of the Separator Train of this report.',
  };
}

function methodsTable(methods) {
  return {
    head: ['Property', 'Method', 'Reference', 'Note'],
    rows: (methods || []).map((m) => [m.label, m.method, orNA(m.reference), text(m.note) || ' ']),
  };
}

const RANGE_WORD = { rs: ['Solution GOR', 'gor'], temp: ['Temperature', 'temperature'], api: ['API gravity', 'api'], gasGravity: ['Gas gravity', 'gasGravity'], pressure: ['Pressure', 'pressure'], salinity: ['Salinity', 'salinity'] };

/** "20 to 1,425 scf/STB" in the display unit. */
function rangeWords(u, variable, [lo, hi]) {
  const [, kind] = RANGE_WORD[variable];
  const d = kind === 'temperature' || kind === 'gor' ? (u.system === 'si' ? 1 : 0) : kind === 'pressure' ? 0 : kind === 'salinity' ? 0 : 3;
  const f = (v) => {
    const x = u.show(kind, v);
    return d === 3 ? String(parseFloat(x.toPrecision(4))) : th(x, kind === 'gor' && u.system === 'si' ? 1 : d);
  };
  return `${f(lo)} to ${f(hi)} ${u.label(kind)}`.trim();
}

const RANGE_NAME = {
  standing: 'Standing', vasquez_beggs: 'Vasquez-Beggs', glaso: 'Glaso', beggs_robinson: 'Beggs-Robinson', beal_cook_spillman: 'Beal-Cook-Spillman',
  vasquez_beggs_co: 'Vasquez-Beggs (compressibility)', vasquez_beggs_undersaturated: 'Vasquez-Beggs (undersaturated viscosity)',
  sutton: 'Sutton pseudo-critical properties', lee_gonzalez_eakin: 'Lee-Gonzalez-Eakin', mccain_bw: 'McCain (water FVF)', mccain_mu_w: 'McCain (water viscosity)',
};

function rangesTable(methods, u) {
  const rows = new Map();
  for (const m of methods || []) {
    if (m.kind !== 'correlation') continue;
    const id = m.rangeKey || m.method;
    if (!rows.has(id)) {
      const range = publishedRange(m.rangeKey);
      rows.set(id, {
        method: RANGE_NAME[m.rangeKey] || m.method,
        props: [],
        words: range
          ? Object.entries(range).filter(([, b]) => b).map(([v, b]) => `${RANGE_WORD[v][0]} ${rangeWords(u, v, b)}`).join('; ')
          : 'No published range is held for this method',
      });
    }
    rows.get(id).props.push(m.label);
  }
  return {
    head: ['Method', 'Used for', 'Published range'],
    rows: [...rows.values()].map((r) => [r.method, r.props.join('; '), r.words]),
  };
}

/** A range flag as a sentence in the display unit. */
function flagWords(f, u) {
  if (!f.family) return f.text;
  const d = f.family === 'pressure' ? 0 : 1;
  const show = (v) => th(u.show(f.family, v), u.system === 'si' && f.family === 'gor' ? 2 : d);
  const bounds = `${show(f.low)} to ${show(f.high)} ${u.label(f.family)}`;
  if (f.scope === 'table') {
    const span = f.valueLow === f.valueHigh ? show(f.valueLow) : `${show(f.valueLow)} to ${show(f.valueHigh)}`;
    return `${f.method}: ${f.rows} table row${f.rows === 1 ? '' : 's'} (${span} ${u.label(f.family)}) outside its published pressure range (${bounds}). Affects: ${f.properties.join('; ')}.`;
  }
  if (f.scope === 'result') return `${f.method}: the bubble point ${show(f.value)} ${u.label(f.family)} is outside its published pressure range (${bounds}).`;
  return `${f.method}: ${f.label} ${show(f.value)} ${u.label(f.family)} is outside its published range (${bounds}). Affects: ${f.properties.join('; ')}.`;
}

const withAffects = (f, u) => {
  const words = flagWords(f, u);
  return f.family || !f.properties?.length || /Affects:/.test(words) ? words : `${words} Affects: ${f.properties.join('; ')}.`;
};

const BLACK_OIL_LIMITS = [
  'Black-oil correlations: empirical fits to laboratory data of the oils their authors had. They are not a substitute for a laboratory PVT study of this fluid.',
  'One reservoir temperature. The table is isothermal.',
  'The correlations take no account of non-hydrocarbon gases (nitrogen, carbon dioxide, hydrogen sulphide).',
  'Gas properties are computed at every pressure of the table. Above the bubble point there is no free gas in the reservoir, so Z, Bg and gas viscosity there describe the solution gas only as a reference.',
  'The separator results are a staged liberation by the Rs correlation at each stage. It is an approximation and no compositional flash; the multistage Bo is an estimate.',
  'Water properties are for water with no dissolved gas.',
];
const EOS_LIMITS = [
  'Peng-Robinson (1978) equation of state with one C7+ pseudo-component. A heavy fraction split into several pseudo-components is not modelled.',
  'Without lab tuning the saturation pressure of heavy oils and lean condensates can be several percent off, and the stock-tank API gravity several degrees low.',
  'Oil and gas viscosities are untuned Lohrenz-Bray-Clark values: screening grade, up to a factor of two on oil.',
  'The black-oil table converts differential liberation to the separator basis by the Amyx and McCain adjustment: exact at the saturation pressure, approximate toward atmospheric pressure, where Bo can fall below 1.',
  'Two hydrocarbon phases only. Water is outside the equation of state; water properties are correlations for water with no dissolved gas.',
  'One reservoir temperature. Constant volume depletion is not simulated.',
  'In compositional mode this report covers the equation of state results only. The black-oil stream of the app (its separator approximation, blending, flow assurance screening and sensitivity sweep) is not part of it.',
];

// ---- tuning -----------------------------------------------------------------

const TARGET_WORDS = { psat: ['Saturation pressure', 'pressure', SHOW.pressure], totalGor: ['Total GOR', 'gor', SHOW.gor], stoApi: ['Stock-tank API gravity', 'api', SHOW.api], bo: ['Bo at reservoir conditions', 'fvfOil', SHOW.fvfOil] };

function tuningSection({ inputs, mode, u }) {
  if (mode !== 'eos') {
    return { status: 'none', text: 'No lab tuning. Black-oil correlations are not matched to laboratory data in this app; a bubble point that is entered moves the Rs correlation as stated in the methods table.', table: null, parameters: null };
  }
  const c = inputs?.streamA?.composition;
  const t = tuningState(c, inputs?.separatorTrain?.stages);
  if (t.status === 'none') {
    return { status: 'none', text: 'No lab tuning. The C7+ fraction uses generalised correlations and the model is not matched to laboratory data.', table: null, parameters: null };
  }
  const start = Number(c?.plus?.mw) > 0 && Number(c?.plus?.sg) > 0 ? untunedKnobs({ mw: Number(c.plus.mw), sg: Number(c.plus.sg) }) : null;
  const parameters = {
    head: ['Parameter', 'Before tuning', 'Applied'],
    rows: [
      ['C7+ critical temperature multiplier', start ? fx(start.fTc, 4) : EMPTY_VALUE, fx(t.applied.fTc, 4)],
      ['C7+ critical pressure multiplier', start ? fx(start.fPc, 4) : EMPTY_VALUE, fx(t.applied.fPc, 4)],
      ['Methane to C7+ interaction coefficient', start ? fx(start.kC1, 4) : EMPTY_VALUE, fx(t.applied.kC1, 4)],
      ['C7+ volume shift', start ? fx(start.sPlus, 4) : EMPTY_VALUE, fx(t.applied.sPlus, 4)],
    ],
  };
  if (t.status === 'stale') {
    return { status: 'stale', text: 'Tuning parameters are applied, but the composition, the reservoir conditions, the separator stages or the measured values changed after the fit. The record of the match no longer describes this fluid and is withdrawn. Run the tuning again.', table: null, parameters };
  }
  if (t.status === 'tuned-unrecorded') {
    return { status: 'tuned-unrecorded', text: 'Tuning parameters are applied. This project was saved before the app kept the record of the match, so what was matched and how well cannot be printed, and it cannot be confirmed that the fluid is unchanged since. Run the tuning again to record it.', table: null, parameters };
  }
  const fit = t.fit;
  const rows = fit.report.map((r) => {
    const [label, kind, show] = TARGET_WORDS[r.name] || [r.name, 'dimensionless', (uu, v) => sg(v)];
    const err = (e) => (finite(e) ? (r.name === 'stoApi' ? `${e >= 0 ? '+' : ''}${e.toFixed(2)} degAPI` : `${e >= 0 ? '+' : ''}${e.toFixed(2)}%`) : EMPTY_VALUE);
    const at = r.name === 'psat' && finite(fit.psatTF) ? ` at ${SHOW.temperature(u, fit.psatTF)} ${u.label('temperature')}` : '';
    return [`${label}${at}`, u.label(kind), show(u, r.measured), show(u, r.untuned), show(u, r.tuned), err(r.untunedErr), err(r.tunedErr)];
  });
  const bounds = fit.boundsHit?.length ? ` Parameter${fit.boundsHit.length > 1 ? 's' : ''} at a regression bound: ${fit.boundsHit.join(', ')}; the measured values may not be consistent with this composition.` : '';
  return {
    status: 'tuned',
    text: `The C7+ fraction was regressed to the measured values below (four bounded parameters, Levenberg-Marquardt). The regression ${fit.converged ? `converged in ${fit.iterations} iterations` : `stopped at its iteration limit after ${fit.iterations} iterations, so the values are the best point found`}.${bounds} Tuned on ${String(fit.at).slice(0, 10)}.`,
    table: { head: ['Matched to', 'Unit', 'Measured', 'Model before', 'Model after', 'Error before', 'Error after'], rows },
    parameters,
  };
}

// ---- PVT table --------------------------------------------------------------

const REGION = { saturated: 'Below Pb', 'two-phase': 'Below Pb', undersaturated: 'Above Pb' };

function pvtTable({ rows, pb, u, satKind }) {
  const pbRounded = finite(pb) ? Math.round(pb) : null;
  const head = [
    u.head('Pressure', 'pressure'), u.head('Rs', 'gor'), u.head('Bo', 'fvfOil'), u.head('Bg', 'fvfGas'), 'Z',
    u.head('Oil visc.', 'viscosity'), u.head('Gas visc.', 'viscosity'), u.head('co', 'compressibility'), u.head('Bw', 'fvfWater'), u.head('Water visc.', 'viscosity'), 'Region',
  ];
  const body = (rows || []).map((r) => [
    SHOW.pressure(u, r.pressure), SHOW.gor(u, r.Rs), SHOW.fvfOil(u, r.Bo), SHOW.fvfGas(u, r.Bg), SHOW.z(u, r.Z),
    SHOW.viscosity(u, r.mu_o), SHOW.viscosity(u, r.mu_g), SHOW.compressibility(u, r.co), SHOW.fvfOil(u, r.Bw), SHOW.viscosity(u, r.mu_w),
    pbRounded != null && Math.round(r.pressure) === pbRounded ? (satKind === 'dew' ? 'Dew point' : 'Pb') : (REGION[r.phase] || orNA(r.phase)),
  ]);
  return { head, rows: body };
}

// ---- separator --------------------------------------------------------------

function separatorTable({ results, eos, mode, u }) {
  if (mode === 'eos') {
    const s = eos?.separator;
    if (!s?.stages?.length) return null;
    const rows = s.stages.map((st) => [st.name, SHOW.pressure1(u, st.pressure), SHOW.temperature(u, st.temperature), fx(st.vaporMolePct, 2), fx(st.gasGravity, 3), SHOW.gor(u, st.gor)]);
    if (s.totals) rows.push(['Total', '', '', '', fx(s.totals.surfaceGasGravity, 3), SHOW.gor(u, s.totals.totalGor)]);
    const parts = s.totals ? `Separator GOR ${SHOW.gor(u, s.totals.separatorGor)} plus stock-tank GOR ${SHOW.gor(u, s.totals.stockTankGor)} gives the total ${SHOW.gor(u, s.totals.totalGor)} ${u.label('gor')}.` : '';
    const bo = s.bo && s.bo.reservoirPhases === 1 ? ` Bo of this train ${SHOW.fvfOil(u, s.bo.multistage)} ${u.label('fvfOil')}; a single flash to stock tank would give ${SHOW.fvfOil(u, s.bo.singleStage)}.` : '';
    return {
      title: 'Separator train (compositional flash of each stage)',
      head: ['Stage', u.head('Pressure', 'pressure'), u.head('Temperature', 'temperature'), 'Vapour (mol% of feed)', 'Gas gravity', u.head('GOR', 'gor')],
      rows,
      note: `${parts}${bo} GOR is per stock-tank barrel.`.trim(),
    };
  }
  const s = results?.separator;
  if (!s?.stages?.length) return null;
  const rows = s.stages.map((st) => [st.name, SHOW.pressure1(u, st.pressure), SHOW.temperature(u, st.temperature), SHOW.gor(u, st.rs_out), SHOW.gor(u, st.gas_liberated), SHOW.gasRate(u, st.gas_rate)]);
  rows.push(['Total', '', '', '', SHOW.gor(u, s.totals.total_gor), SHOW.gasRate(u, s.totals.total_gas_rate)]);
  return {
    title: 'Separator train (staged liberation by the Rs correlation)',
    head: ['Stage', u.head('Pressure', 'pressure'), u.head('Temperature', 'temperature'), u.head('Rs kept in the oil', 'gor'), u.head('Gas liberated', 'gor'), u.head('Gas rate', 'gasRate')],
    rows,
    note: `Separator GOR ${SHOW.gor(u, s.totals.separator_gor)} plus stock-tank GOR ${SHOW.gor(u, s.totals.stock_tank_gor)} gives the total ${SHOW.gor(u, s.totals.total_gor)} ${u.label('gor')}, which is the solution GOR by construction. Bo by a single flash ${SHOW.fvfOil(u, s.totals.bo_single_stage)} ${u.label('fvfOil')}; the multistage Bo ${SHOW.fvfOil(u, s.totals.bo_multistage_approx)} is an estimate of the staging benefit, not a flash calculation. Gas rates are for a stock-tank oil basis of ${SHOW.rate(u, s.totals.stock_tank_oil_rate)} ${u.label('liquidRate')}.`,
  };
}

// ---- flow assurance and batch -----------------------------------------------

function flowAssuranceTable({ inputs, results, u }) {
  const fa = results?.flowAssurance;
  if (!fa) return null;
  const read = readPtProfile(inputs?.ptProfile?.raw ?? '', inputs?.ptProfile?.units);
  const risk = fa.hydrate_risk;
  const rows = [
    ['Wax appearance temperature', fa.wat != null ? `${SHOW.temperature(u, fa.wat)} ${u.label('temperature')}` : EMPTY_VALUE, fa.wat_basis === 'measured' ? 'Measured, as entered' : fa.wat_basis ? 'Screening estimate from the wax content' : 'Not provided'],
    ['Asphaltene onset pressure', EMPTY_VALUE, 'Not computed: needs composition and SARA data'],
    ['P-T profile points', String(fa.pt_profile.length), read.summary],
    ['Lowest profile temperature', risk.min_temp != null ? `${SHOW.temperature(u, risk.min_temp)} ${u.label('temperature')}` : EMPTY_VALUE, 'From the profile'],
    ['Hydrate crossing', risk.profile_crosses ? `Yes, near ${SHOW.pressure(u, risk.first_crossing.pressure)} ${u.label('pressure')} and ${SHOW.temperature(u, risk.first_crossing.temp)} ${u.label('temperature')}` : 'No', `Hydrate curve: ${fa.meta.hydrate_correlation}, gas gravity screening`],
    ['Largest subcooling', `${fx(u.showDelta('temperature', risk.max_subcooling), 1)} ${u.label('temperature')}`, 'Hydrate temperature minus profile temperature'],
  ];
  return { head: ['Quantity', 'Value', 'Basis'], rows, note: 'Screening only: sweet gas, no inhibitor, salt or acid gas correction.', readback: read };
}

function batchTable({ results, u }) {
  const rows = results?.batchSummary;
  const b = results?.meta?.batch;
  if (!rows?.length || !b) return null;
  const kind = { api: 'api', gor: 'gor', gasSg: 'gasGravity', temp: 'temperature' }[b.variable];
  return {
    title: `Sensitivity sweep: ${b.label}`,
    head: [u.head(b.label, kind), u.head('Pb', 'pressure'), u.head('Bo at Pb', 'fvfOil'), u.head('Oil viscosity at Pb', 'viscosity')],
    rows: rows.map((r) => [sg(u.show(kind, r.input), 5), SHOW.pressure(u, r.pb), SHOW.fvfOil(u, r.bo_at_pb), SHOW.viscosity(u, r.mu_o_at_pb)]),
    note: 'Each row is a full run of the engine with the other inputs held at stream A.',
    kind,
  };
}

// ---- the model --------------------------------------------------------------

/**
 * @param {{inputs: object, results: object, eos: ?object, system?: string, projectName?: string,
 *   organizationName?: string, build?: string}} a
 * @returns {?object} null when there is no result to report
 */
export function buildFluidReportModel({ inputs, results, eos, system = 'oilfield', projectName = '', organizationName = '', build = '' }) {
  if (!results?.pvt?.kpis) return null;
  const u = fluidUnits(system);
  const mode = isEosHandoff(inputs, eos) ? 'eos' : 'black-oil';
  const eosSelectedButEmpty = inputs?.fluidModel === 'eos' && mode !== 'eos';
  const methods = mode === 'eos' ? eos.pvtTable.methods : results.meta.methods;
  const basis = mode === 'eos' ? eos.pvtTable.basis : results.meta.basis;
  const std = mode === 'eos' ? eos.pvtTable.standardConditions : results.meta.standardConditions;
  const inputsBlock = mode === 'eos' ? eosInputRows({ inputs, eos, u }) : blackOilInputRows({ inputs, results, u });
  const rows = mode === 'eos' ? eos.pvtTable.table.rows : results.pvt.table;
  // one bubble point on every surface: the rounded value the table's Pb row holds (RL12)
  const pb = mode === 'eos' ? eos.pvtTable.table.pb : results.pvt.kpis.pb;
  const satKind = mode === 'eos' ? eos.pvtTable.table.satKind : 'bubble';
  const tempF = mode === 'eos' ? eos.pvtTable.model.tempF : results.meta.fluid.temp;

  // range flags: the engine's own, plus (compositional) the water correlations and the C7+ description
  const flags = mode === 'eos' ? eosRangeFlags(inputs, eos) : results.meta.rangeFlags;
  const flagLines = flags.map((f) => withAffects(f, u));

  const warnings = mode === 'eos'
    ? [...new Set([...(eos.pvtTable.table.warnings || []), ...(eos.separator?.warnings || [])])]
    : [...(results.meta.warnings || [])];
  if (eosSelectedButEmpty) warnings.unshift('The compositional model is selected but has no black-oil table (no saturation point at this temperature, or no stock-tank liquid), so this report is of the black-oil correlations.');

  const pbSourceKey = mode === 'eos' ? 'eos' : results.meta.pbSource;
  const basisRows = [
    ['Liberation basis', basis.text],
    ['Standard conditions', `${SHOW.pressure1(u, std.pressure_psia)} ${u.label('pressure')} and ${SHOW.temperature(u, std.temperature_degF)} ${u.label('temperature')}`],
    ['Table temperature', `${SHOW.temperature(u, tempF)} ${u.label('temperature')}`],
    [satKind === 'dew' ? 'Dew point pressure' : 'Bubble point pressure', `${SHOW.pressure(u, pb)} ${u.label('pressure')}, ${PVT1_PB_SOURCES[pbSourceKey]}`],
    ['Units of this report', u.sentence()],
    ['Pressures', 'Absolute'],
    ['Oil and water formation volume factors', `${u.label('fvfOil')}: reservoir volume per stock-tank volume`],
    ['Gas formation volume factor', `${u.label('fvfGas')}: reservoir volume per ${u.system === 'si' ? 'standard cubic metre' : 'thousand standard cubic feet'} of gas`],
    ['Solution GOR', `${u.label('gor')}: standard gas volume per stock-tank oil volume`],
  ];
  if (mode === 'eos') {
    basisRows.push(['Equation of state', eos.pvtTable.model.eos]);
    if (eos.pvtTable.model.c7plus) basisRows.push(['C7+ characterisation', eos.pvtTable.model.c7plus]);
    basisRows.push(['Viscosity model', eos.pvtTable.model.viscosity]);
  }

  return {
    title: REPORT_TITLE,
    appName: APP_NAME,
    mode,
    system: u.system,
    displayUnits: u.line(),
    identification: identificationPairs({ inputs, projectName, organizationName, mode, build }),
    footerWho: [text(identificationOf(inputs).sampleName), text(identificationOf(inputs).field) ? `Field ${identificationOf(inputs).field}` : ''].filter(Boolean).join(', '),
    headline: mode === 'eos' ? eosHeadline({ eos, u }) : blackOilHeadline({ results, u }),
    inputs: inputsBlock,
    engineInput: engineInputOf({ inputs, results, eos, mode }),
    methods: methodsTable(methods),
    basis: basisRows,
    separator: separatorTable({ results, eos, mode, u }),
    tuning: tuningSection({ inputs, mode, u }),
    limits: {
      assumptions: mode === 'eos' ? EOS_LIMITS : BLACK_OIL_LIMITS,
      ranges: mode === 'eos'
        ? { head: ['Method', 'Used for', 'Published range'], rows: [['C7+ characterisation (Kesler-Lee, Soreide)', 'C7+ critical properties', 'Molecular weight 90 to 400; specific gravity 0.70 to 1.00 (the usual range the app checks)'], ...rangesTable(methods, u).rows] }
        : rangesTable(methods, u),
      rangesNote: mode === 'eos'
        ? 'The equation of state itself has no data range; its accuracy rests on the characterisation and the tuning.'
        : 'Ranges are those of the data each correlation was fitted to, as held in the Petrolord engines library and the app. Papay\'s Z has no range here: none could be verified, so the engine holds Z inside 0.25 to 1.15 and flags a row on that limit.',
      flags: flagLines,
    },
    pvtTable: pvtTable({ rows, pb, u, satKind }),
    pvtRows: rows,
    pb,
    satKind,
    tempF,
    flowAssurance: mode === 'eos' ? null : flowAssuranceTable({ inputs, results, u }),
    batch: mode === 'eos' ? null : batchTable({ results, u }),
    blending: mode === 'eos' ? null : results.blending,
    warnings,
  };
}
