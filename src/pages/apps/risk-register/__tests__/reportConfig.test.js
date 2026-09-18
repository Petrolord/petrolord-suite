/**
 * AS13 — the report builder's contract.
 *
 * Save & Generate opened the database row as a report (every risk, the
 * default columns); editing a saved report inserted a copy; grouping was
 * promised and never applied; and two templates reported an owner column
 * no form writes.
 */
import fs from 'fs';
import path from 'path';
import {
  REPORT_COLUMNS,
  REPORT_TEMPLATES,
  countByGroup,
  groupedRows,
  processReport,
  reportConfigFromRow,
  storedConfig,
} from '../utils/reportConfig';

const APP = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

const risks = [
  { id: 'a', risk_id: 'R1', title: 'A', category: 'HSE', status: 'Open', likelihood: 5, impact: 5, risk_score: 25 },
  { id: 'b', risk_id: 'R2', title: 'B', category: 'Financial', status: 'Closed', likelihood: 1, impact: 2, risk_score: 2 },
  { id: 'c', risk_id: 'R3', title: 'C', category: 'HSE', status: 'Open', likelihood: 2, impact: 3, risk_score: 6 },
  { id: 'd', risk_id: 'R4', title: 'D', category: null, status: 'Open', likelihood: 3, impact: 4, risk_score: 12, residual_likelihood: 1 },
];

describe('a saved row becomes a report again', () => {
  const row = {
    id: 'row-1',
    name: 'Board pack',
    config: { name: 'Board pack', columns: ['risk_id', 'title'], filters: [{ field: 'status', operator: 'equals', value: 'Open' }] },
  };

  it('carries the row id, so saving it again updates rather than copies', () => {
    expect(reportConfigFromRow(row).id).toBe('row-1');
  });

  it('carries the columns and filters, so the viewer shows the report that was saved', () => {
    const config = reportConfigFromRow(row);
    expect(config.columns).toEqual(['risk_id', 'title']);
    expect(processReport(risks, config).map((r) => r.id)).toEqual(['a', 'd', 'c']);
    // The old path handed the viewer the row, where `filters` is nested
    // under `config`: every risk came back.
    expect(processReport(risks, row).map((r) => r.id)).toHaveLength(4);
  });

  it('the stored config does not carry an id of its own', () => {
    expect(storedConfig({ id: 'x', name: 'n' })).toEqual({ name: 'n' });
  });

  it('the builder and the viewer use it, and the Save & Generate path opens what saveReport returns', () => {
    expect(read('RiskReportsPage.jsx')).toMatch(/openReportBuilder\(reportConfigFromRow\(report\)\)/);
    expect(read('RiskReportsPage.jsx')).toMatch(/openReportViewer\(reportConfigFromRow\(report\)\)/);
    expect(read('contexts/RiskReportingContext.jsx')).toMatch(/return reportConfigFromRow\(data\)/);
  });
});

describe('grouping is applied', () => {
  it('sorts by group, keeping score order inside each group', () => {
    const rows = processReport(risks, { columns: [], filters: [], grouping: 'category' });
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('prints a heading wherever the group changes, with its count', () => {
    const rows = processReport(risks, { columns: [], filters: [], grouping: 'category' });
    const out = groupedRows(rows, 'category');
    expect(out.filter((e) => e.heading).map((e) => [e.heading, e.count]))
      .toEqual([['Financial', 1], ['HSE', 2], ['Not set', 1]]);
  });

  it('groups by the derived band', () => {
    const rows = processReport(risks, { columns: [], filters: [], grouping: 'band' });
    expect(countByGroup(rows, 'band')).toEqual([
      { name: 'Critical', count: 1 }, { name: 'High', count: 1 },
      { name: 'Low', count: 1 }, { name: 'Medium', count: 1 },
    ]);
  });

  it('the chart counts by status when no grouping is set', () => {
    expect(countByGroup(processReport(risks, { filters: [] }))).toEqual([
      { name: 'Open', count: 3 }, { name: 'Closed', count: 1 },
    ]);
  });

  it('the residual score is derived per axis', () => {
    const d = processReport(risks, { filters: [] }).find((r) => r.id === 'd');
    expect(d.residual_score).toBe(4);
  });
});

describe('templates say what they do', () => {
  it('no template or column reports an owner no form records', () => {
    expect(REPORT_COLUMNS.map((c) => c.key)).not.toContain('owner_id');
    REPORT_TEMPLATES.forEach((t) => {
      expect(t.config.columns).not.toContain('owner_id');
      expect(t.config.grouping).not.toBe('owner_id');
    });
  });

  it('every template column is a column the builder offers', () => {
    const keys = new Set(REPORT_COLUMNS.map((c) => c.key));
    REPORT_TEMPLATES.forEach((t) => t.config.columns.forEach((c) => expect(keys.has(c)).toBe(true)));
  });

  it('no template claims a date window it does not apply', () => {
    REPORT_TEMPLATES.forEach((t) => {
      expect(`${t.name} ${t.desc}`).not.toMatch(/recent/i);
    });
  });

  it('a template that promises grouping is grouped', () => {
    REPORT_TEMPLATES.filter((t) => /grouped/i.test(t.desc))
      .forEach((t) => expect(t.config.grouping).toBeTruthy());
  });
});
