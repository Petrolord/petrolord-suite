// AFE report PDF export (jsPDF NAMED import — the WD6 gotcha).

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const usd = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '--');

export function buildAfePdf({ caseRow, wellboreName, res, mc }) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('AFE Estimate - Well Cost & Time Estimator', 14, 16);
  doc.setFontSize(10);
  doc.text(`${wellboreName || ''}  /  ${caseRow.name || ''}`, 14, 23);

  const t = res.program.totals;
  autoTable(doc, {
    startY: 28,
    styles: { fontSize: 8 },
    head: [['Schedule', 'Value']],
    body: [
      ['Productive time', `${t.productiveHr.toFixed(1)} h`],
      ['NPT allowance', `${t.nptHr.toFixed(1)} h`],
      ['Total duration', `${t.totalDays.toFixed(1)} days`],
      ['Drilled interval', `${t.drilledM.toFixed(0)} m to ${t.tdMdM.toFixed(0)} m MD`],
    ],
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 4,
    styles: { fontSize: 8 },
    head: [['AFE item', 'Category', 'Basis', 'Amount (USD)']],
    body: res.costs.byItem.map((r) => [r.label, r.category, r.basis, usd(r.amountUsd)]),
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 4,
    styles: { fontSize: 8 },
    head: [['Rollup', 'USD']],
    body: [
      ['Tangible', usd(res.costs.tangibleUsd)],
      ['Intangible', usd(res.costs.intangibleUsd)],
      ['Base subtotal', usd(res.costs.baseUsd)],
      ['Contingency', usd(res.costs.contingencyUsd)],
      ['AFE total', usd(res.costs.totalUsd)],
    ],
  });

  if (mc) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      styles: { fontSize: 8 },
      head: [['Probabilistic (base cost; P10 low / P90 high)', 'Cost (USD)', 'Duration (days)']],
      body: [
        ['P10', usd(mc.cost.p10), mc.days.p10.toFixed(1)],
        ['P50', usd(mc.cost.p50), mc.days.p50.toFixed(1)],
        ['P90', usd(mc.cost.p90), mc.days.p90.toFixed(1)],
        ['Mean', usd(mc.cost.mean), mc.days.mean.toFixed(1)],
      ],
    });
  }

  doc.setFontSize(7);
  doc.text(
    'Planning estimate from user-entered rates and durations; validated engine arithmetic, not a market quotation.',
    14, doc.lastAutoTable.finalY + 8,
  );
  return doc;
}

export function exportAfePdf(args, baseName = 'afe-estimate') {
  buildAfePdf(args).save(`${baseName}.pdf`);
}
