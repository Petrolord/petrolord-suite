// QI Studio usability matrix (QI programme Q1 / A4, 2026-10-06; SOW sections
// 3 and 4): for every well and every target interval, whether the data a
// quantitative interpretation needs is there, read from the shared well
// registry (curves, zones, checkshots, survey, datum). Each item is good,
// limited or missing, with the reason in words, and the cell takes the worst
// of the items that matter for rock physics and ties. Coverage is judged on
// each curve's recorded depth extent against the zone; the samples themselves
// are checked in Well Data Manager and Rock Physics Studio. Pure.

import { CURVE_ALIASES as SHARED } from '@/components/wells/curveMap';
import { makeWellFrame } from '@/lib/wellDatum';

// curve families a QI study reads (the Rock Physics Studio lists for the
// shear and petrophysical outputs; the shared list for the rest)
export const FAMILIES = Object.freeze({
  sonic: { label: 'Sonic (Vp)', aliases: SHARED.DT },
  shear: { label: 'Shear sonic (Vs)', aliases: ['DTS', 'DTSM', 'DTSH', 'DTS1', 'DTS2', 'DTSD', 'DT4S', 'DTSHEAR', 'DTSW', 'DT_S', 'DTSXX', 'DTSYY'] },
  density: { label: 'Density', aliases: SHARED.RHOB },
  porosity: { label: 'Porosity', aliases: ['PHIE', 'PHI_E', 'PHIEFF', 'EPOR', 'PHIE_X', 'PHIT', 'PHI', 'POR', 'PHI_T', 'PHITOT', 'TPOR', 'PHIT_X'] },
  vsh: { label: 'Shale volume', aliases: ['VSH', 'VCL', 'VCLAY', 'VSHALE', 'VSH_GR', 'VCL_GR'] },
  sw: { label: 'Water saturation', aliases: ['SW', 'SWE', 'SWT', 'SW_AR', 'SWA'] },
  gr: { label: 'Gamma ray', aliases: SHARED.GR },
});

/** A curve's family key from its mnemonic: ':n' and the edit suffixes (_SPL, _ED, _DC, _DS) are ignored. */
export function familyOf(mnemonic) {
  const b = String(mnemonic || '').toUpperCase().split(':')[0].replace(/_(SPL|ED|DC|DS|DIG)$/, '');
  for (const [k, f] of Object.entries(FAMILIES)) if (f.aliases.includes(b)) return k;
  return null;
}

const editKind = (mnemonic) => {
  const m = String(mnemonic || '').toUpperCase().split(':')[0].match(/_(SPL|ED|DC|DS|DIG)$/);
  return m ? { SPL: 'spliced', ED: 'edited', DC: 'drift-corrected', DS: 'depth-shifted', DIG: 'digitized' }[m[1]] : null;
};

/** Fraction of [top, base] that a curve's recorded extent covers. */
function coverage(log, top, base) {
  const lo = Math.max(Number(log.start_md_m), top);
  const hi = Math.min(Number(log.stop_md_m), base);
  return base > top ? Math.max(0, hi - lo) / (base - top) : 0;
}

const GRADE = { good: 0, limited: 1, missing: 2 };
const worst = (items) => items.reduce((w, it) => (GRADE[it.grade] > GRADE[w] ? it.grade : w), 'good');

/**
 * The best curve of a family over a zone: the one covering most of it;
 * a digitized curve only when nothing else exists (it is utility grade).
 */
function bestCurve(logs, family, top, base) {
  let best = null;
  for (const l of logs) {
    if (familyOf(l.mnemonic) !== family) continue;
    const c = coverage(l, top, base);
    const digitized = editKind(l.mnemonic) === 'digitized' || !!l.provenance?.digitized;
    const score = c - (digitized ? 1 : 0);
    if (!best || score > best.score) best = { log: l, coverage: c, digitized, score };
  }
  return best;
}

function curveItem(family, best, { required, note }) {
  const label = FAMILIES[family].label;
  if (!best || best.coverage <= 0) {
    return { key: family, label, grade: required ? 'missing' : 'limited', text: `No ${label.toLowerCase()} over the zone.${note ? ` ${note}` : ''}` };
  }
  const pct = Math.round(best.coverage * 100);
  const kind = editKind(best.log.mnemonic);
  const what = `${best.log.mnemonic}${kind ? ` (${kind})` : ''}`;
  if (best.digitized) return { key: family, label, grade: 'limited', text: `${what} covers ${pct} percent; digitized, utility grade.` };
  if (best.coverage < 0.95) return { key: family, label, grade: 'limited', text: `${what} covers ${pct} percent of the zone.` };
  return { key: family, label, grade: 'good', text: `${what} covers the zone.` };
}

/**
 * One well against one target.
 * @param {{well: Object, logs: Object[], zones: Object[]}} w registry rows
 * @param {string} target zone name
 * @returns {{grade: 'good'|'limited'|'missing', items: Array<{key, label, grade, text}>, zone: ?Object}}
 */
