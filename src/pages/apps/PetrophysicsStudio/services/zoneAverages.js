// Zone summaries a reservoir engineer can carry into volumetrics
// (AppUpgrade PETRO-U1, practitioner lens PL1/PL9, 2026-09-28).
//
// The engine's zoneSummary (vendored, oracle-gated) stays the source of
// gross, net pay, NTG, the net-weighted porosity and Vsh averages and the
// k geometric mean. This module adds what a cutoff-and-summation report
// carries in Techlog or IP and what the Studio lacked:
//
//  - Sw averaged by PORE VOLUME, so that net x phi_avg x (1 - sw_avg) is
//    the zone's hydrocarbon pore thickness exactly (the textbook
//    volumetric convention: Sw_avg = sum(phi Sw h) / sum(phi h)). The
//    engine's net-thickness-weighted Sw overstates Sw wherever the
//    tight, wetter samples are thick, and the volumes built on it come
//    out low. The thickness-weighted value is kept as sw_avg_h.
//  - Total-porosity Sw models (Waxman-Smits, dual water) return total
//    Swt on PHIT, while the Studio's zone porosity is PHIE. Mixing the
//    two understates hydrocarbons by PHIE/PHIT. For those models the
//    hydrocarbon pore thickness is sum(h PHIT (1 - Swt)) and sw_avg is
//    the effective-system saturation that conserves it
//    (1 - HCPV / sum(h PHIE)).
//  - Net reservoir (porosity and Vsh cutoffs only) beside net pay.
//  - True vertical thickness (TVT) through the well's deviation survey:
//    net pay measured along a 30 degree hole is 15 percent longer than
//    the layer is thick, and volumetrics need the vertical figure.
//
// Invariant (tested to 1e-12): net_m * phi_avg * (1 - sw_avg) = hcpv_m.

import { netPay, sampleThickness } from '../engine/netpay';
import { zoneSummary, zonePropertiesSnapshot, zoneHydrocarbon, isTotalSwModel as engineIsTotal, TOTAL_SW_MODELS as ENGINE_TOTAL, DEFAULT_PARAMS } from '../engine/pipeline';
import { clampDisplay } from '../engine/porosity';
import { makeDepthFrame } from '../../WellDataManager/engine/checkshots';

/** Sw models defined on total porosity (they return Swt on PHIT): the engine's list (PETRO-U2-012). */
export const TOTAL_SW_MODELS = ENGINE_TOTAL;

export const isTotalSwModel = engineIsTotal;

/** One sentence for reports and tooltips: how the zone numbers average. */
export const AVERAGING_NOTE = 'Porosity and Vsh are net-pay-thickness weighted; Sw is pore-volume weighted '
  + '(sum of phi Sw h over sum of phi h), so net x phi x (1 - Sw) is the hydrocarbon pore thickness; '
  + 'k is the thickness-weighted geometric mean. With Waxman-Smits or dual water, Sw is the effective-system '
  + 'saturation that keeps the total-porosity hydrocarbon volume.';

/**
 * Vertical (TVD) thickness of each sample's midpoint interval, through the
 * well's minimum-curvature path. Null when the well has no deviation
 * survey (vertical: TVT equals MD thickness).
 * @param {ArrayLike<number>} depth MD, metres, ascending
 * @param {{deviation?: Array, kb_m?: number, td_md_m?: number}|null} well
 * @returns {?Float64Array}
 */
export function verticalSampleThickness(depth, well) {
  const n = depth.length;
  if (!well || n < 2) return null;
  let frame;
  try {
    frame = makeDepthFrame({ deviation: well.deviation, kbM: well.kb_m ?? 0, tdMdM: well.td_md_m });
  } catch {
    return null;
  }
  if (frame.isVertical) return null;
  const tvdAt = (md) => {
    try { return frame.mdToPosition(Math.max(0, md)).tvd; } catch { return NaN; }
  };
  // boundaries: midpoints, the two ends extended by half a step (sampleThickness)
  const bounds = new Float64Array(n + 1);
  bounds[0] = depth[0] - (depth[1] - depth[0]) / 2;
  for (let i = 1; i < n; i++) bounds[i] = (depth[i - 1] + depth[i]) / 2;
  bounds[n] = depth[n - 1] + (depth[n - 1] - depth[n - 2]) / 2;
  const tvd = Float64Array.from(bounds, tvdAt);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = tvd[i + 1] - tvd[i];
  return out;
}

/**
 * The zone summary the Studio shows, exports and publishes.
 * @param {{DEPT: ArrayLike<number>}} curves
 * @param {Object<string, Float64Array>} outputs pipeline outputs
 * @param {Object} params the zone's MERGED parameter set (base + overrides)
 * @param {{top_md_m: number, base_md_m: number}} zone
 * @param {{vth?: ?Float64Array}} [opts] vertical sample thickness from
 *   verticalSampleThickness (null or absent: vertical well)
 * @returns {?Object} null when there is no PHIE, VSH or SW to summarise
 */
