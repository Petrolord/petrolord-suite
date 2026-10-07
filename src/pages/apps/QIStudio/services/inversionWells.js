// The wells of an inversion (QI programme Q8a, 2026-10-06): for each study
// well, ln(AI) on the volume's time axis and the trace the well sits on.
// The impedance is the sonic and density of the well registry, converted to
// time through the well's own time-depth (the tie-derived checkshots when a
// tie was committed, otherwise the imported checkshots), exactly as
// Seismolord's synthetics do (engines seismolord/synthetics.js). The trace
// is the well's position at the middle of the impedance log. Every well
// comes back ready or with the reason it cannot be used; the curves used are
// named, so an edited or digitized curve is never used silently.

import { normalizeInputCurve } from '@/components/wells/curveUnits';
import { refElevOrNull } from '@/lib/wellDatum';
import { effectiveCheckshots } from '@/pages/apps/Seismolord/services/wellsService';
import {
  slownessToVelocity, computeImpedance, mdSeriesToTwt, resampleToDt,
} from '../../../../../packages/engines/engines/seismolord/synthetics';
import { makeTvdssToTwt, normalizeStations } from '../../../../../packages/engines/engines/seismolord/wellSection';
import { computeWellPath, positionAtMd } from '../../../../../packages/engines/engines/seismolord/wellPath';
import { surveyAffine, worldToIlxl } from '../../../../../packages/engines/engines/seismolord/surveyGeometry';
import { familyOf, editKind } from './usability';

const span = (l) => Math.max(0, Number(l.stop_md_m) - Number(l.start_md_m)) || 0;

/** The longest curve of a family; a digitized one only when nothing else exists. */
export function pickCurve(logs, family) {
  let best = null;
  for (const l of logs || []) {
    if (familyOf(l.mnemonic) !== family) continue;
    const digitized = editKind(l.mnemonic) === 'digitized' || !!l.provenance?.digitized;
    const score = span(l) - (digitized ? 1e9 : 0);
    if (!best || score > best.score) best = { log: l, score, edit: digitized ? 'digitized' : editKind(l.mnemonic) };
  }
  return best;
}

/** Volume facts the wells need, from its manifest. */
export function volumeFrame(manifest) {
  const g = manifest?.geometry || {};
  const dtMs = Number(g.dt_us) / 1000;
  const nIl = g.il?.count; const nXl = g.xl?.count; const ns = g.ns;
  if (!(dtMs > 0) || !(nIl > 0) || !(nXl > 0) || !(ns > 0)) throw new Error('The volume manifest has no usable geometry.');
  return { dtMs, nIl, nXl, ns, affine: surveyAffine(g) };
}

/**
 * One well, ready for the job or with its reason.
 * @param {{well, logs}} loaded the registry well and its curve metadata
 * @param {{dtMs, nIl, nXl, ns, affine}} frame volumeFrame output
 * @param {(log) => Promise<ArrayLike<number>>} downloadCurve
 * @returns {Promise<{name, wellId, ok: boolean, reason?: string, il?, xl?, ln_ai?: number[],
 *   curves?: string, timeSource?: string, samples?: number}>}
 */
