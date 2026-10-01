// The basin model report a reviewer can sign (AppUpgrade BF-U1-016, PL7).
// The old PDF was titled with the retired app name, printed "Untitled" for
// every model, carried no well, field, analyst, build, units, heat flow,
// erosion or calibration, claimed plots it never included, and threw when
// no run existed. This one carries the reviewer block, every input that
// changes the answer, the present-day table in the display units and the
// notes the screen shows (a result computed from other inputs says so).
// Every line is Latin-1 so jsPDF's standard fonts print it.

import { buildLabel } from '@/lib/platformBuild';
import { drawBrandHeader } from '@/lib/pdfBrand';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { depthToDisplay, tempToDisplay, tempDeltaToDisplay } from './units';
import { finalDepthProfile, eventsChartRows } from './resultsView';
import { presentDayHeatFlow } from './history';
import { getThermalProps } from './ThermalPropertiesLibrary';
import { getCompactionParams } from './CompactionModelLibrary';
import { CalibrationCalculator } from './CalibrationCalculator';
import { TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';

export const latin1 = (t) => String(t ?? '')
  .replace(/[‒-―−]/g, '-')
  .replace(/[•·]/g, '|')
  .replace(/²/g, '2').replace(/³/g, '3')
  .replace(/[^\n\x20-\x7e\xa0-\xff]/g, '?');

const f = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)).toLocaleString('en-US') : EMPTY_VALUE);

/** Ro and temperature misfit of a result against the calibration points (SI). */
export function calibrationSummary(results, calibration) {
  const prof = finalDepthProfile(results);
  const ro = calibration?.ro || []; const temp = calibration?.temp || [];
  if (!prof.length) return { n: ro.length + temp.length, roRms: NaN, tRms: NaN, run: false, nRo: ro.length, nT: temp.length };
  const depths = prof.map((p) => p.depth);
  const mRo = CalibrationCalculator.interpolateToMeasured(depths, prof.map((p) => p.ro), ro.map((p) => p.depth));
  const mT = CalibrationCalculator.interpolateToMeasured(depths, prof.map((p) => p.temp), temp.map((p) => p.depth));
  return {
    n: ro.length + temp.length, nRo: ro.length, nT: temp.length, run: true,
    roRms: ro.length ? CalibrationCalculator.calculateRMS(ro.map((p) => p.value), mRo) : NaN,
    tRms: temp.length ? CalibrationCalculator.calculateRMS(temp.map((p) => p.value), mT) : NaN,
  };
}

/**
 * Reviewer lines.
 * @param {{ modelName?: string, state: object, results?: object, units: {depth, temp}, report?: {field?, analyst?},
 *   notes?: Array<{text: string}>, stale?: {stale: boolean, text: string}|null, now?: Date, build?: string }} p
 */
