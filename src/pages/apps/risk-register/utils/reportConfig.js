/**
 * AS13 — the report builder's contract: which columns exist, how a saved
 * row becomes a report again, how rows are filtered and grouped, and the
 * standard templates.
 *
 * Four defects came from this contract living in three components that
 * each guessed at it:
 *
 *   Save & Generate passed the saved DATABASE ROW to the viewer. The row
 *   nests the report under `config`, so the viewer found no columns and
 *   no filters and showed every risk with the default columns.
 *
 *   Editing a saved report opened `report.config`, which never carries
 *   the row id (the config is stored before the insert returns one), so
 *   saving it inserted a copy and left the original unchanged.
 *
 *   The builder said "Select grouping in Step 2" where Step 2 had no
 *   grouping control, and nothing applied `grouping` anyway, so the
 *   "Departmental Breakdown" and "Owner Allocation" templates were not
 *   grouped.
 *
 *   "Owner Allocation" and "All Open Risks" reported `owner_id`, which no
 *   form in the app writes, so the column was always empty.
 */
import {
  calculateResidualScore,
  calculateRiskScore,
  getRiskBand,
} from '@/lib/riskScoring';

/**
 * Columns a report may show. `band` and `residual_score` are derived
 * from the scoring authority for every row, so a report cannot show a
 * band that disagrees with the score beside it. There is no owner column:
 * no form in the app records an owner.
 */
export const REPORT_COLUMNS = Object.freeze([
  { key: 'risk_id', label: 'Risk ID' },
  { key: 'title', label: 'Title' },
  { key: 'category', label: 'Category' },
  { key: 'status', label: 'Status' },
  { key: 'likelihood', label: 'Likelihood' },
  { key: 'impact', label: 'Impact' },
  { key: 'risk_score', label: 'Risk Score' },
  { key: 'band', label: 'Band' },
  { key: 'residual_score', label: 'Residual Score' },
  { key: 'target_score', label: 'Target Score' },
  { key: 'appetite_status', label: 'Appetite' },
  { key: 'next_review_date', label: 'Next Review' },
  { key: 'root_cause', label: 'Root Cause' },
  { key: 'consequences', label: 'Consequences' },
  { key: 'mitigation_summary', label: 'Mitigation' },
  { key: 'created_at', label: 'Date Created' },
  { key: 'updated_at', label: 'Last Updated' },
]);

const LABELS = new Map(REPORT_COLUMNS.map((c) => [c.key, c.label]));

export const columnLabel = (key) => LABELS.get(key)
  || String(key).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** Fields a report can be grouped by. `null` is no grouping. */
export const GROUP_FIELDS = Object.freeze([
  { key: 'category', label: 'Category' },
  { key: 'status', label: 'Status' },
  { key: 'band', label: 'Band' },
]);

export const DEFAULT_CHART_GROUP = 'status';

export const UNSET_GROUP = 'Not set';

/**
 * A saved_reports row as a report the builder and viewer can use: its
 * config, plus the row id and name, which live on the row and not in
 * the stored config.
 */
export const reportConfigFromRow = (row) => {
  if (!row) return null;
  const config = row.config && typeof row.config === 'object' ? row.config : {};
  return {
    ...config,
    id: row.id,
    name: row.name || config.name,
    columns: Array.isArray(config.columns) ? config.columns : [],
    filters: Array.isArray(config.filters) ? config.filters : [],
    grouping: config.grouping || null,
  };
};

/** The config as stored: the id is the row's, not the config's. */
export const storedConfig = (config = {}) => {
  const { id, ...rest } = config;
  return rest;
};

/** Every risk with its derived band and residual score. */
export const withDerivedFields = (risk) => ({
  ...risk,
  band: getRiskBand(calculateRiskScore(risk.likelihood, risk.impact)),
  residual_score: calculateResidualScore(risk),
});

const isBlank = (v) => v === null || v === undefined || v === '';

const matches = (risk, f) => {
  const val = risk[f.field];
  if (isBlank(val)) return false;
  switch (f.operator) {
    case 'equals': return String(val).toLowerCase() === String(f.value).toLowerCase();
    case 'contains': return String(val).toLowerCase().includes(String(f.value).toLowerCase());
    case 'greater_than': return Number(val) > Number(f.value);
    case 'less_than': return Number(val) < Number(f.value);
    default: return true;
  }
};

const groupValue = (row, field) => (isBlank(row[field]) ? UNSET_GROUP : String(row[field]));

/**
 * Filter, sort and group the register for one report. Grouping sorts the
 * rows by group, keeping the score order inside each group, so the
 * viewer can print a heading wherever the group changes.
 */
