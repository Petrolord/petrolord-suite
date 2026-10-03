/**
 * The model of the SCAL Studio report (SCAL-U1; reviewer lens RL1 to RL12).
 * One object for the Report tab and the PDF: identification, headline
 * results, every input with its unit and source, the components of the
 * Leverett scaling, the sample pedigree, the fits, the model, the basis,
 * the limits, the tables and the kr-1 block. Built from what the studio
 * already derived (the same objects the screen shows); nothing here calls
 * the engine except to evaluate the working curves at a stated point.
 *
 * Pure.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { inputRow, sourceText } from '@/lib/inputProvenance/wording';
import { isStated } from '@/lib/inputProvenance/model';
import { makeJFunction, LEVERETT_C, PSI_PER_FT_WATER } from '@/utils/scalCalculations';
import { KPA_PER_PSI, M_PER_FT } from '@/lib/units/registry';
import { scalUnits } from './units.js';
import {
  IDENTIFICATION_FIELDS, identificationOf, pedigreeOf, optionLabel, SAMPLE_NOTE,
} from './model.js';
import { OW_NORMALISATION, GO_NORMALISATION, J_DEFINITION, HEIGHT_DEFINITION } from './krHandoff.js';
import { crossoverSw, heightAtSwFt } from './series.js';
import { resolveFwl } from './fwlDatum.js';

export const REPORT_TITLE = 'Special Core Analysis Report';
export const APP_NAME = 'Petrolord SCAL Studio';
export const ANALYSIS_TYPE = 'Corey relative permeability and Leverett J capillary pressure (two-phase)';

const text = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
const n = (v) => {
  if (v === '' || v == null) return NaN;
  const x = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(x) ? x : NaN;
};
const f = (v, d) => (Number.isFinite(v) ? Number(v).toFixed(d) : EMPTY_VALUE);
const g = (v, s = 4) => (Number.isFinite(v) ? String(parseFloat(Number(v).toPrecision(s))) : EMPTY_VALUE);
const thousands = (v, d = 0) => (Number.isFinite(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : EMPTY_VALUE);

/** The default starting values of the app (an untouched one prints as an assumption). */
export const STARTING_VALUES = Object.freeze({
  ow: { Swc: '0.2', Sor: '0.25', krwMax: '0.35', kroMax: '0.9', nw: '2.5', no: '2.0' },
  go: { Swc: '0.2', Sgc: '0.05', Sorg: '0.15', krgMax: '0.6', krogMax: '0.85', ng: '2.0', nog: '2.5' },
  jManual: { a: '0.25', b: '1.4', Swirr: '0.15' },
  reservoir: { k_md: '150', phi: '0.22', sigma_dyncm: '26', thetaDeg: '30' },
  height: { gammaW: '1.05', gammaHc: '0.80' },
  mu: { muW: '0.5', muO: '5.0' },
});

const untouched = (values, start) => Object.entries(start).every(([k, v]) => String(values?.[k]) === v);

/** The source words of an input group: what the app knows first, then the user's statement, then the starting-value note. */
function groupSource(meta, auto, isStart) {
  if (auto) return sourceText(meta, auto);
  if (isStated(meta)) return sourceText(meta);
  return isStart ? SAMPLE_NOTE : sourceText(meta);
}

function identificationPairs(s, { projectName, organizationName, build }) {
  const id = identificationOf(s);
  const pairs = [['Project', text(projectName) || EMPTY_VALUE]];
  for (const [key, label] of IDENTIFICATION_FIELDS) {
    let v = text(id[key]);
    if (key === 'company' && !v) v = text(organizationName);
    pairs.push([label, v || EMPTY_VALUE]);
  }
  const names = (s.samples || []).map((x) => x.name).filter(Boolean);
  pairs.splice(7, 0, ['Core samples', names.length ? names.join(', ') : EMPTY_VALUE]);
  pairs.push(['Analysis type', ANALYSIS_TYPE]);
  pairs.push(['Software build', text(build) || EMPTY_VALUE]);
  return pairs;
}

function depthText(sample, u) {
  const d = n(sample.depth_ft);
  if (!Number.isFinite(d)) return EMPTY_VALUE;
  const ref = pedigreeOf(sample).depthRef;
  return `${thousands(u.show('length', d), 1)} ${u.label('length')} ${ref || '(reference not stated)'}`;
}