export function reviewerLines(p) {
  const { modelName = '', state, results = null, units, report = {}, notes = [], stale = null, now = new Date(), build = buildLabel() } = p;
  const zU = units.depth; const tU = units.temp;
  const z = (m) => `${f(depthToDisplay(m, zU), zU === 'ft' ? 0 : 1)} ${zU}`;
  const field = String(report.field || '').trim() || 'not given';
  const analyst = String(report.analyst || '').trim() || 'not given';
  const st = state?.settings || {};
  const hf = state?.heatFlow || {};
  const lines = [
    `Model: ${modelName || 'not named'} | Well: ${st.registryWellName || 'not tied to a registry well'} | Field: ${field} | Analyst: ${analyst} | Date: ${now.toISOString().slice(0, 10)} | ${build}`,
    `Units: depth ${zU}, temperature ${tU}; engine SI (m, C, Ma, mW/m2). Ages: ${st.timescale || (st.fromStratigraphyStudio ? 'ICS 2023/09 (sent before chart versions travelled)' : 'as typed')}; current chart ${TIMESCALE_VERSION}`,
    'Engine: 1D forward model; Athy (Sclater and Christie) decompaction, elastic (porosity follows present burial, no maximum-burial memory); implicit conduction on cells up to 100 m; Easy%Ro (Sweeney and Burnham 1990); kerogen transformation by parallel Arrhenius reactions; 1 Ma steps ending at 0 Ma',
    hf.type === 'variable'
      ? `Basal heat flow: history ${(hf.history || []).slice().sort((a, b) => b.age - a.age).map((q) => `${q.age} Ma ${q.value}`).join(', ')} mW/m2 (present ${f(presentDayHeatFlow(hf), 1)})`
      : `Basal heat flow: constant ${f(Number(hf.value), 1)} mW/m2`,
    `Surface temperature: ${f(tempToDisplay(Number.isFinite(Number(st.surfaceTemp)) ? Number(st.surfaceTemp) : 20, tU), 1)} ${tU}`,
  ];
  const ero = state?.erosionEvents || [];
  lines.push(ero.length
    ? `Erosion: ${ero.map((e) => `${e.surface ? `${e.surface} ` : ''}${e.age} Ma ${Number(e.amount) > 0 ? `${z(Number(e.amount))} removed` : 'amount unknown, NOT modelled'}`).join('; ')}`
    : 'Erosion: none (the section is modelled as continuously preserved)');
  const cal = calibrationSummary(results, state?.calibration);
  if (!cal.n) lines.push('Calibration: none (no measured Ro or temperature); the model is uncalibrated');
  else if (!cal.run) lines.push(`Calibration: ${cal.nRo} Ro and ${cal.nT} temperature points; no run to compare`);
  else lines.push(`Calibration: ${cal.nRo} Ro point${cal.nRo === 1 ? '' : 's'}${cal.nRo ? `, RMS ${f(cal.roRms, 3)} %Ro` : ''}; ${cal.nT} temperature point${cal.nT === 1 ? '' : 's'}${cal.nT ? `, RMS ${f(tempDeltaToDisplay(cal.tRms, tU), 1)} ${tU}` : ''}`);
  if (!results?.data) lines.push('Result: no run');
  else lines.push(stale?.stale ? `Result: ${stale.text}` : `Result: computed ${results.runOf?.at ? new Date(results.runOf.at).toISOString().replace('T', ' ').slice(0, 16) : ''} from the inputs above`);
  for (const n of notes) lines.push(`Note: ${n.text}`);
  return lines.map(latin1);
}

/** Stratigraphy rows in the display units, youngest first. */
export function inputRows(state, units) {
  const zU = units.depth;
  return (state?.stratigraphy || []).map((l) => {
    const t = { ...getThermalProps(l.lithology), ...(l.thermal || {}) };
    const c = { ...getCompactionParams(l.lithology), ...(l.compaction || {}) };
    const sr = l.sourceRock?.isSource ? `TOC ${l.sourceRock.toc}, HI ${l.sourceRock.hi}, ${typeof l.sourceRock.kerogen === 'string' ? l.sourceRock.kerogen : 'custom'}` : '';
    return [l.name, `${l.ageStart} - ${l.ageEnd}${l.agesGuessed ? ' (placeholder)' : ''}`, f(depthToDisplay(Number(l.thickness), zU), zU === 'ft' ? 0 : 1), l.lithology,
      f(Number(t.conductivity), 2), f(Number(c.phi0), 2), f(Number(c.c) * 1000, 2), sr].map(latin1);
  });
}

/** Present-day rows (shallow to deep) in the display units. */
export function presentRows(results, units) {
  const zU = units.depth; const tU = units.temp;
  const tr = new Map((results?.meta?.layers || []).map((l, i) => [l.name, results.data.transformation?.[i]]));
  return finalDepthProfile(results).map((r) => {
    const s = tr.get(r.name); const last = s && s.length ? s[s.length - 1].value : null;
    return [r.name, f(depthToDisplay(r.top, zU), zU === 'ft' ? 0 : 1), f(depthToDisplay(r.bottom, zU), zU === 'ft' ? 0 : 1),
      f(tempToDisplay(r.temp, tU), 1), r.ro.toFixed(3), last > 0 ? `${(100 * last).toFixed(1)} %` : EMPTY_VALUE].map(latin1);
  });
}

