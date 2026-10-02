/**
 * Well Test Analysis Studio PDF report (WT5; RTA and display units WT10;
 * header round 2026-09-28; reviewer round 2026-10-02).
 *
 * jsPDF + autotable, the stack of the other Suite report exports. Pure
 * formatting: every number, every table row and every plotted point comes
 * in already computed by the studio context (collectReportArgs gathers
 * them); nothing is recalculated here. Values print in the active display
 * system through the studio's unit registry. Text is Latin-1 only (jsPDF
 * standard fonts): phi, mu, sqrt(t), never the symbols.
 *
 * The 2026-10-02 round added what a reviewer signs against: the well and
 * test identification, the reservoir and fluid inputs with their sources,
 * the skin split for a partially penetrating well, the flow and shut-in
 * summary, a cross-check of the methods, and the plots (test overview,
 * log-log with the model and the regime windows, Horner or MDH with its
 * line and window, sqrt(t) when linear flow is in play, history match, RTA
 * plots when that section has data), drawn as vectors on the house chart
 * standard by welltest/pdfPlot.
 */
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { unitLabel, fromOilfield, kindForCatalogUnit } from '@/utils/welltest/units';
import { gaugeTime, PWF_SOURCE_TEXT } from '@/utils/welltest/gaugeImport';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import {
  buildIdentificationRows, skinBreakdownRows, flowSummaryHead, flowSummaryBody, inputsFootnote, orNA,
} from '@/utils/welltest/reportModel';
import { buildReportFigures } from '@/utils/welltest/reportFigures';
import { drawPlot, pdfText } from '@/utils/welltest/pdfPlot';

const NAVY = [15, 23, 42];
const SLATE = [100, 116, 139];
const LEFT = 14;
const RIGHT = 196;
const WIDTH = RIGHT - LEFT;
const PAGE_BOTTOM = 280;

// three significant figures; from 1,000 up written out in full rather than
// toPrecision's "3.80e+3" (the screen's fmt.sig3, WTA-T1-003)
const sig3 = (v) => {
  if (!Number.isFinite(v)) return EMPTY_VALUE;
  const r = Number(Number(v).toPrecision(3));
  return Math.abs(r) >= 1000 && Math.abs(r) < 1e15 ? r.toLocaleString('en-US') : Number(v).toPrecision(3);
};
const f1 = (v) => (Number.isFinite(v) ? Number(v).toFixed(1) : EMPTY_VALUE);
const f2 = (v) => (Number.isFinite(v) ? Number(v).toFixed(2) : EMPTY_VALUE);
const sci = (v) => (Number.isFinite(v) ? Number(v).toExponential(3) : EMPTY_VALUE);
const ci = (pair) =>
  Array.isArray(pair) && pair.every(Number.isFinite)
    ? `${Number(pair[0]).toPrecision(3)} to ${Number(pair[1]).toPrecision(3)}`
    : EMPTY_VALUE;

/**
 * Report header rows as [label, value, label, value] pairs: the well and
 * test identification (well, field, licence, zone, perforations in MD and
 * TVD, test dates and type, analyst), then the fluid, the producing time
 * and, for a buildup or falloff, the pressure at shut-in with the time it
 * refers to (dt = 0 hr, and the gauge-clock time). Missing values print as
 * EMPTY_VALUE.
 */
