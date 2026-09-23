// Escalation in the EPE Run Console.
//
// The console has two modes. Simple mode says, on screen, that the inflation
// rate is the escalation for oil, gas, condensate and opex and that capex is
// nominal (no escalation). Per-stream mode lets the user set each escalator.
// The run payload must send what the screen says: in simple mode that is
// inflation for the four streams and 0 for capex, whatever the per-stream
// fields happen to hold (they used to go out at their 3 percent defaults
// while the screen showed a different inflation rate).

export const STREAM_ESCALATORS = [
  'oil_price_escalator_pct', 'gas_price_escalator_pct',
  'condensate_price_escalator_pct', 'opex_escalator_pct',
];
export const ESCALATOR_KEYS = [...STREAM_ESCALATORS, 'capex_escalator_pct'];

/** The escalators simple mode describes, for an inflation rate in percent. */
export function simpleEscalators(inflationPct) {
  const i = Number(inflationPct);
  const rate = Number.isFinite(i) ? i : 0;
  return {
    oil_price_escalator_pct: rate,
    gas_price_escalator_pct: rate,
    condensate_price_escalator_pct: rate,
    opex_escalator_pct: rate,
    capex_escalator_pct: 0,
  };
}

/**
 * The escalators a run should carry.
 * @param {object} config the console form
 * @param {boolean} perStream true when "Customize per stream" is open
 */
export function payloadEscalators(config, perStream) {
  if (perStream) {
    return Object.fromEntries(ESCALATOR_KEYS.map((k) => [k, config[k]]));
  }
  return simpleEscalators(config.inflation_rate_pct);
}

/**
 * Whether a set of values is what simple mode would send, so a saved
 * configuration can open in the mode it was made in. Keys absent from
 * `values` are taken from `fallback` (a partial assumption set).
 */
export function followsInflation(values, fallback = {}) {
  const pick = (k) => (values[k] !== undefined && values[k] !== null ? values[k] : fallback[k]);
  const simple = simpleEscalators(pick('inflation_rate_pct'));
  return ESCALATOR_KEYS.every((k) => Number(pick(k)) === simple[k]);
}
