// What the Fiscal Regime Designer prints for the two engine contracts that
// changed in EC2 (engines #186).
//
// IRR (EC2-5). The regime sandbox now follows the screening engine's IRR
// contract: a rate is reported only when it is a verified root inside -99 to
// 1000 percent, and otherwise `irr` is null with `irrStatus` saying why. Over
// a 25 year tail most regimes change sign more than once, so null is the
// ordinary case, and the summary table prints n/a with the reason instead of
// crashing on `irr.toFixed`.
//
// Tier tables (EC2-8). A royalty or profit split table with a repeated
// threshold is refused by the engine; the regime editor shows that refusal
// beside the table the user is editing.
import { IRR_BAND_LOWER_PCT, IRR_BAND_UPPER_PCT, IRR_STATUSES } from '@/utils/irrContract';
import { orderedTierTable } from '@/utils/fiscalDesignerCalculations';

const pct = (v) => `${v.toFixed(1)}%`;

const joinAnd = (items) => (items.length <= 1
  ? items.join('')
  : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * The IRR cell of one summary row.
 * @returns {{value: string, reason: string|null}}
 */
export const irrText = (row) => {
  if (Number.isFinite(row?.irr)) return { value: pct(row.irr), reason: null };
  const status = row?.irrStatus;
  let reason;
  if (status === IRR_STATUSES.NO_SIGN_CHANGE) {
    reason = 'no IRR: the contractor cash flow never changes sign';
  } else if (status === IRR_STATUSES.NO_ROOT) {
    reason = `no IRR: no rate from ${IRR_BAND_LOWER_PCT} to ${IRR_BAND_UPPER_PCT} percent brings NPV to zero`;
  } else if (status === IRR_STATUSES.ABOVE_CLAMP) {
    reason = Number(row.npv) < 0
      ? `no IRR: the only rate that zeroes NPV is above ${IRR_BAND_UPPER_PCT} percent, and the contractor loses value at the discount rate`
      : `IRR above ${IRR_BAND_UPPER_PCT} percent, beyond the band searched`;
  } else if (status === IRR_STATUSES.MULTIPLE_ROOTS) {
    const roots = Array.isArray(row.irrRoots) ? row.irrRoots.filter(Number.isFinite).map(pct) : [];
    if (row.irrRootAboveBand) roots.push(`a rate above ${IRR_BAND_UPPER_PCT} percent`);
    reason = roots.length >= 2
      ? `no single IRR: NPV is zero at ${joinAnd(roots)}`
      : 'no single IRR: NPV is zero at more than one rate';
  } else {
    reason = 'no IRR reported';
  }
  return { value: 'n/a', reason };
};

/**
 * The engine's refusal of one regime's tier table, or null when the table is
 * accepted (or the section is flat and has no tiers).
 * @param {object} regime
 * @param {'royalty'|'profitSplit'} section
 */
export const tierTableRefusal = (regime, section) => {
  const isRoyalty = section === 'royalty';
  const terms = isRoyalty ? regime?.royalty : regime?.profitSplit;
  if (!terms || terms.type === 'flat' || !Array.isArray(terms.tiers)) return null;
  try {
    orderedTierTable(regime, isRoyalty ? 'royalty' : 'profit split', terms.tiers);
    return null;
  } catch (err) {
    if (err instanceof RangeError) return err.message;
    throw err;
  }
};
