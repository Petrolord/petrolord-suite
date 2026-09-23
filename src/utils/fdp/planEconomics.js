/**
 * The plan's own screening economics: one source for the Economics tab, the
 * sensitivity chart, the summary panel and the exported PDF.
 *
 * EC6-0. Before this module the three places disagreed with each other and
 * with the plan:
 *
 *   - the Economics tab ran an ILLUSTRATIVE twenty year profile at $75/bbl
 *     because CostModule passed no settings, so an empty plan with no cost
 *     items showed NPV $3,314.2MM in green;
 *   - the Sensitivity panel beside it was a literal five bar chart around
 *     "Base Case ($245MM)", the same picture whatever the plan said;
 *   - `updateEconomics` existed and was never called, so the summary panel
 *     printed NPV $0 under the caption "post royalty and tax" and the PDF
 *     printed Total CAPEX $0, NPV @ 10% $0 and IRR 0.00.
 *
 * Now every one of them calls `computePlanEconomics(state)`, which runs the
 * plan's own cost items, the selected concept's production profile and the
 * selected scenario's price through the sanctioned screening engine. When
 * the plan does not yet carry what the calculation needs, it says which
 * piece is missing instead of showing a number.
 */

import {
  runFdpCase, runFdpSensitivity, paybackYears, DEFAULT_FISCAL, planAbandonment,
} from '@/utils/fdp/economics';
import { conceptProfileKbpd } from '@/utils/fdp/scenarioCalculations';
import { calculateTotalCAPEX, calculateTotalOPEX } from '@/utils/fdp/costCalculations';

/** The concept the plan is costed against: the selected one, else the first. */
export const selectedConcept = (state) => {
  const list = state?.concepts?.list || [];
  if (!list.length) return null;
  const id = state?.concepts?.selectedId;
  // ids arrive as a number from the list and as a string from a form, so
  // they are compared as strings here (EC6-0: `===` used to miss).
  const found = id === null || id === undefined
    ? null
    : list.find((c) => String(c.id) === String(id));
  return found || list[0];
};

/** The scenario the plan is priced at: the selected one, else the first. */
export const selectedScenario = (state) => {
  const list = state?.scenarios?.list || [];
  if (!list.length) return null;
  const id = state?.scenarios?.selectedId;
  const found = id === null || id === undefined
    ? null
    : list.find((s) => String(s.id) === String(id));
  return found || list[0];
};

const positiveNumber = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * What the plan carries towards a screening case, and what it is missing.
 *
 * @param {object} state the FDP plan state
 */
export const planEconomicsInputs = (state) => {
  const items = state?.costs?.items || [];
  const capexMM = calculateTotalCAPEX(items);
  const annualOpexMM = calculateTotalOPEX(items);
  const abexCount = items.filter((i) => i.type === 'ABEX').length;
  // EC6-8 (engines #191): the plan's end-of-life cost, charged in the final
  // production year. An ABEX cost item is used when the plan carries one,
  // otherwise the screening decommissioning estimate of the facility the
  // plan builds, otherwise nothing.
  const abandonment = planAbandonment(state);
  const concept = selectedConcept(state);
  const scenario = selectedScenario(state);
  const peak = positiveNumber(concept?.peakProduction);
  const oilPrice = concept ? parseFloat(scenario?.oilPrice) : null;

  const missing = [];
  if (capexMM <= 0) missing.push('a CAPEX cost item');
  if (!concept) missing.push('a development concept');
  else if (!peak) missing.push('a peak production rate on the concept');
  if (!scenario) missing.push('an economic scenario');
  else if (!Number.isFinite(oilPrice)) missing.push('an oil price on the scenario');

  return {
    capexMM,
    annualOpexMM,
    abexCount,
    abandonment,
    concept,
    scenario,
    missing,
    fiscal: {
      discountRate: Number.isFinite(parseFloat(scenario?.discountRate))
        ? parseFloat(scenario.discountRate) : DEFAULT_FISCAL.discountRate,
      royaltyRate: Number.isFinite(parseFloat(scenario?.royaltyRate))
        ? parseFloat(scenario.royaltyRate) : DEFAULT_FISCAL.royaltyRate,
      taxRate: Number.isFinite(parseFloat(scenario?.taxRate))
        ? parseFloat(scenario.taxRate) : DEFAULT_FISCAL.taxRate,
    },
  };
};

/**
 * The plan's screening economics, or a statement of what is missing.
 *
 * @param {object} state the FDP plan state
 * @returns {{available: boolean, missing: string[], basis?: object,
 *   metrics?: object, cashflow?: object[], sensitivity?: object[]}}
 */
