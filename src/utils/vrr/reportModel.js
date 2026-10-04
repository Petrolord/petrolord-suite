/**
 * The model of the Voidage Replacement report (VRR-U1; reviewer lens RL1 to
 * RL12). One object for the Report tab, the PDF and the ledger CSV:
 * identification, headline results, every input with its unit and source,
 * what the import doors read, the voidage ledger by period and by term
 * (closing on its totals), the FVF set of every period, the patterns, the
 * model and its basis, the limits and the flags. Built from deriveVrr (the
 * objects the screen shows); nothing here calls the engine.
 *
 * Pure.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { inputRow, sourceText } from '@/lib/inputProvenance/wording';
import { isStated } from '@/lib/inputProvenance/model';
import { editedAfterHandoffText, describePvtContract } from '@/lib/inputProvenance/pvtContract';
import { vrrUnits } from './units.js';
import { vrrPvtSourceText } from './pvtIntake.js';
import { FVF_KEYS, FLUID_FIELDS, TRACK_METHODS, DEFAULT_SETTINGS } from './workspace.js';
import { ATM_PSI, PRESSURE_UNITS } from './csvImport.js';

export const REPORT_TITLE = 'Voidage Replacement Report';
export const APP_NAME = 'Petrolord Voidage Replacement Monitor';
export const ANALYSIS_TYPE = 'Voidage replacement ratio by period, reservoir barrels (instantaneous, rolling and cumulative)';
export const IDENTIFICATION = Object.freeze([
  ['company', 'Company'], ['field', 'Field'], ['licence', 'Licence or block'], ['reservoir', 'Reservoir or zone'],
  ['area', 'Pattern area or segment'], ['dataSource', 'Production data source'], ['analyst', 'Analyst'],
]);
/** The starting FVF set of the app; an untouched value prints as an assumption. */
export const STARTING_FVF = Object.freeze({ Bo: '1.25', Bw: '1.02', Bg: '0.9', Rs: '550' });
export const STARTING_FLUID = Object.freeze({ api: '35', gasSg: '0.7', gor: '550', salinityPpm: '35000', tempF: '180' });

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const text = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
const fx = (v, d) => (finite(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : EMPTY_VALUE);
const g = (v, s = 4) => (finite(v) ? String(parseFloat(Number(v).toPrecision(s))) : EMPTY_VALUE);
/** An input nobody changed from the app's starting value. */
export const startingText = (value) => `Assumed: the starting value of the app (${value}), not field data`;
const isMonth = (label) => /^\d{4}-\d{2}$/.test(String(label || ''));

const FVF_INPUTS = Object.freeze({
  Bo: { label: 'Oil formation volume factor Bo', kind: 'bo' },
  Bw: { label: 'Water formation volume factor Bw', kind: 'bw' },
  Bg: { label: 'Gas formation volume factor Bg', kind: 'bg' },
  Rs: { label: 'Solution gas-oil ratio Rs', kind: 'rs' },
});
const FLUID_KIND = Object.freeze({ api: 'api', gasSg: 'gasSg', gor: 'rs', salinityPpm: 'salinity', tempF: 'temperature' });

/** The volume, rate and RB values of one display system, by kind, as a printed number. */
const show = (u, kind, v, d = 0) => fx(u.show(kind, v), d);

function identificationPairs(inputs, d, { projectName, organizationName, build, system }) {
  const id = inputs.identification || {};
  const labels = d.series.map((s) => s.label).filter(Boolean);
  const pairs = [['Project', text(projectName) || EMPTY_VALUE]];
  for (const [key, label] of IDENTIFICATION) {
    let v = text(id[key]);
    if (key === 'company' && !v) v = text(organizationName);
    if (key === 'dataSource' && !v) v = d.isImported ? `Imported per-well ledger${inputs.importInfo?.file ? ` (${inputs.importInfo.file})` : ''}` : 'Monthly field totals typed in the period grid';
    pairs.push([label, v || EMPTY_VALUE]);
  }
  pairs.push(['Periods', labels.length ? `${labels.length} (${labels[0]} to ${labels[labels.length - 1]})` : EMPTY_VALUE]);
  pairs.push(['Data cut-off', labels.length ? labels[labels.length - 1] : EMPTY_VALUE]);
  pairs.push(['Wells', d.isImported ? `${d.ledgerWells.producers.length} producers, ${d.ledgerWells.injectors.length} injectors` : 'Field totals (no wells)']);
  pairs.push(['Analysis type', ANALYSIS_TYPE]);
  pairs.push(['Software build', text(build) || EMPTY_VALUE]);
  pairs.push(['Voidage basis', `Reservoir barrels (${vrrUnits(system).label('reservoir')} on this report)`]);
  return pairs;
}

const PVT_MODE_WORDS = Object.freeze({
  constant: 'One constant FVF set for every period',
  track: 'Per period from black-oil correlations at the period pressure',
  table: 'Per period from the PVT table of a Fluid Systems Studio project at the period pressure',
});

/** Every input the analysis read, with unit and source (RL1). */
function inputsBlock(inputs, d, u) {
  const meta = inputs.inputMeta || {};
  const rows = [];
  const intake = inputs.pvtIntake;
  const tableMode = d.pvt.mode === 'table' && d.pvt.active;
  const trackMode = d.pvt.mode === 'track' && d.pvt.active;
  for (const k of FVF_KEYS) {
    const def = FVF_INPUTS[k];
    const raw = inputs.fvf?.[k];
    const v = Number(raw);
    let auto = null;
    if (intake?.values?.[k] != null) {
      const handoff = vrrPvtSourceText(intake, k);
      auto = Number(intake.values[k]) === v ? `Fluid Systems Studio pvt-1, ${handoff}` : editedAfterHandoffText(handoff, intake.values[k]);
    } else if (!isStated(meta[k]) && String(raw) === STARTING_FVF[k]) auto = startingText(`${raw} ${u.label(def.kind)}`);
    const used = d.pvt.active ? ' Used for the periods the per-period set does not cover.' : '';
    rows.push({
      ...inputRow({ key: k, label: `${def.label}${d.pvt.active ? ' (constant set)' : ''}`, value: finite(v) ? g(u.show(def.kind, v), 5) : text(raw), unit: u.label(def.kind), meta: meta[k], auto }),
      engineKeys: [`fvf.${k}`],
      note: used,
    });
  }
  rows.push({
    key: 'pvtMode', label: 'FVFs per period', value: PVT_MODE_WORDS[d.pvt.mode], unit: '',
    source: d.pvt.withheld ? `Not applied: ${d.pvt.withheld}` : trackMode ? `Correlations: Standing (Rs, Bo, bubble point), ${TRACK_METHODS.bg}, McCain 1990 (Bw)` : tableMode ? vrrPvtSourceText(intake, 'Bo', { track: true }) : 'Chosen by the analyst',
    engineKeys: ['pvtMode'],
  });
  if (d.pvt.mode === 'track') {
    for (const f of FLUID_FIELDS) {
      const raw = inputs.fluid?.[f.key];
      const kind = FLUID_KIND[f.key];
      const untouched = String(raw) === STARTING_FLUID[f.key] && !isStated(meta[`fluid.${f.key}`]);
      rows.push({
        ...inputRow({
          key: `fluid.${f.key}`, label: `${f.label} (pressure track)`, value: finite(Number(raw)) ? g(u.show(kind, Number(raw)), 5) : text(raw), unit: u.label(kind),
          meta: meta[`fluid.${f.key}`], auto: untouched ? startingText(raw) : null,
        }),
        engineKeys: [`fluid.${f.key}`],
      });
    }
  }
  if (intake) {
    rows.push({
      key: 'pvtTable', label: 'PVT table (Bo, Rs, Bg, Bw against pressure)', value: `${intake.table?.length || 0} rows`, unit: '',
      source: `Fluid Systems Studio pvt-1, project "${intake.from?.recordName || 'not named'}", saved ${String(intake.from?.at || '').slice(0, 16).replace('T', ' ')}; ${intake.table?.[0]?.p} to ${intake.table?.[intake.table.length - 1]?.p} psia; ${tableMode ? 'read at each period pressure' : 'kept, not used for the periods (constant set chosen)'}`,
      engineKeys: ['pvtTable'],
    });
  }
  // pressure surveys
  const surveys = inputs.pressureSurveys || [];
  const pInfo = inputs.pressureImportInfo;
  const datum = inputs.datum || {};
  rows.push({
    key: 'pressureSurveys', label: 'Average reservoir pressure surveys', value: surveys.length ? `${surveys.length}` : EMPTY_VALUE, unit: u.label('pressure'),
    source: !surveys.length ? 'Not provided: no pressure figure, no pressure track'
      : pInfo?.file ? `Imported from ${pInfo.file}: column "${pInfo.column || 'pressure'}" read as ${PRESSURE_UNITS.find((x) => x.key === pInfo.unit)?.label || pInfo.unit}${pInfo.unitFrom === 'assumed' ? ' (assumed: the header named no unit)' : ''}${PRESSURE_UNITS.find((x) => x.key === pInfo.unit)?.gauge ? `, ${ATM_PSI} psi added` : ''}${pInfo.edited ? '; edited after the import' : ''}`
        : sourceText(meta.pressureSurveys, 'Typed on the Pressure tab (absolute pressure)'),
    engineKeys: ['pressureSurveys'],
  });
  rows.push({
    key: 'datum', label: 'Pressure datum', value: text(datum.depth) ? g(u.show('depth', Number(datum.depth)), 6) : EMPTY_VALUE, unit: u.label('depth'),
    source: text(datum.depth) ? `${text(datum.reference) || 'reference not stated'}; stated only, no correction to datum applied` : 'Not stated: the surveys are used as given, at whatever depth they were quoted',
    engineKeys: ['datum.depth', 'datum.reference'],
  });
  // production and injection
  const info = inputs.importInfo;
  rows.push({
    key: 'periods', label: 'Production and injection volumes', value: `${d.series.length} periods`, unit: `${u.label('oil')}, ${u.label('water')}, ${u.label('gas')}`,
    source: d.isImported
      ? `Imported per-well ledger${info?.file ? ` ${info.file}` : ''}: ${info?.rowsRead ?? inputs.wellRows.length} rows, ${info?.wells ?? d.ledgerWells.producers.length + d.ledgerWells.injectors.length} wells, ${info?.firstDate || d.series[0]?.label || ''} to ${info?.lastDate || d.series[d.series.length - 1]?.label || ''}${info?.skipped ? `, ${info.skipped} rows left out (listed in the import read-back)` : ''}${inputs.sampleNote ? `. ${inputs.sampleNote}` : ''}`
      : info?.kind === 'grid' && info.file ? `Period grid imported from ${info.file}${inputs.sampleNote ? `. ${inputs.sampleNote}` : ''}` : inputs.sampleNote || 'Typed in the period grid (monthly field totals)',
    engineKeys: ['periods'],
  });
  const s = inputs.settings || {};
  const setRow = (key, label, unit, value) => ({
    ...inputRow({ key, label, value, unit, meta: meta[key], auto: String(s[key.split('.')[1]] ?? '') === DEFAULT_SETTINGS[key.split('.')[1]] ? 'The starting value of the app (an operator choice)' : 'Set by the analyst' }),
    engineKeys: [key],
  });
  rows.push(setRow('settings.targetBandMin', 'Target VRR band, lower edge', '', g(d.targetBand.min, 4)));
  rows.push(setRow('settings.targetBandMax', 'Target VRR band, upper edge', '', g(d.targetBand.max, 4)));
  rows.push(setRow('settings.rollingWindow', 'Rolling VRR window', 'periods', String(d.windowPeriods)));
  if (d.isImported && (inputs.patterns || []).length) {
    rows.push({
      key: 'allocation', label: 'Injector to producer allocation factors', value: `${Object.keys(inputs.allocation || {}).length} injector rows`, unit: 'fraction',
      source: sourceText(meta.allocation, 'Entered by the analyst (judgement: streamlines, interference tests or geometry); the app assumes no split'),
      engineKeys: ['allocation', 'patterns'],
    });
  }
  return {
    rows,
    note: 'Every value the analysis read, in the display units. The engine and the saved project hold oilfield units; "Assumed" marks a starting value of the app that nobody changed.',
  };
}

/** The engine input of the analysis, for the completeness guard (RL1). */
export function engineInputOf(inputs, d) {
  const out = {
    fvf: { Bo: inputs.fvf?.Bo, Bw: inputs.fvf?.Bw, Bg: inputs.fvf?.Bg, Rs: inputs.fvf?.Rs },
    periods: d.basePeriods,
    pvtMode: d.pvt.mode,
    pressureSurveys: inputs.pressureSurveys,
    datum: { depth: inputs.datum?.depth ?? '', reference: inputs.datum?.reference ?? '' },
    settings: { targetBandMin: d.targetBand.min, targetBandMax: d.targetBand.max, rollingWindow: d.windowPeriods },
  };
  if (d.pvt.mode === 'track') out.fluid = { ...inputs.fluid };
  if (inputs.pvtIntake) out.pvtTable = inputs.pvtIntake.table;
  // the matrix is one input (a table): its entries as one leaf
  if (d.isImported && (inputs.patterns || []).length) { out.allocation = Object.entries(inputs.allocation || {}); out.patterns = inputs.patterns; }
  return out;
}

function headline(d, u) {
  const sum = d.summary;
  const L = d.ledger.totals;
  const last = d.series.length - 1;
  const rows = [];
  const add = (q, v, unit, basis) => rows.push([q, v, unit, basis]);
  if (d.withheld) {
    add('Voidage replacement ratio', EMPTY_VALUE, '', d.withheld);
  } else {
    add('Cumulative VRR', g(sum?.cumulativeVRR, 4), '', `Injected over produced reservoir voidage, ${d.series[0]?.label || ''} to ${d.series[last]?.label || ''}`);
    add('Latest instantaneous VRR', g(sum?.latestInstantaneousVRR, 4), '', `Period ${d.series[last]?.label || ''} alone`);
    add('Latest rolling VRR', g(d.rolling[last], 4), '', `The last ${d.windowPeriods} periods`);
    const flagged = d.flags.filter((f) => f != null);
    add('Periods outside the target band', flagged.length ? `${flagged.filter((f) => f !== 'in-band').length} of ${flagged.length}` : EMPTY_VALUE, '', `Band ${g(d.targetBand.min)} to ${g(d.targetBand.max)}, instantaneous VRR`);
    add('Produced reservoir voidage', show(u, 'reservoir', L.producedRB), u.label('reservoir'), `Oil ${show(u, 'reservoir', L.oilRB)} + water ${show(u, 'reservoir', L.waterRB)} + free gas ${show(u, 'reservoir', L.freeGasRB)}`);
    add('Injected reservoir volume', show(u, 'reservoir', L.injectedRB), u.label('reservoir'), `Water ${show(u, 'reservoir', L.injWaterRB)} + gas ${show(u, 'reservoir', L.injGasRB)}`);
    add('Net voidage (injected less produced)', show(u, 'reservoir', L.injectedRB - L.producedRB), u.label('reservoir'), (L.injectedRB - L.producedRB) < 0 ? 'Voidage not replaced to date' : 'Voidage replaced to date');
    add('Fill-up', d.fillUp ? (d.fillUp.startedAbove ? `${d.fillUp.label} (record starts at or above 1)` : d.fillUp.label) : 'Not reached', '', 'First period whose cumulative VRR reaches 1');
  }
  if (d.hasPressure) {
    const ps = d.periodsWithPressure.filter((p) => p.pressure != null);
    const dp = ps[ps.length - 1].pressure - ps[0].pressure;
    add('Reservoir pressure change over the record', fx(u.show('pressure', ps[ps.length - 1].pressure) - u.show('pressure', ps[0].pressure), 0), u.label('pressure'), `${fx(u.show('pressure', ps[0].pressure), 0)} to ${fx(u.show('pressure', ps[ps.length - 1].pressure), 0)} ${u.label('pressure')}, surveys interpolated to mid-month${dp < 0 ? '; falling' : dp > 0 ? '; rising' : ''}`);
  }
  if (d.worstPattern) add('Weakest pattern (cumulative VRR)', `${d.worstPattern.pattern.name}: ${g(d.worstPattern.summary.cumulativeVRR, 4)}`, '', 'Lowest cumulative VRR of the patterns analysed');
  return { head: ['Quantity', 'Value', 'Unit', 'Basis'], rows, note: 'All voidage in reservoir barrels at the reservoir pressure of each period. VRR is dimensionless.' };
}

/** The voidage ledger by period and by term, closing on its totals (RL2). */
function ledgerTable(d, u) {
  const L = d.ledger;
  const R = (v) => show(u, 'reservoir', v);
  const head = ['Period', 'Oil', 'Water', 'Free gas', 'Produced', 'Water inj.', 'Gas inj.', 'Injected', 'Inst. VRR', 'Cum. VRR'];
  const rows = L.rows.map((r) => [r.label || `P${r.index + 1}`, R(r.oilRB), R(r.waterRB), R(r.freeGasRB), R(r.producedRB), R(r.injWaterRB), R(r.injGasRB), R(r.injectedRB), d.withheld ? EMPTY_VALUE : g(r.instantaneousVRR, 4), d.withheld ? EMPTY_VALUE : g(r.cumulativeVRR, 4)]);
  const t = L.totals;
  rows.push(['Total', R(t.oilRB), R(t.waterRB), R(t.freeGasRB), R(t.producedRB), R(t.injWaterRB), R(t.injGasRB), R(t.injectedRB), '', d.withheld ? EMPTY_VALUE : g(t.cumulativeVRR, 4)]);
  return {
    head: head.map((h, i) => (i === 0 || i >= 8 ? h : `${h} (${u.label('reservoir')})`)),
    rows,
    closure: L.closure,
    note: `Produced = oil + water + free gas; injected = water + gas; every column sums to its total, and the terms agree with the engine's VRR series to ${L.closure < 1e-12 ? 'better than 1 part in 10^12' : `a relative ${L.closure.toExponential(1)}`}. Free gas is the produced gas above Rs x oil, never below zero, in each period at field level.`,
  };
}

/** Volumes and the FVF set of each period (RL5, RL7). */
function periodTable(d, u) {
  const head = ['Period', u.head('Oil', 'oil'), u.head('Water', 'water'), u.head('Gas', 'gas'), u.head('Water inj.', 'water'), u.head('Gas inj.', 'gas'), u.head('Bo', 'bo'), u.head('Bw', 'bw'), u.head('Bg', 'bg'), u.head('Rs', 'rs'), u.head('Pressure', 'pressure'), 'FVF set'];
  const rows = d.ledger.rows.map((r, i) => {
    const p = d.periodsWithPressure[i]?.pressure;
    const fromPeriod = Object.values(r.fvfFrom).includes('period');
    const from = !fromPeriod ? 'constant' : d.pvt.active && d.pvt.overrides?.[i] ? (d.pvt.mode === 'table' ? 'PVT table' : 'correlations') : 'typed per period';
    return [
      r.label || `P${i + 1}`, show(u, 'oil', r.Np), show(u, 'water', r.Wp), show(u, 'gas', r.Gp, u.system === 'si' ? 2 : 0), show(u, 'water', r.Wi), show(u, 'gas', r.Gi, u.system === 'si' ? 2 : 0),
      g(u.show('bo', r.fvf.Bo), 5), g(u.show('bw', r.fvf.Bw), 5), g(u.show('bg', r.fvf.Bg), 5), g(u.show('rs', r.fvf.Rs), 5), finite(p) ? fx(u.show('pressure', p), 0) : EMPTY_VALUE, from,
    ];
  });
  return { head, rows, note: 'Surface volumes of each period as the ledger holds them, the FVF set applied to the period, the reservoir pressure interpolated at mid-month (blank without surveys), and where the FVF set came from.' };
}

function importBlock(inputs) {
  const info = inputs.importInfo;
  if (!info?.readBack?.length) return null;
  return {
    head: ['Field', 'File column', 'Read as', 'From', 'Values'],
    rows: info.readBack.map((r) => [r.label, r.column, r.unit, r.from === 'header' ? 'the header' : r.from === 'chosen' ? 'chosen at the door' : r.from === 'assumed' ? 'assumed (no unit in the header)' : r.from === 'file' ? 'the file' : r.from === 'user' ? 'chosen at the door' : r.from, String(r.values)]),
    note: `${info.file ? `File ${info.file}, ` : ''}${info.rowsRead ?? ''} rows read, ${info.skipped ?? 0} left out${info.notUsed?.length ? `; columns not used: ${info.notUsed.map((n) => `${n.column} (${n.reason})`).join(', ')}` : ''}${info.rateNote ? `. ${info.rateNote}` : ''}.`,
  };
}

function patternsBlock(inputs, d, u) {
  if (!d.isImported || !(inputs.patterns || []).length) return null;
  const rollup = [['Field', 'all', g(d.summary?.cumulativeVRR, 4), g(d.summary?.latestInstantaneousVRR, 4), EMPTY_VALUE]];
  const advice = [];
  for (const a of d.patternAnalyses) {
    rollup.push([a.pattern.name, a.pattern.producers.join(', ') || EMPTY_VALUE, a.withheld ? EMPTY_VALUE : g(a.summary?.cumulativeVRR, 4), a.withheld ? EMPTY_VALUE : g(a.summary?.latestInstantaneousVRR, 4), a.withheld ? a.reason : 'Analysed']);
    const r = a.recommendation;
    if (r && !r.withheld) {
      advice.push([a.pattern.name, g(r.currentVRR, 4), g(r.targetVRR, 4), `${g(r.scale, 4)}${r.clamped ? ' (clamped)' : ''}`, `${show(u, 'water', r.currentWi)} to ${show(u, 'water', r.recommendedWi)} ${u.label('water')} per period`]);
    }
  }
  const injectors = d.ledgerWells.injectors;
  const producers = d.ledgerWells.producers;
  const matrix = injectors.map((inj) => [inj, ...producers.map((p) => text(inputs.allocation?.[inj]?.[p]) || EMPTY_VALUE), g(d.allocationCheck.rowSums[inj] || 0, 4)]);
  return {
    rollup: { head: ['Level', 'Producers', 'Cum. VRR', 'Latest inst. VRR', 'Status'], rows: rollup },
    matrix: { head: ['Injector', ...producers, 'Row sum'], rows: matrix, note: `Fraction of each injector's volume reaching each producer, as entered. A row below 1 leaves the rest out of zone (unallocated).${d.allocationCheck.warnings.length ? ` ${d.allocationCheck.warnings.join(' ')}` : ''}` },
    advice: advice.length ? { head: ['Pattern', 'Rolling VRR', 'Target', 'Scale', 'Water injection'], rows: advice, note: `Scale = target (the band minimum) over the rolling VRR of the last ${d.windowPeriods} periods, clamped to 0.5 to 2.0; split per injector by allocated share; gas injection is reported, not scaled.` } : null,
  };
}

const BASIS = (d, inputs) => [
  ['Instantaneous VRR', 'Injected reservoir volume of the period over produced reservoir voidage of the period'],
  ['Cumulative VRR', 'Sum of injected reservoir volume to date over sum of produced reservoir voidage to date'],
  ['Rolling VRR', `The same over the last ${d.windowPeriods} periods (a shorter window at the start)`],
  ['Produced voidage', 'Np Bo + Wp Bw + max(0, Gp - Rs Np / 1000) Bg; solution gas is carried in Bo, so only the free gas adds voidage'],
  ['Injected volume', 'Wi Bw + Gi Bg: injected water at the produced-water Bw, injected gas at the produced-gas Bg of the period'],
  ['FVF basis', `Bo and Rs per stock-tank barrel, Bw per barrel, Bg per Mscf at standard conditions.${inputs.pvtIntake?.contract?.basis?.text ? ` The PVT table taken from Fluid Systems Studio states: ${inputs.pvtIntake.contract.basis.text}.` : ' The basis of typed values (flash or differential liberation) is as the analyst entered them; state it in the source note.'}`],
  ['Periods', d.series.every((s) => isMonth(s.label)) ? 'Calendar months; per-well rows are summed by month' : 'The periods as typed in the grid (labels that are not YYYY-MM carry no date and no pressure)'],
  ['Pressure', 'Average reservoir pressure, absolute, surveys interpolated linearly to the middle of each month and held flat outside the surveyed span; dp/dt per month by central difference'],
  ['Target band', 'The operator band of this project, applied to instantaneous VRR; the screening bands 0.9 to 1.1 of the engine are a second reading'],
];

function limitsBlock(inputs, d) {
  const assumptions = [];
  if (d.pvt.mode === 'constant' || !d.pvt.active) assumptions.push('FVFs are held constant over the record. Below the bubble point Bg and Rs move strongly with pressure, so a constant set misstates the free gas term as pressure falls; use the pressure track or a Fluid Systems Studio table where pressure changes.');
  if (d.pvt.mode === 'track' && d.pvt.active) assumptions.push('FVFs follow the pressure history through black-oil correlations (Standing, Papay Z, McCain Bw) on typed fluid inputs, not a fluid study; their published ranges apply.');
  if (d.pvt.mode === 'table' && d.pvt.active) assumptions.push('FVFs follow the pressure history through the Fluid Systems Studio table, linearly interpolated; outside the table the constant set applies and the period is named in the flags.');
  assumptions.push('Free gas is produced gas above Rs x oil in each period, summed at field (or pattern) level before the floor at zero: a well producing below its solution GOR offsets a well producing free gas. Gas that is flared or used on lease must be in the produced gas column to count.');
  assumptions.push('Injected water is converted at the Bw of the produced water and injected gas at the Bg of the produced gas, at the period pressure; differences in injected fluid composition are not modelled.');
  assumptions.push('VRR replaces voidage by volume only. Aquifer influx, out-of-zone injection, thief zones and sweep are not seen: a VRR of 1 with falling pressure points to out-of-zone injection or unmeasured voidage, and a VRR of 1 does not mean good conformance.');
  if (d.isImported && (inputs.patterns || []).length) assumptions.push('Pattern VRR rests on the allocation factors, which are the analyst\'s judgement; the app never assumes an even split.');
  assumptions.push('Volumes are the allocated volumes of the source; allocation errors in well tests pass straight into the ratio.');
  if (!d.hasPressure) assumptions.push('No pressure survey is attached, so the ratio cannot be checked against the pressure it is meant to hold.');

  const flags = [];
  if (d.withheld) flags.push(d.withheld);
  for (const n of d.settingsNotes) flags.push(n);
  for (const w of d.pvt.warnings || []) flags.push(w);
  if (d.pvt.withheld && d.pvt.mode !== 'constant') flags.push(d.pvt.withheld);
  for (const f of (inputs.pvtIntake?.contract?.range_flags || []).map((x) => x.text).filter(Boolean).slice(0, 8)) flags.push(`PVT source: ${f}`);
  for (const i of d.periodIssues) flags.push(i.text);
  for (const w of inputs.importInfo?.warnings || []) flags.push(`Import: ${w}`);
  if (d.isImported) for (const w of d.allocationCheck.warnings) flags.push(`Allocation: ${w}`);
  for (const a of d.patternAnalyses) if (a.withheld) flags.push(`Pattern "${a.pattern.name}" withheld: ${a.reason}`);
  if (inputs.datum && !text(inputs.datum.depth) && d.hasPressure) flags.push('The pressure datum is not stated.');
  return { assumptions, flags, noFlagsText: 'No flag: every input is typed, inside its range, and every period is covered.' };
}

/**
 * @param {object} inputs the project inputs
 * @param {object} d deriveVrr(inputs)
 * @param {{projectName?: string, organizationName?: string, build?: string, system?: string}} [o]
 */
export function buildVrrReportModel(inputs, d, o = {}) {
  if (!d?.series?.length || !d.series.some((s) => s.producedVoidage > 0 || s.injectedVoidage > 0)) return null;
  const system = o.system || inputs.unitSystem || 'oilfield';
  const u = vrrUnits(system);
  const identification = identificationPairs(inputs, d, { ...o, system });
  return {
    system,
    identification,
    displayUnits: u.line(),
    headline: headline(d, u),
    inputs: inputsBlock(inputs, d, u),
    engineInput: engineInputOf(inputs, d),
    ledger: ledgerTable(d, u),
    periods: periodTable(d, u),
    imported: importBlock(inputs),
    patterns: patternsBlock(inputs, d, u),
    basis: BASIS(d, inputs),
    limits: limitsBlock(inputs, d),
    pvtBlock: inputs.pvtIntake?.contract ? describePvtContract(inputs.pvtIntake.contract) : null,
    notes: text(inputs.identification?.notes) || null,
    footerWho: [text(inputs.identification?.field), text(inputs.identification?.reservoir)].filter(Boolean).join(', ') || text(o.projectName),
  };
}
