// Well Test Analysis Studio -> Material Balance Studio intake mapper (WT5
// contract, extracted pure in MB3 so the handoff survives UI restructures
// and is jest-guarded).
//
// Input: location.state.wellTestData = {
//   pAvg_psia, tempF, fluid ('oil'|'gas'), wellName, k_md, skin, source
// }
// Output: { prefill, note } - prefill feeds the new-case dialog; note is the
// user-facing message naming what was applied (k and skin are context only:
// material balance has no direct field for them). Returns null when the
// payload carries nothing usable.
export function mapWellTestIntake(wt) {
  if (!wt || typeof wt !== 'object') return null;
  const prefill = {};
  if (Number.isFinite(wt.pAvg_psia) && wt.pAvg_psia > 0) {
    prefill.initial_pressure_psia = wt.pAvg_psia.toFixed(1);
  }
  if (Number.isFinite(wt.tempF) && wt.tempF > 0) {
    prefill.reservoir_temperature_f = wt.tempF.toFixed(0);
  }
  if (wt.fluid === 'gas') prefill.fluid_system = 'gas';
  if (wt.wellName) prefill.name = `${wt.wellName} material balance`;
  if (!Object.keys(prefill).length) return null;

  const extras = [
    Number.isFinite(wt.k_md) ? `k = ${Number(wt.k_md).toPrecision(3)} md` : null,
    Number.isFinite(wt.skin) ? `skin = ${Number(wt.skin).toFixed(1)}` : null,
  ].filter(Boolean).join(', ');
  const note =
    `Average pressure from ${wt.source || 'the Well Test Analysis Studio'} ` +
    `prefilled as initial pressure${extras ? ` (${extras} for reference)` : ''}.`;

  return { prefill, note };
}