export function zoneReport(curves, outputs, params, zone, { vth = null } = {}) {
  const s = zoneSummary(curves, outputs, params, zone);
  if (!s) return null;
  const p = { ...DEFAULT_PARAMS, ...params };
  const depth = curves.DEPT;
  const n = depth.length;
  const total = isTotalSwModel(p.swMethod) && !!outputs.PHIT;
  const phiE = outputs.PHIE;
  const phiHc = total ? outputs.PHIT : phiE;
  const sw = Float64Array.from(outputs.SW, (v) => clampDisplay(v));
  const window = { top: zone.top_md_m, base: zone.base_md_m };
  const { flags } = netPay(
    { depth, phi: phiE, vsh: outputs.VSH, sw },
    { cutPhi: p.cutPhi, cutVsh: p.cutVsh, cutSw: p.cutSw, ...window },
  );
  const th = sampleThickness(depth);
  const vt = vth && vth.length === n ? vth : th;

  // PETRO-U2-012: HCPV and the pore-volume Sw come from the engine
  // (zoneHydrocarbon), the same function the probabilistic run uses
  const hcE = zoneHydrocarbon(curves, outputs, params, zone);
  let hcV = 0;
  let netRes = 0;
  let netResV = 0;
  let grossV = 0;
  let netV = 0;
  for (let i = 0; i < n; i++) {
    const d = depth[i];
    if (d < window.top || d > window.base) continue;
    grossV += vt[i];
    const res = Number.isFinite(phiE[i]) && Number.isFinite(outputs.VSH[i])
      && phiE[i] >= p.cutPhi && outputs.VSH[i] <= p.cutVsh;
    if (res) { netRes += th[i]; netResV += vt[i]; }
    if (!flags[i]) continue;
    netV += vt[i];
    const hcI = phiHc[i] * (1 - sw[i]);
    if (Number.isFinite(hcI)) hcV += vt[i] * hcI;
  }

  return {
    ...s,
    // pore-volume weighted (hydrocarbon-conserving); the engine's
    // thickness-weighted value kept for traceability
    sw_avg: hcE.sw_avg,
    sw_avg_h: s.sw_avg,
    sw_avg_weighting: 'pore-volume',
    sw_system: total ? 'total' : 'effective',
    hcpv_m: hcE.hcpv_m,
    net_res_m: netRes,
    gross_tvt_m: grossV,
    net_tvt_m: netV,
    net_res_tvt_m: netResV,
    hcpv_tvt_m: hcV,
    tvt_source: vth && vth.length === n ? 'deviation survey' : 'vertical well',
  };
}

/** Zone rows -> {zoneId: report} with each zone's own merged parameters. */
export function zoneReports({ curves, outputs, params, zones, zoneParams = {}, well = null }) {
  const out = {};
  if (!curves || !outputs) return out;
  const vth = verticalSampleThickness(curves.DEPT, well);
  for (const z of zones || []) {
    const merged = { ...params, ...(zoneParams[z.id] || {}) };
    out[z.id] = zoneReport(curves, outputs, merged, z, { vth });
  }
  return out;
}

/**
 * The properties a zone publish writes (PETRO-U1-003): the zone's OWN
 * merged parameters drive both the numbers and the recorded cutoffs, so
 * the registry row matches the zone card. Carries the PT8 top provenance
 * forward, because publishZone replaces the properties object.
 */
export function zonePublishProperties({ curves, outputs, params, zoneParams = {}, zone, well = null, meta }) {
  const merged = { ...params, ...(zoneParams[zone.id] || {}) };
  const summary = zoneReport(curves, outputs, merged, zone, { vth: verticalSampleThickness(curves.DEPT, well) });
  if (!summary) return null;
  const props = zonePropertiesSnapshot(summary, merged, meta);
  if (zone.properties?.from_tops) props.from_tops = zone.properties.from_tops;
  return props;
}

/**
 * What the zone card may say about the registry row (PETRO-U1-014, PL4):
 * 'none' when nothing was published (a zone cut from tops carries only
 * from_tops), 'current' when the published numbers are the card's,
 * 'stale' when parameters or zones moved since.
 * @returns {{state: 'none'|'current'|'stale', at: ?string}}
 */
export function publishedState(zone, summary) {
  const p = zone?.properties || {};
  const published = Number.isFinite(p.net_m) || Number.isFinite(p.phi_avg) || !!p.published_at;
  if (!published) return { state: 'none', at: null };
  const at = p.published_at ? String(p.published_at).slice(0, 10) : null;
  if (!summary) return { state: 'stale', at };
  const same = (a, b) => (a == null && b == null) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)));
  const keys = ['gross_m', 'net_m', 'phi_avg', 'sw_avg', 'vsh_avg'];
  return { state: keys.every((k) => same(p[k], summary[k])) ? 'current' : 'stale', at };
}