/** Leverett scaling as components (RL2): sigma cos theta, sqrt(k/phi), the Pc/J factor, the height gradient. */
function scalingComponents(s, u) {
  const r = s.reservoir?.props;
  if (!r) return null;
  const sc = r.sigma_dyncm * Math.cos((r.thetaDeg * Math.PI) / 180);
  const root = Math.sqrt(r.k_md / r.phi);
  const factor = sc / (LEVERETT_C * root);
  const gw = n(s.height?.gammaW);
  const gh = n(s.height?.gammaHc);
  const grad = PSI_PER_FT_WATER * (gw - gh);
  const jSpec = s.jResolved?.jSpec;
  const j05 = jSpec ? makeJFunction(jSpec).j(0.5) : NaN;
  const pc05 = j05 * factor;
  const h05 = Number.isFinite(grad) && grad > 0 ? pc05 / grad : NaN;
  const pcUnit = u.label('pc');
  const rows = [
    ['sigma cos theta (reservoir)', `${g(r.sigma_dyncm)} x cos(${g(r.thetaDeg)} deg)`, g(u.show('ift', sc), 5), u.label('ift')],
    ['sqrt(k / phi)', `sqrt(${g(r.k_md)} / ${g(r.phi)})`, g(root, 5), 'sqrt(md)'],
    ['Pc per unit J', `sigma cos theta / (${LEVERETT_C} sqrt(k / phi)), in psi then converted`, g(u.show('pc', factor), 5), pcUnit],
    ['J at Sw = 0.5 (working curve)', jSpec ? `${g(jSpec.a)} x ((0.5 - ${g(jSpec.Swirr)}) / (1 - ${g(jSpec.Swirr)}))^(-${g(jSpec.b)})` : EMPTY_VALUE, g(j05, 5), ''],
    ['Pc at Sw = 0.5', 'J x Pc per unit J', g(u.show('pc', pc05), 5), pcUnit],
    ['Pressure gradient difference', `${PSI_PER_FT_WATER} psi/ft x (${g(gw)} - ${g(gh)})`, Number.isFinite(grad) ? g(u.system === 'si' ? grad * (KPA_PER_PSI / M_PER_FT) : grad, 5) : EMPTY_VALUE, u.system === 'si' ? 'kPa/m' : 'psi/ft'],
    ['Height above FWL at Sw = 0.5', 'Pc / gradient difference', g(u.show('length', h05), 5), u.label('length')],
  ];
  return {
    head: ['Component', 'How', 'Value', 'Unit'],
    rows,
    values: { sc, root, factor, j05, pc05, grad, h05 },
    note: `Closure: Pc at Sw 0.5 = J x Pc per unit J, and height = Pc / gradient difference, to the printed digits. Leverett constant ${LEVERETT_C} (Pc psi, sigma dyn/cm, k md).`,
  };
}

