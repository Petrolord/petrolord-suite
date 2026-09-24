// ML Workbench (Data & AI D2): the run report, as CSV and as PDF.
//
// Layout only. Every score, coefficient and prediction is the engine's,
// taken from the evaluation mlWorkflows.evaluate returned. The CSV keeps
// every number at full round-trip precision (String(x)); the screen rounds
// for reading, exports do not. The PDF carries the summary tables; the
// row-by-row held-out predictions are in the CSV.
import { ENGINE_VERSION } from '@/utils/dataAi/mlWorkflows';
import { labelRuleText } from '@/utils/dataAi/mlData';

const q = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_COLUMNS = ['record', 'fold', 'well', 'depth', 'name', 'value', 'detail'];

export const modelText = (parsed) => {
  const m = parsed?.model;
  if (!m) return '';
  if (m.kind === 'ridge') return `ridge regression, lambda ${m.lambda}`;
  if (m.kind === 'logistic') return m.l2 > 0 ? `logistic regression, L2 ${m.l2}` : 'logistic regression, unpenalised';
  return 'ordinary least squares';
};

export const validationText = (e) => {
  if (!e || e.error) return '';
  return e.scheme === 'kfold' ? `group k-fold, k = ${e.k}, seed ${e.seed}` : `group split, test fraction ${e.testFraction}, seed ${e.seed}`;
};

const regressionRows = (m) => (m && !m.error ? [['rmse', m.rmse], ['mae', m.mae], ['r2', m.r2], ['n', m.n]] : []);
const classificationRows = (t) => {
  if (!t) return [];
  const out = [];
  if (t.report && !t.report.error) {
    out.push(['accuracy', t.report.accuracy]);
    t.report.perClass.forEach((c) => {
      out.push([`precision class ${c.label}`, c.precision], [`recall class ${c.label}`, c.recall], [`f1 class ${c.label}`, c.f1], [`support class ${c.label}`, c.support]);
    });
    out.push(['macro f1', t.report.macro.f1], ['weighted f1', t.report.weighted.f1]);
  }
  if (t.roc && !t.roc.error) out.push(['roc auc', t.roc.auc]);
  if (t.logLoss && !t.logLoss.error) out.push(['log loss', t.logLoss.logLoss], ['log loss clipped rows', t.logLoss.clipped]);
  return out;
};
const refusals = (t) => (t ? ['report', 'roc', 'logLoss'].filter((k) => t[k]?.error).map((k) => [k, t[k].error]) : []);

/**
 * One CSV, one row per record: meta, fold, pooled, coefficient, confusion,
 * roc and prediction rows under a shared header.
 */
