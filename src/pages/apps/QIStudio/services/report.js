// QI Studio Package 1 report (QI programme Q1 / A4, 2026-10-06): the data
// audit and feasibility deliverable of the SOW (sections 2 to 4 and the
// feasibility conclusion), on the shared Report Kit. reportModel is pure
// (rows and words); buildQIStudioPdf lays them out.

import { createReport } from '@/lib/reportKit';
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { STATES, inventorySummary } from './inventory';
import { FEASIBILITY_VERDICTS } from './model';
import { isStripe, snrText } from './qcRun';
import { tieRows, waveletComparison } from './ties';
import { INVERSION_METHODS, INVERSION_DEFAULTS } from './inversionRun';
import { faciesClass } from './propertyRun';

export const REPORT_TITLE = 'QI Data Audit and Feasibility Report';
export const APP_NAME = 'Petrolord QI Studio';
const STATE_LABEL = Object.fromEntries(STATES.map((s) => [s.key, s.label]));
const VERDICT_LABEL = Object.fromEntries(FEASIBILITY_VERDICTS.map((v) => [v.key, v.label]));
const GRADE_WORD = { good: 'Good', limited: 'Limited', missing: 'Missing' };

/**
 * @param {{projectName, organizationName, project, inventory, matrix, issues, chosenVolumes, ready}} a
 */