function inputsBlock(s, u) {
  const meta = s.inputMeta || {};
  const rows = [];
  const owStart = untouched(s.curves?.ow, STARTING_VALUES.ow);
  const owAuto = s.owStatus?.kind === 'fitted' || s.owStatus?.kind === 'edited-after-fit' ? s.owStatus.text : null;
  const OW = [['Swc', 'Connate water saturation Swc'], ['Sor', 'Residual oil saturation Sor'], ['krwMax', 'krw at Sor (end point)'], ['kroMax', 'kro at Swc (end point)'], ['nw', 'Water Corey exponent nw'], ['no', 'Oil Corey exponent no']];
  const unitOf = (k) => (/^n/.test(k) ? '' : 'fraction'); // Corey exponents are dimensionless
  for (const [k, label] of OW) {
    rows.push({ ...inputRow({ key: `ow.${k}`, label: `Oil-water: ${label}`, value: s.ow?.params ? g(s.ow.params[k]) : text(s.curves?.ow?.[k]), unit: unitOf(k), meta: meta.ow, auto: owAuto }), engineKeys: [`ow.${k}`] });
  }
  if (!owAuto) for (const r of rows) r.source = groupSource(meta.ow, null, owStart);
  const goStart = untouched(s.curves?.go, STARTING_VALUES.go);
  const GO = [['Swc', 'Connate water saturation Swc'], ['Sgc', 'Critical gas saturation Sgc'], ['Sorg', 'Residual oil to gas Sorg'], ['krgMax', 'krg end point'], ['krogMax', 'krog at Swc (end point)'], ['ng', 'Gas Corey exponent ng'], ['nog', 'Oil Corey exponent nog']];
  for (const [k, label] of GO) {
    const r = inputRow({ key: `go.${k}`, label: `Gas-oil: ${label}`, value: s.go?.params ? g(s.go.params[k]) : text(s.curves?.go?.[k]), unit: unitOf(k), meta: meta.go });
    r.source = groupSource(meta.go, null, goStart);
    rows.push({ ...r, engineKeys: [`go.${k}`] });
  }
  const jMode = s.capillary?.jMode;
  if (jMode === 'samples') {
    const meta2 = s.jResolved?.meta;
    const names = (s.samples || []).filter((x) => (s.capillary?.includedSampleIds || []).includes(x.id)).map((x) => `"${x.name}"`).join(', ');
    const auto = `Computed: geometric mean of the lab J of ${names || 'no sample'}, refitted as a power law`;
    const spec = s.jResolved?.jSpec;
    rows.push({ ...inputRow({ key: 'j.a', label: 'Leverett J: a (J at Sw* = 1)', value: spec ? g(spec.a) : '', unit: '', auto }), engineKeys: ['j.a'] });
    rows.push({ ...inputRow({ key: 'j.b', label: 'Leverett J: b (exponent)', value: spec ? g(spec.b) : '', unit: '', auto }), engineKeys: ['j.b'] });
    const swAuto = meta2?.swirr?.from === 'override' ? 'Entered as the shared Swirr override' : 'Computed: lowest Sw of the included samples less 0.02';
    rows.push({ ...inputRow({ key: 'j.Swirr', label: 'Leverett J: Swirr (shared by all samples)', value: spec ? g(spec.Swirr) : '', unit: 'fraction', auto: swAuto }), engineKeys: ['j.Swirr'] });
  } else {
    const jStart = untouched(s.capillary?.manual, STARTING_VALUES.jManual);
    for (const [k, label, unit] of [['a', 'Leverett J: a (J at Sw* = 1)', ''], ['b', 'Leverett J: b (exponent)', ''], ['Swirr', 'Leverett J: Swirr', 'fraction']]) {
      const r = inputRow({ key: `j.${k}`, label, value: text(s.capillary?.manual?.[k]), unit, meta: meta.jManual });
      r.source = groupSource(meta.jManual, null, jStart);
      rows.push({ ...r, engineKeys: [`j.${k}`] });
    }
  }
  const res = s.capillary?.reservoir || {};
  const resStart = (k) => String(res[k]) === STARTING_VALUES.reservoir[k];
  const RES = [
    ['k_md', 'Reservoir permeability k', 'permeability', 'k_md'],
    ['phi', 'Reservoir porosity', 'fraction', 'phi'],
    ['sigma_dyncm', 'Interfacial tension at reservoir conditions', 'ift', 'sigma'],
    ['thetaDeg', 'Contact angle at reservoir conditions', 'angle', 'theta'],
  ];
  for (const [k, label, kind, mk] of RES) {
    const v = n(res[k]);
    const r = inputRow({ key: `reservoir.${k}`, label, value: Number.isFinite(v) ? g(u.show(kind, v), 6) : '', unit: u.label(kind) === 'frac' ? 'fraction' : u.label(kind), meta: meta[mk] });
    if (r.source !== 'Not provided') r.source = groupSource(meta[mk], null, resStart(k));
    rows.push({ ...r, engineKeys: [`reservoir.${k}`] });
  }
  const h = s.height || {};
  for (const [k, label, mk] of [['gammaW', 'Water specific gravity', 'gammaW'], ['gammaHc', 'Hydrocarbon specific gravity', 'gammaHc']]) {
    const r = inputRow({ key: `height.${k}`, label, value: text(h[k]), unit: 'water = 1', meta: meta[mk] });
    if (r.source !== 'Not provided') r.source = groupSource(meta[mk], null, String(h[k]) === STARTING_VALUES.height[k]);
    rows.push({ ...r, engineKeys: [`height.${k}`] });
  }
  const fwl = n(h.fwl_tvdss);
  const fr = resolveFwl(h);
  const fwlRow = inputRow({ key: 'height.fwl_tvdss', label: 'Free water level (TVDSS, positive down)', value: Number.isFinite(fwl) ? thousands(u.show('length', fwl), 1) : '', unit: u.label('length'), meta: meta.fwl, auto: fr.entry === 'tvd' && fr.fwlFt != null ? fr.text : null });
  rows.push({ ...fwlRow, engineKeys: ['height.fwl_tvdss'] });
  for (const [k, label] of [['swMin', 'Sw window of the curves: minimum'], ['swMax', 'Sw window of the curves: maximum']]) {
    rows.push({ ...inputRow({ key: `height.${k}`, label, value: text(h[k]), unit: 'fraction', auto: 'Entered: the saturation span the Pc and height tables cover' }), engineKeys: [`height.${k}`] });
  }
  if (s.curves?.fwPreviewOn) {
    const mStart = untouched(s.curves, STARTING_VALUES.mu);
    for (const [k, label] of [['muW', 'Water viscosity (fw preview and Waterflood handoff)'], ['muO', 'Oil viscosity (fw preview and Waterflood handoff)']]) {
      const r = inputRow({ key: k, label, value: text(s.curves[k]), unit: u.label('viscosity'), meta: meta.mu });
      r.source = groupSource(meta.mu, null, mStart);
      rows.push({ ...r, engineKeys: [k] });
    }
  }
  return {
    rows,
    note: 'Every input the curves, the J scaling and the height conversion read, with its unit and where it came from. Saturations are fractions of pore volume. The sample properties and lab tables are in the sample tables below. The viscosities enter only the fractional flow preview and the Waterflood handoff.',
  };
}

