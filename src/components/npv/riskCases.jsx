// The NPV Scenario Builder's Monte Carlo cases (EC3-0, owner decision
// 2026-09-14).
//
// runMonteCarlo returns PLAIN PERCENTILES of NPV: `p10` is the 10th percentile,
// the LOW NPV, and `p90` the 90th, the HIGH NPV. The cards used to print
// `risk.p90` under "P90 (Conservative)" and `risk.p10` under "P10
// (Optimistic)", so the conservative card held the optimistic number.
//
// The Suite convention (src/lib/percentileConventions.js) labels an outcome
// where more is better by probability of exceedance: the low case is P90 and
// reads the 10th percentile. This module is the ONE place that maps the engine
// keys onto the cases, and everything on screen goes through it.
import React from 'react';
import { CASES, OUTCOME_LABELS, EXCEEDANCE_DEFINITION } from '@/lib/percentileConventions';

/** Which engine key holds each exceedance outcome. */
export const RISK_KEY_FOR_OUTCOME = Object.freeze({ p90: 'p10', p50: 'p50', p10: 'p90' });

/** The three cases, low to high, each with its label and value. */
export const riskCases = (risk, keyFor = RISK_KEY_FOR_OUTCOME) => CASES.map((c) => ({
  key: c.key,
  outcome: c.outcome,
  label: `${c.label} ${OUTCOME_LABELS[c.outcome]}`,
  value: risk ? risk[keyFor[c.outcome]] : null,
}));

/** True when the cases read low to high, as the convention requires. */
export const casesAscending = (cases) => cases.every((c, i) => i === 0 || c.value >= cases[i - 1].value);

export const RiskCaseCards = ({ risk, formatValue = (v) => String(v) }) => (
  <div>
    <div className="grid grid-cols-3 gap-4">
      {riskCases(risk).map((c) => (
        <div
          key={c.key}
          data-testid="npv-risk-case"
          data-case={c.key}
          data-value={risk ? c.value : ''}
          title={EXCEEDANCE_DEFINITION}
          className="bg-slate-800/50 p-4 rounded border border-slate-700 text-center"
        >
          <p className="text-xs text-slate-500">{c.label}</p>
          <p className="text-lg font-bold text-white">{risk ? formatValue(c.value) : '-'}</p>
        </div>
      ))}
    </div>
    <p className="text-[11px] text-slate-400 mt-2">{EXCEEDANCE_DEFINITION}</p>
    {risk && risk.seed !== undefined && risk.seed !== null && (
      <p className="text-[11px] text-slate-400" data-testid="npv-risk-seed">
        Run seed {risk.seed}: the same inputs and seed reproduce this result.
      </p>
    )}
  </div>
);
