// Forecast Scenario Hub: its own report on the Report Kit (DCA U2-018,
// HUB-U1-009; PL7 and RL1 to RL12).
//
// The hub had no report: a set of cases left only as a screen and one annual
// CSV per case. This module builds the one model the PDF prints:
//
//   identification   company, field, the set, its start, the analyst, the
//                    cases and where they came from, units, build
//   inputs           every value the hub's engine reads (each case's
//                    parameters with the decline basis, the set start, the
//                    indicative economics), with unit and source (RL1)
//   cases            one row per case: model, qi, decline as typed and as the
//                    nominal it became, b, Dmin, horizon, limit, start, the
//                    source (entered here, or a Decline Curve Analysis
//                    forecast read by id with its well, project and fit date),
//                    the fields edited after the handoff, and whether the
//                    source changed since (RL11)
//   results          EUR, cumulative to the horizon and at five years, time to
//                    the limit, final rate, indicative NPV (RL3: EUR and the
//                    horizon cumulative are kept apart and named)
//   figures          rate against time of every case (log rate), cumulative
//                    against time, EUR by case (RL6)
//   limits           Arps, the bases, the 50-year life, the indicative
//                    economics, oil only, and flags on this set (RL9)
//
// Nothing is computed here that the hub does not compute on screen: the
// cases are run through compareCases, the hub's own engine.
import { createReport, EMPTY_VALUE, missingInputRows, SERIES_CYCLE, SERIES_RGB } from '@/lib/reportKit';
import { compareCases, caseDeclineBasis, caseTerminalPerDay, EUR_MAX_YEARS, DAYS_PER_YEAR } from '@/utils/forecastScenarioCalculations';
import { editedAfterHandoff, upstreamSourceLine } from '@/utils/forecastScenarioIntake';
import { HUB_DEFAULT_START } from '@/utils/forecastScenarioExport';
import { convert } from '@/lib/units/registry';

export const HUB_REPORT_TITLE = 'Forecast Scenario Hub Report';
export const HUB_REPORT_APP = 'Petrolord Forecast Scenario Hub';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, digits = 0) => (finite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : EMPTY_VALUE);
const sig = (v, d = 4) => (finite(v) ? String(parseFloat(v.toPrecision(d))) : EMPTY_VALUE);
const text = (v) => (v != null && String(v).trim() ? String(v).trim() : '');
const BASIS_WORDS = { nominal: 'nominal', 'effective-secant': 'effective, secant (with the case b)', 'effective-tangent': 'effective, tangent' };
const MODEL_WORDS = { Exponential: 'Arps exponential (b = 0)', Harmonic: 'Arps harmonic (b = 1)', Hyperbolic: 'Arps hyperbolic' };

/** The objects the hub's engine reads, for the completeness guard (RL1). */
export function hubEngineInputsOf({ cases, econ, setStart }) {
  return {
    cases: (cases || []).map((c) => ({ ...c })),
    econ: { pricePerBbl: econ?.pricePerBbl, opexPerBbl: econ?.opexPerBbl, discountRatePct: econ?.discountRatePct },
    setStart: setStart || HUB_DEFAULT_START,
  };
}

/** Where a case came from, in one phrase. */
export function caseSourcePhrase(c) {
  const k = c?.source?.contract;
  if (!k) return 'Entered in Forecast Scenario Hub';
  return `From ${upstreamSourceLine(k)}, received ${String(c.source.receivedAt || '').slice(0, 10) || EMPTY_VALUE}`;
}

/**
 * The model of the report.
 * @param {{cases: Array, econ: object, setStart?: string, setName?: string, identification?: object,
 *   organizationName?: string, metric?: boolean, sourceStates?: object, build?: string, generatedAt?: Date}} a
 */