function table(doc, { head, rows, y, margin, pageW, pageH, widths }) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = (pageW - 2 * margin) / total;
  const xs = []; let x = margin;
  for (const w of widths) { xs.push(x); x += w * scale; }
  const draw = (cells, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    let h = 1;
    const wrapped = cells.map((c, k) => { const w = doc.splitTextToSize(String(c), widths[k] * scale - 1.5); h = Math.max(h, w.length); return w; });
    if (y + 4 * h > pageH - 12) { doc.addPage(); y = 16; }
    wrapped.forEach((w, k) => doc.text(w, xs[k], y));
    y += 4 * h;
  };
  draw(head.map(latin1), true);
  for (const r of rows) draw(r, false);
  doc.setFont('helvetica', 'normal');
  return y;
}

/** The PDF document (not saved). @param {Function} JsPDF the jsPDF constructor */
export function basinReportPdf(JsPDF, args, { logo = null } = {}) {
  const { units, results } = args;
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  drawBrandHeader(doc, { logo, margin, pageWidth: pageW, appTitle: 'Basin & Charge Modeling', subtitle: '1D burial, thermal, maturity and charge history', rightLines: [latin1(args.modelName || '')] });
  let y = 38;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8);
  for (const line of reviewerLines(args)) {
    const w = doc.splitTextToSize(line, pageW - 2 * margin);
    if (y + 4 * w.length > pageH - 12) { doc.addPage(); y = 16; }
    doc.text(w, margin, y);
    y += 4 * w.length;
  }
  y += 3;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Stratigraphy (youngest first)', margin, y); y += 5; doc.setFontSize(7.5);
  y = table(doc, { head: ['Layer', 'Ages (Ma)', `Thickness (${units.depth})`, 'Lithology', 'k (W/m K)', 'Phi0', 'c (1/km)', 'Source rock'], rows: inputRows(args.state, units), y, margin, pageW, pageH, widths: [26, 18, 14, 14, 11, 9, 11, 30] });
  y += 4;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  if (y > pageH - 30) { doc.addPage(); y = 16; }
  doc.text('Present day by layer', margin, y); y += 5; doc.setFontSize(7.5);
  if (results?.data) {
    y = table(doc, { head: ['Layer', `Top (${units.depth})`, `Base (${units.depth})`, `Temperature (${units.temp})`, 'Ro (%)', 'Transformation'], rows: presentRows(results, units), y, margin, pageW, pageH, widths: [30, 16, 16, 18, 12, 16] });
    const flat = (k) => results.data[k].flat().map((e) => e.value);
    const { criticalMoment } = eventsChartRows(results);
    y += 3;
    doc.text(latin1(`Maximum temperature ${f(tempToDisplay(Math.max(...flat('temperature')), units.temp), 1)} ${units.temp}; maximum Ro ${Math.max(...flat('maturity')).toFixed(2)} %; ${criticalMoment != null ? `critical moment (peak expulsion) ${criticalMoment} Ma` : 'no expulsion modelled'}. Maturity windows: oil 0.55 to 1.3, wet gas 1.3 to 2.0, dry gas above 2.0 %Ro.`), margin, y, { maxWidth: pageW - 2 * margin });
  } else {
    doc.text('No run: simulate the model to report its present-day state.', margin, y);
  }
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(latin1('Depths below the model surface; Ro by Easy%Ro at each layer centre; transformation of the source kerogen. Trap formation and migration are not modelled (1D).'), margin, pageH - 8);
  return doc;
}
