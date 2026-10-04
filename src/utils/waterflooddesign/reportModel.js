/**
 * The model of the Waterflood Design report (WF-U1; reviewer lens RL1 to
 * RL12). One object for the Report tab and the PDF: identification, headline
 * results, the recovery split, the mobility ratio by its parts, every input
 * with its unit and source (kr-1 and pvt-1 with their provenance), the data
 * and operations (the forecast year by year, the surveillance file and its
 * wells), the Hall windows, the model and basis, the limits and the
 * contract blocks. Built from what the studio already derived (the objects
 * the screen shows); nothing here calls an engine.
 *
 * Pure.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { inputRow, sourceText, assumedDefaultText } from '@/lib/inputProvenance/wording';
import { isStated } from '@/lib/inputProvenance/model';
import { describeKrContract } from '@/lib/inputProvenance/krContract';
import { describePvtContract } from '@/lib/inputProvenance/pvtContract';
import { wfUnits } from './units.js';
import { IDENTIFICATION_FIELDS, MOBILITY_BASES } from './model.js';
import { wfPvtSourceText } from './pvtIntake.js';
import { annualForecastRows, wellSummaryRows } from './series.js';
import { readBackLines } from './surveillanceImport.js';
import { countAlerts } from './surveillance.js';
import { mcSummaryState } from './mcSummary.js';
import { hallChoiceText } from './hallWindows.js';
import { patternTitle, patternLabel, isLineDrive, arealSweepCorrelationText, LINE_DRIVE_RANGE } from './patterns.js';
import { exactBreakthroughDays } from '@/utils/waterfloodUncertainty';

export const REPORT_TITLE = 'Waterflood Design Report';
export const APP_NAME = 'Petrolord Waterflood Design Studio';
export const ANALYSIS_TYPE = 'Buckley-Leverett displacement, five-spot pattern forecast, layered sweep and flood surveillance (analytical screening)';
export const SAMPLE_NOTE = 'Starting value of the app, not changed (assumed)';

/** The starting values of the app: an untouched one prints as an assumption. */
export const STARTING = Object.freeze({
  displacement: { Swc: '0.2', Sor: '0.2', krwMax: '0.4', kroMax: '1.0', nw: '2', no: '2', muW: '0.5', muO: '5.0', k_md: '500', A_ft2: '50000', qt_rbd: '1000', dipDeg: '0', gammaW: '1.05', gammaO: '0.85', polymerMuMult: '4' },
  pattern: { area_acres: '40', h_ft: '25', phi: '0.22', Bo: '1.25', Bw: '1.02', iw_bpd: '800', Sgi: '0', EV: '1', worLimit: '25', maxYears: '30' },
  surveillance: { bo: '1.25', bw: '1.02', bg: '0.9', rs: '500', smooth_window_days: '5', vrr_window_days: '30', target_vrr: '1.0' },
  layered: { M: '2.0', A: '1.5' },
});