export function collectHubReportArgs({ cases, econ, setStart = HUB_DEFAULT_START, setName = '', identification = {}, organizationName = '', metric = false, sourceStates = {}, build = '', generatedAt = new Date() }) {
  if (!cases || cases.length === 0) return { ok: false, refusal: 'There are no cases to report.' };
  const startIso = `${setStart || HUB_DEFAULT_START}T00:00:00Z`;
  const { cases: runs, summaries } = compareCases(cases, econ, startIso);
  const bad = summaries.filter((s) => s.error);
  if (bad.length === summaries.length) return { ok: false, refusal: `No case can be run: ${bad[0].error}` };

  const rateU = metric ? 'sm3/d' : 'bbl/d';
  const volU = metric ? 'sm3' : 'bbl';
  const bigVolU = metric ? '10^6 sm3' : 'MMbbl';
  const rate = (v) => (metric ? convert('liquidRate', v, 'bbl/d', 'm3/d') : v);
  const vol = (v) => (metric ? convert('liquidVolume', v, 'bbl', 'm3') : v);
  const mm = (v) => (metric ? convert('liquidVolume', v, 'MMbbl', '10^6 m3') : v);

  const fromDca = cases.filter((c) => c.source?.contract);
  // WF-U2-001: profile cases received from Waterflood Design Studio
  const profiles = cases.filter((c) => c.kind === 'profile' && c.source?.contract);
  const fromWf = profiles.filter((c) => c.source.contract.app === 'Waterflood Design Studio');
  // SIM-U2-002: profile cases received from Reservoir Simulation Studio
  const fromSim = profiles.filter((c) => c.source.contract.app === 'Reservoir Simulation Studio');
  // WS-U2-004: profile cases received from Well Spacing Optimizer
  const fromWs = profiles.filter((c) => c.source.contract.app === 'Well Spacing Optimizer');
  const wells = [...new Set(fromDca.map((c) => c.source.contract.source?.wellName).filter(Boolean))];
  const fields = [...new Set(fromDca.map((c) => c.source.contract.source?.field).filter(Boolean))];
  const identificationRows = [
    ['Company', text(identification.company) || text(organizationName) || EMPTY_VALUE],
    ['Field', text(identification.field) || fields.join(', ') || EMPTY_VALUE],
    ['Scenario set', text(setName) || 'Not saved'],
    ['Set start', setStart || HUB_DEFAULT_START],
    ['Cases', profiles.length
      ? `${cases.length} (${[`${fromDca.length - profiles.length} from Decline Curve Analysis`, ...(fromWf.length ? [`${fromWf.length} from Waterflood Design Studio`] : []), ...(fromSim.length ? [`${fromSim.length} from Reservoir Simulation Studio`] : []), ...(fromWs.length ? [`${fromWs.length} from Well Spacing Optimizer`] : []), `${cases.length - fromDca.length} entered here`].join(', ')})`
      : `${cases.length} (${fromDca.length} from Decline Curve Analysis, ${cases.length - fromDca.length} entered here)`],
    ['Wells behind the cases', wells.length ? wells.join(', ') : 'none named (cases entered here)'],
    ['Analyst', text(identification.analyst) || EMPTY_VALUE],
    ['Stream', 'Oil at stock-tank conditions'],
    ['Software build', build || EMPTY_VALUE],
    ['Sample cases', cases.some((c) => ['base', 'high', 'low'].includes(c.id)) ? 'Yes: the hub\'s sample cases are in this set' : 'No'],
  ];

  // ---- inputs (RL1) ----
  const defaults = { pricePerBbl: 70, opexPerBbl: 18, discountRatePct: 10 };
  const chosen = (v, d) => (v === d ? 'App default (not changed)' : 'Entered in the hub');
  const inputs = [
    { key: 'cases', label: 'Cases (parameters in the table "Cases")', value: `${cases.length}`, unit: '', source: 'Each case names its source in the table', engineKeys: ['cases'] },
    { key: 'setStart', label: 'Set start (a case without its own start takes it)', value: setStart || HUB_DEFAULT_START, unit: 'date', source: setStart === HUB_DEFAULT_START ? 'App default (not changed)' : 'Entered in the hub', engineKeys: ['setStart'] },
    { key: 'price', label: 'Oil price (indicative economics)', value: num(econ?.pricePerBbl, 2), unit: '$/bbl', source: chosen(econ?.pricePerBbl, defaults.pricePerBbl), engineKeys: ['econ.pricePerBbl'] },
    { key: 'opex', label: 'Operating cost (indicative economics)', value: num(econ?.opexPerBbl, 2), unit: '$/bbl', source: chosen(econ?.opexPerBbl, defaults.opexPerBbl), engineKeys: ['econ.opexPerBbl'] },
    { key: 'discount', label: 'Discount rate (indicative economics, year-end)', value: num(econ?.discountRatePct, 2), unit: '%/yr', source: chosen(econ?.discountRatePct, defaults.discountRatePct), engineKeys: ['econ.discountRatePct'] },
  ];
  const missing = missingInputRows(hubEngineInputsOf({ cases, econ, setStart }), inputs);

  // ---- cases (RL1, RL7, RL11) ----
  const caseRows = cases.map((c, i) => {
    const s = summaries[i];
    if (c.kind === 'profile') {
      return [
        c.name || EMPTY_VALUE,
        s?.error ? `Not run: ${s.error}` : `Profile from ${c.source?.contract?.app || 'another app'}`,
        EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE, 'none',
        num(Number(c.years), 2),
        "the sender's end",
        'none',
        s?.startDate || (c.startDate ? String(c.startDate).slice(0, 10) : setStart),
      ];
    }
    const basis = caseDeclineBasis(c);
    const dmin = caseTerminalPerDay(c);
    const nominalPct = s && !s.error ? s.diNominalPctPerYear : null;
    const declineText = basis === 'nominal'
      ? `${num(c.declineAnnualPct, 2)} nominal`
      : `${num(c.declineAnnualPct, 2)} ${BASIS_WORDS[basis]}; ${num(nominalPct, 2)} nominal`;
    return [
      c.name || EMPTY_VALUE,
      s?.error ? `Not run: ${s.error}` : (MODEL_WORDS[s.model] || s.model),
      num(rate(c.qi), 1),
      declineText,
      sig(Number(c.b)),
      dmin ? `${num(Number(c.terminalDeclinePct), 2)} ${c.terminalDeclineBasis === 'nominal' ? 'nominal' : 'effective'}${s?.terminal ? `; switch ${s.terminal.fromStart ? 'at the start' : s.terminal.switchDate}` : ''}` : 'none',
      num(Number(c.years), 2),
      Number(c.economicLimit) > 0 ? num(rate(Number(c.economicLimit)), 1) : 'none',
      Number(c.downtimePct) > 0 ? num(Number(c.downtimePct), 1) : 'none',
      s?.startDate || (c.startDate ? String(c.startDate).slice(0, 10) : setStart),
    ];
  });
  const sourceRows = cases.map((c) => {
    const edited = editedAfterHandoff(c);
    const st = sourceStates?.[c.id];
    return [
      c.name || EMPTY_VALUE,
      caseSourcePhrase(c),
      c.source?.contract ? (edited.length ? `Edited here after the handoff: ${edited.join(', ')}` : 'As received') : EMPTY_VALUE,
      c.source?.contract ? (st?.text || 'Not checked (the source is read again when the set is open in the app)') : EMPTY_VALUE,
    ];
  });

  // ---- results (RL3) ----
  const resultRows = summaries.map((s, i) => (s.error ? [cases[i].name, 'not run', EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE] : [
    s.name,
    `${num(mm(s.eurMMbbl), 3)}${s.eurCapped ? ' (life cap)' : ''}`,
    num(mm(s.cumHorizonMMbbl), 3),
    num(mm(s.cum5MMbbl), 3),
    s.timeToLimitYears == null ? (s.hasLimit ? `beyond ${EUR_MAX_YEARS} yr` : 'no limit') : num(s.timeToLimitYears, 2),
    num(rate(s.finalRate), 1),
    s.economics ? num(s.economics.npv, 2) : EMPTY_VALUE,
  ]));

  // ---- figures (RL6) ----
  const thin = (rates) => {
    const out = [];
    for (let k = 0; k < rates.length; k += 30) out.push(rates[k]);
    if (rates.length && (rates.length - 1) % 30 !== 0) out.push(rates[rates.length - 1]);
    return out;
  };
  const ms = (d) => new Date(d).getTime();
  const rateSeries = runs.map((r, i) => (r.error ? null : {
    name: r.name, type: 'line', rgb: SERIES_CYCLE[i % SERIES_CYCLE.length],
    pts: thin(r.rates || []).map((p) => [ms(p.date), rate(p.rate)]).filter((p) => finite(p[0]) && p[1] > 0),
  })).filter((x) => x && x.pts.length > 1);
  const cumSeries = runs.map((r, i) => (r.error ? null : {
    name: r.name, type: 'line', rgb: SERIES_CYCLE[i % SERIES_CYCLE.length],
    pts: thin(r.rates || []).map((p) => [ms(p.date), vol(p.cumulative) / 1e6]).filter((p) => finite(p[0])),
  })).filter((x) => x && x.pts.length > 1);
  const eurBars = { categories: summaries.filter((s) => !s.error).map((s) => s.name), values: summaries.filter((s) => !s.error).map((s) => mm(s.eurMMbbl)) };

  // ---- limits (RL9) ----
  const flags = [];
  for (let i = 0; i < cases.length; i += 1) {
    const c = cases[i];
    const s = summaries[i];
    if (s.error) flags.push(`${c.name}: not run (${s.error}).`);
    if (Number(c.b) > 1 && !caseTerminalPerDay(c)) flags.push(`${c.name}: b is ${sig(Number(c.b))}, above 1, with no terminal decline; its late rates and EUR rest on the economic limit and the ${EUR_MAX_YEARS}-year life.`);
    if (s.eurCapped && !s.error) flags.push(`${c.name}: EUR stopped at the ${EUR_MAX_YEARS}-year maximum life${s.hasLimit ? ' before the economic limit was reached' : ' (no economic limit)'}.`);
    const edited = editedAfterHandoff(c);
    if (edited.length) flags.push(`${c.name}: received from ${c.source?.contract?.app || 'Decline Curve Analysis'} and edited here after the handoff (${edited.join(', ')}); it no longer reproduces the source forecast.`);
    const st = sourceStates?.[c.id];
    if (st && st.state !== 'unchanged') flags.push(`${c.name}: ${st.text}`);
  }
  if (cases.some((c) => ['base', 'high', 'low'].includes(c.id))) flags.push('The set holds the hub\'s sample cases, which are illustrative values.');
  const assumptions = [
    'Each case is an Arps decline (exponential, harmonic or hyperbolic) from its start, run day by day by the same engine as Decline Curve Analysis. A case from Decline Curve Analysis restarts the fitted curve at the data cut-off and reproduces that forecast day for day until it is edited here.',
    `A decline is typed in percent per year on the basis printed with it and run as the nominal (instantaneous) decline at the case start; a year is ${DAYS_PER_YEAR} days. A terminal decline Dmin switches a hyperbolic case to an exponential at Dmin where its nominal decline falls to it.`,
    `EUR is the cumulative to the economic limit, followed past the horizon, and never beyond ${EUR_MAX_YEARS} years; the cumulative to the horizon is a separate number and is what the annual profile, the indicative NPV and the hand-off use.`,
    'The economics are indicative: flat price less flat operating cost, discounted at year end, with no capital, tax or fiscal terms. They rank cases; Petroleum Economics Studio values them.',
    'The hub holds oil cases only. Rates are calendar-day rates at stock-tank conditions.',
  ];
  if (fromWf.length) assumptions.push('A case from Waterflood Design Studio is the pattern oil profile of the wf-forecast-1 contract, day for day from the flood start, with no Arps parameters. It is cut at its horizon here and ends where the sender ended it (the WOR limit or the sender\'s horizon); its EUR is the sender\'s Np.');
  if (fromWs.length) assumptions.push('A case from Well Spacing Optimizer is the field oil profile of one spacing case (the ws-case-1 contract): every well of the case on its drilling schedule, with the rate limit as the case ran it, as a step rate over each twelfth of a year from the first production date, with no Arps parameters. It is cut at its horizon here and ends where the case ended (the economic limit or the project duration); its EUR is the case\'s field Np.');
  if (fromSim.length) assumptions.push('A case from Reservoir Simulation Studio is the field oil profile of one completed OPM Flow run (the sim-forecast-1 contract), the simulator\'s rate over each time step, day for day from the run start or from the history end, with no Arps parameters. It is cut at its horizon here and ends where the run ended; its EUR is the run\'s cumulative oil in the phase sent.');

  return {
    ok: true,
    title: HUB_REPORT_TITLE,
    appName: HUB_REPORT_APP,
    generatedAt,
    setName: text(setName) || 'Unsaved set',
    units: { rate: rateU, volume: volU, bigVolume: bigVolU, display: metric ? 'SI / metric (sm3/d, 10^6 sm3)' : 'Oilfield (bbl/d, MMbbl)' },
    identification: identificationRows,
    inputs,
    missing,
    caseRows,
    sourceRows,
    resultRows,
    rateSeries,
    cumSeries,
    eurBars,
    flags,
    assumptions,
    summaries,
  };
}