/** The object the engine paths of the report read, for the completeness guard (RL1). */
export function engineInputOf(s) {
  const out = {
    ow: { ...(s.ow?.params || {}) },
    go: { ...(s.go?.params || {}) },
    j: s.jResolved?.jSpec ? { a: s.jResolved.jSpec.a, b: s.jResolved.jSpec.b, Swirr: s.jResolved.jSpec.Swirr } : {},
    reservoir: { ...(s.reservoir?.props || {}) },
    height: { gammaW: n(s.height?.gammaW), gammaHc: n(s.height?.gammaHc), fwl_tvdss: n(s.height?.fwl_tvdss), swMin: n(s.height?.swMin), swMax: n(s.height?.swMax) },
  };
  if (s.curves?.fwPreviewOn) { out.muW = n(s.curves.muW); out.muO = n(s.curves.muO); }
  return out;
}

function samplesTables(s, u) {
  const samples = s.samplesDerived || s.samples || [];
  if (!samples.length) return null;
  const props = samples.map((x) => {
    const sc = n(x.sigma_dyncm) * Math.cos((n(x.thetaDeg) * Math.PI) / 180);
    return [
      x.name, depthText(x, u), g(n(x.k_md)), g(n(x.phi)), g(u.show('ift', n(x.sigma_dyncm))), g(n(x.thetaDeg)), g(u.show('ift', sc), 5),
      text(x.fluids) || EMPTY_VALUE, String(x.krRows?.length || 0), String(x.pcRows?.length || 0),
    ];
  });
  const pedigree = samples.map((x) => {
    const p = pedigreeOf(x);
    const t = n(p.testTempF);
    return [
      x.name,
      p.origin === 'analog' ? `Analog${p.analogNote ? `: ${p.analogNote}` : ''}` : optionLabel('origin', p.origin),
      `${optionLabel('krMethod', p.krMethod)}; ${optionLabel('process', p.krProcess)}`,
      `${optionLabel('pcMethod', p.pcMethod)}; ${optionLabel('process', p.pcProcess)}`,
      optionLabel('wettability', p.wettability),
      optionLabel('condition', p.condition),
      Number.isFinite(t) ? `${g(u.show('temperature', t), 5)} ${u.label('temperature')}` : EMPTY_VALUE,
      [p.laboratory, p.labReport].filter(Boolean).join(', ') || EMPTY_VALUE,
    ];
  });
  const fits = samples.filter((x) => (x.krRows?.length || 0) > 0).map((x) => {
    const fit = x.krFit;
    if (!fit) return [x.name, `${x.krRows.length}`, EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE, x.krFitError || 'No fit'];
    const ci = (pair) => (Array.isArray(pair) && pair.every(Number.isFinite) ? `${f(pair[0], 2)} to ${f(pair[1], 2)}` : EMPTY_VALUE);
    return [
      x.name,
      `${fit.pointsUsed} of ${x.krRows.length * 2}`,
      `${f(fit.params.Swc, 3)} / ${f(fit.params.Sor, 3)}`,
      `${f(fit.params.krwMax, 4)} / ${f(fit.params.kroMax, 4)}`,
      `${f(fit.params.nw, 2)} (${ci(fit.ci95?.nw)})`,
      `${f(fit.params.no, 2)} (${ci(fit.ci95?.no)})`,
      f(fit.rmsLog, 4),
      f(fit.r2Log, 4),
      fit.converged ? `Converged in ${fit.iterations} iterations` : `Stopped at the iteration cap (${fit.iterations}); approximate`,
    ];
  });
  // RL5: what was imported and what was left out, per sample and table
  const imp = (rec, n) => (rec ? `${rec.file || 'file'}: ${rec.read} read, ${rec.skippedCount ?? (rec.skipped || []).length} left out${rec.units?.pc ? `; Pc in ${rec.units.pc} (${rec.units.pcHow})` : ''}; Sw as ${rec.units?.saturation || 'fraction'}` : (n ? `${n} rows, entered or saved before the import record` : EMPTY_VALUE));
  const imports = samples.map((x) => [x.name, imp(x.krImport, x.krRows?.length || 0), imp(x.pcImport, x.pcRows?.length || 0)]);
  return {
    imports: { head: ['Sample', 'kr table', 'Pc table'], rows: imports, note: 'Rows left out at the door are listed on the Lab Data tab with the reason for each.' },
    props: { head: ['Sample', 'Depth', 'k (md)', 'Porosity', `Lab IFT (${u.label('ift')})`, 'Angle (deg)', `sigma cos theta (${u.label('ift')})`, 'Lab fluids', 'kr points', 'Pc points'], rows: props },
    pedigree: { head: ['Sample', 'Lab or analog', 'kr test', 'Pc test', 'Wettability', 'Core condition', 'Test temperature', 'Laboratory, report'], rows: pedigree },
    fits: fits.length ? {
      head: ['Sample', 'kr points used', 'Swc / Sor', 'krw(Sor) / kro(Swc)', 'nw (95% CI)', 'no (95% CI)', 'RMS log10 kr', 'r2 log10 kr', 'Regression'],
      rows: fits,
      note: 'Levenberg-Marquardt on log10 kr of both curves at once. Swc and Sor are the first and last Sw of the lab table and the end point kr its end rows; only the exponents are fitted. Points with kr at or below 1e-4 are left out (log of a definitional zero). Points used counts both curves.',
    } : null,
  };
}

