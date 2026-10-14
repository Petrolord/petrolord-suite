// Publish state (2026-10-14, data governance): is the prognosis open in the
// studio the one the registry holds? Well Design Studio's mud window, Casing &
// Tubing, Hydraulics and Geomechanics read the published PP/FP/OBG, never the
// open project, so a recalibration that is not published leaves every reader
// on the old prognosis without anyone saying so. This compares the open
// prognosis with the curves published on the selected well, sample by
// sample on the well's MD, and says by how much (ppg EMW) and where they
// differ. Pure, no I/O.

import { emwReferenceDepthM, pressureToDisplay } from './units';

const ENGINE = 'pore-pressure-studio';
const SAME_PPG = 0.005;

/**
 * The prognosis curves this studio published on a well (newest of each).
 * @param {object[]} logs geo_wells_logs rows of the well
 * @returns {null|{PP?: object, FP?: object, OBG?: object, publishedAt: ?string, pipelineVersion: ?string, projectId: ?string}}
 */
export function publishedSet(logs) {
  const out = {};
  for (const l of logs || []) {
    const m = String(l.mnemonic || '').toUpperCase();
    if (!['PP', 'FP', 'OBG'].includes(m) || l.provenance?.engine !== ENGINE) continue;
    if (!out[m] || String(l.created_at || '') > String(out[m].created_at || '')) out[m] = l;
  }
  if (!out.PP && !out.FP) return null;
  const rows = [out.PP, out.FP, out.OBG].filter(Boolean);
  const publishedAt = rows.map((r) => r.created_at).filter(Boolean).sort().pop() || null;
  return {
    ...out,
    publishedAt,
    pipelineVersion: (out.PP || out.FP).provenance?.pipeline_version || null,
    projectId: (out.PP || out.FP).provenance?.project_id || null,
  };
}

/** Value of a published curve (MPa on a regular MD grid) at an MD, nearest node; NaN off the grid. */
function valueAtMd(log, values, mdM) {
  const start = Number(log.start_md_m);
  const step = Number(log.step_m);
  if (!values || !Number.isFinite(start)) return NaN;
  const k = step > 0 ? Math.round((mdM - start) / step) : 0;
  if (k < 0 || k >= values.length) return NaN;
  if (step > 0 && Math.abs(start + k * step - mdM) > 0.51 * step) return NaN;
  const v = values[k];
  return v == null || !Number.isFinite(v) ? NaN : v;
}

/**
 * Compare the open prognosis with the published curves.
 * @param {{zBmlM: number[], mdM?: number[]}} input
 * @param {{porePressurePa: number[], fracPressurePa: number[]}} result
 * @param {object} params workstation params (mudline, water depth)
 * @param {{set: object, values: {PP?: ArrayLike<number>, FP?: ArrayLike<number>}}} published
 * @returns {{same: boolean, maxPpg: number, curve: ?string, atBmlM: ?number, compared: number}}
 */
export function compareWithPublished(input, result, params, published) {
  const mudline = params?.mudlineMdM ?? 0;
  const mdM = input.mdM || input.zBmlM.map((z) => z + mudline);
  let maxPpg = 0; let curve = null; let atBmlM = null; let compared = 0;
  for (const [m, key] of [['PP', 'porePressurePa'], ['FP', 'fracPressurePa']]) {
    const log = published.set?.[m];
    const vals = published.values?.[m];
    if (!log || !vals) continue;
    for (let i = 0; i < mdM.length; i++) {
      const now = result[key][i];
      const was = valueAtMd(log, vals, mdM[i]);
      if (!Number.isFinite(now) || !Number.isFinite(was)) continue;
      compared += 1;
      const z = input.zBmlM[i];
      const d = Math.abs(pressureToDisplay(now - was * 1e6, 'ppg', emwReferenceDepthM(z, params)));
      if (d > maxPpg) { maxPpg = d; curve = m; atBmlM = z; }
    }
  }
  return { same: compared > 0 && maxPpg < SAME_PPG, maxPpg, curve, atBmlM, compared };
}

const when = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null);

/**
 * The words for the ribbon chip and the notes line.
 * @param {{set: ?object, cmp: ?object, projectId: ?string, wellName: string, fmtZ: (bmlM:number)=>string}} a
 * @returns {{tone: 'ok'|'warn'|'info', chip: string, text: string}}
 */
export function publishStateText({ set, cmp, projectId = null, wellName = 'this well', fmtZ = (z) => `${Math.round(z)} m bml` }) {
  if (!set) {
    return { tone: 'info', chip: 'Not published', text: `No prognosis from this studio is published on ${wellName}: Well Design Studio and the other readers have nothing from it yet.` };
  }
  const at = when(set.publishedAt);
  const other = projectId && set.projectId && set.projectId !== projectId
    ? ' It was published from another project, so Publish here adds this project\'s curves beside it.' : '';
  if (!cmp || !cmp.compared) {
    return { tone: 'info', chip: 'Published', text: `A prognosis is published on ${wellName}${at ? ` (${at})` : ''}.${other}` };
  }
  if (cmp.same) {
    return { tone: 'ok', chip: 'Published, matches', text: `Published on ${wellName}${at ? ` ${at}` : ''}: the readers see the prognosis open here.${other}` };
  }
  return {
    tone: 'warn',
    chip: `Unpublished changes (${cmp.maxPpg.toFixed(2)} ppg)`,
    text: `Unpublished changes: the open prognosis differs from the one published on ${wellName}${at ? ` ${at}` : ''} by up to ${cmp.maxPpg.toFixed(2)} ppg (${cmp.curve} at ${fmtZ(cmp.atBmlM)}). Well Design Studio and the other readers still use the published one until you publish.${other}`,
  };
}
