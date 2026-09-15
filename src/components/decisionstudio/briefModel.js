// Decision brief data model (D5, docs/scope/Economics-ROADMAP.md).
// Pure functions that turn saved artifacts from the Decision Studio chain
// (EPE Monte Carlo runs, decision trees, portfolio optimizations) into the
// one-page brief's sections, each carrying a PROVENANCE line: which saved
// item, which id, when it was created, and for stochastic results the seed
// and iteration count. The PDF renderer (briefPdf.js) draws this model and
// adds nothing to it, so these numbers are testable without jsPDF.

import { rollback } from '@/lib/decisionTree';
import { firstMoveLabel } from '@/components/decisiontree/firstMoveLabel';
import { optimizePortfolio } from '@/utils/portfolioOptimizer';

const shortId = (id) => (id ? String(id).slice(0, 8) : 'n/a');
const stamp = (iso) => (iso ? new Date(iso).toLocaleString() : 'n/a');

export const fmtMMUsd = (usd) => {
  if (usd == null || !Number.isFinite(Number(usd))) return 'N/A';
  const m = Number(usd) / 1e6;
  if (Math.abs(m) >= 1000) return `$${(m / 1000).toFixed(2)}B`;
  return `$${m.toFixed(1)}M`;
};

// EC4-7: a saved run with no P(NPV > 0) printed "NaN%". A missing or
// non-finite fraction reads N/A.
export const fmtPct = (fraction, digits = 1) => {
  if (fraction == null || !Number.isFinite(Number(fraction))) return 'N/A';
  return `${(Number(fraction) * 100).toFixed(digits)}%`;
};

export const fmtMM = (mm) => {
  if (mm == null || !Number.isFinite(Number(mm))) return 'N/A';
  if (Math.abs(mm) >= 1000) return `$${(mm / 1000).toFixed(2)}B`;
  return `$${Number(mm).toFixed(1)}M`;
};

// Economics section from an epe_mc_runs row.
export function economicsSection(mcRun) {
  if (!mcRun?.results?.npv) return null;
  const r = mcRun.results;
  return {
    heading: 'Probabilistic economics',
    rows: [
      ['NPV P90 (low)', fmtMMUsd(r.npv.p90)],
      ['NPV P50', fmtMMUsd(r.npv.p50)],
      ['NPV P10 (high)', fmtMMUsd(r.npv.p10)],
      ['NPV mean', fmtMMUsd(r.npv.mean)],
      ['Chance NPV is positive', fmtPct(r.probNpvPositive)],
      ['Deterministic base NPV', fmtMMUsd(r.base?.npv)],
    ],
    note: r.tornado?.length
      ? `Dominant uncertainty: ${r.tornado[0].parameter.replace(/_/g, ' ')}.`
      : null,
    provenance: `Source: EPE Monte Carlo run ${shortId(mcRun.id)} (${mcRun.configName || 'run config'}), ${stamp(mcRun.created_at)}, seed ${r.seed}, ${r.iterations} iterations through the validated fiscal engine. NPV basis: ${r.base?.pv_basis || 'real'}. Petroleum convention: P90 is the low case.`,
  };
}

// Decision section from a saved_decision_tree_projects row. The EMV is
// recomputed from the stored tree by the canonical engine at build time.
export function decisionSection(treeProject) {
  const tree = treeProject?.inputs_data?.tree;
  if (!tree) return null;
  let annotated;
  try {
    annotated = rollback(tree);
  } catch (err) {
    return {
      heading: 'Decision analysis',
      rows: [['Status', 'Saved tree failed validation']],
      note: err.message,
      provenance: `Source: decision "${treeProject.project_name}" ${shortId(treeProject.id)}, ${stamp(treeProject.updated_at || treeProject.created_at)}.`,
    };
  }
  const best = annotated.type === 'decision' ? annotated.branches[annotated.bestBranchIndex] : null;
  const alternatives = annotated.type === 'decision'
    ? annotated.branches.filter((_, i) => i !== annotated.bestBranchIndex)
    : [];
  const nextBest = alternatives.length ? Math.max(...alternatives.map((b) => b.branchValue)) : null;
  const rows = [
    ['Optimal EMV', fmtMM(annotated.emv)],
    ['Recommended first move', firstMoveLabel(annotated)],
  ];
  if (nextBest != null) {
    rows.push(['Next best alternative', fmtMM(nextBest)]);
    rows.push(['Decision advantage', fmtMM(annotated.emv - nextBest)]);
  }
  return {
    heading: 'Decision analysis',
    rows,
    note: null,
    provenance: `Source: decision "${treeProject.project_name}" ${shortId(treeProject.id)}, ${stamp(treeProject.updated_at || treeProject.created_at)}. EMV rolled back by the canonical decision engine at brief time. Values in $MM.`,
  };
}