export const buildReportHeader = ({
  projectName, wellName, fieldName, analyst, identification, completion, config, prepared, isGas,
  unitSystem = 'oilfield', generatedAt = new Date(),
}) => {
  const isBuildup = config?.family === 'buildup';
  const pUnit = unitLabel('pressure', unitSystem);
  const pwf = prepared?.pwfShutIn;
  const cells = buildIdentificationRows({
    projectName, wellName, fieldName, analyst, identification, completion, config, unitSystem,
  });
  cells.push(['Fluid', isGas ? 'Gas, pseudo-pressure m(p)' : 'Oil']);
  if (isBuildup) {
    cells.push([config?.mirror ? 'Injection time tp' : 'Producing time tp', `${f1(config?.tp)} hr`]);
    cells.push(['Shut-in time', `0 hr elapsed (gauge clock ${gaugeTime(prepared?.testStartTime)} hr)`]);
    cells.push([
      config?.mirror ? 'pwi at shut-in' : 'pwf at shut-in',
      Number.isFinite(pwf)
        ? `${f1(fromOilfield('pressure', pwf, unitSystem))} ${pUnit} at shut-in time 0 hr (${PWF_SOURCE_TEXT[prepared?.pwfSource?.kind] || 'from data'})`
        : EMPTY_VALUE,
    ]);
  } else {
    cells.push(['Start of flow', `0 hr elapsed (gauge clock ${gaugeTime(prepared?.testStartTime)} hr)`]);
  }
  cells.push(['Display units', unitSystem === 'si' ? 'SI / metric' : 'Oilfield']);
  cells.push(['Generated', `${generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`]);
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push([...cells[i], ...(cells[i + 1] || ['', ''])].map(pdfText));
  }
  return rows;
};

/**
 * k and skin by each method the studio ran, side by side, so a reviewer
 * sees whether they agree. [method, k, skin, basis].
 */
export const buildCrossCheckRows = ({
  model, matchParams, matchMethodKind, fitResult, semilogResult, multiRateResult, isBuildup, isGas, skinWithheld,
}) => {
  const rows = [];
  const skin = (v) => (skinWithheld ? 'withheld' : f2(v));
  if (model && matchParams) {
    rows.push([
      `Model match, ${model.label}`,
      sig3(matchParams.k), skin(matchParams.skin),
      matchMethodKind === 'regression'
        ? `Regression on pressure and derivative${fitResult?.converged ? ', converged' : ', stopped early'}`
        : 'Manual match',
    ]);
  }
  if (semilogResult) {
    rows.push([
      isBuildup ? 'Horner straight line' : 'MDH straight line',
      sig3(semilogResult.k), skin(semilogResult.skin),
      `Semilog slope, r2 ${f2(semilogResult.r2)}${isGas ? ', pseudo-pressure' : ''}`,
    ]);
  }
  if (multiRateResult) {
    rows.push(['Multi-rate superposition (Odeh-Jones)', sig3(multiRateResult.k), skin(multiRateResult.skin), `Rate-normalized, r2 ${f2(multiRateResult.r2)}`]);
  }
  return rows;
};

/** What the PDF needs from the studio context, gathered in one place. */
export const collectReportArgs = (ctx) => ({
  projectName: ctx.projectName,
  wellName: ctx.wellName,
  fieldName: ctx.fieldName,
  analyst: ctx.analyst,
  identification: ctx.identification,
  completion: ctx.completion,
  config: ctx.configSpec?.config,
  reservoir: ctx.reservoirSpec?.reservoir,
  prepared: ctx.prepared,
  model: ctx.model,
  // the untouched default match is not an interpretation (WTA-T1-002)
  matchParams: ctx.derivedKpis?.source === 'match' ? ctx.matchParams : null,
  // regression status and CIs only while the match IS the auto-fit
  fitResult: ctx.matchMethod?.kind === 'regression' ? ctx.fitResult : null,
  matchMethodKind: ctx.matchMethod?.kind || 'none',
  derivedKpis: ctx.derivedKpis,
  semilogResult: ctx.semilogResult,
  sqrtResult: ctx.sqrtMeaningful ? ctx.sqrtResult : null,
  pssResult: ctx.pssResult,
  multiRateResult: ctx.multiRateResult,
  deliverabilityResult: ctx.deliverabilityResult,
  rtaResult: ctx.rtaResult,
  regimes: ctx.regimes,
  notes: ctx.notes,
  unitSystem: ctx.unitSystem,
  // reviewer round: the report model rows and the figures, as the screen has them
  inputsTable: ctx.inputsTable,
  skinBreakdown: ctx.skinBreakdown,
  flowSummary: ctx.flowSummary,
  figures: buildReportFigures(ctx),
});