function jSection(s) {
  const meta = s.jResolved?.meta;
  const spec = s.jResolved?.jSpec;
  if (!spec) return { text: s.jResolved?.error || 'No working J curve.', table: null };
  if (meta?.mode !== 'samples') {
    return { text: `Typed power law J = ${g(spec.a)} Sw*^(-${g(spec.b)}), Swirr ${g(spec.Swirr)}. Not fitted to lab data in this project.`, table: null };
  }
  const fit = meta.avg?.fit;
  const included = (s.samplesDerived || []).filter((x) => (s.capillary?.includedSampleIds || []).includes(x.id));
  const all = (s.samplesDerived || []).filter((x) => (x.pcRows?.length || 0) > 0);
  const rows = all.map((x) => {
    const sws = (x.jRows || []).map((r) => r.Sw);
    return [x.name, included.some((i) => i.id === x.id) ? 'Included' : 'Left out by the user', String(x.pcRows.length), String((x.jRows || []).length), sws.length ? `${f(Math.min(...sws), 3)} to ${f(Math.max(...sws), 3)}` : EMPTY_VALUE, x.jError || ''];
  });
  const ci = fit?.ci95?.b;
  return {
    text: `Geometric mean of the lab J of ${included.length} sample${included.length === 1 ? '' : 's'} on a ${meta.avg?.grid?.length || 0}-point normalised grid, refitted as J = a Sw*^(-b): a ${g(spec.a)}, b ${g(spec.b)}${Array.isArray(ci) && ci.every(Number.isFinite) ? ` (95% CI ${f(ci[0], 3)} to ${f(ci[1], 3)})` : ''}, r2 ${f(fit?.r2Log, 4)} in log space. One Swirr, ${g(spec.Swirr)} (${meta.swirr?.from === 'override' ? 'entered' : 'the lowest Sw of the included samples less 0.02'}), normalises every sample and maps the fit back to true Sw.`,
    table: { head: ['Sample', 'Used', 'Pc points', 'J points', 'Sw range', 'Note'], rows },
  };
}

