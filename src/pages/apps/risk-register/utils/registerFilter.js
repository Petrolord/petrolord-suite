/**
 * AS13 — what the Risk Register tab shows.
 *
 * The tab had a search box and nothing else that worked: its Filter
 * button had no handler, and both heatmaps said "Click any cell to drill
 * down into the specific risks" and then switched to this tab unfiltered.
 * The filters live here, as one pure function, so the heatmap cell a
 * user clicks and the rows the tab then lists are counted the same way.
 */
import { calculateRiskScore, getRiskBand } from '@/lib/riskScoring';

export const ALL = 'All';

/**
 * A heatmap cell as a filter. `statuses` is the set of statuses the
 * heatmap counted, so the register lists exactly the risks the cell's
 * number was made of.
 */
export const cellFilter = (likelihood, impact, statuses, scope) => ({
  likelihood: Number(likelihood),
  impact: Number(impact),
  statuses: statuses ? [...statuses] : null,
  scope: scope || null,
});

/** "Likelihood 4, impact 3, open and under review risks" */
export const describeCellFilter = (cell) => {
  if (!cell) return '';
  const base = `Likelihood ${cell.likelihood}, impact ${cell.impact}`;
  return cell.scope ? `${base}, ${cell.scope}` : base;
};

export const filterRisks = (risks = [], {
  search = '', status = ALL, band = ALL, cell = null,
} = {}) => {
  const term = String(search || '').trim().toLowerCase();
  return risks.filter((r) => {
    if (status !== ALL && r.status !== status) return false;
    if (band !== ALL && getRiskBand(calculateRiskScore(r.likelihood, r.impact)) !== band) return false;
    if (cell) {
      if (Number(r.likelihood) !== cell.likelihood || Number(r.impact) !== cell.impact) return false;
      if (cell.statuses && !cell.statuses.includes(r.status)) return false;
    }
    if (!term) return true;
    return [r.title, r.category, r.risk_id]
      .some((v) => String(v || '').toLowerCase().includes(term));
  });
};