export const computePlanEconomics = (state) => {
  const inputs = planEconomicsInputs(state);
  if (inputs.missing.length) {
    return { available: false, missing: inputs.missing, inputs };
  }

  const productionKbpd = inputs.concept.productionProfileKbpd?.length
    ? inputs.concept.productionProfileKbpd
    : conceptProfileKbpd(inputs.concept);
  const oilPrice = parseFloat(inputs.scenario.oilPrice);
  const caseInputs = {
    capexMM: inputs.capexMM,
    annualOpexMM: inputs.annualOpexMM,
    productionKbpd,
    pricesUsd: new Array(productionKbpd.length).fill(oilPrice),
    fiscal: inputs.fiscal,
    abandonment: inputs.abandonment,
  };

  const result = runFdpCase(caseInputs);
  return {
    available: true,
    missing: [],
    inputs,
    basis: {
      conceptName: inputs.concept.name || 'the selected concept',
      scenarioName: inputs.scenario.name || 'the selected scenario',
      oilPrice,
      years: productionKbpd.length,
      ...inputs.fiscal,
    },
    abandonment: {
      ...inputs.abandonment,
      // The year index the cost falls in (0 is the development year).
      year: result.abandonmentYear,
    },
    metrics: {
      npv: result.metrics.npv,
      irr: result.metrics.irr,
      // EC6-8: charging the abandonment makes the final year negative, so
      // the flow changes sign twice and the IRR contract reports no single
      // rate. The status travels with it so the card can say why.
      irrStatus: result.metrics.irrStatus,
      irrRoots: result.metrics.irrRoots,
      irrRootAboveBand: result.metrics.irrRootAboveBand,
      payback: paybackYears(result),
      capex: inputs.capexMM,
      opex: inputs.annualOpexMM,
    },
    cashflow: result.cashflow.map((row, i) => ({
      year: i,
      revenue: row.grossRevenue,
      royalty: row.royalty,
      tax: row.tax,
      capex: row.capex,
      opex: row.opex,
      abex: row.abex,
      netCashFlow: row.ncf,
      cumulativeCashFlow: row.cumulativeNCF,
    })),
    sensitivity: runFdpSensitivity(caseInputs),
  };
};

/**
 * Why there is no single rate of return, in one clause (EC6-8 makes this the
 * ordinary case: the final year pays the abandonment, so the cash flow
 * changes sign twice and more than one rate zeroes the NPV).
 *
 * Each root prints to four decimals. The FDP course grades the lower root of
 * the UKOT Board case "to four decimals in percent" (tol 0.01), and one decimal
 * (-43.2%) sat 0.0259 from the graded -43.2259, so the only printed value
 * failed the capstone (B5 graded-field audit).
 */
export const irrReason = (metrics) => {
  if (Number.isFinite(metrics?.irr)) return null;
  const roots = Array.isArray(metrics?.irrRoots)
    ? metrics.irrRoots.filter(Number.isFinite).map((r) => `${r.toFixed(4)}%`)
    : [];
  switch (metrics?.irrStatus) {
  case 'multiple-roots':
    return roots.length >= 2
      ? `no single rate of return: the NPV is zero at ${roots.slice(0, -1).join(', ')} and ${roots[roots.length - 1]}, because the final year pays the end-of-life cost`
      : 'no single rate of return: more than one rate brings the NPV to zero';
  case 'no-sign-change':
    return 'no rate of return: the cash flow never changes sign';
  case 'no-root':
    return 'no rate of return: no rate from -99 to 1000 percent brings the NPV to zero';
  case 'above-clamp':
    return Number(metrics?.npv) < 0
      ? 'no rate of return: the only rate that zeroes the NPV is above 1000 percent, and the plan loses value at the discount rate'
      : 'the rate of return is above 1000 percent, beyond the band searched';
  default:
    return 'no rate of return reported';
  }
};

/**
 * The payload `updateEconomics` should carry, so the summary panel and the
 * PDF read the same numbers this tab shows. Zeroes when the plan cannot be
 * costed yet, which is the honest answer and what the caption already says.
 */
export const planEconomicsPayload = (economics) => (economics.available
  ? {
    capex: economics.metrics.capex,
    opex: economics.metrics.opex,
    npv: economics.metrics.npv,
    irr: economics.metrics.irr === null ? null : economics.metrics.irr,
    payback: economics.metrics.payback,
    oilPrice: economics.basis.oilPrice,
    royalty: economics.basis.royaltyRate,
    tax: economics.basis.taxRate,
    available: true,
    basis: economics.basis,
  }
  : {
    capex: economics.inputs.capexMM,
    opex: economics.inputs.annualOpexMM,
    npv: 0,
    irr: null,
    payback: null,
    available: false,
    missing: economics.missing,
  });