function limitsBlock(s, u) {
  const assumptions = [
    'Corey power-law curves only: one exponent per phase over the whole mobile range. A lab curve that bends away from a power law (common near the end points) is smoothed by the fit.',
    'Two-phase only. The gas-oil set is at connate water; there is no three-phase model (no Stone I or II, no Baker), so a three-phase kro is not given.',
    'No hysteresis. Drainage and imbibition curves are not told apart by the model; the sample tables say which process each lab test was, where it was stated.',
    'One Leverett J curve for the reservoir. The J function assumes the rocks share a pore geometry; samples that do not collapse onto one curve belong to different rock types and should not be averaged.',
    'The power-law J tends to infinity at Swirr; Pc and height are given only over the stated Sw window.',
    'The height conversion uses constant fluid specific gravities and the fresh water gradient 0.4335 psi/ft; the free water level is where Pc is zero, which is not the oil-water contact when the threshold pressure is not zero.',
    'No end-point scaling with depth, permeability or rock type, and no Leverett J by facies. The fw preview neglects gravity and capillary pressure and is for mobility context only.',
  ];
  const ranges = {
    head: ['Item', 'Range the app accepts', 'Why'],
    rows: [
      ['Corey exponents nw, no, ng, nog', '0.5 to 8', 'Validation bounds of the engine and of the fit'],
      ['Saturations and end point kr', '0 to 1, with a mobile span above zero', 'Fractions of pore volume'],
      ['Contact angle', '0 to below 90 deg', 'A water-wet capillary pressure (cos theta above zero)'],
      ['Leverett J, Pc to J', 'Any positive Pc and k, porosity in (0, 1)', `C = ${LEVERETT_C}, the published field-unit constant`],
    ],
  };
  const flags = [];
  const samples = s.samplesDerived || [];
  for (const x of samples) {
    const p = pedigreeOf(x);
    if ((x.krRows?.length || 0) > 0 && !p.krProcess) flags.push(`Sample "${x.name}": the kr test is not stated as drainage or imbibition.`);
    if ((x.pcRows?.length || 0) > 0 && !p.pcProcess) flags.push(`Sample "${x.name}": the Pc test is not stated as drainage or imbibition.`);
    if (!p.origin) flags.push(`Sample "${x.name}": not stated as a lab measurement or an analog.`);
    if (p.origin === 'analog') flags.push(`Sample "${x.name}" is an analog${p.analogNote ? ` (${p.analogNote})` : ''}, not a measurement on this field's core.`);
    const fit = x.krFit;
    if (fit) {
      for (const k of ['nw', 'no']) if (fit.params[k] <= 0.5 + 1e-6 || fit.params[k] >= 8 - 1e-6) flags.push(`Sample "${x.name}": the fitted ${k} sits on its bound (${f(fit.params[k], 2)}); the data do not settle it.`);
      if (fit.r2Log < 0.95) flags.push(`Sample "${x.name}": the Corey fit explains little of the data (r2 ${f(fit.r2Log, 3)} in log space).`);
      if (!fit.converged) flags.push(`Sample "${x.name}": the Corey fit stopped at the iteration cap.`);
    }
  }
  if (s.owStatus?.kind === 'edited-after-fit') flags.push(`The working oil-water set was edited after it was fitted (${s.owStatus.edited.join(', ')}); the fit statistics do not describe it.`);
  const fitJ = s.jResolved?.meta?.avg?.fit;
  if (fitJ && fitJ.r2Log < 0.98) flags.push(`The averaged J refit is poor (r2 ${f(fitJ.r2Log, 3)}): the samples may not share one rock type, or the shared Swirr needs setting.`);
  const spec = s.jResolved?.jSpec;
  const swMin = n(s.height?.swMin);
  if (s.jResolved?.meta?.mode === 'samples' && Number.isFinite(swMin)) {
    const inc = samples.filter((x) => (s.capillary?.includedSampleIds || []).includes(x.id)).flatMap((x) => (x.jRows || []).map((r) => r.Sw));
    if (inc.length && swMin < Math.min(...inc)) flags.push(`The Pc and height tables start at Sw ${g(swMin)}, below the lowest lab Sw (${g(Math.min(...inc))}): that part of the curve is extrapolated.`);
  }
  if (spec && Number.isFinite(swMin) && swMin <= spec.Swirr) flags.push(`The Sw window starts at or below Swirr (${g(spec.Swirr)}), where the power-law J has no finite value.`);
  if (!Number.isFinite(n(s.height?.fwl_tvdss))) flags.push('No free water level is entered: heights are above the FWL only, with no depth.');
  return { assumptions, ranges, flags, noFlagsText: 'Nothing was flagged.' };
}