const text = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
const n = (v) => {
  if (v === '' || v == null) return NaN;
  const x = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(x) ? x : NaN;
};
const f = (v, d) => (Number.isFinite(v) ? Number(v).toFixed(d) : EMPTY_VALUE);
const g = (v, s = 4) => (Number.isFinite(v) ? String(parseFloat(Number(v).toPrecision(s))) : EMPTY_VALUE);
const th = (v, d = 0) => (Number.isFinite(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : EMPTY_VALUE);
const pct = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}` : EMPTY_VALUE);

const STOP = { 'wor-limit': 'WOR limit reached', 'displacement-exhausted': 'displacement exhausted (ED at its maximum)', horizon: 'end of the horizon' };

/**
 * @param {object} s the studio state: { displacementInputs, displacementSpec, displacement, layers,
 *   layeredConfig, layeredResult, patternInputs, patternResult, surveillanceRows, surveillanceConfig,
 *   surveillanceResult, surveillanceImport, uncertaintyConfig, mcSummary, identification, inputMeta,
 *   pvtIntake, migratedFrom }
 * @param {{projectName?: string, organizationName?: string, build?: string, system?: string}} ctx
 */
export function buildWaterfloodReportModel(s, { projectName = '', organizationName = '', build = '', system = 'oilfield' } = {}) {
  if (!s) return null;
  const u = wfUnits(system);
  const d = s.displacementInputs || {};
  const p = s.patternInputs || {};
  const sc = s.surveillanceConfig || {};
  const meta = s.inputMeta || {};
  const disp = s.displacement;
  const bl = disp?.bl || {};
  const pr = s.patternResult;
  const sum = pr?.summary || null;
  const LINE = isLineDrive(p.patternType);
  const sr = s.surveillanceResult && !s.surveillanceResult.error ? s.surveillanceResult : null;
  const kr = d.krIntake || null;

  // ---- identification ------------------------------------------------------
  const id = s.identification || {};
  const dates = (s.surveillanceRows || []).map((r) => String(r.date || '').slice(0, 10)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  const identification = [['Project', text(projectName) || EMPTY_VALUE]];
  for (const { key, label } of IDENTIFICATION_FIELDS) {
    let v = text(id[key]);
    if (key === 'company' && !v) v = text(organizationName);
    identification.push([label, v || EMPTY_VALUE]);
  }
  identification.push(['Surveillance data', dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : EMPTY_VALUE]);
  identification.push(['Analysis type', LINE ? ANALYSIS_TYPE.replace('five-spot', patternLabel(p.patternType)) : ANALYSIS_TYPE]);
  identification.push(['Software build', text(build) || EMPTY_VALUE]);

  // ---- sources ------------------------------------------------------------
  const krSource = (key) => {
    if (!kr || kr.values?.[key] == null) return null;
    const now = d[key];
    if (now != null && String(now) !== '' && Number(now) !== Number(kr.values[key])) {
      return `Edited in this app after the intake (received ${kr.values[key]}). The intake said: ${kr.sourceText || 'SCAL Studio'}`;
    }
    return kr.sourceText ? `SCAL Studio kr-1: ${kr.sourceText}` : 'SCAL Studio (kr-1)';
  };
  const pvtSource = (cardKey, now) => wfPvtSourceText(s.pvtIntake, cardKey, now);
  const startSource = (group, key, value) => (String(value) === STARTING[group]?.[key] ? SAMPLE_NOTE : null);
  const src = (group, key, value, auto = null) => {
    if (auto) return sourceText(meta[key], auto);
    if (isStated(meta[key])) return sourceText(meta[key]);
    return startSource(group, key, value) || sourceText(meta[key]);
  };
  const row = (r) => inputRow(r);
  const unitOf = (kind) => u.label(kind);
  const val = (kind, v, sig = 5) => (Number.isFinite(n(v)) ? g(u.show(kind, n(v)), sig) : '');

  const inputs = [];
  // relative permeability
  if (d.krSource === 'table') {
    const t = d.krTable || [];
    inputs.push(row({
      key: 'krTable', label: 'Relative permeability table (Sw, krw, kro)', value: t.length ? `${t.length} rows, Sw ${t[0].Sw} to ${t[t.length - 1].Sw}` : '', unit: 'fraction',
      auto: kr?.set ? null : null, meta: meta.krTable,
    }));
  } else {
    for (const [key, label] of [['Swc', 'Connate water saturation Swc'], ['Sor', 'Residual oil saturation Sor'], ['krwMax', 'krw at Sor (end point)'], ['kroMax', 'kro at Swc (end point)'], ['nw', 'Corey water exponent nw'], ['no', 'Corey oil exponent no']]) {
      inputs.push(row({ key, label, value: g(n(d[key])), unit: key.startsWith('n') ? '' : 'fraction', auto: krSource(key) || startSource('displacement', key, d[key]), meta: meta[key] }));
    }
  }
  for (const [key, label, cardKey] of [['muW', 'Water viscosity muW', 'muW'], ['muO', 'Oil viscosity muO', 'muO']]) {
    inputs.push(row({ key, label, value: g(n(d[key])), unit: unitOf('viscosity'), auto: pvtSource(cardKey, d[key]) || krSource(key) || (isStated(meta[key]) ? null : startSource('displacement', key, d[key])), meta: meta[key] }));
  }
  if (d.gravityOn) {
    const ki = d.kIntake;
    const kAuto = ki && ki.value != null
      ? (Number(d.k_md) === Number(ki.value)
        ? `Tested permeability from ${ki.from} (${String(ki.at || '').slice(0, 10)}); method and interval not stated by the handoff`
        : `Edited in this app after the intake (received ${ki.value} md from ${ki.from})`)
      : null;
    for (const [key, label, kind] of [['k_md', 'Permeability k (dip term)', 'permeability'], ['A_ft2', 'Flow area A', 'flowArea'], ['qt_rbd', 'Total rate qt', 'resRate'], ['dipDeg', 'Dip (updip positive)', 'angle'], ['gammaW', 'Water specific gravity', 'gravity'], ['gammaO', 'Oil specific gravity', 'gravity']]) {
      inputs.push(row({ key, label, value: val(kind, d[key]), unit: unitOf(kind), auto: (key === 'k_md' && kAuto) || (isStated(meta[key]) ? null : startSource('displacement', key, d[key])), meta: meta[key] }));
    }
  } else {
    inputs.push({ key: 'gravityOn', label: 'Dip and gravity term', value: 'Off', unit: '', source: 'Chosen in the app: horizontal displacement, no gravity term' });
  }
  if (d.polymerOn) inputs.push(row({ key: 'polymerMuMult', label: 'Polymer water viscosity multiplier', value: g(n(d.polymerMuMult)), unit: '', auto: 'Entered (screening only)', meta: meta.polymerMuMult }));
  // pattern
  for (const [key, label, kind] of [['area_acres', 'Pattern area', 'area'], ['h_ft', 'Net thickness', 'length'], ['phi', 'Porosity', 'fraction']]) {
    inputs.push(row({ key, label, value: val(kind, p[key]), unit: unitOf(kind), auto: isStated(meta[key]) ? null : startSource('pattern', key, p[key]), meta: meta[key] }));
  }
  for (const [key, label, cardKey] of [['Bo', 'Oil FVF Bo (pattern)', 'Bo'], ['Bw', 'Water FVF Bw (pattern)', 'Bw']]) {
    inputs.push(row({ key, label, value: val('fvfOil', p[key]), unit: unitOf('fvfOil'), auto: pvtSource(cardKey, p[key]) || (isStated(meta[key]) ? null : startSource('pattern', key, p[key])), meta: meta[key] }));
  }
  for (const [key, label, kind] of [['iw_bpd', 'Water injection rate (constant, reservoir barrels)', 'resRate'], ['Sgi', 'Initial free gas saturation Sgi', 'fraction'], ['EV', 'Vertical sweep EV (multiplier)', 'dimensionless'], ['worLimit', 'WOR economic limit (surface, STB/STB)', 'dimensionless'], ['maxYears', 'Forecast horizon', 'years']]) {
    inputs.push(row({ key, label, value: val(kind, p[key]), unit: unitOf(kind), auto: isStated(meta[key]) ? null : startSource('pattern', key, p[key]), meta: meta[key] }));
  }
  // WF-U2-002: the flood pattern and its areal sweep correlation
  inputs.push({ key: 'patternType', label: 'Flood pattern', value: patternTitle(p.patternType), unit: '', source: p.patternType ? `Chosen in the app: ${arealSweepCorrelationText(p.patternType)}` : `Starting value of the app: ${arealSweepCorrelationText('five-spot')}` });
  inputs.push({ key: 'mobilityBasis', label: 'Mobility ratio of the areal sweep correlation', value: p.mobilityBasis === 'endpoint' ? 'Endpoint' : 'Craig', unit: '', source: `Chosen in the app: ${MOBILITY_BASES[p.mobilityBasis === 'endpoint' ? 'endpoint' : 'craig']}${s.migratedFrom && p.mobilityBasis === 'endpoint' ? ' (kept from a project saved before October 2026)' : ''}` });
  // layered
  const layers = (s.layers || []).filter((l) => n(l.h) > 0 && n(l.k) > 0);
  inputs.push({ key: 'layers', label: 'Layers (thickness, permeability)', value: layers.length ? `${layers.length} layers, total ${g(u.show('length', layers.reduce((a, l) => a + n(l.h), 0)))} ${unitOf('length')}` : EMPTY_VALUE, unit: '', source: layers.length ? sourceText(meta.layers, isStated(meta.layers) ? null : 'Entered or imported on the Layered Sweep tab') : 'Not provided' });
  const lc = s.layeredConfig || {};
  inputs.push({ key: 'layeredM', label: 'Mobility ratio for Dykstra-Parsons', value: g(s.layeredResult?.M), unit: '', source: lc.mSource === 'manual' ? sourceText(meta.layeredM, isStated(meta.layeredM) ? null : 'Entered') : 'Computed: endpoint M of the Displacement tab' });
  inputs.push({ key: 'layeredA', label: 'Stiles capacity ratio A', value: g(s.layeredResult?.A), unit: '', source: lc.aSource === 'derived' ? `Computed: A = M x Bo / Bw = ${g(s.layeredResult?.M)} x ${g(n(p.Bo))} / ${g(n(p.Bw))}` : sourceText(meta.layeredA, isStated(meta.layeredA) ? null : (String(lc.A) === STARTING.layered.A ? SAMPLE_NOTE : 'Entered')) });
  // surveillance
  if ((s.surveillanceRows || []).length) {
    for (const [key, label, kind, cardKey] of [['bo', 'Oil FVF Bo (voidage)', 'fvfOil', 'sBo'], ['bw', 'Water FVF Bw (voidage)', 'fvfOil', 'sBw'], ['bg', 'Gas FVF Bg (free-gas voidage)', 'fvfGas', 'sBg'], ['rs', 'Solution GOR Rs (free-gas voidage)', 'gor', 'sRs']]) {
      const stated = text(sc[key]) !== '';
      inputs.push(row({
        key: `s_${key}`, label, value: stated ? val(kind, sc[key]) : '', unit: unitOf(kind),
        auto: pvtSource(cardKey, sc[key]) || (isStated(meta[`s_${key}`]) ? null : (String(sc[key]) === STARTING.surveillance[key] ? `${SAMPLE_NOTE}; no Fluid Systems intake` : null)),
        meta: meta[`s_${key}`],
      }));
    }
    inputs.push({ key: 'pressure_basis', label: 'Injection pressure basis (Hall plot)', value: sc.pressure_basis === 'bottomhole' ? 'Bottomhole' : 'Wellhead', unit: '', source: 'Chosen at the import door; integrated as given, no head or friction correction' });
    inputs.push({ key: 'windows', label: 'Smoothing, VRR window, target VRR', value: `${text(sc.smooth_window_days) || EMPTY_VALUE} d, ${text(sc.vrr_window_days) || EMPTY_VALUE} d, ${text(sc.target_vrr) || EMPTY_VALUE}`, unit: '', source: ['smooth_window_days', 'vrr_window_days', 'target_vrr'].every((k) => String(sc[k]) === STARTING.surveillance[k]) ? SAMPLE_NOTE : 'Entered' });
    inputs.push({ key: 'window', label: 'Analysis window', value: sc.start_date || sc.end_date ? `${sc.start_date || 'start'} to ${sc.end_date || 'end'}` : 'Whole file', unit: '', source: 'Entered' });
  }
  const inputsNote = 'Every value the analysis read, with its unit in the display system and where it came from. "Starting value of the app" marks a default the user never changed. Values taken from SCAL Studio (kr-1) or Fluid Systems Studio (pvt-1) name the project and the method; a value typed over after the intake says so.';

  // ---- headline results -----------------------------------------------------
  const headline = [];
  const H = (q, v, unit, basis) => headline.push([q, v, unit || '', basis || '']);
  H('Endpoint mobility ratio M', g(disp?.M, 4), '', '(krw at Sor / muW) / (kro at Swc / muO)');
  H('Front saturation Swf', f(bl.Swf, 3), 'fraction', 'Welge tangent from (Swc, 0)');
  H('Water cut at the front fw(Swf)', f(bl.fwf, 3), 'fraction', 'reservoir');
  H('Average Sw behind the front at breakthrough', f(bl.SwAvgBt, 3), 'fraction', 'Welge');
  H('Pore volumes injected at breakthrough (1-D)', f(bl.QiBt, 3), 'PV', '1 / fw\'(Swf)');
  H('Displacement efficiency at breakthrough ED', pct(bl.EDbt), '%', 'of oil in place in the swept region');
  H('Displacement efficiency at Sor (maximum)', pct(bl.EDmax), '%', '(1 - Swc - Sor) / (1 - Swc)');
  if (sum) {
    H('Mobility ratio entered in the areal sweep correlation', g(sum.M, 4), '', sum.mobilityBasis === 'craig' ? 'Craig: krw at the average Sw behind the front' : 'endpoint');
    H('Areal sweep at pattern breakthrough EA', pct(sum.EAbt), '%', LINE ? `${patternTitle(p.patternType).toLowerCase()}, Fassihi regression at a water cut of 0` : 'five-spot, Craig data, Willhite regression');
    const btDays = pr.breakthrough ? (exactBreakthroughDays(pr.breakthrough, p) ?? pr.breakthrough.t_days) : NaN;
    H('Pattern breakthrough', f(btDays / 365.25, 2), 'yr', 'from the start of injection, as on screen');
    H('Water injected at breakthrough', th(u.show('resVolume', sum.WiBT_bbl)), unitOf('resVolume'), 'reservoir barrels');
    H('Cumulative oil Np at the end', th(u.show('oilVolume', sum.Np_stb)), unitOf('oilVolume'), 'stock tank');
    H('Recovery of the pattern OOIP ER', pct(sum.recoverySplit?.ER), '%', 'ED x EA x EV');
    H('Final water-oil ratio', Number.isFinite(sum.finalWOR) ? f(sum.finalWOR, 1) : 'no oil rate', 'STB/STB', 'surface');
    H('Forecast stopped at', `${f(sum.elapsed_days / 365.25, 2)} yr, ${STOP[sum.stopped] || sum.stopped}`, '', '');
  } else {
    H('Pattern forecast', 'not run', '', (pr?.warnings || [])[0] || 'invalid inputs');
  }
  if (s.layeredResult) {
    H('Dykstra-Parsons permeability variation V', f(s.layeredResult.V?.V, 3), '', 'log-normal fit of the layer k');
  }
  if (sr) {
    const k = sr.kpis || {};
    H('Cumulative VRR', f(k.vrr_avg, 3), 'RB/RB', 'injected over produced reservoir voidage, calendar volumes');
    H('Rolling VRR, last window', f(k.vrr_rolling, 3), 'RB/RB', `${text(sc.vrr_window_days) || '30'} calendar days`);
    H('Water cut over the history', f(k.avg_water_cut_pct, 1), '%', 'volume-weighted, surface');
    H('Surveillance alerts', String(countAlerts(sr.alerts)), '', 'water cut, VRR band, Hall injectivity');
  }
  const mcState = s.mcSummary ? mcSummaryState(s.mcSummary, { displacementInputs: d, patternInputs: p, uncertaintyConfig: s.uncertaintyConfig }) : null;
  if (s.mcSummary) {
    const m = s.mcSummary;
    H('Np P90 / P50 / P10 (Monte Carlo)', `${th(u.show('oilVolume', m.np?.p90))} / ${th(u.show('oilVolume', m.np?.p50))} / ${th(u.show('oilVolume', m.np?.p10))}`, unitOf('oilVolume'), `P90 is the low case; ${m.validCount} valid of ${m.iterations}; ${mcState === 'current' ? 'run on the inputs of this report' : 'RUN ON EARLIER INPUTS: not this case'}`);
  }

  // ---- recovery split (RL3) and mobility ratio parts (RL2) ------------------
  let split = null;
  if (sum?.recoverySplit) {
    const r = sum.recoverySplit;
    split = {
      head: ['Part', 'Value', 'Method'],
      rows: [
        ['Displacement efficiency ED', `${pct(r.ED, 2)} %`, 'Buckley-Leverett with the Welge construction, at the pore volumes injected into the swept region'],
        ['Areal sweep EA', `${pct(r.EA, 2)} %`, LINE ? `${patternTitle(p.patternType)}: Fassihi regression of the Dyes, Caudle and Erickson charts, at the producing water cut` : 'Five-spot: Craig data (Willhite regression) to breakthrough, Dyes, Caudle and Erickson growth after it'],
        ['Vertical sweep EV', `${pct(r.EV, 2)} %`, 'Entered multiplier (a Dykstra-Parsons coverage may be used)'],
        ['Recovery ER = ED x EA x EV', `${pct(r.product, 2)} %`, `of the pattern OOIP, ${th(u.show('oilVolume', sum.pattern_ooip_stb))} ${unitOf('oilVolume')}`],
      ],
      note: `Closure: ED x EA x EV = ${pct(r.product, 3)} % against Np / OOIP = ${pct(r.ER, 3)} %. Pattern OOIP = 7,758 x A x h x phi x (1 - Swc) / Bo.`,
    };
  }
  let mobility = null;
  if (disp && n(d.muO) > 0) {
    const krwSor = d.krSource === 'table' ? NaN : n(d.krwMax);
    const kroSwc = d.krSource === 'table' ? NaN : n(d.kroMax);
    mobility = {
      head: ['Component', 'Value'],
      rows: [
        ['krw at Sor', g(krwSor)],
        ['kro at Swc', g(kroSwc)],
        ['Water viscosity used muW (cP)', `${g(disp.muWeff)}${d.polymerOn ? ` (muW ${g(n(d.muW))} x polymer multiplier ${g(n(d.polymerMuMult))})` : ''}`],
        ['Oil viscosity muO (cP)', g(n(d.muO))],
        ['Endpoint M', g(disp.M, 4)],
        ...(sum ? [
          ['Average Sw behind the front at breakthrough', g(sum.SwAvgBt, 4)],
          ['krw at that saturation', g(sum.krwAtSwAvgBt, 4)],
          ['Craig M = (krw(Sw avg) / muW) / (kro(Swc) / muO)', g(sum.M_craig, 4)],
          ['M entered in the areal sweep correlation', `${g(sum.M, 4)} (${sum.mobilityBasis})`],
        ] : []),
      ],
      note: LINE
        ? 'Endpoint M governs the displacement and the Dykstra-Parsons layered sweep. Ahmed\'s areal sweep procedure takes Craig\'s M (eq. 14-61), at the average water saturation behind the front at breakthrough, for the line drive correlations too.'
        : 'Endpoint M governs the displacement and the Dykstra-Parsons layered sweep. The five-spot areal sweep correlation was built on Craig\'s M, taken at the average water saturation behind the front at breakthrough.',
    };
  }

  // ---- data and operations (RL5) ---------------------------------------------
  const annual = pr?.series?.length ? annualForecastRows(pr) : [];
  const forecastTable = annual.length ? {
    head: ['Year', u.head('Water injected', 'resVolume'), u.head('Oil produced', 'oilVolume'), u.head('Water produced', 'waterVolume'), u.head('Np at year end', 'oilVolume'), 'WOR at year end', 'EA at year end (%)'],
    rows: annual.map((r) => [String(r.year), th(u.show('resVolume', r.injected)), th(u.show('oilVolume', r.oil)), th(u.show('waterVolume', r.water)), th(u.show('oilVolume', r.np)), Number.isFinite(r.wor) ? f(r.wor, 2) : 'no oil rate', pct(r.ea)]),
    note: `Constant injection of ${val('resRate', p.iw_bpd)} ${unitOf('resRate')} from time zero; monthly steps; the last year may be part of a year. Production balances injection in reservoir barrels after fill-up (voidage replacement 1.0 by construction). Oil produced sums to ${th(u.show('oilVolume', annual.reduce((a, r) => a + r.oil, 0)))} ${unitOf('oilVolume')}, the Np at the end.`,
  } : null;

  let surveillance = null;
  if ((s.surveillanceRows || []).length) {
    const imp = s.surveillanceImport;
    const inWindow = (r) => {
      const dd = String(r.date).slice(0, 10);
      return (!sc.start_date || dd >= sc.start_date) && (!sc.end_date || dd <= sc.end_date);
    };
    const wells = wellSummaryRows((s.surveillanceRows || []).filter(inWindow));
    const tot = wells.reduce((a, w) => ({ oil: a.oil + w.oil, water: a.water + w.water, inj: a.inj + w.inj }), { oil: 0, water: 0, inj: 0 });
    const dq = sr?.data_quality || {};
    surveillance = {
      source: imp?.sample ? [`${imp.fileName}.`] : imp ? readBackLines(imp) : ['The history was loaded before this app kept an import record: file, units and rows left out are not known.'],
      quality: `Rows into the engine ${dq.rows_in ?? EMPTY_VALUE}, used ${dq.rows_out ?? EMPTY_VALUE}; duplicates removed ${dq.duplicates_removed ?? 0}; negative rates zeroed ${dq.negatives_zeroed ?? 0}.${(dq.issues || []).length ? ` ${dq.issues.join(' ')}` : ''}`,
      wells: {
        head: ['Well', 'Type', 'First', 'Last', 'Rows', 'Days', u.head('Oil', 'oilVolume'), u.head('Water', 'waterVolume'), u.head('Injected', 'waterVolume')],
        rows: [
          ...wells.map((w) => [w.well, w.type, w.first, w.last, String(w.rows), th(w.days), th(u.show('oilVolume', w.oil)), th(u.show('waterVolume', w.water)), th(u.show('waterVolume', w.inj))]),
          ['Total', '', '', '', String(wells.reduce((a, w) => a + w.rows, 0)), '', th(u.show('oilVolume', tot.oil)), th(u.show('waterVolume', tot.water)), th(u.show('waterVolume', tot.inj))],
        ],
        note: 'Volumes are daily rates times the days to the well\'s next row (the last row: the gap before it). The field totals of the engine are built the same way from the field days.',
      },
      totals: tot,
    };
  }

  // ---- Hall windows ----------------------------------------------------------
  let hall = null;
  if (sr?.hall_plots?.length) {
    const basis = sc.pressure_basis === 'bottomhole' ? 'bottomhole' : 'wellhead';
    const rows = [];
    for (const h of sr.hall_plots) {
      for (const [key, third] of [['baseline', 'Baseline (first third)'], ['recent', 'Recent (last third)']]) {
        const w = h.windows?.[key];
        if (!w) continue;
        // WF-U2-003: a window chosen by the user is named as chosen
        const label = w.chosen ? `${key === 'baseline' ? 'Baseline' : 'Recent'} (chosen)` : third;
        const ci = w.ci95 ? `${g(u.show('hallSlope', w.ci95[0]), 4)} to ${g(u.show('hallSlope', w.ci95[1]), 4)}` : EMPTY_VALUE;
        rows.push([h.injector, label, `${h.dates?.[w.lo] || EMPTY_VALUE} to ${h.dates?.[w.hi - 1] || EMPTY_VALUE}`, String(w.n), g(u.show('hallSlope', w.slope), 4), ci, f(w.r2, 3)]);
      }
      rows.push([h.injector, 'Recent over baseline', '', '', f(h.slope_ratio, 3), '', '']);
      if (h.windowChoice) rows.push([h.injector, 'Why these windows', '', '', hallChoiceText(h), '', '']);
    }
    hall = {
      head: ['Injector', 'Window', 'Dates', 'Points', u.head('Slope', 'hallSlope'), '95% interval', 'r2'],
      rows,
      note: `Hall (1963): the integral of the ${basis} injection pressure over time against cumulative water injected; the slope is p/q. A ratio of 1.2 or more flags declining injectivity, 0.8 or less improving injectivity (possible fracturing or channelling). Pressure integrated as given: no hydrostatic head, friction or reservoir pressure is applied.`,
      withoutPressure: sr.capabilities?.hall?.injectorsWithoutPressure || [],
    };
  }

  const layeredTable = s.layeredResult ? {
    head: ['Stage', 'k broken (md)', 'DP coverage (%)', 'DP WOR (RB/RB)', 'Stiles coverage (%)', 'Stiles water cut (%)'],
    rows: s.layeredResult.dykstraParsons.map((x, i) => [String(i + 1), f(x.kBroken, 1), pct(x.coverage), Number.isFinite(x.WOR) ? f(x.WOR, 2) : 'infinite', pct(s.layeredResult.stiles[i]?.coverage), pct(s.layeredResult.stiles[i]?.waterCut)]),
    note: `Dykstra-Parsons V ${f(s.layeredResult.V?.V, 3)}, median k ${f(s.layeredResult.V?.k50, 1)} md; M ${g(s.layeredResult.M)}; Stiles A ${g(s.layeredResult.A)}. Non-communicating layers, piston-like displacement in each.`,
  } : null;

  // ---- model, basis ----------------------------------------------------------
  const model = [
    ['Displacement', '1-D Buckley-Leverett with the Welge tangent; capillary pressure neglected; incompressible fluids; fw with the field-unit gravity term when the dip term is on'],
    ['Relative permeability', d.krSource === 'table' ? 'Table, linear interpolation' : 'Corey, normalised on (Sw - Swc) / (1 - Swc - Sor)'],
    ['Areal sweep', LINE
      ? `${patternTitle(p.patternType)}: Fassihi (1986) regression of the Dyes, Caudle and Erickson (1954) charts (Ahmed eq. 14-67), EA = 1 / (1 + A), A = [a1 ln(M + a2) + a3] fw + a4 ln(M + a5) + a6, entered with ${p.mobilityBasis === 'endpoint' ? 'the endpoint M' : 'Craig\'s M'}; EA at breakthrough at fw = 0, after breakthrough solved against the producing reservoir water cut of each step, never falling, capped at 1`
      : `Five-spot: EA at breakthrough from Craig\'s data (Willhite regression), entered with ${p.mobilityBasis === 'endpoint' ? 'the endpoint M' : 'Craig\'s M'}; growth after breakthrough EA = EAbt + 0.2749 ln(Wi / Wibt) (Dyes, Caudle and Erickson 1954), capped at 1`],
    ['Pattern forecast', 'Piston-like areal growth of the Buckley-Leverett profile; Np = PV x EV x EA x ED x (1 - Swc); rates by differencing Np; production balances injection in reservoir barrels'],
    ['Layered sweep', 'Dykstra-Parsons (non-communicating, log-normal V) and Stiles coverage'],
    ['Surveillance', 'Reservoir-barrel voidage (oil x Bo, water x Bw, free gas x Bg), VRR daily, rolling over calendar days and cumulative on calendar volumes; Hall (1963); Chan (1995) WOR and WOR\' diagnostics (indicative)'],
    ['Uncertainty', 'Monte Carlo through the canonical module (src/lib/monteCarlo.js), each realization rerunning the forecast; summary kept, realizations not kept'],
  ];
  const basis = [
    ['Formation volume factors', 'Bo and Bw in reservoir barrels per stock-tank barrel (RB/STB); Bg in reservoir barrels per Mscf; one value for the whole history at the pressure stated with the intake'],
    ['Rates and volumes', 'Injection rate of the forecast in reservoir barrels per day; produced oil and water in stock-tank barrels; surveillance rates are daily rates as imported'],
    ['Water-oil ratio and water cut', 'Surface (STB/STB); the Dykstra-Parsons WOR is at reservoir conditions'],
    ['VRR', 'Reservoir barrels injected over reservoir barrels of voidage produced'],
    ['Time', 'Forecast in years of 365.25 days from the start of injection; surveillance on calendar dates'],
    ['Pressure (Hall)', `${sc.pressure_basis === 'bottomhole' ? 'Bottomhole' : 'Wellhead'} injection pressure as imported, absolute or gauge as in the file`],
    ['Percentiles', 'Petroleum convention: P90 is the low case'],
    ['Display units', u.line()],
  ];

  // ---- limits (RL9) ----------------------------------------------------------
  const flags = [];
  if (sum && LINE && (sum.M < 0.1 || sum.M > 10)) flags.push(`The mobility ratio entered in the line drive correlation, ${g(sum.M, 3)}, is outside 0.1 to 10.`);
  if (sum && !LINE && (sum.M < 0.15 || sum.M > 10)) flags.push(`The mobility ratio entered in the areal sweep correlation, ${g(sum.M, 3)}, is outside its published range of 0.15 to 10.`);
  if (sum && p.mobilityBasis === 'endpoint') flags.push('The areal sweep was entered with the endpoint mobility ratio, not Craig\'s definition the correlation was built on.');
  if (n(p.Sgi) > 0) flags.push(`Initial free gas Sgi ${g(n(p.Sgi))}: fill-up is a delay only; the oil in place is taken on 1 - Swc.`);
  if (n(p.EV) > 0 && n(p.EV) < 1) flags.push(`Vertical sweep EV ${g(n(p.EV))} applied as a constant multiplier.`);
  if (d.polymerOn) flags.push('Polymer case: water viscosity multiplied only (no adsorption, permeability reduction or rheology).');
  if (d.gravityOn) flags.push('Dip term on: the fractional flow carries the gravity term at the stated total rate.');
  for (const w of disp?.warnings || []) flags.push(w);
  for (const w of (pr?.warnings || []).filter((x) => !(disp?.warnings || []).includes(x))) flags.push(w);
  const editedRows = inputs.filter((r) => /^Edited in this app after the intake/.test(r.source));
  if (editedRows.length) flags.push(`Edited after the intake: ${editedRows.map((r) => r.label).join(', ')}.`);
  if (mcState === 'stale') flags.push('The Monte Carlo summary was run on earlier inputs and does not describe this case.');
  if (hall?.withoutPressure?.length) flags.push(`Injectors with too few pressure points for a Hall plot: ${hall.withoutPressure.join(', ')}.`);
  const limits = {
    assumptions: [
      'One-dimensional Buckley-Leverett displacement: incompressible, immiscible, no capillary pressure, homogeneous rock in each layer.',
      ...(LINE ? [
        `An idealised, isolated ${patternTitle(p.patternType).toLowerCase()} element repeated over the field: no interference between patterns, no edge effects, constant injection.`,
        'Areal sweep from a regression of the Dyes, Caudle and Erickson scaled-model charts of a homogeneous pattern; the spacing ratio of their models is not printed in the source read (Ahmed), so it is not an input. A nine-spot is not covered.',
      ] : [
        'An idealised, isolated five-spot repeated over the field: no interference between patterns, no edge effects, constant injection.',
        'Areal sweep from correlations of scaled physical models of a homogeneous five-spot; other patterns are not covered.',
      ]),
      'Vertical sweep is a constant multiplier; the layered methods assume non-communicating layers.',
      'Surveillance: one set of formation volume factors for the whole history; voidage is a ratio of reservoir volumes, not a pressure.',
      'The Hall slope integrates the pressure as imported; with wellhead pressure the friction and the hydrostatic head are inside the slope. Chan mechanisms are indicative only.',
      'A screening tool: the numbers support a decision to study further, not a development plan.',
    ],
    ranges: {
      head: ['Method', 'Published range', 'This case'],
      rows: [
        ...(LINE ? [
          [`${patternTitle(p.patternType)} areal sweep (Fassihi regression)`, LINE_DRIVE_RANGE, sum ? `M ${g(sum.M, 3)}` : EMPTY_VALUE],
          ['Areal sweep after breakthrough', 'Producing water cut 0 to 1, EA up to 1', sum ? `EA ${pct(sum.recoverySplit?.EA)} % at the end` : EMPTY_VALUE],
        ] : [
          ['Five-spot areal sweep at breakthrough (Craig data, Willhite regression)', 'M 0.15 to 10', sum ? `M ${g(sum.M, 3)}` : EMPTY_VALUE],
          ['Areal sweep growth (Dyes, Caudle and Erickson)', 'Five-spot after breakthrough, EA up to 1', sum ? `EA ${pct(sum.recoverySplit?.EA)} % at the end` : EMPTY_VALUE],
        ]),
        ['Dykstra-Parsons', 'V 0 to 1, log-normal layer permeability', s.layeredResult ? `V ${f(s.layeredResult.V?.V, 3)}` : EMPTY_VALUE],
      ],
    },
    flags,
  };

  // ---- the contract blocks ----------------------------------------------------
  const krBlock = kr?.contract ? describeKrContract(kr.contract) : null;
  const pvtBlock = s.pvtIntake?.contract ? [
    ...describePvtContract(s.pvtIntake.contract),
    ['Read at', `${g(s.pvtIntake.pressure_psia, 5)} psia (${s.pvtIntake.pressure_from})`],
  ] : null;

  return {
    identification,
    displayUnits: u.line(),
    headline: { head: ['Quantity', 'Value', 'Unit', 'Basis'], rows: headline },
    split,
    mobility,
    inputs: { rows: inputs, note: inputsNote },
    forecastTable,
    surveillance,
    hall,
    layeredTable,
    model,
    basis,
    limits,
    krBlock,
    pvtBlock,
    mc: s.mcSummary ? { summary: s.mcSummary, state: mcState } : null,
    notes: text(id.notes),
    footerWho: [text(id.field), text(id.pattern)].filter(Boolean).join(', '),
    u,
  };
}
