// Petrophysics net pay and HCPV maps as property trends (Earth Modeling
// upgrade U2-008, 2026-10-01; PETRO-U2-008). Petrophysics publishes per
// zone the net pay and the hydrocarbon pore thickness HCPV = sum h phi
// (1 - Sw); Mapping grids them into attribute maps (geo_surfaces kind
// attribute, z_unit m, provenance.source {type: 'zone', zoneName, key}).
// A zone can take them as its NTG and Sw:
//   NTG = net pay / zone thickness             (both vertical, metres)
//   Sw  = 1 - HCPV / (thickness x NTG x phi)   (after NTG and porosity)
// so the zone's HCPV per node equals the map's: the model honours the
// petrophysicist's hydrocarbon column and the wells' porosity. Values are
// held to 0..1 and counted. Pure, no I/O.

import { isNull } from '@/lib/gridding/gridmath';
import { NULL_VALUE } from '@/lib/gridding/numeric';

/** True for a map whose key reads as net pay or HCPV (picker hint). */
export const mapKind = (row) => {
  const key = String(row?.provenance?.source?.key || '').toLowerCase();
  if (key.startsWith('hcpv')) return 'hcpv';
  if (key.startsWith('net')) return 'net';
  return null;
};

/** Measured-depth keys (net_m, hcpv_m) overstate a deviated well's vertical thickness. */
export const isMdKey = (row) => /^(net|hcpv|net_res|gross)_m$/.test(String(row?.provenance?.source?.key || ''));

/** NTG from a net pay map; @returns {{z: Float64Array, clamped: number}} */
export function ntgFromNetMap(net, thickness) {
  const z = new Float64Array(thickness.length).fill(NULL_VALUE);
  let clamped = 0;
  for (let j = 0; j < z.length; j++) {
    const t = thickness[j]; const n = net[j];
    if (isNull(t) || isNull(n) || !Number.isFinite(n)) continue;
    if (!(t > 0)) { z[j] = 0; continue; }
    let v = n / t;
    if (v < 0) { v = 0; clamped += 1; } else if (v > 1) { v = 1; clamped += 1; }
    z[j] = v;
  }
  return { z, clamped };
}

/** Sw from an HCPV map, the zone's NTG and porosity; @returns {{z: Float64Array, clamped: number}} */
export function swFromHcpvMap(hcpv, thickness, ntg, phi) {
  const z = new Float64Array(thickness.length).fill(NULL_VALUE);
  let clamped = 0;
  for (let j = 0; j < z.length; j++) {
    const t = thickness[j]; const h = hcpv[j]; const n = ntg?.[j]; const p = phi?.[j];
    if ([t, h, n, p].some((v) => v === undefined || isNull(v) || !Number.isFinite(v))) continue;
    const pv = t * n * p;
    if (!(pv > 0)) { z[j] = 1; continue; }
    let v = 1 - h / pv;
    if (v < 0) { v = 0; clamped += 1; } else if (v > 1) { v = 1; clamped += 1; }
    z[j] = v;
  }
  return { z, clamped };
}
