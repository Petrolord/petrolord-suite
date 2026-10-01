// The prognosis a reviewer can sign (AppUpgrade PP-U1-008, PL7). The app
// had only a CSV with the method in a comment line: no well, field,
// analyst, build, datum or calibration, so a drilling engineer receiving
// it could not say which well, which datum or which trend it was. The PDF
// carries the reviewer block and the prognosis table in the display units
// with EMW in ppg against the stated datum; the CSV header carries the
// same block. Every line is Latin-1 so jsPDF's standard fonts print it.

import { buildLabel } from '@/lib/platformBuild';
import { drawBrandHeader } from '@/lib/pdfBrand';
import {
  depthToDisplay, pressureToDisplay, pressureDigits, emwPpg, emwReferenceDepthM, emwDatumLabel, isEmw,
} from './units';
import { calibrationMisfit } from './honesty';

export const latin1 = (t) => String(t ?? '')
  .replace(/[‒-―−]/g, '-')
  .replace(/[•·]/g, '|')
  .replace(/[^\n\x20-\x7e\xa0-\xff]/g, '?');

const r1 = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)).toLocaleString('en-US') : 'n/a');

/**
 * Reviewer lines.
 * @param {{wellName?: string, source?: 'well'|'seismic', sourceName?: string, report?: {field?, analyst?},
 *   params: object, units: {pressure, depth}, input: object, result: object, calibration?: Array,
 *   nctFitted?: boolean, window?: object, now?: Date, build?: string}} p
 */
export function reviewerLines(p) {
  const {
    wellName = '', source = 'well', sourceName = '', report = {}, params, units, input, result, calibration = [],
    nctFitted = false, window = null, casing = null, now = new Date(), build = buildLabel(),
  } = p;
  const zU = units.depth;
  const z = (m) => `${r1(depthToDisplay(m, zU), zU === 'ft' ? 0 : 1)} ${zU}`;
  const field = String(report.field || '').trim() || 'not given';
  const analyst = String(report.analyst || '').trim() || 'not given';
  const ml = Number(params.mudlineMdM) || 0;
  const wd = Number(params.waterDepthM) || 0;
  const lines = [
    `Well: ${source === 'well' ? (wellName || 'not given') : `velocity trend ${sourceName} (trend-grade, no local anomaly)`} | Field: ${field} | Analyst: ${analyst} | Date: ${now.toISOString().slice(0, 10)} | ${build}`,
    `Units: depth ${zU}, pressure ${units.pressure}${isEmw(units.pressure) ? ' (EMW)' : ''}; engine SI (Pa, m). EMW datum: ${emwDatumLabel(params)}; ppg = psi / (0.052 x TVD ft)`,
    `Depth reference: depth below mudline = ${input?.tvdFrom === 'survey' ? 'TVD from the deviation survey' : 'MD (vertical well)'} minus the mudline; water depth ${z(wd)}; mudline MD ${ml > 0 ? `${z(ml)} below RKB (air gap ${z(Math.max(0, ml - wd))})` : 'not set (log MD read as depth below mudline)'}`,
    params.method === 'eaton'
      ? `Method: Eaton sonic, n = ${params.eatonN}; fracture: K = nu/(1-nu), nu = ${params.nu}`
      : `Method: Bowers ${params.bowers?.U != null ? `unloading, U = ${params.bowers.U}` : 'loading'}, A = ${params.bowers?.A}, B = ${params.bowers?.B} (ft/s, psi); fracture: K = nu/(1-nu), nu = ${params.nu}`,
    `NCT: dt = dt_ma + (dt_ml - dt_ma) exp(-c z), dt_ml ${r1(params.nct.dtMlUsPerM, 2)} us/m, dt_ma ${r1(params.nct.dtMaUsPerM, 2)} us/m, c ${Number(params.nct.cPerM).toExponential(3)} 1/m; ${nctFitted ? 'fitted on this source' : 'NOT fitted on this source (project or default values)'}`,
  ];
  if (Array.isArray(result?.rhoSource) && result.rhoSource.length) {
    const nLog = result.rhoSource.filter((s) => s === 'log').length;
    const pct = Math.round((100 * nLog) / result.rhoSource.length);
    lines.push(`Overburden: density integration; ${nLog === result.rhoSource.length ? 'density log throughout' : nLog === 0 ? 'no density log, Gardner from velocity throughout' : `density log on ${pct}% of samples, Gardner from velocity on the rest`}`);
  }
  const mis = calibrationMisfit(calibration, input?.zBmlM || [], result?.porePressurePa || []);
  if (!mis.points.length) lines.push('Calibration: none (no measured pressures entered); the prognosis is uncalibrated');
  else {
    lines.push(`Calibration: ${mis.points.length} point${mis.points.length === 1 ? '' : 's'} (${mis.points.map((c) => `${z(c.z)} bml ${r1(c.measuredMpa, 2)} MPa`).join('; ')}); PP misfit RMS ${Number.isFinite(mis.rmsMpa) ? `${r1(mis.rmsMpa, 2)} MPa` : 'n/a'}${mis.deepestM != null ? `; below ${z(mis.deepestM)} bml the prognosis is extrapolated` : ''}`);
  }
  if (window?.narrowest) {
    lines.push(`Drilling window: narrowest ${window.narrowest.windowPpg.toFixed(2)} ppg (PP ${window.narrowest.ppPpg.toFixed(2)}, FG ${window.narrowest.fgPpg.toFixed(2)} ppg EMW) at ${z(window.narrowest.zBmlM)} bml${window.maxPp ? `; highest PP ${window.maxPp.ppPpg.toFixed(2)} ppg at ${z(window.maxPp.zBmlM)} bml` : ''}`);
  }
  // U2-003: the margins and the bottom-up casing seats
  if (casing && !casing.error) {
    const seats = casing.seats.length
      ? casing.seats.map((s, k) => `shoe ${k + 1} at least ${z(s.zBmlM)} bml (${s.mudBelowPpg.toFixed(2)} ppg below)`).join('; ')
      : 'none needed above TD';
    lines.push(`Casing seats (bottom-up from TD, below ${z(casing.fromBmlM)} bml; trip margin ${casing.tripPpg.toFixed(2)} ppg, kick margin ${casing.kickPpg.toFixed(2)} ppg): ${seats}${casing.closedAtBmlM != null ? `; window closed by the margins at ${z(casing.closedAtBmlM)} bml` : ''}`);
  }
  return lines.map(latin1);
}

