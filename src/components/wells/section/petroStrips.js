// Petrophysics and stratigraphy beside the logs (AppUpgrade WC-U2-008): the
// section reads what the sister apps publish to the shared registry and draws
// it as narrow strips at the left of each well column, so the section becomes
// the field overview. Read only; nothing here writes.
//
//  pay   the PAY flag curve Petrophysics Studio publishes (1 = net pay),
//        drawn as runs; a well without a published PAY curve says so.
//  zones geo_wells_zones: each zone as a band, labelled with its published
//        summary (net, PHIE, Sw) or "not published".
//  units the Stratigraphy Studio column (geo_strat_units): a top linked to a
//        unit starts that unit, which runs to the next deeper top of the well.
// Pure.

import { topColor } from '@/components/wells/topColors';

const FT = 0.3048;
export const STRIP_W = 12;
export const STRIP_KEYS = ['pay', 'zones', 'units'];
export const STRIP_TITLE = { pay: 'PAY', zones: 'ZONE', units: 'UNIT' };

/** Runs of PAY >= 0.5 as MD intervals (depth ascending; NaN breaks a run). */
export function payRuns(depth, pay) {
  const out = [];
  if (!depth || !pay || depth.length !== pay.length) return out;
  let start = null; let last = null;
  for (let i = 0; i < depth.length; i++) {
    const on = Number.isFinite(depth[i]) && Number.isFinite(pay[i]) && pay[i] >= 0.5;
    if (on && start === null) start = depth[i];
    if (!on && start !== null) { out.push({ top_md_m: start, base_md_m: last }); start = null; }
    if (on) last = depth[i];
  }
  if (start !== null) out.push({ top_md_m: start, base_md_m: last });
  return out.filter((r) => r.base_md_m > r.top_md_m);
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : null);

/** A zone's label: its published summary in the display unit, or why not. */
export function zoneLabel(zone, unit = 'm') {
  const p = zone?.properties || {};
  const published = Number.isFinite(p.net_m) || Number.isFinite(p.phi_avg) || !!p.published_at;
  if (!published) return `${zone.name}: not published`;
  const u = unit === 'ft' ? 'ft' : 'm';
  const net = Number.isFinite(p.net_m) ? `net ${(p.net_m / (unit === 'ft' ? FT : 1)).toFixed(1)} ${u}` : null;
  const parts = [net, f2(p.phi_avg) && `PHIE ${f2(p.phi_avg)}`, f2(p.sw_avg) && `Sw ${f2(p.sw_avg)}`].filter(Boolean);
  return `${zone.name}: ${parts.join(', ')}`;
}

/** Unit intervals of one well from its tops linked to geo_strat_units rows. */
export function unitIntervals(tops = [], units = []) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const sorted = [...tops].filter((t) => Number.isFinite(t.md_m)).sort((a, b) => a.md_m - b.md_m);
  const out = [];
  sorted.forEach((t, i) => {
    const u = t.unit_id ? byId.get(t.unit_id) : null;
    if (!u) return;
    const next = sorted.slice(i + 1).find((x) => x.md_m > t.md_m);
    if (!next) return;
    out.push({ top_md_m: t.md_m, base_md_m: next.md_m, colour: u.colour || topColor(u.name), label: u.name });
  });
  return out;
}

/**
 * The strips of one well.
 * @param {{depth, curves?, zones?, tops?}} well section well (curves holds a published PAY when there is one)
 * @param {{pay?: boolean, zones?: boolean, units?: boolean}} on
 * @returns {Array<{key, title, intervals: Array<{top_md_m, base_md_m, colour, label?}>, note?: string}>}
 */
export function wellStrips(well, on = {}, { units = [], unit = 'm' } = {}) {
  const out = [];
  if (on.pay) {
    const pay = well.curves?.PAY || null;
    const runs = pay ? payRuns(well.depth, pay) : [];
    out.push({ key: 'pay', title: STRIP_TITLE.pay, intervals: runs.map((r) => ({ ...r, colour: '#15803d' })), note: pay ? null : 'no published PAY' });
  }
  if (on.zones) {
    const zs = (well.zones || []).filter((z) => z.base_md_m > z.top_md_m);
    out.push({ key: 'zones', title: STRIP_TITLE.zones, intervals: zs.map((z) => ({ top_md_m: z.top_md_m, base_md_m: z.base_md_m, colour: topColor(z.name), label: zoneLabel(z, unit) })), note: zs.length ? null : 'no zones' });
  }
  if (on.units) {
    const iv = unitIntervals(well.tops || [], units);
    out.push({ key: 'units', title: STRIP_TITLE.units, intervals: iv, note: iv.length ? null : 'no tops linked to units' });
  }
  return out;
}