export function buildMlCsv({
  runName, table, spec, design, parsed, evaluation, final,
}) {
  const lines = [CSV_COLUMNS.join(',')];
  const row = (cells) => lines.push(CSV_COLUMNS.map((c) => q(cells[c])).join(','));
  const task = evaluation?.task || spec?.task;
  row({ record: 'meta', name: 'run', value: runName || 'Unsaved ML run' });
  row({ record: 'meta', name: 'data', value: table?.label || '' });
  row({ record: 'meta', name: 'task', value: task });
  row({ record: 'meta', name: 'target', value: task === 'classification' ? labelRuleText(spec.label) : design?.targetText });
  row({ record: 'meta', name: 'features', value: (design?.names || []).join(' ') });
  row({ record: 'meta', name: 'model', value: modelText(parsed) });
  row({ record: 'meta', name: 'standardised', value: parsed?.standardise ? 'yes: z-score, population SD, fitted on each fold\'s training rows' : 'no' });
  row({ record: 'meta', name: 'validation', value: validationText(evaluation) });
  row({ record: 'meta', name: 'rows', value: design?.X?.length ?? '' });
  row({ record: 'meta', name: 'wells', value: (design?.wells || []).map((w) => `${w.name} (${w.rows})`).join(' ') });
  row({ record: 'meta', name: 'engine', value: ENGINE_VERSION });
  row({ record: 'meta', name: 'generated', value: new Date().toISOString() });
  if (evaluation?.error) row({ record: 'refused', name: 'validation', detail: evaluation.error });
  (evaluation?.folds || []).forEach((f) => {
    const well = f.testGroups.join(' ');
    if (f.error) { row({ record: 'refused', fold: f.fold, well, name: f.stage, detail: f.error }); return; }
    (task === 'classification' ? classificationRows(f.test) : regressionRows(f.test)).forEach(([k, v]) => row({ record: 'fold', fold: f.fold, well, name: k, value: v }));
    refusals(f.test).forEach(([k, msg]) => row({ record: 'refused', fold: f.fold, well, name: k, detail: msg }));
    if (task === 'classification') row({ record: 'fold', fold: f.fold, well, name: 'converged', value: f.fit.converged, detail: `${f.fit.iterations} Newton updates` });
  });
  if (evaluation?.pooledRefusal) row({ record: 'refused', name: 'pooled', detail: evaluation.pooledRefusal });
  if (evaluation?.pooled) {
    (task === 'classification' ? classificationRows(evaluation.pooled) : regressionRows(evaluation.pooled)).forEach(([k, v]) => row({ record: 'pooled', name: k, value: v }));
    refusals(evaluation.pooled).forEach(([k, msg]) => row({ record: 'refused', name: `pooled ${k}`, detail: msg }));
  }
  if (final?.fit && !final.fit.error) {
    final.fit.names.forEach((nm, j) => row({
      record: 'coefficient', name: nm, value: final.fit.coefficients[j],
      detail: final.fit.standardErrors ? `se ${final.fit.standardErrors[j]}` : '',
    }));
    if (final.scaler) final.scaler.names.forEach((nm, j) => row({ record: 'scaler', name: nm, value: final.scaler.centre[j], detail: `scale ${final.scaler.scale[j]}` }));
  } else if (final?.error) {
    row({ record: 'refused', name: 'final fit', detail: final.error });
  }
  if (task === 'classification' && evaluation?.pooled?.report && !evaluation.pooled.report.error) {
    const { labels, matrix } = evaluation.pooled.report;
    labels.forEach((t, i) => labels.forEach((p, j) => row({ record: 'confusion', name: `true ${t} predicted ${p}`, value: matrix[i][j] })));
  }
  if (task === 'classification' && evaluation?.pooled?.roc && !evaluation.pooled.roc.error) {
    const r = evaluation.pooled.roc;
    r.fpr.forEach((x, i) => row({ record: 'roc', name: `fpr ${x}`, value: r.tpr[i], detail: r.thresholds[i] === null ? 'start (no row called positive)' : `threshold ${r.thresholds[i]}` }));
  }
  if (evaluation && !evaluation.error && design) {
    const foldOfWell = new Map();
    evaluation.folds.forEach((f) => f.testGroups.forEach((g) => foldOfWell.set(g, f.fold)));
    evaluation.tested.forEach((i) => row({
      record: 'prediction', fold: foldOfWell.get(design.groups[i]), well: design.groups[i], depth: design.depth[i], name: `actual ${design.y[i]}`, value: evaluation.oof[i],
      detail: evaluation.oofClass ? `class ${evaluation.oofClass[i]}` : '',
    }));
  }
  return `${lines.join('\n')}\n`;
}