/** The figure list (also what the screen names). */
export function hubFigures(m) {
  const figs = [];
  figs.push(m.rateSeries.length ? {
    id: 'hub-rate',
    title: 'Rate against time, every case (log rate)',
    caption: `The daily forecast of each case from its start, about one point a month, to its horizon or economic limit (${m.units.rate}).`,
    panels: [{ height: 80, spec: { xTitle: 'Date', yTitle: `Rate (${m.units.rate})`, xDate: true, yLog: true, series: m.rateSeries } }],
  } : { id: 'hub-rate', title: 'Rate against time, every case (log rate)', statement: 'Does not apply: no case could be run.' });
  figs.push(m.cumSeries.length ? {
    id: 'hub-cum',
    title: 'Cumulative production against time, every case',
    caption: `Cumulative of each case from its start to its horizon (${m.units.volume} in millions); EUR, which may run past the horizon, is in the table.`,
    panels: [{ height: 70, spec: { xTitle: 'Date', yTitle: `Cumulative (10^6 ${m.units.volume})`, xDate: true, series: m.cumSeries } }],
  } : { id: 'hub-cum', title: 'Cumulative production against time, every case', statement: 'Does not apply: no case could be run.' });
  figs.push(m.eurBars.categories.length ? {
    id: 'hub-eur',
    title: 'EUR by case',
    caption: `EUR of each case to its economic limit or the ${EUR_MAX_YEARS}-year life (${m.units.bigVolume}).`,
    panels: [{ kind: 'bars', height: 60, spec: { yTitle: `EUR (${m.units.bigVolume})`, categories: m.eurBars.categories, valueText: (x) => x.toFixed(3), series: [{ name: 'EUR', values: m.eurBars.values, rgb: SERIES_RGB.blue }] } }],
  } : { id: 'hub-eur', title: 'EUR by case', statement: 'Does not apply: no case could be run.' });
  return figs;
}