function headlineRows(s, u) {
  const rows = [];
  const p = s.ow?.params;
  if (p) {
    rows.push(['Oil-water: Swc / Sor', `${g(p.Swc)} / ${g(p.Sor)}`, 'fraction', s.owStatus?.text || 'Entered by the user']);
    rows.push(['Oil-water: krw(Sor) / kro(Swc)', `${g(p.krwMax)} / ${g(p.kroMax)}`, 'fraction', 'End points']);
    rows.push(['Oil-water: nw / no', `${g(p.nw)} / ${g(p.no)}`, '', 'Corey exponents']);
    rows.push(['Mobile saturation span', f(1 - p.Swc - p.Sor, 3), 'fraction', '1 - Swc - Sor']);
    rows.push(['Crossover Sw (krw = kro)', f(crossoverSw(p), 3), 'fraction', 'Solved on the working curves']);
    if (s.curves?.fwPreviewOn) {
      const muW = n(s.curves.muW); const muO = n(s.curves.muO);
      const M = (p.krwMax / muW) / (p.kroMax / muO);
      rows.push(['End point mobility ratio M', f(M, 3), '', `(krw(Sor) / muw) / (kro(Swc) / muo), muw ${g(muW)}, muo ${g(muO)} ${u.label('viscosity')}`]);
    }
  }
  const q = s.go?.params;
  if (q) rows.push(['Gas-oil: Sgc / Sorg / ng / nog', `${g(q.Sgc)} / ${g(q.Sorg)} / ${g(q.ng)} / ${g(q.nog)}`, '', 'Entered by the user']);
  const spec = s.jResolved?.jSpec;
  if (spec) rows.push(['Leverett J: a / b / Swirr', `${g(spec.a)} / ${g(spec.b)} / ${g(spec.Swirr)}`, '', s.jResolved.meta?.mode === 'samples' ? `Averaged from ${s.jResolved.meta.sampleCount} samples` : 'Typed power law']);
  const comp = scalingComponents(s, u);
  if (comp) {
    rows.push(['Pc at Sw = 0.5 (reservoir)', g(u.show('pc', comp.values.pc05), 4), u.label('pc'), 'Working J scaled to reservoir rock and fluids']);
    const h05 = heightAtSwFt({ jSpec: spec, reservoir: s.reservoir, height: s.height, Sw: 0.5 });
    rows.push(['Height above FWL at Sw = 0.5', f(u.show('length', h05), 1), u.label('length'), 'Pc / gradient difference']);
  }
  const fwl = n(s.height?.fwl_tvdss);
  rows.push(['Free water level', Number.isFinite(fwl) ? thousands(u.show('length', fwl), 1) : EMPTY_VALUE, Number.isFinite(fwl) ? `${u.label('length')} TVDSS` : '', Number.isFinite(fwl) ? 'Entered' : 'Not entered']);
  return { head: ['Quantity', 'Value', 'Unit', 'Basis'], rows };
}

/** Every 4th row of a table plus the last, for a printed table that a page holds. */
const thin = (rows, step) => rows.filter((_, i) => i % step === 0 || i === rows.length - 1);

/**
 * @param {object} s the studio state (context value: curves, ow, go, owStatus, samples, samplesDerived,
 *   capillary, jResolved, reservoir, height, heightProfile, inputMeta, identification, contract)
 * @param {{projectName?: string, organizationName?: string, build?: string, system?: string}} ctx
 */