/**
 * Build the report document.
 * @param {object} a collectReportArgs(ctx)
 * @param {{logo?: ?{dataUrl: string, w: number, h: number}, generatedAt?: Date}} [opts]
 * @returns {{doc: object, figures: Array<{id: string, number: number, page: number,
 *   plotted: boolean, panels: Array}>, pages: number}}
 */
export const buildWellTestPdf = (a, { logo = null, generatedAt = new Date() } = {}) => {
  const {
    projectName, wellName, fieldName, analyst, identification, completion, config, reservoir, prepared,
    model, matchParams, fitResult, matchMethodKind, derivedKpis,
    semilogResult, sqrtResult, pssResult, multiRateResult, deliverabilityResult,
    rtaResult, regimes, notes, unitSystem = 'oilfield',
    inputsTable = [], skinBreakdown = null, flowSummary = null, figures = [],
  } = a;
  const doc = new jsPDF();
  const isGas = reservoir?.fluid === 'gas';
  const isBuildup = config?.family === 'buildup';
  const u = (kind, v) => fromOilfield(kind, v, unitSystem);
  const uL = (kind) => pdfText(unitLabel(kind, unitSystem));
  const dpKind = isGas ? 'pseudoPressure' : 'pressure';
  const dpUnit = uL(dpKind);
  const rateKind = isGas ? 'gasRate' : 'oilRate';
  let y = 20;

  const ensure = (height) => {
    if (y + height > PAGE_BOTTOM) { doc.addPage(); y = 20; }
  };
  const heading = (text, need = 24) => {
    ensure(need);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text(pdfText(text), LEFT, y);
  };
  const paragraph = (text, { size = 8, color = SLATE, gap = 3 } = {}) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfText(text), WIDTH);
    const lineH = size * 0.42;
    ensure(lines.length * lineH + gap);
    doc.text(lines, LEFT, y);
    y += lines.length * lineH + gap;
  };
  const table = (title, head, body, { columnStyles, note } = {}) => {
    if (!body.length) return;
    // keep a table with its heading and note on one page when it can fit on one
    const need = 12 + (body.length + 1) * 7.3 + (note ? 10 : 0);
    heading(title, need <= PAGE_BOTTOM - 20 ? need : 24);
    doc.autoTable({
      startY: y + 2,
      head: [head.map(pdfText)],
      body: body.map((row) => row.map(pdfText)),
      theme: 'grid',
      styles: { fontSize: 8, overflow: 'linebreak' },
      headStyles: { fillColor: NAVY },
      columnStyles,
      margin: { left: LEFT, right: LEFT },
    });
    y = doc.lastAutoTable.finalY + (note ? 4 : 8);
    if (note) { paragraph(note, { gap: 5 }); }
  };

  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text('Well Test Analysis Report', LEFT, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text('Petrolord Well Test Analysis Studio', LEFT, y);
  y += 3;

  // Header block: who, where, which interval, which test, and the pressure
  // at shut-in with the time it refers to.
  const header = buildReportHeader({
    projectName, wellName, fieldName, analyst, identification, completion, config, prepared, isGas, unitSystem, generatedAt,
  });
  doc.autoTable({
    startY: y,
    body: header,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1, textColor: SLATE },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: NAVY, cellWidth: 30 },
      1: { cellWidth: 61 },
      2: { fontStyle: 'bold', textColor: NAVY, cellWidth: 30 },
      3: { cellWidth: 61 },
    },
    margin: { left: LEFT, right: LEFT },
  });
  y = doc.lastAutoTable.finalY + 2;
  doc.setDrawColor(...SLATE);
  doc.line(LEFT, y, RIGHT, y);
  y += 6;

  const skinValue = prepared?.skinWithheld ? 'withheld' : f2(derivedKpis?.skin);
  table('Headline results', ['Quantity', 'Value'], [
    ['Permeability k (md)', sig3(derivedKpis?.k)],
    ['kh (md-ft)', sig3(derivedKpis?.kh)],
    [isGas ? "Apparent skin s'" : 'Skin factor (total)', skinValue],
    [`Pressure drop across skin (${uL('pressure')})`, f1(u('pressure', derivedKpis?.dpSkin))],
    ['Flow efficiency', Number.isFinite(derivedKpis?.flowEfficiency) ? `${(derivedKpis.flowEfficiency * 100).toFixed(0)}%` : EMPTY_VALUE],
    [`Radius of investigation (${uL('length')})`, f1(u('length', derivedKpis?.ri))],
    ['Analysis points', String(prepared?.points?.length ?? 0)],
    ['Headline values from', derivedKpis?.source === 'match' ? 'The working model match' : derivedKpis?.source === 'semilog' ? 'The semilog straight line (no model matched yet)' : EMPTY_VALUE],
  ]);

  // Skin split for a partially penetrating well (reviewer round, item 3)
  if (skinBreakdown) {
    const sbRows = skinBreakdownRows(skinBreakdown, unitSystem);
    const lines = [];
    if (skinBreakdown.status === 'ok' || skinBreakdown.status === 'full') {
      lines.push(`${skinBreakdown.method}: ${skinBreakdown.formula}, with hpD = hp/h, rD = (rw/h) sqrt(kv/kh), h1D = h1/h, A = 1/(h1D + hpD/4), B = 1/(h1D + 3 hpD/4).`);
      if (skinBreakdown.splitFormula) lines.push(`Mechanical skin: ${skinBreakdown.splitFormula}.`);
    }
    if (skinBreakdown.message) lines.push(skinBreakdown.message);
    table('Skin components', ['Component', 'Value', 'Basis'], sbRows, {
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 26 } },
      note: lines.join(' '),
    });
  }

  if (model && matchParams) {
    table(
      `Model match: ${model.label}${fitResult ? (fitResult.converged ? ' (regression converged)' : ' (regression stopped early)') : ' (manual match)'}`,
      ['Parameter', 'Value', '95% confidence'],
      model.parameters.map((meta) => {
        const kind = kindForCatalogUnit(meta.unit);
        const uv = (v) => u(kind, v);
        const pair = fitResult?.confidence95?.[meta.key];
        return [
          `${meta.label} (${unitLabel(kind, unitSystem) || meta.unit})`,
          meta.logScale ? sig3(uv(matchParams[meta.key])) : f2(uv(matchParams[meta.key])),
          fitResult ? ci(Array.isArray(pair) ? pair.map(uv) : pair) : EMPTY_VALUE,
        ];
      }),
      {
        note: fitResult
          ? `Levenberg-Marquardt regression on pressure and Bourdet derivative in log space: ${fitResult.iterations} iterations, residual sum of squares ${sci(fitResult.ssr)}. The intervals are 95% confidence from the fit covariance.`
          : 'Manual match: no regression was run on these values, so no confidence intervals are given.',
      },
    );
  }

  const straight = [];
  if (semilogResult) {
    straight.push([isBuildup ? 'Horner slope m' : 'MDH slope m', `${isGas ? sci(u(dpKind, semilogResult.m)) : f1(u(dpKind, semilogResult.m))} ${dpUnit}/cycle`]);
    straight.push(['Semilog k (md)', sig3(semilogResult.k)]);
    straight.push(['Semilog skin', prepared?.skinWithheld ? 'withheld' : f2(semilogResult.skin)]);
    if (isBuildup && Number.isFinite(semilogResult.pStar)) straight.push([`Extrapolated p* (${uL('pressure')})`, f1(u('pressure', semilogResult.pStar))]);
    straight.push(['Semilog fit r2', f2(semilogResult.r2)]);
    if (Number.isFinite(semilogResult.windowMin)) straight.push(['Semilog fit window (hr)', `${sig3(semilogResult.windowMin)} to ${sig3(semilogResult.windowMax)}`]);
  }
  if (sqrtResult) straight.push(['sqrt(t) slope', `${f2(u(dpKind, sqrtResult.slope))} ${dpUnit}/hr^0.5`]);
  if (pssResult) {
    straight.push(unitSystem === 'si'
      ? ['Connected pore volume (MM m3)', f2(u('poreVolume', pssResult.poreVolumeMMbbl))]
      : ['Connected pore volume (MMbbl)', f2(pssResult.poreVolumeMMbbl)]);
  }
  if (multiRateResult) {
    straight.push(['Multi-rate k, Odeh-Jones (md)', sig3(multiRateResult.k)]);
    straight.push(['Multi-rate skin', f2(multiRateResult.skin)]);
  }
  table('Straight-line analyses', ['Analysis', 'Result'], straight);

  const cross = buildCrossCheckRows({
    model, matchParams, matchMethodKind, fitResult, semilogResult, multiRateResult, isBuildup, isGas, skinWithheld: !!prepared?.skinWithheld,
  });
  if (cross.length) {
    table('Cross-check of methods', ['Method', 'k (md)', 'Skin', 'Basis'], cross, {
      note: cross.length > 1
        ? 'Independent routes to the same permeability and skin. Agreement supports the interpretation; a spread points at the window or the model.'
        : 'Only one method has produced a result so far.',
    });
  }

  if (regimes?.length) {
    table('Flow regimes observed', ['Regime', 'From (hr)', 'To (hr)', 'Span (log cycles)'],
      regimes.map((r) => [r.label, sig3(r.xStart), sig3(r.xEnd), f1(r.spanDecades)]),
      { note: `Detected on the Bourdet derivative; times are ${isBuildup ? 'Agarwal equivalent time' : 'elapsed time'}.` });
  } else {
    heading('Flow regimes observed', 14);
    y += 5;
    paragraph('No sustained flow regime was detected on the derivative.', { gap: 6 });
  }

  // Reviewer round, items 1 and 2: every input with its unit and its source
  if (inputsTable.length) {
    table('Reservoir and fluid inputs', ['Input', 'Value', 'Unit', 'Source and quality'],
      inputsTable.map((r) => [r.label, r.value, r.unit, r.source]),
      {
        columnStyles: { 0: { cellWidth: 56 }, 1: { cellWidth: 28 }, 2: { cellWidth: 22 } },
        note: inputsFootnote(isGas),
      });
  }

  // Item 5: one row per flow or shut-in period
  if (flowSummary) {
    if (flowSummary.rows.length) {
      table('Flow and shut-in summary', flowSummaryHead(flowSummary, unitSystem), flowSummaryBody(flowSummary), {
        note: `${flowSummary.note} Volume is the rate held over the period; recovered volume and choke are as entered.`,
      });
    } else {
      heading('Flow and shut-in summary', 14);
      y += 5;
      paragraph(flowSummary.note, { gap: 6 });
    }
  }

  if (deliverabilityResult) {
    const rows = [];
    if (deliverabilityResult.backPressure) {
      rows.push([`AOF, back-pressure (${uL('gasRate')})`, sig3(u('gasRate', deliverabilityResult.backPressure.aof))]);
      rows.push(['Exponent n', f2(deliverabilityResult.backPressure.n)]);
      rows.push(['Coefficient C', sci(deliverabilityResult.backPressure.C)]);
    }
    if (deliverabilityResult.lit) {
      rows.push([`AOF, LIT / Houpeurt (${uL('gasRate')})`, sig3(u('gasRate', deliverabilityResult.lit.aof))]);
      rows.push(['Laminar coefficient a', sci(deliverabilityResult.lit.a)]);
      rows.push(['Turbulent coefficient b', sci(deliverabilityResult.lit.b)]);
    }
    table(`Gas deliverability (${deliverabilityResult.method})`, ['Quantity', 'Value'], rows);
  }

  if (rtaResult?.fmb) {
    const rows = [];
    if (rtaResult.isGas) {
      rows.push(unitSystem === 'si'
        ? ['OGIP G, dynamic material balance (10^9 m3)', sig3((rtaResult.fmb.G * 28.3168466) / 1e9)]
        : ['OGIP G, dynamic material balance (Bcf)', sig3(rtaResult.fmb.G / 1e6)]);
    } else {
      rows.push(unitSystem === 'si'
        ? ['OOIP N, flowing material balance (MM m3)', sig3((rtaResult.fmb.N * 0.158987294928) / 1e6)]
        : ['OOIP N, flowing material balance (MMSTB)', sig3(rtaResult.fmb.N / 1e6)]);
    }
    rows.push([`Productivity index J (${uL(rateKind)} per ${rtaResult.isGas ? dpUnit : uL('pressure')})`, sig3(rtaResult.fmb.J)]);
    rows.push(['FMB fit r2', f2(rtaResult.fmb.r2)]);
    rows.push(['Production points', String(rtaResult.rows?.length ?? 0)]);
    if (rtaResult.linear) {
      rows.push(unitSystem === 'si'
        ? ['Transient linear xf sqrt(k) (m sqrt(md))', sig3(rtaResult.linear.xfSqrtK * 0.3048)]
        : ['Transient linear xf sqrt(k) (ft sqrt(md))', sig3(rtaResult.linear.xfSqrtK)]);
    }
    table('Rate transient analysis (production data)', ['Quantity', 'Value'], rows);
  }

  if (notes) {
    heading('Interpretation notes', 20);
    y += 6;
    paragraph(notes, { size: 9, color: [60, 60, 60], gap: 8 });
  }

  // ---- Figures (reviewer round, items 6 to 11) ----
  const drawn = [];
  if (figures.length) {
    doc.addPage();
    y = 20;
    heading('Plots', 12);
    y += 6;
    for (const fig of figures) {
      const title = `Figure ${fig.number}. ${fig.title}`;
      if (!fig.panels?.length) {
        ensure(16);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...NAVY);
        doc.text(pdfText(title), LEFT, y);
        y += 4.5;
        paragraph(fig.statement || 'Not plotted.', { gap: 6 });
        drawn.push({ id: fig.id, number: fig.number, page: doc.getNumberOfPages(), plotted: false, panels: [] });
        continue;
      }
      doc.setFontSize(8);
      const captionLines = doc.splitTextToSize(pdfText(fig.caption || ''), WIDTH);
      const total = fig.panels.reduce((sum, p) => sum + p.height + 3, 0) + 6 + captionLines.length * 3.4 + 6;
      ensure(total);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...NAVY);
      doc.text(pdfText(title), LEFT, y);
      y += 3;
      const panels = [];
      for (const panel of fig.panels) {
        const box = { x: LEFT, y, w: WIDTH, h: panel.height };
        panels.push({ box, ...drawPlot(doc, box, { ...panel.spec, logo }) });
        y += panel.height + 3;
      }
      y += 1;
      paragraph(fig.caption || '', { gap: 7 });
      drawn.push({ id: fig.id, number: fig.number, page: doc.getNumberOfPages(), plotted: true, panels });
    }
  }

  // page footer: who the report is for, and the page count
  const pages = doc.getNumberOfPages();
  const who = [orNA(wellName) === EMPTY_VALUE ? null : `Well ${wellName}`, fieldName ? `Field ${fieldName}` : null].filter(Boolean).join(', ');
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(pdfText(`Well Test Analysis Report${who ? `, ${who}` : ''}`), LEFT, 290);
    doc.text(`Page ${i} of ${pages}`, RIGHT, 290, { align: 'right' });
  }
  return { doc, figures: drawn, pages };
};

export const reportFileName = ({ projectName, wellName }) => {
  const fileBase = (projectName || wellName || 'well-test').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
  return `WTA_Report_${fileBase || 'well_test'}.pdf`;
};

/**
 * Build and save the interpretation report. The Petrolord mark for the
 * plots is loaded first; the report still builds without it.
 * @returns {Promise<boolean>} success
 */
export const exportWellTestPdf = async (args) => {
  try {
    const logo = await loadPetrolordLogo();
    const { doc } = buildWellTestPdf(args, { logo });
    doc.save(reportFileName(args));
    return true;
  } catch (e) {
    console.error('Well test PDF export failed:', e);
    return false;
  }
};