/** Build the PDF. */
export function buildHubPdf(model, { logo = null } = {}) {
  if (!model?.ok) throw new Error(model?.refusal || 'The report could not be built.');
  if (model.missing?.length) throw new Error(`The report was not built: no inputs row for ${model.missing.join(', ')}.`);
  const r = createReport({ title: HUB_REPORT_TITLE, appName: HUB_REPORT_APP, logo });
  r.header({ identification: model.identification, displayUnits: model.units.display, generatedAt: model.generatedAt });
  r.table('Results by case', ['Case', `EUR (${model.units.bigVolume})`, `To horizon (${model.units.bigVolume})`, `At 5 yr (${model.units.bigVolume})`, 'To limit (yr)', `Final rate (${model.units.rate})`, 'Indicative NPV ($MM)'], model.resultRows, {
    note: 'EUR runs to the economic limit (or the life cap); "To horizon" is the cumulative inside the horizon, which the annual profile and the indicative NPV use.',
  });
  r.table('Cases', ['Case', 'Model', `qi (${model.units.rate})`, 'Decline (%/yr)', 'b', 'Dmin (%/yr)', 'Horizon (yr)', `Limit (${model.units.rate})`, 'Downtime (%)', 'Start'], model.caseRows, {
    note: `Decline as typed with its basis, and the nominal it became when typed on another basis; a year is ${DAYS_PER_YEAR} days. Downtime is the share of calendar time shut in: each day delivers the decline rate times the uptime.`,
  });
  r.table('Where each case came from', ['Case', 'Source', 'Since the handoff', 'Source now'], model.sourceRows, {
    note: 'A case from Decline Curve Analysis carries the dca-forecast-1 contract it was made from; the hub reads the source again by id and says when it changed.',
  });
  r.inputsTable(model.inputs, { title: 'Inputs', note: 'Every value the hub\'s engine reads besides the case parameters above.' });
  r.limits({ assumptions: model.assumptions, flags: model.flags, noFlagsText: 'Nothing in this set is flagged.', flagsTitle: 'Flags on this set' });
  const figs = r.figures(hubFigures(model));
  const out = r.finish({ footer: `${HUB_REPORT_TITLE}, ${model.setName}` });
  return { ...out, figuresBuilt: figs, model };
}

/** Build and save the PDF (the Report button). */
export async function exportHubPdf(model) {
  const { loadPetrolordLogo } = await import('@/lib/pdfBrand');
  const logo = await loadPetrolordLogo().catch(() => null);
  const { doc } = buildHubPdf(model, { logo });
  const name = `${String(model.setName || 'scenario_set').replace(/[^\w.-]+/g, '_')}_forecast_scenarios.pdf`;
  doc.save(name);
  return name;
}