// Portfolio section: re-optimizes the chosen portfolio from its saved
// CAPEX limit and the current project inventory at build time.
// EC5-0 (owner decision 2026-09-14): the quantised grid can fund a set whose
// real capex exceeds the limit (engine overLimit / overLimitBy), so the capital
// row says so with the numbers rather than printing "X of X". The loss
// probability is the engine's seeded Monte Carlo, and the provenance carries
// its seed and iteration count.
const fmtMMExact = (mm) => Number(mm).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function portfolioSection(portfolio, projects) {
  if (!portfolio || !projects?.length) return null;
  const result = optimizePortfolio({ projects, capexLimit: portfolio.capex_limit });
  const linked = result.optimalProjects.filter((p) => p.source_type === 'epe_mc').length;
  // A "$6.00B of $6.00B" rounding would hide a 6002 against 6000 overshoot, so
  // an exceeded limit prints exact $MM figures and its own row.
  const capitalRows = result.overLimit
    ? [
      ['Capital deployed', `${fmtMMExact(result.totalCapex)} of ${fmtMMExact(result.capexLimit)} $MM`],
      ['Over the capital limit by', `${fmtMMExact(result.overLimitBy)} $MM`],
    ]
    : [['Capital deployed', `${fmtMM(result.totalCapex)} of ${fmtMM(portfolio.capex_limit)}`]];
  const funded = result.optimalProjects.length
    ? `Funded: ${result.optimalProjects.map((p) => p.name).join(', ')}.`
    : 'No project clears the risked-EMV bar under this limit.';
  const overshoot = result.overLimit
    ? ` Capital limit exceeded: the funded set's capex is ${fmtMMExact(result.totalCapex)} $MM against a limit of ${fmtMMExact(result.capexLimit)} $MM, over by ${fmtMMExact(result.overLimitBy)} $MM on the quantized grid (resolution ${fmtMMExact(result.resolution)} $MM). Check the set against the real limit.`
    : '';
  return {
    heading: 'Capital allocation',
    rows: [
      ['Risked portfolio EMV', fmtMM(result.totalEmv)],
      ['Success-case NPV', fmtMM(result.totalNpvSuccess)],
      ...capitalRows,
      ['Projects funded', `${result.optimalProjects.length} of ${projects.length}`],
      ['Chance the portfolio loses money', `${(result.risk.probLoss * 100).toFixed(1)}%`],
    ],
    overLimit: result.overLimit,
    note: `${funded}${overshoot}`,
    provenance: `Source: portfolio "${portfolio.name}" ${shortId(portfolio.id)}, optimized at brief time over ${projects.length} projects (${linked} valued by linked EPE Monte Carlo runs, the rest entered manually). Capital grid resolution ${fmtMMExact(result.resolution)} $MM. Risk assumes independent projects; loss chance by seeded Monte Carlo, seed ${result.risk.seed}, ${result.risk.iterations} iterations. Values in $MM.`,
  };
}

/**
 * Assemble the full brief model. Sections are included only when their
 * source is provided; every included section carries provenance.
 */
export function buildBriefModel({ title, recommendation, preparedBy, mcRun, treeProject, portfolio, portfolioProjects }) {
  const sections = [
    economicsSection(mcRun),
    decisionSection(treeProject),
    portfolioSection(portfolio, portfolioProjects),
  ].filter(Boolean);
  return {
    title: title?.trim() || 'Investment decision brief',
    recommendation: recommendation?.trim() || '',
    preparedBy: preparedBy || '',
    generatedAt: new Date().toISOString(),
    sections,
    footer: 'Prepared with Petrolord Decision Studio. Every figure above carries its source and assumptions in the provenance line beneath its section.',
  };
}
