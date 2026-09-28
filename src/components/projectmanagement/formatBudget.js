/**
 * The budget card figure, in millions of dollars.
 *
 * A project created without a budget has no baseline_budget (null, or a
 * NaN from parseFloat('') on older rows). Dividing that by a million
 * printed "$NaNM" or "$0.0M" on the card, which reads as a figure. It
 * now reads "Not set".
 */
export const hasBudget = (value) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

export const formatBudgetMillions = (value, digits = 1) =>
  hasBudget(value) ? `$${(Number(value) / 1000000).toFixed(digits)}M` : 'Not set';

/** The wizard input is in millions; a blank field stores no budget. */
export const budgetFromMillionsInput = (input) => {
  const n = parseFloat(input);
  return Number.isFinite(n) ? n * 1000000 : null;
};