export function buildScalReportModel(s, { projectName = '', organizationName = '', build = '', system = 'oilfield' } = {}) {
  if (!s) return null;
  const u = scalUnits(system);
  const id = identificationOf(s);
  const owRows = s.ow?.params ? (s.owTable || []) : [];
  const owTable = (s.contract?.oil_water?.table || owRows).map((r) => [f(r.Sw, 4), f(r.krw, 5), f(r.kro, 5)]);
  const goTable = (s.contract?.gas_oil?.table || []).map((r) => [f(r.Sg, 4), f(r.krg, 5), f(r.krog, 5)]);
  const fwl = n(s.height?.fwl_tvdss);
  const hp = s.heightProfile || [];
  const pcTable = thin(hp, 4).map((r) => [f(r.Sw, 4), f(u.show('pc', r.Pc_psi), 4), f(u.show('length', r.h_ft), 2), Number.isFinite(fwl) ? thousands(u.show('length', fwl - r.h_ft), 1) : EMPTY_VALUE]);
  const samples = samplesTables(s, u);
  return {
    title: REPORT_TITLE,
    appName: APP_NAME,
    system: u.system,
    displayUnits: u.line(),
    identification: identificationPairs(s, { projectName, organizationName, build }),
    footerWho: [text(id.well) ? `Well ${id.well}` : '', text(id.field) ? `Field ${id.field}` : ''].filter(Boolean).join(', '),
    headline: { ...headlineRows(s, u), note: 'Values as the screen shows them, from the same derived state. Saturations are fractions of pore volume.' },
    inputs: inputsBlock(s, u),
    engineInput: engineInputOf(s),
    scaling: scalingComponents(s, u),
    samples,
    jSection: jSection(s),
    model: [
      ['Oil-water curves', `Corey. ${OW_NORMALISATION}`],
      ['Source of the oil-water set', s.owStatus?.text || 'Entered by the user'],
      ['Gas-oil curves', `Corey. ${GO_NORMALISATION}`],
      ['Source of the gas-oil set', 'Entered by the user (gas-oil sets are not fitted in this app)'],
      ['Leverett J', J_DEFINITION],
      ['Capillary pressure at reservoir conditions', 'Pc = J sigma cos(theta) / (0.21645 sqrt(k / phi)) with the reservoir k, porosity, IFT and contact angle'],
      ['Saturation height', HEIGHT_DEFINITION],
    ],
    basis: [
      ['Saturations', 'Fractions of pore volume'],
      ['Relative permeability', 'Fractions; the base permeability is the one the laboratory used, not converted here'],
      ['Capillary pressure', `${u.label('pc')}; a pressure difference, neither gauge nor absolute`],
      ['Interfacial tension', `${u.label('ift')} (dyn/cm and mN/m are numerically equal)`],
      ['Depths', `${u.label('length')} TVDSS: true vertical depth below the vertical datum, positive down. ${resolveFwl(s.height).basis}`],
      ['Heights', `${u.label('length')} above the free water level, where Pc is zero`],
      ['Sample depths', 'As entered, with the reference stated per sample (MD, TVD or TVDSS)'],
      ['Units of this report', u.line()],
    ],
    limits: limitsBlock(s, u),
    tables: {
      ow: owTable.length ? { title: 'Oil-water relative permeability table (working Corey set)', head: ['Sw', 'krw', 'kro'], rows: owTable } : null,
      go: goTable.length ? { title: 'Gas-oil relative permeability table (working Corey set)', head: ['Sg', 'krg', 'krog'], rows: goTable } : null,
      pc: pcTable.length ? { title: 'Capillary pressure and saturation height', head: ['Sw', u.head('Pc', 'pc'), u.head('Height above FWL', 'length'), u.head('TVDSS', 'length')], rows: pcTable, note: `Every 4th row of the ${hp.length}-row profile the screen draws, and its last row. TVDSS is the FWL less the height.` } : null,
    },
    notes: text(s.notes),
  };
}

/** Rows of the Report tab's source controls, with how many still print as the starting values. */
export function startingValueGroups(s) {
  const meta = s.inputMeta || {};
  const out = [];
  if (untouched(s.curves?.ow, STARTING_VALUES.ow) && !isStated(meta.ow) && s.owStatus?.kind !== 'fitted') out.push('ow');
  if (untouched(s.curves?.go, STARTING_VALUES.go) && !isStated(meta.go)) out.push('go');
  if (s.capillary?.jMode !== 'samples' && untouched(s.capillary?.manual, STARTING_VALUES.jManual) && !isStated(meta.jManual)) out.push('jManual');
  for (const [k, mk] of [['k_md', 'k_md'], ['phi', 'phi'], ['sigma_dyncm', 'sigma'], ['thetaDeg', 'theta']]) {
    if (String(s.capillary?.reservoir?.[k]) === STARTING_VALUES.reservoir[k] && !isStated(meta[mk])) out.push(mk);
  }
  return out;
}
