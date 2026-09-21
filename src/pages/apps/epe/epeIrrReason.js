// Engine v3.10 (EC1-2, engines #193). The EPE cash flow engine adopted the
// module IRR contract, so a rate is reported only when it is a verified root
// strictly inside -99 to 1000 percent. Otherwise `kpis.irr` is null and
// `kpis.irr_status` says which case it is, with `kpis.irr_roots` listing every
// in-band root and `kpis.irr_root_above_band` flagging one beyond the band.
//
// The Results viewer already printed N/A for a null IRR. A bare N/A does not
// say whether the project never changes sign, returns more than the band
// searches, or has several rates that zero its NPV, which are three different
// answers, so the reason is printed with it.

const pct = (v) => `${Number(v).toFixed(2)}%`;

const joinAnd = (items) => (items.length <= 1
  ? items.join('')
  : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * Why this run has no rate of return, or null when it has one (and for a run
 * saved before v3.10, which carries no status).
 *
 * @param {object} kpis the run's KPIs
 * @returns {string|null}
 */
export const epeIrrReason = (kpis) => {
  if (!kpis || kpis.irr != null) return null;
  const roots = Array.isArray(kpis.irr_roots)
    ? kpis.irr_roots.filter((r) => Number.isFinite(Number(r))).map(pct)
    : [];
  switch (kpis.irr_status) {
  case 'no-sign-change':
    return 'No IRR: the net cash flow never changes sign, so no rate brings it to zero.';
  case 'no-root':
    return 'No IRR: no rate from -99 to 1000 percent brings the net present value to zero.';
  case 'above-clamp':
    return 'No IRR reported: the return is above 1000 percent, beyond the band the engine searches.';
  case 'multiple-roots': {
    const listed = kpis.irr_root_above_band
      ? [...roots, 'a rate above 1000 percent']
      : roots;
    return listed.length >= 2
      ? `No single IRR: the net present value is zero at ${joinAnd(listed)}, so no one rate is the return.`
      : 'No single IRR: more than one rate brings the net present value to zero.';
  }
  default:
    return null;
  }
};

export default epeIrrReason;