export async function prepareWell(loaded, frame, downloadCurve, { extras = [], topsMd = [] } = {}) {
  const { well, logs } = loaded;
  const base = { name: well.name, wellId: well.id };
  const no = (reason) => ({ ...base, ok: false, reason });
  const sonic = pickCurve(logs, 'sonic');
  if (!sonic) return no('No sonic curve.');
  const density = pickCurve(logs, 'density');
  if (!density) return no('No density curve.');
  if (sonic.log.step_m == null || density.log.step_m == null) return no('The sonic or density curve has an irregular depth grid; resample it in Well Data Manager first.');
  const cs = effectiveCheckshots(well);
  if (!Array.isArray(cs.rows) || cs.rows.length < 2) return no('No time-depth relationship: commit a well tie in Seismolord or import checkshots.');
  const kb = refElevOrNull(well);
  if (kb == null) return no('The well has no depth reference elevation (Well Data Manager, Header).');
  if (!frame.affine) return no('The volume has no survey geometry to place the well.');
  const stations = normalizeStations({ deviation: well.deviation, tdMdM: well.td_md_m ?? Number(sonic.log.stop_md_m) });
  if (!stations) return no('The well has no deviation survey or total depth.');
  let path;
  try { path = computeWellPath(stations, { surfaceX: well.surface_x, surfaceY: well.surface_y, kb }); } catch (e) { return no(`The well path could not be built: ${e.message}`); }
  const conv = makeTvdssToTwt({ checkshots: cs.rows, dtUs: frame.dtMs * 1000, maxTwtMs: (frame.ns - 1) * frame.dtMs });
  if (!conv) return no('No time-depth relationship for this well.');

  const [dtRaw, rhoRaw] = await Promise.all([downloadCurve(sonic.log), downloadCurve(density.log)]);
  const dt = normalizeInputCurve('DT', sonic.log, dtRaw).data;
  const rho = normalizeInputCurve('RHOB', density.log, rhoRaw).data;
  // the density on the sonic's depth grid (both regular): nearest sample
  const md = Float64Array.from({ length: dt.length }, (_, i) => Number(sonic.log.start_md_m) + i * Number(sonic.log.step_m));
  const rhoOnDt = Float64Array.from(md, (z) => {
    const j = Math.round((z - Number(density.log.start_md_m)) / Number(density.log.step_m));
    return j >= 0 && j < rho.length && Number.isFinite(rho[j]) && rho[j] > 0 ? rho[j] : NaN;
  });
  const imp = computeImpedance(slownessToVelocity(dt), rhoOnDt);
  const twt = mdSeriesToTwt(md, (m) => positionAtMd(stations, path, m)?.tvdss ?? null, (z) => conv.toTwtMs(z));
  let ai;
  try { ai = resampleToDt(twt, imp, frame.dtMs, frame.ns); } catch (e) { return no(e.message); }
  const lnAi = Array.from(ai, (v) => (Number.isFinite(v) && v > 0 ? Math.log(v) : NaN));
  const live = lnAi.filter(Number.isFinite).length;
  if (live < 32) return no('The impedance log covers fewer than 32 samples of the volume.');

  // the trace at the middle of the impedance log
  let lo = Infinity; let hi = -Infinity;
  for (let i = 0; i < md.length; i++) if (Number.isFinite(imp[i]) && Number.isFinite(twt[i])) { lo = Math.min(lo, md[i]); hi = Math.max(hi, md[i]); }
  const pos = positionAtMd(stations, path, (lo + hi) / 2);
  const ij = pos ? worldToIlxl(frame.affine, pos.x, pos.y) : null;
  const il = ij ? Math.round(ij.i) : NaN; const xl = ij ? Math.round(ij.j) : NaN;
  if (!(il >= 0 && il < frame.nIl && xl >= 0 && xl < frame.nXl)) return no('The well is outside the survey.');

  const named = (c) => `${c.log.mnemonic}${c.edit ? ` (${c.edit})` : ''}`;
  const toTwt = (m) => conv.toTwtMs(positionAtMd(stations, path, m)?.tvdss ?? NaN);
  const extra = {};
  if (extras.includes('elastic')) {
    // shear impedance and density in time, through the same tie (prestack inversion, Q8b)
    const shear = pickCurve(logs, 'shear');
    if (!shear) extra.elastic = { reason: 'No shear sonic (DTS): prestack inversion needs Vs at the wells.' };
    else if (shear.log.step_m == null) extra.elastic = { reason: `${shear.log.mnemonic} has an irregular depth grid.` };
    else {
      const dtsRaw = await downloadCurve(shear.log);
      const dts = normalizeInputCurve('DT', shear.log, dtsRaw).data;
      const dtsOnDt = Float64Array.from(md, (z) => {
        const j = Math.round((z - Number(shear.log.start_md_m)) / Number(shear.log.step_m));
        return j >= 0 && j < dts.length && Number.isFinite(dts[j]) && dts[j] > 0 ? dts[j] : NaN;
      });
      const si = computeImpedance(slownessToVelocity(dtsOnDt), rhoOnDt);
      const lnOf = (arr) => Array.from(arr, (v) => (Number.isFinite(v) && v > 0 ? Math.log(v) : NaN));
      try {
        extra.elastic = {
          curves: `${named(shear)} for Vs`,
          ln_si: lnOf(resampleToDt(twt, si, frame.dtMs, frame.ns)),
          ln_rho: lnOf(resampleToDt(twt, rhoOnDt, frame.dtMs, frame.ns)),
        };
      } catch (e) { extra.elastic = { reason: e.message }; }
    }
  }
  for (const kind of extras.filter((k) => k !== 'elastic')) {
    const c = kind === 'facies' ? pickFaciesCurve(logs) : pickCurve(logs, 'porosity');
    if (!c) { extra[kind] = { reason: kind === 'facies' ? 'No facies curve (draw facies in Rock Physics Studio, Multi-well, and write them back).' : 'No porosity curve.' }; continue; }
    if (c.log.step_m == null) { extra[kind] = { reason: `${c.log.mnemonic} has an irregular depth grid.` }; continue; }
    const raw = await downloadCurve(c.log);
    const data = kind === 'facies' ? raw : porosityFraction(raw);
    const mdC = Array.from({ length: data.length }, (_, i) => Number(c.log.start_md_m) + i * Number(c.log.step_m));
    const twtC = mdC.map(toTwt);
    const values = kind === 'facies'
      ? nearestToDt(twtC, Array.from(data), frame.dtMs, frame.ns)
      : Array.from(resampleToDt(Float64Array.from(twtC, (t) => (Number.isFinite(t) ? t : NaN)), Float64Array.from(data, (v) => (Number.isFinite(v) ? v : NaN)), frame.dtMs, frame.ns));
    extra[kind] = {
      curve: named(c), values: values.map((v) => (Number.isFinite(v) ? v : NaN)),
      ...(kind === 'facies' ? { names: c.names } : {}),
    };
  }
  const topsTwt = topsMd.map((m) => { const t = Number.isFinite(m) ? toTwt(m) : NaN; return Number.isFinite(t) ? t : null; });
  return {
    ...base, ok: true, il, xl, ln_ai: lnAi, samples: live, topsTwt,
    curves: `${named(sonic)} and ${named(density)}`,
    timeSource: cs.derived ? 'the committed well tie' : 'imported checkshots',
    ...extra,
  };
}

