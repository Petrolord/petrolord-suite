/**
 * Well Test Analysis Studio PDF report (WT5, extended WT10 with the RTA
 * section and the display unit system). jsPDF + autotable, same stack as
 * the other Suite report exports. Pure formatting: every number comes in
 * already computed by the studio context; nothing is recomputed here.
 * Values print in the active display system through the WT8 registry.
 */
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { unitLabel, fromOilfield, kindForCatalogUnit } from '@/utils/welltest/units';

const NAVY = [15, 23, 42];
const SLATE = [100, 116, 139];

const sig3 = (v) => (Number.isFinite(v) ? Number(v).toPrecision(3) : '-');
const f1 = (v) => (Number.isFinite(v) ? Number(v).toFixed(1) : '-');
const f2 = (v) => (Number.isFinite(v) ? Number(v).toFixed(2) : '-');
const sci = (v) => (Number.isFinite(v) ? Number(v).toExponential(3) : '-');
const ci = (pair) =>
  Array.isArray(pair) && pair.every(Number.isFinite)
    ? `${Number(pair[0]).toPrecision(3)} to ${Number(pair[1]).toPrecision(3)}`
    : '-';

const TEST_LABELS = {
  buildup: 'Pressure buildup',
  drawdown: 'Pressure drawdown',
  injection: 'Injection test',
  falloff: 'Injection falloff',
};

/**
 * Build and save the interpretation report.
 * @returns {boolean} success
 */
export const exportWellTestPdf = ({
  projectName, wellName, config, reservoir, prepared,
  model, matchParams, fitResult, derivedKpis,
  semilogResult, sqrtResult, pssResult, multiRateResult, deliverabilityResult,
  rtaResult, regimes, notes, unitSystem = 'oilfield',
}) => {
  try {
    const doc = new jsPDF();
    const isGas = reservoir?.fluid === 'gas';
    const isBuildup = config?.family === 'buildup';
    const u = (kind, v) => fromOilfield(kind, v, unitSystem);
    const uL = (kind) => unitLabel(kind, unitSystem);
    const dpKind = isGas ? 'pseudoPressure' : 'pressure';
    const dpUnit = uL(dpKind);
    const rateKind = isGas ? 'gasRate' : 'oilRate';
    let y = 20;

    doc.setFontSize(18);
    doc.setTextColor(...NAVY);
    doc.text('Well Test Analysis Report', 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    doc.text(
      [
        projectName || 'Untitled interpretation',
        wellName ? `Well ${wellName}` : null,
        TEST_LABELS[config?.testType] || 'Well test',
        isBuildup ? `tp = ${f1(config?.tp)} hr` : null,
        isGas ? 'Gas analysis in pseudo-pressure m(p)' : 'Oil analysis',
      ].filter(Boolean).join('  |  '),
      14, y
    );
    y += 5;
    doc.text(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}  |  Petrolord Well Test Analysis Studio`, 14, y);
    y += 4;
    doc.setDrawColor(...SLATE);
    doc.line(14, y, 196, y);
    y += 6;

    const table = (title, head, body) => {
      if (!body.length) return;
      doc.setFontSize(12);
      doc.setTextColor(...NAVY);
      doc.text(title, 14, y);
      doc.autoTable({
        startY: y + 2,
        head: [head],
        body,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: NAVY },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
      if (y > 260) { doc.addPage(); y = 20; }
    };

    table('Headline results', ['Quantity', 'Value'], [
      ['Permeability k (md)', sig3(derivedKpis?.k)],
      ['kh (md-ft)', sig3(derivedKpis?.kh)],
      [isGas ? "Apparent skin s'" : 'Skin factor', f2(derivedKpis?.skin)],
      [`Pressure drop across skin (${uL('pressure')})`, f1(u('pressure', derivedKpis?.dpSkin))],
      ['Flow efficiency', Number.isFinite(derivedKpis?.flowEfficiency) ? `${(derivedKpis.flowEfficiency * 100).toFixed(0)}%` : '-'],
      [`Radius of investigation (${uL('length')})`, f1(u('length', derivedKpis?.ri))],
      ['Analysis points', String(prepared?.points?.length ?? 0)],
      ['Display units', unitSystem === 'si' ? 'SI / metric' : 'Oilfield'],
    ]);

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
            fitResult ? ci(Array.isArray(pair) ? pair.map(uv) : pair) : '-',
          ];
        })
      );
    }

    const straight = [];
    if (semilogResult) {
      straight.push([isBuildup ? 'Horner slope m' : 'MDH slope m', `${isGas ? sci(u(dpKind, semilogResult.m)) : f1(u(dpKind, semilogResult.m))} ${dpUnit}/cycle`]);
      straight.push(['Semilog k (md)', sig3(semilogResult.k)]);
      straight.push(['Semilog skin', f2(semilogResult.skin)]);
      if (isBuildup && Number.isFinite(semilogResult.pStar)) straight.push([`Extrapolated p* (${uL('pressure')})`, f1(u('pressure', semilogResult.pStar))]);
      straight.push(['Semilog fit r2', f2(semilogResult.r2)]);
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

    if (regimes?.length) {
      table('Flow regimes observed', ['Regime', 'From (hr)', 'To (hr)'],
        regimes.map((r) => [r.label, sig3(r.xStart), sig3(r.xEnd)]));
    }

    if (notes) {
      doc.setFontSize(12);
      doc.setTextColor(...NAVY);
      doc.text('Interpretation notes', 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(60);
      const lines = doc.splitTextToSize(notes, 180);
      doc.text(lines, 14, y);
    }

    const fileBase = (projectName || wellName || 'well-test').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
    doc.save(`WTA_Report_${fileBase || 'well_test'}.pdf`);
    return true;
  } catch (e) {
    console.error('Well test PDF export failed:', e);
    return false;
  }
};