/** Rows of the prognosis table every `everyM` metres (display units). */
export function reportRows({ input, result, params, units, everyM }) {
  const zU = units.depth; const pU = units.pressure;
  const step = everyM || (zU === 'ft' ? 500 * 0.3048 : 250);
  const rows = [];
  let next = 0;
  for (let i = 0; i < input.zBmlM.length; i++) {
    const zb = input.zBmlM[i];
    if (zb + 1e-6 < next && i !== input.zBmlM.length - 1) continue;
    next = (Math.floor(zb / step) + 1) * step;
    const ref = emwReferenceDepthM(zb, params);
    const f = (pa) => { const v = pressureToDisplay(pa, pU, ref); return Number.isFinite(v) ? v.toFixed(pressureDigits(pU)) : 'n/a'; };
    const g = (pa) => { const v = emwPpg(pa, ref); return Number.isFinite(v) ? v.toFixed(2) : 'n/a'; };
    rows.push([
      r1(depthToDisplay(zb, zU), zU === 'ft' ? 0 : 1), r1(depthToDisplay(ref, zU), zU === 'ft' ? 0 : 1),
      f(result.overburdenPa[i]), f(result.hydrostaticPa[i]), f(result.porePressurePa[i]), f(result.fracPressurePa[i]),
      g(result.porePressurePa[i]), g(result.fracPressurePa[i]),
    ]);
  }
  return rows;
}

/**
 * The PDF document (not saved: the caller saves or reads its bytes).
 * @param {Function} JsPDF the jsPDF constructor
 */
export function prognosisPdf(JsPDF, args, { logo = null } = {}) {
  const { units, params } = args;
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  drawBrandHeader(doc, {
    logo, margin, pageWidth: pageW, appTitle: 'Pore Pressure Studio', subtitle: 'Pore pressure and fracture gradient prognosis',
    rightLines: [latin1(args.wellName || args.sourceName || '')],
  });
  let y = 38;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8);
  for (const line of reviewerLines(args)) {
    const wrapped = doc.splitTextToSize(line, pageW - 2 * margin);
    doc.text(wrapped, margin, y);
    y += 4 * wrapped.length;
  }
  y += 3;
  const datum = emwDatumLabel(params);
  const head = [`Depth bml (${units.depth})`, `Below ${datum} (${units.depth})`, `OBG (${units.pressure})`, `Ph (${units.pressure})`, `PP (${units.pressure})`, `FG (${units.pressure})`, 'PP (ppg)', 'FG (ppg)'].map(latin1);
  const colW = (pageW - 2 * margin) / head.length;
  const drawHead = () => {
    doc.setFont('helvetica', 'bold');
    head.forEach((h, k) => doc.text(h, margin + colW * (k + 1) - 1, y, { align: 'right' }));
    doc.setFont('helvetica', 'normal');
    y += 4.5;
  };
  drawHead();
  for (const row of reportRows(args)) {
    if (y > pageH - 14) { doc.addPage(); y = 16; drawHead(); }
    row.forEach((c, k) => doc.text(String(c), margin + colW * (k + 1) - 1, y, { align: 'right' }));
    y += 4;
  }
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(latin1('Pressures are gauge, from the sea surface (water column) and the pore fluid column below the mudline.'), margin, pageH - 8);
  return doc;
}