export function reportModel({ projectName = '', organizationName = '', project, inventory, matrix, issues, chosenVolumes = [], ready = [] }) {
  const counts = inventorySummary(inventory);
  const open = issues.filter((i) => i.status === 'open');
  const verdicts = project.targets.map((t) => VERDICT_LABEL[project.feasibility[t]?.verdict || ''] || 'Not assessed');
  return {
    identification: [
      ['Project', projectName || 'Unsaved QI study'],
      ['Organisation', organizationName || ''],
      ['Wells', ready.map((r) => r.well.name).join(', ') || 'none chosen'],
      ['Targets', project.targets.join(', ') || 'none chosen'],
      ['Seismic', chosenVolumes.map((v) => v.name).join(', ') || 'none chosen'],
      ['Seismic acquired', project.dates.seismicAcquired || ''],
    ],
    summary: [
      `${ready.length} well${ready.length === 1 ? '' : 's'} and ${project.targets.length} target interval${project.targets.length === 1 ? '' : 's'} were audited.`,
      `Data inventory: ${STATES.map((s) => `${counts[s.key] || 0} ${s.label.toLowerCase()}`).join(', ')}.`,
      `Usability: ${matrix.count.good} good, ${matrix.count.limited} limited and ${matrix.count.missing} missing well and target combinations.`,
      `${open.length} open issue${open.length === 1 ? '' : 's'} (${open.filter((i) => i.severity === 'high').length} high severity).`,
      project.targets.length ? `Feasibility: ${project.targets.map((t, k) => `${t} ${verdicts[k].toLowerCase()}`).join('; ')}.` : 'No target has a feasibility verdict yet.',
    ].join(' '),
    inventory: {
      head: ['Area', 'Data', 'State', 'Received', 'Note', 'From the Suite'],
      rows: inventory.map((r) => [r.area, r.label, STATE_LABEL[r.state] || r.state, r.date || '', r.note || '', r.suggested ? r.suggested.evidence : '']),
    },
    usability: {
      head: ['Well', ...matrix.targets],
      rows: matrix.rows.map((r) => [r.wellName, ...r.cells.map((c) => GRADE_WORD[c.grade])]),
      detail: matrix.rows.flatMap((r) => r.cells.flatMap((c) => c.items.filter((it) => it.grade !== 'good').map((it) => [r.wellName, c.target, it.label, GRADE_WORD[it.grade], it.text]))),
      depletion: matrix.rows.filter((r) => r.depletion).map((r) => r.depletion),
    },
    issues: {
      head: ['Severity', 'Issue', 'Remedy', 'Owner', 'Status'],
      rows: issues.filter((i) => i.status !== 'dismissed').map((i) => [i.severity, `${i.title}${i.detail ? `. ${i.detail}` : ''}`, i.remedy || '', i.owner || '', i.status]),
    },
    feasibility: project.targets.map((t, k) => {
      const f = project.feasibility[t] || {};
      return { target: t, verdict: verdicts[k], separability: f.separability || '', detectability: f.detectability || '', route: f.route || '' };
    }),
    qc: Object.values(project.qc || {}).filter((r) => r?.result?.qc).map((r) => ({
      volume: r.volumeName || r.result.volume_name || 'volume',
      at: String(r.at || '').slice(0, 10),
      windows: r.result.qc.windows.map((w) => [`${Math.round(w.t0Ms)} to ${Math.round(w.t1Ms)}`, w.stats.peakHz.toFixed(1), `${w.stats.band6[0].toFixed(1)} to ${w.stats.band6[1].toFixed(1)}`, snrText(w.snr.median)]),
      footprints: r.result.qc.footprints.map((f) => [String(Math.round(f.tMs)), ...[f.alongCrossline, f.alongInline].map((v) => (f.error || !v ? (f.error || 'n/a') : `${isStripe(v) ? 'stripe' : 'none'}, period ${v.period.toFixed(1)}, ${Math.round(v.share * 100)} percent`))]),
    })),
    ties: (() => {
      const tr = tieRows(ready);
      let cmp = null;
      try { cmp = waveletComparison(tr); } catch { cmp = null; }
      const fit = new Map((cmp?.misfit || []).map((m) => [m.name, m.corrToAverage]));
      return tr.map((r) => [r.wellName, ...(r.tie ? [
        r.tie.meanCorr != null ? r.tie.meanCorr.toFixed(2) : '',
        r.tie.shiftMs != null ? r.tie.shiftMs.toFixed(1) : '',
        r.tie.wavelet ? `${r.tie.wavelet.kind || 'tie'}, ${r.tie.wavelet.peakHz ?? ''} Hz, ${r.tie.wavelet.phaseDeg ?? ''} deg` : '',
        fit.has(r.wellName) ? fit.get(r.wellName).toFixed(2) : '',
      ] : ['no tie', '', '', ''])]);
    })(),
    inversion: Object.values(project.inversion || {}).filter((r) => r?.blind?.result?.blind?.length || r?.spread?.result?.blind?.length).map((r) => {
      // the base blind table comes with the sensitivity run too
      const rec = r.blind?.result?.blind?.length ? r.blind : r.spread;
      const res = rec.result;
      const rel = res.settings?.output === 'relative AI';
      const n = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '');
      return {
        volume: rec.volumeName || res.volume_name || 'volume',
        at: String(rec.at || '').slice(0, 10),
        method: INVERSION_METHODS[res.settings?.method]?.label || res.settings?.method || '',
        relative: rel,
        rows: res.blind.map((w) => [w.name, n(w.blind.corr, 2), rel ? 'n/a' : n(w.blind.rmsPct, 1), n(w.withWell.corr, 2), rel ? 'n/a' : n(w.withWell.rmsPct, 1)]),
        volumes: (r.runs || []).filter((x) => x.status === 'ready').map((x) => x.name),
        spread: r.spread?.result?.sensitivity ? {
          rows: r.spread.result.sensitivity.rows.map((w) => [w.name, n(w.q10, 1), n(w.q50, 1), n(w.q90, 1)]),
          scenarios: r.spread.result.sensitivity.byScenario.map((x) => [x.label, n(x.meanRmsPct, 1)]),
        } : null,
      };
    }),
    properties: Object.values(project.properties || {}).flatMap((rec) => ['porosity', 'facies'].filter((k) => rec?.[k]?.calibration?.result?.rows).map((k) => {
      const c = rec[k].calibration; const res = c.result;
      const n = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '');
      const p = (v) => (Number.isFinite(v) ? String(Math.round(100 * v)) : '');
      return {
        kind: k, volume: c.volumeName || '', at: String(c.at || '').slice(0, 10),
        summary: k === 'facies'
          ? res.summary.classes.map((x) => [x.name, String(x.n), n(x.prior, 2), n(x.mean, 0), n(x.sd, 0), faciesClass(x.name) === 'fluid_hypothesis' ? 'fluid hypothesis' : 'calibrated prediction'])
          : `porosity = ${n(res.summary.a, 4)} ${res.summary.b < 0 ? '-' : '+'} ${Math.abs(res.summary.b).toExponential(3)} x AI (r squared ${n(res.summary.r2, 2)}, ${res.summary.n} samples, residual SD ${n(res.summary.s, 4)}).`,
        rows: res.rows.map((r) => (r.error ? [r.name, r.error, '', '', ''] : k === 'facies' ? [r.name, String(r.n), p(r.accuracy)] : [r.name, String(r.n), n(r.rms, 3), n(r.corr, 2), p(r.coverage)])),
        volumes: (rec[k].runs || []).filter((x) => x.status === 'ready').map((x) => x.name),
      };
    })),
    prospects: (project.prospects || []).filter((p) => p.result).map((p) => {
      const r = p.result; const n = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '');
      const open = (p.competing || []).filter((c) => c.status === 'open').map((c) => c.name);
      const likely = (p.competing || []).filter((c) => c.status === 'likely').map((c) => c.name);
      return {
        name: p.name,
        row: [
          p.name, p.target || '', `${n(r.trap.crest.depthM, 0)} / ${n(r.trap.spill.depthM, 0)}${r.trap.limitedByEdge ? ' (edge)' : ''}`, n(r.trap.columnM, 0),
          r.anomaly ? `${n(r.anomaly.conformance, 2)}; ${n(100 * r.anomaly.insideClosure, 0)} percent inside` : 'none', String(r.evidence.independent),
          [open.length ? `open: ${open.join(', ')}` : '', likely.length ? `likely: ${likely.join(', ')}` : ''].filter(Boolean).join('; ') || 'none open',
          VERDICT_LABEL[project.feasibility?.[p.target]?.verdict || ''] || 'Not assessed', r.assessment.seismicSupport, r.assessment.label.split(':')[0],
        ],
        text: `${r.assessment.label}. ${r.assessment.reasons.join(' ')} GRV ${r.anomaly ? `${n(r.anomaly.grvImpliedM3 / 1e6, 1)} million m3 to the contact the anomaly implies (${n(r.anomaly.impliedContactDepthM, 0)} m) and ` : ''}${n(r.trap.grvSpillM3 / 1e6, 1)} million m3 to spill.`,
      };
    }),
    assumptions: [
      'Curve coverage is judged on each curve\'s recorded depth extent against the zone; gaps inside the extent are checked in Well Data Manager and Rock Physics Studio.',
      'A target is matched by zone name on every well.',
      'Inventory states suggested from the Suite registries were reviewed by the author; groups the Suite cannot see were entered by hand.',
      'The feasibility verdicts and reasoning are the author\'s, from the rock physics work in Rock Physics Studio.',
    ],
  };
}

