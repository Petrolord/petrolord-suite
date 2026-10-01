// BHT correction of the measured temperatures (AppUpgrade BF-U2-006,
// BF-U1-028). A log-run bottom-hole temperature reads cool: mud circulation
// chilled the borehole wall, so comparing it raw with the model's formation
// temperature pulls the fitted heat flow down. The corrections are the
// engine's (engines/basin/BhtCorrection.js, validated on a published Horner
// example); this file groups the points the way each method needs:
//  - Horner: the runs at one depth (within 1 m), each with its time since
//    circulation stopped, and the circulation time; one corrected point per
//    depth. A depth with one run cannot be extrapolated and stays raw, said.
//  - AAPG (Kehle) or Harrison: one BHT at its depth.
//  - A point marked DST (or static) is a formation temperature already and
//    is never corrected.
// The raw value stays on every point; the calibration, the fit and the
// report use the corrected one and say which method made it.

import { hornerCorrection, aapgCorrection, harrisonCorrection } from './BhtCorrection';

export const BHT_METHODS = Object.freeze([
  { key: 'none', label: 'None (temperatures as measured)' },
  { key: 'horner', label: 'Horner (runs and circulation time)' },
  { key: 'aapg', label: 'AAPG (Kehle) by depth' },
  { key: 'harrison', label: 'Harrison (1983) by depth' },
]);

const isStatic = (p) => /^(dst|static|equilibrium)$/i.test(String(p.kind || ''));

/** Words for the method actually used (report and screen). */
export function bhtMethodText(bht) {
  const m = bht?.method || 'none';
  if (m === 'horner') return `Horner, circulation ${Number.isFinite(Number(bht.circulationH)) && Number(bht.circulationH) > 0 ? `${bht.circulationH} h` : 'time not given'}`;
  if (m === 'aapg') return 'AAPG (Kehle et al. 1970; Gregory et al. 1980) by depth';
  if (m === 'harrison') return 'Harrison et al. (1983) by depth';
  return 'none (temperatures compared as measured)';
}

/**
 * @param {{temp?: Array<{depth:number, value:number, shutInH?:number, kind?:string}>, bht?: {method:string, circulationH?:number}}} calibration
 * @returns {{ points: Array<{depth, value, raw, method, note, runs?}>, notes: string[] }} SI (m, C)
 */
export function correctedTemperatures(calibration) {
  const pts = (calibration?.temp || []).filter((p) => Number.isFinite(Number(p.depth)) && Number.isFinite(Number(p.value)));
  const method = calibration?.bht?.method || 'none';
  const notes = [];
  if (method === 'none') return { points: pts.map((p) => ({ ...p, raw: p.value, method: 'none', note: '' })), notes };
  const out = [];
  if (method === 'horner') {
    const tc = Number(calibration.bht?.circulationH);
    const groups = [];
    for (const p of pts) {
      if (isStatic(p)) { out.push({ ...p, raw: p.value, method: 'none', note: `${p.kind} temperature, not corrected` }); continue; }
      const g = groups.find((x) => Math.abs(x.depth - Number(p.depth)) <= 1);
      if (g) g.items.push(p); else groups.push({ depth: Number(p.depth), items: [p] });
    }
    for (const g of groups) {
      const runs = g.items.filter((p) => Number(p.shutInH) > 0).map((p) => ({ shutInH: Number(p.shutInH), temp: Number(p.value) }));
      const r = hornerCorrection(runs, tc);
      const raw = Math.max(...g.items.map((p) => Number(p.value)));
      if (!r.ok) {
        g.items.forEach((p) => out.push({ ...p, raw: p.value, method: 'none', note: r.reason }));
        notes.push(`At ${g.depth.toFixed(0)} m: ${r.reason} The points there are compared as measured.`);
        continue;
      }
      out.push({ id: g.items[0].id, depth: g.depth, value: r.temp, raw, method: 'horner', runs, note: r.warnings.join(' ') });
      if (r.warnings.length) notes.push(`At ${g.depth.toFixed(0)} m: ${r.warnings.join(' ')}`);
    }
  } else {
    const f = method === 'aapg' ? aapgCorrection : harrisonCorrection;
    for (const p of pts) {
      if (isStatic(p)) { out.push({ ...p, raw: p.value, method: 'none', note: `${p.kind} temperature, not corrected` }); continue; }
      const r = f(Number(p.value), Number(p.depth));
      out.push({ ...p, raw: p.value, value: r.ok ? r.temp : p.value, method: r.ok ? method : 'none', note: r.ok ? r.warnings.join(' ') : r.reason });
      if (r.ok && r.warnings.length) notes.push(`At ${Number(p.depth).toFixed(0)} m: ${r.warnings.join(' ')}`);
    }
  }
  out.sort((a, b) => a.depth - b.depth);
  return { points: out, notes: [...new Set(notes)] };
}

/** The calibration with the temperatures the comparison uses. */
export const withCorrectedTemps = (calibration) => ({ ...(calibration || {}), temp: correctedTemperatures(calibration).points });