/** Porosity as a fraction: vendor nulls (-999 and below) dropped; a curve in percent (median over 1.5) divided by 100. */
export function porosityFraction(raw) {
  const v = Array.from(raw, (x) => (Number.isFinite(x) && x > -900 ? x : NaN));
  const live = v.filter(Number.isFinite).sort((a, b) => a - b);
  const median = live.length ? live[Math.floor(live.length / 2)] : 0;
  return median > 1.5 ? v.map((x) => x / 100) : v;
}

/** The facies-code curve of a well (Rock Physics Studio's RP_FACIES or another facies curve), with its code names. */
export function pickFaciesCurve(logs) {
  const cands = (logs || []).filter((l) => l.provenance?.kind === 'facies' || /^(RP_)?FACIES\b/i.test(String(l.mnemonic || '')));
  if (!cands.length) return null;
  const l = cands[cands.length - 1];
  const names = {};
  for (const c of l.provenance?.codes || []) if (Number(c.code) > 0) names[String(c.code)] = String(c.name);
  return { log: l, edit: null, names };
}

/** Codes onto the time grid by the nearest sample in time (codes are never interpolated). */
export function nearestToDt(twtMs, codes, dtMs, ns) {
  const pts = [];
  for (let i = 0; i < twtMs.length; i++) if (Number.isFinite(twtMs[i])) pts.push([twtMs[i], codes[i]]);
  pts.sort((a, b) => a[0] - b[0]);
  const out = new Array(ns).fill(NaN);
  if (pts.length < 2) return out;
  let j = 0;
  for (let k = 0; k < ns; k++) {
    const t = k * dtMs;
    if (t < pts[0][0] || t > pts[pts.length - 1][0]) continue;
    while (j < pts.length - 1 && pts[j + 1][0] <= t) j++;
    const pick = j < pts.length - 1 && pts[j + 1][0] - t < t - pts[j][0] ? pts[j + 1] : pts[j];
    out[k] = Number.isFinite(pick[1]) ? pick[1] : NaN;
  }
  return out;
}