/** The run report as a branded PDF (jsPDF + autotable, the shared banner). */
export async function generateMlPdf({
  runName, table, spec, design, parsed, evaluation, final,
}) {
  const [{ default: JsPdf }, { default: autoTable }, brand] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), import('@/lib/pdfBrand'),
  ]);
  const doc = new JsPdf();
  const pageWidth = doc.internal.pageSize.width;
  const margin = 14;
  const logo = await brand.loadPetrolordLogo();
  let y = brand.drawBrandHeader(doc, {
    logo, margin, pageWidth, appTitle: 'ML Workbench', subtitle: 'Model report', rightLines: [runName || 'Unsaved ML run'],
  }) + 10;
  const task = evaluation?.task || spec?.task;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  const lines = [
    `Data: ${table?.label || ''}. ${design?.X?.length ?? 0} rows from ${(design?.wells || []).length} wells.`,
    `Task: ${task}. Target: ${task === 'classification' ? labelRuleText(spec.label) : design?.targetText}. Features: ${(design?.names || []).join(', ')}.`,
    `Model: ${modelText(parsed)}; features ${parsed?.standardise ? 'standardised on each fold\'s training rows (population SD)' : 'as given'}. Validation: ${validationText(evaluation)}.`,
    `Engine: ${ENGINE_VERSION}. Figures below are rounded for print; the CSV export keeps full precision.`,
  ];
  const txt = doc.splitTextToSize(lines.join(' '), pageWidth - 2 * margin);
  doc.text(txt, margin, y);
  y += txt.length * 4.5 + 3;
  const r6 = (v) => (typeof v === 'number' ? String(Number(v.toPrecision(6))) : String(v ?? ''));

  const folds = evaluation?.folds || [];
  const head = task === 'classification'
    ? [['Fold', 'Held-out wells', 'Rows', 'Accuracy', 'F1 class 1', 'AUC', 'Log loss', 'Converged']]
    : [['Fold', 'Held-out wells', 'Rows', 'RMSE', 'MAE', 'R-squared']];
  const body = folds.map((f) => {
    if (f.error) return [String(f.fold), f.testGroups.join(', '), String(f.nTest), { content: `Refused: ${f.error}`, colSpan: head[0].length - 3 }];
    if (task === 'classification') {
      const t = f.test;
      return [String(f.fold), f.testGroups.join(', '), String(f.nTest), r6(t.report.accuracy), r6(t.report.perClass?.[1]?.f1), t.roc.error ? 'refused' : r6(t.roc.auc), r6(t.logLoss.logLoss), f.fit.converged ? 'yes' : 'no'];
    }
    return [String(f.fold), f.testGroups.join(', '), String(f.nTest), r6(f.test.rmse), r6(f.test.mae), r6(f.test.r2)];
  });
  const p = evaluation?.pooled;
  if (p) {
    body.push(task === 'classification'
      ? ['Pooled', '', String(evaluation.tested.length), r6(p.report.accuracy), r6(p.report.perClass?.[1]?.f1), p.roc.error ? 'refused' : r6(p.roc.auc), r6(p.logLoss.logLoss), '']
      : ['Pooled', '', String(p.n), r6(p.rmse), r6(p.mae), r6(p.r2)]);
  }
  autoTable(doc, {
    startY: y, head, body, styles: { fontSize: 7, cellPadding: 1 }, headStyles: { fillColor: [15, 23, 42] },
  });
  y = doc.lastAutoTable.finalY + 4;
  if (evaluation?.pooledRefusal) { doc.text(doc.splitTextToSize(evaluation.pooledRefusal, pageWidth - 2 * margin), margin, y); y += 8; }
  if (final?.fit && !final.fit.error) {
    autoTable(doc, {
      startY: y,
      head: [['Coefficient (model on every row)', 'Estimate', 'Standard error']],
      body: final.fit.names.map((nm, j) => [nm, r6(final.fit.coefficients[j]), final.fit.standardErrors ? r6(final.fit.standardErrors[j]) : '']),
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    y = doc.lastAutoTable.finalY + 4;
  }
  if (task === 'classification' && p?.report && !p.report.error) {
    const m = p.report.matrix;
    autoTable(doc, {
      startY: y,
      head: [['Pooled confusion matrix', 'Predicted 0', 'Predicted 1']],
      body: [['True 0', String(m[0][0]), String(m[0][1])], ['True 1', String(m[1][0]), String(m[1][1])]],
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fillColor: [15, 23, 42] },
    });
  }
  return doc;
}