/** Lay the model out on the Report Kit. @returns {{doc, pages}} */
export function buildQIStudioPdf(model, { logo = null, generatedAt = new Date() } = {}) {
  const report = createReport({ title: REPORT_TITLE, appName: APP_NAME, logo });
  const { table, section } = report;
  report.header({ identification: model.identification, generatedAt });
  section('Summary', model.summary);
  table('Data inventory', model.inventory.head, model.inventory.rows, { fontSize: 6.5 });
  if (model.usability.rows.length) {
    table('Usability matrix', model.usability.head, model.usability.rows, { note: 'Each well against each target: good, limited or missing for a quantitative interpretation.' });
    if (model.usability.detail.length) table('Usability: what is limited or missing', ['Well', 'Target', 'Item', 'Grade', 'Reason'], model.usability.detail, { fontSize: 6.5 });
    if (model.usability.depletion.length) section('Depletion', model.usability.depletion.join(' '));
  } else {
    section('Usability matrix', 'No wells or targets were chosen.');
  }
  for (const q of model.qc) {
    table(`Seismic QC: ${q.volume}`, ['Window (ms)', 'Peak (Hz)', '-6 dB band (Hz)', 'Signal-to-noise'], q.windows, { note: `Run on the seismic worker${q.at ? ` on ${q.at}` : ''}: spectra and the -6 dB band per window, signal-to-noise from neighbouring traces.` });
    table(`Acquisition footprint: ${q.volume}`, ['Time (ms)', 'Along crosslines', 'Along inlines'], q.footprints, { note: 'RMS amplitude maps around each time; a stripe is a period holding over 30 percent of the profile variance, at least ten times the median power of the band and repeated at least five times across the slice.' });
  }
  if (model.ties.length) table('Well ties', ['Well', 'Mean correlation', 'Bulk shift (ms)', 'Wavelet', 'Fit to the field wavelet'], model.ties, { note: 'From the QC record committed with each tie in Seismolord. The field wavelet is the average of the stored tie wavelets, aligned and normalised.' });
  for (const v of model.inversion || []) {
    table(`Impedance inversion: ${v.volume}`, ['Well', 'Blind correlation', 'Blind AI error (percent)', 'With the well: correlation', 'With the well: error (percent)'], v.rows, {
      note: `${v.method}, run on the seismic worker${v.at ? ` on ${v.at}` : ''}. Each well is left out of the low-frequency model in turn and compared with its own log after a high cut at ${INVERSION_DEFAULTS.truthHz} Hz${v.relative ? '; relative impedance has no level, so only the correlation is reported' : ''}. Products are elastic estimates.${v.volumes.length ? ` Impedance volumes: ${v.volumes.join(', ')}.` : ''}`,
    });
    if (v.spread) {
      table(`Inversion sensitivity: ${v.volume}`, ['Well', 'Blind AI error Q10 (percent)', 'Q50', 'Q90'], v.spread.rows, { note: 'The blind-well check repeated under each scenario (wavelet, model cut, noise); Q10, Q50 and Q90 are the 10th, 50th and 90th percentiles across the scenarios.' });
      table(`Inversion scenarios: ${v.volume}`, ['Scenario', 'Mean blind AI error (percent)'], v.spread.scenarios, { note: 'The assumption whose scenarios raise the error most is the one the result depends on most.' });
    }
  }
  for (const pp of model.properties || []) {
    const vols = pp.volumes.length ? ` Volumes: ${pp.volumes.join(', ')}.` : '';
    if (pp.kind === 'facies') {
      table(`Facies from ${pp.volume}`, ['Facies', 'Samples', 'Prior', 'Mean AI', 'SD', 'Label'], pp.summary, { note: `Bayesian classification in impedance, calibrated on the wells' logs at seismic scale${pp.at ? ` on ${pp.at}` : ''}. Facies named for a fluid are fluid hypotheses.${vols}` });
      table(`Facies check: ${pp.volume}`, ['Well left out', 'Samples', 'Facies right (percent)'], pp.rows, { note: 'Each well left out of the model and predicted from the inverted impedance at its trace.' });
    } else {
      table(`Porosity from ${pp.volume}`, ['Well left out', 'Samples', 'RMS error', 'Correlation', 'Inside Q10 to Q90 (percent)'], pp.rows, { note: `${pp.summary} Calibrated on the wells' logs at seismic scale${pp.at ? ` on ${pp.at}` : ''}; each well is then left out and predicted from the inverted impedance at its trace. Q10 and Q90 bound the 80 percent prediction interval; about 80 percent of a well should fall inside.${vols}` });
    }
  }
  if ((model.prospects || []).length) {
    table('Prospect QI assessment', ['Prospect', 'Target', 'Crest / spill (m)', 'Column (m)', 'Anomaly fit', 'Independent evidence', 'Competing explanations', 'Feasibility', 'Seismic support', 'Recommendation'], model.prospects.map((p) => p.row), {
      fontSize: 6.5,
      note: 'The trap from the closure engine on the depth surface; the anomaly fit is the conformance of its downdip edge to one contour (1 is a perfect fit) and its share inside the closure; evidence from one seismic response counts once. QI does not set the chance of success: it reports what the seismic supports for the risk team.',
    });
    for (const p of model.prospects) section(`Prospect: ${p.name}`, p.text);
  }
  if (model.issues.rows.length) table('Issue register', model.issues.head, model.issues.rows, { fontSize: 6.5 });
  else section('Issue register', 'No open or resolved issues.');
  for (const f of model.feasibility) {
    section(`Feasibility: ${f.target}`, [
      `Verdict: ${f.verdict}.`,
      f.separability ? `Separability: ${f.separability}` : '',
      f.detectability ? `Detectability: ${f.detectability}` : '',
      f.route ? `Recommended route: ${f.route}` : '',
    ].filter(Boolean).join(' '));
  }
  report.limits({ assumptions: model.assumptions, flags: [], noFlagsText: 'No further flags.', flagsTitle: 'Flags' });
  return report.finish({ footer: REPORT_TITLE });
}

export const reportFileName = (projectName) => `QI_Audit_Report_${String(projectName || 'study').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_') || 'study'}.pdf`;

/** Build and save the PDF. @returns {Promise<boolean>} */
export async function exportQIStudioPdf(args) {
  try {
    const logo = await loadPetrolordLogo();
    const { doc } = buildQIStudioPdf(reportModel(args), { logo });
    doc.save(reportFileName(args.projectName));
    return true;
  } catch (e) {
    console.error('QI Studio report export failed:', e);
    return false;
  }
}
