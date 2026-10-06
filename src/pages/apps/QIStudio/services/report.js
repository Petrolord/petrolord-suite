// QI Studio Package 1 report (QI programme Q1 / A4, 2026-10-06): the data
// audit and feasibility deliverable of the SOW (sections 2 to 4 and the
// feasibility conclusion), on the shared Report Kit. reportModel is pure
// (rows and words); buildQIStudioPdf lays them out.

import { createReport } from '@/lib/reportKit';
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { STATES, inventorySummary } from './inventory';
import { FEASIBILITY_VERDICTS } from './model';

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