export function wellTargetUsability(w, target) {
  const zone = (w.zones || []).find((z) => z.name === target) || null;
  if (!zone) {
    return { grade: 'missing', zone: null, items: [{ key: 'zone', label: 'Zone', grade: 'missing', text: `No zone named ${target} on this well (add it in Petrophysics Studio or from tops).` }] };
  }
  const top = Number(zone.top_md_m);
  const base = Number(zone.base_md_m);
  const logs = w.logs || [];
  const items = [
    curveItem('sonic', bestCurve(logs, 'sonic', top, base), { required: true }),
    curveItem('density', bestCurve(logs, 'density', top, base), { required: true }),
    curveItem('shear', bestCurve(logs, 'shear', top, base), { required: false, note: 'Vs will be estimated (Greenberg-Castagna or the local shear trend), so shear-dependent results are indicative.' }),
    curveItem('porosity', bestCurve(logs, 'porosity', top, base), { required: false, note: 'Fluid substitution will use a constant porosity.' }),
    curveItem('vsh', bestCurve(logs, 'vsh', top, base), { required: false, note: 'No shale volume: lithology colouring and the Vs split are unavailable.' }),
    curveItem('sw', bestCurve(logs, 'sw', top, base), { required: false, note: 'No saturation: fluid states must be typed.' }),
  ];
  const cs = Array.isArray(w.well?.checkshots) ? w.well.checkshots.length : 0;
  items.push(cs >= 2
    ? { key: 'checkshots', label: 'Checkshots', grade: 'good', text: `${cs} checkshot levels.` }
    : { key: 'checkshots', label: 'Checkshots', grade: 'limited', text: cs ? 'One checkshot level: the tie rests on the sonic alone.' : 'No checkshots: the tie rests on the sonic alone (no drift check).' });
  let datumOk = false;
  try { datumOk = !!makeWellFrame(w.well).datum?.tvdssOk; } catch { datumOk = false; }
  items.push(datumOk
    ? { key: 'datum', label: 'Depth reference', grade: 'good', text: 'Elevation set: TVDSS is known.' }
    : { key: 'datum', label: 'Depth reference', grade: 'missing', text: 'The well elevation is not set, so TVDSS (and the tie to seismic) is unknown.' });
  const dev = Array.isArray(w.well?.deviation) ? w.well.deviation.length : 0;
  items.push(dev >= 2
    ? { key: 'survey', label: 'Deviation survey', grade: 'good', text: `${dev} survey stations.` }
    : { key: 'survey', label: 'Deviation survey', grade: 'limited', text: 'No survey: the well is taken as vertical.' });
  return { grade: worst(items), items, zone };
}

/**
 * The matrix and the depletion flags.
 * @param {Array<{well, logs, zones}>} wells
 * @param {string[]} targets
 * @param {{seismicAcquired?: ?string, firstProduction?: Object<string, string>}} dates ISO dates; firstProduction by well id
 */
export function usabilityMatrix(wells, targets, { seismicAcquired = null, firstProduction = {} } = {}) {
  const rows = wells.map((w) => {
    const prod = firstProduction[w.well.id] || null;
    const depleted = !!(seismicAcquired && prod && new Date(seismicAcquired) > new Date(prod));
    return {
      wellId: w.well.id,
      wellName: w.well.name,
      depletion: depleted
        ? `Seismic was acquired on ${seismicAcquired}, after production started on ${prod}: amplitudes near this well may show depletion (pressure and saturation changes) the logs do not.`
        : null,
      cells: targets.map((t) => ({ target: t, ...wellTargetUsability(w, t) })),
    };
  });
  const count = { good: 0, limited: 0, missing: 0 };
  for (const r of rows) for (const c of r.cells) count[c.grade] += 1;
  return { rows, targets, count };
}

/**
 * Issues the matrix implies, for the issue register (the user keeps, edits
 * or dismisses them). One issue per well and missing or limited item kind,
 * not per cell, so a well with no shear log raises one issue.
 */
export function suggestedIssues(matrix) {
  const out = [];
  const seen = new Set();
  const SEVERITY = { missing: 'high', limited: 'medium' };
  const REMEDY = {
    zone: 'Define the zone in Petrophysics Studio, or from the tops in Well Data Manager.',
    sonic: 'Request the sonic, or estimate Vp (pseudo-sonic) in Rock Physics Studio and treat results as indicative.',
    density: 'Request the density log; rock physics cannot run without it.',
    shear: 'Request a dipole shear log, or calibrate a local shear trend on a well that has one (Rock Physics Studio, Elastic logs).',
    porosity: 'Compute porosity in Petrophysics Studio.',
    vsh: 'Compute shale volume in Petrophysics Studio.',
    sw: 'Compute water saturation in Petrophysics Studio.',
    checkshots: 'Request checkshots or a VSP; drift-correct the sonic in Well Data Manager when they arrive.',
    datum: 'Set the well elevation in Well Data Manager (Header).',
    survey: 'Request the deviation survey, or confirm the well is vertical.',
  };
  for (const r of matrix.rows) {
    if (r.depletion) out.push({ key: `${r.wellId}:depletion`, wellName: r.wellName, area: 'Depletion', severity: 'medium', title: `${r.wellName}: seismic after first production`, detail: r.depletion, remedy: 'Model the depleted state in Rock Physics Studio before reading amplitudes near this well.' });
    for (const c of r.cells) {
      for (const it of c.items) {
        if (it.grade === 'good') continue;
        const k = `${r.wellId}:${it.key}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ key: k, wellName: r.wellName, area: it.label, severity: SEVERITY[it.grade], title: `${r.wellName}: ${it.label.toLowerCase()} ${it.grade === 'missing' ? 'missing' : 'limited'}`, detail: it.text, remedy: REMEDY[it.key] || '' });
      }
    }
  }
  return out;
}