export const processReport = (risks = [], config) => {
  if (!config) return [];
  let rows = risks.map(withDerivedFields);

  if (Array.isArray(config.filters) && config.filters.length) {
    rows = rows.filter((r) => config.filters.every((f) => matches(r, f)));
  }

  if (config.sortField) {
    rows.sort((a, b) => {
      const aVal = a[config.sortField];
      const bVal = b[config.sortField];
      if (aVal < bVal) return config.sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return config.sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  } else {
    rows.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
  }

  if (config.grouping) {
    const field = config.grouping;
    rows.sort((a, b) => groupValue(a, field).localeCompare(groupValue(b, field)));
  }
  return rows;
};

/** Count per group, for the chart view. Largest group first. */
export const countByGroup = (rows = [], field = DEFAULT_CHART_GROUP) => {
  const counts = new Map();
  rows.forEach((r) => {
    const key = groupValue(r, field);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

/** Rows with a heading row wherever the group changes. */
export const groupedRows = (rows = [], field) => {
  if (!field) return rows.map((row) => ({ row }));
  const out = [];
  let current;
  rows.forEach((row) => {
    const g = groupValue(row, field);
    if (g !== current) {
      out.push({ heading: g, count: rows.filter((r) => groupValue(r, field) === g).length });
      current = g;
    }
    out.push({ row });
  });
  return out;
};

/**
 * The standard templates. Every description says what the filter
 * actually does. "Recently Closed" said "Risks mitigated or closed
 * recently" over a filter of status Closed with no date limit.
 */
export const REPORT_TEMPLATES = Object.freeze([
  { id: 't1', name: 'Executive Summary', icon: 'PieChart', desc: 'Risks in the High and Critical bands (score 10 or more).', config: { name: 'Executive Summary', columns: ['risk_id', 'title', 'category', 'status', 'risk_score'], filters: [{ field: 'risk_score', operator: 'greater_than', value: 9 }] } },
  { id: 't2', name: 'Category Breakdown', icon: 'BarChart2', desc: 'Every risk, grouped by category.', config: { name: 'Category Breakdown', columns: ['category', 'risk_id', 'title', 'risk_score'], filters: [], grouping: 'category' } },
  { id: 't3', name: 'Mitigation Progress', icon: 'FileText', desc: 'Risks with the status Open, with their mitigation summary.', config: { name: 'Mitigation Progress', columns: ['risk_id', 'title', 'mitigation_summary', 'status'], filters: [{ field: 'status', operator: 'equals', value: 'Open' }] } },
  { id: 't4', name: 'HSE Risks', icon: 'ShieldAlert', desc: 'Risks whose category contains HSE.', config: { name: 'HSE Risks', columns: ['risk_id', 'title', 'likelihood', 'impact', 'risk_score'], filters: [{ field: 'category', operator: 'contains', value: 'HSE' }] } },
  { id: 't5', name: 'All Open Risks', icon: 'List', desc: 'Every risk with the status Open.', config: { name: 'All Open Risks', columns: ['risk_id', 'title', 'category', 'risk_score', 'status'], filters: [{ field: 'status', operator: 'equals', value: 'Open' }] } },
  { id: 't6', name: 'Closed Risks', icon: 'CheckCircle', desc: 'Every risk with the status Closed, with when it was last updated.', config: { name: 'Closed Risks', columns: ['risk_id', 'title', 'mitigation_summary', 'updated_at'], filters: [{ field: 'status', operator: 'equals', value: 'Closed' }] } },
  { id: 't7', name: 'Financial Exposure', icon: 'DollarSign', desc: 'Risks whose category contains Financial.', config: { name: 'Financial Risks', columns: ['risk_id', 'title', 'consequences', 'risk_score'], filters: [{ field: 'category', operator: 'contains', value: 'Financial' }] } },
  { id: 't8', name: 'Critical Watchlist', icon: 'AlertOctagon', desc: 'Risks in the Critical band (score 15 or more).', config: { name: 'Critical Watchlist', columns: ['risk_id', 'title', 'category', 'root_cause', 'risk_score'], filters: [{ field: 'risk_score', operator: 'greater_than', value: 14 }] } },
  { id: 't9', name: 'Supply Chain Risks', icon: 'Truck', desc: 'Risks whose category contains Supply.', config: { name: 'Supply Chain Risks', columns: ['risk_id', 'title', 'status', 'mitigation_summary'], filters: [{ field: 'category', operator: 'contains', value: 'Supply' }] } },
  { id: 't10', name: 'Quarterly Audit', icon: 'ClipboardList', desc: 'Every risk, with its scores, status and mitigation.', config: { name: 'Quarterly Audit', columns: ['risk_id', 'title', 'category', 'likelihood', 'impact', 'risk_score', 'residual_score', 'status', 'mitigation_summary'], filters: [] } },
  { id: 't11', name: 'Band Breakdown', icon: 'BarChart2', desc: 'Every risk, grouped by inherent band.', config: { name: 'Band Breakdown', columns: ['band', 'risk_id', 'title', 'risk_score', 'status'], filters: [], grouping: 'band' } },
  { id: 't12', name: 'Drilling Hazards', icon: 'Target', desc: 'Risks whose category contains Drilling.', config: { name: 'Drilling Hazards', columns: ['risk_id', 'title', 'root_cause', 'risk_score'], filters: [{ field: 'category', operator: 'contains', value: 'Drilling' }] } },
]);
